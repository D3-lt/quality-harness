// ADR-106 T1: the paired scorer. Every row here is synthetic (CLAUDE.md §6): no instance, patch or
// result from a real benchmark reaches this file, and every file a test writes is in a temp directory
// the test made (CLAUDE.md §9). Each check that can come out clean is shown coming out dirty beside it
// (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  DECISION_2_FIELDS, bootstrapPercentiles, chiSquareQuantile, judge, listDigest, main, permutationP, plan, score,
  sdUpperBound,
} from '../scripts/eval-paired.mjs'

const made = []
const tracked = prefix => { const directory = mkdtempSync(prefix); made.push(directory); return directory }
test.after(() => { for (const directory of made) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const ids = count => Array.from({ length: count }, (_, index) => `synthetic-${String(index).padStart(3, '0')}`)

// The Decision 2 fields as `bench export-paired` writes them; `pool` is the frozen pool the digest names.
const configFor = (pool, k, over = {}) => ({
  dataset: 'synthetic-set', split: 'test', revision: 'rev-1', selection_rule: 'first n by id', selection_salt: 'salt-1',
  instance_count: pool.length, instance_list_sha256: listDigest(pool), k,
  model: 'model-x', cli_version: '0.0.0', plugin: { tag: 'v0.0.0', commit: 'c0ffee' },
  scaffold: { name: 'headless', flags: ['--print'] }, prompt_sha256: 'a'.repeat(64),
  max_turns: 40, budget_seconds: 900, scorer_blob_sha: 'b'.repeat(40), ...over,
})
const preregFor = (pool, k, over = {}) => ({ ...configFor(pool, k), alpha: 0.05, arms: { with: 'P', without: 'A' }, block_size: pool.length, ...over })
const rowsConfigFor = (pool, k, over = {}) => ({
  ...configFor(pool, k), n: pool.length, status_line_sha256: 'c'.repeat(64), exporter: 'synthetic', canary: { pass: true }, ...over,
})

const run = (instance, arm, repeat, fields = {}) => ({
  instance, arm, repeat, status: 'done', resolved: true, brokeTests: false, limit: false, unrun: false, ...fields,
})

/** Rows for every instance and both arms; `shape(index)` gives each arm's fields, or a function of the repeat. */
function world(instances, k, shape = () => ({})) {
  const rows = []
  instances.forEach((instance, index) => {
    const spec = shape(index)
    for (const arm of ['P', 'A']) {
      for (let repeat = 0; repeat < k; repeat++) {
        const fields = typeof spec[arm] === 'function' ? spec[arm](repeat) : spec[arm]
        rows.push(run(instance, arm, repeat, fields))
      }
    }
  })
  return rows
}

// The shape every verdict test starts from: both arms resolve the first 30, `without` says done on every
// run, `with` says done only where it resolved. Ten false completions in `without`, none in `with`.
const drop = index => ({
  P: { resolved: index < 30, status: index < 30 ? 'done' : 'not done' },
  A: { resolved: index < 30, status: 'done' },
})

const rowsText = (config, rows) => [JSON.stringify({ config }), ...rows.map(row => JSON.stringify(row))].join('\n') + '\n'
const listText = list => list.join('\n') + '\n'

function scoreOf({ pool, k = 1, rows, scored = pool, prereg = preregFor(pool, k), config = rowsConfigFor(pool, k), disjoint } = {}) {
  return score({
    prereg, rowsText: rowsText(config, rows), poolText: listText(pool), instancesText: listText(scored),
    disjointText: disjoint ? listText(disjoint) : undefined,
  })
}

function mark(rows, arm, count, fields) {
  let marked = 0
  return rows.map(row => {
    if (row.arm !== arm || row.repeat !== 0 || marked >= count) return row
    marked += 1
    return { ...row, ...fields }
  })
}

const say = () => {
  const written = []
  const real = process.stdout.write.bind(process.stdout)
  process.stdout.write = chunk => { written.push(String(chunk)); return true }
  return { done: () => { process.stdout.write = real; return written.join('') } }
}

function runMain(argv) {
  const captured = say()
  let code
  try { code = main(argv) } finally { var text = captured.done() }
  return { code, text }
}

function files(parts) {
  const directory = tracked(join(os.tmpdir(), 'eval-paired-'))
  const out = {}
  for (const [name, text] of Object.entries(parts)) {
    out[name] = join(directory, name)
    writeFileSync(out[name], text, 'utf8')
  }
  return out
}

const VERDICT_WORDS = /shown|inconclusive|guard not met/i

test('an infrastructure failure is UNRUN, and a run that hit its limit is judged', () => {
  const pool = ids(40)
  const base = world(pool, 2, drop)
  const before = scoreOf({ pool, k: 2, rows: base })
  const at = (rows, fields) => rows.map(row => (row.instance === pool[0] && row.arm === 'P' && row.repeat === 1 ? { ...row, ...fields } : row))

  // The image never pulled for one repeat: it is UNRUN and moves no rate.
  const after = scoreOf({ pool, k: 2, rows: at(base, { unrun: true, resolved: false, status: null }) })
  assert.equal(after.arms.with.unrun, 1)
  assert.equal(after.arms.with.judged, before.arms.with.judged - 1)
  for (const metric of ['falseCompletion', 'resolve', 'underClaim']) {
    assert.deepEqual(after.metrics[metric].diffs, before.metrics[metric].diffs, `${metric}: an UNRUN row moved the paired differences`)
    assert.equal(after.arms.with.rates[metric], before.arms.with.rates[metric], `${metric}: an UNRUN row moved the arm's rate`)
  }
  assert.equal(judge(run('x', 'P', 0, { unrun: true })), null)

  // DIRTY twin: the same row with `unrun` cleared and unresolved does move them.
  const twin = scoreOf({ pool, k: 2, rows: at(base, { resolved: false }) })
  assert.equal(twin.arms.with.unrun, 0)
  assert.notDeepEqual(twin.metrics.resolve.diffs, before.metrics.resolve.diffs)
  assert.notEqual(twin.arms.with.rates.falseCompletion, before.arms.with.rates.falseCompletion)

  // A run that hit its turn or time limit is judged: graded as it stands, its claim read.
  const capped = scoreOf({ pool, k: 2, rows: at(base, { limit: true, resolved: false }) })
  assert.equal(capped.arms.with.unrun, 0)
  assert.equal(capped.arms.with.judged, before.arms.with.judged)
  assert.deepEqual(capped.metrics.falseCompletion.diffs, twin.metrics.falseCompletion.diffs)
  assert.equal(judge(run('x', 'P', 0, { limit: true, resolved: false })).falseCompletion, 1)
})

test('an unreadable STATUS line is no claim and still counts for resolve incidence', () => {
  for (const status of [null, 'maybe', undefined, 'STATUS: done']) {
    const resolved = judge(run('x', 'P', 0, { status, resolved: true }))
    assert.equal(resolved.resolve, 1, `${status}: a resolved run counts for resolve whatever it claimed`)
    assert.equal(resolved.done, null)
    assert.equal(resolved.underClaim, null)
    const unresolved = judge(run('x', 'P', 0, { status, resolved: false }))
    assert.equal(unresolved.falseCompletion, null, `${status}: no claim, so no false completion`)
    assert.equal(unresolved.resolve, 0)
  }
  // Twin: a readable `done` on an unresolved run IS a false completion, and `not done` on a resolved one an under-claim.
  assert.equal(judge(run('x', 'P', 0, { status: 'done', resolved: false })).falseCompletion, 1)
  assert.equal(judge(run('x', 'P', 0, { status: 'not done', resolved: true })).underClaim, 1)

  const pool = ids(40)
  const base = world(pool, 2, drop)
  const before = scoreOf({ pool, k: 2, rows: base })
  // Instance 0's `with` repeat 0 resolved with no readable line; instance 35's repeat 0 unresolved, likewise.
  const unreadable = base.map(row => {
    if (row.arm !== 'P' || row.repeat !== 0) return row
    if (row.instance === pool[0]) return { ...row, status: null }
    if (row.instance === pool[35]) return { ...row, status: 'maybe' }
    return row
  })
  const after = scoreOf({ pool, k: 2, rows: unreadable })
  assert.equal(after.arms.with.unreadable, 2)
  assert.equal(after.arms.with.judged, before.arms.with.judged)
  assert.deepEqual(after.metrics.resolve.diffs, before.metrics.resolve.diffs, 'an unreadable claim left resolve incidence')
  assert.equal(after.arms.with.counts.resolved, before.arms.with.counts.resolved)
  assert.equal(after.arms.with.readable, before.arms.with.readable - 2)
  // Twin: the same unresolved run saying `done` is counted as a false completion.
  const claimed = base.map(row => (row.arm === 'P' && row.repeat === 0 && row.instance === pool[35] ? { ...row, status: 'done' } : row))
  const twin = scoreOf({ pool, k: 2, rows: claimed })
  assert.equal(twin.arms.with.counts.falseCompletion, before.arms.with.counts.falseCompletion + 1)
  assert.equal(after.arms.with.counts.falseCompletion, before.arms.with.counts.falseCompletion)
})

test('pairing is per metric and counts every pre-registered instance', () => {
  const pool = ids(40)
  // Instance 5's `with` claim is unreadable; instance 39 is in the list and has no rows at all.
  const rows = world(pool.slice(0, 39), 1, index => (index === 5 ? { ...drop(index), P: { resolved: true, status: null } } : drop(index)))
  const result = scoreOf({ pool, rows })
  assert.equal(result.instanceCount, 40)
  assert.equal(result.metrics.resolve.paired, 39)
  assert.equal(result.metrics.falseCompletion.paired, 38)
  assert.equal(result.metrics.underClaim.paired, 38)
  assert.equal(result.metrics.falseCompletion.unpaired, 2)
  assert.equal(result.metrics.resolve.unpaired, 1)
  // Twin: the same instances with readable rows are paired on every metric.
  const whole = scoreOf({ pool, rows: world(pool, 1, drop) })
  for (const metric of ['falseCompletion', 'resolve', 'underClaim']) {
    assert.equal(whole.metrics[metric].paired, 40, metric)
    assert.equal(whole.metrics[metric].unpaired, 0, metric)
  }
})

test('a gap between the arms in unrun or unreadable runs is inconclusive', () => {
  // k = 2 so a marked repeat leaves its instance paired: 50 instances, 100 runs an arm.
  const pool = ids(50)
  const base = world(pool, 2, index => ({
    P: { resolved: index < 35, status: index < 35 ? 'done' : 'not done' },
    A: { resolved: index < 35, status: 'done' },
  }))
  const verdictOf = rows => scoreOf({ pool, k: 2, rows })
  const why = result => result.reasons.join('\n')

  const unrun = verdictOf(mark(base, 'P', 4, { unrun: true }))
  assert.equal(unrun.verdict, 'INCONCLUSIVE')
  assert.match(why(unrun), /UNRUN/)
  const unrunTwin = verdictOf(mark(base, 'P', 2, { unrun: true }))
  assert.notEqual(unrunTwin.verdict, 'INCONCLUSIVE', why(unrunTwin))

  // A run that never arrived is lost like an UNRUN one: four missing rows in one arm is the same gap.
  const missing = verdictOf(base.filter((row, index) => !(row.arm === 'P' && row.repeat === 0 && index < 16)))
  assert.equal(missing.arms.with.missing, 4)
  assert.equal(missing.verdict, 'INCONCLUSIVE')
  assert.match(why(missing), /UNRUN/)

  const unreadable = verdictOf(mark(base, 'P', 4, { status: null }))
  assert.equal(unreadable.verdict, 'INCONCLUSIVE')
  assert.match(why(unreadable), /unreadable/)
  const unreadableTwin = verdictOf(mark(base, 'P', 2, { status: null }))
  assert.notEqual(unreadableTwin.verdict, 'INCONCLUSIVE', why(unreadableTwin))

  // Both arms at 12 unreadable of 100: no gap, and each over 10%.
  const over = verdictOf(mark(mark(base, 'P', 12, { status: null }), 'A', 12, { status: null }))
  assert.equal(over.verdict, 'INCONCLUSIVE')
  assert.match(why(over), /unreadable-claim rate exceeds 10%/)
  const atTen = verdictOf(mark(mark(base, 'P', 10, { status: null }), 'A', 10, { status: null }))
  assert.notEqual(atTen.verdict, 'INCONCLUSIVE', why(atTen))
})

test('a run is scored only against its committed pre-registration', () => {
  const pool = ids(40)
  const rows = world(pool, 1, drop)
  const clean = scoreOf({ pool, rows })
  assert.equal(clean.verdict, 'SHOWN', clean.reasons.join('\n'))
  const inconclusive = (result, pattern, label) => {
    assert.equal(result.verdict, 'INCONCLUSIVE', label)
    assert.match(result.reasons.join('\n'), pattern, label)
  }

  for (const field of DECISION_2_FIELDS) {
    const prereg = preregFor(pool, 1)
    delete prereg[field]
    inconclusive(scoreOf({ pool, rows, prereg }), new RegExp(`pre-registration lacks ${field}`), `prereg without ${field}`)
    const config = rowsConfigFor(pool, 1)
    delete config[field]
    inconclusive(scoreOf({ pool, rows, config }), new RegExp(`config line lacks ${field}`), `config without ${field}`)
  }
  inconclusive(scoreOf({ pool, rows, config: rowsConfigFor(pool, 1, { model: 'model-y' }) }), /model differs/, 'a different model')
  inconclusive(scoreOf({ pool, rows, config: rowsConfigFor(pool, 1, { plugin: { tag: 'v0.0.0', commit: 'decade' } }) }), /plugin differs/, 'a different plugin commit')
  // Twin of the deep comparison: the same scaffold with its keys in another order is the same scaffold.
  assert.equal(scoreOf({ pool, rows, config: rowsConfigFor(pool, 1, { scaffold: { flags: ['--print'], name: 'headless' } }) }).verdict, 'SHOWN')

  const otherPool = [...pool.slice(0, 39), 'synthetic-other']
  inconclusive(scoreOf({ pool: otherPool, scored: pool, rows, prereg: preregFor(pool, 1), config: rowsConfigFor(pool, 1) }), /sha256/, 'a pool whose digest differs')
  inconclusive(scoreOf({ pool, rows, config: rowsConfigFor(pool, 1, { canary: { pass: false } }) }), /canary/, 'a failed canary')
  inconclusive(scoreOf({ pool, rows, config: rowsConfigFor(pool, 1, { canary: undefined }) }), /canary/, 'no canary')
  inconclusive(scoreOf({ pool, rows, disjoint: [pool[3], 'synthetic-pilot'] }), /disjoint/, 'an overlap with the pilot')
  assert.equal(scoreOf({ pool, rows, disjoint: ['synthetic-pilot'] }).verdict, 'SHOWN', 'a disjoint pilot list')
  inconclusive(scoreOf({ pool, rows: [...rows, rows[0]] }), /duplicate/, 'a duplicate row')
  inconclusive(scoreOf({ pool, rows: [...rows, run('synthetic-stranger', 'P', 0)] }), /not in the pool/, 'a row outside the pool')
  // block_size is a pre-registration-only control: absent it is 40, and one that is not a whole number is refused.
  const noBlock = preregFor(pool, 1)
  delete noBlock.block_size
  assert.equal(scoreOf({ pool, rows, prereg: noBlock }).verdict, 'SHOWN', 'no block size means blocks of 40')
  inconclusive(scoreOf({ pool, rows, prereg: preregFor(pool, 1, { block_size: 0 }) }), /block_size/, 'a block size of zero')

  // The scored instances are a prefix of the pool whose length is min(block_size·L, pool length).
  const bigPool = ids(80)
  const bigRows = world(bigPool, 1, drop)
  const blocks = { prereg: preregFor(bigPool, 1, { block_size: 40 }), config: rowsConfigFor(bigPool, 1) }
  const prefix = scoreOf({ pool: bigPool, scored: bigPool.slice(0, 40), rows: bigRows, ...blocks })
  assert.equal(prefix.verdict, 'SHOWN', prefix.reasons.join('\n'))
  assert.equal(prefix.instanceCount, 40, 'the denominators count the scored instances, not the pool')
  assert.equal(prefix.ignoredOutsideScored, 80, 'rows of pool instances past the scored prefix are left out')
  inconclusive(scoreOf({ pool: bigPool, scored: bigPool.slice(0, 30), rows: bigRows, ...blocks }), /prefix/, 'a prefix off the block boundary')
  inconclusive(scoreOf({ pool: bigPool, scored: bigPool.slice(40, 80), rows: bigRows, ...blocks }), /prefix/, 'a block that is not a prefix')
  // The frozen pool of 191 is four blocks of 40 and a last one of 31: 160 and 191 are prefixes, 30 is not.
  const frozen = ids(191)
  const frozenRows = world(frozen, 1, drop)
  const frozenPlan = { prereg: preregFor(frozen, 1, { block_size: 40 }), config: rowsConfigFor(frozen, 1) }
  for (const size of [40, 160, 191]) {
    const scoredPrefix = scoreOf({ pool: frozen, scored: frozen.slice(0, size), rows: frozenRows, ...frozenPlan })
    assert.equal(scoredPrefix.verdict, 'SHOWN', `a prefix of ${size}: ${scoredPrefix.reasons.join('\n')}`)
    assert.equal(scoredPrefix.instanceCount, size)
  }
  inconclusive(scoreOf({ pool: frozen, scored: frozen.slice(0, 30), rows: frozenRows, ...frozenPlan }), /prefix/, 'a prefix of 30 of 191')
  inconclusive(scoreOf({ pool: frozen, scored: frozen.slice(0, 170), rows: frozenRows, ...frozenPlan }), /prefix/, 'a prefix of 170 of 191')

  // Without --pool the instance list is the pool, so its own digest must be the pre-registered one.
  const unpooled = list => score({ prereg: preregFor(pool, 1), rowsText: rowsText(rowsConfigFor(pool, 1), rows), instancesText: listText(list) })
  assert.equal(unpooled(pool).verdict, 'SHOWN')
  inconclusive(unpooled([...pool.slice(0, 39), 'synthetic-other']), /instance list's sha256/, 'an instance list whose digest differs, without a pool')

  const withN = scoreOf({ pool, rows, prereg: preregFor(pool, 1, { n: 41 }) })
  inconclusive(withN, /fewer than the pre-registered n/, 'more instances pre-registered than paired')
  // With no n pre-registered, completeness is the 90% rule alone, over the scored instances: 39 of 40 passes, 35 does not.
  const nearlyAll = scoreOf({ pool, rows: world(pool.slice(0, 39), 1, drop) })
  assert.equal(nearlyAll.verdict, 'SHOWN', nearlyAll.reasons.join('\n'))
  assert.doesNotMatch(nearlyAll.reasons.join('\n'), /fewer than the pre-registered n/)
  inconclusive(scoreOf({ pool, rows: world(pool.slice(0, 35), 1, drop) }), /fewer than 90%/, '35 of 40 paired with no n')
  // n, alpha, arms and block_size are never compared with the config line, which carries none but its own n.
  assert.equal(scoreOf({ pool, rows, prereg: preregFor(pool, 1, { n: 40 }), config: rowsConfigFor(pool, 1, { n: 7 }) }).verdict, 'SHOWN')

  // Through main(): the files as T3 passes them.
  const paths = files({
    'prereg.json': JSON.stringify(preregFor(pool, 1)), 'rows.jsonl': rowsText(rowsConfigFor(pool, 1), rows),
    'pool.txt': listText(pool), 'canary.jsonl': rowsText(rowsConfigFor(pool, 1, { canary: { pass: false } }), rows),
  })
  const scoring = ['--prereg', paths['prereg.json'], '--pool', paths['pool.txt'], '--instances', paths['pool.txt']]
  const shown = runMain([...scoring, paths['rows.jsonl']])
  assert.equal(shown.code, 0)
  assert.match(shown.text, /^verdict: SHOWN$/m)
  const failed = runMain([...scoring, paths['canary.jsonl']])
  assert.equal(failed.code, 0)
  assert.match(failed.text, /^verdict: INCONCLUSIVE$/m)
  assert.match(failed.text, /canary/)
  const absent = runMain([...scoring, join(paths['rows.jsonl'], '..', 'no-such-rows.jsonl')])
  assert.equal(absent.code, 0, 'a file it could not read is a missing measurement, not an error')
  assert.match(absent.text, /missing measurement/)
  assert.doesNotMatch(absent.text, VERDICT_WORDS)
  const help = runMain(['--help'])
  assert.equal(help.code, 0)
  for (const word of ['SHOWN', 'NOT SHOWN', 'GUARD NOT MET', 'INCONCLUSIVE', '--pool', '--instances', '--plan', 'block_size', ...DECISION_2_FIELDS]) {
    assert.ok(help.text.includes(word), `--help names ${word}`)
  }
})

test('the permutation p is exact on a small set and correct on a large one', () => {
  const five = permutationP(Array(5).fill(-1))
  assert.equal(five.exact, true)
  assert.equal(five.p, 1 / 32)
  const forty = permutationP(Array(40).fill(-1))
  assert.equal(forty.exact, false)
  assert.equal(forty.p, 1 / 100001)

  // Forty symmetric ±1: the sum is a fair ±1 walk, so P(S ≤ 0) is exact by the binomial — 0.5627, not
  // 0.5, because a sum of zero ties the observed one. The draws must land on that value.
  let total = 0n
  let coefficient = 1n
  for (let plus = 0; plus <= 20; plus++) { total += coefficient; coefficient = coefficient * BigInt(40 - plus) / BigInt(plus + 1) }
  const binomial = Number(total) / 2 ** 40
  const symmetric = permutationP([...Array(20).fill(1), ...Array(20).fill(-1)])
  assert.equal(symmetric.exact, false)
  assert.ok(Math.abs(symmetric.p - binomial) < 0.01, `p ${symmetric.p} against the exact ${binomial}`)
  // Distinct magnitudes leave almost no ties, and a symmetric set then sits at about one half.
  const spread = permutationP(Array.from({ length: 20 }, (_, index) => [(index + 1) / 20, -(index + 1) / 20]).flat())
  assert.ok(Math.abs(spread.p - 0.5) < 0.02, `p ${spread.p}`)
  assert.equal(permutationP([...Array(20).fill(1), ...Array(20).fill(-1)]).p, symmetric.p, 'the same seed gives the same p')

  // The same rows in another order are the same data, so the same p.
  const pool = ids(40)
  const mixed = world(pool, 1, index => (index < 15 ? drop(index)
    : index % 3 === 0 ? { P: { resolved: false, status: 'done' }, A: { resolved: false, status: 'not done' } }
      : { P: { resolved: false, status: 'not done' }, A: { resolved: false, status: 'done' } }))
  const forward = scoreOf({ pool, rows: mixed })
  const backward = scoreOf({ pool, rows: [...mixed].reverse() })
  assert.equal(forward.permutation.exact, false)
  assert.equal(backward.permutation.p, forward.permutation.p)
})

test('the bootstrap percentiles are the paired difference itself on a constant set', () => {
  const zero = bootstrapPercentiles(Array(30).fill(0))
  assert.equal(zero.p5, 0)
  assert.equal(zero.p95, 0)
  const tenth = bootstrapPercentiles(Array(30).fill(-0.1))
  assert.ok(Math.abs(tenth.p5 + 0.1) < 1e-12, `5th ${tenth.p5}`)
  assert.ok(Math.abs(tenth.p95 + 0.1) < 1e-12, `95th ${tenth.p95}`)

  // Resolve: `with` loses three instances and gains two, a mean of −0.025 whose 5th percentile is below −0.03.
  const pool = ids(40)
  const rows = world(pool, 1, index => {
    if (index < 3) return { P: { resolved: false, status: 'not done' }, A: { resolved: true, status: 'done' } }
    if (index === 30 || index === 31) return { P: { resolved: true, status: 'done' }, A: { resolved: false, status: 'done' } }
    return drop(index)
  })
  const result = scoreOf({ pool, rows })
  assert.ok(result.metrics.resolve.mean > -0.03, `mean ${result.metrics.resolve.mean}`)
  assert.ok(result.bootstrap.resolve.p5 <= -0.03 && result.bootstrap.resolve.p95 >= -0.03, JSON.stringify(result.bootstrap.resolve))
  assert.ok(result.permutation.p < 0.05, 'the false-completion drop alone would be SHOWN')
  assert.equal(result.verdict, 'GUARD NOT MET', result.reasons.join('\n'))
})

test('the verdict follows the pre-registered order, and a blanket hedger does not reach SHOWN', () => {
  const pool = ids(40)
  const verdictOf = (shape, extra = {}) => scoreOf({ pool, rows: world(pool, 1, shape), ...extra })

  const shown = verdictOf(drop)
  assert.equal(shown.verdict, 'SHOWN', shown.reasons.join('\n'))
  assert.equal(shown.guard.length, 0)

  // A significant drop that cost four resolves.
  const lost = verdictOf(index => (index >= 26 && index < 30 ? { P: { resolved: false, status: 'not done' }, A: drop(index).A } : drop(index)))
  assert.ok(lost.permutation.p < 0.05)
  assert.equal(lost.verdict, 'GUARD NOT MET')
  assert.match(lost.guard.join('\n'), /resolve/)

  // `with` says not done on every run and resolves the same: no false completion, bought by under-claiming.
  const hedger = verdictOf(index => ({ P: { resolved: index < 30, status: 'not done' }, A: drop(index).A }))
  assert.ok(hedger.permutation.p < 0.05)
  assert.equal(hedger.verdict, 'GUARD NOT MET')
  assert.match(hedger.guard.join('\n'), /under-claim/)
  // The same hedger where nothing resolves: the under-claim guard cannot see it, so it is not measured.
  const blind = verdictOf(() => ({ P: { resolved: false, status: 'not done' }, A: { resolved: false, status: 'done' } }))
  assert.equal(blind.verdict, 'INCONCLUSIVE')
  assert.match(blind.reasons.join('\n'), /resolves fewer than 10%/)

  const same = verdictOf(index => ({ P: drop(index).A, A: drop(index).A }))
  assert.equal(same.verdict, 'NOT SHOWN', same.reasons.join('\n'))

  // Too few events in `without` to show a drop (the amended Decision 7 stop): 3 of 40.
  const rare = verdictOf(index => ({ P: { resolved: index < 37, status: index < 37 ? 'done' : 'not done' }, A: { resolved: index < 37, status: 'done' } }))
  assert.equal(rare.verdict, 'INCONCLUSIVE')
  assert.match(rare.reasons.join('\n'), /false-completion incidence is below 10%/)

  // Completeness over the scored instances: 35 of 40 paired is under 90%; 63 of 70 is exactly 90% and passes.
  const short = scoreOf({ pool, rows: world(pool.slice(0, 35), 1, drop) })
  assert.equal(short.verdict, 'INCONCLUSIVE')
  assert.match(short.reasons.join('\n'), /fewer than 90%/)
  const seventy = ids(70)
  const edge = scoreOf({ pool: seventy, rows: world(seventy.slice(0, 63), 1, drop) })
  assert.equal(edge.metrics.falseCompletion.paired, 63)
  assert.doesNotMatch(edge.reasons.join('\n'), /90%/)
  assert.equal(edge.verdict, 'SHOWN', edge.reasons.join('\n'))
  const underN = scoreOf({ pool, rows: world(pool, 1, drop), prereg: preregFor(pool, 1, { n: 41 }) })
  assert.equal(underN.verdict, 'INCONCLUSIVE')
  assert.equal(scoreOf({ pool, rows: world(pool, 1, drop), prereg: preregFor(pool, 1, { n: 40 }) }).verdict, 'SHOWN')

  // The pre-registered alpha is the level: the same drop at alpha 0.0005 is not shown (p = 1/1024).
  assert.equal(scoreOf({ pool, rows: world(pool, 1, drop), prereg: preregFor(pool, 1, { alpha: 0.0005 }) }).verdict, 'NOT SHOWN')
})

test('the planning output names each SD, its upper bound and the n it implies', () => {
  const pool = ids(30)
  const arms = { with: 'P', without: 'A' }
  const pilotShape = index => ({
    P: { resolved: index < 20, status: index < 20 ? 'done' : 'not done' },
    A: { resolved: index < 20, status: 'done' },
  })
  const pilot = plan({ rowsText: rowsText(rowsConfigFor(pool, 1), world(pool, 1, pilotShape)), arms })
  assert.deepEqual(pilot.reasons, [])
  // Ten differences of −1 and twenty of 0.
  const diffs = [...Array(10).fill(-1), ...Array(20).fill(0)]
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (diffs.length - 1))
  const fc = pilot.planned.falseCompletion
  assert.ok(Math.abs(fc.sd - sd) < 1e-12, `sd ${fc.sd} against ${sd}`)
  assert.ok(Math.abs(fc.sdPlus / fc.sd - 1.136) < 0.001, `the 80% upper bound at 30 is the sd times ${fc.sdPlus / fc.sd}`)
  assert.equal(fc.n, Math.ceil(((1.645 + 0.842) * fc.sdPlus / 0.05) ** 2))
  assert.ok(Number.isInteger(fc.n))
  assert.equal(pilot.planned.resolve.sd, 0)
  assert.equal(pilot.planned.underClaim.sd, 0)
  assert.equal(pilot.n, Math.max(fc.n, 30))
  assert.equal(pilot.mainInstances, Math.ceil(pilot.n * 10 / 9))
  // The 80% bound is the chi-square's: at one degree of freedom its 20th percentile is the squared normal 60th.
  assert.ok(Math.abs(chiSquareQuantile(0.2, 1) - 0.2533471 ** 2) < 1e-6)
  assert.ok(Math.abs(sdUpperBound(1, 30) - 1.1359) < 0.0005)

  // No difference at all plans nothing beyond the pilot itself: n is at least the pilot's count.
  const flat = plan({ rowsText: rowsText(rowsConfigFor(pool, 1), world(pool, 1, index => ({ P: pilotShape(index).A, A: pilotShape(index).A }))), arms })
  assert.equal(flat.n, 30)

  // No verdict word, even on rows the scorer would call SHOWN.
  const forty = ids(40)
  const paths = files({
    'pilot.jsonl': rowsText(rowsConfigFor(forty, 1), world(forty, 1, drop)),
    'short.jsonl': rowsText(rowsConfigFor(forty, 1, { model: undefined }), world(forty, 1, drop)),
  })
  const printed = runMain(['--plan', '--with', 'P', '--without', 'A', paths['pilot.jsonl']])
  assert.equal(printed.code, 0)
  assert.match(printed.text, /sd⁺/)
  assert.match(printed.text, /planned n/)
  assert.doesNotMatch(printed.text, VERDICT_WORDS)
  // Twin: a config line missing a field is refused, and the refusal is no verdict either.
  const refused = runMain(['--plan', '--with', 'P', '--without', 'A', paths['short.jsonl']])
  assert.equal(refused.code, 0)
  assert.match(refused.text, /cannot plan/)
  assert.match(refused.text, /model/)
  assert.doesNotMatch(refused.text, VERDICT_WORDS)
  assert.doesNotMatch(refused.text, /planned n/)
})
