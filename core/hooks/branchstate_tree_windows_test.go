//go:build windows

// BACKLOG §477.1: branchstate_tree_test.go's two scenarios on Windows, under the same names, so tests/branch-state-collect.test.mjs
// requires them here too. ADR-135 Decision 2 says nothing a due brief's refresh starts outlives the hook; the end-to-end test
// (tests/branch-state-native.test.mjs) cannot show that under load, because there the git half can spend the whole 2 s and `gh`
// is never started. These drive the refresh's own runner (bsBudgeted over bsShell, so bsRun and its job object, ADR-140) on a
// child that says it has started, a marker written only once it and its grandchild are running. A missing marker is a failure
// that names the child as never started: it is never read as a kill that worked.
//
// Whether the descendants are gone and what the command answered are two observations, each its own subtest: the first is the
// cleanup this file exists for, and is asserted whatever the answer was; the second is the runner's answer, which under
// starvation on Windows can be BACKLOG §477.2's WaitDelay and is reported as itself.
package hooks

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// bsTreeBudgetMs is the budget these tests give the runner: long enough for the helper and its grandchild to start on a loaded
// runner, and short enough that the hang guard below still means something. It is the test's, not the product's 2 s (CLAUDE.md §7).
const bsTreeBudgetMs = 6000.0

// TestBranchStateTreeHelper is the child: QH_BS_TREE_HELPER says which part it plays, and does nothing in an ordinary run.
func TestBranchStateTreeHelper(t *testing.T) {
	mode := os.Getenv("QH_BS_TREE_HELPER")
	if mode == "" {
		return
	}
	if mode == "grandchild" {
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
	marker := os.Getenv("QH_BS_TREE_MARKER")
	value, _ := json.Marshal(map[string]int{"child": os.Getpid(), "grandchild": grandchild.Process.Pid})
	if os.WriteFile(marker+".tmp", value, 0600) != nil || os.Rename(marker+".tmp", marker) != nil {
		os.Exit(93)
	}
	if mode == "block" {
		time.Sleep(time.Hour)
	}
	os.Exit(0)
}

// bsTreeRun runs the helper in `mode` through the refresh's runner and returns its answer, how long it took, and the pids its
// marker names. No marker fails the test: the child never said it had started, so nothing about ending it was observed.
func bsTreeRun(t *testing.T, mode string) (bsAnswer, time.Duration, map[string]int) {
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
		t.Fatalf("the child never said it had started within the %v ms budget (%v), so nothing about ending it was observed; answer %+v after %v",
			bsTreeBudgetMs, err, answer, elapsed)
	}
	pids := map[string]int{}
	if err := json.Unmarshal(text, &pids); err != nil || pids["child"] <= 0 || pids["grandchild"] <= 0 {
		t.Fatalf("the marker does not name both processes: %q", text)
	}
	t.Logf("mode %s: marker %s, answer %+v after %v", mode, text, answer, elapsed)
	// A hang guard, not a performance assertion: the helper and its grandchild sleep an hour.
	if elapsed > time.Duration(bsTreeBudgetMs)*time.Millisecond+5*time.Second {
		t.Fatalf("the runner took %v; the budget was %v ms", elapsed, bsTreeBudgetMs)
	}
	return answer, elapsed, pids
}

// bsTreeGone requires every named process to be gone within two seconds, and ends any that is not before failing.
func bsTreeGone(t *testing.T, pids map[string]int) {
	t.Helper()
	for _, role := range []string{"child", "grandchild"} {
		pid := pids[role]
		gone := false
		for i := 0; i < 40 && !gone; i++ {
			if gone = !winAlive(pid); !gone {
				time.Sleep(50 * time.Millisecond)
			}
		}
		if !gone {
			if process, err := syscall.OpenProcess(0x0001, false, uint32(pid)); err == nil { // PROCESS_TERMINATE
				_ = syscall.TerminateProcess(process, 1)
				syscall.CloseHandle(process)
			}
			t.Fatalf("the %s (pid %d) outlived the command the refresh's runner started", role, pid)
		}
	}
}

// bsTreeObserved reports the two observations of one run, the descendants first, each as its own subtest.
func bsTreeObserved(t *testing.T, mode string, wantOK bool) {
	answer, _, pids := bsTreeRun(t, mode)
	t.Run("descendants gone", func(t *testing.T) { bsTreeGone(t, pids) })
	t.Run("answer", func(t *testing.T) {
		if answer.OK != wantOK {
			t.Fatalf("answered ok=%v, want %v: %+v", answer.OK, wantOK, answer)
		}
	})
}

func TestBranchStateCollectEndsTheTree(t *testing.T) {
	// Killed at its deadline: the answer is not ok.
	bsTreeObserved(t, "block", false)
}

func TestBranchStateCollectEndsTheTreeAfterAnEarlyExit(t *testing.T) {
	// Holding the pipe: Wait gives up after bsPipeWait, and the answer is not ok; then the tree ends.
	t.Run("holding the pipe", func(t *testing.T) { bsTreeObserved(t, "exit-holding", false) })
	// Output redirected: the command is done at once, and what it left behind is ended with it.
	t.Run("output redirected", func(t *testing.T) { bsTreeObserved(t, "exit-redirected", true) })
}
