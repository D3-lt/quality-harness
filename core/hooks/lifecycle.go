// One hook event in, one composed answer out: plugin/scripts/lifecycle.mjs, hook-queue.mjs and hook-record.mjs. Every rule
// queues what it decides; deliver says it once, and records `action.emitted` only for what was said.
package hooks

import (
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type action struct {
	rule     string
	key      any
	detail   *Obj
	deny     bool
	text     string
	audience string // "user" marks a finding shown to the user alone: it does not continue a Stop (ADR-120 T6)
	marker   string // the said-per-context marker it carries into the agent's context (ADR-122)
}

// hookRun is one hook process: its input, the actions its rules queued and the one JSON object the older rules emit.
type hookRun struct {
	input   *Obj
	event   string
	cwd     string
	session any
	pending []action
	marks   []string // said-per-context markers to record once the output has left the process
	output  *Obj
	stdout  io.Writer
	stderr  io.Writer
}

func (h *hookRun) queue(a action) {
	// ADR-130: check standing is descriptive; it never demands a run or refuses publishing.
	if a.rule != "P" && a.rule != "R1" && a.rule != "R4" && a.rule != "R5" {
		h.pending = append(h.pending, a)
	}
}
func (h *hookRun) emitJSON(out *Obj) { h.output = out }
func (h *hookRun) say(text string)   { io.WriteString(h.stderr, text) }

// ADR-113 T2: mrw's MCP write is an edit like any other, to the reviewer guard and to the write record.
var mutationTools = map[string]bool{"Edit": true, "Write": true, "MultiEdit": true, "NotebookEdit": true, mrwWrite: true}

const mrwWrite = "mcp__mrw__mrw_write"

var mrwPlanHeader = regexp.MustCompile(`^@@ (\S+) \S+ (\S+)`)
var mrwPatchFile = regexp.MustCompile(`(?m)^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$`)

// mrwWritePaths is hook-record.mjs's: the paths an mrw MCP write names, each once, and false where its input does not name
// them (a grep/sub or ast-grep write, a search_replace document).
func mrwWritePaths(toolInput any) ([]string, bool) {
	if !isUndefined(get(toolInput, "grep")) || !isUndefined(get(toolInput, "ast_grep")) {
		return nil, false
	}
	plan, ok := get(toolInput, "plan").(string)
	if !ok {
		return nil, false
	}
	format := "plan"
	if f := get(toolInput, "format"); !nullish(f) {
		format = jsString(f)
	}
	var found []string
	switch format {
	case "plan":
		lines := regexp.MustCompile(`\r?\n`).Split(plan, -1)
		for at, line := range lines {
			header := mrwPlanHeader.FindStringSubmatch(line)
			if header == nil {
				continue
			}
			found = append(found, header[1])
			if header[2] == "rename" && at+1 < len(lines) && jsTrim(lines[at+1]) != "" {
				found = append(found, jsTrim(lines[at+1]))
			}
		}
	case "apply_patch":
		for _, m := range mrwPatchFile.FindAllStringSubmatch(plan, -1) {
			found = append(found, m[1])
		}
	default:
		return nil, false
	}
	seen := map[string]bool{}
	var out []string
	for _, file := range found {
		if !seen[file] {
			seen[file] = true
			out = append(out, file)
		}
	}
	return out, len(out) > 0
}

var shellTools = map[string]bool{"Bash": true, "PowerShell": true}
var readOnlyRoles = []string{"qh-correctness-reviewer", "qh-scope-reviewer", "qh-synthesis"}

// readOnlyRole is the bare role name when the agent type is one that never edits, or "".
func readOnlyRole(agentType any) string {
	s, ok := agentType.(string)
	if !ok {
		return ""
	}
	bare := strings.TrimPrefix(s, "quality-harness:")
	for _, r := range readOnlyRoles {
		if r == bare {
			return bare
		}
	}
	return ""
}

func (h *hookRun) turnEndFor() string {
	if h.event != "Stop" {
		return "agent"
	}
	directory := nearestExistingDirectory(resolvePath(h.cwd))
	if directory == "" {
		return "agent"
	}
	root := gitRepositoryRoot(directory)
	if root == "" {
		root = directory
	}
	return turnEndSetting(root)
}

func (h *hookRun) stopReachesAgent() bool {
	return h.event == "Stop" && !isTrue(h.input.Get("stop_hook_active")) && h.turnEndFor() != "notify"
}

func (h *hookRun) reachedBy() string {
	if h.event == "Stop" {
		if h.stopReachesAgent() {
			return "both"
		}
		return "user"
	}
	return deliveredTo(h.event, "agent")
}

func (h *hookRun) audience() string {
	if h.event == "Stop" {
		if h.stopReachesAgent() {
			return "agent"
		}
		return "user"
	}
	return channelOf(h.event, "agent")
}

func (h *hookRun) recipient() string {
	if truthy(h.input.Get("agent_id")) {
		return "subagent"
	}
	return "main"
}

var fullStop = func(s string) string {
	for i := 0; i+1 < len(s); i++ {
		if s[i] == '.' && isJSSpace(rune(s[i+1])) {
			return s[:i+1]
		}
	}
	return s
}

// advisoryHeadline is the one line a person sees: the first line's first sentence, without the `quality-harness:` prefix.
func advisoryHeadline(reason string) string {
	first := reason
	for _, line := range strings.Split(reason, "\n") {
		if strings.TrimSpace(line) != "" {
			first = line
			break
		}
	}
	sentence := jsTrim(first)
	if len(sentence) >= len("quality-harness:") && strings.EqualFold(sentence[:len("quality-harness:")], "quality-harness:") {
		sentence = strings.TrimLeftFunc(sentence[len("quality-harness:"):], isJSSpace)
	}
	sentence = fullStop(sentence)
	units := []rune(sentence)
	if utf16Len(sentence) > 140 {
		return truncateUTF16(units, 137) + "…"
	}
	return sentence
}

// truncateUTF16 is `s.slice(0, n)` over UTF-16 units.
func truncateUTF16(units []rune, n int) string {
	var b strings.Builder
	count := 0
	for _, r := range units {
		w := 1
		if r > 0xffff {
			w = 2
		}
		if count+w > n {
			break
		}
		count += w
		b.WriteRune(r)
	}
	return b.String()
}

// saidInput is what the said-per-context helper reads from the hook input: whose transcript holds the receiving context.
func (h *hookRun) saidInput() map[string]any {
	return map[string]any{"agent_id": h.input.Get("agent_id"), "agent_transcript_path": h.input.Get("agent_transcript_path"),
		"transcript_path": h.input.Get("transcript_path")}
}

// unsaid drops an item the receiving context already holds (lifecycle.mjs `unsaid`, ADR-122). A refusal is never asked about,
// and nor is a finding only the user is shown: a systemMessage never reaches the model, so no request can hold it.
func (h *hookRun) unsaid(actions []action) []action {
	in := h.saidInput()
	kept := []action{}
	for _, a := range actions {
		toAgent := h.event == "PreToolUse" || (h.stopReachesAgent() && a.audience != "user")
		if a.rule == "" || !toAgent {
			kept = append(kept, a)
			continue
		}
		identity := a.text
		// A publish advice's key is part of what it is (lifecycle.mjs identityOf); the mention stays context-wide.
		if key, ok := a.key.(string); ok && a.rule == "P" && !strings.HasSuffix(key, ":mention") {
			identity = key + "\n" + a.text
		}
		verdict, marker := SaidInContext(in, strings.ToLower(a.rule), identity)
		if verdict == "said" || verdict == "pending" {
			continue
		}
		a.marker = marker
		kept = append(kept, a)
	}
	return kept
}

func (a action) marked() string {
	if a.marker == "" {
		return a.text
	}
	return a.text + " " + a.marker
}

// deliver composes ONE output: a denial is the permission decision, every other advisory is joined.
func (h *hookRun) deliver() {
	actions := h.pending
	h.pending = nil
	legacy := h.output
	var denial *action
	for i := range actions {
		if actions[i].deny {
			denial = &actions[i]
			break
		}
	}
	var delivered []action
	var output *Obj
	switch {
	case denial != nil:
		texts := []string{denial.text}
		delivered = []action{*denial}
		for i := range actions {
			if &actions[i] != denial && actions[i].text != "" {
				texts = append(texts, actions[i].text)
				delivered = append(delivered, actions[i])
			}
		}
		text := strings.Join(texts, "\n\n")
		output = O("hookSpecificOutput", O("hookEventName", "PreToolUse", "permissionDecision", "deny", "permissionDecisionReason", text),
			"systemMessage", "quality-harness refused the command: "+advisoryHeadline(denial.text))
		h.say(text + "\n")
	case strict(dig(legacy, "hookSpecificOutput", "permissionDecision"), "deny"):
		output = legacy
	default:
		for _, a := range actions {
			if a.text != "" {
				delivered = append(delivered, a)
			}
		}
		delivered = h.unsaid(delivered)
		if legacy != nil {
			parsed, _ := parseJSON(stringify(legacy))
			output, _ = parsed.(*Obj)
		}
		if len(delivered) > 0 {
			texts := []string{}
			for _, a := range delivered {
				texts = append(texts, a.text)
				h.say(a.text + "\n")
			}
			joined := strings.Join(texts, "\n\n")
			if output == nil {
				output = O()
			}
			appendContext := func(eventName, text string) {
				specific, ok := output.Get("hookSpecificOutput").(*Obj)
				if !ok {
					specific = O("hookEventName", eventName)
				}
				if existing, ok := specific.Get("additionalContext").(string); ok && existing != "" {
					specific.Set("additionalContext", existing+"\n\n"+text)
				} else {
					specific.Set("additionalContext", text)
				}
				output.Set("hookSpecificOutput", specific)
			}
			systemMessage := func(sep, text string) {
				if existing, ok := output.Get("systemMessage").(string); ok && existing != "" {
					output.Set("systemMessage", existing+sep+text)
				} else {
					output.Set("systemMessage", text)
				}
			}
			if h.event == "PreToolUse" {
				forContext := []string{}
				for _, a := range delivered {
					forContext = append(forContext, a.marked())
				}
				appendContext("PreToolUse", strings.Join(forContext, "\n\n"))
				systemMessage("\n", "quality-harness advised the agent: "+advisoryHeadline(texts[0])+" (full text in the transcript)")
			} else if h.stopReachesAgent() {
				forAgent := []string{}
				for _, a := range delivered {
					if a.audience != "user" {
						forAgent = append(forAgent, a.marked())
					}
				}
				if len(forAgent) > 0 {
					appendContext("Stop", strings.Join(forAgent, "\n\n"))
				}
				systemMessage("\n\n", joined)
			} else {
				systemMessage("\n\n", joined)
			}
		}
	}
	h.output = output
	// The pending marks are written after the output leaves the process (flush, below in Run): lifecycle.mjs recordDelivered.
	for _, a := range delivered {
		if a.marker != "" {
			h.marks = append(h.marks, a.marker)
		}
	}
	for _, a := range delivered {
		if a.rule == "" {
			continue
		}
		row := O("event", "action.emitted", "rule", a.rule, "key", orNull(a.key))
		if a.detail != nil {
			row.Set("detail", a.detail)
		}
		row.Set("channel", h.reachedBy())
		if a.audience == "user" {
			row.Set("channel", "user")
		}
		row.Set("recipient", h.recipient())
		session, _ := h.session.(string)
		row.Set("generation", sessionGeneration(session))
		appendEvent(h.cwd, h.session, row)
	}
}

func slowHookThresholdMs() int64 {
	if v, err := strconv.ParseInt(os.Getenv("QUALITY_HARNESS_SLOW_HOOK_MS"), 10, 64); err == nil && v >= 0 {
		return v
	}
	return 5000
}

// flush writes the one output and says whether all of it was written: only then are the said-per-context marks recorded
// (lifecycle.mjs flushOutput's onWritten).
func (h *hookRun) flush(started time.Time) bool {
	elapsed := time.Since(started).Milliseconds()
	out := h.output
	h.output = nil
	if elapsed >= slowHookThresholdMs() {
		name := h.event
		if name == "" {
			name = "hook"
		}
		note := fmt.Sprintf("quality-harness: the %s hook took %.1fs — the pause has this name", name, float64(elapsed)/1000)
		h.say(note + "\n")
		if out == nil {
			out = O()
		} else {
			out = out.Clone()
		}
		if existing, ok := out.Get("systemMessage").(string); ok && existing != "" {
			out.Set("systemMessage", existing+"\n"+note)
		} else {
			out.Set("systemMessage", note)
		}
	}
	if out == nil {
		return false
	}
	text := stringify(out) + "\n"
	n, err := io.WriteString(h.stdout, text)
	return err == nil && n == len(text)
}

// randomUUID is crypto.randomUUID: a v4 UUID in lower case.
func randomUUID() string {
	var b [16]byte
	rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

var observedHookEvents = map[string]string{
	"TaskCompleted": "task.completed",
	"PreCompact":    "context.compacting",
	"SessionEnd":    "session.ending",
	"SubagentStart": "subagent.started",
	"SubagentStop":  "subagent.ended",
}

func hasBackgroundWork(input *Obj) bool {
	tasks, ok1 := input.Get("background_tasks").([]any)
	crons, ok2 := input.Get("session_crons").([]any)
	return (ok1 && len(tasks) > 0) || (ok2 && len(crons) > 0)
}

// recorded is what recordHookEvent returns: the entry it appended (or prepared), and whether a late baseline was adopted.
type recorded struct {
	entry        *Obj
	lateBaseline bool
}

func (r *recorded) event() any {
	if r == nil {
		return undefined
	}
	return r.entry.Get("event")
}

func (r *recorded) observation() any {
	if r == nil {
		return undefined
	}
	return r.entry.Get("observation")
}

// recordHookEvent translates one hook into its named event, observes, and appends both (ADR-060 T1).
func recordHookEvent(input *Obj) *recorded {
	session, ok := input.Get("session_id").(string)
	cwd, cwdOK := input.Get("cwd").(string)
	if !ok || session == "" || !cwdOK {
		return nil
	}
	hook := strOr(input.Get("hook_event_name"))
	if hook == "PostToolUse" {
		if strOr(input.Get("tool_name")) == mrwWrite {
			// One record per path the write names; the first is what the hook hands on. A write whose files cannot be named
			// is recorded with none, so it counts as unseen until a check passes after it.
			paths, named := mrwWritePaths(input.Get("tool_input"))
			if !named {
				return &recorded{entry: recordUnnamedWrite(input)}
			}
			var first *Obj
			for _, file := range paths {
				one := input.Clone()
				one.Set("tool_input", O("file_path", file))
				if entry := recordFileWritten(one); entry != nil && first == nil {
					first = entry
				}
			}
			if first != nil {
				return &recorded{entry: first}
			}
			return nil
		}
		if mutationTools[strOr(input.Get("tool_name"))] {
			if entry := recordFileWritten(input); entry != nil {
				return &recorded{entry: entry}
			}
		}
		return nil
	}
	name := ""
	extra := O()
	if hook == "PreToolUse" {
		if !shellTools[strOr(input.Get("tool_name"))] {
			return nil
		}
		command := dig(input, "tool_input", "command")
		if containsCommitOrPush(command) {
			name = "publish.requested"
		} else if mentionsCommitOrPush(command) {
			name = "publish.mentioned"
		} else {
			return nil
		}
	}
	if hook == "SessionStart" {
		existing := readEvents(cwd, session)
		if len(existing.E) > 0 || !existing.Complete {
			return nil
		}
		name = "session.started"
	} else if hook == "Stop" {
		if isTrue(input.Get("stop_hook_active")) || hasBackgroundWork(input) {
			return nil
		}
		name = "turn.ended"
	} else if observed, ok := observedHookEvents[hook]; ok {
		name = observed
		if hook == "PreCompact" {
			extra.Set("compactionId", randomUUID())
		}
		if hook == "SubagentStart" || hook == "SubagentStop" {
			extra.Set("agentId", stringOrNull(input.Get("agent_id")))
			extra.Set("agentType", stringOrNull(input.Get("agent_type")))
		}
	}
	if name == "" {
		return nil
	}
	entry := O("event", name)
	for _, k := range extra.keys {
		entry.Set(k, extra.vals[k])
	}
	entry.Set("observation", observeCarrying(cwd))
	late := false
	if name != "session.started" {
		log := readEvents(cwd, session)
		if lateBaselineAllowed(log, cwd, entry.Get("observation")) {
			late = appendEvent(cwd, session, O("event", "session.started", "late", true, "observation", entry.Get("observation")))
		}
	}
	source := importCheckRecords(cwd, session)
	if !source.complete {
		size := "null"
		if st, err := os.Stat(stateDir(cwd) + string(os.PathSeparator) + "checks.jsonl"); err == nil {
			size = strconv.FormatInt(st.Size(), 10)
		}
		key := "checks.jsonl:" + size
		said := false
		for _, e := range readEvents(cwd, session).E {
			if strict(get(e, "event"), "check.source-unreadable") && strict(get(e, "key"), key) {
				said = true
			}
		}
		if !said {
			appendEvent(cwd, session, O("event", "check.source-unreadable", "key", key))
		}
	}
	if name == "publish.mentioned" {
		return &recorded{entry: entry, lateBaseline: late}
	}
	if !appendEvent(cwd, session, entry) {
		failed := entry.Clone()
		failed.Set("observation", O("ok", false, "reason", "the event log could not be appended"))
		return &recorded{entry: failed}
	}
	return &recorded{entry: entry, lateBaseline: late}
}

func stringOrNull(v any) any {
	if s, ok := v.(string); ok {
		return s
	}
	return nil
}

func (h *hookRun) handle() {
	input := h.input
	guardAlone := h.event == "PreToolUse" && readOnlyRole(input.Get("agent_type")) != ""
	if h.event == "PreToolUse" && strict(input.Get("tool_name"), "Skill") {
		skill, ok := dig(input, "tool_input", "skill").(string)
		if !guardAlone && ok && strings.HasPrefix(skill, "quality-harness:") && !appendEvent(h.cwd, h.session, O("event", "skill.invoked", "skill", skill)) {
			h.say("[quality-harness] the skill use was not recorded in the session log.\n")
		}
		return
	}
	var rec *recorded
	if !guardAlone {
		rec = recordHookEvent(input)
	}
	if id, ok := h.session.(string); !guardAlone && ok && id != "" {
		h.importPassVerdicts(h.audience(), h.recipient())
	}
	if h.event == "SubagentStop" {
		h.reviewChangedState(rec)
	}
	switch h.event {
	case "SessionStart":
		onSessionStart(h, input)
	case "PreCompact", "SessionEnd":
		h.onSessionEnd(rec)
	case "SubagentStart":
		h.emitJSON(O("hookSpecificOutput", O("hookEventName", "SubagentStart", "additionalContext", subagentContract(input))))
	case "PreToolUse":
		h.onPreToolUse(rec)
	case "Stop", "SubagentStop", "TaskCompleted":
		h.onTurnEnd(rec)
	}
}

// Run is `qh hook <event>`: the payload on stdin, the answer on stdout and stderr, exit 0 whatever it found.
func Run(stdin io.Reader, stdout, stderr io.Writer) int {
	rememberStatus()
	started := time.Now()
	raw, _ := io.ReadAll(stdin)
	text := strings.TrimPrefix(string(raw), "\xef\xbb\xbf")
	parsed, err := parseJSON(text)
	if err != nil {
		utf16 := ""
		if strings.Contains(string(raw), "\x00") {
			utf16 = " It holds NUL bytes: saved as UTF-16?"
		}
		io.WriteString(stderr, "[quality-harness] the hook payload on stdin was not JSON; nothing was read and nothing is said."+utf16+"\n")
		return 0
	}
	input, ok := parsed.(*Obj)
	if !ok || (!isUndefined(input.Get("cwd")) && !isString(input.Get("cwd"))) {
		io.WriteString(stderr, "[quality-harness] the hook payload was not an object with a string cwd; nothing was read and nothing is said.\n")
		return 0
	}
	cwd, _ := input.Get("cwd").(string)
	if cwd == "" && !isString(input.Get("cwd")) {
		cwd, _ = os.Getwd()
	}
	h := &hookRun{input: input, event: strOr(input.Get("hook_event_name")), cwd: cwd, session: input.Get("session_id"), stdout: stdout, stderr: stderr}
	defer func() {
		h.deliver()
		if h.flush(started) {
			for _, marker := range h.marks {
				RecordSaid(h.saidInput(), marker)
			}
		}
	}()
	h.handle()
	return 0
}

func isString(v any) bool { _, ok := v.(string); return ok }
