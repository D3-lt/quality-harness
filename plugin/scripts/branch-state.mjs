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
// This is the agentsmemory wake-up pattern pointed at the repository instead of
// at memory: a SessionStart hook that says the few facts a session would
// otherwise assume. It READS. It never blocks a session, never fails one, and
// exits 0 whatever it finds (CLAUDE.md §3). Could-not-look says so in those
// words and is never rendered as a clean bill (ADR-005) — an absent `gh`, no
// network and a genuinely green branch must not look alike.
//
// `run` is the seam (CLAUDE.md §7): every process this takes comes through it,
// so the whole reader is exercised on any host without a network or a remote.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { findGitDir } from './git-directory.mjs'
import { startPerformanceTrace } from './performance-trace.mjs'
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

export function budgeted(totalMs, run = shell, now = Date.now) {
  const deadline = now() + totalMs
  return argv => {
    const left = deadline - now()
    // `budget: true` marks a command PREVENTED rather than one that answered no.
    // Without it the two are one `ok: false` and the release line renders silence
    // for both — a spent budget reading exactly like "nothing to release", which
    // is ADR-005 broken by the thing that exists to honour it.
    if (left <= 0) {
      return { ok: false, out: '', budget: true, note: `budget of ${totalMs}ms spent before \`${argv.join(' ')}\`` }
    }
    return run(argv, { timeout: Math.min(left, 15_000) })
  }
}
/** Run a command and report what happened, never throwing. */
export function shell(argv, { cwd = process.cwd(), timeout = 15_000 } = {}) {
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
    return { ok: true, out: execFileSync(argv[0], argv.slice(1), { cwd, env, timeout, encoding: 'utf8' }).trim() }
  } catch (error) {
    return { ok: false, out: '', note: (error.stderr || error.message || 'failed').toString().split('\n')[0] }
  }
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
 * `checkpoint` is called ONCE with the git half, before `gh` is attempted. A
 * caller that caches can persist that, so a run killed during the network half
 * still leaves something behind — see `cached`.
 */
export function collect(run = shell, checkpoint = () => {}) {
  const branch = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch.ok) return { looked: false, note: branch.note }
  const head = run(['git', 'rev-parse', '--short', 'HEAD'])
  const dirty = run(['git', 'status', '--short'])
  const counts = run(['git', 'rev-list', '--left-right', '--count', `origin/${branch.out}...HEAD`])
  const [behind, ahead] = counts.ok ? counts.out.split(/\s+/).map(Number) : [null, null]
  const git = {
    looked: true,
    branch: branch.out,
    head: head.ok ? head.out : '(unknown)',
    dirty: dirty.ok ? dirty.out.split('\n').filter(Boolean).length : null,
    ahead, behind,
  }
  checkpoint({
    ...git,
    ci: { looked: false, note: 'this answer was stored before the CI half was gathered' },
    tag: null, shippedSinceTag: null,
    releaseBlocked: 'this answer was stored before the release half was read',
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
  const runs = onGitHub
    ? run(['gh', 'run', 'list', '--branch', branch.out, '--limit', '1',
      '--json', 'headSha,status,conclusion,databaseId'])
    : {
      ok: false,
      out: '',
      note: unreadable
        ? `the remotes could not be read (${remotes.note ?? 'no reason given'}), so \`gh\` was not asked`
        : 'no remote names a GitHub host, so `gh` was not asked',
    }
  let ci = { looked: false, note: runs.ok ? 'no run recorded for this branch' : runs.note }
  if (runs.ok) {
    let rows = []
    try { rows = JSON.parse(runs.out) } catch { rows = [] }
    const newest = rows[0]
    if (newest) {
      ci = {
        looked: true, sha: String(newest.headSha).slice(0, 7),
        status: newest.status, conclusion: newest.conclusion, failed: [],
      }
      if (newest.conclusion && newest.conclusion !== 'success') {
        const jobs = run(['gh', 'run', 'view', String(newest.databaseId), '--json', 'jobs'])
        if (jobs.ok) {
          try {
            ci.failed = JSON.parse(jobs.out).jobs
              .filter(job => job.conclusion && job.conclusion !== 'success')
              .map(job => `${job.name}: ${job.conclusion}`)
          } catch { ci.failed = [] }
        }
      }
    }
  }

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
    ...git,
    ci,
    tag: anchor,
    shippedSinceTag: shipped && shipped.ok ? shipped.out.split('\n').filter(Boolean).length : null,
    releaseBlocked: blocked,
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
export function render(state, { brief = false } = {}) {
  if (!state.looked) return `branch-state: COULD NOT LOOK — ${state.note}. This says nothing about the branch.`
  const head = `branch-state: ${state.branch} @ ${state.head}`
    + `${state.dirty === null ? ', cleanliness COULD NOT LOOK'
      : state.dirty ? `, ${state.dirty} uncommitted path(s)` : ', clean'}`
    + `${state.ahead ? `, ${state.ahead} ahead of origin` : ''}`

  let ci
  let alarm = false
  if (!state.ci.looked) {
    ci = `COULD NOT LOOK — ${state.ci.note}. NOT a green branch; an unknown one.`
    alarm = true
  } else if (state.ci.status !== 'completed') {
    ci = `${state.ci.sha}: still running. Not finished is not green (§13).`
  } else if (state.ci.conclusion === 'success') {
    ci = `${state.ci.sha}: every job concluded success.`
  } else {
    ci = `${state.ci.sha}: ${String(state.ci.conclusion).toUpperCase()}`
      + `${state.ci.failed.length ? ` — ${state.ci.failed.join(', ')}` : ''}`
    alarm = true
  }
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
    return [`${head} · ${alarm ? '⚠ CI ' : 'CI '}${ci}${release ? ` · ${release}` : ''}`,
      ...(alarm ? ['  A LOCAL GREEN GATE DOES NOT ANSWER THIS — `selftest.sh` and the CI jobs are '
        + 'different checks.'] : [])].join('\n')
  }

  const lines = [head, `  ${alarm ? '⚠ CI    ' : 'CI      '} ${ci}`]
  if (alarm && state.ci.looked) {
    lines.push('           A LOCAL GREEN GATE DOES NOT ANSWER THIS. `scripts/selftest.sh` and the CI '
      + 'jobs are different checks; read this one before planning anything on this branch.')
  }
  if (release) lines.push(`  release  ${release}`)
  lines.push('  This READS. It blocks nothing and judges nothing about your work.')
  return lines.join('\n')
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

export function cached(maxAgeSeconds, { read, write, now = Date.now, gather = collect }) {
  const at = now()
  const previous = read()
  if (usableCache(previous, at) && (at - previous.at) / 1000 < maxAgeSeconds) {
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
  const state = gather(partial => write({ at, state: partial }))
  write({ at, state })
  return { state, ageSeconds: 0, fromCache: false }
}

function main(argv = process.argv.slice(2)) {
  const brief = argv.includes('--brief')
  const at = argv.indexOf('--cached')
  const finish = startPerformanceTrace('branch-state', JSON.stringify(argv))
  // Cache discovery shares the collection's deadline too. It previously had a
  // separate 15s Git timeout before the reader even began its 8s budget.
  const run = budgeted(BUDGET_MS)
  if (at < 0) {
    const state = collect(run)
    process.stdout.write(`${render(state, { brief })}\n`)
    finish(state.looked ? 'refreshed' : 'unavailable', { status: 0 })
    return 0
  }
  const maxAgeSeconds = Number(argv[at + 1]) || 120
  const read = store => {
    if (!store) return null
    try { return JSON.parse(readFileSync(store, 'utf8')) } catch { return null }
  }
  // Ordinary cache hits need no Git process. Explicit Git discovery overrides
  // must still be interpreted by Git, and only Git chooses a cache WRITE path.
  const overridden = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR',
    'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM'].some(key => process.env[key] !== undefined)
  const hint = overridden ? null : findGitDir(process.cwd())
  const previous = read(hint && join(hint, 'qh-branch-state.json'))
  const now = Date.now()
  if (usableCache(previous, now) && (now - previous.at) / 1000 < maxAgeSeconds) {
    const age = Math.max(1, Math.round((now - previous.at) / 1000))
    process.stdout.write(`${render(previous.state, { brief })} (read ${age}s ago)\n`)
    finish('cache-hit', { status: 0 })
    return 0
  }
  const home = gitDir(run)
  const store = home ? join(home, 'qh-branch-state.json') : null
  const { state, fromCache, ageSeconds } = cached(maxAgeSeconds, {
    read: () => read(store),
    write: payload => { if (!store) return; try { writeFileSync(store, JSON.stringify(payload)) } catch { /* a cache that cannot be written is not a failure */ } },
    gather: checkpoint => collect(run, checkpoint),
  })
  process.stdout.write(`${render(state, { brief })}${fromCache ? ` (read ${ageSeconds}s ago)` : ''}\n`)
  finish(fromCache ? 'cache-hit' : state.looked ? 'refreshed' : 'unavailable', { status: 0 })
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
