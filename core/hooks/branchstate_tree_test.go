//go:build !windows

// ADR-135 Decision 2 says nothing outlives the hook and the refresh has a hard budget. A command killed at its deadline is
// only half of that: exec.CommandContext kills the direct child, and Wait then waits for every process still holding its
// output pipe, so a grandchild (a `gh` credential helper, a pager, `sleep &` in a stub) kept the hook past its budget and
// itself alive after it. Named after the collector so tests/branch-state-collect.test.mjs runs it.
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

func TestBranchStateCollectEndsTheTree(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "grandchild.pid")
	started := time.Now()
	answer := bsShell([]string{"sh", "-c", `sleep 5 & echo $! > "$1"; wait`, "sh", pidFile}, bsOpts{Timeout: 300 * time.Millisecond})
	elapsed := time.Since(started)
	if answer.OK {
		t.Fatalf("a command killed at its deadline answered ok: %+v", answer)
	}
	// A hang guard, not a performance assertion: the grandchild sleeps 5 s, so anything near that is the wait this fixes.
	if elapsed > 3*time.Second {
		t.Fatalf("the runner waited %v for a grandchild holding its output; the deadline was 300ms", elapsed)
	}
	text, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatalf("the stub did not record its grandchild: %v", err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(text)))
	if err != nil {
		t.Fatalf("the grandchild pid is not a number: %q", text)
	}
	gone := false
	for i := 0; i < 20 && !gone; i++ {
		gone = syscall.Kill(pid, 0) != nil
		if !gone {
			time.Sleep(50 * time.Millisecond)
		}
	}
	if !gone {
		_ = syscall.Kill(pid, syscall.SIGKILL)
		t.Fatalf("the grandchild %d outlived the command its parent was killed for", pid)
	}
}
