//go:build windows

package hooks

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"strconv"
	"syscall"
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

// shkPlatformSpawnCode is libuv's Windows translation for the spawn errors whose generic mapping would differ: access denied
// is EPERM there, not EACCES, and a bad executable format is EFTYPE (libuv v1.52.1 src/win/error.c; the Codex review of
// be9293a0..85448572).
func shkPlatformSpawnCode(err error) (string, bool) {
	var errno syscall.Errno
	if !errors.As(err, &errno) {
		return "", false
	}
	switch errno {
	case syscall.ERROR_ACCESS_DENIED:
		return "EPERM", true
	case 193: // ERROR_BAD_EXE_FORMAT
		return "EFTYPE", true
	}
	return "", false
}
