// What git and the filesystem say about the tree right now, under a bound: plugin/scripts/tree-facts.mjs. A spawn error or a
// timeout is never read as "not a repository" or "nothing changed" (ADR-005).
package hooks

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func tempRoots() []string {
	roots := []string{"/tmp", "/private/tmp", "/var/folders", "/private/var/folders", strings.TrimSuffix(os.TempDir(), string(filepath.Separator))}
	if real, err := filepath.EvalSymlinks(os.TempDir()); err == nil {
		roots = append(roots, real)
	}
	return roots
}

// underTempRoot judges the real location of a path, not its spelling.
func underTempRoot(candidate string) bool { return underTempRootAt(candidate, 0) }

func underTempRootAt(candidate string, depth int) bool {
	if depth > 8 {
		return false
	}
	resolved := resolvePath(candidate)
	if st, err := os.Lstat(resolved); err == nil && st.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(resolved)
		if err == nil {
			if !filepath.IsAbs(target) {
				target = filepath.Join(filepath.Dir(resolved), target)
			}
			return underTempRootAt(target, depth+1)
		}
	}
	if real, err := filepath.EvalSymlinks(resolved); err == nil {
		resolved = real
	} else if anchor := nearestExistingDirectory(resolved); anchor != "" {
		if realAnchor, err := filepath.EvalSymlinks(anchor); err == nil {
			resolved = filepath.Join(realAnchor, relPath(anchor, resolved))
		}
	}
	sep := string(filepath.Separator)
	for _, root := range tempRoots() {
		if resolved == root || strings.HasPrefix(resolved, root+sep) {
			return true
		}
	}
	return false
}

// scratchOutside: under the OS temp root and outside cwd, the session's own directory (tree-facts.mjs scratchOutside,
// BACKLOG §409). Asking whether cwd itself is under the temp root made every temp file the project's own once the checkout
// sat there. A path is inside cwd when its spelling is or its real location is: a write through a link in the project is
// the project's own.
func scratchOutside(file, cwd string) bool {
	if !underTempRoot(file) {
		return false
	}
	real := func(candidate string) string {
		absolute := resolvePath(candidate)
		if resolved, err := filepath.EvalSymlinks(absolute); err == nil {
			return resolved
		}
		if anchor := nearestExistingDirectory(absolute); anchor != "" {
			if realAnchor, err := filepath.EvalSymlinks(anchor); err == nil {
				return filepath.Join(realAnchor, relPath(anchor, absolute))
			}
		}
		return absolute
	}
	outside := func(base, target string) bool {
		relative, err := filepath.Rel(base, target)
		if err != nil {
			return true
		}
		return relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative)
	}
	return outside(resolvePath(cwd), resolvePath(file)) && outside(real(cwd), real(file))
}

// The identity of a repository cannot change inside one hook process (ADR-095 T3): a successful answer is kept, by the
// directory as the file system resolves it and the argument list.
var identityAnswers = map[string]runResult{}

func remembered(directory string, args []string, ask func() runResult) runResult {
	for _, part := range regexp.MustCompile(`[\\/]`).Split(directory, -1) {
		if part == ".." {
			return ask()
		}
	}
	resolved, err := filepath.EvalSymlinks(directory)
	if err != nil {
		return ask()
	}
	key := resolved + "\x00" + strings.Join(args, "\x00")
	if kept, ok := identityAnswers[key]; ok {
		return kept
	}
	answer := ask()
	if answer.err == nil && answer.status == 0 {
		identityAnswers[key] = answer
	}
	return answer
}

// lookup is gitRepositoryLookup's answer: ok false for a look that failed, root "" outside a repository.
type lookup struct {
	ok     bool
	root   string
	reason string
}

func gitRepositoryLookup(directory string) lookup {
	r := remembered(directory, []string{"rev-parse", "--show-toplevel"}, func() runResult {
		return git(5*time.Second, nil, "-C", directory, "rev-parse", "--show-toplevel")
	})
	if r.err != nil || r.status < 0 {
		reason := "git produced no status"
		if r.err != nil {
			reason = r.errorMessage("git")
		}
		return lookup{ok: false, reason: reason}
	}
	if r.status != 0 {
		return lookup{ok: true, reason: "not a repository"}
	}
	printed := strings.TrimSpace(r.stdout)
	if printed == "" {
		return lookup{ok: false, reason: "git printed no root"}
	}
	return lookup{ok: true, root: canonical(printed)}
}

func gitRepositoryRoot(directory string) string {
	found := gitRepositoryLookup(directory)
	if !found.ok {
		return ""
	}
	return found.root
}

// foldsCase is whether paths on this platform compare without case.
func foldsCase() bool { return runtime.GOOS == "windows" || runtime.GOOS == "darwin" }

// locationKey is "here": the repository or directory, realpath'd, case-folded where the filesystem folds it.
func locationKey(root string) string {
	resolved := resolvePath(root)
	if real, err := filepath.EvalSymlinks(resolved); err == nil {
		resolved = real
	}
	if foldsCase() {
		return strings.ToLower(resolved)
	}
	return resolved
}

const observeBudgetDefault = 5000

func observeBudgetMs() int {
	if v, err := strconv.Atoi(os.Getenv("QUALITY_HARNESS_OBSERVE_BUDGET_MS")); err == nil && v > 0 {
		return v
	}
	return observeBudgetDefault
}

type observeFailure struct{ message string }

func (f observeFailure) Error() string { return f.message }

// observe takes the working tree, the index and HEAD as content hashes, over a copy of the index with objects written to a
// temporary directory, the repository's own objects as alternate.
func observe(cwd string) *Obj { return observeWith(cwd, nil, false) }

// observeCarrying is the observation a hook records (ADR-120 T9): observe, and where the project declares `prose`, also the code
// tree of the working tree and of the index and the list they were taken under.
func observeCarrying(cwd string) *Obj {
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	if directory != "" {
		if root := gitRepositoryRoot(directory); root != "" {
			if specs := proseSpecs(root); len(specs) > 0 {
				return observeWith(cwd, specs, true)
			}
		}
	}
	return observe(cwd)
}

type gitRunner func(args []string, env map[string]string, allowed ...int) (runResult, error)

// boundedGit runs git in `directory` within what is left of one observation's budget.
func boundedGit(directory string, started time.Time, budgetMs int) gitRunner {
	return func(args []string, env map[string]string, allowed ...int) (runResult, error) {
		if len(allowed) == 0 {
			allowed = []int{0}
		}
		remaining := time.Duration(budgetMs)*time.Millisecond - time.Since(started)
		if remaining <= 0 {
			return runResult{}, observeFailure{fmt.Sprintf("git took more than %d ms", budgetMs)}
		}
		r := git(remaining, env, append([]string{"-C", directory}, args...)...)
		if r.timedOut {
			return r, observeFailure{fmt.Sprintf("git took more than %d ms", budgetMs)}
		}
		if r.err != nil {
			return r, observeFailure{fmt.Sprintf("git could not run (%s)", r.errorCode())}
		}
		for _, a := range allowed {
			if r.status == a {
				return r, nil
			}
		}
		return r, observeFailure{fmt.Sprintf("git %s exited %d", args[0], r.status)}
	}
}

func topSpecs(without []string) []string {
	out := make([]string, len(without))
	for i, spec := range without {
		out[i] = ":(top)" + spec
	}
	return out
}

// treeWithout is the tree `treeSha` holds with the `without` pathspecs removed, written through a scratch index whose objects go
// to the scratch directory the caller made.
func treeWithout(gitRun gitRunner, env map[string]string, scratch, name, treeSha string, without []string) (string, error) {
	own := map[string]string{}
	for k, v := range env {
		own[k] = v
	}
	own["GIT_INDEX_FILE"] = filepath.Join(scratch, name)
	if _, err := gitRun([]string{"read-tree", treeSha}, own); err != nil {
		return "", err
	}
	if _, err := gitRun(append([]string{"rm", "--cached", "-r", "-q", "--ignore-unmatch", "--"}, topSpecs(without)...), own); err != nil {
		return "", err
	}
	out, err := gitRun([]string{"write-tree"}, own)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out.stdout), nil
}

// observeWith is observe with the `without` paths removed for a code tree; `carry` adds the index's and the list.
func observeWith(cwd string, without []string, carry bool) *Obj {
	budgetMs := observeBudgetMs()
	started := time.Now()
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	if directory == "" {
		return O("ok", false, "reason", "the working directory does not exist")
	}
	scratch := ""
	defer func() {
		if scratch != "" {
			os.RemoveAll(scratch)
		}
	}()
	gitRun := boundedGit(directory, started, budgetMs)
	identity := func(args ...string) (string, error) {
		var failure error
		r := remembered(directory, args, func() runResult {
			res, err := gitRun(args, nil)
			if err != nil {
				failure = err
				if res.status == 0 {
					res.status = -1
				}
				res.err = err
			}
			return res
		})
		if failure != nil {
			return "", failure
		}
		return strings.TrimSpace(r.stdout), nil
	}
	fail := func(err error) *Obj { return O("ok", false, "reason", err.Error()) }
	root, err := identity("rev-parse", "--show-toplevel")
	if err != nil {
		return fail(err)
	}
	indexRel, err := identity("rev-parse", "--git-path", "index")
	if err != nil {
		return fail(err)
	}
	objectsRel, err := identity("rev-parse", "--git-path", "objects")
	if err != nil {
		return fail(err)
	}
	joinAt := func(p string) string {
		if filepath.IsAbs(p) {
			return filepath.Clean(p)
		}
		return filepath.Join(directory, p)
	}
	indexPath, objects := joinAt(indexRel), joinAt(objectsRel)
	head, err := gitRun([]string{"rev-parse", "--verify", "-q", "HEAD"}, nil, 0, 1)
	if err != nil {
		return fail(err)
	}
	scratch, err = os.MkdirTemp(os.TempDir(), "qh-observe-")
	if err != nil {
		scratch = ""
		return fail(err)
	}
	index := filepath.Join(scratch, "index")
	if st, err := os.Stat(indexPath); err == nil {
		if err := copyFile(indexPath, index); err != nil {
			return fail(err)
		}
		// The copy keeps the original's time: git trusts an entry's stat data only while the index file is newer.
		os.Chtimes(index, time.Time{}, st.ModTime())
	}
	if err := os.Mkdir(filepath.Join(scratch, "objects"), 0o777); err != nil {
		return fail(err)
	}
	env := map[string]string{"GIT_INDEX_FILE": index, "GIT_OBJECT_DIRECTORY": filepath.Join(scratch, "objects"), "GIT_ALTERNATE_OBJECT_DIRECTORIES": objects}
	indexTree, err := gitRun([]string{"write-tree"}, env)
	if err != nil {
		return fail(err)
	}
	if _, err := gitRun(append([]string{"add", "-A"}, harnessPathspecs(root)...), env); err != nil {
		return fail(err)
	}
	tree, err := gitRun([]string{"write-tree"}, env)
	if err != nil {
		return fail(err)
	}
	var headValue any
	if head.status == 0 {
		headValue = strings.TrimSpace(head.stdout)
	}
	result := O("ok", true, "tree", strings.TrimSpace(tree.stdout), "index", strings.TrimSpace(indexTree.stdout), "head", headValue)
	if len(without) > 0 {
		if _, err := gitRun(append([]string{"rm", "--cached", "-r", "-q", "--ignore-unmatch", "--"}, topSpecs(without)...), env); err != nil {
			return fail(err)
		}
		codeTree, err := gitRun([]string{"write-tree"}, env)
		if err != nil {
			return fail(err)
		}
		result.Set("codeTree", strings.TrimSpace(codeTree.stdout))
		if carry {
			indexCode, err := treeWithout(gitRun, env, scratch, "index-code", strings.TrimSpace(indexTree.stdout), without)
			if err != nil {
				return fail(err)
			}
			list := make([]any, len(without))
			for i, spec := range without {
				list[i] = spec
			}
			result.Set("indexCodeTree", indexCode).Set("prose", list)
		}
	}
	return result
}

func copyFile(from, to string) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(to)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func sameObservation(a, b any) bool {
	return isTrue(get(a, "ok")) && isTrue(get(b, "ok")) && strict(get(a, "tree"), get(b, "tree")) &&
		strict(get(a, "index"), get(b, "index")) && strict(get(a, "head"), get(b, "head"))
}

// sessionBaseline is the session's first `session.started` whose look at the tree succeeded, or nil.
func sessionBaseline(entries []any) any {
	for _, e := range entries {
		if strict(get(e, "event"), "session.started") && isTrue(dig(e, "observation", "ok")) {
			return e
		}
	}
	return nil
}

// observedClean is whether git lists nothing changed under an observation that succeeded.
func observedClean(cwd string, observation any) bool {
	if !isTrue(get(observation, "ok")) {
		return false
	}
	directory := nearestExistingDirectory(resolvePath(cwd))
	if directory == "" {
		return false
	}
	root := gitRepositoryRoot(directory)
	if root == "" {
		return false
	}
	status := statusPaths(root)
	return !status.failed && len(status.list) == 0
}

// lines is a git enumeration: failed is the one failure signal, and why says what failed.
type lines struct {
	list   []string
	failed bool
	why    string
}

var verbWord = regexp.MustCompile(`^[a-z][a-z-]*$`)

func gitLines(root string, args []string, nul bool) lines {
	r := git(5*time.Second, nil, append([]string{"-C", root}, args...)...)
	if r.err != nil || r.status != 0 {
		verb := args[0]
		for _, a := range args {
			if verbWord.MatchString(a) {
				verb = a
				break
			}
		}
		why := fmt.Sprintf("git %s exited %d", verb, r.status)
		if r.err != nil {
			why = r.errorMessage("git")
		}
		return lines{list: []string{}, failed: true, why: why}
	}
	out := []string{}
	if nul {
		for _, s := range strings.Split(r.stdout, "\x00") {
			if s != "" {
				out = append(out, s)
			}
		}
		return lines{list: out}
	}
	for _, s := range strings.Split(r.stdout, "\n") {
		s = strings.TrimRight(s, " \t\r\n\v\f")
		if s != "" {
			out = append(out, s)
		}
	}
	return lines{list: out}
}

// harnessPathspecs leaves the harness's own data home out of an observation when the host put it inside the repository.
func harnessPathspecs(root string) []string {
	home := os.Getenv("CLAUDE_PLUGIN_DATA")
	if root == "" || home == "" {
		return nil
	}
	relative := relPath(canonical(resolvePath(root)), canonical(resolvePath(home)))
	if relative == "" || strings.HasPrefix(relative, "..") || filepath.IsAbs(relative) {
		return nil
	}
	return []string{"--", ":(top)", ":(top,exclude)" + filepath.ToSlash(relative)}
}

// One status answer per repository for at most two seconds, in a hook process (ADR-095 T5).
type statusMemoEntry struct {
	at    time.Time
	paths []string
}

var statusMemo map[string]statusMemoEntry

func rememberStatus() { statusMemo = map[string]statusMemoEntry{} }

func statusPaths(root string) lines {
	if root == "" {
		return lines{list: []string{}}
	}
	key := ""
	if statusMemo != nil && !hasDotDot(root) {
		key = resolvePath(root)
	}
	if key != "" {
		if kept, ok := statusMemo[key]; ok {
			if elapsed := time.Since(kept.at); elapsed >= 0 && elapsed < 2*time.Second {
				return lines{list: append([]string(nil), kept.paths...)}
			}
		}
	}
	args := append([]string{"-C", root, "status", "--porcelain", "-z", "-uall"}, harnessPathspecs(root)...)
	r := git(5*time.Second, nil, args...)
	if r.err != nil || r.status != 0 {
		why := fmt.Sprintf("git status exited %d", r.status)
		if r.err != nil {
			why = r.errorMessage("git")
		}
		return lines{list: []string{}, failed: true, why: why}
	}
	fields := strings.Split(r.stdout, "\x00")
	paths := []string{}
	for i := 0; i < len(fields); i++ {
		entry := fields[i]
		if utf16Len(entry) < 4 {
			continue
		}
		paths = append(paths, entry[3:])
		if entry[0] == 'R' || entry[0] == 'C' || entry[1] == 'R' || entry[1] == 'C' {
			i++
		}
	}
	if key != "" {
		statusMemo[key] = statusMemoEntry{at: time.Now(), paths: append([]string(nil), paths...)}
	}
	return lines{list: paths}
}

func hasDotDot(p string) bool {
	for _, part := range regexp.MustCompile(`[\\/]`).Split(p, -1) {
		if part == ".." {
			return true
		}
	}
	return false
}

type commit struct {
	sha, tree, subject string
	fastPassed         bool
	codeTree           string
}

type commitList struct {
	list   []*commit
	failed bool
	why    string
}

// sessionCommits are the commits reachable now that were not when the session started.
func sessionCommits(entries []any, root string, head any) commitList {
	baseline := get(sessionBaseline(entries), "observation")
	first := get(baseline, "head")
	headSha, ok := head.(string)
	if root == "" || !ok {
		return commitList{list: []*commit{}}
	}
	unborn := isTrue(get(baseline, "ok")) && first == nil
	firstSha, firstIsString := first.(string)
	if !unborn && (!firstIsString || firstSha == headSha) {
		return commitList{list: []*commit{}}
	}
	rng := headSha
	if !unborn {
		rng = firstSha + ".." + headSha
	}
	ls := gitLines(root, []string{"log", "--format=%H%x09%T%x09%s", rng}, false)
	out := []*commit{}
	for _, line := range ls.list {
		parts := strings.Split(line, "\t")
		c := &commit{sha: parts[0]}
		if len(parts) > 1 {
			c.tree = parts[1]
		}
		if len(parts) > 2 {
			c.subject = strings.Join(parts[2:], "\t")
		}
		if c.sha != "" && c.tree != "" {
			out = append(out, c)
		}
	}
	return commitList{list: out, failed: ls.failed, why: ls.why}
}
