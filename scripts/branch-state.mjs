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
export function budgeted(totalMs, run = shell, now = Date.now) {
  const deadline = now() + totalMs
  return argv => {
    const left = deadline - now()
    if (left <= 0) return { ok: false, out: '', note: `budget of ${totalMs}ms spent before \`${argv.join(' ')}\`` }
    return run(argv, { timeout: Math.min(left, 15_000) })
  }
}
/** Run a command and report what happened, never throwing. */
export function shell(argv, { cwd = process.cwd(), timeout = 15_000 } = {}) {
  try {
    return { ok: true, out: execFileSync(argv[0], argv.slice(1), { cwd, timeout, encoding: 'utf8' }).trim() }
  } catch (error) {
    return { ok: false, out: '', note: (error.stderr || error.message || 'failed').toString().split('\n')[0] }
  }
}

/**
 * Everything the renderer needs, gathered through `run`.
 *
 * Each half is independent: git can answer while `gh` is missing, and the render
 * must be able to say so for one without claiming anything about the other.
 */
export function collect(run = shell) {
  const branch = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch.ok) return { looked: false, note: branch.note }
  const head = run(['git', 'rev-parse', '--short', 'HEAD'])
  const dirty = run(['git', 'status', '--short'])
  const counts = run(['git', 'rev-list', '--left-right', '--count', `origin/${branch.out}...HEAD`])
  const [behind, ahead] = counts.ok ? counts.out.split(/\s+/).map(Number) : [null, null]

  const runs = run(['gh', 'run', 'list', '--branch', branch.out, '--limit', '1',
    '--json', 'headSha,status,conclusion,databaseId'])
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

  const tag = run(['git', 'describe', '--tags', '--abbrev=0'])
  const shipped = tag.ok ? run(['git', 'diff', '--name-only', `${tag.out}..HEAD`, '--', 'plugin/']) : null
  return {
    looked: true,
    branch: branch.out,
    head: head.ok ? head.out : '(unknown)',
    dirty: dirty.ok ? dirty.out.split('\n').filter(Boolean).length : null,
    ahead, behind, ci,
    tag: tag.ok ? tag.out : null,
    shippedSinceTag: shipped && shipped.ok ? shipped.out.split('\n').filter(Boolean).length : null,
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

  const release = state.shippedSinceTag
    ? `plugin/ changed in ${state.shippedSinceTag} file(s) since ${state.tag} — `
      + '§13: a green shipped change is released, not parked.'
    : null

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
  const state = gather()
  write({ at, state })
  return { state, ageSeconds: 0, fromCache: false }
}

function main(argv = process.argv.slice(2)) {
  const brief = argv.includes('--brief')
  const at = argv.indexOf('--cached')
  if (at < 0) {
    process.stdout.write(`${render(collect(), { brief })}\n`)
    return 0
  }
  const home = gitDir()
  // No `.git`, no cache. Never a fallback directory — see `gitDir`.
  const store = home ? join(home, 'qh-branch-state.json') : null
  const { state, fromCache, ageSeconds } = cached(Number(argv[at + 1]) || 120, {
    read: () => { if (!store) return null; try { return JSON.parse(readFileSync(store, 'utf8')) } catch { return null } },
    write: payload => { if (!store) return; try { writeFileSync(store, JSON.stringify(payload)) } catch { /* a cache that cannot be written is not a failure */ } },
    gather: () => collect(budgeted(15_000)),
  })
  process.stdout.write(`${render(state, { brief })}${fromCache ? ` (read ${ageSeconds}s ago)` : ''}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
