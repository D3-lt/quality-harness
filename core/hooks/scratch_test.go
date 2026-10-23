package hooks

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// BACKLOG §409: a temp path is scratch when it lies outside the session's directory, wherever that directory is.
func TestScratchOutside(t *testing.T) {
	project, err := os.MkdirTemp("", "qh-project-under-temp-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(project)
	beside, err := os.MkdirTemp("", "qh-scratch-beside-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(beside)
	// A link in the project out to the scratch corpus, and one beside the project into it: inside by either reading.
	if err := os.Symlink(beside, filepath.Join(project, "out")); err != nil {
		t.Skipf("a directory link cannot be made here: %v", err)
	}
	if err := os.Symlink(project, filepath.Join(beside, "alias")); err != nil {
		t.Skipf("a directory link cannot be made here: %v", err)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home directory to stand for a path outside the temp root")
	}
	// A session started in a subdirectory of a repository under the temp root owns the whole repository.
	if out, err := exec.Command("git", "init", "-q", project).CombinedOutput(); err != nil {
		t.Skipf("git cannot make a repository here: %v %s", err, out)
	}
	if err := os.Mkdir(filepath.Join(project, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		file, cwd string
		want      bool
	}{
		{filepath.Join(beside, "docs", "T1-orphan.md"), project, true},
		{filepath.Join(project, "docs", "T1-orphan.md"), project, false},
		{filepath.Join(home, "not-temp", "T1.md"), project, false},
		{filepath.Join(beside, "T1.md"), home, true},
		{filepath.Join(project, "out", "T1.md"), project, false},
		{filepath.Join(beside, "alias", "T1.md"), project, false},
		{filepath.Join(project, "docs", "T1-orphan.md"), filepath.Join(project, "sub"), false},
		{filepath.Join(beside, "docs", "T1-orphan.md"), filepath.Join(project, "sub"), true},
	}
	for _, c := range cases {
		if got := scratchOutside(c.file, c.cwd); got != c.want {
			t.Errorf("scratchOutside(%q, %q) = %v, want %v", c.file, c.cwd, got, c.want)
		}
	}
}

// The deferred pass leaves out what the per-edit pass leaves out (artifact-pass.mjs passCandidates): for a project outside
// the temp root a temp path is a scratch corpus, and a relative path or one answered for its content is left out too.
func TestPassCandidates(t *testing.T) {
	scratch, err := os.MkdirTemp("", "qh-deferred-scratch-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(scratch)
	project := filepath.Join(string(filepath.Separator), "not-under-the-temp-root", "project")
	record := filepath.Join(project, "docs", "adr", "ADR-001-x.md")
	answeredRecord := filepath.Join(project, "docs", "adr", "ADR-002-y.md")
	corpus := filepath.Join(scratch, "ADR-003-z.md")
	if err := os.WriteFile(corpus, []byte("# ADR-003: Z\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	answered := answeredBlobs([]any{O("event", "artifact.gated", "path", answeredRecord, "blob", "blob-2", "complete", true)})
	identities := map[string]any{record: "blob-1", answeredRecord: "blob-2", corpus: "blob-3"}
	got := passCandidates([]string{record, answeredRecord, corpus, filepath.Join("docs", "adr", "ADR-004.md")}, project, answered, identities)
	if len(got) != 1 || got[0] != record {
		t.Errorf("passCandidates = %q, want only %q", got, record)
	}
}

// The Codex review of v3.8.53..42a903a8: a failed repository lookup gates, and a case alias is the project where case folds.
func TestScratchOutsideLookupAndCase(t *testing.T) {
	project, err := os.MkdirTemp("", "qh-lookup-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(project)
	record := filepath.Join(project, "docs", "adr", "ADR-001-x.md")
	cwd := filepath.Join(project, "sub")
	saved := repositoryLookup
	defer func() { repositoryLookup = saved }()
	repositoryLookup = func(string) lookup { return lookup{ok: false, reason: "git timed out"} }
	if scratchOutside(record, cwd) {
		t.Error("a failed lookup exempted the project's own record")
	}
	repositoryLookup = func(string) lookup { return lookup{ok: true} }
	beside := filepath.Join(filepath.Dir(project), filepath.Base(project)+"-beside", "x.md")
	if scratchOutside(beside, cwd) {
		t.Error("no root named (any non-zero git exit reads so): a corpus beside should be gated")
	}
	repositoryLookup = func(string) lookup { return lookup{ok: true, root: project} }
	if !scratchOutside(beside, cwd) {
		t.Error("a corpus beside a repository git named should be scratch")
	}
	if foldsCase() {
		alias := filepath.Join(filepath.Dir(project), strings.ToUpper(filepath.Base(project)), "sub")
		if scratchOutside(filepath.Join(cwd, "x.md"), alias) {
			t.Error("a case alias of the session directory exempted its own record")
		}
	}
}
