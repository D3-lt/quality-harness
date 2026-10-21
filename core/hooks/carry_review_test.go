package hooks

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The two blocking findings of the review of 7a9107e8..dcc4693a, Go side. tests/carry-and-probe-fixes.test.mjs runs this file.

func TestCarryForRefusesAForeignWrite(t *testing.T) {
	dir := t.TempDir()
	if r := git(30*time.Second, nil, "-C", dir, "init", "-q"); r.err != nil || r.status != 0 {
		t.Fatalf("git init: %v %d", r.err, r.status)
	}
	list := []any{"docs/**"}
	started := "2026-10-21T10:00:00.000Z"
	pass := checkRow("check.passed", "r1", 1, "T1", "C1", list)
	pass.Set("before", O("at", started))
	log := Log{E: []any{pass}, Complete: true}
	if carryFor(log, dir, "C1", list) == nil {
		t.Fatal("the control: no other session wrote anything")
	}
	sessions := filepath.Join(stateDir(dir), "sessions")
	if err := os.MkdirAll(sessions, 0o755); err != nil {
		t.Fatal(err)
	}
	wrote := func(at string) {
		row := O("at", at, "event", "file.written", "path", filepath.Join(dir, "build", "x"), "observable", false)
		if err := os.WriteFile(filepath.Join(sessions, "other.jsonl"), []byte(stringify(row)+"\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	wrote("2026-10-21T09:00:00.000Z")
	if carryFor(log, dir, "C1", list) == nil {
		t.Fatal("a write logged before the pass started is covered by it")
	}
	wrote("2026-10-21T10:30:00.000Z")
	if carryFor(log, dir, "C1", list) != nil {
		t.Fatal("a write another session logged after the pass leaves the carry refused")
	}
	if carryFor(log, "", "C1", list) == nil {
		t.Fatal("with no root there is nowhere to look")
	}
}

func TestCheckCanStartReadsAssignments(t *testing.T) {
	empty := t.TempDir()
	lookup := func(name string) (string, bool) {
		if name == "PATH" {
			return empty, true
		}
		return "", false
	}
	for _, command := range []string{"PATH=/bin sh -c 'test -f CLAUDE.md'", "PATH=/bin sh -c true", "FOO=1 nosuchprogram-xyz"} {
		if !checkCanStart(command, empty, lookup, "linux") {
			t.Errorf("%q cannot start", command)
		}
	}
	for _, command := range []string{"nosuchprogram-xyz", "sh -c true"} {
		if checkCanStart(command, empty, lookup, "linux") {
			t.Errorf("%q can start", command)
		}
	}
}
