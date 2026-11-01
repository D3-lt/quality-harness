// Branch state's pure functions: plugin/scripts/branch-state.mjs, line for line (ADR-135 T1). They take the state as JSON
// with JavaScript's semantics (json.go), because the snapshot in <git-dir>/qh-branch-state.json is read and written by both
// implementations, and every coercion a template literal or a `===` makes in the Node source is made here the same way.
// tests/branch-state-parity.test.mjs builds rows from the Node functions; branchstate_parity_test.go answers them.
package hooks

import (
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf16"
)

// The oldest snapshot a brief still shows (branch-state.mjs SHOW_AT_MOST_SECONDS).
const bsShowAtMostSeconds = 600

// How many runs one listing asks for (RUN_WINDOW).
const bsRunWindow = 20

// How many failed or skipped job names a brief shows (NAMES_SHOWN).
const bsNamesShown = 3

var bsHex = regexp.MustCompile(`(?i)^[0-9a-f]{7,64}$`)

// isSafeInteger is Number.isSafeInteger.
func isSafeInteger(v any) bool {
	f, ok := v.(float64)
	return ok && isInteger(v) && math.Abs(f) <= 9007199254740991
}

// bsJoin is Array.prototype.join: null and undefined are empty, everything else is String(item).
func bsJoin(v any, sep string) string {
	arr, _ := v.([]any)
	parts := make([]string, len(arr))
	for i, item := range arr {
		if !nullish(item) {
			parts[i] = jsString(item)
		}
	}
	return strings.Join(parts, sep)
}

func bsLen(v any) int {
	arr, _ := v.([]any)
	return len(arr)
}

// isObjectValue is `typeof v === 'object' && v !== null`.
func isObjectValue(v any) bool {
	switch v.(type) {
	case *Obj, []any:
		return true
	}
	return false
}

// bsHeadRuns is headRuns: the runs that answer for HEAD, else for the pushed tip, as {sha, anchor, runs, complete}, or null.
func bsHeadRuns(rows, head, upstream any) any {
	all, _ := rows.([]any)
	var listed []any
	for _, r := range all {
		if truthy(r) && truthy(get(r, "headSha")) && isSafeInteger(get(r, "databaseId")) {
			listed = append(listed, r)
		}
	}
	if len(listed) == 0 {
		return nil
	}
	var shas []string
	seen := map[string]bool{}
	for _, r := range listed {
		s := jsString(get(r, "headSha"))
		if bsHex.MatchString(s) && !seen[s] {
			seen[s] = true
			shas = append(shas, s)
		}
	}
	at := func(id any) (string, bool) {
		if !truthy(id) || !bsHex.MatchString(jsString(id)) {
			return "", false
		}
		want := jsString(id)
		var hits []string
		for _, s := range shas {
			if len(s) >= 40 && len(s) == len(want) {
				if s == want {
					hits = append(hits, s)
				}
			} else if strings.HasPrefix(s, want) || strings.HasPrefix(want, s) {
				hits = append(hits, s)
			}
		}
		if len(hits) == 1 {
			return hits[0], true
		}
		return "", false
	}
	var anchor, sha string
	if s, ok := at(head); ok {
		anchor, sha = "head", s
	} else if s, ok := at(upstream); ok {
		anchor, sha = "tip", s
	} else {
		return nil
	}
	workflowOf := func(r any) string {
		v := get(r, "workflowDatabaseId")
		if nullish(v) {
			v = get(r, "workflowName")
		}
		if nullish(v) {
			v = ""
		}
		return jsString(v)
	}
	started := func(r any) float64 {
		v := get(r, "startedAt")
		if nullish(v) {
			v = ""
		}
		return dateParse(jsString(v))
	}
	id := func(r any) float64 { return get(r, "databaseId").(float64) }
	var atSha []any
	for _, r := range listed {
		if strict(get(r, "headSha"), sha) {
			atSha = append(atSha, r)
		}
	}
	// later(a, b) = (started(b) - started(a)) || (b.databaseId - a.databaseId): a NaN or zero difference falls to the id.
	sort.SliceStable(atSha, func(i, j int) bool {
		a, b := atSha[i], atSha[j]
		d := started(b) - started(a)
		if math.IsNaN(d) || d == 0 {
			d = id(b) - id(a)
		}
		return d < 0
	})
	var chosen []any
	keys := map[string]bool{}
	for _, r := range atSha {
		event := get(r, "event")
		if nullish(event) {
			event = ""
		}
		key := workflowOf(r) + "\x00" + jsString(event)
		if !keys[key] {
			keys[key] = true
			chosen = append(chosen, r)
		}
	}
	judged := map[string]bool{}
	for _, r := range chosen {
		if strict(get(r, "status"), "completed") && !strict(get(r, "conclusion"), "cancelled") {
			judged[workflowOf(r)] = true
		}
	}
	oldest := math.Inf(1)
	for _, r := range atSha {
		oldest = math.Min(oldest, id(r))
	}
	runs := []any{}
	for _, r := range chosen {
		if !(strict(get(r, "conclusion"), "cancelled") && judged[workflowOf(r)]) {
			runs = append(runs, r)
		}
	}
	complete := len(listed) < bsRunWindow
	for _, r := range listed {
		if !strict(get(r, "headSha"), sha) && id(r) < oldest {
			complete = true
		}
	}
	return O("sha", sha, "anchor", anchor, "runs", runs, "complete", complete)
}

func bsDrift(state any) string {
	ahead, behind := get(state, "ahead"), get(state, "behind")
	var said []string
	if truthy(ahead) {
		said = append(said, jsString(ahead)+" ahead")
	}
	if truthy(behind) {
		said = append(said, jsString(behind)+" behind")
	}
	if len(said) == 0 {
		return ""
	}
	of := " of"
	if truthy(behind) {
		of = ""
	}
	return ", " + strings.Join(said, " and ") + of + " origin"
}

func bsHeadOf(state any) string {
	text := "branch-state: " + jsString(get(state, "branch")) + " @ " + jsString(get(state, "head"))
	dirty := get(state, "dirty")
	switch {
	case dirty == nil:
		text += ", cleanliness COULD NOT LOOK"
	case truthy(dirty):
		text += ", " + jsString(dirty) + " uncommitted path(s)"
	default:
		text += ", clean"
	}
	return text + bsDrift(state)
}

func bsCappedNames(failed any) string {
	arr, _ := failed.([]any)
	if len(arr) > bsNamesShown {
		return bsJoin(arr[:bsNamesShown], ", ") + ", +" + jsNumber(float64(len(arr)-bsNamesShown)) + " more"
	}
	return bsJoin(arr, ", ")
}

// bsRender is render: the state as lines, the one-line brief or the full report.
func bsRender(state any, brief bool) string {
	if !truthy(get(state, "looked")) {
		return "branch-state: COULD NOT LOOK — " + jsString(get(state, "note")) + ". This says nothing about the branch."
	}
	head := bsHeadOf(state)
	ciState := get(state, "ci")
	named := jsString(get(ciState, "sha"))
	var ci string
	alarm := false
	switch {
	case !truthy(get(ciState, "looked")):
		ci = "COULD NOT LOOK — " + jsString(get(ciState, "note")) + ". NOT a green branch; an unknown one."
		alarm = true
	case !strict(get(ciState, "status"), "completed"):
		ci = named + ": still running. Not finished is not green (§13)."
	case strict(get(ciState, "conclusion"), "success"):
		skipped := get(ciState, "skipped")
		if bsLen(skipped) > 0 {
			names := bsJoin(skipped, ", ")
			if brief {
				names = bsCappedNames(skipped)
			}
			ci = named + ": succeeded; " + jsNumber(float64(bsLen(skipped))) + " job(s) skipped — " + names + "."
		} else {
			ci = named + ": every job concluded success."
		}
	default:
		ci = named + ": " + strings.ToUpper(jsString(get(ciState, "conclusion")))
		failed := get(ciState, "failed")
		if bsLen(failed) > 0 {
			names := bsJoin(failed, ", ")
			if brief {
				names = bsCappedNames(failed)
			}
			ci += " — " + names
		}
		alarm = true
	}
	tipNote := ""
	if truthy(get(ciState, "looked")) && strict(get(ciState, "anchor"), "tip") {
		tipNote = " (the pushed tip as last fetched; HEAD has no run)"
	}
	release := ""
	if shipped := get(state, "shippedSinceTag"); truthy(shipped) {
		release = "plugin/ changed in " + jsString(shipped) + " file(s) since " + jsString(get(state, "tag")) + ", the newest tag " +
			"reachable from HEAD in this clone — a forge release MAY NOT be tagged here, so check " +
			"`gh release view` before treating this as unreleased (§13)."
	} else if blocked := get(state, "releaseBlocked"); truthy(blocked) {
		release = "COULD NOT LOOK at the release state — " + jsString(blocked) + ". " + `That is not "nothing to release".`
	}
	if brief {
		mark := "CI "
		if alarm {
			mark = "⚠ CI "
		}
		line := head + " · " + mark + ci + tipNote
		if release != "" {
			line += " · " + release
		}
		if alarm {
			line += "\n  A LOCAL GREEN GATE DOES NOT ANSWER THIS — the local check and the CI jobs are different checks."
		}
		return line
	}
	read := ""
	if runs := get(ciState, "runs"); bsLen(runs) > 0 {
		read = " (run " + bsJoin(runs, ", ") + ")"
	}
	label := "CI      "
	if alarm {
		label = "⚠ CI    "
	}
	lines := []string{head, "  " + label + " " + ci + read}
	if alarm && truthy(get(ciState, "looked")) {
		lines = append(lines, "           A LOCAL GREEN GATE DOES NOT ANSWER THIS. The local check and the CI "+
			"jobs are different checks; read this one before planning anything on this branch.")
	}
	if tipNote != "" {
		lines = append(lines, "           that is the pushed tip as last fetched; HEAD has no run")
	}
	if release != "" {
		lines = append(lines, "  release  "+release)
	}
	lines = append(lines, "  This READS. It blocks nothing and judges nothing about your work.")
	return strings.Join(lines, "\n")
}

// bsCIRed is ciRed: CI's answer is a completed run that did not succeed.
func bsCIRed(state any) bool {
	if !isObjectValue(state) || !truthy(get(state, "looked")) {
		return false
	}
	ci := get(state, "ci")
	if !isObjectValue(ci) || !truthy(get(ci, "looked")) {
		return false
	}
	return strict(get(ci, "status"), "completed") && !strict(get(ci, "conclusion"), "success")
}

// utf16Less is the default Array.prototype.sort order for strings: UTF-16 code units.
func utf16Less(a, b string) bool {
	x, y := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(x) && i < len(y); i++ {
		if x[i] != y[i] {
			return x[i] < y[i]
		}
	}
	return len(x) < len(y)
}

// bsRedKey is redKey: the sha, the conclusion and the sorted full set of failed jobs, or null when CI is not red.
func bsRedKey(state any) any {
	if !bsCIRed(state) {
		return nil
	}
	ci := get(state, "ci")
	failed := []any{}
	if arr, ok := get(ci, "failed").([]any); ok {
		failed = append(failed, arr...)
	}
	// The default sort compares String(item), with undefined last.
	sort.SliceStable(failed, func(i, j int) bool {
		if isUndefined(failed[i]) || isUndefined(failed[j]) {
			return !isUndefined(failed[i]) && isUndefined(failed[j])
		}
		return utf16Less(jsString(failed[i]), jsString(failed[j]))
	})
	return stringify([]any{get(ci, "sha"), jsString(get(ci, "conclusion")), failed})
}

// bsUnknownKey is unknownKey: the brief after its head when CI could not be looked at, else null.
func bsUnknownKey(state any) any {
	if !isObjectValue(state) || !truthy(get(state, "looked")) {
		return nil
	}
	ci := get(state, "ci")
	if !isObjectValue(ci) || truthy(get(ci, "looked")) {
		return nil
	}
	return strings.TrimPrefix(bsRender(state, true), bsHeadOf(state))
}

var bsDirtyCount = regexp.MustCompile(`, (?:\d+ uncommitted path\(s\)|clean)`)

// bsDropDirty removes the first dirty count that DIRTY_COUNT's lookahead `(?=,| ·|$)` admits, as String.replace does.
func bsDropDirty(text string) string {
	for _, m := range bsDirtyCount.FindAllStringIndex(text, -1) {
		rest := text[m[1]:]
		if rest == "" || strings.HasPrefix(rest, ",") || strings.HasPrefix(rest, " ·") {
			return text[:m[0]] + rest
		}
	}
	return text
}

// bsBriefUnchanged is briefUnchanged: the brief said before and this one differ only in the working tree's path count.
func bsBriefUnchanged(said any, text string) bool {
	s, ok := said.(string)
	return ok && bsDropDirty(s) == bsDropDirty(text)
}

// bsMovedSince is movedSince: the short HEAD the checkout holds now when the stored key no longer matches, else null.
func bsMovedSince(stored, live any) any {
	s, ok1 := stored.(string)
	l, ok2 := live.(string)
	if !ok1 || !ok2 || s == l {
		return nil
	}
	if _, err := parseJSON(s); err != nil {
		return nil
	}
	parsed, err := parseJSON(l)
	if err != nil {
		return nil
	}
	var sha any = undefined
	switch x := parsed.(type) {
	case []any:
		if len(x) > 1 {
			sha = x[1]
		}
	case *Obj:
		sha = x.Get("1")
	case string:
		if units := utf16.Encode([]rune(x)); len(units) > 1 {
			sha = string(utf16.Decode(units[1:2]))
		}
	}
	str, ok := sha.(string)
	if !ok || str == "" {
		return nil
	}
	units := utf16.Encode([]rune(str))
	if len(units) > 7 {
		units = units[:7]
	}
	return string(utf16.Decode(units))
}

// bsPastShowCap is pastShowCap: a snapshot ageMs old is too old for a brief to show.
func bsPastShowCap(ageMs float64) bool { return ageMs > bsShowAtMostSeconds*1000 }

// bsPastCapLine is pastCapLine: the one line a brief past the cap says when no refresh could be started, said once.
func bsPastCapLine(refreshing bool, previous any) any {
	if refreshing {
		return nil
	}
	line := "branch-state: the last answer is past the " + jsNumber(bsShowAtMostSeconds/60) + "-minute cap, " +
		"so it is not shown; a refresh could not be started."
	if strict(get(previous, "said"), line) {
		return nil
	}
	return line
}

var bsHeadSha = regexp.MustCompile(`^[0-9a-f]{4,64}$`)

// bsReported is `reported`: what the brief says besides what a session's own commit moves, or null for a non-object.
func bsReported(state any) any {
	if !truthy(state) || !isObjectValue(state) {
		return nil
	}
	head := get(state, "head")
	if nullish(head) {
		head = ""
	}
	var ci any
	if c := get(state, "ci"); truthy(c) {
		if o, ok := c.(*Obj); ok {
			ci = o.Clone().Set("anchor", nil)
		} else {
			ci = O("anchor", nil)
		}
	}
	return stringify([]any{
		get(state, "looked"), orNull(get(state, "note")), orNull(get(state, "branch")), bsHeadSha.MatchString(jsString(head)),
		orNull(get(state, "behind")), get(state, "dirty") == nil, ci, orNull(get(state, "tag")), orNull(get(state, "releaseBlocked")),
		truthy(get(state, "shippedSinceTag")),
	})
}

// bsUnchangedButOwnCommits is unchangedButOwnCommits: nothing changed but HEAD and the ahead count, by at most `commits`.
func bsUnchangedButOwnCommits(saidState, state, commits any) bool {
	if !isInteger(commits) || commits.(float64) < 1 {
		return false
	}
	before := bsReported(saidState)
	if before == nil || !strict(before, bsReported(state)) {
		return false
	}
	if (get(saidState, "ahead") == nil) != (get(state, "ahead") == nil) {
		return false
	}
	num := func(v any) float64 {
		if nullish(v) {
			return 0
		}
		f, _ := v.(float64)
		return f
	}
	rose := num(get(state, "ahead")) - num(get(saidState, "ahead"))
	return rose >= 0 && rose <= commits.(float64)
}

func isFiniteNumber(v any) bool {
	f, ok := v.(float64)
	return ok && !math.IsInf(f, 0) && !math.IsNaN(f)
}

// bsUsableCache is usableCache: a snapshot whose time and state can be trusted as a snapshot at all.
func bsUsableCache(previous any, now float64) bool {
	if !truthy(previous) || !isObjectValue(previous) {
		return false
	}
	at := get(previous, "at")
	if !isFiniteNumber(at) || at.(float64) > now {
		return false
	}
	state := get(previous, "state")
	if !truthy(state) || !isObjectValue(state) {
		return false
	}
	if _, ok := get(state, "looked").(bool); !ok {
		return false
	}
	ci := get(state, "ci")
	return isFalse(get(state, "looked")) || (truthy(ci) && isObjectValue(ci))
}

// bsFreshSnapshot is freshSnapshot: usable, young, whole, and keyed to now.
func bsFreshSnapshot(previous any, now, maxAgeSeconds float64, key any) bool {
	return bsUsableCache(previous, now) && (now-get(previous, "at").(float64))/1000 < maxAgeSeconds &&
		!isTrue(get(previous, "partial")) && !nullish(key) && strict(get(previous, "key"), key)
}

// bsConfigValue is configValue: a git config value as git reads it.
func bsConfigValue(raw string) string {
	var out strings.Builder
	quoted := false
	units := []rune(raw)
	for i := 0; i < len(units); i++ {
		c := units[i]
		switch {
		case c == '\\' && i+1 < len(units):
			i++
			switch next := units[i]; next {
			case 'n':
				out.WriteRune('\n')
			case 't':
				out.WriteRune('\t')
			default:
				out.WriteRune(next)
			}
		case c == '"':
			quoted = !quoted
		case !quoted && (c == ';' || c == '#'):
			return strings.TrimSpace(out.String())
		default:
			out.WriteRune(c)
		}
	}
	return strings.TrimSpace(out.String())
}

var (
	bsFullSha      = regexp.MustCompile(`^[0-9a-f]{40,64}$`)
	bsRefLine      = regexp.MustCompile(`^ref: (refs/\S+)$`)
	bsInclude      = regexp.MustCompile(`(?im)^\s*\[\s*include(?:if)?\b`)
	bsContinued    = regexp.MustCompile(`(?m)(?:^|[^\\])(?:\\\\)*\\\r?$`)
	bsBranchOpen   = regexp.MustCompile(`(?i)^\[\s*branch\b`)
	bsBranchHeader = regexp.MustCompile(`(?i)^\[\s*branch\s+"([^"\\]*)"\s*\]\s*(?:[;#].*)?$`)
	bsSetting      = regexp.MustCompile(`^(\w+)\s*=\s*(.*)$`)
	bsLineBreak    = regexp.MustCompile(`\r?\n`)
)

// bsSnapshotKey is snapshotKey: [raw HEAD, its sha, the upstream's sha] read from files without spawning git, or null.
func bsSnapshotKey(gitDir string) any {
	if gitDir == "" {
		return nil
	}
	read := func(file string) (string, bool) {
		b, err := os.ReadFile(file)
		return string(b), err == nil
	}
	common := gitDir
	if pointer, ok := read(filepath.Join(gitDir, "commondir")); ok && strings.TrimSpace(pointer) != "" {
		p := strings.TrimSpace(pointer)
		if filepath.IsAbs(p) {
			common = filepath.Clean(p)
		} else {
			common = filepath.Join(gitDir, p)
		}
	}
	ref := func(name string) (string, bool) {
		for _, dir := range []string{gitDir, common} {
			if loose, ok := read(filepath.Join(append([]string{dir}, strings.Split(name, "/")...)...)); ok {
				if s := strings.TrimSpace(loose); s != "" && bsFullSha.MatchString(s) {
					return s, true
				}
			}
		}
		packed, _ := read(filepath.Join(common, "packed-refs"))
		for _, line := range bsLineBreak.Split(packed, -1) {
			parts := strings.Split(strings.TrimSpace(line), " ")
			if len(parts) > 1 && parts[1] == name && bsFullSha.MatchString(parts[0]) {
				return parts[0], true
			}
		}
		return "", false
	}
	raw, ok := read(filepath.Join(gitDir, "HEAD"))
	head := strings.TrimSpace(raw)
	if !ok || head == "" {
		return nil
	}
	sha := ""
	upstream := "-"
	if bsFullSha.MatchString(head) {
		sha = head
	} else {
		m := bsRefLine.FindStringSubmatch(head)
		if m == nil {
			return nil
		}
		branch := m[1]
		sha, _ = ref(branch)
		if strings.HasPrefix(branch, "refs/heads/") {
			name := strings.TrimPrefix(branch, "refs/heads/")
			tracking := "refs/remotes/origin/" + name
			section := false
			remote, merge := "", ""
			haveRemote, haveMerge := false, false
			config, _ := read(filepath.Join(common, "config"))
			if bsInclude.MatchString(config) || bsContinued.MatchString(config) {
				return nil
			}
			for _, rawLine := range bsLineBreak.Split(config, -1) {
				line := strings.TrimSpace(rawLine)
				if bsBranchOpen.MatchString(line) {
					header := bsBranchHeader.FindStringSubmatch(line)
					if header == nil {
						return nil
					}
					section = header[1] == name
					continue
				}
				if strings.HasPrefix(line, "[") {
					section = false
					continue
				}
				if !section {
					continue
				}
				if setting := bsSetting.FindStringSubmatch(line); setting != nil {
					switch strings.ToLower(setting[1]) {
					case "remote":
						remote, haveRemote = bsConfigValue(setting[2]), true
					case "merge":
						merge, haveMerge = bsConfigValue(setting[2]), true
					}
				}
			}
			if haveRemote && remote != "" && haveMerge && strings.HasPrefix(merge, "refs/heads/") {
				if remote == "." {
					tracking = merge
				} else {
					tracking = "refs/remotes/" + remote + "/" + strings.TrimPrefix(merge, "refs/heads/")
				}
			}
			if s, ok := ref(tracking); ok {
				upstream = s
			} else {
				upstream = "unfetched"
			}
		}
	}
	if sha == "" {
		return nil
	}
	return stringify([]any{head, sha, upstream})
}
