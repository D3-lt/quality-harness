//go:build !windows

package hooks

import (
	"io/fs"
	"os"
	"os/exec"
	"syscall"
)

func hideWindow(cmd *exec.Cmd) {}

// detach starts a child in a session of its own, as Node's `detached: true` does, so it outlives the hook that started it.
func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}

// foreignOwner refuses a lease directory another user owns or can write.
func foreignOwner(dir string, found fs.FileInfo) string {
	if st, ok := found.Sys().(*syscall.Stat_t); ok && int(st.Uid) != os.Getuid() {
		return dir + " belongs to another user"
	}
	if found.Mode().Perm()&0o022 != 0 {
		return dir + " can be written by other users"
	}
	return ""
}
