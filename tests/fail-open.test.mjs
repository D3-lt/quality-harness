// ADR-061: a constant success does not certify, and an unchecked publish is refused
// when the log was read whole. A torn log still only warns.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { remove } from './helpers/remove.mjs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hookSaid } from './hook-env.mjs'
// The judges and readers once held in lifecycle.mjs now live in modules of their own (BACKLOG section 375, stage B3): the local name stays, so no test body changes.
import * as lifecycleOwn from './helpers/node-hooks/lifecycle.mjs'
import * as checkLedger from './helpers/node-hooks/check-ledger.mjs'
import * as treeFacts from './helpers/node-hooks/tree-facts.mjs'
import * as checkCommand from './helpers/node-hooks/check-command.mjs'
import * as completionRules from './helpers/node-hooks/completion-rules.mjs'
import * as sessionNotes from './helpers/node-hooks/session-notes.mjs'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { publishCommandIn } from './helpers/node-hooks/publish-command.mjs'
import * as currentCheckLedger from '../plugin/scripts/check-ledger.mjs'
import * as currentCheckCommand from '../plugin/scripts/check-command.mjs'
const lifecycle = { ...lifecycleOwn, ...checkLedger, ...treeFacts, ...checkCommand, ...completionRules, ...sessionNotes, ...currentCheckLedger, ...currentCheckCommand, stateDir }

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const qhCheck = path.join(repoRoot, 'plugin', 'bin', 'qh-check')
// A budget a test depends on is set by the test, never inherited from the product's default (CLAUDE.md §7): a loaded
// Windows runner took 6.4 s over observe()'s 5 s here and read could-not-look (ADR-094 CI, 2026-10-10). The direct
// `lifecycle.observe` calls and the hooks this file spawns read the same variable.
process.env.QUALITY_HARNESS_OBSERVE_BUDGET_MS = '60000'
const testTmp = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-fail-open-')))
after(() => {
  try { remove(testTmp) } catch { /* the assertions already ran */ }
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

test('a constant success is not a check and an unchecked publish is refused', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
  // §296: through the hook, on the same unchecked tree — a grep counting the words
  // is not refused, and a shell running them still is.
  const counted = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'grep -c "git push" docs/' },
  })
  assert.notEqual(decision(counted), 'deny', counted.stdout)
  const shelled = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'sh -c "git push"' },
  })
  assert.equal(decision(shelled), 'deny', shelled.stdout)

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
test('a passing check on the tree is not refused because the index differs from it', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
test('a project can turn the publish refusal back into a warning, and only on purpose', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
test('an index that could not be checked does not rescue a failed working tree', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
test('a check that could not look is not reported as no check passing', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
test('a check that could not look after a pass warns and does not refuse', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
test('an unchecked index warning does not invent a passing check', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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

// BACKLOG §381 item 9, through the hook: the same moved index, but the command stages before it commits, so the index
// read before it runs is not the one it records. Said as not known yet, never unchecked, and still not refused.
test('a command that stages before it commits hears its index is not known yet', { skip: 'ADR-130: compulsory check policy retired' }, () => {
  const dir = repository('stages-first-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'check')
  writeFileSync(path.join(dir, 'a.md'), 'staged first\n')
  const session = 'fail-open-stages-first-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  git(dir, 'add', 'a.md')
  const run = hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session,
    tool_input: { command: 'git add -A && git commit -m staged' },
  })
  assert.notEqual(decision(run), 'deny', run.stdout)
  const said = hookSaid(run.stdout, run.stderr).text
  assert.match(said, /the index this commit records is not known yet/, said)
  assert.doesNotMatch(said, /index is unchecked/, said)
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

test('an unresolved check order is not worded as unchecked', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
  // ADR-088 T2: the publish verdict counts only events `checks.jsonl` holds, so the two events name
  // records it does — a pass and a failure on this tree, as every event the importer writes does.
  mkdirSync(lifecycle.stateDir(dir), { recursive: true })
  appendFileSync(path.join(lifecycle.stateDir(dir), 'checks.jsonl'),
    JSON.stringify({ id: 'a', exit: 0, git: true, before: now, after: now }) + '\n'
    + JSON.stringify({ id: 'b', exit: 1, git: true, before: now, after: now }) + '\n')
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
test('the publish opt-out is read from the root the decision used, or is unknown', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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
test('an index that could not be checked says unknown even when the tree passed', { skip: 'ADR-130: compulsory check policy retired' }, () => {
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

// Codex review round 3 (3) asked this of R2's sentence. ADR-128 T1 retired R2 and the sentence with it; the title is the one
// ADR-066's and ADR-088's Tests tables name, and those records are history: read it as "no sentence about several commits is left".
test('R2 over several commits says at least one could not be established', () => {
  assert.equal(lifecycle.uncheckedCommitsReason, undefined, 'the R2 sentence is gone')
  assert.equal(lifecycle.sessionCommits, undefined, 'and so is the commit list it was said over')
})

// A Windows chaos round (2.111.0-rc, P1): Claude Code on Windows ships a PowerShell
// tool, and every shell check read `tool_name === 'Bash'`, so a publish through it was
// neither refused on an unchecked tree nor denied to a read-only role.
test('a publish through the PowerShell tool is refused, and denied to a read-only role', { skip: 'ADR-130: compulsory check policy retired' }, () => {
  const dir = repository('pwsh-')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  const session = 'pwsh-' + process.pid
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
  writeFileSync(path.join(dir, 'a.md'), 'changed\n')
  const through = (tool, extra = {}) => decision(hook(dir, {
    hook_event_name: 'PreToolUse', tool_name: tool, session_id: session, tool_input: { command: 'git push' }, ...extra,
  }))
  assert.equal(through('PowerShell'), 'deny', 'the PowerShell tool is a shell like Bash')
  assert.equal(through('Bash'), 'deny', 'the twin through Bash')
  assert.notEqual(through('NotAShell'), 'deny', 'a tool that runs no command is not read as one')
  assert.equal(through('PowerShell', { agent_type: 'qh-correctness-reviewer', agent_id: 'r1' }), 'deny', 'a read-only role is denied it too')
  const matcher = JSON.parse(readFileSync(path.join(repoRoot, 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks.PreToolUse[0].matcher
  assert.ok(matcher.split('|').includes('PowerShell'), `the hook is called for the PowerShell tool: ${matcher}`)
})
// A chaos round of 626934a (a macOS vitest SPA session): the check was a regex over the
// text, and `test 1`, `/usr/bin/true`, `echo ok`, `true || false` and `true # comment`
// each passed as a real check, which then unlocks a commit. Beside the locked test
// above, because its body is pinned by ADR-066 T1.
test('a check whose exit status the text fixes is refused, whatever it is spelled', () => {
  const constant = ['test 1', '/usr/bin/true', 'echo ok', 'true || false', 'true # just check', '[ 1 ]',
    'npm test || true', 'npm test; echo done', 'bash -c "npm test || :"', 'test -f x || exit 0', 'npm test &', 'npm test | tee log']
  // Codex review of this batch: each of these exits 0 with the file present and 1 without
  // it, under bash and zsh, and each was read as constant, which refuses a real check.
  const real = ['npm test && true', 'false', 'true && false', 'test -f x', 'test "$X"', 'exit 1',
    'set -e; test -f x; echo done', 'set -o pipefail; test -f x | true', '(exit 0); test -f x', 'true < x', 'sh -ec "test -f x; echo done"']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
  // Through the declaration the publish gate reads, not only the predicate.
  const dir = repository('constant-spelled-')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'npm test || true' }))
  assert.deepEqual(lifecycle.checkCommandOrigin(dir), { command: null, origin: 'refused' })
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'npm test && true' }))
  assert.equal(lifecycle.checkCommandOrigin(dir).command, 'npm test && true')
})

// BACKLOG §381, item 1 (§307, "named, not fixed"): without `pipefail` a pipeline's status is its last command's, so a
// check piped into a pass-through sink exits 0 whatever the tests did, and its pass unlocked a commit. The owner chose,
// 2026-10-15, to refuse it, which moved `npm test | tee log` in the locked test above (ADR-088 T2, relocked).
test('a check piped into a pass-through sink without pipefail cannot fail', () => {
  const constant = ['npm test | tee log', 'npm test 2>&1 | tee log', 'npm test |& tee -a log', 'npm test | cat',
    'npm test | tail -n 50', 'npm test 2>&1 | head -20', 'pytest | tee out.txt | tail -5']
  // DIRTY twins: whatever lets the tests' status through, or a sink whose own status depends on the tree, stays a check.
  const real = ['set -o pipefail; npm test | tee log', "bash -o pipefail -c 'npm test | tee log'", 'npm test | grep -q passed',
    'npm test | tail -n 5 log.txt', 'npm test | cat summary.txt', 'npm test | tee log > /dev/null', 'npm test | tee "$LOG"',
    'npm test | tee log && grep -q ok log', 'tee log | npm test']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// The recorded Claude review of 18879680..8892eb9c (advisory, pre-existing): an `exit` inside a pipeline runs in a subshell,
// so it neither ends the list nor fixes the pipeline's status. `exit 1 | tee log` exits 0 under sh, bash and dash
// (measured 2026-10-15) and was read as nonzero, which accepted it as a real check. zsh runs the last stage in the shell
// itself, but a check is run with /bin/sh or Git Bash, never zsh.
test('an exit inside a pipeline does not end the list', () => {
  const constant = ['exit 1 | tee log', 'exit 1 | cat; true', 'npm test | exit 1; true']
  // DIRTY twins: an exit outside a pipeline still ends the list, and a pipeline that ends in it is its status.
  const real = ['exit 1; true', 'npm test | exit 1', 'exit 1 | grep -q x', 'npm test | exit 0; npm test']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// BACKLOG §381 (the scoped verification of e657e75c): a pipeline binds tighter than `&&` and `||`, so `true || npm test |
// false` skips the whole pipeline and exits 0 under sh, bash and dash (measured 2026-10-15). It was folded left to right,
// read nonzero, and accepted as a real check.
test('a pipeline is joined to the list as one unit', () => {
  const constant = ['true || npm test | false', 'exit 0 | cat || npm test | false', 'true || false | npm test', 'npm test | tee log || npm test | false']
  // DIRTY twins: a pipeline whose last stage is the tests still decides the list where it runs.
  const real = ['false || npm test | grep -q ok', 'true && npm test | grep -q ok', 'npm test | tee log && npm test', 'false || true | npm test']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// The recorded Claude review of 2a50071a..6c30eba6 (advisory, older than the range): a pipeline's leading `!` inverts its
// status, but it was dropped as syntax, so `! false` (0 under sh, bash and dash, measured 2026-10-15) read nonzero and was
// accepted as a real check.
test('a negated pipeline has the inverse status', () => {
  const constant = ['! false', 'npm test || ! false | false', '! false && true', 'true || ! npm test',
    // The verification of ee074441: an `exit` ending a pipeline only sets its status, and a bare `! exit 0` exits 0
    // before any inversion (bash 3.2 and /bin/sh, measured).
    '! npm test | exit 1', '! exit 0']
  // DIRTY twins: a negated check still depends on the tree, and `! true` is constant failure, not success. A doubled `!`
  // is unknown: bash 3.2 and /bin/sh here reject it (exit 2), while bash 5's grammar may toggle it, which is not measured.
  const real = ['! npm test', '! true', 'false || ! npm test | grep -q x', '! false && npm test', '! npm test | exit 0', '! ! true', '! ! false']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// The recorded review of ee074441..e4002cca (blocking): dropping the `!` at a group's `{` turned `! { false; }` (0 under
// bash 3.2 and /bin/sh, measured) from refused into accepted. A negated group holding one pipeline is that pipeline
// negated; a negated group of several commands is not folded here and reads as unknown (BACKLOG §381).
test('a negated group of one pipeline is that pipeline negated', () => {
  const constant = ['! { false; }', '! { npm test | false; }', '! { false; } && echo ok']
  // DIRTY twins: the group's pipeline still decides where it depends on the tree, and `! { true; }` exits 1.
  const real = ['! { npm test; }', '! { true; }', '! { false; npm test; }', '! { ! false; }', '! { false; true; }']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// The verification of 0b9b528a (blocking): the operator after a group's `}` was dropped, so the group's last command kept
// `;`. `! { true; } &`, `{ false; } &` and `{ true; } || npm test` each exit 0 (bash 3.2 and /bin/sh, measured) and were
// accepted as real checks.
test('the operator after a group joins the group', () => {
  const constant = ['! { true; } &', '{ false; } &', '{ true; } || npm test', '! { true; } || true',
    // The verification of a44173e1: a body that ends in `&` keeps it (exits 0 under bash 3.2 and /bin/sh, measured). The
    // `function` keyword rows this list held moved to the test below (ADR-120 T1): dash exits 2 on them.
    '{ npm test & } && true']
  // DIRTY twins: a group the tests decide is still a check, whatever joins it.
  const real = ['{ npm test; } && true', '{ false; } || npm test', '! { npm test; } || false']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// ADR-120 T1 (relocked from the test above, whose list held these rows as constant): the `function` keyword is bash and zsh
// syntax. Under dash, which /bin/sh is on Debian and Ubuntu, each of these exits 2 or runs `function` as a command (measured
// 2026-10-21: `function f { npm test; } && true` is 0, 0, 2 under /bin/bash, /bin/sh and /bin/dash), so no status is fixed
// and the check is could-not-look, accepted.
test('a definition written with the function keyword is could-not-look, because dash rejects it', () => {
  const bashOnly = ['function f { npm test; } && true', 'function f() { npm test; } && true', 'function f ( ) { npm test; } && true',
    'function f\n{ npm test; } && true', 'function f() if true\nthen :\nfi\n{ true; } || npm test', 'function f() (( 1 ))\n{ true; } || npm test',
    'function f() [[ x ]]\n{ true; } || npm test']
  for (const command of bashOnly) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
  // DIRTY twin: the POSIX spelling of the same definition is read, and refused where its status is fixed (0 under all three).
  assert.equal(lifecycle.constantSuccessCheck('f() { npm test; } && true'), true)
  assert.equal(lifecycle.constantSuccessCheck('f() { npm test; }; f'), false)
})

// ADR-119 T1 (BACKLOG §381): a pipe after a group's `}` was dropped like the other operators were before 0b9b528a, so the
// group's last command kept `;` and a pass-through sink after it was read as a command of its own. `{ false; } | cat`
// exits 0 under bash 3.2 and /bin/sh, and `{ false; } |& cat` under zsh (measured 2026-10-20), and both were accepted.
test('a pipe or a pipe-and-stderr after a group joins the pipeline, so a sink after it cannot fail', () => {
  const constant = ['{ false; } | cat', '{ true; } | cat', '{ false; } |& cat', '{ npm test; } | cat']
  // DIRTY twins: a check after the pipe decides the pipeline's status (`{ true; } |& false` exits 1 under zsh, measured).
  const real = ['{ true; } | npm test', '{ true; } |& npm test']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// The review of c48dd5b0..cfd24edc (blocking): T1 piped the group's last command alone, so the group's own `&&` and `||`
// were folded into the pipeline. `{ true || false; } | npm test` exits 1 with a failing npm under bash 3.2, /bin/sh and
// zsh -f and was refused as constant; `{ false && true; } | cat` exits 0 in all three and was accepted (measured 2026-10-20).
test('a group of several commands piped onward is one stage, so its own list decides nothing after the pipe', () => {
  const constant = ['{ false && true; } | cat', '{ true || false; } | cat', '{ true; false; } | cat', '{ false | true; } | cat']
  // DIRTY twins: the stage after the pipe decides, whatever the group's own list does.
  const real = ['{ true || false; } | npm test', '{ false && true; } | npm test', '{ false; true; } | npm test']
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// The verification of 7e7c59ee..892ba222 (blocking): listStatus honoured a group's end only for the pipeline's first stage,
// so a later group's own list leaked into the list. `{ true || false; } | { false && true; } | cat` exits 0 under bash 3.2,
// /bin/sh and zsh -f and was accepted; `{ false && true; } | { true || false; } | npm test` exits 1 with a failing npm in
// all three and was refused as constant (measured 2026-10-20 with a stub npm).
test('every group of several commands in a pipeline is one stage, not only the first', () => {
  const constant = [
    '{ true || false; } | { false && true; } | cat',
    '{ true; false; } | { false; true; } | { true || false; } | cat',
    'npm test | cat && { true || false; } | cat',
    'false | cat && { true; false; } | cat',
    'npm test | { cat; true; }',
  ]
  // DIRTY twins: the stage after the last pipe decides, however many groups come before it.
  const real = [
    '{ false && true; } | { true || false; } | npm test',
    '{ false; true; } | { true; false; } | { false && true; } | npm test',
    'npm test | cat && { false && true; } | npm test',
    'npm test | { true; npm test; }',
  ]
  for (const command of constant) assert.equal(lifecycle.constantSuccessCheck(command), true, command)
  for (const command of real) assert.equal(lifecycle.constantSuccessCheck(command), false, command)
})

// The review of c48dd5b0..cfd24edc (blocking): the text a group pipes into a shell was read from its last command alone, so
// `{ printf %s '#'; echo 'git push'; } | sh` was proven a publish; the shell is sent `#git push` and runs a comment (bash
// 3.2, /bin/sh and zsh -f, measured 2026-10-20 with a harmless marker in its place).
test('the text a group of several commands pipes into a shell is not proven from its last command', () => {
  assert.equal(publishCommandIn("{ printf %s '#'; echo 'git push'; } | sh"), null)
  // DIRTY twins: one command, or one pipeline, piped into a shell is still read.
  const proven = ["{ echo 'git push'; } | sh", "{ echo 'git push' | cat; } | sh", "echo 'git push' | sh"]
  for (const command of proven) assert.equal(publishCommandIn(command), 'git push', command)
})
