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
	node, err := exec.LookPath("node")
	if err != nil {
		return 1, err
	}
	return 1, syscall.Exec(node, append([]string{node, script}, args...), os.Environ())
}
