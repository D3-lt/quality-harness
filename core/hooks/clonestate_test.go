package hooks

import (
	"os/exec"
	"path/filepath"
	"testing"
)

// BACKLOG §447: the review ledger is the clone's, not the worktree's, in the core as in event-log.mjs; checks stay per
// worktree. Built with real git in a directory this test made.
func TestCloneStateDirIsSharedByWorktrees(t *testing.T) {
	t.Setenv("QUALITY_HARNESS_STATE_DIR", "")
	root := t.TempDir()
	main := filepath.Join(root, "main")
	tree := filepath.Join(root, "wt")
	for _, argv := range [][]string{
		{"init", "-q", main},
		{"-C", main, "-c", "user.email=t@example.invalid", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "one"},
		{"-C", main, "worktree", "add", "-q", "--detach", tree},
	} {
		if out, err := exec.Command("git", argv...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v %s", argv, err, out)
		}
	}
	if stateDirSpawn(tree, false) == stateDirSpawn(main, false) {
		t.Fatalf("checks must stay per worktree: both are %s", stateDirSpawn(main, false))
	}
	if got, want := cloneStateDirSpawn(tree, false), stateDirSpawn(main, false); got != want {
		t.Errorf("cloneStateDirSpawn(worktree) = %s, want the main checkout's %s", got, want)
	}
	if got, want := cloneStateDirSpawn(main, false), stateDirSpawn(main, false); got != want {
		t.Errorf("cloneStateDirSpawn(main) = %s, want %s", got, want)
	}
}
