// Stage 1 of the plan to make the check fast (BACKLOG §378): the order the gate runs its test files in, from the last run's own
// per-file times. Failed first, then unmeasured, then longest first, and always the same files.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { latestTimes, order } from '../scripts/test-order.mjs'
import { testBash } from './helpers/bash.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const row = files => ({ at: '2026-10-14T10:00:00.000Z', files })

test('a failed file runs first, an unmeasured one next, and the rest longest first', () => {
  const times = row([
    { file: 'a', ms: 5, failed: 0 }, { file: 'b', ms: 50, failed: 0 }, { file: 'c', ms: 1, failed: 1 }, { file: 'd', ms: 50, failed: 0 },
  ])
  assert.deepEqual(order(['a', 'b', 'c', 'd', 'new'], times), ['c', 'new', 'b', 'd', 'a'], 'ties keep the order given')
  // CLEAN twin: with no times the order given is kept.
  assert.deepEqual(order(['a', 'b', 'c'], null), ['a', 'b', 'c'])
})

test('the order is always the same files, whatever the times name', () => {
  const times = row([{ file: 'gone', ms: 999, failed: 1 }, { file: 'a', ms: 1, failed: 0 }])
  const given = ['a', 'b', 'c']
  const got = order(given, times)
  assert.deepEqual([...got].sort(), given, 'a file the times name but nobody gave is not added, and none is dropped')
})

test('the latest row that names a file is the one read, and an unreadable line is passed over', () => {
  const text = [JSON.stringify(row([{ file: 'old', ms: 1, failed: 0 }])), JSON.stringify(row([{ file: 'new', ms: 1, failed: 0 }])), '{torn', JSON.stringify({ files: [] })].join('\n')
  assert.deepEqual(latestTimes(text).files.map(entry => entry.file), ['new'])
  assert.equal(latestTimes(''), null)
  assert.equal(latestTimes('{torn'), null)
})

test('the script reorders real paths by their names inside the root, and keeps the order given with no times', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-test-order-'))
  try {
    const times = path.join(dir, 'times.jsonl')
    writeFileSync(times, `${JSON.stringify(row([{ file: 'tests/a.test.mjs', ms: 1, failed: 0 }, { file: 'tests/b.test.mjs', ms: 90, failed: 0 }]))}\n`)
    const files = [path.join(dir, 'tests', 'a.test.mjs'), path.join(dir, 'tests', 'b.test.mjs')]
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'test-order.mjs'), times, dir, ...files], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(run.stdout.trim().split('\n'), ['order: times', files[1], files[0]])
    const none = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'test-order.mjs'), path.join(dir, 'missing.jsonl'), dir, ...files], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(none.status, 0)
    assert.deepEqual(none.stdout.trim().split('\n'), ['order: given', ...files], 'the order given, and said as given')
    assert.match(none.stderr, /no per-file times yet/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the gate runs its files in that order, and in glob order when it cannot', () => {
  const bash = testBash()
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-test-order-gate-'))
  const dry = env => spawnSync(bash, [path.join(repoRoot, 'scripts', 'selftest.sh')], { encoding: 'utf8', timeout: 60_000, windowsHide: true,
    env: { ...process.env, QH_SELFTEST_DRY: '1', QH_SELFTEST_ORDER: '', ...env } })
  const first = run => {
    assert.equal(run.status, 0, run.stdout + run.stderr)
    return run.stdout.match(/^selftest: test files run (.*); first: (.*)$/m)
  }
  try {
    const times = path.join(dir, 'times.jsonl')
    writeFileSync(times, `${JSON.stringify(row([
      { file: 'tests/test-order.test.mjs', ms: 999_999, failed: 0 }, { file: 'tests/check-timing.test.mjs', ms: 1, failed: 1 },
    ]))}\n`)
    const ordered = first(dry({ QH_SELFTEST_TIMES: times }))
    assert.match(ordered[1], /^failed first/)
    assert.equal(ordered[2], 'check-timing.test.mjs', 'the file that failed runs first')
    // DIRTY twins: an override, and times that cannot be read, both keep the glob's order and say why.
    const glob = first(dry({ QH_SELFTEST_TIMES: times, QH_SELFTEST_ORDER: 'glob' }))
    assert.match(glob[1], /QH_SELFTEST_ORDER=glob/)
    writeFileSync(times, '{torn\n')
    const unreadable = first(dry({ QH_SELFTEST_TIMES: times }))
    assert.match(unreadable[1], /^in glob order/)
    assert.equal(unreadable[2], glob[2], 'the same first file as the glob')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
