//go:build windows

package hooks

import (
	"io/fs"
	"os/exec"
	"syscall"
)

// A child's console follows its stdio, and every child here has its output captured: CREATE_NO_WINDOW (CLAUDE.md §7).
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

// detach starts a child in a process group of its own with no console, as Node's `detached: true, windowsHide: true` does:
// DETACHED_PROCESS and CREATE_NEW_PROCESS_GROUP.
func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x00000008 | 0x00000200}
}

// Windows has no POSIX owner or mode bits to judge a lease directory by (lease.mjs skips the check there too).
func foreignOwner(dir string, found fs.FileInfo) string { return "" }
