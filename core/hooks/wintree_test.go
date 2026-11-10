// ADR-140 T1: every branch of the Windows job-tree routine, driven by fakes so it runs on every platform.
package hooks

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"
)

// winFake records the kernel calls in order; each refuse* field makes that call fail.
type winFake struct {
	calls                                                  []string
	refuseJob, refuseAssign, refuseResume, refuseTerminate bool
}

func (f *winFake) ops() winTreeOps {
	fail := func(refuse bool, name string) error {
		f.calls = append(f.calls, name)
		if refuse {
			return errors.New(name + " refused")
		}
		return nil
	}
	return winTreeOps{
		createJob: func() (uintptr, error) { return 7, fail(f.refuseJob, "createJob") },
		assign:    func(job uintptr, pid int) error { return fail(f.refuseAssign, "assign") },
		resume:    func(pid int) error { return fail(f.refuseResume, "resume") },
		terminate: func(job uintptr) error { return fail(f.refuseTerminate, "terminate") },
		closeJob:  func(job uintptr) { f.calls = append(f.calls, "closeJob") },
		taskkill:  func(pid int) { f.calls = append(f.calls, "taskkill") },
		kill:      func(pid int) error { return fail(false, "kill") },
	}
}

func TestWinTreeAdoptResumesWhateverTheJob(t *testing.T) {
	for _, c := range []struct {
		name  string
		fake  winFake
		held  bool
		calls []string
	}{
		{"job taken", winFake{}, true, []string{"createJob", "assign", "resume"}},
		{"no job", winFake{refuseJob: true}, false, []string{"createJob", "resume"}},
		{"assignment refused", winFake{refuseAssign: true}, false, []string{"createJob", "assign", "closeJob", "resume"}},
	} {
		tree, err := winAdopt(c.fake.ops(), 42)
		if err != nil || tree.held != c.held || !reflect.DeepEqual(c.fake.calls, c.calls) {
			t.Errorf("%s: err %v, held %v, calls %v; want held %v, calls %v", c.name, err, tree.held, c.fake.calls, c.held, c.calls)
		}
	}
}

func TestWinTreeAdoptKillsWhatItCannotResume(t *testing.T) {
	fake := winFake{refuseResume: true}
	_, err := winAdopt(fake.ops(), 42)
	if err == nil || !reflect.DeepEqual(fake.calls, []string{"createJob", "assign", "resume", "kill"}) {
		t.Fatalf("err %v, calls %v: a child that cannot be resumed is killed and the failure returned", err, fake.calls)
	}
}

func TestWinTreeEndPrefersTheJob(t *testing.T) {
	fake := winFake{}
	winEnd(fake.ops(), &winTree{job: 7, held: true}, 42)
	if !reflect.DeepEqual(fake.calls, []string{"terminate"}) {
		t.Fatalf("calls %v: a job that terminates needs no taskkill", fake.calls)
	}
}

func TestWinTreeEndFallsBackToTaskkill(t *testing.T) {
	refused := winFake{refuseTerminate: true}
	winEnd(refused.ops(), &winTree{job: 7, held: true}, 42)
	none := winFake{}
	winEnd(none.ops(), &winTree{}, 42)
	nilTree := winFake{}
	winEnd(nilTree.ops(), nil, 42)
	got := [][]string{refused.calls, none.calls, nilTree.calls}
	want := [][]string{{"terminate", "taskkill"}, {"taskkill"}, {"taskkill"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("calls %v, want %v", got, want)
	}
}

func TestWinTreeReleaseClosesOnlyAHeldJob(t *testing.T) {
	held := winFake{}
	winRelease(held.ops(), &winTree{job: 7, held: true})
	none := winFake{}
	winRelease(none.ops(), &winTree{})
	winRelease(none.ops(), nil)
	if !reflect.DeepEqual(held.calls, []string{"closeJob"}) || len(none.calls) != 0 {
		t.Fatalf("held %v, none %v", held.calls, none.calls)
	}
}

func TestWinTreeWatchEndsAtTheDeadline(t *testing.T) {
	var mu sync.Mutex
	fake := winFake{}
	ops := fake.ops()
	terminate := ops.terminate
	ended := make(chan struct{})
	ops.terminate = func(job uintptr) error {
		mu.Lock()
		defer mu.Unlock()
		defer close(ended)
		return terminate(job)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	cleanup, err := winWatch(ops, ctx, 42)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-ended:
	case <-time.After(5 * time.Second):
		t.Fatal("the deadline did not end the job")
	}
	cleanup()
	mu.Lock()
	defer mu.Unlock()
	if want := []string{"createJob", "assign", "resume", "terminate", "closeJob"}; !reflect.DeepEqual(fake.calls, want) {
		t.Fatalf("calls %v, want %v", fake.calls, want)
	}
}

func TestWinTreeWatchEndsWhatTheCommandLeft(t *testing.T) {
	fake := winFake{}
	cleanup, err := winWatch(fake.ops(), context.Background(), 42)
	if err != nil {
		t.Fatal(err)
	}
	cleanup()
	if want := []string{"createJob", "assign", "resume", "terminate", "closeJob"}; !reflect.DeepEqual(fake.calls, want) {
		t.Fatalf("calls %v, want %v", fake.calls, want)
	}
}

func TestWinTreeWatchKillsWhatItCannotResume(t *testing.T) {
	fake := winFake{refuseResume: true}
	cleanup, err := winWatch(fake.ops(), context.Background(), 42)
	if err == nil {
		t.Fatal("a command that could not be resumed is a failed run")
	}
	cleanup()
	if want := []string{"createJob", "assign", "resume", "kill", "terminate", "closeJob"}; !reflect.DeepEqual(fake.calls, want) {
		t.Fatalf("calls %v, want %v", fake.calls, want)
	}
}
