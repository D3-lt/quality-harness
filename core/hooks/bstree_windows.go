//go:build windows

package hooks

import (
	"context"
	"os/exec"
)

// bsEndTree on Windows kills the command's own process at the deadline (exec's default) and relies on WaitDelay to stop
// waiting for a grandchild's pipe; ending the grandchild itself would need a job object, which this core does not create
// (ADR-135 Risks).
func bsEndTree(cmd *exec.Cmd) {}

// bsWatchTree has no group to end on Windows; WaitDelay bounds the wait (ADR-135 Risks).
func bsWatchTree(ctx context.Context, cmd *exec.Cmd) {}
