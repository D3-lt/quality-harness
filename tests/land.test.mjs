// ADR-118 T1: `node scripts/land.mjs` puts a sha on main only after the forge's required checks passed at it on land/<sha>,
// against a fake git and gh: nothing here reaches a real remote, and land is driven through its export (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { land, undeclared } from '../scripts/land.mjs'
import { declaredJobs, mainProtection } from '../scripts/release-evidence.mjs'

const SHA = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const ACTIONS = 15368
const UBUNTU = 'selftest (ubuntu-latest)'
const WORKFLOW = [
  'jobs:',
  '  selftest:',
  '    name: selftest (${{ matrix.os }})',
  '    strategy:',
  '      matrix:',
  '        os: [ubuntu-latest, macos-latest]',
  '  windows:',
  '    name: windows',
  '',
].join('\n')
const REQUIRED = [{ context: UBUNTU, integration: ACTIONS }, { context: 'windows', integration: ACTIONS }]
const guarded = (required = REQUIRED) => ({ state: 'protected', text: `forge: main requires ${required.length} status check(s)`, required })
const LANDING = `git push origin ${SHA}:refs/heads/land/${SHA}`
const MAIN_PUSH = `git push origin ${SHA}:refs/heads/main`

// One check-run as the Checks API reports it.
function run(name, conclusion, { id = 1, started = '2026-10-20T10:00:00Z', app = ACTIONS, status = 'completed' } = {}) {
  return { id, name, status, conclusion: status === 'completed' ? conclusion : null, started_at: started, app: { id: app } }
}
const green = [[run(UBUNTU, 'success'), run('windows', 'success', { id: 2 })]]

// A world the fake answers from. `checkRuns` is a list of answers, each a list of pages, the last one repeated; null is
// an answer gh could not give.
function world(overrides = {}) {
  const state = { branch: 'main', origin: OTHER, workflow: WORKFLOW, protection: guarded(), checkRuns: [green], ...overrides }
  const calls = []
  let checkCalls = 0
  const exec = (cmd, args) => {
    const line = [cmd, ...args].join(' ')
    calls.push(line)
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
    if (line === 'git rev-parse HEAD') return ok(`${SHA}\n`)
    if (line === 'git symbolic-ref --short HEAD') return state.branch ? ok(`${state.branch}\n`) : { status: 128, stdout: '', stderr: 'fatal: ref HEAD is not a symbolic ref' }
    if (line === 'git rev-parse refs/heads/main') return ok(`${state.mainMoves && checkCalls > 0 ? OTHER : SHA}\n`)
    if (line === 'git fetch -q origin main') return ok()
    if (line.startsWith('git merge-base --is-ancestor')) return { status: state.origin === SHA ? 0 : 1, stdout: '', stderr: '' }
    if (line === `git show ${SHA}:.github/workflows/selftest.yml`) return state.workflow === null ? { status: 128, stdout: '', stderr: 'fatal' } : ok(state.workflow)
    if (line === LANDING) { state.landBranch = true; return ok() }
    if (line.startsWith(`gh api repos/{owner}/{repo}/commits/${SHA}/check-runs`)) {
      const answer = state.checkRuns[Math.min(checkCalls, state.checkRuns.length - 1)]
      checkCalls += 1
      if (answer === null) return { status: 1, stdout: '', stderr: 'HTTP 502' }
      return ok(JSON.stringify(answer.map(page => ({ total_count: page.length, check_runs: page }))))
    }
    if (line === MAIN_PUSH) {
      state.mainPushedAfter = checkCalls
      if (!state.pushLeavesForge) state.origin = SHA
      return ok()
    }
    if (line === 'git ls-remote origin refs/heads/main') return ok(`${state.origin}\trefs/heads/main\n`)
    if (line === `git push origin --delete land/${SHA}`) { state.landBranch = false; return ok() }
    throw new Error(`the fake has no answer for: ${line}`)
  }
  let clock = 0
  const said = []
  const go = (extra = {}) => land({ exec, log: line => said.push(line), now: () => clock, sleep: ms => { clock += ms }, protection: () => state.protection, ...extra })
  return { state, calls, said, go }
}

const mainPushed = calls => calls.includes(MAIN_PUSH)
const anyPush = calls => calls.some(line => line.startsWith('git push'))

test('land pushes main only after every required check passed at the sha on land/<sha>', () => {
  const w = world({ checkRuns: [[[run(UBUNTU, null, { status: 'in_progress' })]], green] })
  assert.equal(w.go(), 0, w.said.join('\n'))
  assert.ok(w.calls.indexOf(LANDING) >= 0 && w.calls.indexOf(LANDING) < w.calls.indexOf(MAIN_PUSH), 'landed on land/<sha> first')
  assert.equal(w.state.mainPushedAfter, 2, 'main was pushed only after the read that found every check green')
  assert.equal(w.state.landBranch, false, 'the land branch is deleted once main moved')
  assert.equal(w.state.origin, SHA)
  // A failed required check stops the landing: main is not pushed, and the branch is kept for the run.
  const red = world({ checkRuns: [[[run(UBUNTU, 'failure'), run('windows', 'success', { id: 2 })]]] })
  assert.equal(red.go(), 1)
  assert.ok(!mainPushed(red.calls))
  assert.equal(red.state.landBranch, true)
  assert.match(red.said.join('\n'), /selftest \(ubuntu-latest\) concluded failure/)
})

test('land pushes nothing when the forge cannot be read or requires a check no job declares', () => {
  const unread = world({ protection: { state: 'unknown', text: "forge: COULD NOT LOOK at main's rules (HTTP 502)" } })
  assert.equal(unread.go(), 1)
  assert.ok(!anyPush(unread.calls), 'a forge it cannot read is not an unprotected one')
  assert.match(unread.said.join('\n'), /COULD NOT LOOK/)
  const never = world({ protection: guarded([...REQUIRED, { context: 'coverage floor', integration: ACTIONS }]) })
  assert.equal(never.go(), 1)
  assert.ok(!anyPush(never.calls))
  assert.match(never.said.join('\n'), /coverage floor/)
  const noWorkflow = world({ workflow: null })
  assert.equal(noWorkflow.go(), 1)
  assert.ok(!anyPush(noWorkflow.calls))
  const dry = world()
  assert.equal(dry.go({ dryRun: true }), 0, dry.said.join('\n'))
  assert.ok(!anyPush(dry.calls), 'a dry run pushes nothing')
})

test('land says an unprotected main and pushes it directly, and a wait past its deadline exits 3', () => {
  const open = world({ protection: { state: 'unprotected', text: "forge: main's rules require no status check", required: [] } })
  assert.equal(open.go(), 0, open.said.join('\n'))
  assert.ok(mainPushed(open.calls) && !open.calls.includes(LANDING))
  assert.match(open.said.join('\n'), /require no status check/)
  const slow = world({ checkRuns: [[[run(UBUNTU, null, { status: 'queued' }), run('windows', 'success', { id: 2 })]]] })
  assert.equal(slow.go({ waitMaxMinutes: 5 }), 3)
  assert.ok(!mainPushed(slow.calls) && slow.calls.includes(LANDING))
  assert.match(slow.said.join('\n'), /selftest \(ubuntu-latest\)/)
  // Running again resumes from what the forge shows.
  slow.state.checkRuns = [green]
  assert.equal(slow.go(), 0, slow.said.join('\n'))
  assert.ok(mainPushed(slow.calls))
  const done = world({ origin: SHA })
  assert.equal(done.go(), 0)
  assert.ok(!anyPush(done.calls))
  assert.match(done.said.join('\n'), /already on main/)
})

test('land picks the newest check-run of the required app for each context, over every page', () => {
  const windows = run('windows', 'success', { id: 2 })
  const cases = [
    ['cancelled, then re-run green', [[run(UBUNTU, 'cancelled', { id: 1 }), run(UBUNTU, 'success', { id: 5, started: '2026-10-20T11:00:00Z' }), windows]], 0],
    ['a partial re-run', [[run(UBUNTU, 'success'), run('windows', 'failure', { id: 2 }), run('windows', 'success', { id: 7, started: '2026-10-20T12:00:00Z' })]], 0],
    ['a newer failure after an older success', [[run(UBUNTU, 'success'), run(UBUNTU, 'failure', { id: 9, started: '2026-10-20T12:00:00Z' }), windows]], 1],
    ["another app's failure of the same name", [[run(UBUNTU, 'failure', { id: 20, app: 999, started: '2026-10-20T13:00:00Z' }), run(UBUNTU, 'success'), windows]], 0],
    ['a required run on a later page', [[run(UBUNTU, 'success')], [windows]], 0],
    ['skipped', [[run(UBUNTU, 'skipped'), windows]], 1],
    ['neutral', [[run(UBUNTU, 'neutral'), windows]], 1],
    ['the same start, where the id decides', [[run(UBUNTU, 'failure', { id: 3 }), run(UBUNTU, 'success', { id: 4 }), windows]], 0],
  ]
  for (const [name, pages, exit] of cases) {
    const w = world({ checkRuns: [pages] })
    assert.equal(w.go(), exit, `${name}: ${w.said.join(' | ')}`)
    assert.equal(mainPushed(w.calls), exit === 0, name)
  }
  // Another app's green is not the required check: it is still waited for.
  const foreign = world({ checkRuns: [[[run(UBUNTU, 'success', { app: 999 }), run('windows', 'success', { id: 2 })]]] })
  assert.equal(foreign.go({ waitMaxMinutes: 2 }), 3)
  assert.ok(!mainPushed(foreign.calls))
  // An answer gh could not give is waited past, never read as green.
  const blip = world({ checkRuns: [null, green] })
  assert.equal(blip.go(), 0, blip.said.join('\n'))
  assert.equal(blip.state.mainPushedAfter, 2)
})

test("land refuses off main or when main moved, and requires the forge's main to be the sha after the push", () => {
  for (const branch of ['feature', null]) {
    const w = world({ branch })
    assert.equal(w.go(), 2, String(branch))
    assert.ok(!anyPush(w.calls), String(branch))
  }
  const moved = world({ mainMoves: true })
  assert.equal(moved.go(), 2, moved.said.join('\n'))
  assert.ok(moved.calls.includes(LANDING) && !mainPushed(moved.calls), 'local main moved during the wait: main is not pushed')
  const elsewhere = world({ pushLeavesForge: true })
  assert.equal(elsewhere.go(), 1)
  assert.match(elsewhere.said.join('\n'), new RegExp(`forge's main is ${OTHER}`))
})

test('the committed ruleset requires only jobs the workflow declares', () => {
  const ruleset = JSON.parse(readFileSync(new URL('../.github/rulesets/main.json', import.meta.url), 'utf8'))
  const declared = declaredJobs(readFileSync(new URL('../.github/workflows/selftest.yml', import.meta.url), 'utf8'))
  const checks = ruleset.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks
  const required = checks.map(check => ({ context: check.context, integration: check.integration_id }))
  assert.ok(required.length > 0)
  assert.deepEqual(undeclared(required, declared), [])
  assert.ok(required.every(check => check.integration === ACTIONS), 'every required check comes from GitHub Actions')
  assert.deepEqual(ruleset.bypass_actors, [], 'no bypass actor (ADR-118 Decision 1)')
  // A required name no job declares is found, so the check above can fail.
  assert.deepEqual(undeclared([...required, { context: 'selftest (windows-latest)', integration: ACTIONS }], declared), ['selftest (windows-latest)'])
})

test('mainProtection hands land each required context with the app the rule binds it to', () => {
  const rules = [[{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'windows', integration_id: ACTIONS }, { context: 'any source' }] } }]]
  const forge = mainProtection(() => JSON.stringify(rules))
  assert.equal(forge.state, 'protected')
  assert.deepEqual(forge.required, [{ context: 'windows', integration: ACTIONS }, { context: 'any source', integration: null }])
  assert.deepEqual(mainProtection(() => '[[]]').required, [])
})
