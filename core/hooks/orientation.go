// The standing paragraphs a session starts with (plugin/scripts/session-orientation.mjs, install-notices.mjs), the parts of
// the corpus reader SessionStart asks (decision-corpus.mjs: the listing, the archive names), and SessionStart itself
// (on-session-start.mjs, with publish-verdict.mjs's offer of git's hook).
package hooks

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

// pluginRoot is where the plugin lives, as the host names it.
func pluginRoot() string {
	if root := os.Getenv("CLAUDE_PLUGIN_ROOT"); root != "" {
		return root
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(filepath.Dir(exe))
}

// startBaseline is on-session-start.mjs's (ADR-111 T3): the project's check on the tree this session began with, started
// detached so no hook waits on it (ADR-080), and written to its own ledger by `qh-check --baseline`. Startup only, and only where
// a check is named. QUALITY_HARNESS_BASELINE_RUNNER=off turns it off, and a path stands in for qh-check.
func startBaseline(cwd string, session any) {
	setting := os.Getenv("QUALITY_HARNESS_BASELINE_RUNNER")
	if setting == "off" {
		return
	}
	var tree any
	for _, e := range readEvents(cwd, session).E {
		if strict(get(e, "event"), "session.started") {
			if isTrue(dig(e, "observation", "ok")) {
				tree = dig(e, "observation", "tree")
			}
			break
		}
	}
	started, ok := tree.(string)
	if !ok {
		return
	}
	if o := checkCommandOrigin(cwd, nil); o.command == "" || o.origin == "refused" || o.origin == "unproven" {
		return
	}
	runner := setting
	if runner == "" {
		runner = filepath.Join(pluginRoot(), "scripts", "qh-check.mjs")
	}
	node, err := exec.LookPath("node")
	if err != nil {
		node = "node"
	}
	// untimed-spawn: detached on purpose — qh-check bounds its own run (QUALITY_HARNESS_CHECK_TIMEOUT)
	cmd := exec.Command(node, runner, "--baseline", started)
	cmd.Dir = resolvePath(cwd)
	detach(cmd)
	// A baseline that cannot start costs the session nothing but the baseline.
	if cmd.Start() == nil && cmd.Process != nil {
		cmd.Process.Release()
	}
}

var corpusDirNames = []string{"docs/adr", "docs/specs", "docs/decisions", "adr", "specs"}

// listedPath is a path as git listed it, in `/` form.
func listedPath(rel string) string {
	if runtime.GOOS == "windows" {
		return strings.ReplaceAll(rel, `\`, "/")
	}
	return rel
}

func posixListed(rel string) string { return strings.ReplaceAll(rel, `\`, "/") }

// trackedPaths: repository-relative paths git knows about, tracked or untracked-not-ignored; nil when git cannot answer.
func trackedPaths(root string) []string {
	found := []string{}
	seen := map[string]bool{}
	for _, args := range [][]string{{"ls-files", "-z"}, {"ls-files", "--others", "--exclude-standard", "-z"}} {
		r := git(30*time.Second, nil, append([]string{"-C", root, "-c", "core.quotePath=false"}, args...)...)
		if r.err != nil || r.status != 0 {
			return nil
		}
		for _, v := range strings.Split(r.stdout, "\x00") {
			if v != "" && !seen[v] {
				seen[v] = true
				found = append(found, v)
			}
		}
	}
	return found
}

// hasDecisionCorpus: "UNPROVEN" when the listing could not be taken, else "true" or "false".
func hasDecisionCorpus(listing []string) string {
	if listing == nil {
		return "UNPROVEN"
	}
	for _, rel := range listing {
		norm := listedPath(rel)
		for _, dir := range corpusDirNames {
			if norm == dir || strings.HasPrefix(norm, dir+"/") {
				return "true"
			}
		}
	}
	return "false"
}

const archiveLifecycleLine = "**Lifecycle:** Frozen historical ADR records"

var (
	archiveDirectoryName = regexp.MustCompile(`(?i)(?:^|[-_])archived?s?$|^archives?[-_](?:adrs?|decisions?|records?)$`)
	recordShaped         = regexp.MustCompile(`(?i)^(?:adr[-_]?\d+|\d{3,4}-|\d{4}-\d{2}-\d{2}-)`)
	templatesDirectory   = regexp.MustCompile(`(?i)^templates$`)
	uninterestingDir     = regexp.MustCompile(`(?i)^(?:node_modules|vendor|target|dist|build|coverage|__pycache__|__snapshots__|fixtures?|testdata|golden(?:[-_].*)?)$`)
	markdownFile         = regexp.MustCompile(`(?i)\.md$`)
	readmeFile           = regexp.MustCompile(`(?i)(?:^|/)readme\.md$`)
	tasksSegment         = regexp.MustCompile(`(?:^|/)tasks/`)
	lineBreaks           = regexp.MustCompile(`\r?\n`)
)

var decimalDigitRanges = [][2]rune{
	{0x30, 0x39}, {0x660, 0x669}, {0x6F0, 0x6F9}, {0x7C0, 0x7C9}, {0x966, 0x96F}, {0x9E6, 0x9EF},
	{0xA66, 0xA6F}, {0xAE6, 0xAEF}, {0xB66, 0xB6F}, {0xBE6, 0xBEF}, {0xC66, 0xC6F}, {0xCE6, 0xCEF},
	{0xD66, 0xD6F}, {0xDE6, 0xDEF}, {0xE50, 0xE59}, {0xED0, 0xED9}, {0xF20, 0xF29}, {0x1040, 0x1049},
	{0x1090, 0x1099}, {0x17E0, 0x17E9}, {0x1810, 0x1819}, {0x1946, 0x194F}, {0x19D0, 0x19D9},
	{0x1A80, 0x1A89}, {0x1A90, 0x1A99}, {0x1B50, 0x1B59}, {0x1BB0, 0x1BB9}, {0x1C40, 0x1C49},
	{0x1C50, 0x1C59}, {0xA620, 0xA629}, {0xA8D0, 0xA8D9}, {0xA900, 0xA909}, {0xA9D0, 0xA9D9},
	{0xA9F0, 0xA9F9}, {0xAA50, 0xAA59}, {0xABF0, 0xABF9}, {0xFF10, 0xFF19}, {0x104A0, 0x104A9},
	{0x10D30, 0x10D39}, {0x10D40, 0x10D49}, {0x11066, 0x1106F}, {0x110F0, 0x110F9}, {0x11136, 0x1113F},
	{0x111D0, 0x111D9}, {0x112F0, 0x112F9}, {0x11450, 0x11459}, {0x114D0, 0x114D9}, {0x11650, 0x11659},
	{0x116C0, 0x116C9}, {0x116D0, 0x116E3}, {0x11730, 0x11739}, {0x118E0, 0x118E9}, {0x11950, 0x11959},
	{0x11BF0, 0x11BF9}, {0x11C50, 0x11C59}, {0x11D50, 0x11D59}, {0x11DA0, 0x11DA9}, {0x11F50, 0x11F59},
	{0x16130, 0x16139}, {0x16A60, 0x16A69}, {0x16AC0, 0x16AC9}, {0x16B50, 0x16B59}, {0x16D70, 0x16D79},
	{0x1CCF0, 0x1CCF9}, {0x1D7CE, 0x1D7FF}, {0x1E140, 0x1E149}, {0x1E2F0, 0x1E2F9}, {0x1E4F0, 0x1E4F9},
	{0x1E5F1, 0x1E5FA}, {0x1E950, 0x1E959}, {0x1FBF0, 0x1FBF9},
}

func isDecimalDigit(r rune) bool {
	for _, rg := range decimalDigitRanges {
		if r >= rg[0] && r <= rg[1] {
			return true
		}
	}
	return false
}

// specName is SPEC_NAME: `spec` in any case (and the long s), an optional `-` or `_`, then a decimal digit.
func specName(name string) bool {
	rs := []rune(name)
	if len(rs) < 5 {
		return false
	}
	if !(rs[0] == 's' || rs[0] == 'S' || rs[0] == 'ſ') || !(rs[1] == 'p' || rs[1] == 'P') || !(rs[2] == 'e' || rs[2] == 'E') || !(rs[3] == 'c' || rs[3] == 'C') {
		return false
	}
	k := 4
	if rs[k] == '-' || rs[k] == '_' {
		k++
	}
	return k < len(rs) && isDecimalDigit(rs[k])
}

func listedUnderUninterestingDirectory(dirParts []string) bool {
	for _, part := range dirParts {
		if uninterestingDir.MatchString(part) {
			return true
		}
	}
	return false
}

// readRegularText reads a regular file whole; anything else is an error before it is opened.
func readRegularText(file string) (string, error) {
	st, err := os.Stat(file)
	if err != nil {
		return "", err
	}
	if !st.Mode().IsRegular() {
		return "", fmt.Errorf("%s is not a regular file", file)
	}
	b, err := os.ReadFile(file)
	return string(b), err
}

type frozen int

const (
	notFrozen frozen = iota
	isFrozen
	frozenUnknown
)

const readmeUnknown = "\x00unknown"

func listedReadme(directory string, names []string) string {
	spellings := []string{}
	for _, name := range names {
		if strings.ToLower(name) == "readme.md" {
			spellings = append(spellings, name)
		}
	}
	if len(spellings) == 0 {
		return ""
	}
	if len(spellings) > 1 {
		return readmeUnknown
	}
	if spellings[0] == "README.md" {
		return filepath.Join(directory, "README.md")
	}
	text, err := readRegularText(filepath.Join(directory, spellings[0]))
	if err != nil {
		return readmeUnknown
	}
	for _, line := range lineBreaks.Split(text, -1) {
		if line == archiveLifecycleLine {
			return readmeUnknown
		}
	}
	return ""
}

func underFrozenArchive(root string, dirParts []string, cache map[string]frozen, listed []string) frozen {
	unknown := false
	for depth := 0; depth < len(dirParts); depth++ {
		key := strings.Join(dirParts[:depth], "/")
		prefix := ""
		if depth > 0 {
			prefix = key + "/"
		}
		if _, ok := cache[key]; !ok {
			state := notFrozen
			names := []string{}
			for _, rel := range listed {
				if strings.HasPrefix(rel, prefix) && !strings.Contains(rel[len(prefix):], "/") {
					names = append(names, rel[len(prefix):])
				}
			}
			directory := filepath.Join(append([]string{root}, dirParts[:depth]...)...)
			readme := listedReadme(directory, names)
			if readme == readmeUnknown {
				state = frozenUnknown
			} else if readme != "" {
				text, err := readRegularText(readme)
				if err != nil {
					state = frozenUnknown
				} else {
					for _, line := range lineBreaks.Split(text, -1) {
						if line == archiveLifecycleLine {
							state = isFrozen
							break
						}
					}
				}
			}
			cache[key] = state
		}
		if cache[key] == isFrozen {
			return isFrozen
		}
		if cache[key] == frozenUnknown {
			unknown = true
		}
	}
	if unknown {
		return frozenUnknown
	}
	return notFrozen
}

// unmarkedArchives: archive-named directories holding records or tasks with no Lifecycle marker above them, by the name test.
func unmarkedArchives(root string, listing []string) []string {
	if listing == nil {
		return nil
	}
	listed := []string{}
	seen := map[string]bool{}
	for _, rel := range listing {
		p := posixListed(rel)
		if !seen[p] {
			seen[p] = true
			listed = append(listed, p)
		}
	}
	cache := map[string]frozen{}
	found := map[string]bool{}
	for _, rel := range listed {
		if !markdownFile.MatchString(rel) || readmeFile.MatchString(rel) {
			continue
		}
		parts := []string{}
		for _, p := range strings.Split(rel, "/") {
			if p != "" {
				parts = append(parts, p)
			}
		}
		dirs := parts[:len(parts)-1]
		templated := false
		for _, part := range dirs {
			if templatesDirectory.MatchString(part) {
				templated = true
			}
		}
		if templated {
			continue
		}
		task := tasksSegment.MatchString(rel)
		last := parts[len(parts)-1]
		record := recordShaped.MatchString(last) || specName(last)
		if !record && !task {
			continue
		}
		if listedUnderUninterestingDirectory(dirs) {
			continue
		}
		for depth := 1; depth < len(parts); depth++ {
			if !archiveDirectoryName.MatchString(parts[depth-1]) {
				continue
			}
			if underFrozenArchive(root, parts[:depth+1], cache, listed) == notFrozen {
				found[strings.Join(parts[:depth], "/")] = true
			}
			break
		}
	}
	out := []string{}
	for k := range found {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// mrwOnPath: mrw as the platform would resolve it from PATH, named only when it answers `--version` in mrw's own shape.
func mrwOnPath() string {
	if os.Getenv("QUALITY_HARNESS_NO_MRW") == "1" {
		return ""
	}
	windows := runtime.GOOS == "windows"
	name, sep, value := "mrw", ":", os.Getenv("PATH")
	if windows {
		name, sep = "mrw.exe", ";"
		if v, ok := os.LookupEnv("Path"); ok {
			value = v
		}
	}
	for _, dir := range strings.Split(value, sep) {
		if dir == "" {
			continue
		}
		candidate := filepath.Join(dir, name)
		st, err := os.Stat(candidate)
		if err != nil {
			continue
		}
		if !st.Mode().IsRegular() || (!windows && st.Mode().Perm()&0o111 == 0) {
			continue
		}
		out := run(2*time.Second, "", nil, "", candidate, "--version")
		if out.err == nil && out.status == 0 && regexp.MustCompile(`^mrw version v\d+\.\d+`).MatchString(out.stdout) {
			return candidate
		}
		return ""
	}
	return ""
}

var versionSuffix = regexp.MustCompile(`(\d+\.\d+\.\d+)$`)
var versionName = regexp.MustCompile(`^(\d+)\.(\d+)\.(\d+)$`)

// staleVersionNotice: the plugin that is running is not the newest one installed.
func staleVersionNotice() string {
	m := versionSuffix.FindStringSubmatch(pluginRoot())
	if m == nil {
		return ""
	}
	running := m[1]
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	cache := filepath.Join(home, ".claude", "plugins", "cache", "quality-harness", "quality-harness")
	entries, err := os.ReadDir(cache)
	if err != nil {
		return ""
	}
	order := func(name string) int {
		p := versionName.FindStringSubmatch(name)
		if p == nil {
			return -1
		}
		a, _ := strconv.Atoi(p[1])
		b, _ := strconv.Atoi(p[2])
		c, _ := strconv.Atoi(p[3])
		return a*1000000 + b*1000 + c
	}
	newest := ""
	for _, e := range entries {
		name := e.Name()
		if !exists(filepath.Join(cache, name, "scripts", "lifecycle.mjs")) {
			continue
		}
		if newest == "" || order(name) > order(newest) {
			newest = name
		}
	}
	if newest == "" || order(newest) <= order(running) {
		return ""
	}
	return fmt.Sprintf("Heads up: this session is running quality-harness %s, but %s is installed. ", running, newest) +
		"Every gate, skill and template it uses is the older one, and a stale copy is internally " +
		"consistent so nothing else will say so. Restart Claude Code to pick up the newer one."
}

// sessionOrientation: say decides each standing paragraph (ADR-122 Decision 8, session-orientation.mjs), and mark appends its
// said-per-context marker to each one said.
func sessionOrientation(cwd string, say func(text, root string) bool, mark bool) string {
	directory := nearestExistingDirectory(resolvePath(cwd))
	if directory == "" {
		return ""
	}
	found := gitRepositoryLookup(directory)
	repositoryRoot := ""
	if found.ok {
		repositoryRoot = found.root
	}
	root := repositoryRoot
	if root == "" {
		root = directory
	}
	lines := []string{}
	standing := func(text string) {
		if say(text, root) {
			if mark {
				text += "\n" + ItemMarker("standing", text)
			}
			lines = append(lines, text)
		}
	}
	if !found.ok {
		lines = append(lines, fmt.Sprintf("could-not-look: the repository root could not be read (%s). Whether this directory is a repository, and which check it declares, is unknown.", found.reason))
	}
	origin := checkOrigin{origin: "unproven"}
	if found.ok {
		origin = checkCommandOrigin(root, nil)
	}
	check := origin.command
	if origin.origin == "unreadable" {
		standing("Verification: " + origin.problem + ", so no check can pass here and `qh-check` will not guess what it declares. Fix the file.")
	}
	if origin.origin == "refused" {
		standing("Verification: the check declared in `.quality-harness.json` is a constant success and was refused. Declare a command that can fail.")
	} else if check != "" {
		named := "this project's own check is " + checkInCode(check)
		if origin.origin != "declared" {
			named = "no `check` is declared in `.quality-harness.json`; inferred " + checkInCode(check) + " from a manifest — that is not this project's own check, and it may be narrower than this project's own gate (a step the inference did not pick, such as a typecheck or lint), so its pass is not that gate's pass"
		}
		standing("Verification: " + named + ". " +
			"Run it through `qh-check`: that is what records the result where the " +
			"completion and commit advisories read it. The same command run any other " +
			"way still proves the work to you, and leaves them nothing to see.")
	}
	if stale := staleVersionNotice(); stale != "" {
		standing(stale)
	}
	inside := repositoryRoot != ""
	var listing []string
	if inside {
		listing = trackedPaths(root)
		if listing == nil {
			lines = append(lines, "could-not-look: git could not list the tree (UNPROVEN), so corpus existence is not known.")
		}
	}
	corpusLook := "false"
	if inside {
		corpusLook = hasDecisionCorpus(listing)
	}
	if corpusLook == "true" {
		for _, archive := range unmarkedArchives(root, listing) {
			standing(pathInCode(archive) + " looks like an archive but has no Lifecycle marker, so it is read as live — " +
				"`adr-retire-check --adopt <active> <archive>` reports what adopting it needs; it changes nothing (skills/adr-retire §Existing Archives).")
		}
	}
	if (check != "" || corpusLook == "true") && mrwOnPath() != "" {
		standing("mrw is on PATH: read every site you will touch in one `mrw read`, and apply every edit as one `mrw write` plan " +
			"(the `execution` skill's \"Read and edit in batches\").")
	}
	// The standalone-copy notice (install-notices.mjs shadowInstallNotice) is not ported: see ADR-110 T1's divergences.
	return strings.Join(lines, "\n\n")
}

const armingNote = "quality-harness: git's own refusal of an unchecked commit or push has not run yet in this " +
	"session: it takes effect from the next prompt, and until then the text refusal applies (ADR-068)."

func unarmedNote(reason string) string {
	return "quality-harness: git's own refusal of an unchecked commit or push is not armed in this " +
		"session (" + reason + "). A commit or push this hook reads in a command is still refused; one made inside a script or a " +
		"tool the command runs is not, so run `qh-check` before running one (ADR-066)."
}

// awaitingArming: the session was offered git's hook and no hook run has followed the latest offer.
func awaitingArming(entries []any) bool {
	offered := -1
	for i, e := range entries {
		if strict(get(e, "event"), "publish.offered") {
			offered = i
		}
	}
	if offered < 0 {
		return false
	}
	for _, e := range entries[offered+1:] {
		if strict(get(e, "event"), "publish.hook-ran") {
			return false
		}
	}
	return true
}

func armedByGit(entries []any) bool {
	if awaitingArming(entries) {
		return false
	}
	for _, e := range entries {
		if strict(get(e, "event"), "publish.hook-ran") {
			return true
		}
	}
	return false
}

// pluginRootExport is the shell line that names the plugin copy for the session's shell (ADR-120 T4), as the Node writer's.
func pluginRootExport() string {
	return "export QH_PLUGIN_ROOT='" + strings.ReplaceAll(strings.ReplaceAll(pluginRoot(), `\`, "/"), "'", `'\''`) + "'\n"
}

// appendEnvFile appends text to the host's env file, which is only ever appended to.
func appendEnvFile(file, text string) error {
	f, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o666)
	if err != nil {
		return err
	}
	_, err = f.WriteString(text)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return err
}

// publishHookExports are the POSIX shell lines that add git's publish hook for a session (ADR-066 T2).
func publishHookExports() string {
	node, err := exec.LookPath("node")
	if err != nil {
		node = "node"
	}
	script := filepath.Join(pluginRoot(), "scripts", "publish-hook.mjs")
	quote := func(v string) string { return "'" + strings.ReplaceAll(v, "'", `'\''`) + "'" }
	single := func(v string) string {
		return "'" + strings.ReplaceAll(strings.ReplaceAll(v, `\`, "/"), "'", `'\''`) + "'"
	}
	runLine := func(event string) string {
		return "n=" + single(node) + `; [ -x "$n" ] || n=$(command -v node) || n=; ` +
			`[ -n "$n" ] && [ -f ` + single(script) + ` ] || { echo "quality-harness: git's publish hook could not start ` +
			`(node or its script is gone), so this ` + event + ` was not judged" >&2; exit 0; }; exec "$n" ` + single(script) + " " + event
	}
	entries := [][2]string{
		{"hook.qh-publish-commit.command", runLine("prepare-commit-msg")},
		{"hook.qh-publish-commit.event", "prepare-commit-msg"},
		{"hook.qh-publish-commit.enabled", "true"},
		{"hook.qh-publish-push.command", runLine("pre-push")},
		{"hook.qh-publish-push.event", "pre-push"},
		{"hook.qh-publish-push.enabled", "true"},
	}
	out := []string{"# quality-harness (ADR-066): git refuses an unchecked commit or push for this session", "__qh_n=${GIT_CONFIG_COUNT:-0}"}
	for i, kv := range entries {
		out = append(out, fmt.Sprintf("__qh_k=$((__qh_n + %d)); export GIT_CONFIG_KEY_$__qh_k=%s GIT_CONFIG_VALUE_$__qh_k=%s", i, quote(kv[0]), quote(kv[1])))
	}
	out = append(out, fmt.Sprintf("export GIT_CONFIG_COUNT=$((__qh_n + %d))", len(entries)), "unset __qh_n __qh_k", "")
	return strings.Join(out, "\n")
}

var qhprobe = regexp.MustCompile(`\bqhprobe\b`)

// offerPluginRoot names this session's plugin copy in the host's env file, once per file by the line's own text (ADR-120 T4).
// Apart from offerPublishHook on purpose: a git that lists no config hook, or an older git block already in the file, must not
// skip it. Silent where the file is unset or unreadable, which offerPublishHook records.
func offerPluginRoot(cwd string, session any) {
	file := os.Getenv("CLAUDE_ENV_FILE")
	if file == "" {
		return
	}
	existing := ""
	if b, err := os.ReadFile(file); err == nil {
		existing = string(b)
	} else if !os.IsNotExist(err) {
		return
	}
	rootExport := pluginRootExport()
	if strings.Contains("\n"+existing, "\n"+strings.TrimSuffix(rootExport, "\n")+"\n") {
		return
	}
	if err := appendEnvFile(file, rootExport); err != nil {
		appendEvent(cwd, session, O("event", "publish.unarmed", "reason", "the env file could not be written ("+errCode(err, err.Error())+")"))
	}
}

// offerPublishHook offers git's hook for this session through the host's env file, and records what happened.
func offerPublishHook(cwd string, session any) {
	record := func(entry *Obj) { appendEvent(cwd, session, entry) }
	file := os.Getenv("CLAUDE_ENV_FILE")
	if file == "" {
		record(O("event", "publish.unarmed", "reason", "CLAUDE_ENV_FILE is not set"))
		return
	}
	existing := ""
	if b, err := os.ReadFile(file); err == nil {
		existing = string(b)
	} else if !os.IsNotExist(err) {
		record(O("event", "publish.unarmed", "reason", "the env file could not be read ("+errCode(err, err.Error())+")"))
		return
	}
	if strings.Contains(existing, "hook.qh-publish-") {
		return
	}
	probe := run(10*time.Second, cwd, map[string]string{"GIT_OPTIONAL_LOCKS": "0"}, "", "git", "-c", "hook.qhprobe.command=true", "-c", "hook.qhprobe.event=pre-commit", "hook", "list", "pre-commit")
	if probe.err != nil || probe.status != 0 || !qhprobe.MatchString(probe.stdout) {
		why := ""
		if probe.err != nil {
			why = probe.errorCode()
		} else {
			first, _, _ := strings.Cut(strings.TrimSpace(probe.stderr), "\n")
			why = fmt.Sprintf("exit %d: %s", probe.status, first)
		}
		record(O("event", "publish.unarmed", "reason", "git here does not list a config-based hook ("+why+"); git 2.54 or later runs them"))
		return
	}
	err := appendEnvFile(file, publishHookExports())
	if err != nil {
		record(O("event", "publish.unarmed", "reason", "the env file could not be written ("+errCode(err, err.Error())+")"))
		return
	}
	record(O("event", "publish.offered"))
}

func lastOffer(entries []any) any {
	var found any
	for _, e := range entries {
		if strict(get(e, "event"), "publish.offered") || strict(get(e, "event"), "publish.unarmed") {
			found = e
		}
	}
	return found
}

func onSessionStart(h *hookRun, input *Obj) {
	source := input.Get("source")
	session := input.Get("session_id")
	cwd := h.cwd
	if strict(source, "compact") || strict(source, "clear") {
		bumpSessionGeneration(session)
	}
	sweepStaleSessionLogs(cwd, session)
	offerPluginRoot(cwd, session)
	offerPublishHook(cwd, session)
	sections := []string{}
	// ADR-122 Decision 8: a standing paragraph is said once per context (on-session-start.mjs says why).
	keepsMark := strict(source, "startup") || strict(source, "resume") || isUndefined(source)
	saidInput := map[string]any{"agent_id": input.Get("agent_id"), "agent_transcript_path": input.Get("agent_transcript_path"),
		"transcript_path": input.Get("transcript_path")}
	sayStanding := func(text, place string) bool {
		remembered := keepsMark && !firstMentionHere(place, text)
		if !strict(source, "resume") {
			return true
		}
		verdict, _ := SaidInContext(saidInput, "standing", text)
		if verdict == "said" || verdict == "pending" {
			return false
		}
		return verdict == "unsaid" || !remembered
	}
	marked := func(text string) string { return text + "\n" + ItemMarker("standing", text) }
	if orientation := sessionOrientation(cwd, sayStanding, true); orientation != "" {
		sections = append(sections, orientation)
	}
	offer := lastOffer(readEvents(cwd, session).E)
	if strict(get(offer, "event"), "publish.unarmed") && !strict(get(offer, "reason"), "CLAUDE_ENV_FILE is not set") {
		reason := "no reason recorded"
		if r := get(offer, "reason"); !nullish(r) {
			reason = jsString(r)
		}
		note := unarmedNote(reason)
		if sayStanding(note, resolvePath(cwd)) {
			sections = append(sections, marked(note))
		}
	}
	if (strict(source, "compact") || strict(source, "resume")) && awaitingArming(readEvents(cwd, session).E) &&
		(strict(source, "compact") || sayStanding(armingNote, resolvePath(cwd))) {
		sections = append(sections, marked(armingNote))
	}
	if strict(source, "compact") {
		note := readSessionNote(session)
		events := readEvents(cwd, session)
		var owner any = undefined
		for _, e := range events.E {
			if strict(get(e, "event"), "context.compacting") {
				owner = get(e, "compactionId")
			}
		}
		ownerID, ownerIsString := owner.(string)
		tied := !logIncomplete(events) && ownerIsString && strict(get(note, "compaction"), ownerID)
		if tied {
			for _, e := range events.E {
				if strict(get(e, "event"), "note.served") && strict(get(e, "compactionId"), ownerID) {
					tied = false
					break
				}
			}
		}
		c := claim{reason: "untied"}
		if tied {
			c = claimCompaction(session, ownerID)
		}
		served := tied && c.claimed && appendEvent(cwd, session, O("event", "note.served", "compactionId", ownerID))
		if served && truthy(get(note, "text")) {
			sections = append(sections, fmt.Sprintf("What this session was doing before compaction (%s): %s", jsString(get(note, "at")), jsString(get(note, "text"))))
		} else if tied && c.reason != "claimed" {
			sections = append(sections, "quality-harness: the state note for this compaction could not be claimed, so it is not served here.")
		} else if !tied && note != nil {
			sections = append(sections, "quality-harness: the state note kept for this session could not be tied to this compaction, "+
				"so what was unverified before it is unknown here (ADR-005).")
		}
	} else if strict(source, "startup") || isUndefined(source) {
		startBaseline(cwd, session)
		if previous := previousSessionNotice(cwd); previous != "" {
			sections = append(sections, previous)
		}
	}
	if len(sections) > 0 {
		h.emitJSON(O("hookSpecificOutput", O("hookEventName", "SessionStart", "additionalContext", strings.Join(sections, "\n\n"))))
	}
}
