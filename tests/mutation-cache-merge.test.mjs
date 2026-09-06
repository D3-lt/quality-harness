import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { merge, readReport, run } from '../scripts/mutation-cache-merge.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RED = (label, ms = 1000) => ({ verdict: 'RED', sha: 'abc1234', label, ms })

/**
 * One shard's file as `scripts/mutate.mjs` writes it: the whole prior cache with
 * this shard's own changes applied, plus the keys it claims to have measured.
 */
const report = (entries, measured, shard = null) => ({ path: `shard-${shard}`, entries, measured, shard })

/** A twelve-shard run over a prior cache holding `k1` and `k2`, both RED. */
function twelveShards({ measuredBy, apply }) {
  const prior = { k1: RED('one'), k2: RED('two') }
  return Array.from({ length: 12 }, (_, i) => {
    const shard = `${i + 1}/12`
    const entries = { ...prior }
    const measured = shard === measuredBy ? apply(entries) : []
    return report(entries, measured, shard)
  })
}

test('a GREEN deletion by one shard survives the other eleven carrying its stale RED', () => {
  // The defect this file exists for. Every shard loads the whole prior cache and
  // writes it back, so eleven of them still hold `k1: RED` that shard 3 just
  // deleted because its mutant went GREEN.
  const reports = twelveShards({
    measuredBy: '3/12',
    apply: entries => { delete entries.k1; return ['k1'] },
  })

  const merged = merge(reports, 12)
  assert.equal(merged.ok, true)
  assert.equal(merged.entries.k1, undefined, 'the deletion must win')
  assert.deepEqual(merged.entries.k2, RED('two'), 'a key nobody measured keeps its prior value')
  assert.equal(merged.deleted, 1)

  // THE FALSIFIER, in the same test: a naive union over the same reports gives
  // the opposite answer, so the assertion above is not vacuous.
  const union = reports.reduce((all, r) => ({ ...all, ...r.entries }), {})
  assert.deepEqual(union.k1, RED('one'),
    'a union resurrects the deleted key — that is the whole reason for `measured`')
})

test('a re-measured RED replaces the prior one, and its timing comes with it', () => {
  const merged = merge(twelveShards({
    measuredBy: '7/12',
    apply: entries => { entries.k2 = RED('two', 41_000); return ['k2'] },
  }), 12)

  assert.equal(merged.ok, true)
  assert.equal(merged.entries.k2.ms, 41_000, 'the fresh timing is what §106 balances the next run by')
  assert.deepEqual(merged.entries.k1, RED('one'))
})

test('a shard that never reported refuses the merge instead of freezing its keys', () => {
  // A campaign killed at the 25-minute wall writes no file. Under a merge that
  // just took what it got, that shard's keys would carry no `measured` claim
  // from anyone, so a mutant that went GREEN would stay RED in the cache for
  // ever. Eleven reports for a twelve-shard run is not a smaller merge.
  const eleven = twelveShards({ measuredBy: '3/12', apply: e => { delete e.k1; return ['k1'] } }).slice(0, 11)

  const refused = merge(eleven, 12)
  assert.equal(refused.ok, false)
  assert.match(refused.reason, /11 shard report\(s\), expected 12/)

  // The same reports with an honest expectation merge cleanly, so the refusal is
  // about completeness and not about these eleven files.
  assert.equal(merge(eleven, 11).ok, true)
})

test('a report that cannot say what it measured is no report, not an empty one', () => {
  // A cache written before §148 has entries and no `measured`. Reading its
  // silence as "this shard measured nothing" is exactly the freeze above, so it
  // is unreadable rather than empty (ADR-005).
  const legacy = readReport('legacy.json', () => JSON.stringify({ version: 1, entries: { k1: RED('one') } }))
  assert.equal(legacy.error, 'no measured claim')

  const current = readReport('current.json',
    () => JSON.stringify({ version: 1, entries: { k1: RED('one') }, measured: [] }))
  assert.equal(current.error, undefined)
  assert.deepEqual(current.measured, [])

  assert.equal(readReport('gone.json', () => { throw new Error('ENOENT') }).error, 'unreadable')
  assert.equal(readReport('array.json', () => '[]').error, 'no entries')

  // And a merge containing one refuses rather than merging the eleven good ones.
  const reports = twelveShards({ measuredBy: '1/12', apply: () => [] })
  reports[4] = { path: 'shard-5/12', error: 'unreadable' }
  const refused = merge(reports, 12)
  assert.equal(refused.ok, false)
  assert.match(refused.reason, /1 unreadable shard report\(s\)/)
  assert.deepEqual(refused.failures.map(f => f.path), ['shard-5/12'])
})

test('when two shards measure one key, the deletion wins whichever order they arrive in', () => {
  // Two catalogue entries whose file, from, to, only and test bytes are all
  // identical share a cache key, so this needs no bug to reach.
  const keeps = report({ k1: RED('one') }, ['k1'], 'a')
  const drops = report({}, ['k1'], 'b')

  for (const order of [[keeps, drops], [drops, keeps]]) {
    const merged = merge(order, 2)
    assert.equal(merged.ok, true)
    assert.equal(merged.entries.k1, undefined,
      'a RED that some shard refused to confirm is never the answer')
    assert.equal(merged.deleted, 1)
  }
})

test('the CLI writes only when the merge held, and says which it did', () => {
  const good = twelveShards({ measuredBy: '2/12', apply: e => { delete e.k1; return ['k1'] } })
  const read = p => JSON.stringify(good[Number(p.split('-')[1]) - 1])
  const paths = good.map((_, i) => `shard-${i + 1}`)

  const written = []
  const said = []
  const code = run(['--out', 'merged.json', ...paths],
    { read, write: (f, c) => written.push([f, c]), log: m => said.push(m) })

  assert.equal(code, 0)
  assert.equal(written.length, 1)
  const [file, contents] = written[0]
  assert.equal(file, 'merged.json')
  const parsed = JSON.parse(contents)
  assert.equal(parsed.version, 1)
  assert.equal(parsed.entries.k1, undefined)
  assert.equal(parsed.measured, undefined, 'a merged cache is a cache, not a report')
  assert.match(said.join('\n'), /1 key\(s\) measured this run, 1 deleted/)

  // DIRTY, in the same test: one path short of --expect writes NOTHING, so the
  // previous cache stands rather than being replaced by a partial one.
  const refusedWrites = []
  const refusedSaid = []
  const refusedCode = run(['--out', 'merged.json', '--expect', '12', ...paths.slice(0, 11)],
    { read, write: (f, c) => refusedWrites.push([f, c]), log: m => refusedSaid.push(m) })

  assert.equal(refusedCode, 1)
  assert.deepEqual(refusedWrites, [], 'a refusal must not leave a half-merged cache behind')
  assert.match(refusedSaid.join('\n'), /REFUSED/)
})

test('the CLI refuses a call it cannot understand rather than guessing an output path', () => {
  const said = []
  const opts = { read: () => '{}', write: () => { throw new Error('must not write') }, log: m => said.push(m) }

  assert.equal(run([], opts), 2)
  assert.equal(run(['--out'], opts), 2)
  assert.equal(run(['--out', 'merged.json'], opts), 2, 'no shard files named')
  assert.equal(run(['--out', 'merged.json', '--expect', 'twelve', 'shard-1'], opts), 2)
  assert.match(said.join('\n'), /usage: mutation-cache-merge/)
})

test('the runner records what it MEASURED, and records nothing when it reused', () => {
  // The merge is only as good as the claim it merges, and `measured` is written
  // inside main() where no unit test reaches it. So drive the real campaign over
  // the cheapest entry in the catalogue and read the file it leaves.
  const CHEAPEST = 'the post-edit check acts only on the edit tools'
  const runner = join(repoRoot, 'scripts', 'mutate.mjs')
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-cache-'))
  const cache = join(dir, 'cache.json')
  const call = () => spawnSync(process.execPath,
    [runner, '--case', CHEAPEST, '--cache', cache, '--shard', '1/1'],
    { cwd: repoRoot, env: { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: join(dir, 'lock') },
      encoding: 'utf8', timeout: 120_000 })

  const first = call()
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const measured = JSON.parse(readFileSync(cache, 'utf8'))
  assert.equal(measured.shard, '1/1', 'the file says which slice took these measurements')
  assert.equal(measured.measured.length, 1, 'one entry ran, so one key was measured')
  assert.equal(Object.keys(measured.entries).length, 1)
  assert.deepEqual(measured.measured, Object.keys(measured.entries),
    'the measured key is the one it wrote a RED for')

  // DIRTY, in the same test: run it again against the cache it just wrote. The
  // verdict is REUSED, not taken — so `measured` must be EMPTY while `entries`
  // still holds the key. A `measured` that just echoed the file's own keys would
  // pass the assertions above and fail here, and it is what makes a merge able
  // to tell a deletion from a shard that never looked.
  const second = call()
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.match(second.stdout, /reused a RED verdict/)
  const reused = JSON.parse(readFileSync(cache, 'utf8'))
  assert.deepEqual(reused.measured, [], 'a reused verdict is not a measurement')
  assert.deepEqual(Object.keys(reused.entries), Object.keys(measured.entries),
    'and the key it did not measure is still carried, untouched')
})
