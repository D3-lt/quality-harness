// ledger-guard.mjs's (ADR-117 T1): a write into the session repository's state directory the hook can see is refused at
// PreToolUse, and "ledgers": "warn" turns it into a warning. A target built from a variable, a program that writes the file
// itself, and `cd -` or `cd ~` before a relative target are not read.
package hooks

import (
	"path/filepath"
	"strings"
)

type shellTarget struct{ file, base string }

func shellWriteTargets(command, base string, depth int) []shellTarget {
	found := []shellTarget{}
	cmds, _ := shellWords(command)
	for _, c := range cmds {
		name := ""
		if len(c.argv) > 0 {
			name = programName(c.argv[0])
		}
		if name == "cd" {
			if len(c.argv) == 2 && !containsInt(c.dynamic, 1) && c.argv[1] != "-" && !strings.HasPrefix(c.argv[1], "~") && base != "" {
				base = resolveFrom(base, c.argv[1])
			} else {
				base = ""
			}
			continue
		}
		for _, w := range c.writes {
			if !w.dynamic {
				found = append(found, shellTarget{w.target, base})
			}
		}
		if name == "tee" {
			for at := 1; at < len(c.argv); at++ {
				if !strings.HasPrefix(c.argv[at], "-") && !containsInt(c.dynamic, at) {
					found = append(found, shellTarget{c.argv[at], base})
				}
			}
		}
		inner := -1
		for at, word := range c.argv {
			if word == "-c" {
				inner = at
				break
			}
		}
		if shellNames[name] && depth < 3 && inner > 0 && inner+1 < len(c.argv) && !containsInt(c.dynamic, inner+1) {
			found = append(found, shellWriteTargets(c.argv[inner+1], base, depth+1)...)
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
	dir := canonicalFile(resolvePath(stateDir(cwd)))
	inside := func(file, base string) bool {
		if !filepath.IsAbs(file) && base == "" {
			return false
		}
		if base == "" {
			base = cwd
		}
		rel, err := filepath.Rel(dir, canonicalFile(resolveFrom(resolvePath(base), file)))
		return err == nil && (rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)))
	}
	tool := strOr(input.Get("tool_name"))
	if tool == mrwWrite {
		paths, _ := mrwWritePaths(input.Get("tool_input"))
		for _, file := range paths {
			if inside(file, cwd) {
				return file
			}
		}
		return ""
	}
	if mutationTools[tool] {
		target := dig(input, "tool_input", "file_path")
		if nullish(target) {
			target = dig(input, "tool_input", "notebook_path")
		}
		if file, ok := target.(string); ok && file != "" && inside(file, cwd) {
			return file
		}
		return ""
	}
	if shellTools[tool] {
		command, _ := dig(input, "tool_input", "command").(string)
		for _, t := range shellWriteTargets(command, resolvePath(cwd), 0) {
			if inside(t.file, t.base) {
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
		"evidence is written only by its tools: qh-check writes checks.jsonl, fast-checks.jsonl and baseline.jsonl, and adr-verify " +
		"the receipts. Run the tool; a row written by hand is not evidence (ADR-117). A project that needs this write sets " +
		"\"ledgers\": \"warn\" in .quality-harness.json."
}

func ledgerWarning(file string) string {
	return "quality-harness ledger guard: " + file + " is in this repository's state directory, written only " +
		"by its tools; \"ledgers\": \"warn\" lets this write through, and a row written by hand is still not evidence (ADR-117)."
}
