// The classifier of what a shell command would publish (plugin/scripts/publish-command.mjs, ADR-061, ADR-067, ADR-081,
// ADR-086, ADR-090, ADR-093, ADR-104): pure over the command text. Go's regexp has no lookaround and no backreference, so
// every JavaScript pattern that used one is spelled here as a scan that accepts exactly what the pattern accepted.
package hooks

import (
	"encoding/base64"
	"regexp"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

var (
	doubleQuoteUnsafe = regexp.MustCompile("[\"\\\\$`]")
)

// isASCIIWord is JavaScript's \w.
func isASCIIWord(r rune) bool { return isWordRune(r) }

// boundedWord finds `word` where the rune before is not in `before` and the rune after is not in `after`.
func boundedWord(text, word string, before, after func(rune) bool) bool {
	for from := 0; ; {
		i := strings.Index(text[from:], word)
		if i < 0 {
			return false
		}
		at := from + i
		prev, _ := utf8.DecodeLastRuneInString(text[:at])
		next, _ := utf8.DecodeRuneInString(text[at+len(word):])
		if (at == 0 || !before(prev)) && (at+len(word) == len(text) || !after(next)) {
			return true
		}
		from = at + 1
	}
}

// argAt is `argv[k] ?? ”`.
func argAt(argv []string, k int) string {
	if k < 0 || k >= len(argv) {
		return ""
	}
	return argv[k]
}

// argIs is `argv[k] === word`, false past the end.
func argIs(argv []string, k int, word string) bool { return k >= 0 && k < len(argv) && argv[k] == word }

const dataMark = "qhdata"

type ownsFunc func(step *shellCommand, n int, commands []*shellCommand, text string) bool

// withoutData is the text with what the shell never evaluates taken out, each occurrence of a spelling swapped for a marker
// only when the text read again holds the marker in exactly the slot the data came from. Each occurrence is tried on its own
// and at most one is kept per slot, so a literal repeated as data is two slots and a copy that is code stays (ADR-119 T3).
func withoutData(text string, owns ownsFunc, echoes bool) string {
	commands, complete := shellWords(text)
	if !complete {
		return text
	}
	out := text
	take := func(spelling, mark string, stands func([]*shellCommand) bool) {
		for from := 0; from <= len(out); {
			i := strings.Index(out[from:], spelling)
			if i < 0 {
				return
			}
			at := from + i
			next := out[:at] + mark + out[at+len(spelling):]
			if again, ok := shellWords(next); ok && stands(again) {
				out = next
				return
			}
			from = at + 1
		}
	}
	for n, step := range commands {
		for j, document := range step.heredocs {
			if document.quoted && document.delimiter != nil && strings.HasSuffix(document.body, "\n") && (owns == nil || owns(step, n, commands, text)) {
				n, j := n, j
				take(document.body, dataMark+"\n", func(read []*shellCommand) bool {
					return n < len(read) && j < len(read[n].heredocs) && read[n].heredocs[j].body == dataMark+"\n"
				})
			}
		}
		if !echoes || (argAt(step.argv, 0) != "echo" && argAt(step.argv, 0) != "true") {
			continue
		}
		for k := 1; k < len(step.argv); k++ {
			value := step.argv[k]
			n, k := n, k
			stands := func(read []*shellCommand) bool { return n < len(read) && argIs(read[n].argv, k, dataMark) }
			if !strings.Contains(value, "'") {
				take("'"+value+"'", dataMark, stands)
			}
			if !doubleQuoteUnsafe.MatchString(value) {
				take("\""+value+"\"", dataMark, stands)
			}
		}
	}
	return out
}

var (
	dataSinks      = map[string]bool{"cat": true, "tee": true}
	fileReaders    = map[string]bool{"cat": true, "head": true, "tail": true, "wc": true, "ls": true, "less": true, "more": true, "grep": true, "rg": true, "diff": true, "stat": true, "file": true, "echo": true, "rm": true}
	scriptRunners  = map[string]bool{"sh": true, "bash": true, "zsh": true, "dash": true, "ksh": true, "source": true, ".": true}
	wrappedShells  = map[string]bool{"sh": true, "bash": true, "zsh": true, "dash": true, "ksh": true}
	outputRedirect = regexp.MustCompile(`\d*>>?[|&]?[\t\n\v\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\v\f\r ;&|<>()]+))`)
)

func sameFile(word string) string { return strings.TrimPrefix(word, "./") }

func writtenFiles(step *shellCommand, text string) map[string]bool {
	files := map[string]bool{}
	if programName(argAt(step.argv, 0)) == "tee" {
		for _, word := range step.argv[1:] {
			if !strings.HasPrefix(word, "-") {
				files[sameFile(word)] = true
			}
		}
	}
	for _, m := range outputRedirect.FindAllStringSubmatchIndex(text, -1) {
		// `double ?? single ?? bare`: the first group that took part in the match, empty or not.
		for g := 1; g <= 3; g++ {
			if m[2*g] >= 0 {
				files[sameFile(text[m[2*g]:m[2*g+1]])] = true
				break
			}
		}
	}
	return files
}

func runsWhatItWrote(step *shellCommand, n int, commands []*shellCommand, text string) bool {
	program := programName(argAt(step.argv, 0))
	writes := program == "mrw" || step.redirects > len(step.heredocs) || (program == "tee" && len(step.argv) > 1)
	if !writes {
		return false
	}
	files := writtenFiles(step, text)
	for _, later := range commands[n+1:] {
		name := programName(argAt(later.argv, 0))
		// A command with no word can still run a substitution: an assignment or a redirect alone.
		if len(later.argv) == 0 {
			if len(later.substitutions) > 0 {
				return true
			}
			continue
		}
		// A reader is plain only with no pipe, substitution, dynamic word or code: a substitution used as a redirect target
		// keeps no word at all, so both are read.
		plain := later.pipeTo < 0 && len(later.substitutions) == 0 && len(later.dynamic) == 0
		for _, c := range later.code {
			plain = plain && !c
		}
		if fileReaders[name] {
			if !plain {
				return true
			}
			continue
		}
		if len(later.dynamic) > 0 || len(later.substitutions) > 0 || strings.Contains(later.argv[0], "/") || strings.HasSuffix(later.argv[0], ".sh") || scriptRunners[name] {
			return true
		}
		// A shell named anywhere runs its input, whatever wraps it: `env sh < r.sh`, `xargs -0 sh -c < r.sh`.
		for _, word := range later.argv {
			if wrappedShells[programName(word)] || files[sameFile(word)] {
				return true
			}
		}
	}
	return false
}

func readsItsBodyAsData(step *shellCommand, n int, commands []*shellCommand, text string) bool {
	if step.pipeTo >= 0 || len(step.substitutions) > 0 || len(step.dynamic) > 0 {
		return false
	}
	for _, c := range step.code {
		if c {
			return false
		}
	}
	program := programName(argAt(step.argv, 0))
	if !dataSinks[program] && !(program == "mrw" && argAt(step.argv, 1) == "write") {
		return false
	}
	return !runsWhatItWrote(step, n, commands, text)
}

func withoutSinkBodies(text string) string { return withoutData(text, readsItsBodyAsData, false) }

var powershellNames = map[string]bool{"pwsh": true, "powershell": true}

var keywords = map[string]bool{"if": true, "then": true, "else": true, "elif": true, "do": true, "while": true, "until": true}

var (
	interpreters     = regexp.MustCompile(`^(?:python[\d.]*|node|nodejs|deno|bun|perl)$`)
	quotedItem       = `(?:"[^"']*"|'[^"']*')`
	subprocessList   = regexp.MustCompile(`subprocess\.(?:run|call|check_call|check_output|Popen)\(\s*\[\s*((?:` + quotedItem + `\s*,?\s*)+)`)
	childProcessList = regexp.MustCompile(`\b(?:spawn|spawnSync|execFile|execFileSync)\(\s*(` + quotedItem + `\s*,\s*\[[^\]]*)`)
	perlList         = regexp.MustCompile(`\b(?:system|exec)\s*\(?\s*(` + quotedItem + `(?:\s*,\s*` + quotedItem + `)+)`)
	subprocessString = regexp.MustCompile(`(?:subprocess\.(?:run|call|check_call|check_output|Popen)|\bexec(?:Sync|File|FileSync)?|\bos\.(?:system|popen))\(\s*(?:"(.*?)"|'(.*?)')`)
	listItem         = regexp.MustCompile(`"([^"']*)"|'([^"']*)'`)
	perlQuote        = regexp.MustCompile(`^(qq?)\s*([^\w\s])`)
)

var closer = map[rune]rune{'{': '}', '(': ')', '[': ']', '<': '>'}

type literal struct {
	length  int
	close   []rune
	nest    rune // 0 for none
	escapes bool
	holes   []string
	fstring bool
	depth   int
	hole    bool // an interpolation hole: code again
}

func hasPrefixRunes(s []rune, i int, prefix []rune) bool {
	if i < 0 || i+len(prefix) > len(s) {
		return false
	}
	for k, r := range prefix {
		if s[i+k] != r {
			return false
		}
	}
	return true
}

func literalAt(script []rune, i int, language string) *literal {
	c := script[i]
	if language == "perl" && c == 'q' && (i == 0 || !(isASCIIWord(script[i-1]) || script[i-1] == '$' || script[i-1] == '@' || script[i-1] == '%')) {
		end := min(i+8, len(script))
		m := perlQuote.FindStringSubmatch(string(script[i:end]))
		if m == nil {
			return nil
		}
		opener, _ := utf8.DecodeRuneInString(m[2])
		l := &literal{length: utf8.RuneCountInString(m[0]), escapes: true}
		if cl, ok := closer[opener]; ok {
			l.close, l.nest = []rune{cl}, opener
		} else {
			l.close = []rune{opener}
		}
		if m[1] == "qq" {
			l.holes = []string{"${", "@{"}
		}
		return l
	}
	if c != '"' && c != '\'' && c != '`' {
		return nil
	}
	if language == "python" {
		start := max(0, i-2)
		prefix := ""
		for k := i - 1; k >= start && isASCIILetter(script[k]); k-- {
			prefix = string(script[k]) + prefix
		}
		prefix = strings.ToLower(prefix)
		triple := hasPrefixRunes(script, i, []rune{c, c, c})
		l := &literal{length: 1, close: []rune{c}, escapes: !strings.Contains(prefix, "r"), fstring: strings.Contains(prefix, "f")}
		if triple {
			l.length, l.close = 3, []rune{c, c, c}
		}
		if l.fstring {
			l.holes = []string{"{"}
		}
		return l
	}
	if language == "perl" {
		if c == '`' {
			return nil
		}
		l := &literal{length: 1, close: []rune{c}, escapes: true}
		if c == '"' {
			l.holes = []string{"${", "@{"}
		}
		return l
	}
	l := &literal{length: 1, close: []rune{c}, escapes: true}
	if c == '`' {
		l.holes = []string{"${"}
	}
	return l
}

type scanState struct {
	stack []*literal
	i     int
}

// insideLiteral says whether offset `at` lies inside a string literal, resuming where the last query stopped.
func insideLiteral(script []rune, at int, language string, state *scanState) bool {
	i := state.i
	for ; i < at; i++ {
		var top *literal
		if len(state.stack) > 0 {
			top = state.stack[len(state.stack)-1]
		}
		c := script[i]
		if top != nil && !top.hole {
			if c == '\\' && top.escapes {
				i++
				continue
			}
			if top.fstring && hasPrefixRunes(script, i, []rune("{{")) {
				i++
				continue
			}
			found := ""
			for _, opening := range top.holes {
				if hasPrefixRunes(script, i, []rune(opening)) {
					found = opening
					break
				}
			}
			if found != "" {
				state.stack = append(state.stack, &literal{hole: true})
				i += len([]rune(found)) - 1
				continue
			}
			if top.nest != 0 && c == top.nest {
				top.depth++
				continue
			}
			if hasPrefixRunes(script, i, top.close) {
				if top.depth > 0 {
					top.depth--
					continue
				}
				state.stack = state.stack[:len(state.stack)-1]
				i += len(top.close) - 1
			}
			continue
		}
		if top != nil && c == '{' {
			top.depth++
			continue
		}
		if top != nil && c == '}' {
			if top.depth > 0 {
				top.depth--
			} else {
				state.stack = state.stack[:len(state.stack)-1]
			}
			continue
		}
		if l := literalAt(script, i, language); l != nil {
			state.stack = append(state.stack, l)
			i += l.length - 1
		}
	}
	state.i = i
	return len(state.stack) > 0 && !state.stack[len(state.stack)-1].hole
}

const walkDepth = 5

func isGit(name string) bool { return regexp.MustCompile(`(?i)^git(?:\.cmd)?$`).MatchString(name) }

func isFlag(argv []string, k int) bool { return k < len(argv) && strings.HasPrefix(argv[k], "-") }

var (
	wrappers      = map[string]bool{"exec": true, "nohup": true, "doas": true, "command": true, "time": true, "nice": true, "sudo": true, "timeout": true, "xargs": true, "env": true}
	absolutePath  = regexp.MustCompile(`^(?:[\\/]|[A-Za-z]:[\\/])`)
	ifWord        = regexp.MustCompile(`(?i)^if$`)
	ifModifier    = regexp.MustCompile(`(?i)^(?:/i|not)$`)
	ifCondition   = regexp.MustCompile(`(?i)^(?:errorlevel|exist|defined|cmdextversion)$`)
	ifComparison  = regexp.MustCompile(`(?i)^(?:==|equ|neq|lss|leq|gtr|geq)$`)
	callWord      = regexp.MustCompile(`(?i)^call$`)
	niceValue     = regexp.MustCompile(`^-n?\d+$`)
	sudoValued    = regexp.MustCompile(`^-[ugCDprtTU]$`)
	timeoutValued = regexp.MustCompile(`^-[ks]$`)
	xargsValued   = regexp.MustCompile(`^-[nLPsdIEJR]$`)
	envValued     = regexp.MustCompile(`^-[uC]$`)
	envAssignment = regexp.MustCompile(`^[A-Za-z_]\w*=`)
)

func wrapperWord(word string) string {
	if absolutePath.MatchString(word) && wrappers[programName(word)] {
		return programName(word)
	}
	return word
}

// programIndex is where a command's program starts, past keywords and wrappers; text is set when a wrapper runs a STRING.
func programIndex(argv []string) (int, *string) {
	k := 0
	for k < len(argv) {
		word := wrapperWord(argv[k])
		switch {
		case ifWord.MatchString(word):
			k++
			for ifModifier.MatchString(argAt(argv, k)) {
				k++
			}
			if ifCondition.MatchString(argAt(argv, k)) {
				k += 2
			} else if strings.Contains(argAt(argv, k), "==") && !strings.HasPrefix(argAt(argv, k), "-") {
				k++
			} else if ifComparison.MatchString(argAt(argv, k+1)) {
				k += 3
			}
		case keywords[word] || word == "exec" || word == "nohup" || word == "doas" || callWord.MatchString(word):
			k++
		case word == "command" || word == "time":
			if argIs(argv, k+1, "-p") {
				k += 2
			} else {
				k++
			}
		case word == "nice":
			if argIs(argv, k+1, "-n") {
				k += 3
			} else if niceValue.MatchString(argAt(argv, k+1)) {
				k += 2
			} else {
				k++
			}
		case word == "sudo":
			k++
			for isFlag(argv, k) {
				if sudoValued.MatchString(argv[k]) {
					k += 2
				} else {
					k++
				}
			}
		case word == "timeout":
			k++
			for isFlag(argv, k) {
				if timeoutValued.MatchString(argv[k]) {
					k += 2
				} else {
					k++
				}
			}
			k++
		case word == "xargs":
			k++
			for isFlag(argv, k) {
				if xargsValued.MatchString(argv[k]) {
					k += 2
				} else {
					k++
				}
			}
		case word == "env":
			k++
			for k < len(argv) {
				if argv[k] == "-S" || argv[k] == "--split-string" {
					text := argAt(argv, k+1)
					return k, &text
				}
				if envValued.MatchString(argv[k]) {
					k += 2
				} else if isFlag(argv, k) || envAssignment.MatchString(argv[k]) {
					k++
				} else {
					break
				}
			}
		case k > 0 && envAssignment.MatchString(word):
			k++
		default:
			return k, nil
		}
	}
	return k, nil
}

var gitValued = map[string]bool{"-C": true, "-c": true, "--git-dir": true, "--work-tree": true, "--namespace": true, "--config-env": true, "--attr-source": true}
var gitExits = map[string]bool{"--exec-path": true, "--html-path": true, "--man-path": true, "--info-path": true, "--version": true, "-v": true, "--help": true, "-h": true}

func gitVerbIndex(argv []string, at int) int {
	k := at + 1
	for k < len(argv) && strings.HasPrefix(argv[k], "-") {
		if gitExits[argv[k]] {
			return len(argv)
		}
		if gitValued[argv[k]] {
			k += 2
		} else {
			k++
		}
	}
	return k
}

var verbValued = map[string]*regexp.Regexp{
	"commit": regexp.MustCompile(`^(?:-[A-Za-z]*[mFCctU]|--(?:no-)?(?:file|author|date|message|reedit-message|reuse-message|squash|fixup|trailer|template|cleanup|unified|inter-hunk-context|pathspec-from-file))$`),
	"push":   regexp.MustCompile(`^(?:-o|--(?:no-)?(?:repo|receive-pack|exec|push-option|recurse-submodules))$`),
}

func dryRun(verb string, rest []string) bool {
	dry := false
	for k := 0; k < len(rest); k++ {
		word := rest[k]
		if word == "--" {
			break
		}
		if verbValued[verb].MatchString(word) {
			k++
		} else if word == "--dry-run" || (verb == "push" && word == "-n") {
			dry = true
		} else if word == "--no-dry-run" {
			dry = false
		}
	}
	return dry
}

var aliasValue = regexp.MustCompile(`(?is)^alias\.([^=]+)=(.*)$`)
var shortC = regexp.MustCompile(`^-c.`)

func gitAliases(argv []string, at, k int) map[string]string {
	aliases := map[string]string{}
	for i := at + 1; i < k; i++ {
		var value string
		has := false
		if argIs(argv, i, "-c") {
			if i+1 < len(argv) {
				value, has = argv[i+1], true
			}
		} else if shortC.MatchString(argAt(argv, i)) {
			value, has = argv[i][2:], true
		}
		if !has {
			continue
		}
		if m := aliasValue.FindStringSubmatch(value); m != nil {
			aliases[strings.ToLower(m[1])] = m[2]
		}
	}
	return aliases
}

var gitCommands = func() map[string]bool {
	out := map[string]bool{}
	for _, name := range strings.Fields(`
  add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore
  check-mailmap check-ref-format checkout checkout--worker checkout-index cherry cherry-pick clean clone column
  commit commit-graph commit-tree config count-objects credential credential-cache credential-cache--daemon
  credential-store describe diagnose diff diff-files diff-index diff-pairs diff-tree difftool fast-export
  fast-import fetch fetch-pack fmt-merge-msg for-each-ref for-each-repo format-patch format-rev fsck
  fsck-objects fsmonitor--daemon gc get-tar-commit-id grep hash-object help history hook index-pack init
  init-db interpret-trailers last-modified log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge
  merge-base merge-file merge-index merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs
  merge-subtree merge-tree mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant
  pack-refs patch-id pickaxe prune prune-packed pull push range-diff read-tree rebase receive-pack reflog refs
  remote remote-ext remote-fd repack replace replay repo rerere reset restore rev-list rev-parse revert rm
  send-pack shortlog show show-branch show-index show-ref sparse-checkout stage stash status stripspace
  submodule--helper switch symbolic-ref tag unpack-file unpack-objects update-index update-ref
  update-server-info upload-archive upload-archive--writer upload-pack url-parse var verify-commit verify-pack
  verify-tag version whatchanged worktree write-tree`) {
		out[name] = true
	}
	return out
}()

// gitSplit splits an alias value as git's split_cmdline does.
func gitSplit(value string) []string {
	rs := []rune(value)
	if len(rs) > 0 && isJSSpace(rs[0]) {
		return []string{""}
	}
	words := []string{}
	var word *strings.Builder
	var quote rune
	for i := 0; i < len(rs); i++ {
		c := rs[i]
		switch {
		case quote != 0:
			if c == quote {
				quote = 0
			} else if c == '\\' && quote == '"' && i+1 < len(rs) {
				i++
				word.WriteRune(rs[i])
			} else {
				word.WriteRune(c)
			}
		case isJSSpace(c):
			if word != nil {
				words = append(words, word.String())
			}
			word = nil
		default:
			if word == nil {
				word = &strings.Builder{}
			}
			if c == '"' || c == '\'' {
				quote = c
			} else if c == '\\' && i+1 < len(rs) {
				i++
				word.WriteRune(rs[i])
			} else {
				word.WriteRune(c)
			}
		}
	}
	if quote != 0 {
		return []string{""}
	}
	if word != nil {
		words = append(words, word.String())
	}
	return words
}

func aliasFor(argv []string, at, k int) (string, bool) {
	name := argAt(argv, k)
	if gitCommands[name] {
		return "", false
	}
	v, ok := gitAliases(argv, at, k)[strings.ToLower(name)]
	return v, ok
}

func shellQuote(word string) string { return "'" + strings.ReplaceAll(word, "'", `'\''`) + "'" }

func containsInt(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func gitInvocation(argv []string, at int, dynamic []int) (string, bool) {
	k := gitVerbIndex(argv, at)
	alias, hasAlias := aliasFor(argv, at, k)
	var verb string
	var rest []string
	if hasAlias && !strings.HasPrefix(alias, "!") {
		expanded := gitSplit(alias)
		verb = argAt(expanded, 0)
		rest = append(append([]string{}, expanded[min(1, len(expanded)):]...), argv[min(k+1, len(argv)):]...)
	} else {
		verb = argAt(argv, k)
		rest = argv[min(k+1, len(argv)):]
	}
	if (verb != "commit" && verb != "push") || containsInt(dynamic, k) {
		return "", false
	}
	if argIs(rest, 0, "--help") || argIs(rest, 0, "-h") {
		return "", false
	}
	if dryRun(verb, rest) {
		return "", false
	}
	return strings.Join(argv[at:min(k+1, len(argv))], " "), true
}

var foreachOption = regexp.MustCompile(`^(?:--recursive|-q|--quiet)$`)

func gitRunsCommands(argv []string, at int) []string {
	k := gitVerbIndex(argv, at)
	rest := argv[min(k+1, len(argv)):]
	if alias, ok := aliasFor(argv, at, k); ok && strings.HasPrefix(alias, "!") {
		quoted := make([]string, len(rest))
		for i, w := range rest {
			quoted[i] = shellQuote(w)
		}
		return []string{jsTrim(alias[1:] + " " + strings.Join(quoted, " "))}
	}
	switch argAt(argv, k) {
	case "submodule":
		each := -1
		for i, w := range rest {
			if w == "foreach" {
				each = i
				break
			}
		}
		if each < 0 {
			return nil
		}
		c := each + 1
		for c < len(rest) && foreachOption.MatchString(rest[c]) {
			c++
		}
		if c < len(rest) {
			return []string{strings.Join(rest[c:], " ")}
		}
		return nil
	case "rebase":
		out := []string{}
		for i, word := range rest {
			if (word == "--exec" || word == "-x") && i+1 < len(rest) {
				out = append(out, rest[i+1])
			} else if strings.HasPrefix(word, "--exec=") {
				out = append(out, word[len("--exec="):])
			}
		}
		return out
	case "bisect":
		if argIs(rest, 0, "run") && len(rest) > 1 {
			return []string{strings.Join(rest[1:], " ")}
		}
	}
	return nil
}

var xargsModelled = regexp.MustCompile(`^(?:-I.*|-i|--replace(?:=.*)?|-r|--no-run-if-empty|-t|--verbose)$`)
var anySpace = regexp.MustCompile(`[\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+`)

// xargsWords is what xargs makes of its stdin (publish-command.mjs's): blanks and newlines separate words; a quote groups what
// follows up to its mate (a newline or the end of the input inside one is an unterminated quote: xargs runs nothing, so false); a
// backslash outside quotes takes the next character literally, a trailing one the newline the input ends with.
func xargsWords(input string) ([]string, bool) {
	words := []string{}
	word := []rune{}
	started := false
	var quote rune
	runes := []rune(input)
	for k := 0; k < len(runes); k++ {
		ch := runes[k]
		switch {
		case quote != 0:
			if ch == quote {
				quote = 0
			} else if ch == '\n' {
				return nil, false
			} else {
				word = append(word, ch)
			}
		case ch == '\'' || ch == '"':
			quote, started = ch, true
		case ch == '\\':
			started = true
			k++
			if k < len(runes) {
				word = append(word, runes[k])
			} else {
				word = append(word, '\n')
			}
		case anySpace.MatchString(string(ch)):
			if started {
				words = append(words, string(word))
			}
			word, started = word[:0], false
		default:
			word, started = append(word, ch), true
		}
	}
	if quote != 0 {
		return nil, false
	}
	if started {
		words = append(words, string(word))
	}
	return words, true
}

func xargsInvocations(commands []*shellCommand, n, start int, tree *shellNode) [][]string {
	argv := commands[n].argv
	x := -1
	for k, word := range argv {
		if k < start && programName(word) == "xargs" {
			x = k
			break
		}
	}
	if x < 0 {
		return nil
	}
	replace := ""
	hasReplace := false
	for k := x + 1; k < start; k++ {
		if !xargsModelled.MatchString(argv[k]) {
			if argIs(argv, k-1, "-I") || argIs(argv, k-1, "--replace") {
				continue
			}
			return nil
		}
		switch {
		case argv[k] == "-I" || argv[k] == "--replace":
			if k+1 < len(argv) {
				replace, hasReplace = argv[k+1], true
			} else {
				replace, hasReplace = "", false
			}
		case strings.HasPrefix(argv[k], "--replace="):
			replace, hasReplace = argv[k][len("--replace="):], true
		case strings.HasPrefix(argv[k], "-I") && len(argv[k]) > 2:
			replace, hasReplace = argv[k][2:], true
		case argv[k] == "-i":
			replace, hasReplace = "{}", true
		}
	}
	texts := []string{}
	for _, doc := range commands[n].heredocs {
		texts = append(texts, doc.body)
	}
	// ADR-120 T2 (publish-command.mjs's): a group that renders (every command a supported printer or a silent builtin, joined by `;`,
	// `&&` or `||` over known statuses) feeds xargs the bytes it prints, in order, not its last command's. One that does not gives it
	// nothing: the words the xargs line names itself are read, and the rest is could-not-look.
	fed := groupFeeding(commands, n, tree)
	if fed.read {
		texts = append(texts, fed.bytes)
	}
	loose := false
	for _, m := range feederIndexes(commands, n, fed) {
		upstream := commands[m]
		from, text := programIndex(upstream.argv)
		if text != nil || upstream.isDynamic(from) || programName(argAt(upstream.argv, from)) != "echo" {
			return nil
		}
		// An option or a backslash is where the shells differ: the text is read as written, and where xargs cannot split it the
		// whitespace reading stands (`echo 'push \c"' | xargs git` runs `git push` under dash).
		if _, ok := echoBytes(upstream.argv[min(from+1, len(upstream.argv)):]); !ok {
			loose = true
		}
		texts = append(texts, literalOutput(upstream.argv, from)...)
	}
	input := strings.Join(texts, "\n")
	tail := argv[min(start, len(argv)):]
	if hasReplace && replace != "" {
		out := [][]string{}
		for _, line := range strings.Split(input, "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			built := make([]string, len(tail))
			for i, word := range tail {
				built[i] = strings.ReplaceAll(word, replace, jsTrim(line))
			}
			out = append(out, built)
		}
		return out
	}
	words, ok := xargsWords(input)
	if !ok && loose {
		words, ok = strings.Fields(input), true
	}
	if !ok {
		return nil
	}
	return [][]string{append(append([]string{}, tail...), words...)}
}

var nonExecutors = map[string]bool{"echo": true, "printf": true}

var (
	shellValued      = regexp.MustCompile(`^(?:[+-]o|[+-]O|--rcfile|--init-file)$`)
	powershellValued = regexp.MustCompile(`^-[A-Z]\w+$`)
	lettersMinus     = regexp.MustCompile(`^-[A-Za-z]+$`)
	lettersPlus      = regexp.MustCompile(`^\+[A-Za-z]+$`)
	powershellC      = regexp.MustCompile(`(?i)^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$`)
	posixC           = regexp.MustCompile(`^-[A-Za-z]*c[A-Za-z]*$`)
	shellOptionWord  = regexp.MustCompile(`^[+-]{1,2}[A-Za-z][\w-]*(?:=.*)?$`)
	signLead         = regexp.MustCompile(`^[+-]`)
)

func shellRuns(words []string) bool {
	if powershellNames[strings.ToLower(programName(words[0]))] {
		return true
	}
	runs := true
	for i := 1; i < len(words); i++ {
		word := words[i]
		switch {
		case shellValued.MatchString(word):
			if strings.HasSuffix(word, "o") && argIs(words, i+1, "noexec") {
				runs = strings.HasPrefix(word, "+")
			}
			i++
		case word == "--help" || word == "--version":
			return false
		case lettersMinus.MatchString(word) && strings.Contains(word, "n"):
			runs = false
		case lettersPlus.MatchString(word) && strings.Contains(word, "n"):
			runs = true
		}
	}
	return runs
}

func abbreviates(word, full string, shortest int) bool {
	return lettersMinus.MatchString(word) && len(word)-1 >= shortest && strings.HasPrefix(full, strings.ToLower(word[1:]))
}

func powershellEncoded(word string) bool {
	return strings.ToLower(word) == "-ec" || abbreviates(word, "encodedcommand", 1)
}

type shellStringResult struct {
	flag    int // -1 when it reads stdin
	encoded bool
	stdin   int
}

func shellString(argv []string, at int) *shellStringResult {
	power := powershellNames[strings.ToLower(programName(argv[at]))]
	k := at + 1
	for k < len(argv) {
		word := argv[k]
		if power && powershellEncoded(word) {
			return &shellStringResult{flag: k, encoded: true}
		}
		if (power && powershellC.MatchString(word)) || (!power && posixC.MatchString(word)) {
			return &shellStringResult{flag: k}
		}
		if word == "-" || word == "-s" {
			k++
			continue
		}
		if !shellOptionWord.MatchString(word) {
			return nil
		}
		if k+1 < len(argv) && !strings.Contains(word, "=") && !signLead.MatchString(argv[k+1]) && (shellValued.MatchString(word) || (power && powershellValued.MatchString(word))) {
			k += 2
		} else {
			k++
		}
	}
	return &shellStringResult{flag: -1, stdin: k}
}

// decodedPowerShell is Buffer.from(value, 'base64').toString('utf16le'): a lenient decode of either base64 alphabet, the bytes
// read as UTF-16LE code units.
func decodedPowerShell(value string) string {
	var clean strings.Builder
	for _, r := range value {
		switch {
		case r == '=':
			goto done
		case r == '-':
			clean.WriteByte('+')
		case r == '_':
			clean.WriteByte('/')
		case (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '+' || r == '/':
			clean.WriteRune(r)
		}
	}
done:
	s := clean.String()
	if len(s)%4 == 1 {
		s = s[:len(s)-1]
	}
	raw, err := base64.RawStdEncoding.DecodeString(s)
	if err != nil {
		return ""
	}
	units := make([]uint16, len(raw)/2)
	for i := range units {
		units[i] = uint16(raw[2*i]) | uint16(raw[2*i+1])<<8
	}
	return string(utf16.Decode(units))
}

var (
	startSwitches  = regexp.MustCompile(`(?i)^-(?:wait|nonewwindow|passthru|usenewenvironment|loaduserprofile|lup|whatif|confirm)$`)
	slashD         = regexp.MustCompile(`(?i)^/d$`)
	slashWord      = regexp.MustCompile(`^/\w+$`)
	psPath         = regexp.MustCompile(`(?i)^-(?:ps)?path$`)
	psArgs         = regexp.MustCompile(`(?i)^-args$`)
	dashLetter     = regexp.MustCompile(`^-[A-Za-z]`)
	listSeparators = regexp.MustCompile(`[\t\n\v\f\r ,\x{a0}\x{2028}\x{2029}\x{feff}]+`)
)

func startedCommand(command *shellCommand, start int) string {
	argv, quoted := command.argv, command.quoted
	var file, list *string
	bare := []string{}
	for k := start + 1; k < len(argv); k++ {
		word := argv[k]
		switch {
		case slashD.MatchString(word):
			k++
		case slashWord.MatchString(word):
		case abbreviates(word, "filepath", 1) || psPath.MatchString(word):
			k++
			v := argAt(argv, k)
			file = &v
		case abbreviates(word, "argumentlist", 1) || psArgs.MatchString(word):
			k++
			v := argAt(argv, k)
			list = &v
		case startSwitches.MatchString(word):
		case dashLetter.MatchString(word) && file != nil:
			k++
		case file == nil && len(bare) == 0 && (quoted[k] || word == "") && k+1 < len(argv) && !strings.HasPrefix(argv[k+1], "-"):
		default:
			bare = append(bare, word)
		}
	}
	if file == nil && len(bare) > 0 {
		f := bare[0]
		bare = bare[1:]
		file = &f
	}
	if list == nil && len(bare) > 0 {
		l := strings.Join(bare, " ")
		list = &l
	}
	if file == nil {
		return ""
	}
	words := []string{*file}
	if list != nil {
		for _, w := range listSeparators.Split(*list, -1) {
			if w != "" {
				words = append(words, w)
			}
		}
	}
	return strings.Join(words, " ")
}

var passThrough = map[string]bool{"cat": true, "tee": true}
var echoOptions = regexp.MustCompile(`^-[neE]+$`)

func literalOutput(argv []string, start int) []string {
	name := programName(argAt(argv, start))
	words := argv[min(start+1, len(argv)):]
	if name == "echo" {
		k := 0
		for k < len(words) && echoOptions.MatchString(words[k]) {
			k++
		}
		return []string{strings.Join(words[k:], " ")}
	}
	if name == "printf" {
		return append(append([]string{}, words...), strings.Join(words, " "))
	}
	return nil
}

// ADR-120 T2 (publish-command.mjs's): what a group or subshell of several commands writes to its stdout, read from the tree. Only a
// supported printer (`echo`, `printf`) contributes bytes and `:`, `true` and `false` contribute none; `;`, `&&` and `||` are
// evaluated left to right over statuses known from those. Anything else in the group makes it unreadable, which is could-not-look
// and never the empty string.

// stdoutStays reports whether a printer's stdout still reaches the pipe, and false for the second result when its redirections
// are not the one `2>&1` or the one `>&2` / `>file` read here.
func stdoutStays(redirections []shellRedirection) (bool, bool) {
	if len(redirections) == 0 {
		return true, true
	}
	if len(redirections) > 1 || redirections[0].dynamic {
		return false, false
	}
	r := redirections[0]
	if r.fd == "2" && r.op == ">&" && r.target == "1" {
		return true, true
	}
	if r.fd != "" && r.fd != "1" {
		return false, false
	}
	if (r.op == ">&" && r.target == "2") || r.op == ">" || r.op == ">>" || r.op == ">|" {
		return false, true
	}
	return false, false
}

// echoBytes is the bytes `echo` writes: its words joined by a space and a newline, unless one is an option or holds a backslash.
func echoBytes(words []string) (string, bool) {
	for _, word := range words {
		if echoOptions.MatchString(word) || strings.Contains(word, `\`) {
			return "", false
		}
	}
	return strings.Join(words, " ") + "\n", true
}

// printfBytes is the bytes `printf` writes for a literal format whose only conversion is `%s` and whose only escapes are `\n`
// and `\t`: the format over its arguments, repeated while arguments remain, a missing one empty; no conversion, written once.
func printfBytes(words []string) (string, bool) {
	if len(words) == 0 || strings.HasPrefix(words[0], "-") {
		return "", false
	}
	args := words[1:]
	pieces := []*string{} // nil is a conversion
	format := []rune(words[0])
	for k := 0; k < len(format); k++ {
		switch format[k] {
		case '%':
			k++
			if k >= len(format) || format[k] != 's' {
				return "", false
			}
			pieces = append(pieces, nil)
		case '\\':
			k++
			escaped := ""
			switch {
			case k < len(format) && format[k] == 'n':
				escaped = "\n"
			case k < len(format) && format[k] == 't':
				escaped = "\t"
			default:
				return "", false
			}
			pieces = append(pieces, &escaped)
		default:
			piece := string(format[k])
			pieces = append(pieces, &piece)
		}
	}
	per := 0
	for _, piece := range pieces {
		if piece == nil {
			per++
		}
	}
	rounds := 1
	if per > 0 && len(args) > 0 {
		rounds = (len(args) + per - 1) / per
	}
	var out strings.Builder
	next := 0
	for round := 0; round < rounds; round++ {
		for _, piece := range pieces {
			if piece != nil {
				out.WriteString(*piece)
				continue
			}
			if next < len(args) {
				out.WriteString(args[next])
			}
			next++
		}
	}
	return out.String(), true
}

// definitionsBefore are the names the text defines EARLIER, in a shell the group runs in: each is that function and not the builtin,
// so what it writes is not known. A definition after the pipeline, inside a subshell or in an earlier pipeline stage runs in another
// shell, or later (publish-command.mjs's definitionsBefore, measured on /bin/sh and /bin/dash).
func containsNode(node, target *shellNode) bool {
	if node == target {
		return true
	}
	for _, kid := range node.Kids {
		if containsNode(kid, target) {
			return true
		}
	}
	return false
}

func collectDefinitions(node *shellNode, names map[string]bool) {
	switch node.T {
	case "def":
		names[node.Name] = true
	case "pipe":
		if len(node.Kids) == 1 {
			collectDefinitions(node.Kids[0], names)
		}
	case "cmd", "sub":
	default:
		for _, kid := range node.Kids {
			collectDefinitions(kid, names)
		}
	}
}

func definitionsBefore(tree, target *shellNode) map[string]bool {
	names := map[string]bool{}
	node := tree
	for node != target && node.T != "cmd" && node.T != "def" {
		var next *shellNode
		for _, kid := range node.Kids {
			if containsNode(kid, target) {
				next = kid
				break
			}
			if node.T != "pipe" {
				collectDefinitions(kid, names)
			}
		}
		if next == nil {
			break
		}
		node = next
	}
	return names
}

func printerBytes(c *shellCommand, defined map[string]bool) (string, bool) {
	if len(c.dynamic) > 0 || len(c.substitutions) > 0 || len(c.argv) == 0 || defined[c.argv[0]] {
		return "", false
	}
	stays, ok := stdoutStays(c.redirections)
	if !ok {
		return "", false
	}
	bytes := ""
	switch c.argv[0] {
	case "echo":
		bytes, ok = echoBytes(c.argv[1:])
	case "printf":
		bytes, ok = printfBytes(c.argv[1:])
	default:
		ok = false
	}
	if !ok {
		return "", false
	}
	if !stays {
		return "", true
	}
	return bytes, true
}

// silentStatus are the builtins that write nothing and have a status; with an argument, a redirection or a word the shell expands
// they are not read.
var silentStatus = map[string]int{":": 0, "true": 0, "false": 1}

// stageOut is what one stage, an and-or list or a list gave: the bytes it wrote to stdout and its status. failed says whether a
// non-zero status of this stage is a failure errexit acts on (a command's, a subshell's, but not a group's, which ends non-zero
// when a command in it failed under an operator: `{ false && true; }` does not exit); exited is a group that ended the shell, a
// subshell ends only itself.
type stageOut struct {
	bytes  string
	status int
	failed bool
	exited bool
}

// setLetters and setNames are the options of `set` this reads (publish-command.mjs's SET_LETTERS and SET_NAMES); any other is not
// known, and a set carrying one is not read.
const setLetters = "abCefmuvx"

var setNames = map[string]bool{"errexit": true, "pipefail": true, "nounset": true, "noclobber": true, "xtrace": true, "verbose": true,
	"allexport": true, "noglob": true}

// errexitEvents are the errexit states each `-e`, `+e`, `-o errexit` and `+o errexit` of a `set` leaves, left to right, or false.
func errexitEvents(args []string) ([]bool, bool) {
	events := []bool{}
	for i := 0; i < len(args); i++ {
		word := args[i]
		if word == "--" || word == "" || (word[0] != '-' && word[0] != '+') {
			break
		}
		if len(word) == 1 {
			return nil, false
		}
		on := word[0] == '-'
		for at := 1; at < len(word); at++ {
			letter := word[at]
			switch {
			case letter == 'o':
				i++
				if at != len(word)-1 || i >= len(args) || !setNames[args[i]] {
					return nil, false
				}
				if args[i] == "errexit" {
					events = append(events, on)
				}
			case !strings.ContainsRune(setLetters, rune(letter)):
				return nil, false
			case letter == 'e':
				events = append(events, on)
			}
		}
	}
	return events, true
}

// errexit states: what an earlier statement leaves, or what a group runs under.
const (
	errexitOff = iota
	errexitOn
	errexitUnknown
)

// mayChangeUnseen are the commands that may change errexit where this does not read what they run (publish-command.mjs's
// MAY_SET_UNSEEN).
var mayChangeUnseen = map[string]bool{"eval": true, ".": true, "source": true, "command": true, "builtin": true}

// collectSets appends the errexit states the commands of this node leave in its own shell, in order: a `set` this does not read, one
// of mayChangeUnseen, a call to a function defined earlier and a command word the shell expands leave it unknown.
func collectSets(node *shellNode, commands []*shellCommand, defined map[string]bool, events *[]int) {
	switch node.T {
	case "cmd":
		c := commands[node.I]
		if len(c.argv) == 0 {
			return
		}
		if c.argv[0] == "set" {
			found, ok := []bool(nil), false
			if len(c.dynamic) == 0 && len(c.substitutions) == 0 && len(c.redirections) == 0 {
				found, ok = errexitEvents(c.argv[1:])
			}
			if !ok {
				*events = append(*events, errexitUnknown)
				return
			}
			for _, on := range found {
				if on {
					*events = append(*events, errexitOn)
				} else {
					*events = append(*events, errexitOff)
				}
			}
			return
		}
		dynamicName := false
		for _, at := range c.dynamic {
			dynamicName = dynamicName || at == 0
		}
		if mayChangeUnseen[c.argv[0]] || defined[c.argv[0]] || dynamicName {
			*events = append(*events, errexitUnknown)
		}
		return
	case "def", "sub":
		return
	case "pipe":
		if len(node.Kids) == 1 {
			collectSets(node.Kids[0], commands, defined, events)
		}
		return
	}
	for k, kid := range node.Kids {
		inner := []int{}
		collectSets(kid, commands, defined, &inner)
		if len(inner) == 0 {
			continue
		}
		runs := true
		switch node.T {
		case "list":
			runs = node.Ops[k] == ";"
		case "andor":
			runs = len(node.Kids) == 1
		}
		if runs {
			*events = append(*events, inner...)
		} else {
			*events = append(*events, errexitUnknown)
		}
	}
}

// errexitAt is whether an earlier statement ended the shell before target runs, and whether errexit is in effect where it runs (the
// Codex review of 7a9107e8..dcc4693a; publish-command.mjs's errexitAt carries the measurements). A group that is a pipeline stage
// runs in a subshell that inherits `set -e` from the shell around it; a set in an earlier pipeline stage, a subshell or a pipeline of
// several stages leaves this shell alone; the state is off inside a pipeline the shell ignores errexit for (left of `&&` or `||`,
// negated). Under errexit known on, an earlier statement whose status is known non-zero where errexit acts ends the shell.
func errexitAt(tree, target *shellNode, commands []*shellCommand, defined map[string]bool) (ended bool, on int) {
	state := errexitOff
	ignored := false
	node := tree
	for node != target && node.T != "cmd" && node.T != "def" {
		var next *shellNode
		if node.T == "pipe" {
			if node.Bang != 0 {
				ignored = true
			}
			for _, kid := range node.Kids {
				if containsNode(kid, target) {
					next = kid
					break
				}
			}
		} else {
			for k, kid := range node.Kids {
				if containsNode(kid, target) {
					if node.T == "andor" && k < len(node.Kids)-1 {
						ignored = true
					}
					next = kid
					break
				}
				inner := []int{}
				collectSets(kid, commands, defined, &inner)
				runs := node.T == "list" && node.Ops[k] == ";"
				if len(inner) > 0 {
					if runs {
						for _, event := range inner {
							state = event
						}
					} else {
						state = errexitUnknown
					}
				} else if runs && state == errexitOn && !ignored && !ended {
					if result, ok := andorResult(kid, commands, defined, true); ok && result.exited {
						ended = true
					}
				}
			}
		}
		if next == nil {
			break
		}
		node = next
	}
	if ignored {
		return ended, errexitOff
	}
	return ended, state
}

// listUnderErrexit is what a group writes under errexit on; with it unknown, what it writes either way, or false when the two differ.
func listUnderErrexit(list *shellNode, commands []*shellCommand, defined map[string]bool, on int) (stageOut, bool) {
	if on != errexitUnknown {
		return listResult(list, commands, defined, on == errexitOn)
	}
	yes, okYes := listResult(list, commands, defined, true)
	no, okNo := listResult(list, commands, defined, false)
	if okYes && okNo && yes.bytes == no.bytes {
		return yes, true
	}
	return stageOut{}, false
}

// stageResult is the bytes and status of one stage, or false.
func stageResult(stage *shellNode, commands []*shellCommand, defined map[string]bool, errexit bool) (stageOut, bool) {
	switch stage.T {
	case "group", "sub":
		result, ok := listResult(stage.Kids[0], commands, defined, errexit)
		if !ok {
			return stageOut{}, false
		}
		if stage.T == "group" {
			result.failed = false
		} else {
			result.failed, result.exited = true, false
		}
		return result, true
	case "cmd":
	default:
		return stageOut{}, false
	}
	c := commands[stage.I]
	if bytes, ok := printerBytes(c, defined); ok {
		return stageOut{bytes: bytes, failed: true}, true
	}
	if len(c.argv) != 1 || len(c.dynamic) > 0 || len(c.substitutions) > 0 || len(c.redirections) > 0 || defined[c.argv[0]] {
		return stageOut{}, false
	}
	status, ok := silentStatus[c.argv[0]]
	return stageOut{status: status, failed: true}, ok
}

// andorResult runs an and-or list left to right: `&&` runs the next pipeline after status 0 and `||` after any other, and a skipped
// one leaves the status as it was. Every pipeline must be read, run or not. Under errexit the shell exits when the last pipeline of
// the list ran and failed; a failure of any other is ignored, and so is every command inside it.
func andorResult(andor *shellNode, commands []*shellCommand, defined map[string]bool, errexit bool) (stageOut, bool) {
	out := stageOut{}
	ranLast := false
	last := len(andor.Kids) - 1
	for k, pipe := range andor.Kids {
		if pipe.Bang != 0 || len(pipe.Kids) != 1 {
			return stageOut{}, false
		}
		result, ok := stageResult(pipe.Kids[0], commands, defined, errexit && k == last)
		if !ok {
			return stageOut{}, false
		}
		if k == 0 || (andor.Ops[k-1] == "&&") == (out.status == 0) {
			out.bytes += result.bytes
			out.status = result.status
			out.failed = result.failed
			ranLast = k == last
			if result.exited {
				out.exited = true
				return out, true
			}
		}
	}
	out.exited = errexit && ranLast && out.failed && out.status != 0
	return out, true
}

func listResult(list *shellNode, commands []*shellCommand, defined map[string]bool, errexit bool) (stageOut, bool) {
	out := stageOut{}
	for k, andor := range list.Kids {
		if list.Ops[k] != ";" {
			return stageOut{}, false
		}
		result, ok := andorResult(andor, commands, defined, errexit)
		if !ok {
			return stageOut{}, false
		}
		out.bytes += result.bytes
		out.status = result.status
		if result.exited {
			out.exited = true
			return out, true
		}
	}
	return out, true
}

// feederOf is the stage that feeds command n in the pipeline holding it, or nil.
func feederOf(node *shellNode, n int) *shellNode {
	if node.T == "pipe" {
		for at, kid := range node.Kids {
			if at > 0 && kid.T == "cmd" && kid.I == n {
				return node.Kids[at-1]
			}
		}
	}
	for _, kid := range node.Kids {
		if found := feederOf(kid, n); found != nil {
			return found
		}
	}
	return nil
}

func lastCommand(node *shellNode) int {
	for node.T != "cmd" {
		node = node.Kids[len(node.Kids)-1]
	}
	return node.I
}

// groupFed is what feeds a shell or xargs from a group or subshell: a group that renders has its exact bytes (read) and tail, the
// index of its last command, which the flat upstream scan must not read alone (-1 for none); one that does not and holds several
// commands has its tail only (nothing is proven from it); m is the command a single-pipeline group resolves to (-1 for none).
type groupFed struct {
	m, tail int
	bytes   string
	read    bool
}

func groupFeeding(commands []*shellCommand, n int, tree *shellNode) groupFed {
	none := groupFed{m: -1, tail: -1}
	if tree == nil {
		return none
	}
	stage := feederOf(tree, n)
	if stage == nil || (stage.T != "group" && stage.T != "sub") {
		return none
	}
	tail := lastCommand(stage)
	// `|&` also pipes the group's stderr, which this does not read.
	defined := definitionsBefore(tree, stage)
	closes := commands[tail].closes
	ended, on := errexitAt(tree, stage, commands, defined)
	if ended {
		return groupFed{m: -1, tail: tail, bytes: "", read: true}
	}
	if len(closes) == 0 || closes[len(closes)-1].joiner != "|&" {
		if rendered, ok := listUnderErrexit(stage.Kids[0], commands, defined, on); ok {
			return groupFed{m: -1, tail: tail, bytes: rendered.bytes, read: true}
		}
	}
	// A function defined earlier may stand for any command in the group, so the flat reading of its last pipeline proves nothing.
	if len(defined) > 0 {
		return groupFed{m: -1, tail: tail}
	}
	resolved := stage
	for resolved.T == "group" || resolved.T == "sub" {
		body := resolved.Kids[0]
		if len(body.Kids) != 1 || len(body.Kids[0].Kids) != 1 {
			break
		}
		stages := body.Kids[0].Kids[0].Kids
		resolved = stages[len(stages)-1]
	}
	if resolved.T == "cmd" {
		none.m = resolved.I
		return none
	}
	if resolved.T != "group" && resolved.T != "sub" {
		return none
	}
	return groupFed{m: -1, tail: tail}
}

// feederIndexes are the commands whose own output feeds n: those piped to it, and the one a single-pipeline group resolves to.
func feederIndexes(commands []*shellCommand, n int, fed groupFed) []int {
	out := []int{}
	for m, c := range commands {
		if (c.pipeTo == n || m == fed.m) && m != fed.tail {
			out = append(out, m)
		}
	}
	return out
}

func stdinParts(commands []*shellCommand, n int, tree *shellNode, seen map[int]bool) (loose, exact []string) {
	for _, doc := range commands[n].heredocs {
		loose = append(loose, doc.body)
	}
	fed := groupFeeding(commands, n, tree)
	if fed.read {
		exact = append(exact, fed.bytes)
	}
	for _, m := range feederIndexes(commands, n, fed) {
		if seen[m] {
			continue
		}
		seen[m] = true
		// The last command of a group of several commands is not all the group writes (publish-command.mjs's): with a tree the
		// group's bytes are read above; this still holds where the grammar did not read the text.
		tail := false
		for _, c := range commands {
			if c.groupEnd == m {
				tail = true
			}
		}
		if tail {
			continue
		}
		upstream := commands[m]
		for _, doc := range upstream.heredocs {
			loose = append(loose, doc.body)
		}
		start, text := programIndex(upstream.argv)
		if text != nil || upstream.isDynamic(start) {
			continue
		}
		if passThrough[programName(argAt(upstream.argv, start))] {
			through, throughExact := stdinParts(commands, m, tree, seen)
			loose = append(loose, through...)
			exact = append(exact, throughExact...)
		}
		loose = append(loose, literalOutput(upstream.argv, start)...)
	}
	return loose, exact
}

func stdinScripts(commands []*shellCommand, n int, tree *shellNode) []string {
	loose, exact := stdinParts(commands, n, tree, map[int]bool{})
	scripts := []string{}
	for _, s := range loose {
		scripts = append(scripts, strings.ReplaceAll(s, `\n`, "\n"))
	}
	return append(scripts, exact...)
}

func publishInText(text string, depth int) (string, bool) {
	if depth > walkDepth {
		return "", false
	}
	commands, complete, closed := shellWordsClosed(text)
	tree := parseShell(commands, complete, closed)
	for n := range commands {
		if found, ok := publishInCommand(commands, n, depth, tree); ok {
			return found, true
		}
	}
	return "", false
}

var (
	iexName   = regexp.MustCompile(`(?i)^(?:iex|invoke-expression)$`)
	startName = regexp.MustCompile(`(?i)^(?:start|saps|start-process)$`)
	cmdName   = regexp.MustCompile(`(?i)^cmd$`)
	cmdOption = regexp.MustCompile(`^//?(?:[qQdDaAuUsS]|[eEfFvV]:\w+)$`)
	cmdRun    = regexp.MustCompile(`^//?[cCkK]$`)
	caret     = regexp.MustCompile(`(?s)\^(.)`)
	wslName   = regexp.MustCompile(`(?i)^wsl$`)
	wslValued = regexp.MustCompile(`^(?:-d|-u|--distribution|--user)$`)
	wslExec   = regexp.MustCompile(`^(?:-e|--exec|--)$`)
)

// runeIndex converts a byte offset in s to a rune offset.
func runeIndex(s string, byteOffset int) int { return utf8.RuneCountInString(s[:byteOffset]) }

func publishInCommand(commands []*shellCommand, n, depth int, tree *shellNode) (string, bool) {
	c := commands[n]
	argv, substitutions := c.argv, c.substitutions
	inner := func(texts []string) (string, bool) {
		for _, text := range texts {
			if found, ok := publishInText(text, depth+1); ok {
				return found, true
			}
		}
		return "", false
	}
	if found, ok := inner(substitutions); ok {
		return found, true
	}
	start, text := programIndex(argv)
	if text != nil {
		return inner([]string{*text})
	}
	if start >= len(argv) || c.isDynamic(start) {
		return "", false
	}
	name := programName(argv[start])
	if isGit(name) {
		if invoked, ok := gitInvocation(argv, start, c.dynamic); ok {
			return invoked, true
		}
		if found, ok := inner(gitRunsCommands(argv, start)); ok {
			return found, true
		}
		for _, built := range xargsInvocations(commands, n, start, tree) {
			if invoked, ok := gitInvocation(built, 0, nil); ok {
				return invoked, true
			}
		}
	}
	if name == "eval" {
		return inner([]string{strings.Join(argv[start+1:], " ")})
	}
	if iexName.MatchString(name) {
		kept := []string{}
		for _, word := range argv[start+1:] {
			if !powershellC.MatchString(word) {
				kept = append(kept, word)
			}
		}
		return inner([]string{strings.Join(kept, " ")})
	}
	if startName.MatchString(name) {
		if started := startedCommand(c, start); started != "" {
			return inner([]string{started})
		}
	}
	if cmdName.MatchString(name) {
		k := start + 1
		for cmdOption.MatchString(argAt(argv, k)) {
			k++
		}
		if cmdRun.MatchString(argAt(argv, k)) {
			return inner([]string{caret.ReplaceAllString(strings.Join(argv[k+1:], " "), "$1")})
		}
	}
	if wslName.MatchString(name) {
		k := start + 1
		for wslValued.MatchString(argAt(argv, k)) {
			k += 2
		}
		if wslExec.MatchString(argAt(argv, k)) {
			k++
		}
		if k < len(argv) {
			return inner([]string{strings.Join(argv[k:], " ")})
		}
	}
	for k := start; k < len(argv) && !nonExecutors[name]; k++ {
		if c.isDynamic(k) || !shellNames[strings.ToLower(programName(argv[k]))] {
			continue
		}
		shell := shellString(argv, k)
		if shell == nil {
			continue
		}
		if shell.flag >= 0 {
			if shellRuns(argv[k:shell.flag+1]) && shell.flag+1 < len(argv) {
				script := argv[shell.flag+1]
				if shell.encoded {
					script = decodedPowerShell(script)
				}
				if found, ok := inner([]string{script}); ok {
					return found, true
				}
			}
			k = shell.flag + 1
		} else if k == start && shellRuns(argv[k:min(shell.stdin, len(argv))]) {
			if found, ok := inner(stdinScripts(commands, n, tree)); ok {
				return found, true
			}
		}
	}
	if interpreters.MatchString(name) {
		language := "js"
		if name == "perl" {
			language = "perl"
		} else if strings.HasPrefix(name, "python") {
			language = "python"
		}
		for _, word := range argv[start+1:] {
			type match struct {
				index int // a rune offset
				group string
			}
			calls := []match{}
			for _, re := range []*regexp.Regexp{subprocessList, childProcessList, perlList} {
				for _, m := range re.FindAllStringSubmatchIndex(word, -1) {
					calls = append(calls, match{runeIndex(word, m[0]), word[m[2]:m[3]]})
				}
			}
			strs := []match{}
			for _, m := range subprocessString.FindAllStringSubmatchIndex(word, -1) {
				group := ""
				if m[2] >= 0 {
					group = word[m[2]:m[3]]
				} else if m[4] >= 0 {
					group = word[m[4]:m[5]]
				}
				strs = append(strs, match{runeIndex(word, m[0]), group})
			}
			indices := map[int]bool{}
			for _, m := range calls {
				indices[m.index] = true
			}
			for _, m := range strs {
				indices[m.index] = true
			}
			sorted := []int{}
			for i := range indices {
				sorted = append(sorted, i)
			}
			sort.Ints(sorted)
			script := []rune(word)
			state := &scanState{}
			literalAtIndex := map[int]bool{}
			for _, i := range sorted {
				literalAtIndex[i] = insideLiteral(script, i, language, state)
			}
			for _, call := range calls {
				if literalAtIndex[call.index] {
					continue
				}
				list := []string{}
				for _, item := range listItem.FindAllStringSubmatch(call.group, -1) {
					if item[1] != "" || strings.HasPrefix(item[0], `"`) {
						list = append(list, item[1])
					} else {
						list = append(list, item[2])
					}
				}
				if isGit(programName(argAt(list, 0))) {
					if invoked, ok := gitInvocation(list, 0, nil); ok {
						return invoked, true
					}
				}
			}
			texts := []string{}
			for _, s := range strs {
				if !literalAtIndex[s.index] {
					texts = append(texts, s.group)
				}
			}
			if found, ok := inner(texts); ok {
				return found, true
			}
		}
	}
	return "", false
}

// publishCommandIn is the `git commit …` or `git push …` this command invokes, in one spelling.
func publishCommandIn(command string) (string, bool) { return publishInText(command, 0) }
