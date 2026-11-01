//go:build !windows

package hooks

import (
	"context"
	"os/exec"
	"sync"
	"syscall"
	"time"
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

// bsWatchTree ends the command's process group when its context ends, whether or not the first process is still running
// (cmd.Cancel alone is called only while it is), and returns the cleanup the caller runs once Wait returns. That cleanup runs
// synchronously, before bsRun returns, so the group is ended before the hook can exit and the window in which its number could
// name another group is as short as the call itself (the scoped verification of 53e9f6cc). The group id is the started
// process's pid (Setpgid above).
func bsWatchTree(ctx context.Context, cmd *exec.Cmd) func() {
	pid := cmd.Process.Pid
	var once sync.Once
	end := func() { once.Do(func() { _ = syscall.Kill(-pid, syscall.SIGKILL) }) }
	stop := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			end()
		case <-stop:
		}
	}()
	return func() {
		close(stop)
		end()
	}
}

// bsPipeWait is how long Wait may wait for a grandchild's output pipe: the command's own timeout, as execFileSync waits, since
// the deadline ends the group and closes the pipe anyway.
func bsPipeWait(timeout time.Duration) time.Duration { return timeout }
