// BACKLOG §465: the process-trace rows a failed job adoption and an unconfirmed cleanup write. When a child outlives winReap's
// grace, or shkRun settles without the child's close, a Wait is still in flight and may write ProcessState, so the trace is
// handed a stand-in with no state (the Codex verification of aab0a182); these rows were checked by reading the code only.
package hooks

import (
	"context"
	"errors"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func traceRowsTest(t *testing.T) (string, string) {
	t.Helper()
	sleep, err := exec.LookPath("sleep")
	if err != nil {
		t.Skip("no sleep on PATH")
	}
	return sleep, filepath.Join(t.TempDir(), "trace.jsonl")
}

// phasesOf reads the trace and returns its phases in order, with the last row.
func phasesOf(t *testing.T, file string) ([]string, map[string]any) {
	t.Helper()
	rows := readNativeTrace(t, file)
	var phases []string
	for _, row := range rows {
		phases = append(phases, row["phase"].(string))
	}
	return phases, rows[len(rows)-1]
}

func TestHookTraceRowsOnAdoptionAndCleanup(t *testing.T) {
	adopt, end, release, watch := shkAdoptTree, shkEndTreeOf, shkReleaseTreeOf, bsWatchTreeOf
	t.Cleanup(func() { shkAdoptTree, shkEndTreeOf, shkReleaseTreeOf, bsWatchTreeOf = adopt, end, release, watch })
	refused := errors.New("adoption refused")

	t.Run("shkRun: an adoption fails and the child outlives the grace", func(t *testing.T) {
		sleep, file := traceRowsTest(t)
		var left *exec.Cmd
		shkAdoptTree = func(cmd *exec.Cmd) (*winTree, error) { left = cmd; return nil, refused }
		res := shkRun(sleep, []string{"5"}, "", 30*time.Second, environ(nativeTraceEnv(file, "")))
		if left != nil {
			_ = left.Process.Kill()
		}
		phases, last := phasesOf(t, file)
		if !errors.Is(res.err, refused) || len(phases) != 2 || phases[0] != "attempt" || phases[1] != "ended" ||
			last["outcome"] != "start-error" || last["childPid"] != nil || last["status"] != nil {
			t.Fatalf("err %v, phases %v, last %v", res.err, phases, last)
		}
	})

	t.Run("shkRun: an adoption fails and the child is ended within the grace", func(t *testing.T) {
		sleep, file := traceRowsTest(t)
		shkAdoptTree = func(cmd *exec.Cmd) (*winTree, error) { _ = cmd.Process.Kill(); return nil, refused }
		res := shkRun(sleep, []string{"5"}, "", 30*time.Second, environ(nativeTraceEnv(file, "")))
		phases, last := phasesOf(t, file)
		if !errors.Is(res.err, refused) || len(phases) != 2 || last["outcome"] != "execution-error" {
			t.Fatalf("err %v, phases %v, last %v", res.err, phases, last)
		}
	})

	t.Run("shkRun: the cleanup is unconfirmed", func(t *testing.T) {
		sleep, file := traceRowsTest(t)
		var left *exec.Cmd
		shkAdoptTree = func(cmd *exec.Cmd) (*winTree, error) { left = cmd; return nil, nil }
		shkEndTreeOf = func(*exec.Cmd, *winTree) {}
		res := shkRun(sleep, []string{"5"}, "", 200*time.Millisecond, environ(nativeTraceEnv(file, "")))
		if left != nil {
			_ = left.Process.Kill()
		}
		shkEndTreeOf = end
		phases, last := phasesOf(t, file)
		if !res.cleanupUnconfirmed || len(phases) != 3 || phases[1] != "started" || last["outcome"] != "timeout" ||
			last["timedOut"] != true || last["status"] != nil || last["userCpuNs"] != nil || last["childPid"] == nil {
			t.Fatalf("unconfirmed %v, phases %v, last %v", res.cleanupUnconfirmed, phases, last)
		}
	})

	t.Run("bsRun: an adoption fails and the child outlives the grace", func(t *testing.T) {
		sleep, file := traceRowsTest(t)
		var left *exec.Cmd
		bsWatchTreeOf = func(_ context.Context, cmd *exec.Cmd) (func(), error) { left = cmd; return func() {}, refused }
		res := bsRun(30*time.Second, "", nativeTraceEnv(file, ""), "", sleep, "5")
		if left != nil {
			_ = left.Process.Kill()
		}
		bsWatchTreeOf = watch
		phases, last := phasesOf(t, file)
		if !errors.Is(res.err, refused) || len(phases) != 3 || phases[1] != "started" || last["outcome"] != "start-error" ||
			last["childPid"] == nil || last["status"] != nil {
			t.Fatalf("err %v, phases %v, last %v", res.err, phases, last)
		}
	})
}
