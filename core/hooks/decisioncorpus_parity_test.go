// ADR-137 T1: answers the rows tests/decision-context-parity.test.mjs builds from plugin/scripts/decision-corpus.mjs. Skipped
// when QH_DECISION_CORPUS_ROWS is unset: the rows exist only where the Node side wrote them.
package hooks

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"unicode"
)

// dcpAssigned is whether this Go's Unicode tables give the character a category. A Node newer than Go reads a newer Unicode
// (Node 26: 18.0; Go 1.27: 17.0), so a case pair Unicode added since folds in that Node's /i and not here: a version gap,
// counted and said, never compared (ADR-137 T1).
func dcpAssigned(r rune) bool {
	return unicode.In(r, unicode.L, unicode.M, unicode.N, unicode.P, unicode.S, unicode.Z, unicode.Cc, unicode.Cf, unicode.Co, unicode.Cs)
}

// dcpStrings reads a JSON array of strings.
func dcpStrings(v any) []string {
	list, _ := v.([]any)
	out := make([]string, 0, len(list))
	for _, item := range list {
		out = append(out, strOr(item))
	}
	return out
}

// dcpNullable is a JavaScript string or null.
func dcpNullable(s string, ok bool) any {
	if ok {
		return s
	}
	return nil
}

// dcpUnique keeps the first of each string, in order, as `[...new Set(list)]`.
func dcpUnique(list []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range list {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// dcpCorpusRecord is the entry adrCorpus gives one recognised record whose task files are named, projected as the Node test
// projects it: the record rules of T1 composed the way adrCorpus composes them.
func dcpCorpusRecord(root, file string, tasks, tracked []string, platform string) any {
	reader := newDcReader()
	listed := map[string]bool{}
	for _, rel := range tracked {
		listed[dcListedAbsolute(root, rel)] = true
	}
	text, err := reader.text(file)
	if err != nil {
		return O("threw", err.Error())
	}
	if !dcRecognisedAsRecord(root, file, text, platform).recognised {
		return O("in", nil)
	}
	affected := func() []string {
		out := []string{}
		for _, task := range tasks {
			if taskText, err := reader.text(task); err == nil {
				out = append(out, dcAffectedFiles(taskText)...)
			}
		}
		return out
	}
	standing := dcRecordStanding(file, text, reader, map[string]*dcCatalog{}, listed, root)
	title, hasTitle := dcTitleLine(text)
	id, hasID := dcRecordID(filepath.Base(file), title, hasTitle)
	paths, unresolved := dcDeclaredGoverns(text)
	if standing.kind == "" {
		var status any
		if standing.status != "" {
			status = standing.status
		}
		entry := O("in", "unreadable", "status", status, "id", dcpNullable(id, hasID), "reason", nil, "unproven", nil, "governs", nil, "title", nil)
		if standing.unproven != "" {
			entry.Set("unproven", standing.unproven).Set("governs", dcpUnique(append(append([]string{}, paths...), affected()...))).Set("title", dcRecordTitle(file, text))
		}
		return entry
	}
	for _, declaration := range paths {
		matched := false
		for _, rel := range tracked {
			if dcPathMatchesDeclaration(rel, declaration) {
				matched = true
				break
			}
		}
		if !matched {
			unresolved = append(unresolved, "governs:"+declaration)
		}
	}
	var number any
	if n, ok := dcAdrNumber(file, text); ok {
		number = n
	}
	return O("in", "record", "number", number, "id", dcpNullable(id, hasID), "title", dcRecordTitle(file, text),
		"status", standing.status, "kind", standing.kind, "frozen", standing.frozen,
		"supersededBy", dcpNullable(standing.supersededBy, standing.hasSupersededBy),
		"governs", dcpUnique(append(append([]string{}, paths...), affected()...)), "enforcedBy", dcDeclaredEnforcement(text),
		"unresolved", append([]string{}, unresolved...), "declares", dcpUnique(paths))
}

func TestDecisionCorpusParity(t *testing.T) {
	path := os.Getenv("QH_DECISION_CORPUS_ROWS")
	if path == "" {
		t.Skip("QH_DECISION_CORPUS_ROWS is unset; tests/decision-context-parity.test.mjs writes it")
	}
	text, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("the corpus could not be read: %v", err)
	}
	parsed, err := parseJSON(string(text))
	if err != nil {
		t.Fatalf("the corpus is not JSON: %v", err)
	}
	rows, _ := get(parsed, "rows").([]any)
	disagreements, unassigned := 0, 0
	for i, row := range rows {
		fn := strOr(get(row, "fn"))
		args, _ := get(row, "args").([]any)
		arg := func(n int) any {
			if n < len(args) {
				return args[n]
			}
			return undefined
		}
		str := func(n int) string { return strOr(arg(n)) }
		readText := func(file string) (string, error) {
			b, err := os.ReadFile(file)
			return dcDecodeUTF8(b), err
		}
		var got any
		switch fn {
		case "recognisedAsRecord":
			text, err := readText(str(1))
			if err != nil {
				got = O("threw", err.Error())
				break
			}
			r := dcRecognisedAsRecord(str(0), str(1), text, str(2))
			got = O("recognised", r.recognised, "status", dcpNullable(r.status, r.hasStatus), "kept", r.kept, "arm", dcpNullable(r.arm, r.arm != ""))
		case "screenAdmits":
			text, err := readText(str(0))
			if err != nil {
				got = O("threw", err.Error())
				break
			}
			got = dcScreenText(text)
		case "recordId":
			title, hasTitle := arg(1).(string)
			got = dcpNullable(dcRecordID(str(0), title, hasTitle))
		case "titleLine":
			got = dcpNullable(dcTitleLine(str(0)))
		case "recordStatus":
			got = dcpNullable(dcRecordStatus(str(0)))
		case "recordStatusKind":
			kind := dcRecordStatusKind(str(0))
			got = dcpNullable(kind, kind != "")
		case "corpusEligible":
			got = dcCorpusEligible(str(0))
		case "pathMatchesDeclaration":
			got = dcPathMatchesDeclaration(str(0), str(1))
		case "globFoldSweep":
			answers := []any{}
			wantList, _ := get(row, "want").([]any)
			for n, pair := range dcpStrings(arg(0)) {
				rs := []rune(pair)
				answer := dcPathMatchesDeclaration(string(rs[0])+"z", string(rs[1])+"*")
				if n < len(wantList) && wantList[n] != answer {
					if !dcpAssigned(rs[0]) || !dcpAssigned(rs[1]) {
						unassigned++
						answers = append(answers, wantList[n])
						continue
					}
					t.Errorf("row %d globFoldSweep: %q against %q (U+%04X, U+%04X): node %v, go %v", i, rs[0], rs[1], rs[0], rs[1], wantList[n], answer)
				}
				answers = append(answers, answer)
			}
			got = answers
		case "declaredEnforcement":
			got = dcDeclaredEnforcement(str(0))
		case "gfmTableRows":
			out := []any{}
			for _, r := range dcGfmTableRows(dcpStrings(arg(0))) {
				var width any
				if r.width >= 0 {
					width = r.width
				}
				out = append(out, O("cells", r.cells, "change", r.change, "width", width))
			}
			got = out
		case "referencesIn":
			got = dcReferencesIn(str(0))
		case "recordDirectory":
			got = dcRecordDirectory(str(0))
		case "nameArmSpelling":
			got = dcNameArmSpelling(str(0))
		case "nameArm":
			switch name := str(0); {
			case dcCanonicalName(name) || specName(name):
				got = "record"
			case dcAdrFile(name):
				got = "notRecognised"
			default:
				got = "none"
			}
		case "corpusRecord":
			got = dcpCorpusRecord(str(0), str(1), dcpStrings(arg(2)), dcpStrings(arg(3)), str(4))
		default:
			t.Fatalf("row %d names a function this test does not answer: %q", i, fn)
		}
		want := get(row, "want")
		if stringify(got) != stringify(want) {
			disagreements++
			if disagreements <= 30 {
				t.Errorf("row %d %s(%s):\n  node: %s\n  go:   %s", i, fn, stringify(args), stringify(want), stringify(got))
			}
		}
	}
	if unassigned > 0 {
		fmt.Printf("%d case pairs disagree only where Unicode %s assigns neither character, so are not compared\n", unassigned, unicode.Version)
	}
	fmt.Printf("%d rows compared, %d disagreements\n", len(rows), disagreements)
}
