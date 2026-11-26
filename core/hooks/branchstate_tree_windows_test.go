//go:build windows

// BACKLOG §477.1: branchstate_tree_test.go's two scenarios on Windows, under the same names, so tests/branch-state-collect.test.mjs
// requires them here too. ADR-135 Decision 2 says nothing a due brief's refresh starts outlives the hook; the end-to-end test
// (tests/branch-state-native.test.mjs) cannot show that under load, because there the git half can spend the whole 2 s and `gh`
// is never started. These drive the refresh's own runner (bsBudgeted over bsShell, so bsRun and its job object, ADR-140) on a
// child whose grandchild says it is running (its own marker, from the branch where it sleeps), and a child that publishes both
// identities only after that. A missing marker is a failure that names the child as never started, never a kill that worked.
//
// Each process is known by its pid AND its creation time, which it records itself, so a pid Windows has reused names another
// process and is not mistaken for, or ended as, the one the test started (the Codex review of ccffe983e). A liveness query that
// fails is "could not tell", a failure, never "gone". Whether the descendants are gone, what the command answered and whether it
// returned in time are three sibling subtests, the descendants first and whatever the answer.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// bsTreeBudgetMs is the budget these tests give the runner: long enough for the helper and its grandchild to start on a loaded
// runner, and short enough that the hang guard below still means something. It is the test's, not the product's 2 s (CLAUDE.md §7).
const bsTreeBudgetMs = 6000.0

// bsTreeProc is a process as it recorded itself: its pid, and its creation time in nanoseconds since 1601 (GetProcessTimes).
type bsTreeProc struct {
	PID     int   `json:"pid"`
	Created int64 `json:"created"`
}

func bsTreeSelf() bsTreeProc {
	var created, exited, kernel, user syscall.Filetime
	self, _ := syscall.GetCurrentProcess()
	if syscall.GetProcessTimes(self, &created, &exited, &kernel, &user) != nil {
		return bsTreeProc{PID: os.Getpid()}
	}
	return bsTreeProc{PID: os.Getpid(), Created: created.Nanoseconds()}
}

// bsTreeWrite publishes a marker whole: a reader sees the file only once it is complete.
func bsTreeWrite(path string, value any) bool {
	text, err := json.Marshal(value)
	return err == nil && os.WriteFile(path+".tmp", text, 0600) == nil && os.Rename(path+".tmp", path) == nil
}

// TestBranchStateTreeHelper is the child and the grandchild: QH_BS_TREE_HELPER says which part it plays, and an ordinary run
// does nothing.
func TestBranchStateTreeHelper(t *testing.T) {
	mode := os.Getenv("QH_BS_TREE_HELPER")
	if mode == "" {
		return
	}
	ready := os.Getenv("QH_BS_TREE_MARKER") + ".grandchild"
	if mode == "grandchild" {
		// Running, and about to sleep: only now does the grandchild say so.
		if !bsTreeWrite(ready, bsTreeSelf()) {
			os.Exit(95)
		}
		time.Sleep(time.Hour)
		os.Exit(0)
	}
	exe, err := os.Executable()
	if err != nil {
		os.Exit(91)
	}
	grandchild := exec.Command(exe, "-test.run=^TestBranchStateTreeHelper$")
	grandchild.Env = append(os.Environ(), "QH_BS_TREE_HELPER=grandchild")
	if mode != "exit-redirected" {
		// Holding the output pipe, as a credential helper or a pager under `gh` would.
		grandchild.Stdout, grandchild.Stderr = os.Stdout, os.Stderr
	}
	if err := grandchild.Start(); err != nil {
		os.Exit(92)
	}
	var running bsTreeProc
	for deadline := time.Now().Add(5 * time.Second); ; time.Sleep(20 * time.Millisecond) {
		if text, err := os.ReadFile(ready); err == nil && json.Unmarshal(text, &running) == nil && running.PID == grandchild.Process.Pid {
			break
		}
		if time.Now().After(deadline) {
			os.Exit(94)
		}
	}
	if !bsTreeWrite(os.Getenv("QH_BS_TREE_MARKER"), map[string]bsTreeProc{"child": bsTreeSelf(), "grandchild": running}) {
		os.Exit(93)
	}
	if mode == "block" {
		time.Sleep(time.Hour)
	}
	os.Exit(0)
}

// bsTreeRun runs the helper in `mode` through the refresh's runner and returns its answer, how long it took, and the processes its
// marker names. No marker fails the test: the child never said both had started, so nothing about ending them was observed.
func bsTreeRun(t *testing.T, mode string) (bsAnswer, time.Duration, map[string]bsTreeProc) {
	t.Helper()
	marker := filepath.Join(t.TempDir(), "started.json")
	t.Setenv("QH_BS_TREE_HELPER", mode)
	t.Setenv("QH_BS_TREE_MARKER", marker)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	run := bsBudgeted(bsTreeBudgetMs, bsShell, bsNowMs, "")
	started := time.Now()
	answer := run([]string{exe, "-test.run=^TestBranchStateTreeHelper$"}, bsOpts{})
	elapsed := time.Since(started)
	text, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("the child never said it and its grandchild had started within the %v ms budget (%v), so nothing about ending them was observed; answer %+v after %v",
			bsTreeBudgetMs, err, answer, elapsed)
	}
	procs := map[string]bsTreeProc{}
	if err := json.Unmarshal(text, &procs); err != nil || procs["child"].PID <= 0 || procs["grandchild"].PID <= 0 ||
		procs["child"].Created <= 0 || procs["grandchild"].Created <= 0 {
		t.Fatalf("the marker does not name both processes with their creation times: %q", text)
	}
	t.Logf("mode %s: marker %s, answer %+v after %v", mode, text, answer, elapsed)
	return answer, elapsed, procs
}

// bsTreeState says whether the process the test started is gone or still running; an error is "could not tell". A pid that now
// names a process created at another time is the original gone, the pid reused.
func bsTreeState(p bsTreeProc) (alive bool, err error) {
	// PROCESS_QUERY_LIMITED_INFORMATION; ERROR_INVALID_PARAMETER (87) is the answer for a pid no process has.
	handle, err := syscall.OpenProcess(0x1000, false, uint32(p.PID))
	if err == syscall.Errno(87) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("OpenProcess(%d): %v", p.PID, err)
	}
	defer syscall.CloseHandle(handle)
	var created, exited, kernel, user syscall.Filetime
	if err := syscall.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return false, fmt.Errorf("GetProcessTimes(%d): %v", p.PID, err)
	}
	if created.Nanoseconds() != p.Created {
		return false, nil
	}
	var code uint32
	if err := syscall.GetExitCodeProcess(handle, &code); err != nil {
		return false, fmt.Errorf("GetExitCodeProcess(%d): %v", p.PID, err)
	}
	return code == 259, nil // STILL_ACTIVE
}

// bsTreeEnd ends a survivor, but only the process the test started: the handle that terminates it is the one whose creation
// time was checked.
func bsTreeEnd(p bsTreeProc) {
	handle, err := syscall.OpenProcess(0x1000|0x0001, false, uint32(p.PID)) // QUERY_LIMITED_INFORMATION | TERMINATE
	if err != nil {
		return
	}
	defer syscall.CloseHandle(handle)
	var created, exited, kernel, user syscall.Filetime
	if syscall.GetProcessTimes(handle, &created, &exited, &kernel, &user) == nil && created.Nanoseconds() == p.Created {
		_ = syscall.TerminateProcess(handle, 1)
	}
}

// bsTreeGone requires both processes to be gone within two seconds of the runner's return; one still running, or one whose state
// could not be read, fails.
func bsTreeGone(t *testing.T, procs map[string]bsTreeProc) {
	t.Helper()
	for _, role := range []string{"child", "grandchild"} {
		p := procs[role]
		var alive bool
		var err error
		for i := 0; i < 40; i++ {
			if alive, err = bsTreeState(p); err != nil || !alive {
				break
			}
			time.Sleep(50 * time.Millisecond)
		}
		if err != nil {
			bsTreeEnd(p)
			t.Fatalf("whether the %s (pid %d) is gone could not be told: %v", role, p.PID, err)
		}
		if alive {
			bsTreeEnd(p)
			t.Fatalf("the %s (pid %d) outlived the command the refresh's runner started", role, p.PID)
		}
	}
}

// bsTreeObserved reports the three observations of one run, each its own subtest: the descendants first and whatever the answer,
// then the answer with the reason the runner gave, then the hang guard.
func bsTreeObserved(t *testing.T, mode string, wantOK bool, wantNote string) {
	answer, elapsed, procs := bsTreeRun(t, mode)
	t.Run("descendants gone", func(t *testing.T) { bsTreeGone(t, procs) })
	t.Run("answer", func(t *testing.T) {
		note, _ := answer.Note.(string) // a string, or nil where the runner gave none
		if answer.OK != wantOK || !strings.Contains(note, wantNote) {
			t.Fatalf("answered ok=%v note %q, want ok=%v with %q: %+v", answer.OK, note, wantOK, wantNote, answer)
		}
	})
	t.Run("returned in time", func(t *testing.T) {
		// A hang guard, not a performance assertion: the helper and its grandchild sleep an hour.
		if elapsed > time.Duration(bsTreeBudgetMs)*time.Millisecond+5*time.Second {
			t.Fatalf("the runner took %v; the budget was %v ms", elapsed, bsTreeBudgetMs)
		}
	})
}

func TestBranchStateCollectEndsTheTree(t *testing.T) {
	// Killed at its deadline: not ok, and the runner says it timed out.
	bsTreeObserved(t, "block", false, "ETIMEDOUT")
}

func TestBranchStateCollectEndsTheTreeAfterAnEarlyExit(t *testing.T) {
	// Holding the pipe: Wait gives up after bsPipeWait, not at the deadline, and says so; then the tree ends.
	t.Run("holding the pipe", func(t *testing.T) {
		bsTreeObserved(t, "exit-holding", false, "WaitDelay expired before I/O complete")
	})
	// Output redirected: the command is done at once, and what it left behind is ended with it.
	t.Run("output redirected", func(t *testing.T) { bsTreeObserved(t, "exit-redirected", true, "") })
}
