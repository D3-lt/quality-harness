//go:build windows

package hooks

import (
	"os"
	"syscall"
)

// Win32 ERROR_DIRECTORY is 267; Go's syscall package does not export its name.
func syscallNotDirectory() error { return syscall.Errno(267) }

func processTraceSingleLink(file *os.File, _ os.FileInfo) bool {
	var info syscall.ByHandleFileInformation
	if syscall.GetFileInformationByHandle(syscall.Handle(file.Fd()), &info) != nil {
		return false
	}
	return info.NumberOfLinks == 1 && info.FileAttributes&syscall.FILE_ATTRIBUTE_REPARSE_POINT == 0
}

// Go obtains these times from GetProcessTimes. Descendant CPU and peak memory
// were not observed; do not substitute zeros for either of them.
func processTraceUsage(state *os.ProcessState) (*int64, *int64, *int64, string) {
	user, system := state.UserTime().Nanoseconds(), state.SystemTime().Nanoseconds()
	return &user, &system, nil, "process"
}
