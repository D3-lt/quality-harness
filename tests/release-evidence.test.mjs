// The release gate's own gate. BACKLOG §104.
//
// This exists because the thing it replaces — `gh run watch --exit-status` —
// returned 0 for a run that was CANCELLED mid-mutation-campaign on 2026-09-02.
// Every case below is a shape that actually reached a release decision that day,
// plus the vacuous one that would let anything through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyArgument, evaluateRun, selectRun } from '../scripts/release-evidence.mjs'

const job = (name, conclusion, status = 'completed') => ({ name, status, conclusion })
const NINE = [
  'selftest (ubuntu-latest)', 'selftest (macos-latest)', 'windows',
  'mutations 1/4', 'mutations 2/4', 'mutations 3/4', 'mutations 4/4',
  'plugin validate', 'coverage floor',
]
// `event` is what tells a full campaign from a cached one (BACKLOG §142): only a
// `workflow_dispatch` run measures the whole catalogue, so the fixture for "a run
// that could clear a release" must carry it. A run WITHOUT the field is a separate
// case below, and it is not a pass.
const allGreen = () => ({
  status: 'completed', conclusion: 'success', headSha: 'a'.repeat(40),
  event: 'workflow_dispatch',
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

test('a green run raised by a push is not release evidence, because its campaign may be cached (BACKLOG §142)', () => {
  // Since 2026-09-05 only a `workflow_dispatch` run measures the whole 581-mutant
  // catalogue; a push to `main` may reuse cached RED verdicts, which is right for
  // iteration and is not what a tag may rest on (ADR-023 rule 1). Every job green
  // is therefore NOT sufficient, and the event is the only thing that tells the
  // two apart from outside.
  const pushed = evaluateRun({ ...allGreen(), event: 'push' })
  assert.equal(pushed.verdict, 'cached', 'a push run is not a full campaign')
  assert.match(pushed.reason, /gh workflow run selftest\.yml/, 'it must say how to get one')
  assert.notEqual(pushed.verdict, 'success')

  for (const event of ['pull_request', 'schedule', 'release']) {
    assert.equal(evaluateRun({ ...allGreen(), event }).verdict, 'cached', event)
  }
  assert.equal(evaluateRun(allGreen()).verdict, 'success', 'a dispatch run still clears')

  // A run that does not say what raised it is COULD NOT LOOK, not cleared: an
  // older `gh`, or an answer missing the field, must never read as a full
  // campaign (ADR-005).
  const silent = { ...allGreen() }
  delete silent.event
  assert.equal(evaluateRun(silent).verdict, 'unreadable')
  assert.match(evaluateRun(silent).reason, /does not say what raised it/)
  assert.equal(evaluateRun({ ...allGreen(), event: null }).verdict, 'unreadable')
})

test('the verdicts are five distinct answers, not a boolean wearing five names', () => {
  // Guards the mapping the exit codes rest on. If two verdicts ever collapse,
  // the caller loses the distinction between "fix the build" and "wait", which
  // is the whole reason the exit codes are separate.
  const seen = new Set([
    evaluateRun(allGreen()).verdict,
    evaluateRun({ ...allGreen(), jobs: [job('windows', 'cancelled')] }).verdict,
    evaluateRun({ ...allGreen(), jobs: [job('windows', null, 'in_progress')] }).verdict,
    evaluateRun(null).verdict,
    evaluateRun({ ...allGreen(), event: 'push' }).verdict,
  ])
  assert.deepEqual([...seen].sort(), ['cached', 'failed', 'incomplete', 'success', 'unreadable'])
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

// BACKLOG §154 — WHICH run the question is about, before any of the above asks
// whether it was green. Two runs, one sha, the same `createdAt`: the ordinary
// result of the release sequence CLAUDE.md §13 documents, because `git push` and
// `gh workflow run` issued from one shell land in the same second. The ids and
// the timestamp below are the real ones, from the v2.83.0 cut on 2026-09-06.
test('a dispatch and a push at the same instant resolve to the dispatch', () => {
  // The push is FIRST on purpose: that is the shape that actually reached the
  // gate. It answered CACHED while the full campaign sat beside it, and it cost
  // a whole CI cycle. gh's order within a tie is not something a release may
  // rest on, so the event — the field the verdict already depends on — decides.
  const runs = [
    { databaseId: 34054097463, event: 'push', createdAt: '2026-09-06T19:11:25Z' },
    { databaseId: 34054097512, event: 'workflow_dispatch', createdAt: '2026-09-06T19:11:25Z' },
  ]
  assert.equal(selectRun(runs)?.databaseId, 34054097512)
})

test('a newer push still wins over an older dispatch', () => {
  // The other half, and the half that keeps the CACHED refusal alive: preferring
  // a dispatch UNCONDITIONALLY resurrects a campaign taken before the push, which
  // is the quiet evidence hole §142 closed. A tie-break that cannot be shown
  // NOT firing is a tie-break that has stopped being one.
  const runs = [
    { databaseId: 2, event: 'push', createdAt: '2026-09-06T19:12:00Z' },
    { databaseId: 1, event: 'workflow_dispatch', createdAt: '2026-09-06T19:11:25Z' },
  ]
  assert.equal(selectRun(runs)?.databaseId, 2)
})

test('the newest dispatch is chosen with no tie to break', () => {
  const runs = [
    { databaseId: 3, event: 'workflow_dispatch', createdAt: '2026-09-06T19:12:00Z' },
    { databaseId: 2, event: 'push', createdAt: '2026-09-06T19:11:25Z' },
  ]
  assert.equal(selectRun(runs)?.databaseId, 3)
})

test('a timestamp nothing can read is not silently ordered', () => {
  // ADR-005 applied to the ordering itself. With no comparable times the
  // pre-§154 behaviour — gh's own first — is kept, rather than a ranking
  // invented over values that do not compare. Here that means the PUSH, so the
  // fallback is visibly the conservative one and not a way to smuggle a pass.
  const runs = [
    { databaseId: 7, event: 'push', createdAt: 'not a time' },
    { databaseId: 8, event: 'workflow_dispatch', createdAt: '2026-09-06T19:11:25Z' },
  ]
  assert.equal(selectRun(runs)?.databaseId, 7)
})

test('nothing to choose from is null, and a run with no id is not a choice', () => {
  assert.equal(selectRun([]), null)
  assert.equal(selectRun(null), null)
  assert.equal(selectRun([{ event: 'workflow_dispatch', createdAt: '2026-09-06T19:11:25Z' }]), null)
})
