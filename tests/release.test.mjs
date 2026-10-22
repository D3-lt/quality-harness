// ADR-100 T3: `node scripts/release.mjs` runs CLAUDE.md §13's chain from what it observes, against a fake git, gh and
// checks: nothing here reaches a real remote, and the script is driven through its exported `release` (CLAUDE.md §9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatch, dispatched, LANDING, landPush, MAIN_PUSH, push, pushed, SHA, tagged, world } from './helpers/release-world.mjs'

test("release stops and says bump when plugin.json names the newest tag's version", () => {
  const w = world({ version: '1.0.0', origin: 'b'.repeat(40) })
  assert.equal(w.run(), 2)
  assert.match(w.said.join('\n'), /bump/)
  assert.ok(!pushed(w.calls) && !dispatched(w.calls) && !tagged(w.calls))
})

test('release resumes from what it observes and repeats no step whose result is already there', () => {
  const w = world()
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.ok(!pushed(w.calls), 'already on origin/main: no push')
  assert.ok(!dispatched(w.calls), 'a dispatch run exists for the sha: no second dispatch')
  assert.ok(tagged(w.calls))
  // Already released: the second run says so and does nothing else.
  const again = world({ tags: ['v1.0.0', 'v1.0.1'], released: true })
  assert.equal(again.run(), 0)
  assert.ok(!tagged(again.calls) && !pushed(again.calls))
})

// ADR-126 T5 changed this test's truth: main's own push run no longer exists, so nothing waits for it. On a forge that
// requires no check there is no landing run either, and that is the one case the campaign is still dispatched.
test('release dispatches the campaign only after the push run exists', () => {
  const w = world({ origin: 'b'.repeat(40), runs: [[], [dispatch('in_progress')], [dispatch()]] })
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.ok(pushed(w.calls))
  assert.ok(dispatched(w.calls), 'no landing run on a forge that requires no check: the campaign is dispatched')
  // Never while another dispatch for the ref is in flight: a second dispatch cancels the first.
  const busy = world({ runs: [[push()]], inFlight: [{ status: 'in_progress', headSha: 'c'.repeat(40) }] })
  assert.equal(busy.run({ waitMaxMinutes: 2 }), 3)
  assert.ok(!dispatched(busy.calls))
})

// ADR-118: main takes only a sha its required checks passed at, so the release lands it through land/<sha>. The landing's
// own push run is not main's: a dispatch made before main's push run exists is older than it, and release-evidence would
// read the newer push as CACHED (BACKLOG §159). So the dispatch waits for main's push run, and a dispatch older than it, or
// one not on main, is not reused.
// ADR-126 T5 changed this test's truth: the landing's own run is the release run, so a landed sha dispatches nothing.
test('release lands the sha and dispatches only after the push run on main exists', () => {
  const w = world({
    origin: 'b'.repeat(40),
    protection: { state: 'protected', text: 'forge: main requires 1 status check(s)', required: [{ context: 'windows', integration: 15368 }] },
    runs: [[landPush()]],
  })
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.ok(w.calls.includes(LANDING) && w.calls.indexOf(LANDING) < w.calls.indexOf(MAIN_PUSH), 'landed on land/<sha> before main')
  assert.ok(!dispatched(w.calls), 'the landing run is the campaign')
  // A dispatch already on main is the release run and is not repeated; one on another branch is not a release run.
  const reused = world({ runs: [[push(), dispatch()]] })
  assert.equal(reused.run(), 0, reused.said.join('\n'))
  assert.ok(!dispatched(reused.calls), 'a dispatch on main is reused')
  const elsewhere = world({ runs: [[{ ...dispatch(), headBranch: `land/${SHA}` }], [{ ...dispatch(), headBranch: `land/${SHA}` }, { ...dispatch(), databaseId: 4 }]] })
  assert.equal(elsewhere.run(), 0, elsewhere.said.join('\n'))
  assert.ok(dispatched(elsewhere.calls), 'a dispatch on another branch is not reused')
})

test('release tags only a sha release-evidence clears, with its full sha and --latest', () => {
  const w = world()
  assert.equal(w.run(), 0)
  assert.match(tagged(w.calls), new RegExp(`^gh release create v1\\.0\\.1 --target ${SHA} --latest`))
  for (const [code, exit] of [[2, 2], [1, 1]]) {
    const refused = world({ evidence: [code] })
    assert.equal(refused.run(), exit)
    assert.ok(!tagged(refused.calls))
  }
  // Not finished yet is waited on, then read again.
  const late = world({ evidence: [3, 3, 0] })
  assert.equal(late.run(), 0)
  assert.ok(tagged(late.calls))
})

test('a wait past its deadline exits 3 and names what it waited for', () => {
  // ADR-126 T5: the wait is for the landing's run, not main's push run.
  const w = world({ origin: 'b'.repeat(40), runs: [[{ ...landPush(), status: 'in_progress' }]] })
  assert.equal(w.run({ waitMaxMinutes: 5 }), 3)
  assert.match(w.said.join('\n'), /release run/)
  assert.ok(!dispatched(w.calls) && !tagged(w.calls))
})

test('a red check or a dead-code finding stops the release before any push', () => {
  for (const overrides of [{ check: 1 }, { deadCode: 1 }, { deadCode: 3 }]) {
    const w = world({ origin: 'b'.repeat(40), ...overrides })
    assert.equal(w.run(), 1, JSON.stringify(overrides))
    assert.ok(!pushed(w.calls), JSON.stringify(overrides))
    assert.ok(!w.calls.some(line => line.startsWith('gh ')), JSON.stringify(overrides))
  }
})

// The advisor's review of e6a00957: a release `gh release create` made on the forge has a tag this clone may never have
// fetched, and the command must read the forge's tags, or a resumed run tries to release it again.
test('a release made on the forge but not fetched here is said as released', () => {
  const w = world({ remoteTags: ['v1.0.1'], released: true })
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.match(w.said.join('\n'), /already released/)
  assert.ok(!tagged(w.calls) && !pushed(w.calls))
})

// The Codex review of ce54814c: a tag catalogue that could not be read is not an empty one, and a release the forge could not
// be asked about is not a release that is missing. Either way nothing is pushed, dispatched or tagged.
test('a failed tag fetch or tag list stops the release', () => {
  for (const overrides of [{ fetchFails: true }, { tagListFails: true }]) {
    const w = world({ origin: 'b'.repeat(40), ...overrides })
    assert.equal(w.run(), 1, JSON.stringify(overrides))
    assert.ok(!pushed(w.calls) && !dispatched(w.calls) && !tagged(w.calls), JSON.stringify(overrides))
  }
})

test('a forge that cannot be asked is not read as a release that is missing', () => {
  const w = world({ tags: ['v1.0.0', 'v1.0.1'], viewError: 'HTTP 401: Bad credentials' })
  assert.equal(w.run(), 1, w.said.join('\n'))
  assert.doesNotMatch(w.said.join('\n'), /bump/)
  const missing = world({ tags: ['v1.0.0', 'v1.0.1'] })
  assert.equal(missing.run(), 2)
  assert.match(missing.said.join('\n'), /has no release/)
})

// v3.8.25 was pushed on a full check qh-check itself recorded as unattributable (load 18.01 on 10 cores; BACKLOG). Since
// ADR-115 the end sample is taken once the run's own load has decayed: the load after `[start]` is sampled every 30 s.
test('a full check that passed on a contended machine is taken again when it is quiet, and twice contended stops the release', () => {
  const again = world({ origin: 'b'.repeat(40), loads: [12, 3, 2, 2] })
  assert.equal(again.run(), 0, again.said.join('\n'))
  assert.equal(again.state.checks, 2, 'the contended pass was taken again')
  assert.ok(again.calls.filter(line => line === 'node plugin/scripts/qh-check.mjs --again').length === 2, 'never a reused pass')
  assert.ok(pushed(again.calls))
  assert.match(again.said.join('\n'), /contended machine/)
  const twice = world({ origin: 'b'.repeat(40), loads: [12, 3, 2, 12] })
  assert.equal(twice.run(), 2, twice.said.join('\n'))
  assert.ok(!pushed(twice.calls) && !twice.calls.some(line => line.startsWith('gh ')), 'nothing left this machine')
  const quietWasNever = world({ origin: 'b'.repeat(40), loads: [12, 14, 15] })
  assert.equal(quietWasNever.run({ waitMaxMinutes: 2 }), 3)
  assert.equal(quietWasNever.state.checks, 1)
  const unread = world({ origin: 'b'.repeat(40), loads: [null] })
  assert.equal(unread.run(), 0, 'a load that cannot be read is not contended')
  assert.equal(unread.state.checks, 1)
})

// ADR-115: the end sample held the run's own load, so a busy machine read every pass as contended (5 runs on 2026-10-19
// started at 6.1 to 8.7 and ended at 14.0 to 19.7 on 10 cores, each in 202 to 209 s). The load is sampled after the run until
// it is at or below the core count, for at most 4 minutes: there, the load from everything else is too.
test('a pass whose load falls to the core count after the run is not contended, and one that stays above it is', { timeout: 30_000 }, () => {
  const falls = world({ origin: 'b'.repeat(40), loads: [7, 17, 13, 9] })
  assert.equal(falls.run(), 0, falls.said.join('\n'))
  assert.equal(falls.state.checks, 1, 'the run\'s own load is not contention')
  assert.ok(pushed(falls.calls))
  assert.doesNotMatch(falls.said.join('\n'), /contended/)
  // Still above the count at the bound: other work. Taken again once quiet, and a second such pass stops the release.
  const stays = world({ origin: 'b'.repeat(40), loads: [7, ...Array(9).fill(12), 2, 7, ...Array(9).fill(12)] })
  assert.equal(stays.run(), 2, stays.said.join('\n'))
  assert.equal(stays.state.checks, 2)
  assert.ok(!pushed(stays.calls))
  assert.match(stays.said.join('\n'), /contended machine twice/)
  // The bound is 4 minutes: a load that falls on the ninth sample, at 4 minutes, is still in time, and one that falls on the
  // tenth is not.
  const late = world({ origin: 'b'.repeat(40), loads: [7, ...Array(8).fill(12), 9] })
  assert.equal(late.run(), 0, late.said.join('\n'))
  assert.equal(late.state.checks, 1)
})

// The Codex review of 0c137b89: a quiet sample read after the bound counted, when a sleep resumed late; and an unread start was
// judged by its settle samples alone, where before ADR-115 a pair with an unread half was not contended.
test('a sample after the settle bound does not count, and a pass whose start was not read is not judged', () => {
  const late = world({ origin: 'b'.repeat(40), loads: [7, 12, 9] })
  let clock = 0
  assert.equal(late.run({ now: () => clock, sleep: ms => { clock += ms * 9 } }), 0, late.said.join('\n'))
  assert.equal(late.state.checks, 2, 'the first pass, whose quiet sample came after the bound, was taken again')
  const unread = world({ origin: 'b'.repeat(40), loads: [null, 12] })
  assert.equal(unread.run(), 0, unread.said.join('\n'))
  assert.equal(unread.state.checks, 1, 'an unread start is not contended, whatever the samples after it')
})

// BACKLOG §406: 3.8.52's outside runs were filed after its sha had landed, and the release ran with them held outside the tree.
// The questions this clone can answer are asked before anything is checked or pushed, and an uncommitted attestation is named.
test('evidence this clone can read is asked for before anything lands, and an uncommitted attestation is named', () => {
  const missing = world({ origin: 'b'.repeat(40), review: 2 })
  assert.equal(missing.run(), 2, missing.said.join('\n'))
  assert.match(missing.said.join('\n'), /UNPROVEN — review evidence[\s\S]*then run again/)
  assert.equal(missing.state.checks, undefined, 'no check was run')
  assert.ok(!pushed(missing.calls) && !missing.calls.includes(LANDING), 'nothing left this machine')
  // CLEAN twin: with the evidence in hand the release goes on.
  const ready = world({ origin: 'b'.repeat(40) })
  assert.equal(ready.run(), 0, ready.said.join('\n'))
  assert.ok(ready.calls.indexOf(`node scripts/release-evidence.mjs --review ${SHA}`) >= 0)
  assert.ok(ready.calls.indexOf(`node scripts/release-evidence.mjs --review ${SHA}`) < ready.calls.indexOf('node plugin/scripts/qh-check.mjs --again'))
  const held = world({ porcelain: '?? docs/corpus-reports/2026-10-22-x.json', origin: 'b'.repeat(40) })
  assert.equal(held.run(), 2)
  assert.match(held.said.join('\n'), /uncommitted attestation/)
  const other = world({ porcelain: '?? docs/corpus-reports/2026-10-22-x.json\n M scripts/land.mjs' })
  assert.equal(other.run(), 2)
  assert.match(other.said.join('\n'), /not clean/)
})
