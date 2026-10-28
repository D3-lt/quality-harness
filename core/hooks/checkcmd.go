// Which command is this project's check and how it came to be named (plugin/scripts/check-command.mjs), what the project says
// in .quality-harness.json (project-config.mjs), and how text from outside is made safe to say (corpus-text.mjs).
package hooks

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var projectChecks = []struct{ file, command string }{
	{"scripts/selftest.sh", "bash scripts/selftest.sh"},
	{"selftest.sh", "bash selftest.sh"},
	{"scripts/verify.sh", "bash scripts/verify.sh"},
	{"verify.sh", "bash verify.sh"},
	{"Cargo.toml", "cargo test"},
	{"go.mod", "go test ./..."},
	{"pytest.ini", "pytest"},
	{"tox.ini", "pytest"},
	{"phpunit.xml", "php vendor/bin/phpunit"},
	{"phpunit.xml.dist", "php vendor/bin/phpunit"},
}

// pytestSections is check-command.mjs's PYTEST_SECTIONS (ADR-111 T1): pytest configured in a manifest's own section. The header
// opens a line outside any value. JavaScript's `.` stops at \r, U+2028 and U+2029, so a trailing comment stops there too.
var pytestSections = []struct {
	file   string
	header *regexp.Regexp
	toml   bool
}{
	{"pyproject.toml", regexp.MustCompile(`^[ \t]*\[tool\.pytest\.ini_options\][ \t]*(?:#[^\r\x{2028}\x{2029}]*)?$`), true},
	{"setup.cfg", regexp.MustCompile(`^\[tool:pytest\][ \t]*(?:[#;][^\r\x{2028}\x{2029}]*)?$`), false},
}

// opensSection is check-command.mjs's: whether a line outside every TOML multi-line string is the header, each line lexed as
// TOML lexes it. Every delimiter is ASCII, so stepping by bytes stops where stepping by UTF-16 units does.
func opensSection(text string, header *regexp.Regexp, toml bool) bool {
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSuffix(line, "\r")
	}
	open := ""
	for _, line := range lines {
		if open == "" && header.MatchString(line) {
			return true
		}
		if !toml {
			continue
		}
		at := 0
		for at < len(line) {
			switch {
			case open != "":
				// A basic multi-line string honours escapes, so \""" is an escaped quote and two more, not its close.
				end := -1
				for scan := at; scan <= len(line)-3; scan++ {
					if open == `"""` && line[scan] == '\\' {
						scan++
						continue
					}
					if strings.HasPrefix(line[scan:], open) {
						end = scan
						break
					}
				}
				if end < 0 {
					at = len(line)
					continue
				}
				open = ""
				at = end + 3
			case strings.HasPrefix(line[at:], `"""`) || strings.HasPrefix(line[at:], `'''`):
				open = line[at : at+3]
				at += 3
			case line[at] == '#':
				at = len(line)
			case line[at] == '"':
				at++
				for at < len(line) && line[at] != '"' {
					if line[at] == '\\' {
						at += 2
					} else {
						at++
					}
				}
				at++
			case line[at] == '\'':
				if end := strings.IndexByte(line[at+1:], '\''); end < 0 {
					at = len(line)
				} else {
					at += end + 2
				}
			default:
				at++
			}
		}
	}
	return false
}

// readConfig is JSON.parse of .quality-harness.json, or nil when it cannot be read or parsed.
func readConfig(root string) any {
	text, err := os.ReadFile(filepath.Join(root, ".quality-harness.json"))
	if err != nil {
		return nil
	}
	v, err := parseJSON(string(text))
	if err != nil {
		return nil
	}
	return v
}

func exists(p string) bool { _, err := os.Stat(p); return err == nil }

func declaredCheckCommand(directory string) string {
	check, ok := get(readConfig(directory), "check").(string)
	if ok && strings.TrimSpace(check) != "" {
		return jsTrim(check)
	}
	return ""
}

// jsTrim is String.prototype.trim.
func jsTrim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		switch r {
		case ' ', '\t', '\n', '\v', '\f', '\r', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
			return true
		}
		return r >= 0x2000 && r <= 0x200a
	})
}

var knownStatus = map[string]string{"true": "zero", ":": "zero", "echo": "zero", "printf": "zero", "false": "nonzero"}

var listControl = map[string]bool{"set": true, "shopt": true, "trap": true, "exec": true, "source": true, ".": true, "eval": true, "return": true, "alias": true, "unalias": true, "builtin": true, "enable": true}

// reservedWords are the shell's compound-command words, which the grammar does not model: unquoted at a command's head, the
// list is not read (plugin/scripts/check-command.mjs RESERVED).
var reservedWords = map[string]bool{"if": true, "then": true, "elif": true, "else": true, "fi": true, "while": true, "until": true, "do": true, "done": true, "case": true, "esac": true, "for": true, "select": true, "in": true, "[[": true, "]]": true}

var shellNames = map[string]bool{"bash": true, "dash": true, "zsh": true, "ksh": true, "tcsh": true, "csh": true, "sh": true, "pwsh": true, "powershell": true}

var (
	exeSuffix = regexp.MustCompile(`(?i)\.exe$`)
	allDigits = regexp.MustCompile(`^\d+$`)
	pathSplit = regexp.MustCompile(`[\\/]`)
)

// programName is a command word's program: its last path component, without `.exe` or a leading `@`.
func programName(word string) string {
	parts := pathSplit.Split(word, -1)
	name := exeSuffix.ReplaceAllString(parts[len(parts)-1], "")
	return strings.TrimPrefix(name, "@")
}

func isPiped(ended string) bool { return ended == "|" || ended == "|&" }

func passThroughSink(c *shellCommand) bool {
	if len(c.substitutions) > 0 || len(c.dynamic) > 0 {
		return false
	}
	if len(c.argv) == 0 {
		return false
	}
	name := programName(c.argv[0])
	args := c.argv[1:]
	switch name {
	case "tee":
		return true
	case "cat":
		return len(args) == 0 || (len(args) == 1 && args[0] == "-")
	case "head", "tail":
		for _, a := range args {
			if !strings.HasPrefix(a, "-") && !allDigits.MatchString(a) {
				return false
			}
		}
		return true
	}
	return false
}

func constantSuccessCheck(command string) bool {
	if strings.TrimSpace(command) == "" {
		return false
	}
	return listStatus(command, 0) == "zero"
}

type cmdStatus struct {
	status string
	exits  bool
}

// Statuses as bits (check-command.mjs's): ZERO, NONZERO, both. fall is what a node can leave with when it ends, exit what it can
// exit the whole shell with; a node that cannot end (`exit 1`) has an empty fall.
const (
	zeroBit    = 1
	nonzeroBit = 2
	eitherBits = 3
)

var (
	statusBit = map[string]int{"zero": zeroBit, "nonzero": nonzeroBit, "either": eitherBits}
	bitWord   = [4]string{"either", "zero", "nonzero", "either"}
	bitInvert = [4]int{0, nonzeroBit, zeroBit, eitherBits}
	// A POSIX shell finds a special builtin before a function, so a function of that name is not trusted.
	specialBuiltins = map[string]bool{":": true, ".": true, "break": true, "continue": true, "eval": true, "exec": true, "exit": true,
		"export": true, "readonly": true, "return": true, "set": true, "shift": true, "times": true, "trap": true, "unset": true}
)

type statusRun struct{ fall, exit int }

var (
	statusUnread = statusRun{eitherBits, 0}
	statusMaybe  = statusRun{eitherBits, eitherBits}
)

// evalCtx is what a walk of the tree carries: the records, the sh -c depth, the functions defined so far (nil is one the text
// cannot place) and the ones being called.
type evalCtx struct {
	commands []*shellCommand
	depth    int
	env      map[string]*shellNode
	active   map[string]bool
}

func (x evalCtx) fork() evalCtx {
	env := make(map[string]*shellNode, len(x.env))
	for k, v := range x.env {
		env[k] = v
	}
	x.env = env
	return x
}

func listStatus(text string, depth int) string {
	commands, complete, closed := shellWordsClosed(text)
	if !complete || len(commands) == 0 || depth > 3 {
		return "either"
	}
	for _, c := range commands {
		first := ""
		if len(c.argv) > 0 {
			first = c.argv[0]
		}
		headQuoted := len(c.quoted) > 0 && c.quoted[0]
		if (c.redirects > 0 && !isPiped(c.ended)) || listControl[programName(first)] || (reservedWords[first] && !headQuoted) {
			return "either"
		}
	}
	tree := parseShell(commands, complete, closed)
	if tree == nil {
		return "either"
	}
	r := evaluate(tree, evalCtx{commands: commands, depth: depth, env: map[string]*shellNode{}, active: map[string]bool{}}, false)
	return bitWord[r.fall|r.exit]
}

func evaluate(n *shellNode, x evalCtx, conditional bool) statusRun {
	switch n.T {
	case "cmd":
		return commandRun(x.commands[n.I], x, conditional)
	case "pipe":
		return pipelineRun(n, x, conditional)
	case "andor":
		return andOrRun(n, x, conditional)
	case "list":
		return listRun(n, x, conditional)
	case "group":
		return evaluate(n.Kids[0], x, conditional)
	case "sub":
		body := evaluate(n.Kids[0], x.fork(), conditional)
		fall := body.fall | body.exit
		if fall == 0 {
			fall = eitherBits
		}
		return statusRun{fall, 0}
	case "def":
		if conditional || specialBuiltins[n.Name] {
			x.env[n.Name] = nil
		} else {
			x.env[n.Name] = n.Kids[0]
		}
		return statusRun{zeroBit, 0}
	}
	return statusMaybe
}

func commandRun(c *shellCommand, x evalCtx, conditional bool) statusRun {
	if unreadable(c) {
		return statusUnread
	}
	if body, defined := x.env[c.argv[0]]; defined {
		if body == nil || x.active[c.argv[0]] {
			return statusMaybe
		}
		x.active[c.argv[0]] = true
		defer delete(x.active, c.argv[0])
		return evaluate(body, x, conditional)
	}
	if programName(c.argv[0]) == "unset" {
		for name := range x.env {
			x.env[name] = nil
		}
	}
	own := commandStatus(c, x.depth)
	if own.exits {
		return statusRun{0, statusBit[own.status]}
	}
	return statusRun{statusBit[own.status], 0}
}

func pipelineRun(n *shellNode, x evalCtx, conditional bool) statusRun {
	var r statusRun
	if len(n.Kids) == 1 {
		r = evaluate(n.Kids[0], x, conditional)
	} else {
		last := n.Kids[len(n.Kids)-1]
		tail := evaluate(last, x.fork(), true)
		fall := tail.fall | tail.exit
		if fall == 0 {
			fall = eitherBits
		}
		if tail.exit == 0 && endsInSink(last, x) {
			fall = zeroBit
		}
		r = statusRun{fall, 0}
	}
	if n.Bang == 1 {
		return statusRun{bitInvert[r.fall], r.exit}
	}
	if n.Bang > 1 {
		fall := 0
		if r.fall != 0 {
			fall = eitherBits
		}
		return statusRun{fall, r.exit}
	}
	return r
}

// endsInSink is a pass-through sink as the last thing a stage runs: itself, or the only command of a group.
func endsInSink(n *shellNode, x evalCtx) bool {
	if n.T == "cmd" {
		// A function of the sink's name, as written, is the function: its status is the evaluated one, not 0.
		c := x.commands[n.I]
		shadowed := false
		if len(c.argv) > 0 {
			_, shadowed = x.env[c.argv[0]]
		}
		return !shadowed && passThroughSink(c)
	}
	if n.T != "group" {
		return false
	}
	items := n.Kids[0].Kids
	last := items[len(items)-1]
	if len(last.Kids) != 1 || last.Kids[0].Bang != 0 || len(last.Kids[0].Kids) != 1 {
		return false
	}
	return endsInSink(last.Kids[0].Kids[0], x)
}

func andOrRun(n *shellNode, x evalCtx, conditional bool) statusRun {
	r := evaluate(n.Kids[0], x, conditional)
	for k := 1; k < len(n.Kids); k++ {
		gate := zeroBit
		if n.Ops[k-1] != "&&" {
			gate = nonzeroBit
		}
		if r.fall&gate == 0 {
			continue
		}
		next := evaluate(n.Kids[k], x, conditional || r.fall != gate || r.exit != 0)
		r = statusRun{(r.fall &^ gate & eitherBits) | next.fall, r.exit | next.exit}
	}
	return r
}

func listRun(n *shellNode, x evalCtx, conditional bool) statusRun {
	r := statusRun{zeroBit, 0}
	for k := 0; k < len(n.Kids) && r.fall != 0; k++ {
		background := n.Ops[k] == "&"
		ctx := x
		if background {
			ctx = x.fork()
		}
		item := evaluate(n.Kids[k], ctx, conditional || r.exit != 0)
		if background {
			r = statusRun{zeroBit, r.exit}
		} else {
			r = statusRun{item.fall, r.exit | item.exit}
		}
	}
	return r
}

// unreadable is text whose status cannot be read: a substitution, no command word, or one built at run time. A word that is
// exactly `[` is the test builtin, not a glob.
func unreadable(c *shellCommand) bool {
	return len(c.substitutions) > 0 || len(c.argv) == 0 || (c.isDynamic(0) && c.argv[0] != "[")
}

func commandStatus(c *shellCommand, depth int) cmdStatus {
	if unreadable(c) {
		return cmdStatus{status: "either"}
	}
	name := programName(c.argv[0])
	args := c.argv[1:]
	// Only the word itself is the builtin: `/usr/bin/exit` is a program by that name, and runs or is not found (the Codex
	// review of 0b129010..bca51180). A quoted `"exit"` is the word once the shell removes the quotes.
	if c.argv[0] == "exit" {
		// One operand, unsigned or `+N`: bash and sh refuse a second ("too many arguments", 1) where dash takes the first, and
		// `-N` is 255 under bash and sh but a refused number (2) under dash (measured 2026-10-21).
		if len(args) != 1 || !allDigits.MatchString(strings.TrimPrefix(args[0], "+")) {
			return cmdStatus{status: "either", exits: true}
		}
		// The shell keeps a status modulo 256 (`exit 256` exits 0); past INT_MAX dash refuses the number and bash wraps it,
		// so the shells disagree and nothing is fixed (measured 2026-10-21 under /bin/bash, /bin/sh and /bin/dash).
		digits := strings.TrimLeft(strings.TrimPrefix(args[0], "+"), "0")
		code, err := strconv.ParseInt("0"+digits, 10, 64)
		if err != nil || code > 2147483647 {
			return cmdStatus{status: "either", exits: true}
		}
		if code%256 == 0 {
			return cmdStatus{status: "zero", exits: true}
		}
		return cmdStatus{status: "nonzero", exits: true}
	}
	if s, ok := knownStatus[name]; ok {
		return cmdStatus{status: s}
	}
	if name == "test" || name == "[" {
		laterDynamic := false
		for _, k := range c.dynamic {
			if k > 0 {
				laterDynamic = true
			}
		}
		if !laterDynamic {
			operands := args
			if name == "[" && len(args) > 0 && args[len(args)-1] == "]" {
				operands = args[:len(args)-1]
			}
			if len(operands) == 1 && !strings.HasPrefix(operands[0], "-") {
				if operands[0] == "" {
					return cmdStatus{status: "nonzero"}
				}
				return cmdStatus{status: "zero"}
			}
			return cmdStatus{status: "either"}
		}
	}
	if shellNames[strings.ToLower(name)] && len(args) > 1 && args[0] == "-c" {
		return cmdStatus{status: listStatus(args[1], depth+1)}
	}
	return cmdStatus{status: "either"}
}

func packageManagerCommand(directory string) string {
	text, err := os.ReadFile(filepath.Join(directory, "package.json"))
	if err != nil {
		return ""
	}
	manifest, err := parseJSON(string(text))
	if err != nil {
		return ""
	}
	scripts, ok := get(manifest, "scripts").(*Obj)
	if !ok {
		return ""
	}
	runner := "npm"
	if exists(filepath.Join(directory, "pnpm-lock.yaml")) {
		runner = "pnpm"
	} else if exists(filepath.Join(directory, "yarn.lock")) {
		runner = "yarn"
	} else if exists(filepath.Join(directory, "bun.lock")) || exists(filepath.Join(directory, "bun.lockb")) {
		runner = "bun"
	}
	for _, name := range []string{"test", "check", "lint", "typecheck"} {
		if s, ok := scripts.Get(name).(string); ok && strings.TrimSpace(s) != "" {
			return runner + " run " + name
		}
	}
	return ""
}

func makeTargetCommand(directory string) string {
	for _, file := range []string{"Makefile", "makefile", "justfile", "Justfile"} {
		source, err := os.ReadFile(filepath.Join(directory, file))
		if err != nil {
			continue
		}
		runner := "make"
		if strings.EqualFold(file, "justfile") {
			runner = "just"
		}
		for _, target := range []string{"test", "check", "lint", "verify", "validate", "build"} {
			if regexp.MustCompile(`(?m)^` + target + `\s*:`).Match(source) {
				return runner + " " + target
			}
		}
	}
	return ""
}

type checkOrigin struct {
	command string // "" for none
	origin  string // declared, inferred, none, refused, unproven, unreadable
	problem string // why .quality-harness.json could not be taken as a declaration, for unreadable
}

// projectConfigProblem is project-config.mjs's: why .quality-harness.json cannot be taken as the project's declaration, or ""
// when it is absent or an object. The JSON parser's own words differ from JavaScript's, so the detail differs between paths.
func projectConfigProblem(root string) string {
	file := filepath.Join(root, ".quality-harness.json")
	b, err := os.ReadFile(file)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			return fmt.Sprintf(".quality-harness.json could not be read (%s)", errCode(err, "unknown error"))
		}
		// A dangling link is a declaration nobody can read, not an absent one.
		if _, lerr := os.Lstat(file); lerr != nil {
			return ""
		}
		return ".quality-harness.json could not be read (a link to nothing)"
	}
	text := string(b)
	if strings.HasPrefix(text, "\xef\xbb\xbf") {
		return ".quality-harness.json starts with a byte-order mark (U+FEFF), which JSON does not allow: save it as UTF-8 without a BOM"
	}
	v, err := parseJSON(text)
	if err != nil {
		return ".quality-harness.json is not valid JSON (" + strings.SplitN(err.Error(), "\n", 2)[0] + ")"
	}
	if _, ok := v.(*Obj); !ok {
		return ".quality-harness.json is not a JSON object"
	}
	return ""
}

func checkCommandOrigin(cwd string, found *lookup) checkOrigin {
	directory := nearestExistingDirectory(resolvePath(cwd))
	if directory == "" {
		return checkOrigin{origin: "none"}
	}
	if found == nil {
		l := gitRepositoryLookup(directory)
		found = &l
	}
	if !found.ok {
		return checkOrigin{origin: "unproven"}
	}
	root := found.root
	if root == "" {
		root = directory
	}
	if declared := declaredCheckCommand(root); declared != "" {
		if constantSuccessCheck(declared) {
			return checkOrigin{origin: "refused"}
		}
		return checkOrigin{command: declared, origin: "declared"}
	}
	for _, candidate := range projectChecks {
		if exists(filepath.Join(root, filepath.FromSlash(candidate.file))) {
			return checkOrigin{command: candidate.command, origin: "inferred"}
		}
	}
	for _, section := range pytestSections {
		text, err := os.ReadFile(filepath.Join(root, section.file))
		if err != nil {
			continue
		}
		if opensSection(string(text), section.header, section.toml) {
			return checkOrigin{command: "pytest", origin: "inferred"}
		}
	}
	if packaged := packageManagerCommand(root); packaged != "" {
		return checkOrigin{command: packaged, origin: "inferred"}
	}
	if made := makeTargetCommand(root); made != "" {
		return checkOrigin{command: made, origin: "inferred"}
	}
	// ADR-113 T2: where nothing could be inferred, a declaration that cannot be read is not an absent one; read as none, it
	// switched the publish refusal off. Where a rung above answered, that answer stands.
	if problem := projectConfigProblem(root); problem != "" {
		return checkOrigin{origin: "unreadable", problem: problem}
	}
	return checkOrigin{origin: "none"}
}

func projectCheckCommand(cwd string) string { return checkCommandOrigin(cwd, nil).command }

// CheckCommandJSON is `qh check-command <dir>`: the check dir infers taken as its own root, as check-command.mjs answers it, so
// tests/go-core-parity-adr-111.test.mjs can set one beside the other (ADR-113 T1).
func CheckCommandJSON(dir string) string {
	o := checkCommandOrigin(dir, &lookup{ok: true, root: dir})
	out := O("command", nil, "origin", o.origin)
	if o.command != "" {
		out.Set("command", o.command)
	}
	if o.problem != "" {
		out.Set("problem", o.problem)
	}
	return stringify(out)
}

func runTheCheckSentence(cwd string) string {
	o := checkCommandOrigin(cwd, nil)
	if o.origin == "refused" {
		return "The check declared in `.quality-harness.json` is a constant success and was refused. Declare a command that can fail."
	}
	if o.origin == "unreadable" {
		return o.problem + ", so no check can pass here and `qh-check` will not guess what it declares. Fix the file, then run `qh-check`."
	}
	if o.origin == "unproven" {
		return "The repository root could not be read, so no check is named. That is not the same as this project having no check."
	}
	if o.command == "" {
		return "Run the smallest repository-owned test, lint, build, or validation command after the final edit and report the exact command and result."
	}
	if o.origin == "declared" {
		return fmt.Sprintf("Run `qh-check` — it runs %s (this project's own check) and records what it observed — after the final edit and report the exact command and result.", checkInCode(o.command))
	}
	return "No `check` is declared in `.quality-harness.json`. I inferred from this repository rather than from a declaration: " + checkInCode(o.command) +
		", so that is not this project's own check. If it is red on an unmodified tree the finding is about this machine and not about your change — say which, and declare the real command as `check`. " +
		"Run `qh-check` (it runs " + checkInCode(o.command) + " and records what it observed) after the final edit and report the exact command and result."
}

// turnEndSetting is where a turn-end finding goes (ADR-096 T3): notify, or the agent. ADR-120 T11: "continue" is the agent's too, and
// also restores the pre-3.8.51 continuation on an inferred or unstartable check.
func turnEndSetting(root string) string {
	if strict(get(readConfig(root), "turnEnd"), "continue") {
		return "continue"
	}
	if strict(get(readConfig(root), "turnEnd"), "notify") {
		return "notify"
	}
	return "agent"
}

// ---- corpus-text.mjs

func isInvisible(r rune) bool {
	return r <= 0x1f || (r >= 0x7f && r <= 0x9f) || (r >= 0x200b && r <= 0x200f) || (r >= 0x202a && r <= 0x202e) ||
		(r >= 0x2060 && r <= 0x2069) || r == 0xfeff
}

// visiblePath shows an invisible character in a name as a visible escape.
func visiblePath(value string) string {
	var b strings.Builder
	for _, r := range value {
		if isInvisible(r) {
			fmt.Fprintf(&b, `\u{%x}`, r)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

var backtickRun = regexp.MustCompile("`+")

// codeSpan is a code span longer than any backtick run inside the text.
func codeSpan(text string) string {
	longest := 0
	for _, run := range backtickRun.FindAllString(text, -1) {
		if len(run) > longest {
			longest = len(run)
		}
	}
	fence := strings.Repeat("`", longest+1)
	if longest > 0 {
		return fence + " " + text + " " + fence
	}
	return fence + text + fence
}

// untagged shows a `<` a reader could take for a tag's as `‹`: one before an optional `/` and a letter, when a `>` follows
// it or the name after it ends where a tag's name ends (whitespace, `/`, `\`, the end).
func untagged(text string) string {
	src := []rune(text)
	var b strings.Builder
	for k, r := range src {
		if r == '<' && opensTag(src, k+1) {
			b.WriteRune('‹')
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func isASCIILetter(r rune) bool { return (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') }

func isJSSpace(r rune) bool {
	switch r {
	case ' ', '\t', '\n', '\v', '\f', '\r', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func opensTag(src []rune, k int) bool {
	if k < len(src) && src[k] == '/' {
		k++
	}
	if k >= len(src) || !isASCIILetter(src[k]) {
		return false
	}
	k++
	// (?:[^>]*>): a `>` anywhere after the letter, on any line.
	for j := k; j < len(src); j++ {
		if src[j] == '>' {
			return true
		}
	}
	// [\w:-]*(?:[\s/\\]|$)
	j := k
	for j < len(src) && (isWordRune(src[j]) || src[j] == ':' || src[j] == '-') {
		j++
	}
	return j == len(src) || isJSSpace(src[j]) || src[j] == '/' || src[j] == '\\'
}

func shownPath(value string) string { return untagged(visiblePath(value)) }

func pathInCode(value string) string { return codeSpan(shownPath(value)) }

// checkInCode is a check command as one line in a code span; its tabs kept, its other controls escaped.
func checkInCode(command string) string {
	parts := strings.Split(command, "\t")
	for i, p := range parts {
		parts[i] = visiblePath(p)
	}
	return codeSpan(untagged(strings.Join(parts, "\t")))
}
