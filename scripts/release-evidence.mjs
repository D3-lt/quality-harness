#!/usr/bin/env node
// release-evidence.mjs — does the CI run for this sha actually clear it for release?
//
// BACKLOG §104, and the entry exists because this check was missing when it was
// needed. On 2026-09-02 a release run was cancelled mid-campaign by the author's
// own push (`.github/workflows/selftest.yml` sets `cancel-in-progress: true`),
// six of nine jobs were green, the three that died were the mutation shards —
// and `gh run watch --exit-status` exited **0**. A tag cut there would have
// carried no mutation evidence at all while looking fully verified.
//
// The rule this encodes is CLAUDE.md §3's: a run that could not finish is "I
// could not look", never "nothing was wrong". `cancelled` is not `failure` and
// it is certainly not `success`, so the release question has to be asked as
// *did every job conclude success*, which is what `evaluateRun` below asks.
//
// Usage:
//   node scripts/release-evidence.mjs [<sha>]     # defaults to HEAD
//
// Exit codes are distinct on purpose, so a caller can tell the three apart:
//   0  every job concluded success — safe to release this sha
//   1  a job did not conclude success (failed, cancelled, timed out, skipped)
//   2  could not look (no gh, no run for this sha, unreadable answer)
//   3  the run is not finished yet
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/**
 * Judge a run's release-worthiness from the `gh run view --json` object.
 *
 * Pure and total: every argument shape returns a verdict rather than throwing,
 * because the caller has to distinguish "could not look" from "looked and found
 * a problem" and an exception collapses the two.
 *
 * The four verdicts map onto the exit codes above. `unreadable` covers a null,
 * a non-object, and a run carrying no jobs array — the last is the one that
 * matters, since an empty job list would otherwise satisfy "every job
 * succeeded" vacuously, which is this repository's signature defect.
 */
export function evaluateRun(run) {
  if (!run || typeof run !== 'object' || !Array.isArray(run.jobs)) {
    return { verdict: 'unreadable', reason: 'no run object, or it carries no jobs array', jobs: [] }
  }
  // A run with zero jobs is not a clean run. Said explicitly because
  // `[].every(...)` is `true`, and that is exactly how a gate reports clean
  // over a universe it never looked at (CLAUDE.md §3, ADR-005).
  //
  // The two empty cases are NOT the same, and separating them was paid for by
  // running this against a real push: GitHub reports a freshly queued run with
  // an empty jobs array for a few seconds before the jobs materialize. That is
  // "not started yet" — retry and it resolves. A run claiming `completed` with
  // no jobs is something else entirely, and no amount of waiting fixes it.
  if (run.jobs.length === 0) {
    return run.status === 'completed'
      ? { verdict: 'unreadable', reason: 'the run says completed and reports zero jobs', jobs: [] }
      : { verdict: 'incomplete', reason: `the run is ${run.status} and has not listed its jobs yet`, jobs: [] }
  }
  const jobs = run.jobs.map(j => ({
    name: String(j?.name ?? '<unnamed>'),
    status: String(j?.status ?? 'unknown'),
    conclusion: j?.conclusion ? String(j.conclusion) : null,
  }))
  const unfinished = jobs.filter(j => j.status !== 'completed')
  if (run.status !== 'completed' || unfinished.length) {
    return { verdict: 'incomplete', reason: `${unfinished.length} job(s) still running`, jobs }
  }
  // STRICTLY success. `cancelled`, `skipped`, `timed_out`, `neutral` and
  // `action_required` are each a reason a human should look before tagging, and
  // naming the conclusion is more useful than folding them all into "failed".
  const bad = jobs.filter(j => j.conclusion !== 'success')
  if (bad.length) {
    return {
      verdict: 'failed',
      reason: bad.map(j => `${j.name}: ${j.conclusion ?? 'no conclusion'}`).join(', '),
      jobs,
    }
  }
  return { verdict: 'success', reason: `${jobs.length} job(s) concluded success`, jobs }
}

/**
 * The newest run for `sha`, or null when nothing can be read.
 *
 * ⚠ `gh run list --commit` needs the FULL 40-character sha. Given an
 * abbreviated one it returns `[]` — not an error, just an empty list that reads
 * exactly like "this commit has no runs". Measured 2026-09-02 with gh 2.98.0:
 * `--commit 57a1e76` returned `[]` while `--commit <full>` returned the run. So
 * the sha is expanded here rather than trusted, and a caller passing a short sha
 * gets an answer instead of a silent nothing.
 */
function fetchRun(sha) {
  let full = sha
  try {
    full = execFileSync('git', ['rev-parse', sha], { encoding: 'utf8', timeout: 30_000 }).trim()
  } catch {
    return null // Not a sha this checkout knows — "could not look".
  }
  let list
  try {
    list = execFileSync('gh', [
      'run', 'list', '--commit', full, '--limit', '1', '--json', 'databaseId',
    ], { encoding: 'utf8', timeout: 60_000 })
  } catch {
    return null // gh absent, unauthenticated, or offline — "could not look".
  }
  let id
  try {
    id = JSON.parse(list)?.[0]?.databaseId
  } catch {
    return null
  }
  if (!id) return null
  try {
    return JSON.parse(execFileSync('gh', [
      'run', 'view', String(id), '--json', 'status,conclusion,headSha,jobs',
    ], { encoding: 'utf8', timeout: 60_000 }))
  } catch {
    return null
  }
}

const EXIT = { success: 0, failed: 1, unreadable: 2, incomplete: 3 }


// An option is not a sha, and until 2026-09-03 nothing here said so: `argv[0]`
// went straight into `git rev-parse`, where `--help` SUCCEEDS and returns the git
// manual. That 55KB of roff was then URL-encoded into a `head_sha=` query and the
// API answered `HTTP 414: Request-URL too long`, which reads as a network problem
// rather than as "you asked for help". A reader looking for usage got a wall of
// another tool's documentation and a transport error.
//
// Exported so a test can drive it without the network, which is the only way the
// dash cases are reachable — `fetchRun` shells out on the line after.
export function classifyArgument(argument) {
  if (argument === undefined) return { kind: 'sha', value: undefined }
  if (argument === '--help' || argument === '-h') return { kind: 'help' }
  // Anything else dash-led is an option this script does not have. It is NOT
  // silently treated as a sha: a mistyped flag that resolves to "could not look"
  // is the same wrong answer as one that resolves to a manual page.
  if (argument.startsWith('-')) return { kind: 'unknown', value: argument }
  return { kind: 'sha', value: argument }
}

const USAGE = [
  'Usage: node scripts/release-evidence.mjs [<sha>]   # defaults to HEAD',
  '',
  'Exit codes:',
  '  0  every job concluded success — safe to release this sha',
  '  1  a job did not conclude success (failed, cancelled, timed out, skipped)',
  '  2  could not look (no gh, no run for this sha, unreadable answer, bad usage)',
  '  3  the run is not finished yet',
].join('\n')

function main(argv) {
  const argument = classifyArgument(argv[0])
  if (argument.kind === 'help') {
    console.log(USAGE)
    return EXIT.success
  }
  if (argument.kind === 'unknown') {
    console.error(`release-evidence: unknown option ${argument.value}\n\n${USAGE}`)
    return EXIT.unreadable
  }
  let sha = argument.value
  if (!sha) {
    try {
      sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 30_000 }).trim()
    } catch {
      console.error('release-evidence: could not resolve HEAD — pass a sha explicitly')
      return EXIT.unreadable
    }
  }
  const run = fetchRun(sha)
  const result = evaluateRun(run)
  for (const j of result.jobs) {
    console.log(`  ${j.name}: ${j.status} ${j.conclusion ?? '-'}`)
  }
  const head = run?.headSha ? ` (${String(run.headSha).slice(0, 7)})` : ''
  console.log(`${result.verdict.toUpperCase()}${head} — ${result.reason}`)
  if (result.verdict !== 'success') {
    console.log('Do NOT tag this sha. A run that did not finish is "I could not look", '
      + 'not "nothing was wrong" — see BACKLOG §104 and CLAUDE.md §13.')
  }
  return EXIT[result.verdict]
}

// Importable without side effects, so the test can drive `evaluateRun` on
// fixtures rather than on the network. `tests/package.test.mjs::importing a
// script runs its CLI on nobody` asserts this property across every script here.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)))
}
