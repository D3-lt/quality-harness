import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { main, observations, resultFiles, verdicts } from '../scripts/eval-deltas.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')

/**
 * A results tree in a temp directory, never the live one.
 *
 * The live tree is gitignored, so a test that read it would pass here and have
 * nothing to read in CI — a check whose answer depends on whose disk it runs on
 * (CLAUDE.md §8). Every assertion below is against a fixture this test wrote.
 */
function resultsTree(invocations) {
  const root = mkdtempSync(join(os.tmpdir(), 'eval-deltas-'))
  for (const [name, cases] of Object.entries(invocations)) {
    const dir = join(root, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'aggregate-result.json'), JSON.stringify({ cases }), 'utf8')
  }
  return root
}

const runs = scores => scores.map(score => ({ score }))

const say = () => {
  const written = []
  const real = process.stdout.write.bind(process.stdout)
  process.stdout.write = chunk => { written.push(String(chunk)); return true }
  return { done: () => { process.stdout.write = real; return written.join('') } }
}

test('both results trees are read, not just the one named results', () => {
  // The suite writes into `plugin/evals/results` AND
  // `plugin/evals/generated/cases/results`. The first version of this tool
  // defaulted to the former and silently dropped 7 of 25 recorded invocations,
  // five of them PAIRED invocations of one case — so the corpus looked smaller
  // and nothing said anything was missing. Found by a review comparing the
  // tool's count against the ad-hoc glob it replaced.
  const root = mkdtempSync(join(os.tmpdir(), 'eval-deltas-trees-'))
  for (const under of ['results/one', 'generated/cases/results/two']) {
    const dir = join(root, under)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'aggregate-result.json'),
      JSON.stringify({ cases: [{ name: 'probe', arms: { with: runs([1]), without: runs([0]) } }] }), 'utf8')
  }
  assert.equal(resultFiles(root).length, 2, 'a nested results tree is still a results tree')
})

test('a delta is computed within one invocation and never across two', () => {
  // The defect this file exists to prevent, and it was made here first: pooling a
  // with-arm recorded under `--ablation none` against a baseline from a different
  // run on a different day produced a confident +0.93 for a paragraph whose own
  // paired measurement was +0.00. The arms never met. Two invocations, one with a
  // with-arm only and one with a baseline only, must yield NO delta at all.
  const root = resultsTree({
    '2026-08-27T10-00-00-000Z': [{ name: 'probe', arms: { with: runs([0.9, 0.9]) } }],
    '2026-08-28T10-00-00-000Z': [{ name: 'probe', arms: { without: runs([0.0]) } }],
  })
  //
  // NOTE ON WHAT IS AND IS NOT MUTATION-COVERED, recorded because the catalogued
  // mutant here kills through an adjacent path. `deltas: a delta needs BOTH arms,
  // not one arm and a zero` makes a single-armed invocation fabricate a delta,
  // and this test goes red — but that is a different defect from cross-invocation
  // pooling. The cross-invocation guarantee is STRUCTURAL: `delta` is computed
  // inside the per-file loop from that file's own `entry.arms`, so no one-line
  // substitution can make two invocations' arms meet. A structural property has
  // no mutant, and claiming one would be worse than saying so here.
  const rows = observations(resultFiles(root))
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(row => row.delta), [null, null],
    'neither invocation ran both arms, so neither can produce a delta')
  const [probe] = verdicts(rows)
  assert.equal(probe.pairedInvocations, 0)
  assert.deepEqual(probe.deltas, [])
  assert.ok(probe.notes.some(note => note.startsWith('NO BASELINE')), probe.notes.join(' | '))

  // And the clean answer in the same test, so a report that says "cannot compare"
  // is shown able to say the other thing.
  const paired = resultsTree({
    '2026-08-28T10-00-00-000Z': [{ name: 'probe', arms: { with: runs([1, 1, 1]), without: runs([0.4, 0.4, 0.4]) } }],
  })
  const [computed] = verdicts(observations(resultFiles(paired)))
  assert.deepEqual(computed.deltas, [0.6], 'both arms in one invocation is a real delta')
  assert.equal(computed.pairedRuns, 3)
  assert.deepEqual(computed.notes, [], 'three runs per arm and one invocation carries no caveat')
})

test('a case whose with-arm swings across invocations is reported as bimodal', () => {
  // `gates-advise-never-block` is the live instance: nine paired invocations
  // whose deltas run from -1.00 to +0.20, with the with-arm alone spanning the
  // whole range. §36 quotes "Δ 0.00" from it as though that were the result.
  // §31 and §34 are two earlier instances of the same shape in this repository.
  const root = resultsTree({
    a: [{ name: 'flappy', arms: { with: runs([0]), without: runs([1]) } }],
    b: [{ name: 'flappy', arms: { with: runs([1]), without: runs([1]) } }],
    c: [{ name: 'steady', arms: { with: runs([0.6, 0.6]), without: runs([0.6, 0.6]) } }],
    d: [{ name: 'steady', arms: { with: runs([0.6, 0.6]), without: runs([0.6, 0.6]) } }],
  })
  const report = verdicts(observations(resultFiles(root)))
  const flappy = report.find(entry => entry.case === 'flappy')
  const steady = report.find(entry => entry.case === 'steady')
  assert.equal(flappy.spread, 1)
  assert.ok(flappy.notes.some(note => note.startsWith('BIMODAL')), flappy.notes.join(' | '))
  // The guard is not simply flagging everything, which would satisfy the
  // assertion above while measuring nothing.
  assert.equal(steady.spread, 0)
  assert.ok(!steady.notes.some(note => note.startsWith('BIMODAL')), steady.notes.join(' | '))
})

test('single-run arms are named as such rather than quoted as a measurement', () => {
  const root = resultsTree({
    a: [{ name: 'thin', arms: { with: runs([1]), without: runs([0]) } }],
  })
  const [thin] = verdicts(observations(resultFiles(root)))
  assert.deepEqual(thin.deltas, [1])
  assert.ok(thin.notes.some(note => note.startsWith('SINGLE-RUN ARMS')), thin.notes.join(' | '))
})

test('no results on this machine is could-not-look, never no-effect', () => {
  // The results tree is gitignored, so a fresh checkout has none. A report whose
  // ABSENCE reads as a finding is the failure ADR-005 is about, and it is the
  // likeliest way this tool would be misread: an empty run looks like a suite
  // that measured nothing rather than a suite that was never run here.
  const empty = mkdtempSync(join(os.tmpdir(), 'eval-deltas-none-'))
  let cap = say()
  let code
  try { code = main([join(empty, 'nowhere')]) } finally { var out = cap.done() }
  assert.equal(code, 0, 'it reads and judges nothing')
  assert.match(out, /could not look/i, out)
  assert.doesNotMatch(out, /\bΔ\b/, `it must not render a delta section it has no data for:\n${out}`)

  // A directory that exists and holds no reports is a third answer again.
  cap = say()
  try { main([empty]) } finally { out = cap.done() }
  assert.match(out, /holds no aggregate-result\.json/, out)

  // And --json says the same thing in a machine-readable way, rather than an
  // empty case list that a consumer would read as zero effect.
  cap = say()
  try { main(['--json', join(empty, 'nowhere')]) } finally { out = cap.done() }
  assert.equal(JSON.parse(out).read, null, `read: null means "not looked", not "read nothing":\n${out}`)
})

test('an unknown flag is refused rather than ignored', () => {
  // A gate that ignores a flag answers a question nobody asked — docs/BACKLOG.md §21.
  const noise = []
  const real = process.stderr.write.bind(process.stderr)
  process.stderr.write = chunk => { noise.push(String(chunk)); return true }
  let code
  try { code = main(['--nope']) } finally { process.stderr.write = real }
  assert.equal(code, 2)
  assert.match(noise.join(''), /unknown option: --nope/)
})

test('the derivation runs against this repository without depending on its results', () => {
  // It must not throw on the real tree, whether or not that tree exists here.
  const cap = say()
  let code
  let out
  try { code = main([], repoRoot) } finally { out = cap.done() }
  assert.equal(code, 0)
  assert.ok(out.length > 0, 'it always says something')
})
