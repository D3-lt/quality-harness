// ADR-061: a constant success does not certify, and an unchecked publish is refused
// when the log was read whole. A torn log still only warns.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hookSaid } from './hook-env.mjs'
import * as lifecycle from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const qhCheck = path.join(repoRoot, 'plugin', 'bin', 'qh-check')
const testTmp = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-fail-open-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true }) } catch { /* the assertions already ran */ }
})

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
}

function git(dir, ...args) {
  const run = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...GIT_IDENTITY },
  })
  assert.equal(run.status, 0, args.join(' ') + ': ' + run.stderr)
  return run.stdout.trim()
}

function repository(prefix) {
  const dir = mkdtempSync(path.join(testTmp, prefix))
  git(dir, 'init', '-q')
  writeFileSync(path.join(dir, 'a.md'), 'a\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  return dir
}

function hook(dir, payload) {
  const run = spawnSync(process.execPath, [lifecycleScript], {
    cwd: testTmp, input: JSON.stringify({ ...payload, cwd: dir }), encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, ...GIT_IDENTITY, CLAUDE_PLUGIN_DATA: path.join(testTmp, 'data'), TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp },
  })
  assert.equal(run.status, 0, run.stderr)
  return run
}

function decision(run) {
  const text = hookSaid(run.stdout, run.stderr).stdout
  if (!text.startsWith('{')) return null
  return JSON.parse(text).hookSpecificOutput?.permissionDecision ?? null
}

function whole(entries) {
  const log = [...entries]
  log.complete = true
  return log
}

test('a constant success is not a check and an unchecked publish is refused', () => {
  for (const command of ['true', ':', 'exit 0', 'sh -c true', "bash -c 'exit 0'", 'sh -c ":"']) {
    assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  }
  for (const command of ['sh check.sh', 'npm test', "bash -c 'npm test'", 'sh -c "sh check.sh"']) {
    assert.equal(lifecycle.constantSuccessCheck(command), false, command)
  }

  const dir = repository('check-')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'true' }))
  assert.deepEqual(lifecycle.checkCommandOrigin(dir), { command: null, origin: 'refused' })
  assert.match(lifecycle.runTheCheckSentence(dir), /constant success and was refused/)
  const refused = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 30_000 })
  assert.equal(refused.status, 2)
  assert.match(refused.stderr, /constant success and was refused/)

  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  assert.deepEqual(lifecycle.checkCommandOrigin(dir), { command: 'sh check.sh', origin: 'declared' })

  const session = 'fail-open-deny-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  writeFileSync(path.join(dir, 'a.md'), 'changed\n')
  const denied = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -am changed' },
  })
  assert.equal(decision(denied), 'deny', denied.stdout)
  assert.match(denied.stderr, /unchecked/)

  const passed = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  assert.equal(passed.status, 0, passed.stderr)
  const allowed = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -am changed' },
  })
  assert.notEqual(decision(allowed), 'deny', allowed.stdout)

  const merge = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'gh pr merge 1' },
  })
  assert.notEqual(decision(merge), 'deny', merge.stdout)

  writeFileSync(path.join(dir, 'a.md'), 'again\n')
  appendFileSync(lifecycle.sessionLogFile(dir, session), '{"event":"check.failed","rec')
  const torn = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -am again' },
  })
  assert.notEqual(decision(torn), 'deny', torn.stdout)
  assert.match(hookSaid(torn.stdout, torn.stderr).text, /unknown/)
  assert.doesNotMatch(hookSaid(torn.stdout, torn.stderr).text, /no `qh-check` has passed/)
})

// Found live by a peer on 2026-09-22: a check passes on the working tree, which
// includes an untracked file, while the index holds only the staged change. The
// index then equals no checked tree, and a deny on it repeated on every attempt.
test('a passing check on the tree is not refused because the index differs from it', () => {
  const dir = repository('index-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = 'fail-open-index-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  writeFileSync(path.join(dir, 'a.md'), 'staged\n')
  git(dir, 'add', 'a.md')
  writeFileSync(path.join(dir, 'scratch.txt'), 'untracked\n')
  const passed = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  assert.equal(passed.status, 0, passed.stderr)
  const run = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -m staged' },
  })
  assert.notEqual(decision(run), 'deny', run.stdout)
  // The staged tree itself was never checked, so the warning still says so.
  assert.match(hookSaid(run.stdout, run.stderr).text, /unchecked/)

  // A tree that changed after the pass is still refused.
  writeFileSync(path.join(dir, 'scratch.txt'), 'changed after the check\n')
  const moved = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -m staged' },
  })
  assert.equal(decision(moved), 'deny', moved.stdout)
})

// The owner's decision, 2026-09-22: the refusal is the default, and a project
// may turn it back into the warning. Anything but the exact value keeps the
// default, so a typo cannot silently disable it, and the hook says so.
test('a project can turn the publish refusal back into a warning, and only on purpose', () => {
  const attempt = (label, config) => {
    const dir = repository(`publish-${label}-`)
    writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
    writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh', ...config }))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'config')
    const session = `fail-open-publish-${label}-` + process.pid
    hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
    writeFileSync(path.join(dir, 'a.md'), 'unchecked\n')
    const run = hook(dir, {
      hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
      tool_input: { command: 'git commit -am unchecked' },
    })
    return { decision: decision(run), said: hookSaid(run.stdout, run.stderr).text }
  }

  const warned = attempt('warn', { publish: 'warn' })
  assert.notEqual(warned.decision, 'deny', warned.said)
  assert.match(warned.said, /unchecked/)
  assert.match(warned.said, /"publish": "warn"/)

  const refused = attempt('default', {})
  assert.equal(refused.decision, 'deny', refused.said)

  for (const [label, publish] of [['boolean', true], ['off', 'off'], ['case', 'Warn']]) {
    const typo = attempt(label, { publish })
    assert.equal(typo.decision, 'deny', `${label}: ${typo.said}`)
    assert.match(typo.said, /"publish".*ignored/, label)
  }
})

// Codex review round 2, 2026-09-22: only the TREE's standing decides a refusal.
// An index whose check timed out must not rescue a working tree that failed.
test('an index that could not be checked does not rescue a failed working tree', () => {
  const dir = repository('index-timeout-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = 'fail-open-index-timeout-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  writeFileSync(path.join(dir, 'a.md'), 'staged\n')
  git(dir, 'add', 'a.md')
  const staged = lifecycle.observe(dir)
  writeFileSync(path.join(dir, 'a.md'), 'working tree differs\n')
  const working = lifecycle.observe(dir)
  assert.notEqual(staged.tree, working.tree)
  const at = new Date().toISOString()
  const record = (id, observation, extra) => JSON.stringify({
    id, at, git: true, command: 'sh check.sh', origin: 'declared',
    before: { ...observation, at }, after: { ...observation, at }, exit: 1, signal: null, verdict: 'failed', ...extra,
  })
  appendFileSync(path.join(lifecycle.stateDir(dir), 'checks.jsonl'),
    `${record('index-timeout', staged, { exit: null, signal: 'SIGTERM' })}\n${record('tree-failed', working, {})}\n`)
  const run = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -m staged' },
  })
  assert.equal(decision(run), 'deny', run.stdout)
  assert.doesNotMatch(hookSaid(run.stdout, run.stderr).text, /could not observe/)
})

// Codex review round 2 (F4): after a pass, a later check that could not look must
// not be reported by the session note or R1 as "no check has passed".
test('a check that could not look is not reported as no check passing', () => {
  const tree = 'tree-1'
  const log = whole([
    { event: 'session.started', observation: { ok: true, tree: 'tree-0', index: 'i0', head: 'h0' } },
    { event: 'check.passed', after: { tree }, seq: 1, record: 'a', command: 'sh check.sh' },
    { event: 'check.timeout', after: { tree }, seq: 2, record: 'b', command: 'sh check.sh' },
  ])
  const facts = lifecycle.observedFacts(log, null, { ok: true, tree, index: 'i1', head: 'h1' })
  const note = lifecycle.sessionStateNote({ ...facts, files: ['/x/a.md'] }, '/x', '/x', true, new Date('2026-09-22T00:00:00.000Z'), { tasks: false })
  assert.match(note.text, /could not observe/)
  assert.doesNotMatch(note.text, /no `qh-check` has passed/)

  const dir = repository('stop-couldnot-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = 'fail-open-stop-couldnot-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  writeFileSync(path.join(dir, 'a.md'), 'edited\n')
  const passed = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  assert.equal(passed.status, 0, passed.stderr)
  const now = lifecycle.observe(dir)
  const at = new Date().toISOString()
  appendFileSync(path.join(lifecycle.stateDir(dir), 'checks.jsonl'), `${JSON.stringify({
    id: 'later-timeout', at, git: true, command: 'sh check.sh', origin: 'declared',
    before: { ...now, at }, after: { ...now, at }, exit: null, signal: 'SIGTERM', verdict: 'failed',
  })}\n`)
  const stop = hook(dir, { hook_event_name: 'Stop', session_id: session })
  const said = hookSaid(stop.stdout, stop.stderr).text
  assert.match(said, /could not observe/)
  assert.doesNotMatch(said, /no `qh-check` has passed/)
})

// Codex review round 2 (F2): a count that was TAKEN and failed is unknown, not
// legacy. Such a write stays outstanding; only an absent field falls back.
test('a write whose check count failed stays outstanding', () => {
  const unknownCount = whole([
    { event: 'file.written', observable: false, path: 'a', checksSeen: null },
    { event: 'check.passed', seq: 1, record: 'a' },
  ])
  assert.equal(lifecycle.unobservableWrites(unknownCount).length, 1)
  const legacy = whole([
    { event: 'file.written', observable: false, path: 'a' },
    { event: 'check.passed', seq: 1, record: 'a' },
  ])
  assert.equal(lifecycle.unobservableWrites(legacy).length, 0)
})

// Codex review, 2026-09-22 (F1): a later check that could not look is not a
// failure. It must not turn an earlier pass into a refusal.
test('a check that could not look after a pass warns and does not refuse', () => {
  for (const [label, extra] of [['timeout', { signal: 'SIGTERM' }], ['unstarted', { verdict: 'unstarted' }]]) {
    const dir = repository(`couldnot-${label}-`)
    writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
    writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'check')
    const session = `fail-open-${label}-` + process.pid
    hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
    writeFileSync(path.join(dir, 'a.md'), 'edited\n')
    const passed = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
    assert.equal(passed.status, 0, passed.stderr)
    const allowed = hook(dir, {
      hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
      tool_input: { command: 'git commit -am edited' },
    })
    assert.notEqual(decision(allowed), 'deny', `${label} control: ${allowed.stdout}`)

    const now = lifecycle.observe(dir)
    assert.equal(now.ok, true)
    const at = new Date().toISOString()
    appendFileSync(path.join(lifecycle.stateDir(dir), 'checks.jsonl'), `${JSON.stringify({
      id: `later-${label}`, at, git: true, command: 'sh check.sh', origin: 'declared',
      before: { ...now, at }, after: { ...now, at }, exit: null, signal: null, verdict: 'failed', ...extra,
    })}\n`)
    const run = hook(dir, {
      hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
      tool_input: { command: 'git commit -am edited' },
    })
    assert.notEqual(decision(run), 'deny', `${label}: ${run.stdout}`)
    const said = hookSaid(run.stdout, run.stderr).text
    assert.match(said, /unknown/, label)
    assert.doesNotMatch(said, /no `qh-check` has passed/, label)
  }
})

// Codex review, 2026-09-22 (F2): a pass that finished BEFORE a write git cannot
// see must not clear it, whatever order the importer appends the two in.
test('a pass recorded before an unobservable write does not cover it', () => {
  const dir = repository('write-order-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.gitignore'), 'ignored.txt\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = 'fail-open-write-order-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  const passed = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  assert.equal(passed.status, 0, passed.stderr)
  writeFileSync(path.join(dir, 'ignored.txt'), 'written after the check\n')
  hook(dir, {
    hook_event_name: 'PostToolUse', tool_name: 'Write', session_id: session,
    tool_input: { file_path: path.join(dir, 'ignored.txt') },
  })
  hook(dir, { hook_event_name: 'Stop', session_id: session })
  const log = lifecycle.readEvents(dir, session)
  assert.equal(log.some(entry => entry.event === 'check.passed'), true, 'the earlier pass was imported')
  assert.equal(lifecycle.unobservableWrites(log).length, 1)

  const again = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  assert.equal(again.status, 0, again.stderr)
  hook(dir, { hook_event_name: 'Stop', session_id: session })
  assert.equal(lifecycle.unobservableWrites(lifecycle.readEvents(dir, session)).length, 0, 'a later pass covers it')
})

// Codex review, 2026-09-22 (F6): an index that moved while the tree still equals
// the session start is unchecked, and nothing passed. The warning must not say one did.
test('an unchecked index warning does not invent a passing check', () => {
  const dir = repository('inherited-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  writeFileSync(path.join(dir, 'a.md'), 'inherited\n')
  const session = 'fail-open-inherited-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  git(dir, 'add', 'a.md')
  const run = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -m inherited' },
  })
  assert.notEqual(decision(run), 'deny', run.stdout)
  const said = hookSaid(run.stdout, run.stderr).text
  assert.match(said, /staged index is unchecked/)
  assert.doesNotMatch(said, /passed on the working tree/)
})

test('a write stays outstanding by log order, not by its timestamp', () => {
  const laterInTheLog = whole([
    { event: 'check.passed', startedAt: '2026-01-02T00:00:00.000Z' },
    { event: 'file.written', observable: false, path: 'a', at: '2020-01-01T00:00:00.000Z' },
  ])
  assert.equal(lifecycle.unobservableWrites(laterInTheLog).length, 1)
  // A pass that STARTED before the write did not see it, whatever the log order:
  // with a clock that stepped backwards this stays outstanding, which is the
  // cautious direction (CI mutation campaign on 0150376).
  const startedBefore = whole([
    { event: 'file.written', observable: false, path: 'a', at: '2099-01-01T00:00:00.000Z' },
    { event: 'check.passed', startedAt: '2020-01-01T00:00:00.000Z' },
  ])
  assert.equal(lifecycle.unobservableWrites(startedBefore).length, 1)
  const covered = whole([
    { event: 'file.written', observable: false, path: 'a', at: '2026-01-01T00:00:00.000Z' },
    { event: 'check.passed', startedAt: '2026-01-02T00:00:00.000Z' },
  ])
  assert.equal(lifecycle.unobservableWrites(covered).length, 0)
  const torn = [
    { event: 'file.written', observable: false, path: 'a', at: '2020-01-01T00:00:00.000Z' },
    { event: 'check.passed', startedAt: '2026-01-01T00:00:00.000Z' },
  ]
  torn.complete = false
  assert.equal(lifecycle.unobservableWrites(torn).length, 1)
})

test('an unresolved check order is not worded as unchecked', () => {
  const tree = 'tree-1'
  const log = whole([
    { event: 'session.started', observation: { ok: true, tree: 'tree-0', index: 'i0', head: 'h0' } },
    { event: 'check.passed', after: { tree }, seq: 1, record: 'a', command: 'sh check.sh' },
    { event: 'check.failed', after: { tree }, seq: 1, record: 'b', command: 'sh check.sh' },
  ])
  const facts = lifecycle.observedFacts(log, null, { ok: true, tree, index: 'i1', head: 'h1' })
  const note = lifecycle.sessionStateNote(facts, testTmp, testTmp, false, new Date('2026-09-22T00:00:00.000Z'), { tasks: false })
  assert.match(note.text, /could not be established/)
  assert.doesNotMatch(note.text, /no `qh-check` has passed/)

  const dir = repository('order-')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  const session = 'fail-open-order-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  writeFileSync(path.join(dir, 'a.md'), 'changed\n')
  const now = lifecycle.observe(dir)
  assert.equal(now.ok, true)
  appendFileSync(lifecycle.sessionLogFile(dir, session),
    JSON.stringify({ event: 'check.passed', after: { tree: now.tree }, seq: 1, record: 'a' }) + '\n'
    + JSON.stringify({ event: 'check.failed', after: { tree: now.tree }, seq: 1, record: 'b' }) + '\n')
  const ended = hook(dir, { hook_event_name: 'Stop', session_id: session, last_assistant_message: 'done' })
  const said = hookSaid(ended.stdout, ended.stderr).text
  assert.match(said, /could not be established/)
  assert.doesNotMatch(said, /no `qh-check` has passed/)
  const publish = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -am changed' },
  })
  assert.notEqual(decision(publish), 'deny', publish.stdout)
  assert.match(hookSaid(publish.stdout, publish.stderr).text, /could not be established/)
})

test('the second claimant of a compaction note does not serve it', () => {
  const tmp = path.join(testTmp, 'claims')
  mkdirSync(tmp)
  const first = lifecycle.claimCompaction('session', 'compaction-1', tmp)
  const second = lifecycle.claimCompaction('session', 'compaction-1', tmp)
  assert.equal(first.claimed, true)
  assert.equal(second.claimed, false)
  assert.equal(second.reason, 'claimed')
  const blocked = path.join(testTmp, 'not-a-directory')
  writeFileSync(blocked, '')
  const failed = lifecycle.claimCompaction('session', 'compaction-2', blocked)
  assert.equal(failed.claimed, false)
  assert.notEqual(failed.reason, 'claimed')
})

test('a root query that did not answer is not a pass', () => {
  const timedOut = { error: Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null }
  const plain = mkdtempSync(path.join(testTmp, 'plain-'))
  const unanswered = lifecycle.gitRepositoryLookup(plain, timedOut)
  assert.equal(unanswered.ok, false)
  const notRepo = lifecycle.gitRepositoryLookup(plain)
  assert.equal(notRepo.ok, true)
  assert.equal(notRepo.root, null)
  const dir = repository('root-')
  const found = lifecycle.gitRepositoryLookup(dir)
  assert.equal(found.ok, true)
  assert.equal(typeof found.root, 'string')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  assert.equal(lifecycle.checkCommandOrigin(dir, unanswered).origin, 'unproven')
  assert.match(lifecycle.runTheCheckSentence(dir), /sh check\.sh/)
})

// Codex review round 3 (1): the opt-out is read from the root the refusal was
// decided on. A second lookup that failed fell back to the current directory,
// missed the root's opt-out and refused, or honoured a nested file instead.
test('the publish opt-out is read from the root the decision used, or is unknown', () => {
  const dir = repository('publish-sub-')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh', publish: 'warn' }))
  mkdirSync(path.join(dir, 'sub'))
  writeFileSync(path.join(dir, 'sub', '.quality-harness.json'), JSON.stringify({ publish: 'nope' }))
  const sub = path.join(dir, 'sub')
  assert.equal(lifecycle.publishSetting(sub, { ok: true, root: dir }).warn, true)
  const failed = lifecycle.publishSetting(sub, { ok: false, root: null, reason: 'git took too long' })
  assert.equal(failed.warn, false)
  assert.equal(failed.unknown, true)
  assert.equal(failed.ignored, false, 'a nested file is not the project config')
})

// Codex review round 3 (2): a passed working tree does not make an index that
// could not be checked read as "unchecked".
test('an index that could not be checked says unknown even when the tree passed', () => {
  const dir = repository('passed-tree-unknown-index-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = 'fail-open-passed-unknown-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  writeFileSync(path.join(dir, 'a.md'), 'staged\n')
  git(dir, 'add', 'a.md')
  const staged = lifecycle.observe(dir)
  const at = new Date().toISOString()
  appendFileSync(path.join(lifecycle.stateDir(dir), 'checks.jsonl'), `${JSON.stringify({
    id: 'staged-timeout', at, git: true, command: 'sh check.sh', origin: 'declared',
    before: { ...staged, at }, after: { ...staged, at }, exit: null, signal: 'SIGTERM', verdict: 'failed',
  })}\n`)
  writeFileSync(path.join(dir, 'a.md'), 'working tree differs\n')
  const passed = spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
  assert.equal(passed.status, 0, passed.stderr)
  const run = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git commit -m staged' },
  })
  assert.notEqual(decision(run), 'deny', run.stdout)
  const said = hookSaid(run.stdout, run.stderr).text
  assert.match(said, /not known to be checked/)
  assert.doesNotMatch(said, /staged index is unchecked/)
})

// Codex review round 3 (3): one commit's could-not-look is not every commit's.
test('R2 over several commits says at least one could not be established', () => {
  const commits = [{ sha: 'a'.repeat(40), subject: 'one' }, { sha: 'b'.repeat(40), subject: 'two' }]
  for (const flags of [{ couldNotLook: true }, { orderUnknown: true }]) {
    const text = lifecycle.uncheckedCommitsReason(testTmp, commits, flags)
    assert.match(text, /at least one of 2 newly reachable commits/, JSON.stringify(flags))
    assert.match(text, /not known to be checked/)
  }
  assert.doesNotMatch(lifecycle.uncheckedCommitsReason(testTmp, commits.slice(0, 1), { couldNotLook: true }), /at least one/)
})
