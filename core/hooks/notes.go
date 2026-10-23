// What a session keeps for itself and for the next one (plugin/scripts/session-notes.mjs) and the sweeps that keep those
// files from growing (housekeeping.mjs). The marker names are sha256 stamps of the same strings, in the same directories, so a
// marker either implementation leaves is one the other honours.
package hooks

import (
	"errors"
	"fmt"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	saidMarkerMaxAge    = 7 * 24 * time.Hour
	saidSweepInterval   = 24 * time.Hour
	standingFactMaxAge  = 3 * 24 * time.Hour
	unseenWriteLineExpr = `"observable":\s*false`
)

var (
	legacyMarker = regexp.MustCompile(`^quality-harness-(?:said|note)-[0-9a-f]{32}$`)
	// The statusline's per-session cache (housekeeping.mjs STATUS_CACHE): both cores claim the same daily guard, so the sweep
	// that claims it must remove it too (ultrareview of v3.8.53..main).
	statusCache     = regexp.MustCompile(`^quality-harness-status-[0-9a-f]{32}$`)
	markerName      = regexp.MustCompile(`^[0-9a-f]{32}$`)
	unseenWriteLine = regexp.MustCompile(unseenWriteLineExpr)
)

func tmpDir() string { return os.TempDir() }

func saidMarkerDirectory() string { return filepath.Join(tmpDir(), "quality-harness-said") }

func nowMs() float64 { return float64(time.Now().UnixMilli()) }

func mtimeMs(p string) (float64, bool) {
	st, err := os.Stat(p)
	if err != nil {
		return 0, false
	}
	return float64(st.ModTime().UnixNano()) / 1e6, true
}

// claimDailySweep: whether today's sweep is still owed, with the guard stamped for it.
func claimDailySweep(guard string, now float64) bool {
	last := math.NaN()
	if text, err := os.ReadFile(guard); err == nil {
		last = jsNumberOf(string(text))
	}
	if !math.IsNaN(last) && !math.IsInf(last, 0) && last <= now && now-last < float64(saidSweepInterval.Milliseconds()) {
		return false
	}
	return os.WriteFile(guard, []byte(jsNumber(now)), 0o666) == nil
}

// jsNumberOf is Number(text) for a decimal string.
func jsNumberOf(text string) float64 {
	t := jsTrim(text)
	if t == "" {
		return 0
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil {
		if t == "Infinity" || t == "+Infinity" {
			return math.Inf(1)
		}
		if t == "-Infinity" {
			return math.Inf(-1)
		}
		return math.NaN()
	}
	return f
}

func sweepStaleMarkers() {
	now := nowMs()
	directory := saidMarkerDirectory()
	if os.MkdirAll(directory, 0o777) != nil {
		return
	}
	if !claimDailySweep(filepath.Join(directory, ".swept"), now) {
		return
	}
	sweep := func(dir string, accept func(string) bool) {
		names, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, d := range names {
			if !accept(d.Name()) {
				continue
			}
			file := filepath.Join(dir, d.Name())
			if m, ok := mtimeMs(file); ok && now-m > float64(saidMarkerMaxAge.Milliseconds()) {
				os.Remove(file)
			}
		}
	}
	sweep(directory, markerName.MatchString)
	sweep(tmpDir(), func(name string) bool { return legacyMarker.MatchString(name) || statusCache.MatchString(name) })
}

// sweepStaleSessionLogs removes week-old session logs that hold no write git could not see, once a day per repository.
func sweepStaleSessionLogs(cwd string, session any) {
	now := nowMs()
	directory := filepath.Join(stateDir(cwd), "sessions")
	names, err := os.ReadDir(directory)
	if err != nil {
		return
	}
	if !claimDailySweep(filepath.Join(directory, ".swept"), now) {
		return
	}
	own := ""
	if id, ok := session.(string); ok && id != "" {
		own = filepath.Base(sessionLogFile(cwd, id))
	}
	for _, d := range names {
		name := d.Name()
		if !strings.HasSuffix(name, ".jsonl") || name == own {
			continue
		}
		file := filepath.Join(directory, name)
		m, ok := mtimeMs(file)
		if !ok {
			continue
		}
		if now-m <= float64(saidMarkerMaxAge.Milliseconds()) {
			continue
		}
		text, err := os.ReadFile(file)
		if err != nil || unseenWriteLine.Match(text) {
			continue
		}
		os.Remove(file)
	}
}

func stamp(s string) string { return sha256Hex(s)[:32] }

func sessionGenerationPath(session string) string {
	return filepath.Join(tmpDir(), "quality-harness-gen-"+stamp(session))
}

func sessionGeneration(session string) int {
	text, err := os.ReadFile(sessionGenerationPath(session))
	if err != nil {
		return 0
	}
	n := jsNumberOf(strings.TrimSpace(string(text)))
	if math.IsNaN(n) || n == 0 {
		return 0
	}
	return int(n)
}

func bumpSessionGeneration(session any) {
	id, ok := session.(string)
	if !ok || id == "" {
		return
	}
	next := sessionGeneration(id) + 1
	os.WriteFile(sessionGenerationPath(id), []byte(strconv.Itoa(next)), 0o666)
}

func sessionMentionPath(session any, key string) string {
	id, ok := session.(string)
	if !ok || id == "" {
		return ""
	}
	return filepath.Join(saidMarkerDirectory(), stamp(fmt.Sprintf("%s#%d#%s", id, sessionGeneration(id), key)))
}

func alreadyMentionedThisSession(session any, key string) bool {
	marker := sessionMentionPath(session, key)
	if marker == "" {
		return false
	}
	m, ok := mtimeMs(marker)
	return ok && nowMs()-m <= float64(saidMarkerMaxAge.Milliseconds())
}

// firstMentionHere: a standing fact is said once per repository and text for three days (ADR-094 T2).
func firstMentionHere(root, text string) bool {
	directory := saidMarkerDirectory()
	marker := filepath.Join(directory, stamp("here#"+root+"#"+text))
	now := time.Now()
	if err := os.MkdirAll(directory, 0o777); err != nil {
		return true
	}
	sweepStaleMarkers()
	if st, err := os.Stat(marker); err == nil {
		age := now.Sub(st.ModTime())
		if age >= 0 && age < standingFactMaxAge {
			return false
		}
	}
	if os.WriteFile(marker, nil, 0o666) == nil {
		os.Chtimes(marker, now, now)
	}
	return true
}

// firstMentionThisSession: an exclusive create, so two parallel calls do not both say it.
func firstMentionThisSession(session any, key string) bool {
	marker := sessionMentionPath(session, key)
	if marker == "" {
		return true
	}
	sweepStaleMarkers()
	f, err := os.OpenFile(marker, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o666)
	if err != nil {
		return !errors.Is(err, fs.ErrExist)
	}
	f.Close()
	return true
}

type claim struct {
	claimed bool
	reason  string
}

func claimCompaction(session any, compaction any) claim {
	id, ok1 := session.(string)
	cid, ok2 := compaction.(string)
	if !ok1 || id == "" || !ok2 || cid == "" {
		return claim{reason: "missing id"}
	}
	directory := saidMarkerDirectory()
	if err := os.MkdirAll(directory, 0o777); err != nil {
		return claim{reason: errCode(err, "mkdir failed")}
	}
	f, err := os.OpenFile(filepath.Join(directory, stamp(id+"#"+cid)), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o666)
	if err != nil {
		if errors.Is(err, fs.ErrExist) {
			return claim{reason: "claimed"}
		}
		return claim{reason: errCode(err, "create failed")}
	}
	f.Close()
	return claim{claimed: true}
}

// errCode is the code Node puts on a filesystem error, or `fallback`.
func errCode(err error, fallback string) string {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return "ENOENT"
	case errors.Is(err, fs.ErrExist):
		return "EEXIST"
	case errors.Is(err, fs.ErrPermission):
		return "EACCES"
	}
	return fallback
}

func sessionNotePath(session string) string {
	return filepath.Join(tmpDir(), "quality-harness-note-"+stamp(session))
}

func readSessionNote(session any) any {
	id, ok := session.(string)
	if !ok || id == "" {
		return nil
	}
	text, err := os.ReadFile(sessionNotePath(id))
	if err != nil {
		return nil
	}
	v, err := parseJSON(string(text))
	if err != nil {
		return nil
	}
	return v
}

// replaceSessionNote replaces this session's state note, or leaves none.
func replaceSessionNote(session any, note *Obj) bool {
	id, ok := session.(string)
	if !ok || id == "" {
		return false
	}
	cleared := true
	if err := os.Remove(sessionNotePath(id)); err != nil {
		cleared = errors.Is(err, fs.ErrNotExist)
	}
	if note == nil {
		if !cleared {
			os.Stderr.WriteString("[quality-harness] PreCompact: an earlier state note could not be removed; it is older than this compaction.\n")
		}
		return cleared
	}
	if err := os.WriteFile(sessionNotePath(id), []byte(stringify(note)), 0o666); err != nil {
		tail := ""
		if !cleared {
			tail = ", and an earlier one could not be removed; it is older than this compaction"
		}
		os.Stderr.WriteString(fmt.Sprintf("[quality-harness] PreCompact: could not keep the state note (%s)%s.\n", errCode(err, err.Error()), tail))
		return false
	}
	return true
}

// facts is what observedFacts reads from the log and the tree.
type facts struct {
	files        []string
	other        int
	pending      bool
	checked      bool
	treeOrder    any // a standing, or nil
	checkOrigin  any
	checkCommand any
	observed     bool
	whole        bool
	why          any
	late         bool
	lastCheck    *Obj // { command, verdict } or nil
}

type stateNote struct {
	at         string
	status     string
	unverified bool
	files      []string
	other      int
	text       string
}

func (n stateNote) obj() *Obj {
	return O("at", n.at, "status", n.status, "unverified", n.unverified, "files", n.files, "other", float64(n.other), "text", n.text)
}

func sessionStateNote(f facts, cwd, root string, now time.Time) stateNote {
	files := f.files
	if files == nil {
		files = []string{}
	}
	other := f.other
	shown := []string{}
	for _, file := range files[:min(5, len(files))] {
		rel := relPath(cwd, file)
		if rel == "" {
			rel = file
		}
		shown = append(shown, shownPath(rel))
	}
	if len(files) > len(shown) {
		shown = append(shown, fmt.Sprintf("+%d more", len(files)-len(shown)))
	}
	pending, late, observed, passed := f.pending, f.late, f.observed, f.checked
	status := "verified"
	switch {
	case !observed:
		status = "unverified"
	case len(files) == 0 && other == 0 && !pending:
		if late {
			status = "unverified"
		} else {
			status = "neutral"
		}
	case pending || !passed:
		status = "unverified"
	}
	parts := []string{}
	unordered := strict(f.treeOrder, "unresolved")
	unobserved := strict(f.treeOrder, "could-not-look")
	why := "the working tree could not be observed"
	if s, ok := f.why.(string); ok {
		why = s
	}
	switch {
	case len(files) > 0 && observed:
		verdict := ""
		switch {
		case unordered:
			verdict = "which check ran last on this tree could not be established"
		case unobserved:
			verdict = "the latest `qh-check` on this tree could not observe it, so it is not known to be checked"
		case pending:
			verdict = "no `qh-check` has passed on them"
		case passed:
			verdict = "a `qh-check` passed on them"
			if strict(f.checkOrigin, "inferred") {
				command := "unknown"
				if s, ok := f.checkCommand.(string); ok {
					command = s
				}
				verdict += " — using an INFERRED check (" + checkInCode(command) + "), guessed from a manifest and not declared, so it may not be this project's whole gate; declare the real command as `check` in .quality-harness.json"
			}
		default:
			verdict = "nothing here changed them since the session began, and no `qh-check` has passed on them"
		}
		head := fmt.Sprintf("%d changed path(s)", len(files))
		if other > 0 {
			head += fmt.Sprintf(" and %d write(s) git cannot see", other)
		}
		list := ""
		if len(shown) > 0 {
			list = ": " + strings.Join(shown, ", ")
		}
		parts = append(parts, head+"; "+verdict+list+".")
	case other > 0:
		parts = append(parts, fmt.Sprintf("%d write(s) git cannot see since the last passing check.", other))
	case !observed:
		text := why + ", so what changed here is unknown."
		if len(files) > 0 {
			text += fmt.Sprintf(" Git lists %d changed path(s): %s.", len(files), strings.Join(shown, ", "))
		}
		parts = append(parts, text)
	case pending:
		switch {
		case unordered:
			parts = append(parts, "nothing is uncommitted, and which check ran last on the tree at HEAD could not be established.")
		case unobserved:
			parts = append(parts, "nothing is uncommitted, and the latest `qh-check` on the tree at HEAD could not observe it.")
		default:
			parts = append(parts, "nothing is uncommitted, and the tree at HEAD is one no `qh-check` has passed on.")
		}
	default:
		if late {
			parts = append(parts, "nothing has changed in the working tree since this plugin began watching — which was partway through this session, so what happened before that, a commit included, is unknown here (ADR-005).")
		} else {
			parts = append(parts, "nothing has changed in the working tree.")
		}
	}
	switch {
	case !f.whole:
		parts = append(parts, "Which check ran last is unknown.")
	case f.lastCheck != nil && strict(f.lastCheck.Get("verdict"), "unresolved"):
		parts = append(parts, "Which check ran last could not be established: the records disagree and cannot be ordered.")
	case f.lastCheck != nil:
		command := "qh-check"
		if s, ok := f.lastCheck.Get("command").(string); ok {
			command = s
		}
		parts = append(parts, fmt.Sprintf("Last check: %s %s.", checkInCode(command), strOr(f.lastCheck.Get("verdict"))))
	default:
		parts = append(parts, "No check has run this session.")
	}
	return stateNote{at: isoTime(now), status: status, unverified: pending, files: files, other: other, text: strings.Join(parts, " ")}
}

// previousSessionHere is the last row SessionEnd wrote for this location that says something.
func previousSessionHere(cwd string) any {
	home := os.Getenv("CLAUDE_PLUGIN_DATA")
	if home == "" {
		return nil
	}
	text, err := os.ReadFile(filepath.Join(home, "sessions.jsonl"))
	if err != nil {
		return nil
	}
	rows := []string{}
	for _, line := range strings.Split(string(text), "\n") {
		if line != "" {
			rows = append(rows, line)
		}
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	place := cwd
	if directory != "" {
		place = directory
		if root := gitRepositoryRoot(directory); root != "" {
			place = root
		}
	}
	here := locationKey(place)
	for index := len(rows) - 1; index >= 0; index-- {
		row, err := parseJSON(rows[index])
		if err != nil {
			continue
		}
		key := ""
		if s, ok := get(row, "location").(string); ok {
			key = s
		} else if s, ok := get(row, "cwd").(string); ok {
			key = locationKey(s)
		} else {
			continue
		}
		if key != here {
			continue
		}
		if strict(get(row, "status"), "neutral") {
			continue
		}
		return row
	}
	return nil
}

func previousSessionNotice(cwd string) string {
	row := previousSessionHere(cwd)
	if row == nil || !strict(get(row, "status"), "unverified") {
		return ""
	}
	files := []string{}
	rowFiles, isArray := get(row, "files").([]any)
	if isArray {
		for _, file := range rowFiles[:min(5, len(rowFiles))] {
			s := jsString(file)
			rel := relPath(cwd, s)
			if rel == "" {
				rel = s
			}
			files = append(files, shownPath(rel))
		}
	}
	other := 0
	if n, ok := get(row, "other").(float64); ok && !math.IsNaN(n) {
		other = int(n)
	}
	whatParts := []string{}
	if isArray && len(rowFiles) > 0 {
		whatParts = append(whatParts, fmt.Sprintf("%d edit(s)", len(rowFiles)))
	}
	if other != 0 {
		whatParts = append(whatParts, fmt.Sprintf("%d write(s) git cannot see", other))
	}
	what := strings.Join(whatParts, " and ")
	if what == "" {
		what = "edits"
	}
	check := projectCheckCommand(cwd)
	directory := nearestExistingDirectory(resolvePath(cwd))
	repository := ""
	if directory != "" {
		repository = gitRepositoryRoot(directory)
	}
	declared := ""
	if repository != "" {
		declared = checkCommandOrigin(repository, nil).command
	}
	if repository != "" && declared != "" && passedAlready(repository, declared, proseSpecs(repository)) != nil {
		return ""
	}
	reason := "unknown reason"
	if s := get(row, "reason"); !nullish(s) {
		reason = jsString(s)
	}
	at := jsString(get(row, "at"))
	if unknown, ok := get(row, "unknown").(string); ok && unknown != "" {
		text := fmt.Sprintf("The previous session in this directory ended (%s, %s) with its state UNKNOWN to this plugin — %s.", reason, at, unknown)
		if len(files) > 0 {
			text += " Git listed: " + strings.Join(files, ", ") + "."
		}
		if other != 0 {
			text += fmt.Sprintf(" %d write(s) git cannot see were recorded, and no passing check after them is on record.", other)
		}
		text += " "
		if check != "" {
			text += checkInCode(check) + " is this project's check."
		} else {
			text += "No check is declared here."
		}
		return text
	}
	text := fmt.Sprintf("The previous session in this directory ended (%s, %s) with %s after which no recognised check passed", reason, at, what)
	if len(files) > 0 {
		text += ": " + strings.Join(files, ", ")
	}
	text += ". "
	if check != "" {
		text += "Run `qh-check` (it runs " + checkInCode(check) + ") before building on them."
	} else {
		text += "Nothing has checked them since."
	}
	return text
}

// jsString is String(v) for a JSON value.
func jsString(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case nil:
		return "null"
	case undefinedType:
		return "undefined"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64:
		if math.IsNaN(x) {
			return "NaN"
		}
		if math.IsInf(x, 1) {
			return "Infinity"
		}
		if math.IsInf(x, -1) {
			return "-Infinity"
		}
		return jsNumber(x)
	case []any:
		parts := make([]string, len(x))
		for i, item := range x {
			if !nullish(item) {
				parts[i] = jsString(item)
			}
		}
		return strings.Join(parts, ",")
	case *Obj:
		return "[object Object]"
	}
	return ""
}
