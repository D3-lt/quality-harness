//go:build windows

package hooks

import (
	"os/exec"
	"syscall"
)

// A child's console follows its stdio, and every child here has its output captured: CREATE_NO_WINDOW (CLAUDE.md §7).
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
