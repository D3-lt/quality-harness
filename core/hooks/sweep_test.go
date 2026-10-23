package hooks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Ultrareview of v3.8.53..main: both cores claim one daily sweep guard, and only the Node one removed the statusline's
// per-session cache, so a day the Go core claimed it left them all (housekeeping.mjs STATUS_CACHE, BACKLOG §414).
func TestSweepStatusCache(t *testing.T) {
	tmp := t.TempDir()
	for _, name := range []string{"TMPDIR", "TMP", "TEMP"} {
		t.Setenv(name, tmp)
	}
	aged := func(name string, age time.Duration) string {
		file := filepath.Join(tmp, name)
		if err := os.WriteFile(file, []byte("{}"), 0o644); err != nil {
			t.Fatal(err)
		}
		when := time.Now().Add(-age)
		if err := os.Chtimes(file, when, when); err != nil {
			t.Fatal(err)
		}
		return file
	}
	hex := func(n string) string { return strings.Repeat("0", 32-len(n)) + n }
	old := aged("quality-harness-status-"+hex("1"), 8*24*time.Hour)
	live := aged("quality-harness-status-"+hex("2"), 24*time.Hour)
	short := aged("quality-harness-status-short", 8*24*time.Hour)
	legacy := aged("quality-harness-said-"+hex("3"), 8*24*time.Hour)
	sweepStaleMarkers()
	gone := func(file string) bool { _, err := os.Stat(file); return os.IsNotExist(err) }
	if !gone(old) || !gone(legacy) {
		t.Errorf("a week-old status cache and legacy marker are swept: old gone %v, legacy gone %v", gone(old), gone(legacy))
	}
	if gone(live) || gone(short) {
		t.Errorf("a live cache and a name of another shape stay: live gone %v, short gone %v", gone(live), gone(short))
	}
}
