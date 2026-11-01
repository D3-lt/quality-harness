//go:build !windows

package hooks

import (
	"context"
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

// bsWatchTree ends the command's process group when its context ends, whether or not the first process is still running:
// cmd.Cancel alone is called only while it is. The group id is the started process's pid (Setpgid above).
func bsWatchTree(ctx context.Context, cmd *exec.Cmd) {
	pid := cmd.Process.Pid
	go func() {
		<-ctx.Done()
		_ = syscall.Kill(-pid, syscall.SIGKILL)
	}()
}
