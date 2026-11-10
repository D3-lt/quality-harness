//go:build windows

package hooks

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

// shkOwnTree starts the gate suspended, so shkAdopt can put it in a job before it starts anything (ADR-140): `taskkill /T` alone
// left an MSYS-started grandchild running past the deadline (BACKLOG §440).
func shkOwnTree(cmd *exec.Cmd) { winSuspend(cmd) }

// shkAdopt puts the suspended gate in a job and resumes it (winAdopt).
func shkAdopt(cmd *exec.Cmd) (*winTree, error) { return winAdopt(winKernel(), cmd.Process.Pid) }

// shkReleaseTree closes the job handle; with no kill-on-close it ends nothing (ADR-140 Decision 4).
func shkReleaseTree(tree *winTree) { winRelease(winKernel(), tree) }

// shkEndTree ends the job that holds the gate, and runs `taskkill /PID <pid> /T /F` (Node's terminateProcessTree on win32,
// within its 2 s budget) only when there is no job or ending it failed.
func shkEndTree(cmd *exec.Cmd, tree *winTree) { winEnd(winKernel(), tree, cmd.Process.Pid) }

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
