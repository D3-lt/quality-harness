//go:build !windows

package hooks

import "os"

// drainPipe is the pipe bsRunDrained reads a command's output from. Off Windows os.Pipe's read end is already in Go's poller,
// so it takes a read deadline.
func drainPipe() (read, write *os.File, err error) {
	return os.Pipe()
}
