// PreToolUse (plugin/scripts/on-pre-tool-use.mjs): the reviewer guard for a role spawned read-only, the decisions that govern
// a file about to be edited, and rule P, the verdict on a command that names commit or push (publish-verdict.mjs, ADR-061,
// ADR-066, ADR-081, ADR-086, ADR-104). A refusal needs a proven invocation; a mention is only ever warned about.
package hooks

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

func environNames() []string {
	names := []string{}
	for _, kv := range os.Environ() {
		name, _, _ := strings.Cut(kv, "=")
		names = append(names, name)
	}
	return names
}

func containsCommitOrPush(command any) bool {
	text, ok := command.(string)
	if !ok {
		return false
	}
	_, found := publishCommandIn(text)
	return found
}

func mentionBefore(r rune) bool { return isASCIIWord(r) || r == '.' || r == '-' }
func mentionAfter(r rune) bool  { return isASCIIWord(r) || r == '-' }

// publishMention is /(?<![A-Za-z0-9_.-])(?:commit|push)(?![A-Za-z0-9_-])/.
func publishMention(text string) bool {
	return boundedWord(text, "commit", mentionBefore, mentionAfter) || boundedWord(text, "push", mentionBefore, mentionAfter)
}

var (
	base64Breaks   = regexp.MustCompile(`[^A-Za-z0-9+/]+`)
	backtickEscape = regexp.MustCompile("(?s)`(.)")
)

// stashPush is publish-verdict.mjs's STASH_PUSH: `git stash push`, options before the subcommand allowed, is a stash and no push.
var stashPush = regexp.MustCompile(`(^|[^A-Za-z0-9_.-])git(?:[ \t]+(?:-[Cc][ \t]+[^ \t\r\n]+|--[A-Za-z][A-Za-z-]*(?:=[^ \t\r\n]+)?|-[A-Za-z]))*[ \t]+stash[ \t]+push($|[^A-Za-z0-9_-])`)

// withoutStashPush repeats the replacement until nothing changes, as the Node twin does.
func withoutStashPush(text string) string {
	for {
		next := stashPush.ReplaceAllString(text, "${1}git stash${2}")
		if next == text {
			return text
		}
		text = next
	}
}

func mentionsCommitOrPush(given any) bool {
	text, ok := given.(string)
	if !ok {
		return false
	}
	command := withoutSinkBodies(text)
	candidates := []string{command, backtickEscape.ReplaceAllString(command, "$1")}
	for _, word := range base64Breaks.Split(command, -1) {
		if utf16Len(word) >= 8 {
			candidates = append(candidates, decodedPowerShell(word))
		}
	}
	for _, c := range candidates {
		if publishMention(withoutStashPush(c)) {
			return true
		}
	}
	return false
}

func readOnlyVerdict(input *Obj) string {
	tool := strOr(input.Get("tool_name"))
	if mutationTools[tool] {
		return "This role is read-only: " + tool + " is not available to it. Report the change you would make; do not make it."
	}
	if !shellTools[tool] || !containsCommitOrPush(dig(input, "tool_input", "command")) {
		return ""
	}
	return "This role is read-only: a command naming commit or push is not available to it. Name the commit you would make in the review. Any other change you make is reported when you finish."
}

type verdict struct {
	deny   bool
	key    string
	detail *Obj
	text   string
}

type publishFactsRun struct {
	cwd, session string
	sessionAny   any
	observation  any
	found        *lookup
	origin       *checkOrigin
	setting      *publishSettingResult
	ledger       *boundLog
	caveat       *string
	fastPasses   map[string]*fastPass
}

func (f *publishFactsRun) lookup() lookup {
	if f.found == nil {
		place := nearestExistingDirectory(resolvePath(f.cwd))
		l := lookup{reason: "the working directory does not exist"}
		if place != "" {
			l = gitRepositoryLookup(place)
		}
		f.found = &l
	}
	return *f.found
}

func (f *publishFactsRun) checkOrigin() checkOrigin {
	if f.origin == nil {
		l := f.lookup()
		o := checkCommandOrigin(f.cwd, &l)
		f.origin = &o
	}
	return *f.origin
}

func (f *publishFactsRun) publishSetting() publishSettingResult {
	if f.setting == nil {
		l := f.lookup()
		s := publishSetting(f.cwd, &l)
		f.setting = &s
	}
	return *f.setting
}

func (f *publishFactsRun) boundLedger() boundLog {
	if f.ledger == nil {
		b := ledgerBoundLog(f.cwd, readEvents(f.cwd, f.sessionAny))
		f.ledger = &b
	}
	return *f.ledger
}

func (f *publishFactsRun) inferredCaveat() string {
	if f.caveat == nil {
		c := inferredCheckCaveat(f.cwd)
		f.caveat = &c
	}
	return *f.caveat
}

// carryOf is a tree's carry for a pass (ADR-120 T9): nil unless the observation carries the list its code tree was taken under.
func (f *publishFactsRun) carryOf(log Log, codeTree any) *carry {
	root := f.lookup().root
	if root == "" {
		root = f.cwd
	}
	return carryFor(log, root, codeTree, get(f.observation, "prose"))
}

func (f *publishFactsRun) fastPass(tree any) *fastPass {
	t := jsString(tree)
	if p, ok := f.fastPasses[t]; ok {
		return p
	}
	root := f.lookup().root
	if root == "" {
		root = f.cwd
	}
	p := latestFastPass(f.cwd, t, root)
	f.fastPasses[t] = p
	return p
}

// publishJudgement is rule P's decision over its facts and what the caller proved about the command; invoked "" is a mention.
func publishJudgement(f *publishFactsRun, invoked string, proven, commitOnly, stagesFirst bool) *verdict {
	origin := f.checkOrigin()
	if origin.command == "" && origin.origin != "refused" && origin.origin != "unproven" && origin.origin != "unreadable" {
		return nil
	}
	observation := f.observation
	if !isTrue(get(observation, "ok")) {
		reason := "no observation was made"
		if r := get(observation, "reason"); !nullish(r) {
			reason = jsString(r)
		}
		text := "quality-harness: whether this repository is checked is unknown — its working tree could not be observed (" + reason + ") — and the command "
		if proven {
			text += "about to run names commit or push (`" + invoked + "`). Nothing is refused on a state that could not be read. Run `qh-check` before publishing; on a slow host, QUALITY_HARNESS_OBSERVE_BUDGET_MS raises the 5s budget."
		} else {
			text += "about to run only mentions commit or push. Advisory; nothing is refused."
		}
		return &verdict{key: "unobserved:" + reason, detail: O("reason", reason), text: text + f.inferredCaveat()}
	}
	now := observation
	bound := f.boundLedger()
	log := bound.log
	if bound.torn {
		log = Log{E: append(append([]any{}, bound.log.E...), O("event", "check.source-unreadable")), Complete: bound.log.Complete}
	}
	baseline := get(sessionBaseline(log.E), "observation")
	if nullish(baseline) {
		hasStart := false
		for _, e := range log.E {
			if strict(get(e, "event"), "session.started") {
				hasStart = true
			}
		}
		if hasStart && lateBaselineAllowed(log, f.cwd, now) {
			baseline = now
		}
	}
	tree, index := get(now, "tree"), get(now, "index")
	treeStanding := checkStanding(log, tree, f.carryOf(log, get(now, "codeTree")))
	indexStanding := checkStanding(log, index, f.carryOf(log, get(now, "indexCodeTree")))
	treeUnchecked := treeStanding != "passed" && (!isTrue(get(baseline, "ok")) || !strict(tree, get(baseline, "tree")))
	indexUnchecked := indexStanding != "passed" && (!isTrue(get(baseline, "ok")) || !strict(index, get(baseline, "index")))
	revision := checkRevision(log, tree)
	key := fmt.Sprintf("%s:%s:%d", jsString(tree), jsString(index), revision)
	if logIncomplete(log) {
		key += ":unknown"
	}
	detail := func() *Obj { return O("tree", tree, "revision", float64(revision)) }
	if !treeUnchecked && !indexUnchecked {
		if !logIncomplete(log) {
			return nil
		}
		text := "quality-harness: " + tornRecord(log, "the session log") + " could not be read whole, so what `qh-check` recorded here cannot be shown. The command "
		if proven {
			text += "about to run names commit or push (`" + invoked + "`)"
		} else {
			text += "about to run only mentions commit or push"
		}
		text += " on a working tree and index unchanged since the session started, which need no check, so nothing is refused. While that record stays torn, a publish of changed work here is advice, never refused (ADR-061)."
		return &verdict{key: key, detail: detail(), text: text}
	}
	unordered := treeStanding == "unresolved"
	couldNotLook := treeStanding == "could-not-look"
	indexUnknown := indexStanding == "unresolved" || indexStanding == "could-not-look"
	setting := f.publishSetting()
	refusable := treeUnchecked && !logIncomplete(log) && !unordered && !couldNotLook && origin.origin != "unproven" && proven
	deny := refusable && !setting.warn
	if refusable && commitOnly {
		if fast := f.fastPass(tree); fast != nil {
			staged := ""
			if !strict(index, tree) {
				staged = " The staged index is not the tree the fast check ran on (a partial stage, or files the check saw that are not staged), so what this commit records was not itself checked."
			}
			return &verdict{key: fmt.Sprintf("%s:fast%d", key, fast.count), detail: detail(),
				text: "quality-harness: a fast check (`" + jsString(fast.command) + "`) passed on this tree, but the full check has not passed — this commit goes through, and a push will need `qh-check` to pass first (ADR-081)." + staged}
		}
	}
	var fastSeen *fastPass
	if treeUnchecked {
		fastSeen = f.fastPass(tree)
	}
	hinted := treeUnchecked && proven && fastSeen == nil && !logIncomplete(log) && !unordered && !couldNotLook &&
		origin.origin != "unproven" && origin.origin != "unreadable" && origin.origin != "refused" &&
		isUndefined(get(now, "prose")) && !proseHintTold(log, tree) && proseOnlySincePass(f.lookup().root, origin.command)
	opening := ""
	switch {
	case logIncomplete(log):
		opening = "quality-harness: whether this repository is checked is unknown — " + tornRecord(log, "the session log") + " could not be read whole, so whether `qh-check` succeeded on its current tree cannot be shown — and the command "
	case unordered:
		opening = "quality-harness: whether this repository is checked is unknown — the order of its check events could not be established — and the command "
	case couldNotLook:
		opening = "quality-harness: whether this repository is checked is unknown — the latest `qh-check` on its current tree could not observe it (it timed out, did not start, or its observation failed) — and the command "
	case origin.origin == "unproven":
		opening = "quality-harness: whether this repository is checked is unknown — the repository root could not be read — and the command "
	case origin.origin == "unreadable":
		opening = "quality-harness: this repository is unchecked — " + origin.problem + ", so no `qh-check` can pass here until it is fixed — and the command "
	case origin.origin == "refused":
		opening = "quality-harness: this repository is unchecked — the check declared in .quality-harness.json is a constant success and was refused — and the command "
	case !treeUnchecked && stagesFirst:
		opening = "quality-harness: the index this commit records is not known yet — the command stages files (`git add`, or the commit's own `-a`) before it commits, and the index was read before it runs — and the command "
	case !treeUnchecked && indexUnknown && treeStanding == "passed":
		opening = "quality-harness: the staged index is not known to be checked — `qh-check` passed on the working tree, but the index holds different content and whether a check passed on it cannot be established — and the command "
	case !treeUnchecked && treeStanding == "passed":
		opening = "quality-harness: the staged index is unchecked — `qh-check` passed on the working tree, but the index holds different content (a partial stage, or files the check saw that are not staged) — and the command "
	case !treeUnchecked && indexUnknown:
		opening = "quality-harness: the staged index is not known to be checked — the working tree is unchanged since the session started, but the index has moved and whether a `qh-check` passed on the staged content cannot be established — and the command "
	case !treeUnchecked:
		opening = "quality-harness: the staged index is unchecked — the working tree is unchanged since the session started, but the index has moved and no `qh-check` has passed on the staged content — and the command "
	case fastSeen != nil:
		opening = "quality-harness: this repository is not fully checked — a fast check (`" + jsString(fastSeen.command) + "`) passed on its current tree, but only a command proven to be one `git commit` may go through on a fast pass, this one is not proven to be one commit, and a push needs the full check (ADR-081) — and the command "
	default:
		opening = "quality-harness: this repository is unchecked — no `qh-check` has passed on its current tree — and the command "
	}
	text := opening
	if proven {
		text += "about to run names commit or push (`" + invoked + "`). Run `qh-check` first — it runs the declared check and records the pass this hook reads. This says what state the repository is in, not what the command publishes."
	} else {
		text += "about to run only mentions commit or push. Advisory; if it does publish, run `qh-check` first."
	}
	if bound.dropped > 0 {
		text += fmt.Sprintf(" %d check event(s) in this session's log name no `qh-check` record and were not counted.", bound.dropped)
	}
	text += f.inferredCaveat() + publishSettingNote(setting)
	final := detail()
	if hinted {
		text += proseSettingHint
		final.Set("proseHint", true)
	}
	return &verdict{deny: deny, key: key, detail: final, text: text}
}

// commonDirectory is the git directory a path's repository keeps, as git resolves it, after realpath, or "".
func commonDirectory(dir, cwd string) string {
	probe := run(10*time.Second, cwd, map[string]string{"GIT_OPTIONAL_LOCKS": "0"}, "", "git", "-C", dir, "rev-parse", "--path-format=absolute", "--git-common-dir")
	if probe.err != nil || probe.status != 0 {
		return ""
	}
	printed := strings.TrimSpace(probe.stdout)
	if printed == "" {
		return ""
	}
	real, err := filepath.EvalSymlinks(printed)
	if err != nil {
		return ""
	}
	return real
}

func (h *hookRun) publishUnchecked(rec *recorded) {
	event := rec.event()
	if !strict(event, "publish.requested") && !strict(event, "publish.mentioned") {
		return
	}
	command := dig(h.input, "tool_input", "command")
	text, _ := command.(string)
	invoked, proven := "", false
	if isString(command) {
		invoked, proven = publishCommandIn(text)
	}
	facts := &publishFactsRun{cwd: h.cwd, sessionAny: h.session, observation: rec.observation(), fastPasses: map[string]*fastPass{}}
	v := publishJudgement(facts, invoked, proven, commitOnlyCommand(command), stagesBeforeCommit(command))
	if v == nil {
		return
	}
	bash := strict(h.input.Get("tool_name"), "Bash")
	if v.deny && bash && leavesHookInPlace(command) && armedByGit(readEvents(h.cwd, h.session).E) {
		v = &verdict{key: v.key, detail: v.detail, text: v.text + " In this session git's own hook refuses it at the event (ADR-066), so this is advice."}
	}
	if v.deny && bash && freshRepositoryCommit(command) {
		v = &verdict{key: v.key + ":fresh", detail: v.detail,
			text: "quality-harness: this commit lands in a repository the same command creates in a fresh `mktemp -d` directory, so this checkout's unchecked state does not refuse it (ADR-086). If the commit was meant for this checkout, run `qh-check` first."}
	}
	if bash {
		if target := foreignCommitPath(command); target != "" {
			there := commonDirectory(target, h.cwd)
			here := ""
			if there != "" {
				here = commonDirectory(h.cwd, h.cwd)
			}
			if here != "" && there != here {
				named, _ := publishCommandIn(text)
				v = &verdict{key: v.key + ":foreign", detail: v.detail,
					text: "quality-harness: a commit into another repository is advised, not refused (ADR-104): the command about to run names commit or push (`" + named + "`), and it lands in a repository other than this checkout — git keeps it in a different git directory — so this checkout's state does not refuse it. If the commit was meant for this checkout, run `qh-check` first."}
			}
		}
	}
	key := v.key
	if !proven {
		key += ":mention"
	}
	if !v.deny {
		for _, e := range readEvents(h.cwd, h.session).E {
			if strict(get(e, "event"), "action.emitted") && strict(get(e, "rule"), "P") && strict(get(e, "key"), key) {
				return
			}
		}
	}
	h.queue(action{rule: "P", key: key, detail: v.detail, deny: v.deny, text: v.text})
}

// decisionContextFor hands over what has already been decided about the file a call is about to touch.
func decisionContextFor(input *Obj) string {
	cwd, ok := input.Get("cwd").(string)
	if !ok || !filepath.IsAbs(cwd) {
		cwd, _ = os.Getwd()
	}
	target := dig(input, "tool_input", "file_path")
	if nullish(target) {
		target = dig(input, "tool_input", "notebook_path")
	}
	t, ok := target.(string)
	if !ok || t == "" {
		return ""
	}
	resolved := canonical(resolveFrom(cwd, t))
	if alreadyMentionedThisSession(input.Get("session_id"), resolved) {
		return ""
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	found := lookup{reason: "no directory"}
	if directory != "" {
		found = gitRepositoryLookup(directory)
	}
	if directory != "" && !found.ok {
		return "could-not-look: the repository root could not be read, so which decisions govern this edit is unknown."
	}
	if directory == "" {
		return ""
	}
	root := found.root
	if root == "" {
		root = directory
	}
	context := decisionContext(resolved, canonical(root))
	if context == "" {
		return ""
	}
	if firstMentionThisSession(input.Get("session_id"), resolved) {
		return context
	}
	return ""
}

func (h *hookRun) onPreToolUse(rec *recorded) {
	input := h.input
	tool := strOr(input.Get("tool_name"))
	if role := readOnlyRole(input.Get("agent_type")); role != "" && (shellTools[tool] || mutationTools[tool]) {
		if reason := readOnlyVerdict(input); reason != "" {
			h.emitJSON(O("hookSpecificOutput", O("hookEventName", "PreToolUse", "permissionDecision", "deny",
				"permissionDecisionReason", "quality-harness reviewer guard ("+role+"): "+reason)))
			h.say("quality-harness reviewer guard: " + reason + "\n")
			return
		}
	}
	// ADR-117 T1: the third sanctioned refusal. The evidence in the state directory is written only by its tools.
	if ledger := ledgerWrite(input); ledger != "" {
		if ledgersWarn(h.cwd) {
			h.emitJSON(O("hookSpecificOutput", O("hookEventName", "PreToolUse", "additionalContext", ledgerWarning(ledger))))
			return
		}
		h.emitJSON(O("hookSpecificOutput", O("hookEventName", "PreToolUse", "permissionDecision", "deny",
			"permissionDecisionReason", ledgerRefusal(ledger))))
		h.say(ledgerRefusal(ledger) + "\n")
		return
	}
	if mutationTools[tool] {
		if context := decisionContextFor(input); context != "" {
			h.emitJSON(O("hookSpecificOutput", O("hookEventName", "PreToolUse", "additionalContext", context)))
		}
		return
	}
	if !shellTools[tool] || !mentionsCommitOrPush(dig(input, "tool_input", "command")) {
		return
	}
	h.publishUnchecked(rec)
	if strict(rec.event(), "publish.requested") {
		h.artifactRule(rec)
	}
}
