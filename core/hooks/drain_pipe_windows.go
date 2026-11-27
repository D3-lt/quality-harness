//go:build windows

package hooks

import (
	"fmt"
	"os"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

var (
	winCreateNamedPipe = winKernel32.NewProc("CreateNamedPipeW")
	drainPipeSerial    atomic.Uint64
)

const (
	winPipeAccessInbound    = 0x00000001
	winFileFlagOverlapped   = 0x40000000
	winFirstPipeInstance    = 0x00080000
	winPipeRejectRemote     = 0x00000008 // PIPE_TYPE_BYTE, PIPE_READMODE_BYTE and PIPE_WAIT are zero
	winPipeBufferBytes      = 64 << 10
	winPipeOneInstance      = 1
	winPipeDefaultTimeoutMs = 0
)

// drainPipe is the pipe bsRunDrained reads a command's output from: a named pipe of one instance whose read end is opened
// overlapped, so os.NewFile adds it to Go's poller (internal/syscall/windows.IsNonblock) and it takes a read deadline, and whose
// write end, the child's, is an ordinary synchronous handle. exec duplicates that handle into the child (syscall/exec_windows.go).
// os.Pipe is not used: its read end is blocking, and only Close can cancel its read (observe_drain.go).
//
// The name is this process's and unique within it. FILE_FLAG_FIRST_PIPE_INSTANCE refuses a name somebody already serves, one
// instance admits one client, and that client is the write end opened at once below: a pipe somebody else reached first fails
// here, before anything starts.
func drainPipe() (read, write *os.File, err error) {
	name := fmt.Sprintf(`\\.\pipe\quality-harness-drain-%d-%d-%d`, os.Getpid(), time.Now().UnixNano(), drainPipeSerial.Add(1))
	path, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, nil, err
	}
	handle, _, callErr := winCreateNamedPipe.Call(uintptr(unsafe.Pointer(path)),
		winPipeAccessInbound|winFileFlagOverlapped|winFirstPipeInstance, winPipeRejectRemote, winPipeOneInstance,
		winPipeBufferBytes, winPipeBufferBytes, winPipeDefaultTimeoutMs, 0)
	if syscall.Handle(handle) == syscall.InvalidHandle {
		return nil, nil, fmt.Errorf("CreateNamedPipe: %v", callErr)
	}
	writeHandle, err := syscall.CreateFile(path, syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_EXISTING, 0, 0)
	if err != nil {
		syscall.CloseHandle(syscall.Handle(handle))
		return nil, nil, fmt.Errorf("CreateFile on the drain pipe: %v", err)
	}
	return os.NewFile(handle, "|0"), os.NewFile(uintptr(writeHandle), "|1"), nil
}
