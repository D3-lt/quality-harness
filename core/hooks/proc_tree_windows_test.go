//go:build windows

// ADR-140: proc_tree_test.go's two scenarios on Windows, where run()'s tree is a job object. Git Bash starts the grandchild, as
// an edit gate's bash does: an MSYS start leaves its Windows parent dead, which is the shape `taskkill /T` could not end
// (BACKLOG §440). tests/core-run-tree.test.mjs runs these by the same names as the Unix pair.
package hooks

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// winTestBash is the Git Bash the edit gates run.
func winTestBash(t *testing.T) string {
	t.Helper()
	bash, ok := shkResolveBash("win32", os.LookupEnv, func(p string) bool { _, err := os.Stat(p); return err == nil })
	if !ok {
		t.Fatal("no Git Bash was found")
	}
	return bash
}

// winAlive is whether pid names a running process: OpenProcess fails once it is gone, and its exit code is STILL_ACTIVE (259)
// while it runs.
func winAlive(pid int) bool {
	process, err := syscall.OpenProcess(0x1000, false, uint32(pid)) // PROCESS_QUERY_LIMITED_INFORMATION
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(process)
	var code uint32
	return syscall.GetExitCodeProcess(process, &code) == nil && code == 259
}

func runTreeGone(t *testing.T, pidFile string) {
	t.Helper()
	text, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatalf("the stub did not record its grandchild: %v", err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(text)))
	if err != nil {
		t.Fatalf("the grandchild pid is not a number: %q", text)
	}
	for i := 0; i < 40; i++ {
		if !winAlive(pid) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	if process, err := syscall.OpenProcess(0x0001, false, uint32(pid)); err == nil {
		_ = syscall.TerminateProcess(process, 1)
		syscall.CloseHandle(process)
	}
	t.Fatalf("the grandchild %d outlived the command run() started", pid)
}

func TestRunEndsTheTree(t *testing.T) {
	pidFile := filepath.ToSlash(filepath.Join(t.TempDir(), "grandchild.pid"))
	started := time.Now()
	res := run(2*time.Second, "", nil, "", winTestBash(t), "-c", `sleep 20 & cat /proc/$!/winpid > "$1"; wait`, "bash", pidFile)
	elapsed := time.Since(started)
	if !res.timedOut {
		t.Fatalf("a command past its deadline was not said to time out: %+v", res)
	}
	// A hang guard: the grandchild sleeps 20 s, so anything near that is the wait this fixes.
	if elapsed > 10*time.Second {
		t.Fatalf("run() waited %v for a grandchild holding its output; the deadline was 2s", elapsed)
	}
	runTreeGone(t, pidFile)
}

func TestRunEndsWhatAFinishedCommandLeft(t *testing.T) {
	pidFile := filepath.ToSlash(filepath.Join(t.TempDir(), "grandchild.pid"))
	res := run(10*time.Second, "", nil, "", winTestBash(t), "-c", `sleep 20 >/dev/null 2>&1 & cat /proc/$!/winpid > "$1"; echo done`, "bash", pidFile)
	if res.status != 0 || strings.TrimSpace(res.stdout) != "done" || res.timedOut {
		t.Fatalf("a command that finished in time lost its answer: %+v", res)
	}
	runTreeGone(t, pidFile)
}
