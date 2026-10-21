// ADR-106 T1: the paired scorer. Every row here is synthetic (CLAUDE.md §6): no instance, patch or
// result from a real benchmark reaches this file, and every file a test writes is in a temp directory
// the test made (CLAUDE.md §9). Each check that can come out clean is shown coming out dirty beside it
// (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  DECISION_2_FIELDS, bootstrapPercentiles, chiSquareQuantile, judge, listDigest, main, permutationP, plan, score,
  REASON_CODES, sdUpperBound, strayKey, verdictFile, writeVerdict,
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

// A call with its stderr captured, for the refusals that speak there.
function quietly(call) {
  const err = []
  const real = process.stderr.write.bind(process.stderr)
  process.stderr.write = chunk => { err.push(String(chunk)); return true }
  let code
  try { code = call() } finally { process.stderr.write = real }
  return { code, err: err.join('') }
}

// Every leaf of a JSON object as a dotted path, sorted; a list is a leaf.
const leafPaths = (value, at = '') => Object.entries(value).flatMap(([key, inner]) => {
  const where = at ? `${at}.${key}` : key
  return inner !== null && typeof inner === 'object' && !Array.isArray(inner) ? leafPaths(inner, where) : [where]
}).sort()

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
  // The numeric controls are checked before any comparison or arithmetic (Codex review of PR #24): an object
  // that throws on its way to a primitive, a level outside (0, 1), a k that is not a positive whole count.
  const scoreFiles = (prereg, config = rowsConfigFor(pool, 1)) => {
    const written = files({ 'prereg.json': JSON.stringify(prereg), 'rows.jsonl': rowsText(config, rows), 'pool.txt': listText(pool) })
    return runMain(['--prereg', written['prereg.json'], '--pool', written['pool.txt'], '--instances', written['pool.txt'], written['rows.jsonl']])
  }
  const refusedControl = (printed, pattern, label) => {
    assert.equal(printed.code, 0, label)
    assert.match(printed.text, /^verdict: INCONCLUSIVE$/m, label)
    assert.match(printed.text, pattern, label)
  }
  for (const alpha of [{ toString: null }, 0, 1, -0.01, '0.05', null]) {
    refusedControl(scoreFiles(preregFor(pool, 1, { alpha })), /the pre-registered alpha .* is not a finite number between 0 and 1/, `alpha ${JSON.stringify(alpha)}`)
  }
  assert.match(scoreFiles(preregFor(pool, 1, { alpha: 0.999 })).text, /^verdict: SHOWN$/m, 'alpha just under 1')
  for (const k of [1.5, 0, -1, '1', { toString: null }]) {
    refusedControl(scoreFiles(preregFor(pool, 1, { k }), rowsConfigFor(pool, 1, { k })), /the pre-registered k .* is not a positive whole number/, `k ${JSON.stringify(k)} in both`)
  }
  assert.match(scoreFiles(preregFor(pool, 1, { k: 1 }), rowsConfigFor(pool, 1, { k: 1 })).text, /^verdict: SHOWN$/m, 'k 1 in both')
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

  // The floor reads the per-instance average (Decision 5), not pooled runs (Codex review of PR #24): 40
  // instances at k = 3, ten with one UNRUN repeat in each arm, and `without` false completions one each on
  // three-run instances. Eleven pool to 11 of 110 = 10%, but average 11·(1/3)/40 = 0.0917.
  const floorRows = events => world(pool, 3, index => {
    const fields = arm => repeat => {
      if (index >= 30 && repeat === 2) return { unrun: true, resolved: false, status: null }
      if (index < events && repeat === 0) return { resolved: false, status: arm === 'P' ? 'not done' : 'done' }
      return {}
    }
    return { P: fields('P'), A: fields('A') }
  })
  const floorScore = events => {
    const written = files({ 'prereg.json': JSON.stringify(preregFor(pool, 3)), 'rows.jsonl': rowsText(rowsConfigFor(pool, 3), floorRows(events)), 'pool.txt': listText(pool) })
    return runMain(['--prereg', written['prereg.json'], '--pool', written['pool.txt'], '--instances', written['pool.txt'], written['rows.jsonl']])
  }
  const eleven = floorScore(11)
  assert.equal(eleven.code, 0)
  assert.match(eleven.text, /^verdict: INCONCLUSIVE$/m)
  assert.match(eleven.text, /false-completion incidence is below 10%: 0\.092 averaged per instance/)
  // Twin at the exact boundary: twelve average 12·(1/3)/40 = 0.1, which is not below it.
  const twelve = floorScore(12)
  assert.match(twelve.text, /^verdict: SHOWN$/m, twelve.text)
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

test('the verdict file holds only the aggregate, and any other key is refused', () => {
  // ADR-106 Decision 8 as amended (T4): the one file the scorer writes holds the aggregate and nothing per instance.
  const pool = ids(40)
  const rows = world(pool, 1, drop)
  const paths = files({
    'prereg.json': JSON.stringify(preregFor(pool, 1)), 'pool.txt': listText(pool),
    'rows.jsonl': rowsText(rowsConfigFor(pool, 1), rows),
    'canary.jsonl': rowsText(rowsConfigFor(pool, 1, { canary: { pass: false } }), rows),
  })
  const directory = dirname(paths['rows.jsonl'])
  const scoring = ['--prereg', paths['prereg.json'], '--pool', paths['pool.txt'], '--instances', paths['pool.txt']]
  const out = join(directory, 'verdict-main-synthetic.json')
  const printed = runMain([...scoring, '--verdict-out', out, paths['rows.jsonl']])
  assert.equal(printed.code, 0)
  const written = JSON.parse(readFileSync(out, 'utf8'))

  const cell = ['judged', 'missing', 'readable', 'recorded', 'unreadable', 'unresolvedGivenDone', 'unrun',
    ...['brokeTests', 'done', 'falseCompletion', 'resolved', 'underClaim'].map(key => `counts.${key}`),
    ...['brokeTests', 'done', 'falseCompletion', 'resolve', 'underClaim'].map(key => `rates.${key}`)]
  const expected = [
    ...['with', 'without'].flatMap(side => cell.map(key => `arms.${side}.${key}`)),
    'bootstrap.resolve.p5', 'bootstrap.resolve.p95', 'bootstrap.underClaim.p5', 'bootstrap.underClaim.p95',
    'guard', 'instances.pool', 'instances.scored',
    ...['falseCompletion', 'resolve', 'underClaim'].flatMap(metric => ['mean', 'paired', 'unpaired'].map(key => `paired.${metric}.${key}`)),
    'permutation.exact', 'permutation.nonzero', 'permutation.p', 'prereg_sha256', 'reasons', 'scorer_blob_sha', 'verdict',
  ].sort()
  assert.deepEqual(leafPaths(written), expected)
  assert.equal(written.verdict, 'SHOWN')
  assert.match(printed.text, /^verdict: SHOWN$/m)
  assert.equal(written.instances.scored, 40)
  assert.equal(written.permutation.p, 1 / 1024)
  const preregSha = createHash('sha256').update(readFileSync(paths['prereg.json'])).digest('hex')
  const scorer = readFileSync(new URL('../scripts/eval-paired.mjs', import.meta.url))
  const blob = createHash('sha1').update(`blob ${scorer.length}\0`).update(scorer).digest('hex')
  assert.equal(written.prereg_sha256, preregSha)
  assert.equal(written.scorer_blob_sha, blob)
  assert.ok(printed.text.includes(`pre-registration sha256: ${preregSha} · scorer blob sha: ${blob}`), 'the printed sha-256s are the written ones')
  const fileText = readFileSync(out, 'utf8')
  for (const id of pool) assert.ok(!fileText.includes(id), `${id} reached the verdict file`)

  // An INCONCLUSIVE verdict is written with its reasons.
  const failedOut = join(directory, 'verdict-canary.json')
  assert.equal(runMain([...scoring, '--verdict-out', failedOut, paths['canary.jsonl']]).code, 0)
  const failed = JSON.parse(readFileSync(failedOut, 'utf8'))
  assert.equal(failed.verdict, 'INCONCLUSIVE')
  assert.match(failed.reasons.join('\n'), /canary/)

  // Without --verdict-out the scorer writes nothing and exits 0; with --plan the flag is refused.
  const before = readdirSync(directory).sort()
  assert.equal(runMain([...scoring, paths['rows.jsonl']]).code, 0)
  assert.deepEqual(readdirSync(directory).sort(), before, 'a verdict-only run wrote a file')
  const planOut = join(directory, 'verdict-plan.json')
  const refusedPlan = quietly(() => main(['--plan', '--with', 'P', '--without', 'A', '--verdict-out', planOut, paths['rows.jsonl']]))
  assert.equal(refusedPlan.code, 2)
  assert.match(refusedPlan.err, /--verdict-out is refused with --plan/)
  assert.equal(existsSync(planOut), false)

  // DIRTY twin: the writer handed anything per instance writes nothing, names the key and exits 2.
  const stray = [
    [{ ...written, rows }, /the key rows is not in/],
    [{ ...written, rows: pool }, /the key rows is not in/],
    [{ ...written, instance_list: pool }, /the key instance_list is not in/],
    [{ ...written, instances: pool }, /the key instances is not in/],
    [{ ...written, paired: { ...written.paired, falseCompletion: { ...written.paired.falseCompletion, diffs: [-1, 0] } } }, /the key paired\.falseCompletion\.diffs is not in/],
    [{ ...written, reasons: [{ instance: pool[0] }] }, /the key reasons is not in/],
  ]
  const target = join(directory, 'verdict-stray.json')
  for (const [object, named] of stray) {
    const refused = quietly(() => writeVerdict(object, target))
    assert.equal(refused.code, 2, String(named))
    assert.match(refused.err, named)
    assert.equal(existsSync(target), false, 'a refused write leaves no file')
  }
  // Twin: the same writer handed the aggregate alone writes it.
  const clean = join(directory, 'verdict-clean.json')
  assert.equal(quietly(() => writeVerdict(written, clean)).code, 0)
  assert.deepEqual(JSON.parse(readFileSync(clean, 'utf8')), written)

  // The empty key is a key (Codex review of PR #26): `{"": "", rows}` is refused, not written.
  const empty = join(directory, 'verdict-empty-key.json')
  const emptyKey = quietly(() => writeVerdict({ '': '', ...written, rows }, empty))
  assert.equal(emptyKey.code, 2)
  assert.equal(existsSync(empty), false, 'an empty key let the write through')
  // A reason is a code from REASON_CODES, never the words stdout prints.
  const worded = quietly(() => writeVerdict({ ...written, reasons: [`the canary did not pass: ${pool[0]}`] }, empty))
  assert.equal(worded.code, 2)
  assert.match(worded.err, /the key reasons is not in/)
  assert.equal(existsSync(empty), false)

  // No free text from the run reaches the file, through main() (Codex review of PR #26): every reason is a code.
  const transcript = 'SYNTHETIC TRANSCRIPT: the agent wrote the patch and said it was done'
  const payload = `SYNTHETIC MODEL OUTPUT ${'{"turn": "x", "text": "y"}'.repeat(40)}`
  const leaky = files({
    'prereg.json': JSON.stringify(preregFor(pool, 1)), 'pool.txt': listText(pool),
    'duplicates.jsonl': rowsText(rowsConfigFor(pool, 1), [...rows, ...rows.filter(row => row.arm === 'P')]),
    'transcript.jsonl': rowsText(rowsConfigFor(pool, 1, { canary: { pass: false, transcript } }), rows),
    'payload.jsonl': rowsText(rowsConfigFor(pool, 1, { scaffold: { name: 'headless', flags: ['--print'], payload } }), rows),
  })
  const leakyScoring = ['--prereg', leaky['prereg.json'], '--pool', leaky['pool.txt'], '--instances', leaky['pool.txt']]
  for (const [rowsFile, code] of [['duplicates.jsonl', 'duplicate-rows'], ['transcript.jsonl', 'canary-failed'], ['payload.jsonl', 'config-field-differs:scaffold']]) {
    const target = join(dirname(leaky[rowsFile]), `verdict-${rowsFile}.json`)
    const run = runMain([...leakyScoring, '--verdict-out', target, leaky[rowsFile]])
    assert.equal(run.code, 0, rowsFile)
    assert.match(run.text, /^verdict: INCONCLUSIVE$/m, rowsFile)
    const body = readFileSync(target, 'utf8')
    const verdict = JSON.parse(body)
    assert.equal(verdict.verdict, 'INCONCLUSIVE')
    assert.deepEqual(verdict.reasons, [code], `${rowsFile}: one code, each once`)
    assert.ok(verdict.reasons.every(entry => REASON_CODES.includes(entry)))
    for (const id of pool) assert.ok(!body.includes(id), `${rowsFile}: ${id} reached the verdict file`)
    assert.ok(!body.includes('SYNTHETIC'), `${rowsFile}: run text reached the verdict file`)
  }
  // Twin: stdout keeps the words the file leaves out.
  assert.ok(runMain([...leakyScoring, leaky['duplicates.jsonl']]).text.includes(`a duplicate row: instance ${pool[0]}`))
})

// ADR-112 T1: broken tests as a second co-primary, and PAYS / FUTILE / OPEN at a look of L_max.
// `lifecycle` is the shape: `falseA` false completions in the control, `falseP` left in the plugin arm, `brokenA` broken
// tests in the control and none in the plugin arm, and `resolveLost` instances only the control resolves.
const lifecycle = ({ falseA = 10, falseP = 10, brokenA = 0, resolveLost = 0 } = {}) => index => {
  const lost = index >= falseA && index < falseA + resolveLost
  const resolved = index >= falseA && !lost
  return {
    A: { resolved: index >= falseA, status: 'done', brokeTests: index < brokenA },
    P: { resolved, status: resolved || index < falseP ? 'done' : 'not done' },
  }
}
const STAGE_FIELDS = { co_primaries: ['falseCompletion', 'brokeTests'], useful_effects: { falseCompletion: 0.05, brokeTests: 0.03 } }

// One look: `size` scored instances of a pool of `poolSize`, in blocks of `size`, so the look is 1 of poolSize / size.
function atLook(shape, { size = 40, poolSize = size, over = {} } = {}) {
  const pool = ids(poolSize)
  const scored = pool.slice(0, size)
  const prereg = preregFor(pool, 1, { ...STAGE_FIELDS, block_size: size, look: 1, looks_max: poolSize / size, ...over })
  return scoreOf({ pool, scored, rows: world(scored, 1, shape), prereg })
}

test('broken tests is a paired endpoint, PAYS needs a shown co-primary at the per-look level, and FUTILE needs both bounded', () => {
  // PAYS on false completion alone: ten removed entirely, exact p = 2^-10 under 0.0125.
  const fc = atLook(lifecycle({ falseP: 0 }))
  assert.equal(fc.verdict, 'PAYS')
  assert.deepEqual(fc.reasons, [])
  assert.deepEqual(fc.guard, [])

  // PAYS on broken tests alone (false completion identical): seven discordant pairs, p = 2^-7 under 0.0125 at L_max 1.
  const bt = atLook(lifecycle({ brokenA: 7 }))
  assert.equal(bt.metrics.brokeTests.paired, 40)
  assert.equal(bt.metrics.brokeTests.mean, -7 / 40)
  assert.equal(bt.stage.permutation.brokeTests.p, 1 / 128)
  assert.equal(bt.verdict, 'PAYS')
  // The level is divided by L_max: the same seven at look 1 of 2 are 2^-7 against 0.0125 / 2.
  const spread = atLook(lifecycle({ brokenA: 7 }), { poolSize: 80 })
  assert.equal(spread.stage.level, 0.0125 / 2)
  assert.equal(spread.stage.permutation.brokeTests.p, 1 / 128)
  assert.equal(spread.verdict, 'OPEN')

  // The power floor: six discordant pairs at L_max 1 are p = 2^-6, which is neither PAYS nor FUTILE.
  const floor = atLook(lifecycle({ brokenA: 6 }))
  assert.equal(floor.stage.permutation.brokeTests.p, 1 / 64)
  assert.equal(floor.verdict, 'OPEN')

  // A guard keeps PAYS from being said: the plugin also loses five resolves. DIRTY twin: the first case without them.
  const guarded = atLook(lifecycle({ falseP: 0, resolveLost: 5 }))
  assert.deepEqual(guarded.guardCodes, ['resolve-guard'])
  assert.equal(guarded.stage.permutation.falseCompletion.p < 0.0125, true)
  assert.equal(guarded.verdict, 'GUARD NOT MET')

  // FUTILE needs both co-primaries bounded: no effect on either is FUTILE, and either one unbounded is not.
  assert.equal(atLook(lifecycle()).verdict, 'FUTILE')
  const fcOnly = atLook(lifecycle({ falseP: 5 }))
  assert.equal(fcOnly.stage.permutation.falseCompletion.p, 1 / 32)
  assert.equal(fcOnly.verdict, 'OPEN')
  assert.equal(atLook(lifecycle({ brokenA: 4 })).verdict, 'OPEN')

  // The useful effects are 0.05 and 0.03: four discordant pairs in 200 improve by 0.035 at the 95th percentile,
  // bounded for false completion (under 0.05) and not for broken tests (over 0.03).
  const big = { size: 200 }
  const fcBounded = atLook(lifecycle({ falseA: 24, falseP: 20 }), big)
  const improvement = bound => -bound.p5
  assert.ok(improvement(fcBounded.stage.bootstrap.falseCompletion) >= 0.03 && improvement(fcBounded.stage.bootstrap.falseCompletion) < 0.05)
  assert.equal(fcBounded.verdict, 'FUTILE')
  const btUnbounded = atLook(lifecycle({ falseA: 24, falseP: 24, brokenA: 4 }), big)
  assert.ok(improvement(btUnbounded.stage.bootstrap.brokeTests) >= 0.03 && improvement(btUnbounded.stage.bootstrap.brokeTests) < 0.05)
  assert.equal(btUnbounded.verdict, 'OPEN')
  const btBounded = atLook(lifecycle({ falseA: 24, falseP: 24, brokenA: 2 }), big)
  assert.ok(improvement(btBounded.stage.bootstrap.brokeTests) < 0.03)
  assert.equal(btBounded.verdict, 'FUTILE')

  // The pre-registration must name the stage exactly: a wrong co-primary list, look, L_max or effect is INCONCLUSIVE.
  const refused = [
    [{ co_primaries: ['falseCompletion'] }, 'stage-co-primaries-invalid'],
    [{ look: 2, looks_max: 2 }, 'stage-look-differs'],
    [{ looks_max: 2 }, 'stage-looks-max-differs'],
    [{ look: 0 }, 'stage-looks-invalid'],
    [{ useful_effects: { falseCompletion: 0.05, brokeTests: 0.05 } }, 'stage-effects-invalid'],
  ]
  for (const [over, code] of refused) {
    const result = atLook(lifecycle({ falseP: 0 }), { over })
    assert.equal(result.verdict, 'INCONCLUSIVE', code)
    assert.ok(result.reasonCodes.includes(code), code)
    assert.ok(REASON_CODES.includes(code), code)
  }

  // The verdict file adds only the stage key, and the scorer's own allow list accepts what it writes.
  const written = verdictFile(bt, { preregSha256: 'x', scorerBlobSha: 'y' })
  assert.equal(written.verdict, 'PAYS')
  assert.equal(strayKey(written), null)
  assert.deepEqual(leafPaths(written.stage), [
    'bootstrap.brokeTests.p5', 'bootstrap.brokeTests.p95', 'bootstrap.falseCompletion.p5', 'bootstrap.falseCompletion.p95',
    'level', 'look', 'looksMax', 'paired.brokeTests.mean', 'paired.brokeTests.paired', 'paired.brokeTests.unpaired',
    'permutation.brokeTests.exact', 'permutation.brokeTests.nonzero', 'permutation.brokeTests.p',
  ])
})

test('a pre-registration without the endpoint scores exactly as ADR-106\'s', () => {
  const pool = ids(40)
  const rows = mark(world(pool, 1, drop), 'A', 3, { brokeTests: true })
  const plain = scoreOf({ pool, rows })
  assert.equal(plain.verdict, 'SHOWN')
  assert.equal('stage' in plain, false)
  assert.equal('brokeTests' in verdictFile(plain, { preregSha256: 'x', scorerBlobSha: 'y' }).paired, false)
  assert.equal('stage' in verdictFile(plain, { preregSha256: 'x', scorerBlobSha: 'y' }), false)
  // Fields of the stage on their own do not switch it on: only the co-primaries do.
  const half = scoreOf({ pool, rows, prereg: preregFor(pool, 1, { look: 1, looks_max: 1, useful_effects: STAGE_FIELDS.useful_effects }) })
  assert.equal(half.verdict, 'SHOWN')
  assert.equal('stage' in half, false)
  // The aggregate is the one ADR-106 wrote: a digest of the verdict file, taken before this task.
  const golden = JSON.stringify(verdictFile(plain, { preregSha256: 'x', scorerBlobSha: 'y' }))
  assert.equal(createHash('sha256').update(golden).digest('hex'), 'a416d045462b2882a7134f926031d596ec0fef631f29b9f7e78abae41dedb1b0')
  // DIRTY twin: the same rows under the stage are scored by the stage.
  const staged = scoreOf({ pool, rows, prereg: preregFor(pool, 1, { ...STAGE_FIELDS, look: 1, looks_max: 1 }) })
  assert.equal(staged.verdict, 'PAYS')
  assert.ok('stage' in staged)
})

test('under the control floor, false completion cannot make PAYS, and broken tests and FUTILE are still read', () => {
  // ADR-112 Decision 5 as amended 2026-10-21: a control false-completion rate under 10% bars PAYS on that endpoint only.
  const none = atLook(lifecycle({ falseA: 2, falseP: 2 }))
  assert.ok(none.reasonCodes.includes('without-fc-under-10'))
  assert.equal(none.verdict, 'FUTILE')
  const broken = atLook(lifecycle({ falseA: 2, falseP: 2, brokenA: 7 }))
  assert.equal(broken.stage.permutation.brokeTests.p, 1 / 128)
  assert.equal(broken.verdict, 'PAYS')
  // 19 of 200 is 9.5%: removing all of them is p = 2^-19, shown at the level, and still not PAYS under the floor.
  const withheld = atLook(lifecycle({ falseA: 19, falseP: 0 }), { size: 200 })
  assert.ok(withheld.reasonCodes.includes('without-fc-under-10'))
  assert.ok(withheld.stage.permutation.falseCompletion.p < withheld.stage.level)
  assert.equal(withheld.verdict, 'OPEN')
  // DIRTY twin: a reason other than the floor still makes the look INCONCLUSIVE.
  assert.equal(atLook(lifecycle({ falseA: 2, falseP: 2 }), { over: { look: 0 } }).verdict, 'INCONCLUSIVE')
  // ADR-106's own scoring keeps the floor as a reason: the same rows without the stage are INCONCLUSIVE.
  const pool = ids(40)
  assert.equal(scoreOf({ pool, rows: world(pool, 1, lifecycle({ falseA: 2, falseP: 2 })) }).verdict, 'INCONCLUSIVE')
})
