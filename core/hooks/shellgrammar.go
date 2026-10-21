// ADR-120 T1 (Decision 1): the grammar a declared check is read through, ported from plugin/scripts/shell-grammar.mjs. The lexer
// records where a `{ }` group, a `( )` subshell or a POSIX `NAME() { }` definition opens and closes; this reads those records
// as lists, pipelines and compound commands. It answers nil, never a guess, for text it does not read: the `function` keyword,
// anything unclosed, a redirected group, a body that is not a group, a stray close.
package hooks

// shellNode is one node of the tree. Every field is always present, so the Node and Go trees compare as JSON: `cmd` names its
// record by I (-1 otherwise); `pipe` holds its stages and the count of its leading `!`; `andor` holds its pipelines with the
// `&&`/`||` between them in Ops; `list` holds its and-or lists with the `;` or `&` after each in Ops; `group`, `sub` and `def`
// (named by Name) hold their body, a `list`, in Kids[0].
type shellNode struct {
	T    string       `json:"t"`
	I    int          `json:"i"`
	Bang int          `json:"bang"`
	Name string       `json:"name"`
	Kids []*shellNode `json:"kids"`
	Ops  []string     `json:"ops"`
}

func newNode(t string) *shellNode {
	return &shellNode{T: t, I: -1, Kids: []*shellNode{}, Ops: []string{}}
}

type grammarEvent struct {
	kind string // "open", "cmd" or "close"
	open *shellOpen
	idx  int
	cl   *shellClose
}

type grammar struct {
	commands []*shellCommand
	events   []grammarEvent
	pos      int
}

type grammarFailure struct{}

// flattenEvents is the records as a flat run of events. A definition's head record (`f` of `f()`) is not a command: the
// definition that follows it names it.
func flattenEvents(commands []*shellCommand) []grammarEvent {
	events := []grammarEvent{}
	for i, c := range commands {
		for _, o := range c.opens {
			events = append(events, grammarEvent{kind: "open", open: o})
		}
		if c.defines != "" {
			if len(c.closes) > 0 || i+1 >= len(commands) || len(commands[i+1].opens) == 0 {
				return nil
			}
			o := commands[i+1].opens[0]
			if o.kind != "definition" || o.name != c.defines {
				return nil
			}
			continue
		}
		events = append(events, grammarEvent{kind: "cmd", idx: i})
		for _, cl := range c.closes {
			events = append(events, grammarEvent{kind: "close", cl: cl})
		}
	}
	return events
}

// parseShell is the tree of shellWordsClosed's answer, or nil when the text is not one this grammar reads.
func parseShell(commands []*shellCommand, complete, closed bool) (tree *shellNode) {
	if !complete || !closed || len(commands) == 0 {
		return nil
	}
	events := flattenEvents(commands)
	if len(events) == 0 {
		return nil
	}
	g := &grammar{commands: commands, events: events}
	defer func() {
		if r := recover(); r != nil {
			if _, ok := r.(grammarFailure); !ok {
				panic(r)
			}
			tree = nil
		}
	}()
	tree = g.list()
	if g.pos != len(g.events) {
		return nil
	}
	return tree
}

func (g *grammar) fail() { panic(grammarFailure{}) }

// after is the operator after the element just consumed. At the end of a list only a terminator may follow it (`&` backgrounds
// it); anywhere else it is the operator that joins the next element.
func (g *grammar) after(el grammarEvent) string {
	raw := ""
	if el.kind == "cmd" {
		raw = g.commands[el.idx].terminator
	} else {
		raw = el.cl.joiner
	}
	if g.pos >= len(g.events) || g.events[g.pos].kind == "close" {
		switch raw {
		case "&":
			return "&"
		case ";", "\n", ")", "":
			return "end"
		}
		g.fail()
	}
	switch raw {
	case "&&", "||", "|", "|&", ";", "&":
		return raw
	case "\n":
		return ";"
	}
	g.fail()
	return ""
}

type grammarPart struct {
	node *shellNode
	bang int
	sep  string
}

func (g *grammar) stage() grammarPart {
	if g.pos >= len(g.events) {
		g.fail()
	}
	el := g.events[g.pos]
	switch el.kind {
	case "cmd":
		g.pos++
		n := newNode("cmd")
		n.I = el.idx
		return grammarPart{node: n, bang: g.commands[el.idx].bangs, sep: g.after(el)}
	case "open":
		g.pos++
		body := g.list()
		if g.pos >= len(g.events) || g.events[g.pos].kind != "close" || g.events[g.pos].cl.kind != el.open.kind {
			g.fail()
		}
		close := g.events[g.pos]
		g.pos++
		t := "def"
		switch el.open.kind {
		case "subshell":
			t = "sub"
		case "group":
			t = "group"
		}
		n := newNode(t)
		n.Name = el.open.name
		n.Kids = []*shellNode{body}
		return grammarPart{node: n, bang: el.open.bangs, sep: g.after(close)}
	}
	g.fail()
	return grammarPart{}
}

func (g *grammar) pipeline() grammarPart {
	first := g.stage()
	kids := []*shellNode{first.node}
	sep := first.sep
	for sep == "|" || sep == "|&" {
		next := g.stage()
		if next.bang != 0 {
			g.fail()
		}
		kids = append(kids, next.node)
		sep = next.sep
	}
	bang := first.bang
	if bang > 2 {
		bang = 2
	}
	for _, k := range kids {
		if k.T == "def" && (len(kids) > 1 || bang != 0) {
			g.fail()
		}
	}
	n := newNode("pipe")
	n.Bang = bang
	n.Kids = kids
	return grammarPart{node: n, sep: sep}
}

func (g *grammar) andor() grammarPart {
	first := g.pipeline()
	kids := []*shellNode{first.node}
	ops := []string{}
	sep := first.sep
	for sep == "&&" || sep == "||" {
		ops = append(ops, sep)
		next := g.pipeline()
		kids = append(kids, next.node)
		sep = next.sep
	}
	n := newNode("andor")
	n.Kids = kids
	n.Ops = ops
	return grammarPart{node: n, sep: sep}
}

func (g *grammar) list() *shellNode {
	kids := []*shellNode{}
	ops := []string{}
	for {
		item := g.andor()
		kids = append(kids, item.node)
		switch item.sep {
		case "&":
			ops = append(ops, "&")
		case ";", "end":
			ops = append(ops, ";")
		default:
			g.fail()
		}
		if item.sep == "end" || g.pos >= len(g.events) || g.events[g.pos].kind == "close" {
			break
		}
	}
	n := newNode("list")
	n.Kids = kids
	n.Ops = ops
	return n
}
