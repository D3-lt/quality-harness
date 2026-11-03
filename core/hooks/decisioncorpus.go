// ADR-137 T1: the record rules of plugin/scripts/decision-corpus.mjs on the decision-context hook's path, in Go: which file
// is a record (recognisedAsRecord and the name arms), what its Status says (recordStatus, recordStatusKind), what it governs
// (declaredGoverns, the task tables' Affected Files, pathMatchesDeclaration), what enforces it (declaredEnforcement), who it
// is (recordId, titleLine, referencesIn) and what a frozen archive's catalog says of it (archiveDecisionEffect). ADR-092 as
// amended by ADR-137: a second mirror of the definition, held to every row of tests/fixtures/record-recognition.json and to
// the live Node functions by tests/decision-context-parity.test.mjs.
//
// Every rule keeps JavaScript's semantics, which Go's regexp does not share: a JavaScript string is UTF-16 code units; its
// `/i` without `u` folds no non-ASCII letter into ASCII (U+017F, U+212A); its `\s` and trim() hold U+FEFF and every Unicode
// space; its `.` and a multiline `^` or `$` stop at \r, U+2028 and U+2029; and it has lookaround and backreferences. A rule
// that depends on any of these runs on dcRx, a small backtracking matcher over code units, or is written by hand; Go's regexp
// is used only where the two languages cannot differ.
package hooks

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
)

// --- JavaScript characters ---------------------------------------------------

// dcJSSpace is JavaScript's `\s`, and what trim() removes.
func dcJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func dcJSTrim(s string) string { return strings.TrimFunc(s, dcJSSpace) }

// dcLineTerminator is where JavaScript's `.` stops and a multiline `^` or `$` matches.
func dcLineTerminator(r rune) bool { return r == '\n' || r == '\r' || r == 0x2028 || r == 0x2029 }

// dcWordChar is JavaScript's `\w` without `u`, ASCII only.
func dcWordChar(r rune) bool {
	return r == '_' || r >= '0' && r <= '9' || r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z'
}

// dcEdgeSpace is EDGE_CODES: the whitespace both trim() and Python's strip() remove at a value's edges.
func dcEdgeSpace(r rune) bool {
	switch r {
	case 0x20, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func dcEdgeTrim(s string) string { return strings.TrimFunc(s, dcEdgeSpace) }

// dcPyLineSpace is PY_LINE_SPACE: Python's `\s` less the line breaks, as record.py's record heading reads it.
func dcPyLineSpace(r rune) bool {
	switch r {
	case '\t', '\v', '\f', ' ', 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000:
		return true
	}
	return r >= 0x1c && r <= 0x1f || r >= 0x2000 && r <= 0x200a
}

// dcJSLower is String.prototype.toLowerCase as far as a comparison with an ASCII word can tell: U+0130 lowers to two
// characters there and to `i` in Go, so `actİve` was `active` here. (Final sigma is not applied; no ASCII word holds one.)
func dcJSLower(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r == 0x130 {
			b.WriteString("i\u0307")
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

// dcStartsWithWord is `/^word\b/i` without `u`: the ASCII word in any ASCII case, then the end or a character `\w` is not.
func dcStartsWithWord(s, word string) bool {
	if len(s) < len(word) || asciiLower(s[:len(word)]) != word {
		return false
	}
	return len(s) == len(word) || !dcWordChar(rune(s[len(word)]))
}

// dcSplitLines is `split(/\r\n|\r|\n/)`.
func dcSplitLines(text string) []string {
	lines := []string{}
	start := 0
	for i := 0; i < len(text); i++ {
		switch text[i] {
		case '\r':
			lines = append(lines, text[start:i])
			if i+1 < len(text) && text[i+1] == '\n' {
				i++
			}
			start = i + 1
		case '\n':
			lines = append(lines, text[start:i])
			start = i + 1
		}
	}
	return append(lines, text[start:])
}

// dcSplitCRLF is `split(/\r?\n/)`.
func dcSplitCRLF(text string) []string {
	lines := strings.Split(text, "\n")
	for i := 0; i < len(lines)-1; i++ {
		lines[i] = strings.TrimSuffix(lines[i], "\r")
	}
	return lines
}

func dcHasLine(text, line string) bool {
	for _, l := range dcSplitCRLF(text) {
		if l == line {
			return true
		}
	}
	return false
}

// dcNormaliseCR is `replace(/\r(?!\n)/g, '\n')`: a lone CR ends a line, CRLF is left as it is.
func dcNormaliseCR(text string) string {
	if !strings.Contains(text, "\r") {
		return text
	}
	b := []byte(text)
	for i := range b {
		if b[i] == '\r' && (i+1 == len(b) || b[i+1] != '\n') {
			b[i] = '\n'
		}
	}
	return string(b)
}

// dcDecodeUTF8 is Buffer.toString('utf8'): each maximal subpart of an ill-formed sequence becomes one U+FFFD (WHATWG), where
// Go's own decoding gives one per byte.
func dcDecodeUTF8(b []byte) string {
	var out strings.Builder
	for i := 0; i < len(b); {
		c := b[i]
		if c < 0x80 {
			out.WriteByte(c)
			i++
			continue
		}
		need, lower, upper := 0, byte(0x80), byte(0xbf)
		switch {
		case c >= 0xc2 && c <= 0xdf:
			need = 1
		case c >= 0xe0 && c <= 0xef:
			need = 2
			if c == 0xe0 {
				lower = 0xa0
			} else if c == 0xed {
				upper = 0x9f
			}
		case c >= 0xf0 && c <= 0xf4:
			need = 3
			if c == 0xf0 {
				lower = 0x90
			} else if c == 0xf4 {
				upper = 0x8f
			}
		default:
			out.WriteRune(0xfffd)
			i++
			continue
		}
		j, whole := i+1, true
		for n := 0; n < need; n++ {
			if j >= len(b) || b[j] < lower || b[j] > upper {
				whole = false
				break
			}
			lower, upper = 0x80, 0xbf
			j++
		}
		if whole {
			out.Write(b[i:j])
		} else {
			out.WriteRune(0xfffd)
		}
		i = j
	}
	return out.String()
}

func dcUTF16(s string) []uint16     { return utf16.Encode([]rune(s)) }
func dcU16String(u []uint16) string { return string(utf16.Decode(u)) }
func dcSliceUnits(s string, n int) string {
	u := dcUTF16(s)
	if len(u) > n {
		u = u[:n]
	}
	return dcU16String(u)
}

// --- dcRx: a backtracking matcher over UTF-16 code units -----------------------

type dcRxState struct {
	s    []uint16
	caps []int
}

// dcRx matches at i and hands each end it can reach to k, longest or shortest first as its quantifiers say, until k accepts.
type dcRx func(m *dcRxState, i int, k func(int) bool) bool

type dcMatch struct {
	start, end int
	caps       []int
	s          []uint16
}

func (m dcMatch) group(n int) (string, bool) {
	if m.caps[2*n] < 0 {
		return "", false
	}
	return dcU16String(m.s[m.caps[2*n]:m.caps[2*n+1]]), true
}

func dcIs(c uint16) func(uint16) bool { return func(x uint16) bool { return x == c } }

func dcIn(set string) func(uint16) bool {
	return func(x uint16) bool { return x < 0x80 && strings.IndexByte(set, byte(x)) >= 0 }
}

func dcSpaceUnit(c uint16) bool         { return dcJSSpace(rune(c)) }
func dcNotLineTermUnit(c uint16) bool   { return !dcLineTerminator(rune(c)) }
func dcWordUnit(c uint16) bool          { return dcWordChar(rune(c)) }
func dcDigitUnit(c uint16) bool         { return c >= '0' && c <= '9' }
func dcAnyUnit(uint16) bool             { return true }
func dcNotSlashUnit(c uint16) bool      { return c != '/' }
func dcSpaceOrUnderscore(c uint16) bool { return c == '_' || dcSpaceUnit(c) }
func dcTaskIDUnit(c uint16) bool        { return dcWordUnit(c) || c == '.' || c == '-' }
func dcPatternValueUnit(c uint16) bool  { return c != '"' && c != '\'' && c != '\n' }

// dcUnit matches one code unit.
func dcUnit(pred func(uint16) bool) dcRx {
	return func(m *dcRxState, i int, k func(int) bool) bool { return i < len(m.s) && pred(m.s[i]) && k(i+1) }
}

// dcRun is a quantified class: min to max (max < 0: no bound) units, greedy or lazy.
func dcRun(pred func(uint16) bool, min, max int, lazy bool) dcRx {
	return func(m *dcRxState, i int, k func(int) bool) bool {
		n := 0
		for i+n < len(m.s) && (max < 0 || n < max) && pred(m.s[i+n]) {
			n++
		}
		if n < min {
			return false
		}
		if lazy {
			for c := min; c <= n; c++ {
				if k(i + c) {
					return true
				}
			}
			return false
		}
		for c := n; c >= min; c-- {
			if k(i + c) {
				return true
			}
		}
		return false
	}
}

// dcLiteral matches ASCII text, in any ASCII case when fold is set: JavaScript's `/i` without `u` folds a non-ASCII
// character into no ASCII one, so a literal of ASCII letters folds with nothing else.
func dcLiteral(text string, fold bool) dcRx {
	return func(m *dcRxState, i int, k func(int) bool) bool {
		if i+len(text) > len(m.s) {
			return false
		}
		for j := 0; j < len(text); j++ {
			c, want := m.s[i+j], uint16(text[j])
			if fold && c >= 'A' && c <= 'Z' {
				c += 'a' - 'A'
			}
			if c != want {
				return false
			}
		}
		return k(i + len(text))
	}
}

// dcUnitsFold is whether code units spell an ASCII word in any ASCII case.
func dcUnitsFold(u []uint16, word string) bool {
	if len(u) != len(word) {
		return false
	}
	for j, c := range u {
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		if c != uint16(word[j]) {
			return false
		}
	}
	return true
}

func dcSeq(parts ...dcRx) dcRx {
	if len(parts) == 0 {
		return func(m *dcRxState, i int, k func(int) bool) bool { return k(i) }
	}
	first, rest := parts[0], dcSeq(parts[1:]...)
	return func(m *dcRxState, i int, k func(int) bool) bool {
		return first(m, i, func(j int) bool { return rest(m, j, k) })
	}
}

// dcOptional is a greedy `(?:…)?`.
func dcOptional(part dcRx) dcRx {
	return func(m *dcRxState, i int, k func(int) bool) bool { return part(m, i, k) || k(i) }
}

func dcCapture(n int, part dcRx) dcRx {
	return func(m *dcRxState, i int, k func(int) bool) bool {
		return part(m, i, func(j int) bool {
			start, end := m.caps[2*n], m.caps[2*n+1]
			m.caps[2*n], m.caps[2*n+1] = i, j
			if k(j) {
				return true
			}
			m.caps[2*n], m.caps[2*n+1] = start, end
			return false
		})
	}
}

// dcAssert is a zero-width test of the position: a lookbehind, a lookahead, `^` or `$`.
func dcAssert(test func(s []uint16, i int) bool) dcRx {
	return func(m *dcRxState, i int, k func(int) bool) bool { return test(m.s, i) && k(i) }
}

func dcLineStart(multiline bool) dcRx {
	return dcAssert(func(s []uint16, i int) bool { return i == 0 || multiline && dcLineTerminator(rune(s[i-1])) })
}

func dcLineEnd(multiline bool) dcRx {
	return dcAssert(func(s []uint16, i int) bool { return i == len(s) || multiline && dcLineTerminator(rune(s[i])) })
}

func dcRxTry(re dcRx, groups int, s []uint16, start int) (dcMatch, bool) {
	m := &dcRxState{s: s, caps: make([]int, 2*groups+2)}
	for j := range m.caps {
		m.caps[j] = -1
	}
	end := -1
	if !re(m, start, func(j int) bool { end = j; return true }) {
		return dcMatch{}, false
	}
	return dcMatch{start: start, end: end, caps: m.caps, s: s}, true
}

// dcExec is RegExp.prototype.exec from `from`: the first position where the pattern matches.
func dcExec(re dcRx, groups int, s []uint16, from int) (dcMatch, bool) {
	for start := from; start <= len(s); start++ {
		if found, ok := dcRxTry(re, groups, s, start); ok {
			return found, true
		}
	}
	return dcMatch{}, false
}

// --- Globs (pathMatchesDeclaration, globToRegExp) ------------------------------

// dcUpperExpands: the characters whose full uppercase is two or more characters while Go's simple mapping gives one. The
// non-unicode `/i` keeps such a character as itself.
func dcUpperExpands(r rune) bool {
	switch {
	case r >= 0x1f80 && r <= 0x1faf, r == 0x1fb3, r == 0x1fbc, r == 0x1fc3, r == 0x1fcc, r == 0x1ff3, r == 0x1ffc:
		return true
	}
	return false
}

// dcCanonical is the ECMAScript Canonicalize of a non-unicode case-insensitive pattern: the character's uppercase when that
// is one character, never a non-ASCII character made ASCII (U+017F, U+212A, U+0131 keep themselves).
func dcCanonical(c uint16) uint16 {
	if c < 0x80 {
		if c >= 'a' && c <= 'z' {
			return c - ('a' - 'A')
		}
		return c
	}
	if c >= 0xd800 && c <= 0xdfff || dcUpperExpands(rune(c)) {
		return c
	}
	up := unicode.ToUpper(rune(c))
	if up < 0x80 || up > 0xffff {
		return c
	}
	return uint16(up)
}

// dcGlobToken is one step of globToRegExp's pattern: `**` (any run of code units but a line terminator, a following `/` taken
// with it), `*` (a run with no `/`), `?` (one code unit that is not `/`), or a literal compared case-insensitively.
type dcGlobToken struct {
	kind byte // 'A' for `**`, '*' for `*`, '?' for `?`, 'L' for a literal
	want uint16
}

func dcGlobTokens(pattern string) []dcGlobToken {
	u := dcUTF16(strings.TrimPrefix(strings.ReplaceAll(pattern, `\`, "/"), "./"))
	tokens := []dcGlobToken{}
	for index := 0; index < len(u); index++ {
		c := u[index]
		switch {
		case c == '*' && index+1 < len(u) && u[index+1] == '*':
			tokens = append(tokens, dcGlobToken{kind: 'A'})
			if index+2 < len(u) && u[index+2] == '/' {
				index += 2
			} else {
				index++
			}
		case c == '*':
			tokens = append(tokens, dcGlobToken{kind: '*'})
		case c == '?':
			tokens = append(tokens, dcGlobToken{kind: '?'})
		default:
			tokens = append(tokens, dcGlobToken{kind: 'L', want: dcCanonical(c)})
		}
	}
	return tokens
}

// dcGlobMatch is globToRegExp's anchored match, stepping through the path once with the set of pattern positions reachable so
// far. Node's backtracking regex retried every split of every `*`, and a short glob took C(60,10) tries (the Codex review of
// 8d872045..b27d665a); the answer is the same, the work is pattern length times path length.
func dcGlobMatch(tokens []dcGlobToken, s []uint16) bool {
	n := len(tokens)
	cur, next := make([]bool, n+1), make([]bool, n+1)
	// A run matches nothing too, so a position before one reaches the position after it.
	widen := func(set []bool) {
		for k := 0; k < n; k++ {
			if set[k] && (tokens[k].kind == 'A' || tokens[k].kind == '*') {
				set[k+1] = true
			}
		}
	}
	cur[0] = true
	widen(cur)
	for _, c := range s {
		for k := range next {
			next[k] = false
		}
		for k := 0; k < n; k++ {
			if !cur[k] {
				continue
			}
			switch t := tokens[k]; t.kind {
			case 'A':
				if dcNotLineTermUnit(c) {
					next[k] = true
				}
			case '*':
				if dcNotSlashUnit(c) {
					next[k] = true
				}
			case '?':
				if dcNotSlashUnit(c) {
					next[k+1] = true
				}
			case 'L':
				if dcCanonical(c) == t.want {
					next[k+1] = true
				}
			}
		}
		widen(next)
		cur, next = next, cur
	}
	return cur[n]
}

// dcPathMatchesDeclaration is pathMatchesDeclaration: the file itself, anything under a declared directory, or a glob's match.
func dcPathMatchesDeclaration(candidate, declaration string) bool {
	file := strings.TrimPrefix(strings.ReplaceAll(candidate, `\`, "/"), "./")
	declared := strings.TrimSuffix(strings.TrimPrefix(strings.ReplaceAll(declaration, `\`, "/"), "./"), "/")
	if declared == "" {
		return false
	}
	if strings.ContainsAny(declared, "*?") {
		s := dcUTF16(file)
		return dcGlobMatch(dcGlobTokens(declared), s)
	}
	return file == declared || strings.HasPrefix(file, declared+"/")
}

// --- Fences, frontmatter and the Status --------------------------------------

const dcEdgeClass = `\x20\t\n\v\f\r\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}`

// dcSpaceClass is JavaScript's `\s` inside a Go character class.
const dcSpaceClass = dcEdgeClass + `\x{feff}`

var (
	dcStatusLabel     = regexp.MustCompile(`^ {0,3}\*{0,2}[Ss][Tt][Aa][Tt][Uu][Ss](?::\*{0,2}|\*{0,2}:)[ \t]*([^\r\n]*)$`)
	dcStatusBullet    = regexp.MustCompile(`^ {0,3}[*-][ \t]+\*{0,2}[Ss][Tt][Aa][Tt][Uu][Ss](?::\*{0,2}|\*{0,2}:)[ \t]*([^\r\n]*)$`)
	dcStatusHeading   = regexp.MustCompile(`^## ([^\r\n]+?)[` + dcEdgeClass + `\x{1c}-\x{1f}\x{85}]*$`)
	dcFenceMarker     = regexp.MustCompile("^[ \\t]*(`{3,}|~{3,})([^\\r\\n]*)$")
	dcFrontmatterOpen = regexp.MustCompile(`^\x{feff}?---[ \t]*$`)
	dcFrontmatterEnd  = regexp.MustCompile(`^(?:---|\.\.\.)[ \t]*$`)
	dcQuotedValue     = regexp.MustCompile(`^(?:"([^"]*)"|'([^']*)')(?:[ \t]+#[^\r\n]*)?$`)
	dcValueComment    = regexp.MustCompile(`[ \t]+#[^\r\n]*$`)
	dcSupersededByKey = regexp.MustCompile(`^superseded_by[ \t]*:[ \t]*([^\r\n]*)$`)
	dcSingleItem      = regexp.MustCompile(`^\[([^\],]*)\]$`)
	dcBareDate        = regexp.MustCompile(`^[0-9]{4}[-_.][0-9]{1,2}[-_.][0-9]{1,2}$`)
)

var dcStatusKinds = map[string]string{
	"accepted": "governing", "active": "governing",
	"proposed": "pending", "draft": "pending",
	"superseded": "graveyard", "withdrawn": "graveyard", "rejected": "graveyard", "deprecated": "graveyard",
}

type dcLine struct {
	text   string
	fenced bool
}

// dcFenceStep is fenceStep: whether line is fenced given the fence open before it ("" for none), and the fence after it.
func dcFenceStep(line, fence string) (bool, string) {
	marker := dcFenceMarker.FindStringSubmatch(line)
	if fence == "" {
		if marker != nil && !(marker[1][0] == '`' && strings.Contains(marker[2], "`")) {
			return true, marker[1]
		}
		return false, ""
	}
	if marker != nil && marker[1][0] == fence[0] && len(marker[1]) >= len(fence) && strings.Trim(marker[2], " \t") == "" {
		return true, ""
	}
	return true, fence
}

// dcFrontmatterClose is the index of the line closing a leading frontmatter block, or -1.
func dcFrontmatterClose(lines []string) int {
	if !dcFrontmatterOpen.MatchString(lines[0]) {
		return -1
	}
	for index := 1; index < len(lines); index++ {
		if dcFrontmatterEnd.MatchString(lines[index]) {
			return index
		}
	}
	return -1
}

// dcFencedLines is fencedLines: each line, with whether it sits in a code fence; a leading frontmatter block is no fence.
func dcFencedLines(text string) []dcLine {
	lines := dcSplitLines(text)
	head := dcFrontmatterClose(lines)
	out := make([]dcLine, len(lines))
	fence := ""
	for index, line := range lines {
		if head >= 0 && index <= head {
			out[index] = dcLine{line, false}
			continue
		}
		var fenced bool
		fenced, fence = dcFenceStep(line, fence)
		out[index] = dcLine{line, fenced}
	}
	return out
}

func dcIndentColumns(line string) int {
	column := 0
	for _, r := range line {
		if r == ' ' {
			column++
		} else if r == '\t' {
			column += 4 - column%4
		} else {
			break
		}
	}
	return column
}

// dcFrontmatterValue is a value as YAML writes it: one pair of enclosing quotes and a trailing ` #` comment removed.
func dcFrontmatterValue(value string) string {
	trimmed := dcEdgeTrim(value)
	if q := dcQuotedValue.FindStringSubmatchIndex(trimmed); q != nil {
		if q[2] >= 0 {
			return trimmed[q[2]:q[3]]
		}
		return trimmed[q[4]:q[5]]
	}
	if at := dcValueComment.FindStringIndex(trimmed); at != nil {
		return trimmed[:at[0]]
	}
	return trimmed
}

// dcInlineStatus is inlineStatus: the value after the first Status label outside a fence, or a MADR 2 bullet's above the first
// `## ` heading.
func dcInlineStatus(text string) (string, bool) {
	lines := dcFencedLines(text)
	head := dcFrontmatterClose(dcSplitLines(text))
	bullet, hasBullet, above := "", false, true
	for index, line := range lines {
		if line.fenced {
			continue
		}
		inBlock := head >= 0 && 0 < index && index < head
		if inBlock && line.text != "" && (line.text[0] == ' ' || line.text[0] == '\t') {
			continue
		}
		if found := dcStatusLabel.FindStringSubmatch(line.text); found != nil {
			if inBlock {
				return dcFrontmatterValue(found[1]), true
			}
			return found[1], true
		}
		if above && dcStatusHeading.MatchString(line.text) {
			above = false
		} else if above && !hasBullet {
			if found := dcStatusBullet.FindStringSubmatch(line.text); found != nil {
				bullet, hasBullet = found[1], true
			}
		}
	}
	return bullet, hasBullet
}

// dcStatusSection is statusSection: the first readable line of the last `## Status` section, "" for none, absent for no section.
func dcStatusSection(text string) (string, bool) {
	sections := [][]string{}
	current, found := -1, -1
	for _, line := range dcFencedLines(text) {
		var heading []string
		if !line.fenced {
			heading = dcStatusHeading.FindStringSubmatch(line.text)
		}
		if heading != nil {
			current = -1
			if dcJSLower(heading[1]) == "status" {
				sections = append(sections, []string{})
				current = len(sections) - 1
				found = current
			}
		} else if current >= 0 && !line.fenced && dcIndentColumns(line.text) < 4 {
			sections[current] = append(sections[current], line.text)
		}
	}
	if found < 0 {
		return "", false
	}
	for _, line := range sections[found] {
		if value := dcEdgeTrim(line); value != "" {
			return value, true
		}
	}
	return "", true
}

func dcDrop(s, chars string) string {
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune(chars, r) {
			return -1
		}
		return r
	}, s)
}

// dcRecordStatus is recordStatus: the Status with `*`, `_` and backticks removed, or absent.
func dcRecordStatus(text string) (string, bool) {
	value, ok := dcInlineStatus(text)
	if !ok {
		value, ok = dcStatusSection(text)
	}
	if !ok {
		return "", false
	}
	return dcEdgeTrim(dcDrop(value, "*_`")), true
}

// dcRawStatus is rawStatus: the Status with only `*` and backticks removed, so a record name's underscores survive.
func dcRawStatus(text string) string {
	value, ok := dcInlineStatus(text)
	if !ok {
		value, _ = dcStatusSection(text)
	}
	return dcEdgeTrim(dcDrop(value, "*`"))
}

// dcRecordStatusKind is recordStatusKind: a lookup of the run of letters and digits the value starts with, lowered; "" for
// none. Go 1.27 and Node 24 both read Unicode 17, so `\p{L}\p{N}` ends the run at the same character in each.
func dcRecordStatusKind(status string) string {
	trimmed := dcEdgeTrim(status)
	end := len(trimmed)
	for i, r := range trimmed {
		if !unicode.IsLetter(r) && !unicode.IsNumber(r) {
			end = i
			break
		}
	}
	if end == 0 {
		return ""
	}
	return dcStatusKinds[dcJSLower(trimmed[:end])]
}

// dcStatusKind is statusKind: a pending record is neither governing nor graveyard.
func dcStatusKind(status string) string {
	if kind := dcRecordStatusKind(status); kind != "pending" {
		return kind
	}
	return ""
}

// --- Governs, Enforced-by and the task tables ----------------------------------

// dcHeader is `/^[ \t]*\*{0,2}Word:?\*{0,2}[ \t]*:?[ \t]*(.*)$/im`.
func dcHeader(word string) dcRx {
	spaceTab := dcIn(" \t")
	return dcSeq(dcLineStart(true), dcRun(spaceTab, 0, -1, false), dcRun(dcIs('*'), 0, 2, false), dcLiteral(word, true),
		dcRun(dcIs(':'), 0, 1, false), dcRun(dcIs('*'), 0, 2, false), dcRun(spaceTab, 0, -1, false), dcRun(dcIs(':'), 0, 1, false),
		dcRun(spaceTab, 0, -1, false), dcCapture(1, dcRun(dcNotLineTermUnit, 0, -1, false)), dcLineEnd(true))
}

var (
	dcGovernsHeader  = dcHeader("governs")
	dcEnforcedHeader = dcHeader("enforced-by")
	// `/-\s*type:\s*(\w+)[\s\S]*?pattern:\s*["']?([^"'\n]+?)["']?\s*$/gm`
	dcTypedMatcher = dcSeq(dcLiteral("-", false), dcRun(dcSpaceUnit, 0, -1, false), dcLiteral("type:", false),
		dcRun(dcSpaceUnit, 0, -1, false), dcCapture(1, dcRun(dcWordUnit, 1, -1, false)), dcRun(dcAnyUnit, 0, -1, true),
		dcLiteral("pattern:", false), dcRun(dcSpaceUnit, 0, -1, false), dcRun(dcIn(`"'`), 0, 1, false),
		dcCapture(2, dcRun(dcPatternValueUnit, 1, -1, true)), dcRun(dcIn(`"'`), 0, 1, false), dcRun(dcSpaceUnit, 0, -1, false),
		dcLineEnd(true))
)

// dcGovernsTokens is `inline.matchAll(/`([^`]+)`|([^\s,]+)/g)`: a backticked span, or a run of neither space nor comma.
func dcGovernsTokens(inline string) []string {
	rs := []rune(inline)
	out := []string{}
	for i := 0; i < len(rs); {
		if rs[i] == '`' {
			j := i + 1
			for j < len(rs) && rs[j] != '`' {
				j++
			}
			if j < len(rs) && j > i+1 {
				out = append(out, string(rs[i+1:j]))
				i = j + 1
				continue
			}
		}
		if !dcJSSpace(rs[i]) && rs[i] != ',' {
			j := i
			for j < len(rs) && !dcJSSpace(rs[j]) && rs[j] != ',' {
				j++
			}
			out = append(out, string(rs[i:j]))
			i = j
			continue
		}
		i++
	}
	return out
}

func dcLeadingSpaces(rs []rune) int {
	n := 0
	for n < len(rs) && dcJSSpace(rs[n]) {
		n++
	}
	return n
}

// dcDeclaredGoverns is declaredGoverns: the header's inline paths and its typed matchers, `type: path` resolved and the
// others kept as `type:pattern`.
func dcDeclaredGoverns(text string) (paths, unresolved []string) {
	paths, unresolved = []string{}, []string{}
	header, ok := dcExec(dcGovernsHeader, 1, dcUTF16(text), 0)
	if !ok {
		return
	}
	inline, _ := header.group(1)
	if !dcStartsWithWord(dcJSTrim(inline), "none") {
		for _, token := range dcGovernsTokens(inline) {
			if value := dcJSTrim(token); value != "" && value[0] != '<' && value[0] != '(' {
				paths = append(paths, value)
			}
		}
	}
	// The run under the header, read from the FIRST place its matched text occurs, as `text.indexOf(header[0])` finds it.
	whole := dcU16String(header.s[header.start:header.end])
	at := strings.Index(text, whole)
	block := []string{}
	for _, line := range strings.Split(text[at+len(whole):], "\n")[1:] {
		if dcJSTrim(line) == "" {
			if len(block) > 0 {
				break
			}
			continue
		}
		rs := []rune(line)
		n := dcLeadingSpaces(rs)
		dashed := n < len(rs) && rs[n] == '-'
		indented := n >= 2 && n < len(rs)
		if !dashed && !indented {
			break
		}
		block = append(block, line)
	}
	joined := dcUTF16(strings.Join(block, "\n"))
	for from := 0; from <= len(joined); {
		matcher, ok := dcExec(dcTypedMatcher, 2, joined, from)
		if !ok {
			break
		}
		kind, _ := matcher.group(1)
		pattern, _ := matcher.group(2)
		if dcJSLower(kind) == "path" {
			paths = append(paths, dcJSTrim(pattern))
		} else {
			unresolved = append(unresolved, kind+":"+dcJSTrim(pattern))
		}
		from = matcher.end
	}
	return
}

// dcDeclaredEnforcement is declaredEnforcement: each backticked span whole, then the rest read as a list by dcListedOutside.
func dcDeclaredEnforcement(text string) []string {
	out := []string{}
	header, ok := dcExec(dcEnforcedHeader, 1, dcUTF16(text), 0)
	if !ok {
		return out
	}
	value, _ := header.group(1)
	inline := dcJSTrim(value)
	if inline == "" || dcStartsWithWord(inline, "none") {
		return out
	}
	parts := []string{}
	var outside strings.Builder
	position := 0
	for {
		open := strings.IndexByte(inline[position:], '`')
		if open < 0 {
			break
		}
		open += position
		close := strings.IndexByte(inline[open+1:], '`')
		if close < 0 {
			break
		}
		close += open + 1
		outside.WriteString(inline[position:open])
		outside.WriteByte(0)
		parts = append(parts, dcJSTrim(inline[open+1:close]))
		position = close + 1
	}
	outside.WriteString(inline[position:])
	parts = append(parts, dcListedOutside(outside.String())...)
	for _, part := range parts {
		if part != "" && part[0] != '<' && part[0] != '(' {
			out = append(out, part)
		}
	}
	return out
}

// dcListedOutside is listedOutside (BACKLOG §448): parentheses removed, the list cut at its sentence's full stop, and a
// comma-separated piece that held a span (a NUL here) dropped, since that span is already an item.
func dcListedOutside(outside string) []string {
	var kept []rune
	depth := 0
	for _, r := range outside {
		switch {
		case r == '(':
			depth++
		case r == ')':
			if depth > 0 {
				depth--
			}
		case depth == 0:
			kept = append(kept, r)
		}
	}
	for i, r := range kept {
		if r == '.' && (i+1 == len(kept) || dcJSSpace(kept[i+1])) {
			kept = kept[:i]
			break
		}
	}
	pieces := []string{}
	for _, piece := range strings.Split(string(kept), ",") {
		if !strings.ContainsRune(piece, 0) {
			pieces = append(pieces, dcJSTrim(piece))
		}
	}
	return pieces
}

const dcNotLineTermClass = `[^\n\r\x{2028}\x{2029}]`

var (
	dcSeparatorRow = regexp.MustCompile(`^\|?(?:[` + dcSpaceClass + `]*:?-+:?[` + dcSpaceClass + `]*\|)+[` + dcSpaceClass + `]*:?-*:?[` + dcSpaceClass + `]*$`)
	dcBlockStart   = regexp.MustCompile(`^(?:>|[-*+](?:[` + dcSpaceClass + `]|$)|[0-9]{1,9}[.)](?:[` + dcSpaceClass + `]|$)|(?:\*[` + dcSpaceClass + `]*){3,}$|(?:-[` + dcSpaceClass + `]*){3,}$|(?:_[` + dcSpaceClass + `]*){3,}$)`)
	// HTML_BLOCK_START's `/i` without `u`, matched against an ASCII-lowered line: `<linK>` (U+212A) and `<ſcript>` start no block.
	dcHTMLBlockStart = regexp.MustCompile(`^<(?:(?:script|pre|style|textarea)(?:[ \t]|>|$)|!--|\?|![a-z]|!\[cdata\[|/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t]|/?>|$))`)
	dcReadOnlyWord   = `(?:read|none|unchanged|no change|read[- ]only)`
	dcReadOnlyChange = regexp.MustCompile(`^` + dcReadOnlyWord + `\.?(?:[` + dcSpaceClass + `]*\([` + dcSpaceClass + `]*` + dcReadOnlyWord + `[` + dcSpaceClass + `]*\)\.?)?(?:[` + dcSpaceClass + `]+[—–][` + dcSpaceClass + `]+[^` + dcSpaceClass + `]` + dcNotLineTermClass + `*)?$`)
	dcCatalogLink    = regexp.MustCompile(`^\[[^\]]+\]\(([^)]*)\)$`)
	dcCatalogHref    = regexp.MustCompile(`^(?:\.\.?/)*[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$`)
	dcArchiveEffect  = regexp.MustCompile(`^(?:governing|withdrawn|superseded by [^` + dcSpaceClass + `]` + dcNotLineTermClass + `*)$`)
	dcRecordDirRe    = regexp.MustCompile(`^(?:adrs?|decisions?)(?:[-_]archived?s?)?$|^archives?[-_](?:adrs?|decisions?|records?)$`)
)

// dcTableRow is one row gfmTableRows returns; width -1 is null.
type dcTableRow struct {
	cells         []string
	change, width int
}

// dcTableCells is tableCells: a row split at every pipe a backslash does not escape, edge pipes optional.
func dcTableCells(line string) []string {
	text := dcJSTrim(line)
	cells := []string{}
	var cell strings.Builder
	ended := false
	for i := 0; i < len(text); i++ {
		ended = false
		if text[i] == '\\' && i+1 < len(text) && text[i+1] == '|' {
			cell.WriteString(`\|`)
			i++
			continue
		}
		if text[i] == '|' {
			cells = append(cells, dcJSTrim(cell.String()))
			cell.Reset()
			ended = true
			continue
		}
		cell.WriteByte(text[i])
	}
	if !ended {
		cells = append(cells, dcJSTrim(cell.String()))
	}
	if strings.HasPrefix(text, "|") {
		cells = cells[1:]
	}
	return cells
}

// dcUnescapedPipe is `/(?<!\\)\|/`.
func dcUnescapedPipe(line string) bool {
	for i := 0; i < len(line); i++ {
		if line[i] == '|' && (i == 0 || line[i-1] != '\\') {
			return true
		}
	}
	return false
}

// dcGfmTableRows is gfmTableRows: the rows of each GFM table, and lines with a pipe outside any table.
func dcGfmTableRows(lines []string) []dcTableRow {
	rows := []dcTableRow{}
	inTable, change, width := false, -1, -1
	for i := 0; i < len(lines); i++ {
		line := dcJSTrim(lines[i])
		if inTable && (line == "" || dcBlockStart.MatchString(line) || dcHTMLBlockStart.MatchString(asciiLower(line))) {
			inTable = false
		}
		if !inTable && !dcUnescapedPipe(line) {
			continue
		}
		cells := dcTableCells(line)
		if !inTable {
			next := ""
			if i+1 < len(lines) {
				next = dcJSTrim(lines[i+1])
			}
			if dcSeparatorRow.MatchString(next) && len(dcTableCells(next)) == len(cells) {
				inTable, width, change = true, len(cells), -1
				for k, header := range cells {
					if asciiLower(header) == "change" {
						change = k
						break
					}
				}
				i++
				rows = append(rows, dcTableRow{cells, -1, -1})
				continue
			}
		}
		if inTable {
			rows = append(rows, dcTableRow{cells, change, width})
		} else {
			rows = append(rows, dcTableRow{cells, -1, -1})
		}
	}
	return rows
}

// dcAffectedHeading is `new RegExp('^#{1,6}\\s+Affected Files\\s*$', 'i')`.
var dcAffectedHeading = dcSeq(dcLineStart(false), dcRun(dcIs('#'), 1, 6, false), dcRun(dcSpaceUnit, 1, -1, false),
	dcLiteral("affected files", true), dcRun(dcSpaceUnit, 0, -1, false), dcLineEnd(false))

// dcAnyHeading is `/^#{1,6}\s+\S/`.
func dcAnyHeading(line string) bool {
	rs := []rune(line)
	n := 0
	for n < len(rs) && rs[n] == '#' {
		n++
	}
	if n < 1 || n > 6 {
		return false
	}
	spaces := dcLeadingSpaces(rs[n:])
	return spaces >= 1 && n+spaces < len(rs)
}

// dcAffectedSection is markdownSection(text, 'Affected Files'): a fenced line comes back blank.
func dcAffectedSection(text string) string {
	lines := dcFencedLines(text)
	start := -1
	for index, line := range lines {
		if _, ok := dcRxTry(dcAffectedHeading, 0, dcUTF16(line.text), 0); !line.fenced && ok {
			start = index
			break
		}
	}
	if start < 0 {
		return ""
	}
	body := []string{}
	for _, line := range lines[start+1:] {
		if !line.fenced && dcAnyHeading(line.text) {
			break
		}
		if line.fenced {
			body = append(body, "")
		} else {
			body = append(body, line.text)
		}
	}
	return strings.Join(body, "\n")
}

// dcFirstSpan is `/`([^`]+)`/`'s group.
func dcFirstSpan(s string) (string, bool) {
	for i := 0; i < len(s); i++ {
		if s[i] != '`' {
			continue
		}
		if j := strings.IndexByte(s[i+1:], '`'); j > 0 {
			return s[i+1 : i+1+j], true
		}
	}
	return "", false
}

// dcWholeCellName is WHOLE_CELL_NAME, `/^([*_]{0,2})`[^`]+`\1(?:\s*\([^()]*\))*$/`, whose backreference Go's regexp lacks.
func dcWholeCellName(first string) bool {
	lead := 0
	for lead < 2 && lead < len(first) && (first[lead] == '*' || first[lead] == '_') {
		lead++
	}
	for n := lead; n >= 0; n-- {
		prefix, rest := first[:n], first[n:]
		if !strings.HasPrefix(rest, "`") {
			continue
		}
		close := strings.IndexByte(rest[1:], '`')
		if close < 1 {
			continue
		}
		after := rest[close+2:]
		if !strings.HasPrefix(after, prefix) {
			continue
		}
		tail := after[len(prefix):]
		for {
			if tail == "" {
				return true
			}
			tail = strings.TrimLeftFunc(tail, dcJSSpace)
			if !strings.HasPrefix(tail, "(") {
				break
			}
			end := strings.IndexAny(tail[1:], "()")
			if end < 0 || tail[1+end] != ')' {
				break
			}
			tail = tail[end+2:]
		}
	}
	return false
}

// dcRowPath is rowPath: the path a row's first cell names.
func dcRowPath(first string) (string, bool) {
	if span, ok := dcFirstSpan(first); ok {
		ticked := dcJSTrim(span)
		if ticked == "" || strings.IndexFunc(ticked, dcJSSpace) >= 0 || ticked[0] == '<' {
			return "", false
		}
		if strings.ContainsAny(ticked, `./\`) || dcWholeCellName(first) {
			return ticked, true
		}
		return "", false
	}
	if first == "" || asciiLower(first) == "file" || first[0] == '<' || strings.IndexFunc(first, dcJSSpace) >= 0 || !strings.ContainsAny(first, `./\`) {
		return "", false
	}
	return first, true
}

// dcAffectedFiles is affectedFiles: cell 0 of every Affected Files row whose Change cell does not say the task only reads it.
func dcAffectedFiles(text string) []string {
	paths := []string{}
	for _, row := range dcGfmTableRows(strings.Split(dcAffectedSection(text), "\n")) {
		change := -1
		if row.width >= 0 && len(row.cells) == row.width {
			change = row.change
		}
		first := ""
		if len(row.cells) > 0 {
			first = row.cells[0]
		}
		path, ok := dcRowPath(first)
		if !ok {
			continue
		}
		if change >= 0 && dcReadOnlyChange.MatchString(asciiLower(dcJSTrim(dcDrop(row.cells[change], "*`_")))) {
			continue
		}
		paths = append(paths, path)
	}
	return paths
}

// --- Identity (recordId, titleLine, referencesIn) ------------------------------

func dcSeparator(r rune) bool { return r == '-' || r == '_' || r == '.' }

// dcDateShaped is DATE_SHAPED_RE: four decimal digits, a separator, one or two, a separator; any digit of the frozen table.
func dcDateShaped(s string) bool {
	rs := []rune(s)
	if len(rs) < 7 {
		return false
	}
	for k := 0; k < 4; k++ {
		if !isDecimalDigit(rs[k]) {
			return false
		}
	}
	if !dcSeparator(rs[4]) || !isDecimalDigit(rs[5]) {
		return false
	}
	return dcSeparator(rs[6]) || len(rs) > 7 && isDecimalDigit(rs[6]) && dcSeparator(rs[7])
}

// dcASCIIDateShaped is ADR_FILE's lookahead, `[0-9]{4}[-_.][0-9]{1,2}[-_.]`.
func dcASCIIDateShaped(s string) bool {
	digit := func(i int) bool { return i < len(s) && s[i] >= '0' && s[i] <= '9' }
	sep := func(i int) bool { return i < len(s) && dcSeparator(rune(s[i])) }
	return digit(0) && digit(1) && digit(2) && digit(3) && sep(4) && digit(5) && (sep(6) || digit(6) && sep(7))
}

func dcASCIIDigits(s string, at int) int {
	n := 0
	for at+n < len(s) && s[at+n] >= '0' && s[at+n] <= '9' {
		n++
	}
	return n
}

// dcADRPrefixes are the positions a record number may start at after an optional `adr[-_]?`, longest first.
func dcADRPrefixes(s string) []int {
	at := []int{}
	if len(s) >= 3 && asciiLower(s[:3]) == "adr" {
		if len(s) > 3 && (s[3] == '-' || s[3] == '_') {
			at = append(at, 4)
		}
		at = append(at, 3)
	}
	return append(at, 0)
}

// dcTaskShaped is TASK_SHAPED_RE: `^(?:adr[-_]?)?D{1,4}[-._]TD+(?:[-._]|$)`, D any digit of the frozen table.
func dcTaskShaped(stem string) bool {
	rs := []rune(stem)
	from := func(p int) bool {
		n := 0
		for p+n < len(rs) && isDecimalDigit(rs[p+n]) {
			n++
		}
		if n < 1 || n > 4 || p+n >= len(rs) || !dcSeparator(rs[p+n]) {
			return false
		}
		p += n + 1
		if p >= len(rs) || rs[p] != 'T' && rs[p] != 't' {
			return false
		}
		p++
		m := 0
		for p+m < len(rs) && isDecimalDigit(rs[p+m]) {
			m++
		}
		return m >= 1 && (p+m == len(rs) || dcSeparator(rs[p+m]))
	}
	for _, p := range dcADRPrefixes(stem) {
		if from(len([]rune(stem[:p]))) {
			return true
		}
	}
	return false
}

// dcRecordFileNumber is RECORD_FILE_RE's number: `^(?:adr[-_]?)?(\d{1,4})[-._]`.
func dcRecordFileNumber(s string) (string, bool) {
	for _, p := range dcADRPrefixes(s) {
		if n := dcASCIIDigits(s, p); n >= 1 && n <= 4 && p+n < len(s) && dcSeparator(rune(s[p+n])) {
			return s[p : p+n], true
		}
	}
	return "", false
}

// dcNumberID is numberId: `ADR-` and String(Number(digits)), padded to three.
func dcNumberID(digits string) string {
	f, _ := strconv.ParseFloat(digits, 64)
	number := jsNumber(f)
	if number == "null" {
		number = "Infinity"
	}
	for len(number) < 3 {
		number = "0" + number
	}
	return "ADR-" + number
}

var (
	// TITLE_TASK_RE, `/^\ufeff?#\s*(?:Task\s+)?ADR[-_]?[A-Za-z0-9._-]*-T\d+/i`.
	dcTitleTask = dcSeq(dcRun(dcIs(0xfeff), 0, 1, false), dcLiteral("#", false), dcRun(dcSpaceUnit, 0, -1, false),
		dcOptional(dcSeq(dcLiteral("task", true), dcRun(dcSpaceUnit, 1, -1, false))), dcLiteral("adr", true),
		dcRun(dcIn("-_"), 0, 1, false), dcRun(dcTaskIDUnit, 0, -1, false), dcLiteral("-t", true), dcRun(dcDigitUnit, 1, -1, false))
	// TITLE_ADR_RE, `/^\ufeff?#\s*ADR[-_ ]?(\d.*)$/i`.
	dcTitleADR = dcSeq(dcRun(dcIs(0xfeff), 0, 1, false), dcLiteral("#", false), dcRun(dcSpaceUnit, 0, -1, false),
		dcLiteral("adr", true), dcRun(dcIn("-_ "), 0, 1, false),
		dcCapture(1, dcSeq(dcUnit(dcDigitUnit), dcRun(dcNotLineTermUnit, 0, -1, false))), dcLineEnd(false))
)

// dcRecordID is recordId: `ADR-NNN` from the title or a non-date name, a date-shaped name's stem, or absent.
func dcRecordID(name, title string, hasTitle bool) (string, bool) {
	if hasTitle {
		u := dcUTF16(title)
		if _, task := dcRxTry(dcTitleTask, 0, u, 0); !task {
			if found, ok := dcRxTry(dcTitleADR, 1, u, 0); ok {
				rest, _ := found.group(1)
				if n := dcASCIIDigits(rest, 0); !dcDateShaped(rest) && n >= 1 && n <= 4 {
					return dcNumberID(rest[:n]), true
				}
			}
		}
	}
	stem, shaped := name, name+"."
	if strings.HasSuffix(dcJSLower(name), ".md") {
		stem, shaped = name[:len(name)-3], name
	}
	if dcDateShaped(shaped) {
		return stem, true
	}
	if dcTaskShaped(stem) {
		return "", false
	}
	if number, ok := dcRecordFileNumber(shaped); ok {
		return dcNumberID(number), true
	}
	return "", false
}

// dcTitleLine is titleLine: the first `# ` heading outside a leading frontmatter block and every fence.
func dcTitleLine(text string) (string, bool) {
	head := dcFrontmatterClose(dcSplitLines(text))
	for index, line := range dcFencedLines(text) {
		if line.fenced || head >= 0 && index <= head {
			continue
		}
		rs := []rune(strings.TrimPrefix(line.text, "\ufeff"))
		if len(rs) >= 2 && rs[0] == '#' && dcJSSpace(rs[1]) {
			return line.text, true
		}
	}
	return "", false
}

type dcReference struct {
	at       int
	id       string
	explicit bool
}

func dcChunkUnit(c uint16) bool {
	return dcWordUnit(c) || c == '.' || c == '/' || c == '\\' || c == '-'
}

// dcReferencesWithProvenance is referencesWithProvenance, with `at` in UTF-16 code units as JavaScript counts them.
func dcReferencesWithProvenance(u []uint16) []dcReference {
	found := []dcReference{}
	// NUMBERED_REF_RE, `/(?<![A-Za-z0-9_])ADR-(\d+)(?![A-Za-z0-9_])/gi`.
	for i := 0; i < len(u); {
		if i+4 <= len(u) && (i == 0 || !dcWordUnit(u[i-1])) && dcUnitsFold(u[i:i+4], "adr-") {
			j := i + 4
			for j < len(u) && dcDigitUnit(u[j]) {
				j++
			}
			if j > i+4 && (j == len(u) || !dcWordUnit(u[j])) {
				found = append(found, dcReference{i, dcNumberID(dcU16String(u[i+4 : j])), true})
				i = j
				continue
			}
		}
		i++
	}
	// REF_CHUNK_RE, `/[A-Za-z0-9._/\\-]+/g`: ASCII, so a chunk's bytes are its code units.
	for i := 0; i < len(u); {
		if !dcChunkUnit(u[i]) {
			i++
			continue
		}
		j := i
		for j < len(u) && dcChunkUnit(u[j]) {
			j++
		}
		chunk := dcU16String(u[i:j])
		offset := i
		pathlike := strings.ContainsAny(chunk, `/\`)
		for _, raw := range dcSplitSlashes(chunk) {
			part := strings.TrimRight(raw, ".,;:)")
			filename := strings.HasSuffix(strings.ToLower(part), ".md")
			if filename {
				part = strings.TrimRight(part[:len(part)-3], ".,;:)")
			}
			if part != "" && dcDateShaped(part) {
				found = append(found, dcReference{offset, part, filename || pathlike})
			}
			offset += len(raw) + 1
		}
		i = j
	}
	sort.SliceStable(found, func(a, b int) bool { return found[a].at < found[b].at })
	return found
}

func dcSplitSlashes(s string) []string {
	parts := []string{}
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '/' || s[i] == '\\' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	return append(parts, s[start:])
}

// dcReferencesIn is referencesIn: every record a piece of prose names, once, in the order it names them.
func dcReferencesIn(text string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, ref := range dcReferencesWithProvenance(dcUTF16(text)) {
		if !seen[ref.id] {
			seen[ref.id] = true
			out = append(out, ref.id)
		}
	}
	return out
}

// --- Recognition (recognisedAsRecord, the name arms, corpusEligible) -----------

// dcCanonicalName is CANONICAL_NAME, `/^ADR-[0-9]+(?![A-Za-z0-9_])/i`.
func dcCanonicalName(base string) bool {
	if len(base) < 5 || asciiLower(base[:4]) != "adr-" {
		return false
	}
	n := dcASCIIDigits(base, 4)
	return n >= 1 && (4+n == len(base) || !dcWordChar(rune(base[4+n])))
}

// dcAdrFile is ADR_FILE, `/^(?![0-9]{4}[-_.][0-9]{1,2}[-_.])(?:adr[-_]?\d{1,4}|\d{3,4})[-._]/i`.
func dcAdrFile(base string) bool {
	if dcASCIIDateShaped(base) {
		return false
	}
	sepAt := func(p int) bool { return p < len(base) && dcSeparator(rune(base[p])) }
	for _, p := range dcADRPrefixes(base) {
		n := dcASCIIDigits(base, p)
		if p > 0 && n >= 1 && n <= 4 && sepAt(p+n) || p == 0 && (n == 3 || n == 4) && sepAt(n) {
			return true
		}
	}
	return false
}

// dcNameArmSpelling is nameArmSpelling: a basename a name arm recognises.
func dcNameArmSpelling(file string) bool {
	base := filepath.Base(file)
	return dcCanonicalName(base) || specName(base)
}

// dcRecordDirectory is RECORD_DIRECTORY (`/i` without `u`: `decisionſ` is no record directory).
func dcRecordDirectory(name string) bool { return dcRecordDirRe.MatchString(asciiLower(name)) }

func dcBareNumber(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !isDecimalDigit(r) {
			return false
		}
	}
	return true
}

// dcRealpath is `realpathSync.native` on an absolute path: realpath(3) on unix, the handle's final path on Windows
// (nativeRealpath), so a junction resolves for the core as it does for Node.
func dcRealpath(p string) (string, error) {
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	return nativeRealpath(abs)
}

// dcInside is `inside`: target relative to base, or absent when it is not under it.
func dcInside(base, target string) (string, bool) {
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return "", false
	}
	if rel == "." {
		rel = ""
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", false
	}
	return rel, true
}

// dcListedRelative is listedRelative: through the real path of the file's directory, then as spelled, then against the real root.
func dcListedRelative(root, file string) (string, bool) {
	absolute, _ := filepath.Abs(file)
	realRoot, rootErr := dcRealpath(root)
	throughDirectory, dirErr := "", rootErr
	if rootErr == nil {
		var realDir string
		realDir, dirErr = dcRealpath(filepath.Dir(absolute))
		throughDirectory = filepath.Join(realDir, filepath.Base(absolute))
	}
	spelledRoot, _ := filepath.Abs(root)
	type pair struct {
		candidate, base string
		ok              bool
	}
	for _, try := range []pair{{throughDirectory, realRoot, dirErr == nil}, {absolute, spelledRoot, true}, {absolute, realRoot, rootErr == nil}} {
		if try.ok {
			if found, ok := dcInside(try.base, try.candidate); ok {
				return found, true
			}
		}
	}
	return "", false
}

// dcRecordPlacement is recordPlacement: the real path relative to the real root, else as listed.
func dcRecordPlacement(root, file string) string {
	if realRoot, err := dcRealpath(root); err == nil {
		if realFile, err := dcRealpath(file); err == nil {
			if placed, ok := dcInside(realRoot, realFile); ok {
				return placed
			}
		}
	}
	if listed, ok := dcListedRelative(root, file); ok {
		return listed
	}
	return file
}

// dcDirectoriesOf is directoriesOf: a backslash separates only where the platform is Windows.
func dcDirectoriesOf(relative, platform string) []string {
	parts := strings.Split(relative, "/")
	if platform == "win32" {
		parts = dcSplitSlashes(relative)
	}
	return parts[:len(parts)-1]
}

func dcSpelledRelatives(root, file string) []string {
	absolute, _ := filepath.Abs(file)
	spelled, _ := filepath.Abs(root)
	bases := []string{spelled}
	if realRoot, err := dcRealpath(root); err == nil {
		bases = append(bases, realRoot)
	}
	out := []string{}
	for _, base := range bases {
		if found, ok := dcInside(base, absolute); ok {
			out = append(out, found)
		}
	}
	return out
}

// dcKeptWhereRecordsAre is keptWhereRecordsAre: under a record directory, never under `tasks`, and not inside another
// record's own directory below it.
func dcKeptWhereRecordsAre(directories []string, name string) bool {
	for _, part := range directories {
		if dcJSLower(part) == "tasks" {
			return false
		}
	}
	own, hasOwn := dcRecordID(name, "", false)
	anotherRecords := func(directory string) bool {
		if dcBareNumber(directory) {
			return false
		}
		found, ok := dcRecordID(directory, "", false)
		return ok && !(hasOwn && found == own)
	}
	for index, part := range directories {
		if !dcRecordDirectory(part) {
			continue
		}
		blocked := false
		for _, later := range directories[index+1:] {
			if anotherRecords(later) {
				blocked = true
				break
			}
		}
		if !blocked {
			return true
		}
	}
	return false
}

// dcRecordSection is RECORD_SECTION: `##`, Python's line whitespace, then Context or Decision letter by letter, as a word.
func dcRecordSection(line string) bool {
	if !strings.HasPrefix(line, "##") {
		return false
	}
	rs := []rune(line[2:])
	n := 0
	for n < len(rs) && dcPyLineSpace(rs[n]) {
		n++
	}
	if n == 0 {
		return false
	}
	rest := rs[n:]
	for _, word := range []string{"context", "decision"} {
		if len(rest) >= len(word) && asciiLower(string(rest[:len(word)])) == word && (len(rest) == len(word) || !dcWordChar(rest[len(word)])) {
			return true
		}
	}
	return false
}

// dcDiscriminators is recordDiscriminators: a line-start `**Status:**` and a record heading, both outside every fence.
func dcDiscriminators(text string) (bold, heading bool) {
	for _, line := range dcFencedLines(text) {
		if line.fenced {
			continue
		}
		bold = bold || strings.HasPrefix(line.text, "**Status:**")
		heading = heading || dcRecordSection(line.text)
		if bold && heading {
			break
		}
	}
	return
}

// dcScreenText is the content screen (screenAdmits) over a whole text: the same walk, unstreamed.
func dcScreenText(text string) bool {
	bold, heading := dcDiscriminators(text)
	return bold && heading
}

type dcRecognition struct {
	recognised, hasStatus, kept bool
	status, arm                 string
}

// dcRecognisedAsRecord is recognisedAsRecord, the one definition's mirror (ADR-092).
func dcRecognisedAsRecord(root, file, text, platform string) dcRecognition {
	placed := dcRecordPlacement(root, file)
	listed, ok := dcListedRelative(root, file)
	if !ok {
		listed = file
	}
	status, hasStatus := dcRecordStatus(text)
	placedDirectories := dcDirectoriesOf(placed, platform)
	kept := dcKeptWhereRecordsAre(placedDirectories, filepath.Base(placed))
	answer := func(recognised bool, arm string) dcRecognition {
		return dcRecognition{recognised: recognised, hasStatus: hasStatus, kept: kept, status: status, arm: arm}
	}
	directories := append(dcDirectoriesOf(listed, platform), placedDirectories...)
	for _, relative := range dcSpelledRelatives(root, file) {
		directories = append(directories, dcDirectoriesOf(relative, platform)...)
	}
	for _, part := range directories {
		if asciiLower(part) == "templates" {
			return answer(false, "templates")
		}
	}
	base := filepath.Base(file)
	switch {
	case dcCanonicalName(base):
		return answer(true, "canonical")
	case specName(base):
		return answer(true, "spec")
	case dcJSLower(base) == "readme.md":
		return answer(false, "readme")
	case !hasStatus:
		return answer(false, "")
	}
	bold, heading := dcDiscriminators(text)
	if heading && (kept || bold && dcRecordStatusKind(status) != "") {
		return answer(true, "content")
	}
	return answer(false, "")
}

// dcCorpusEligible is corpusEligible: `.md` in any case, never a README, and no tasks, templates or fixture directory.
func dcCorpusEligible(relative string) bool {
	parts := []string{}
	for _, part := range strings.Split(posixListed(relative), "/") {
		if part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) == 0 {
		return false
	}
	name := dcJSLower(parts[len(parts)-1])
	if !strings.HasSuffix(name, ".md") || name == "readme.md" {
		return false
	}
	directories := parts[:len(parts)-1]
	for _, part := range directories {
		if dcJSLower(part) == "tasks" || asciiLower(part) == "templates" {
			return false
		}
	}
	return !listedUnderUninterestingDirectory(directories)
}

// dcListedAbsolute is listedAbsolute: a listed path under the root.
func dcListedAbsolute(root, rel string) string {
	parts := []string{root}
	for _, part := range strings.Split(posixListed(rel), "/") {
		if part != "" && part != "." {
			parts = append(parts, part)
		}
	}
	return filepath.Join(parts...)
}

// --- Reading, archives and a record's standing --------------------------------

type dcRead struct {
	text string
	err  error
}

// dcReader is corpusReader's text: one observation per file per scan, read only from a regular file, decoded as Node decodes
// it, a lone CR made a line feed.
type dcReader struct{ texts map[string]dcRead }

func newDcReader() *dcReader { return &dcReader{texts: map[string]dcRead{}} }

func (r *dcReader) text(file string) (string, error) {
	if got, ok := r.texts[file]; ok {
		return got.text, got.err
	}
	text, err := func() (string, error) {
		st, err := os.Stat(file)
		if err != nil {
			return "", err
		}
		if !st.Mode().IsRegular() {
			return "", fmt.Errorf("%s is not a regular file", file)
		}
		b, err := os.ReadFile(file)
		if err != nil {
			return "", err
		}
		return dcNormaliseCR(dcDecodeUTF8(b)), nil
	}()
	r.texts[file] = dcRead{text, err}
	return text, err
}

const dcReadmeUnknownReason = "a README is listed beside it under another spelling, and whether that is this directory's catalog is not something this reader guesses — name it `README.md`"

func dcListedNamesIn(directory string, listed map[string]bool) []string {
	names := []string{}
	for candidate := range listed {
		if filepath.Dir(candidate) == directory {
			names = append(names, filepath.Base(candidate))
		}
	}
	sort.Strings(names)
	return names
}

// dcListedReadme is listedReadme with the corpus reader: the exact `README.md` to read, or unknown when another spelling is
// listed and carries the marker, cannot be read, or is one of several.
func dcListedReadme(directory string, names []string, reader *dcReader) (string, bool) {
	spellings := []string{}
	for _, name := range names {
		if dcJSLower(name) == "readme.md" {
			spellings = append(spellings, name)
		}
	}
	switch {
	case len(spellings) == 0:
		return "", false
	case len(spellings) > 1:
		return "", true
	case spellings[0] == "README.md":
		return filepath.Join(directory, "README.md"), false
	}
	text, err := reader.text(filepath.Join(directory, spellings[0]))
	return "", err != nil || dcHasLine(text, archiveLifecycleLine)
}

// dcCatalogDirectoryFor is catalogDirectoryFor: the nearest listed directory, up to the root, whose README carries the
// Lifecycle marker or cannot be read; the file's own directory when there is none.
func dcCatalogDirectoryFor(file, root string, reader *dcReader, listed map[string]bool) string {
	top := filepath.Clean(root)
	for directory := filepath.Dir(file); ; directory = filepath.Dir(directory) {
		readme, unknown := dcListedReadme(directory, dcListedNamesIn(directory, listed), reader)
		if unknown {
			return directory
		}
		if readme != "" {
			if text, err := reader.text(readme); err != nil || dcHasLine(text, archiveLifecycleLine) {
				return directory
			}
		}
		if directory == top || filepath.Dir(directory) == directory {
			return filepath.Dir(file)
		}
	}
}

// dcCatalog is one directory's catalog: state "" for no archive, "unread", "unknown-readme", or "rows".
type dcCatalog struct {
	state string
	rows  map[string][]string
}

// dcArchived is what archiveDecisionEffect returns for a frozen record: its effect, or why it is unproven. nil is null.
type dcArchived struct{ effect, unproven string }

// dcCatalogCells is catalogCells: a row's cells, `\|` an escaped pipe, edge cells dropped.
func dcCatalogCells(line string) []string {
	cells := []string{}
	var cell strings.Builder
	for i := 0; i < len(line); i++ {
		switch {
		case line[i] == '\\' && i+1 < len(line) && line[i+1] == '|':
			cell.WriteByte('|')
			i++
		case line[i] == '|':
			cells = append(cells, dcJSTrim(cell.String()))
			cell.Reset()
		default:
			cell.WriteByte(line[i])
		}
	}
	cells = append(cells, dcJSTrim(cell.String()))
	if len(cells) < 2 {
		return []string{}
	}
	return cells[1 : len(cells)-1]
}

// dcArchiveDecisionEffect is archiveDecisionEffect: what the catalog of the archive a record sits in says its decision's
// effect is now, or why it cannot say; nil when the record is under no listed archive.
func dcArchiveDecisionEffect(file string, reader *dcReader, cache map[string]*dcCatalog, listed map[string]bool, root string) *dcArchived {
	directory := dcCatalogDirectoryFor(file, root, reader, listed)
	catalog, ok := cache[directory]
	if !ok {
		catalog = &dcCatalog{}
		readme, unknown := dcListedReadme(directory, dcListedNamesIn(directory, listed), reader)
		if unknown {
			catalog.state = "unknown-readme"
		} else if readme != "" {
			if text, err := reader.text(readme); err != nil {
				catalog.state = "unread"
			} else if lines := dcSplitCRLF(text); dcHasLine(text, archiveLifecycleLine) {
				catalog.state, catalog.rows = "rows", map[string][]string{}
				for _, line := range lines {
					if !strings.HasPrefix(line, "|") {
						continue
					}
					cells := dcCatalogCells(line)
					first := ""
					if len(cells) > 0 {
						first = cells[0]
					}
					link := dcCatalogLink.FindStringSubmatch(first)
					if link == nil {
						continue
					}
					href := strings.SplitN(link[1], "#", 2)[0]
					if !dcCatalogHref.MatchString(href) {
						continue
					}
					target := filepath.Join(append([]string{directory}, strings.Split(href, "/")...)...)
					effect := ""
					if len(cells) > 2 {
						effect = cells[2]
					}
					catalog.rows[target] = append(catalog.rows[target], effect)
				}
			}
		}
		cache[directory] = catalog
	}
	switch catalog.state {
	case "":
		return nil
	case "unread":
		return &dcArchived{unproven: "the README beside it is listed and could not be read, so whether this is an archive is unknown"}
	case "unknown-readme":
		return &dcArchived{unproven: dcReadmeUnknownReason}
	}
	effects := catalog.rows[file]
	switch {
	case len(effects) == 0:
		return &dcArchived{unproven: "its archive catalog has no row that links to it"}
	case len(effects) > 1:
		return &dcArchived{unproven: "its archive catalog lists it more than once"}
	case !dcArchiveEffect.MatchString(asciiLower(effects[0])):
		return &dcArchived{unproven: "its archive catalog gives an effect this reader does not know: " + dcSliceUnits(effects[0], 60)}
	}
	// A supersession must name a record.
	if dcStartsWithWord(effects[0], "superseded") {
		if _, named := dcSupersessionTarget(effects[0], effects[0]); !named {
			return &dcArchived{unproven: "its archive catalog says it was superseded but names no record: " + dcSliceUnits(effects[0], 60)}
		}
	}
	return &dcArchived{effect: effects[0]}
}

var (
	// `/^[_\s]*superseded_*\s+by_*\s*/i` and `/^superseded\s+by\s*/i`.
	dcSupersededLead = dcSeq(dcRun(dcSpaceOrUnderscore, 0, -1, false), dcLiteral("superseded", true), dcRun(dcIs('_'), 0, -1, false),
		dcRun(dcSpaceUnit, 1, -1, false), dcLiteral("by", true), dcRun(dcIs('_'), 0, -1, false), dcRun(dcSpaceUnit, 0, -1, false))
	dcSupersededPlain = dcSeq(dcLiteral("superseded", true), dcRun(dcSpaceUnit, 1, -1, false), dcLiteral("by", true),
		dcRun(dcSpaceUnit, 0, -1, false))
	// `/(?<![A-Za-z0-9_])ADR[-_ ]?(\d{1,4})(?![0-9A-Za-z_])/i`
	dcLooseADR = dcSeq(dcAssert(func(s []uint16, i int) bool { return i == 0 || !dcWordUnit(s[i-1]) }), dcLiteral("adr", true),
		dcRun(dcIn("-_ "), 0, 1, false), dcCapture(1, dcRun(dcDigitUnit, 1, 4, false)),
		dcAssert(func(s []uint16, i int) bool { return i == len(s) || !dcWordUnit(s[i]) }))
	// `/^0*(\d{1,4})(?![0-9A-Za-z_])/`
	dcBareRecordNumber = dcSeq(dcRun(dcIs('0'), 0, -1, false), dcCapture(1, dcRun(dcDigitUnit, 1, 4, false)),
		dcAssert(func(s []uint16, i int) bool { return i == len(s) || !dcWordUnit(s[i]) }))
)

// dcRawIndex is rawIndex: the index in raw of the character at index once raw's underscores are removed.
func dcRawIndex(raw []uint16, index int) int {
	seen := 0
	for at := 0; at < len(raw); at++ {
		if raw[at] == '_' {
			continue
		}
		if seen == index {
			return at
		}
		seen++
	}
	return len(raw)
}

// dcSupersessionTarget is supersessionTarget: the first record a `superseded by …` status names. status is the line as
// written, classified the same line with its underscores removed.
func dcSupersessionTarget(status, classified string) (string, bool) {
	rest := dcUTF16(status)
	if lead, ok := dcRxTry(dcSupersededLead, 0, rest, 0); ok {
		rest = rest[lead.end:]
	}
	plain := dcUTF16(classified)
	if lead, ok := dcRxTry(dcSupersededPlain, 0, plain, 0); ok {
		plain = plain[lead.end:]
	}
	type candidate struct {
		at int
		id string
	}
	candidates := []candidate{}
	if bare, ok := dcRxTry(dcBareRecordNumber, 1, plain, 0); ok && !dcDateShaped(dcU16String(plain)) {
		digits, _ := bare.group(1)
		candidates = append(candidates, candidate{0, dcNumberID(digits)})
	}
	if loose, ok := dcExec(dcLooseADR, 1, plain, 0); ok && !dcDateShaped(dcU16String(plain[loose.caps[2]:])) {
		digits, _ := loose.group(1)
		candidates = append(candidates, candidate{dcRawIndex(rest, loose.start), dcNumberID(digits)})
	}
	for _, ref := range dcReferencesWithProvenance(rest) {
		if !strings.HasPrefix(ref.id, "ADR-") && (ref.explicit || !dcBareDate.MatchString(ref.id)) {
			candidates = append(candidates, candidate{ref.at, ref.id})
			break
		}
	}
	if len(candidates) == 0 {
		return "", false
	}
	sort.SliceStable(candidates, func(a, b int) bool { return candidates[a].at < candidates[b].at })
	return candidates[0].id, true
}

// dcFrontmatterSupersededBy is frontmatterSupersededBy: the record a frontmatter `superseded_by:` names.
func dcFrontmatterSupersededBy(text string) (string, bool) {
	lines := dcSplitLines(text)
	head := dcFrontmatterClose(lines)
	if head < 0 {
		return "", false
	}
	for _, line := range lines[1:head] {
		found := dcSupersededByKey.FindStringSubmatch(line)
		if found == nil {
			continue
		}
		value := dcFrontmatterValue(found[1])
		if single := dcSingleItem.FindStringSubmatch(value); single != nil {
			value = dcFrontmatterValue(single[1])
		}
		if len(value) >= 3 && asciiLower(value[len(value)-3:]) == ".md" {
			value = value[:len(value)-3]
		}
		if value == "" || value == "null" || value == "~" || strings.HasPrefix(value, "[") {
			return "", false
		}
		return dcSupersessionTarget("superseded by "+value, "superseded by "+value)
	}
	return "", false
}

// dcStanding is what adrCorpus says of a recognised record's status: the catalog's effect over the file's own Status.
type dcStanding struct {
	status, kind, unproven, supersededBy string
	hasStatus, frozen, hasSupersededBy   bool
}

// dcSupersededByStatus is `/^superseded\s+by\b/i`.
func dcSupersededByStatus(status string) bool {
	if len(status) <= 10 || asciiLower(status[:10]) != "superseded" {
		return false
	}
	rs := []rune(status[10:])
	n := dcLeadingSpaces(rs)
	return n >= 1 && dcStartsWithWord(string(rs[n:]), "by")
}

// dcRecordStanding is adrCorpus's status, kind and supersededBy for a recognised record.
func dcRecordStanding(file, text string, reader *dcReader, cache map[string]*dcCatalog, listed map[string]bool, root string) dcStanding {
	archived := dcArchiveDecisionEffect(file, reader, cache, listed, root)
	standing := dcStanding{frozen: archived != nil}
	effect := ""
	if archived != nil {
		standing.unproven, effect = archived.unproven, archived.effect
	}
	retired := effect != "" && (strings.HasPrefix(asciiLower(effect), "withdrawn") || dcStartsWithWord(effect, "superseded"))
	switch {
	case standing.unproven != "":
		standing.status, standing.hasStatus = "frozen, effect UNPROVEN — "+standing.unproven, true
	case retired:
		standing.status, standing.hasStatus = effect, true
	default:
		standing.status, standing.hasStatus = dcRecordStatus(text)
	}
	standing.kind = dcStatusKind(standing.status)
	if standing.kind == "" {
		return standing
	}
	if dcSupersededByStatus(standing.status) {
		raw := standing.status
		if !retired {
			raw = dcRawStatus(text)
		}
		standing.supersededBy, standing.hasSupersededBy = dcSupersessionTarget(raw, standing.status)
	}
	if !standing.hasSupersededBy && standing.kind == "graveyard" && !retired {
		standing.supersededBy, standing.hasSupersededBy = dcFrontmatterSupersededBy(text)
	}
	return standing
}

// dcTitleHeading is `/^#\s+(.+)$/m`: its `\s+` may cross lines.
var dcTitleHeading = dcSeq(dcLineStart(true), dcLiteral("#", false), dcRun(dcSpaceUnit, 1, -1, false),
	dcCapture(1, dcRun(dcNotLineTermUnit, 1, -1, false)), dcLineEnd(true))

// dcRecordTitle is a record's title in adrCorpus: its first `# ` heading, else its basename less `.md`.
func dcRecordTitle(file, text string) string {
	if found, ok := dcExec(dcTitleHeading, 1, dcUTF16(text), 0); ok {
		title, _ := found.group(1)
		return dcJSTrim(title)
	}
	base := filepath.Base(file)
	if base != ".md" {
		base = strings.TrimSuffix(base, ".md")
	}
	return dcJSTrim(base)
}

// dcAdrNumber is adrNumber: the record's number by the identity rule, absent for a dated record or none.
func dcAdrNumber(file, text string) (int, bool) {
	title, hasTitle := dcTitleLine(text)
	id, ok := dcRecordID(filepath.Base(file), title, hasTitle)
	if !ok || !strings.HasPrefix(id, "ADR-") {
		return 0, false
	}
	n, err := strconv.Atoi(id[len("ADR-"):])
	return n, err == nil
}
