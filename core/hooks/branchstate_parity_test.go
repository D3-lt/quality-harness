// ADR-135 T1: answers the rows tests/branch-state-parity.test.mjs builds from plugin/scripts/branch-state.mjs. Skipped when
// QH_BRANCH_STATE_CORPUS is unset: the rows exist only where the Node side wrote them.
package hooks

import (
	"fmt"
	"os"
	"testing"
)

func TestBranchStateParity(t *testing.T) {
	path := os.Getenv("QH_BRANCH_STATE_CORPUS")
	if path == "" {
		t.Skip("QH_BRANCH_STATE_CORPUS is unset; tests/branch-state-parity.test.mjs writes it")
	}
	text, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the corpus could not be read: %v", err)
	}
	parsed, err := parseJSON(string(text))
	if err != nil {
		t.Fatalf("the corpus is not JSON: %v", err)
	}
	rows, _ := parsed.([]any)
	disagreements := 0
	for i, row := range rows {
		fn := strOr(get(row, "fn"))
		args, _ := get(row, "args").([]any)
		arg := func(n int) any {
			if n < len(args) {
				return args[n]
			}
			return undefined
		}
		num := func(n int) float64 { f, _ := arg(n).(float64); return f }
		var got any
		switch fn {
		case "render":
			got = bsRender(arg(0), false)
		case "renderBrief":
			got = bsRender(arg(0), true)
		case "ciRed":
			got = bsCIRed(arg(0))
		case "redKey":
			got = bsRedKey(arg(0))
		case "unknownKey":
			got = bsUnknownKey(arg(0))
		case "unchangedButOwnCommits":
			got = bsUnchangedButOwnCommits(arg(0), arg(1), arg(2))
		case "briefUnchanged":
			got = bsBriefUnchanged(arg(0), strOr(arg(1)))
		case "movedSince":
			got = bsMovedSince(arg(0), arg(1))
		case "pastShowCap":
			got = bsPastShowCap(num(0))
		case "pastCapLine":
			got = bsPastCapLine(isTrue(arg(0)), arg(1))
		case "usableCache":
			got = bsUsableCache(arg(0), num(1))
		case "freshSnapshot":
			got = bsFreshSnapshot(arg(0), num(1), num(2), arg(3))
		case "headRuns":
			got = bsHeadRuns(arg(0), arg(1), arg(2))
		case "snapshotKey":
			got = bsSnapshotKey(strOr(arg(0)))
		default:
			t.Fatalf("row %d names a function this test does not answer: %q", i, fn)
		}
		want := get(row, "want")
		if stringify(got) != stringify(want) {
			disagreements++
			if disagreements <= 20 {
				t.Errorf("row %d %s(%s):\n  node: %s\n  go:   %s", i, fn, stringify(args), stringify(want), stringify(got))
			}
		}
	}
	fmt.Printf("%d rows compared, %d disagreements\n", len(rows), disagreements)
}
