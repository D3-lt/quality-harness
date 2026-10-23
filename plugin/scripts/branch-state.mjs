#!/usr/bin/env node
// branch-state.mjs — what is true of this branch and its CI, stated once, unprompted.
//
// CLAUDE.md §15. It exists because of a measured miss, not a worry. On 2026-09-04
// the CI coverage job went red on `main` at 17:20 and stayed red. Four hours
// later a session ran `bash scripts/selftest.sh`, read exit 0, and reported that
// ten unreleased plugin commits made a release "warranted". Nothing lied: that is
// a different gate answering a different question. Nobody looked at the one that
// was red, because nothing said it out loud and a local green feels like an
// answer (BACKLOG §126).
//
// This is the team-memory wake-up pattern pointed at the repository instead of
// at memory: a SessionStart hook that says the few facts a session would
// otherwise assume. It READS. It never blocks a session, never fails one, and
// exits 0 whatever it finds (CLAUDE.md §3). Could-not-look says so in those
// words and is never rendered as a clean bill (ADR-005) — an absent `gh`, no
// network and a genuinely green branch must not look alike.
//
// `run` is the seam (CLAUDE.md §7): every process this takes comes through it,
// so the whole reader is exercised on any host without a network or a remote.
import { execFileSync, spawn } from 'node:child_process'
import { readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { isatty } from 'node:tty'
import { fileURLToPath } from 'node:url'
import { isMainModule } from './main-module.mjs'
import { findGitDir } from './git-directory.mjs'
import { startPerformanceTrace } from './performance-trace.mjs'
import { stateDir } from './event-log.mjs'
import { REVIEW_COVERING, REVIEWS_FILE } from './host-review.mjs'
/**
 * Where `.git` is, so the cache lands somewhere never tracked and never shipped.
 *
 * ⚠ RETURNS null WHEN GIT CANNOT ANSWER, and that is the whole point. An earlier
 * version fell back to `"."`, which put `qh-branch-state.json` in the process's
 * working directory — a TRACKED directory, where it could overwrite a real file
 * and where a repository-controlled file could then be read back as this tool's
 * own answer. There is no safe default for "I do not know where .git is": the
 * honest response is to use no cache at all.
 */
export function gitDir(run = shell) {
  const answer = run(['git', 'rev-parse', '--git-dir'])
  return answer.ok && answer.out ? answer.out : null
}

/**
 * A runner with ONE deadline for the whole collection, not one per subprocess.
 *
 * The hook host kills this at 20s. `shell` gives every command 15s of its own,
 * and a failing CI answer runs `gh run list` then `gh run view` — two of those
 * alone outlive the budget, and a hook killed by its host is a hook that blocked
 * a prompt. Past the deadline every further command answers "not ok" with the
 * reason, which renders as COULD NOT LOOK rather than as anything green.
 */
// Total wall-clock a hook may spend collecting, on any path. Below the 20s the
// host allows a hook, and short enough that a cold gh reads as COULD NOT LOOK
// instead of a session that will not start.
const BUDGET_MS = 8_000

// ADR-120 T13: the note of a repository no remote of which names a GitHub host. It cannot change by waiting, so the brief says it
// once per session (`permanentFor` in the snapshot), not once per head.
export const NO_GITHUB_NOTE = 'no remote names a GitHub host, so `gh` was not asked'

export function budgeted(totalMs, run = shell, now = Date.now, cwd = null) {
  const deadline = now() + totalMs
  return (argv, options = {}) => {
    const left = deadline - now()
    // `budget: true` marks a command PREVENTED rather than one that answered no.
    // Without it the two are one `ok: false` and the release line renders silence
    // for both — a spent budget reading exactly like "nothing to release", which
    // is ADR-005 broken by the thing that exists to honour it.
    if (left <= 0) {
      return { ok: false, out: '', budget: true, note: `budget of ${totalMs}ms spent before \`${argv.join(' ')}\`` }
    }
    return run(argv, { ...(cwd ? { cwd } : {}), ...options, timeout: Math.min(left, 15_000) })
  }
}
/** Run a command and report what happened, never throwing. */
export function shell(argv, { cwd = process.cwd(), timeout = 15_000, input } = {}) {
  try {
    // ⚠ `LC_ALL=C` IS LOAD-BEARING, not tidiness. Git localises its diagnostics,
    // and this reader distinguishes "positively no tags" from "could not read the
    // tags" by matching git's own words — so under any other locale an untagged
    // repository would fall through to could-not-look and be told so on every
    // prompt for ever. Pinning the language is the fix; a longer regex would only
    // be a bigger guess. It affects nothing else here: every value read is a ref
    // name, a path, a sha, a `rev-list --count` number or JSON — none of them
    // localised.
    const env = { ...process.env, LC_ALL: 'C' }
    // ⚠ `stdio` IS EXPLICIT BECAUSE THE DEFAULT PASSES THE CHILD'S STDERR THROUGH.
    // `execFileSync` captures stderr into `error.stderr` AND writes it to the
    // parent's, so the careful `catch` below — which turns a failure into a quiet
    // `{ ok: false, note }` — was never the only thing the user saw. This reader
    // positively decides that a repository with no tags may be silent, and that a
    // non-GitHub remote means `gh` is not asked; git then printed `fatal: No names
    // found` and `fatal: ambiguous argument 'origin/main...HEAD'` above the header
    // anyway, so an operator could not tell a working reader from a crashed one.
    // The reverse of ADR-005's usual failure, and reported 2026-09-18 from an
    // Ansible repository with a Bitbucket remote. ⚠ This comment claimed
    // `statusline.mjs` imports the same `shell` and so shared the defect; it
    // imports `usableCache` and never calls `shell`. Corrected before release by a
    // different-lineage review — a comment is a claim, and this one was wrong on
    // the day it was written (CLAUDE.md, "Comments Lie — Follow the Code").
    // A child given `input` reads it on stdin; any other gets none, so it never waits on the hook's own.
    // A read-only git call must not take the index lock (`git status` refreshes and rewrites the index, holding .git/index.lock
    // while it does, which fails an agent's own `git add`); `gh` and anything else is left as it was.
    return { ok: true, out: execFileSync(argv[0], argv.slice(1), { cwd, env: argv[0] === 'git' ? { ...env, GIT_OPTIONAL_LOCKS: '0' } : env, timeout, input, encoding: 'utf8',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true }).trim() }
  } catch (error) {
    return { ok: false, out: '', note: (error.stderr || error.message || 'failed').toString().split('\n')[0] }
  }
}

/**
 * The heads of every covering row of the review ledger `host-review.mjs` writes in `directory` (ADR-100 T1), or null when
 * there is no ledger. Newest last, each once, and every one: they reach `git rev-list` on its stdin, so no argv bound drops
 * an old review that still covers HEAD (the first cut kept the newest 64; Codex review of ceea7705).
 */
export function reviewedHeads(directory, read = readFileSync) {
  let text
  try { text = read(join(directory, REVIEWS_FILE), 'utf8') } catch { return null }
  const heads = []
  for (const line of String(text).split('\n')) {
    let row = null
    try { row = JSON.parse(line) } catch { continue }
    if (row && REVIEW_COVERING.has(row.status) && typeof row.head === 'string' && /^[0-9a-f]{40,64}$/.test(row.head)) heads.push(row.head)
  }
  return [...new Set(heads)]
}

/**
 * How many commits on HEAD no reviewed head reaches: a hint for the status line, never release-evidence's answer. An exact
 * `commit <sha>` row reaches its ancestors here too, and a docs commit counts like any other. A head this clone does not hold
 * is ignored rather than failing the count, and a count git could not take is null, never 0.
 */
function unreviewedCount(run, heads) {
  if (heads.length === 0) return null
  const answer = run(['git', 'rev-list', '--count', '--ignore-missing', '--stdin', 'HEAD'], { input: heads.map(head => `^${head}\n`).join('') })
  const out = answer.ok ? String(answer.out).trim() : ''
  return /^\d+$/.test(out) ? Number(out) : null
}

/**
 * What `git describe` says when the repository positively has no tag to describe,
 * as opposed to a failure it could not complete. Only the first may be silent.
 *
 * ⚠ MATCHING GIT'S PROSE ONLY WORKS BECAUSE `shell` PINS `LC_ALL=C`. Git localises
 * its diagnostics, so without that pin an untagged repository under any other
 * locale falls through to "could not read the newest tag" and is told so on every
 * prompt for ever — BACKLOG §152 with a language barrier in front of it. The pin
 * is the fix; a longer regex would only be a bigger guess.
 */
const NO_TAGS = /No names found|cannot describe anything/i

/**
 * Everything the renderer needs, gathered through `run`.
 *
 * Each half is independent: git can answer while `gh` is missing, and the render
 * must be able to say so for one without claiming anything about the other.
 *
 * `checkpoint` is called ONCE with the git half and the release half, before `gh` is
 * attempted. A caller that caches can persist that, so a run killed during the network
 * half still leaves something behind — see `cached`. `clock` is the seam the job-view
 * budget reads (BACKLOG §348).
 */
export function collect(run = shell, checkpoint = () => {}, clock = Date.now, heads = null) {
  const branch = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch.ok) return { looked: false, note: branch.note }
  const head = run(['git', 'rev-parse', '--short', 'HEAD'])
  const dirty = run(['git', 'status', '--short'])
  const counted = run(['git', 'rev-list', '--left-right', '--count', `origin/${branch.out}...HEAD`])
  // The pushed tip, resolved as `snapshotKey` resolves it (the configured upstream, else
  // origin/<branch>), and HEAD whole. Read here, before `gh`, so a spent budget costs the
  // network half rather than these (Codex review of 3.2.1).
  const configured = run(['git', 'rev-parse', '@{upstream}'])
  // A branch with no origin/<branch> that tracks an upstream of another name (a new branch made from
  // origin/master) is counted against that upstream, the one its pushed tip is read from. Counted only
  // against origin/<branch>, it was ahead:null, and nothing said it held a commit no remote did (an
  // outside run, 2026-10-13).
  const counts = counted.ok || !configured.ok ? counted
    : run(['git', 'rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
  const [behind, ahead] = counts.ok ? counts.out.split(/\s+/).map(Number) : [null, null]
  const tip = configured.ok ? configured : run(['git', 'rev-parse', `origin/${branch.out}`])
  const whole = run(['git', 'rev-parse', 'HEAD'])
  const git = {
    looked: true,
    branch: branch.out,
    head: head.ok ? head.out : '(unknown)',
    dirty: dirty.ok ? dirty.out.split('\n').filter(Boolean).length : null,
    ahead, behind,
    // Only where a review ledger exists: a repository that never records a review is told nothing about one.
    ...(heads === null ? {} : { unreviewed: unreviewedCount(run, heads) }),
  }
  // ⚠ THE RELEASE HALF IS GIT ONLY, SO IT IS READ BEFORE `gh` (BACKLOG §348). On a Windows
  // desktop the job views alone took 5.7 s, and the release half, read after them, was the
  // part an 8 s budget lost at SessionStart. Read here it costs about 180 ms and survives.
  const release = releaseHalf(run)
  checkpoint({
    ...git,
    ci: { looked: false, note: 'this answer was stored before the CI half was gathered' },
    ...release,
  })

  // ⚠ ASKING `gh` ABOUT A REPOSITORY IT CANNOT ANSWER FOR IS NOT FREE, AND IT IS
  // PAID ON EVERY CACHE MISS. Reported on a self-hosted GitLab remote (issue #12,
  // Windows 11 / Git Bash): 4,214ms just to fail, and in a live session it did not
  // fail fast — it spent the whole collection budget and the HOST then killed the
  // hook at 20s, discarding the git half along with it, on three prompts in a row.
  //
  // The discriminator is local, needs no network, and costs about 150ms next to
  // the six `git` calls already spawned above. `gh` is not asked where nothing
  // names a GitHub host, and the render says WHY rather than pretending the
  // question was put (ADR-005).
  //
  // ⚠ It matches `github` anywhere in a remote URL, which covers github.com and
  // the usual Enterprise hostnames. A GitHub Enterprise host named something else
  // entirely loses its CI line and is TOLD it lost it — a bounded, visible cost
  // against a hook that was being killed outright on every prompt.
  // ⚠ `git remote -v`, NOT `git config --get-regexp`, AND THE DIFFERENCE IS THE
  // WHOLE OF ADR-005 HERE. `--get-regexp` exits 1 when nothing matched, so the
  // caller must read an exit code to tell "this repository has no remotes" from
  // "the question could not be put" — and a review found that reading unsound on
  // the one platform this was reported from: libuv gives a forcibly killed
  // Windows process exit status 1, which is indistinguishable from git's own
  // no-match. `git remote -v` exits 0 with EMPTY OUTPUT for a repository with no
  // remotes, so the distinction is carried by `ok` alone, where no platform can
  // blur it.
  const remotes = run(['git', 'remote', '-v'])
  const unreadable = !remotes.ok
  const onGitHub = remotes.ok && /github/i.test(remotes.out)
  const RUN_FIELDS = 'headSha,status,conclusion,databaseId,startedAt,event,workflowDatabaseId,workflowName'
  // A detached HEAD has no branch to list runs for. `--branch HEAD` named none, and the by-commit retry below waits for a
  // page with rows, so a detached checkout (the outside-run recipe makes one) read "no run recorded for this branch" while
  // its commit had runs (a Windows outside run, 2026-10-13). It is listed by the commit it is.
  // A detached HEAD whose commit cannot be read is not asked about at all: listed as a branch named HEAD, an upstream
  // fallback of `origin/HEAD` could answer with the default branch's green (the Codex review of 26440a7d).
  const detached = branch.out === 'HEAD'
  const runs = !onGitHub
    ? {
      ok: false,
      out: '',
      note: unreadable
        ? `the remotes could not be read (${remotes.note ?? 'no reason given'}), so \`gh\` was not asked`
        : NO_GITHUB_NOTE,
    }
    : detached && !whole.ok
      ? { ok: false, out: '', note: 'HEAD is detached and its commit could not be read, so `gh` was not asked' }
      : run(['gh', 'run', 'list', ...(detached ? ['--commit', whole.out] : ['--branch', branch.out]),
        '--limit', String(RUN_WINDOW), '--json', RUN_FIELDS])
  let ci = { looked: false, note: runs.ok ? `no run recorded for this ${detached ? 'commit' : 'branch'}` : runs.note }
  if (runs.ok) {
    let rows = []
    try { rows = JSON.parse(runs.out) } catch { rows = [] }
    // HEAD's runs, else the pushed tip's, and no other commit's: where neither has a run,
    // or the tip cannot be read, the answer is COULD NOT LOOK (the owner, 2026-09-30).
    // `gh` has served a page of runs weeks old (2026-09-29 and -30, three times), and
    // the newest run on such a page is an old commit's, not this branch's CI.
    const headSha = whole.ok ? whole.out : git.head
    const tipSha = tip.ok ? tip.out : null
    let answer = headRuns(rows, headSha, tipSha)
    // ⚠ A STALE PAGE IS ASKED AGAIN, BY COMMIT AND THIS BRANCH (BACKLOG §344, the owner,
    // 2026-10-02). Twice more the branch-filtered page was weeks old within a minute of a push,
    // while the same call answered correctly moments later. So a listing with runs, none of them
    // at HEAD or the tip, is asked once more for the pushed tip's (else HEAD's) runs by commit.
    // `--commit` is NOT filtered by branch, so only this branch's rows are kept: a new branch
    // whose upstream is main otherwise read main's red as its own (the review of the first fix).
    // Only then: a listing that answers costs no second call on this per-prompt hook (§19).
    // ⚠ ONE OTHER BRANCH IS THIS COMMIT'S OWN: `land/<the full sha asked about>` (ADR-126). A landing pushes the candidate
    // there, CI runs on it, and main fast-forwards to that sha, so main has no run of its own and every landed HEAD read
    // COULD NOT LOOK (2026-10-23, main at 2a8da294 beside a green land/2a8da294… run). The branch's name states the commit;
    // a `land/` branch naming another sha, or any other branch, is still not this branch's CI.
    // An empty listing asks too: main has no runs of its own under ADR-126, so once its old ones leave the listing, or in a
    // repository that lands from its start, the only run for a landed HEAD is on `land/<sha>` (ultrareview of v3.8.53..main).
    const asked = tipSha ?? headSha
    // Only a full sha names a landing branch: one read short when git could not answer could match `land/<a prefix>`. SHA-1
    // or SHA-256, as tree-facts' full-sha bound reads them.
    const landing = /^[0-9a-f]{40,64}$/.test(String(asked)) ? `land/${asked}` : null
    if (!answer && (rows.length || landing !== null)) {
      const again = run(['gh', 'run', 'list', '--commit', asked,
        '--limit', String(RUN_WINDOW), '--json', `${RUN_FIELDS},headBranch`])
      let retried = []
      if (again.ok) { try { retried = JSON.parse(again.out) } catch { retried = [] } }
      if (!Array.isArray(retried)) retried = []
      retried = retried.filter(r => r && (r.headBranch === branch.out || (landing !== null && r.headBranch === landing)))
      const second = headRuns(retried, headSha, tipSha)
      if (second) { rows = retried; answer = second }
    }
    if (answer) {
      const answering = answer.runs
      const failing = answering.filter(r => r.status === 'completed' && r.conclusion !== 'success')
      const running = answering.find(r => r.status !== 'completed')
      const verdict = failing[0] ?? running ?? answering[0]
      ci = {
        looked: true, sha: String(verdict.headSha).slice(0, 7),
        status: verdict.status, conclusion: verdict.conclusion, failed: [],
        runs: answering.map(r => r.databaseId),
        ...(answer.anchor === 'tip' ? { anchor: 'tip' } : {}),
      }
      // A red run is red however many were not read; a green answer is only as
      // complete as the listing, and a window holding nothing but this commit may
      // have cut off one of its workflows (Codex review of 3.0.2).
      if (!answer.complete && !failing.length) {
        ci = { looked: false, note: `the newest ${rows.length} runs are all at ${ci.sha}, so a workflow listed `
          + 'before them was not read' }
      }
      // ⚠ EACH JOB VIEW IS 1.6–2.5 s ON A WINDOWS DESKTOP (BACKLOG §348, the owner, 2026-10-02).
      // The first red workflow is always viewed; the rest only while the views have spent less
      // than JOB_VIEW_BUDGET_MS. A workflow past it is still named and still red, its jobs said
      // not read, never dropped (ADR-005). A fast host views every one.
      const viewing = clock()
      for (const [index, bad] of failing.filter(r => r.conclusion).entries()) {
        // A job name alone cannot say which workflow failed once two did.
        const where = failing.length > 1 ? `${bad.workflowName || 'a workflow'} (${bad.event ?? 'run'}) / ` : ''
        // Named, not dropped, whether its view was skipped or failed (the review of §348).
        const unread = () => ci.failed.push(`${bad.workflowName || 'a workflow'} (${bad.event ?? 'run'}): ${bad.conclusion} — jobs not read`)
        if (index > 0 && clock() - viewing >= JOB_VIEW_BUDGET_MS) {
          unread()
          continue
        }
        const jobs = run(['gh', 'run', 'view', String(bad.databaseId), '--json', 'jobs'])
        if (!jobs.ok) { unread(); continue }
        try {
          ci.failed.push(...JSON.parse(jobs.out).jobs
            .filter(job => job.conclusion && job.conclusion !== 'success')
            .map(job => `${where}${job.name}: ${job.conclusion}`))
        } catch { /* an unreadable job list names no job; the verdict stands */ }
      }
      // A green answer's jobs, read within the same budget (the first always): a run whose jobs were skipped is not
      // "every job concluded success" (BACKLOG §381 item 8). A view that fails or is past the budget adds nothing, and a
      // listing already cut off at this commit is COULD NOT LOOK, so its jobs are not viewed (the review of v3.8.35..e957da1e).
      if (ci.looked && !failing.length && !running) {
        const skipped = []
        for (const [index, good] of answering.entries()) {
          if (index > 0 && clock() - viewing >= JOB_VIEW_BUDGET_MS) break
          const jobs = run(['gh', 'run', 'view', String(good.databaseId), '--json', 'jobs'])
          if (!jobs.ok) continue
          try {
            skipped.push(...JSON.parse(jobs.out).jobs.filter(job => job.conclusion === 'skipped').map(job => job.name))
          } catch { /* an unreadable job list names no job */ }
        }
        if (skipped.length) ci.skipped = skipped
      }
    } else if (rows.length) {
      const shas = [...new Set(rows.filter(r => r && r.headSha && Number.isSafeInteger(r.databaseId))
        .map(r => String(r.headSha).slice(0, 7)))]
      ci = shas.length
        ? { looked: false, note: `no run listed is at HEAD ${git.head}${tip.ok ? ' or at the pushed tip' : ', and no pushed tip could be read'}; `
          + `the ${rows.length} listed are at ${shas.slice(0, 3).join(', ')}${shas.length > 3 ? ', …' : ''} — CI has not started here, or \`gh\` served an older page` }
        : { looked: false, note: '`gh` listed runs this reader could not order' }
    }
  }

  return {
    ...git,
    ci,
    ...release,
  }
}

// How long `gh run view` calls may run before the remaining red workflows are named without
// their jobs (BACKLOG §348). The first is always viewed.
const JOB_VIEW_BUDGET_MS = 2_000

// WHAT THE RELEASE QUESTION IS ANCHORED TO, AND WHAT THAT ANCHOR CANNOT KNOW.
// `git describe` reads LOCAL refs; `gh release create` — what CLAUDE.md §13.7
// tells you to run — puts the tag on the FORGE. So the machine that cuts the
// releases is the one whose anchor goes stale, and on 2026-09-07 this printed
// "plugin/ changed in 8 file(s) since v2.81.0 — a green shipped change is
// released, not parked" on every prompt while HEAD WAS the newest release. The
// count was true and the conclusion was false (BACKLOG §157).
//
// ⚠ THE FIX IS THE WORDING, NOT A FORGE LOOKUP, AND THAT IS THE SECOND ANSWER
// TO THIS. The first asked `gh release view` and anchored on the published
// release. It worked — and five different-lineage review rounds each found a
// real defect in it, every one in the CLASSIFICATION of how `gh` can fail: a
// spent budget, an auth error, a 404 that means four different things, a draft,
// a release off a divergent branch, a repository not on GitHub at all, and the
// same repository without `gh` installed. The feature's real surface was "how
// many ways can a subprocess fail, and which of them may be silent", and that
// surface is bigger than the defect it was built to fix.
//
// So this reader states what it can OBSERVE and names what it cannot, narrowly:
// `git describe --tags --abbrev=0` gives the newest tag REACHABLE FROM HEAD in
// this clone — not the newest tag the clone holds, and nothing at all about the
// forge. Exact release evidence belongs in `scripts/release-evidence.mjs`, which
// the release procedure already runs and which may take as long as it likes
// (§13.5).
function releaseHalf(run) {
  const tag = run(['git', 'describe', '--tags', '--abbrev=0'])
  const anchor = tag.ok && tag.out ? tag.out : null
  const shipped = anchor ? run(['git', 'diff', '--name-only', `${anchor}..HEAD`, '--', 'plugin/']) : null
  // ⚠ COULD-NOT-LOOK IS NOT "NOTHING TO RELEASE", AND THIS RENDERED THEM ALIKE.
  // `shippedSinceTag` is null for a diff that never ran and 0 for one that ran and
  // found nothing, and the render printed nothing for both — so a collection
  // budget spent on the CI calls produced a clean, green, entirely silent report
  // on a branch with unreleased work. `budgeted` marks a command it PREVENTED,
  // which is what makes the two distinguishable at all.
  const blocked = anchor && !(shipped && shipped.ok)
    ? `the diff from ${anchor} could not be read`
    // ⚠ AND A `git describe` THAT FAILED IS NOT A REPOSITORY WITH NO TAGS. A
    // permission error, a corrupt ref and a transient failure were all silence,
    // because only the budget arm was checked. `No names found` is git POSITIVELY
    // saying there is nothing to describe, and that one may be quiet — every other
    // failure is a question this could not put.
    : !anchor && !(tag.ok || NO_TAGS.test(tag.note ?? ''))
      ? `the newest tag could not be read (${tag.note ?? 'no reason given'})`
      : null
  return {
    tag: anchor,
    shippedSinceTag: shipped && shipped.ok ? shipped.out.split('\n').filter(Boolean).length : null,
    releaseBlocked: blocked,
  }
}

// How many runs one listing asks for. A window whose rows are ALL at the answering
// commit is not known to be complete, and says so rather than reading green.
const RUN_WINDOW = 20

/**
 * The runs that answer for a commit, as `{ sha, runs, complete }`, or null when
 * nothing can be ordered. The commit is HEAD when any listed run is at HEAD; else the
 * pushed tip `upstream`, whose CI is the one running for a branch with local commits
 * ahead. Never another commit's: a listing's newest run may be weeks old.
 *
 * ⚠ `--limit 1` READ ONE RUN, AND WHICH ONE WAS A COIN TOSS (BACKLOG §304). At
 * cdd3bda the push and the dispatched campaign were created in the same second
 * (17:56:53Z); gh listed the CANCELLED push first, so the brief said CANCELLED over
 * a campaign that had concluded `failure` — and the same tie with a green push
 * would have read green over red.
 *
 * ⚠ ONE RUN IS NEITHER ONE WORKFLOW NOR ONE EVENT. This repository's weekly `evals`
 * schedule runs at main's HEAD, and an adopter measured the same day lists `ci`,
 * `platforms` and `e2e` at one sha. And `selftest.yml` keys its concurrency group on
 * the EVENT, so a dispatch never cancels the push: both verdicts stand, and a green
 * dispatch must not hide a red push (Codex review of 3.0.2, which also caught this
 * comment claiming the higher id always wins). So the newest run of each workflow —
 * by `workflowDatabaseId`, since a ruleset workflow lists no name — for each event
 * answers, and the caller reads the worst of them.
 *
 * ⚠ A CANCELLED RUN ANSWERS NOTHING ONCE ITS WORKFLOW RAN TO COMPLETION AT THE SAME
 * COMMIT under another event: the code it would have judged was judged. Alone, it is
 * still an alarm.
 *
 * "Newest" is the latest START, because a re-run keeps its id and moves
 * `startedAt`; the id breaks what the one-second clock cannot.
 */
export function headRuns(rows, head = '', upstream = null) {
  const listed = (Array.isArray(rows) ? rows : [])
    .filter(r => r && r.headSha && Number.isSafeInteger(r.databaseId))
  if (listed.length === 0) return null
  // Whole shas are compared whole. An abbreviated one (HEAD where only `--short` could
  // be read) matches by prefix only when it is 7 to 64 hex digits (SHA-1 or SHA-256, ultrareview of v3.8.53..main) and
  // names exactly one listed commit; an ambiguous or malformed identity names none (Codex review of 3.2.1).
  const HEX = /^[0-9a-f]{7,64}$/i
  const shas = [...new Set(listed.map(r => String(r.headSha)).filter(s => HEX.test(s)))]
  const at = id => {
    if (!id || !HEX.test(id)) return undefined
    const hits = shas.filter(s => (s.length >= 40 && s.length === id.length ? s === id : s.startsWith(id) || id.startsWith(s)))
    return hits.length === 1 ? hits[0] : undefined
  }
  const anchor = at(head) ? 'head' : at(upstream) ? 'tip' : null
  const sha = anchor === 'head' ? at(head) : anchor === 'tip' ? at(upstream) : null
  if (!sha) return null
  const workflowOf = r => String(r.workflowDatabaseId ?? r.workflowName ?? '')
  const started = r => Date.parse(String(r.startedAt ?? ''))
  const later = (a, b) => (started(b) - started(a)) || (b.databaseId - a.databaseId)
  const latest = new Map()
  for (const r of listed.filter(r => r.headSha === sha).sort(later)) {
    const key = `${workflowOf(r)}\u0000${r.event ?? ''}`
    if (!latest.has(key)) latest.set(key, r)
  }
  const chosen = [...latest.values()]
  const judged = new Set(chosen.filter(r => r.status === 'completed' && r.conclusion !== 'cancelled').map(workflowOf))
  const oldest = Math.min(...listed.filter(r => r.headSha === sha).map(r => r.databaseId))
  return {
    sha, anchor,
    runs: chosen.filter(r => !(r.conclusion === 'cancelled' && judged.has(workflowOf(r)))),
    // Complete when the listing is the branch's whole history, or reaches a run at
    // another commit older than every run at this one.
    complete: listed.length < RUN_WINDOW || listed.some(r => r.headSha !== sha && r.databaseId < oldest),
  }
}


/**
 * The state as lines. PURE, and the whole reason the collector takes a seam:
 * every arm below — including the ones that need a red CI or a missing `gh` —
 * is reachable from a test on any host.
 *
 * `brief` is the per-message form. It is ONE line, because this fires on every
 * prompt and a paragraph that appears every prompt is one nobody reads by the
 * third — but it never goes silent when something is wrong: a red CI keeps its
 * ⚠ and its job names in brief too, since the whole point is to be seen.
 */
// Where HEAD stands against its upstream, both ways: a diverged branch said only what it was ahead by and read like an
// unpushed one (a Windows outside run, 2026-10-13).
function drift({ ahead, behind }) {
  const said = [ahead ? `${ahead} ahead` : '', behind ? `${behind} behind` : ''].filter(Boolean)
  return said.length === 0 ? '' : `, ${said.join(' and ')}${behind ? '' : ' of'} origin`
}
const headOf = state => `branch-state: ${state.branch} @ ${state.head}`
  + `${state.dirty === null ? ', cleanliness COULD NOT LOOK'
    : state.dirty ? `, ${state.dirty} uncommitted path(s)` : ', clean'}`
  + drift(state)
export function render(state, { brief = false } = {}) {
  if (!state.looked) return `branch-state: COULD NOT LOOK — ${state.note}. This says nothing about the branch.`
  const head = headOf(state)

  // A tip's answer is the pushed commit's as this clone last fetched it, not HEAD's.
  const named = state.ci.sha
  let ci
  let alarm = false
  if (!state.ci.looked) {
    ci = `COULD NOT LOOK — ${state.ci.note}. NOT a green branch; an unknown one.`
    alarm = true
  } else if (state.ci.status !== 'completed') {
    ci = `${named}: still running. Not finished is not green (§13).`
  } else if (state.ci.conclusion === 'success') {
    ci = state.ci.skipped?.length
      ? `${named}: succeeded; ${state.ci.skipped.length} job(s) skipped — ${brief ? cappedNames(state.ci.skipped) : state.ci.skipped.join(', ')}.`
      : `${named}: every job concluded success.`
  } else {
    ci = `${named}: ${String(state.ci.conclusion).toUpperCase()}`
      + `${state.ci.failed.length ? ` — ${brief ? cappedNames(state.ci.failed) : state.ci.failed.join(', ')}` : ''}`
    alarm = true
  }
  // A tip's answer is the pushed commit's as this clone last fetched it, not HEAD's: said at
  // the end of the line, after the verdict and the runs, so both still follow its sha.
  const tipNote = state.ci.looked && state.ci.anchor === 'tip' ? ' (the pushed tip as last fetched; HEAD has no run)' : ''
  // ⚠ THE ANCHOR IS NAMED AS WHAT IT IS, AND THE ADVICE POINTS RATHER THAN
  // CONCLUDES. `git describe --tags --abbrev=0` gives the newest tag REACHABLE
  // FROM HEAD in this clone — not the newest tag the clone holds, and nothing at
  // all about the forge. It printed "a green shipped change is released, not
  // parked" over four already-published releases before it said so (BACKLOG §157),
  // and a first replacement still claimed a forge tag "is not here", which nothing
  // here observes. A reader who wants the published answer has one command and it
  // is named; a reader who wants the release VERDICT has `release-evidence.mjs`,
  // which §13.5 already makes the only thing that answers "may this be released".
  const counted = state.shippedSinceTag
    ? `plugin/ changed in ${state.shippedSinceTag} file(s) since ${state.tag}, the newest tag `
      + 'reachable from HEAD in this clone — a forge release MAY NOT be tagged here, so check '
      + '`gh release view` before treating this as unreleased (§13).'
    : null
  // A question that could not be put is not an answer of nothing. Silence here
  // reads as "nothing to release", which is the one thing this must never say
  // without having looked (ADR-005). Self-labelling, because the BRIEF form has no
  // `release` column and a bare "COULD NOT LOOK" one dot after the CI verdict
  // reads as a CI failure — and that line fires on every prompt.
  const unknown = state.releaseBlocked
    ? `COULD NOT LOOK at the release state — ${state.releaseBlocked}. `
      + 'That is not "nothing to release".'
    : null
  // Mutually exclusive by construction: `releaseBlocked` is set only when the diff
  // did not come back, and a count exists only when it did. Written as `??` rather
  // than a join for that reason — a join would be a branch nothing can reach.
  const release = counted ?? unknown

  if (brief) {
    return [`${head} · ${alarm ? '⚠ CI ' : 'CI '}${ci}${tipNote}${release ? ` · ${release}` : ''}`,
      ...(alarm ? ['  A LOCAL GREEN GATE DOES NOT ANSWER THIS — the local check and the CI jobs are '
        + 'different checks.'] : [])].join('\n')
  }

  // Which runs answered, in the full form only: the brief stays one short line, and
  // `gh run view <id>` is the next question a reader of this report asks.
  const read = Array.isArray(state.ci.runs) && state.ci.runs.length ? ` (run ${state.ci.runs.join(', ')})` : ''
  const lines = [head, `  ${alarm ? '⚠ CI    ' : 'CI      '} ${ci}${read}`]
  if (alarm && state.ci.looked) {
    // "the local check", not this repository's `scripts/selftest.sh`: the line
    // ships to every adopter, and one read it in a repository that has no such
    // file (peer-run on Windows, 2026-09-23).
    lines.push('           A LOCAL GREEN GATE DOES NOT ANSWER THIS. The local check and the CI '
      + 'jobs are different checks; read this one before planning anything on this branch.')
  }
  if (tipNote) lines.push(`           that is the pushed tip as last fetched; HEAD has no run`)
  if (release) lines.push(`  release  ${release}`)
  lines.push('  This READS. It blocks nothing and judges nothing about your work.')
  return lines.join('\n')
}
// A git config value as git reads it: quotes removed, escapes resolved, and a `;` or
// `#` outside quotes starting a comment. `remote = "origin"` is valid config and was
// read as the name `"origin"`, so a push left the snapshot looking current (Codex
// review of 3.0.0).
function configValue(raw) {
  let out = ''
  let quoted = false
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i]
    if (c === '\\' && i + 1 < raw.length) {
      const next = raw[++i]
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next
    } else if (c === '"') quoted = !quoted
    else if (!quoted && (c === ';' || c === '#')) break
    else out += c
  }
  return out.trim()
}

/**
 * What a snapshot's answer depends on, read from files without spawning Git
 * (ADR-065 T1): the raw HEAD, the sha it resolves to, and the upstream's sha.
 *
 * A clock alone served a commit, a push or a branch switch made inside the window
 * as the previous state's answer. CI here is the newest run for the BRANCH, so a
 * switch at the same sha changes it too — hence the raw HEAD, not only the sha.
 * Null when any part cannot be read: a key that cannot be proved is never equal,
 * so the snapshot is refreshed rather than trusted. An upstream that is configured
 * but not fetched is recorded as such, not as a failure to read.
 */
export function snapshotKey(gitDir) {
  if (!gitDir) return null
  const read = file => { try { return readFileSync(file, 'utf8') } catch { return null } }
  const SHA = /^[0-9a-f]{40,64}$/
  const common = (() => {
    const pointer = read(join(gitDir, 'commondir'))?.trim()
    return pointer ? resolve(gitDir, pointer) : gitDir
  })()
  const ref = name => {
    for (const dir of [gitDir, common]) {
      const loose = read(join(dir, ...name.split('/')))?.trim()
      if (loose && SHA.test(loose)) return loose
    }
    for (const line of (read(join(common, 'packed-refs')) ?? '').split(/\r?\n/)) {
      const [sha, packed] = line.trim().split(' ')
      if (packed === name && SHA.test(sha ?? '')) return sha
    }
    return null
  }
  const head = read(join(gitDir, 'HEAD'))?.trim()
  if (!head) return null
  let sha = null
  let upstream = '-'
  if (SHA.test(head)) {
    sha = head
  } else {
    const branch = head.match(/^ref: (refs\/\S+)$/)?.[1]
    if (!branch) return null
    sha = ref(branch)
    if (branch.startsWith('refs/heads/')) {
      const name = branch.slice('refs/heads/'.length)
      // The ref `collect` measures ahead/behind against when nothing is configured.
      let tracking = `refs/remotes/origin/${name}`
      let section = false
      let remote = null
      let merge = null
      const config = read(join(common, 'config')) ?? ''
      // What this reader does not model could name the upstream — an include, a value
      // continued onto the next line, an escaped or old-style subsection — so the key
      // is unprovable there, and a null key is refreshed rather than trusted. Section
      // names are case-insensitive; the branch name is not (Codex review of 3.0.0,
      // round 2: `[Branch "main"]` read as no section, and a push left the key alone).
      if (/^\s*\[\s*include(?:if)?\b/im.test(config) || /(?:^|[^\\])(?:\\\\)*\\\r?$/m.test(config)) return null
      for (const raw of config.split(/\r?\n/)) {
        const line = raw.trim()
        if (/^\[\s*branch\b/i.test(line)) {
          const header = line.match(/^\[\s*branch\s+"([^"\\]*)"\s*\]\s*(?:[;#].*)?$/i)
          if (!header) return null
          section = header[1] === name
          continue
        }
        if (line.startsWith('[')) { section = false; continue }
        const setting = section && line.match(/^(\w+)\s*=\s*(.*)$/)
        if (setting && setting[1].toLowerCase() === 'remote') remote = configValue(setting[2])
        if (setting && setting[1].toLowerCase() === 'merge') merge = configValue(setting[2])
      }
      if (remote && merge?.startsWith('refs/heads/')) {
        tracking = remote === '.' ? merge : `refs/remotes/${remote}/${merge.slice('refs/heads/'.length)}`
      }
      upstream = ref(tracking) ?? 'unfetched'
    }
  }
  if (!sha) return null
  return JSON.stringify([head, sha, upstream])
}

/** A snapshot this prompt may serve as current: usable, young, whole, and keyed to now. */
export function freshSnapshot(previous, now, maxAgeSeconds, key) {
  return usableCache(previous, now) && (now - previous.at) / 1000 < maxAgeSeconds
    && previous.partial !== true && key != null && previous.key === key
}

/**
 * A cached answer, so the per-message hook does not spawn `gh` on every prompt.
 *
 * The cache lives inside `.git/`, which is never tracked and never shipped, and
 * it carries the time it was taken — a stale answer that SAYS it is stale is
 * usable, one that pretends to be fresh is the thing this whole section is
 * about.
 *
 * ⚠ WHAT IS ON DISK IS NOT EVIDENCE UNTIL IT IS CHECKED. A cache file is an
 * input like any other: a FUTURE timestamp would keep a forged answer fresh for
 * ever, and a malformed `state` threw out of `render` and took the hook's exit
 * code with it — a reader that cannot block a session, blocking a session. Both
 * are now simply refreshed. A cache is a speed-up and is never allowed to be the
 * reason a session is told something wrong.
 */
export function usableCache(previous, now) {
  if (!previous || typeof previous !== 'object') return false
  if (!Number.isFinite(previous.at) || previous.at > now) return false
  const state = previous.state
  if (!state || typeof state !== 'object' || typeof state.looked !== 'boolean') return false
  // Boolean(), not the bare expression: `undefined && …` is undefined, and a
  // predicate that answers undefined is one a caller can read as either.
  return Boolean(state.looked === false || (state.ci && typeof state.ci === 'object'))
}

export function cached(maxAgeSeconds, { read, write, now = Date.now, gather = collect, key = null }) {
  const at = now()
  const previous = read()
  if (freshSnapshot(previous, at, maxAgeSeconds, key)) {
    // Floored at 1: a sub-second age rounded to 0 hid the suffix entirely, so an
    // answer that came from cache was indistinguishable from one just taken.
    return { state: previous.state, ageSeconds: Math.max(1, Math.round((at - previous.at) / 1000)), fromCache: true }
  }
  // ⚠ THE GIT HALF IS CACHED BEFORE THE NETWORK HALF IS ATTEMPTED. `write` used to
  // run only after `gather` returned, so a run the HOST killed left NO cache entry
  // and the next prompt re-paid in full — measured as three consecutive 20s
  // timeouts, none cheaper than the last (issue #12). A completed slow run caches
  // its own COULD NOT LOOK for the whole window; a killed one cached nothing,
  // which is exactly the case that needed the backoff.
  //
  // The checkpoint is a strictly worse answer than the final one and says so in
  // its own notes, so a session that reads it is not misled — it is a floor, not a
  // result.
  // `key` was read before `gather` started: read after, a commit landing mid-collection
  // would label the old state as the new HEAD's (ADR-065 review).
  const state = gather(partial => write({ at, key, partial: true, state: partial }))
  write({ at, key, state })
  return { state, ageSeconds: 0, fromCache: false }
}

/**
 * ciRed says whether CI's answer is a completed run that failed — the one brief an
 * unchanged prompt still repeats. COULD NOT LOOK and a run still in progress are
 * unknowns: said again only when the line changes, because an adopter on a branch
 * with no run yet was told so on every prompt until they pushed (owner, 2026-10-01;
 * CLAUDE.md §15).
 */
export function ciRed(state) {
  if (!state || typeof state !== 'object' || !state.looked) return false
  if (!state.ci || typeof state.ci !== 'object' || !state.ci.looked) return false
  return state.ci.status === 'completed' && state.ci.conclusion !== 'success'
}

// ADR-094 T1: a completed failed run is said in full when its KEY changes and as one line
// otherwise. The key is the sha, the conclusion and the sorted FULL set of failed jobs, never
// the capped text a brief displays: a swapped name past the third would otherwise read as
// "unchanged" over a change. The short line is never stored as `said`, or the next full text
// would be a bounce (full, short, full).
const NAMES_SHOWN = 3
const cappedNames = failed => failed.length > NAMES_SHOWN
  ? `${failed.slice(0, NAMES_SHOWN).join(', ')}, +${failed.length - NAMES_SHOWN} more`
  : failed.join(', ')
export function redKey(state) {
  if (!ciRed(state)) return null
  const failed = Array.isArray(state.ci.failed) ? [...state.ci.failed].sort() : []
  return JSON.stringify([state.ci.sha, String(state.ci.conclusion), failed])
}
const redLine = state => `⚠ CI ${state.ci.sha}: ${String(state.ci.conclusion).toUpperCase()}`
  + `${state.ci.failed?.length ? `, ${state.ci.failed.length} job(s)` : ''}, unchanged`

// Past the show cap a brief says nothing: the old answer is not shown, and a refresh is already
// running. Only a refresh that could not be started is worth a line, and that line carries no
// age (it would change on every prompt), so `said` holds it and it is said once (ADR-094 T1).
export function pastCapLine(refreshing, previous) {
  if (refreshing) return null
  const line = `branch-state: the last answer is past the ${SHOW_AT_MOST_SECONDS / 60}-minute cap, `
    + 'so it is not shown; a refresh could not be started.'
  return previous?.said === line ? null : line
}

// The snapshot is replaced, never rewritten in place. A due brief stamps `said` while the
// refresher it just started writes what it saw, and two truncating writes to one path
// interleave: the push run of e2e210ed read a short refresh over the tail of a long stamp,
// a file neither process wrote, unparseable for the test's whole 60 s guard.
//
// Two fallbacks, both from the Codex review of c341ae93. Windows refuses a rename over a
// file another program holds open without delete sharing, where the in-place write still
// succeeds; a write that may tear once is better than a refresh lost in silence, so the
// file is then written in place as before. And a writer killed between its write and its
// rename leaves its temporary behind under a pid nobody reuses, so each write removes the
// snapshot's temporaries older than a minute — no live writer holds one that long.
const ORPHAN_MS = 60_000
export function replaceFile(file, text, fs = { readdirSync, renameSync, statSync, unlinkSync, writeFileSync }, now = Date.now()) {
  const temporary = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temporary, text)
    fs.renameSync(temporary, file)
  } catch {
    try { fs.unlinkSync(temporary) } catch { /* never written */ }
    fs.writeFileSync(file, text)
  }
  const directory = dirname(file)
  const orphan = new RegExp(`^${basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+\\.tmp$`)
  try {
    for (const name of fs.readdirSync(directory)) {
      if (!orphan.test(name)) continue
      const spare = join(directory, name)
      try { if (now - fs.statSync(spare).mtimeMs > ORPHAN_MS) fs.unlinkSync(spare) } catch { /* another writer took it */ }
    }
  } catch { /* a directory that cannot be listed keeps what it holds */ }
}

// BACKLOG §381 item 13 (from §366): an unknown CI is said once per change, but its brief shares a line with HEAD and the
// dirty count, so every edit reprinted the unknown clause and the alarm line under it. Its key is the brief after the head,
// so it moves only when the clause, the release clause or the alarm does; unchanged, the head's line says one word for it.
// The previous key is read from `said`, which a refresh keeps: a head holds no ` · `, so the first one ends it.
export function unknownKey(state) {
  if (!state || typeof state !== 'object' || !state.looked) return null
  if (!state.ci || typeof state.ci !== 'object' || state.ci.looked) return null
  return render(state, { brief: true }).slice(headOf(state).length)
}
const saidKey = said => (typeof said === 'string' && said.includes(' · ') ? said.slice(said.indexOf(' · ')) : null)

function stampBriefSaid(store, said, redKeyNow, extra = {}) {
  if (!store) return
  try {
    const current = JSON.parse(readFileSync(store, 'utf8'))
    replaceFile(store, JSON.stringify({ ...current, ...(said === undefined ? {} : { said }), ...(redKeyNow === undefined ? {} : { redKey: redKeyNow }), ...extra }))
  } catch { /* a cache that cannot be written is not a failure */ }
}

// ── ADR-065 T2: a due brief is served, and refreshed behind the prompt ─────────
//
// Measured 2026-09-26 (BACKLOG §301): a cache hit costs 0.10 s, a miss 1.28 s, and
// each `gh` call 1.1-2.3 s — paid on the prompt by every brief more than 120 s after
// the last. Serving the snapshot and refreshing it in ONE detached process moves
// that cost off the prompt; the brief says the answer's age and that a refresh is
// running, so an old answer is never presented as a new one.
// The oldest snapshot a brief still shows (the owner's decision, 2026-10-01; BACKLOG §324). One
// hours old was shown, labelled with its age, naming a branch the checkout no longer held; past
// this, the brief says how old the last answer is and that it is refreshing, and shows none of it.
const SHOW_AT_MOST_SECONDS = 600

/**
 * pastShowCap says whether a snapshot `ageMs` old is too old for a brief to show. It
 * compares milliseconds: a rounded age let 600.4 s pass a 600 s cap (Codex review of
 * 01443dd).
 */
export function pastShowCap(ageMs) {
  return ageMs > SHOW_AT_MOST_SECONDS * 1000
}
const LOCK = 'qh-branch-state.lock'
const SCRIPT = fileURLToPath(import.meta.url)

function startRefresher(cwd = process.cwd()) {
  // `stdio: 'ignore'` is what keeps the hook host from waiting on the child: an
  // inherited pipe stays open until the refresher exits (ADR-065 review).
  const child = spawn(process.execPath, [SCRIPT, '--refresh'], {
    cwd, detached: true, stdio: 'ignore', windowsHide: true,
    // Its collection already runs under BUDGET_MS; this is the backstop (BACKLOG §130).
    timeout: BUDGET_MS + 5_000,
  })
  child.unref()
}

/**
 * Start one refresher for this git directory, and say whether one is running.
 *
 * One at a time, by an exclusive lock. A lock older than the collection budget
 * belongs to a refresher that died; it is reclaimed by RENAMING it aside, so of two
 * prompts that both see it stale only one rename succeeds and only one starts.
 */
export function refreshBehind({ gitDir, spawnRefresher = startRefresher, now = Date.now,
  staleAfterMs = BUDGET_MS + 5_000, beforeReclaim = () => {} }) {
  const lock = join(gitDir, LOCK)
  // A token no other prompt writes, so a reclaimer can tell the lock it judged stale
  // from one another prompt put there in the meantime.
  const token = `${process.pid}.${now()}.${Math.random().toString(36).slice(2)}`
  const claim = () => { try { writeFileSync(lock, token, { flag: 'wx' }); return true } catch { return false } }
  if (!claim()) {
    let age = null
    let judged = null
    try { age = now() - statSync(lock).mtimeMs; judged = readFileSync(lock, 'utf8') } catch { age = null }
    if (age !== null && age <= staleAfterMs) return true
    beforeReclaim()
    const aside = `${lock}.${token}`
    try { renameSync(lock, aside) } catch { return age !== null }
    let moved = null
    try { moved = readFileSync(aside, 'utf8') } catch { moved = null }
    if (moved !== judged) {
      // Not the lock judged stale: another prompt reclaimed it first and its refresher
      // is running. Put it back and start nothing (Codex review of 3.0.0).
      try { renameSync(aside, lock) } catch { /* its refresher releases a path that is gone; nothing else */ }
      return true
    }
    try { unlinkSync(aside) } catch { /* the stale lock is out of the way either way */ }
    if (!claim()) return true
  }
  try {
    spawnRefresher()
    return true
  } catch {
    try { unlinkSync(lock) } catch { /* nothing started, so nothing holds it */ }
    return false
  }
}

/**
 * The short HEAD the checkout holds now, when the snapshot's key no longer matches the key read from files this prompt, else
 * null (ADR-065 accepts one stale prompt; it does not accept serving a moved HEAD as current). Null too when either key
 * cannot be read: a claim that HEAD moved needs both ends. No process is started, because both keys come from files.
 */
export function movedSince(stored, live) {
  if (typeof stored !== 'string' || typeof live !== 'string' || stored === live) return null
  try {
    JSON.parse(stored)
    const sha = JSON.parse(live)[1]
    return typeof sha === 'string' && sha ? sha.slice(0, 7) : null
  } catch { return null }
}

// A snapshot served while it is due names the HEAD it was read at, so a HEAD that has moved since is said beside it. The
// live sha is part of what `said` compares and the age is not: a moved HEAD is a change worth saying once, an age never is.
const movedClause = movedTo => ` (moved since this was read: HEAD now ${movedTo}; uncommitted and ahead not re-read)`

// ADR-122 T3: the brief is said again only when what it reports about the branch changed. The working tree's path count moves
// with every edit the agent makes and already knows of; measured 2026-10-22, the brief was about 151k characters of the 368k
// this plugin put into one session's contexts, mostly reprints whose only change was that count. A could-not-look is kept.
const DIRTY_COUNT = /, (?:\d+ uncommitted path\(s\)|clean)(?=,| ·|$)/
export function briefUnchanged(said, text) {
  return typeof said === 'string' && said.replace(DIRTY_COUNT, '') === text.replace(DIRTY_COUNT, '')
}

function emitCachedBranchState(state, { brief, age, previous, store, refreshing = false, stale = false, movedTo = null, session = null }) {
  const claim = movedTo && state.looked ? movedClause(movedTo) : ''
  const head = headOf(state)
  const mark = shown => (claim && shown.startsWith(head) ? `${head}${claim}${shown.slice(head.length)}` : shown)
  const text = mark(render(state, { brief }))
  const key = brief ? redKey(state) : null
  // ADR-120 T13: an unknown no wait can change is said once per session, whatever the head does. A host that names no session
  // cannot key one, and then the unknown is only shortened (below).
  const permanent = brief && session !== null && state.looked && state.ci?.looked === false && state.ci.note === NO_GITHUB_NOTE
  if (permanent && previous?.permanentFor === session) return false
  // Any other line printed ends the session's hearing of it: a repository that gains a remote and loses it again says it again.
  const forget = { permanentFor: permanent ? session : null }
  if (brief && key === null && previous && briefUnchanged(previous.said, text) && !permanent) return false
  // ADR-094 T1: the same red run, already said in full, is one line. It is never stored.
  if (key !== null && previous?.redKey === key) {
    process.stdout.write(`${redLine(state)}\n`)
    if (previous.permanentFor) stampBriefSaid(store, undefined, undefined, forget)
    return true
  }
  const suffix = age ? ` (read ${age}s ago${refreshing ? '; refreshing' : ''})` : ''
  // §381 item 13: the same unknown, already said in full, is the head's line and one word. `said` becomes the full text, so
  // the next unchanged prompt says nothing. Served from a due snapshot it still carries the snapshot's age: it prints that
  // snapshot's HEAD and dirty count, and an unmarked line reads as current.
  const unknown = brief ? unknownKey(state) : null
  if (unknown !== null && !permanent && saidKey(previous?.said) === unknown) {
    process.stdout.write(`${mark(head)} · ⚠ CI COULD NOT LOOK, unchanged${stale ? suffix : ''}\n`)
    stampBriefSaid(store, text, key, forget)
    return true
  }
  process.stdout.write(`${text}${suffix}\n`)
  if (brief) stampBriefSaid(store, text, key, forget)
  return true
}
// The hook payload the host writes to stdin, or {} when there is none: a terminal, an empty pipe, a body that is not an object.
function hookPayload() {
  try {
    if (isatty(0)) return {}
    const parsed = JSON.parse(readFileSync(0, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

// ADR-120 T13: the directory the SESSION works in is the payload's `cwd`, not where the host happened to start this process.
// A payload without a usable directory leaves the process's own (UserPromptSubmit may carry none).
function sessionDirectory(payload) {
  try {
    if (typeof payload.cwd === 'string' && payload.cwd && statSync(payload.cwd).isDirectory()) return resolve(payload.cwd)
  } catch { /* not a directory this process can see */ }
  return process.cwd()
}
function main(argv = process.argv.slice(2)) {
  const brief = argv.includes('--brief')
  const at = argv.indexOf('--cached')
  const finish = startPerformanceTrace('branch-state', JSON.stringify(argv))
  const payload = argv.includes('--refresh') ? {} : hookPayload()
  const dir = sessionDirectory(payload)
  const session = typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : null
  // Cache discovery shares the collection's deadline too. It previously had a
  // separate 15s Git timeout before the reader even began its 8s budget.
  const run = budgeted(BUDGET_MS, shell, Date.now, dir)
  // The review ledger, found the way the hook finds its own state: without starting a process.
  const ledgerHeads = () => reviewedHeads(stateDir(dir, { spawn: false }))
  const read = store => {
    if (!store) return null
    try { return JSON.parse(readFileSync(store, 'utf8')) } catch { return null }
  }
  const writer = store => payload => {
    if (!store) return
    try {
      const current = read(store)
      // Keep `said` across a TTL refresh. Dropping it made every 120s reprint
      // an unchanged green brief (CLAUDE.md §17).
      replaceFile(store, JSON.stringify({ ...payload, said: payload.said ?? current?.said, redKey: payload.redKey ?? current?.redKey,
        permanentFor: payload.permanentFor ?? current?.permanentFor }))
    } catch { /* a cache that cannot be written is not a failure */ }
  }
  if (argv.includes('--refresh')) {
    // ADR-065 T2: the detached refresher. It collects under the same budget, writes
    // the snapshot, prints nothing, and releases the lock the prompt took for it.
    // Found the way the prompt found it, from files: the refresher must still write
    // what it saw when git itself cannot run, or a failed refresh leaves the stale
    // answer standing with nothing to replace it.
    const home = findGitDir(dir)
    try {
      if (home) {
        const store = join(home, 'qh-branch-state.json')
        cached(0, { read: () => read(store), write: writer(store), gather: checkpoint => collect(run, checkpoint, Date.now, ledgerHeads()),
          key: snapshotKey(home) })
      }
    } finally {
      if (home) { try { unlinkSync(join(home, LOCK)) } catch { /* already released */ } }
    }
    finish('refreshed-behind', { status: 0 })
    return 0
  }
  if (at < 0) {
    const state = collect(run, () => {}, Date.now, ledgerHeads())
    process.stdout.write(`${render(state, { brief })}\n`)
    finish(state.looked ? 'refreshed' : 'unavailable', { status: 0 })
    return 0
  }
  const maxAgeSeconds = Number(argv[at + 1]) || 120
  // Ordinary cache hits need no Git process. Explicit Git discovery overrides
  // must still be interpreted by Git, and only Git chooses a cache WRITE path.
  const overridden = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR',
    'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM'].some(key => process.env[key] !== undefined)
  const hint = overridden ? null : findGitDir(dir)
  const previous = read(hint && join(hint, 'qh-branch-state.json'))
  const now = Date.now()
  // A brief never shows an answer past the cap, however long --cached allows: a fresh
  // hit returned before the cap was asked (Codex review of 01443dd).
  const servedFor = brief ? Math.min(maxAgeSeconds, SHOW_AT_MOST_SECONDS) : maxAgeSeconds
  if (freshSnapshot(previous, now, servedFor, hint ? snapshotKey(hint) : null)) {
    const age = Math.max(1, Math.round((now - previous.at) / 1000))
    const store = hint ? join(hint, 'qh-branch-state.json') : null
    emitCachedBranchState(previous.state, { brief, age, previous, store, session })
    finish('cache-hit', { status: 0 })
    return 0
  }
  // A due BRIEF is served from its snapshot and refreshed behind the prompt. The
  // full report (SessionStart) and a missing snapshot are still collected here, so
  // a session's one full answer is never an old one (ADR-065 review, P1).
  if (brief && hint && usableCache(previous, now)) {
    const age = Math.max(1, Math.round((now - previous.at) / 1000))
    const refreshing = refreshBehind({ gitDir: hint, spawnRefresher: () => startRefresher(dir) })
    if (pastShowCap(now - previous.at)) {
      const line = pastCapLine(refreshing, previous)
      if (line) {
        process.stdout.write(`${line}\n`)
        stampBriefSaid(join(hint, 'qh-branch-state.json'), line)
      }
      finish(line ? 'withheld-stale' : 'withheld-stale-again', { status: 0 })
      return 0
    }
    emitCachedBranchState(previous.state, { brief, age, previous, store: join(hint, 'qh-branch-state.json'), refreshing,
      stale: true, movedTo: movedSince(previous.key, snapshotKey(hint)), session })
    finish('served-behind', { status: 0 })
    return 0
  }
  const home = (relative => (relative ? resolve(dir, relative) : null))(gitDir(run))
  const store = home ? join(home, 'qh-branch-state.json') : null
  const { state, fromCache, ageSeconds } = cached(servedFor, {
    read: () => read(store),
    write: writer(store),
    gather: checkpoint => collect(run, checkpoint, Date.now, ledgerHeads()),
    key: home ? snapshotKey(home) : null,
  })
  emitCachedBranchState(state, {
    brief, age: fromCache ? ageSeconds : 0, previous: read(store) ?? previous, store, session,
  })
  finish(fromCache ? 'cache-hit' : state.looked ? 'refreshed' : 'unavailable', { status: 0 })
  return 0
}

if (isMainModule(import.meta.url)) {
  process.exit(main())
}
