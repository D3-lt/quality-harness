// ADR-067: the one reader of shell text that rule P decides by, ported from plugin/scripts/shell-words.mjs. It splits a
// command the way a POSIX shell does and expands nothing it cannot know from the text. Indices are over runes; JavaScript's
// are over UTF-16 units, which differ only for a character outside the BMP, where neither reader finds an operator.
package hooks

import (
	"regexp"
	"strconv"
	"strings"
)

type heredoc struct {
	delimiter *string
	quoted    bool
	body      string
}

type shellCommand struct {
	argv          []string
	assignments   []string
	dynamicFlags  []bool
	dynamic       []int
	quoted        []bool
	code          []bool
	heredocs      []heredoc
	substitutions []string
	pipeTo        int // -1 for none
	ended         string
	redirects     int
	negated       any // nil, true, or "unknown"
}

type shellChar struct {
	c rune
	q bool
}

type shellWord struct {
	chars   []shellChar
	dynamic bool
	quoted  bool
	code    bool
}

type pendingDoc struct {
	owner     *shellCommand
	delimiter string
	quoted    bool
	strip     bool
}

type group struct {
	negated    any
	start      int
	definition bool
}

var (
	codeSpanPattern = regexp.MustCompile(`[;&|()\n]`)
	rangedBrace     = regexp.MustCompile(`\{[^{}]*\.\.[^{}]*\}`)
	assignmentName  = regexp.MustCompile(`^[A-Za-z_]\w*$`)
)

func isOperatorRune(c rune) bool {
	return c == ';' || c == '&' || c == '|' || c == '(' || c == ')' || c == '\n'
}
func isRedirectRune(c rune) bool { return c == '<' || c == '>' }
func isBlankRune(c rune) bool    { return c == ' ' || c == '\t' }
func isGlobRune(c rune) bool     { return c == '*' || c == '?' || c == '[' }
func isWordRune(c rune) bool {
	return c == '_' || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
}

func freshCommand() *shellCommand { return &shellCommand{pipeTo: -1} }

// shellWords returns the simple commands in order, and whether every quote, substitution and heredoc closed.
func shellWords(text string) ([]*shellCommand, bool) {
	src := []rune(text)
	at := func(k int) rune {
		if k < 0 || k >= len(src) {
			return 0
		}
		return src[k]
	}
	commands := []*shellCommand{}
	complete := true
	command := freshCommand()
	var word *shellWord
	pending := []pendingDoc{}
	pipeNext := false
	naming := false
	groups := []group{}
	closedGroup := false
	defining := false
	i := 0

	startWord := func() {
		if word == nil {
			word = &shellWord{}
		}
	}
	push := func(c rune, q bool) { startWord(); word.chars = append(word.chars, shellChar{c, q}) }

	endWord := func() {
		if word == nil {
			return
		}
		w := word
		word = nil
		leading := len(command.argv) == 0
		raw := charsString(w.chars)
		if naming {
			naming = false
			defining = true
			return
		}
		if leading && !w.quoted && raw == "function" && len(command.assignments) == 0 {
			naming = true
			return
		}
		if leading && isAssignment(w.chars) {
			command.assignments = append(command.assignments, raw)
			return
		}
		if leading && !w.quoted && raw == "!" {
			if command.negated != nil {
				command.negated = "unknown"
			} else {
				command.negated = true
			}
			return
		}
		if leading && !w.quoted && raw == "{" {
			groups = append(groups, group{negated: command.negated, start: len(commands), definition: defining})
			command.negated = nil
			defining = false
			return
		}
		if leading && !w.quoted && raw == "}" {
			var g *group
			if len(groups) > 0 {
				last := groups[len(groups)-1]
				groups = groups[:len(groups)-1]
				g = &last
			}
			var body []*shellCommand
			if g != nil && g.negated != nil {
				body = commands[g.start:]
			}
			single := true
			for k := 0; k < len(body)-1; k++ {
				if body[k].ended != "|" && body[k].ended != "|&" {
					single = false
				}
			}
			if len(body) > 0 && body[0].negated != nil {
				single = false
			}
			targets := body
			if single && len(body) > 0 {
				targets = body[:1]
			}
			for _, c := range targets {
				if single {
					c.negated = g.negated
				} else {
					c.negated = "unknown"
				}
			}
			closedGroup = g == nil || !g.definition
			return
		}
		for _, expanded := range braces(w.chars) {
			value := charsString(expanded)
			unquotedBrace := false
			globbed := false
			for _, x := range expanded {
				if !x.q && x.c == '{' {
					unquotedBrace = true
				}
				if !x.q && isGlobRune(x.c) {
					globbed = true
				}
			}
			ranged := rangedBrace.MatchString(value) && unquotedBrace
			command.dynamicFlags = append(command.dynamicFlags, w.dynamic || ranged || globbed)
			command.quoted = append(command.quoted, w.quoted)
			command.code = append(command.code, w.code)
			command.argv = append(command.argv, value)
		}
	}

	endCommand := func(operator string) {
		endWord()
		naming = false
		empty := len(command.argv) == 0 && len(command.assignments) == 0 && len(command.heredocs) == 0 && len(command.substitutions) == 0
		if empty && closedGroup && len(commands) > 0 && commands[len(commands)-1].ended != "&" && (operator == "&" || operator == "&&" || operator == "||") {
			commands[len(commands)-1].ended = operator
		}
		closedGroup = false
		if !empty || !(operator == "(" || operator == ")" || operator == "\n") {
			defining = false
		}
		if !empty {
			if pipeNext {
				commands[len(commands)-1].pipeTo = len(commands)
			}
			command.ended = operator
			commands = append(commands, finishCommand(command))
			pipeNext = operator == "|" || operator == "|&"
		} else if !(operator == "|" || operator == "|&" || operator == "(" || operator == "\n") {
			pipeNext = false
		}
		command = freshCommand()
	}

	balanced := func(k int, open, close rune) int { return closing(src, k, open, close) }

	var substitution func(k int) int
	substitution = func(k int) int {
		if src[k] == '`' {
			for e := k + 1; e < len(src); e++ {
				if src[e] == '\\' {
					e++
					continue
				}
				if src[e] == '`' {
					command.substitutions = append(command.substitutions, string(src[k+1:e]))
					return e + 1
				}
			}
			return -1
		}
		next := at(k + 1)
		if next == '(' {
			end := balanced(k+1, '(', ')')
			if end < 0 {
				return -1
			}
			if at(k+2) == '(' {
				command.substitutions = append(command.substitutions, substitutionsIn(src[k+3:end-1], true)...)
			} else {
				command.substitutions = append(command.substitutions, string(src[k+2:end]))
			}
			return end + 1
		}
		if next == '{' {
			end := balanced(k+1, '{', '}')
			if end < 0 {
				return -1
			}
			command.substitutions = append(command.substitutions, substitutionsIn(src[k+2:end], true)...)
			return end + 1
		}
		if c := at(k + 1); c == '_' || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') {
			e := k + 2
			for e < len(src) && isWordRune(src[e]) {
				e++
			}
			return e
		}
		if c := at(k + 1); c != 0 && (isWordRune(c) || strings.ContainsRune("@*#?$!-", c)) {
			return k + 2
		}
		return k + 1
	}

	spanned := func(span []rune) {
		if codeSpanPattern.MatchString(string(span)) {
			word.code = true
		}
	}

	quoted := func() bool {
		q := src[i]
		startWord()
		word.quoted = true
		from := i + 1
		for k := from; k < len(src); k++ {
			if q == '\'' && src[k] == '\'' {
				spanned(src[from:k])
				for _, c := range src[from:k] {
					push(c, true)
				}
				i = k
				return true
			}
			if q == '"' {
				if src[k] == '\\' && k+1 < len(src) && strings.ContainsRune("$`\"\\\n", src[k+1]) {
					if src[k+1] != '\n' {
						push(src[k+1], true)
					}
					k++
					continue
				}
				if src[k] == '$' || src[k] == '`' {
					word.dynamic = true
					end := substitution(k)
					if end < 0 {
						return false
					}
					for _, c := range src[k:end] {
						push(c, true)
					}
					k = end - 1
					continue
				}
				if src[k] == '"' {
					spanned(src[from:k])
					i = k
					return true
				}
				push(src[k], true)
			}
		}
		return false
	}

	readHeredocs := func() {
		for _, doc := range pending {
			bodyLines := []string{}
			closed := false
			for i < len(src) {
				end := indexRune(src, '\n', i)
				if end < 0 {
					end = len(src)
				}
				line := string(src[i:end])
				i = end + 1
				if doc.strip {
					line = strings.TrimLeft(line, "\t")
				}
				if line == doc.delimiter {
					closed = true
					break
				}
				bodyLines = append(bodyLines, line)
			}
			if !closed {
				complete = false
			}
			var body strings.Builder
			for _, l := range bodyLines {
				body.WriteString(l)
				body.WriteString("\n")
			}
			if !doc.quoted {
				doc.owner.substitutions = append(doc.owner.substitutions, substitutionsIn([]rune(body.String()), false)...)
			}
			delimiter := doc.delimiter
			doc.owner.heredocs = append(doc.owner.heredocs, heredoc{delimiter: &delimiter, quoted: doc.quoted, body: body.String()})
		}
		pending = []pendingDoc{}
	}

	readTarget := func() (string, bool, bool) {
		saved := word
		word = nil
		quotedAny := false
		for ; i < len(src); i++ {
			c := src[i]
			if isBlankRune(c) || isOperatorRune(c) || isRedirectRune(c) {
				break
			}
			if c == '\'' || c == '"' {
				quotedAny = true
				if !quoted() {
					return "", false, false
				}
				continue
			}
			if c == '\\' {
				if at(i+1) == '\n' {
					i++
					continue
				}
				quotedAny = true
				i++
				if i < len(src) {
					push(src[i], true)
				} else {
					startWord()
				}
				continue
			}
			if c == '$' || c == '`' {
				end := substitution(i)
				if end < 0 {
					return "", false, false
				}
				startWord()
				word.dynamic = true
				for _, ch := range src[i:end] {
					push(ch, false)
				}
				i = end - 1
				continue
			}
			push(c, false)
		}
		i--
		value := ""
		if word != nil {
			value = charsString(word.chars)
		}
		word = saved
		return value, quotedAny, true
	}

	redirection := func() bool {
		if word != nil && allUnquotedDigits(word.chars) {
			word = nil
		} else {
			endWord()
		}
		op := string(src[i])
		for i+1 < len(src) && strings.ContainsRune("<>&|-", src[i+1]) && len(op) < 3 {
			i++
			op += string(src[i])
		}
		i++
		command.redirects++
		isHeredoc := strings.HasPrefix(op, "<<") && !strings.HasPrefix(op, "<<<")
		for i < len(src) && isBlankRune(src[i]) {
			i++
		}
		value, quotedTarget, ok := readTarget()
		if !ok {
			return false
		}
		if isHeredoc {
			pending = append(pending, pendingDoc{owner: command, delimiter: value, quoted: quotedTarget, strip: op == "<<-"})
		} else if op == "<<<" {
			command.heredocs = append(command.heredocs, heredoc{delimiter: nil, quoted: quotedTarget, body: value + "\n"})
		}
		return true
	}

	ansiC := func(k int) int {
		startWord()
		word.quoted = true
		simple := map[rune]rune{'a': '\x07', 'b': '\b', 'e': '\x1b', 'E': '\x1b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '\\': '\\', '\'': '\'', '"': '"', '?': '?'}
		for e := k; e < len(src); e++ {
			c := src[e]
			if c == '\'' {
				return e
			}
			if c != '\\' {
				push(c, true)
				continue
			}
			x := at(e + 1)
			if r, ok := simple[x]; ok && e+1 < len(src) {
				push(r, true)
				e++
				continue
			}
			var digits string
			hex := false
			switch x {
			case 'x':
				digits, hex = leadingDigits(src, e+2, 2, true), true
			case 'u':
				digits, hex = leadingDigits(src, e+2, 4, true), true
			case 'U':
				digits, hex = leadingDigits(src, e+2, 8, true), true
			default:
				digits = leadingDigits(src, e+1, 3, false)
			}
			if digits != "" {
				base := 8
				if hex {
					base = 16
				}
				code, _ := strconv.ParseInt(digits, base, 64)
				push(rune(code), true)
				e += len(digits)
				if hex {
					e++
				}
				continue
			}
			push('\\', true)
		}
		return -1
	}

	abandon := func() { complete = false; word = nil; command = freshCommand() }

loop:
	for ; i < len(src); i++ {
		c := src[i]
		switch {
		case c == '\\':
			if at(i+1) == '\n' {
				i++
				continue
			}
			if i+1 < len(src) {
				startWord()
				word.quoted = true
				i++
				push(src[i], true)
			}
			continue
		case c == '\'' || c == '"':
			if !quoted() {
				abandon()
				break loop
			}
			continue
		case c == '$' && at(i+1) == '\'':
			end := ansiC(i + 2)
			if end < 0 {
				abandon()
				break loop
			}
			i = end
			continue
		case c == '$' || c == '`':
			end := substitution(i)
			if end < 0 {
				abandon()
				break loop
			}
			startWord()
			word.dynamic = true
			for _, ch := range src[i:end] {
				push(ch, false)
			}
			i = end - 1
			continue
		case c == '#' && word == nil:
			for i+1 < len(src) && src[i+1] != '\n' {
				i++
			}
			continue
		case c == '(' && at(i+1) == '(' && word == nil && len(command.argv) == 0 && len(command.assignments) == 0:
			end := balanced(i, '(', ')')
			if end < 0 {
				complete = false
				command = freshCommand()
				break loop
			}
			command.substitutions = append(command.substitutions, substitutionsIn(src[i+2:end-1], true)...)
			defining = false
			i = end
			continue
		case (c == '<' || c == '>') && at(i+1) == '(':
			end := balanced(i+1, '(', ')')
			if end < 0 {
				abandon()
				break loop
			}
			command.substitutions = append(command.substitutions, string(src[i+2:end]))
			startWord()
			word.dynamic = true
			word.code = true
			for _, ch := range src[i : end+1] {
				push(ch, false)
			}
			i = end
			continue
		case isRedirectRune(c) || (c == '&' && at(i+1) == '>'):
			if !redirection() {
				abandon()
				break loop
			}
			continue
		case isOperatorRune(c):
			op := string(c)
			if (c == '&' || c == '|' || c == ';') && at(i+1) == c {
				i++
				op += string(src[i])
			} else if c == '|' && at(i+1) == '&' {
				i++
				op += string(src[i])
			}
			endCommand(op)
			if c == '\n' && len(pending) > 0 {
				i++
				readHeredocs()
				i--
			}
			continue
		case isBlankRune(c):
			endWord()
			continue
		}
		push(c, false)
	}
	if complete {
		endCommand("")
		if len(pending) > 0 {
			complete = false
			readHeredocs()
		}
	}
	return commands, complete
}

func charsString(chars []shellChar) string {
	var b strings.Builder
	for _, x := range chars {
		b.WriteRune(x.c)
	}
	return b.String()
}

func allUnquotedDigits(chars []shellChar) bool {
	for _, x := range chars {
		if x.q || x.c < '0' || x.c > '9' {
			return false
		}
	}
	return true
}

func indexRune(src []rune, r rune, from int) int {
	for k := from; k < len(src); k++ {
		if src[k] == r {
			return k
		}
	}
	return -1
}

func leadingDigits(src []rune, from, most int, hex bool) string {
	var b strings.Builder
	for k := from; k < len(src) && b.Len() < most; k++ {
		c := src[k]
		ok := c >= '0' && c <= '7'
		if hex {
			ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
		}
		if !ok {
			break
		}
		b.WriteRune(c)
	}
	return b.String()
}

// substitutionsIn: the command substitutions an expression runs. In a heredoc body (`quotes` false) a single quote hides nothing.
func substitutionsIn(text []rune, quotes bool) []string {
	found := []string{}
	for k := 0; k < len(text); k++ {
		c := text[k]
		if c == '\\' {
			k++
			continue
		}
		if quotes && c == '\'' {
			end := indexRune(text, '\'', k+1)
			if end < 0 {
				break
			}
			k = end
		} else if c == '`' {
			end := k + 1
			for end < len(text) && text[end] != '`' {
				if text[end] == '\\' {
					end += 2
				} else {
					end++
				}
			}
			if end >= len(text) {
				break
			}
			found = append(found, string(text[k+1:end]))
			k = end
		} else if c == '$' && k+1 < len(text) && (text[k+1] == '(' || text[k+1] == '{') {
			open := text[k+1]
			closeRune := '}'
			if open == '(' {
				closeRune = ')'
			}
			end := closing(text, k+1, open, closeRune)
			if end < 0 {
				break
			}
			inner := text[k+2 : end]
			if open == '(' && (len(inner) == 0 || inner[0] != '(') {
				found = append(found, string(inner))
			} else if open == '(' {
				if len(inner) >= 2 {
					found = append(found, substitutionsIn(inner[1:len(inner)-1], true)...)
				}
			} else {
				found = append(found, substitutionsIn(inner, true)...)
			}
			k = end
		}
	}
	return found
}

// closing is the index of the bracket closing the one at `k`, honouring quotes; -1 if none.
func closing(text []rune, k int, open, close rune) int {
	depth := 0
	for e := k; e < len(text); e++ {
		c := text[e]
		if c == '\\' {
			e++
			continue
		}
		if c == '\'' || c == '"' {
			q := c
			e++
			for e < len(text) && text[e] != q {
				if q == '"' && text[e] == '\\' {
					e++
				}
				e++
			}
			if e >= len(text) {
				return -1
			}
			continue
		}
		if c == open {
			depth++
		} else if c == close {
			depth--
			if depth == 0 {
				return e
			}
		}
	}
	return -1
}

func isAssignment(chars []shellChar) bool {
	eq := -1
	for k, x := range chars {
		if x.c == '=' {
			eq = k
			break
		}
	}
	if eq < 1 {
		return false
	}
	for _, x := range chars[:eq] {
		if x.q {
			return false
		}
	}
	return !chars[eq].q && assignmentName.MatchString(charsString(chars[:eq]))
}

func finishCommand(c *shellCommand) *shellCommand {
	c.dynamic = []int{}
	for k, d := range c.dynamicFlags {
		if d {
			c.dynamic = append(c.dynamic, k)
		}
	}
	return c
}

func (c *shellCommand) isDynamic(k int) bool {
	for _, d := range c.dynamic {
		if d == k {
			return true
		}
	}
	return false
}

// braces is brace expansion of one word over its unquoted characters, as bash does it.
func braces(chars []shellChar) [][]shellChar {
	for s := 0; s < len(chars); s++ {
		if chars[s].q || chars[s].c != '{' {
			continue
		}
		depth := 0
		commas := []int{}
		e := -1
		for k := s; k < len(chars); k++ {
			x := chars[k]
			if x.q {
				continue
			}
			if x.c == '{' {
				depth++
			} else if x.c == '}' {
				depth--
				if depth == 0 {
					e = k
					break
				}
			} else if x.c == ',' && depth == 1 {
				commas = append(commas, k)
			}
		}
		if e < 0 || len(commas) == 0 {
			continue
		}
		cuts := append(append([]int{s}, commas...), e)
		out := [][]shellChar{}
		for n := 0; n+1 < len(cuts); n++ {
			piece := append(append(append([]shellChar{}, chars[:s]...), chars[cuts[n]+1:cuts[n+1]]...), chars[e+1:]...)
			out = append(out, braces(piece)...)
		}
		return out
	}
	return [][]shellChar{chars}
}
