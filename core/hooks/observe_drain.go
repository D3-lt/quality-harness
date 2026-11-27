// BACKLOG §477.2: on Windows the observation's git calls went through bsRun, whose WaitDelay there is a fixed 250 ms
// (bstree_windows.go:22). Measured 2026-11-26 under 100% CPU: git exited 0 and Wait still returned exec.ErrWaitDelay ("WaitDelay
// expired before I/O complete") in 10 of 184 hook runs. What delayed the output under that load was not traced. Measured
// 2026-11-27 at idle, one mechanism that produces it: a process the command started still holds the output past the command's
// exit, and bsRun read the whole answer and still reported a failure at the 250 ms WaitDelay, 2 of 2 pairs, where this runner kept
// it. The observation then read "git could not run", and no late baseline was taken. That 250 ms is the refresh's bound and stays.
//
// On Windows an observation's git is run here instead (gitObserved), with its output on pipes this runner owns: exec hands those
// files to the child and starts no copying goroutine, so WaitDelay has nothing to cut short and is not set. The runner's own two
// readers start before the command does and are joined after Wait and the tree's end, for no longer than what is left of the
// command's own deadline. Off Windows the observation keeps git() as it was: its WaitDelay there is the command's own timeout.
// Nothing is retried.
package hooks

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"time"
)

// drainCopy reads one output pipe to its end; a variable so a test can make a read fail, or never return.
var drainCopy = io.Copy

// bsRunDrained is bsRun for an observation: the same tree ending (bsEndTree, bsWatchTreeOf, winReap) and the same trace, with the
// output read from pipes of its own within the command's deadline, so output still held or still arriving when Wait returns is not
// cut off at a fixed 250 ms. A read that fails before the deadline is not a whole answer: the result carries that error, never success.
// It takes no input: an input pipe would add exec's own copying, and a Wait that a holder of that pipe could stall.
//
// Both read ends carry the command's deadline as a read deadline, set before either reader starts. A read still blocked at the
// deadline on a pipe that something outside the tree's end holds returns then, through Go's poller, and both readers are joined
// before the read ends close: no goroutine or handle outlives the call, and the output, perhaps partial, is not read: the call
// is said to have timed out. Closing the pipe is not how a read is ended. On Windows os.Pipe's handles are blocking (Go 1.27.4
// os/file_windows.go:281), and Close cancels them with one CancelIoEx and then waits, unbounded, for the reader's reference
// (internal/poll/fd_windows.go:565-579): a reader about to enter ReadFile misses that cancel and blocks for as long as the pipe is
// held (the Codex review of tree 7ced28cb). drainPipe makes the read end overlapped there, which os.NewFile adds to the poller,
// and the deadline cancels exactly the pending read. A read end that takes no deadline is refused before anything starts.
func bsRunDrained(timeout time.Duration, dir string, env map[string]string, name string, args ...string) runResult {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	outR, outW, err := drainPipe()
	if err != nil {
		return runResult{status: -1, err: err}
	}
	errR, errW, err := drainPipe()
	if err != nil {
		outR.Close()
		outW.Close()
		return runResult{status: -1, err: err}
	}
	deadlineAt, _ := ctx.Deadline()
	for _, r := range []*os.File{outR, errR} {
		if err := r.SetReadDeadline(deadlineAt); err != nil {
			outR.Close()
			outW.Close()
			errR.Close()
			errW.Close()
			return runResult{status: -1, err: fmt.Errorf("the output could not be given a deadline: %w", err)}
		}
	}
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = environ(env)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Stdout, cmd.Stderr = outW, errW
	hideWindow(cmd)
	bsEndTree(cmd)
	var out, errOut bytes.Buffer
	drain := func(from *os.File, into *bytes.Buffer) chan error {
		done := make(chan error, 1)
		go func() { _, err := drainCopy(into, from); done <- err }()
		return done
	}
	outDone, errDone := drain(outR, &out), drain(errR, &errOut)
	trace := startProcessTrace(cmd, "", "attempt")
	err = cmd.Start()
	// The child holds its own copies now; ours must close, or the readers never see the end of the output.
	outW.Close()
	errW.Close()
	traced := cmd
	if err == nil {
		trace.started(cmd)
		end, adoptErr := bsWatchTreeOf(ctx, cmd)
		if adoptErr != nil {
			traced = winReap(cmd, winReapGrace)
			err = adoptErr
		} else {
			err = cmd.Wait()
		}
		end()
	}
	// Each reader answers by the deadline at the latest: at its end of output, at a read that failed, or at the read deadline.
	readErrs := []error{<-outDone, <-errDone}
	outR.Close()
	errR.Close()
	deadline := ctx.Err() == context.DeadlineExceeded
	for _, readErr := range readErrs {
		if errors.Is(readErr, os.ErrDeadlineExceeded) {
			deadline = true
		}
	}
	res := runResult{status: -1}
	switch {
	case deadline:
		res.timedOut, res.err = true, context.DeadlineExceeded
	case errors.Join(readErrs...) != nil:
		res.err = fmt.Errorf("the output could not be read whole: %w", errors.Join(readErrs...))
	default:
		res.stdout, res.stderr = out.String(), errOut.String()
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			res.status = exitErr.ExitCode()
		} else if err != nil {
			res.err = err
		} else {
			res.status = 0
		}
	}
	// The trace says what the call answered: a read that failed is could-not-read there too, never the Wait's success.
	traceErr := err
	if res.err != nil && !deadline {
		traceErr = res.err
	}
	trace.ended(traced, traceErr, deadline)
	return res
}

// gitDrained is git() through bsRunDrained.
func gitDrained(timeout time.Duration, env map[string]string, args ...string) runResult {
	return bsRunDrained(timeout, "", gitEnv(env), "git", args...)
}

// observeGOOS is the platform whose observations read through bsRunDrained: Windows, where bsRun's WaitDelay is a fixed 250 ms. A
// variable so a test on any platform can take that path through the observation's own entry, boundedGit.
var observeGOOS = runtime.GOOS

// gitObserved is an observation's git (boundedGit): on Windows through bsRunDrained; elsewhere git() as it was.
func gitObserved(timeout time.Duration, env map[string]string, args ...string) runResult {
	if observeGOOS == "windows" {
		return gitDrained(timeout, env, args...)
	}
	return git(timeout, env, args...)
}
