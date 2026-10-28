package hooks

// The Go half of tests/qh-core-parity.test.mjs (ADR-110 T1): that test reads every string literal in the classifier's own test
// files, answers each through the Node classifier, writes the rows to the file QH_PARITY_CORPUS names, and runs this test,
// which answers the same rows here and names every row where the two disagree. Run alone it has nothing to compare and skips.

import (
	"encoding/json"
	"os"
	"testing"
)

type parityHeredoc struct {
	Delimiter *string `json:"delimiter"`
	Quoted    bool    `json:"quoted"`
	Body      string  `json:"body"`
}

type parityCommand struct {
	Argv          []string        `json:"argv"`
	Assignments   []string        `json:"assignments"`
	Dynamic       []int           `json:"dynamic"`
	Quoted        []bool          `json:"quoted"`
	Code          []bool          `json:"code"`
	Heredocs      []parityHeredoc `json:"heredocs"`
	Substitutions []string        `json:"substitutions"`
	PipeTo        *int            `json:"pipeTo"`
	Ended         string          `json:"ended"`
	Redirects     int             `json:"redirects"`
	Negated       any             `json:"negated"`
	Writes        []parityWrite   `json:"writes"`
	Bangs         int             `json:"bangs"`
	Terminator    string          `json:"terminator"`
	Defines       string          `json:"defines"`
	Opens         []parityOpen    `json:"opens"`
	Closes        []parityClose   `json:"closes"`
	// ADR-120 T2: every redirection, in order.
	Redirections []parityRedirection `json:"redirections"`
}

type parityOpen struct {
	Kind  string `json:"kind"`
	Name  string `json:"name"`
	Bangs int    `json:"bangs"`
}

type parityClose struct {
	Kind   string `json:"kind"`
	Joiner string `json:"joiner"`
}

type parityWrite struct {
	Op      string `json:"op"`
	Target  string `json:"target"`
	Dynamic bool   `json:"dynamic"`
}

type parityRedirection struct {
	Fd      string `json:"fd"`
	Op      string `json:"op"`
	Target  string `json:"target"`
	Dynamic bool   `json:"dynamic"`
}

type parityRow struct {
	Cmd        string  `json:"cmd"`
	Publish    *string `json:"publish"`
	Mentions   bool    `json:"mentions"`
	CommitOnly bool    `json:"commitOnly"`
	Fresh      bool    `json:"fresh"`
	Stages     bool    `json:"stages"`
	Leaves     bool    `json:"leaves"`
	Foreign    *string `json:"foreign"`
	Constant   bool    `json:"constant"`
	Words      struct {
		Complete bool            `json:"complete"`
		Closed   bool            `json:"closed"`
		Commands []parityCommand `json:"commands"`
	} `json:"words"`
	Tree *shellNode `json:"tree"`
}

// goWords is this lexer's answer in the shape the Node rows carry, and the tree read from it.
func goWords(text string) (bool, bool, []parityCommand, *shellNode) {
	cmds, complete, closed := shellWordsClosed(text)
	out := []parityCommand{}
	for _, c := range cmds {
		pc := parityCommand{Argv: c.argv, Assignments: c.assignments, Dynamic: c.dynamic, Quoted: c.quoted, Code: c.code,
			Substitutions: c.substitutions, Ended: c.ended, Redirects: c.redirects, Negated: c.negated,
			Bangs: c.bangs, Terminator: c.terminator, Defines: c.defines}
		for _, o := range c.opens {
			pc.Opens = append(pc.Opens, parityOpen{Kind: o.kind, Name: o.name, Bangs: o.bangs})
		}
		for _, cl := range c.closes {
			pc.Closes = append(pc.Closes, parityClose{Kind: cl.kind, Joiner: cl.joiner})
		}
		for _, w := range c.writes {
			pc.Writes = append(pc.Writes, parityWrite{Op: w.op, Target: w.target, Dynamic: w.dynamic})
		}
		for _, r := range c.redirections {
			pc.Redirections = append(pc.Redirections, parityRedirection{Fd: r.fd, Op: r.op, Target: r.target, Dynamic: r.dynamic})
		}
		if c.pipeTo >= 0 {
			pipe := c.pipeTo
			pc.PipeTo = &pipe
		}
		for _, d := range c.heredocs {
			pc.Heredocs = append(pc.Heredocs, parityHeredoc{Delimiter: d.delimiter, Quoted: d.quoted, Body: d.body})
		}
		out = append(out, pc)
	}
	return complete, closed, out, parseShell(cmds, complete, closed)
}

// canonicalJSON compares two values as JSON, so an empty list and a missing one are the same answer.
func canonicalJSON(v any) string {
	b, _ := json.Marshal(v)
	var back any
	json.Unmarshal(b, &back)
	var strip func(any) any
	strip = func(x any) any {
		switch y := x.(type) {
		case map[string]any:
			for k, val := range y {
				if arr, ok := val.([]any); ok && len(arr) == 0 {
					delete(y, k)
					continue
				}
				if val == nil {
					delete(y, k)
					continue
				}
				y[k] = strip(val)
			}
		case []any:
			for i := range y {
				y[i] = strip(y[i])
			}
		}
		return x
	}
	out, _ := json.Marshal(strip(back))
	return string(out)
}

func TestClassifierParity(t *testing.T) {
	file := os.Getenv("QH_PARITY_CORPUS")
	if file == "" {
		t.Skip("QH_PARITY_CORPUS names no corpus: tests/qh-core-parity.test.mjs runs this with one")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	var rows []parityRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("the corpus holds no rows, so nothing was compared")
	}
	disagree := 0
	say := func(cmd, what string, node, goValue any) {
		disagree++
		t.Errorf("%q: %s: node %v, go %v", cmd, what, node, goValue)
	}
	for _, r := range rows {
		complete, closed, commands, tree := goWords(r.Cmd)
		if complete != r.Words.Complete || closed != r.Words.Closed || canonicalJSON(commands) != canonicalJSON(r.Words.Commands) {
			say(r.Cmd, "shellWords", canonicalJSON(r.Words), canonicalJSON(map[string]any{"complete": complete, "closed": closed, "commands": commands}))
		}
		if canonicalJSON(tree) != canonicalJSON(r.Tree) {
			say(r.Cmd, "parseShell", canonicalJSON(r.Tree), canonicalJSON(tree))
		}
		p, ok := publishCommandIn(r.Cmd)
		if (r.Publish != nil) != ok || (ok && *r.Publish != p) {
			say(r.Cmd, "publishCommandIn", r.Publish, p)
		}
		// ADR-130: the publish-policy classifiers have no Node runtime caller.
		for _, pair := range []struct {
			name           string
			nodeVal, goVal bool
		}{
			{"mentionsCommitOrPush", r.Mentions, mentionsCommitOrPush(r.Cmd)},

			{"constantSuccessCheck", r.Constant, constantSuccessCheck(r.Cmd)},
		} {
			if pair.nodeVal != pair.goVal {
				say(r.Cmd, pair.name, pair.nodeVal, pair.goVal)
			}
		}
	}
	t.Logf("%d rows compared, %d disagreements", len(rows), disagree)
}
