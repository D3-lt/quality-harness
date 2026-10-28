#!/usr/bin/env node
// Run one frozen ADR-131 block at a time. Preparation is separate; failed and
// contended attempts retain their private raw receipts.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sampleLoad } from '../plugin/scripts/load.mjs'
import { replay } from './policy-replay.mjs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

export const POLICY_ORDERS = ['ABCD', 'BCDA', 'CDAB', 'DCBA', 'BACD']
const revisions = { A: '55bf5fcf076bdf0f49541d70113306b0e093f6b8', B: '2933b680c74961667f63357030f2d498711e0e8c',
  C: 'a276b4d684f1f7d09f64aa8a142374bd2ae92903' }
const currentPlugin = fileURLToPath(new URL('../plugin/', import.meta.url))

export async function runBlock(privateRoot, index, { observe = true } = {}) {
  assert.ok(Number.isInteger(index) && index >= 0 && index < POLICY_ORDERS.length)
  const directory = mkdtempSync(path.join(path.resolve(privateRoot), (observe ? 'block-' : 'off-') + index + '-'))
  const controls = Object.fromEntries(['A', 'B', 'C', 'D'].map(label => [label, {
    plugin: label === 'D' ? currentPlugin : path.join(path.resolve(privateRoot), 'control-' + label, 'plugin'),
    binary: ['C', 'D'].includes(label) ? path.join(path.resolve(privateRoot), label === 'C' ? 'released-C' : 'candidate-D') : null,
  }]))
  for (const label of ['A', 'B', 'C']) {
    const found = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: path.dirname(controls[label].plugin),
      encoding: 'utf8', timeout: 10_000, windowsHide: true })
    assert.equal(found.status, 0, found.stderr)
    assert.equal(found.stdout.trim(), revisions[label], 'control revision moved')
  }
  const deadline = Date.now() + 10 * 60_000
  const rows = []
  for (const corpus of ['governed', 'empty']) for (const label of POLICY_ORDERS[index]) {
    assert.ok(Date.now() < deadline, 'block exceeded ten-minute budget')
    const load = sampleLoad()
    assert.ok(load.load !== null && load.cores !== null && load.load <= load.cores, 'machine is not known quiet; preserve this attempt and resume in a fresh block')
    const report = await replay({ ...controls[label], directory: path.join(directory, corpus + '-' + label),
      governed: corpus === 'governed', label, observe })
    rows.push(report)
    writeFileSync(path.join(directory, 'block.json'), JSON.stringify({ protocol: 'ADR-131-v1', block: index,
      order: POLICY_ORDERS[index], revisions, observe, reports: rows }, null, 2) + '\n')
    process.stdout.write(JSON.stringify({ block: index, corpus, label, hookWallMs: report.hookWallMs,
      modelCharacters: report.context.totals.observedModel.characters, checks: report.checkExecutions,
      load: report.load, contextCoverage: report.context.coverage.status }) + '\n')
    assert.equal(report.load.contended, false, 'contended sample retained, but timing block cannot count')
  }
  return { directory, rows }
}
if (isMainModule(import.meta.url)) {
  const [privateRoot, index, mode] = process.argv.slice(2)
  if (!privateRoot || !/^[0-4]$/.test(index ?? '') || mode !== undefined && mode !== '--observer-off') {
    process.stderr.write('usage: policy-batch.mjs <private-controls-root> <block 0..4> [--observer-off]\n')
    process.exitCode = 2
  } else await runBlock(privateRoot, Number(index), { observe: mode !== '--observer-off' })
}
