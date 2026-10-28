// ADR-114 T1: `qh mcp` serves four read-only resources from the ledgers the hooks and qh-check already write: the latest
// check, the kept baseline, the branch-state snapshot and the findings the last turn end gave. Each is compared with the ledger
// a scripted session left, and a ledger that cannot be read is said (UNRUN, UNPROVEN), never served as empty (ADR-005).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { remove } from './helpers/remove.mjs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { fixtureRepo, runHook, runQhCheck, sandbox } from './hook-golden.mjs'
import { required } from './helpers/require.mjs'
import { observe } from '../plugin/scripts/tree-facts.mjs'

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0 ? 'go is not on PATH, so the Go core cannot be built here' : false)
const skip = noGo || (process.platform === 'win32' && 'the fixtures run sh checks, as the goldens do (BACKLOG section 375)')
const ledger = (repo, name) => path.join(repo, '.git', 'quality-harness', name)
const lastLine = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).at(-1)

// One newline-delimited JSON-RPC request per line in, the responses out, keyed by id.
function ask(qh, repo, requests, env = process.env) {
  const run = spawnSync(qh, ['mcp'], { cwd: repo, env, input: requests.map(r => JSON.stringify({ jsonrpc: '2.0', ...r })).join('\n') + '\n', encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return new Map(run.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).map(answer => [answer.id, answer]))
}
const read = (qh, repo, uri) => ask(qh, repo, [{ id: 1, method: 'resources/read', params: { uri } }]).get(1).result.contents[0].text

test('each resource says what its ledger holds, and an unreadable one says so', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const bin = mkdtempSync(path.join(os.tmpdir(), 'qh-mcp-bin-'))
  t.after(() => rmSync(bin, { recursive: true, force: true }))
  const qh = path.join(bin, 'qh')
  const built = spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, built.stderr)

  const box = sandbox(t)
  const repo = fixtureRepo(box, 'mcp', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  // Before anything ran: every ledger is absent, and each resource says so rather than answering empty.
  for (const uri of ['qh://check/latest', 'qh://baseline', 'qh://branch-state', 'qh://turn-end/findings']) {
    assert.match(read(qh, repo, uri), /^UNRUN: /, `${uri} before anything ran`)
  }

  // A session: a baseline for the starting tree, a write, a turn end that names it unchecked, and a check.
  const start = observe(repo).tree
  runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source: 'startup' })
  runQhCheck(box, repo, ['--baseline', start])
  writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
  runHook(box, repo, 's1', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src', 'a.js'), content: 'y\n' }, tool_response: { success: true } })
  runHook(box, repo, 's1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  assert.equal(runQhCheck(box, repo).exit, 0)
  writeFileSync(path.join(repo, '.git', 'qh-branch-state.json'), `${JSON.stringify({ at: 1, key: 'k', state: { looked: false } })}\n`)

  const listed = ask(qh, repo, [{ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { method: 'notifications/initialized' }, { id: 2, method: 'resources/list' }, { id: 3, method: 'tools/call' }])
  assert.ok(listed.get(1).result.capabilities.resources, 'it says it serves resources')
  assert.deepEqual(listed.get(2).result.resources.map(r => r.uri).sort(), ['qh://baseline', 'qh://branch-state', 'qh://check/latest', 'qh://turn-end/findings'])
  assert.equal(listed.get(3).error.code, -32601, 'it serves no tools')
  assert.equal(listed.size, 3, 'a notification is not answered')

  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://check/latest')), JSON.parse(lastLine(ledger(repo, 'checks.jsonl'))))
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://baseline')), JSON.parse(lastLine(ledger(repo, 'baseline.jsonl'))))
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://branch-state')), { at: 1, key: 'k', state: { looked: false } })
  const findings = JSON.parse(read(qh, repo, 'qh://turn-end/findings'))
  assert.equal(findings.session, 's1')
  assert.deepEqual(findings.findings.map(f => f.rule), ['R1'], 'the finding the last turn end gave')
  // A finding of an earlier turn is not the last turn's: a second turn end over the checked tree gives none.
  runHook(box, repo, 's1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://turn-end/findings')).findings, [])

  // A ledger that cannot be read, or whose last line is not whole, is UNPROVEN, never empty.
  writeFileSync(ledger(repo, 'checks.jsonl'), `${readFileSync(ledger(repo, 'checks.jsonl'), 'utf8')}{"torn`)
  assert.match(read(qh, repo, 'qh://check/latest'), /^UNPROVEN: /)
  if (process.getuid?.() !== 0) {
    chmodSync(ledger(repo, 'baseline.jsonl'), 0o000)
    assert.match(read(qh, repo, 'qh://baseline'), /^UNPROVEN: /)
    chmodSync(ledger(repo, 'baseline.jsonl'), 0o644)
  }
  assert.equal(ask(qh, repo, [{ id: 9, method: 'resources/read', params: { uri: 'qh://nothing' } }]).get(9).error.code, -32602)
  assert.ok(existsSync(ledger(repo, 'checks.jsonl')), 'reading changed no ledger')
})

// The Codex review of f79c600d: a finding a later hook emitted was served as the last turn end's, and with
// QUALITY_HARNESS_STATE_DIR set the branch-state snapshot, which stays in the git directory, read as absent.
test('a later hook\'s finding is not the last turn end\'s, and a moved state directory still finds the snapshot', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const bin = mkdtempSync(path.join(os.tmpdir(), 'qh-mcp-bin-'))
  t.after(() => remove(bin))
  const qh = path.join(bin, 'qh')
  assert.equal(spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true }).status, 0)
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'later', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
  runHook(box, repo, 's1', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src', 'a.js'), content: 'y\n' }, tool_response: { success: true } })
  runHook(box, repo, 's1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  // The Codex review of aae06d72: a mention records no event before its advice, so its P must not read as the turn end's.
  runHook(box, repo, 's1', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo commit' } })
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://turn-end/findings')).findings.map(f => f.rule), ['R1'], 'a mention\'s advice is not the turn end\'s')
  const refused = runHook(box, repo, 's1', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } })
  assert.equal(refused.stdout?.hookSpecificOutput?.permissionDecision, 'deny', 'the later hook did say something')
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://turn-end/findings')).findings.map(f => f.rule), ['R1'], 'only the turn end\'s own')
  const moved = { ...process.env, QUALITY_HARNESS_STATE_DIR: path.join(box.tmp, 'moved-state') }
  writeFileSync(path.join(repo, '.git', 'qh-branch-state.json'), `${JSON.stringify({ at: 2, key: 'm', state: { looked: false } })}\n`)
  const snapshot = ask(qh, repo, [{ id: 1, method: 'resources/read', params: { uri: 'qh://branch-state' } }], moved).get(1).result.contents[0].text
  assert.deepEqual(JSON.parse(snapshot), { at: 2, key: 'm', state: { looked: false } })
})

// ADR-130: retained behavior, with the retired publish-policy expectations removed.
test("optional checks preserve resource evidence and unreadable-ledger reporting", { skip }, t => {
  const bin = mkdtempSync(path.join(os.tmpdir(), 'qh-mcp-bin-'))
  t.after(() => remove(bin))
  const qh = path.join(bin, 'qh')
  const built = spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, built.stderr)

  const box = sandbox(t)
  const repo = fixtureRepo(box, 'mcp', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  // Before anything ran: every ledger is absent, and each resource says so rather than answering empty.
  for (const uri of ['qh://check/latest', 'qh://baseline', 'qh://branch-state', 'qh://turn-end/findings']) {
    assert.match(read(qh, repo, uri), /^UNRUN: /, `${uri} before anything ran`)
  }

  // A session: a baseline for the starting tree, a write, a turn end that names it unchecked, and a check.
  const start = observe(repo).tree
  runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source: 'startup' })
  runQhCheck(box, repo, ['--baseline', start])
  writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
  runHook(box, repo, 's1', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src', 'a.js'), content: 'y\n' }, tool_response: { success: true } })
  runHook(box, repo, 's1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  assert.equal(runQhCheck(box, repo).exit, 0)
  writeFileSync(path.join(repo, '.git', 'qh-branch-state.json'), `${JSON.stringify({ at: 1, key: 'k', state: { looked: false } })}\n`)

  const listed = ask(qh, repo, [{ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { method: 'notifications/initialized' }, { id: 2, method: 'resources/list' }, { id: 3, method: 'tools/call' }])
  assert.ok(listed.get(1).result.capabilities.resources, 'it says it serves resources')
  assert.deepEqual(listed.get(2).result.resources.map(r => r.uri).sort(), ['qh://baseline', 'qh://branch-state', 'qh://check/latest', 'qh://turn-end/findings'])
  assert.equal(listed.get(3).error.code, -32601, 'it serves no tools')
  assert.equal(listed.size, 3, 'a notification is not answered')

  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://check/latest')), JSON.parse(lastLine(ledger(repo, 'checks.jsonl'))))
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://baseline')), JSON.parse(lastLine(ledger(repo, 'baseline.jsonl'))))
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://branch-state')), { at: 1, key: 'k', state: { looked: false } })
  const findings = JSON.parse(read(qh, repo, 'qh://turn-end/findings'))
  assert.equal(findings.session, 's1')
  assert.deepEqual(findings.findings.map(f => f.rule), [], 'no check nag is emitted')
  // A finding of an earlier turn is not the last turn's: a second turn end over the checked tree gives none.
  runHook(box, repo, 's1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://turn-end/findings')).findings, [])

  // A ledger that cannot be read, or whose last line is not whole, is UNPROVEN, never empty.
  writeFileSync(ledger(repo, 'checks.jsonl'), `${readFileSync(ledger(repo, 'checks.jsonl'), 'utf8')}{"torn`)
  assert.match(read(qh, repo, 'qh://check/latest'), /^UNPROVEN: /)
  if (process.getuid?.() !== 0) {
    chmodSync(ledger(repo, 'baseline.jsonl'), 0o000)
    assert.match(read(qh, repo, 'qh://baseline'), /^UNPROVEN: /)
    chmodSync(ledger(repo, 'baseline.jsonl'), 0o644)
  }
  assert.equal(ask(qh, repo, [{ id: 9, method: 'resources/read', params: { uri: 'qh://nothing' } }]).get(9).error.code, -32602)
  assert.ok(existsSync(ledger(repo, 'checks.jsonl')), 'reading changed no ledger')
})

test("optional publishing leaves turn-end findings empty and moved snapshots readable", { skip }, t => {
  const bin = mkdtempSync(path.join(os.tmpdir(), 'qh-mcp-bin-'))
  t.after(() => remove(bin))
  const qh = path.join(bin, 'qh')
  assert.equal(spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true }).status, 0)
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'later', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
  runHook(box, repo, 's1', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(repo, 'src', 'a.js'), content: 'y\n' }, tool_response: { success: true } })
  runHook(box, repo, 's1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  // The Codex review of aae06d72: a mention records no event before its advice, so its P must not read as the turn end's.
  runHook(box, repo, 's1', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo commit' } })
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://turn-end/findings')).findings.map(f => f.rule), [], 'a mention\'s advice is not the turn end\'s')
  const refused = runHook(box, repo, 's1', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } })
  assert.notEqual(refused.stdout?.hookSpecificOutput?.permissionDecision, 'deny', 'publishing is optional')
  assert.deepEqual(JSON.parse(read(qh, repo, 'qh://turn-end/findings')).findings.map(f => f.rule), [], 'only the turn end\'s own')
  const moved = { ...process.env, QUALITY_HARNESS_STATE_DIR: path.join(box.tmp, 'moved-state') }
  writeFileSync(path.join(repo, '.git', 'qh-branch-state.json'), `${JSON.stringify({ at: 2, key: 'm', state: { looked: false } })}\n`)
  const snapshot = ask(qh, repo, [{ id: 1, method: 'resources/read', params: { uri: 'qh://branch-state' } }], moved).get(1).result.contents[0].text
  assert.deepEqual(JSON.parse(snapshot), { at: 2, key: 'm', state: { looked: false } })
})
