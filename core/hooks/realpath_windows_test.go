//go:build windows

// BACKLOG §445: every real-path site of the core takes nativeRealpath, so this is the one place a Windows junction, a missing
// path, a path past MAX_PATH and Node's namespacing are checked against what libuv answers. Run on Windows by
// tests/native-realpath.test.mjs.
package hooks

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestNativeRealpathWindows(t *testing.T) {
	scratch := t.TempDir()
	target := filepath.Join(scratch, "target")
	if err := os.MkdirAll(filepath.Join(target, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "sub", "f.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(scratch, "link")
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
		t.Fatalf("mklink /J: %v %s", err, out)
	}
	realTarget, err := nativeRealpath(target)
	if err != nil {
		t.Fatalf("nativeRealpath(%s): %v", target, err)
	}
	if strings.HasPrefix(realTarget, `\\?\`) {
		t.Errorf("nativeRealpath kept the namespace prefix: %s", realTarget)
	}
	// The junction resolves to its target, as realpathSync.native does; filepath.EvalSymlinks keeps the junction.
	for _, tc := range []struct{ through, want string }{
		{link, realTarget},
		{filepath.Join(link, "sub", "f.txt"), filepath.Join(realTarget, "sub", "f.txt")},
	} {
		got, err := nativeRealpath(tc.through)
		if err != nil || !strings.EqualFold(got, tc.want) {
			t.Errorf("nativeRealpath(%s) = %q, %v; want %q", tc.through, got, err, tc.want)
		}
	}
	if kept, err := filepath.EvalSymlinks(link); err == nil && strings.EqualFold(kept, realTarget) {
		t.Logf("filepath.EvalSymlinks followed the junction here (%s); the comparison above still holds", kept)
	}
	// A missing path is ErrNotExist, as the callers that fall back to a parent expect.
	if _, err := nativeRealpath(filepath.Join(target, "missing")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("a missing path: %v, want ErrNotExist", err)
	}
	// A path past MAX_PATH opens because it is namespaced first, as Node's toNamespacedPath makes it.
	deep := target
	for len(deep) < 300 {
		deep = filepath.Join(deep, strings.Repeat("d", 40))
	}
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatal(err)
	}
	if got, err := nativeRealpath(deep); err != nil || len(got) < 300 {
		t.Errorf("a path past MAX_PATH: %q, %v", got, err)
	}
	for in, want := range map[string]string{
		`C:\x\y`:            `\\?\C:\x\y`,
		`c:\x`:              `\\?\c:\x`,
		`\\srv\share\x`:     `\\?\UNC\srv\share\x`,
		`\\?\C:\x`:          `\\?\C:\x`,
		`\\.\pipe\x`:        `\\.\pipe\x`,
		`C:`:                `C:`,
		`relative\path.txt`: `relative\path.txt`,
	} {
		if got := namespaced(in); got != want {
			t.Errorf("namespaced(%q) = %q, want %q", in, got, want)
		}
	}
}
