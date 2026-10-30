package hooks

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func artifactImportFixture(t *testing.T) (*hookRun, string, string, string) {
	t.Helper()
	cwd := t.TempDir()
	t.Setenv("QUALITY_HARNESS_STATE_DIR", t.TempDir())
	file := filepath.Join(cwd, "record.md")
	if err := os.WriteFile(file, []byte("old record bytes\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := contentId(file).(string)
	if err := os.WriteFile(file, []byte("current record bytes\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return &hookRun{cwd: cwd, session: "artifact-reconciliation"}, file, old, contentId(file).(string)
}

func importArtifactRows(t *testing.T, h *hookRun, rows []any) string {
	t.Helper()
	dir, ledger, _ := passFiles(h.cwd, jsString(h.session))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	var data strings.Builder
	for _, row := range rows {
		data.WriteString(stringify(row) + "\n")
	}
	if err := os.WriteFile(ledger, []byte(data.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	h.importPassVerdicts("", "")
	var out strings.Builder
	for _, a := range h.pending {
		out.WriteString(a.text + "\n")
	}
	return out.String()
}

func TestArtifactImportArrivalOrder(t *testing.T) {
	for _, reverse := range []bool{false, true} {
		for _, unknownLast := range []bool{false, true} {
			for _, currentFailure := range []bool{false, true} {
				name := stringify([]any{reverse, unknownLast, currentFailure})
				t.Run(name, func(t *testing.T) {
					h, file, old, current := artifactImportFixture(t)
					currentWords := ""
					if currentFailure {
						currentWords = "CURRENT-ARTIFACT-FAILURE"
					}
					oldRow := O("event", "pass.gated", "pass", "old", "path", file, "blob", old, "complete", true, "findings", "OLD-ARTIFACT-FAILURE")
					currentRow := O("event", "pass.gated", "pass", "current", "path", file, "blob", current, "complete", true, "findings", currentWords)
					rows := []any{oldRow, currentRow}
					if reverse {
						rows = []any{currentRow, oldRow}
					}
					if unknownLast {
						rows = append(rows, O("event", "pass.gated", "pass", "unknown", "path", file, "blob", nil, "complete", false, "findings", "UNPROVEN-IDENTITY"))
					}
					out := importArtifactRows(t, h, rows)
					if strings.Contains(out, "OLD-ARTIFACT-FAILURE") {
						t.Errorf("obsolete finding reached the model after current bytes were gated: %s", out)
					}
					if strings.Contains(out, "CURRENT-ARTIFACT-FAILURE") != currentFailure {
						t.Errorf("current finding lost or invented: %s", out)
					}
					if strings.Contains(out, "UNPROVEN-IDENTITY") != unknownLast {
						t.Errorf("unknown identity was lost or invented: %s", out)
					}
					if got := len(readEvents(h.cwd, h.session).E); got != len(rows) {
						t.Errorf("history imported %d rows, want %d", got, len(rows))
					}
					h.pending = nil
					h.importPassVerdicts("", "")
					if len(h.pending) != 0 {
						t.Errorf("unchanged import repeated findings: %+v", h.pending)
					}
				})
			}
		}
	}
}

func TestArtifactImportKeepsUncertainAndCurrent(t *testing.T) {
	for _, mode := range []string{"only-historical", "unreadable-current", "returned-old", "unknown-receipt", "unknown-latest"} {
		t.Run(mode, func(t *testing.T) {
			h, file, old, current := artifactImportFixture(t)
			var recorded any = old
			if mode == "unknown-receipt" {
				recorded = nil
			}
			rows := []any{O("event", "pass.gated", "pass", "old", "path", file, "blob", recorded, "complete", true, "findings", "KEEP-ARTIFACT-FINDING")}
			if mode != "only-historical" {
				var later any = current
				if mode == "unknown-latest" {
					later = nil
				}
				rows = append(rows, O("event", "pass.gated", "pass", "later", "path", file, "blob", later, "complete", true))
			}
			if mode == "unreadable-current" {
				if err := os.Remove(file); err != nil {
					t.Fatal(err)
				}
				if err := os.Mkdir(file, 0o700); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "returned-old" {
				if err := os.WriteFile(file, []byte("old record bytes\n"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if out := importArtifactRows(t, h, rows); !strings.Contains(out, "KEEP-ARTIFACT-FINDING") {
				t.Fatalf("finding suppressed without known supersession: %s", out)
			}
		})
	}
}

func TestArtifactImportReadsOncePerPath(t *testing.T) {
	for _, paths := range []int{1, 15, 50} {
		for _, unreadable := range []bool{false, true} {
			t.Run(stringify([]any{paths, unreadable}), func(t *testing.T) {
				dir := t.TempDir()
				entries := []any{}
				reads := map[string]int{}
				for n := range paths {
					file := filepath.Join(dir, strconv.Itoa(n)+".md")
					if err := os.WriteFile(file, []byte(strings.Repeat("current bytes\n", 1024)), 0o600); err != nil {
						t.Fatal(err)
					}
					for range 50 {
						entries = append(entries, O("event", "pass.gated", "path", file, "blob", "old"))
					}
					entries = append(entries, O("event", "pass.gated", "path", file, "blob", contentId(file)))
				}
				superseded := passFindingSuperseded(entries, func(file string) any {
					reads[file]++
					if unreadable {
						return nil
					}
					return contentId(file)
				})
				for _, row := range entries {
					got := superseded(row)
					want := !unreadable && strict(get(row, "blob"), "old")
					if got != want {
						t.Fatalf("superseded = %v, want %v", got, want)
					}
				}
				if len(reads) != paths {
					t.Fatalf("observed %d paths, want %d", len(reads), paths)
				}
				for file, count := range reads {
					if count != 1 {
						t.Fatalf("%s read %d times for 51 verdicts; want one", file, count)
					}
				}
				t.Logf("%d verdicts, %d paths, %d identity reads; unreadable=%v", len(entries), paths, len(reads), unreadable)
			})
		}
	}
}

func TestArtifactImportSkipsSingleIdentityReads(t *testing.T) {
	for _, paths := range []int{1, 15, 50} {
		t.Run(strconv.Itoa(paths), func(t *testing.T) {
			dir := t.TempDir()
			entries := []any{}
			for n := range paths {
				file := filepath.Join(dir, strconv.Itoa(n)+".md")
				for range 51 {
					entries = append(entries, O("event", "pass.gated", "path", file, "blob", "only-recorded-identity"))
				}
			}
			reads := 0
			superseded := passFindingSuperseded(entries, func(string) any {
				reads++
				return "different-current-identity"
			})
			for _, row := range entries {
				if superseded(row) {
					t.Fatal("one recorded identity cannot establish supersession")
				}
			}
			if reads != 0 {
				t.Fatalf("%d unnecessary identity reads across %d single-identity paths", reads, paths)
			}
			t.Logf("%d verdicts, %d paths, zero identity reads without a competing identity", len(entries), paths)
		})
	}
}
