//go:build windows

// BACKLOG §477.2 on Windows: bsRunDrained with a real child and a real grandchild that holds the output pipe after the child
// exits. With the tree's end unable to reach the grandchild, the read blocked on that pipe must end at the deadline through the
// poller (drainPipe's overlapped read end takes a read deadline), and the call must return within its budget with its goroutines
// and handles released while the holder still runs. With the real tree ending, the grandchild is ended and the child's answer
// kept, where bsRun, the runner the observation used, loses it at its 250 ms WaitDelay.
//
// The grandchild says it is running (its own marker, from the branch where it sleeps) and the child publishes both identities only
// after that; a missing marker is a failure, never a pass. Processes are known by pid and creation time (proc_identity_windows_test.go).
package hooks

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

const drainTestBudget = 3 * time.Second

var drainHandleCount = syscall.NewLazyDLL("kernel32.dll").NewProc("GetProcessHandleCount")

func drainHandles(t *testing.T) int {
	t.Helper()
	var count uint32
	if ok, _, err := drainHandleCount.Call(uintptr(^uintptr(0)), uintptr(unsafe.Pointer(&count))); ok == 0 {
		t.Fatalf("GetProcessHandleCount: %v", err)
	}
	return int(count)
}

// TestObservedRunHelper is the child and the grandchild; it does nothing in an ordinary run. "bytes" is a child that writes a
// fixed payload and exits, nothing holding its output.
func TestObservedRunHelper(t *testing.T) {
	marker := os.Getenv("QH_DRAIN_MARKER")
	switch os.Getenv("QH_DRAIN_HELPER") {
	case "":
		return
	case "hold":
		// Running, and about to sleep holding the pipe: only now does the grandchild say so. Thirty seconds outlasts every
		// budget here, and ends a holder that nothing else ends, such as one a go test timeout left.
		if !procMark(marker+".grandchild", procSelf()) {
			os.Exit(95)
		}
		time.Sleep(30 * time.Second)
		os.Exit(0)
	case "bytes":
		os.Stdout.Write(drainPayload())
		os.Stderr.WriteString("said\n")
		os.Exit(0)
	}
	exe, err := os.Executable()
	if err != nil {
		os.Exit(91)
	}
	grandchild := exec.Command(exe, "-test.run=^TestObservedRunHelper$")
	grandchild.Env = append(os.Environ(), "QH_DRAIN_HELPER=hold")
	grandchild.Stdout, grandchild.Stderr = os.Stdout, os.Stderr // holding the pipe after this child exits
	if grandchild.Start() != nil {
		os.Exit(92)
	}
	var running procID
	for deadline := time.Now().Add(5 * time.Second); ; time.Sleep(20 * time.Millisecond) {
		if text, err := os.ReadFile(marker + ".grandchild"); err == nil && json.Unmarshal(text, &running) == nil && running.PID == grandchild.Process.Pid {
			break
		}
		if time.Now().After(deadline) {
			os.Exit(94)
		}
	}
	if !procMark(marker, map[string]procID{"child": procSelf(), "grandchild": running}) {
		os.Exit(93)
	}
	os.Stdout.WriteString("done\n")
	os.Exit(0)
}

// drainPayload is 256 KiB with a position in every line, so a short or reordered read cannot pass as the whole.
func drainPayload() []byte {
	var out bytes.Buffer
	for i := 0; out.Len() < 256<<10; i++ {
		fmt.Fprintf(&out, "%08d %s\n", i, strings.Repeat("x", 55))
	}
	return out.Bytes()
}

// drainRunner is the shape both runners are called through: bsRunDrained, and bsRun, the one the observation used, with no input.
type drainRunner func(timeout time.Duration, dir string, env map[string]string, name string, args ...string) runResult

func drainRefresh(timeout time.Duration, dir string, env map[string]string, name string, args ...string) runResult {
	return bsRun(timeout, dir, env, "", name, args...)
}

// drainRun runs the child that leaves a grandchild holding its output through `run`, and returns the answer, how long it took and
// the child and grandchild as they recorded themselves.
func drainRun(t *testing.T, run drainRunner) (runResult, time.Duration, map[string]procID) {
	t.Helper()
	marker := filepath.Join(t.TempDir(), "started.json")
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	res := run(drainTestBudget, "", map[string]string{"QH_DRAIN_HELPER": "child", "QH_DRAIN_MARKER": marker},
		exe, "-test.run=^TestObservedRunHelper$")
	elapsed := time.Since(started)
	text, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("the child never said its grandchild had started (%v), so nothing about the held read was observed; answer %+v after %v", err, res, elapsed)
	}
	procs := map[string]procID{}
	if json.Unmarshal(text, &procs) != nil || procs["child"].PID <= 0 || procs["child"].Created == 0 ||
		procs["grandchild"].PID <= 0 || procs["grandchild"].Created == 0 {
		t.Fatalf("the marker does not name the child and the grandchild with their creation times: %q", text)
	}
	t.Logf("marker %s, answered status %d, stdout %q, stderr %q, timedOut %v, err %s, after %v (budget %v)",
		text, res.status, res.stdout, res.stderr, res.timedOut, drainErrClass(res.err), elapsed, drainTestBudget)
	return res, elapsed, procs
}

// drainErrClass names an answer's error the way BACKLOG §477.2 needs it told apart.
func drainErrClass(err error) string {
	switch {
	case err == nil:
		return "none"
	case errors.Is(err, exec.ErrWaitDelay):
		return fmt.Sprintf("ErrWaitDelay (%v)", err)
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Sprintf("DeadlineExceeded (%v)", err)
	default:
		return fmt.Sprintf("other %T (%v)", err, err)
	}
}

// The read end drainPipe makes takes a read deadline: a read with the write end still open returns at that deadline, not when the
// write end closes; and the pipe still carries bytes and its end.
func TestObservedPipeTakesADeadline(t *testing.T) {
	read, write, err := drainPipe()
	if err != nil {
		t.Fatalf("drainPipe: %v", err)
	}
	defer read.Close()
	defer write.Close()
	if err := read.SetReadDeadline(time.Now().Add(300 * time.Millisecond)); err != nil {
		t.Fatalf("the read end takes no deadline, so only Close could end its read: %v", err)
	}
	started := time.Now()
	n, err := read.Read(make([]byte, 16))
	elapsed := time.Since(started)
	if n != 0 || !errors.Is(err, os.ErrDeadlineExceeded) {
		t.Fatalf("a read with its write end open answered %d bytes, %v; want the deadline", n, err)
	}
	// A hang guard, not a performance assertion: nothing would end this read but the deadline.
	if elapsed > 3*time.Second {
		t.Fatalf("the read returned after %v; its deadline was 300ms", elapsed)
	}
	if err := read.SetReadDeadline(time.Time{}); err != nil {
		t.Fatal(err)
	}
	if _, err := write.WriteString("said\n"); err != nil {
		t.Fatal(err)
	}
	write.Close()
	if got, err := io.ReadAll(read); err != nil || string(got) != "said\n" {
		t.Fatalf("the pipe gave %q, %v; want \"said\\n\" and its end", got, err)
	}
}

func TestObservedRunEndsAHeldReadAtItsDeadline(t *testing.T) {
	saved := bsWatchTreeOf
	// The child was started suspended (bsEndTree is winSuspend here) and only adoption resumes it: this stub resumes it without
	// putting it in a job, so the tree's end reaches nothing and the grandchild keeps the pipe (the Windows pilot, 2026-11-26).
	bsWatchTreeOf = func(_ context.Context, cmd *exec.Cmd) (func(), error) {
		return func() {}, winKernel().resume(cmd.Process.Pid)
	}
	t.Cleanup(func() { bsWatchTreeOf = saved })
	// The first child a test binary starts costs a one-time set of handles (the Windows pilot, 2026-11-26: 88 before, 108 after,
	// then 108 and 108 on later calls in the same binary); one call before the baseline keeps that out of what this test bounds.
	if exe, err := os.Executable(); err == nil {
		bsRunDrained(drainTestBudget, "", nil, exe, "-test.run=^$")
	}
	handles, goroutines := drainHandles(t), runtime.NumGoroutine()
	res, elapsed, procs := drainRun(t, bsRunDrained)
	// Measured while the holder still holds the pipe: the read was ended by its deadline, not by the holder's exit. Then the
	// holder, the test's own by its creation time, is ended, and must be gone.
	nowGoroutines, nowHandles := runtime.NumGoroutine(), drainHandles(t)
	alive, err := procAlive(procs["grandchild"])
	if err != nil {
		t.Fatalf("whether the held grandchild still runs could not be told: %v", err)
	}
	t.Logf("held grandchild pid %d still running on return: %v; ended by the test: %v", procs["grandchild"].PID, alive,
		alive && procEnd(procs["grandchild"]))
	procGone(t, "held grandchild", procs["grandchild"])
	procGone(t, "child", procs["child"])
	if !alive {
		t.Fatalf("the holder had gone by the time the call returned, so nothing shows the deadline ended the read")
	}
	if !res.timedOut || res.stdout != "" {
		t.Fatalf("output still held at the deadline was read as an answer: %+v", res)
	}
	// A hang guard, not a performance assertion: the grandchild holds the pipe for thirty seconds.
	if elapsed > drainTestBudget+2*time.Second {
		t.Fatalf("the runner took %v; the budget was %v", elapsed, drainTestBudget)
	}
	t.Logf("goroutines %d before, %d after; handles %d before, %d after", goroutines, nowGoroutines, handles, nowHandles)
	// The readers were joined and their pipes closed: nothing the call made is still held once it has returned.
	if nowGoroutines > goroutines+1 {
		t.Fatalf("%d goroutines after the call, %d before it", nowGoroutines, goroutines)
	}
	if nowHandles > handles+4 {
		t.Fatalf("%d handles after the call, %d before it", nowHandles, handles)
	}
}

func TestObservedRunEndsTheTreeAndKeepsTheAnswer(t *testing.T) {
	res, elapsed, procs := drainRun(t, bsRunDrained)
	procGone(t, "grandchild", procs["grandchild"])
	procGone(t, "child", procs["child"])
	if res.timedOut || res.err != nil || res.status != 0 || res.stdout != "done\n" {
		t.Fatalf("a child that finished in time lost its answer after %v: %+v", elapsed, res)
	}
}

// The controlled before/after (the source reviews of this fixture): the runner the observation used, bsRun, whose Windows
// WaitDelay is a fixed 250 ms, and bsRunDrained, on the identical command — a child that answers "done" and exits while a grandchild
// still holds its output, the real tree ending it after Wait — with the same 3 s budget. Two pairs. For each arm the status, the
// error's class, the exact stdout and stderr and the grandchild's identity are logged, and the grandchild is required gone either
// way. bsRunDrained must keep the answer; what bsRun answers is the observation being made, logged and not asserted.
func TestObservedRunKeepsTheAnswerTheRefreshRunnerLoses(t *testing.T) {
	for pair := 1; pair <= 2; pair++ {
		for _, arm := range []struct {
			name string
			run  drainRunner
		}{{"bsRun", drainRefresh}, {"bsRunDrained", bsRunDrained}} {
			t.Run(fmt.Sprintf("pair %d %s", pair, arm.name), func(t *testing.T) {
				res, elapsed, procs := drainRun(t, arm.run)
				procGone(t, "grandchild", procs["grandchild"])
				kept := res.status == 0 && res.err == nil && !res.timedOut && res.stdout == "done\n"
				t.Logf("%s kept the answer: %v (status %d, err %s, after %v)", arm.name, kept, res.status, drainErrClass(res.err), elapsed)
				if arm.name == "bsRunDrained" && !kept {
					t.Fatalf("the drained runner lost the answer of a child that finished in time: %+v", res)
				}
			})
		}
	}
}

// One short integrity check of the drained runner's reading on a larger output: a 256 KiB numbered payload and a stderr line from
// a child that exits at once, returned whole, byte for byte; bsRun's answer on the same command is logged beside it.
func TestObservedRunReadsAWholePayload(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	want, env := drainPayload(), map[string]string{"QH_DRAIN_HELPER": "bytes"}
	refresh := bsRun(drainTestBudget, "", env, "", exe, "-test.run=^TestObservedRunHelper$")
	drained := bsRunDrained(drainTestBudget, "", env, exe, "-test.run=^TestObservedRunHelper$")
	for _, arm := range []struct {
		name string
		r    runResult
	}{{"bsRun", refresh}, {"bsRunDrained", drained}} {
		t.Logf("%s: status %d, %d of %d stdout bytes (exact %v), stderr %q, timedOut %v, err %s", arm.name, arm.r.status,
			len(arm.r.stdout), len(want), arm.r.stdout == string(want), arm.r.stderr, arm.r.timedOut, drainErrClass(arm.r.err))
	}
	if drained.status != 0 || drained.err != nil || drained.timedOut || drained.stdout != string(want) || drained.stderr != "said\n" {
		t.Fatalf("the drained runner did not return the whole payload: status %d, %d of %d bytes, err %v", drained.status, len(drained.stdout), len(want), drained.err)
	}
}
