//go:build windows

package hooks

import (
	"context"
	"os/exec"
	"time"
)

// bsEndTree on Windows kills the command's own process at the deadline (exec's default) and relies on WaitDelay to stop
// waiting for a grandchild's pipe; ending the grandchild itself would need a job object, which this core does not create
// (ADR-135 Risks).
func bsEndTree(cmd *exec.Cmd) {}

// bsWatchTree has no group to end on Windows (ADR-135 Risks); its cleanup does nothing.
func bsWatchTree(ctx context.Context, cmd *exec.Cmd) func() { return func() {} }

// bsPipeWait on Windows is short: the deadline kills only the command's own process, so a grandchild holding the pipe is not
// ended there, and a full timeout more would nearly double the refresh budget (the scoped verification of 53e9f6cc).
func bsPipeWait(timeout time.Duration) time.Duration { return 250 * time.Millisecond }
