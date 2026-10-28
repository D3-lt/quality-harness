import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { probe } from '../plugin/scripts/corpus-probe.mjs'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'
import { coreManifest } from '../scripts/native-source.mjs'
import { sourceCore } from './helpers/source-core.mjs'
import { remove } from './helpers/remove.mjs'

test('corpus probe executes the absolute candidate it identifies while keeping state in scratch', t => {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-probe-selection-')))
  t.after(() => remove(top))
  const repo = path.join(top, 'corpus')
  mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q', repo], { timeout: 10_000, windowsHide: true }).status, 0)
  const asset = coreAsset(process.platform, process.arch)
  const candidate = path.join(top, asset)
  copyFileSync(sourceCore(), candidate)
  chmodSync(candidate, 0o755)
  const sha = createHash('sha256').update(readFileSync(candidate)).digest('hex')
  writeFileSync(path.join(top, 'SHA256SUMS.txt'), coreManifest({ at: 'a'.repeat(40), sources: 'b'.repeat(64), run: '123' }, [[asset, sha]]))
  // A different image at the child's relative path must never be selected.
  copyFileSync(process.execPath, path.join(repo, asset))
  const oldCwd = process.cwd()
  const keys = ['QUALITY_HARNESS_QH_BIN', 'CLAUDE_PLUGIN_DATA']
  const old = keys.map(key => process.env[key])
  t.after(() => {
    process.chdir(oldCwd)
    keys.forEach((key, i) => old[i] === undefined ? delete process.env[key] : process.env[key] = old[i])
  })
  process.chdir(top)
  process.env.QUALITY_HARNESS_QH_BIN = '.' + path.sep + asset
  let report = probe(repo, { timeoutMs: 10_000 })
  assert.equal(report.probe.native.sha256, sha)
  assert.equal(report.sessionStart?.exit, 0, JSON.stringify(report.couldNotRun))
  delete process.env.QUALITY_HARNESS_QH_BIN
  const data = path.join(top, 'installed')
  const version = JSON.parse(readFileSync(fileURLToPath(new URL('../plugin/.claude-plugin/plugin.json', import.meta.url)), 'utf8')).version
  const installed = path.join(data, 'qh', version)
  mkdirSync(installed, { recursive: true })
  copyFileSync(candidate, path.join(installed, asset))
  writeFileSync(path.join(installed, asset + '.sha256'), sha + '\n')
  copyFileSync(path.join(top, 'SHA256SUMS.txt'), path.join(installed, 'SHA256SUMS.txt'))
  process.env.CLAUDE_PLUGIN_DATA = data
  report = probe(repo, { timeoutMs: 10_000 })
  assert.equal(report.probe.native.sha256, sha)
  assert.equal(report.sessionStart?.exit, 0, JSON.stringify(report.couldNotRun))
})
