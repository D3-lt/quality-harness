//go:build windows

package hooks

import (
	"context"
	"os/exec"
	"time"
)

// bsEndTree starts the command suspended, so bsWatchTree can put it in a job before it starts anything (ADR-140); exec's own
// Cancel still kills the command's process at the deadline.
func bsEndTree(cmd *exec.Cmd) { winSuspend(cmd) }

// bsWatchTree is winWatch over kernel32: the job is ended at the deadline and once Wait returns, as the Unix process group is.
func bsWatchTree(ctx context.Context, cmd *exec.Cmd) (func(), error) {
	return winWatch(winKernel(), ctx, cmd.Process.Pid)
}

// bsPipeWait on Windows stays short: when no job could be made, the deadline kills only the command's own process, and a full
// timeout more would nearly double the refresh budget (the scoped verification of 53e9f6cc).
func bsPipeWait(timeout time.Duration) time.Duration { return 250 * time.Millisecond }
