//go:build windows

// A process a Windows test started, known by its pid AND its creation time, which it records itself (the Codex review of
// ccffe983e, BACKLOG §477): Windows reuses pids, so a pid alone can name another process by the time a test looks. A liveness
// query that fails is "could not tell", a failure, never "gone"; a pid that now names a process created at another time is the
// original gone; and only a handle whose creation time matched ever terminates anything.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"syscall"
	"testing"
	"time"
)

// procID is a process as it recorded itself: its pid and its creation time, the raw FILETIME GetProcessTimes reports (100 ns ticks
// since 1601). It is kept raw: Go's Filetime.Nanoseconds converts to the Unix epoch, and a zero FILETIME overflows there (the
// Codex verification of 6210bf736). A zero is never a creation time, and every reader refuses it.
type procID struct {
	PID     int    `json:"pid"`
	Created uint64 `json:"created"`
}

// procCreated is the creation time of the process `handle` names, raw; a zero, or a call that failed, is an error.
func procCreated(handle syscall.Handle) (uint64, error) {
	var created, exited, kernel, user syscall.Filetime
	if err := syscall.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return 0, fmt.Errorf("GetProcessTimes: %v", err)
	}
	raw := uint64(created.HighDateTime)<<32 | uint64(created.LowDateTime)
	if raw == 0 {
		return 0, fmt.Errorf("GetProcessTimes gave a zero creation time")
	}
	return raw, nil
}

// procSelf is the calling process's own identity; a creation time it could not read is 0, which every reader refuses.
func procSelf() procID {
	self, _ := syscall.GetCurrentProcess()
	created, err := procCreated(self)
	if err != nil {
		return procID{PID: os.Getpid()}
	}
	return procID{PID: os.Getpid(), Created: created}
}

// procMark publishes a marker whole: a reader sees the file only once it is complete.
func procMark(path string, value any) bool {
	text, err := json.Marshal(value)
	return err == nil && os.WriteFile(path+".tmp", text, 0600) == nil && os.Rename(path+".tmp", path) == nil
}

// procOpen opens the process `p` names, but only if it is that process: a handle to a pid whose creation time differs is closed
// and reported as gone. ok false and err nil: the original process is gone. An error: its state could not be told.
func procOpen(p procID, access uint32) (handle syscall.Handle, ok bool, err error) {
	if p.PID <= 0 || p.Created == 0 {
		return 0, false, fmt.Errorf("pid %d with creation time %d is no recorded identity, so it cannot be checked", p.PID, p.Created)
	}
	handle, err = syscall.OpenProcess(access, false, uint32(p.PID))
	if err == syscall.Errno(87) { // ERROR_INVALID_PARAMETER: no process has this pid
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("OpenProcess(%d): %v", p.PID, err)
	}
	created, err := procCreated(handle)
	if err != nil {
		syscall.CloseHandle(handle)
		return 0, false, fmt.Errorf("pid %d: %v", p.PID, err)
	}
	if created != p.Created {
		syscall.CloseHandle(handle)
		return 0, false, nil
	}
	return handle, true, nil
}

// procAlive says whether the process the test started still runs; an error is "could not tell".
func procAlive(p procID) (bool, error) {
	handle, ok, err := procOpen(p, 0x1000) // PROCESS_QUERY_LIMITED_INFORMATION
	if err != nil || !ok {
		return false, err
	}
	defer syscall.CloseHandle(handle)
	var code uint32
	if err := syscall.GetExitCodeProcess(handle, &code); err != nil {
		return false, fmt.Errorf("GetExitCodeProcess(%d): %v", p.PID, err)
	}
	return code == 259, nil // STILL_ACTIVE
}

// procEnd ends the process the test started, and only it: the handle that terminates is the one whose creation time matched. It
// says whether it ended one.
func procEnd(p procID) bool {
	handle, ok, err := procOpen(p, 0x1000|0x0001) // QUERY_LIMITED_INFORMATION | TERMINATE
	if err != nil || !ok {
		return false
	}
	defer syscall.CloseHandle(handle)
	return syscall.TerminateProcess(handle, 1) == nil
}

// procGone waits up to two seconds for the process to be gone; still running, or a state that could not be read, is a failure,
// and a survivor is ended through the identity-checked handle first.
func procGone(t *testing.T, role string, p procID) {
	t.Helper()
	var alive bool
	var err error
	for i := 0; i < 40; i++ {
		if alive, err = procAlive(p); err != nil || !alive {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if err != nil || alive {
		procEnd(p)
		if err != nil {
			t.Fatalf("whether the %s (pid %d) is gone could not be told: %v", role, p.PID, err)
		}
		t.Fatalf("the %s (pid %d) outlived the command that started it", role, p.PID)
	}
}
