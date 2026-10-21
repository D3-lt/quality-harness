// A pass stands for a later tree while the only paths that differ are the project's declared `prose` (ADR-120 T9): the declaration
// (plugin/scripts/project-config.mjs proseSpecs), the code tree a commit has without those paths, the carry a reader asks a pass
// with (plugin/scripts/check-ledger.mjs carryFor), and the hint a refusal gives a project that declares nothing
// (plugin/scripts/prose-hint.mjs).
package hooks

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// The grammar is POSITIVE (project-config.mjs says why): a literal path or directory prefix, a literal first directory then a glob,
// or every file with one literal extension.
var (
	proseLiteral   = regexp.MustCompile(`^[\w.@+][\w.@+/-]*$`)
	proseUnder     = regexp.MustCompile(`^[\w.@+][\w.@+-]*/[\w.@+/*?[\]-]*$`)
	proseExtension = regexp.MustCompile(`^(?:\*\*/)?\*\.[A-Za-z0-9]+$`)
	textDocument   = regexp.MustCompile(`(?i)\.(?:md|mdx|txt|rst)$`)
)

const proseMost = 20

// proseSpecRefused is whether a declared spec could hide code: not a plain pathspec, a segment that is `.` or `..`, or one that
// could name .quality-harness.json, which holds the check.
func proseSpecRefused(spec string) bool {
	if !(proseLiteral.MatchString(spec) || proseUnder.MatchString(spec) || proseExtension.MatchString(spec)) {
		return true
	}
	for _, part := range strings.Split(spec, "/") {
		if part == "." || part == ".." {
			return true
		}
	}
	lower := strings.ToLower(spec)
	return lower == ".quality-harness.json" || (proseExtension.MatchString(spec) && strings.HasSuffix(lower, ".json"))
}

// proseSpecs is the paths the project declares as `prose`, or nil: a declaration that is refused, or whose spec matches no tracked
// path or a submodule, declares nothing, whole (CLAUDE.md §16).
func proseSpecs(root string) []string {
	config, ok := readConfig(root).(*Obj)
	if !ok || !config.Has("prose") {
		return nil
	}
	declared, ok := config.Get("prose").([]any)
	if !ok || len(declared) == 0 || len(declared) > proseMost {
		return nil
	}
	specs := make([]string, 0, len(declared))
	for _, d := range declared {
		spec, ok := d.(string)
		if !ok || proseSpecRefused(spec) {
			return nil
		}
		specs = append(specs, spec)
	}
	for _, spec := range specs {
		listed := git(10*time.Second, nil, "-C", root, "ls-files", "-s", "-z", "--", ":(top)"+spec)
		if listed.err != nil || listed.status != 0 {
			return nil
		}
		entries := 0
		for _, entry := range strings.Split(listed.stdout, "\x00") {
			if entry == "" {
				continue
			}
			if strings.HasPrefix(entry, "160000") {
				return nil
			}
			entries++
		}
		if entries == 0 {
			return nil
		}
	}
	return specs
}

// proseList reads a recorded list of specs: an array of strings.
func proseList(v any) ([]string, bool) {
	array, ok := v.([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, 0, len(array))
	for _, item := range array {
		s, ok := item.(string)
		if !ok {
			return nil, false
		}
		out = append(out, s)
	}
	return out, true
}

func sameProse(recorded any, declared []string) bool {
	list, ok := proseList(recorded)
	if !ok || len(list) != len(declared) {
		return false
	}
	for i := range list {
		if list[i] != declared[i] {
			return false
		}
	}
	return true
}

// carry is what a pass may be carried by for one tree: its code tree, and the declared list that code tree was taken under.
type carry struct {
	codeTree string
	prose    []string
}

// carryFor is check-ledger.mjs's: nil when the tree has no code tree (the project declares nothing, or git could not say), and
// nil while a write git cannot see is outstanding, since the code tree speaks for what git lists and cannot speak for that write.
func carryFor(log Log, root string, codeTree any, prose any) *carry {
	tree, ok := codeTree.(string)
	if !ok || tree == "" {
		return nil
	}
	list, ok := proseList(prose)
	if !ok || len(list) == 0 {
		return nil
	}
	if len(unobservableWrites(log, root)) > 0 {
		return nil
	}
	return &carry{codeTree: tree, prose: list}
}

// carriedAsRecorded is whether a check event's code tree and list are the ledger record's: an event that names either must name
// what the record holds, or it is not bound (ADR-120 T9).
func carriedAsRecorded(entry, record any) bool {
	if code := dig(entry, "after", "codeTree"); !isUndefined(code) && !strict(code, dig(record, "after", "codeTree")) {
		return false
	}
	if list := get(entry, "prose"); !isUndefined(list) {
		declared, ok := proseList(get(record, "prose"))
		if !ok || !sameProse(list, declared) {
			return false
		}
	}
	return true
}

// codeTreeOf is the tree a tree git holds has once the declared paths are removed, or "" when git could not say.
func codeTreeOf(cwd, treeSha string, without []string) string {
	if treeSha == "" || len(without) == 0 {
		return ""
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	if directory == "" {
		return ""
	}
	gitRun := boundedGit(directory, time.Now(), observeBudgetMs())
	objectsRel, err := gitRun([]string{"rev-parse", "--git-path", "objects"}, nil)
	if err != nil {
		return ""
	}
	objects := strings.TrimSpace(objectsRel.stdout)
	if !filepath.IsAbs(objects) {
		objects = filepath.Join(directory, objects)
	}
	scratch, err := os.MkdirTemp(os.TempDir(), "qh-code-tree-")
	if err != nil {
		return ""
	}
	defer os.RemoveAll(scratch)
	if err := os.Mkdir(filepath.Join(scratch, "objects"), 0o777); err != nil {
		return ""
	}
	env := map[string]string{"GIT_OBJECT_DIRECTORY": filepath.Join(scratch, "objects"), "GIT_ALTERNATE_OBJECT_DIRECTORIES": filepath.Clean(objects)}
	code, err := treeWithout(gitRun, env, scratch, "index", treeSha, without)
	if err != nil {
		return ""
	}
	return code
}

// proseSettingHint is said once per tree, on a refusal whose unchecked work is text documents alone and whose project declares no
// `prose`.
const proseSettingHint = " The work since the last full pass is to text documents alone: if this project's check reads none of them, a \"prose\": [...] list " +
	"in .quality-harness.json lets a later change to them alone stand on a pass (the project owner's declaration, ADR-120)."

// proseHintTold is whether the hint was already said for this tree: a P action carries it in its detail.
func proseHintTold(log Log, tree any) bool {
	for _, e := range log.E {
		if strict(get(e, "event"), "action.emitted") && strict(get(e, "rule"), "P") &&
			isTrue(dig(e, "detail", "proseHint")) && strict(dig(e, "detail", "tree"), tree) {
			return true
		}
	}
	return false
}

// previousPassHead is prose-hint.mjs's: the HEAD of the latest full pass of `command`, when that pass was taken on that commit's
// own tree, or "".
func previousPassHead(root, command string) string {
	text, err := os.ReadFile(filepath.Join(stateDir(root), "checks.jsonl"))
	if err != nil {
		return ""
	}
	var latest any
	for _, line := range strings.Split(string(text), "\n") {
		record, err := parseJSON(line)
		if err != nil {
			continue
		}
		if _, ok := dig(record, "after", "head").(string); ok && strict(get(record, "command"), command) && checkEventName(record) == "check.passed" {
			latest = record
		}
	}
	if latest == nil {
		return ""
	}
	head := strOr(dig(latest, "after", "head"))
	tree := git(10*time.Second, nil, "-C", root, "rev-parse", "--verify", "-q", head+"^{tree}")
	if tree.err != nil || tree.status != 0 || strings.TrimSpace(tree.stdout) != strOr(dig(latest, "after", "tree")) {
		return ""
	}
	return head
}

// onlyTextChangedSince is prose-hint.mjs's: whether what differs from `head` is regular text documents alone.
func onlyTextChangedSince(root, head string) bool {
	changed := git(10*time.Second, nil, "-C", root, "diff", "--no-renames", "--raw", "-z", head, "--")
	untracked := git(10*time.Second, nil, "-C", root, "ls-files", "-z", "--others", "--exclude-standard")
	if changed.err != nil || changed.status != 0 || untracked.err != nil || untracked.status != 0 {
		return false
	}
	regular := func(mode string) bool { return mode == "000000" || mode == "100644" }
	paths := []string{}
	fields := strings.Split(changed.stdout, "\x00")
	for at := 0; at+1 < len(fields); at += 2 {
		if !strings.HasPrefix(fields[at], ":") {
			return false
		}
		modes := strings.Split(fields[at][1:], " ")
		if len(modes) < 2 || !regular(modes[0]) || !regular(modes[1]) {
			return false
		}
		paths = append(paths, fields[at+1])
	}
	for _, file := range strings.Split(untracked.stdout, "\x00") {
		if file == "" {
			continue
		}
		info, err := os.Lstat(filepath.Join(root, file))
		if err != nil || !info.Mode().IsRegular() {
			return false
		}
		paths = append(paths, file)
	}
	if len(paths) == 0 {
		return false
	}
	for _, p := range paths {
		if !textDocument.MatchString(p) {
			return false
		}
	}
	return true
}

// proseOnlySincePass is whether the work since the last full pass of `command` is text documents alone.
func proseOnlySincePass(root, command string) bool {
	if root == "" || command == "" {
		return false
	}
	head := previousPassHead(root, command)
	return head != "" && onlyTextChangedSince(root, head)
}
