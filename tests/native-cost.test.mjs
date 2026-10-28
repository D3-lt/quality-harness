import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { measure, render } from '../scripts/hook-cost.mjs'
import { sourceCore } from './helpers/source-core.mjs'
import { remove } from './helpers/remove.mjs'

test('hook-cost observes every registered native SessionStart hook and labels partial process coverage', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh-native-cost-'))
  t.after(() => remove(top))
  const repo = path.join(top, 'repo')
  mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q', repo], { timeout: 10_000, windowsHide: true }).status, 0)
  const before = process.env.QUALITY_HARNESS_QH_BIN
  process.env.QUALITY_HARNESS_QH_BIN = sourceCore()
  t.after(() => before === undefined ? delete process.env.QUALITY_HARNESS_QH_BIN : process.env.QUALITY_HARNESS_QH_BIN = before)
  const report = measure({ event: 'SessionStart', repository: repo, inPlace: true, timeoutSeconds: 20,
    plugin: fileURLToPath(new URL('../plugin/', import.meta.url)) })
  assert.equal(report.scope, 'registered-chain', JSON.stringify(report))
  assert.equal(report.first.registrations.length, 2)
  assert.ok(report.first.registrations.every(row => row.exit === 0), JSON.stringify(report.first))
  assert.ok(report.first.processes.starts > 0)
  assert.equal(report.first.processes.coverage, 'partial')
  assert.equal(report.observerOff.processes.coverage, 'unknown')
  assert.equal(report.children, null, 'a native child total with incomplete coverage is not zero')
  assert.match(render(report), /2 registrations/)
  assert.match(render(report), /partial/)
})

test('a registered command that could not start never reports a successful sample', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh-cost-unavailable-'))
  t.after(() => remove(top))
  const mini = path.join(top, 'plugin')
  mkdirSync(path.join(mini, '.claude-plugin'), { recursive: true })
  mkdirSync(path.join(mini, 'hooks'))
  writeFileSync(path.join(mini, '.claude-plugin', 'plugin.json'), '{"version":"3.8.61"}\n')
  writeFileSync(path.join(mini, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [
    { command: 'qh-absent-observer-control-command', args: [], timeout: 1 },
  ] }] } }))
  const report = measure({ event: 'Stop', repository: top, inPlace: true, plugin: mini, timeoutSeconds: 1 })
  assert.equal(report.first.exit, null, JSON.stringify(report))
  assert.equal(report.children, null)
  assert.ok(report.first.registrations[0].error)
})
