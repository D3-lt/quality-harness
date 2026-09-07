import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
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

  // The same eleven RELABELLED as a complete eleven-shard run merge cleanly, so
  // the refusal is about completeness and not about these eleven files.
  const relabelled = eleven.map((r, i) => ({ ...r, shard: `${i + 1}/11` }))
  assert.equal(merge(relabelled, 11).ok, true)
})

test('twelve reports are not twelve shards when one identity appears twice', () => {
  // A count is not completeness. If `2/12` arrives twice and `3/12` never does,
  // the count check passes and shard 3's deletions simply never happen — a stale
  // RED survives a mutant that went GREEN, which is the whole failure this file
  // exists to prevent, reached by a route the count cannot see.
  const twelve = twelveShards({ measuredBy: '3/12', apply: e => { delete e.k1; return ['k1'] } })
  const duplicated = twelve.map(r => (r.shard === '3/12' ? { ...r, shard: '2/12' } : r))

  const refused = merge(duplicated, 12)
  assert.equal(refused.ok, false)
  assert.match(refused.reason, /shard identities are not exactly 1\.\.12/)
  assert.match(refused.reason, /2\/12 x2/)
  assert.match(refused.reason, /3\/12 x0/)

  // CLEAN, in the same test: the untouched twelve merge, so the refusal is about
  // the identities and not about these reports.
  assert.equal(merge(twelve, 12).ok, true)
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
  const keeps = report({ k1: RED('one') }, ['k1'], '1/2')
  const drops = report({}, ['k1'], '2/2')

  for (const order of [[keeps, drops], [drops, keeps]]) {
    // Reversed, the identities are still exactly 1/2 and 2/2 — order is what is
    // under test here, not completeness.
    const merged = merge(order, 2)
    assert.equal(merged.ok, true)
    assert.equal(merged.entries.k1, undefined,
      'a RED that some shard refused to confirm is never the answer')
    assert.equal(merged.deleted, 1)
  }
})

test('the CLI writes only when the merge held, and the workflow call is the one under test', () => {
  const good = twelveShards({ measuredBy: '2/12', apply: e => { delete e.k1; return ['k1'] } })
  const readPaths = []
  const read = p => { readPaths.push(p); return JSON.stringify(good[Number(p.split('-')[1]) - 1]) }
  const paths = good.map((_, i) => `shard-${i + 1}`)

  // ⚠ EXACTLY THE ARGUMENTS THE WORKFLOW PASSES, `--expect 12` included. Written
  // without it, this test passed while the real invocation refused every time:
  // the operand `12` was collected as a thirteenth report path. A CLI regression
  // belongs at the boundary the caller actually uses (CLAUDE.md §4).
  const written = []
  const said = []
  const code = run(['--out', 'merged.json', '--expect', '12', ...paths],
    { read, write: (f, c) => written.push([f, c]), log: m => said.push(m) })

  assert.equal(code, 0, said.join('\n'))
  assert.equal(written.length, 1)
  const [file, contents] = written[0]
  assert.equal(file, 'merged.json')
  const parsed = JSON.parse(contents)
  assert.equal(parsed.version, 1)
  assert.equal(parsed.entries.k1, undefined)
  assert.equal(parsed.measured, undefined, 'a merged cache is a cache, not a report')
  assert.match(said.join('\n'), /1 key\(s\) measured this run, 1 deleted/)
  assert.deepEqual(readPaths, paths, 'an option operand must never be read as a report')

  // DIRTY, in the same test: one report short writes NOTHING, and the reason
  // must be the COUNT. Asserting only /REFUSED/ is what let the defect above
  // through — eleven files plus a stray `12` is also twelve paths, one of them
  // unreadable, which refuses for an entirely different reason.
  const refusedWrites = []
  const refusedSaid = []
  const refusedCode = run(['--out', 'merged.json', '--expect', '12', ...paths.slice(0, 11)],
    { read, write: (f, c) => refusedWrites.push([f, c]), log: m => refusedSaid.push(m) })

  assert.equal(refusedCode, 1)
  assert.deepEqual(refusedWrites, [], 'a refusal must not leave a half-merged cache behind')
  assert.match(refusedSaid.join('\n'), /REFUSED — 11 shard report\(s\), expected 12/)
  assert.doesNotMatch(refusedSaid.join('\n'), /unreadable/,
    'the count is the reason; an operand read as a path would say unreadable instead')
})

test('the CLI refuses a call it cannot understand rather than guessing an output path', () => {
  const said = []
  const opts = { read: () => '{}', write: () => { throw new Error('must not write') }, log: m => said.push(m) }

  assert.equal(run([], opts), 2)
  assert.equal(run(['--out'], opts), 2, 'a flag with no operand')
  assert.equal(run(['--out', 'merged.json'], opts), 2, 'no shard files named')
  assert.equal(run(['--out', 'merged.json', '--expect'], opts), 2, '--expect with no operand')
  assert.equal(run(['--out', 'merged.json', '--expect', 'twelve', 'shard-1'], opts), 2)
  // An option nobody implemented must be named, never silently ignored: ignoring
  // one is how a caller gets a different measurement than the one they asked for
  // (the --filter/--case lesson in scripts/mutate.mjs).
  assert.equal(run(['--out', 'merged.json', '--strict', 'shard-1'], opts), 2)
  assert.match(said.join('\n'), /unknown option: --strict/)
  assert.match(said.join('\n'), /usage: mutation-cache-merge/)
})

test('the runner records what it MEASURED, and records nothing when it reused', t => {
  // Exercise the real runner on a disposable copy: mutating this checkout
  // refuses legitimate uncommitted edits and races other tests reading the hook.
  const CHEAPEST = 'the post-edit check acts only on the edit tools'
  const dir = realpathSync(mkdtempSync(join(os.tmpdir(), 'qh-cache-')))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))
  for (const file of ['scripts/mutate.mjs', 'tests/mutations.json',
    'tests/post-edit-check.test.mjs', 'plugin/scripts/post-edit-check.sh',
    'plugin/scripts/workflow-parse.mjs']) {
    const target = join(dir, file)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(repoRoot, file), target)
  }
  const runner = join(dir, 'scripts', 'mutate.mjs')
  const cache = join(dir, 'cache.json')
  const call = () => spawnSync(process.execPath,
    [runner, '--case', CHEAPEST, '--cache', cache, '--shard', '1/1'],
    { cwd: dir, env: { ...process.env, CLAUDE_PLUGIN_ROOT: join(dir, 'plugin'), QUALITY_HARNESS_MUTATE_LOCK: join(dir, 'lock') },
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
