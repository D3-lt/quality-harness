// ADR-081 (docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md): qh-check reads its own
// ledger. Bound red, `todo` until its tasks turn them green.
//
// The fixture's check appends one line to a file OUTSIDE the repository, so a run is
// counted without the run changing the tree it checked.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPublishHook } from '../plugin/scripts/publish-hook.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const qhCheck = join(plugin, 'scripts', 'qh-check.mjs')
const lifecycle = join(plugin, 'scripts', 'lifecycle.mjs')
const { NODE_TEST_CONTEXT: _nested, CLAUDE_CODE_SESSION_ID: _session, ...baseEnv } = process.env
const todo = 'ADR-081'
const FULL = 'echo full >> "$QH_RUNS"'
const FAST = 'echo fast >> "$QH_RUNS"'

function repository(config = { check: FULL }) {
  const top = realpathSync(mkdtempSync(join(os.tmpdir(), 'qh-ledger-')))
  const dir = join(top, 'repo')
  spawnSync('git', ['init', '-q', dir], { timeout: 10_000, windowsHide: true })
  writeFileSync(join(dir, '.quality-harness.json'), `${JSON.stringify(config)}\n`)
  const runs = join(top, 'runs.txt')
  const leases = join(top, 'leases')
  return { top, dir, runs, env: { ...baseEnv, CLAUDE_PLUGIN_ROOT: plugin, QH_RUNS: runs, QUALITY_HARNESS_LEASE_DIR: leases } }
}
const check = (fixture, args = [], env = {}) => spawnSync(process.execPath, [qhCheck, ...args],
  { cwd: fixture.dir, env: { ...fixture.env, ...env }, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const runs = fixture => (existsSync(fixture.runs) ? readFileSync(fixture.runs, 'utf8').split('\n').filter(Boolean) : [])
const state = fixture => join(fixture.dir, '.git', 'quality-harness')
const jsonl = file => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [])
const hook = (fixture, command, session) => spawnSync(process.execPath, [lifecycle], {
  cwd: fixture.dir, env: fixture.env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, session_id: session, cwd: fixture.dir }),
})
const decision = run => {
  try { return JSON.parse(run.stdout).hookSpecificOutput?.permissionDecision ?? null } catch { return null }
}
const changed = fixture => writeFileSync(join(fixture.dir, 'notes.txt'), 'the session changed something\n')
const fastPassed = fixture => {
  const run = check(fixture, ['--fast'])
  assert.equal(run.status, 0, `the fast check passed: ${run.stderr}`)
  assert.ok(jsonl(join(state(fixture), 'fast-checks.jsonl')).length > 0, 'and was recorded')
}
const done = fixture => rmSync(fixture.top, { recursive: true, force: true })

test('a tree whose latest check passed is not checked again, and says when and how long', { todo }, () => {
  const fixture = repository()
  try {
    assert.equal(check(fixture).status, 0)
    const again = check(fixture)
    assert.equal(again.status, 0)
    assert.equal(runs(fixture).length, 1, 'the check ran once')
    assert.match(again.stderr, /already passed on this tree at \d{4}-\d\d-\d\dT[\d:.]+Z, in \d+(?:\.\d+)?s/)
    assert.equal(jsonl(join(state(fixture), 'checks.jsonl')).length, 1, 'and nothing was recorded for a run that did not happen')
  } finally { done(fixture) }
})

test('--again runs a tree that already passed', { todo }, () => {
  const fixture = repository()
  try {
    check(fixture)
    assert.equal(check(fixture, ['--again']).status, 0)
    assert.equal(runs(fixture).length, 2)
  } finally { done(fixture) }
})

test('a changed tree, a torn ledger or a failed run checks again', { todo }, () => {
  const fixture = repository()
  try {
    check(fixture)
    changed(fixture)
    check(fixture)
    assert.equal(runs(fixture).length, 2, 'a changed tree is checked')
    appendFileSync(join(state(fixture), 'checks.jsonl'), '{"torn": ')
    check(fixture)
    assert.equal(runs(fixture).length, 3, 'a ledger that cannot be read whole proves nothing')
  } finally { done(fixture) }
  const failing = repository({ check: `${FULL}; exit 1` })
  try {
    check(failing)
    check(failing)
    assert.equal(runs(failing).length, 2, 'a failure is not a pass')
  } finally { done(failing) }
})

test('a pass followed by a failure on the same tree checks again', { todo }, () => {
  const fixture = repository({ check: `${FULL}; test "$QH_MODE" != broken` })
  try {
    assert.equal(check(fixture).status, 0)
    assert.equal(check(fixture, ['--again'], { QH_MODE: 'broken' }).status, 1)
    check(fixture)
    assert.equal(runs(fixture).length, 3, 'the latest record on the tree is a failure, so the check runs')
  } finally { done(fixture) }
})

test('a write git cannot see, after the pass, checks again', { todo }, () => {
  const fixture = repository()
  const session = 'ledger-unseen'
  try {
    check(fixture, [], { CLAUDE_CODE_SESSION_ID: session })
    mkdirSync(join(state(fixture), 'sessions'), { recursive: true })
    appendFileSync(join(state(fixture), 'sessions', `${session}.jsonl`),
      `${JSON.stringify({ at: new Date().toISOString(), event: 'file.written', observable: false, path: join(fixture.dir, 'ignored.bin') })}\n`)
    check(fixture, [], { CLAUDE_CODE_SESSION_ID: session })
    assert.equal(runs(fixture).length, 2, 'a tree hash cannot speak for a write it cannot see')
  } finally { done(fixture) }
})

test('a skip waits for no lease', { todo }, () => {
  const fixture = repository()
  try {
    check(fixture)
    const leases = fixture.env.QUALITY_HARNESS_LEASE_DIR
    mkdirSync(leases, { recursive: true, mode: 0o700 })
    // Another run holding the machine: this process is alive, so its lease is live.
    writeFileSync(join(leases, `${process.pid}-${Date.now()}-aaaaaa.json`),
      JSON.stringify({ pid: process.pid, command: 'a neighbour', root: fixture.dir, start: new Date().toISOString(), state: 'running' }))
    const started = Date.now()
    const run = check(fixture, ['--wait'], { QUALITY_HARNESS_WAIT_MAX_S: '20' })
    assert.equal(run.status, 0)
    assert.match(run.stderr, /already passed on this tree/)
    assert.ok(Date.now() - started < 10_000, `a skip did not wait its turn (${Date.now() - started} ms)`)
  } finally { done(fixture) }
})

test('every run says how long it took', { todo }, () => {
  const fixture = repository()
  try {
    assert.match(check(fixture).stderr, /passed in \d+(?:\.\d+)?s/)
  } finally { done(fixture) }
})

test('a fast check is recorded apart, where no full-check reader looks', { todo }, () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    fastPassed(fixture)
    assert.deepEqual(runs(fixture), ['fast'])
    assert.equal(jsonl(join(state(fixture), 'fast-checks.jsonl')).length, 1)
    assert.equal(existsSync(join(state(fixture), 'checks.jsonl')), false, 'no reader of a full pass can see it, in any version')
  } finally { done(fixture) }
})

test('a commit-only command on a fast-passed tree is told, not refused', { todo }, () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    const run = hook(fixture, 'git commit -m x', 'ledger-commit')
    assert.notEqual(decision(run), 'deny', run.stdout)
    assert.match(run.stdout, /full check has not passed/)
  } finally { done(fixture) }
})

test('a commit with no fast pass, or a failed one, is still refused', { todo }, () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    assert.equal(decision(hook(fixture, 'git commit -m x', 'ledger-none')), 'deny', 'no fast pass')
  } finally { done(fixture) }
  const failing = repository({ check: FULL, fastCheck: `${FAST}; exit 1` })
  try {
    changed(failing)
    assert.equal(check(failing, ['--fast']).status, 1)
    assert.equal(decision(hook(failing, 'git commit -m x', 'ledger-failed')), 'deny', 'a failed fast check')
  } finally { done(failing) }
})

test('a push, or a commit that also pushes, is refused on a fast-passed tree', { todo }, () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    assert.equal(decision(hook(fixture, 'git push', 'ledger-push')), 'deny', 'a push')
    assert.equal(decision(hook(fixture, 'git commit -m x && git push', 'ledger-both')), 'deny', 'a commit that also pushes')
  } finally { done(fixture) }
})

test("git's own hooks let a commit through with the warning and refuse a push", { todo }, () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  const session = 'ledger-git-hook'
  try {
    changed(fixture)
    hook(fixture, 'ls', session)
    fastPassed(fixture)
    const env = { ...fixture.env, CLAUDE_CODE_SESSION_ID: session }
    const commit = runPublishHook({ event: 'prepare-commit-msg', cwd: fixture.dir, env })
    assert.equal(commit.code, 0)
    assert.match(commit.message ?? '', /full check has not passed/)
    assert.equal(runPublishHook({ event: 'pre-push', cwd: fixture.dir, env }).code, 1)
  } finally { done(fixture) }
})

test('a commit refused before a fast pass is told after it', { todo }, () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  const session = 'ledger-key'
  try {
    changed(fixture)
    assert.equal(decision(hook(fixture, 'git commit -m x', session)), 'deny')
    fastPassed(fixture)
    const after = hook(fixture, 'git commit -m x', session)
    assert.notEqual(decision(after), 'deny')
    assert.match(after.stdout, /full check has not passed/, 'the new state is said, not deduplicated away')
  } finally { done(fixture) }
})

test('--fast with no fastCheck declared is said, and runs nothing', { todo }, () => {
  const fixture = repository()
  try {
    const run = check(fixture, ['--fast'])
    assert.equal(run.status, 2)
    assert.match(run.stderr, /fastCheck/)
    assert.equal(runs(fixture).length, 0)
  } finally { done(fixture) }
})
