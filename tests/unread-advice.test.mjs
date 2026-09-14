import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  analyzeTranscript,
  isValidationCommand,
} from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(repoRoot, 'plugin')
const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-unread-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write(`[unread-advice.test] could not remove ${testTmp}: ${error?.message ?? error}\n`)
  }
})

const ledgerHome = path.join(testTmp, 'claims-ledger')

function transcript(entries) {
  return entries.map(entry => JSON.stringify(entry)).join('\n')
}

function toolUse(id, name, input) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } }
}

function toolResult(id, isError = false, content = 'ok') {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } }
}

async function checkedProject(prefix) {
  const dir = await mkdtemp(path.join(testTmp, prefix))
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'true' } }))
  return dir
}

function runLifecycleHook(payload, options = {}) {
  const { env: extraEnv, ...rest } = options
  return spawnSync(process.execPath, [path.join(pluginDir, 'scripts/lifecycle.mjs')], {
    cwd: testTmp,
    input: JSON.stringify({ cwd: testTmp, ...payload }),
    encoding: 'utf8',
    env: { ...(extraEnv ?? { ...process.env, CLAUDE_PLUGIN_DATA: ledgerHome }), TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp },
    ...rest,
  })
}

function factsHook(file, payload = {}) {
  const env = { ...process.env }
  delete env.QUALITY_HARNESS_SESSION_ID
  return spawnSync(process.execPath, [
    path.join(pluginDir, 'scripts', 'run-shell-hook.mjs'),
    'facts-gate-dispatch.sh',
  ], {
    encoding: 'utf8', timeout: 30_000, env,
    input: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: file },
      ...payload,
    }),
  })
}

function gitInit(dir) {
  const run = spawnSync('git', ['init', '-q', '-b', 'main'], {
    cwd: dir, encoding: 'utf8', timeout: 15_000,
  })
  assert.equal(run.status ?? 0, 0, run.stderr)
}

test('commit gate does not accuse unverified when this Bash already runs a check then git commit', async () => {
  // Measured 2026-09-14: isValidationCommand('pnpm check') is true;
  // isValidationCommand('pnpm check && git commit -m x') is false and
  // classifyCommand is mutation. PreToolUse runs before the command, so the
  // prefix check is not in the transcript yet. Accusing "nothing has verified"
  // on that compound is a lie about this command, not a finding about the tree.
  assert.equal(isValidationCommand('pnpm check'), true)
  assert.equal(isValidationCommand('pnpm check && git commit -m x'), false)
  assert.equal(isValidationCommand('pnpm check || git commit -m x'), false)

  const dir = await checkedProject('unread-t1-')
  const edited = path.join(dir, 'a.js')
  await writeFile(edited, 'export {}\n')
  const file = path.join(dir, 'main.jsonl')
  await writeFile(file, transcript([
    toolUse('e1', 'Edit', { file_path: edited }),
    toolResult('e1'),
  ]))

  const compound = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'pnpm check && git commit -m test' },
    transcript_path: file, cwd: dir,
    session_id: `unread-t1-and-${Date.now()}-${process.pid}`,
  })
  assert.equal(compound.status, 0, compound.stderr)
  assert.doesNotMatch(compound.stderr, /would publish unchecked/i, compound.stderr)
  assert.doesNotMatch(compound.stderr, /Nothing has verified the work/, compound.stderr)

  const orJoin = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'pnpm check || git commit -m test' },
    transcript_path: file, cwd: dir,
    session_id: `unread-t1-or-${Date.now()}-${process.pid}`,
  })
  assert.match(orJoin.stderr, /would publish unchecked/i, orJoin.stderr)

  const bare = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' },
    transcript_path: file, cwd: dir,
    session_id: `unread-t1-bare-${Date.now()}-${process.pid}`,
  })
  assert.match(bare.stderr, /would publish unchecked/i, bare.stderr)
})

test('a passing mrw --check is a validation for the commit gate', async () => {
  const dir = await checkedProject('unread-t2-')
  const passText = 'check PASS (exit 0)'

  const mcpFile = path.join(dir, 'mcp.jsonl')
  await writeFile(mcpFile, transcript([
    toolUse('w1', 'mcp__mrw__mrw_write', { plan: 'docs/a.md', check: true }),
    toolResult('w1', false, passText),
  ]))
  const mcpState = analyzeTranscript(await readFile(mcpFile, 'utf8'), dir)
  assert.equal(mcpState.unprovenWritePending(), false, 'MCP mrw --check PASS is not pending UNPROVEN')
  assert.ok(mcpState.lastSuccessfulValidation >= 0)
  const mcpCommit = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' },
    transcript_path: mcpFile, cwd: dir,
    session_id: `unread-t2-mcp-${Date.now()}-${process.pid}`,
  })
  assert.doesNotMatch(mcpCommit.stderr, /would publish unchecked/i, mcpCommit.stderr)

  const bashFile = path.join(dir, 'bash.jsonl')
  await writeFile(bashFile, transcript([
    toolUse('w1', 'Bash', { command: 'mrw write --plan-file p.txt --check' }),
    toolResult('w1', false, passText),
  ]))
  const bashState = analyzeTranscript(await readFile(bashFile, 'utf8'), dir)
  assert.equal(bashState.unprovenWritePending(), false, 'Bash mrw write --check PASS is not pending UNPROVEN')
  const bashCommit = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' },
    transcript_path: bashFile, cwd: dir,
    session_id: `unread-t2-bash-${Date.now()}-${process.pid}`,
  })
  assert.doesNotMatch(bashCommit.stderr, /would publish unchecked/i, bashCommit.stderr)

  const dirtyFile = path.join(dir, 'dirty.jsonl')
  await writeFile(dirtyFile, transcript([
    toolUse('w1', 'mcp__mrw__mrw_write', { plan: 'docs/a.md' }),
    toolResult('w1', false, 'ok'),
  ]))
  const dirty = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' },
    transcript_path: dirtyFile, cwd: dir,
    session_id: `unread-t2-dirty-${Date.now()}-${process.pid}`,
  })
  assert.match(dirty.stderr, /would publish unchecked/i, dirty.stderr)
})

test('a gitignored Write after a green check does not re-open the commit gate', async () => {
  const dir = await checkedProject('unread-t3-')
  gitInit(dir)
  writeFileSync(path.join(dir, '.gitignore'), 'ledger/\n')
  mkdirSync(path.join(dir, 'ledger'), { recursive: true })
  const tracked = path.join(dir, 'a.js')
  writeFileSync(tracked, 'export {}\n')
  const ignored = path.join(dir, 'ledger', 'session.md')
  writeFileSync(ignored, '# ledger\n')

  const ignore = spawnSync('git', ['-C', dir, 'check-ignore', '-q', '--', ignored], {
    encoding: 'utf8', timeout: 15_000,
  })
  assert.equal(ignore.status, 0, 'the fixture must be gitignored or the test is not about T3')

  const cleanFile = path.join(dir, 'clean.jsonl')
  await writeFile(cleanFile, transcript([
    toolUse('e1', 'Write', { file_path: tracked }),
    toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }),
    toolResult('t1', false, '12 passed'),
    toolUse('e2', 'Write', { file_path: ignored }),
    toolResult('e2'),
  ]))
  const cleanState = analyzeTranscript(await readFile(cleanFile, 'utf8'), dir)
  assert.equal(cleanState.unverifiedSince(cleanState.lastPublish), false)
  const clean = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' },
    transcript_path: cleanFile, cwd: dir,
    session_id: `unread-t3-clean-${Date.now()}-${process.pid}`,
  })
  assert.doesNotMatch(clean.stderr, /would publish unchecked/i, clean.stderr)

  const dirtyFile = path.join(dir, 'dirty.jsonl')
  const later = path.join(dir, 'b.js')
  writeFileSync(later, 'export const x = 1\n')
  await writeFile(dirtyFile, transcript([
    toolUse('e1', 'Write', { file_path: tracked }),
    toolResult('e1'),
    toolUse('t1', 'Bash', { command: 'pnpm test' }),
    toolResult('t1', false, '12 passed'),
    toolUse('e2', 'Write', { file_path: later }),
    toolResult('e2'),
  ]))
  const dirty = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' },
    transcript_path: dirtyFile, cwd: dir,
    session_id: `unread-t3-dirty-${Date.now()}-${process.pid}`,
  })
  assert.match(dirty.stderr, /would publish unchecked/i, dirty.stderr)
})

test('PostToolUse is silent on a file that is not a QH record', () => {
  const root = mkdtempSync(path.join(testTmp, 'unread-t4-'))
  const file = path.join(root, 'notes.md')
  writeFileSync(file, '# Notes\n\nHouse notes, not a QH record.\n')
  const session = `unread-t4-${Date.now()}-${process.pid}`
  const first = factsHook(file, { session_id: session })
  assert.equal(first.status, 0, first.stderr)
  assert.doesNotMatch(`${first.stdout}${first.stderr}`, /not-recognised/)
  const commit = factsHook(file, { session_id: session, hook_event_name: 'PreToolUse' })
  assert.match(`${commit.stdout}${commit.stderr}`, /not-recognised/)
  const lint = spawnSync('python3', [path.join(pluginDir, 'bin', 'adr-lint'), file], {
    encoding: 'utf8', timeout: 30_000,
  })
  assert.match(`${lint.stdout}${lint.stderr}`, /not-recognised/)
})

