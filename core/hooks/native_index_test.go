package hooks

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNativeIndexCodeTree(t *testing.T) {
	root := t.TempDir()
	t.Setenv("QUALITY_HARNESS_OBSERVE_BUDGET_MS", "60000")
	git := func(args ...string) {
		args = append([]string{"-c", "user.name=qh", "-c", "user.email=qh@example.invalid"}, args...)
		answer := run(20*time.Second, root, nil, "", "git", args...)
		if answer.err != nil || answer.status != 0 {
			t.Fatalf("git %v: %v %s", args, answer.err, answer.stderr)
		}
	}
	write := func(file, text string) {
		if err := os.WriteFile(filepath.Join(root, file), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	look := func() *Obj {
		got := observeWith(root, []string{"docs/**"}, true)
		if !isTrue(get(got, "ok")) {
			t.Fatalf("observation could not run: %v", got)
		}
		return got
	}
	if err := os.MkdirAll(filepath.Join(root, "docs"), 0700); err != nil {
		t.Fatal(err)
	}
	write("code.go", "original\n")
	write(filepath.Join("docs", "note.md"), "original\n")
	git("init", "-q")
	git("add", "-A")
	git("commit", "-qm", "fixture")
	base := look()
	if !strict(get(base, "codeTree"), get(base, "indexCodeTree")) {
		t.Fatal("unchanged code must have matching working and staged code trees")
	}
	write(filepath.Join("docs", "note.md"), "prose only\n")
	git("add", "docs")
	prose := look()
	if !strict(get(prose, "codeTree"), get(base, "codeTree")) || !strict(get(prose, "indexCodeTree"), get(base, "codeTree")) {
		t.Fatal("a prose-only stage must preserve both code trees")
	}
	write("code.go", "staged\n")
	git("add", "code.go")
	write("code.go", "working\n")
	changed := look()
	if strict(get(changed, "codeTree"), get(changed, "indexCodeTree")) {
		t.Fatal("working code must not stand in for different staged code")
	}
}
