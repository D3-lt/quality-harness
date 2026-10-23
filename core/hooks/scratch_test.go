package hooks

import (
	"os"
	"path/filepath"
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
	}
	for _, c := range cases {
		if got := scratchOutside(c.file, c.cwd); got != c.want {
			t.Errorf("scratchOutside(%q, %q) = %v, want %v", c.file, c.cwd, got, c.want)
		}
	}
}
