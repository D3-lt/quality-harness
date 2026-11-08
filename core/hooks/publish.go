// PreToolUse keeps reviewer and evidence guards, decision context, and artifact gates. Publishing is independent of checks (ADR-130).
package hooks

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
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

// decisionContextFor hands over what has already been decided about the files a call is about to touch: an edit's file, or each
// path an mrw MCP write's plan names. By the file field alone, a write through mrw was told nothing (BACKLOG §444). The same
// answer said twice, a could-not-look for each path, is said once. A shell `mrw write` is not read: which heredoc feeds which
// command, and from which directory, is shell semantics a line scan gets wrong (the Codex review of d3e832c3..e6968459).
func decisionContextFor(input *Obj) string {
	cwd, ok := input.Get("cwd").(string)
	if !ok || !filepath.IsAbs(cwd) {
		cwd, _ = os.Getwd()
	}
	targets := decisionTargets(input)
	repo := &decisionRepo{cwd: cwd}
	started := time.Now()
	var said []string
	for at, t := range targets {
		// One deadline for the whole call, well inside the hook's own timeout: past it, or past the cap, the rest are named as not
		// looked at, and none of them is stamped as said (the Codex review of d3e832c3..e6968459: ten budgets of their own could
		// outlast the hook, which the host then ends with the stamps written and nothing delivered).
		if at == decisionTargetCap || (at > 0 && time.Since(started) >= decisionTargetsBudget) {
			said = append(said, "decision context was read for the first "+strconv.Itoa(at)+" of the "+
				strconv.Itoa(len(targets))+" paths this write names; the rest were not looked at.")
			break
		}
		if answer := decisionContextForPath(input, repo, t); answer != "" && !slicesContains(said, answer) {
			said = append(said, answer)
		}
	}
	return strings.Join(said, "\n\n")
}

// decisionRepo is the repository a call's paths are read in, and its listing, each found once and only when a path needs it. Both
// follow from the session's directory, not from a path: found per path, a write of ten paths ran the root lookup and the two git
// listings ten times, outside any deadline (the scoped verification of 9c657bdc), so many paths now cost what one does.
type decisionRepo struct {
	cwd            string
	looked, listed bool
	root, failed   string
	listing        []string
}

func (r *decisionRepo) rootOf() (root, failed string) {
	if !r.looked {
		r.looked = true
		directory := nearestExistingDirectory(resolvePath(r.cwd))
		if directory != "" {
			found := gitRepositoryLookup(directory)
			if !found.ok {
				r.failed = "could-not-look: the repository root could not be read, so which decisions govern this edit is unknown."
			} else if found.root != "" {
				r.root = canonical(found.root)
			} else {
				r.root = canonical(directory)
			}
		}
	}
	return r.root, r.failed
}

// decisionListing is trackedPaths, a var so a test can count how often a call lists the repository.
var decisionListing = trackedPaths

func (r *decisionRepo) tracked() []string {
	if !r.listed {
		r.listed = true
		r.listing = decisionListing(r.root)
	}
	return r.listing
}

// decisionTargetCap and decisionTargetsBudget bound the reads one call makes: each path is a corpus read under its own budget.
const decisionTargetCap = 10

var decisionTargetsBudget = 15 * time.Second // a var so a test can spend it

func slicesContains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func decisionTargets(input *Obj) []string {
	if strOr(input.Get("tool_name")) == mrwWrite {
		// mrw's MCP server resolves a plan's paths against the root it was started with, "." unless its --root says otherwise;
		// the call does not carry it, so they are read against the session's working directory.
		return mrwTargets(input.Get("tool_input"))
	}
	target := dig(input, "tool_input", "file_path")
	if nullish(target) {
		target = dig(input, "tool_input", "notebook_path")
	}
	if t, ok := target.(string); ok && t != "" {
		return []string{t}
	}
	return nil
}

// decisionContextForPath is the decision context for one path, said the first time this session touches it.
func decisionContextForPath(input *Obj, repo *decisionRepo, t string) string {
	resolved := canonical(resolveFrom(repo.cwd, t))
	if alreadyMentionedThisSession(input.Get("session_id"), resolved) {
		return ""
	}
	root, failed := repo.rootOf()
	if failed != "" {
		return failed
	}
	if root == "" {
		return ""
	}
	context := decisionContext(resolved, root, repo.tracked)
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
