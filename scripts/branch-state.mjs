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
import process from 'node:process'
import { pathToFileURL } from 'node:url'

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
 */
export function render(state) {
  if (!state.looked) return `branch-state: COULD NOT LOOK — ${state.note}. This says nothing about the branch.`
  const lines = [`branch-state: ${state.branch} @ ${state.head}`
    + `${state.dirty ? `, ${state.dirty} uncommitted path(s)` : ', clean'}`
    + `${state.ahead ? `, ${state.ahead} ahead of origin` : ''}`]

  if (!state.ci.looked) {
    lines.push(`  CI       COULD NOT LOOK — ${state.ci.note}. NOT a green branch; an unknown one.`)
  } else if (state.ci.status !== 'completed') {
    lines.push(`  CI       ${state.ci.sha}: still running. Not finished is not green (§13).`)
  } else if (state.ci.conclusion === 'success') {
    lines.push(`  CI       ${state.ci.sha}: every job concluded success.`)
  } else {
    lines.push(`  ⚠ CI     ${state.ci.sha}: ${String(state.ci.conclusion).toUpperCase()}`
      + `${state.ci.failed.length ? ` — ${state.ci.failed.join(', ')}` : ''}`)
    lines.push('           A LOCAL GREEN GATE DOES NOT ANSWER THIS. `scripts/selftest.sh` and the CI '
      + 'jobs are different checks; read this one before planning anything on this branch.')
  }

  if (state.shippedSinceTag) {
    lines.push(`  release  plugin/ changed in ${state.shippedSinceTag} file(s) since ${state.tag} — `
      + '§13: a green shipped change is released, not parked.')
  }
  lines.push('  This READS. It blocks nothing and judges nothing about your work.')
  return lines.join('\n')
}

function main() {
  process.stdout.write(`${render(collect())}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
