// The release gate's own gate. BACKLOG §104.
//
// This exists because the thing it replaces — `gh run watch --exit-status` —
// returned 0 for a run that was CANCELLED mid-mutation-campaign on 2026-09-02.
// Every case below is a shape that actually reached a release decision that day,
// plus the vacuous one that would let anything through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyArgument, evaluateRun } from '../scripts/release-evidence.mjs'

const job = (name, conclusion, status = 'completed') => ({ name, status, conclusion })
const NINE = [
  'selftest (ubuntu-latest)', 'selftest (macos-latest)', 'windows',
  'mutations 1/4', 'mutations 2/4', 'mutations 3/4', 'mutations 4/4',
  'plugin validate', 'coverage floor',
]
const allGreen = () => ({
  status: 'completed', conclusion: 'success', headSha: 'a'.repeat(40),
  jobs: NINE.map(n => job(n, 'success')),
})

test('a fully green run is the only thing that clears a sha for release', () => {
  const r = evaluateRun(allGreen())
  assert.equal(r.verdict, 'success')
  assert.match(r.reason, /9 job\(s\)/)
})

test('a cancelled run is not a release, however few jobs were cancelled', () => {
  // THE EXACT SHAPE THAT HAPPENED, run 33597361980: six jobs green, the three
  // cancelled ones being the mutation shards, and the run's own conclusion
  // `cancelled`. `gh run watch --exit-status` exited 0 on this.
  const run = allGreen()
  run.conclusion = 'cancelled'
  for (const name of ['mutations 1/4', 'mutations 2/4', 'mutations 3/4']) {
    run.jobs[NINE.indexOf(name)] = job(name, 'cancelled')
  }
  const r = evaluateRun(run)
  assert.equal(r.verdict, 'failed')
  // The message must NAME which jobs and what they concluded — "the run failed"
  // sends the reader back to the browser, which is where this started.
  assert.match(r.reason, /mutations 1\/4: cancelled/)
  assert.match(r.reason, /mutations 3\/4: cancelled/)
  assert.doesNotMatch(r.reason, /windows/, 'a green job must not be named as a problem')
})

test('every non-success conclusion is reported by its own name', () => {
  // Folding these into "failed" loses the distinction a human needs: a skipped
  // job may be legitimate, a timed-out one is a flake to re-run, and a failure
  // is a defect. The gate does not decide which — it refuses and says what it saw.
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', null]) {
    const run = allGreen()
    run.jobs[2] = job('windows', conclusion)
    const r = evaluateRun(run)
    assert.equal(r.verdict, 'failed', `conclusion ${conclusion}`)
    assert.match(r.reason, /^windows: /, `conclusion ${conclusion}`)
  }
})

test('a run still in flight is incomplete, which is not the same as failed', () => {
  // ADR-005: "could not run to completion" must never borrow a verdict's
  // vocabulary. A release script that treats in-flight as failure teaches people
  // to re-run until it passes; one that treats it as success is the §104 defect.
  const run = allGreen()
  run.status = 'in_progress'
  run.conclusion = null
  run.jobs[3] = job('mutations 1/4', null, 'in_progress')
  const r = evaluateRun(run)
  assert.equal(r.verdict, 'incomplete')
  assert.match(r.reason, /1 job\(s\) still running/)

  // ...and a run whose top-level status says completed while a job has not
  // finished is still incomplete. The two are reported separately by the API and
  // trusting only the top-level field is how a partial run reads as whole.
  const lagging = allGreen()
  lagging.jobs[3] = job('mutations 1/4', null, 'queued')
  assert.equal(evaluateRun(lagging).verdict, 'incomplete')
})

test('an empty or unreadable answer is "could not look", never a pass', () => {
  // THE VACUOUS CASE, and it is the reason this function exists rather than an
  // inline `.every()`: `[].every(j => j.conclusion === 'success')` is TRUE, so a
  // run carrying no jobs would clear every sha ever. Coverage cannot see this
  // (CLAUDE.md §4) — only a test that hands it an empty universe can.
  assert.equal(evaluateRun({ status: 'completed', conclusion: 'success', jobs: [] }).verdict,
    'unreadable', 'a run with zero jobs must not read as nine green ones')

  // ...but a run that has not STARTED listing its jobs is merely early, and
  // saying "unreadable" there sends a releaser looking for a fault that will
  // clear itself. Observed live on 2026-09-02: GitHub reports a freshly queued
  // run with an empty jobs array for a few seconds after a push.
  for (const status of ['queued', 'in_progress', 'pending', 'waiting']) {
    const r = evaluateRun({ status, conclusion: null, jobs: [] })
    assert.equal(r.verdict, 'incomplete', status)
    assert.match(r.reason, new RegExp(`the run is ${status}`))
  }

  for (const bad of [null, undefined, {}, { jobs: null }, { jobs: 'nine' }, 'success', 42]) {
    assert.equal(evaluateRun(bad).verdict, 'unreadable', JSON.stringify(bad) ?? 'undefined')
  }
})

test('the verdicts are four distinct answers, not a boolean wearing four names', () => {
  // Guards the mapping the exit codes rest on. If two verdicts ever collapse,
  // the caller loses the distinction between "fix the build" and "wait", which
  // is the whole reason the exit codes are separate.
  const seen = new Set([
    evaluateRun(allGreen()).verdict,
    evaluateRun({ ...allGreen(), jobs: [job('windows', 'cancelled')] }).verdict,
    evaluateRun({ ...allGreen(), jobs: [job('windows', null, 'in_progress')] }).verdict,
    evaluateRun(null).verdict,
  ])
  assert.deepEqual([...seen].sort(), ['failed', 'incomplete', 'success', 'unreadable'])
})

test('an option is not a sha, and a bare dash-argument never reaches git rev-parse', () => {
  // Found 2026-09-03 by running `--help` on this script. `argv[0]` went straight
  // into `git rev-parse`, where `--help` SUCCEEDS and prints the git manual; 55KB
  // of roff was then URL-encoded into a `head_sha=` query and GitHub answered
  // `HTTP 414: Request-URL too long`. A reader who asked for usage got another
  // tool's documentation and a transport error — a wrong answer, not a refusal.
  assert.deepEqual(classifyArgument('--help'), { kind: 'help' })
  assert.deepEqual(classifyArgument('-h'), { kind: 'help' })

  // A mistyped flag is NOT quietly treated as a sha. Resolving it to "could not
  // look" would be the same wrong answer wearing a politer word (CLAUDE.md §3).
  assert.deepEqual(classifyArgument('--latest'), { kind: 'unknown', value: '--latest' })
  assert.deepEqual(classifyArgument('-x'), { kind: 'unknown', value: '-x' })

  // And the classifier must still be capable of the ordinary answers, or it
  // passes by rejecting everything.
  assert.deepEqual(classifyArgument('87e8a30'), { kind: 'sha', value: '87e8a30' })
  assert.deepEqual(classifyArgument(undefined), { kind: 'sha', value: undefined })
})
