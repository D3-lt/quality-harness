//go:build windows

package hooks

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"syscall"
	"time"
	"unsafe"
)

// The kernel32 calls Go's syscall package does not export. Each failure is checked where the call is made and names the call
// and its error: fence.py's diagnostics failed silently three times before that rule was mechanical.
var (
	winKernel32          = syscall.NewLazyDLL("kernel32.dll")
	winCreateJobObject   = winKernel32.NewProc("CreateJobObjectW")
	winAssignProcess     = winKernel32.NewProc("AssignProcessToJobObject")
	winTerminateJob      = winKernel32.NewProc("TerminateJobObject")
	winThread32First     = winKernel32.NewProc("Thread32First")
	winThread32Next      = winKernel32.NewProc("Thread32Next")
	winOpenThread        = winKernel32.NewProc("OpenThread")
	winResumeThread      = winKernel32.NewProc("ResumeThread")
	winCreateSuspended   = uint32(0x00000004)
	winTaskkillBudget    = 2 * time.Second
	winProcessSetQuota   = uint32(0x0100)
	winProcessTerminate  = uint32(0x0001)
	winThreadSuspendResu = uint32(0x0002)
	winSnapThread        = uint32(0x00000004)
)

// winThreadEntry is THREADENTRY32.
type winThreadEntry struct {
	size, usage, threadID, ownerProcessID uint32
	basePri, deltaPri                     int32
	flags                                 uint32
}

// winSuspend adds CREATE_SUSPENDED to a command's creation flags, keeping the ones already set (hideWindow's).
func winSuspend(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags |= winCreateSuspended
}

// winKernel is winTreeOps over kernel32.
func winKernel() winTreeOps {
	return winTreeOps{
		createJob: func() (uintptr, error) {
			job, _, err := winCreateJobObject.Call(0, 0)
			if job == 0 {
				return 0, fmt.Errorf("CreateJobObjectW: %w", err)
			}
			return job, nil
		},
		assign: func(job uintptr, pid int) error {
			process, err := syscall.OpenProcess(winProcessSetQuota|winProcessTerminate, false, uint32(pid))
			if err != nil {
				return fmt.Errorf("OpenProcess %d: %w", pid, err)
			}
			defer syscall.CloseHandle(process)
			if ok, _, err := winAssignProcess.Call(job, uintptr(process)); ok == 0 {
				return fmt.Errorf("AssignProcessToJobObject %d: %w", pid, err)
			}
			return nil
		},
		resume: winResumeThreads,
		terminate: func(job uintptr) error {
			if ok, _, err := winTerminateJob.Call(job, 1); ok == 0 {
				return fmt.Errorf("TerminateJobObject: %w", err)
			}
			return nil
		},
		closeJob: func(job uintptr) { _ = syscall.CloseHandle(syscall.Handle(job)) },
		taskkill: func(pid int) {
			ctx, stop := context.WithTimeout(context.Background(), winTaskkillBudget)
			defer stop()
			kill := exec.CommandContext(ctx, "taskkill.exe", "/PID", strconv.Itoa(pid), "/T", "/F")
			hideWindow(kill)
			_ = runObservedCommand(kill, func() bool { return ctx.Err() == context.DeadlineExceeded })
		},
		kill: func(pid int) error {
			process, err := syscall.OpenProcess(winProcessTerminate, false, uint32(pid))
			if err != nil {
				return err
			}
			defer syscall.CloseHandle(process)
			return syscall.TerminateProcess(process, 1)
		},
	}
}

// winResumeThreads resumes every thread of pid, found through a Toolhelp snapshot: the start closed the thread handle it could
// have kept. ResumeThread answers the previous suspend count, so a count above 1 is resumed again, at most 16 times.
func winResumeThreads(pid int) error {
	snap, err := syscall.CreateToolhelp32Snapshot(winSnapThread, 0)
	if err != nil {
		return fmt.Errorf("CreateToolhelp32Snapshot: %w", err)
	}
	defer syscall.CloseHandle(snap)
	entry := winThreadEntry{}
	entry.size = uint32(unsafe.Sizeof(entry))
	ok, _, err := winThread32First.Call(uintptr(snap), uintptr(unsafe.Pointer(&entry)))
	if ok == 0 {
		return fmt.Errorf("Thread32First: %w", err)
	}
	resumed := 0
	for ok != 0 {
		if entry.ownerProcessID == uint32(pid) {
			thread, _, err := winOpenThread.Call(uintptr(winThreadSuspendResu), 0, uintptr(entry.threadID))
			if thread == 0 {
				return fmt.Errorf("OpenThread %d: %w", entry.threadID, err)
			}
			previous, _, err := winResumeThread.Call(thread)
			for rounds := 0; previous != 0xFFFFFFFF && previous > 1 && rounds < 16; rounds++ {
				previous, _, err = winResumeThread.Call(thread)
			}
			syscall.CloseHandle(syscall.Handle(thread))
			if previous == 0xFFFFFFFF {
				return fmt.Errorf("ResumeThread %d: %w", entry.threadID, err)
			}
			if previous > 1 {
				return fmt.Errorf("thread %d is still suspended (count %d)", entry.threadID, previous)
			}
			resumed++
		}
		entry.size = uint32(unsafe.Sizeof(entry))
		ok, _, _ = winThread32Next.Call(uintptr(snap), uintptr(unsafe.Pointer(&entry)))
	}
	if resumed == 0 {
		return fmt.Errorf("no thread of %d was found to resume", pid)
	}
	return nil
}
