// ADR-081 (docs/specs/2026-10-01-qh-check-reads-its-own-ledger.md): qh-check reads its own
// ledger. Bound red, `todo` until its tasks turn them green.
//
// The fixture's check appends one line to a file OUTSIDE the repository, so a run is
// counted without the run changing the tree it checked.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPublishHook } from '../plugin/scripts/publish-hook.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const qhCheck = join(plugin, 'scripts', 'qh-check.mjs')
const lifecycle = join(plugin, 'scripts', 'lifecycle.mjs')
const { NODE_TEST_CONTEXT: _nested, CLAUDE_CODE_SESSION_ID: _session, QUALITY_HARNESS_CHECK_AGAIN: _again, ...baseEnv } = process.env
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

test('a tree whose latest check passed is not checked again, and says when and how long', () => {
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

test('--again runs a tree that already passed', () => {
  const fixture = repository()
  try {
    check(fixture)
    assert.equal(check(fixture, ['--again']).status, 0)
    assert.equal(runs(fixture).length, 2)
  } finally { done(fixture) }
})

test('a changed tree, a torn ledger or a failed run checks again', () => {
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

test('a pass followed by a failure on the same tree checks again', () => {
  const fixture = repository({ check: `${FULL}; test "$QH_MODE" != broken` })
  try {
    assert.equal(check(fixture).status, 0)
    assert.equal(check(fixture, ['--again'], { QH_MODE: 'broken' }).status, 1)
    check(fixture)
    assert.equal(runs(fixture).length, 3, 'the latest record on the tree is a failure, so the check runs')
  } finally { done(fixture) }
})

test('a write git cannot see, after the pass, checks again', () => {
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

test('a skip waits for no lease', () => {
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

test('every run says how long it took', () => {
  const fixture = repository()
  try {
    assert.match(check(fixture).stderr, /passed in \d+(?:\.\d+)?s/)
  } finally { done(fixture) }
})

test('a fast check is recorded apart, where no full-check reader looks', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    fastPassed(fixture)
    assert.deepEqual(runs(fixture), ['fast'])
    assert.equal(jsonl(join(state(fixture), 'fast-checks.jsonl')).length, 1)
    assert.equal(existsSync(join(state(fixture), 'checks.jsonl')), false, 'no reader of a full pass can see it, in any version')
  } finally { done(fixture) }
})

test('a commit-only command on a fast-passed tree is told, not refused', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    const run = hook(fixture, 'git commit -m x', 'ledger-commit')
    assert.notEqual(decision(run), 'deny', run.stdout)
    assert.match(run.stdout, /full check has not passed/)
  } finally { done(fixture) }
})

test('a commit with no fast pass, or a failed one, is still refused', () => {
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

test('a push, or a commit that also pushes, is refused on a fast-passed tree', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    assert.equal(decision(hook(fixture, 'git push', 'ledger-push')), 'deny', 'a push')
    assert.equal(decision(hook(fixture, 'git commit -m x && git push', 'ledger-both')), 'deny', 'a commit that also pushes')
  } finally { done(fixture) }
})

test("git's own hooks let a commit through with the warning and refuse a push", () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  const session = 'ledger-git-hook'
  try {
    // The session begins before the change, so its log exists and the change is the session's.
    spawnSync(process.execPath, [lifecycle], {
      cwd: fixture.dir, env: fixture.env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: fixture.dir }),
    })
    changed(fixture)
    fastPassed(fixture)
    const env = { ...fixture.env, CLAUDE_CODE_SESSION_ID: session }
    const commit = runPublishHook({ event: 'prepare-commit-msg', cwd: fixture.dir, env })
    assert.equal(commit.code, 0)
    assert.match(commit.message ?? '', /full check has not passed/)
    assert.equal(runPublishHook({ event: 'pre-push', cwd: fixture.dir, env }).code, 1)
  } finally { done(fixture) }
})

test('a commit refused before a fast pass is told after it', () => {
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

test('--fast with no fastCheck declared is said, and runs nothing', () => {
  const fixture = repository()
  try {
    const run = check(fixture, ['--fast'])
    assert.equal(run.status, 2)
    assert.match(run.stderr, /fastCheck/)
    assert.equal(runs(fixture).length, 0)
  } finally { done(fixture) }
})

// The Codex round on ADR-081's code: each finding gets its regression, through the boundary it reported.

test('a git command that runs other commands is not a commit, whatever it names', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    for (const command of [
      "git -c alias.x='!git push' x",
      "git rebase --exec 'git commit -m y; git push' HEAD~1",
      'git --exec-path=/tmp commit -m x',
      'GIT_EDITOR=true git commit -m x',
    ]) assert.equal(decision(hook(fixture, command, 'ledger-nested')), 'deny', command)
    assert.notEqual(decision(hook(fixture, 'git -C . commit -m x', 'ledger-nested-control')), 'deny', 'git -C is still a commit')
  } finally { done(fixture) }
})

test('a commit fed by an expanding here-document is refused, and a quoted one is told', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    assert.equal(decision(hook(fixture, 'git commit -F - <<EOF\n$(git push)\nEOF', 'ledger-heredoc')), 'deny', 'its body runs a push')
    assert.notEqual(decision(hook(fixture, "git commit -F - <<'EOF'\nplain\nEOF", 'ledger-heredoc-quoted')), 'deny', 'a quoted body is data')
  } finally { done(fixture) }
})

// Since ADR-090 T2 the lexer reads an unquoted body's `$(…)` as a substitution, so the case above is
// refused before the here-document guard is reached, and that guard's mutant went GREEN (the
// dispatched campaign at df11e2e). The guard still refuses ANY unquoted body, including one that names
// nothing the lexer would flag: this pins it.
test('a commit fed by an unquoted here-document is refused even when its body names nothing to expand', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    assert.equal(decision(hook(fixture, 'git commit -F - <<EOF\nplain\nEOF', 'ledger-heredoc-plain')), 'deny', 'an unquoted body is not proven data')
  } finally { done(fixture) }
})

test('a write the ledger counts after the pass is seen, even when the clock went back', () => {
  const fixture = repository()
  try {
    check(fixture)
    mkdirSync(join(state(fixture), 'sessions'), { recursive: true })
    // Stamped before the pass started, but the ledger held the pass when it was recorded.
    appendFileSync(join(state(fixture), 'sessions', 'ledger-clock.jsonl'),
      `${JSON.stringify({ at: '2000-01-01T00:00:00.000Z', event: 'file.written', observable: false, path: join(fixture.dir, 'ignored.bin'), checksSeen: 1 })}\n`)
    check(fixture)
    assert.equal(runs(fixture).length, 2)
  } finally { done(fixture) }
})

test('a sessions directory that cannot be listed runs the check', { skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'permissions cannot hide a directory here' }, () => {
  const fixture = repository()
  const sessions = join(state(fixture), 'sessions')
  try {
    check(fixture)
    mkdirSync(sessions, { recursive: true })
    chmodSync(sessions, 0o000)
    check(fixture)
    assert.equal(runs(fixture).length, 2, 'what could not be listed may hold a write git cannot see')
  } finally {
    try { chmodSync(sessions, 0o700) } catch { /* not made */ }
    done(fixture)
  }
})

test('a row that is not a record proves nothing, in either ledger', () => {
  const fixture = repository()
  try {
    check(fixture)
    appendFileSync(join(state(fixture), 'checks.jsonl'), '{}\n')
    check(fixture)
    assert.equal(runs(fixture).length, 2, 'the skip reads the ledger as the importer does')
  } finally { done(fixture) }
  const fast = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fast)
    fastPassed(fast)
    appendFileSync(join(state(fast), 'fast-checks.jsonl'), '{}\n')
    assert.equal(decision(hook(fast, 'git commit -m x', 'ledger-row')), 'deny', 'nor does the fast ledger')
  } finally { done(fast) }
})

// BACKLOG §343: the fast exemption, read beside what the commit records and what git cannot see.
const post = (fixture, session, file) => spawnSync(process.execPath, [lifecycle], {
  cwd: fixture.dir, env: fixture.env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: resolve(fixture.dir, file) }, session_id: session, cwd: fixture.dir }),
})

test('a commit told through on a fast pass says when the staged index is not the tree it checked', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  try {
    changed(fixture)
    fastPassed(fixture)
    const partial = hook(fixture, 'git commit -m x', 'ledger-index-partial')
    assert.notEqual(decision(partial), 'deny', partial.stdout)
    assert.match(partial.stdout, /staged index is not the tree the fast check ran on/)
    spawnSync('git', ['-C', fixture.dir, 'add', '-A'], { timeout: 10_000, windowsHide: true })
    const whole = hook(fixture, 'git commit -m x', 'ledger-index-whole')
    assert.notEqual(decision(whole), 'deny', whole.stdout)
    assert.match(whole.stdout, /full check has not passed/)
    assert.doesNotMatch(whole.stdout, /staged index/, 'a commit of the checked tree is not warned')
  } finally { done(fixture) }
})

test('a write git cannot see, after a fast pass, takes the commit back to the full check', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  const session = 'ledger-fast-unseen'
  try {
    writeFileSync(join(fixture.dir, '.gitignore'), 'ignored.bin\n')
    changed(fixture)
    fastPassed(fixture)
    assert.notEqual(decision(hook(fixture, 'git commit -m x', session)), 'deny', 'told before the write')
    writeFileSync(join(fixture.dir, 'ignored.bin'), 'written after the fast check\n')
    post(fixture, session, 'ignored.bin')
    const logged = jsonl(join(state(fixture), 'sessions', `${session}.jsonl`)).find(entry => entry.event === 'file.written')
    assert.equal(logged?.fastSeen, 1, 'the write carries the fast ledger count it was made after')
    assert.equal(decision(hook(fixture, 'git commit -m x', session)), 'deny', 'a tree hash cannot speak for a write it cannot see')
    fastPassed(fixture)
    assert.notEqual(decision(hook(fixture, 'git commit -m x', session)), 'deny', 'a later fast pass covers it')
  } finally { done(fixture) }
})

test('a write the fast ledger counts after its pass is seen, even when the clock went back', () => {
  const written = fastSeen => JSON.stringify({ at: '2000-01-01T00:00:00.000Z', event: 'file.written', observable: false, path: 'ignored.bin', fastSeen })
  for (const [fastSeen, expected] of [[1, 'deny'], [0, null]]) {
    const fixture = repository({ check: FULL, fastCheck: FAST })
    try {
      changed(fixture)
      fastPassed(fixture)
      mkdirSync(join(state(fixture), 'sessions'), { recursive: true })
      appendFileSync(join(state(fixture), 'sessions', 'ledger-fast-clock.jsonl'), `${written(fastSeen)}\n`)
      const run = hook(fixture, 'git commit -m x', 'ledger-fast-clock-commit')
      assert.equal(decision(run), expected, `fastSeen ${fastSeen}: ${run.stdout}`)
    } finally { done(fixture) }
  }
})

// The review of §343's first fix: a veto over every write git cannot see refused a commit after a
// scratchpad note, which a full pass never did. Only a write inside the repository counts.
test('a write outside the repository vetoes neither a fast-path commit nor the full skip', () => {
  const fixture = repository({ check: FULL, fastCheck: FAST })
  const outside = join(fixture.top, 'scratch.txt')
  try {
    changed(fixture)
    fastPassed(fixture)
    writeFileSync(outside, 'a note the check never reads\n')
    post(fixture, 'ledger-outside-self', outside)
    const logged = jsonl(join(state(fixture), 'sessions', 'ledger-outside-self.jsonl')).find(entry => entry.event === 'file.written')
    assert.equal(logged?.observable, false, 'the write is one git cannot see')
    const commit = hook(fixture, 'git commit -F msg.txt', 'ledger-outside-self')
    assert.notEqual(decision(commit), 'deny', commit.stdout)
    assert.match(commit.stdout, /full check has not passed/)
    assert.equal(check(fixture).status, 0)
    post(fixture, 'ledger-outside-peer', outside)
    assert.match(check(fixture).stderr, /already passed on this tree/, "a peer's write outside the tree does not undo the skip")
    assert.deepEqual(runs(fixture), ['fast', 'full'])
  } finally { done(fixture) }
})

// The owner, 2026-10-02: a skip was invisible — it wrote nothing, so ADR-081's follow-up could not
// count how often the same-tree skip actually saves a run. It appends to skips.jsonl, where no
// reader of a pass looks, naming the pass it reused; a run that runs appends nothing there.
test('a skip is recorded in its own ledger, naming the pass it reused', () => {
  const fixture = repository()
  try {
    assert.equal(check(fixture).status, 0)
    assert.equal(jsonl(join(state(fixture), 'skips.jsonl')).length, 0, 'a run that ran is not a skip')
    const [pass] = jsonl(join(state(fixture), 'checks.jsonl'))
    const skipped = check(fixture)
    assert.equal(skipped.status, 0)
    const skips = jsonl(join(state(fixture), 'skips.jsonl'))
    assert.equal(skips.length, 1, skipped.stderr)
    assert.equal(skips[0].passId, pass.id)
    assert.equal(skips[0].tree, pass.after.tree)
    assert.equal(skips[0].command, pass.command)
    assert.equal(typeof skips[0].id, 'string')
    assert.ok(Number.isFinite(skips[0].savedMs), JSON.stringify(skips[0]))
    assert.equal(jsonl(join(state(fixture), 'checks.jsonl')).length, 1, 'no reader of a pass sees the skip')
  } finally { done(fixture) }
})

test('a skip whose ledger cannot be written is said, and still skips', () => {
  const fixture = repository()
  try {
    assert.equal(check(fixture).status, 0)
    mkdirSync(join(state(fixture), 'skips.jsonl'))
    const skipped = check(fixture)
    assert.equal(skipped.status, 0, skipped.stderr)
    assert.match(skipped.stderr, /already passed on this tree/)
    assert.match(skipped.stderr, /the skip could not be recorded/)
    assert.equal(runs(fixture).length, 1, 'the check did not run again')
  } finally { done(fixture) }
})

// ADR-088 Follow-ups: qh-check ends every record with a newline, so a last line without one was
// not written whole even when it parses. Both readers of a pass here read it as the importer does.
test('an unterminated last line proves nothing, in either ledger', () => {
  for (const cut of [true, false]) {
    const fixture = repository()
    try {
      assert.equal(check(fixture).status, 0)
      const file = join(state(fixture), 'checks.jsonl')
      const text = readFileSync(file, 'utf8')
      assert.ok(text.endsWith('}\n'), text)
      // A passing record cut right after its closing brace: it parses, and it was not written whole.
      if (cut) writeFileSync(file, text.slice(0, -1))
      assert.equal(check(fixture).status, 0)
      assert.equal(runs(fixture).length, cut ? 2 : 1, cut ? 'a pass cut after its brace was skipped on' : 'the twin: a whole pass is skipped on')
    } finally { done(fixture) }
    const fast = repository({ check: FULL, fastCheck: FAST })
    try {
      changed(fast)
      fastPassed(fast)
      const file = join(state(fast), 'fast-checks.jsonl')
      const text = readFileSync(file, 'utf8')
      assert.ok(text.endsWith('}\n'), text)
      if (cut) writeFileSync(file, text.slice(0, -1))
      const run = hook(fast, 'git commit -m x', `ledger-fast-cut-${cut}`)
      if (cut) assert.equal(decision(run), 'deny', `a fast pass cut after its brace exempted the commit: ${run.stdout}`)
      else assert.notEqual(decision(run), 'deny', `the twin: a whole fast pass is told, not refused: ${run.stdout}`)
    } finally { done(fast) }
  }
})

// ADR-088 Follow-ups: a write stamps how many records each ledger held, numbered as the importer
// numbers them, so a last line with no terminating newline is not counted.
test('a write counts only the ledger records written whole', () => {
  for (const cut of [true, false]) {
    const fixture = repository({ check: FULL, fastCheck: FAST })
    const session = `ledger-count-${cut ? 'cut' : 'kept'}`
    try {
      assert.equal(check(fixture).status, 0)
      fastPassed(fixture)
      for (const name of ['checks.jsonl', 'fast-checks.jsonl']) {
        const file = join(state(fixture), name)
        const text = readFileSync(file, 'utf8')
        assert.ok(text.endsWith('}\n'), text)
        if (cut) writeFileSync(file, text.slice(0, -1))
      }
      assert.equal(post(fixture, session, 'notes.txt').status, 0)
      const written = jsonl(join(state(fixture), 'sessions', `${session}.jsonl`)).filter(entry => entry.event === 'file.written').at(-1)
      assert.ok(written, 'the write was recorded')
      assert.deepEqual([written.checksSeen, written.fastSeen], cut ? [0, 0] : [1, 1])
    } finally { done(fixture) }
  }
})
