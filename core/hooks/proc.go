// Child processes, each bounded by a timeout and none detached (ADR-110 Decision 4): the git calls the hooks make, and the
// gates the artifact pass hands its paths to.
package hooks

import (
	"errors"
	"os"
	"os/exec"
	"strings"
	"time"
)

type runResult struct {
	status   int // -1 when the process gave no status
	stdout   string
	stderr   string
	err      error // the process could not run, or ran out of time
	timedOut bool
}

// errorCode is the code Node puts on a spawn error (`ENOENT`, `ETIMEDOUT`), or the message when there is none.
func (r runResult) errorCode() string {
	if r.timedOut {
		return "ETIMEDOUT"
	}
	var execErr *exec.Error
	if errors.As(r.err, &execErr) || errors.Is(r.err, os.ErrNotExist) {
		return "ENOENT"
	}
	if r.err != nil {
		return r.err.Error()
	}
	return ""
}

// errorMessage is what Node's spawnSync error message says for the same failure.
func (r runResult) errorMessage(command string) string {
	return "spawnSync " + command + " " + r.errorCode()
}

// environ is process.env with `extra` laid over it.
func environ(extra map[string]string) []string {
	if len(extra) == 0 {
		return os.Environ()
	}
	out := []string{}
	for _, kv := range os.Environ() {
		k, _, _ := strings.Cut(kv, "=")
		if _, over := extra[k]; over {
			continue
		}
		out = append(out, kv)
	}
	for k, v := range extra {
		out = append(out, k+"="+v)
	}
	return out
}

// run starts a command with its stdin, waits at most `timeout`, and returns what it said. It is bsRun: the command's process
// group is ended at the deadline and once it returns, so a grandchild holding the output pipe neither keeps the hook past its
// deadline nor outlives it. Killing only the direct child, `sh -c 'sleep 5 & …; wait'` under 300ms returned after 5.0 s and
// left the sleep running (BACKLOG §438; core/hooks/proc_tree_test.go). A child Node started `detached` is in a session of its
// own and is not ended by this.
func run(timeout time.Duration, dir string, env map[string]string, stdin string, name string, args ...string) runResult {
	return bsRun(timeout, dir, env, stdin, name, args...)
}

// git runs git with GIT_OPTIONAL_LOCKS=0 over process.env and `env`.
func git(timeout time.Duration, env map[string]string, args ...string) runResult {
	merged := map[string]string{"GIT_OPTIONAL_LOCKS": "0"}
	for k, v := range env {
		merged[k] = v
	}
	merged["GIT_OPTIONAL_LOCKS"] = "0"
	return run(timeout, "", merged, "", "git", args...)
}
