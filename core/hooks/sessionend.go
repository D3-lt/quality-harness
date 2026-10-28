// PreCompact and SessionEnd (plugin/scripts/on-session-end.mjs), the facts both read (completion-rules.mjs observedFacts), the
// contract a subagent is handed (completion-rules.mjs subagentContract), and R3, what changed during a read-only role's run
// (publish-verdict.mjs reviewChangedState). SessionEnd runs here, inline: the core starts no detached process (ADR-110 Decision 4).
package hooks

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

func observedFacts(log Log, root string, observation any) facts {
	writes := unobservableWrites(log, root)
	baseline := get(sessionBaseline(log.E), "observation")
	status := lines{list: []string{}}
	if isTrue(get(observation, "ok")) {
		status = statusPaths(root)
	}
	checkEvents := []any{}
	for _, e := range log.E {
		if isCheckEvent(e) {
			checkEvents = append(checkEvents, e)
		}
	}
	check := latestOf(checkEvents, true)
	tree := get(observation, "tree")
	treeCarry := carryFor(log, root, get(observation, "codeTree"), get(observation, "prose"))
	treeUnchecked := isTrue(get(observation, "ok")) && checkStanding(log, tree, treeCarry) != "passed" &&
		(!isTrue(get(baseline, "ok")) || !strict(tree, get(baseline, "tree")))
	var why any
	switch {
	case !isTrue(get(observation, "ok")):
		why = "the working tree could not be observed"
	case status.failed:
		why = "git could not list the working tree"
	case logIncomplete(log):
		why = tornRecord(log, "the session log") + " could not be read whole"
	}
	files := []string{}
	if root != "" {
		for _, rel := range status.list {
			files = append(files, filepath.Join(root, rel))
		}
	}
	var treeOrder any
	if isTrue(get(observation, "ok")) {
		treeOrder = checkStanding(log, tree, treeCarry)
	}
	latest := latestCheckFor(log, tree, treeCarry)
	var lastCheck *Obj
	if check != nil && !logIncomplete(log) {
		lastCheck = O("command", orNull(get(check, "command")), "verdict", strings.TrimPrefix(strOr(get(check, "event")), "check."))
	}
	return facts{
		files: files, other: len(writes), pending: treeUnchecked || len(writes) > 0,
		checked: checkStanding(log, tree, treeCarry) == "passed", treeOrder: treeOrder,
		checkOrigin: orNull(get(latest, "origin")), checkCommand: orNull(get(latest, "command")),
		observed: why == nil, whole: !logIncomplete(log), why: why,
		late: isTrue(get(sessionBaseline(log.E), "late")), lastCheck: lastCheck,
	}
}

func (h *hookRun) onSessionEnd(rec *recorded) {
	cwd := h.cwd
	directory := nearestExistingDirectory(resolvePath(cwd))
	repositoryRoot := ""
	if directory != "" {
		repositoryRoot = gitRepositoryRoot(directory)
	}
	root := repositoryRoot
	if root == "" {
		root = directory
	}
	if root == "" {
		root = cwd
	}
	f := observedFacts(readEvents(cwd, h.session), repositoryRoot, rec.observation())
	if h.event == "PreCompact" {
		if id, ok := h.session.(string); ok && id != "" {
			note := sessionStateNote(f, cwd, root, time.Now()).obj()
			var compaction any
			if rec != nil {
				compaction = orNull(rec.entry.Get("compactionId"))
			}
			note.Set("compaction", compaction)
			replaceSessionNote(h.session, note)
		}
		h.artifactRule(rec)
		return
	}
	home := os.Getenv("CLAUDE_PLUGIN_DATA")
	if home == "" {
		h.say("[quality-harness] CLAUDE_PLUGIN_DATA is not set, so this session's end was NOT recorded.\n")
		return
	}
	note := sessionStateNote(f, cwd, root, time.Now())
	var unknown any
	if !f.observed {
		unknown = "the working tree could not be observed"
		if s, ok := f.why.(string); ok {
			unknown = s
		}
	} else if f.late && len(note.files) == 0 && note.other == 0 && !f.pending {
		unknown = "it was watched only from partway through, and nothing changed after that; what happened before is not known"
	}
	var lastVerdict any
	if f.lastCheck != nil {
		lastVerdict = orNull(f.lastCheck.Get("verdict"))
	}
	row := O("at", note.at, "session", stringOrNull(h.session), "cwd", cwd, "location", locationKey(root),
		"reason", orNull(h.input.Get("reason")), "status", note.status, "unknown", unknown, "files", note.files,
		"other", float64(note.other), "lastVerdict", lastVerdict)
	if err := os.MkdirAll(home, 0o777); err != nil || !appendLine(filepath.Join(home, "sessions.jsonl"), stringify(row)+"\n") {
		h.say("[quality-harness] could not append to the sessions ledger (EACCES).\n")
	}
}

var readOnlyKind = regexp.MustCompile(`(explore|plan|research|review|audit|scout|memory)`)

func declaredCapability(input *Obj) string {
	model := jsTrim(strOr(input.Get("agent_model")))
	effort := jsTrim(strOr(input.Get("agent_effort")))
	if model == "" && effort == "" {
		return ""
	}
	asked := []string{}
	if model != "" {
		asked = append(asked, "model "+model)
	}
	if effort != "" {
		asked = append(asked, "effort "+effort)
	}
	return "Your delegation asked for " + strings.Join(asked, ", ") + "; if that does not match the work you are " +
		"given, say so in what you return rather than silently doing more or less."
}

func subagentContract(input *Obj) string {
	kind := "delegated"
	if v := input.Get("agent_type"); !nullish(v) {
		kind = jsString(v)
	}
	kind = strings.ToLower(kind)
	readOnly := readOnlyKind.MatchString(kind)
	roleLine := "If edits are authorized, make the smallest coherent diff within the owned scope."
	if readOnly {
		roleLine = "Treat this role as read-only unless the delegation explicitly authorizes edits."
	}
	parts := []string{
		"QUALITY CONTRACT — you are a leaf role, not the lifecycle coordinator.",
		"Do not invoke /quality-harness:work, /quality-harness:consensus, /quality-harness:review-ring, /quality-harness:quality-cycle, or spawn another agent unless your delegation explicitly assigns coordination.",
		"Preserve the supplied scope and non-goals; invent no features, configuration, fallbacks, dependencies, or speculative abstractions.",
		"DRY duplicated knowledge, not similar syntax; use SOLID only where a demonstrated boundary needs it.",
		roleLine,
	}
	if !readOnly {
		parts = append(parts, "Read every site you will touch before the first edit, make the edits as one batch, and check that each landed: an edit that matched nothing is a failure (the execution skill's \"Read and edit in batches\").")
	}
	parts = append(parts, "`qh-check` optionally records a run (ADR-130); report the exact commands you ran and their results.", "Return touched files, exact executed evidence, and remaining risk or uncertainty.")
	if capability := declaredCapability(input); capability != "" {
		parts = append(parts, capability)
	}
	return strings.Join(parts, " ")
}

// reviewChangedState is R3: a read-only role's run bracketed by its start and end observations, paired by agent id.
func (h *hookRun) reviewChangedState(rec *recorded) {
	role := readOnlyRole(h.input.Get("agent_type"))
	agent, ok := h.input.Get("agent_id").(string)
	if role == "" || !strict(rec.event(), "subagent.ended") || !ok {
		return
	}
	log := readEvents(h.cwd, h.session)
	var started any
	for _, e := range log.E {
		if strict(get(e, "event"), "subagent.started") && strict(get(e, "agentId"), agent) {
			started = e
		}
	}
	before := get(started, "observation")
	after := rec.observation()
	emitted := func(match func(any) bool) bool {
		for _, e := range log.E {
			if strict(get(e, "event"), "action.emitted") && strict(get(e, "rule"), "R3") && match(e) {
				return true
			}
		}
		return false
	}
	reasonOf := func(o any) string {
		if r := get(o, "reason"); !nullish(r) {
			return jsString(r)
		}
		return "no reason was recorded"
	}
	if !isTrue(get(before, "ok")) || !isTrue(get(after, "ok")) {
		told := func(e any) bool {
			return strict(dig(e, "detail", "kind"), "unobserved") && strict(dig(e, "detail", "agent"), agent)
		}
		if !emitted(told) {
			why := ""
			switch {
			case started == nil && !log.Complete:
				why = "this session's event log could not be read whole, and the record of where that run began may be among what was lost"
			case started == nil:
				why = "where that run began was never recorded"
			case !isTrue(get(before, "ok")):
				why = "the repository could not be observed when it began (" + reasonOf(before) + ")"
			default:
				why = "the repository could not be observed when it ended (" + reasonOf(after) + ")"
			}
			h.queue(action{rule: "R3", key: agent + ":unobserved", detail: O("kind", "unobserved", "agent", agent),
				text: fmt.Sprintf("quality-harness: whether the repository changed during the %s run (agent %s) is unknown — %s. That is a statement about what could be looked at, not about the review (ADR-005).", role, agent, why)})
		}
		return
	}
	if sameObservation(before, after) {
		return
	}
	if emitted(func(e any) bool {
		return strict(get(e, "key"), agent) && !strict(dig(e, "detail", "kind"), "unobserved")
	}) {
		return
	}
	directory := nearestExistingDirectory(resolvePath(h.cwd))
	found := lookup{reason: "no directory"}
	if directory != "" {
		found = gitRepositoryLookup(directory)
	}
	if !found.ok {
		rootKey := agent + ":root"
		if !emitted(func(e any) bool { return strict(get(e, "key"), rootKey) }) {
			h.queue(action{rule: "R3", key: rootKey, text: fmt.Sprintf("quality-harness: whether the repository changed during the %s run (agent %s) is unknown — the repository root could not be read (%s). That is a statement about what could be looked at, not about the review (ADR-005).", role, agent, found.reason)})
		}
		return
	}
	root := found.root
	if root == "" {
		return
	}
	status := gitLines(root, []string{"-c", "core.quotePath=false", "status", "--porcelain"}, false)
	staged := gitLines(root, []string{"-c", "core.quotePath=false", "diff", "--cached", "--name-only"}, false)
	commits := lines{}
	bh, ah := get(before, "head"), get(after, "head")
	if truthy(bh) && truthy(ah) && !strict(bh, ah) {
		commits = gitLines(root, []string{"rev-list", "--oneline", jsString(bh) + ".." + jsString(ah)}, false)
	}
	indent := func(ls []string) string {
		out := make([]string, len(ls))
		for i, l := range ls {
			out[i] = "  " + l
		}
		return strings.Join(out, "\n")
	}
	parts := []string{fmt.Sprintf("quality-harness: the repository's state changed during the %s run (agent %s). This says what changed during that run, not who changed it.", role, agent)}
	if len(status.list) > 0 {
		parts = append(parts, "Working tree now:\n"+indent(status.list))
	}
	if len(staged.list) > 0 {
		parts = append(parts, "Staged now:\n"+indent(staged.list))
	}
	if len(commits.list) > 0 {
		parts = append(parts, "New commits:\n"+indent(commits.list))
	}
	h.queue(action{rule: "R3", key: agent, text: strings.Join(parts, "\n")})
}
