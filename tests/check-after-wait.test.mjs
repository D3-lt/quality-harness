import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { runCheck } from '../plugin/scripts/qh-check.mjs'
import * as lease from '../plugin/scripts/lease.mjs'
import { remove } from './helpers/remove.mjs'

function fixture(t) {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-after-wait-')))
  t.after(() => remove(top))
  const root = path.join(top, 'repo')
  mkdirSync(root)
  const initialized = spawnSync('git', ['init', '-q', root], { timeout: 10_000, windowsHide: true })
  assert.equal(initialized.status, 0)
  writeFileSync(path.join(root, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs', fastCheck: 'node check.mjs' }))
  writeFileSync(path.join(root, 'check.mjs'), "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.QH_RUNS, 'ran\\n'); console.log('ran'); process.exit(process.env.QH_FAIL === '1' ? 1 : 0)\n")
  const { QUALITY_HARNESS_WAIT: _wait, QUALITY_HARNESS_CHECK_AGAIN: _again, QH_FAIL: _fail, ...base } = process.env
  const env = { ...base, QH_RUNS: path.join(top, 'runs'), QUALITY_HARNESS_LEASE_DIR: path.join(top, 'leases'), QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' }
  mkdirSync(env.QUALITY_HARNESS_LEASE_DIR)
  const messages = []
  const sink = { write: chunk => { messages.push(String(chunk)); return true } }
  const options = { cwd: root, env, stdout: sink, stderr: sink }
  return { root, env, options, messages, runs: () => readFileSync(env.QH_RUNS, 'utf8').trim().split('\n').length }
}

// The lease boundary supplies the other check's actual result without a scheduling sleep.
async function afterOtherCheck(f, { fast = false, again = false, envAgain = false, after = () => {}, failed = false } = {}) {
  let admitted = 0
  const waitingLease = {
    ...lease,
    admit: async () => {
      admitted++
      assert.equal(await runCheck({ ...f.options, fast, env: { ...f.env, QH_FAIL: failed ? '1' : '0' } }), failed ? 1 : 0)
      after()
      return { admitted: true, waitedMs: 1, stopped: null }
    },
  }
  const code = await runCheck({ ...f.options, wait: true, fast, again,
    env: { ...f.env, QUALITY_HARNESS_CHECK_AGAIN: envAgain ? '1' : '0' }, lease: waitingLease })
  assert.equal(admitted, 1)
  assert.deepEqual(readdirSync(f.env.QUALITY_HARNESS_LEASE_DIR), [], 'the waiter releases its lease even when it skips')
  return code
}

test('a waiting check reuses the pass recorded before its turn and runs the command only once', async t => {
  const f = fixture(t)
  assert.equal(await afterOtherCheck(f), 0)
  assert.equal(f.runs(), 1, 'the waiter must not launch the same check a second time')
  assert.match(f.messages.join(''), /already passed on this tree/)
  const rows = readFileSync(path.join(f.root, '.git', 'quality-harness', 'checks.jsonl'), 'utf8').trim().split('\n')
  assert.equal(rows.length, 1, 'reuse records no fictitious second check')
})

for (const [name, settings] of [
  ['--again', { again: true }],
  ['the environment asks for another run', { envAgain: true }],
  ['a fast check was explicitly requested', { fast: true }],
  ['the previous check failed', { failed: true }],
  ['the tree changed during the wait', f => ({ after: () => writeFileSync(path.join(f.root, 'changed.txt'), 'changed\n') })],
  ['the ledger was torn during the wait', f => ({ after: () => appendFileSync(path.join(f.root, '.git', 'quality-harness', 'checks.jsonl'), '{torn') })],
  ['an unseen write followed the pass', f => ({ after: () => {
    const sessions = path.join(f.root, '.git', 'quality-harness', 'sessions')
    mkdirSync(sessions, { recursive: true })
    appendFileSync(path.join(sessions, 'writer.jsonl'), JSON.stringify({ at: new Date().toISOString(), event: 'file.written', observable: false, path: path.join(f.root, 'ignored.bin'), checksSeen: 1 }) + '\n')
  } })],
]) {
  test(`a waiting check still runs when ${name}`, async t => {
    const f = fixture(t)
    assert.equal(await afterOtherCheck(f, typeof settings === 'function' ? settings(f) : settings), 0)
    assert.equal(f.runs(), 2)
  })
}

test('a waiting check releases its lease if reuse throws', async t => {
  const f = fixture(t)
  writeFileSync(path.join(f.root, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs', prose: ['docs/**'] }))
  mkdirSync(path.join(f.root, 'docs'))
  writeFileSync(path.join(f.root, 'docs', 'note.md'), 'one')
  for (const args of [['add', '-A'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base']]) {
    assert.equal(spawnSync('git', args, { cwd: f.root, encoding: 'utf8', timeout: 10_000, windowsHide: true }).status, 0)
  }
  f.options.beforeReuse = () => { throw new Error('reuse failed') }
  await assert.rejects(afterOtherCheck(f, { after: () => writeFileSync(path.join(f.root, 'docs', 'note.md'), 'two') }), /reuse failed/)
  assert.deepEqual(readdirSync(f.env.QUALITY_HARNESS_LEASE_DIR), [], 'an exceptional reuse releases the waiter too')
})
