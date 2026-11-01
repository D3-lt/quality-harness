// ADR-137 T2: answers the rows tests/decision-context-replay.test.mjs writes from plugin/scripts/decision-corpus.mjs over each
// replayed corpus, and the unmarked-archive rows beside them. Skipped when QH_DECISION_CONTEXT_REPLAY or
// QH_UNMARKED_ARCHIVES_ROWS is unset: the rows exist only where the Node side wrote them.
package hooks

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// dcrRows reads the rows file an environment variable names, or skips.
func dcrRows(t *testing.T, variable string) any {
	file := os.Getenv(variable)
	if file == "" {
		t.Skipf("%s is unset; tests/decision-context-replay.test.mjs writes it", variable)
	}
	text, err := os.ReadFile(file)
	if err != nil {
		t.Fatalf("the rows could not be read: %v", err)
	}
	parsed, err := parseJSON(string(text))
	if err != nil {
		t.Fatalf("the rows are not JSON: %v", err)
	}
	return parsed
}

// dcrNames is the records a group holds, relative to the root, for a failure message.
func dcrNames(root string, files []string) string {
	names := []string{}
	for _, file := range files {
		names = append(names, filepath.ToSlash(relPath(root, file)))
	}
	return "[" + strings.Join(names, ", ") + "]"
}

func TestDecisionContextReplay(t *testing.T) {
	corpora, _ := get(dcrRows(t, "QH_DECISION_CONTEXT_REPLAY"), "corpora").([]any)
	compared, disagreements := 0, 0
	for _, corpus := range corpora {
		name, root := strOr(get(corpus, "name")), strOr(get(corpus, "root"))
		read := dcAdrCorpus(root, trackedPaths(root), dcScreenBudget, dcPlatform())
		rows, _ := get(corpus, "rows").([]any)
		for n, row := range rows {
			file, want := strOr(get(row, "file")), strOr(get(row, "want"))
			got := read.context(file, root)
			// The entry the hook will call reads the corpus itself; it answers as the corpus read once does.
			if n == 0 {
				if whole := dcDecisionContext(file, root); whole != got {
					t.Errorf("%s: dcDecisionContext(%q) differs from the corpus read once:\n  whole: %q\n  once:  %q", name, file, whole, got)
				}
			}
			compared++
			if got == want {
				continue
			}
			disagreements++
			if disagreements <= 30 {
				governing, graveyard, unproven := read.governing(file, root)
				files := func(records []*dcRecord) []string {
					out := []string{}
					for _, record := range records {
						out = append(out, record.file)
					}
					return out
				}
				unprovenFiles := []string{}
				for _, entry := range unproven {
					unprovenFiles = append(unprovenFiles, entry.file)
				}
				t.Errorf("%s: %s\n  node found %s\n  go found   governing %s graveyard %s unproven %s\n  node: %q\n  go:   %q", name,
					filepath.ToSlash(relPath(root, file)), stringify(get(row, "records")), dcrNames(root, files(governing)),
					dcrNames(root, files(graveyard)), dcrNames(root, unprovenFiles), want, got)
			}
		}
	}
	fmt.Printf("%d rows compared, %d disagreements\n", compared, disagreements)
}

func TestUnmarkedArchivesParity(t *testing.T) {
	rows, _ := get(dcrRows(t, "QH_UNMARKED_ARCHIVES_ROWS"), "rows").([]any)
	disagreements := 0
	for i, row := range rows {
		listing := dcpStrings(get(row, "listing"))
		got := unmarkedArchives(strOr(get(row, "root")), listing)
		if stringify(got) != stringify(get(row, "want")) {
			disagreements++
			t.Errorf("row %d unmarkedArchives(%s):\n  node: %s\n  go:   %s", i, stringify(listing), stringify(get(row, "want")), stringify(got))
		}
	}
	fmt.Printf("%d rows compared, %d disagreements\n", len(rows), disagreements)
}
