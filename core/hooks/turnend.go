// Stop, SubagentStop and TaskCompleted: what a turn that ends says about itself (plugin/scripts/on-turn-end.mjs and
// completion-rules.mjs): R1 work no check passed on, R2 newly reachable commits, R4 what could not be looked at, W writes
// that changed nothing, N the evidence nudge, and the claims ledger row.
package hooks

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var (
	docExtensions = map[string]bool{".md": true, ".mdx": true, ".rst": true, ".txt": true}
	evidenceLimit = regexp.MustCompile(`(?i)\bEVIDENCE-LIMITED:\s+\S.{15,}`)
	interimWords  = regexp.MustCompile(`(?i)\b(?:blocked|not (?:done|complete)|need (?:your|a decision|approval)|waiting for|clarif(?:y|ication)|cannot continue|remaining work)\b`)
	disclosure1   = regexp.MustCompile(`(?i)\b(?:have ?n[o']t|has ?n[o']t|did ?n[o']t|not yet)\s+(?:\w+\s+){0,2}(?:run|ran|verified|verify|tested|checked)\b`)
	disclosure2   = regexp.MustCompile(`(?i)\b(?:can ?n[o']t|cannot|could ?n[o']t|unable to)\s+(?:\w+\s+){0,2}(?:verify|confirm|check|run|test)\b`)
	disclosure3   = regexp.MustCompile(`(?i)\bno (?:shell|working directory|way to (?:run|verify))\b`)
	taskFilePath  = regexp.MustCompile(`(^|[\\/])tasks[\\/][^\\/]+\.md$`)
	readmeName    = regexp.MustCompile(`(?i)readme\.md$`)
)

func docsOnly(paths []string) bool {
	if len(paths) == 0 {
		return false
	}
	for _, p := range paths {
		if !docExtensions[strings.ToLower(filepath.Ext(p))] {
			return false
		}
	}
	return true
}

func evidenceLimited(message any) bool {
	s, ok := message.(string)
	return ok && evidenceLimit.MatchString(s)
}

func interimResponse(message any) bool {
	s, ok := message.(string)
	return ok && interimWords.MatchString(s)
}

func unverifiedDisclosure(message any) bool {
	s, ok := message.(string)
	return ok && (disclosure1.MatchString(s) || disclosure2.MatchString(s) || disclosure3.MatchString(s))
}

func completionClaim(message any) string {
	if _, ok := message.(string); !ok {
		return "unavailable"
	}
	if evidenceLimited(message) {
		return "limited"
	}
	if interimResponse(message) || unverifiedDisclosure(message) {
		return "hedged"
	}
	return "none"
}

func (h *hookRun) recordClaim(claim, evidence string, mutations int) {
	home := os.Getenv("CLAUDE_PLUGIN_DATA")
	if home == "" {
		h.say("[quality-harness] CLAUDE_PLUGIN_DATA is not set, so this completion " +
			"event was NOT recorded. No false-success rate can count it. This is a note about the " +
			"environment, not a finding about your work.\n")
		return
	}
	row := O("at", isoNow(), "event", h.input.Get("hook_event_name"), "cwd", stringOrNull(h.input.Get("cwd")),
		"session", stringOrNull(h.input.Get("session_id")), "claim", claim, "phrase", nil, "evidence", evidence,
		"mutations", float64(mutations), "version", "events/1")
	if err := os.MkdirAll(home, 0o777); err != nil || !appendLine(filepath.Join(home, "claims.jsonl"), stringify(row)+"\n") {
		h.say("[quality-harness] could not append to the claims ledger (EACCES); this completion event is not counted.\n")
	}
}

func evidenceNudge(cwd string, changed []string) string {
	if nearestExistingDirectory(resolvePath(cwd)) == "" {
		return ""
	}
	tasks := []string{}
	for _, c := range changed {
		if filepath.IsAbs(c) && taskFilePath.MatchString(c) && !readmeName.MatchString(c) && exists(c) {
			tasks = append(tasks, c)
		}
	}
	if len(tasks) == 0 {
		return ""
	}
	which := "task files"
	if len(tasks) == 1 {
		which = "a task file"
	}
	return "Your check passed with " + which + " edited. " +
		"Record it where the corpus can verify it: `adr-verify " + tasks[0] + "` appends a " +
		"tool-written Verification Log entry (exit code plus an acceptance digest). " +
		"adr-lint will not accept a `done` status without one."
}

// writesThatChangedNothing is ADR-108 T3: paths this turn wrote that git could see, when the tree observed at its end is the
// observation taken before the first of them.
func writesThatChangedNothing(log Log, ended *recorded, root string) []string {
	if ended == nil {
		return nil
	}
	endedEvent := strOr(ended.event())
	opener := map[string]string{"turn.ended": "turn.ended", "subagent.ended": "subagent.started"}[endedEvent]
	if opener == "" || root == "" || !isTrue(get(ended.observation(), "ok")) || logIncomplete(log) {
		return nil
	}
	agent := ended.entry.Get("agentId")
	ofAgent := func(e any) bool { return strict(get(e, "agentId"), agent) }
	at := -1
	for i, e := range log.E {
		if strict(get(e, "event"), endedEvent) && ofAgent(e) {
			at = i
		}
	}
	from := -1
	for i, e := range log.E {
		if i < at && strict(get(e, "event"), opener) && ofAgent(e) {
			from = i
		}
	}
	if at < 0 || (opener == "subagent.started" && from < 0) {
		return nil
	}
	writes := []int{}
	for i := from + 1; i < at; i++ {
		e := log.E[i]
		// Only a path the observation can contain: inside the work tree and not under the git directory (`.git/config`
		// hashes and is not ignored, yet a change to it leaves tree, index and HEAD equal).
		p, isPath := get(e, "path").(string)
		inTree := false
		if isPath {
			rel := relPath(root, p)
			inTree = rel != "" && !strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)
			for _, part := range pathSplit.Split(rel, -1) {
				inTree = inTree && part != ".git"
			}
		}
		if strict(get(e, "event"), "file.written") && isTrue(get(e, "observable")) && inTree {
			writes = append(writes, i)
		}
	}
	if len(writes) == 0 {
		return nil
	}
	var before any
	for i := 0; i < writes[0]; i++ {
		if isTrue(dig(log.E[i], "observation", "ok")) {
			before = log.E[i]
		}
	}
	if !sameObservation(get(before, "observation"), ended.observation()) {
		return nil
	}
	out := []string{}
	seen := map[string]bool{}
	for _, i := range writes {
		rel := relPath(root, strOr(get(log.E[i], "path")))
		if !seen[rel] {
			seen[rel] = true
			out = append(out, rel)
		}
	}
	return out
}

type completionFacts struct {
	log             Log
	observation     any
	check           string
	root            string
	baseline        any
	writes          []any
	status          lines
	commits         commitList
	unchangedWrites []string
	turnEnd         string
	unstartable     bool
	origin          string
	cwd             string
	sentence        func() string
	baselineVerdict string
	generation      int
}

func (h *hookRun) completionFacts(ended *recorded) *completionFacts {
	id, ok := h.session.(string)
	if ended == nil || !ok || id == "" {
		return nil
	}
	cwd := h.cwd
	log := readEvents(cwd, h.session)
	observation := ended.observation()
	origin := checkCommandOrigin(cwd, nil)
	check := origin.command
	// ADR-113 T2: a declaration that cannot be read is a check nobody can pass, not a project that named none.
	if check == "" && (origin.origin == "refused" || origin.origin == "unreadable") {
		check = origin.origin
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	found := lookup{reason: "no directory"}
	if directory != "" {
		found = gitRepositoryLookup(directory)
	}
	root := ""
	if found.ok {
		root = found.root
	}
	f := &completionFacts{log: log, observation: observation, check: check, origin: origin.origin, root: root, cwd: cwd,
		baseline: get(sessionBaseline(log.E), "observation"), writes: unobservableWrites(log, root), generation: sessionGeneration(id)}
	// ADR-111 T3: the verdict of the check taken on the tree this session began with, from its own ledger.
	if root != "" && isTrue(get(f.baseline, "ok")) && check != "" && check != "refused" {
		f.baselineVerdict = baselineFor(root, get(f.baseline, "tree"), check)
	}
	switch {
	case !isTrue(get(observation, "ok")):
		f.status = lines{list: []string{}}
		f.commits = commitList{list: []*commit{}}
	case !found.ok:
		f.status = lines{list: []string{}, failed: true, why: found.reason}
		f.commits = commitList{list: []*commit{}, failed: true, why: found.reason}
	default:
		f.status = statusPaths(root)
		f.commits = sessionCommits(log.E, root, get(observation, "head"))
	}
	fastPassed := map[string]bool{}
	for _, c := range f.commits.list {
		if _, ok := fastPassed[c.tree]; !ok {
			fastPassed[c.tree] = root != "" && latestFastPass(cwd, c.tree, root) != nil
		}
		c.fastPassed = fastPassed[c.tree]
	}
	// ADR-120 T9: a commit is asked about with its own code tree, so a pass reaches it only through the code it holds.
	if list, ok := proseList(get(observation, "prose")); ok && len(list) > 0 && root != "" {
		for _, c := range f.commits.list {
			if checkStanding(log, c.tree, nil) != "passed" {
				c.codeTree = codeTreeOf(root, c.tree, list)
			}
		}
	}
	f.unchangedWrites = writesThatChangedNothing(log, ended, root)
	place := root
	if place == "" {
		place = resolvePath(cwd)
	}
	f.turnEnd = turnEndSetting(place)
	// ADR-120 T11: whether a declared check's first program can start here, probed without running the check.
	f.unstartable = origin.origin == "declared" && !checkCanStart(origin.command, place, os.LookupEnv, runtime.GOOS)
	var sentence *string
	f.sentence = func() string {
		if sentence == nil {
			s := runTheCheckSentence(cwd)
			sentence = &s
		}
		return *sentence
	}
	return f
}

// carryOf is a tree's carry for a pass (ADR-120 T9): nil unless the observation carries the list its code tree was taken under.
func (f *completionFacts) carryOf(codeTree any) *carry {
	return carryFor(f.log, f.root, codeTree, get(f.observation, "prose"))
}

func ledgerEvidence(f *completionFacts) string {
	observation := f.observation
	if !isTrue(get(observation, "ok")) {
		return "could-not-look"
	}
	if f.commits.failed || f.status.failed {
		return "could-not-look"
	}
	if logIncomplete(f.log) {
		return "could-not-look"
	}
	if f.check == "" {
		return "no-check"
	}
	tree := get(observation, "tree")
	treeUnchecked := checkStanding(f.log, tree, f.carryOf(get(observation, "codeTree"))) != "passed" && (!isTrue(get(f.baseline, "ok")) || !strict(tree, get(f.baseline, "tree")))
	if treeUnchecked || len(f.writes) > 0 {
		return "unverified"
	}
	for _, c := range f.commits.list {
		if checkStanding(f.log, c.tree, f.carryOf(c.codeTree)) != "passed" {
			return "unverified"
		}
	}
	return "verified"
}

func unseenPathNote(count int) string {
	if count == 0 {
		return ""
	}
	if count == 1 {
		return " 1 path written outside this repository is not named here."
	}
	return fmt.Sprintf(" %d paths written outside this repository are not named here.", count)
}

var couldNotStart = map[string][2]string{
	"check.unstarted": {"did not start", "unstarted"},
	"check.timeout":   {"timed out", "timeout"},
	"check.unproven":  {"could not be proven to have run", "unproven"},
}

func couldNotStartOpening(checkEvent string) string {
	named, ok := couldNotStart[checkEvent]
	if !ok {
		return "the latest `qh-check` on this turn's work could not observe it (it timed out, did not start, or its observation failed), so it is not known to be checked."
	}
	return "the latest `qh-check` on this turn's work could not observe it: it " + named[0] + " (" + named[1] + "), so it is not known to be checked. Report it as EVIDENCE-LIMITED: <what it printed> in your final message and do not run it again on this tree; " +
		"if it cannot start on an unmodified tree the finding is about this machine, and declaring the real command as check in .quality-harness.json is the fix."
}

type reasonFlags struct {
	logTorn         bool
	tornWords       string
	orderUnknown    bool
	couldNotLook    bool
	checkEvent      string
	baselineVerdict string
	treeMoved       bool
}

func uncheckedWorkReason(sentence string, paths []string, outside int, commits []*commit, fl reasonFlags) string {
	shown := paths[:min(8, len(paths))]
	held := []string{}
	for _, c := range commits[:min(3, len(commits))] {
		held = append(held, "`"+truncateUTF16([]rune(c.sha), 8)+"` "+c.subject)
	}
	heldText := strings.Join(held, ", ")
	listed := ""
	switch {
	case len(paths) > 0:
		listed = "Changed paths: " + strings.Join(shown, ", ")
		if len(paths) > len(shown) {
			listed += fmt.Sprintf(", and %d more", len(paths)-len(shown))
		}
		listed += "."
	case heldText != "" && fl.logTorn:
		listed = "Nothing is uncommitted: whether a `qh-check` passed on the tree at HEAD cannot be shown; it was committed as " + heldText + "."
	case heldText != "" && fl.orderUnknown:
		listed = "Nothing is uncommitted: which check ran last on the tree at HEAD could not be established; it was committed as " + heldText + "."
	case heldText != "" && fl.couldNotLook:
		listed = "Nothing is uncommitted: the latest `qh-check` on the tree at HEAD could not observe it; it was committed as " + heldText + "."
	case heldText != "":
		listed = "Nothing is uncommitted: what no `qh-check` has passed on is the tree at HEAD, committed as " + heldText + "."
	default:
		listed = "Git reports no changed path in the working tree."
	}
	opening := ""
	switch {
	case fl.logTorn:
		words := fl.tornWords
		if words == "" {
			words = "the session log"
		}
		opening = "this turn ends with work whose check state is unknown — " + words + " could not be read whole, " +
			"so whether `qh-check` succeeded on it cannot be shown."
	case fl.orderUnknown:
		opening = "which check ran last on this turn's work could not be established, so it is not known to be checked."
	case fl.couldNotLook && fl.treeMoved:
		// BACKLOG §383: a run the tree changed under is not one that could not start, so it is asked for again.
		opening = "the latest `qh-check` on this turn's work proves nothing about it: the tree changed while it ran (its trees before and after differ), so run it again once the tree holds still."
	case fl.couldNotLook:
		opening = couldNotStartOpening(fl.checkEvent)
	case fl.checkEvent == "check.failed":
		// ADR-111 T2: a red check said as "no qh-check has passed" read like no check at all.
		opening = "the last `qh-check` on this turn's work failed, so a done claim now contradicts it; fix what fails, or say in your final message that it fails and why."
		switch fl.baselineVerdict {
		case "passed":
			opening += " It passed on the tree this session began with and fails now: this change broke it."
		case "failed":
			opening += " It was already red on the tree this session began with, so this red says nothing about the change; compare what fails, or declare a check that is green here."
		}
	case len(paths) > 0 || heldText == "":
		opening = "this turn ends with work no `qh-check` has passed on."
	default:
		opening = "this turn ends on an unchecked tree."
	}
	tail := " " + sentence
	if _, known := couldNotStart[fl.checkEvent]; fl.couldNotLook && known && !fl.treeMoved {
		tail = ""
	}
	return "quality-harness: " + opening + " " + listed + unseenPathNote(outside) + tail
}

// noCheckText is what a turn end says where no check is declared or inferred and the tree changed (ADR-111 T2). It names no
// path: the working tree's dirt is not this turn's writes.
const noCheckText = "quality-harness: the tree changed since this session began, and no check is known here (none is " +
	"declared in a readable `.quality-harness.json`, and none could be inferred), so nothing verified the change. Declare the " +
	"project's check as `check` in `.quality-harness.json`, or say in your final message that the change is unverified."

const namedCommitLimit = 5

func uncheckedCommitsReason(sentence string, commits []*commit, fl reasonFlags) string {
	shown := commits[:min(namedCommitLimit, len(commits))]
	listedLines := []string{}
	for _, c := range shown {
		listedLines = append(listedLines, "  "+truncateUTF16([]rune(c.sha), 8)+" "+c.subject)
	}
	rest := ""
	if len(commits) > len(shown) {
		rest = fmt.Sprintf("\n  … and %d more.", len(commits)-len(shown))
	}
	n := len(commits)
	oneOrMany := func(one, many string) string {
		if n == 1 {
			return one
		}
		return many
	}
	head := ""
	switch {
	case fl.logTorn:
		words := fl.tornWords
		if words == "" {
			words = "this session's log"
		}
		head = "whether a `qh-check` passed on " + oneOrMany("a newly reachable commit", fmt.Sprintf("%d newly reachable commits", n)) + " " +
			"is UNKNOWN — " + words + " could not be read whole, and the record of a pass may be among what was lost:"
	case fl.orderUnknown:
		head = "which check ran last on " + oneOrMany("a newly reachable commit", fmt.Sprintf("at least one of %d newly reachable commits", n)) + " could not be established:"
	case fl.couldNotLook:
		head = "the latest `qh-check` on " + oneOrMany("a newly reachable commit", fmt.Sprintf("at least one of %d newly reachable commits", n)) + " could not observe it:"
	case n == 1:
		head = "a newly reachable commit is unchecked — no `qh-check` has passed on its tree:"
	default:
		head = fmt.Sprintf("%d newly reachable commits are unchecked — no `qh-check` has passed on their trees:", n)
	}
	state := "unchecked"
	if fl.logTorn || fl.orderUnknown || fl.couldNotLook {
		state = "not known to be checked"
	}
	return "quality-harness: " + head + "\n" + strings.Join(listedLines, "\n") + rest + "\nThis says they are reachable from HEAD and " +
		state + ", not that this session authored them. " + sentence
}

func couldNotLookReason(sentence, reason string) string {
	return "quality-harness: this repository could not be observed (" + reason + "), so its tree, index " +
		"and HEAD are unknown to this hook. That is a statement about what could be looked at, not " +
		"about your work (ADR-005). Edit and Write paths are still tracked, and `qh-check` still " +
		"records what it observed. " + sentence
}

var (
	shellOwnWords      = map[string]bool{".": true, ":": true, "[": true, "[[": true, "alias": true, "bg": true, "break": true, "cd": true, "command": true, "continue": true, "declare": true, "do": true, "done": true, "elif": true, "else": true, "esac": true, "eval": true, "exec": true, "exit": true, "export": true, "false": true, "fg": true, "fi": true, "for": true, "function": true, "getopts": true, "hash": true, "if": true, "in": true, "let": true, "local": true, "read": true, "readonly": true, "return": true, "select": true, "set": true, "shift": true, "source": true, "test": true, "then": true, "time": true, "times": true, "trap": true, "true": true, "type": true, "typeset": true, "ulimit": true, "umask": true, "unalias": true, "unset": true, "until": true, "wait": true, "while": true}
	checkScriptRunners = map[string]bool{"sh": true, "bash": true, "zsh": true, "dash": true, "ksh": true, "node": true, "python": true, "python3": true, "ruby": true, "perl": true}
	unreadWord         = regexp.MustCompile("[$`*?\\[\\]{}~\\\\]")
)

// setsPath is whether a command-local assignment names PATH or PATHEXT, the two that can move where its program is found; any other
// assignment leaves the program and its script to be read (the verification review of dcc4693a..d4f51888).
func setsPath(assignments []string) bool {
	for _, word := range assignments {
		if strings.HasPrefix(word, "PATH=") || strings.HasPrefix(word, "PATHEXT=") {
			return true
		}
	}
	return false
}

// checkCanStart is plugin/scripts/completion-rules.mjs's: whether a declared check's first program can start here, judged without
// running it (ADR-120 T11). Only what is certain says no; anything it does not read can start, as before.
func checkCanStart(command, directory string, lookup func(string) (string, bool), goos string) bool {
	commands, complete := shellWords(command)
	if !complete || len(commands) == 0 {
		return true
	}
	first := commands[0]
	if len(first.argv) == 0 || len(first.opens) > 0 || first.bangs > 0 || first.defines != "" || setsPath(first.assignments) {
		return true
	}
	program, rest := first.argv[0], first.argv[1:]
	if first.dynamicFlags[0] || unreadWord.MatchString(program) || shellOwnWords[program] {
		return true
	}
	here := func(name string) string {
		if filepath.IsAbs(name) {
			return name
		}
		return filepath.Join(directory, name)
	}
	if strings.Contains(program, "/") {
		_, err := os.Stat(here(program))
		return err == nil
	}
	pathValue, ok := lookup("PATH")
	if !ok {
		return true
	}
	windows := goos == "windows"
	names := []string{program}
	if windows {
		extensions, found := lookup("PATHEXT")
		if !found {
			extensions = ".COM;.EXE;.BAT;.CMD"
		}
		for _, extension := range strings.Split(extensions, ";") {
			if extension != "" {
				names = append(names, program+extension)
			}
		}
	}
	separator := ":"
	if windows {
		separator = ";"
	}
	onPath := false
	for _, dir := range strings.Split(pathValue, separator) {
		if dir == "" {
			dir = "."
		}
		for _, name := range names {
			if info, err := os.Stat(here(filepath.Join(dir, name))); err == nil && info.Mode().IsRegular() && (windows || info.Mode().Perm()&0o111 != 0) {
				onPath = true
			}
		}
	}
	if !onPath {
		return false
	}
	if checkScriptRunners[filepath.Base(program)] && len(rest) > 0 && !first.dynamicFlags[1] && !strings.HasPrefix(rest[0], "-") && !unreadWord.MatchString(rest[0]) {
		_, err := os.Stat(here(rest[0]))
		return err == nil
	}
	return true
}

func (h *hookRun) completionRules(ended *recorded) {
	f := h.completionFacts(ended)
	if f == nil {
		return
	}
	message := h.input.Get("last_assistant_message")
	evidence := ledgerEvidence(f)
	h.recordClaim(completionClaim(message), evidence, len(f.status.list)+len(f.writes))
	log := f.log
	// What was said in an earlier context of this session (before a compaction or a clear) is not said in this one.
	said := thisContext(log, f.generation)
	observation := f.observation
	channel := channelOf(h.event, f.turnEnd)
	recipient := h.recipient()
	// ADR-120 T6: R1 and R2 ask the agent to run the check, and a check the plugin inferred is not one the agent can be sure to
	// run. On an inferred check they are said to the user alone, so each is judged against, and delivered to, that audience.
	// ADR-120 T11: so is a declared check whose program cannot start here, and `"turnEnd": "continue"` keeps the old continuation.
	ruleChannel, audience := channel, ""
	if f.turnEnd != "continue" && (f.origin == "inferred" || f.unstartable) {
		ruleChannel, audience = "user", "user"
	}
	base := f.root
	if base == "" {
		base = resolvePath(f.cwd)
	}
	changed := []string{}
	for _, rel := range f.status.list {
		changed = append(changed, filepath.Join(base, rel))
	}
	for _, w := range f.writes {
		if p, ok := get(w, "path").(string); ok {
			changed = append(changed, p)
		}
	}
	quiet := (docsOnly(changed) && evidenceLimited(message)) || (h.event == "Stop" && interimResponse(message))
	// ADR-111 T2: where no check is known, a changed tree is said once per tree, when the start was observed in a log read whole.
	if f.check == "" {
		tree := get(observation, "tree")
		moved := isTrue(get(observation, "ok")) && isTrue(get(f.baseline, "ok")) && !logIncomplete(log) && !strict(tree, get(f.baseline, "tree"))
		if moved && !quiet && !emittedFor(said, "R5", tree, channel, recipient) {
			h.queue(action{rule: "R5", key: tree, text: noCheckText})
		}
		return
	}
	revision := revisionFor(log, observation)
	observed := isTrue(get(observation, "ok"))
	tree := get(observation, "tree")
	treeCarry := f.carryOf(get(observation, "codeTree"))
	treeUnchecked := observed && checkStanding(log, tree, treeCarry) != "passed" && (!isTrue(get(f.baseline, "ok")) || !strict(tree, get(f.baseline, "tree")))
	if !quiet && ((treeUnchecked && !namedByPublish(said, tree, revision)) || len(f.writes) > 0) {
		treeKey := "unobserved"
		if observed {
			treeKey = jsString(tree)
		}
		key := fmt.Sprintf("%s:%d:%d", treeKey, revision, len(f.writes))
		if !emittedFor(said, "R1", key, ruleChannel, recipient) {
			speaksFor := []*commit{}
			for _, c := range f.commits.list {
				if observed && strict(c.tree, tree) {
					speaksFor = append(speaksFor, c)
				}
			}
			var latest any
			checkEvent := ""
			if observed {
				latest = latestCheckFor(log, tree, treeCarry)
				checkEvent = strOr(get(latest, "event"))
			}
			// ADR-111 T3: the baseline speaks only for a red run of the same command whose tree held still through it and is this tree.
			baselineVerdict := ""
			if checkEvent == "check.failed" && strict(get(latest, "command"), f.check) &&
				strict(dig(latest, "before", "tree"), tree) && strict(dig(latest, "after", "tree"), tree) {
				baselineVerdict = f.baselineVerdict
			}
			before, beforeIsString := dig(latest, "before", "tree").(string)
			after, afterIsString := dig(latest, "after", "tree").(string)
			h.queue(action{rule: "R1", key: key, audience: audience, text: uncheckedWorkReason(f.sentence(), f.status.list, len(f.writes), speaksFor, reasonFlags{
				logTorn: logIncomplete(log), tornWords: tornRecord(log, ""),
				orderUnknown: observed && checkStanding(log, tree, treeCarry) == "unresolved",
				couldNotLook: observed && checkStanding(log, tree, treeCarry) == "could-not-look", checkEvent: checkEvent,
				baselineVerdict: baselineVerdict, treeMoved: beforeIsString && afterIsString && before != after,
			})})
		}
	}
	unchecked := []*commit{}
	for _, c := range f.commits.list {
		if c.fastPassed || checkStanding(log, c.tree, f.carryOf(c.codeTree)) == "passed" || (observed && strict(c.tree, tree)) {
			continue
		}
		commitRevision := checkRevision(log, c.tree)
		if namedByPublish(said, c.tree, commitRevision) {
			continue
		}
		if namedByReview(said, fmt.Sprintf("%s:%d", c.sha, commitRevision), ruleChannel, recipient) {
			continue
		}
		unchecked = append(unchecked, c)
	}
	if len(unchecked) > 0 {
		keys := []any{}
		keyStrings := []string{}
		orderUnknown, couldNotLook := false, false
		for _, c := range unchecked {
			k := fmt.Sprintf("%s:%d", c.sha, checkRevision(log, c.tree))
			keys = append(keys, k)
			keyStrings = append(keyStrings, k)
			standing := checkStanding(log, c.tree, f.carryOf(c.codeTree))
			orderUnknown = orderUnknown || standing == "unresolved"
			couldNotLook = couldNotLook || standing == "could-not-look"
		}
		h.queue(action{rule: "R2", key: strings.Join(keyStrings, " "), detail: O("commits", keys), audience: audience,
			text: uncheckedCommitsReason(f.sentence(), unchecked, reasonFlags{logTorn: logIncomplete(log), tornWords: tornRecord(log, ""), orderUnknown: orderUnknown, couldNotLook: couldNotLook})})
	}
	if !observed || f.status.failed || f.commits.failed || logIncomplete(log) {
		place := f.root
		if place == "" {
			place = resolvePath(f.cwd)
		}
		why := ""
		switch {
		case !observed:
			why = "no reason was recorded"
			if r := get(observation, "reason"); !nullish(r) {
				why = jsString(r)
			}
		case logIncomplete(log):
			why = tornRecord(log, "this session’s event log") + " could not be read whole — at least one record is torn or unreadable"
		default:
			why = f.status.why
			if why == "" {
				why = f.commits.why
			}
			if why == "" {
				why = "a git query failed without saying why"
			}
		}
		// Once per place and reason in this context (ADR-122 T3): a second reason at the same place is its own finding.
		key := canonical(place) + ":" + why
		if !emittedFor(said, "R4", key, channel, recipient) {
			h.queue(action{rule: "R4", key: key, text: couldNotLookReason(f.sentence(), why)})
		}
	}
	if len(f.unchangedWrites) > 0 {
		key := "W:" + jsString(tree)
		if !emittedFor(said, "W", key, channel, recipient) {
			h.queue(action{rule: "W", key: key, text: "quality-harness: this turn wrote " + strings.Join(f.unchangedWrites, ", ") + " and the tree it wrote to did not change — an edit that matched nothing reports success everywhere but in the tree; read the file and apply the edit again, or say the write was a revert."})
		}
	}
	if observed && checkStanding(log, tree, treeCarry) == "passed" {
		if nudge := evidenceNudge(f.cwd, changed); nudge != "" && !emittedFor(said, "N", tree, channel, recipient) {
			h.queue(action{rule: "N", key: tree, text: nudge})
		}
	}
}

func (h *hookRun) onTurnEnd(rec *recorded) {
	if isTrue(h.input.Get("stop_hook_active")) || (h.event == "Stop" && hasBackgroundWork(h.input)) {
		return
	}
	if h.event == "SubagentStop" && readOnlyRole(h.input.Get("agent_type")) != "" {
		return
	}
	h.completionRules(rec)
	h.artifactRule(rec)
}
