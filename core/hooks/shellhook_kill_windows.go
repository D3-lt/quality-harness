//go:build windows

package hooks

import (
	"context"
	"os"
	"os/exec"
	"strconv"
	"time"
)

// shkTaskkillBudget is TASKKILL_TIMEOUT_MS: taskkill answers in milliseconds, and one that has not answered in 2s is hung.
const shkTaskkillBudget = 2 * time.Second

// shkOwnTree has nothing to set on Windows: taskkill /T finds the tree from the gate's pid.
func shkOwnTree(cmd *exec.Cmd) {}

// shkEndTree is terminateProcessTree on win32: `taskkill /PID <pid> /T /F`, the cancel executeNodeCLI uses
// (bridge_exec_windows.go), bounded by Node's budget for it rather than the bridge's (ADR-136 Decision 3).
func shkEndTree(cmd *exec.Cmd) {
	ctx, stop := context.WithTimeout(context.Background(), shkTaskkillBudget)
	defer stop()
	kill := exec.CommandContext(ctx, "taskkill.exe", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
	hideWindow(kill)
	_ = runObservedCommand(kill, func() bool { return ctx.Err() == context.DeadlineExceeded })
}

// shkSignalName is "" on Windows, where a child exits with a code and no signal.
func shkSignalName(state *os.ProcessState) string { return "" }
