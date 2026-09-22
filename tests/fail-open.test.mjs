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
  const covered = whole([
    { event: 'file.written', observable: false, path: 'a', at: '2099-01-01T00:00:00.000Z' },
    { event: 'check.passed', startedAt: '2020-01-01T00:00:00.000Z' },
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
