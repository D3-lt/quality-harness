package hooks

import (
	"bytes"
	"compress/zlib"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

// writeLoose stores `body` as the loose object `sha` of a git directory, framed and deflated as git stores one.
func writeLoose(t *testing.T, gitDir, sha, kind, body string) {
	t.Helper()
	var packed bytes.Buffer
	w := zlib.NewWriter(&packed)
	w.Write([]byte(kind + " " + strconv.Itoa(len(body)) + "\x00" + body))
	w.Close()
	dir := filepath.Join(gitDir, "objects", sha[:2])
	if err := os.MkdirAll(dir, 0o777); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, sha[2:]), packed.Bytes(), 0o666); err != nil {
		t.Fatal(err)
	}
}

func TestBranchStateCommitParents(t *testing.T) {
	gitDir := t.TempDir()
	a, b, c := strings.Repeat("a", 40), strings.Repeat("b", 40), strings.Repeat("c", 40)
	writeLoose(t, gitDir, a, "commit", "tree "+c+"\nparent "+b+"\nauthor x\n\nparent "+c+" is the message, not a header\n")
	writeLoose(t, gitDir, b, "commit", "tree "+c+"\nparent "+a+"\nparent "+c+"\n\nmerge\n")
	writeLoose(t, gitDir, c, "tree", "parent "+a+"\n")
	if got, ok := bsCommitParents(gitDir, a); !ok || !reflect.DeepEqual(got, []string{b}) {
		t.Fatalf("one parent, the message ignored: %v %v", got, ok)
	}
	if got, ok := bsCommitParents(gitDir, b); !ok || !reflect.DeepEqual(got, []string{a, c}) {
		t.Fatalf("a merge has two: %v %v", got, ok)
	}
	// DIRTY twins: not a commit, not stored loose, not a sha, a linked worktree's objects through commondir.
	for what, sha := range map[string]any{"a tree": c, "a packed commit": strings.Repeat("d", 40), "no sha": "HEAD", "null": nil} {
		if got, ok := bsCommitParents(gitDir, sha); ok {
			t.Fatalf("%s has no parents to read: %v", what, got)
		}
	}
	linked := t.TempDir()
	os.WriteFile(filepath.Join(linked, "commondir"), []byte(gitDir+"\n"), 0o666)
	if got, ok := bsCommitParents(linked, a); !ok || !reflect.DeepEqual(got, []string{b}) {
		t.Fatalf("a worktree reads the common objects: %v %v", got, ok)
	}
}

func TestBranchStateOwnCommitWalk(t *testing.T) {
	graph := map[string][]string{"c": {"b"}, "b": {"a"}, "m": {"b", "x"}}
	parents := func(_ string, sha any) ([]string, bool) { up, ok := graph[sha.(string)]; return up, ok }
	if got, ok := bsOwnCommitWalk("", "a", "c", 50, parents); !ok || !reflect.DeepEqual(got, []string{"c", "b"}) {
		t.Fatalf("c then b back to a: %v %v", got, ok)
	}
	if got, ok := bsOwnCommitWalk("", "a", "a", 50, parents); !ok || len(got) != 0 {
		t.Fatalf("no move is an empty walk: %v %v", got, ok)
	}
	if _, ok := bsOwnCommitWalk("", "a", "c", 1, parents); ok {
		t.Fatal("past the limit nothing is shown")
	}
	if _, ok := bsOwnCommitWalk("", "a", "m", 50, parents); ok {
		t.Fatal("a merge is not a single-parent walk")
	}
	if _, ok := bsOwnCommitWalk("", nil, "c", 50, parents); ok {
		t.Fatal("an unknown start is not a walk")
	}
}

func TestBranchStateReplaceFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, bsSnapshotFile)
	now := time.Now()
	old, young, other := file+".123.tmp", file+".456.tmp", filepath.Join(dir, "qh-branch-state.jsonX.1.tmp")
	for _, spare := range []string{old, young, other} {
		os.WriteFile(spare, []byte("x"), 0o666)
	}
	os.Chtimes(old, now.Add(-2*time.Minute), now.Add(-2*time.Minute))
	os.Chtimes(other, now.Add(-2*time.Minute), now.Add(-2*time.Minute))
	if err := bsReplaceFile(file, `{"a":1}`, bsDisk, now); err != nil {
		t.Fatal(err)
	}
	if text, _ := os.ReadFile(file); string(text) != `{"a":1}` {
		t.Fatalf("replaced: %q", text)
	}
	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }
	if exists(old) || !exists(young) || !exists(other) {
		t.Fatalf("only the snapshot's own temporary older than a minute is reaped: old %v young %v other %v", exists(old), exists(young), exists(other))
	}
	// Windows refuses a rename over a file another program holds open; the write then lands in place, and no temporary stays.
	refusing := bsDisk
	refusing.rename = func(string, string) error { return errors.New("access denied") }
	if err := bsReplaceFile(file, `{"b":2}`, refusing, now); err != nil {
		t.Fatal(err)
	}
	if text, _ := os.ReadFile(file); string(text) != `{"b":2}` {
		t.Fatalf("written in place: %q", text)
	}
	if entries, _ := filepath.Glob(file + ".*.tmp"); len(entries) != 1 || entries[0] != young {
		t.Fatalf("the refused temporary is removed: %v", entries)
	}
}
