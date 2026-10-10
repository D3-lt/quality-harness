// BACKLOG section 376: the bound a check is run under was not asserted anywhere. A check that never returns would hold the
// session's Bash call for ever, so past QUALITY_HARNESS_CHECK_TIMEOUT its process group is sent SIGTERM and the record says so;
// a value that is not a positive number of seconds is the default, never a bound of zero.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { checkTimeoutMs } from '../plugin/scripts/check-child.mjs'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-check-bound-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const sink = () => { const chunks = []; return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') } }

test('the bound is the number of seconds asked for, and a value that is not a positive number is the default hour', () => {
  assert.equal(checkTimeoutMs({ QUALITY_HARNESS_CHECK_TIMEOUT: '2' }), 2_000)
  assert.equal(checkTimeoutMs({ QUALITY_HARNESS_CHECK_TIMEOUT: '0.5' }), 500)
  for (const bad of [undefined, '', '0', '-5', 'soon', 'NaN', 'Infinity']) assert.equal(checkTimeoutMs({ QUALITY_HARNESS_CHECK_TIMEOUT: bad }), 3_600_000, String(bad))
})

test('a check that outlives its bound is stopped and recorded as having no verdict', async () => {
  const dir = path.join(scratch, 'hang')
  mkdirSync(dir, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).status, 0)
  // A check that starts a child of its own, which holds the check's pipes: the bound has to reach the whole group, or the run
  // waits for the grandchild after the check itself was stopped.
  const hang = "import { spawn } from 'node:child_process'\n"
    + "if (process.platform !== 'win32') spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'inherit' })\n"
    + 'setTimeout(() => {}, 120_000)\n'
  writeFileSync(path.join(dir, 'hang.mjs'), hang)
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'node hang.mjs' }))
  const err = sink()
  const started = Date.now()
  const exit = await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: { ...process.env, QUALITY_HARNESS_CHECK_TIMEOUT: '1' } })
  assert.ok(Date.now() - started < 60_000, 'the check was not stopped by its bound')
  assert.notEqual(exit, 0)
  const record = JSON.parse(readFileSync(path.join(stateDir(dir), 'checks.jsonl'), 'utf8').trim().split('\n').pop())
  assert.notEqual(record.verdict, 'passed')
  if (process.platform !== 'win32') {
    assert.equal(record.signal, 'SIGTERM')
    assert.equal(record.verdict, 'interrupted')
    assert.match(err.text(), /interrupted by SIGTERM before it finished, so there is no verdict/)
  }
})
