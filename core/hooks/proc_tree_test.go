//go:build !windows

// BACKLOG §438: run() killed only its direct child at the deadline, and Wait then waited for any grandchild still holding the
// output pipe: `sh -c 'sleep 5 & …; wait'` under a 300ms deadline returned after 5.0 s and left the sleep running. Every hook
// that calls run() (git through git(), the facts-gate dispatch, install-notices, a version probe) kept that exposure; only the
// branch-state runner ended its tree. run() now ends the tree as bsRun does. tests/core-run-tree.test.mjs runs these.
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
	for i := 0; i < 20; i++ {
		if syscall.Kill(pid, 0) != nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	_ = syscall.Kill(pid, syscall.SIGKILL)
	t.Fatalf("the grandchild %d outlived the command run() started", pid)
}

func TestRunEndsTheTree(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "grandchild.pid")
	started := time.Now()
	res := run(300*time.Millisecond, "", nil, "", "sh", "-c", `sleep 5 & echo $! > "$1"; wait`, "sh", pidFile)
	elapsed := time.Since(started)
	if !res.timedOut {
		t.Fatalf("a command past its deadline was not said to time out: %+v", res)
	}
	// A hang guard, not a performance assertion: the grandchild sleeps 5 s, so anything near that is the wait this fixes.
	if elapsed > 3*time.Second {
		t.Fatalf("run() waited %v for a grandchild holding its output; the deadline was 300ms", elapsed)
	}
	runTreeGone(t, pidFile)
}

// The control, and the other half: a command that finishes in time keeps its answer, and what it left running in the
// background is ended with it, as bsRun ends it.
func TestRunEndsWhatAFinishedCommandLeft(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "grandchild.pid")
	res := run(5*time.Second, "", nil, "", "sh", "-c", `sleep 5 >/dev/null 2>&1 & echo $! > "$1"; echo done`, "sh", pidFile)
	if res.status != 0 || strings.TrimSpace(res.stdout) != "done" || res.timedOut {
		t.Fatalf("a command that finished in time lost its answer: %+v", res)
	}
	runTreeGone(t, pidFile)
}
