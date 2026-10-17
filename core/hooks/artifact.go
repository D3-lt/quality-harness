// Rule A and the artifact pass (plugin/scripts/artifact-pass.mjs): the gates over everything this session changed, less what
// a gate already answered for the same bytes. The pass writes its own ledger and the session log imports it. It runs here,
// inline and bounded, never detached (ADR-110 Decision 4); the gates themselves stay JavaScript and shell, run by name.
package hooks

import (
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	unresolvedDeletionMutation = "<Unresolved Bash deletion>"
	artifactGateTimeoutMs      = 30000
	artifactGateKillMarginMs   = 5000
	passBudgetMs               = 300000
	passGraceMs                = artifactGateKillMarginMs + 1000
	passChunk                  = 8
)

var budgetPattern = regexp.MustCompile(`timed out after \d+ms`)

func artifactGateTimeout() int {
	v, err := strconv.Atoi(os.Getenv("QUALITY_HARNESS_SHELL_TIMEOUT_MS"))
	if err != nil || v < 100 {
		return artifactGateTimeoutMs
	}
	return min(v, 110000)
}

func passBudget() float64 {
	if v := jsNumberOf(os.Getenv("QUALITY_HARNESS_ARTIFACT_PASS_BUDGET_MS")); os.Getenv("QUALITY_HARNESS_ARTIFACT_PASS_BUDGET_MS") != "" && !math.IsNaN(v) && !math.IsInf(v, 0) && v > 0 {
		return v
	}
	if raw, ok := os.LookupEnv("QUALITY_HARNESS_ARTIFACT_BUDGET_MS"); ok {
		if v := jsNumberOf(raw); !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 {
			return v
		}
	}
	return passBudgetMs
}

func deletedTrackedPaths(cwd string) ([]string, bool) {
	root := git(10*time.Second, nil, "-C", cwd, "rev-parse", "--show-toplevel")
	if root.err != nil || root.status != 0 {
		return nil, false
	}
	deleted := git(10*time.Second, nil, "-C", cwd, "-c", "core.quotePath=false", "diff", "--no-renames", "--name-only", "--diff-filter=D", "HEAD")
	if deleted.err != nil || deleted.status != 0 {
		return nil, false
	}
	top := strings.TrimSpace(root.stdout)
	out := []string{}
	for _, line := range strings.Split(deleted.stdout, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			out = append(out, filepath.Join(top, line))
		}
	}
	return out, true
}

type gateResults struct {
	gated   map[string]bool
	said    map[string]string
	saidOrd []string
	stopped string
}

// runArtifactGates hands paths to the facts-first dispatcher through run-shell-hook.mjs, and says what failed.
func runArtifactGates(paths []string, cwd string, windowMs float64, bases []string, results *gateResults, ledgerDirectory string) string {
	root := pluginRoot()
	if !exists(filepath.Join(root, "scripts", "facts-gate-dispatch.sh")) {
		return ""
	}
	runner := filepath.Join(root, "scripts", "run-shell-hook.mjs")
	if !exists(runner) {
		return "Artifact validation failed:\nThe cross-platform shell-hook runner is missing."
	}
	deadline := nowMs() + windowMs
	failures := []string{}
	targets := []string{}
	seen := map[string]bool{}
	add := func(p string) {
		if !seen[p] {
			seen[p] = true
			targets = append(targets, p)
		}
	}
	unique := map[string]bool{}
	for _, file := range paths {
		if unique[file] {
			continue
		}
		unique[file] = true
		if file == unresolvedDeletionMutation {
			deleted, ok := deletedTrackedPaths(cwd)
			if !ok {
				failures = append(failures, "A Bash deletion used an unresolved path and Git cannot say what is missing here; the facts-first gate cannot determine whether an ADR archive was removed. Use an explicit path.")
				continue
			}
			for _, d := range deleted {
				add(d)
			}
			continue
		}
		if !filepath.IsAbs(file) {
			continue
		}
		if underTempRoot(file) && !underTempRoot(cwd) {
			continue
		}
		add(file)
	}
	ownLedger := ""
	if ledgerDirectory == "" && len(targets) > 1 {
		if dir, err := os.MkdirTemp(os.TempDir(), "quality-harness-gates-"); err == nil {
			ownLedger, ledgerDirectory = dir, dir
		}
	}
	defer func() {
		if ownLedger != "" {
			os.RemoveAll(ownLedger)
		}
	}()
	ledger := ""
	if ledgerDirectory != "" {
		ledger = filepath.ToSlash(filepath.Join(ledgerDirectory, "adr"))
	}
	if len(targets) > 0 {
		remaining := deadline - nowMs()
		if remaining < 1000 {
			failures = append(failures, fmt.Sprintf("The boundary's %ds window was exhausted before %s was gated. ", int(math.Round(windowMs/1000)), targets[0])+
				"This is a budget, not a finding: gate fewer artifacts per boundary, or commit in smaller sets.\n"+
				"UNRUN — all remaining artifacts were not checked:\n"+strings.Join(targets, "\n"))
		} else {
			request := O("paths", targets, "deadline", deadline, "windowMs", windowMs, "timeoutMs", float64(artifactGateTimeout()), "cwd", cwd)
			if results.said != nil {
				request.Set("said", true)
			}
			env := map[string]string{"QUALITY_HARNESS_ADR_LEDGER": ledger}
			if len(bases) > 0 {
				env["QUALITY_HARNESS_HISTORY_BASES"] = strings.Join(bases, " ")
			}
			node, err := exec.LookPath("node")
			if err != nil {
				node = "node"
			}
			r := run(time.Duration(remaining+artifactGateKillMarginMs)*time.Millisecond, "", env, stringify(request), node, runner, "facts-gate-dispatch.sh", "--batch")
			for _, line := range strings.Split(r.stdout, "\n") {
				if strings.TrimSpace(line) == "" {
					continue
				}
				result, err := parseJSON(line)
				if err != nil {
					continue
				}
				if gated, ok := get(result, "gated").(string); ok {
					results.gated[gated] = isTrue(get(result, "complete"))
					if said, ok := get(result, "said").(string); ok && results.said != nil && strings.TrimSpace(said) != "" {
						if _, had := results.said[gated]; !had {
							results.saidOrd = append(results.saidOrd, gated)
						}
						results.said[gated] = said
					}
				}
				if stopped, ok := get(result, "stopped").(string); ok {
					results.stopped = stopped
				}
			}
			said := strings.TrimSpace(r.stderr)
			if r.status != 0 || said != "" {
				detail := said
				if detail == "" {
					if r.err != nil {
						detail = r.errorMessage(node)
					} else {
						detail = fmt.Sprintf("artifact gate exited %s", statusText(r))
					}
				}
				if r.status != 0 {
					detail += "\nThe runner did not complete; these artifacts may be unchecked:\n" + strings.Join(targets, "\n")
				}
				if r.status != 0 && (budgetPattern.MatchString(detail) || r.timedOut) {
					failures = append(failures, detail+"\nThe runner exhausted its time budget. This is a budget, not a finding "+
						fmt.Sprintf("about the listed artifacts; the whole pass is capped at %ds.", int(math.Round(windowMs/1000))))
				} else {
					failures = append(failures, detail)
				}
			}
		}
	}
	if len(failures) > 0 {
		return "Artifact validation failed:\n" + strings.Join(failures, "\n")
	}
	return ""
}

func statusText(r runResult) string {
	if r.status < 0 {
		return "null"
	}
	return strconv.Itoa(r.status)
}

// answeredBlobs: every blob each path was gated COMPLETE on.
func answeredBlobs(entries []any) map[string]map[string]bool {
	answered := map[string]map[string]bool{}
	for _, e := range entries {
		p, ok := get(e, "path").(string)
		if !strict(get(e, "event"), "artifact.gated") || !ok || !isTrue(get(e, "complete")) {
			continue
		}
		if answered[p] == nil {
			answered[p] = map[string]bool{}
		}
		answered[p][stringify(orNull(get(e, "blob")))] = true
	}
	return answered
}

func alreadyAnswered(answered map[string]map[string]bool, file string, identity any) bool {
	blobs, ok := answered[file]
	if !ok || identity == nil {
		return false
	}
	return blobs[stringify(identity)]
}

func passFiles(cwd string, session string) (directory, ledger, lock string) {
	directory = filepath.Join(stateDir(cwd), "passes")
	name := unsafeSessionChars.ReplaceAllString(session, "_")
	return directory, filepath.Join(directory, name+".jsonl"), filepath.Join(directory, name+".lock")
}

type passClaim struct {
	token    string
	deadline float64
	err      string
}

var tokenUnsafe = regexp.MustCompile(`[^A-Za-z0-9-]`)

// claimPassLock creates a session's pass lock exclusively; a lock past its deadline is reclaimed by one claimant.
func claimPassLock(lock string, budgetMs float64) *passClaim {
	now := nowMs()
	token := randomUUID()
	deadline := now + budgetMs + passGraceMs
	body := stringify(O("token", token, "pid", float64(os.Getpid()), "deadline", deadline))
	create := func(p string) error {
		f, err := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o666)
		if err != nil {
			return err
		}
		_, err = f.WriteString(body)
		f.Close()
		return err
	}
	err := create(lock)
	if err == nil {
		return &passClaim{token: token, deadline: deadline}
	}
	if !os.IsExist(err) {
		return &passClaim{err: errCode(err, err.Error())}
	}
	var held any
	if text, err := os.ReadFile(lock); err == nil {
		held, _ = parseJSON(string(text))
	}
	heldDeadline := math.NaN()
	if d, ok := get(held, "deadline").(float64); ok {
		heldDeadline = d
	} else if s, ok := get(held, "deadline").(string); ok {
		heldDeadline = jsNumberOf(s)
	}
	if math.IsNaN(heldDeadline) || math.IsInf(heldDeadline, 0) {
		m, ok := mtimeMs(lock)
		if !ok {
			return nil
		}
		heldDeadline = m + budgetMs + passGraceMs
	}
	if now <= heldDeadline {
		return nil
	}
	name := fmt.Sprintf("torn-%d", int64(math.Round(heldDeadline)))
	if t, ok := get(held, "token").(string); ok {
		name = tokenUnsafe.ReplaceAllString(t, "")
	}
	successor := lock + ".next-" + name
	if err := create(successor); err != nil {
		if m, ok := mtimeMs(successor); ok && nowMs()-m > passGraceMs {
			os.Remove(successor)
		}
		return nil
	}
	var current any
	if text, err := os.ReadFile(lock); err == nil {
		current, _ = parseJSON(string(text))
	}
	if held != nil {
		if !strict(get(current, "token"), get(held, "token")) {
			os.Remove(successor)
			return nil
		}
	} else if current != nil {
		os.Remove(successor)
		return nil
	}
	if err := os.Rename(successor, lock); err != nil {
		os.Remove(successor)
		return nil
	}
	return &passClaim{token: token, deadline: deadline}
}

func releasePassLock(lock, token string) {
	text, err := os.ReadFile(lock)
	if err != nil {
		return
	}
	held, err := parseJSON(string(text))
	if err != nil {
		return
	}
	deadline := math.NaN()
	switch d := get(held, "deadline").(type) {
	case float64:
		deadline = d
	case string:
		deadline = jsNumberOf(d)
	}
	if strict(get(held, "token"), token) && nowMs() <= deadline {
		os.Remove(lock)
	}
}

func passKey(entry any, words string) string {
	said := sha256Hex(words)[:16]
	if strict(get(entry, "event"), "pass.gated") {
		blob := "unknown-" + jsString(get(entry, "pass"))
		if b := get(entry, "blob"); !nullish(b) {
			blob = jsString(b)
		}
		complete := "incomplete"
		if isTrue(get(entry, "complete")) {
			complete = "complete"
		}
		return jsString(get(entry, "path")) + ":" + blob + ":" + complete + ":" + said
	}
	return "pass:" + said
}

// passFindingsQueued: keys this process has already queued, since a hook may import twice before deliver records anything.
var passFindingsQueued = map[string]bool{}

type finding struct{ key, text string }

// importPassVerdicts copies the pass ledger's new verdicts into the session log and queues each finding as rule A once.
func (h *hookRun) importPassVerdicts(channel, recipient string) {
	cwd, session := h.cwd, jsString(h.session)
	_, ledger, lock := passFiles(cwd, session)
	text := ""
	if b, err := os.ReadFile(ledger); err == nil {
		text = string(b)
	}
	log := readEvents(cwd, h.session)
	started := []any{}
	for _, e := range log.E {
		if strict(get(e, "event"), "artifact.pass") && isString(get(e, "token")) {
			started = append(started, e)
		}
	}
	if text == "" && len(started) == 0 {
		return
	}
	imported := map[string]bool{}
	said := map[string]bool{}
	for _, e := range log.E {
		if strict(get(e, "event"), "artifact.gated") && isString(get(e, "pass")) {
			imported[jsString(get(e, "pass"))+"\x00"+jsString(get(e, "path"))] = true
		}
		if strict(get(e, "event"), "action.emitted") && strict(get(e, "rule"), "A") && reachedChannel(e, channel, recipient) {
			said[stringify(get(e, "key"))] = true
		}
	}
	entries := []any{}
	for _, line := range strings.Split(text, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		entry, err := parseJSON(line)
		if err != nil {
			continue
		}
		if isString(get(entry, "pass")) {
			entries = append(entries, entry)
		}
	}
	lastBlob := map[string]any{}
	for _, e := range entries {
		if p, ok := get(e, "path").(string); ok && strict(get(e, "event"), "pass.gated") {
			lastBlob[p] = orNull(get(e, "blob"))
		}
	}
	superseded := func(e any) bool {
		blob, ok := get(e, "blob").(string)
		p := strOr(get(e, "path"))
		last, lastOK := lastBlob[p].(string)
		return ok && lastOK && last != blob && !strict(contentId(p), blob)
	}
	findings := []finding{}
	ended := map[string]bool{}
	for _, e := range entries {
		if strict(get(e, "event"), "pass.ended") {
			ended[jsString(get(e, "pass"))] = true
		}
		words := ""
		if s, ok := get(e, "findings").(string); ok {
			words = jsTrim(s)
		}
		if p, ok := get(e, "path").(string); ok && strict(get(e, "event"), "pass.gated") {
			id := jsString(get(e, "pass")) + "\x00" + p
			if !imported[id] {
				imported[id] = true
				appendEvent(cwd, h.session, O("event", "artifact.gated", "path", p, "blob", orNull(get(e, "blob")),
					"complete", isTrue(get(e, "complete")), "pass", get(e, "pass")))
			}
			if words != "" && !superseded(e) {
				findings = append(findings, finding{passKey(e, words), words})
			}
		} else if strict(get(e, "event"), "pass.finding") && words != "" {
			findings = append(findings, finding{passKey(e, words), words})
		}
	}
	var holder any
	if b, err := os.ReadFile(lock); err == nil {
		holder, _ = parseJSON(string(b))
	}
	for _, pass := range started {
		token := jsString(get(pass, "token"))
		if ended[token] {
			continue
		}
		if strict(get(holder, "token"), token) {
			deadline := math.NaN()
			switch d := get(holder, "deadline").(type) {
			case float64:
				deadline = d
			case string:
				deadline = jsNumberOf(d)
			}
			if nowMs() <= deadline {
				continue
			}
		}
		findings = append(findings, finding{"pass-lost:" + token,
			"UNRUN — the artifact pass started at " + jsString(get(pass, "at")) + " left no end in its ledger: it was stopped, or could not write there. What it did not gate is gated again at the next boundary."})
	}
	first := true
	for _, f := range findings {
		keyJSON := stringify(f.key)
		if said[keyJSON] || passFindingsQueued[f.key] {
			continue
		}
		said[keyJSON] = true
		passFindingsQueued[f.key] = true
		text := f.text
		if first {
			text = "Artifact validation failed:\n" + text
		}
		h.queue(action{rule: "A", key: f.key, text: text})
		first = false
	}
}

func (h *hookRun) artifactRule(rec *recorded) {
	session, ok := h.session.(string)
	if !ok || session == "" {
		return
	}
	cwd := h.cwd
	h.importPassVerdicts("", "")
	log := readEvents(cwd, h.session)
	baseline := get(sessionBaseline(log.E), "observation")
	first := get(baseline, "head")
	directory := nearestExistingDirectory(resolvePath(cwd))
	root := ""
	if directory != "" {
		root = gitRepositoryRoot(directory)
	}
	paths := []string{}
	seen := map[string]bool{}
	add := func(p string) {
		if !seen[p] {
			seen[p] = true
			paths = append(paths, p)
		}
	}
	if firstSha, isSha := first.(string); root != "" && isSha {
		for _, rel := range gitLines(root, []string{"diff", "--name-only", "-z", firstSha}, true).list {
			add(filepath.Join(root, rel))
		}
	} else if root != "" && isTrue(get(baseline, "ok")) && first == nil {
		for _, rel := range gitLines(root, []string{"ls-tree", "-r", "--name-only", "-z", "HEAD"}, true).list {
			add(filepath.Join(root, rel))
		}
	}
	if root != "" {
		for _, rel := range statusPaths(root).list {
			add(filepath.Join(root, rel))
		}
	}
	for _, e := range log.E {
		if p, ok := get(e, "path").(string); ok && strict(get(e, "event"), "file.written") && isTrue(get(e, "observable")) {
			add(p)
		}
	}
	answered := answeredBlobs(log.E)
	identities := map[string]any{}
	for _, p := range paths {
		identities[p] = contentId(p)
	}
	targets := []string{}
	for _, p := range paths {
		if filepath.IsAbs(p) && !(underTempRoot(p) && !underTempRoot(cwd)) && !alreadyAnswered(answered, p, identities[p]) {
			targets = append(targets, p)
		}
	}
	if len(targets) == 0 {
		return
	}
	var head any
	if isTrue(get(rec.observation(), "ok")) {
		head = get(rec.observation(), "head")
	}
	bases := []string{}
	for _, b := range []any{first, head, "HEAD"} {
		if s, ok := b.(string); ok && s != "" {
			dup := false
			for _, have := range bases {
				dup = dup || have == s
			}
			if !dup {
				bases = append(bases, s)
			}
		}
	}
	h.startArtifactPass(targets, identities, bases)
}

// startArtifactPass claims the session's lock and runs the pass in this process, bounded by its budget.
func (h *hookRun) startArtifactPass(targets []string, identities map[string]any, bases []string) {
	cwd, session := h.cwd, jsString(h.session)
	unrun := func(why string) {
		key := "unrun:" + why
		for _, e := range readEvents(cwd, h.session).E {
			if strict(get(e, "event"), "action.emitted") && strict(get(e, "rule"), "A") && strict(get(e, "key"), key) &&
				reachedChannel(e, channelOf(h.event, "agent"), h.recipient()) {
				return
			}
		}
		h.queue(action{rule: "A", key: key, text: fmt.Sprintf("Artifact validation UNRUN: the pass over %d changed artifact(s) could not be started (%s). Nothing was checked; the next boundary tries again.", len(targets), why)})
	}
	directory, ledger, lock := passFiles(cwd, session)
	if err := os.MkdirAll(directory, 0o777); err != nil {
		unrun("its directory could not be made: " + errCode(err, err.Error()))
		return
	}
	budget := passBudget()
	c := claimPassLock(lock, budget)
	if c == nil {
		return
	}
	if c.err != "" {
		unrun("its lock could not be made: " + c.err)
		return
	}
	appendEvent(cwd, h.session, O("event", "artifact.pass", "token", c.token, "targets", float64(len(targets))))
	runArtifactPass(cwd, ledger, lock, c.token, budget, c.deadline-passGraceMs, bases, targets, identities)
	h.importPassVerdicts("", "")
}

// runArtifactPass gates the targets a chunk at a time and appends each verdict with what its gate said as ONE ledger line.
func runArtifactPass(cwd, ledger, lock, token string, budgetMs, deadline float64, bases, targets []string, blobs map[string]any) {
	write := func(entry *Obj) {
		row := O("at", isoNow(), "pass", token)
		for _, k := range entry.keys {
			row.Set(k, entry.vals[k])
		}
		appendLine(ledger, stringify(row)+"\n")
	}
	write(O("event", "pass.started", "pid", float64(os.Getpid()), "targets", targets))
	ledgerDirectory, err := os.MkdirTemp(os.TempDir(), "quality-harness-gates-")
	if err != nil {
		ledgerDirectory = ""
	}
	reason := passTargets(targets, deadline, budgetMs, write, func(chunk []string, remaining float64, results *gateResults) string {
		return runArtifactGates(chunk, cwd, remaining, bases, results, ledgerDirectory)
	}, func(file string) (any, bool) {
		before := orNull(blobs[file])
		return before, before != nil && strict(before, contentId(file))
	})
	if ledgerDirectory != "" {
		os.RemoveAll(ledgerDirectory)
	}
	write(O("event", "pass.ended", "reason", reason))
	releasePassLock(lock, token)
}

func passTargets(paths []string, deadline, budgetMs float64, write func(*Obj), gate func([]string, float64, *gateResults) string, verdict func(string) (any, bool)) string {
	for index := 0; index < len(paths); index += passChunk {
		remaining := deadline - nowMs()
		if remaining < 1000 {
			write(O("event", "pass.finding", "findings", fmt.Sprintf("UNRUN — the pass's %ds budget ended before these artifacts were gated; the next boundary takes them:\n%s", int(math.Round(budgetMs/1000)), strings.Join(paths[index:], "\n"))))
			return "budget"
		}
		chunk := paths[index:min(index+passChunk, len(paths))]
		results := &gateResults{gated: map[string]bool{}, said: map[string]string{}}
		failure := gate(chunk, remaining, results)
		for _, file := range chunk {
			complete, ok := results.gated[file]
			if !ok {
				continue
			}
			blob, steady := verdict(file)
			var findings any
			if s, ok := results.said[file]; ok {
				findings = s
			}
			write(O("event", "pass.gated", "path", file, "blob", blob, "complete", complete && steady, "findings", findings))
		}
		rest := strings.TrimPrefix(failure, "Artifact validation failed:\n")
		for _, file := range results.saidOrd {
			rest = strings.ReplaceAll(rest, jsTrim(results.said[file]), "")
		}
		if jsTrim(rest) != "" {
			write(O("event", "pass.finding", "findings", jsTrim(rest)))
		}
		if results.stopped != "" {
			if left := paths[min(index+passChunk, len(paths)):]; len(left) > 0 {
				write(O("event", "pass.finding", "findings", fmt.Sprintf("UNRUN — the pass stopped (%s) before these artifacts were gated; the next boundary takes them:\n%s", results.stopped, strings.Join(left, "\n"))))
			}
			return "stopped: " + results.stopped
		}
	}
	return "done"
}
