//go:build !windows

package hooks

import (
	"os"
	"os/exec"
	"syscall"
	"time"
)

// Replace the bridge so the retained CLI writes to the host's actual descriptors.
// Its delivery receipts must never be committed merely because an intermediate pipe accepted output.
func executeNodeCLI(script string, args []string, _ time.Duration) (int, error) {
	cmd := &exec.Cmd{Path: "node", Args: append([]string{"node", script}, args...)}
	trace := startProcessTrace(cmd, "", "exec-attempt")
	node, err := exec.LookPath("node")
	if err == nil {
		env := cmd.Env
		if env == nil {
			env = os.Environ()
		}
		// Success replaces this image in the same PID; there is no child completion.
		err = syscall.Exec(node, append([]string{node, script}, args...), env)
	}
	if trace != nil {
		trace.append("exec-error", "exec-error")
	}
	return 1, err
}
