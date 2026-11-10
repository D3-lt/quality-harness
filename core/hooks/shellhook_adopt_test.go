// ADR-140 T2: shkRun adopts the child it started and hands the deadline the tree it adopted; an adoption that fails is a failed
// start, not a wait until the deadline. The seams are replaced by recorders, so this runs on every platform.
package hooks

import (
	"errors"
	"os/exec"
	"testing"
	"time"
)

func TestShellHookAdoptsWhatItStarted(t *testing.T) {
	sleep, err := exec.LookPath("sleep")
	if err != nil {
		t.Skip("no sleep on PATH")
	}
	adopt, end := shkAdoptTree, shkEndTreeOf
	t.Cleanup(func() { shkAdoptTree, shkEndTreeOf = adopt, end })

	adopted := &winTree{job: 99}
	var adoptedPid int
	var ended *winTree
	shkAdoptTree = func(cmd *exec.Cmd) (*winTree, error) {
		adoptedPid = cmd.Process.Pid
		return adopted, nil
	}
	shkEndTreeOf = func(cmd *exec.Cmd, tree *winTree) {
		ended = tree
		end(cmd, nil)
	}
	res := shkRun(sleep, []string{"5"}, "", 300*time.Millisecond, nil)
	if !res.timedOut || adoptedPid <= 0 || ended != adopted {
		t.Fatalf("timedOut %v, adopted pid %d, ended %p want %p", res.timedOut, adoptedPid, ended, adopted)
	}

	refused := errors.New("adoption refused")
	ended = nil
	shkAdoptTree = func(cmd *exec.Cmd) (*winTree, error) {
		_ = cmd.Process.Kill()
		return nil, refused
	}
	started := time.Now()
	res = shkRun(sleep, []string{"5"}, "", 3*time.Second, nil)
	if !errors.Is(res.err, refused) || res.timedOut || ended != nil || time.Since(started) > 2*time.Second {
		t.Fatalf("err %v, timedOut %v, ended %v after %v: a failed adoption is a failed start", res.err, res.timedOut, ended, time.Since(started))
	}

	// A job that holds a child nothing could resume or end: the hook neither hangs nor keeps the handle.
	release := shkReleaseTreeOf
	t.Cleanup(func() { shkReleaseTreeOf = release })
	held := &winTree{job: 7, held: true}
	var released *winTree
	var left *exec.Cmd
	shkReleaseTreeOf = func(tree *winTree) { released = tree }
	shkAdoptTree = func(cmd *exec.Cmd) (*winTree, error) {
		left = cmd
		return held, refused
	}
	started = time.Now()
	res = shkRun(sleep, []string{"5"}, "", 30*time.Second, nil)
	if left != nil {
		_ = left.Process.Kill()
	}
	if !errors.Is(res.err, refused) || released != held || time.Since(started) > 4*time.Second {
		t.Fatalf("err %v, released %v after %v: an unended child is reaped within its grace and its job released", res.err, released, time.Since(started))
	}
}
