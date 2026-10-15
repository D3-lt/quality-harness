// ADR-103 T2: after a full run, qh-check says when the run took at least 1.5 times the median of this command's own last 20
// full passes, given at least five of them, not counting this run, failed runs, rows reused from another run (ADR-094) or
// another command's passes; never after a --fast run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { slowRunLine } from '../plugin/scripts/check-ledger.mjs'
import { stateDir } from '../plugin/scripts/event-log.mjs'

const qhCheckScript = fileURLToPath(new URL('../plugin/scripts/qh-check.mjs', import.meta.url))
const COMMAND = 'node check.mjs'
let clock = Date.parse('2026-10-15T00:00:00.000Z')
const pass = (ms, { command = COMMAND, exit = 0, reusedFrom } = {}) => {
  const start = clock
  clock += ms + 1000
  return { id: `r${clock}`, command, git: false, exit, signal: null, verdict: exit === 0 ? 'passed' : 'failed',
    before: { at: new Date(start).toISOString() }, after: { at: new Date(start + ms).toISOString() },
    ...(reusedFrom ? { reusedFrom } : {}) }
}
const passes = (count, ms, options) => Array.from({ length: count }, () => pass(ms, options))

test('a run half again its own median is said', () => {
  const five = passes(5, 2000)
  const line = slowRunLine(five, COMMAND, 3000)
  assert.match(line, /^this run took 3\.0 s, 1\.5x the median 2\.0 s of its last 5 passes$/, String(line))
  // The lower middle of an even count: of 1, 1, 1, 3, 3, 3 s the median is 1 s, so 2 s is twice it.
  assert.match(String(slowRunLine([...passes(3, 1000), ...passes(3, 3000)], COMMAND, 2000)), /2\.0x the median 1\.0 s of its last 6 passes/)

  // Through qh-check: a fixture whose ledger holds five earlier passes of 2 s, and a check that takes 3.5 s.
  const top = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-slow-run-')))
  try {
    const repo = path.join(top, 'repo')
    mkdirSync(repo)
    const git = (...args) => spawnSync('git', ['-C', repo, '-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', ...args], { encoding: 'utf8', timeout: 60_000 })
    git('init', '-q')
    writeFileSync(path.join(repo, 'check.mjs'), 'setTimeout(() => process.exit(0), Number(process.env.QH_SLEEP_MS ?? 0))\n')
    writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check: COMMAND, fastCheck: COMMAND }))
    git('add', '-A')
    git('commit', '-q', '-m', 'one', '--no-gpg-sign')
    mkdirSync(stateDir(repo), { recursive: true })
    writeFileSync(path.join(stateDir(repo), 'checks.jsonl'), passes(5, 2000).map(row => `${JSON.stringify(row)}\n`).join(''))
    const run = (args, sleep) => spawnSync(process.execPath, [qhCheckScript, ...args], { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true,
      env: { ...process.env, TMPDIR: top, TMP: top, TEMP: top, QH_SLEEP_MS: String(sleep), QUALITY_HARNESS_CHECK_AGAIN: '1', QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' } })
    const slow = run([], 3500)
    assert.equal(slow.status, 0, slow.stderr)
    assert.match(slow.stderr, /^qh-check: this run took [\d.]+ s, [\d.]+x the median 2\.0 s of its last 5 passes$/m, slow.stderr)
    // DIRTY twin: a --fast run is not a full run, whatever it took.
    const fast = run(['--fast'], 3500)
    assert.equal(fast.status, 0, fast.stderr)
    assert.doesNotMatch(fast.stderr, /this run took/, fast.stderr)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a run within its history, or with too little of it, says nothing', () => {
  assert.equal(slowRunLine(passes(5, 2000), COMMAND, 2800), null, '1.4x is within its history')
  assert.equal(slowRunLine(passes(4, 2000), COMMAND, 9000), null, 'four passes are too few')
  assert.equal(slowRunLine([], COMMAND, 9000), null)
})

test("only this command's own recent full passes make the median", () => {
  const four = () => passes(4, 2000)
  // Each row here would make a fifth pass, or move the median, if it were counted.
  assert.equal(slowRunLine([...four(), pass(2000, { exit: 1 })], COMMAND, 9000), null, 'a failed run is not a pass')
  assert.equal(slowRunLine([...four(), pass(2000, { reusedFrom: 'r1' })], COMMAND, 9000), null, 'a reused row is not a run')
  assert.equal(slowRunLine([...four(), pass(2000, { command: 'other' })], COMMAND, 9000), null, "another command's pass is not this one's")
  // The last 20: 25 old passes of 1 s and 20 recent ones of 10 s. Over all 45 the median is 1 s and 12 s is 12x it; over the
  // last 20 it is 10 s, and 12 s is within its history.
  assert.equal(slowRunLine([...passes(25, 1000), ...passes(20, 10_000)], COMMAND, 12_000), null)
})
