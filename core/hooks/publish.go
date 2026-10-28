// PreToolUse keeps reviewer and evidence guards, decision context, and artifact gates. Publishing is independent of checks (ADR-130).
package hooks

import (
	"os"
	"path/filepath"
	"regexp"
)

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
	if strict(rec.event(), "publish.requested") {
		h.artifactRule(rec)
	}
}
