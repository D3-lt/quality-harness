import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
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
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-unread-followon-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write(`[unread-advice-followon.test] could not remove ${testTmp}: ${error?.message ?? error}\n`)
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

test('a mentioned or unfinished mrw --check is not a completed check', async () => {
  // Codex P1 2026-09-14: /\bmrw\b/ && /\bwrite\b/ && --check matched a printf
  // mention and `… --check || true`. T2 is a completed invocation whose result
  // is the check's. Background launch is not completed (same as pnpm test).
  const passText = 'check PASS (exit 0)'
  const dir = await checkedProject('unread-p1-mrw-')

  const clean = analyzeTranscript(transcript([
    toolUse('w1', 'Bash', { command: 'mrw write --plan-file p.txt --check' }),
    toolResult('w1', false, passText),
  ]), dir)
  assert.equal(clean.lastVerdict, 'passed')
  assert.ok(clean.lastSuccessfulValidation >= 0)

  const wrapped = analyzeTranscript(transcript([
    toolUse('w1', 'Bash', { command: 'cd /tmp && mrw write --plan-file p.txt --check' }),
    toolResult('w1', false, passText),
  ]), dir)
  assert.equal(wrapped.lastVerdict, 'passed', 'inert navigation then mrw write --check is still the check')

  const hidden = analyzeTranscript(transcript([
    toolUse('w1', 'Bash', { command: 'mrw write --plan-file p.txt --check || true' }),
    toolResult('w1', false, passText),
  ]), dir)
  assert.notEqual(hidden.lastVerdict, 'passed', '|| true hides the check exit')
  assert.equal(hidden.lastSuccessfulValidation, -1)

  const mentioned = analyzeTranscript(transcript([
    toolUse('w1', 'Bash', { command: 'printf mrw write --check' }),
    toolResult('w1', false, 'mrw write --check'),
  ]), dir)
  assert.notEqual(mentioned.lastVerdict, 'passed', 'a printf mention is not an mrw invocation')
  assert.equal(mentioned.lastSuccessfulValidation, -1)

  const background = analyzeTranscript(transcript([
    toolUse('w1', 'Bash', {
      command: 'mrw write --plan-file p.txt --check',
      run_in_background: true,
    }),
    toolResult('w1', false, 'Command running in background with ID 42'),
  ]), dir)
  assert.notEqual(background.lastVerdict, 'passed')
  assert.equal(background.lastSuccessfulValidation, -1)

  const laterLine = analyzeTranscript(transcript([
    toolUse('w1', 'Bash', { command: 'mrw write --plan-file p.txt --check\ntrue' }),
    toolResult('w1', false, passText),
  ]), dir)
  assert.notEqual(laterLine.lastVerdict, 'passed', 'a later newline true supplies the Bash exit')
  assert.equal(laterLine.lastSuccessfulValidation, -1)

  const negated = analyzeTranscript(transcript([
    toolUse('w1', 'Bash', { command: '! mrw write --plan-file p.txt --check' }),
    toolResult('w1', false, passText),
  ]), dir)
  assert.notEqual(negated.lastVerdict, 'passed', 'shell negation inverts the check exit')
  assert.equal(negated.lastSuccessfulValidation, -1)
})
