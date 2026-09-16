// ADR-058: the commit and completion advisories name only what they observed.
// Each test reproduces a command shape measured on 2026-09-16 in the session
// that executed ADR-057, and carries its opposite, which must still advise.
//
// Patterns and fixtures live at module scope, never as regex literals inside a
// test body: the test-lock hasher masks strings but not regex literals
// (BACKLOG §212), and every body here is locked at its task's first red.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  analyzeTranscript,
  classifyCommand,
  isValidationCommand,
} from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(repoRoot, 'plugin')
const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-accuracy-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write('[advice-accuracy.test] could not remove ' + testTmp + ': ' + (error?.message ?? error) + '\n')
  }
})

const UNCHECKED_COMMIT = new RegExp('would publish unchecked', 'i')
const PASSING_RUN = 'tests 12\npass 12\nfail 0'
const FAILING_RUN = 'Exit code 1\ntests 12\npass 11\nfail 1'

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

function runLifecycleHook(payload) {
  return spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'lifecycle.mjs')], {
    cwd: testTmp,
    input: JSON.stringify({ cwd: testTmp, ...payload }),
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(testTmp, 'claims-ledger'), TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp },
  })
}

function commitAdvice(file, dir, label) {
  return runLifecycleHook({
    hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'git commit -m test' },
    transcript_path: file, cwd: dir,
    session_id: 'accuracy-' + label + '-' + process.pid + '-' + Math.random().toString(36).slice(2),
  })
}

// ---- T1: a timeout-wrapped check is a check.
const WRAPPED_CHECKS = ['gtimeout 590 bash scripts/selftest.sh', 'timeout --kill-after=30 1800 npm test', 'gtimeout -k 2 5 pytest -q']
const BARE_CHECKS = ['bash scripts/selftest.sh', 'npm test', 'pytest -q']
const WRAPPED_NOT_CHECKS = ['gtimeout 5 rm -rf build', 'timeout 60 npm test > out.txt', 'gtimeout 5 gtimeout 5 npm test']

test('a timeout-wrapped check is a check', () => {
  for (const command of [...WRAPPED_CHECKS, ...BARE_CHECKS]) {
    assert.equal(isValidationCommand(command), true, command)
    assert.equal(classifyCommand(command), 'validation', command)
  }
})

test('a timeout wrapper does not launder a mutation', () => {
  for (const command of WRAPPED_NOT_CHECKS) {
    assert.equal(isValidationCommand(command), false, command)
    assert.notEqual(classifyCommand(command), 'validation', command)
  }
  assert.equal(classifyCommand('gtimeout 5 rm -rf build'), 'mutation')
})

test('the commit gate is silent after a passing timeout-wrapped check', async () => {
  const dir = await checkedProject('t1-')
  const edited = path.join(dir, 'a.js')
  await writeFile(edited, 'export {}\n')

  const passed = path.join(dir, 'passed.jsonl')
  await writeFile(passed, transcript([
    toolUse('e1', 'Edit', { file_path: edited }), toolResult('e1'),
    toolUse('c1', 'Bash', { command: 'gtimeout 60 npm test' }), toolResult('c1', false, PASSING_RUN),
  ]))
  assert.equal(analyzeTranscript(await readFile(passed, 'utf8'), dir).verifiedAfterLastMutation, true)
  const silent = commitAdvice(passed, dir, 'passed')
  assert.equal(silent.status, 0, silent.stderr)
  assert.doesNotMatch(silent.stderr, UNCHECKED_COMMIT, silent.stderr)

  const failed = path.join(dir, 'failed.jsonl')
  await writeFile(failed, transcript([
    toolUse('e1', 'Edit', { file_path: edited }), toolResult('e1'),
    toolUse('c1', 'Bash', { command: 'gtimeout 60 npm test' }), toolResult('c1', true, FAILING_RUN),
  ]))
  assert.match(commitAdvice(failed, dir, 'failed').stderr, UNCHECKED_COMMIT)
})
