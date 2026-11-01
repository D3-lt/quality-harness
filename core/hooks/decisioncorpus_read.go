// ADR-137 T2: a decision corpus read the way plugin/scripts/decision-corpus.mjs's adrCorpus reads it on the edit hook's path,
// and the text its decisionContext prints: discovery from the git listing (recordFilesFromListing and the streamed content
// screen), one read per real path (onceByRealPath), the record, screen and size budgets, task attribution, decisionsGoverning's
// path filter and the five-per-group text. T1's record rules (decisioncorpus.go) are what it composes.
package hooks

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

const (
	dcRecordBudget = 200              // RECORD_BUDGET: records read in one look.
	dcScreenBudget = 64 * 1024 * 1024 // SCREEN_BUDGET: bytes the content screen streams in one look.
	dcRecordLimit  = 512 * 1024       // a record past this many bytes is not read.
	dcLinkLimit    = 32               // linksIn's limit.
	dcShown        = 5                // records named per group before `(+N more)`.
)

var errDcTooBig = errors.New("runs past the record limit")

// dcPlatform is process.platform for the platforms whose rules differ here.
func dcPlatform() string {
	if runtime.GOOS == "windows" {
		return "win32"
	}
	return runtime.GOOS
}

// dcErrorCode is the code Node gives a failed file call, `unreadable` where it gives none.
func dcErrorCode(err error) string {
	var errno syscall.Errno
	if errors.As(err, &errno) {
		switch errno {
		case syscall.ENOENT:
			return "ENOENT"
		case syscall.EACCES:
			return "EACCES"
		case syscall.EPERM:
			return "EPERM"
		case syscall.ELOOP:
			return "ELOOP"
		case syscall.ENOTDIR:
			return "ENOTDIR"
		case syscall.ENAMETOOLONG:
			return "ENAMETOOLONG"
		case syscall.EISDIR:
			return "EISDIR"
		case syscall.EIO:
			return "EIO"
		}
	}
	if errors.Is(err, fs.ErrNotExist) {
		return "ENOENT"
	}
	return "unreadable"
}

// dcReadBounded is readRegularText(file, limit) with a lone CR made a line feed: a regular file's text, refused past limit bytes
// by the bytes read, never by a size asked first.
func dcReadBounded(file string, limit int64) (string, error) {
	st, err := os.Stat(file)
	if err != nil {
		return "", err
	}
	if !st.Mode().IsRegular() {
		return "", fmt.Errorf("%s is not a regular file", file)
	}
	f, err := os.Open(file)
	if err != nil {
		return "", err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return "", err
	}
	if int64(len(b)) > limit {
		return "", errDcTooBig
	}
	return dcNormaliseCR(dcDecodeUTF8(b)), nil
}

// dcCorpusReader is corpusReader: one observation per file and per directory listing in one look.
type dcCorpusReader struct {
	*dcReader
	listings map[string][]os.DirEntry
	failures map[string]error
}

func newDcCorpusReader() *dcCorpusReader {
	return &dcCorpusReader{dcReader: newDcReader(), listings: map[string][]os.DirEntry{}, failures: map[string]error{}}
}

func (r *dcCorpusReader) entries(directory string) ([]os.DirEntry, error) {
	if err, failed := r.failures[directory]; failed {
		return nil, err
	}
	if entries, ok := r.listings[directory]; ok {
		return entries, nil
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		r.failures[directory] = err
		return nil, err
	}
	r.listings[directory] = entries
	return entries, nil
}

// --- The content screen (screenAdmits, lineStream) ----------------------------

// dcWalk is one walk of the screen: the fence open, and whether each discriminator was seen outside every fence.
type dcWalk struct {
	fence         string
	bold, heading bool
}

func (w *dcWalk) step(line string, frontmatter bool) {
	if !frontmatter {
		var fenced bool
		fenced, w.fence = dcFenceStep(line, w.fence)
		if fenced {
			return
		}
	}
	w.bold = w.bold || strings.HasPrefix(line, "**Status:**")
	w.heading = w.heading || dcRecordSection(line)
}

// dcLineStream is lineStream: lines out of text chunks, a CR ending one chunk and an LF starting the next one break.
type dcLineStream struct {
	part      strings.Builder
	pendingCR bool
	take      func(string)
}

func (s *dcLineStream) write(chunk string) {
	start := 0
	if s.pendingCR && strings.HasPrefix(chunk, "\n") {
		start = 1
	}
	s.pendingCR = false
	for i := start; i < len(chunk); i++ {
		c := chunk[i]
		if c != '\r' && c != '\n' {
			continue
		}
		s.part.WriteString(chunk[start:i])
		s.take(s.part.String())
		s.part.Reset()
		lone := c == '\r' && (i+1 == len(chunk) || chunk[i+1] != '\n')
		if c == '\r' && !lone {
			i++
		}
		start = i + 1
		if lone && start == len(chunk) {
			s.pendingCR = true
		}
	}
	s.part.WriteString(chunk[start:])
}

func (s *dcLineStream) end() {
	s.take(s.part.String())
	s.part.Reset()
}

// dcIncompleteTail is where an unfinished UTF-8 character starts at the end of b, len(b) when none does: StringDecoder holds
// those bytes for the next chunk.
func dcIncompleteTail(b []byte) int {
	for k := 1; k <= 3 && k <= len(b); k++ {
		c := b[len(b)-k]
		if c&0xc0 == 0x80 {
			continue
		}
		need := 1
		switch {
		case c >= 0xc0 && c < 0xe0:
			need = 2
		case c >= 0xe0 && c < 0xf0:
			need = 3
		case c >= 0xf0 && c < 0xf8:
			need = 4
		}
		if need > k {
			return len(b) - k
		}
		return len(b)
	}
	return len(b)
}

const (
	dcHeadUnread = iota // no line yet
	dcHeadOpen          // inside the assumed frontmatter
	dcHeadClosed        // the frontmatter closed
	dcHeadNone          // the file has none
)

// dcScreenAdmits is screenAdmits: whether the file holds a line-start `**Status:**` and a record heading outside every fence,
// streamed in 64 KiB reads. budget is spent by the bytes read; answered is false (Node's null) once it runs out.
func dcScreenAdmits(file string, budget *int) (admitted, answered bool, err error) {
	f, err := os.Open(file)
	if err != nil {
		return false, false, err
	}
	defer f.Close()
	block, plain := &dcWalk{}, &dcWalk{}
	head := dcHeadUnread
	lines := &dcLineStream{take: func(line string) {
		switch head {
		case dcHeadUnread:
			head = dcHeadNone
			if dcFrontmatterOpen.MatchString(line) {
				head = dcHeadOpen
			}
			block.step(line, head == dcHeadOpen)
		case dcHeadOpen:
			if dcFrontmatterEnd.MatchString(line) {
				head = dcHeadClosed
			}
			block.step(line, true)
		default:
			block.step(line, false)
		}
		plain.step(line, false)
	}}
	decided := func() *dcWalk {
		switch head {
		case dcHeadClosed:
			return block
		case dcHeadNone:
			return plain
		}
		return nil
	}
	buf := make([]byte, 64*1024)
	var carry []byte
	for {
		n, rerr := io.ReadFull(f, buf)
		if rerr != nil && rerr != io.EOF && rerr != io.ErrUnexpectedEOF {
			return false, false, rerr
		}
		if budget != nil && n > 0 {
			*budget -= n
			if *budget < 0 {
				return false, false, nil
			}
		}
		if n > 0 {
			data := append(carry, buf[:n]...)
			cut := dcIncompleteTail(data)
			carry = append([]byte{}, data[cut:]...)
			lines.write(dcDecodeUTF8(data[:cut]))
		} else {
			lines.write(dcDecodeUTF8(carry))
			lines.end()
		}
		if walk := decided(); walk != nil && walk.bold && walk.heading {
			return true, true, nil
		}
		if n == 0 {
			break
		}
	}
	walk := decided()
	if walk == nil {
		walk = plain
	}
	return walk.bold && walk.heading, true, nil
}

// --- Discovery (recordFilesFromListing) and one read per file (onceByRealPath) ---

type dcDiscovery struct {
	files      []string
	byName     map[string]bool
	failed     []dcUnreadable
	unscreened string
}

func dcAnyRecordDirectory(parts []string) bool {
	for _, part := range parts {
		if dcRecordDirectory(part) {
			return true
		}
	}
	return false
}

// dcRecordFilesFromListing is recordFilesFromListing: every eligible listed path named like a record, under a record directory
// as listed or where it really is, or admitted by the content screen, in listing order.
func dcRecordFilesFromListing(root string, tracked []string, screenBudget int, platform string) dcDiscovery {
	d := dcDiscovery{byName: map[string]bool{}}
	realRoot, rootErr := dcRealpath(root)
	// The running platform, not the parameter: decision-corpus.mjs:1372 splits a placed path with separatorsOf(process.platform)
	// whatever platform recordFilesFromListing was handed, and this mirrors that quirk exactly (ADR-137 T4).
	splitPlaced := func(placed string) []string {
		if dcPlatform() == "win32" {
			return dcSplitSlashes(placed)
		}
		return strings.Split(placed, "/")
	}
	placedDirectory := map[string]bool{}
	placedUnderRecordDirectory := func(directory string) bool {
		if answer, ok := placedDirectory[directory]; ok {
			return answer
		}
		answer := false
		if rootErr == nil {
			if real, err := dcRealpath(dcListedAbsolute(root, directory)); err == nil {
				if placed, ok := dcInside(realRoot, real); ok {
					answer = dcAnyRecordDirectory(splitPlaced(placed))
				}
			}
		}
		placedDirectory[directory] = answer
		return answer
	}
	placedFileUnderRecordDirectory := func(absolute string) bool {
		st, err := os.Lstat(absolute)
		if err != nil || st.Mode()&os.ModeSymlink == 0 || rootErr != nil {
			return false
		}
		real, err := dcRealpath(absolute)
		if err != nil {
			return false
		}
		placed, ok := dcInside(realRoot, real)
		// The running platform, as decision-corpus.mjs:1383's directoriesOf(placed) takes it by default (ADR-137 T4).
		return ok && dcAnyRecordDirectory(dcDirectoriesOf(placed, dcPlatform()))
	}
	budget := screenBudget
	for _, rel := range tracked {
		norm := listedPath(rel, platform)
		if !dcCorpusEligible(norm) {
			continue
		}
		base, dirNorm := norm, ""
		if slash := strings.LastIndex(norm, "/"); slash >= 0 {
			base, dirNorm = norm[slash+1:], norm[:slash]
		}
		parts := []string{root}
		for _, part := range strings.Split(norm, "/") {
			if part != "" && part != "." {
				parts = append(parts, part)
			}
		}
		absolute := filepath.Join(parts...)
		if dcAdrFile(base) || dcCanonicalName(base) || specName(base) {
			d.files = append(d.files, absolute)
			d.byName[absolute] = true
			continue
		}
		if dirNorm != "" && (dcAnyRecordDirectory(strings.Split(dirNorm, "/")) || placedUnderRecordDirectory(dirNorm)) ||
			placedFileUnderRecordDirectory(absolute) {
			d.files = append(d.files, absolute)
			continue
		}
		if d.unscreened != "" {
			continue
		}
		st, err := os.Stat(absolute)
		if err != nil {
			if !errors.Is(err, fs.ErrNotExist) {
				d.failed = append(d.failed, dcUnreadable{file: absolute, reason: dcErrorCode(err)})
			}
			continue
		}
		if !st.Mode().IsRegular() {
			d.failed = append(d.failed, dcUnreadable{file: absolute, reason: "not a regular file, so the content screen could not read it"})
			continue
		}
		admitted, answered, err := dcScreenAdmits(absolute, &budget)
		switch {
		case err != nil:
			if !errors.Is(err, fs.ErrNotExist) {
				d.failed = append(d.failed, dcUnreadable{file: absolute, reason: dcErrorCode(err)})
			}
		case !answered:
			d.unscreened = absolute
		case admitted:
			d.files = append(d.files, absolute)
		}
	}
	return d
}

// dcLinksIn is linksIn: the links met resolving a path hop by hop, math.MaxInt (Infinity) at limit.
func dcLinksIn(file string, limit int) int {
	count := 0
	absolute, _ := filepath.Abs(file)
	root := filepath.VolumeName(absolute) + string(filepath.Separator)
	resolved := root
	split := func(s string) []string {
		out := []string{}
		for _, part := range dcSplitSlashes(s) {
			if part != "" {
				out = append(out, part)
			}
		}
		return out
	}
	pending := split(strings.TrimPrefix(absolute, root))
	for len(pending) > 0 {
		part := pending[0]
		pending = pending[1:]
		if part == "." {
			continue
		}
		if part == ".." {
			resolved = filepath.Dir(resolved)
			continue
		}
		at := filepath.Join(resolved, part)
		target, link := "", false
		if st, err := os.Lstat(at); err == nil && st.Mode()&os.ModeSymlink != 0 {
			if read, err := os.Readlink(at); err == nil {
				target, link = read, true
			}
		}
		if !link {
			resolved = at
			continue
		}
		count++
		if count >= limit {
			return math.MaxInt
		}
		rest := target
		if filepath.IsAbs(target) {
			resolved = filepath.VolumeName(target) + string(filepath.Separator)
			rest = strings.TrimPrefix(target, resolved)
		}
		pending = append(split(rest), pending...)
	}
	return count
}

type dcAlias struct{ file, sameAs string }

// dcOnceByRealPath is onceByRealPath: each real path read once, by the spelling a name arm prefers, then the one with fewer
// links, then the first listed; every other spelling an alias of it.
func dcOnceByRealPath(paths []string, prefer func(string) bool) (kept []string, aliases []*dcAlias) {
	firstPathTo := map[string]int{}
	aliasesOf := map[string][]*dcAlias{}
	counted := map[string]int{}
	linksOf := func(file string) int {
		if n, ok := counted[file]; ok {
			return n
		}
		counted[file] = dcLinksIn(file, dcLinkLimit)
		return counted[file]
	}
	better := func(file, first string) bool {
		if mine, theirs := prefer(file), prefer(first); mine != theirs {
			return mine
		}
		return linksOf(file) < linksOf(first)
	}
	alias := func(file, sameAs string) {
		entry := &dcAlias{file, sameAs}
		aliases = append(aliases, entry)
		aliasesOf[sameAs] = append(aliasesOf[sameAs], entry)
	}
	for _, file := range paths {
		real, err := dcRealpath(file)
		if err != nil {
			kept = append(kept, file)
			continue
		}
		at, seen := firstPathTo[real]
		if !seen {
			firstPathTo[real] = len(kept)
			kept = append(kept, file)
			continue
		}
		first := kept[at]
		if better(file, first) {
			kept[at] = file
			moved := aliasesOf[first]
			for _, entry := range moved {
				entry.sameAs = file
			}
			delete(aliasesOf, first)
			aliasesOf[file] = moved
			alias(first, file)
			continue
		}
		alias(file, first)
	}
	return kept, aliases
}

// dcAliasReason is aliasReason.
func dcAliasReason(root, sameAs string) string {
	return "another listed path to the same file on disk as " + shownPath(posixListed(relPath(root, sameAs))) +
		" (a link, a junction, or a spelling the file system folds together), so that file is read once"
}

// --- Task attribution (taskDirectoriesFor, taskFilesFor) ----------------------

type dcTaskDirectory struct {
	path  string
	owned bool
}

// dcMarkdownName is `/\.md$/i`.
func dcMarkdownName(name string) bool {
	return len(name) >= 3 && asciiLower(name[len(name)-3:]) == ".md"
}

// dcOwnsNumber is `/^(?:adr[-_]?)?0*(\d{1,4})\b/i`, its letters spelled so no fold outside ASCII applies.
var dcOwnsNumber = regexp.MustCompile(`^(?:[aA][dD][rR][-_]?)?0*([0-9]{1,4})\b`)

// dcTaskDirectoriesFor is taskDirectoriesFor: `tasks/` beside the record, and each sibling directory named for it (by its stem,
// or by its number where no other record's stem claims the name).
func dcTaskDirectoriesFor(file string, number int, hasNumber bool, reader *dcCorpusReader) []dcTaskDirectory {
	directory := filepath.Dir(file)
	found := []dcTaskDirectory{{filepath.Join(directory, "tasks"), false}}
	stem := filepath.Base(file)
	if dcMarkdownName(stem) {
		stem = stem[:len(stem)-3]
	}
	siblings, err := reader.entries(directory)
	if err != nil {
		return found
	}
	stems := map[string]bool{}
	for _, entry := range siblings {
		if entry.Type().IsRegular() && dcMarkdownName(entry.Name()) {
			stems[entry.Name()[:len(entry.Name())-3]] = true
		}
	}
	for _, entry := range siblings {
		name := entry.Name()
		if !entry.IsDir() || name != stem && stems[name] {
			continue
		}
		owns := false
		if hasNumber {
			if m := dcOwnsNumber.FindStringSubmatch(name); m != nil {
				n, _ := strconv.Atoi(m[1])
				owns = n == number
			}
		}
		if owns || name == stem {
			found = append(found, dcTaskDirectory{filepath.Join(directory, name, "tasks"), true})
		}
	}
	return found
}

// dcTaskNames is a task directory's Markdown files, never its README, in listing order.
func dcTaskNames(directory string, reader *dcCorpusReader) ([]string, error) {
	entries, err := reader.entries(directory)
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, entry := range entries {
		lower := dcJSLower(entry.Name())
		if strings.HasSuffix(lower, ".md") && lower != "readme.md" {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

// dcTaskFilesFor is taskFilesFor: every task file in the record's task directories.
func dcTaskFilesFor(file, text string, reader *dcCorpusReader) []string {
	number, hasNumber := dcAdrNumber(file, text)
	found := []string{}
	for _, tasks := range dcTaskDirectoriesFor(file, number, hasNumber, reader) {
		names, err := dcTaskNames(tasks.path, reader)
		if err != nil {
			continue
		}
		for _, name := range names {
			found = append(found, filepath.Join(tasks.path, name))
		}
	}
	return dcOrdered(found)
}

// dcOrdered keeps the first of each string, in order, as `[...new Set(list)]`.
func dcOrdered(list []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range list {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// --- The corpus (adrCorpus) ----------------------------------------------------

// dcRecord is one record adrCorpus counted: its standing, what it governs and declares, and its unresolved list, computed on
// first read as Node's getter computes it.
type dcRecord struct {
	file, title, id               string
	number                        int
	hasNumber, hasID              bool
	standing                      dcStanding
	governs, enforcedBy, declares []string
	declared, declaredUnresolved  []string
	unresolvedList                []string
	unresolvedRead                bool
}

func (r *dcRecord) unresolved(tracked []string) []string {
	if !r.unresolvedRead {
		r.unresolvedList = append([]string{}, r.declaredUnresolved...)
		if tracked != nil {
			for _, declaration := range r.declared {
				matched := false
				for _, file := range tracked {
					if dcPathMatchesDeclaration(file, declaration) {
						matched = true
						break
					}
				}
				if !matched {
					r.unresolvedList = append(r.unresolvedList, "governs:"+declaration)
				}
			}
		}
		r.unresolvedRead = true
	}
	return r.unresolvedList
}

// dcUnreadable is an entry of adrCorpus's unreadable list: a file not read (reason), a record no reader acts on, or one whose
// standing is unproven, with what it would govern.
type dcUnreadable struct {
	file, status, id, reason, unproven, title string
	hasID                                     bool
	governs                                   []string
}

type dcCorpus struct {
	records    []*dcRecord
	unreadable []dcUnreadable
	tracked    []string
	look       string
}

// dcAdrCorpus is adrCorpus with its seams (the listing, the screen budget, the platform): nil tracked is a look that could not
// happen and reads nothing.
func dcAdrCorpus(root string, tracked []string, screenBudget int, platform string) *dcCorpus {
	c := &dcCorpus{tracked: tracked, look: "ok"}
	if tracked == nil {
		c.look = "UNPROVEN"
		return c
	}
	partial := func(entry dcUnreadable) {
		c.unreadable = append(c.unreadable, entry)
		c.look = "PARTIAL"
	}
	reader := newDcCorpusReader()
	listed := map[string]bool{}
	for _, rel := range tracked {
		listed[dcListedAbsolute(root, rel)] = true
	}
	discovered := dcRecordFilesFromListing(root, tracked, screenBudget, platform)
	for _, entry := range discovered.failed {
		partial(entry)
	}
	if discovered.unscreened != "" {
		partial(dcUnreadable{file: discovered.unscreened, reason: fmt.Sprintf(
			"content screen budget: %d bytes were streamed; this file and every later one only the screen could admit were not examined", screenBudget)})
	}
	files, aliases := dcOnceByRealPath(discovered.files, dcNameArmSpelling)
	for _, entry := range aliases {
		partial(dcUnreadable{file: entry.file, reason: dcAliasReason(root, entry.sameAs)})
	}
	recordsPerDirectory := map[string]int{}
	for _, file := range files {
		recordsPerDirectory[filepath.Dir(file)]++
	}
	archiveEffects := map[string]*dcCatalog{}
	charged := 0
	for _, file := range files {
		if charged >= dcRecordBudget {
			partial(dcUnreadable{file: file, reason: fmt.Sprintf(
				"record budget: %d records were read; this file and every later one in the listing were not examined", dcRecordBudget)})
			break
		}
		text, err := dcReadBounded(file, dcRecordLimit)
		if err != nil {
			charged++
			reason := dcErrorCode(err)
			if errors.Is(err, errDcTooBig) {
				reason = "over 512 KiB"
			}
			partial(dcUnreadable{file: file, reason: reason})
			continue
		}
		if strings.Contains(text, "\x00") {
			charged++
			partial(dcUnreadable{file: file, reason: "it holds a NUL byte, so it is not text this reader can read"})
			continue
		}
		// The running platform, not adrCorpus's parameter: decision-corpus.mjs:1577 calls recognisedAsRecord(root, file, text)
		// and its platform defaults to process.platform; mirrored exactly (ADR-137 T4).
		if !dcRecognisedAsRecord(root, file, text, dcPlatform()).recognised {
			continue
		}
		charged++
		standing := dcRecordStanding(file, text, reader.dcReader, archiveEffects, listed, root)
		if standing.unproven != "" {
			c.look = "PARTIAL"
		}
		title, hasTitle := dcTitleLine(text)
		id, hasID := dcRecordID(filepath.Base(file), title, hasTitle)
		paths, unresolved := dcDeclaredGoverns(text)
		if standing.kind == "" {
			entry := dcUnreadable{file: file, status: standing.status, id: id, hasID: hasID}
			// A frozen record whose effect could not be established still says what it would govern: its Governs header and
			// every task file in its directories.
			if standing.unproven != "" {
				governs := append([]string{}, paths...)
				for _, task := range dcTaskFilesFor(file, text, reader) {
					if taskText, err := reader.text(task); err == nil {
						governs = append(governs, dcAffectedFiles(taskText)...)
					}
				}
				entry.unproven, entry.governs, entry.title = standing.unproven, dcOrdered(governs), dcRecordTitle(file, text)
			}
			c.unreadable = append(c.unreadable, entry)
			continue
		}
		governs := append([]string{}, paths...)
		number, hasNumber := dcAdrNumber(file, text)
		type taskText struct{ path, text string }
		texts := []taskText{}
		for _, tasks := range dcTaskDirectoriesFor(file, number, hasNumber, reader) {
			names, err := dcTaskNames(tasks.path, reader)
			if err != nil {
				continue
			}
			for _, name := range names {
				taskPath := filepath.Join(tasks.path, name)
				body, err := reader.text(taskPath)
				switch {
				case err != nil:
				case tasks.owned:
					governs = append(governs, dcAffectedFiles(body)...)
				default:
					texts = append(texts, taskText{taskPath, body})
				}
			}
		}
		// A shared tasks/ directory's file is this record's when it names the record; when none does, only a sole record beside
		// the directory takes them. `number ?` in Node: record 0 is claimed by its id.
		claimed := []taskText{}
		switch {
		case hasNumber && number != 0:
			names := regexp.MustCompile(`[aA][dD][rR][-_ ]?0*` + strconv.Itoa(number) + `\b`)
			for _, entry := range texts {
				if names.MatchString(entry.text) {
					claimed = append(claimed, entry)
				}
			}
		case hasID && id != "":
			for _, entry := range texts {
				for _, ref := range dcReferencesIn(entry.text) {
					if ref == id {
						claimed = append(claimed, entry)
						break
					}
				}
			}
		}
		if len(claimed) == 0 && recordsPerDirectory[filepath.Dir(file)] == 1 {
			claimed = texts
		}
		for _, entry := range claimed {
			governs = append(governs, dcAffectedFiles(entry.text)...)
		}
		c.records = append(c.records, &dcRecord{
			file: file, title: dcRecordTitle(file, text), id: id, hasID: hasID, number: number, hasNumber: hasNumber,
			standing: standing, governs: dcOrdered(governs), enforcedBy: dcDeclaredEnforcement(text), declares: dcOrdered(paths),
			declared: paths, declaredUnresolved: unresolved,
		})
	}
	return c
}

// --- decisionsGoverning and decisionContext ----------------------------------

// dcRelativeWithinRoot is relativeWithinRoot: the candidate relative to the root as spelled, then as both really are (folded
// where the filesystem folds case), then by prefix.
func dcRelativeWithinRoot(root, candidate string) string {
	posix := func(v string) string { return strings.ReplaceAll(v, `\`, "/") }
	inside := func(v string) bool {
		return v == "" || !strings.HasPrefix(v, "..") && !filepath.IsAbs(v) && !driveRelative.MatchString(posix(v))
	}
	fold := func(v string) string {
		if foldsCase() {
			return strings.ToLower(v)
		}
		return v
	}
	real := func(target string) string {
		if exists(target) {
			return fold(canonical(target))
		}
		if anchor := nearestExistingDirectory(target); anchor != "" {
			return fold(filepath.Join(canonical(anchor), relPath(anchor, target)))
		}
		return fold(target)
	}
	attempts := []string{relPath(root, candidate), relPath(real(root), real(candidate))}
	for _, attempt := range attempts {
		if inside(attempt) {
			return attempt
		}
	}
	rp := strings.TrimSuffix(posix(real(root)), "/")
	cp := posix(real(candidate))
	if rp != "" && strings.HasPrefix(cp, rp+"/") {
		return cp[len(rp)+1:]
	}
	if cp == rp {
		return ""
	}
	return attempts[len(attempts)-1]
}

// governing is decisionsGoverning for one path: the governing and graveyard records whose paths match it, and the unproven
// records that declare it.
func (c *dcCorpus) governing(file, root string) (governing, graveyard []*dcRecord, unproven []dcUnreadable) {
	candidate := file
	if filepath.IsAbs(candidate) {
		candidate = dcRelativeWithinRoot(root, candidate)
	}
	candidate = strings.ReplaceAll(candidate, `\`, "/")
	if candidate == "" || strings.HasPrefix(candidate, "..") || filepath.IsAbs(candidate) || driveRelative.MatchString(candidate) {
		return nil, nil, nil
	}
	hits := func(governs []string) bool {
		for _, declaration := range governs {
			if dcPathMatchesDeclaration(candidate, declaration) {
				return true
			}
		}
		return false
	}
	for _, record := range c.records {
		switch {
		case record.standing.kind == "governing" && hits(record.governs):
			governing = append(governing, record)
		case record.standing.kind == "graveyard" && hits(record.governs):
			graveyard = append(graveyard, record)
		}
	}
	for _, entry := range c.unreadable {
		if entry.unproven != "" && entry.governs != nil && hits(entry.governs) {
			unproven = append(unproven, entry)
		}
	}
	return governing, graveyard, unproven
}

// dcGroup is one group of decisionContext's text: its heading, the first five names, and how many more.
func dcGroup(lines []string, heading string, names []string) []string {
	if len(names) == 0 {
		return lines
	}
	lines = append(lines, heading)
	for i, name := range names {
		if i == dcShown {
			break
		}
		lines = append(lines, "  "+name)
	}
	if len(names) > dcShown {
		lines = append(lines, fmt.Sprintf("  (+%d more)", len(names)-dcShown))
	}
	return lines
}

// context is decisionContext's text for one file, or "" when the corpus has nothing to say about it.
func (c *dcCorpus) context(file, root string) string {
	governing, graveyard, unproven := c.governing(file, root)
	if len(governing) == 0 && len(graveyard) == 0 && len(unproven) == 0 {
		return ""
	}
	name := func(file, title string) string {
		shown := relPath(root, file)
		if shown == "" {
			shown = file
		}
		return shown + " — " + title
	}
	names := []string{}
	for _, record := range governing {
		caught := ""
		if len(record.enforcedBy) > 0 {
			caught = "  [caught by: " + strings.Join(record.enforcedBy, ", ") + "]"
		}
		names = append(names, name(record.file, record.title)+caught)
	}
	lines := dcGroup(nil, "Decisions that govern what you are about to change:", names)
	names = []string{}
	for _, record := range graveyard {
		names = append(names, name(record.file, record.title)+" ["+record.standing.status+"]")
	}
	lines = dcGroup(lines, "Already decided against here — do not re-propose without saying why it is different now:", names)
	names = []string{}
	for _, entry := range unproven {
		names = append(names, name(entry.file, entry.title)+" ["+entry.unproven+"]")
	}
	lines = dcGroup(lines, "UNPROVEN — these records declare what you are about to change, and whether they still govern could not be established:", names)
	unresolved := []string{}
	for _, record := range append(append([]*dcRecord{}, governing...), graveyard...) {
		unresolved = append(unresolved, record.unresolved(c.tracked)...)
	}
	if unresolved = dcOrdered(unresolved); len(unresolved) > 0 {
		if len(unresolved) > 4 {
			unresolved = unresolved[:4]
		}
		lines = append(lines, "Recorded but not resolved by this tool: "+strings.Join(unresolved, ", ")+". "+
			"Only `type: path` matchers are matched against files; read those records yourself.")
	}
	return strings.Join(lines, "\n")
}

// dcDecisionContext is decisionContext([file], root): the corpus read from git's listing (taken once by the hook, which gates on
// it), then the text for the file. It has no gate of its own: the hook's (no corpus, a file outside the root) stay with its caller.
func dcDecisionContext(file, root string, tracked []string) string {
	return dcAdrCorpus(root, tracked, dcScreenBudget, dcPlatform()).context(file, root)
}
