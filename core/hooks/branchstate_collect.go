// Branch state's collection: `collect`, `budgeted`, `shell`, `releaseHalf`, `reviewedHeads`, `unreviewedCount` and `gitDir`
// of plugin/scripts/branch-state.mjs (ADR-135 T2). It answers the same JSON-shaped object, in the same key order, because the
// snapshot it feeds is read by Node (statusline.mjs) as well as by this core. Every process goes through one runner seam.
package hooks

import (
	"bytes"
	"context"
	"errors"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

// bsOpts is what a command is run with: the directory, its stdin (none when empty) and its timeout (the runner's own when 0).
type bsOpts struct {
	Cwd     string
	Input   string
	Timeout time.Duration
}

// bsAnswer is what a command said. Note is a string, or nil where none was given (JavaScript's undefined); Budget marks a
// command the budget PREVENTED, as opposed to one that ran and answered no.
type bsAnswer struct {
	OK     bool
	Out    string
	Note   any
	Budget bool
}

// note is the answer's note as a JSON value: undefined where none was given.
func (a bsAnswer) note() any {
	if a.Note == nil {
		return undefined
	}
	return a.Note
}

type bsRunner func(argv []string, opts bsOpts) bsAnswer

// The whole collection's wall-clock (BUDGET_MS), and one command's own ceiling inside it.
const (
	bsBudgetMs     = 8000
	bsCommandMaxMs = 15000
	// How long `gh run view` calls may run before the remaining workflows are named without their jobs (JOB_VIEW_BUDGET_MS).
	bsJobViewBudgetMs = 2000
)

// bsNoGitHubNote is NO_GITHUB_NOTE.
const bsNoGitHubNote = "no remote names a GitHub host, so `gh` was not asked"

// bsReviewsFile and bsReviewCovering are host-review.mjs's REVIEWS_FILE and REVIEW_COVERING.
const bsReviewsFile = "reviews.jsonl"

var bsReviewCovering = map[string]bool{"clean": true, "blocking": true, "evidence-limited": true}

var (
	// NO_TAGS: git positively saying there is no tag to describe. Matching git's prose works only because bsShell pins LC_ALL=C.
	bsNoTags   = regexp.MustCompile(`(?i)No names found|cannot describe anything`)
	bsDigits   = regexp.MustCompile(`^\d+$`)
	bsGitHub   = regexp.MustCompile(`(?i)github`)
	bsSpaces   = regexp.MustCompile(`\s+`)
	bsDecimal  = regexp.MustCompile(`^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$`)
	bsRunField = "headSha,status,conclusion,databaseId,startedAt,event,workflowDatabaseId,workflowName"
)

// bsShell is `shell`: run a command and report what happened, never failing. LC_ALL=C is load-bearing (NO_TAGS matches git's
// own words), and a read-only git call must not take the index lock. Stdin is empty unless `input` is given, stderr is
// captured into the note, and the child gets no console of its own (run hides it).
func bsShell(argv []string, opts bsOpts) bsAnswer {
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = bsCommandMaxMs * time.Millisecond
	}
	env := map[string]string{"LC_ALL": "C"}
	if argv[0] == "git" {
		env["GIT_OPTIONAL_LOCKS"] = "0"
	}
	res := bsRun(timeout, opts.Cwd, env, opts.Input, argv[0], argv[1:]...)
	if res.err == nil && res.status == 0 {
		return bsAnswer{OK: true, Out: strings.TrimSpace(res.stdout)}
	}
	note := ""
	switch {
	case res.stderr != "":
		note, _, _ = strings.Cut(res.stderr, "\n")
	case res.err != nil:
		note = res.errorMessage(argv[0])
	default:
		note = "Command failed: " + strings.Join(argv, " ")
	}
	return bsAnswer{Note: note}
}

// bsRun is proc.go's run, bounded as ADR-135 Decision 2 needs: the command runs in a process group of its own, and the group is
// ended whenever the command's context ends: at the deadline, and at the deferred cancel once Wait returns, so a grandchild
// outlives neither (bsWatchTree). A grandchild holding the output pipe is waited for up to the command's own timeout, as Node's
// execFileSync waits for it (WaitDelay). Measured 2026-11-01: with run(), `sh -c 'sleep 5 & …; wait'` under a 300ms deadline
// returned after 5.0s and left the sleep running; with Cancel alone, a parent that exited first left it running (the Codex
// review of ad84c084..a2ac47a1). TestBranchStateCollectEndsTheTree and …AfterAnEarlyExit hold both.
func bsRun(timeout time.Duration, dir string, env map[string]string, stdin string, name string, args ...string) runResult {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = environ(env)
	if dir != "" {
		cmd.Dir = dir
	}
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var out, errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut
	hideWindow(cmd)
	bsEndTree(cmd)
	cmd.WaitDelay = bsPipeWait(timeout)
	done := func() bool { return ctx.Err() == context.DeadlineExceeded }
	trace := startProcessTrace(cmd, "", "attempt")
	err := cmd.Start()
	traced := cmd
	if err == nil {
		trace.started(cmd)
		end, adoptErr := bsWatchTree(ctx, cmd)
		if adoptErr != nil {
			traced = winReap(cmd, winReapGrace)
			err = adoptErr
		} else {
			err = cmd.Wait()
		}
		end()
	}
	trace.ended(traced, err, done())
	res := runResult{status: -1, stdout: out.String(), stderr: errOut.String()}
	if ctx.Err() == context.DeadlineExceeded {
		res.timedOut = true
		res.err = ctx.Err()
		return res
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		res.status = exitErr.ExitCode()
		return res
	}
	if err != nil {
		res.err = err
		return res
	}
	res.status = 0
	return res
}

// bsBudgeted is `budgeted`: ONE deadline for the whole collection, each command given what is left of it (at most 15s). Past
// it every command answers not-ok, marked as prevented, with the reason.
func bsBudgeted(totalMs float64, inner bsRunner, now func() float64, cwd string) bsRunner {
	deadline := now() + totalMs
	return func(argv []string, opts bsOpts) bsAnswer {
		left := deadline - now()
		if left <= 0 {
			return bsAnswer{Budget: true, Note: "budget of " + jsNumber(totalMs) + "ms spent before `" + strings.Join(argv, " ") + "`"}
		}
		if cwd != "" && opts.Cwd == "" {
			opts.Cwd = cwd
		}
		ms := left
		if ms > bsCommandMaxMs {
			ms = bsCommandMaxMs
		}
		opts.Timeout = time.Duration(ms * float64(time.Millisecond))
		return inner(argv, opts)
	}
}

// bsGitDir is `gitDir`: where `.git` is, or nil when git cannot answer. There is no safe default directory.
func bsGitDir(run bsRunner) any {
	answer := run([]string{"git", "rev-parse", "--git-dir"}, bsOpts{})
	if answer.OK && answer.Out != "" {
		return answer.Out
	}
	return nil
}

// bsReviewedHeads is `reviewedHeads`: the heads of every covering row of the review ledger in `directory`, newest last, each
// once; nil when there is no ledger, which is not an empty one.
func bsReviewedHeads(directory string) []string {
	text, err := os.ReadFile(filepath.Join(directory, bsReviewsFile))
	if err != nil {
		return nil
	}
	heads := []string{}
	seen := map[string]bool{}
	for _, line := range strings.Split(string(text), "\n") {
		row, err := parseJSON(line)
		if err != nil || !truthy(row) {
			continue
		}
		status, isStatus := get(row, "status").(string)
		head, isHead := get(row, "head").(string)
		if isStatus && bsReviewCovering[status] && isHead && bsFullSha.MatchString(head) && !seen[head] {
			seen[head] = true
			heads = append(heads, head)
		}
	}
	return heads
}

// bsUnreviewedCount is `unreviewedCount`: the commits on HEAD no reviewed head reaches, or null when git could not count.
func bsUnreviewedCount(run bsRunner, heads []string) any {
	if len(heads) == 0 {
		return nil
	}
	var input strings.Builder
	for _, head := range heads {
		input.WriteString("^" + head + "\n")
	}
	answer := run([]string{"git", "rev-list", "--count", "--ignore-missing", "--stdin", "HEAD"}, bsOpts{Input: input.String()})
	out := ""
	if answer.OK {
		out = strings.TrimSpace(answer.Out)
	}
	if !bsDigits.MatchString(out) {
		return nil
	}
	return jsToNumber(out)
}

// jsToNumber is Number(text) for the decimal text git prints: empty is 0, anything unparsable NaN.
func jsToNumber(text string) float64 {
	text = strings.TrimSpace(text)
	if text == "" {
		return 0
	}
	if bsDecimal.MatchString(text) {
		f, _ := strconv.ParseFloat(text, 64)
		return f
	}
	switch text {
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	return math.NaN()
}

// bsLineCount is `out.split('\n').filter(Boolean).length`.
func bsLineCount(out string) float64 {
	n := 0
	for _, line := range strings.Split(out, "\n") {
		if line != "" {
			n++
		}
	}
	return float64(n)
}

// bsSlice7 is `String(v).slice(0, 7)`, counted in UTF-16 units as JavaScript counts them.
func bsSlice7(v any) string {
	units := utf16.Encode([]rune(jsString(v)))
	if len(units) > 7 {
		units = units[:7]
	}
	return string(utf16.Decode(units))
}

// bsReleaseHalf is `releaseHalf`: the newest tag reachable from HEAD, what changed under plugin/ since it, and why either
// could not be read. A `git describe` that failed is not a repository with no tags; only git's own words say that.
func bsReleaseHalf(run bsRunner) *Obj {
	tag := run([]string{"git", "describe", "--tags", "--abbrev=0"}, bsOpts{})
	var anchor any
	if tag.OK && tag.Out != "" {
		anchor = tag.Out
	}
	var shipped *bsAnswer
	if anchor != nil {
		answer := run([]string{"git", "diff", "--name-only", tag.Out + "..HEAD", "--", "plugin/"}, bsOpts{})
		shipped = &answer
	}
	var blocked any
	tagNote := ""
	if !nullish(tag.note()) {
		tagNote = jsString(tag.note())
	}
	switch {
	case anchor != nil && !(shipped != nil && shipped.OK):
		blocked = "the diff from " + tag.Out + " could not be read"
	case anchor == nil && !(tag.OK || bsNoTags.MatchString(tagNote)):
		reason := "no reason given"
		if !nullish(tag.note()) {
			reason = tagNote
		}
		blocked = "the newest tag could not be read (" + reason + ")"
	}
	var count any
	if shipped != nil && shipped.OK {
		count = bsLineCount(shipped.Out)
	}
	return O("tag", anchor, "shippedSinceTag", count, "releaseBlocked", blocked)
}

// bsParseRows is the `JSON.parse` of a run listing: what it parsed to, or an empty list.
func bsParseRows(out string) any {
	rows, err := parseJSON(out)
	if err != nil {
		return []any{}
	}
	return rows
}

// bsRowsLen is `rows.length` where only its truthiness and an array's count are read.
func bsRowsLen(rows any) int {
	arr, _ := rows.([]any)
	return len(arr)
}

// bsJobs is `JSON.parse(out).jobs` read with `.filter(job => job.<key> ...)`: the jobs, or false where JavaScript would throw
// (unparsable text, no `jobs` array, or a null job), which names no job.
func bsJobs(out string) ([]any, bool) {
	parsed, err := parseJSON(out)
	if err != nil || nullish(parsed) {
		return nil, false
	}
	jobs, isList := get(parsed, "jobs").([]any)
	if !isList {
		return nil, false
	}
	for _, job := range jobs {
		if nullish(job) {
			return nil, false
		}
	}
	return jobs, true
}

// collectBranchState is `collect`: the git half, the release half, then the CI half, each independent. `checkpoint` is called
// ONCE with the git and release halves before `gh` is asked; `clock` (ms) is what the job-view budget reads; `heads` are the
// reviewed heads, nil where there is no review ledger.
func collectBranchState(run bsRunner, checkpoint func(any), clock func() float64, heads []string) any {
	none := bsOpts{}
	branch := run([]string{"git", "rev-parse", "--abbrev-ref", "HEAD"}, none)
	if !branch.OK {
		return O("looked", false, "note", branch.note())
	}
	head := run([]string{"git", "rev-parse", "--short", "HEAD"}, none)
	dirty := run([]string{"git", "status", "--short"}, none)
	counted := run([]string{"git", "rev-list", "--left-right", "--count", "origin/" + branch.Out + "...HEAD"}, none)
	configured := run([]string{"git", "rev-parse", "@{upstream}"}, none)
	counts := counted
	if !counted.OK && configured.OK {
		counts = run([]string{"git", "rev-list", "--left-right", "--count", "@{upstream}...HEAD"}, none)
	}
	var behind, ahead any = nil, nil
	if counts.OK {
		parts := bsSpaces.Split(counts.Out, -1)
		behind, ahead = jsToNumber(parts[0]), any(undefined)
		if len(parts) > 1 {
			ahead = jsToNumber(parts[1])
		}
	}
	tip := configured
	if !configured.OK {
		tip = run([]string{"git", "rev-parse", "origin/" + branch.Out}, none)
	}
	whole := run([]string{"git", "rev-parse", "HEAD"}, none)
	shortHead := "(unknown)"
	if head.OK {
		shortHead = head.Out
	}
	var dirtyCount any
	if dirty.OK {
		dirtyCount = bsLineCount(dirty.Out)
	}
	git := O("looked", true, "branch", branch.Out, "head", shortHead, "dirty", dirtyCount, "ahead", ahead, "behind", behind)
	if heads != nil {
		git.Set("unreviewed", bsUnreviewedCount(run, heads))
	}
	// The release half is git only, so it is read before `gh` (BACKLOG §348).
	release := bsReleaseHalf(run)
	merged := func(ci any) *Obj {
		state := git.Clone().Set("ci", ci)
		for _, k := range release.Keys() {
			state.Set(k, release.Get(k))
		}
		return state
	}
	checkpoint(merged(O("looked", false, "note", "this answer was stored before the CI half was gathered")))

	// `gh` is asked only where a remote names a GitHub host, and only `ok` says whether the remotes were read (issue #12).
	remotes := run([]string{"git", "remote", "-v"}, none)
	onGitHub := remotes.OK && bsGitHub.MatchString(remotes.Out)
	detached := branch.Out == "HEAD"
	var runs bsAnswer
	switch {
	case !onGitHub && !remotes.OK:
		reason := "no reason given"
		if !nullish(remotes.note()) {
			reason = jsString(remotes.note())
		}
		runs = bsAnswer{Note: "the remotes could not be read (" + reason + "), so `gh` was not asked"}
	case !onGitHub:
		runs = bsAnswer{Note: bsNoGitHubNote}
	case detached && !whole.OK:
		runs = bsAnswer{Note: "HEAD is detached and its commit could not be read, so `gh` was not asked"}
	default:
		by := []string{"--branch", branch.Out}
		if detached {
			by = []string{"--commit", whole.Out}
		}
		argv := append(append([]string{"gh", "run", "list"}, by...), "--limit", strconv.Itoa(bsRunWindow), "--json", bsRunField)
		runs = run(argv, none)
	}
	var ci *Obj
	if runs.OK {
		subject := "branch"
		if detached {
			subject = "commit"
		}
		ci = O("looked", false, "note", "no run recorded for this "+subject)
	} else {
		ci = O("looked", false, "note", runs.note())
	}
	if runs.OK {
		rows := bsParseRows(runs.Out)
		var headSha any = shortHead
		if whole.OK {
			headSha = whole.Out
		}
		var tipSha any
		if tip.OK {
			tipSha = tip.Out
		}
		answer := bsHeadRuns(rows, headSha, tipSha)
		// A stale page is asked once more by commit; only this branch's rows, or this commit's own landing branch, are kept.
		asked := headSha
		if tipSha != nil {
			asked = tipSha
		}
		landing := ""
		if bsFullSha.MatchString(jsString(asked)) {
			landing = "land/" + jsString(asked)
		}
		if answer == nil && (bsRowsLen(rows) > 0 || landing != "") {
			again := run([]string{"gh", "run", "list", "--commit", jsString(asked), "--limit", strconv.Itoa(bsRunWindow),
				"--json", bsRunField + ",headBranch"}, none)
			var parsed any = []any{}
			if again.OK {
				parsed = bsParseRows(again.Out)
			}
			listed, _ := parsed.([]any)
			retried := []any{}
			for _, r := range listed {
				if truthy(r) && (strict(get(r, "headBranch"), branch.Out) || (landing != "" && strict(get(r, "headBranch"), landing))) {
					retried = append(retried, r)
				}
			}
			if second := bsHeadRuns(retried, headSha, tipSha); second != nil {
				rows, answer = retried, second
			}
		}
		if answer != nil {
			answering, _ := get(answer, "runs").([]any)
			var failing []any
			var running any
			for _, r := range answering {
				if strict(get(r, "status"), "completed") && !strict(get(r, "conclusion"), "success") {
					failing = append(failing, r)
				}
				if running == nil && !strict(get(r, "status"), "completed") {
					running = r
				}
			}
			verdict := running
			if len(failing) > 0 {
				verdict = failing[0]
			}
			if verdict == nil {
				verdict = answering[0]
			}
			ids := []any{}
			for _, r := range answering {
				ids = append(ids, get(r, "databaseId"))
			}
			sha := bsSlice7(get(verdict, "headSha"))
			ci = O("looked", true, "sha", sha, "status", get(verdict, "status"), "conclusion", get(verdict, "conclusion"),
				"failed", []any{}, "runs", ids)
			if strict(get(answer, "anchor"), "tip") {
				ci.Set("anchor", "tip")
			}
			// A red run is red however many were not read; a green answer is only as complete as the listing.
			if !isTrue(get(answer, "complete")) && len(failing) == 0 {
				ci = O("looked", false, "note", "the newest "+strconv.Itoa(bsRowsLen(rows))+" runs are all at "+sha+
					", so a workflow listed before them was not read")
			}
			failed := []any{}
			viewing := clock()
			index := 0
			for _, bad := range failing {
				if !truthy(get(bad, "conclusion")) {
					continue
				}
				name := "a workflow"
				if truthy(get(bad, "workflowName")) {
					name = jsString(get(bad, "workflowName"))
				}
				event := "run"
				if !nullish(get(bad, "event")) {
					event = jsString(get(bad, "event"))
				}
				where := ""
				if len(failing) > 1 {
					where = name + " (" + event + ") / "
				}
				unread := name + " (" + event + "): " + jsString(get(bad, "conclusion")) + " — jobs not read"
				first := index == 0
				index++
				if !first && clock()-viewing >= bsJobViewBudgetMs {
					failed = append(failed, unread)
					continue
				}
				jobs := run([]string{"gh", "run", "view", jsString(get(bad, "databaseId")), "--json", "jobs"}, none)
				if !jobs.OK {
					failed = append(failed, unread)
					continue
				}
				if list, readable := bsJobs(jobs.Out); readable {
					for _, job := range list {
						if truthy(get(job, "conclusion")) && !strict(get(job, "conclusion"), "success") {
							failed = append(failed, where+jsString(get(job, "name"))+": "+jsString(get(job, "conclusion")))
						}
					}
				}
			}
			if ci.Has("failed") {
				ci.Set("failed", failed)
			}
			// A green answer's jobs, read within the same budget: skipped jobs are not "every job concluded success".
			if isTrue(ci.Get("looked")) && len(failing) == 0 && running == nil {
				skipped := []any{}
				for index, good := range answering {
					if index > 0 && clock()-viewing >= bsJobViewBudgetMs {
						break
					}
					jobs := run([]string{"gh", "run", "view", jsString(get(good, "databaseId")), "--json", "jobs"}, none)
					if !jobs.OK {
						continue
					}
					if list, readable := bsJobs(jobs.Out); readable {
						for _, job := range list {
							if strict(get(job, "conclusion"), "skipped") {
								skipped = append(skipped, get(job, "name"))
							}
						}
					}
				}
				if len(skipped) > 0 {
					ci.Set("skipped", skipped)
				}
			}
		} else if bsRowsLen(rows) > 0 {
			listed, _ := rows.([]any)
			var shas []string
			seen := map[string]bool{}
			for _, r := range listed {
				if truthy(r) && truthy(get(r, "headSha")) && isSafeInteger(get(r, "databaseId")) {
					s := bsSlice7(get(r, "headSha"))
					if !seen[s] {
						seen[s] = true
						shas = append(shas, s)
					}
				}
			}
			if len(shas) > 0 {
				where := ", and no pushed tip could be read"
				if tip.OK {
					where = " or at the pushed tip"
				}
				shown := strings.Join(shas[:min(3, len(shas))], ", ")
				if len(shas) > 3 {
					shown += ", …"
				}
				ci = O("looked", false, "note", "no run listed is at HEAD "+shortHead+where+"; the "+strconv.Itoa(len(listed))+
					" listed are at "+shown+" — CI has not started here, or `gh` served an older page")
			} else {
				ci = O("looked", false, "note", "`gh` listed runs this reader could not order")
			}
		}
	}
	return merged(ci)
}
