#!/usr/bin/env node
// The with/without table, read out of an eval run's own aggregate-result.json.
//
// This is the ONLY measurement in this project that has a control arm. Everything
// else — mutation kills, verification entries, corpus size — describes a corpus
// that used the lifecycle, with nothing to compare it against. A number without a
// baseline cannot tell a plugin that works from a model that would have answered
// well anyway, so those numbers are descriptive and this one is evidential.
//
//   node scripts/eval-compare.mjs [path/to/aggregate-result.json]
//
// With no argument it takes the newest run under plugin/evals/results/ or
// evals/results/ — both are gitignored, so what it reads is whatever YOU ran.
//
// ⚠ IT REPORTS COST AND TURNS BESIDE THE SCORE ON PURPOSE. The lifecycle's whole
// proposition is that it buys correctness with effort, and a table showing only
// the delta would be the benefits-only page this project tells you not to trust.
//
// ⚠ A RUN THAT ERRORED SCORES 0.00, AND 0.00 IS ALSO A REAL SCORE. Measured
// 2026-09-03: every case on this machine reported `Δ 0.00` after failing to start
// (a Docker credential-store symlink blocks the Bash sandbox), and the suite line
// still read `mean Δ 0.00` — indistinguishable from a measured no-effect. This
// script separates them: an arm carrying an `error` is counted as UNRUN and never
// folded into a mean, because "I could not look" is not "there was no difference".

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

function newestRun() {
  const roots = [join(repoRoot, 'plugin', 'evals', 'results'), join(repoRoot, 'evals', 'results')]
  const runs = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      const file = join(root, name, 'aggregate-result.json')
      if (existsSync(file)) runs.push({ name, file })
    }
  }
  runs.sort((a, b) => a.name.localeCompare(b.name))
  return runs.at(-1)?.file ?? null
}

/** Split a case's arms into what actually ran and what only reported. */
export function armSummary(runs = []) {
  const ran = runs.filter(r => !r.error)
  const unrun = runs.length - ran.length
  return {
    unrun,
    turns: ran.reduce((n, r) => n + (r.turns ?? 0), 0),
    cost: ran.reduce((n, r) => n + (r.costUsd ?? 0), 0),
  }
}

function main() {
  const file = process.argv[2] ?? newestRun()
  if (!file) {
    console.log('no eval run found under plugin/evals/results/ or evals/results/.')
    console.log('run one first:  claude plugin eval --runs 1 --allow-tools Bash ./plugin')
    return
  }
  const d = JSON.parse(readFileSync(file, 'utf8'))
  const rows = []
  let unrunTotal = 0
  let tW = 0
  let tWo = 0
  let cost = 0
  const deltas = []

  for (const c of d.cases ?? []) {
    const w = armSummary(c.arms?.with)
    const wo = armSummary(c.arms?.without)
    const ag = c.aggregates ?? {}
    const dead = w.unrun + wo.unrun
    unrunTotal += dead
    if (dead === 0) deltas.push(ag.delta ?? 0)
    tW += w.turns
    tWo += wo.turns
    cost += w.cost + wo.cost
    rows.push({
      name: c.name,
      with: ag.score ?? 0,
      without: ag.scoreWithout ?? 0,
      delta: ag.delta ?? 0,
      turnsW: w.turns,
      turnsWo: wo.turns,
      dead,
    })
  }

  console.log(`eval-compare · ${file.replace(repoRoot + '/', '')}`)
  console.log(`claude ${d.claudeVersion ?? '?'} · ${d.durationSeconds ?? '?'}s · $${(d.costUsd ?? 0).toFixed(2)} · runs/case ${d.cases?.[0]?.runsPerCase ?? '?'}`)
  console.log('')
  console.log(`${'CASE'.padEnd(34)} ${'WITH'.padStart(5)} ${'W/OUT'.padStart(6)} ${'Δ'.padStart(6)}  ${'turns'.padStart(11)}`)
  for (const r of rows) {
    const turns = r.dead ? 'UNRUN' : `${r.turnsW} vs ${r.turnsWo}`
    const delta = r.dead ? '  —  ' : `${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2)}`
    const scores = r.dead ? `${'—'.padStart(5)} ${'—'.padStart(6)}` : `${r.with.toFixed(2).padStart(5)} ${r.without.toFixed(2).padStart(6)}`
    console.log(`${r.name.padEnd(34)} ${scores} ${delta.padStart(6)}  ${turns.padStart(11)}`)
  }
  console.log('')
  if (deltas.length === 0) {
    console.log('NOTHING RAN. Every arm carried an error, so there is no mean to report —')
    console.log('and a "mean Δ 0.00" here would say the plugin made no difference, which is')
    console.log('a claim about a measurement nobody took.')
  } else {
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length
    console.log(`mean Δ ${mean >= 0 ? '+' : ''}${mean.toFixed(3)} over ${deltas.length} case(s) that ran` +
      (unrunTotal ? `, ${unrunTotal} arm(s) UNRUN and excluded` : ''))
    console.log(`turns  with ${tW}  ·  without ${tWo}` +
      (tWo ? `  ·  ${(tW / tWo).toFixed(2)}x` : ''))
    console.log(`cost   $${cost.toFixed(2)} across both arms`)
    console.log('')
    console.log('The turn ratio is the price. Read it beside the delta, not instead of it —')
    console.log('and note a zero delta means the baseline already scored full marks, i.e.')
    console.log('the model would have done it anyway. Those cases are the honest losses.')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
