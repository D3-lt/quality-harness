//go:build windows

// The Codex review of be9293a0..85448572 (part B): libuv names Windows' access denied EPERM and a bad executable format EFTYPE,
// where the generic mapping said EACCES and Go's text. Run on Windows by tests/shell-hook-spawn-codes.test.mjs.
package hooks

import (
	"io/fs"
	"syscall"
	"testing"
)

func TestShellHookWindowsSpawnCodes(t *testing.T) {
	for _, tc := range []struct {
		err  error
		want string
	}{
		{&fs.PathError{Op: "fork/exec", Path: `C:\Git\bin\bash.exe`, Err: syscall.ERROR_ACCESS_DENIED}, "EPERM"},
		{&fs.PathError{Op: "fork/exec", Path: `C:\Git\bin\bash.exe`, Err: syscall.Errno(193)}, "EFTYPE"},
		{&fs.PathError{Op: "fork/exec", Path: `C:\Git\bin\bash.exe`, Err: syscall.ERROR_FILE_NOT_FOUND}, "ENOENT"},
	} {
		if got := shkSpawnCode(`C:\Git\bin\bash.exe`, tc.err); got != tc.want {
			t.Errorf("shkSpawnCode(%v) = %q, want %q", tc.err, got, tc.want)
		}
	}
}
