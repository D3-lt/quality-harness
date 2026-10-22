package hooks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func saidLine(t *testing.T, v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw) + "\n"
}

func saidBlob(hash, role, text string) map[string]any {
	return map[string]any{"type": "api-request-blob", "hash": hash, "message": map[string]any{"role": role, "content": []any{map[string]any{"type": "text", "text": text}}}}
}

func saidReq(id string, base any, keep int, tail []string, source string) map[string]any {
	return map[string]any{"type": "api-request", "id": id, "base": base, "keep": keep, "tail": tail, "querySource": source}
}

// TestSaidPerContext is the Go twin's own rows: the last main-loop request decides, a role user message and a side query
// do not, a pending item expires with a newer request, a subagent reads its own transcript, and no evidence suppresses nothing.
func TestSaidPerContext(t *testing.T) {
	const main = "repl_main_thread:outputStyle:Concise"
	text := "quality-harness: this repository is unchecked"
	mark := ItemMarker("mention", text)
	dir := t.TempDir()
	file := filepath.Join(dir, "session.jsonl")
	write := func(records ...map[string]any) {
		var b strings.Builder
		for _, r := range records {
			b.WriteString(saidLine(t, r))
		}
		if err := os.WriteFile(file, []byte(b.String()), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	appendTo := func(path string, records ...map[string]any) {
		f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
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
	opt := saidOptions{cacheDir: filepath.Join(dir, "cache"), budgetBytes: saidBudgetBytes, budgetMs: saidBudgetMs}
	input := map[string]any{"session_id": "s1", "transcript_path": file}
	ask := func(in map[string]any) string { v, _ := saidInContextWith(in, "mention", text, opt); return v }

	write(saidBlob("h1", "system", text+" "+mark), saidReq("r1", nil, 0, []string{"h1"}, main))
	if v := ask(input); v != "said" {
		t.Fatalf("in the last request: %s", v)
	}
	appendTo(file, saidBlob("h2", "user", "summary"), saidReq("r2", "r1", 0, []string{"h2"}, main))
	if v := ask(input); v != "unsaid" {
		t.Fatalf("after a compaction's request: %s", v)
	}
	appendTo(file, saidBlob("h3", "user", "quoted "+mark), saidReq("r3", "r2", 1, []string{"h3"}, main), saidBlob("h4", "system", text+" "+mark), saidReq("r4", nil, 0, []string{"h4"}, "compact"))
	if v := ask(input); v != "unsaid" {
		t.Fatalf("a quoting user message and a side query are not the context: %s", v)
	}
	if !recordSaidWith(input, mark, opt) {
		t.Fatal("pending was not recorded")
	}
	if v := ask(input); v != "pending" {
		t.Fatalf("said after the last request: %s", v)
	}
	appendTo(file, saidReq("r5", "r3", 2, []string{}, main))
	if v := ask(input); v != "unsaid" {
		t.Fatalf("a newer request without it: %s", v)
	}
	child := filepath.Join(dir, "agent.jsonl")
	if err := os.WriteFile(child, []byte(saidLine(t, saidBlob("c1", "user", "task"))+saidLine(t, saidReq("a1", nil, 0, []string{"c1"}, "agent:x"))), 0o644); err != nil {
		t.Fatal(err)
	}
	sub := map[string]any{"session_id": "s1", "transcript_path": file, "agent_id": "x", "agent_transcript_path": child}
	if v := ask(sub); v != "unsaid" {
		t.Fatalf("a subagent on its own transcript: %s", v)
	}
	if v := ask(map[string]any{"session_id": "s1", "transcript_path": file, "agent_id": "x"}); v != "no-evidence" {
		t.Fatalf("a subagent with no transcript: %s", v)
	}
	if v := ask(map[string]any{"session_id": "s1"}); v != "no-evidence" {
		t.Fatalf("no transcript: %s", v)
	}
	if ItemMarker("brief", "CI red: a") == ItemMarker("brief", "CI red: b") || !strings.HasPrefix(ItemMarker("brief", "x"), "<qh:brief@") {
		t.Fatal("a changed text must change the marker")
	}
}

type saidParityRow struct {
	Name     string         `json:"name"`
	Input    map[string]any `json:"input"`
	Item     string         `json:"item"`
	Text     string         `json:"text"`
	CacheDir string         `json:"cacheDir"`
	Verdict  string         `json:"verdict"`
	Marker   string         `json:"marker"`
}

// TestSaidParity is the Go half of the said-per-context parity test in tests/qh-core-parity.test.mjs: it answers the rows
// the Node module answered there, from a cache directory of its own, and names every row where the two disagree.
func TestSaidParity(t *testing.T) {
	file := os.Getenv("QH_SAID_PARITY")
	if file == "" {
		t.Skip("QH_SAID_PARITY names no corpus: tests/qh-core-parity.test.mjs runs this with one")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var rows []saidParityRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("the corpus holds no rows, so nothing was compared")
	}
	disagree := 0
	for _, r := range rows {
		opt := saidOptions{cacheDir: r.CacheDir, budgetBytes: saidBudgetBytes, budgetMs: saidBudgetMs}
		verdict, marker := saidInContextWith(r.Input, r.Item, r.Text, opt)
		if verdict != r.Verdict || marker != r.Marker {
			disagree++
			t.Errorf("%s: node %s %s, go %s %s", r.Name, r.Verdict, r.Marker, verdict, marker)
		}
	}
	t.Logf("%d rows compared, %d disagreements", len(rows), disagree)
}
