// Stage 0 of the plan to make the check fast (BACKLOG §378): the reader of the per-file times the gate keeps. It names where a
// run's time went, models what an ordering would save from the same numbers, joins each run to the check that ran it, and
// counts the trees that went red and then green with nothing changed. Driven through the script over fixture ledgers.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { makespan, summarize } from '../scripts/check-timing.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(repoRoot, 'scripts', 'check-timing.mjs')

const ledger = (times, checks) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-check-timing-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'selftest-files.jsonl'), times.map(row => JSON.stringify(row)).join('\n') + '\n')
  writeFileSync(path.join(dir, 'checks.jsonl'), checks.map(row => JSON.stringify(row)).join('\n') + '\n')
  return dir
}
const read = (dir, ...args) => spawnSync(process.execPath, [script, '--dir', dir, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const check = (at, minutes, tree, exit, contended = false) => ({
  command: 'bash scripts/selftest.sh', exit, contended, cores: 10,
  before: { at: new Date(Date.parse(at) - minutes * 60_000).toISOString(), tree, load: 1 }, after: { at, tree, load: 1 },
})

test('the order a file list is run in decides how long the slowest worker takes', () => {
  // Two workers, one long file listed last: in that order it starts after a short one, longest first it starts at once.
  const files = [{ file: 'a', ms: 10 }, { file: 'b', ms: 10 }, { file: 'c', ms: 10 }, { file: 'z', ms: 30 }]
  assert.equal(makespan(files, 2), 40)
  assert.equal(makespan([...files].sort((x, y) => y.ms - x.ms), 2), 30)
  assert.equal(makespan([], 2), 0)
})

test('a run is named with its slowest files, its modelled orders, and the check that ran it', () => {
  const dir = ledger(
    [{ at: '2026-10-14T10:04:00.000Z', concurrency: 'default', load: '2.00', files: [
      { file: 'tests/a.test.mjs', ms: 10_000, tests: 3, failed: 0 },
      { file: 'tests/b.test.mjs', ms: 2_000, tests: 1, failed: 1 },
      { file: 'tests/z.test.mjs', ms: 40_000, tests: 9, failed: 0 },
    ] }],
    [check('2026-10-14T10:05:00.000Z', 5, 't1', 1)])
  try {
    const run = read(dir, '--json', '--workers', '2')
    assert.equal(run.status, 0, run.stderr)
    const [report] = JSON.parse(run.stdout).runs
    assert.deepEqual(report.slowest.map(entry => entry.file), ['tests/z.test.mjs', 'tests/a.test.mjs', 'tests/b.test.mjs'])
    assert.equal(report.summedMs, 52_000)
    assert.deepEqual(report.failedFiles, ['tests/b.test.mjs'])
    assert.equal(report.model.listedMs, 42_000)
    assert.equal(report.model.longestFirstMs, 40_000)
    assert.equal(report.check.exit, 1, 'joined to the check whose window holds it')
    assert.equal(report.check.contended, false)
    const text = read(dir, '--workers', '2')
    assert.match(text.stdout, /tests\/z\.test\.mjs/)
    assert.match(text.stdout, /a model: per-file times only/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a run no check holds is said as unjoined, and a contended check is said as contended', () => {
  const dir = ledger(
    [{ at: '2026-10-14T09:00:00.000Z', files: [{ file: 'tests/a.test.mjs', ms: 1, tests: 1, failed: 0 }] },
      { at: '2026-10-14T11:00:00.000Z', files: [{ file: 'tests/a.test.mjs', ms: 1, tests: 1, failed: 0 }] }],
    [check('2026-10-14T11:01:00.000Z', 3, 't2', 0, true)])
  try {
    const { runs } = JSON.parse(read(dir, '--json').stdout)
    assert.equal(runs.length, 2)
    assert.equal(runs[0].check, null, 'no check window holds the first run')
    assert.equal(runs[1].check.contended, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a tree that went red and then green with nothing changed is counted, and a fix between them is not', () => {
  const dir = ledger([], [
    check('2026-10-14T10:00:00.000Z', 4, 'same', 1), check('2026-10-14T10:10:00.000Z', 4, 'same', 0),
    check('2026-10-14T11:00:00.000Z', 4, 'old', 1), check('2026-10-14T11:10:00.000Z', 4, 'fixed', 0),
  ])
  try {
    const { flaky } = JSON.parse(read(dir, '--json').stdout)
    assert.equal(flaky.redThenGreen, 1, 'only the unchanged tree')
    assert.equal(flaky.checks, 4)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a ledger is summarised per command: runs, passes, pass times, contention and red then green', () => {
  const checks = [
    check('2026-10-14T10:00:00.000Z', 2, 't1', 0), check('2026-10-14T10:10:00.000Z', 4, 't2', 0, true),
    check('2026-10-14T10:20:00.000Z', 6, 't3', 1), check('2026-10-14T10:30:00.000Z', 8, 't3', 0),
    { ...check('2026-10-14T11:00:00.000Z', 1, 'f1', 0), command: 'node --test fast' },
  ]
  const [full, fast] = summarize(checks)
  assert.equal(full.command, 'bash scripts/selftest.sh')
  assert.deepEqual({ runs: full.runs, passed: full.passed, contended: full.contended, redThenGreen: full.redThenGreen },
    { runs: 4, passed: 3, contended: 1, redThenGreen: 1 })
  assert.equal(full.medianPassMs, 4 * 60_000, 'the failed run is not a pass time')
  assert.equal(full.p90PassMs, 8 * 60_000)
  assert.deepEqual({ command: fast.command, runs: fast.runs }, { command: 'node --test fast', runs: 1 })
  // CLEAN twin: a ledger with no pass says so rather than a time.
  assert.equal(summarize([check('2026-10-14T10:00:00.000Z', 2, 't', 1)])[0].medianPassMs, null)
  const dir = ledger([], checks)
  try {
    const out = read(dir, '--summary')
    assert.equal(out.status, 0, out.stderr)
    assert.match(out.stdout, /^checks\.jsonl: 4 runs, 3 passed; pass median 240\.0 s/m)
    assert.match(out.stdout, /^fast-checks\.jsonl: no checks recorded$/m)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
