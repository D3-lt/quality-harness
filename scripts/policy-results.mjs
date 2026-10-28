#!/usr/bin/env node
// Publish only generated-fixture counts/digests; raw logs and directories stay private.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
}
const stats = values => values.every(Number.isFinite) && values.length
  ? { samples: values, median: median(values), min: Math.min(...values), max: Math.max(...values) } : null
const cpu = report => Number.isFinite(report.resources?.userCpuMs) && Number.isFinite(report.resources?.systemCpuMs)
  ? report.resources.userCpuMs + report.resources.systemCpuMs : null
function inputs(root, prefix, name) {
  return readdirSync(root).filter(dir => dir.startsWith(prefix)).flatMap(dir => {
    const file = path.join(root, dir, name)
    return existsSync(file) ? [JSON.parse(readFileSync(file, 'utf8'))] : []
  })
}
export function policyResults(root) {
  const attempts = inputs(root, 'block-', 'block.json')
  const valid = attempts.filter(block => block.reports.length === 8 && block.reports.every(report => report.load.contended === false))
  assert.deepEqual(valid.map(block => block.block).sort(), [0, 1, 2, 3, 4], 'five complete preregistered blocks are required')
  const rows = valid.flatMap(block => block.reports)
  assert.ok(rows.every(report => report.context.coverage.status === 'complete'
    && report.events.reduce((sum, event) => sum + event.registrations, 0) === 32), 'context or registry coverage incomplete')
  const summaries = []
  for (const corpus of ['governed', 'empty']) for (const label of ['A', 'B', 'C', 'D']) {
    const samples = rows.filter(report => report.corpus === corpus && report.label === label)
    assert.equal(samples.length, 5)
    assert.equal(new Set(samples.map(report => report.fixtureSha256)).size, 1)
    assert.equal(new Set(samples.map(report => report.readersSha256)).size, 1)
    summaries.push({ corpus, label, pluginVersion: samples[0].pluginVersion,
      readersSha256: samples[0].readersSha256, nativeSources: samples[0].nativeSources,
      binarySha256: samples[0].binarySha256, fixtureSha256: samples[0].fixtureSha256,
      modelCharacters: stats(samples.map(report => report.context.totals.observedModel.characters)),
      modelBytes: stats(samples.map(report => report.context.totals.observedModel.bytes)),
      checkExecutions: samples.map(report => report.checkExecutions),
      tracedHookWallMs: stats(samples.map(report => report.hookWallMs)),
      tracedRootWaitedCpuMs: stats(samples.map(cpu)),
      completionReceiptWaitMs: stats(samples.map(report => report.waitMs)) })
  }
  const pairs = inputs(root, 'launcher-pair-', 'pair.json')
    .filter(pair => pair.reports.length === 4 && pair.reports.every(report => report.load.contended === false))
  assert.deepEqual(pairs.map(pair => pair.pair).sort(), [0, 1, 2, 3, 4])
  const launcher = ['governed', 'empty'].map(corpus => {
    const samples = pairs.map(pair => {
      const before = pair.reports.find(report => report.corpus === corpus && report.launcher === 'L0')
      const after = pair.reports.find(report => report.corpus === corpus && report.launcher === 'L1')
      assert.equal(before.fixtureSha256, after.fixtureSha256)
      assert.equal(before.binarySha256, after.binarySha256)
      assert.deepEqual(before.context.totals.observedModel, after.context.totals.observedModel)
      return { pair: pair.pair, beforeWallMs: before.hookWallMs, afterWallMs: after.hookWallMs,
        wallRatio: after.hookWallMs / before.hookWallMs, beforeRootWaitedCpuMs: cpu(before),
        afterRootWaitedCpuMs: cpu(after), cpuRatio: cpu(before) && cpu(after) ? cpu(after) / cpu(before) : null,
        modelCharacters: before.context.totals.observedModel.characters }
    })
    return { corpus, samples, pairedWallRatio: stats(samples.map(row => row.wallRatio)),
      pairedRootWaitedCpuRatio: stats(samples.map(row => row.cpuRatio)) }
  })
  return { schema: 'quality-harness-cost-results-v1', date: '2026-10-29',
    protocols: ['docs/adr/ADR-131-native-reader-identity-and-measured-cost/protocol.md',
      'docs/adr/ADR-131-native-reader-identity-and-measured-cost/launcher-protocol.md'],
    revisions: valid[0].revisions, validBlocks: valid.length, rejectedBlocks: attempts.length - valid.length,
    registeredCommandsPerReplay: 32, summaries, launcher,
    launcherIdentity: pairs[0] && { binarySha256: pairs[0].binarySha256, nativeSources: pairs[0].nativeSources,
      readers: pairs[0].readers, onlyDifference: pairs[0].onlyDifference },
    limits: ['Synthetic host routing; actual adopter confirmation pending.',
      'CPU is root waited-subtree only, partial; detached work and shell-internal process coverage are unavailable.',
      'Traced controls include observer overhead. Launcher pairs disable process instrumentation.',
      'Completion-receipt waits are harness synchronization, not user quiet-machine waiting.',
      'Overlapping timing ranges and CPU variation do not prove a CPU speedup.',
      'Raw transcripts, process traces and generated absolute paths are not published.'] }
}
if (isMainModule(import.meta.url)) {
  const [root] = process.argv.slice(2)
  if (!root) { process.stderr.write('usage: policy-results.mjs <private-experiment-root>\n'); process.exitCode = 2 }
  else process.stdout.write(JSON.stringify(policyResults(path.resolve(root)), null, 2) + '\n')
}
