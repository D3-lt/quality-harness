// ADR-136 T1: answers the rows tests/shell-hook-parity.test.mjs builds from plugin/scripts/run-shell-hook.mjs and
// plugin/scripts/uninteresting.mjs. Skipped when QH_SHELL_HOOK_CORPUS is unset: the rows exist only where the Node side wrote
// them.
package hooks

import (
	"fmt"
	"os"
	"testing"
)

// shkLookup answers an environment lookup from a JSON object, as a JavaScript object of strings is read.
func shkLookup(env any) func(string) (string, bool) {
	return func(key string) (string, bool) {
		s, ok := get(env, key).(string)
		return s, ok
	}
}

func TestShellHookParity(t *testing.T) {
	path := os.Getenv("QH_SHELL_HOOK_CORPUS")
	if path == "" {
		t.Skip("QH_SHELL_HOOK_CORPUS is unset; tests/shell-hook-parity.test.mjs writes it")
	}
	text, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the corpus could not be read: %v", err)
	}
	parsed, err := parseJSON(string(text))
	if err != nil {
		t.Fatalf("the corpus is not JSON: %v", err)
	}
	hostRow := get(parsed, "host")
	host := shkHost{cwd: strOr(get(hostRow, "cwd")), env: shkLookup(get(hostRow, "env")), windows: isTrue(get(hostRow, "windows"))}
	rows, _ := get(parsed, "rows").([]any)
	disagreements := 0
	for i, row := range rows {
		fn := strOr(get(row, "fn"))
		args, _ := get(row, "args").([]any)
		arg := func(n int) any {
			if n < len(args) {
				return args[n]
			}
			return undefined
		}
		str := func(n int) string { return strOr(arg(n)) }
		orNullString := func(s string, ok bool) any {
			if ok {
				return s
			}
			return nil
		}
		var got any
		switch fn {
		case "normalizeHookPayload":
			got = shkNormalizeHookPayload(str(0), str(1))
		case "hookFilePathFromPayload":
			got = orNullString(shkHookFilePathFromPayload(str(0), str(1)))
		case "hookArguments":
			argv, err := shkHookArguments(str(0), str(1), str(2))
			if err != nil {
				got = O("threw", err.Error())
			} else {
				got = argv
			}
		case "resolveBashExecutable":
			existing := map[string]bool{}
			list, _ := arg(2).([]any)
			for _, item := range list {
				existing[strOr(item)] = true
			}
			got = orNullString(shkResolveBash(str(0), shkLookup(arg(1)), func(c string) bool { return existing[c] }))
		case "shellHookTimeoutMs":
			got = shkShellHookTimeoutMs(shkLookup(arg(0)))
		case "shellRuntimeCrashed":
			got = shkShellRuntimeCrashed(str(0))
		case "persistedEventPath":
			got = shkPersistedEventPath(str(0), str(1), str(2), host)
		case "relativePathIsUninteresting":
			got = shkRelativePathIsUninteresting(str(0))
		default:
			t.Fatalf("row %d names a function this test does not answer: %q", i, fn)
		}
		want := get(row, "want")
		if stringify(got) != stringify(want) {
			disagreements++
			if disagreements <= 20 {
				t.Errorf("row %d %s(%s):\n  node: %s\n  go:   %s", i, fn, stringify(args), stringify(want), stringify(got))
			}
		}
	}
	fmt.Printf("%d rows compared, %d disagreements\n", len(rows), disagreements)
}
