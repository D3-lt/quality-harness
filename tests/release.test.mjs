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
    version: '1.0.1', tags: ['v1.0.0'], released: false, porcelain: '', origin: SHA,
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
    if (line.startsWith('git tag --list')) return ok(state.tags.join('\n'))
    if (line.startsWith('gh release view')) return state.released ? ok('{}') : { status: 1, stdout: '', stderr: 'release not found' }
    if (line.endsWith('plugin/scripts/qh-check.mjs')) return { status: state.check, stdout: '', stderr: '' }
    if (line === 'bash scripts/dead-code-scan.sh') return { status: state.deadCode, stdout: '', stderr: '' }
    if (line === 'git fetch -q origin main') return ok()
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
  const run = (extra = {}) => release({ exec, log: line => said.push(line), now: () => clock, sleep: ms => { clock += ms }, ...extra })
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
