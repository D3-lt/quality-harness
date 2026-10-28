// Hook-adjacent CLI entry points kept at the native boundary after the Node hook engine was retired.
package hooks

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

func RunBridge(tool string, args []string) int {
	script := ""
	switch tool {
	case "branch-state":
		script = "branch-state.mjs"
	case "shell-hook":
		script = "run-shell-hook.mjs"
	default:
		fmt.Fprintln(os.Stderr, "qh: unknown hook CLI")
		return 2
	}
	budget := 10 * time.Second
	if tool == "shell-hook" {
		budget = 114 * time.Second
	}
	status, err := executeNodeCLI(filepath.Join(pluginRoot(), "scripts", script), args, budget)
	if err != nil {
		fmt.Fprintln(os.Stderr, "qh: could not run the hook CLI:", err)
	}
	return status
}

func RunReviewerGuard(stdin io.Reader, stderr io.Writer) int {
	raw, err := io.ReadAll(stdin)
	if err != nil {
		return 0
	}
	parsed, err := parseJSON(string(raw))
	if err != nil {
		return 0
	}
	input, ok := parsed.(*Obj)
	if !ok {
		return 0
	}
	if reason := readOnlyVerdict(input); reason != "" {
		fmt.Fprintln(stderr, "quality-harness reviewer guard: "+reason)
		return 2
	}
	return 0
}

func RecordMention(session, key string) bool {
	return firstMentionThisSession(session, key)
}
