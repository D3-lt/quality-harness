package hooks

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestSaidWindow is the Go twin of tests/said-per-context-window.test.mjs: a transcript further behind than one budget is
// read from its end, a marker the last request carries is said at once, absence there is no evidence, a compaction inside
// the window is read whole, and the budget left over reads back until the cache is whole.
func TestSaidWindow(t *testing.T) {
	const main = "repl_main_thread:outputStyle:Concise"
	text := "quality-harness: this repository is unchecked"
	mark := ItemMarker("mention", text)
	session := func() (string, map[string]any, saidOptions) {
		dir := t.TempDir()
		file := filepath.Join(dir, "session.jsonl")
		var b strings.Builder
		for i := 0; i < 40; i++ {
			var base any
			if i > 0 {
				base = fmt.Sprintf("r%d", i-1)
			}
			b.WriteString(saidLine(t, saidBlob(fmt.Sprintf("f%d", i), "user", strings.Repeat("x", 1024))))
			b.WriteString(saidLine(t, saidReq(fmt.Sprintf("r%d", i), base, i, []string{fmt.Sprintf("f%d", i)}, main)))
		}
		if err := os.WriteFile(file, []byte(b.String()), 0o644); err != nil {
			t.Fatal(err)
		}
		return file, map[string]any{"session_id": "s1", "transcript_path": file},
			saidOptions{cacheDir: filepath.Join(dir, "cache"), budgetBytes: 4096, budgetMs: saidBudgetMs}
	}
	appendTo := func(file string, records ...map[string]any) {
		f, err := os.OpenFile(file, os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		for _, r := range records {
			if _, err := f.WriteString(saidLine(t, r)); err != nil {
				t.Fatal(err)
			}
		}
	}

	file, input, opt := session()
	appendTo(file, saidBlob("m1", "system", text+"\n"+mark), saidReq("r40", "r39", 40, []string{"m1"}, main))
	if v, _ := saidInContextWith(input, "mention", text, opt); v != "said" {
		t.Fatalf("a marker the last request carries, past the budget: %s, want said", v)
	}
	appendTo(file, saidBlob("u1", "user", "next"), saidReq("r41", "r40", 41, []string{"u1"}, main))
	if v, _ := saidInContextWith(input, "mention", text, opt); v != "said" {
		t.Fatalf("the next firing reads on from the end: %s, want said", v)
	}
	// The budget left over reads back: with a budget past the whole file the cache becomes whole and absence is shown.
	whole := opt
	whole.budgetBytes = 1 << 20
	if v, _ := saidInContextWith(input, "other", "absent", whole); v != "unsaid" {
		t.Fatalf("a cache read back to the start: %s, want unsaid", v)
	}

	file, input, opt = session()
	appendTo(file, saidBlob("m1", "system", "other text"), saidReq("r40", "r39", 40, []string{"m1"}, main))
	if v, _ := saidInContextWith(input, "mention", text, opt); v != "no-evidence" {
		t.Fatalf("from the end, absence is not shown: %s, want no-evidence", v)
	}
	appendTo(file, saidBlob("c1", "user", "summary"), saidReq("r41", nil, 0, []string{"c1"}, main))
	if v, _ := saidInContextWith(input, "mention", text, opt); v != "unsaid" {
		t.Fatalf("a compaction inside the window: %s, want unsaid", v)
	}
}
