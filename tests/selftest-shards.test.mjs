// ADR-139 T4: the Windows selftest runs as three shards and a fan-in. A shard runs its slice of the ordered test files and keeps
// its per-file row; the fan-in merges the rows into one (scripts/merge-rows.mjs) and hands it to suite-accounting, which reads
// one row, the file's last line (scripts/suite-accounting.mjs:89): concatenated rows would count only the last shard. A shard
// unsets its variables before its tests start, since a test that runs selftest.sh itself (tests/package.test.mjs:1108, locked)
// must run it whole.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { mergeRows } from '../scripts/merge-rows.mjs'
import { sliceFiles } from '../scripts/test-slice.mjs'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const collected = readdirSync(path.join(repoRoot, 'tests')).filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`)
const EXEMPT = new Set(['tests/publish-command.test.mjs', 'tests/publish-command.shard-1.test.mjs', 'tests/publish-command.shard-2.test.mjs'])
const dry = env => spawnSync(testBash(), [path.join(repoRoot, 'scripts', 'selftest.sh')],
  { cwd: repoRoot, env: { ...process.env, QH_SELFTEST_DRY: '1', QH_SELFTEST_ORDER: 'glob', ...env }, encoding: 'utf8', timeout: 120_000, windowsHide: true })

function shardRow(files, helperCases) {
  const entry = (file, cases) => ({ file, ms: 1, tests: cases, cases, failed: 0, skipped: 0, reasonless: [] })
  const rows = files.map(file => entry(file, EXEMPT.has(file) ? 0 : 1))
  if (helperCases) rows.push(entry('tests/helpers/shard.mjs', helperCases))
  return { at: '2026-11-04T00:00:00.000Z', concurrency: null, load: null, files: rows }
}

test('the Windows shards together reach every test file, and the merged row says when one did not', t => {
  const shard = dry({ QH_SELFTEST_SHARD: '2/3' })
  assert.equal(shard.status, 0, shard.stderr)
  const said = /^selftest: shard 2\/3 runs (\d+) of (\d+) files: (.*)$/m.exec(shard.stdout)
  assert.ok(said, shard.stdout)
  assert.deepEqual(said[3].split(' ').sort(), sliceFiles(collected, 2, 3).sort(), 'the slice T1 gives')
  assert.equal(Number(said[2]), collected.length)
  const whole = dry({})
  assert.equal(whole.status, 0, whole.stderr)
  assert.doesNotMatch(whole.stdout, /selftest: shard/, 'no variable, no shard')
  assert.equal(dry({ QH_SELFTEST_SHARD: '4/3' }).status, 2, 'a bad shard is refused')

  const merged = mergeRows([shardRow(['tests/a.test.mjs'], 1), shardRow(['tests/b.test.mjs'], 2)])
  assert.deepEqual(merged.files.find(entry => entry.file === 'tests/helpers/shard.mjs').cases, 3, 'one file in two shards sums')
  assert.equal(merged.files.length, 3)
  assert.throws(() => mergeRows([{ files: 'nope' }]), /row/, 'an unreadable row is refused')

  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-selftest-shards-'))
  t.after(() => remove(scratch))
  const rows = [1, 2, 3].map(i => {
    const file = path.join(scratch, `rows-${i}.jsonl`)
    writeFileSync(file, `{"at":"earlier","files":[]}\n${JSON.stringify(shardRow(sliceFiles(collected, i, 3), i === 1 ? 2 : 0))}\n`)
    return file
  })
  const account = files => {
    const out = path.join(scratch, 'merged.jsonl')
    const merge = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'merge-rows.mjs'), '--out', out, ...files], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(merge.status, 0, merge.stderr)
    return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'suite-accounting.mjs'), '--row', out], { cwd: repoRoot, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  }
  const all = account(rows)
  assert.equal(all.status, 0, `${all.stdout}\n${all.stderr}`)
  const two = account(rows.slice(0, 2))
  assert.equal(two.status, 1, 'a shard that left no row leaves files unrun')
  assert.match(two.stdout + two.stderr, new RegExp(sliceFiles(collected, 3, 3)[0].replace(/[.]/g, '\\.')))
})

test('a selftest started inside a shard runs whole', () => {
  const shard = dry({ QH_SELFTEST_SHARD: '1/3', QH_SELFTEST_ROWS_OUT: 'rows.jsonl' })
  assert.equal(shard.status, 0, shard.stderr)
  assert.match(shard.stdout, /^selftest: shard variables its tests inherit: none$/m, 'unset before any test starts')
})
