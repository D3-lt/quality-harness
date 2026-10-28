import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { probe, attestation } from '../plugin/scripts/corpus-probe.mjs'
import { nativeBinaryIdentity } from '../plugin/scripts/native-provenance.mjs'
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

test('a manifested native image that cannot execute cannot attest native coverage', t => {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-probe-execution-')))
  t.after(() => remove(top))
  const repo = path.join(top, 'corpus')
  mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q', repo], { timeout: 10_000, windowsHide: true }).status, 0)
  const asset = coreAsset(process.platform, process.arch), candidate = path.join(top, asset)
  const at = 'a'.repeat(40)
  const manifest = () => writeFileSync(path.join(top, 'SHA256SUMS.txt'), coreManifest({
    at, sources: 'b'.repeat(64), run: '123',
  }, [[asset, createHash('sha256').update(readFileSync(candidate)).digest('hex')]]))
  const previous = process.env.QUALITY_HARNESS_QH_BIN
  t.after(() => previous === undefined ? delete process.env.QUALITY_HARNESS_QH_BIN : process.env.QUALITY_HARNESS_QH_BIN = previous)
  copyFileSync(sourceCore(), candidate)
  process.env.QUALITY_HARNESS_QH_BIN = candidate
  chmodSync(candidate, 0o755)
  manifest()
  const vouch = (report, native = report.probe.native) => attestation({
    ...report, probe: { ...report.probe, native,
      readers: { ...report.probe.readers, git: at, dirty: false, moved: false } },
  }, 'fixture')
  const good = probe(repo, { timeoutMs: 10_000 })
  assert.equal(good.sessionStart?.exit, 0, JSON.stringify(good.couldNotRun))
  assert.equal(vouch(good).at, at, 'a successful native observation can attest')
  writeFileSync(candidate, 'This fixture is not an executable image.\n')
  manifest()
  const intact = nativeBinaryIdentity(candidate)
  assert.equal(intact.look, 'ok', 'the selected bytes still match their manifest')
  const failed = probe(repo, { timeoutMs: 10_000 })
  assert.equal(failed.sessionStart, null)
  assert.ok(failed.couldNotRun.some(row => row.reader === 'SessionStart'))
  assert.equal(vouch(failed, intact).at, null, 'manifest identity alone cannot vouch a failed invocation')
  assert.equal(vouch(failed, intact).look, 'UNPROVEN')
  assert.equal(failed.probe.native.look, 'UNPROVEN')
})
