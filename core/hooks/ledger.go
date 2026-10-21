// What the ledgers say was checked: plugin/scripts/check-ledger.mjs. A log read in part is never read as a log with nothing in it.
package hooks

import (
	"errors"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var isoLayouts = []string{"2006-01-02T15:04:05.000Z07:00", time.RFC3339Nano, "2006-01-02T15:04:05Z07:00", "2006-01-02T15:04Z07:00", "2006-01-02"}

// dateParse is Date.parse for the ISO forms the ledgers hold: milliseconds, or NaN.
func dateParse(v any) float64 {
	s, ok := v.(string)
	if !ok {
		return math.NaN()
	}
	for _, layout := range isoLayouts {
		if t, err := time.Parse(layout, s); err == nil {
			return float64(t.UnixMilli())
		}
	}
	return math.NaN()
}

type ledgerPassResult struct {
	latest *Obj
	seq    int
	count  int
	byID   map[string]*Obj
}

// ledgerPass reads one check ledger strictly (ADR-101 T2): the latest row `match` accepts must grade check.passed, and no
// write git cannot see may be logged after it.
func ledgerPass(stateRoot, file, seen string, match func(*Obj) bool, vetoRoot string) *ledgerPassResult {
	text, err := os.ReadFile(filepath.Join(stateDir(stateRoot), file))
	if err != nil {
		return nil
	}
	all := strings.Split(string(text), "\n")
	if strings.TrimSpace(all[len(all)-1]) != "" {
		return nil
	}
	all = all[:len(all)-1]
	var latest *Obj
	latestSeq, count := 0, 0
	byID := map[string]*Obj{}
	for _, line := range all {
		if strings.TrimSpace(line) == "" {
			continue
		}
		v, err := parseJSON(line)
		if err != nil {
			return nil
		}
		record, _ := v.(*Obj)
		id, ok := get(record, "id").(string)
		if !ok {
			return nil
		}
		byID[id] = record
		count++
		if match(record) {
			latest, latestSeq = record, count
		}
	}
	if latest == nil || checkEventName(latest) != "check.passed" {
		return nil
	}
	if unseenWriteSince(vetoRoot, seen, latestSeq, dateParse(dig(latest, "before", "at"))) {
		return nil
	}
	return &ledgerPassResult{latest: latest, seq: latestSeq, count: count, byID: byID}
}

type fastPass struct {
	command any
	count   int
}

// latestFastPass is check-ledger.mjs's: the latest fast record on this tree, for the fastCheck declared now (ADR-113 T3).
func latestFastPass(cwd, tree, root string) *fastPass {
	command := fastCheckCommand(root)
	if command == "" {
		return nil
	}
	pass := ledgerPass(cwd, "fast-checks.jsonl", "fastSeen", func(r *Obj) bool {
		return strict(dig(r, "after", "tree"), tree) && strict(get(r, "command"), command)
	}, root)
	if pass == nil {
		return nil
	}
	return &fastPass{command: pass.latest.Get("command"), count: pass.count}
}

// unseenWriteSince says whether any session log holds a write git cannot see that a pass does not cover (ADR-081).
func unseenWriteSince(root, seen string, seq int, started float64) bool {
	sessions := filepath.Join(stateDir(root), "sessions")
	dirents, err := os.ReadDir(sessions)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return true
	}
	for _, d := range dirents {
		if !strings.HasSuffix(d.Name(), ".jsonl") {
			continue
		}
		text, err := os.ReadFile(filepath.Join(sessions, d.Name()))
		if err != nil {
			return true
		}
		for _, line := range strings.Split(string(text), "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			entry, err := parseJSON(line)
			if err != nil {
				return true
			}
			if !strict(get(entry, "event"), "file.written") || !isFalse(get(entry, "observable")) {
				continue
			}
			if p, ok := get(entry, "path").(string); ok && filepath.IsAbs(p) && writtenOutside(root, entry) {
				continue
			}
			counted := get(entry, seen)
			c, isNum := counted.(float64)
			recordedBefore := isUndefined(counted) || (isInteger(counted) && isNum && c < float64(seq))
			if !(recordedBefore && dateParse(get(entry, "at")) < started) {
				return true
			}
		}
	}
	return false
}

func writtenOutside(root string, entry any) bool {
	lexical, ok := get(entry, "lexical").(string)
	return outsideRoot(root, strOr(get(entry, "path"))) && (!ok || !filepath.IsAbs(lexical) || outsideRoot(root, lexical))
}

var driveRelative = regexp.MustCompile(`^[A-Za-z]:`)

// outsideRoot is whether `file` lies outside the repository at `root` under every spelling of both.
func outsideRoot(root, file string) bool {
	fold := func(v string) string {
		if foldsCase() {
			return strings.ToLower(v)
		}
		return v
	}
	inside := func(base, target string) bool {
		relative := filepath.ToSlash(relPath(fold(base), fold(target)))
		relative = strings.ReplaceAll(relative, `\`, "/")
		return !(relative == ".." || strings.HasPrefix(relative, "../") || filepath.IsAbs(relative) || driveRelative.MatchString(relative))
	}
	for _, base := range []string{root, canonical(root)} {
		for _, target := range []string{file, canonicalFile(file)} {
			if inside(base, target) {
				return false
			}
		}
	}
	return true
}

type passedAlreadyResult struct{ id any }

// passedAlready answers whether the ledger already proves this tree (ADR-081). With `prose` (the project's declared paths) a pass
// whose code tree is this tree's, under the same list, proves it too (ADR-094 T3).
func passedAlready(root string, command string, prose []string) *passedAlreadyResult {
	var now *Obj
	if len(prose) > 0 {
		now = observeWith(root, prose, false)
	} else {
		now = observe(root)
	}
	if !isTrue(now.Get("ok")) {
		return nil
	}
	code, hasCode := now.Get("codeTree").(string)
	pass := ledgerPass(root, "checks.jsonl", "checksSeen", func(r *Obj) bool {
		if !strict(get(r, "command"), command) {
			return false
		}
		if strict(dig(r, "after", "tree"), now.Get("tree")) {
			return true
		}
		return len(prose) > 0 && hasCode && strict(dig(r, "after", "codeTree"), code) && sameProse(get(r, "prose"), prose)
	}, root)
	if pass == nil {
		return nil
	}
	return &passedAlreadyResult{id: pass.latest.Get("id")}
}

// checkEventName is the one event a qh-check record becomes (ADR-060).
func checkEventName(record any) string {
	if strict(get(record, "verdict"), "unstarted") {
		return "check.unstarted"
	}
	treeOnly := func(o any) any {
		if isTrue(get(o, "ok")) {
			return O("ok", true, "tree", get(o, "tree"), "index", nil, "head", nil)
		}
		return o
	}
	signal := get(record, "signal")
	if strict(get(record, "verdict"), "timeout") || truthy(signal) {
		return "check.timeout"
	}
	if strict(get(record, "verdict"), "unproven") {
		return "check.unproven"
	}
	exit, ok := get(record, "exit").(float64)
	if !ok {
		return "check.unproven"
	}
	if exit != 0 {
		return "check.failed"
	}
	gitFlag, ok := get(record, "git").(bool)
	if !ok {
		return "check.unproven"
	}
	if gitFlag && !sameObservation(treeOnly(get(record, "before")), treeOnly(get(record, "after"))) {
		return "check.unproven"
	}
	if strict(get(record, "verdict"), "no-work") {
		return "check.no-work"
	}
	return "check.passed"
}

// truthy is JavaScript's truthiness for a JSON value.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil, undefinedType:
		return false
	case bool:
		return x
	case float64:
		return x != 0 && !math.IsNaN(x)
	case string:
		return x != ""
	}
	return true
}

type importResult struct {
	imported int
	complete bool
}

// importCheckRecords copies what qh-check wrote into the session log, and says whether the source was read whole.
func importCheckRecords(cwd string, session any) importResult {
	text, err := os.ReadFile(filepath.Join(stateDir(cwd), "checks.jsonl"))
	if err != nil {
		return importResult{complete: errors.Is(err, fs.ErrNotExist)}
	}
	seen := map[string]bool{}
	for _, e := range readEvents(cwd, session).E {
		if r, ok := get(e, "record").(string); ok {
			seen[r] = true
		}
	}
	imported, sequence := 0, 0
	whole := true
	all := strings.Split(string(text), "\n")
	if strings.TrimSpace(all[len(all)-1]) != "" {
		whole = false
	}
	for _, line := range all[:len(all)-1] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		record, err := parseJSON(line)
		if err != nil {
			whole = false
			continue
		}
		id, ok := get(record, "id").(string)
		if !ok {
			whole = false
			continue
		}
		sequence++
		if seen[id] {
			continue
		}
		event := O(
			"event", checkEventName(record), "record", id, "seq", float64(sequence),
			"startedAt", orNull(dig(record, "before", "at")),
			"before", orNull(get(record, "before")), "after", orNull(get(record, "after")), "exit", orNull(get(record, "exit")),
			"signal", orNull(get(record, "signal")), "command", orNull(get(record, "command")), "origin", orNull(get(record, "origin")),
		)
		// ADR-120 T9: the list a pass's code tree was taken under travels with the event, or the pass carries nowhere.
		if declared, ok := get(record, "prose").([]any); ok {
			event.Set("prose", declared)
		}
		appendEvent(cwd, session, event)
		seen[id] = true
		imported++
	}
	return importResult{imported: imported, complete: whole}
}

type boundLog struct {
	log     Log
	dropped int
	torn    bool
}

// ledgerBoundLog is the session log with every check event checks.jsonl does not hold removed (ADR-088 T2).
func ledgerBoundLog(cwd string, log Log) boundLog {
	torn := boundLog{log: log, torn: true}
	text, err := os.ReadFile(filepath.Join(stateDir(cwd), "checks.jsonl"))
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			return torn
		}
		text = nil
	}
	all := strings.Split(string(text), "\n")
	if strings.TrimSpace(all[len(all)-1]) != "" {
		return torn
	}
	records := map[string]any{}
	for _, line := range all[:len(all)-1] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		record, err := parseJSON(line)
		if err != nil {
			return torn
		}
		id, ok := get(record, "id").(string)
		if !ok {
			return torn
		}
		if _, have := records[id]; !have {
			records[id] = record
		}
	}
	kept := []any{}
	for _, entry := range log.E {
		event, ok := get(entry, "event").(string)
		if !ok || !strings.HasPrefix(event, "check.") || event == "check.source-unreadable" {
			kept = append(kept, entry)
			continue
		}
		id, ok := get(entry, "record").(string)
		record, have := records[id]
		if ok && have && checkEventName(record) == event && strict(dig(record, "after", "tree"), dig(entry, "after", "tree")) && carriedAsRecorded(entry, record) {
			kept = append(kept, entry)
		}
	}
	return boundLog{log: Log{E: kept, Complete: log.Complete}, dropped: len(log.E) - len(kept)}
}

// lateBaselineAllowed: the first look of a session that has no baseline, over a clean tree, with no write on record.
func lateBaselineAllowed(log Log, cwd string, observation any) bool {
	if logIncomplete(log) {
		return false
	}
	for _, e := range log.E {
		if isTrue(dig(e, "observation", "ok")) {
			return false
		}
		if strict(get(e, "event"), "file.written") && !isFalse(get(e, "observable")) {
			return false
		}
	}
	return observedClean(cwd, observation)
}

// resolveFrom is path.resolve(base, target).
func resolveFrom(base, target string) string {
	if filepath.IsAbs(target) {
		return filepath.Clean(target)
	}
	return resolvePath(filepath.Join(base, target))
}

func recordFileWritten(input *Obj) *Obj {
	target := dig(input, "tool_input", "file_path")
	if nullish(target) {
		target = dig(input, "tool_input", "notebook_path")
	}
	t, ok := target.(string)
	if !ok || t == "" {
		return nil
	}
	cwd := strOr(input.Get("cwd"))
	lexical := resolveFrom(cwd, t)
	absolute := canonicalFile(lexical)
	entry := O("event", "file.written", "path", absolute, "observable", false,
		"checksSeen", ledgerRecordCount(cwd, "checks.jsonl"), "fastSeen", ledgerRecordCount(cwd, "fast-checks.jsonl"))
	if lexical != absolute {
		entry.Set("lexical", lexical)
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	root := ""
	if directory != "" {
		root = gitRepositoryRoot(directory)
	}
	parent := nearestExistingDirectory(absolute)
	if root != "" && parent != "" {
		resolved := filepath.Join(canonical(parent), relPath(parent, absolute))
		relative := relPath(root, resolved)
		escapes := false
		if behind, err := filepath.EvalSymlinks(resolved); err == nil {
			inside := relPath(canonical(root), behind)
			escapes = strings.HasPrefix(inside, "..") || filepath.IsAbs(inside)
		}
		if relative != "" && !strings.HasPrefix(relative, "..") && !filepath.IsAbs(relative) && !escapes {
			ignored := git(5*time.Second, nil, "-C", root, "check-ignore", "-q", "--", relative)
			if ignored.err == nil && ignored.status == 1 {
				hashed := git(5*time.Second, nil, "-C", root, "hash-object", "--", relative)
				entry.Set("observable", true)
				if hashed.err == nil && hashed.status == 0 {
					entry.Set("blob", strings.TrimSpace(hashed.stdout))
				} else {
					entry.Set("blob", nil)
				}
			}
		}
	}
	appendEvent(cwd, input.Get("session_id"), entry)
	return entry
}

// recordUnnamedWrite is check-ledger.mjs's: a write whose files its input does not name, recorded with no path, which every
// reader of an unseen write counts until a check passes after it.
func recordUnnamedWrite(input *Obj) *Obj {
	cwd := strOr(input.Get("cwd"))
	entry := O("event", "file.written", "path", nil, "observable", false, "tool", input.Get("tool_name"),
		"checksSeen", ledgerRecordCount(cwd, "checks.jsonl"), "fastSeen", ledgerRecordCount(cwd, "fast-checks.jsonl"))
	appendEvent(cwd, input.Get("session_id"), entry)
	return entry
}

// ledgerRecordCount is how many records a ledger holds, counted as the importer numbers them; nil when it cannot be read.
func ledgerRecordCount(cwd, file string) any {
	text, err := os.ReadFile(filepath.Join(stateDir(cwd), file))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return float64(0)
		}
		return nil
	}
	all := strings.Split(string(text), "\n")
	count := 0
	for _, line := range all[:len(all)-1] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if v, err := parseJSON(line); err == nil {
			if _, ok := get(v, "id").(string); ok {
				count++
			}
		}
	}
	return float64(count)
}

func isCheckEvent(e any) bool {
	event, ok := get(e, "event").(string)
	return ok && strings.HasPrefix(event, "check.")
}

func checkEventsFor(entries []any, tree any, c *carry) []any {
	t, ok := tree.(string)
	if !ok || t == "" {
		return nil
	}
	out := []any{}
	for _, e := range entries {
		// ADR-120 T9: with a carry, the events of any tree with the same code tree under the same list belong to this tree too.
		if isCheckEvent(e) && (strict(dig(e, "after", "tree"), t) ||
			(c != nil && strict(dig(e, "after", "codeTree"), c.codeTree) && sameProse(get(e, "prose"), c.prose))) {
			out = append(out, e)
		}
	}
	return out
}

var logIncompleteEvent = O("event", "check.unproven", "why", "the log could not be read whole")

// latestCheckFor is the check that ran last about this tree; a pass from a torn log does not certify.
// baselineFor is check-ledger.mjs's (ADR-111 T3): the verdict of the last bound row of baseline.jsonl for this tree and command,
// or "" where none is kept. Only the turn end reads it, so no reader of a pass is handed a baseline.
func baselineFor(root string, tree any, command string) string {
	text, err := os.ReadFile(filepath.Join(stateDir(root), "baseline.jsonl"))
	if err != nil {
		return ""
	}
	found := ""
	for _, line := range strings.Split(string(text), "\n") {
		if jsTrim(line) == "" {
			continue
		}
		row, err := parseJSON(line)
		if err != nil {
			continue
		}
		verdict, ok := get(row, "verdict").(string)
		if ok && isTrue(dig(row, "baseline", "bound")) && strict(dig(row, "baseline", "tree"), tree) && strict(get(row, "command"), command) {
			found = verdict
		}
	}
	return found
}

func latestCheckFor(log Log, tree any, c *carry) any {
	latest := latestOf(checkEventsFor(log.E, tree, c), false)
	if strict(get(latest, "event"), "check.passed") && logIncomplete(log) {
		return logIncompleteEvent
	}
	return latest
}

var orderUnresolved = O("event", "check.unresolved", "command", nil)

// latestOf is the newest of some check events by when they RAN; sayUnresolved asks to be told an order could not be established.
func latestOf(events []any, sayUnresolved bool) any {
	if len(events) == 0 {
		return nil
	}
	seen := map[string]bool{}
	unique := []any{}
	for _, entry := range events {
		id, _ := get(entry, "record").(string)
		if id != "" && seen[id] {
			continue
		}
		if id != "" {
			seen[id] = true
		}
		unique = append(unique, entry)
	}
	if len(unique) == 1 {
		return unique[0]
	}
	type rank struct {
		kind string
		seq  float64
		at   string
	}
	ranks := make([]*rank, len(unique))
	kinds := map[string]bool{}
	for i, entry := range unique {
		if isInteger(get(entry, "seq")) {
			ranks[i] = &rank{kind: "seq", seq: get(entry, "seq").(float64)}
		} else if at, ok := get(entry, "startedAt").(string); ok && at != "" {
			ranks[i] = &rank{kind: "at", at: at}
		}
		if ranks[i] == nil {
			kinds["none"] = true
		} else {
			kinds[ranks[i].kind] = true
		}
	}
	candidates := unique
	if len(kinds) == 1 && !kinds["none"] {
		var best *rank
		for _, r := range ranks {
			if best == nil || (r.kind == "seq" && r.seq > best.seq) || (r.kind == "at" && r.at > best.at) {
				best = r
			}
		}
		candidates = []any{}
		for i, entry := range unique {
			if (best.kind == "seq" && ranks[i].seq == best.seq) || (best.kind == "at" && ranks[i].at == best.at) {
				candidates = append(candidates, entry)
			}
		}
	}
	if len(candidates) == 1 {
		return candidates[0]
	}
	if sayUnresolved {
		distinct := map[string]bool{}
		for _, c := range candidates {
			distinct[stringify(get(c, "event"))] = true
		}
		if len(distinct) > 1 {
			return orderUnresolved
		}
	}
	for _, c := range candidates {
		if !strict(get(c, "event"), "check.passed") {
			return c
		}
	}
	return candidates[0]
}

// checkStanding: passed, unresolved, unknown (a torn log), none, could-not-look or not-passed.
func checkStanding(log Log, tree any, c *carry) string {
	if logIncomplete(log) {
		return "unknown"
	}
	descriptive := latestOf(checkEventsFor(log.E, tree, c), true)
	if descriptive == nil {
		return "none"
	}
	switch strOr(get(descriptive, "event")) {
	case "check.unresolved":
		return "unresolved"
	case "check.passed":
		return "passed"
	case "check.unproven", "check.timeout", "check.unstarted":
		return "could-not-look"
	}
	return "not-passed"
}

func checkRevision(log Log, tree any) int { return len(checkEventsFor(log.E, tree, nil)) }

// channelOf is who a finding is for (ADR-096).
func channelOf(event, turnEnd string) string {
	if event == "Stop" {
		if turnEnd == "notify" {
			return "user"
		}
		return "agent"
	}
	if event == "PreToolUse" {
		return "agent"
	}
	return "user"
}

func deliveredTo(event, turnEnd string) string {
	if channelOf(event, turnEnd) == "agent" {
		return "both"
	}
	return "user"
}

// reachedChannel: a row counts for an audience when its delivery reached it; "" asks for none.
func reachedChannel(entry any, channel, recipient string) bool {
	if channel == "" || isUndefined(get(entry, "channel")) {
		return true
	}
	if channel == "agent" && recipient == "main" && strict(get(entry, "recipient"), "subagent") {
		return false
	}
	return strict(get(entry, "channel"), "both") || strict(get(entry, "channel"), channel)
}

func emittedFor(log Log, rule string, key any, channel, recipient string) bool {
	for _, e := range log.E {
		if strict(get(e, "event"), "action.emitted") && strict(get(e, "rule"), rule) && strict(get(e, "key"), key) && reachedChannel(e, channel, recipient) {
			return true
		}
	}
	return false
}

func namedByReview(log Log, key string, channel, recipient string) bool {
	for _, e := range log.E {
		if !strict(get(e, "event"), "action.emitted") || !strict(get(e, "rule"), "R2") || !reachedChannel(e, channel, recipient) {
			continue
		}
		if strict(get(e, "key"), key) {
			return true
		}
		if commits, ok := dig(e, "detail", "commits").([]any); ok {
			for _, c := range commits {
				if strict(c, key) {
					return true
				}
			}
		}
	}
	return false
}

// aboutAnotherPublish: a P advice about a mention, a fresh repository or another repository names no publish from this tree.
var aboutAnotherPublish = regexp.MustCompile(`:(?:mention|fresh|foreign)$`)

func namedByPublish(log Log, tree any, revision int) bool {
	for _, e := range log.E {
		if key, ok := get(e, "key").(string); ok && aboutAnotherPublish.MatchString(key) {
			continue
		}
		if strict(get(e, "event"), "action.emitted") && strict(get(e, "rule"), "P") &&
			strict(dig(e, "detail", "tree"), tree) && strict(dig(e, "detail", "revision"), float64(revision)) {
			return true
		}
	}
	return false
}

// unobservableWrites: the writes git cannot see that no pass, by both orders, covers (ADR-081, ADR-094 T4).
func unobservableWrites(log Log, root string) []any {
	writes := func(e any) bool {
		if !strict(get(e, "event"), "file.written") || !isFalse(get(e, "observable")) {
			return false
		}
		p, ok := get(e, "path").(string)
		return !(root != "" && ok && filepath.IsAbs(p) && writtenOutside(root, e))
	}
	out := []any{}
	if logIncomplete(log) {
		for _, e := range log.E {
			if writes(e) {
				out = append(out, e)
			}
		}
		return out
	}
	recordedAfter := func(write, pass any) bool {
		seen := get(write, "checksSeen")
		if isUndefined(seen) {
			return true
		}
		return isInteger(seen) && isInteger(get(pass, "seq")) && get(pass, "seq").(float64) > seen.(float64)
	}
	startedAfter := func(write, pass any) bool {
		at, ok1 := get(write, "at").(string)
		started, ok2 := get(pass, "startedAt").(string)
		return !ok1 || !ok2 || started > at
	}
	for i, e := range log.E {
		if !writes(e) {
			continue
		}
		covered := false
		for j := i + 1; j < len(log.E); j++ {
			later := log.E[j]
			if strict(get(later, "event"), "check.passed") && recordedAfter(e, later) && startedAfter(e, later) {
				covered = true
				break
			}
		}
		if !covered {
			out = append(out, e)
		}
	}
	return out
}

func revisionFor(log Log, observation any) int {
	if isTrue(get(observation, "ok")) {
		return checkRevision(log, get(observation, "tree"))
	}
	n := 0
	for _, e := range log.E {
		if isCheckEvent(e) {
			n++
		}
	}
	return n
}

// logIncomplete: a session log with a torn line, or a checks.jsonl recorded as unreadable in part.
func logIncomplete(log Log) bool {
	if !log.Complete {
		return true
	}
	for _, e := range log.E {
		if strict(get(e, "event"), "check.source-unreadable") {
			return true
		}
	}
	return false
}

// tornRecord names which record could not be read whole; "" stands for the caller's null.
func tornRecord(log Log, sessionWords string) string {
	if !log.Complete {
		return sessionWords
	}
	return "`checks.jsonl`, where `qh-check` records its runs,"
}
