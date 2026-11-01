//go:build !windows

package hooks

import (
	"os"
	"os/exec"
	"syscall"
)

// shkOwnTree puts the gate in a process group of its own, as Node's `detached: true` does, so the deadline can end everything
// it started (ADR-136 Decision 3, the group ADR-135's bsEndTree makes; bsEndTree's Cancel needs a command context this runner
// does not use).
func shkOwnTree(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
}

// shkEndTree is terminateProcessTree: SIGKILL to the gate's group, and to the gate alone when the group cannot be signalled.
// The group outlives its leader while any member lives, so its id cannot name another group here.
func shkEndTree(cmd *exec.Cmd) {
	if syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) != nil {
		_ = cmd.Process.Kill()
	}
}

// shkSignalNames are the names Node gives a child's terminating signal; the numbers behind them differ by OS, the names do not.
var shkSignalNames = map[syscall.Signal]string{
	syscall.SIGHUP: "SIGHUP", syscall.SIGINT: "SIGINT", syscall.SIGQUIT: "SIGQUIT", syscall.SIGILL: "SIGILL",
	syscall.SIGTRAP: "SIGTRAP", syscall.SIGABRT: "SIGABRT", syscall.SIGBUS: "SIGBUS", syscall.SIGFPE: "SIGFPE",
	syscall.SIGKILL: "SIGKILL", syscall.SIGUSR1: "SIGUSR1", syscall.SIGSEGV: "SIGSEGV", syscall.SIGUSR2: "SIGUSR2",
	syscall.SIGPIPE: "SIGPIPE", syscall.SIGALRM: "SIGALRM", syscall.SIGTERM: "SIGTERM", syscall.SIGCHLD: "SIGCHLD",
	syscall.SIGCONT: "SIGCONT", syscall.SIGSTOP: "SIGSTOP", syscall.SIGTSTP: "SIGTSTP", syscall.SIGTTIN: "SIGTTIN",
	syscall.SIGTTOU: "SIGTTOU", syscall.SIGURG: "SIGURG", syscall.SIGXCPU: "SIGXCPU", syscall.SIGXFSZ: "SIGXFSZ",
	syscall.SIGVTALRM: "SIGVTALRM", syscall.SIGPROF: "SIGPROF", syscall.SIGWINCH: "SIGWINCH", syscall.SIGIO: "SIGIO",
	syscall.SIGSYS: "SIGSYS",
}

// shkSignalName is the `signal` Node's `close` reports: the name of the signal that killed the child, "" when it exited.
func shkSignalName(state *os.ProcessState) string {
	status, ok := state.Sys().(syscall.WaitStatus)
	if !ok || !status.Signaled() {
		return ""
	}
	if name, ok := shkSignalNames[status.Signal()]; ok {
		return name
	}
	return status.Signal().String()
}

// shkPlatformSpawnCode has nothing to add on Unix: the errno cases in shkSpawnCode are libuv's names there.
func shkPlatformSpawnCode(err error) (string, bool) { return "", false }
