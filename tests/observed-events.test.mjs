// ADR-060: advisories react to observed events, not to parsed commands.
//
// Patterns and fixtures live at module scope, never as regex literals inside a
// test body (BACKLOG §212). Git runs only in directories these tests create
// (CLAUDE.md §9); every hook runs as a process with its temp directory here.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as lifecycle from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-events-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write('[observed-events.test] could not remove ' + testTmp + ': ' + (error?.message ?? error) + '\n')
  }
})

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
}
const HOOK_ENV = {
  ...process.env, ...GIT_IDENTITY,
  CLAUDE_PLUGIN_DATA: path.join(testTmp, 'plugin-data'), TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp,
}
const RULE_ONE_TEXT = 'first finding for the probe'
const RULE_TWO_TEXT = 'second finding for the probe'
const DENY_TEXT = 'a refusal for the probe'

function git(dir, ...args) {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...GIT_IDENTITY } })
  assert.equal(run.status, 0, 'git ' + args.join(' ') + ': ' + run.stderr)
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

let sessionCount = 0
function sessionId(label) {
  sessionCount += 1
  return 'events-' + label + '-' + process.pid + '-' + sessionCount
}

function hook(payload) {
  const run = spawnSync(process.execPath, [lifecycleScript], {
    cwd: testTmp, input: JSON.stringify(payload), encoding: 'utf8', timeout: 60_000, env: HOOK_ENV,
  })
  assert.equal(run.status, 0, run.stderr)
  return run
}

function eventsIn(stateDirectory, session) {
  const file = path.join(stateDirectory, 'sessions', session + '.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function named(log, name) {
  return log.filter(entry => entry.event === name)
}

function temporaryStateDirectory(directory) {
  return path.join(testTmp, 'quality-harness', createHash('sha256').update(realpathSync(directory)).digest('hex'))
}

function objectCount(dir) {
  let count = 0
  const walk = current => {
    for (const name of readdirSync(current)) {
      const entry = path.join(current, name)
      if (statSync(entry).isDirectory()) walk(entry)
      else count += 1
    }
  }
  walk(path.join(dir, '.git', 'objects'))
  return count
}

test('a turn end observes the tree without reading any command', () => {
  assert.equal(typeof lifecycle.observe, 'function')
  assert.equal(typeof lifecycle.sameObservation, 'function')
  const dir = repository('t1-')
  const session = sessionId('turn')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  writeFileSync(path.join(dir, 'b.md'), 'b\n')
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  hook({ hook_event_name: 'SessionStart', source: 'compact', session_id: session, cwd: dir })
  const outside = path.join(testTmp, 'outside-' + session + '.md')
  writeFileSync(outside, 'x\n')
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: outside }, session_id: session, cwd: dir })
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'b.md') }, session_id: session, cwd: dir })

  const log = eventsIn(path.join(dir, '.git', 'quality-harness'), session)
  const started = named(log, 'session.started')
  const ended = named(log, 'turn.ended')
  assert.equal(started.length, 1)
  assert.equal(ended.length, 1)
  assert.equal(started[0].observation.ok, true)
  assert.equal(ended[0].observation.ok, true)
  assert.notEqual(started[0].observation.tree, ended[0].observation.tree)
  const written = named(log, 'file.written')
  assert.equal(written.length, 2)
  assert.equal(written[0].path, outside)
  assert.equal(written[0].observable, false)
  assert.equal(written[0].blob, undefined)
  assert.equal(written[1].observable, true)
  assert.equal(written[1].blob, git(dir, 'hash-object', 'b.md'))

  const linked = path.join(testTmp, 'linked-' + session)
  git(dir, 'worktree', 'add', '-q', linked)
  const linkedSession = sessionId('linked')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: linkedSession, cwd: linked })
  const linkedState = path.join(git(linked, 'rev-parse', '--absolute-git-dir'), 'quality-harness')
  assert.equal(named(eventsIn(linkedState, linkedSession), 'session.started').length, 1)
  assert.equal(eventsIn(path.join(dir, '.git', 'quality-harness'), linkedSession).length, 0)

  const plain = mkdtempSync(path.join(testTmp, 'plain-'))
  const plainSession = sessionId('plain')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: plainSession, cwd: plain })
  const plainLog = eventsIn(temporaryStateDirectory(plain), plainSession)
  assert.equal(named(plainLog, 'session.started').length, 1)
  assert.equal(plainLog[0].observation.ok, false)

  const broken = mkdtempSync(path.join(testTmp, 'broken-'))
  writeFileSync(path.join(broken, '.git'), 'gitdir: ' + path.join(broken, 'missing') + '\n')
  const first = lifecycle.observe(broken)
  const second = lifecycle.observe(broken)
  assert.equal(first.ok, false)
  assert.equal(lifecycle.sameObservation(first, second), false)
  const good = lifecycle.observe(dir)
  assert.equal(good.ok, true)
  assert.equal(lifecycle.sameObservation(good, good), true)
})

test('observing writes nothing into the repository', () => {
  assert.equal(typeof lifecycle.observe, 'function')
  const dir = repository('t2-')
  writeFileSync(path.join(dir, 'a.md'), 'changed\n')
  writeFileSync(path.join(dir, 'new.md'), 'new\n')
  const statusBefore = git(dir, '--no-optional-locks', 'status', '--porcelain')
  const indexBefore = readFileSync(path.join(dir, '.git', 'index'))
  const objectsBefore = objectCount(dir)
  const first = lifecycle.observe(dir)
  const second = lifecycle.observe(dir)
  assert.deepEqual(readFileSync(path.join(dir, '.git', 'index')), indexBefore)
  assert.equal(objectCount(dir), objectsBefore)
  assert.equal(git(dir, '--no-optional-locks', 'status', '--porcelain'), statusBefore)
  assert.equal(first.ok, true)
  assert.equal(lifecycle.sameObservation(first, second), true)
  assert.notEqual(first.tree, first.index)
  assert.equal(lifecycle.observe(mkdtempSync(path.join(testTmp, 'plain2-'))).ok, false)
})

test('one hook delivers every action it records', () => {
  assert.equal(typeof lifecycle.deliver, 'function')
  assert.equal(typeof lifecycle.stateDir, 'function')
  const dir = repository('t3-')
  const stop = { hook_event_name: 'Stop', session_id: sessionId('deliver'), cwd: dir }
  const both = lifecycle.deliver([
    { rule: 'R1', key: 'k1', text: RULE_ONE_TEXT },
    { rule: 'R2', key: 'k2', text: RULE_TWO_TEXT },
  ], stop)
  assert.ok(String(both.output?.systemMessage).includes(RULE_ONE_TEXT))
  assert.ok(String(both.output?.systemMessage).includes(RULE_TWO_TEXT))
  assert.deepEqual(named(eventsIn(lifecycle.stateDir(dir), stop.session_id), 'action.emitted').map(entry => entry.rule), ['R1', 'R2'])

  const pre = { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: sessionId('deny'), cwd: dir }
  const denied = lifecycle.deliver([
    { rule: 'deny', key: 'd1', text: DENY_TEXT, deny: true },
    { rule: 'P', key: 'p1', text: RULE_ONE_TEXT },
  ], pre)
  assert.equal(denied.output?.hookSpecificOutput?.permissionDecision, 'deny')
  assert.equal(JSON.stringify(denied.output).includes(RULE_ONE_TEXT), false)
  assert.deepEqual(named(eventsIn(lifecycle.stateDir(dir), pre.session_id), 'action.emitted').map(entry => entry.rule), ['deny'])

  const quiet = { hook_event_name: 'Stop', session_id: sessionId('quiet'), cwd: dir }
  assert.equal(lifecycle.deliver([], quiet).output, null)
  assert.equal(eventsIn(lifecycle.stateDir(dir), quiet.session_id).length, 0)
})
