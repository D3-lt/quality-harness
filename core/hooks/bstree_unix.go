//go:build !windows

package hooks

import (
	"os/exec"
	"syscall"
)

// bsEndTree puts the command in a process group of its own and makes the deadline kill that whole group, so nothing the
// command started outlives it (ADR-135 Decision 2).
func bsEndTree(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
}
