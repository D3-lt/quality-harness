//go:build !windows

package hooks

import "os/exec"

func hideWindow(cmd *exec.Cmd) {}
