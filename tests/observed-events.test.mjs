// ADR-060: advisories react to observed events, not to parsed commands.
//
// Patterns and fixtures live at module scope, never as regex literals inside a
// test body (BACKLOG §212). Git runs only in directories these tests create
// (CLAUDE.md §9); every hook runs as a process with its temp directory here.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as lifecycle from '../plugin/scripts/lifecycle.mjs'
import * as statusline from '../plugin/scripts/statusline.mjs'
import { tally } from '../plugin/scripts/claims-rate.mjs'
import { ABSENT } from '../plugin/scripts/event-log.mjs'
import { persistedEventPath } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const testTmp = realpathSync.native(mkdtempSync(path.join(
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

function hook(payload, env = {}) {
  const run = spawnSync(process.execPath, [lifecycleScript], {
    cwd: testTmp, input: JSON.stringify(payload), encoding: 'utf8', timeout: 120_000, env: { ...HOOK_ENV, ...env },
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

// ---- T2: qh-check writes the check event.
const qhCheck = path.join(repoRoot, 'plugin', 'bin', 'qh-check')
const CHECK_SCRIPT = [
  'case "$QH_PROBE_MODE" in',
  '  fail) exit 1 ;;',
  '  write) echo x > created-by-check.txt ;;',
  "  zero) echo 'tests 0' ;;",
  '  long) i=0; while [ $i -lt 2000 ]; do echo "line $i of padding that pushes the summary past the first 64 KiB"; i=$((i+1)); done; echo \'tests 0\' ;;',
  '  missing) qh_probe_missing_command_zz ;;',
  '  timeout) exit 124 ;;',
  '  sleep) sleep 30 ;;',
  '  pause) F="${QH_PROBE_FLAGS:-.}"; : > "$F/started.flag"; i=0; while [ ! -f "$F/go.flag" ] && [ $i -lt 600 ]; do sleep 0.1; i=$((i+1)); done ;;',
  'esac',
].join('\n') + '\n'
const CHECK_RUNS = [
  ['pass', 0, 'check.passed'],
  ['fail', 1, 'check.failed'],
  ['zero', 0, 'check.no-work'],
  ['long', 0, 'check.no-work'],
  ['missing', 127, 'check.unstarted'],
  ['timeout', 124, 'check.timeout'],
  ['write', 0, 'check.unproven'],
]
const CHECK_EVENT_PREFIX = 'check.'

function qhCheckRun(cwd, mode, options = {}) {
  return spawnSync('python3', [qhCheck], {
    cwd, encoding: 'utf8', timeout: 60_000, env: { ...HOOK_ENV, QH_PROBE_MODE: mode }, ...options,
  })
}

function checkEvents(log) {
  return log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith(CHECK_EVENT_PREFIX))
}

function projectWithCheck(directory) {
  writeFileSync(path.join(directory, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  writeFileSync(path.join(directory, 'check.sh'), CHECK_SCRIPT)
}

test('a check event is written by qh-check', () => {
  assert.ok(existsSync(qhCheck), 'plugin/bin/qh-check exists')
  const dir = repository('t2c-')
  projectWithCheck(dir)
  mkdirSync(path.join(dir, 'sub'))
  writeFileSync(path.join(dir, 'sub', 'keep.md'), 'k\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const sub = path.join(dir, 'sub')
  const expected = []
  for (const [mode, exit, name] of CHECK_RUNS) {
    const run = qhCheckRun(sub, mode)
    assert.equal(run.status, exit, mode + ': ' + run.stderr)
    expected.push(name)
  }
  if (process.platform !== 'win32') {
    qhCheckRun(sub, 'sleep', { timeout: 3_000, killSignal: 'SIGTERM' })
    expected.push('check.timeout')
  }
  const session = sessionId('checks')
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  const imported = checkEvents(eventsIn(path.join(dir, '.git', 'quality-harness'), session))
  assert.deepEqual(imported.map(entry => entry.event), expected)
  assert.ok(imported.every(entry => entry.origin === 'declared'), JSON.stringify(imported.map(entry => entry.origin)))
  if (process.platform !== 'win32') assert.equal(imported.at(-1).signal, 'SIGTERM')

  const bare = repository('t2n-')
  assert.equal(qhCheckRun(bare, 'pass').status, 2)
  assert.equal(existsSync(path.join(bare, '.git', 'quality-harness', 'checks.jsonl')), false)

  const plain = mkdtempSync(path.join(testTmp, 'plain-check-'))
  projectWithCheck(plain)
  assert.equal(qhCheckRun(plain, 'pass').status, 0)
  assert.ok(existsSync(path.join(temporaryStateDirectory(plain), 'checks.jsonl')))
  const plainSession = sessionId('plain-check')
  hook({ hook_event_name: 'Stop', session_id: plainSession, cwd: plain })
  assert.deepEqual(checkEvents(eventsIn(temporaryStateDirectory(plain), plainSession)).map(entry => entry.event), ['check.passed'])
})

// ---- T3: a read-only role cannot commit or push, and its other changes are reported.
const REVIEWER = 'quality-harness:qh-correctness-reviewer'
const DENIED_FOR_REVIEWER = [
  'git commit -m x',
  'git push',
  "bash -c 'git commit -m x'",
  "pwsh -Command 'git push'",
  'python3 -c \'import subprocess; subprocess.run(["git","push"])\'',
]
const ALLOWED_FOR_REVIEWER = ['qh-check', "node -e 'console.log(1)'", 'uniq < a.md', 'git log --oneline', 'grep -n pre-commit a.md']
const CHANGED_DURING = 'changed during'

function hookOutput(run) {
  const line = run.stdout.trim().split('\n').filter(Boolean).at(-1)
  if (!line) return {}
  try { return JSON.parse(line) } catch { return {} }
}

function isDenied(run) {
  return hookOutput(run)?.hookSpecificOutput?.permissionDecision === 'deny'
}

test('a read-only role cannot commit or push and its other changes are reported', () => {
  assert.equal(typeof lifecycle.containsCommitOrPush, 'function')
  const dir = repository('t3r-')
  const denySession = sessionId('reviewer-deny')
  const asReviewer = (toolName, toolInput, session) => hook({
    hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, agent_type: REVIEWER, session_id: session, cwd: dir,
  })
  for (const command of DENIED_FOR_REVIEWER) {
    assert.equal(isDenied(asReviewer('Bash', { command }, denySession)), true, command)
  }
  assert.equal(isDenied(asReviewer('Edit', { file_path: path.join(dir, 'a.md') }, denySession)), true, 'Edit')
  assert.equal(eventsIn(path.join(dir, '.git', 'quality-harness'), denySession).length, 0)
  for (const command of ALLOWED_FOR_REVIEWER) {
    assert.equal(isDenied(asReviewer('Bash', { command }, sessionId('reviewer-allow'))), false, command)
  }

  const session = sessionId('review')
  const start = id => hook({ hook_event_name: 'SubagentStart', agent_id: id, agent_type: REVIEWER, session_id: session, cwd: dir })
  const stop = id => JSON.stringify(hookOutput(hook({ hook_event_name: 'SubagentStop', agent_id: id, agent_type: REVIEWER, session_id: session, cwd: dir })))
  writeFileSync(path.join(dir, 'staged.md'), 'staged\n')
  start('a1')
  git(dir, 'add', 'staged.md')
  const staged = stop('a1')
  assert.ok(staged.includes(CHANGED_DURING) && staged.includes('staged.md'), staged)
  start('a2')
  const sorted = spawnSync('sh', ['-c', 'sort -o out.txt a.md'], { cwd: dir, encoding: 'utf8', timeout: 30_000 })
  assert.equal(sorted.status, 0, sorted.stderr)
  const written = stop('a2')
  assert.ok(written.includes(CHANGED_DURING) && written.includes('out.txt'), written)
  start('a3')
  assert.equal(stop('a3').includes(CHANGED_DURING), false)

  start('b1')
  writeFileSync(path.join(dir, 'during.md'), 'during\n')
  start('b2')
  const overlapping = stop('b1')
  assert.ok(overlapping.includes(CHANGED_DURING) && overlapping.includes('during.md'), overlapping)
  assert.equal(stop('b2').includes(CHANGED_DURING), false)
})

// ---- T4: a command naming commit or push is warned before it runs.
const PUBLISH_WARNING = 'names commit or push'
const OLD_COMMIT_ADVISORY = 'would publish'

test('a command naming commit or push is warned before it runs', () => {
  assert.equal(typeof lifecycle.containsCommitOrPush, 'function')
  const dir = repository('t4p-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const other = repository('t4o-')
  const session = sessionId('publish')
  const pre = command => JSON.stringify(hookOutput(hook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, session_id: session, cwd: dir,
  })))
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })

  writeFileSync(path.join(dir, 'a.md'), 'edited\n')
  const first = pre('git commit -m x')
  assert.ok(first.includes(PUBLISH_WARNING), first)
  assert.ok(first.includes('qh-check'), first)
  assert.equal(first.includes(OLD_COMMIT_ADVISORY), false, first)
  assert.equal(pre('git push').includes(PUBLISH_WARNING), false)

  writeFileSync(path.join(dir, 'b.md'), 'b\n')
  assert.ok(pre("pwsh -Command 'git push'").includes(PUBLISH_WARNING))
  writeFileSync(path.join(dir, 'c.md'), 'c\n')
  assert.ok(pre('git -C "' + other + '" commit -m x').includes(PUBLISH_WARNING))

  assert.equal(qhCheckRun(dir, 'pass').status, 0)
  assert.equal(pre('git commit -m x').includes(PUBLISH_WARNING), false)
  assert.equal(qhCheckRun(dir, 'fail').status, 1)
  assert.ok(pre('git commit -m x').includes(PUBLISH_WARNING))

  const bare = repository('t4n-')
  const bareSession = sessionId('publish-bare')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: bareSession, cwd: bare })
  writeFileSync(path.join(bare, 'a.md'), 'edited\n')
  const quiet = JSON.stringify(hookOutput(hook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, session_id: bareSession, cwd: bare,
  })))
  assert.equal(quiet.includes(PUBLISH_WARNING), false, quiet)
})

// ---- T5: completion rules advise once per rule and evidence.
//
// ADR-060's Decision fixes the step table below. Each step's delivered rules are
// read from `action.emitted` rather than from message text, so a wording change
// cannot loosen the test; every step whose row is `—` must also have said
// nothing at all, since a legacy delivery carries no rule and writes no event.
const SCENARIO = [
  ['1 SessionStart', []],
  ['2 write a.md; Stop', ['R1']],
  ['3 Stop', []],
  ['4 qh-check passes; Stop', []],
  ['5 PreToolUse then commit one; Stop', []],
  ['6 PreToolUse then commit in B; Stop', []],
  ['7 reads; Stop', []],
  ['8 compact SessionStart; Stop', []],
  ['9 write b.md; sh check.sh; PreToolUse commit two', ['P']],
  ["9' run it; Stop", []],
  ['10 write c.md; compact SessionStart; Stop', ['R1']],
  ['11 edit a.md; PreToolUse bash -c commit three', ['P']],
  ["11' run it; Stop", []],
  ['12 edit a.md; PreToolUse git --git-dir commit -am four', ['P']],
  ["12' run it; Stop", []],
  ['13 qh-check passes; Stop', []],
  ['14 commit five then six; Stop', ['R2']],
  ['15 qh-check fails; Stop', ['R1']],
]
const LEDGER_VERSION = 'events/1'
const PAUSE_STARTED = 'started.flag'
const PAUSE_RELEASE = 'go.flag'
const OUTSIDE_COUNT = /1 path written outside/
const LAST_OBSERVED = /last observed \d+[smh] ago/

function claimRows(session) {
  const file = path.join(HOOK_ENV.CLAUDE_PLUGIN_DATA, 'claims.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .map(line => JSON.parse(line)).filter(row => row.session === session)
}

// The scripted session, driven as processes in repositories A (with the check,
// when asked for one) and B. Returns one record per step: the rules it
// delivered, the ledger rows it wrote, and everything it said.
function scriptedSession(withCheck) {
  const a = repository(withCheck ? 't5a-' : 't5u-')
  writeFileSync(path.join(a, 'check.sh'), CHECK_SCRIPT)
  if (withCheck) writeFileSync(path.join(a, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(a, 'add', '-A')
  git(a, 'commit', '-q', '-m', 'check')
  const b = repository(withCheck ? 't5b-' : 't5v-')
  const session = sessionId(withCheck ? 'scripted' : 'scripted-plain')
  const state = path.join(a, '.git', 'quality-harness')
  const said = []
  const fire = (payload, collect = true) => {
    const run = hook({ ...payload, session_id: session, cwd: a })
    if (collect) said.push(run.stdout.trim())
    return run
  }
  const stop = () => fire({ hook_event_name: 'Stop', last_assistant_message: 'a turn of work' })
  const pre = command => fire({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })
  const wrote = (tool, file) => fire({
    hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: path.join(a, file) },
  }, false)
  const opened = source => fire({ hook_event_name: 'SessionStart', source }, false)
  const shell = (cwd, command) => {
    const run = spawnSync('sh', ['-c', command], {
      cwd, encoding: 'utf8', timeout: 60_000, env: { ...HOOK_ENV, QH_PROBE_MODE: 'pass' },
    })
    assert.equal(run.status, 0, command + ': ' + run.stderr)
  }
  const check = (mode, code) => assert.equal(qhCheckRun(a, mode).status, withCheck ? code : 2)
  const steps = []
  let seenActions = 0
  let seenRows = 0
  const step = (label, run) => {
    said.length = 0
    run()
    const emitted = named(eventsIn(state, session), 'action.emitted')
    const rows = claimRows(session)
    steps.push({
      label,
      rules: emitted.slice(seenActions).map(entry => entry.rule),
      rows: rows.slice(seenRows),
      said: said.join('\n'),
      quiet: said.every(line => !line),
    })
    seenActions = emitted.length
    seenRows = rows.length
  }

  step(SCENARIO[0][0], () => { opened('startup') })
  step(SCENARIO[1][0], () => {
    writeFileSync(path.join(a, 'a.md'), 'second\n')
    wrote('Write', 'a.md')
    stop()
  })
  step(SCENARIO[2][0], () => { stop() })
  step(SCENARIO[3][0], () => { check('pass', 0); stop() })
  step(SCENARIO[4][0], () => {
    pre('git add -A && git commit -m one')
    shell(a, 'git add -A && git commit -q -m one')
    stop()
  })
  step(SCENARIO[5][0], () => {
    pre('git -C ' + b + ' commit --allow-empty -m other')
    git(b, 'commit', '-q', '--allow-empty', '-m', 'other')
    stop()
  })
  step(SCENARIO[6][0], () => {
    for (const command of ['cat a.md', 'grep -n second a.md', 'for f in $(ls); do echo "$f"; done']) {
      pre(command)
      shell(a, command)
    }
    stop()
  })
  step(SCENARIO[7][0], () => { opened('compact'); stop() })
  step(SCENARIO[8][0], () => {
    writeFileSync(path.join(a, 'b.md'), 'b\n')
    wrote('Write', 'b.md')
    shell(a, 'sh check.sh')
    pre('git add -A && git commit -m two')
  })
  step(SCENARIO[9][0], () => { shell(a, 'git add -A && git commit -q -m two'); stop() })
  step(SCENARIO[10][0], () => {
    writeFileSync(path.join(a, 'c.md'), 'c\n')
    wrote('Write', 'c.md')
    opened('compact')
    stop()
  })
  step(SCENARIO[11][0], () => {
    writeFileSync(path.join(a, 'a.md'), 'third\n')
    wrote('Edit', 'a.md')
    pre("bash -c 'git add -A && git commit -m three'")
  })
  step(SCENARIO[12][0], () => { shell(a, "bash -c 'git add -A && git commit -q -m three'"); stop() })
  step(SCENARIO[13][0], () => {
    writeFileSync(path.join(a, 'a.md'), 'fourth\n')
    wrote('Edit', 'a.md')
    pre('git --git-dir=' + path.join(a, '.git') + ' --work-tree=' + a + ' -C ' + b + ' commit -am four')
  })
  step(SCENARIO[14][0], () => {
    const run = spawnSync('git', ['--git-dir=' + path.join(a, '.git'), '--work-tree=' + a,
      '-C', b, 'commit', '-q', '-am', 'four'], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...GIT_IDENTITY } })
    assert.equal(run.status, 0, run.stderr)
    stop()
  })
  step(SCENARIO[15][0], () => { check('pass', 0); stop() })
  step(SCENARIO[16][0], () => {
    writeFileSync(path.join(a, 'd.md'), 'd\n')
    shell(a, 'git add -A && git commit -q -m five')
    shell(a, 'git rm -q d.md && git commit -q -m six')
    stop()
  })
  step(SCENARIO[17][0], () => { check('fail', 1); stop() })
  return { steps, session, a, b, state }
}

test('the scripted session advises as its step table lists', () => {
  const run = scriptedSession(true)
  assert.deepEqual(run.steps.map(entry => [entry.label, entry.rules]),
    SCENARIO.map(([label, rules]) => [label, rules]))
  for (const [index, entry] of run.steps.entries()) {
    if (SCENARIO[index][1].length === 0) assert.ok(entry.quiet, entry.label + ' said: ' + entry.said)
  }
  // Step 14 names the commit whose tree nothing checked, and not the one whose
  // tree is the checked working tree.
  const fourteen = run.steps[16]
  assert.ok(fourteen.said.includes('five'), fourteen.said)
  assert.equal(fourteen.said.includes('six'), false, fourteen.said)

  // ADR-035: one row per completion event, its evidence computed from the tree,
  // the commits and the writes — never from whether a rule spoke.
  const rows = claimRows(run.session)
  assert.ok(rows.every(row => row.version === LEDGER_VERSION), JSON.stringify(rows.slice(0, 2)))
  assert.equal(run.steps[1].rows.at(-1)?.evidence, 'unverified')
  assert.equal(run.steps[2].rows.at(-1)?.evidence, 'unverified')
  // Step 9′: P warned, the commit ran, and nothing checked it. A suppressed R1
  // must not read as verified.
  assert.equal(run.steps[9].rows.at(-1)?.evidence, 'unverified')
  assert.equal(run.steps[3].rows.at(-1)?.evidence, 'verified')
  // Step 14: the tree is the checked one, and a commit nothing checked is
  // reachable — the ledger speaks for the commits too, not only for the tree.
  assert.equal(run.steps[16].rows.at(-1)?.evidence, 'unverified')

  // `tally` still reads these rows, beside a row written before the version field.
  const older = JSON.stringify({
    at: new Date().toISOString(), event: 'Stop', cwd: run.a, session: 'older',
    claim: 'none', phrase: null, evidence: 'verified', mutations: 0,
  })
  const counts = tally(older + '\n' + rows.map(row => JSON.stringify(row)).join('\n') + '\n')
  assert.equal(counts.unreadable, 0)
  assert.equal(counts.unrecognised, 0, JSON.stringify(counts.unrecognisedLines))
  assert.equal(counts.rows, rows.length + 1)
})

test('a repository without a check hears no completion advisory', () => {
  const run = scriptedSession(false)
  for (const entry of run.steps) {
    assert.deepEqual(entry.rules, [], entry.label + ' delivered ' + entry.rules.join(', '))
    assert.ok(entry.quiet, entry.label + ' said: ' + entry.said)
  }
  const rows = claimRows(run.session)
  assert.ok(rows.length > 0)
  assert.deepEqual([...new Set(rows.map(row => row.evidence))], ['no-check'])
})

test('an unchecked commit is named even when its tree equals the session start', () => {
  const dir = repository('t5s-')
  projectWithCheck(dir)
  writeFileSync(path.join(dir, 'pending.md'), 'pending\n')
  const session = sessionId('start-tree')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  // Outside any hook: the commit takes exactly what the session started with, so
  // its tree IS the session-start tree — and nothing has checked it.
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'pinned')
  writeFileSync(path.join(dir, 'later.md'), 'later\n')
  const ended = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.deepEqual(named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule), ['R1', 'R2'])
  assert.ok(ended.stdout.includes('pinned'), ended.stdout)
})

// Found by the T5 mutation pass: the scripted session could not tell the ledger
// apart from the rules, because at step 9′ an unchecked COMMIT kept the row
// honest whatever the tree contributed. This is the isolated case — P warned,
// nothing was committed, and the row must still say the work is unchecked.
test('a tree the publish warning named still records unverified', () => {
  const dir = repository('t5l-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = sessionId('warned')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  writeFileSync(path.join(dir, 'e.md'), 'e\n')
  hook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' },
    session_id: session, cwd: dir,
  })
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'a turn' })
  const log = eventsIn(path.join(dir, '.git', 'quality-harness'), session)
  // P spoke before the command; R1 does not repeat it for the same tree.
  assert.deepEqual(named(log, 'action.emitted').map(entry => entry.rule), ['P'])
  assert.equal(claimRows(session).at(-1)?.evidence, 'unverified')
})

// A fetch, a merge or a branch switch makes many commits newly reachable at
// once. One finding names them, because a message per commit would be dozens of
// joined advisories in a single hook — and each one asks git for the check.
test('many unchecked commits are one finding', () => {
  const dir = repository('t5m-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = sessionId('many')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  for (let index = 1; index <= 7; index += 1) {
    writeFileSync(path.join(dir, `f${index}.md`), `f${index}\n`)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', `commit ${index}`)
  }
  writeFileSync(path.join(dir, 'later.md'), 'later\n')
  const ended = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'a turn' })
  assert.deepEqual(named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule), ['R1', 'R2'])
  assert.ok(ended.stdout.includes('7 newly reachable commits'), ended.stdout)
  assert.ok(ended.stdout.includes('and 2 more'), ended.stdout)
  assert.equal(ended.stdout.includes('commit 1'), false, 'only the newest five are named')
  assert.ok(ended.stdout.includes('commit 7'), ended.stdout)

  // Every one of them has been said, so the same state says nothing again.
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'a turn' })
  assert.deepEqual(named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule), ['R1', 'R2'])
})

function waitFor(predicate, what) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (predicate()) return
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 100)'], { timeout: 10_000 })
  }
  assert.fail('waited 30s for ' + what)
}

test('writes the tree cannot see re-open the finding', () => {
  const dir = repository('t5w-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const state = path.join(dir, '.git', 'quality-harness')
  const session = sessionId('outside')
  const rules = () => named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule)
  const editedOutside = (id, sessionFor) => {
    const file = path.join(testTmp, 'outside-' + id + '.md')
    writeFileSync(file, id + '\n')
    hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file }, session_id: sessionFor, cwd: dir })
    return file
  }
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  const first = editedOutside(session + '-1', session)
  const one = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.deepEqual(rules(), ['R1'])
  assert.match(one.stdout, OUTSIDE_COUNT)
  assert.equal(one.stdout.includes(first), false, one.stdout)
  // A second write the tree cannot see is a new state, so the finding re-opens.
  editedOutside(session + '-2', session)
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.deepEqual(rules(), ['R1', 'R1'])
  // A pass clears what was written before it started.
  assert.equal(qhCheckRun(dir, 'pass').status, 0)
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.deepEqual(rules(), ['R1', 'R1'])

  // A check that passed in ANOTHER worktree of this repository clears nothing here.
  const linked = path.join(testTmp, 'wt-' + path.basename(dir))
  git(dir, 'worktree', 'add', '-q', '-b', 'linked', linked)
  const worktreeSession = sessionId('worktree-a')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: worktreeSession, cwd: dir })
  editedOutside(worktreeSession + '-1', worktreeSession)
  assert.equal(qhCheckRun(linked, 'pass').status, 0)
  hook({ hook_event_name: 'Stop', session_id: worktreeSession, cwd: dir })
  assert.deepEqual(named(eventsIn(state, worktreeSession), 'action.emitted').map(entry => entry.rule), ['R1'])

  // Outside git nothing can be observed, so the writes are all there is.
  const plain = mkdtempSync(path.join(testTmp, 't5p-'))
  projectWithCheck(plain)
  const plainState = temporaryStateDirectory(plain)
  const plainSession = sessionId('plain-writes')
  const plainRules = () => named(eventsIn(plainState, plainSession), 'action.emitted').map(entry => entry.rule)
  const editedIn = name => {
    writeFileSync(path.join(plain, name), name + '\n')
    hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(plain, name) }, session_id: plainSession, cwd: plain })
  }
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: plainSession, cwd: plain })
  editedIn('note.md')
  hook({ hook_event_name: 'Stop', session_id: plainSession, cwd: plain })
  assert.deepEqual(plainRules(), ['R1', 'R4'])
  hook({ hook_event_name: 'Stop', session_id: plainSession, cwd: plain })
  assert.deepEqual(plainRules(), ['R1', 'R4'])
  assert.equal(qhCheckRun(plain, 'pass').status, 0)
  hook({ hook_event_name: 'Stop', session_id: plainSession, cwd: plain })
  assert.deepEqual(plainRules(), ['R1', 'R4'])
  // A write DURING a passing check is not cleared by it: the check observed the
  // work as it was when it started. This test body is synchronous, so the check
  // is waited for through the file it writes, never through an exit event the
  // event loop has no chance to deliver.
  const records = () => {
    try { return readFileSync(path.join(plainState, 'checks.jsonl'), 'utf8').split('\n').filter(Boolean).length }
    catch { return 0 }
  }
  const before = records()
  // A hang guard, not a speed assertion: the release file below is what ends it.
  spawn('python3', [qhCheck], {
    cwd: plain, env: { ...HOOK_ENV, QH_PROBE_MODE: 'pause' }, stdio: 'ignore',
    timeout: 120_000, killSignal: 'SIGKILL',
  }).unref()
  waitFor(() => existsSync(path.join(plain, PAUSE_STARTED)), 'the paused check to start')
  editedIn('during.md')
  writeFileSync(path.join(plain, PAUSE_RELEASE), 'go\n')
  waitFor(() => records() > before, 'the paused check to record its run')
  hook({ hook_event_name: 'Stop', session_id: plainSession, cwd: plain })
  assert.deepEqual(plainRules(), ['R1', 'R4', 'R1'])

  // The status line reads the same log, and says when it was last observed.
  const rendered = statusline.render(statusline.reading({ session_id: session, cwd: dir }))
  assert.match(rendered, LAST_OBSERVED)
  assert.match(statusline.render(statusline.reading({ session_id: sessionId('never'), cwd: dir })), /unknown/)
})

// ---- T6: artifacts and notes read observed changes.
const ARTIFACT_FAILURE = 'Artifact validation failed'
const RETIRE_FINDING = 'adr-retire-check'
const ARCHIVE_CATALOG = '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n'
const BAD_RECORD = '# ADR-900: a record with no sections\n'
const runner = path.join(repoRoot, 'plugin', 'scripts', 'run-shell-hook.mjs')

// A path built with `path.join` is backslash-separated on Windows; the dispatcher
// is a bash script and prints whatever it was handed, which is forward-slash. The
// assertion is about the PATH, not its spelling, so normalize BOTH sides
// (CLAUDE.md §7: never write a separator into a literal you will compare).
// Reported 2026-09-18 by a Windows 11 session running this suite: four assertions
// here compared the two spellings and could only ever fail there.
const saysClassifyFailed = (said, file) =>
  said.replaceAll('\\', '/').includes(`could not classify ${file.replaceAll('\\', '/')}`)

function editGate(file, dir, session, env = {}) {
  return spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh'], {
    cwd: dir, encoding: 'utf8', timeout: 120_000, env: { ...HOOK_ENV, ...env },
    input: JSON.stringify({
      hook_event_name: 'PostToolUse', tool_name: 'Edit',
      tool_input: { file_path: file }, session_id: session, cwd: dir,
    }),
  })
}

function gatedPaths(log) {
  return named(log, 'artifact.gated').map(entry => entry.path)
}

test('a committed artifact is still validated', () => {
  // No check is declared here: rule A is not gated on the opt-in, because an
  // artifact is malformed whether or not this project named a test command.
  const dir = repository('t6a-')
  mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true })
  mkdirSync(path.join(dir, 'docs', 'adr-archive', 'ADR-001'), { recursive: true })
  writeFileSync(path.join(dir, 'docs', 'adr-archive', 'README.md'), ARCHIVE_CATALOG)
  const archived = ['ADR-001-one.md', 'ADR-002-two.md']
    .map(name => path.join(dir, 'docs', 'adr-archive', 'ADR-001', name))
  for (const file of archived) writeFileSync(file, '# archived\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'archive')
  const session = sessionId('artifacts')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  assert.equal(lifecycle.projectCheckCommand(dir), null, 'the fixture must declare no check')

  // A record written outside any tool and COMMITTED before the turn ended is
  // still what the session changed, so it is still gated.
  const committedRecord = path.join(dir, 'docs', 'adr', 'ADR-900-bad.md')
  writeFileSync(committedRecord, BAD_RECORD)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'record')
  const first = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.ok(first.stdout.includes(ARTIFACT_FAILURE), first.stdout)
  assert.ok(gatedPaths(eventsIn(state, session)).includes(committedRecord), JSON.stringify(gatedPaths(eventsIn(state, session))))

  // An uncommitted one is gated too.
  const looseRecord = path.join(dir, 'docs', 'adr', 'ADR-901-bad.md')
  writeFileSync(looseRecord, BAD_RECORD)
  const loose = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.ok(loose.stdout.includes('ADR-901-bad.md'), loose.stdout)

  // Retiring a frozen archive — its records AND its catalog — in this session.
  // At HEAD there is nothing left to say which archive owned those paths, so the
  // dispatcher cannot classify them at all; the session's first HEAD still can,
  // and the gate reaches a verdict instead of a could-not-look (ADR-005).
  //
  // ⚠ CORRECTED DURING EXECUTION. T6 said this case produces NO finding through
  // the batch lookup. Measured on this fixture: with the catalog still at HEAD
  // both lookups already agree and neither reports anything, so that spelling
  // tested nothing; the base only decides anything once the catalog is gone, and
  // then the answer is a verdict about the retirement, not silence.
  for (const file of archived) git(dir, 'rm', '-q', file)
  git(dir, 'rm', '-q', path.join(dir, 'docs', 'adr-archive', 'README.md'))
  git(dir, 'commit', '-q', '-m', 'retire')
  const deleted = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  const deletedSaid = `${deleted.stdout}${deleted.stderr}`
  assert.ok(deletedSaid.includes(RETIRE_FINDING), deletedSaid)
  assert.equal(saysClassifyFailed(deletedSaid, archived[0]), false, deletedSaid)

  // The same two deletions looked up at HEAD alone — what the dispatcher did
  // before the bases were passed — cannot be classified at all.
  const atHead = spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh', '--batch'], {
    cwd: dir, encoding: 'utf8', timeout: 120_000, env: HOOK_ENV,
    input: JSON.stringify({ paths: archived, deadline: Date.now() + 90_000, windowMs: 90_000, timeoutMs: 30_000 }),
  })
  assert.ok(saysClassifyFailed(atHead.stderr, archived[0]), atHead.stderr)
  assert.equal(atHead.stderr.includes(RETIRE_FINDING), false, atHead.stderr)
  // And a path nothing could classify is not a verdict, so it is not complete.
  assert.ok(atHead.stdout.includes('"complete":false'), atHead.stdout)

  // ONE path skips the batch history read entirely (it needs two to be worth a
  // scoped query), so the dispatcher's own lookup answers — and it reads the
  // same bases. Driven as a one-path batch, because that is the only way to
  // reach that lookup: rule A's own pass here would carry both deletions.
  const alone = repository('t6d-')
  mkdirSync(path.join(alone, 'docs', 'adr-archive', 'ADR-001'), { recursive: true })
  writeFileSync(path.join(alone, 'docs', 'adr-archive', 'README.md'), ARCHIVE_CATALOG)
  const single = path.join(alone, 'docs', 'adr-archive', 'ADR-001', 'ADR-003-three.md')
  writeFileSync(single, '# archived\n')
  git(alone, 'add', '-A')
  git(alone, 'commit', '-q', '-m', 'archive')
  const aloneFirst = git(alone, 'rev-parse', 'HEAD')
  git(alone, 'rm', '-q', single)
  git(alone, 'rm', '-q', path.join(alone, 'docs', 'adr-archive', 'README.md'))
  git(alone, 'commit', '-q', '-m', 'retire')
  const oneBatch = bases => spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh', '--batch'], {
    cwd: alone, encoding: 'utf8', timeout: 120_000,
    env: bases ? { ...HOOK_ENV, QUALITY_HARNESS_HISTORY_BASES: bases } : HOOK_ENV,
    input: JSON.stringify({ paths: [single], deadline: Date.now() + 90_000, windowMs: 90_000, timeoutMs: 30_000 }),
  })
  const withBase = oneBatch(`${aloneFirst} HEAD`)
  assert.ok(withBase.stderr.includes(RETIRE_FINDING), withBase.stderr)
  assert.equal(saysClassifyFailed(withBase.stderr, single), false, withBase.stderr)
  const headOnly = oneBatch(null)
  assert.ok(saysClassifyFailed(headOnly.stderr, single), headOnly.stderr)

  // The per-edit gate already gave this path a verdict, so the turn end does not
  // gate it again.
  const edited = path.join(dir, 'docs', 'adr', 'ADR-902-bad.md')
  writeFileSync(edited, BAD_RECORD)
  hook({
    hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: edited },
    session_id: session, cwd: dir,
  })
  const perEdit = editGate(edited, dir, session)
  assert.ok(`${perEdit.stdout}${perEdit.stderr}`.includes('ADR-902-bad.md'), `${perEdit.stdout}${perEdit.stderr}`)
  const afterEdit = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.equal(afterEdit.stdout.includes('ADR-902-bad.md'), false, afterEdit.stdout)

  // A per-edit gate that never reached a verdict leaves the path for the turn end.
  const timedOut = path.join(dir, 'docs', 'adr', 'ADR-903-bad.md')
  writeFileSync(timedOut, BAD_RECORD)
  hook({
    hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: timedOut },
    session_id: session, cwd: dir,
  })
  // ⚠ THE TIMEOUT IS MADE CERTAIN, NOT HOPED FOR. This arm set the smallest legal
  // budget (100 ms) and assumed the gate would overrun it. On the machine that wrote
  // it, it does. On a CI runner the gate FINISHES inside 100 ms, records a complete
  // verdict, and the turn end rightly skips the path — so this passed on macOS and
  // failed on Linux and Windows, the first time this branch ever had a CI run
  // (2026-09-19). A stand-in `python3` that sleeps is first on PATH for this one
  // call; the gates are `#!/usr/bin/env python3`, so the gate cannot answer in time
  // on any machine.
  const slow = mkdtempSync(path.join(testTmp, 'slow-python-'))
  writeFileSync(path.join(slow, 'python3'), '#!/bin/sh\nsleep 20\n')
  chmodSync(path.join(slow, 'python3'), 0o755)
  editGate(timedOut, dir, session, {
    QUALITY_HARNESS_SHELL_TIMEOUT_MS: '100', PATH: `${slow}${path.delimiter}${process.env.PATH ?? ''}`,
  })
  const afterTimeout = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.ok(afterTimeout.stdout.includes('ADR-903-bad.md'), afterTimeout.stdout)

  // Everything now carries a complete result, so the next turn end gates nothing.
  const before = gatedPaths(eventsIn(state, session)).length
  const quiet = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.equal(quiet.stdout.trim(), '', quiet.stdout)
  assert.equal(gatedPaths(eventsIn(state, session)).length, before, 'no path is gated twice for the same content')

  // A budget that ends before the gates run names what it did not check, and the
  // next boundary retries exactly those paths.
  const retried = path.join(dir, 'docs', 'adr', 'ADR-904-bad.md')
  writeFileSync(retried, BAD_RECORD)
  const compacted = hook({
    hook_event_name: 'PreCompact', session_id: session, cwd: dir,
  }, { QUALITY_HARNESS_ARTIFACT_BUDGET_MS: '0' })
  assert.ok(`${compacted.stdout}${compacted.stderr}`.includes('UNRUN'), compacted.stdout)
  assert.equal(gatedPaths(eventsIn(state, session)).includes(retried), false, 'a path the budget cut is not recorded as gated')
  const retry = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.ok(retry.stdout.includes('ADR-904-bad.md'), retry.stdout)
})

test('a compaction note sees the latest edit', () => {
  const dir = repository('t6n-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = sessionId('note')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  const edited = path.join(dir, 'late.md')
  writeFileSync(edited, 'late\n')
  hook({
    hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: edited },
    session_id: session, cwd: dir,
  })

  // PreCompact observes before it writes, so the note is about the tree as it is
  // now — not about the last turn end, which never happened here.
  hook({ hook_event_name: 'PreCompact', session_id: session, cwd: dir })
  const handedBack = hook({ hook_event_name: 'SessionStart', source: 'compact', session_id: session, cwd: dir })
  assert.ok(handedBack.stdout.includes('late.md'), handedBack.stdout)
  assert.equal(handedBack.stdout.includes('nothing edited'), false, handedBack.stdout)

  // SessionEnd's row says the same thing, for the next session in this directory.
  hook({ hook_event_name: 'SessionEnd', session_id: session, cwd: dir, reason: 'clear' })
  const rows = readFileSync(path.join(HOOK_ENV.CLAUDE_PLUGIN_DATA, 'sessions.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.session === session)
  assert.equal(rows.at(-1)?.status, 'unverified', JSON.stringify(rows.at(-1)))
  assert.ok(JSON.stringify(rows.at(-1)?.files ?? []).includes('late.md'), JSON.stringify(rows.at(-1)))
})

// ---- T7: the command classifiers are deleted.
//
// The list is ADR-060's: every symbol that read a command's TEXT to decide what
// happened. `readOnlyVerdict` and `containsCommitOrPush` stay, because the word
// rule is the one reading of command text the decision keeps.
const DELETED_SYMBOLS = [
  'classifyCommand', 'classifyCommandWithHooks', 'isPotentialMutationCommand', 'isValidationCommand',
  'bashMarkdownMutationPaths', 'bashDeletionMutationPaths', 'analyzeTranscript', 'isGitPublishCommand',
  'gitSubcommand', 'shellCommandRegions', 'shellSegments', 'commandInvocation', 'heredocBodies',
  'writeChannelOf', 'readsOnlyItsArguments',
]
const KEPT_SYMBOLS = ['readOnlyVerdict', 'containsCommitOrPush']
const CODE_SUFFIXES = ['.mjs', '.js', '.sh', '.py']

function codeFilesUnder(directory, found = []) {
  for (const name of readdirSync(directory)) {
    const entry = path.join(directory, name)
    if (statSync(entry).isDirectory()) {
      if (name !== 'node_modules' && name !== '.git') codeFilesUnder(entry, found)
    } else if (CODE_SUFFIXES.some(suffix => name.endsWith(suffix)) || !path.extname(name)) {
      found.push(entry)
    }
  }
  return found
}

test('the command classifiers are gone', () => {
  const pluginRoot = path.join(repoRoot, 'plugin')
  // ⚠ classify-command.mjs is KEPT as a tombstone, not deleted: ADR-041 and
  // ADR-047 declare it in `Governs:`, and a `Governs:` path no tracked file
  // matches makes adr-lint advise that the decision governs nothing. The code is
  // what goes; tests/classify.test.mjs asserts the file stays empty.
  const tombstone = path.join(pluginRoot, 'scripts', 'classify-command.mjs')
  assert.equal(existsSync(tombstone), true, 'the path stays so the records still resolve')
  assert.doesNotMatch(readFileSync(tombstone, 'utf8'), /^\s*export\b/m, 'and it defines nothing')
  // Every other shipped file: the symbols themselves are gone, name and all.
  const files = codeFilesUnder(pluginRoot).filter(file => file !== tombstone)
  assert.ok(files.length > 20, `the sweep must actually read the plugin, found ${files.length}`)
  const offenders = []
  for (const file of files) {
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    for (const symbol of DELETED_SYMBOLS) {
      if (new RegExp(`\\b${symbol}\\b`).test(text)) offenders.push(`${path.relative(repoRoot, file)}: ${symbol}`)
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'))
  // And the word rule is still there, or this test would pass on an empty plugin.
  const lifecycleText = readFileSync(path.join(pluginRoot, 'scripts', 'lifecycle.mjs'), 'utf8')
  for (const symbol of KEPT_SYMBOLS) {
    assert.ok(new RegExp(`function ${symbol}\\b`).test(lifecycleText), symbol)
  }
})

// ---- Found by a peer session's test of this branch, 2026-09-18. Both are about
// what the OBSERVER itself contributes to what it observes.
const UNCLASSIFIABLE = 'could not classify'

test('an untracked directory is gated by the files in it, never as a directory', () => {
  // `git status --porcelain` collapses an untracked directory to `name/`, and the
  // artifact dispatcher cannot classify a directory: it answers UNPROVEN, which
  // is not a verdict, so the path is retried at every boundary for ever. Any
  // build/, vendor/ or scratch directory did it, not only the peer's case.
  const dir = repository('peer-dir-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = sessionId('untracked-directory')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true })
  writeFileSync(path.join(dir, 'docs', 'adr', 'ADR-900-bad.md'), BAD_RECORD)
  const first = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  const said = `${first.stdout}${first.stderr}`
  assert.ok(said.includes('docs/adr/ADR-900-bad.md'), said)
  assert.equal(said.includes(UNCLASSIFIABLE), false, said)
  assert.equal(gatedPaths(eventsIn(state, session)).some(file => file.endsWith(path.sep)), false,
    'no directory is recorded as gated')

  // The record was gated, so the next turn end has nothing to gate again.
  const before = gatedPaths(eventsIn(state, session)).length
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  assert.equal(gatedPaths(eventsIn(state, session)).length, before, 'a complete result is not re-taken')
})

test('the harness does not observe its own ledger', () => {
  // CLAUDE_PLUGIN_DATA is wherever the host puts it, and a host that puts it
  // inside the repository made every hook dirty the tree it was watching: the
  // claims ledger appeared as a changed path and moved the tree, so the SAME
  // finding was made again with a new key. The observer must not observe itself.
  const dir = repository('peer-ledger-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = sessionId('own-ledger')
  const inside = { CLAUDE_PLUGIN_DATA: path.join(dir, 'data') }
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir }, inside)
  writeFileSync(path.join(dir, 'README.md'), 'edited\n')
  const first = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' }, inside)
  const said = `${first.stdout}${first.stderr}`
  assert.ok(said.includes('README.md'), said)
  assert.equal(said.includes('data/'), false, said)
  assert.ok(existsSync(path.join(dir, 'data', 'claims.jsonl')), 'the ledger really was written inside the repository')

  // Nothing the session did has moved, so the same finding is not made twice —
  // the harness's own write must not count as a change of state.
  const again = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' }, inside)
  assert.equal(again.stdout.trim(), '', again.stdout)
})

// Found by a second peer session's test of this branch, 2026-09-18: after a
// commit, R1 said "work no `qh-check` has passed on" AND "Git reports no changed
// path in the working tree" — both true, and together they read as a bug. The
// tree IS unchecked and it IS the commit's tree, so the finding must name the
// commit. R2 stays silent here on purpose: R1 speaks for the observed tree.
const COMMITTED_TREE = /the tree at HEAD, committed as/

test('a turn that ended in a commit names the commit, not a change that is not there', () => {
  const dir = repository('peer-commit-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = sessionId('committed-turn')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  writeFileSync(path.join(dir, 'README.md'), 'edited\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'work')
  const ended = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  const said = ended.stdout
  assert.deepEqual(named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule), ['R1'])
  assert.match(said, COMMITTED_TREE, said)
  assert.ok(said.includes('work'), said)
  assert.equal(said.includes('no changed path'), false, said)
  assert.equal(said.includes('Changed paths:'), false, said)
})
// The second shape quality-blueprints-07 named: a check inside a backgrounded
// Bash call that finishes in a LATER turn. The record is imported at the next
// hook, so the turn that ends while it runs is still unchecked and the turn
// after it is not — no special case, but it had no test.
test('a check that finishes in a later turn clears the finding then', () => {
  const dir = repository('peer-bg-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  const session = sessionId('later-turn')
  const state = path.join(dir, '.git', 'quality-harness')
  const rules = () => named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule)
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  writeFileSync(path.join(dir, 'README.md'), 'edited\n')
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  assert.deepEqual(rules(), ['R1'])

  const records = () => {
    try { return readFileSync(path.join(state, 'checks.jsonl'), 'utf8').split('\n').filter(Boolean).length }
    catch { return 0 }
  }
  const before = records()
  // ⚠ The flags live OUTSIDE the repository. A probe that drops a file into the
  // tree it is measuring changes that tree, and the finding it then reads is its
  // own — the same mistake a peer session caught in the plugin itself, made here
  // in a fixture (2026-09-18).
  const flags = mkdtempSync(path.join(testTmp, 'bg-flags-'))
  spawn('python3', [qhCheck], {
    cwd: dir, env: { ...HOOK_ENV, QH_PROBE_MODE: 'pause', QH_PROBE_FLAGS: flags }, stdio: 'ignore',
    timeout: 120_000, killSignal: 'SIGKILL',
  }).unref()
  waitFor(() => existsSync(path.join(flags, PAUSE_STARTED)), 'the backgrounded check to start')
  // The turn ends while it is still running: nothing has passed yet, and the
  // finding already stands, so this turn says nothing new.
  const during = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  assert.equal(during.stdout.trim(), '', during.stdout)
  assert.deepEqual(rules(), ['R1'])

  writeFileSync(path.join(flags, PAUSE_RELEASE), 'go\\n')
  waitFor(() => records() > before, 'the backgrounded check to record its run')
  // The next turn imports it, and the tree it passed on is this one.
  const after = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  assert.equal(after.stdout.trim(), '', after.stdout)
  assert.deepEqual(rules(), ['R1'])
  assert.ok(checkEvents(eventsIn(state, session)).some(entry => entry.event === 'check.passed'),
    'the record became a check.passed event at the next hook')
  // And a new edit after it is a new finding, so the clearance was real.
  writeFileSync(path.join(dir, 'README.md'), 'edited again\n')
  hook({ hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'done' })
  assert.deepEqual(rules(), ['R1', 'R1'])
})

test('the key a per-edit gate persists is the one rule A looks up, on either platform', () => {
  // ⚠ RULE A's DEDUP HAD NEVER WORKED ON WINDOWS, and no test could see it.
  // `artifact.gated` has two writers. The turn end records `path.join(root,
  // relative)` — NATIVE. The per-edit gate recorded whatever
  // hookFilePathFromPayload returned, which on win32 has been through
  // windowsPathForBash so a bash gate can read it — `C:/x`, POSIX. The reader is a
  // raw string Map, so the two never matched: `answered` was always empty and every
  // artifact already answered COMPLETE was re-gated and re-reported at turn end.
  //
  // Diagnosed 2026-09-18 by two Windows sessions. The assertion that matters is
  // the last pair in each half: the persisted key must EQUAL the candidate rule A
  // builds. Asserting the separator alone would pass while the two sites drifted.
  const root = 'C:\\Users\\dev\\project'
  const relative = path.win32.join('docs', 'adr', 'ADR-902-bad.md')
  const asBashSawIt = 'C:/Users/dev/project/docs/adr/ADR-902-bad.md'

  assert.equal(persistedEventPath(asBashSawIt, root, 'win32'), 'C:\\Users\\dev\\project\\docs\\adr\\ADR-902-bad.md')
  assert.equal(persistedEventPath(asBashSawIt, root, 'win32'), path.win32.join(root, relative))

  // Already native stays put, so the fix is not a one-way rewrite.
  const native = path.win32.join(root, relative)
  assert.equal(persistedEventPath(native, root, 'win32'), native)

  // windowsPathForBash maps a UNC path too, and that is the mapped-drive
  // configuration nobody on this project can test. It is covered by the same line
  // rather than by a second one.
  assert.equal(persistedEventPath('//server/share/docs/a.md', root, 'win32'), '\\\\server\\share\\docs\\a.md')

  // And POSIX is untouched — the helper must be capable of both answers, or the
  // win32 assertions above prove nothing about a platform switch (CLAUDE.md §4).
  const posixRoot = '/home/dev/project'
  const posixFile = '/home/dev/project/docs/adr/ADR-902-bad.md'
  assert.equal(persistedEventPath(posixFile, posixRoot, 'linux'), posixFile)
  assert.equal(persistedEventPath(posixFile, posixRoot, 'linux'),
    path.posix.join(posixRoot, 'docs', 'adr', 'ADR-902-bad.md'))
  assert.notEqual(persistedEventPath(asBashSawIt, root, 'win32'), asBashSawIt)
})

test('a git query that FAILED is not a git query that found nothing', () => {
  // ⚠ `gitLines` returned `[]` for a nonzero exit, a timeout and a spawn error
  // alike, and its callers read that as "no commits" and "no paths". So a history
  // query that could not run suppressed R2 entirely and left the ledger saying
  // `verified` — a clean answer assembled from a question nobody managed to ask.
  // That is ADR-005 exactly: could-not-look is its own state and must never be
  // reported in the vocabulary of a verdict (CLAUDE.md §3).
  //
  // Found by a different-lineage review of this branch. Driven here with a REAL
  // git failure rather than a mock: a recorded session head that is a well-formed
  // sha nothing in the repository has, so `git log <missing>..HEAD` exits non-zero
  // for the same reason it would in the field.
  const dir = repository('gitfail-')
  const session = sessionId('gitfail')
  const state = path.join(dir, '.git', 'quality-harness')
  // The rules return early for a project that declared no check, so declare one:
  // this test is about what happens when a git QUERY fails, not about that arm.
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'true' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'declare a check')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })

  // Rewrite the recorded starting point to a sha this repository does not hold.
  const logFile = path.join(state, 'sessions', session + '.jsonl')
  const missing = '0'.repeat(40)
  writeFileSync(logFile, readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(line => {
    const entry = JSON.parse(line)
    if (entry.event === 'session.started' && entry.observation) entry.observation.head = missing
    return JSON.stringify(entry)
  }).join('\n') + '\n')

  // Confirm the premise rather than assuming it: this query really does fail.
  // Spawned raw, because the `git` helper asserts exit 0 and a failure is the point.
  const probe = spawnSync('git', ['-C', dir, 'log', '--format=%H', `${missing}..HEAD`],
    { encoding: 'utf8', timeout: 60_000 })
  assert.notEqual(probe.status, 0, 'the fixture must make git actually fail')

  writeFileSync(path.join(dir, 'b.md'), 'b\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'work nothing checked')
  const run = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  const said = `${run.stdout}${run.stderr}`

  assert.match(said, /could not|UNPROVEN|UNRUN|unknown/i,
    `a failed history query must be said out loud, not read as nothing: ${said}`)
  assert.doesNotMatch(said, /\bverified\b/,
    `and it must not leave the ledger claiming verified: ${said}`)
})

test('a log that could not be read whole cannot supply a passing verdict', () => {
  // ⚠ A TORN LINE WAS SKIPPED AND A READ ERROR BECAME "NO EVENTS", so an
  // incomplete log answered in the vocabulary of a complete one. The reviewer's
  // probe made it concrete: a log holding an older PASS and a newer FAILURE whose
  // line is truncated reads as "the pass is the latest thing that happened", and
  // the ledger said `verified`. An append is not atomic, so a truncated tail is
  // the ordinary shape of a crash, not an exotic one.
  //
  // ADR-005: could-not-read is its own state. A partial log may still be used to
  // find work (that direction only ever finds MORE), but it must never be the
  // evidence for a clean verdict.
  const dir = repository('tornlog-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'declare a check')
  const session = sessionId('tornlog')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  assert.equal(qhCheckRun(dir, 'pass').status, 0)

  // A clean tree whose check passed is `verified` — establish that first, or the
  // assertion below cannot tell a fix from a reader that never says verified.
  const clean = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.match(`${clean.stdout}${clean.stderr}`.length ? `${clean.stdout}${clean.stderr}` : 'silent', /silent|verified|^$/,
    'a clean checked tree must not be reported as work')
  const beforeTear = named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule)

  // Now tear the last line, the way a crash mid-append leaves it.
  const logFile = path.join(state, 'sessions', session + '.jsonl')
  const whole = readFileSync(logFile, 'utf8')
  writeFileSync(logFile, whole + '{"event":"check.finished","ok":fal')

  const torn = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  const said = `${torn.stdout}${torn.stderr}`
  assert.match(said, /could not|UNPROVEN|UNRUN|unknown/i,
    `a log that could not be read whole must say so: ${said}`)
  assert.doesNotMatch(said, /\bverified\b/,
    `and must not supply a passing verdict: ${said}`)
  assert.deepEqual(beforeTear, [], 'the pre-tear arm really was clean, so the tear is what changed the answer')
})

test('a session note never invents a check, and never reports silence as stillness', () => {
  // ⚠ TWO FALSE STATEMENTS FROM ONE FIELD. The note derived "a `qh-check` passed
  // on them" from `pending === false`, and `pending` is false in cases that have
  // nothing to do with a check having run:
  //
  //   1. AN INHERITED DIRTY TREE. `treeUnchecked` requires the tree to differ from
  //      the session's baseline, so a tree that was already dirty at SessionStart
  //      and unchanged since is not "unchecked" by that test — and the note then
  //      told the reader a check had passed on paths no check had ever seen. Worse,
  //      the row it writes is `verified`, which hides the previous unverified row.
  //   2. A FAILED OBSERVATION. With nothing observable, the file list is empty, so
  //      the note said "nothing has changed in the working tree" — a verdict about
  //      a tree it could not look at (ADR-005, CLAUDE.md §3).
  //
  // Found by a different-lineage review of this branch. `pending` answers "is
  // there outstanding work"; it was doing duty for "did a check pass" and for
  // "was anything observed", and those are three questions.
  const inherited = [
    { event: 'session.started', observation: { ok: true, head: 'h', tree: 'T1' } },
  ]
  const dirty = { ok: true, head: 'h', tree: 'T1' }
  // Facts are built directly here rather than through `observedFacts`, because
  // the defect is in how the NOTE reads them: an inherited dirty tree reaches it
  // as changed paths with `pending: false` and no check on record at all.
  const inheritedFacts = { files: ['/x/a.md', '/x/b.md'], other: 0, pending: false, lastCheck: null }
  const note = lifecycle.sessionStateNote(inheritedFacts, process.cwd(), null, true).text
  assert.doesNotMatch(note, /a `qh-check` passed/,
    `no check is on record, so the note must not say one passed: ${note}`)
  assert.notEqual(lifecycle.sessionStateNote(inheritedFacts, process.cwd(), null, true).status, 'verified',
    'and the row it writes must not be `verified`, which would hide an earlier unverified one')

  // ...and the same shape WITH a real passing check still credits it, or the
  // assertion above is satisfied by a note that never credits a check at all.
  // ⚠ The control CARRIES `checked: true`, not just a `lastCheck` that says
  // passed. This arm used to set only `lastCheck`, which is how it was green
  // while a pass for an UNRELATED tree could certify these paths — the control
  // for one defect was resting on another. `lastCheck` is descriptive now: it
  // prints as "Last check:" and certifies nothing (re-review, 2026-09-18).
  const passed = { ...inheritedFacts, checked: true, lastCheck: { command: 'sh check.sh', verdict: 'passed' } }
  const passedNote = lifecycle.sessionStateNote(passed, process.cwd(), null, true).text
  assert.match(passedNote, /a `qh-check` passed/, `a real check must still be creditable: ${passedNote}`)
  assert.equal(lifecycle.observedFacts(inherited, null, dirty).pending, false,
    'the inherited-tree shape really does reach the note with pending false')

  // A tree nothing could observe is not a tree that did not change.
  const blind = lifecycle.sessionStateNote(
    lifecycle.observedFacts(inherited, null, { ok: false, reason: 'not a repository' }),
    process.cwd(), null, true).text
  assert.doesNotMatch(blind, /nothing has changed/,
    `could-not-look must not be reported as stillness: ${blind}`)
  assert.match(blind, /could not|unknown|UNPROVEN/i,
    `and it must say what it could not do: ${blind}`)
})

test('a session that began before the first commit still sees the commits it gained', () => {
  // ⚠ AN UNBORN HEAD IS AN OBSERVATION, NOT AN ABSENCE. `observe()` records a
  // repository with no commits as `{ ok: true, head: null }` — positively looked
  // at, positively empty. Both consumers then required a STRING baseline:
  // `sessionCommits` returned early, and the artifact candidates skipped their
  // `git diff --name-only <first>` entirely. So a session that started in a fresh
  // repository and gained commits before the next boundary reported NO new
  // commits and NO artifacts to gate — the whole point of R2, silent, in the one
  // case where everything is new.
  //
  // `git init` then work is the ordinary start of a project, and a scaffold that
  // commits as it goes is the ordinary way to reach this. Found by a
  // different-lineage review of this branch, 2026-09-18.
  const dir = mkdtempSync(path.join(testTmp, 'unborn-'))
  git(dir, 'init', '-q')
  projectWithCheck(dir)
  const session = sessionId('unborn')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })

  // The premise, asserted rather than assumed: the session really did start with
  // an unborn HEAD that was successfully observed.
  const started = named(eventsIn(state, session), 'session.started').at(-1)
  assert.equal(started?.observation?.ok, true, 'the empty repository must be observable')
  assert.equal(started?.observation?.head, null, 'and its HEAD must be unborn')

  // Now the repository gains its history, as a scaffold or a script would do.
  // TWO commits, deliberately: R2 defers to R1 for a commit whose tree IS the
  // working tree ("the observed working tree is R1's to speak for"), so a
  // single-commit fixture would be silent for a legitimate reason and prove
  // nothing about this defect.
  writeFileSync(path.join(dir, 'docs.md'), 'first\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'the first commit, which nothing has checked')
  writeFileSync(path.join(dir, 'more.md'), 'second\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'and a second, so the first tree is not the working tree')
  const run = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  const said = `${run.stdout}${run.stderr}`

  assert.match(said, /commit/i, `a commit nothing checked must be reported: ${said}`)
  const rules = named(eventsIn(state, session), 'action.emitted').map(entry => entry.rule)
  assert.ok(rules.includes('R2'), `R2 must fire for the commits gained since an unborn HEAD: ${rules}`)
})

test('an unknown content identity matches nothing, including another unknown', () => {
  // ⚠ THE READER CONTRADICTED ITS OWN CONTRACT. `contentId` says in its own doc
  // comment: "Null means unreadable, which a reader must treat as unknown and not
  // as 'the same as last time'." The dedup was written
  // `answered.get(file) === contentId(file)`, and `null === null` is true — so a
  // path whose bytes could not be read when it was gated and cannot be read now
  // was suppressed FOR EVER, on the strength of two non-answers agreeing.
  // Found by a different-lineage review of this branch, 2026-09-18.
  const answered = new Map()
  answered.set('/x/known.md', 'aaa')
  answered.set('/x/unreadable.md', null)

  // The suppression this exists to provide still works...
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/known.md', 'aaa'), true)
  // ...and every kind of not-knowing refuses it.
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/known.md', 'bbb'), false, 'different bytes are a new question')
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/known.md', null), false, 'unreadable NOW is not "unchanged"')
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/unreadable.md', null), false,
    'two unknowns are not a match — this is the defect')
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/unreadable.md', 'aaa'), false,
    'and an unknown RECORD cannot certify readable bytes either')
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/never-gated.md', 'aaa'), false, 'never gated is never answered')

  // ⚠ AND ABSENCE IS THE THIRD ANSWER, not a kind of unknown. A record that was
  // DELETED and whose deletion was gated is positively accounted for, so it is
  // suppressed — otherwise the strict null rule above would re-gate every deleted
  // record at every boundary for ever. Absence used to collapse into null, and
  // that collapse is what made the null rule look harmless.
  answered.set('/x/deleted.md', ABSENT)
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/deleted.md', ABSENT), true,
    'a gated deletion stays gated')
  assert.equal(lifecycle.alreadyAnswered(answered, '/x/deleted.md', 'aaa'), false,
    'and a file that came BACK is a new question')
  assert.notEqual(ABSENT, null, 'absence must be distinguishable from unreadable, or none of this holds')
})

test('a file edited while its gate ran is not recorded as answered', t => {
  // ⚠ THE IDENTITY WAS TAKEN AFTER THE GATE RAN. So a file edited WHILE the gate
  // was reading it got filed under the NEW content carrying the OLD content's
  // verdict, and rule A then suppressed the one edit nothing had looked at.
  //
  // ⚠ AND MY FIRST VERSION OF THIS TEST COULD NOT FAIL. It edited the file AFTER
  // `editGate` returned, so the old post-hoc hash recorded the pre-edit content
  // too and the assertion held against the defect. Measured, not reasoned: it
  // passed against the stashed pre-fix source. The edit has to land DURING the
  // gate, which means driving the spawn seam rather than a real subprocess.
  const dir = repository('moved-')
  mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true })
  const record = path.join(dir, 'docs', 'adr', 'ADR-903-moves.md')
  writeFileSync(record, '# ADR-903: before\n')
  const session = sessionId('moved')

  const probe = async (moduleUrl, file, cwd, sessionId) => {
    const cp = await import('node:child_process')
    const fs = await import('node:fs')
    const { EventEmitter } = await import('node:events')
    const { PassThrough } = await import('node:stream')
    const { syncBuiltinESMExports } = await import('node:module')
    cp.default.spawn = () => {
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.stdin = new PassThrough()
      child.unref = () => {}
      // The gate is "running" — and the file moves underneath it, which is the
      // whole case. A real editor doing this is an ordinary race.
      queueMicrotask(() => {
        fs.writeFileSync(file, '# ADR-903: changed WHILE the gate was reading it\n')
        child.emit('close', 0, null)
      })
      return child
    }
    syncBuiltinESMExports()
    const { runEditGate } = await import(moduleUrl)
    await runEditGate(JSON.stringify({
      hook_event_name: 'PostToolUse', tool_name: 'Edit',
      tool_input: { file_path: file }, session_id: sessionId, cwd,
    }))
    process.stdout.write('done')
  }
  const code = '(' + probe.toString() + ')(...' + JSON.stringify([
    pathToFileURL(path.join(repoRoot, 'plugin', 'scripts', 'run-shell-hook.mjs')).href,
    record, dir, session,
  ]) + ')'
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 60_000, cwd: dir, env: HOOK_ENV })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)

  const state = path.join(dir, '.git', 'quality-harness')
  const gated = named(eventsIn(state, session), 'artifact.gated').at(-1)
  assert.ok(gated, 'the per-edit gate must have recorded something')
  const after = createHash('sha256').update(readFileSync(record)).digest('hex')
  assert.notEqual(gated.blob, after,
    'the identity must be the content the gate was GIVEN, not what the file holds after it')
  assert.equal(gated.complete, false,
    'and a gate whose bytes moved underneath it has not answered about them')
})

test('which check is latest is decided by when it RAN, not by where it landed in the log', () => {
  // ⚠ TWO HOOKS IMPORTING THE SAME checks.jsonl ARE NOT ATOMIC. The importer reads
  // what it has already seen, then appends what it has not. Interleave two hooks
  // and the appends can land in an order the checks never happened in: hook A
  // snapshots an older PASS, hook B imports that pass AND a newer FAILURE, then A
  // appends its stale pass on top. `treeChecked` took `.at(-1)` — the LAST thing
  // appended — so the older pass won and the tree read as checked.
  //
  // The reviewer's deterministic probe produced exactly `older-pass, newer-fail,
  // older-pass` and `checked: true`. Reproduced here as that log, because the log
  // is what the reader sees and the interleaving that built it does not matter.
  //
  // The repair is ordering rather than locking: each imported event carries the
  // `startedAt` of the check it came from, and checks.jsonl is the authority on
  // when they ran. A duplicate import can then never change WHICH check is latest
  // (ADR-005 — the newest observation wins, and a re-import is not an observation).
  const tree = 'TREE-1'
  const observation = { ok: true, head: 'h', tree }
  const ordered = [
    { event: 'session.started', observation: { ok: true, head: 'h', tree: 'T0' } },
    { event: 'check.passed', record: 'r1', startedAt: '2026-09-18T10:00:00.000Z', after: { tree } },
    { event: 'check.failed', record: 'r2', startedAt: '2026-09-18T10:05:00.000Z', after: { tree } },
  ]
  assert.equal(lifecycle.observedFacts(ordered, null, observation).checked, false,
    'a newer failure beats an older pass when they land in order')

  // The same two checks, plus the stale re-append a racing import produces.
  const raced = [...ordered, { ...ordered[1] }]
  assert.equal(lifecycle.observedFacts(raced, null, observation).checked, false,
    'and it still beats it when the older pass is appended LAST — this is the defect')

  // ...and a genuinely newer pass still wins, or the assertions above are
  // satisfied by a reader that has stopped crediting passes at all.
  // Marked whole, as `readEvents` marks it — only a log that says so can certify.
  const repaired = Object.assign([...raced, { event: 'check.passed', record: 'r3', startedAt: '2026-09-18T10:09:00.000Z', after: { tree } }], { complete: true })
  assert.equal(lifecycle.observedFacts(repaired, null, observation).checked, true,
    'a check that really is the newest still counts')
})

// ⚠ ONE CHECK SELECTION, ASSERTED AT EVERY CONSUMER. A re-review found that the
// previous repair fixed `treeChecked` and left its siblings alone: statusline.mjs
// kept its OWN positional copy under a comment claiming "the same rule the
// advisories use", and the session note credited `lastCheck` positionally. The
// ordering test written for that repair also passed with `treeChecked` reverted,
// because it exercised a helper the production consumer does not go through.
//
// So these drive the CONSUMERS — the status line's reading and the session note —
// rather than the helper, and every case is stated once per consumer.
const STALE_TREE = 'TREE-STALE'
function staleCheckLog({ sameInstant = false } = {}) {
  const at = n => sameInstant ? '2026-09-18T10:00:00.000Z' : `2026-09-18T10:0${n}:00.000Z`
  return [
    { event: 'session.started', at: at(0), observation: { ok: true, head: 'h0', tree: 'T0' } },
    { event: 'check.passed', record: 'r1', seq: 1, startedAt: at(1), after: { tree: STALE_TREE } },
    { event: 'check.failed', record: 'r2', seq: 2, startedAt: at(2), after: { tree: STALE_TREE } },
    // The stale re-append a racing import produces: same record, arriving last.
    { event: 'check.passed', record: 'r1', seq: 1, startedAt: at(1), after: { tree: STALE_TREE } },
    { event: 'turn.ended', at: at(3), observation: { ok: true, head: 'h1', tree: STALE_TREE } },
  ]
}

test('the status line does not read checked from a stale re-imported pass', () => {
  for (const sameInstant of [false, true]) {
    const log = staleCheckLog({ sameInstant })
    const value = statusline.reading(
      { session_id: sessionId('stale-status'), cwd: testTmp },
      { read: () => log })
    assert.notEqual(value?.kind, 'checked',
      `a failure stands between the pass and now, so the tree is not checked `
      + `(sameInstant=${sameInstant}): ${JSON.stringify(value)}`)
  }
})

test('the session note does not credit a stale re-imported pass', () => {
  for (const sameInstant of [false, true]) {
    const log = staleCheckLog({ sameInstant })
    const observation = { ok: true, head: 'h1', tree: STALE_TREE }
    const facts = lifecycle.observedFacts(log, null, observation)
    assert.equal(facts.checked, false, `checked must be false (sameInstant=${sameInstant})`)
    const note = lifecycle.sessionStateNote(facts, process.cwd(), null, true)
    assert.notEqual(note.status, 'verified',
      `and the note must not write a verified row (sameInstant=${sameInstant}): ${note.text}`)
  }
})

test('a check that passed on a DIFFERENT tree certifies nothing here', () => {
  // `lastCheck` was the last check.* event in the log whatever tree it was about,
  // and the note credited it. So a pass for an unrelated tree told the reader "a
  // `qh-check` passed on them" about paths it had never seen.
  const observation = { ok: true, head: 'h1', tree: 'TREE-MINE' }
  const log = [
    { event: 'session.started', observation: { ok: true, head: 'h0', tree: 'TREE-MINE' } },
    { event: 'check.passed', record: 'other', seq: 1, startedAt: '2026-09-18T10:01:00.000Z',
      after: { tree: 'TREE-SOMEWHERE-ELSE' } },
  ]
  const facts = lifecycle.observedFacts(log, null, observation)
  assert.equal(facts.checked, false, 'a pass about another tree is not a pass about this one')
  const note = lifecycle.sessionStateNote({ ...facts, files: ['/x/a.md'] }, process.cwd(), null, true)
  assert.doesNotMatch(note.text, /a `qh-check` passed/,
    `no check has passed on THESE paths: ${note.text}`)
  assert.notEqual(note.status, 'verified', `and the row must not be verified: ${note.text}`)
})

test('a file edited while the BATCH gated it is not recorded as answered either', () => {
  // ⚠ THE SAME DEFECT AS THE PER-EDIT GATE, IN THE SIBLING NOBODY FIXED. A
  // re-review found that closing it in `runEditGate` left `artifactRule` hashing
  // AFTER `runArtifactGates` returned: the batch computed each identity for its
  // filter, ran the gates, then computed the identity AGAIN to record it. A file
  // edited while the batch was gating it was therefore filed under its NEW
  // content carrying the OLD content's verdict, and rule A suppressed the one
  // edit nothing had looked at.
  //
  // This is CLAUDE.md §5 — I fixed the instance the counterexample took and left
  // the class open one function away.
  const dir = repository('batchmoved-')
  projectWithCheck(dir)
  mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true })
  const record = path.join(dir, 'docs', 'adr', 'ADR-904-batch.md')
  writeFileSync(record, '# ADR-904: before the batch\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'a record for the batch to gate')
  const session = sessionId('batchmoved')

  const probe = async (moduleUrl, file, cwd, sessionId) => {
    const cp = await import('node:child_process')
    const fs = await import('node:fs')
    const { syncBuiltinESMExports } = await import('node:module')
    const original = cp.default.spawnSync
    // Intercept ONLY the artifact runner — git and the observation still need the
    // real thing, and mocking those would test a different program.
    cp.default.spawnSync = (command, args, options) => {
      if (Array.isArray(args) && args.some(a => typeof a === 'string' && a.endsWith('run-shell-hook.mjs'))) {
        fs.writeFileSync(file, '# ADR-904: CHANGED while the batch was gating it\n')
        // The batch keeps its per-path record from the runner's stdout, so the
        // fake gate must answer in that shape or nothing is recorded at all.
        return {
          status: 0, stderr: '', error: null, signal: null,
          stdout: JSON.stringify({ gated: file, complete: true }) + '\n',
        }
      }
      return original(command, args, options)
    }
    syncBuiltinESMExports()
    const lifecycle = await import(moduleUrl)
    await lifecycle.handleHook({
      hook_event_name: 'SessionStart', source: 'startup', session_id: sessionId, cwd,
    })
    fs.writeFileSync(file, '# ADR-904: edited by the session\n')
    await lifecycle.handleHook({ hook_event_name: 'Stop', session_id: sessionId, cwd })
    process.stdout.write('done')
  }
  const code = '(' + probe.toString() + ')(...' + JSON.stringify([
    pathToFileURL(path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')).href,
    record, dir, session,
  ]) + ')'
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 120_000, cwd: dir, env: HOOK_ENV })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)

  const state = path.join(dir, '.git', 'quality-harness')
  const gated = named(eventsIn(state, session), 'artifact.gated').filter(entry => entry.path === record).at(-1)
  assert.ok(gated, `the batch must have recorded something for this path: ${JSON.stringify(eventsIn(state, session).map(e => e.event))}`)
  const after = createHash('sha256').update(readFileSync(record)).digest('hex')
  assert.notEqual(gated.blob, after,
    'the identity must be the content the batch was GIVEN, not what the file holds after it')
  assert.equal(gated.complete, false,
    'and a gate whose bytes moved underneath it has not answered about them')
})

test('a torn checks.jsonl cannot leave an older pass standing as the verdict', () => {
  // ⚠ THE SIBLING READER OF THE OTHER APPEND-ONLY FILE. `readEvents` was taught
  // that an incomplete read must not supply a positive verdict; `importCheckRecords`
  // still swallowed a torn line in `checks.jsonl` with `catch { continue }` and had
  // its return value discarded at the call site. So a newer FAILURE whose line is
  // truncated never reaches the session log at all — and `latestCheckFor` cannot
  // refuse an order it cannot establish when the event is simply absent. The older
  // pass stands, and the note says "a `qh-check` passed on them".
  //
  // Found by Codex's re-review and independently by an adversarial reader. The
  // reader added the sharpening that makes the fixture realistic: a truncated
  // append leaves NO newline, so the NEXT record lands on the same line and is
  // unparseable too — one bad write loses two records, and the file never repairs.
  //
  // ⚠ PRECONDITION, also from that reader: the surviving PASS must be about the
  // CURRENT tree, or `treeUnchecked` goes true on its own and the test passes for
  // the wrong reason. So the check runs on a clean tree and nothing is edited
  // after it — the realistic shape is two checks with no edit between them, which
  // is a flaky or time-dependent test.
  const dir = repository('tornsource-')
  projectWithCheck(dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'declare a check')
  const session = sessionId('tornsource')
  const state = path.join(dir, '.git', 'quality-harness')
  hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir })
  assert.equal(qhCheckRun(dir, 'pass').status, 0)

  // The control: with a whole source this tree really is verified, so the
  // assertion below cannot be satisfied by a reader that never says verified.
  const clean = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  assert.equal(`${clean.stdout}${clean.stderr}`.trim(), '',
    `a clean checked tree says nothing: ${clean.stdout}${clean.stderr}`)

  // Now a second check is written and its line is torn, exactly as a truncated
  // append leaves it: no trailing newline.
  const source = path.join(state, 'checks.jsonl')
  const before = readFileSync(source, 'utf8')
  assert.match(before, /"id"/, 'the fixture must have a real check record to build on')
  writeFileSync(source, before + '{"id":"torn-2","exit":1,"after":{"tree"')

  const torn = hook({ hook_event_name: 'Stop', session_id: session, cwd: dir })
  const said = `${torn.stdout}${torn.stderr}`
  assert.match(said, /could not|UNPROVEN|UNRUN|unknown/i,
    `a check source that could not be read whole must say so: ${said}`)
  assert.doesNotMatch(said, /\bverified\b/,
    `and the older pass must not stand as the verdict: ${said}`)
})
