package hooks

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// BACKLOG §444, the Codex review of d3e832c3..e6968459: the paths of one write share one deadline; past it the rest are named as
// not looked at, not read one budget each past the hook's own timeout. Here the deadline is spent before the second path.
// tests/mrw-decision-context.test.mjs runs it.
func TestDecisionTargetsShareOneDeadline(t *testing.T) {
	saved := decisionTargetsBudget
	decisionTargetsBudget = 0
	defer func() { decisionTargetsBudget = saved }()
	dir := t.TempDir()
	input, err := parseJSON(`{"tool_name":"mcp__mrw__mrw_write","cwd":` + strconv.Quote(dir) + `,"session_id":"deadline","tool_input":{"plan":"@@ a.go 0 create\nx\n@@ b.go 0 create\ny\n@@ c.go 0 create\nz\n"}}`)
	if err != nil {
		t.Fatal(err)
	}
	said := decisionContextFor(input.(*Obj))
	if !strings.Contains(said, "read for the first 1 of the 3 paths this write names; the rest were not looked at") {
		t.Fatalf("a spent deadline did not stop the reads and say so: %q", said)
	}
}

// The scoped verification of 9c657bdc: the root lookup and git's two listings ran once per path, outside the deadline, so a
// write of many paths could still outlast the hook. They follow from the session's directory, and are taken once per call.
func TestDecisionTargetsListTheRepositoryOnce(t *testing.T) {
	dir := t.TempDir()
	if r := git(30*time.Second, nil, "-C", dir, "init", "-q"); r.status != 0 {
		t.Fatalf("git init: %s", r.stderr)
	}
	saved := decisionListing
	listings := 0
	decisionListing = func(root string) []string { listings++; return nil }
	defer func() { decisionListing = saved }()
	input, err := parseJSON(`{"tool_name":"mcp__mrw__mrw_write","cwd":` + strconv.Quote(dir) + `,"session_id":"once","tool_input":{"plan":"@@ a.go 0 create\nx\n@@ b.go 0 create\ny\n@@ c.go 0 create\nz\n"}}`)
	if err != nil {
		t.Fatal(err)
	}
	decisionContextFor(input.(*Obj))
	if listings != 1 {
		t.Fatalf("a write of three paths listed the repository %d times, want once", listings)
	}
}

func TestDecisionTargetsReuseCorpusOnlyWithinTheEvent(t *testing.T) {
	root := canonical(t.TempDir())
	record := "docs/adr/ADR-001-scope.md"
	file := filepath.Join(root, record)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	write := func(title string) {
		t.Helper()
		text := "# ADR-001: " + title + "\n\n**Status:** Accepted\n**Governs:** `a.go`, `b.go`\n\n## Decision\n\nx\n"
		if err := os.WriteFile(file, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	event := func() *decisionRepo {
		return &decisionRepo{cwd: root, root: root, looked: true, listed: true, listing: []string{record, "a.go", "b.go"}}
	}
	assertTitle := func(repo *decisionRepo, target, title string) {
		t.Helper()
		if got := decisionContextForPath(O(), repo, target); !strings.Contains(got, title) {
			t.Fatalf("context for %s = %q, want %q", target, got, title)
		}
	}
	write("First decision")
	first := event()
	assertTitle(first, "a.go", "First decision")
	write("Later decision")
	assertTitle(first, "b.go", "First decision")
	assertTitle(event(), "b.go", "Later decision")

	first.readContext = func(string) string { panic("reader failed") }
	if got := decisionContextForPath(O(), first, "a.go"); got != decisionReaderFailed {
		t.Fatalf("failed lookup = %q, want could-not-look", got)
	}
	assertTitle(first, "b.go", "Later decision")
}
