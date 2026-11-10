// ADR-140: how the core ends a child's whole tree on Windows. `taskkill /T` walks parent links, and an MSYS start (fork, then
// exec) leaves the started program's parent dead, so a gate's `sleep` outlived it (BACKLOG §440). A job object holds every
// process the child starts whatever its parent link, so ending the job ends the tree. This is plugin/lib/fence.py's measured
// design (WindowsJob, 2026-09-05): start the child suspended, assign it, then resume it, so nothing it starts escapes the job.
//
// The order and the fallbacks live here, without a build tag, and the kernel calls are a struct of functions: wintree_windows.go
// fills it from kernel32, and the tests fill it with fakes, so every branch runs on every platform (CLAUDE.md §7).
package hooks

import (
	"context"
	"fmt"
	"sync"
)

// winTreeOps is the kernel's half of a job tree.
type winTreeOps struct {
	createJob func() (uintptr, error)
	assign    func(job uintptr, pid int) error
	resume    func(pid int) error // every thread of a child started suspended
	terminate func(job uintptr) error
	closeJob  func(job uintptr)
	taskkill  func(pid int)
	kill      func(pid int) error // the child alone
}

// winTree is what winAdopt took: a job that holds the child, or nothing when no job could be made or assigned.
type winTree struct {
	job  uintptr
	held bool
}

// winAdopt puts a suspended child into a new job and resumes it, whatever happened to the job: a child left suspended is a hang
// wearing the deadline's name. A child that cannot be resumed is killed and the failure returned, so the caller reports a
// failed start now rather than a timeout later.
func winAdopt(ops winTreeOps, pid int) (*winTree, error) {
	tree := &winTree{}
	if job, err := ops.createJob(); err == nil {
		if ops.assign(job, pid) == nil {
			tree.job, tree.held = job, true
		} else {
			ops.closeJob(job)
		}
	}
	if err := ops.resume(pid); err != nil {
		_ = ops.kill(pid)
		return tree, fmt.Errorf("could not resume the suspended child %d: %w", pid, err)
	}
	return tree, nil
}

// winEnd ends the tree: the job when it holds the child and terminating it succeeds, taskkill otherwise (no job, or the job
// refused), which is what the core did before ADR-140.
func winEnd(ops winTreeOps, tree *winTree, pid int) {
	if tree != nil && tree.held && ops.terminate(tree.job) == nil {
		return
	}
	ops.taskkill(pid)
}

// winRelease closes the job handle. The job sets no kill-on-close (ADR-140 Decision 4), so this ends nothing.
func winRelease(ops winTreeOps, tree *winTree) {
	if tree != nil && tree.held {
		ops.closeJob(tree.job)
	}
}

// winWatch adopts a started, suspended command into a job and ends the job whenever the command's context ends: at the
// deadline, through winEnd (taskkill when there is no job), and in the cleanup the caller runs once Wait returns, by terminating
// the job, so a grandchild outlives neither. It is bsWatchTree on Windows, as the process group is on Unix (BACKLOG §438). A
// command that could not be resumed was killed, and its error is returned with a cleanup that still releases the job.
func winWatch(ops winTreeOps, ctx context.Context, pid int) (func(), error) {
	tree, err := winAdopt(ops, pid)
	var once sync.Once
	end := func(deadline bool) {
		once.Do(func() {
			if deadline {
				winEnd(ops, tree, pid)
			} else if tree.held {
				_ = ops.terminate(tree.job)
			}
		})
	}
	stop := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			end(ctx.Err() == context.DeadlineExceeded)
		case <-stop:
		}
	}()
	return func() {
		close(stop)
		end(false)
		winRelease(ops, tree)
	}, err
}
