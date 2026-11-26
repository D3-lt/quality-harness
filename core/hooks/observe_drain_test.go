//go:build !windows

// BACKLOG §477.2: bsRunDrained keeps bsRun's bounds for an observation's git (the deadline, the tree ended once the command
// returns, a grandchild never outliving it) while reading the output itself rather than through WaitDelay. Production selects
// it on Windows only (observeGOOS); the runner is the same on every platform, so its bounds are held here, and the observation's
// own entry, boundedGit, is driven down the Windows path below. The Windows-only half is in observe_drain_windows_test.go.
package hooks

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestObservedRunReadsAllItsOutput(t *testing.T) {
	res := bsRunDrained(10*time.Second, "", nil, "sh", "-c", `head -c 4194304 /dev/zero | tr '\0' a; echo said >&2`)
	if res.status != 0 || res.err != nil || res.timedOut {
		t.Fatalf("a command that finished in time is not a clean answer: status %d err %v timedOut %v", res.status, res.err, res.timedOut)
	}
	if len(res.stdout) != 4194304 || strings.Trim(res.stdout, "a") != "" || res.stderr != "said\n" {
		t.Fatalf("the output was not read whole: %d bytes of stdout, stderr %q", len(res.stdout), res.stderr)
	}
}

func TestObservedRunEndsAtItsDeadline(t *testing.T) {
	started := time.Now()
	res := bsRunDrained(300*time.Millisecond, "", nil, "sh", "-c", `sleep 5`)
	elapsed := time.Since(started)
	if !res.timedOut || res.err == nil {
		t.Fatalf("a command past its deadline was not said to time out: %+v", res)
	}
	// A hang guard, not a performance assertion: the command sleeps 5 s.
	if elapsed > 3*time.Second {
		t.Fatalf("the runner took %v; the deadline was 300ms", elapsed)
	}
}

// A command that exits while a grandchild still holds its output: the tree is ended once Wait returns, the pipes reach their
// end, and the answer is the command's own, well inside the deadline; the grandchild does not outlive it.
func TestObservedRunEndsWhatAFinishedCommandLeft(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "grandchild.pid")
	started := time.Now()
	res := bsRunDrained(10*time.Second, "", nil, "sh", "-c", `sleep 5 & echo $! > "$1"; echo done`, "sh", pidFile)
	elapsed := time.Since(started)
	if res.status != 0 || res.timedOut || strings.TrimSpace(res.stdout) != "done" {
		t.Fatalf("a command that finished in time lost its answer: %+v", res)
	}
	if elapsed > 3*time.Second {
		t.Fatalf("the runner waited %v for a grandchild the tree's end should have ended", elapsed)
	}
	runTreeGone(t, pidFile)
}

// When the tree's end cannot reach a process still holding the pipes, the drain stops at the command's deadline: the call is
// said to have timed out, it costs no more than its budget, and its readers, ended by their read deadline, were joined first.
func TestObservedRunIsBoundedWhenTheTreeCannotBeEnded(t *testing.T) {
	saved := bsWatchTreeOf
	bsWatchTreeOf = func(_ context.Context, _ *exec.Cmd) (func(), error) { return func() {}, nil }
	t.Cleanup(func() { bsWatchTreeOf = saved })
	pidFile := filepath.Join(t.TempDir(), "grandchild.pid")
	goroutines := runtime.NumGoroutine()
	started := time.Now()
	res := bsRunDrained(500*time.Millisecond, "", nil, "sh", "-c", `sleep 5 & echo $! > "$1"; echo done`, "sh", pidFile)
	elapsed := time.Since(started)
	// Read before the holder is ended: a reader its deadline did not end is still blocked on its pipe now. A reader that was
	// ended may still be leaving; it has a moment to.
	left := runtime.NumGoroutine()
	for settle := time.Now().Add(500 * time.Millisecond); left > goroutines && time.Now().Before(settle); left = runtime.NumGoroutine() {
		time.Sleep(10 * time.Millisecond)
	}
	if text, err := os.ReadFile(pidFile); err == nil {
		if pid, err := strconv.Atoi(strings.TrimSpace(string(text))); err == nil {
			_ = syscall.Kill(pid, syscall.SIGKILL)
		}
	} else {
		t.Fatalf("the stub did not record its grandchild: %v", err)
	}
	if !res.timedOut {
		t.Fatalf("output still held at the deadline was read as a finished answer: %+v", res)
	}
	if elapsed > 3*time.Second {
		t.Fatalf("the drain took %v; the deadline was 500ms", elapsed)
	}
	if left > goroutines {
		t.Fatalf("%d goroutines while the holder still ran, %d before the call: a reader was not ended by its read deadline", left, goroutines)
	}
}

// A read that fails before the deadline is not a whole answer, whatever the command's exit: the result carries the error, and
// the observation reads it as "git could not run" (boundedGit), never as the partial output it got.
func TestObservedRunSaysAReadThatFailed(t *testing.T) {
	saved := drainCopy
	drainCopy = func(into io.Writer, from io.Reader) (int64, error) {
		_, _ = io.CopyN(into, from, 2)
		return 2, errors.New("the pipe broke")
	}
	t.Cleanup(func() { drainCopy = saved })
	res := bsRunDrained(10*time.Second, "", nil, "sh", "-c", `echo done`)
	if res.err == nil || !strings.Contains(res.err.Error(), "the pipe broke") || res.timedOut {
		t.Fatalf("a failed read was not said: %+v", res)
	}
	if res.status == 0 {
		t.Fatalf("a failed read was given the command's success: %+v", res)
	}
}

// The trace records what the call answered: a read that failed is not the command's clean exit there either.
func TestObservedRunTracesAReadThatFailed(t *testing.T) {
	saved := drainCopy
	drainCopy = func(io.Writer, io.Reader) (int64, error) { return 0, errors.New("the pipe broke") }
	t.Cleanup(func() { drainCopy = saved })
	file := filepath.Join(t.TempDir(), "trace.jsonl")
	t.Setenv("QUALITY_HARNESS_TRACE_FILE", file)
	t.Setenv("QUALITY_HARNESS_TRACE_UNTIL", strconv.FormatInt(time.Now().Add(time.Minute).UnixMilli(), 10))
	bsRunDrained(10*time.Second, "", nil, "sh", "-c", `echo done`)
	text, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("no trace was written: %v", err)
	}
	if !strings.Contains(string(text), `"execution-error"`) || strings.Contains(string(text), `"completed"`) {
		t.Fatalf("a failed read was traced as a clean exit: %s", text)
	}
}

// BACKLOG §477.2 through the observation's own entry. boundedGit, with the Windows path selected, runs a `git` that answers and exits
// while a process it started still holds its output. The drained runner keeps the answer and the tree's end removes the holder.
// Routed back to git() (bsRun, whose WaitDelay off Windows is the command's whole timeout) the call waits for the holder until its
// budget is spent and the observation fails: the routing is what this test holds.
func TestObservationKeepsTheAnswerOfAGitThatLeavesAHolder(t *testing.T) {
	dir := t.TempDir()
	pidFile := filepath.Join(dir, "holder.pid")
	script := "#!/bin/sh\n/bin/sleep 5 &\necho $! > \"$QH_HOLDER_PID\"\necho done\n"
	if err := os.WriteFile(filepath.Join(dir, "git"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)
	t.Setenv("QH_HOLDER_PID", pidFile)
	saved := observeGOOS
	observeGOOS = "windows"
	t.Cleanup(func() { observeGOOS = saved })
	started := time.Now()
	r, err := boundedGit(dir, started, 3000)([]string{"rev-parse", "HEAD"}, nil)
	elapsed := time.Since(started)
	if err != nil || r.status != 0 || r.stdout != "done\n" {
		t.Fatalf("the observation lost the answer of a git that finished in time: err %v, %+v after %v", err, r, elapsed)
	}
	// A hang guard, not a performance assertion: the holder sleeps 5 s, and the budget is 3 s.
	if elapsed > 2*time.Second {
		t.Fatalf("the observation waited %v for a holder the tree's end should have ended", elapsed)
	}
	runTreeGone(t, pidFile)
}
