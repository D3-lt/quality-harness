// `qh mcp` (ADR-114 T1): four read-only MCP resources, served over newline-delimited JSON-RPC on stdin and stdout, from the
// ledgers the hooks and qh-check already write. Nothing is computed again and nothing is written. A ledger that was never
// written is UNRUN, and one that cannot be read whole is UNPROVEN, never served as empty (ADR-005). It is not registered in the
// plugin until a session shows a measured use (ADR-114, Decision 3).
package hooks

import (
	"bufio"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type mcpResource struct {
	uri, name, description string
	read                   func(cwd string) (text string, json bool)
}

var mcpResources = []mcpResource{
	{"qh://check/latest", "check/latest", "the latest record qh-check wrote to checks.jsonl", func(cwd string) (string, bool) {
		return lastRecord(filepath.Join(stateDir(cwd), "checks.jsonl"), "no qh-check has run here", func(any) bool { return true })
	}},
	{"qh://baseline", "baseline", "the last bound baseline in baseline.jsonl (ADR-111 T3)", func(cwd string) (string, bool) {
		return lastRecord(filepath.Join(stateDir(cwd), "baseline.jsonl"), "no baseline has been taken here", func(row any) bool { return isTrue(dig(row, "baseline", "bound")) })
	}},
	{"qh://branch-state", "branch-state", "the branch-state snapshot SessionStart and each prompt read (ADR-065)", func(cwd string) (string, bool) {
		// Where branch-state.mjs writes it: the git directory itself, whatever QUALITY_HARNESS_STATE_DIR moved the ledgers to
		// (the Codex review of f79c600d).
		gitDir := findGitDir(cwd)
		if gitDir == "" {
			run := git(5*time.Second, nil, "-C", resolvePath(cwd), "rev-parse", "--absolute-git-dir")
			if run.err == nil && run.status == 0 {
				gitDir = strings.TrimSpace(run.stdout)
			}
		}
		if gitDir == "" {
			return "UNRUN: no git directory was found here, so no branch-state snapshot is kept", false
		}
		text, err := os.ReadFile(filepath.Join(gitDir, "qh-branch-state.json"))
		if errors.Is(err, fs.ErrNotExist) {
			return "UNRUN: no branch-state snapshot has been taken here", false
		}
		if err != nil {
			return "UNPROVEN: the branch-state snapshot could not be read (" + errCode(err, err.Error()) + ")", false
		}
		if _, perr := parseJSON(string(text)); perr != nil {
			return "UNPROVEN: the branch-state snapshot is not whole JSON", false
		}
		return strings.TrimSpace(string(text)), true
	}},
	{"qh://turn-end/findings", "turn-end/findings", "the findings the newest session's last turn end gave, by rule and key", turnEndFindings},
}

// lastRecord is the last line of a JSONL ledger that `keep` accepts, as written; a ledger whose last line is not whole is
// UNPROVEN, since the record a reader wants may be the one that was cut.
func lastRecord(file, never string, keep func(any) bool) (string, bool) {
	text, err := os.ReadFile(file)
	if errors.Is(err, fs.ErrNotExist) {
		return "UNRUN: " + never + " (" + filepath.Base(file) + " does not exist)", false
	}
	if err != nil {
		return "UNPROVEN: " + filepath.Base(file) + " could not be read (" + errCode(err, err.Error()) + ")", false
	}
	if len(text) > 0 && !strings.HasSuffix(string(text), "\n") {
		return "UNPROVEN: the last line of " + filepath.Base(file) + " is not a whole record", false
	}
	found := ""
	for _, line := range strings.Split(string(text), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		row, perr := parseJSON(line)
		if perr != nil {
			return "UNPROVEN: " + filepath.Base(file) + " holds a line that is not a whole record", false
		}
		if keep(row) {
			found = line
		}
	}
	if found == "" {
		return "UNRUN: " + never + " (" + filepath.Base(file) + " holds none)", false
	}
	return found, true
}

// turnEndFindings reads the newest session log: the `action.emitted` rows after its last `turn.ended`.
func turnEndFindings(cwd string) (string, bool) {
	dir := filepath.Join(stateDir(cwd), "sessions")
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return "UNRUN: no session has been logged here", false
	}
	if err != nil {
		return "UNPROVEN: the session logs could not be listed (" + errCode(err, err.Error()) + ")", false
	}
	type logFile struct {
		name string
		mod  int64
	}
	logs := []logFile{}
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".jsonl") {
			continue
		}
		info, ierr := e.Info()
		if ierr != nil {
			return "UNPROVEN: a session log could not be read (" + errCode(ierr, ierr.Error()) + ")", false
		}
		logs = append(logs, logFile{e.Name(), info.ModTime().UnixNano()})
	}
	if len(logs) == 0 {
		return "UNRUN: no session has been logged here", false
	}
	sort.Slice(logs, func(i, j int) bool {
		return logs[i].mod > logs[j].mod || (logs[i].mod == logs[j].mod && logs[i].name < logs[j].name)
	})
	session := strings.TrimSuffix(logs[0].name, ".jsonl")
	log := readEvents(cwd, session)
	if !log.Complete {
		return "UNPROVEN: the session log " + logs[0].name + " could not be read whole", false
	}
	last := -1
	for i, e := range log.E {
		if strict(get(e, "event"), "turn.ended") {
			last = i
		}
	}
	if last < 0 {
		return "UNRUN: the newest session (" + session + ") has not ended a turn", false
	}
	// A Stop's own rows follow its turn.ended: the check records it imports, the artifact pass and its findings. The next hook
	// opens with an entry event of its own, and what it emits is not the last turn end's (the Codex review of f79c600d).
	opens := map[string]bool{"session.started": true, "turn.ended": true, "file.written": true, "publish.requested": true,
		"publish.mentioned": true, "publish.hook-ran": true, "skill.invoked": true}
	for _, name := range observedHookEvents {
		opens[name] = true
	}
	// A mention records no event before its advice, so a rule no turn end emits (P, R3) ends the findings too (the Codex review
	// of aae06d72). The turn end's rules: completion-rules.mjs's R1, R4, R5, W and N, and the artifact pass's A; R2, retired by
	// ADR-128 T1, stays so a log written before then still reads.
	turnEndRules := map[string]bool{"R1": true, "R2": true, "R4": true, "R5": true, "W": true, "N": true, "A": true}
	findings := []any{}
	for _, e := range log.E[last+1:] {
		name := strOr(get(e, "event"))
		if opens[name] {
			break
		}
		if name == "action.emitted" {
			if !turnEndRules[strOr(get(e, "rule"))] {
				break
			}
			findings = append(findings, O("rule", get(e, "rule"), "key", orNull(get(e, "key")), "channel", orNull(get(e, "channel")),
				"recipient", orNull(get(e, "recipient")), "at", orNull(get(e, "at"))))
		}
	}
	return stringify(O("session", session, "findings", findings)), true
}

// ServeMCP answers one JSON-RPC request per line until stdin ends; a notification (no id) is not answered.
func ServeMCP(in io.Reader, out io.Writer, cwd string) int {
	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	reply := func(id any, key string, value any) {
		io.WriteString(out, stringify(O("jsonrpc", "2.0", "id", id, key, value))+"\n")
	}
	failed := func(id any, code float64, message string) { reply(id, "error", O("code", code, "message", message)) }
	for scanner.Scan() {
		if strings.TrimSpace(scanner.Text()) == "" {
			continue
		}
		msg, err := parseJSON(scanner.Text())
		if err != nil {
			failed(nil, -32700, "a line that is not JSON")
			continue
		}
		id := get(msg, "id")
		if isUndefined(id) {
			continue
		}
		switch strOr(get(msg, "method")) {
		case "initialize":
			version := "2025-06-18"
			if v, ok := dig(msg, "params", "protocolVersion").(string); ok && v != "" {
				version = v
			}
			reply(id, "result", O("protocolVersion", version, "capabilities", O("resources", O()), "serverInfo", O("name", "qh", "version", "core")))
		case "ping":
			reply(id, "result", O())
		case "resources/list":
			list := []any{}
			for _, r := range mcpResources {
				list = append(list, O("uri", r.uri, "name", r.name, "description", r.description, "mimeType", "application/json"))
			}
			reply(id, "result", O("resources", list))
		case "resources/read":
			uri := strOr(dig(msg, "params", "uri"))
			served := false
			for _, r := range mcpResources {
				if r.uri != uri {
					continue
				}
				text, whole := r.read(cwd)
				mime := "text/plain"
				if whole {
					mime = "application/json"
				}
				reply(id, "result", O("contents", []any{O("uri", uri, "mimeType", mime, "text", text)}))
				served = true
			}
			if !served {
				failed(id, -32602, "no such resource: "+uri)
			}
		default:
			failed(id, -32601, "qh mcp serves resources only")
		}
	}
	if err := scanner.Err(); err != nil {
		return 1
	}
	return 0
}
