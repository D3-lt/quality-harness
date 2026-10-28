//go:build windows

package hooks

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"strconv"
	"syscall"
	"time"
)

// Real descriptors preserve the CLI's written-output receipts. A timed-out bridge owns and ends its whole child tree.
func executeNodeCLI(script string, args []string, budget time.Duration) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), budget)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", append([]string{script}, args...)...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.WaitDelay = time.Second
	cmd.Cancel = func() error {
		cleanup, stop := context.WithTimeout(context.Background(), 3*time.Second)
		defer stop()
		kill := exec.CommandContext(cleanup, "taskkill.exe", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
		hideWindow(kill)
		return runObservedCommand(kill, func() bool { return cleanup.Err() == context.DeadlineExceeded })
	}
	err := runObservedCommand(cmd, func() bool { return ctx.Err() == context.DeadlineExceeded })
	if ctx.Err() != nil {
		return 1, ctx.Err()
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return exit.ExitCode(), nil
	}
	if err != nil {
		return 1, err
	}
	return 0, nil
}
