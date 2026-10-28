// A pass stands for a later tree while only declared prose paths differ (ADR-120 T9).
// This contains the declaration, code tree, and carry readers retain after ADR-130 retired publish refusal.
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
// nil while a write git cannot see is outstanding, in this session's log or any other session's, since the code tree speaks for what
// git lists and cannot speak for that write.
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
	c := &carry{codeTree: tree, prose: list}
	if carriedPassUnseen(log, root, c) {
		return nil
	}
	return c
}

// carriedPassUnseen is check-ledger.mjs's: whether a write git cannot see, in any session's log of this repository, follows the
// pass a carry would stand on (the latest check event on that code tree under that list), judged as passedAlready judges it. No
// root says nothing about where to look, so it vetoes nothing.
func carriedPassUnseen(log Log, root string, c *carry) bool {
	if c == nil || root == "" {
		return false
	}
	carried := []any{}
	for _, e := range log.E {
		if isCheckEvent(e) && strict(dig(e, "after", "codeTree"), c.codeTree) && sameProse(get(e, "prose"), c.prose) {
			carried = append(carried, e)
		}
	}
	latest := latestOf(carried, false)
	if latest == nil || !strict(get(latest, "event"), "check.passed") {
		return false
	}
	seq := -1
	if n, ok := get(latest, "seq").(float64); ok {
		seq = int(n)
	}
	return unseenWriteSince(root, "checksSeen", seq, dateParse(dig(latest, "before", "at")))
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
