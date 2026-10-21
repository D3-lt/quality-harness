package hooks

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// ADR-120 T9. The rules the hook scenarios cannot reach: a list that changed, a code tree that differs, a newer failure on the
// same code, a write git cannot see, and the grammar a declaration is read by. tests/prose-pass.test.mjs runs this file.

func checkRow(event, record string, seq float64, tree, codeTree string, prose []any) *Obj {
	e := O("event", event, "record", record, "seq", seq, "after", O("tree", tree, "codeTree", codeTree))
	if prose != nil {
		e.Set("prose", prose)
	}
	return e
}

func TestCarriedPassStands(t *testing.T) {
	list := []any{"docs/**"}
	log := Log{E: []any{checkRow("check.passed", "r1", 1, "T1", "C1", list)}, Complete: true}
	ask := func(l Log, c *carry) string { return checkStanding(l, "T2", c) }
	if got := ask(log, nil); got != "none" {
		t.Fatalf("no carry: %s", got)
	}
	if got := ask(log, &carry{codeTree: "C1", prose: []string{"docs/**"}}); got != "passed" {
		t.Fatalf("the control: %s", got)
	}
	if got := ask(log, &carry{codeTree: "C1", prose: []string{"docs/**", "notes/"}}); got != "none" {
		t.Fatalf("another list: %s", got)
	}
	if got := ask(log, &carry{codeTree: "C2", prose: []string{"docs/**"}}); got != "none" {
		t.Fatalf("another code tree: %s", got)
	}
	failed := Log{E: []any{checkRow("check.passed", "r1", 1, "T1", "C1", list), checkRow("check.failed", "r2", 2, "T9", "C1", list)}, Complete: true}
	if got := ask(failed, &carry{codeTree: "C1", prose: []string{"docs/**"}}); got != "not-passed" {
		t.Fatalf("a newer failure on the same code tree wins: %s", got)
	}
}

func TestCarryForRefusesWhatCannotSpeak(t *testing.T) {
	clean := Log{E: []any{}, Complete: true}
	if carryFor(clean, "", "C1", []any{"docs/**"}) == nil {
		t.Fatal("the control")
	}
	for name, c := range map[string]*carry{
		"no code tree":       carryFor(clean, "", undefined, []any{"docs/**"}),
		"an empty code tree": carryFor(clean, "", "", []any{"docs/**"}),
		"no list":            carryFor(clean, "", "C1", undefined),
		"an empty list":      carryFor(clean, "", "C1", []any{}),
		"a list of numbers":  carryFor(clean, "", "C1", []any{float64(1)}),
	} {
		if c != nil {
			t.Fatalf("%s carries", name)
		}
	}
	unseen := Log{E: []any{O("event", "file.written", "observable", false, "path", "out.txt")}, Complete: true}
	if carryFor(unseen, "", "C1", []any{"docs/**"}) != nil {
		t.Fatal("a write git cannot see leaves the carry refused")
	}
}

func TestCarriedAsRecorded(t *testing.T) {
	record := O("after", O("tree", "T1", "codeTree", "C1"), "prose", []any{"docs/**"})
	if !carriedAsRecorded(checkRow("check.passed", "r1", 1, "T1", "C1", []any{"docs/**"}), record) {
		t.Fatal("the control")
	}
	if carriedAsRecorded(checkRow("check.passed", "r1", 1, "T1", "C1", []any{"docs/**", "x/"}), record) {
		t.Fatal("a list the record does not hold")
	}
	if carriedAsRecorded(checkRow("check.passed", "r1", 1, "T1", "forged", []any{"docs/**"}), record) {
		t.Fatal("a code tree the record does not hold")
	}
	if !carriedAsRecorded(O("after", O("tree", "T1")), record) {
		t.Fatal("an event that names neither is bound by its tree alone")
	}
}

func TestProseSpecRefused(t *testing.T) {
	for _, spec := range []string{".", "*", "**", "***", "*.*", "?*", "*.json", "**/*.json", ".QUALITY-harness.json", ".quality-harness.json", "-x", ":(exclude)docs", "docs/../src/", "/etc", "a b"} {
		if !proseSpecRefused(spec) {
			t.Errorf("%q is accepted", spec)
		}
	}
	for _, spec := range []string{"docs", "docs/", "docs/**", "**/*.md", "*.md", "README.md", "packages/web/docs/"} {
		if proseSpecRefused(spec) {
			t.Errorf("%q is refused", spec)
		}
	}
}

func TestLedgerBindsCarryAsRecorded(t *testing.T) {
	dir := t.TempDir()
	if r := git(30*time.Second, nil, "-C", dir, "init", "-q"); r.err != nil || r.status != 0 {
		t.Fatalf("git init: %v %d", r.err, r.status)
	}
	if err := os.MkdirAll(stateDir(dir), 0o755); err != nil {
		t.Fatal(err)
	}
	observation := O("ok", true, "tree", "T1", "index", "I", "head", "H", "codeTree", "C1")
	record := O("id", "r1", "exit", float64(0), "git", true, "before", observation, "after", observation, "prose", []any{"docs/**"})
	if err := os.WriteFile(filepath.Join(stateDir(dir), "checks.jsonl"), []byte(stringify(record)+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	dropped := func(e *Obj) int { return ledgerBoundLog(dir, Log{E: []any{e}, Complete: true}).dropped }
	if got := dropped(checkRow("check.passed", "r1", 1, "T1", "C1", []any{"docs/**"})); got != 0 {
		t.Fatalf("the control dropped %d", got)
	}
	if got := dropped(checkRow("check.passed", "r1", 1, "T1", "C1", []any{"docs/**", "x/"})); got != 1 {
		t.Fatalf("a list the record does not hold dropped %d", got)
	}
	if got := dropped(checkRow("check.passed", "r1", 1, "T1", "forged", []any{"docs/**"})); got != 1 {
		t.Fatalf("a code tree the record does not hold dropped %d", got)
	}
}
