// Optional process observations share the operation trace's bounded local sink.
// They never carry payloads, arguments, paths, output, or diagnostic errors.
package hooks

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const processTraceLimit = 8 * 1024 * 1024

type processTraceRow struct {
	Schema          string  `json:"schema"`
	Phase           string  `json:"phase"`
	At              int64   `json:"at"`
	Trial           string  `json:"trial"`
	Invocation      string  `json:"invocation"`
	Parent          *string `json:"parent"`
	PID             int     `json:"pid"`
	PPID            int     `json:"ppid"`
	ChildPID        *int    `json:"childPid"`
	Program         string  `json:"program"`
	ArgsHash        string  `json:"argsHash"`
	CwdHash         string  `json:"cwdHash"`
	Status          *int    `json:"status"`
	TimedOut        bool    `json:"timedOut"`
	Outcome         string  `json:"outcome"`
	UserCPUNs       *int64  `json:"userCpuNs"`
	SystemCPUNs     *int64  `json:"systemCpuNs"`
	CPUScope        string  `json:"cpuScope"`
	PeakMemoryBytes *int64  `json:"peakMemoryBytes"`
	Platform        string  `json:"platform"`
}

type processTrace struct {
	file      string
	until     int64
	protected []string
	row       processTraceRow
}

func processTraceEnv(env []string, key string) string {
	for i := len(env) - 1; i >= 0; i-- {
		k, v, ok := strings.Cut(env[i], "=")
		if ok && (k == key || runtime.GOOS == "windows" && strings.EqualFold(k, key)) {
			return v
		}
	}
	return ""
}

func processTraceOpaque(value string) bool {
	if len(value) > 128 {
		return false
	}
	for _, c := range value {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c == '.') {
			return false
		}
	}
	return true
}

// This environment-only check precedes cwd resolution, stat, randomness and PID probes.
func processTraceConfig(env []string) (string, int64, bool) {
	file := processTracePath(processTraceEnv(env, "QUALITY_HARNESS_TRACE_FILE"))
	until, err := strconv.ParseInt(processTraceEnv(env, "QUALITY_HARNESS_TRACE_UNTIL"), 10, 64)
	now := time.Now().UnixMilli()
	if file == "" || !filepath.IsAbs(file) || filepath.Ext(file) != ".jsonl" || err != nil || until <= now || until-now > 15*time.Minute.Milliseconds() {
		return "", 0, false
	}
	if !processTraceOpaque(processTraceEnv(env, "QUALITY_HARNESS_TRACE_TRIAL")) || !processTraceOpaque(processTraceEnv(env, "QUALITY_HARNESS_TRACE_PARENT")) {
		return "", 0, false
	}
	return file, until, true
}

func processTraceHash(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// protectedCwd is the session cwd for detached work, whose actual cwd is the temp directory.
func startProcessTrace(cmd *exec.Cmd, protectedCwd, phase string, protected ...string) *processTrace {
	env := cmd.Env
	if env == nil {
		env = os.Environ()
	}
	file, until, ok := processTraceConfig(env)
	if !ok {
		return nil
	}
	cwd := processTracePath(cmd.Dir)
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			return nil
		}
	}
	cwd, err := filepath.Abs(cwd)
	if err != nil {
		return nil
	}
	cwd, err = filepath.EvalSymlinks(cwd)
	if err != nil {
		return nil
	}
	if protectedCwd == "" {
		protectedCwd = cwd
	}
	protected = append(append([]string{}, protected...), protectedCwd, processTraceEnv(env, "CLAUDE_PLUGIN_ROOT"), processTraceEnv(env, "CLAUDE_PLUGIN_DATA"))
	for _, arg := range cmd.Args[1:] {
		arg = processTracePath(arg)
		if filepath.IsAbs(arg) {
			protected = append(protected, arg)
		}
	}
	program := filepath.Base(processTracePath(cmd.Args[0]))
	if len(program) > 128 {
		return nil
	}
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		return nil
	}
	args, err := json.Marshal(append([]string{}, cmd.Args[1:]...))
	if err != nil {
		return nil
	}
	parent := processTraceEnv(env, "QUALITY_HARNESS_TRACE_PARENT")
	trace := &processTrace{file: file, until: until, protected: protected, row: processTraceRow{
		Schema: "quality-harness-process-trace-v1", Trial: processTraceEnv(env, "QUALITY_HARNESS_TRACE_TRIAL"),
		Invocation: hex.EncodeToString(id[:]), PID: os.Getpid(), PPID: os.Getppid(), Program: program,
		ArgsHash: processTraceHash(args), CwdHash: processTraceHash([]byte(cwd)), CPUScope: "unknown", Platform: runtime.GOOS,
	}}
	if parent != "" {
		trace.row.Parent = &parent
	}
	if phase == "" {
		return trace
	}
	if !trace.append(phase, "attempted") {
		return nil
	}
	// Only a successfully enabled observer adds parentage; no global environment is changed.
	cmd.Env = append([]string{}, env...)
	for i := len(cmd.Env) - 1; i >= 0; i-- {
		k, _, _ := strings.Cut(cmd.Env[i], "=")
		if k == "QUALITY_HARNESS_TRACE_PARENT" || runtime.GOOS == "windows" && strings.EqualFold(k, "QUALITY_HARNESS_TRACE_PARENT") {
			cmd.Env = append(cmd.Env[:i], cmd.Env[i+1:]...)
		}
	}
	cmd.Env = append(cmd.Env, "QUALITY_HARNESS_TRACE_PARENT="+trace.row.Invocation)
	return trace
}

func processTraceResolved(file string) (string, error) {
	absolute, err := filepath.Abs(processTracePath(file))
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err == nil {
		return resolved, nil
	}
	if !errors.Is(err, os.ErrNotExist) && !errors.Is(err, syscallNotDirectory()) {
		return "", err
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(absolute))
	if err != nil {
		return "", err
	}
	return filepath.Join(parent, filepath.Base(absolute)), nil
}

func processTraceExists(file string) (bool, error) {
	_, err := os.Lstat(file)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

func (t *processTrace) target() (string, error) {
	parent, err := filepath.EvalSymlinks(filepath.Dir(t.file))
	if err != nil {
		return "", err
	}
	target := filepath.Join(parent, filepath.Base(t.file))
	for _, guard := range t.protected {
		if guard == "" {
			continue
		}
		guarded, err := processTraceResolved(guard)
		if err != nil {
			return "", err
		}
		relative, err := filepath.Rel(guarded, target)
		if err != nil {
			return "", err
		}
		if relative == "." || relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative) {
			return "", os.ErrPermission
		}
	}
	for directory := parent; ; directory = filepath.Dir(directory) {
		git, err := processTraceExists(filepath.Join(directory, ".git"))
		if err != nil {
			return "", err
		}
		head, err := processTraceExists(filepath.Join(directory, "HEAD"))
		if err != nil {
			return "", err
		}
		objects, err := processTraceExists(filepath.Join(directory, "objects"))
		if err != nil {
			return "", err
		}
		if git || head && objects {
			return "", os.ErrPermission
		}
		if filepath.Dir(directory) == directory {
			break
		}
	}
	return target, nil
}

// Revalidate on every row. OpenRoot anchors the directory; final lstat and file identity
// checks prevent an observed symlink or hardlink from receiving diagnostic data.
func (t *processTrace) append(phase, outcome string) bool {
	if t == nil || time.Now().UnixMilli() >= t.until {
		return false
	}
	target, err := t.target()
	if err != nil {
		return false
	}
	root, err := os.OpenRoot(filepath.Dir(target))
	if err != nil {
		return false
	}
	defer root.Close()
	name := filepath.Base(target)
	before, err := root.Lstat(name)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return false
	}
	if err == nil && (!before.Mode().IsRegular() || before.Size() >= processTraceLimit) {
		return false
	}
	t.row.Phase, t.row.At, t.row.Outcome = phase, time.Now().UnixMilli(), outcome
	line, err := json.Marshal(t.row)
	if err != nil || len(line)+1 > 2048 {
		return false
	}
	file, err := root.OpenFile(name, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return false
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() >= processTraceLimit || !processTraceSingleLink(file, info) {
		return false
	}
	current, err := root.Lstat(name)
	if err != nil || !current.Mode().IsRegular() || !os.SameFile(info, current) {
		return false
	}
	_, err = file.Write(append(line, '\n'))
	return err == nil
}

func (t *processTrace) started(cmd *exec.Cmd) {
	if t == nil {
		return
	}
	if cmd.Process != nil {
		pid := cmd.Process.Pid
		t.row.ChildPID = &pid
	}
	t.append("started", "started")
}

func (t *processTrace) ended(cmd *exec.Cmd, err error, timedOut bool) {
	if t == nil {
		return
	}
	t.row.TimedOut = timedOut
	outcome := "completed"
	if cmd.ProcessState != nil {
		status := cmd.ProcessState.ExitCode()
		if status >= 0 {
			t.row.Status = &status
		}
		t.row.UserCPUNs, t.row.SystemCPUNs, t.row.PeakMemoryBytes, t.row.CPUScope = processTraceUsage(cmd.ProcessState)
	}
	if timedOut {
		outcome = "timeout"
	} else if err != nil && cmd.ProcessState == nil {
		outcome = "start-error"
	} else if err != nil {
		outcome = "execution-error"
	}
	t.append("ended", outcome)
}

func (t *processTrace) released(err error) {
	if t == nil {
		return
	}
	outcome := "released-unobserved"
	if err != nil {
		outcome = "release-error"
	}
	t.append("released", outcome)
}

// Same Start/Wait contract as Cmd.Run, including CommandContext cancellation.
func runObservedCommand(cmd *exec.Cmd, ctxDone func() bool) error {
	trace := startProcessTrace(cmd, "", "attempt")
	err := cmd.Start()
	if err == nil {
		trace.started(cmd)
		err = cmd.Wait()
	}
	trace.ended(cmd, err, ctxDone())
	return err
}

// A detached native pass can report that its callable returned. This is not a
// wait observation: CPU/memory remain unknown, and death before return leaves
// the parent's released span incomplete. Custom Node runners need an outer waiter.
func artifactProcessTrace(requestFile string) *processTrace {
	env := os.Environ()
	if _, _, ok := processTraceConfig(env); !ok {
		return nil
	}
	invocation := processTraceEnv(env, "QUALITY_HARNESS_TRACE_PARENT")
	if invocation == "" {
		return nil
	}
	protected := []string{requestFile}
	text, err := os.ReadFile(requestFile)
	if err != nil {
		return nil
	}
	request, err := parseJSON(string(text))
	if err != nil {
		return nil
	}
	cwd, ok := get(request, "cwd").(string)
	if !ok || cwd == "" {
		return nil
	}
	protected = append(protected, cwd)
	for _, key := range []string{"ledger", "lock"} {
		if value, ok := get(request, key).(string); ok {
			protected = append(protected, value)
		}
	}
	if targets, ok := get(request, "targets").([]any); ok {
		for _, row := range targets {
			if value, ok := get(row, "path").(string); ok {
				protected = append(protected, value)
			}
		}
	}
	cmd := exec.Command(os.Args[0], os.Args[1:]...)
	cmd.Env = env
	trace := startProcessTrace(cmd, filepath.Dir(requestFile), "", protected...)
	if trace == nil {
		return nil
	}
	trace.row.Invocation = invocation
	trace.row.Parent = nil
	pid := os.Getpid()
	trace.row.ChildPID = &pid
	return trace
}

// ru_maxrss units are platform-specific; an unsupported unit stays unavailable.
func processTracePeakMemory(maxrss int64, platform string) *int64 {
	switch platform {
	case "darwin":
		return &maxrss
	case "linux":
		value := maxrss * 1024
		return &value
	default:
		return nil
	}
}

func processTracePath(value string) string {
	return filepath.FromSlash(strings.ReplaceAll(value, "\\", "/"))
}
