// ADR-100 T3: `node scripts/release.mjs` runs CLAUDE.md §13's chain from what it observes, against a fake git, gh and
// checks: nothing here reaches a real remote, and the script is driven through its exported `release` (CLAUDE.md §9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { release } from '../scripts/release.mjs'

const SHA = 'a'.repeat(40)
const push = (status = 'completed') => ({ databaseId: 1, event: 'push', status, headSha: SHA })
const dispatch = (status = 'completed') => ({ databaseId: 2, event: 'workflow_dispatch', status, headSha: SHA })

// A world the fake answers from. `runs` is a list of answers to `gh run list --commit`, the last one repeated.
function world(overrides = {}) {
  const state = {
    version: '1.0.1', tags: ['v1.0.0'], remoteTags: [], released: false, porcelain: '', origin: SHA,
    check: 0, deadCode: 0, evidence: [0], runs: [[push(), dispatch()]], inFlight: [], ...overrides,
  }
  const calls = []
  let runCalls = 0
  let evidenceCalls = 0
  const exec = (cmd, args) => {
    const line = [cmd, ...args].join(' ')
    calls.push(line)
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
    if (line === 'git rev-parse HEAD') return ok(`${SHA}\n`)
    if (line === 'git status --porcelain') return ok(state.porcelain)
    if (line === 'git show HEAD:plugin/.claude-plugin/plugin.json') return ok(JSON.stringify({ version: state.version }))
    if (line.startsWith('git tag --list')) return state.tagListFails ? { status: 128, stdout: '', stderr: 'fatal' } : ok(state.tags.join('\n'))
    if (line.startsWith('gh release view')) return state.released ? ok('{}') : { status: 1, stdout: '', stderr: state.viewError ?? 'release not found' }
    if (line.startsWith('node plugin/scripts/qh-check.mjs')) {
      state.checks = (state.checks ?? 0) + 1
      return { status: state.check, stdout: '', stderr: '' }
    }
    if (line === 'bash scripts/dead-code-scan.sh') return { status: state.deadCode, stdout: '', stderr: '' }
    if (line === 'git fetch -q --tags origin main') {
      if (state.fetchFails) return { status: 128, stdout: '', stderr: 'fatal: unable to access' }
      state.tags = [...new Set([...state.tags, ...state.remoteTags])]
      return ok()
    }
    if (line === 'git rev-parse origin/main') return ok(`${state.origin}\n`)
    if (line.startsWith('git merge-base --is-ancestor')) return { status: state.origin === SHA ? 0 : 1, stdout: '', stderr: '' }
    if (line === 'git push origin main') { state.origin = SHA; return ok() }
    if (line.startsWith('gh run list --commit')) {
      const answer = state.runs[Math.min(runCalls, state.runs.length - 1)]
      if (answer.some(row => row.event === 'push')) state.pushSeen = true
      runCalls += 1
      return ok(JSON.stringify(answer))
    }
    if (line.startsWith('gh run list --workflow')) return ok(JSON.stringify(state.inFlight))
    if (line === 'gh workflow run selftest.yml --ref main') { state.dispatchSawPush = state.pushSeen === true; return ok() }
    if (line.endsWith(`scripts/release-evidence.mjs ${SHA}`)) {
      const code = state.evidence[Math.min(evidenceCalls, state.evidence.length - 1)]
      evidenceCalls += 1
      return { status: code, stdout: `${code === 0 ? 'SUCCESS' : 'UNPROVEN'} — evidence\n`, stderr: '' }
    }
    if (line.startsWith('gh release create')) { state.released = true; return ok() }
    throw new Error(`the fake has no answer for: ${line}`)
  }
  let clock = 0
  const said = []
  // The load each sample reads, the last one repeated: a quiet machine unless a test says otherwise, so the real machine's
  // load never decides a test.
  let loadCalls = 0
  const load = () => {
    const loads = state.loads ?? [1]
    return { load: loads[Math.min(loadCalls++, loads.length - 1)], cores: 10 }
  }
  const run = (extra = {}) => release({ exec, log: line => said.push(line), now: () => clock, sleep: ms => { clock += ms }, load, ...extra })
  return { state, calls, said, run }
}

const pushed = calls => calls.some(line => line === 'git push origin main')
const dispatched = calls => calls.some(line => line === 'gh workflow run selftest.yml --ref main')
const tagged = calls => calls.find(line => line.startsWith('gh release create'))

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

test('release dispatches the campaign only after the push run exists', () => {
  const w = world({ origin: 'b'.repeat(40), runs: [[], [], [push('in_progress')], [push(), dispatch('in_progress')], [push(), dispatch()]] })
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.ok(pushed(w.calls))
  assert.ok(dispatched(w.calls))
  assert.equal(w.state.dispatchSawPush, true, 'the dispatch came before the push run existed')
  // Never while another dispatch for the ref is in flight: a second dispatch cancels the first.
  const busy = world({ runs: [[push()]], inFlight: [{ status: 'in_progress', headSha: 'c'.repeat(40) }] })
  assert.equal(busy.run({ waitMaxMinutes: 2 }), 3)
  assert.ok(!dispatched(busy.calls))
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
  const w = world({ origin: 'b'.repeat(40), runs: [[]] })
  assert.equal(w.run({ waitMaxMinutes: 5 }), 3)
  assert.match(w.said.join('\n'), /push run/)
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
