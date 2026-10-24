// ledger-guard.mjs's (ADR-117 T1): a write into the session repository's state directory the hook can see is refused at
// PreToolUse, and "ledgers": "warn" turns it into a warning. Substitutions and -c strings are read as the commands they are,
// PowerShell with its own separator and writers; a target built from a variable and a program that writes the file itself are
// not read.
package hooks

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

type shellTarget struct {
	file  string
	bases []string // "" stands for a cd that could not be read
}

var powershellWriters = map[string]bool{"out-file": true, "set-content": true, "add-content": true, "tee-object": true, "sc": true, "ac": true, "tee": true}
var powershellCd = map[string]bool{"cd": true, "chdir": true, "set-location": true, "sl": true, "push-location": true, "pushd": true}
var powershellCommandFlag = regexp.MustCompile(`(?i)^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$`)

// ledgerFoldCase is whether a containment test ignores case: macOS and Windows volumes read another spelling as the same
// directory, and filepath.EvalSymlinks keeps the spelling it was given.
var ledgerFoldCase = runtime.GOOS == "darwin" || runtime.GOOS == "windows"

func isPowershell(name string) bool {
	return strings.Contains(name, "pwsh") || strings.Contains(name, "powershell")
}

var powershellColon = regexp.MustCompile(`^[-\x{2013}\x{2014}\x{2015}][A-Za-z]+:([\s\S]*)$`)

// powershellDestinations is ledger-guard.mjs's: every literal word, whole and split at its commas, and a colon's value.
func powershellDestinations(c *shellCommand) []string {
	found := []string{}
	for at := 1; at < len(c.argv); at++ {
		if containsInt(c.dynamic, at) {
			continue
		}
		text := c.argv[at]
		if colon := powershellColon.FindStringSubmatch(text); colon != nil {
			text = colon[1]
		}
		for _, file := range append([]string{text}, strings.Split(text, ",")...) {
			if file = strings.TrimSpace(file); file != "" {
				found = append(found, file)
			}
		}
	}
	return found
}

// followedLeaf is ledger-guard.mjs's followed: every link at the leaf followed, to a target that need not exist yet.
func followedLeaf(absolute string) string {
	at := absolute
	for hop := 0; hop < 40; hop++ {
		info, err := os.Lstat(at)
		if err != nil || info.Mode()&os.ModeSymlink == 0 {
			break
		}
		target, err := os.Readlink(at)
		if err != nil {
			break
		}
		at = resolveFrom(canonicalFile(filepath.Dir(at)), target)
	}
	return canonicalFile(at)
}

// mrwWalks is where a grep or ast-grep write walks from: its paths, or mrw's root.
func mrwWalks(toolInput any) []string {
	if isUndefined(get(toolInput, "grep")) && isUndefined(get(toolInput, "ast_grep")) {
		return nil
	}
	walks := []string{}
	if paths, ok := get(toolInput, "paths").([]any); ok {
		for _, p := range paths {
			if s, ok := p.(string); ok && s != "" {
				walks = append(walks, s)
			}
		}
	}
	if len(walks) == 0 {
		walks = []string{"."}
	}
	return walks
}

func shellWriteTargets(command string, bases []string, powershell bool) []shellTarget {
	found := []shellTarget{}
	if powershell {
		command = strings.ReplaceAll(command, `\`, "/")
	}
	cmds, _ := shellWords(command)
	seen := bases
	for _, c := range cmds {
		name := ""
		if len(c.argv) > 0 {
			name = programName(c.argv[0])
		}
		if powershell {
			name = strings.ToLower(name)
		}
		for _, w := range c.writes {
			if !w.dynamic {
				found = append(found, shellTarget{w.target, seen})
			}
		}
		for _, inner := range c.substitutions {
			found = append(found, shellWriteTargets(inner, seen, powershell)...)
		}
		if name == "cd" || (powershell && powershellCd[name]) {
			at := -1
			for i := 1; i < len(c.argv); i++ {
				if !strings.HasPrefix(c.argv[i], "-") {
					at = i
					break
				}
			}
			next := append([]string{}, seen...)
			if at > 0 && !containsInt(c.dynamic, at) && c.argv[at] != "-" && !strings.HasPrefix(c.argv[at], "~") {
				for _, base := range seen {
					if base != "" {
						next = append(next, resolveFrom(base, c.argv[at]))
					}
				}
			} else {
				next = append(next, "")
			}
			seen = next
			continue
		}
		if powershell && powershellWriters[name] {
			for _, file := range powershellDestinations(c) {
				found = append(found, shellTarget{file, seen})
			}
		} else if name == "tee" {
			for at := 1; at < len(c.argv); at++ {
				if !strings.HasPrefix(c.argv[at], "-") && !containsInt(c.dynamic, at) {
					found = append(found, shellTarget{c.argv[at], seen})
				}
			}
		}
		inner := -1
		for at, word := range c.argv {
			if word == "-c" || (shellNames[name] && isPowershell(name) && powershellCommandFlag.MatchString(word)) {
				inner = at
				break
			}
		}
		if shellNames[name] && inner > 0 && inner+1 < len(c.argv) && !containsInt(c.dynamic, inner+1) {
			found = append(found, shellWriteTargets(c.argv[inner+1], seen, powershell || isPowershell(name))...)
		}
	}
	return found
}

// mrwTargets is ledger-guard.mjs's: mrwWritePaths, and where it leaves them unknown, each search_replace block's file and the
// paths a grep or ast-grep walk starts at.
func mrwTargets(toolInput any) []string {
	if named, ok := mrwWritePaths(toolInput); ok {
		return named
	}
	found := []string{}
	if paths, ok := get(toolInput, "paths").([]any); ok {
		for _, p := range paths {
			if s, ok := p.(string); ok && s != "" {
				found = append(found, s)
			}
		}
	}
	plan, ok := get(toolInput, "plan").(string)
	if format, _ := get(toolInput, "format").(string); format != "search_replace" || !ok {
		return found
	}
	last, block := "", false
	for _, line := range regexp.MustCompile(`\r\n|\r|\n`).Split(plan, -1) {
		if block {
			block = line != ">>>>>>> REPLACE"
			continue
		}
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			continue
		}
		if strings.HasPrefix(line, "<<<<<<< SEARCH") {
			file := strings.TrimSpace(line[len("<<<<<<< SEARCH"):])
			if file == "" {
				file = last
			}
			if file != "" {
				found = append(found, file)
			}
			last, block = file, true
		} else if strings.TrimSpace(line) != "" {
			last = line
		}
	}
	return found
}

// ledgerWrite is the path, as written, of a hook-visible write into the session repository's state directory, or "".
func ledgerWrite(input *Obj) string {
	cwd, ok := input.Get("cwd").(string)
	if !ok || cwd == "" {
		return ""
	}
	dirs := []string{}
	for _, dir := range []string{stateDir(cwd), repositoryStateDir(cwd, true)} {
		if dir != "" {
			dirs = append(dirs, canonicalFile(resolvePath(dir)))
		}
	}
	within := func(dir, file string) bool {
		if ledgerFoldCase {
			dir, file = strings.ToLower(dir), strings.ToLower(file)
		}
		rel, err := filepath.Rel(dir, file)
		return err == nil && (rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)))
	}
	lands := func(absolute string) bool {
		for _, file := range []string{canonicalFile(absolute), followedLeaf(absolute)} {
			for _, dir := range dirs {
				if within(dir, file) {
					return true
				}
			}
		}
		return false
	}
	reaches := func(start string) bool {
		from := followedLeaf(resolveFrom(resolvePath(cwd), start))
		for _, dir := range dirs {
			rel, err := filepath.Rel(from, dir)
			if err != nil || !within(from, dir) {
				continue
			}
			crossesGit := false
			for _, part := range strings.FieldsFunc(rel, func(r rune) bool { return r == '/' || r == '\\' }) {
				if strings.EqualFold(part, ".git") {
					crossesGit = true
				}
			}
			if !crossesGit {
				return true
			}
		}
		return false
	}
	inside := func(file string, bases []string) bool {
		if filepath.IsAbs(file) {
			return lands(resolvePath(file))
		}
		for _, base := range bases {
			if base != "" && lands(resolveFrom(base, file)) {
				return true
			}
		}
		return false
	}
	here := []string{resolvePath(cwd)}
	tool := strOr(input.Get("tool_name"))
	if tool == mrwWrite {
		for _, file := range mrwTargets(input.Get("tool_input")) {
			if inside(file, here) {
				return file
			}
		}
		for _, start := range mrwWalks(input.Get("tool_input")) {
			if reaches(start) {
				return start
			}
		}
		return ""
	}
	if mutationTools[tool] {
		target := dig(input, "tool_input", "file_path")
		if nullish(target) {
			target = dig(input, "tool_input", "notebook_path")
		}
		if file, ok := target.(string); ok && file != "" && inside(file, here) {
			return file
		}
		return ""
	}
	if shellTools[tool] {
		command, _ := dig(input, "tool_input", "command").(string)
		for _, t := range shellWriteTargets(command, here, tool == "PowerShell") {
			if inside(t.file, t.bases) {
				return t.file
			}
		}
	}
	return ""
}

// ledgersWarn is whether the project set "ledgers": "warn" in .quality-harness.json.
func ledgersWarn(cwd string) bool {
	directory := nearestExistingDirectory(resolvePath(cwd))
	root := directory
	if found := gitRepositoryLookup(directory); found.ok && found.root != "" {
		root = found.root
	}
	config, ok := readConfig(root).(*Obj)
	return ok && strict(config.Get("ledgers"), "warn")
}

func ledgerRefusal(file string) string {
	return "quality-harness ledger guard: " + file + " is in this repository's state directory, where the " +
		"evidence is written only by its tools: qh-check writes checks.jsonl, fast-checks.jsonl, baseline.jsonl, skips.jsonl, passed-tests.json and outputs/<run id>.log, " +
		"adr-verify the receipts, the review launcher reviews.jsonl, and the hooks their session logs. Run the tool; a row written by " +
		"hand is not evidence (ADR-117). A project that needs this write sets " +
		"\"ledgers\": \"warn\" in .quality-harness.json."
}

func ledgerWarning(file string) string {
	return "quality-harness ledger guard: " + file + " is in this repository's state directory, written only " +
		"by its tools; \"ledgers\": \"warn\" lets this write through, and a row written by hand is still not evidence (ADR-117)."
}
