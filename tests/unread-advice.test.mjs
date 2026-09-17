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

test('a gitignored write does not raise the publish warning (ADR-060)', async () => {
  // The warning is about the observed tree, and a gitignored path is not in it,
  // so an ignored write leaves nothing to warn about; a tracked one does.
  const dir = await checkedProject('unread-t3-')
  gitInit(dir)
  writeFileSync(path.join(dir, '.gitignore'), 'ledger/\n')
  mkdirSync(path.join(dir, 'ledger'), { recursive: true })
  writeFileSync(path.join(dir, 'a.js'), 'export {}\n')
  spawnSync('git', ['-C', dir, 'add', '-A'], { encoding: 'utf8', timeout: 30_000 })
  spawnSync('git', ['-C', dir, '-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', 'commit', '-qm', 'base'],
    { encoding: 'utf8', timeout: 30_000 })
  const ignored = path.join(dir, 'ledger', 'session.md')
  const session = `unread-ignored-${Date.now()}-${process.pid}`
  runLifecycleHook({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir, session_id: session })

  writeFileSync(ignored, '# ledger\n')
  const ignore = spawnSync('git', ['-C', dir, 'check-ignore', '-q', '--', ignored], { encoding: 'utf8', timeout: 15_000 })
  assert.equal(ignore.status, 0, 'the fixture must be gitignored or the test is not about this')
  const clean = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir, session_id: session,
    tool_input: { command: 'git commit -m x' },
  })
  assert.equal(clean.status, 0, clean.stderr)
  assert.doesNotMatch(clean.stderr, /names commit or push/, clean.stderr)

  writeFileSync(path.join(dir, 'b.js'), 'export {}\n')
  const dirty = runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir, session_id: session,
    tool_input: { command: 'git commit -m y' },
  })
  assert.match(dirty.stderr, /names commit or push/, dirty.stderr)
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

