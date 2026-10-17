#!/usr/bin/env node
// eval-paired.mjs — ADR-106's paired scorer: what the plugin buys, measured against a control arm.
//
//   node scripts/eval-paired.mjs --prereg <json> [--pool <list>] --instances <list> [--disjoint-from <list>] [--verdict-out <file>] <rows.jsonl>
//   node scripts/eval-paired.mjs --plan [--instances <list>] [--with <arm>] [--without <arm>] <rows.jsonl>
//
// It reads paired rows (one `{"config": {...}}` line, then one row per run, as tool-multipathreadwrite's
// `bench export-paired` writes them) against the committed pre-registration, and prints every cell beside
// ONE verdict word, decided in ADR-106 Decision 6's order (as amended 2026-10-17). With --plan it reads
// pilot rows, takes no pre-registration, and prints each paired difference's SD, its one-sided 80% upper
// bound and the n Decision 7 implies — and never a verdict word, so nothing a pilot prints reads as the result.
//
// Rules borrowed from eval-deltas.mjs and eval-compare.mjs (ADR-005): a run the infrastructure failed is
// UNRUN and never moves a rate; a file it could not read is a missing measurement, never an effect. It
// reads, writes nothing but the verdict file --verdict-out names, and exits 0 whatever it finds (2 only for a
// command line it cannot parse, or a verdict file it refuses or fails to write).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

/** Decision 2's fields: present in the pre-registration and the rows' config line, and equal. */
export const DECISION_2_FIELDS = [
  'dataset', 'split', 'revision', 'selection_rule', 'selection_salt', 'instance_count', 'instance_list_sha256', 'k',
  'model', 'cli_version', 'plugin', 'scaffold', 'prompt_sha256', 'max_turns', 'budget_seconds', 'scorer_blob_sha',
]

/** The only words a scoring run ends with. --plan prints none of them. */
export const VERDICTS = { inconclusive: 'INCONCLUSIVE', guard: 'GUARD NOT MET', shown: 'SHOWN', notShown: 'NOT SHOWN' }

// Fixed, so the scorer's git blob — which the pre-registration pins as `scorer_blob_sha` — pins the draws too.
const SEED = 106
const DRAWS = 100_000
const RESAMPLES = 10_000
const EXACT_UP_TO = 20
const GUARD = 0.03
const DEFAULT_ALPHA = 0.05
const DEFAULT_BLOCK = 40
// Per-instance means are fractions; two sign assignments tied in rationals may differ by an ulp in floats.
const TOLERANCE = 1e-9
const Z_ALPHA = 1.645
const Z_POWER = 0.842
const PLANNED_DROP = { falseCompletion: 0.05, resolve: 0.03, underClaim: 0.03 }
const READABLE = new Set(['done', 'not done'])
const SIDES = ['with', 'without']
const METRICS = ['falseCompletion', 'resolve', 'underClaim']
const LABELS = { falseCompletion: 'false completion', resolve: 'resolve', underClaim: 'under-claim', done: 'done coverage P(done)', brokeTests: 'broken tests' }

/** The ids of an instance list: one per line, trimmed, blank lines dropped, in file order. */
export function listIds(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean)
}

/** SHA-256 of the ids joined by "\n" with no trailing newline — how `bench export-paired` computes it. */
export function listDigest(ids) {
  return createHash('sha256').update(ids.join('\n')).digest('hex')
}

// JSON with object keys sorted, so `plugin` and `scaffold` compare deeply and key order is not a difference.
const canonical = value => JSON.stringify(value ?? null, (_key, inner) => (inner && typeof inner === 'object' && !Array.isArray(inner)
  ? Object.fromEntries(Object.keys(inner).sort().map(key => [key, inner[key]]))
  : inner))

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
// The pre-registration's numeric controls, checked before anything compares or multiplies them: a JSON object
// there throws on its way to a primitive, and a fractional k reached a verdict (Codex review of PR #24).
const isLevel = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1
const isRepeatCount = value => Number.isInteger(value) && value > 0
const meanOf = values => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : null)

/**
 * One run's contribution to each metric, or null when it is UNRUN (outside every metric, ADR-005).
 *
 * A run that hit its turn or time limit is judged as it stands (Decision 4): nothing here reads `limit`.
 * A status other than `done` or `not done` is no claim (Decision 3): outside the claim metrics, inside
 * resolve incidence.
 */
export function judge(row) {
  if (row.unrun) return null
  const readable = READABLE.has(row.status)
  return {
    resolve: row.resolved ? 1 : 0,
    brokeTests: row.brokeTests ? 1 : 0,
    done: readable ? (row.status === 'done' ? 1 : 0) : null,
    falseCompletion: readable ? (row.status === 'done' && !row.resolved ? 1 : 0) : null,
    underClaim: readable ? (row.status === 'not done' && row.resolved ? 1 : 0) : null,
  }
}

function rowShapeError(row) {
  if (!isObject(row)) return 'is not an object'
  if (typeof row.instance !== 'string' || !row.instance) return 'has no instance'
  if (typeof row.arm !== 'string') return 'has no arm'
  if (!Number.isInteger(row.repeat)) return 'has no whole-number repeat'
  if (typeof row.unrun !== 'boolean') return 'has no boolean unrun'
  if (row.unrun) return null
  const missing = ['resolved', 'brokeTests', 'limit'].find(field => typeof row[field] !== 'boolean')
  return missing ? `has no boolean ${missing}` : null
}

/** The config line, the rows, and what in the file's shape is wrong. */
export function readRows(text) {
  const problems = []
  const rows = []
  let config = null
  let first = true
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    let value
    try { value = JSON.parse(line) } catch { problems.push(`rows line ${index + 1} is not JSON`); return }
    if (first) {
      first = false
      if (isObject(value) && isObject(value.config)) config = value.config
      else problems.push('the rows file does not start with a {"config": {...}} line')
      return
    }
    const wrong = rowShapeError(value)
    if (wrong) problems.push(`rows line ${index + 1} ${wrong}`)
    else rows.push(value)
  })
  if (first) problems.push('the rows file holds no config line and no row')
  return { config, rows, problems }
}

// Keep the rows of the two arms and of the scored instances; name what makes the set unscorable.
function collect(rows, arms, scored, pool, k) {
  const problems = []
  const kept = []
  const seen = new Set()
  const repeats = new Map()
  const stranger = new Set()
  let ignoredArms = 0
  let ignoredOutsideScored = 0
  for (const row of rows) {
    if (row.arm !== arms.with && row.arm !== arms.without) { ignoredArms += 1; continue }
    const key = JSON.stringify([row.instance, row.arm, row.repeat])
    if (seen.has(key)) { problems.push(`a duplicate row: instance ${row.instance}, arm ${row.arm}, repeat ${row.repeat}`); continue }
    seen.add(key)
    if (pool && !pool.has(row.instance)) { stranger.add(row.instance); continue }
    if (scored && !scored.has(row.instance)) { ignoredOutsideScored += 1; continue }
    const pair = JSON.stringify([row.instance, row.arm])
    repeats.set(pair, (repeats.get(pair) ?? 0) + 1)
    kept.push(row)
  }
  if (stranger.size) problems.push(`${stranger.size} instance(s) in the rows are not in the pool, e.g. ${[...stranger].sort()[0]}`)
  const over = k === null ? 0 : [...repeats.values()].filter(count => count > k).length
  if (over) problems.push(`${over} instance-arm pair(s) carry more than k = ${k} repeats`)
  return { problems, kept, ignoredArms, ignoredOutsideScored }
}

function instanceMean(judged, metric) {
  return meanOf(judged.map(verdict => verdict[metric]).filter(value => value !== null))
}

// Per arm: counts over runs, rates averaged per instance (Decision 5); per metric: the paired differences.
function tally(kept, arms, universe, k) {
  const runs = new Map()
  const cells = Object.fromEntries(SIDES.map(side => [side, {
    recorded: 0, unrun: 0, missing: 0, judged: 0, unreadable: 0, readable: 0,
    counts: { resolved: 0, falseCompletion: 0, underClaim: 0, done: 0, brokeTests: 0 },
  }]))
  for (const row of kept) {
    const side = row.arm === arms.with ? 'with' : 'without'
    const cell = cells[side]
    cell.recorded += 1
    const verdict = judge(row)
    if (verdict === null) { cell.unrun += 1; continue }
    cell.judged += 1
    cell.counts.resolved += verdict.resolve
    cell.counts.brokeTests += verdict.brokeTests
    if (verdict.done === null) cell.unreadable += 1
    else {
      cell.readable += 1
      cell.counts.done += verdict.done
      cell.counts.falseCompletion += verdict.falseCompletion
      cell.counts.underClaim += verdict.underClaim
    }
    if (!runs.has(row.instance)) runs.set(row.instance, { with: [], without: [] })
    runs.get(row.instance)[side].push(verdict)
  }
  for (const side of SIDES) {
    const cell = cells[side]
    cell.missing = k === null ? null : Math.max(0, universe.size * k - cell.recorded)
    cell.rates = Object.fromEntries([...METRICS, 'done', 'brokeTests'].map(metric => [metric,
      meanOf([...runs.values()].map(judged => instanceMean(judged[side], metric)).filter(value => value !== null))]))
    cell.unresolvedGivenDone = cell.counts.done ? cell.counts.falseCompletion / cell.counts.done : null
  }
  // Sorted ids, so the seeded draws are a function of the data and not of the file's row order.
  const ordered = [...universe].sort()
  const metrics = {}
  for (const metric of METRICS) {
    const diffs = []
    for (const instance of ordered) {
      const judged = runs.get(instance)
      const withMean = judged ? instanceMean(judged.with, metric) : null
      const withoutMean = judged ? instanceMean(judged.without, metric) : null
      if (withMean !== null && withoutMean !== null) diffs.push(withMean - withoutMean)
    }
    metrics[metric] = { paired: diffs.length, unpaired: ordered.length - diffs.length, diffs, mean: meanOf(diffs) }
  }
  return { arms: cells, metrics }
}

// mulberry32: a small seeded generator, enough for resampling and nothing cryptographic.
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One-sided sign-flip permutation p that the mean difference is this low by chance (Decision 6).
 *
 * Exact over every assignment when 20 or fewer differences are nonzero (a zero flips to itself); else
 * `draws` seeded draws with p = (count + 1) / (draws + 1). Counts assignments whose sum is at or below
 * the observed one, ties included.
 */
export function permutationP(diffs, { seed = SEED, draws = DRAWS } = {}) {
  const nonzero = diffs.filter(difference => Math.abs(difference) > TOLERANCE)
  const observed = nonzero.reduce((total, difference) => total + difference, 0)
  const size = nonzero.length
  if (size <= EXACT_UP_TO) {
    let count = 0
    for (let mask = 0; mask < 2 ** size; mask++) {
      let sum = 0
      for (let index = 0; index < size; index++) sum += (mask >> index) & 1 ? -nonzero[index] : nonzero[index]
      if (sum <= observed + TOLERANCE) count += 1
    }
    return { p: count / 2 ** size, exact: true, nonzero: size }
  }
  const random = seeded(seed)
  let count = 0
  for (let draw = 0; draw < draws; draw++) {
    let sum = 0
    for (const difference of nonzero) sum += random() < 0.5 ? -difference : difference
    if (sum <= observed + TOLERANCE) count += 1
  }
  return { p: (count + 1) / (draws + 1), exact: false, nonzero: size }
}

function percentile(sorted, q) {
  const at = q * (sorted.length - 1)
  const low = Math.floor(at)
  return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low)
}

/** The 5th and 95th percentiles of the mean over `resamples` seeded paired bootstrap resamples. */
export function bootstrapPercentiles(diffs, { seed = SEED, resamples = RESAMPLES } = {}) {
  if (!diffs.length) return { p5: null, p95: null }
  const random = seeded(seed)
  const means = new Float64Array(resamples)
  for (let resample = 0; resample < resamples; resample++) {
    let sum = 0
    for (let index = 0; index < diffs.length; index++) sum += diffs[Math.floor(random() * diffs.length)]
    means[resample] = sum / diffs.length
  }
  means.sort()
  return { p5: percentile(means, 0.05), p95: percentile(means, 0.95) }
}

// Lanczos (g = 7) log-gamma, for the regularized incomplete gamma below.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
function logGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  const shifted = z - 1
  let sum = LANCZOS[0]
  for (let index = 1; index < LANCZOS.length; index++) sum += LANCZOS[index] / (shifted + index)
  const t = shifted + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum)
}

// P(a, x): the series below a + 1, the continued fraction (modified Lentz) above it.
function lowerGamma(a, x) {
  if (x <= 0) return 0
  const scale = Math.exp(-x + a * Math.log(x) - logGamma(a))
  if (x < a + 1) {
    let term = 1 / a
    let sum = term
    for (let step = 1; step < 1000 && term > sum * 1e-16; step++) { term *= x / (a + step); sum += term }
    return sum * scale
  }
  const tiny = 1e-300
  let b = x + 1 - a
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let step = 1; step < 1000; step++) {
    const an = -step * (step - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    if (Math.abs(d * c - 1) < 1e-16) break
  }
  return 1 - scale * h
}

/** The p-quantile of the chi-square distribution with `df` degrees of freedom, by bisection. */
export function chiSquareQuantile(p, df) {
  let low = 0
  let high = Math.max(1, df)
  while (lowerGamma(df / 2, high / 2) < p) high *= 2
  for (let step = 0; step < 200; step++) {
    const middle = (low + high) / 2
    if (lowerGamma(df / 2, middle / 2) < p) low = middle
    else high = middle
  }
  return (low + high) / 2
}

/** The one-sided 80% upper confidence bound of an SD taken over `size` paired differences (Decision 7). */
export function sdUpperBound(sd, size) {
  return sd * Math.sqrt((size - 1) / chiSquareQuantile(0.2, size - 1))
}

function sampleSd(values) {
  const mean = meanOf(values)
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1))
}

// Decision 2 as amended: the export's fields equal, the pool digested, the scored list a block prefix of it.
function configurationProblems(prereg, config, pool, scored, disjoint, poolLabel) {
  const problems = []
  for (const field of DECISION_2_FIELDS) {
    if (prereg[field] == null) problems.push(`the pre-registration lacks ${field}`)
    else if (config[field] == null) problems.push(`the rows' config line lacks ${field}`)
    else if (canonical(prereg[field]) !== canonical(config[field])) problems.push(`${field} differs: pre-registered ${canonical(prereg[field])}, rows ${canonical(config[field])}`)
  }
  if (config.canary?.pass !== true) problems.push(`the canary did not pass: ${canonical(config.canary)}`)
  if (prereg.n !== undefined && !(Number.isInteger(prereg.n) && prereg.n > 0)) problems.push(`the pre-registered n ${canonical(prereg.n)} is not a whole number of instances`)
  if (prereg.alpha !== undefined && !isLevel(prereg.alpha)) problems.push(`the pre-registered alpha ${canonical(prereg.alpha)} is not a finite number between 0 and 1`)
  if (prereg.k != null && !isRepeatCount(prereg.k)) problems.push(`the pre-registered k ${canonical(prereg.k)} is not a positive whole number of repeats`)
  if (prereg.arms !== undefined && !(isObject(prereg.arms) && typeof prereg.arms.with === 'string'
    && typeof prereg.arms.without === 'string' && prereg.arms.with !== prereg.arms.without)) problems.push(`the pre-registered arms ${canonical(prereg.arms)} are not two arm names`)
  const digest = listDigest(pool)
  if (digest !== prereg.instance_list_sha256) problems.push(`the ${poolLabel}'s sha256 is ${digest}, not the pre-registered ${canonical(prereg.instance_list_sha256)}`)
  if (pool.length !== prereg.instance_count) problems.push(`the ${poolLabel} names ${pool.length} instance(s), not the pre-registered ${canonical(prereg.instance_count)}`)
  const twice = pool.filter((id, index) => pool.indexOf(id) !== index)
  if (twice.length) problems.push(`the ${poolLabel} names ${twice[0]} more than once`)
  const block = prereg.block_size ?? DEFAULT_BLOCK
  if (!(Number.isInteger(block) && block > 0)) problems.push(`the pre-registered block_size ${canonical(block)} is not a whole number of instances`)
  else {
    const size = scored.length
    const prefix = size > 0 && size <= pool.length && scored.every((id, index) => id === pool[index])
    if (!prefix || (size !== pool.length && size % block !== 0)) {
      problems.push(`the scored instances are not a prefix of the pool of length min(${block}·L, ${pool.length}): ${size} instance(s)`)
    }
  }
  if (disjoint) {
    const other = new Set(disjoint)
    const shared = scored.filter(id => other.has(id))
    if (shared.length) problems.push(`${shared.length} scored instance(s) are also in --disjoint-from, e.g. ${shared[0]}`)
  }
  return problems
}

// More than three points apart, compared in integers: 100·|a/da − b/db| > 3 ⇔ 100·|a·db − b·da| > 3·da·db.
const apart = (a, da, b, db) => 100 * Math.abs(a * db - b * da) > 3 * da * db

function completenessProblems(prereg, counted, count, k) {
  const problems = []
  const paired = counted.metrics.falseCompletion.paired
  if (paired * 10 < count * 9) problems.push(`${paired} of ${count} scored instances are paired on false completion, fewer than 90%`)
  if (Number.isInteger(prereg.n) && paired < prereg.n) problems.push(`${paired} instances are paired on false completion, fewer than the pre-registered n = ${prereg.n}`)
  const cell = counted.arms
  if (k !== null) {
    const expected = count * k
    const lost = side => cell[side].unrun + cell[side].missing
    if (!(expected > 0) || apart(lost('with'), expected, lost('without'), expected)) {
      problems.push(`the arms' UNRUN rates differ by more than 3 points: with ${lost('with')} of ${expected}, without ${lost('without')} of ${expected} (UNRUN rows plus runs that never arrived)`)
    }
  }
  if (!cell.with.judged || !cell.without.judged) {
    problems.push('an arm has no judged run, so no rate can be compared')
    return problems
  }
  if (apart(cell.with.unreadable, cell.with.judged, cell.without.unreadable, cell.without.judged)) {
    problems.push(`the arms' unreadable-claim rates differ by more than 3 points: with ${cell.with.unreadable} of ${cell.with.judged}, without ${cell.without.unreadable} of ${cell.without.judged}`)
  }
  for (const side of SIDES) {
    const { judged, unreadable, counts } = cell[side]
    if (10 * unreadable > judged) problems.push(`the ${side} arm's unreadable-claim rate exceeds 10%: ${unreadable} of ${judged} judged runs`)
    if (10 * counts.resolved < judged) problems.push(`the ${side} arm resolves fewer than 10% of its judged runs: ${counts.resolved} of ${judged}`)
  }
  // Decision 5 averages per instance, so the floor reads the averaged rate, not pooled runs (Codex review of PR #24).
  const floor = cell.without.rates.falseCompletion
  if (!(floor >= 0.1 - TOLERANCE)) {
    problems.push(`the without arm's false-completion incidence is below 10%: ${fixed(floor)} averaged per instance (${cell.without.counts.falseCompletion} of ${cell.without.readable} readable claims), too few events to show a drop`)
  }
  return problems
}

function decide(reasons, guard, shown) {
  if (reasons.length) return VERDICTS.inconclusive
  if (guard.length) return VERDICTS.guard
  return shown ? VERDICTS.shown : VERDICTS.notShown
}

/**
 * Score paired rows against the pre-registration: every cell, p, both bootstrap bounds, the verdict.
 * `poolText` is the frozen pool the pre-registration digests and `instancesText` its scored prefix; with
 * no pool, the instance list is the pool, so its own digest must be the pre-registered one.
 */
export function score({ prereg, rowsText, poolText, instancesText, disjointText }) {
  const pool = listIds(poolText ?? instancesText)
  const scored = listIds(instancesText)
  const arms = { with: 'with', without: 'without', ...(isObject(prereg.arms) ? prereg.arms : {}) }
  const { config, rows, problems: shape } = readRows(rowsText)
  const reasons = [...shape, ...configurationProblems(prereg, config ?? {}, pool, scored, disjointText === undefined ? null : listIds(disjointText), poolText === undefined ? 'instance list' : 'pool')]
  const universe = new Set(scored)
  const k = isRepeatCount(prereg.k) ? prereg.k : null
  const { problems, kept, ignoredArms, ignoredOutsideScored } = collect(rows, arms, universe, new Set(pool), k)
  reasons.push(...problems)
  const counted = tally(kept, arms, universe, k)
  reasons.push(...completenessProblems(prereg, counted, universe.size, k))
  const permutation = permutationP(counted.metrics.falseCompletion.diffs)
  const bootstrap = {
    resolve: bootstrapPercentiles(counted.metrics.resolve.diffs),
    underClaim: bootstrapPercentiles(counted.metrics.underClaim.diffs),
  }
  const alpha = prereg.alpha === undefined ? DEFAULT_ALPHA : prereg.alpha
  const guard = []
  if (!(bootstrap.resolve.p5 > -GUARD + TOLERANCE)) guard.push(`resolve: the 5th percentile of the difference, ${fixed(bootstrap.resolve.p5)}, is at or below −0.03`)
  if (!(bootstrap.underClaim.p95 < GUARD - TOLERANCE)) guard.push(`under-claim: the 95th percentile of the difference, ${fixed(bootstrap.underClaim.p95)}, is at or above +0.03`)
  const shown = isLevel(alpha) && counted.metrics.falseCompletion.mean < 0 && permutation.p < alpha
  return {
    ...counted, arms: counted.arms, armNames: arms, config, instanceCount: universe.size, poolCount: pool.length, k: prereg.k, alpha,
    ignoredArms, ignoredOutsideScored, permutation, bootstrap, guard, reasons, verdict: decide(reasons, guard, shown),
  }
}

/**
 * Plan from pilot rows (Decision 7): no pre-registration, every Decision 2 field present in the config line,
 * and per paired difference its SD, the SD's one-sided 80% upper bound and the n that bound implies.
 */
export function plan({ rowsText, instancesText, arms = { with: 'with', without: 'without' } }) {
  const { config, rows, problems } = readRows(rowsText)
  const given = config ?? {}
  const reasons = [...problems]
  for (const field of DECISION_2_FIELDS) if (given[field] == null) reasons.push(`the config line lacks ${field}`)
  if (config && given.canary?.pass !== true) reasons.push(`the canary did not pass: ${canonical(given.canary)}`)
  if (given.instance_count != null && !Number.isInteger(given.instance_count)) reasons.push(`instance_count ${canonical(given.instance_count)} is not a whole number`)
  if (given.k != null && !isRepeatCount(given.k)) reasons.push(`k ${canonical(given.k)} is not a whole number of repeats`)
  const k = isRepeatCount(given.k) ? given.k : null
  let universe = null
  if (instancesText !== undefined) {
    const instances = listIds(instancesText)
    universe = new Set(instances)
    if (given.instance_list_sha256 != null && listDigest(instances) !== given.instance_list_sha256) reasons.push(`the instance list's sha256 is ${listDigest(instances)}, not the config line's ${canonical(given.instance_list_sha256)}`)
  }
  const collected = collect(rows, arms, universe, universe, k)
  reasons.push(...collected.problems)
  universe ??= new Set(collected.kept.map(row => row.instance))
  const counted = tally(collected.kept, arms, universe, k)
  const result = { ...counted, armNames: arms, config, instanceCount: universe.size, k: given.k, ignoredArms: collected.ignoredArms, reasons }
  if (reasons.length) return result
  const planned = {}
  for (const metric of METRICS) {
    const { diffs } = counted.metrics[metric]
    const sd = diffs.length >= 2 ? sampleSd(diffs) : null
    const sdPlus = sd === null ? null : sdUpperBound(sd, diffs.length)
    const n = sdPlus === null ? null : Math.ceil(((Z_ALPHA + Z_POWER) * sdPlus / PLANNED_DROP[metric]) ** 2)
    planned[metric] = { paired: diffs.length, sd, sdPlus, n }
  }
  const each = METRICS.map(metric => planned[metric].n)
  const n = each.includes(null) ? null : Math.max(...each, given.instance_count)
  const mainInstances = n === null ? null : Math.ceil(n * 10 / 9)
  return { ...result, planned, n, mainInstances, attempts: mainInstances === null ? null : mainInstances * given.k * 2 }
}

const fixed = value => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '—')
const pad = (text, width) => String(text).padEnd(width)

function armLines(result) {
  const { with: w, without: wo } = result.arms
  const row = (label, a, b) => `  ${pad(label, 26)}${pad(a, 26)}${b}\n`
  const rate = (cell, metric, of) => `${fixed(cell.rates[metric])} (${cell.counts[metric === 'resolve' ? 'resolved' : metric]}/${cell[of]})`
  let text = row('per arm', `with (${result.armNames.with})`, `without (${result.armNames.without})`)
  text += row('recorded runs', w.recorded, wo.recorded)
  text += row('UNRUN', w.unrun, wo.unrun)
  text += row('missing runs', w.missing ?? '—', wo.missing ?? '—')
  text += row('judged runs', w.judged, wo.judged)
  text += row('unreadable claims', w.unreadable, wo.unreadable)
  text += row(LABELS.resolve, rate(w, 'resolve', 'judged'), rate(wo, 'resolve', 'judged'))
  text += row(LABELS.falseCompletion, rate(w, 'falseCompletion', 'readable'), rate(wo, 'falseCompletion', 'readable'))
  text += row(LABELS.underClaim, rate(w, 'underClaim', 'readable'), rate(wo, 'underClaim', 'readable'))
  text += row(LABELS.done, rate(w, 'done', 'readable'), rate(wo, 'done', 'readable'))
  text += row('P(unresolved | done)', w.unresolvedGivenDone === null ? 'undefined, no done' : fixed(w.unresolvedGivenDone),
    wo.unresolvedGivenDone === null ? 'undefined, no done' : fixed(wo.unresolvedGivenDone))
  text += row(LABELS.brokeTests, rate(w, 'brokeTests', 'judged'), rate(wo, 'brokeTests', 'judged'))
  text += row('cost, wall time', 'not carried by the rows', 'not carried by the rows')
  text += '  (a rate is averaged per instance over its judged repeats; the counts beside it are runs)\n\n'
  text += `  ${pad('paired per metric', 26)}${pad('paired', 8)}${pad('unpaired', 10)}mean difference (with − without)\n`
  for (const metric of METRICS) {
    const entry = result.metrics[metric]
    text += `  ${pad(LABELS[metric], 26)}${pad(entry.paired, 8)}${pad(entry.unpaired, 10)}${fixed(entry.mean)}\n`
  }
  return text
}

function header(result) {
  const config = result.config ?? {}
  return `configuration: ${canonical(config.dataset)} ${canonical(config.split)} ${canonical(config.revision)} · model ${canonical(config.model)}`
    + ` · claude ${canonical(config.cli_version)} · plugin ${canonical(config.plugin)} · k ${canonical(result.k)}\n`
    + `instances: ${result.instanceCount} · rows of other arms left out: ${result.ignoredArms}`
    + (result.ignoredOutsideScored === undefined ? '' : ` · rows of pool instances past the scored prefix left out: ${result.ignoredOutsideScored}`)
    + '\n\n'
}

function renderScore(result, provenance) {
  let text = header(result) + armLines(result) + '\n'
  const { permutation, bootstrap } = result
  text += `permutation p, one-sided, false completion: ${permutation.p.toPrecision(4)}`
    + ` (${permutation.exact ? 'exact' : `${DRAWS} seeded draws`}, ${permutation.nonzero} nonzero difference(s)) · alpha ${canonical(result.alpha)}\n`
  text += `bootstrap, resolve difference: 5th ${fixed(bootstrap.resolve.p5)} · 95th ${fixed(bootstrap.resolve.p95)}\n`
  text += `bootstrap, under-claim difference: 5th ${fixed(bootstrap.underClaim.p5)} · 95th ${fixed(bootstrap.underClaim.p95)}\n`
  text += `pre-registration sha256: ${provenance.preregSha256} · scorer blob sha: ${provenance.scorerBlobSha}\n\n`
  for (const reason of result.reasons) text += `why: ${reason}\n`
  for (const breach of result.guard) text += `guard: ${breach}\n`
  return `${text}verdict: ${result.verdict}\n`
}

function renderPlan(result) {
  let text = header(result) + armLines(result) + '\n'
  if (result.reasons.length) {
    for (const reason of result.reasons) text += `cannot plan: ${reason}\n`
    return text
  }
  text += `  ${pad('planning (Decision 7)', 26)}${pad('paired', 8)}${pad('sd', 10)}${pad('sd⁺ (80%)', 12)}planned n\n`
  for (const metric of METRICS) {
    const entry = result.planned[metric]
    text += `  ${pad(LABELS[metric], 26)}${pad(entry.paired, 8)}${pad(fixed(entry.sd), 10)}${pad(fixed(entry.sdPlus), 12)}${entry.n ?? 'undefined, fewer than 2 paired'}\n`
  }
  text += `planned n: ${result.n ?? 'undefined'} (the largest of the three and the pilot's instance_count ${result.config.instance_count})`
  text += result.mainInstances === null ? '\n' : ` · main run ⌈n / 0.9⌉ = ${result.mainInstances} instances, ${result.attempts} attempts at k ${result.k}\n`
  return `${text}planning only: this output carries no verdict.\n`
}

// Decision 8 as amended (T4): the one file this scorer writes, and the only keys it may hold. A key is a nested
// schema or the type of its leaf: a number (or null), a boolean, a string, or a list of strings. Nothing per
// instance — no row, difference or instance list — has a key here, and a key not listed refuses the write.
const COUNT_KEYS = { resolved: 'number', falseCompletion: 'number', underClaim: 'number', done: 'number', brokeTests: 'number' }
const RATE_KEYS = { falseCompletion: 'number', resolve: 'number', underClaim: 'number', done: 'number', brokeTests: 'number' }
const CELL_KEYS = {
  recorded: 'number', unrun: 'number', missing: 'number', judged: 'number', unreadable: 'number', readable: 'number',
  counts: COUNT_KEYS, rates: RATE_KEYS, unresolvedGivenDone: 'number',
}
const PAIRED_KEYS = { paired: 'number', unpaired: 'number', mean: 'number' }
const BOUND_KEYS = { p5: 'number', p95: 'number' }

/** The verdict file's allow list. */
export const VERDICT_KEYS = {
  verdict: 'string',
  reasons: 'strings',
  guard: 'strings',
  instances: { scored: 'number', pool: 'number' },
  arms: { with: CELL_KEYS, without: CELL_KEYS },
  paired: { falseCompletion: PAIRED_KEYS, resolve: PAIRED_KEYS, underClaim: PAIRED_KEYS },
  permutation: { p: 'number', exact: 'boolean', nonzero: 'number' },
  bootstrap: { resolve: BOUND_KEYS, underClaim: BOUND_KEYS },
  prereg_sha256: 'string',
  scorer_blob_sha: 'string',
}

const LEAVES = {
  number: value => value === null || (typeof value === 'number' && Number.isFinite(value)),
  boolean: value => typeof value === 'boolean',
  string: value => typeof value === 'string',
  strings: value => Array.isArray(value) && value.every(item => typeof item === 'string'),
}

/** The first key of `value` the allow list does not hold, or whose value is not its type, as a dotted path; else null. */
export function strayKey(value, schema = VERDICT_KEYS, at = '') {
  for (const [key, inner] of Object.entries(value)) {
    const where = at ? `${at}.${key}` : key
    if (!Object.hasOwn(schema, key)) return where
    const rule = schema[key]
    if (isObject(rule)) {
      if (!isObject(inner)) return where
      const deeper = strayKey(inner, rule, where)
      if (deeper) return deeper
    } else if (!LEAVES[rule](inner)) return where
  }
  return null
}

/** The object --verdict-out writes, built from the aggregates of a scored result and nothing else. */
export function verdictFile(result, { preregSha256, scorerBlobSha }) {
  const cells = side => {
    const cell = result.arms[side]
    return {
      recorded: cell.recorded, unrun: cell.unrun, missing: cell.missing, judged: cell.judged, unreadable: cell.unreadable,
      readable: cell.readable, counts: { ...cell.counts }, rates: { ...cell.rates }, unresolvedGivenDone: cell.unresolvedGivenDone,
    }
  }
  const pairedOf = metric => {
    const { paired, unpaired, mean } = result.metrics[metric]
    return { paired, unpaired, mean }
  }
  return {
    verdict: result.verdict,
    reasons: [...result.reasons],
    guard: [...result.guard],
    instances: { scored: result.instanceCount, pool: result.poolCount },
    arms: { with: cells('with'), without: cells('without') },
    paired: Object.fromEntries(METRICS.map(metric => [metric, pairedOf(metric)])),
    permutation: { p: result.permutation.p, exact: result.permutation.exact, nonzero: result.permutation.nonzero },
    bootstrap: { resolve: { ...result.bootstrap.resolve }, underClaim: { ...result.bootstrap.underClaim } },
    prereg_sha256: preregSha256,
    scorer_blob_sha: scorerBlobSha,
  }
}

/** Write the verdict file, or refuse: a key outside the allow list writes nothing, is named on stderr, and exits 2. */
export function writeVerdict(object, file) {
  const stray = isObject(object) ? strayKey(object) : '(the whole value, which is not an object)'
  if (stray) {
    process.stderr.write(`eval-paired: refused to write ${file}: the key ${stray} is not in the verdict file's allow list; nothing was written\n`)
    return 2
  }
  try { writeFileSync(file, JSON.stringify(object, null, 2) + '\n', 'utf8') } catch (error) {
    process.stderr.write(`eval-paired: could not write the verdict file ${file} (${error.code ?? error.message})\n`)
    return 2
  }
  return 0
}

// Git's blob sha of these bytes: sha1 over "blob <length>\0" and the bytes.
const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')

const HELP = `eval-paired.mjs — ADR-106's paired scorer.

usage: eval-paired.mjs --prereg <json> [--pool <list>] --instances <list> [--disjoint-from <list>] <rows.jsonl>
       eval-paired.mjs --plan [--instances <list>] [--with <arm>] [--without <arm>] <rows.jsonl>

  --prereg <json>          the committed pre-registration
  --pool <list>            the frozen pool, one instance id per line; its sha256 (ids joined by "\\n", no
                           trailing newline) must be the pre-registered instance_list_sha256
  --instances <list>       the scored instances: with --pool, a prefix of the pool in its order, of length
                           min(block_size·L, pool length) for a whole L ≥ 1 (the last block may be partial);
                           without --pool, the instance list is the pool and its own sha256 must match
  --disjoint-from <list>   a list (the pilot's) the scored instances must not share an id with
  --plan                   pilot rows: no pre-registration; prints each SD, its 80% upper bound and planned n
  --with, --without <arm>  with --plan, the arm names (default "with" and "without")
  --verdict-out <file>     scoring only, refused with --plan: write the aggregate verdict file described below

rows: line 1 {"config": {...}} carrying the fields below, n, status_line_sha256, exporter and canary
(passed iff canary.pass is true); then one row per run:
  {"instance", "arm", "repeat", "status": "done" | "not done" | anything else = unreadable,
   "resolved", "brokeTests", "limit", "unrun"}

pre-registration: ${DECISION_2_FIELDS.join(', ')},
present and equal in the config line; and, in the pre-registration only, alpha (default ${DEFAULT_ALPHA}),
arms {"with", "without"} (default "with" and "without"), block_size (default ${DEFAULT_BLOCK}), and optionally n:
"fewer than n paired" applies only when n is there; the 90% rule counts the scored instances either way.
These four are never compared with the config line, whose n is informational.

verdict words, in the order they are decided: ${VERDICTS.inconclusive}, ${VERDICTS.guard}, ${VERDICTS.shown}, ${VERDICTS.notShown}.
It exits 0 whatever it finds; a file it cannot read is a missing measurement.

verdict file (--verdict-out): one JSON object holding the aggregate only, under exactly these keys:
${Object.keys(VERDICT_KEYS).join(', ')};
instances holds ${Object.keys(VERDICT_KEYS.instances).join(', ')}; arms.with and arms.without hold ${Object.keys(CELL_KEYS).join(', ')};
paired.<metric> holds ${Object.keys(PAIRED_KEYS).join(', ')}; bootstrap.<metric> holds ${Object.keys(BOUND_KEYS).join(', ')}.
No row, per-instance difference or instance list is written. A key outside this list refuses the write: nothing
is written, the key is named on stderr, and the scorer exits 2.
`

function usage(message) {
  process.stderr.write(`${message}\nusage: eval-paired.mjs --prereg <json> [--pool <list>] --instances <list> [--disjoint-from <list>] <rows.jsonl>\n`
    + '       eval-paired.mjs --plan [--instances <list>] [--with <arm>] [--without <arm>] <rows.jsonl>\n')
  return 2
}

const VALUED = new Set(['--prereg', '--pool', '--instances', '--disjoint-from', '--with', '--without', '--verdict-out'])

export function main(argv = [], cwd = process.cwd()) {
  const options = {}
  const positional = []
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') { process.stdout.write(HELP); return 0 }
    if (arg === '--plan') { options.plan = true; continue }
    if (VALUED.has(arg)) {
      if (index + 1 >= argv.length) return usage(`${arg} needs a value`)
      options[arg.slice(2)] = argv[++index]
      continue
    }
    if (arg.startsWith('-')) return usage(`unknown option: ${arg}`)
    positional.push(arg)
  }
  if (positional.length !== 1) return usage('name exactly one rows file')
  if (options.plan && (options.prereg || options.pool || options['disjoint-from'])) return usage('--plan takes no --prereg, --pool or --disjoint-from')
  if (options.plan && options['verdict-out'] !== undefined) return usage('--verdict-out is refused with --plan: a pilot has no verdict')
  if (!options.plan && !(options.prereg && options.instances)) return usage('scoring needs --prereg and --instances')
  if (!options.plan && (options.with || options.without)) return usage('--with and --without are for --plan; scoring takes the arms from the pre-registration')

  const texts = {}
  let preregBytes = null
  for (const [key, label, file] of [['rows', 'rows', positional[0]], ['prereg', 'pre-registration', options.prereg],
    ['pool', 'pool', options.pool], ['instances', 'instance list', options.instances], ['disjoint', '--disjoint-from list', options['disjoint-from']]]) {
    if (file === undefined) continue
    try {
      const bytes = readFileSync(path.resolve(cwd, file))
      texts[key] = bytes.toString('utf8')
      if (key === 'prereg') preregBytes = bytes
    } catch (error) {
      process.stdout.write(`missing measurement: could not read the ${label} ${file} (${error.code ?? error.message}). `
        + 'This is "I could not look", not a result.\n')
      return 0
    }
  }
  if (options.plan) {
    const arms = { with: options.with ?? 'with', without: options.without ?? 'without' }
    process.stdout.write(`eval-paired --plan · ${positional[0]}\n` + renderPlan(plan({ rowsText: texts.rows, instancesText: texts.instances, arms })))
    return 0
  }
  let prereg
  try { prereg = JSON.parse(texts.prereg) } catch { prereg = null }
  if (!isObject(prereg)) {
    process.stdout.write(`missing measurement: the pre-registration ${options.prereg} is not a JSON object. This is "I could not look", not a result.\n`)
    return 0
  }
  const result = score({ prereg, rowsText: texts.rows, poolText: texts.pool, instancesText: texts.instances, disjointText: texts.disjoint })
  const provenance = {
    preregSha256: createHash('sha256').update(preregBytes).digest('hex'),
    scorerBlobSha: blobSha(readFileSync(fileURLToPath(import.meta.url))),
  }
  process.stdout.write(`eval-paired · ${positional[0]} against ${options.prereg}\n` + renderScore(result, provenance))
  if (options['verdict-out'] === undefined) return 0
  return writeVerdict(verdictFile(result, provenance), path.resolve(cwd, options['verdict-out']))
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
