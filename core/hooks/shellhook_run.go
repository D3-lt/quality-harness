// ADR-136 T2 and T3: the core runs a registered shell hook as plugin/scripts/run-shell-hook.mjs's runShellHook does: the same
// bash, the same arguments, stdin and environment, the same timeout, and what it prints (the PostToolUse additionalContext
// wrapping, the failure messages) and exits; and the facts gate as its runEditGate does, with the same artifact.gated row.
// tests/shell-hook-native.test.mjs runs every scenario through both runners. Since ADR-136 T4 the core answers both registered
// runs; `--batch` and any other name still reach the Node runner.
package hooks

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// shkCleanupGrace is CLEANUP_GRACE_MS: after the deadline's kill, how long the runner waits for the child's pipes to close
// before it settles anyway, with the cleanup unconfirmed.
const shkCleanupGrace = time.Second

// shkFactsGate is the facts gate's registered name; the core runs it as runEditGate does.
const shkFactsGate = "facts-gate-dispatch.sh"

// shkNative is whether `qh bridge shell-hook <args>` is answered by the core. Any other call (the artifact pass's `--batch`, an
// unregistered name) still runs the Node runner (ADR-136 Decision 2), which also owns the unknown-script refusal.
func shkNative(args []string) bool {
	if len(args) == 0 {
		return false
	}
	return args[0] == "post-edit-check.sh" || (args[0] == shkFactsGate && !(len(args) > 1 && args[1] == "--batch"))
}

// shkPlatform is process.platform for the questions the helpers ask.
func shkPlatform() string {
	if runtime.GOOS == "windows" {
		return "win32"
	}
	return runtime.GOOS
}

// shkResult is what runWithTimeout settles with, for a direct hook: no output limit.
type shkResult struct {
	status             int    // -1 when the child gave no exit status
	signal             string // the signal that killed the child, as Node names it
	stdout, stderr     string
	err                error // the child could not be started
	timedOut           bool
	cleanupUnconfirmed bool // the deadline's kill was not followed by the child's close within the grace
}

// shkAdoptTree and shkEndTreeOf are the platform's adopt and end, as variables so a test can see that shkRun calls them in
// order and hands the end what the adopt returned (ADR-140 T2).
var (
	shkAdoptTree = shkAdopt
	shkEndTreeOf = shkEndTree
)

// shkRun is runWithTimeout: the child in a tree of its own, its stdin written and closed, and at the deadline the whole tree
// ended and the child given shkCleanupGrace to close. The child's output pipes are the runner's own, not exec's copy goroutines,
// because Node waits for `close` (exit and every pipe shut) until the deadline, where Cmd.Wait gives a pipe a grandchild keeps
// open only its WaitDelay counted from the child's exit.
func shkRun(executable string, args []string, input string, timeout time.Duration, env []string) shkResult {
	res := shkResult{status: -1}
	var files []*os.File
	pipe := func() (*os.File, *os.File) {
		r, w, err := os.Pipe()
		if err != nil {
			res.err = errors.Join(res.err, err)
			return nil, nil
		}
		files = append(files, r, w)
		return r, w
	}
	inR, inW := pipe()
	outR, outW := pipe()
	errR, errW := pipe()
	if res.err != nil {
		for _, f := range files {
			f.Close()
		}
		return res
	}
	cmd := exec.Command(executable, args...)
	cmd.Env = env
	cmd.Stdin, cmd.Stdout, cmd.Stderr = inR, outW, errW
	hideWindow(cmd)
	shkOwnTree(cmd)
	// Traced as the core's other spawns are (ADR-131): attempt, started, and how it ended.
	trace := startProcessTrace(cmd, "", "attempt")
	err := cmd.Start()
	inR.Close()
	outW.Close()
	errW.Close()
	if err != nil {
		inW.Close()
		outR.Close()
		errR.Close()
		res.err = err
		trace.ended(cmd, err, false)
		return res
	}
	// ADR-140: on Windows the child was started suspended and is adopted into a job here, before it can start anything; a child
	// that could not be resumed was killed, and is reported as a failed start rather than waited on until the deadline.
	tree, err := shkAdoptTree(cmd)
	if err != nil {
		inW.Close()
		_ = cmd.Wait()
		outR.Close()
		errR.Close()
		res.err = err
		trace.ended(cmd, err, false)
		return res
	}
	defer shkReleaseTree(tree)
	trace.started(cmd)
	go func() {
		_, _ = io.WriteString(inW, input)
		inW.Close()
	}()
	var mu sync.Mutex
	var out, errOut bytes.Buffer
	var readers sync.WaitGroup
	capture := func(dst *bytes.Buffer, src *os.File) {
		defer readers.Done()
		buf := make([]byte, 32*1024)
		for {
			n, err := src.Read(buf)
			if n > 0 {
				mu.Lock()
				dst.Write(buf[:n])
				mu.Unlock()
			}
			if err != nil {
				return
			}
		}
	}
	readers.Add(2)
	go capture(&out, outR)
	go capture(&errOut, errR)
	var waitErr error
	closed := make(chan struct{})
	go func() {
		waitErr = cmd.Wait()
		readers.Wait()
		close(closed)
	}()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	select {
	case <-closed:
	case <-deadline.C:
		res.timedOut = true
		shkEndTreeOf(cmd, tree)
		grace := time.NewTimer(shkCleanupGrace)
		defer grace.Stop()
		select {
		case <-closed:
		case <-grace.C:
			// Settle with the truth, as Node's grace does: no status, and the pipes let go.
			res.cleanupUnconfirmed = true
		}
	}
	outR.Close()
	if res.cleanupUnconfirmed {
		trace.ended(cmd, nil, true)
	} else {
		trace.ended(cmd, waitErr, res.timedOut)
	}
	errR.Close()
	mu.Lock()
	res.stdout, res.stderr = shkDecodeUTF8(out.Bytes()), shkDecodeUTF8(errOut.Bytes())
	mu.Unlock()
	if res.cleanupUnconfirmed {
		return res
	}
	var exitErr *exec.ExitError
	switch {
	case errors.As(waitErr, &exitErr):
		res.status = exitErr.ExitCode()
		res.signal = shkSignalName(exitErr.ProcessState)
	case waitErr != nil:
		res.err = waitErr
	default:
		res.status = 0
	}
	return res
}

// shkSpawnMessage is the message of Node's spawn error for the same failure: `spawn <file> <libuv code>`, never Go's error
// text (the Codex review of be9293a0..4275a404).
func shkSpawnMessage(executable string, err error) string {
	return "spawn " + executable + " " + shkSpawnCode(executable, err)
}

// shkSpawnCode is the libuv code Node names. Node finds a bare name through execvp, which reports EACCES when the only match
// on PATH exists but cannot be run; Go's LookPath skips that file and says not found.
// The codes are a closed list, the ones libuv names for a failed spawn of a resolved bash; any other error keeps Go's text,
// which ADR-136 names as a limit rather than guessing a code.
func shkSpawnCode(executable string, err error) string {
	if code, ok := shkPlatformSpawnCode(err); ok {
		return code
	}
	switch {
	case errors.Is(err, exec.ErrNotFound):
		if shkOnPathUnrunnable(executable) {
			return "EACCES"
		}
		return "ENOENT"
	case errors.Is(err, fs.ErrNotExist):
		return "ENOENT"
	case errors.Is(err, syscall.EPERM):
		return "EPERM"
	case errors.Is(err, fs.ErrPermission):
		return "EACCES"
	case errors.Is(err, syscall.ENOTDIR):
		return "ENOTDIR"
	case errors.Is(err, syscall.ELOOP):
		return "ELOOP"
	case errors.Is(err, syscall.ENAMETOOLONG):
		return "ENAMETOOLONG"
	case errors.Is(err, syscall.ENOEXEC):
		return "ENOEXEC"
	}
	return err.Error()
}

// shkOnPathUnrunnable is whether execvp would find `name` as something it cannot run: a path that exists, or a bare name that
// exists, file or directory, in a PATH directory. An unset PATH is libuv's default; a PATH set to "" searches the working
// directory (the Codex review of be9293a0..85448572).
func shkOnPathUnrunnable(name string) bool {
	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }
	if strings.ContainsAny(name, `/\`) {
		return exists(name)
	}
	value, set := os.LookupEnv("PATH")
	if !set {
		value = "/usr/bin:/bin"
	}
	dirs := filepath.SplitList(value)
	if value == "" {
		dirs = []string{""}
	}
	for _, dir := range dirs {
		if dir == "" {
			dir = "."
		}
		if exists(filepath.Join(dir, name)) {
			return true
		}
	}
	return false
}

var shkUnproven = regexp.MustCompile(`\b(?:UNPROVEN|UNRUN)\b`)

// shkRunShellHook is runShellHook for a direct hook (no batch window, no output limit). readRaw reads the payload, and is called
// only once bash was found, as Node reads stdin only then. verdict, when not nil, is set to whether the gate reached a verdict
// about this content (ADR-060 T6): false on every arm that is the harness failing to run.
func shkRunShellHook(scriptName string, readRaw func() string, stdout, stderr io.Writer, verdict *bool) int {
	if verdict != nil {
		*verdict = false
	}
	platform := shkPlatform()
	scriptPath := filepath.Join(pluginRoot(), "scripts", scriptName)
	if platform == "win32" {
		scriptPath = shkWindowsPathForBash(scriptPath)
	}
	executable, found := shkResolveBash(platform, os.LookupEnv, func(candidate string) bool {
		_, err := os.Stat(candidate)
		return err == nil
	})
	if !found {
		io.WriteString(stderr, "quality-harness: Git Bash was not found, so the artifact gates did not "+
			"run. Set CLAUDE_CODE_GIT_BASH_PATH to Git for Windows bin/bash.exe. Your edit is "+
			"untouched — this is the harness reporting its own absence.\n")
		return 0
	}
	raw := readRaw()
	args, err := shkHookArguments(scriptName, raw, platform)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	payload := shkParsedHookPayload(raw, platform)
	// A record under a fixture, vendored or generated directory is not one of this repository's decisions: the facts gate is not
	// run on it, and that is its answer (run-shell-hook.mjs:344-361). The path is judged where the host ran, the payload's cwd.
	if edited, ok := shkHookFilePathFromPayload(raw, platform); ok && scriptName == shkFactsGate {
		hookCwd, isString := get(payload, "cwd").(string)
		if !isString {
			hookCwd, _ = os.Getwd()
		}
		target := edited
		if !filepath.IsAbs(target) {
			target = filepath.Join(hookCwd, target)
		}
		if shkRelativePathIsUninteresting(relPath(hookCwd, target)) {
			if verdict != nil {
				*verdict = true
			}
			return 0
		}
	}
	extra := map[string]string{}
	if session, ok := get(payload, "session_id").(string); ok && session != "" {
		extra["QUALITY_HARNESS_SESSION_ID"] = session
	}
	timeoutMs := shkShellHookTimeoutMs(os.LookupEnv)
	run := shkRun(executable, append([]string{scriptPath}, args...), shkNormalizeHookPayload(raw, platform),
		time.Duration(timeoutMs)*time.Millisecond, environ(extra))
	// A deferral notice or a syntax finding printed on exit-0 stdout reaches nobody at PostToolUse unless it is handed to the
	// agent as additionalContext (run-shell-hook.mjs:382-402, ADR-102).
	report := jsTrim(run.stdout)
	if strOr(get(payload, "hook_event_name")) == "PostToolUse" && run.status == 0 && !run.timedOut && run.err == nil && report != "" {
		io.WriteString(stdout, stringify(O("hookSpecificOutput", O("hookEventName", "PostToolUse", "additionalContext", report))))
	} else if run.stdout != "" {
		io.WriteString(stdout, run.stdout)
	}
	if run.stderr != "" {
		io.WriteString(stderr, run.stderr)
	}
	edited, _ := shkHookFilePathFromPayload(raw, platform)
	thisEdit := edited
	if thisEdit == "" {
		thisEdit = "this edit"
	}
	if run.cleanupUnconfirmed {
		io.WriteString(stderr, "\nquality-harness: process cleanup could not be confirmed for "+thisEdit+"; its checker may still be running.\n")
	}
	// Everything below is the harness failing to run, not a finding about the edit, and none of it blocks the edit.
	switch {
	case run.timedOut:
		io.WriteString(stderr, "quality-harness: "+scriptName+" timed out after "+strconv.FormatFloat(timeoutMs, 'f', -1, 64)+"ms, so the "+
			"gates have no verdict on "+thisEdit+". Nothing is blocked.\n")
	case run.err != nil:
		io.WriteString(stderr, "quality-harness: could not run "+scriptName+": "+shkSpawnMessage(executable, run.err)+". "+
			"The gates did not report; nothing is blocked.\n")
	case shkShellRuntimeCrashed(run.stderr):
		io.WriteString(stderr, "quality-harness: the shell running "+scriptName+" aborted before the gate "+
			"could report, so treat this edit as unchecked rather than clean. Nothing is blocked.\n")
	case run.signal != "":
		// A child the OS killed made no observation (ADR-005), whatever its cleanup.
		io.WriteString(stderr, "quality-harness: "+scriptName+" was killed by "+run.signal+" before it could "+
			"report, so treat this edit as unchecked rather than clean. Nothing is blocked.\n")
	case run.status != 0 && run.status != -1:
		io.WriteString(stderr, "quality-harness: "+scriptName+" exited "+strconv.Itoa(run.status)+", which it should "+
			"never do — the gates report, they do not refuse. Nothing is blocked; please report this.\n")
	default:
		// `complete` requires an observed zero exit and no word of the dispatcher's for a gate that could not answer.
		if verdict != nil {
			*verdict = run.status == 0 && !shkUnproven.MatchString(run.stderr+run.stdout)
		}
	}
	return 0
}

// RunShellHookNative answers `qh bridge shell-hook <script>` for a script shkNative accepts.
func RunShellHookNative(scriptName string, stdin io.Reader, stdout, stderr io.Writer) int {
	if scriptName == shkFactsGate {
		raw, _ := io.ReadAll(stdin)
		return shkRunEditGate(string(raw), stdout, stderr)
	}
	readRaw := func() string {
		raw, _ := io.ReadAll(stdin)
		return string(raw)
	}
	return shkRunShellHook(scriptName, readRaw, stdout, stderr, nil)
}

// shkRunEditGate is runEditGate: the facts gate, and the artifact.gated row that lets the turn's end skip content this gate
// already answered (ADR-060 T6). The row is keyed as event-log.mjs keys it, holds the identity of the bytes the gate was about to
// read, and is complete only for a gate that reached a verdict over a file nothing changed while it ran: re-gating is the safe
// direction (ADR-005).
func shkRunEditGate(raw string, stdout, stderr io.Writer) int {
	platform := shkPlatform()
	file, hasFile := shkHookFilePathFromPayload(raw, platform)
	parsed, _ := parseJSON(raw)
	cwd, hasCwd := get(parsed, "cwd").(string)
	key := ""
	if hasFile && hasCwd {
		wd, _ := os.Getwd()
		key = canonicalFile(shkPersistedEventPath(file, cwd, platform, shkHost{cwd: wd, env: os.LookupEnv, windows: runtime.GOOS == "windows"}))
	}
	var before any
	if key != "" {
		before = contentId(key)
	}
	var verdict bool
	status := shkRunShellHook(shkFactsGate, func() string { return raw }, stdout, stderr, &verdict)
	if session, ok := get(parsed, "session_id").(string); key != "" && ok && hasCwd {
		after := contentId(key)
		steady := before != nil && before == after
		appendEvent(cwd, session, O("event", "artifact.gated", "path", key, "blob", before, "complete", verdict && steady))
	}
	return status
}

// shkDecodeUTF8 is how Node turns a child's output into a string (utf8): each maximal ill-formed subsequence becomes one
// U+FFFD, the WHATWG and Unicode §3.9 rule, where Go's per-byte decoding would write one for every byte. A gate that prints
// bytes that are not UTF-8 otherwise reached the host as different text than the Node runner sent.
func shkDecodeUTF8(b []byte) string {
	var out strings.Builder
	for i := 0; i < len(b); {
		c := b[i]
		if c < 0x80 {
			out.WriteByte(c)
			i++
			continue
		}
		need, lo, hi := 0, byte(0x80), byte(0xBF)
		switch {
		case c >= 0xC2 && c <= 0xDF:
			need = 1
		case c == 0xE0:
			need, lo = 2, 0xA0
		case c >= 0xE1 && c <= 0xEC, c == 0xEE, c == 0xEF:
			need = 2
		case c == 0xED:
			need, hi = 2, 0x9F
		case c == 0xF0:
			need, lo = 3, 0x90
		case c >= 0xF1 && c <= 0xF3:
			need = 3
		case c == 0xF4:
			need, hi = 3, 0x8F
		default:
			out.WriteRune(0xFFFD)
			i++
			continue
		}
		j := i + 1
		for k := 0; k < need; k++ {
			first, last := byte(0x80), byte(0xBF)
			if k == 0 {
				first, last = lo, hi
			}
			if j >= len(b) || b[j] < first || b[j] > last {
				break
			}
			j++
		}
		if j-i == need+1 {
			out.Write(b[i:j])
		} else {
			out.WriteRune(0xFFFD)
		}
		i = j
	}
	return out.String()
}
