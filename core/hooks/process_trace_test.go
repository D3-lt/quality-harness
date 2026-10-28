package hooks

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// This is a real native child, with a marker independent of the observer.
func TestNativeProcessTraceHelper(t *testing.T) {
	if os.Getenv("QH_NATIVE_TRACE_HELPER") != "1" {
		return
	}
	marker := os.Getenv("QH_NATIVE_TRACE_MARKER")
	value, _ := json.Marshal(map[string]string{"parent": os.Getenv("QUALITY_HARNESS_TRACE_PARENT"), "trial": os.Getenv("QUALITY_HARNESS_TRACE_TRIAL")})
	if err := os.WriteFile(marker, value, 0600); err != nil {
		os.Exit(91)
	}
	fmt.Fprint(os.Stdout, "child-out")
	fmt.Fprint(os.Stderr, "child-err")
	if os.Getenv("QH_NATIVE_TRACE_WAIT") == "1" {
		time.Sleep(time.Hour)
	}
	if request := os.Getenv("QH_NATIVE_TRACE_ARTIFACT_REQUEST"); request != "" {
		os.Exit(RunArtifactPass(request))
	}
	os.Exit(0)
}

func nativeTraceEnv(file, marker string) map[string]string {
	return map[string]string{
		"QUALITY_HARNESS_TRACE_FILE":   file,
		"QUALITY_HARNESS_TRACE_UNTIL":  fmt.Sprint(time.Now().Add(time.Minute).UnixMilli()),
		"QUALITY_HARNESS_TRACE_TRIAL":  "native-trial-1",
		"QUALITY_HARNESS_TRACE_PARENT": "outer-span-1",
		"QH_NATIVE_TRACE_HELPER":       "1", "QH_NATIVE_TRACE_MARKER": marker,
	}
}

func nativeTraceChild(t *testing.T, env map[string]string, timeout time.Duration) runResult {
	t.Helper()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	return run(timeout, "", env, "private-stdin", exe, "-test.run=^TestNativeProcessTraceHelper$", "--", "private-argument")
}

func readNativeTrace(t *testing.T, file string) []map[string]any {
	t.Helper()
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var rows []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if len(line) > 2048 {
			t.Fatalf("oversized trace row: %d", len(line))
		}
		var row map[string]any
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			t.Fatal(err)
		}
		rows = append(rows, row)
	}
	return rows
}

func TestNativeProcessTraceBoundary(t *testing.T) {
	scratch := t.TempDir()
	file, marker := filepath.Join(scratch, "trace.jsonl"), filepath.Join(scratch, "ran.json")
	result := nativeTraceChild(t, nativeTraceEnv(file, marker), 5*time.Second)
	if result.status != 0 || result.err != nil || result.timedOut || result.stdout != "child-out" || result.stderr != "child-err" {
		t.Fatalf("child behavior changed: %+v", result)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("native marker: %v", err)
	}
	rows := readNativeTrace(t, file)
	if len(rows) != 3 {
		t.Fatalf("wanted attempt, started, ended; got %v", rows)
	}
	for i, phase := range []string{"attempt", "started", "ended"} {
		row := rows[i]
		if row["schema"] != "quality-harness-process-trace-v1" || row["phase"] != phase || row["trial"] != "native-trial-1" || row["parent"] != "outer-span-1" {
			t.Fatalf("bad identity: %v", row)
		}
		if row["invocation"] == "" || row["invocation"] != rows[0]["invocation"] {
			t.Fatalf("span changed: %v", rows)
		}
		for _, key := range []string{"argsHash", "cwdHash"} {
			if value, ok := row[key].(string); !ok || len(value) != 64 {
				t.Fatalf("missing %s: %v", key, row)
			}
		}
	}
	terminal := rows[2]
	if terminal["status"] != float64(0) || terminal["timedOut"] != false || terminal["childPid"] == nil || terminal["userCpuNs"] == nil || terminal["systemCpuNs"] == nil {
		t.Fatalf("incomplete waited child: %v", terminal)
	}
	wantScope := "waited-subtree"
	if runtime.GOOS == "windows" {
		wantScope = "process"
	}
	if terminal["cpuScope"] != wantScope {
		t.Fatalf("incorrect CPU scope: %v", terminal)
	}
	if runtime.GOOS == "windows" && terminal["peakMemoryBytes"] != nil {
		t.Fatalf("unobserved Windows peak: %v", terminal)
	}
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(file); err != nil || info.Mode().Perm() != 0600 {
			t.Fatalf("trace mode: %v %v", info, err)
		}
	}
	data, _ := os.ReadFile(marker)
	var inherited map[string]string
	if err := json.Unmarshal(data, &inherited); err != nil {
		t.Fatal(err)
	}
	if inherited["parent"] != rows[0]["invocation"] || inherited["trial"] != "native-trial-1" {
		t.Fatalf("span not propagated: %v", inherited)
	}
	trace, _ := os.ReadFile(file)
	for _, secret := range []string{scratch, "private-stdin", "private-argument", "child-out", "child-err"} {
		if strings.Contains(string(trace), secret) {
			t.Fatalf("trace leaked %q", secret)
		}
	}
}

func TestNativeProcessTraceStartErrorAndTimeout(t *testing.T) {
	t.Run("start error", func(t *testing.T) {
		scratch := t.TempDir()
		file := filepath.Join(scratch, "trace.jsonl")
		result := run(time.Second, "", nativeTraceEnv(file, "unused"), "", filepath.Join(scratch, "missing-program"))
		if result.status != -1 || result.err == nil || result.timedOut || result.stdout != "" || result.stderr != "" {
			t.Fatalf("start behavior: %+v", result)
		}
		rows := readNativeTrace(t, file)
		if len(rows) != 2 || rows[0]["phase"] != "attempt" || rows[1]["phase"] != "ended" || rows[1]["outcome"] != "start-error" || rows[1]["childPid"] != nil || rows[1]["status"] != nil || rows[1]["userCpuNs"] != nil {
			t.Fatalf("invented child start: %v", rows)
		}
	})
	t.Run("timeout", func(t *testing.T) {
		scratch := t.TempDir()
		file, marker := filepath.Join(scratch, "trace.jsonl"), filepath.Join(scratch, "ran.json")
		env := nativeTraceEnv(file, marker)
		env["QH_NATIVE_TRACE_WAIT"] = "1"
		result := nativeTraceChild(t, env, 2*time.Second)
		if !result.timedOut || result.status != -1 || result.err != context.DeadlineExceeded || result.stdout != "child-out" || result.stderr != "child-err" {
			t.Fatalf("timeout behavior: %+v", result)
		}
		if _, err := os.Stat(marker); err != nil {
			t.Fatalf("child never reached the wait: %v", err)
		}
		rows := readNativeTrace(t, file)
		if len(rows) != 3 || rows[2]["timedOut"] != true || rows[2]["outcome"] != "timeout" || rows[2]["childPid"] == nil {
			t.Fatalf("timeout observations: %v", rows)
		}
	})
}

func TestNativeProcessTraceUnsafeSinkDoesNotChangeChild(t *testing.T) {
	cases := []string{"disabled", "expired", "far-future", "relative", "missing-parent", "full", "directory", "symlink", "hardlink", "cwd", "checkout", "git-metadata", "bare-git", "artifact", "unwritable"}
	for _, name := range cases {
		t.Run(name, func(t *testing.T) {
			scratch := t.TempDir()
			file, marker := filepath.Join(scratch, "trace.jsonl"), filepath.Join(scratch, "ran.json")
			env := nativeTraceEnv(file, marker)
			dir := ""
			victim := ""
			switch name {
			case "disabled":
				env["QUALITY_HARNESS_TRACE_FILE"] = ""
			case "expired":
				env["QUALITY_HARNESS_TRACE_UNTIL"] = "1"
			case "far-future":
				env["QUALITY_HARNESS_TRACE_UNTIL"] = fmt.Sprint(time.Now().Add(time.Hour).UnixMilli())
			case "relative":
				env["QUALITY_HARNESS_TRACE_FILE"] = "relative-native-trace.jsonl"
			case "missing-parent":
				file = filepath.Join(scratch, "absent", "trace.jsonl")
				env["QUALITY_HARNESS_TRACE_FILE"] = file
			case "full":
				f, err := os.Create(file)
				if err != nil {
					t.Fatal(err)
				}
				if err = f.Truncate(8 * 1024 * 1024); err != nil {
					t.Fatal(err)
				}
				f.Close()
			case "directory":
				if err := os.Mkdir(file, 0700); err != nil {
					t.Fatal(err)
				}
			case "symlink", "hardlink":
				victim = filepath.Join(scratch, "original.jsonl")
				if err := os.WriteFile(victim, []byte("untouched"), 0600); err != nil {
					t.Fatal(err)
				}
				var err error
				if name == "symlink" {
					err = os.Symlink(victim, file)
				} else {
					err = os.Link(victim, file)
				}
				if err != nil {
					t.Skipf("platform refused %s fixture: %v", name, err)
				}
			case "cwd":
				dir = scratch
			case "checkout":
				if err := os.Mkdir(filepath.Join(scratch, ".git"), 0700); err != nil {
					t.Fatal(err)
				}
			case "git-metadata":
				if err := os.Mkdir(filepath.Join(scratch, ".git"), 0700); err != nil {
					t.Fatal(err)
				}
				file = filepath.Join(scratch, ".git", "trace.jsonl")
				env["QUALITY_HARNESS_TRACE_FILE"] = file
			case "bare-git":
				if err := os.WriteFile(filepath.Join(scratch, "HEAD"), nil, 0600); err != nil {
					t.Fatal(err)
				}
				if err := os.Mkdir(filepath.Join(scratch, "objects"), 0700); err != nil {
					t.Fatal(err)
				}
			case "artifact":
				env["CLAUDE_PLUGIN_DATA"] = scratch
			case "unwritable":
				if runtime.GOOS == "windows" || os.Geteuid() == 0 {
					t.Skip("POSIX permissions cannot make this fixture unwritable on this platform/user")
				}
				victim = file
				if err := os.WriteFile(file, []byte("untouched"), 0400); err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { os.Chmod(file, 0600) })
			}
			exe, err := os.Executable()
			if err != nil {
				t.Fatal(err)
			}
			result := run(5*time.Second, dir, env, "private-stdin", exe, "-test.run=^TestNativeProcessTraceHelper$")
			if result.status != 0 || result.err != nil || result.timedOut || result.stdout != "child-out" || result.stderr != "child-err" {
				t.Fatalf("unsafe sink changed child: %+v", result)
			}
			data, err := os.ReadFile(marker)
			if err != nil {
				t.Fatal(err)
			}
			var inherited map[string]string
			if err = json.Unmarshal(data, &inherited); err != nil {
				t.Fatal(err)
			}
			if inherited["parent"] != "outer-span-1" {
				t.Fatalf("failed trace changed child parentage: %v", inherited)
			}
			if victim != "" {
				data, err := os.ReadFile(victim)
				if err != nil || string(data) != "untouched" {
					t.Fatalf("diagnostics changed protected file: %q, %v", data, err)
				}
			}
			switch name {
			case "full":
				info, err := os.Stat(file)
				if err != nil || info.Size() != 8*1024*1024 {
					t.Fatalf("cap violated: %v %v", info, err)
				}
			case "directory", "symlink", "hardlink", "unwritable":
			default:
				if _, err := os.Lstat(file); !os.IsNotExist(err) {
					t.Fatalf("unsafe sink was written: %v", err)
				}
			}
		})
	}
}

func TestNativeProcessTraceDisabledBeforeInspection(t *testing.T) {
	// An absent/expired configuration returns before inspecting even the command.
	for _, env := range [][]string{nil, {"QUALITY_HARNESS_TRACE_FILE=relative.jsonl"}, {"QUALITY_HARNESS_TRACE_FILE=" + filepath.Join(t.TempDir(), "trace.jsonl"), "QUALITY_HARNESS_TRACE_UNTIL=1"}} {
		if trace := startProcessTrace(&exec.Cmd{Env: env}, "", "attempt"); trace != nil {
			t.Fatalf("disabled trace: %v", trace)
		}
	}
}

func TestNativeProcessTraceReleasedIsNotCompleted(t *testing.T) {
	scratch := t.TempDir()
	file, marker := filepath.Join(scratch, "trace.jsonl"), filepath.Join(scratch, "ran.json")
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(exe, "-test.run=^TestNativeProcessTraceHelper$")
	cmd.Env = environ(nativeTraceEnv(file, marker))
	trace := startProcessTrace(cmd, "", "attempt")
	if trace == nil {
		t.Fatal("trace not enabled")
	}
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	trace.started(cmd)
	// The explicit waiter below owns this fixture's cleanup; the release observation
	// itself cannot claim an exit. Production calls it with Process.Release's result.
	trace.released(nil)
	if err = cmd.Wait(); err != nil {
		t.Fatal(err)
	}
	rows := readNativeTrace(t, file)
	if len(rows) != 3 || rows[2]["phase"] != "released" || rows[2]["status"] != nil || rows[2]["userCpuNs"] != nil || rows[2]["cpuScope"] != "unknown" {
		t.Fatalf("release invented completion: %v", rows)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatal(err)
	}
}

func TestNativeProcessTraceResourceUnits(t *testing.T) {
	for _, test := range []struct {
		platform string
		want     int64
	}{{"darwin", 7}, {"linux", 7168}} {
		value := processTracePeakMemory(7, test.platform)
		if value == nil || *value != test.want {
			t.Fatalf("%s maxrss unit: %v", test.platform, value)
		}
	}
	if value := processTracePeakMemory(7, "windows"); value != nil {
		t.Fatalf("unobserved Windows peak: %d", *value)
	}
}

func TestNativeProcessTraceArtifactReturnIsSelfReported(t *testing.T) {
	scratch := t.TempDir()
	file, marker := filepath.Join(scratch, "trace.jsonl"), filepath.Join(scratch, "ran.json")
	requestDir := filepath.Join(scratch, "pass")
	if err := os.Mkdir(requestDir, 0700); err != nil {
		t.Fatal(err)
	}
	request := filepath.Join(requestDir, "request.json")
	// Missing request fields return2 before acquiring any machine lease or running a gate.
	body, _ := json.Marshal(map[string]any{"cwd": filepath.Join(scratch, "project"), "targets": []any{}})
	if err := os.Mkdir(filepath.Join(scratch, "project"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(request, body, 0600); err != nil {
		t.Fatal(err)
	}
	env := nativeTraceEnv(file, marker)
	env["QH_NATIVE_TRACE_ARTIFACT_REQUEST"] = request
	result := nativeTraceChild(t, env, 5*time.Second)
	if result.status != 2 || result.err != nil || result.stdout != "child-out" || result.stderr != "child-err" {
		t.Fatalf("artifact return changed: %+v", result)
	}
	rows := readNativeTrace(t, file)
	if len(rows) != 4 {
		t.Fatalf("expected child self-return and waited terminal: %v", rows)
	}
	row := rows[2]
	if row["phase"] != "ended" || row["outcome"] != "artifact-pass-returned" || row["invocation"] != rows[0]["invocation"] || row["status"] != float64(2) || row["pid"] != rows[1]["childPid"] || row["userCpuNs"] != nil || row["cpuScope"] != "unknown" {
		t.Fatalf("artifact return invented wait resources: %v", rows)
	}
}

func TestNativeProcessTraceSeparators(t *testing.T) {
	if got := processTracePath("directory\\nested/file.jsonl"); got != filepath.Join("directory", "nested", "file.jsonl") {
		t.Fatalf("mixed separators: %q", got)
	}
}
