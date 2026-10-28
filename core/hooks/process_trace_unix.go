//go:build !windows

package hooks

import (
	"os"
	"runtime"
	"syscall"
)

func syscallNotDirectory() error { return syscall.ENOTDIR }

func processTraceSingleLink(_ *os.File, info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && stat.Nlink == 1
}

// Wait4's rusage may include descendants already waited by the child. These
// values are deliberately not labelled process-only or summed with nested spans.
func processTraceUsage(state *os.ProcessState) (*int64, *int64, *int64, string) {
	user, system := state.UserTime().Nanoseconds(), state.SystemTime().Nanoseconds()
	var peak *int64
	if usage, ok := state.SysUsage().(*syscall.Rusage); ok {
		peak = processTracePeakMemory(int64(usage.Maxrss), runtime.GOOS)
	}
	return &user, &system, peak, "waited-subtree"
}
