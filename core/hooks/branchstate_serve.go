// Branch state's serving half: main(), cached(), emitCachedBranchState, the snapshot writer, replaceFile and ADR-128 T2's
// own-commit suppression of plugin/scripts/branch-state.mjs (ADR-135 T3), answering `qh bridge branch-state` with the same
// bytes and the same snapshot. One change from Node, ADR-135 Decision 2: a due brief is refreshed inside the hook under
// bsRefreshBudgetMs and, when that refresh is cut, the snapshot is served marked so. No lock file, and no process outlives the
// hook: every child is started through bsShell, bounded by what is left of the budget.
package hooks

import (
	"bytes"
	"compress/zlib"
	"io"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// bsRefreshBudgetMs is the WHOLE wall-clock of a due brief's inline refresh, git half included (ADR-135 Decision 2).
var bsRefreshBudgetMs = 2000.0

const (
	bsSnapshotFile = "qh-branch-state.json"
	// A temporary older than this belongs to a writer killed between its write and its rename (ORPHAN_MS).
	bsOrphanMs = 60_000
)

// bsGitOverrides are the environment variables that make only git able to say where the repository is.
var bsGitOverrides = []string{"GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_CEILING_DIRECTORIES", "GIT_DISCOVERY_ACROSS_FILESYSTEM"}

func bsNowMs() float64 { return float64(time.Now().UnixMilli()) }

// bsAge is `Math.max(1, Math.round((now - at) / 1000))`: floored at 1, so an answer from cache never reads as just taken.
func bsAge(now, at float64) float64 { return math.Max(1, math.Floor((now-at)/1000+0.5)) }

// bsFileOps is the filesystem replaceFile uses, a seam so the Windows rename refusal can be reproduced anywhere.
type bsFileOps struct {
	write  func(string, []byte) error
	rename func(string, string) error
	remove func(string) error
	list   func(string) ([]os.DirEntry, error)
	mtime  func(string) (time.Time, error)
}

var bsDisk = bsFileOps{
	write:  func(file string, data []byte) error { return os.WriteFile(file, data, 0o666) },
	rename: os.Rename,
	remove: os.Remove,
	list:   os.ReadDir,
	mtime: func(file string) (time.Time, error) {
		st, err := os.Stat(file)
		if err != nil {
			return time.Time{}, err
		}
		return st.ModTime(), nil
	},
}

// bsReplaceFile is replaceFile: the snapshot is replaced, never rewritten in place, so two writers never interleave. Windows
// refuses a rename over a file another program holds open, where an in-place write still succeeds, so that is the fallback;
// and each write removes the snapshot's temporaries older than a minute, which no live writer holds.
func bsReplaceFile(file, text string, fs bsFileOps, now time.Time) error {
	temporary := file + "." + strconv.Itoa(os.Getpid()) + ".tmp"
	err := fs.write(temporary, []byte(text))
	if err == nil {
		err = fs.rename(temporary, file)
	}
	if err != nil {
		_ = fs.remove(temporary)
		if err := fs.write(file, []byte(text)); err != nil {
			return err
		}
	}
	directory := filepath.Dir(file)
	orphan := regexp.MustCompile(`^` + regexp.QuoteMeta(filepath.Base(file)) + `\.\d+\.tmp$`)
	entries, err := fs.list(directory)
	if err != nil {
		return nil
	}
	for _, entry := range entries {
		if !orphan.MatchString(entry.Name()) {
			continue
		}
		spare := filepath.Join(directory, entry.Name())
		if at, err := fs.mtime(spare); err == nil && now.Sub(at) > bsOrphanMs*time.Millisecond {
			_ = fs.remove(spare)
		}
	}
	return nil
}

// bsReadSnapshot is main()'s `read`: the parsed snapshot, or nil when there is none or it is not JSON.
func bsReadSnapshot(store string) any {
	if store == "" {
		return nil
	}
	text, err := os.ReadFile(store)
	if err != nil {
		return nil
	}
	parsed, err := parseJSON(string(text))
	if err != nil {
		return nil
	}
	return parsed
}

// bsSpread is `{ ...value }` for what JSON.parse gives: an object's own keys in order, nothing for anything else.
func bsSpread(value any) *Obj {
	if o, ok := value.(*Obj); ok {
		return o.Clone()
	}
	return O()
}

func bsCoalesce(a, b any) any {
	if nullish(a) {
		return b
	}
	return a
}

// bsWriter is main()'s `writer`: a new snapshot keeps `said`, `redKey` and `permanentFor` across a refresh (dropping `said`
// reprinted every unchanged brief, CLAUDE.md §17) and carries what the session last heard.
func bsWriter(store string) func(*Obj) {
	return func(payload *Obj) {
		if store == "" {
			return
		}
		current := bsReadSnapshot(store)
		out := payload.Clone()
		for _, k := range []string{"said", "redKey", "permanentFor"} {
			out.Set(k, bsCoalesce(payload.Get(k), get(current, k)))
		}
		for _, k := range []string{"saidState", "saidKey", "saidHead", "saidSession", "saidEvents"} {
			out.Set(k, orNull(get(current, k)))
		}
		_ = bsReplaceFile(store, stringify(out), bsDisk, time.Now())
	}
}

// bsStampBriefSaid is stampBriefSaid: what a brief said, merged over the snapshot as it is now. `undefined` leaves a key alone.
func bsStampBriefSaid(store string, said, redKey any, extra *Obj) {
	if store == "" {
		return
	}
	text, err := os.ReadFile(store)
	if err != nil {
		return
	}
	current, err := parseJSON(string(text))
	if err != nil {
		return
	}
	out := bsSpread(current)
	if !isUndefined(said) {
		out.Set("said", said)
	}
	if !isUndefined(redKey) {
		out.Set("redKey", redKey)
	}
	if extra != nil {
		for _, k := range extra.Keys() {
			out.Set(k, extra.Get(k))
		}
	}
	_ = bsReplaceFile(store, stringify(out), bsDisk, time.Now())
}

// bsCached is `cached`: a snapshot fresh for maxAge is served; otherwise the state is gathered, its git half written as a
// checkpoint before the network half is asked, then written whole. `key` is read before the gather starts.
func bsCached(maxAge float64, store string, key any, gather func(func(any)) any) (state any, fromCache bool, age float64) {
	at := bsNowMs()
	previous := bsReadSnapshot(store)
	if bsFreshSnapshot(previous, at, maxAge, key) {
		return get(previous, "state"), true, bsAge(at, get(previous, "at").(float64))
	}
	write := bsWriter(store)
	state = gather(func(partial any) { write(O("at", at, "key", key, "partial", true, "state", partial)) })
	write(O("at", at, "key", key, "state", state))
	return state, false, 0
}

// bsCommonDir is commonDirOf: the shared git directory a linked worktree names in `commondir`.
func bsCommonDir(gitDir string) string {
	pointer, err := os.ReadFile(filepath.Join(gitDir, "commondir"))
	if err != nil {
		return gitDir
	}
	p := strings.TrimSpace(string(pointer))
	if p == "" {
		return gitDir
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	return filepath.Join(gitDir, p)
}

// bsCommitParents is commitParents: a commit's parents read from its loose object; false when it is packed, unreadable or
// not a commit.
func bsCommitParents(gitDir string, sha any) ([]string, bool) {
	s, isString := sha.(string)
	if gitDir == "" || !isString || !bsFullSha.MatchString(s) {
		return nil, false
	}
	raw, err := os.ReadFile(filepath.Join(bsCommonDir(gitDir), "objects", s[:2], s[2:]))
	if err != nil {
		return nil, false
	}
	reader, err := zlib.NewReader(bytes.NewReader(raw))
	if err != nil {
		return nil, false
	}
	inflated, err := io.ReadAll(reader)
	if err != nil {
		return nil, false
	}
	// toString('latin1'): one character per byte.
	units := make([]rune, len(inflated))
	for i, b := range inflated {
		units[i] = rune(b)
	}
	text := string(units)
	if !strings.HasPrefix(text, "commit ") {
		return nil, false
	}
	body := text[strings.Index(text, "\x00")+1:]
	if end := strings.Index(body, "\n\n"); end >= 0 {
		body = body[:end]
	}
	parents := []string{}
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "parent ") {
			parents = append(parents, line[len("parent "):])
		}
	}
	return parents, true
}

// bsOwnCommitWalk is ownCommitWalk: the single-parent commits from `to` back to `from`, newest first, or false when that
// cannot be shown within `limit`.
func bsOwnCommitWalk(gitDir string, from, to any, limit int, parents func(string, any) ([]string, bool)) ([]string, bool) {
	f, fromString := from.(string)
	sha, toString := to.(string)
	if !fromString || !toString {
		return nil, false
	}
	walked := []string{}
	for len(walked) <= limit {
		if sha == f {
			return walked, true
		}
		up, ok := parents(gitDir, sha)
		if !ok || len(up) != 1 {
			return nil, false
		}
		walked = append(walked, sha)
		sha = up[0]
	}
	return nil, false
}

// bsKeyOf is keyOf: the snapshot key as an array, or nil.
func bsKeyOf(gitDir string) []any {
	key, isString := bsSnapshotKey(gitDir).(string)
	if !isString {
		return nil
	}
	parsed, err := parseJSON(key)
	arr, isArray := parsed.([]any)
	if err != nil || !isArray {
		return nil
	}
	return arr
}

// bsAt is `arr[i]`: undefined past the end.
func bsAt(arr []any, i int) any {
	if i < len(arr) {
		return arr[i]
	}
	return undefined
}

// bsSessionEvents is `readEvents(dir, session, { spawn: false })`: the session's log, found without starting git.
func bsSessionEvents(dir, session string) Log {
	return readEventLog(filepath.Join(stateDirSpawn(dir, false), "sessions", unsafeSessionChars.ReplaceAllString(session, "_")+".jsonl"))
}

// bsHeardNow is heardNow: the state the session heard, the snapshot key and how far its log ran; all null when unknown.
func bsHeardNow(gitDir, dir string, session, state any) *Obj {
	unknown := O("saidState", nil, "saidKey", nil, "saidHead", nil, "saidSession", nil, "saidEvents", nil)
	id, isString := session.(string)
	if gitDir == "" || !isString || id == "" {
		return unknown
	}
	log := bsSessionEvents(dir, id)
	key := bsKeyOf(gitDir)
	if !log.Complete || !truthy(bsAt(key, 1)) {
		return unknown
	}
	return O("saidState", orNull(state), "saidKey", stringify(key), "saidHead", key[1], "saidSession", id,
		"saidEvents", float64(len(log.E)))
}

// bsOwnCommitOnly is ownCommitOnly: the only change since the state the session last heard is HEAD moving, on the same ref and
// upstream, by single-parent commits git's post-commit hook recorded for this session (`commit.made`).
func bsOwnCommitOnly(previous, state any, gitDir, dir string, session any) bool {
	id, isString := session.(string)
	saidEvents := get(previous, "saidEvents")
	if !truthy(previous) || !isString || !strict(get(previous, "saidSession"), id) || !isInteger(saidEvents) {
		return false
	}
	said, isText := get(previous, "saidKey").(string)
	if !isText {
		return false
	}
	parsed, err := parseJSON(said)
	heard, isArray := parsed.([]any)
	live := bsKeyOf(gitDir)
	// A switched ref or a moved upstream is news, whatever HEAD's history shows.
	if err != nil || !isArray || live == nil || !strict(bsAt(heard, 0), bsAt(live, 0)) || !strict(bsAt(heard, 2), bsAt(live, 2)) {
		return false
	}
	walked, ok := bsOwnCommitWalk(gitDir, get(previous, "saidHead"), bsAt(live, 1), 50, bsCommitParents)
	if !ok || len(walked) == 0 {
		return false
	}
	log := bsSessionEvents(dir, id)
	from := saidEvents.(float64)
	if !log.Complete || float64(len(log.E)) < from {
		return false
	}
	start := int(from)
	if start < 0 {
		start = max(len(log.E)+start, 0)
	}
	made := map[string]bool{}
	for _, entry := range log.E[start:] {
		if strict(get(entry, "event"), "commit.made") {
			if sha, ok := get(entry, "sha").(string); ok {
				made[sha] = true
			}
		}
	}
	for _, sha := range walked {
		if !made[sha] {
			return false
		}
	}
	return bsUnchangedButOwnCommits(get(previous, "saidState"), state, float64(len(walked)))
}

// bsSaidKey is saidKey: the brief after its head, read from `said`.
func bsSaidKey(said any) any {
	s, ok := said.(string)
	if !ok {
		return nil
	}
	i := strings.Index(s, " · ")
	if i < 0 {
		return nil
	}
	return s[i:]
}

// bsRedLine is redLine: the same red run, already said in full, as one line.
func bsRedLine(state any) string {
	ci := get(state, "ci")
	line := "⚠ CI " + jsString(get(ci, "sha")) + ": " + strings.ToUpper(jsString(get(ci, "conclusion")))
	count := 0
	switch failed := get(ci, "failed").(type) {
	case []any:
		count = len(failed)
	case string:
		count = utf16Len(failed)
	}
	if count > 0 {
		line += ", " + strconv.Itoa(count) + " job(s)"
	}
	return line + ", unchanged"
}

// bsEmit is what emitCachedBranchState is told besides the state. `tail` follows the age inside its parentheses.
type bsEmit struct {
	brief     bool
	age       float64
	previous  any
	store     string
	tail      string
	stale     bool
	movedTo   any
	session   any
	ownCommit func(previous, state any) bool
	heard     func(state any) *Obj
}

// bsEmitCached is emitCachedBranchState: say the state, or nothing when the session already heard it.
func bsEmitCached(out io.Writer, state any, e bsEmit) {
	claim := ""
	if truthy(e.movedTo) && truthy(get(state, "looked")) {
		claim = " (moved since this was read: HEAD now " + jsString(e.movedTo) + "; uncommitted and ahead not re-read)"
	}
	head := bsHeadOf(state)
	mark := func(shown string) string {
		if claim != "" && strings.HasPrefix(shown, head) {
			return head + claim + shown[len(head):]
		}
		return shown
	}
	text := mark(bsRender(state, e.brief))
	var key any
	if e.brief {
		key = bsRedKey(state)
	}
	ci := get(state, "ci")
	// ADR-120 T13: an unknown no wait can change is said once per session, whatever the head does.
	permanent := e.brief && e.session != nil && truthy(get(state, "looked")) && isFalse(get(ci, "looked")) &&
		strict(get(ci, "note"), bsNoGitHubNote)
	if permanent && strict(get(e.previous, "permanentFor"), e.session) {
		return
	}
	var permanentFor any
	if permanent {
		permanentFor = e.session
	}
	heard := func() *Obj {
		extra := O("permanentFor", permanentFor)
		said := e.heard(state)
		for _, k := range said.Keys() {
			extra.Set(k, said.Get(k))
		}
		return extra
	}
	if e.brief && key == nil && truthy(e.previous) && !permanent &&
		(bsBriefUnchanged(get(e.previous, "said"), text) || e.ownCommit(e.previous, state)) {
		return
	}
	// ADR-094 T1: the same red run, already said in full, is one line. It is never stored.
	if key != nil && strict(get(e.previous, "redKey"), key) {
		io.WriteString(out, bsRedLine(state)+"\n")
		if truthy(get(e.previous, "permanentFor")) {
			bsStampBriefSaid(e.store, undefined, undefined, O("permanentFor", permanentFor))
		}
		return
	}
	suffix := ""
	if e.age != 0 {
		suffix = " (read " + jsNumber(e.age) + "s ago" + e.tail + ")"
	}
	var unknown any
	if e.brief {
		unknown = bsUnknownKey(state)
	}
	if unknown != nil && !permanent && strict(bsSaidKey(get(e.previous, "said")), unknown) {
		shown := ""
		if e.stale {
			shown = suffix
		}
		io.WriteString(out, mark(head)+" · ⚠ CI COULD NOT LOOK, unchanged"+shown+"\n")
		bsStampBriefSaid(e.store, text, key, heard())
		return
	}
	io.WriteString(out, text+suffix+"\n")
	if e.brief {
		bsStampBriefSaid(e.store, text, key, heard())
	}
}

// bsHookPayload is hookPayload: the JSON object the host writes to stdin, or {} for a terminal, an empty pipe or anything else.
func bsHookPayload(stdin *os.File) *Obj {
	if stdin == nil {
		return O()
	}
	if st, err := stdin.Stat(); err == nil && st.Mode()&os.ModeCharDevice != 0 {
		return O()
	}
	raw, err := io.ReadAll(stdin)
	if err != nil {
		return O()
	}
	parsed, err := parseJSON(string(raw))
	if o, ok := parsed.(*Obj); err == nil && ok {
		return o
	}
	return O()
}

// bsSessionDirectory is sessionDirectory: the payload's `cwd` when it is a directory, else where the process stands.
func bsSessionDirectory(payload *Obj) string {
	if cwd, ok := payload.Get("cwd").(string); ok && cwd != "" && isDir(cwd) {
		return resolvePath(cwd)
	}
	wd, _ := os.Getwd()
	return wd
}

// RunBranchState is branch-state.mjs's main() in the core: `[--brief] [--cached N]`, exit 0 on every path.
func RunBranchState(args []string, stdin *os.File, out io.Writer) int {
	brief := slices.Contains(args, "--brief")
	at := slices.Index(args, "--cached")
	refresh := slices.Contains(args, "--refresh")
	payload := O()
	if !refresh {
		payload = bsHookPayload(stdin)
	}
	dir := bsSessionDirectory(payload)
	var session any
	if s, ok := payload.Get("session_id").(string); ok && s != "" {
		session = s
	}
	run := bsBudgeted(bsBudgetMs, bsShell, bsNowMs, dir)
	// The review ledger, found the way the hook finds its own state: without starting a process.
	ledgerHeads := func() []string { return bsReviewedHeads(stateDirSpawn(dir, false)) }
	gather := func(runner bsRunner) func(func(any)) any {
		return func(checkpoint func(any)) any { return collectBranchState(runner, checkpoint, bsNowMs, ledgerHeads()) }
	}
	emit := func(gitDirectory string, state any, e bsEmit) {
		e.brief, e.session = brief, session
		e.ownCommit = func(previous, state any) bool { return bsOwnCommitOnly(previous, state, gitDirectory, dir, session) }
		e.heard = func(state any) *Obj { return bsHeardNow(gitDirectory, dir, session, state) }
		bsEmitCached(out, state, e)
	}
	if refresh {
		// Node's detached refresher, kept for a hand run: it collects, writes the snapshot and prints nothing.
		if home := findGitDir(dir); home != "" {
			bsCached(0, filepath.Join(home, bsSnapshotFile), bsSnapshotKey(home), gather(run))
		}
		return 0
	}
	if at < 0 {
		state := collectBranchState(run, func(any) {}, bsNowMs, ledgerHeads())
		io.WriteString(out, bsRender(state, brief)+"\n")
		return 0
	}
	maxAge := math.NaN()
	if at+1 < len(args) {
		maxAge = jsToNumber(args[at+1])
	}
	if maxAge == 0 || math.IsNaN(maxAge) {
		maxAge = 120
	}
	// Ordinary cache hits need no git process; explicit git discovery overrides must still be interpreted by git.
	overridden := false
	for _, k := range bsGitOverrides {
		if _, set := os.LookupEnv(k); set {
			overridden = true
		}
	}
	hint, hintStore := "", ""
	var hintKey any
	if !overridden {
		hint = findGitDir(dir)
	}
	if hint != "" {
		hintStore = filepath.Join(hint, bsSnapshotFile)
		hintKey = bsSnapshotKey(hint)
	}
	previous := bsReadSnapshot(hintStore)
	now := bsNowMs()
	// A brief never shows an answer past the cap, however long --cached allows.
	servedFor := maxAge
	if brief {
		servedFor = math.Min(maxAge, bsShowAtMostSeconds)
	}
	if bsFreshSnapshot(previous, now, servedFor, hintKey) {
		emit(hint, get(previous, "state"), bsEmit{age: bsAge(now, get(previous, "at").(float64)), previous: previous, store: hintStore})
		return 0
	}
	// ADR-135 Decision 2: a due BRIEF is refreshed here, under one budget for the whole collection. The full report and a
	// missing snapshot are still collected under the full budget below, so a session's one full answer is never an old one.
	if brief && hint != "" && bsUsableCache(previous, now) {
		budget := bsRefreshBudgetMs
		deadline := bsNowMs() + budget
		inner := bsBudgeted(budget, bsShell, bsNowMs, dir)
		cut := false
		bounded := func(argv []string, opts bsOpts) bsAnswer {
			answer := inner(argv, opts)
			// A command the budget prevented, or one its share of the budget killed (it cannot finish after its cap), leaves
			// the collection cut short: what it would say is not this branch's state.
			if answer.Budget || bsNowMs() >= deadline {
				cut = true
			}
			return answer
		}
		key := hintKey
		started := bsNowMs()
		// No checkpoint: a partial answer is never written over a good snapshot.
		state := collectBranchState(bounded, func(any) {}, bsNowMs, ledgerHeads())
		within := "within " + jsNumber(budget/1000) + "s"
		if !cut {
			bsWriter(hintStore)(O("at", started, "key", key, "state", state))
			written := bsReadSnapshot(hintStore)
			if nullish(written) {
				written = previous
			}
			emit(hint, state, bsEmit{previous: written, store: hintStore})
			return 0
		}
		if bsPastShowCap(now - get(previous, "at").(float64)) {
			// Past the cap the old answer is not shown. The line carries no age, so `said` holds it and it is said once.
			line := "branch-state: the last answer is past the " + jsNumber(bsShowAtMostSeconds/60) +
				"-minute cap, so it is not shown; the refresh did not finish " + within + "."
			if !strict(get(previous, "said"), line) {
				io.WriteString(out, line+"\n")
				bsStampBriefSaid(hintStore, line, undefined, nil)
			}
			return 0
		}
		emit(hint, get(previous, "state"), bsEmit{age: bsAge(now, get(previous, "at").(float64)), previous: previous,
			store: hintStore, tail: "; not refreshed " + within, stale: true, movedTo: bsMovedSince(get(previous, "key"), hintKey)})
		return 0
	}
	home := ""
	if relative, ok := bsGitDir(run).(string); ok {
		home = relative
		if !filepath.IsAbs(home) {
			home = filepath.Join(dir, home)
		}
		home = filepath.Clean(home)
	}
	store := ""
	var key any
	if home != "" {
		store = filepath.Join(home, bsSnapshotFile)
		key = bsSnapshotKey(home)
	}
	state, fromCache, age := bsCached(servedFor, store, key, gather(run))
	written := bsReadSnapshot(store)
	if nullish(written) {
		written = previous
	}
	if !fromCache {
		age = 0
	}
	emit(home, state, bsEmit{age: age, previous: written, store: store})
	return 0
}
