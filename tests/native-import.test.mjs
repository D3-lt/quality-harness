import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { parseCoreManifest } from '../plugin/scripts/native-provenance.mjs'
import { coreManifest, nativeSourceIdentity } from '../scripts/native-source.mjs'
import { readerFingerprint, probeDigest } from '../plugin/scripts/corpus-probe.mjs'
import { CORE_TARGETS, coreAsset } from '../plugin/scripts/core-assets.mjs'
import { check } from '../scripts/attest-import.mjs'
import { loadNativeManifest } from '../scripts/native-manifest.mjs'
import { remove } from './helpers/remove.mjs'

const hash = text => createHash('sha256').update(text).digest('hex')

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh native import '))
  t.after(() => remove(root))
  const put = (name, value) => { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), value) }
  for (const name of ['plugin/bin/gate', 'plugin/lib/record.py', 'plugin/hooks/hooks.json', 'plugin/scripts/native-provenance.mjs',
    'plugin/scripts/corpus-probe.mjs', 'core/main.go', 'core/go.mod', 'scripts/build-core.mjs']) put(name, '// fixture\n')
  put('plugin/.claude-plugin/plugin.json', '{"version":"3.8.61"}\n')
  const git = (...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'native readers']]) assert.equal(git(...args).status, 0)
  const at = git('rev-parse', 'HEAD').stdout.trim()
  const sources = nativeSourceIdentity(root).sources
  const native = { look: 'ok', at, sources, run: '123', asset: 'qh-linux-amd64', sha256: hash('binary') }
  const record = { date: '2026-10-28', at, plugin: '3.8.61', kind: 'probe',
    probeSha256: probeDigest(() => readFileSync(path.join(root, 'plugin/scripts/corpus-probe.mjs'))),
    readers: readerFingerprint(path.join(root, 'plugin')).sha256, native,
    platform: 'Linux fixture', node: '24', python: '3', corpus: { records: 1, tasks: 0, taskDirectories: 0 },
    couldNotRun: 0, disagreements: 0, readinessUnproven: 0, runner: 'fixture', found: '' }
  const manifest = parseCoreManifest(coreManifest({ at, sources, run: '123' }, [[native.asset, native.sha256]]))
  return { root, record, manifest }
}

test('native attestation import verifies both committed sources and the named CI binary', t => {
  const { root, record, manifest } = fixture(t)
  let calls = 0
  const nativeManifest = (id, at) => { calls++; assert.equal(id, '123'); assert.equal(at, record.at); return { manifest } }
  const importing = value => check(JSON.stringify(value), root, { nativeManifest })
  assert.equal(importing(record).attestation.native.sha256, record.native.sha256)
  assert.equal(calls, 1)
  const missing = structuredClone(record)
  delete missing.native
  assert.match(importing(missing).refused.join(' '), /native readers require/)
  for (const native of [null, { ...record.native, extra: 'not evidence' }, { ...record.native, at: 'b'.repeat(40) },
    { ...record.native, run: ['123'] }, { ...record.native, sources: 'c'.repeat(64) }]) {
    const before = calls
    assert.ok(importing({ ...record, native }).refused, JSON.stringify(native))
    assert.equal(calls, before, 'invalid input must not cause an artifact download')
  }
  for (const native of [{ ...record.native, sha256: 'd'.repeat(64) }, { ...record.native, asset: 'qh-windows-amd64.exe' }]) {
    assert.match(importing({ ...record, native }).refused.join(' '), /landing CI manifest/)
  }
  const unavailable = check(JSON.stringify(record), root, { nativeManifest: () => ({ couldNotLook: 'network unavailable' }) })
  assert.equal(unavailable.couldNotLook, 'network unavailable')
})

test('native CI lookup checks the run revision, all artifact checksums and source header, then removes its scratch', () => {
  const at = 'a'.repeat(40), sources = 'b'.repeat(64), id = '123'
  const entries = CORE_TARGETS.map(([os, arch]) => [coreAsset(os, arch), hash(os + '/' + arch)])
  const manifest = coreManifest({ at, sources, run: id }, entries)
  let scratch
  const metadata = { id: Number(id), head_sha: at, status: 'completed', conclusion: 'success',
    path: '.github/workflows/selftest.yml', event: 'push', head_branch: 'land/' + at }
  const execute = (_cmd, args) => {
    if (args[0] === 'api') return { status: 0, stdout: JSON.stringify(metadata) }
    scratch = args[args.indexOf('--dir') + 1]
    writeFileSync(path.join(scratch, 'SHA256SUMS.txt'), manifest)
    for (const [os, arch] of CORE_TARGETS) writeFileSync(path.join(scratch, coreAsset(os, arch)), os + '/' + arch)
    return { status: 0 }
  }
  assert.equal(loadNativeManifest(id, at, { run: execute }).manifest.source.at, at)
  assert.equal(existsSync(scratch), false)
  const fromMetadata = changes => (cmd, args) => args[0] === 'api'
    ? { status: 0, stdout: JSON.stringify({ ...metadata, ...changes }) } : execute(cmd, args)
  for (const head_sha of ['c'.repeat(40), null]) {
    const answer = loadNativeManifest(id, at, { run: fromMetadata({ head_sha }) })
    assert.ok(answer.refused || answer.couldNotLook)
  }
  for (const stdout of ['null', '[]', '{}', 'not JSON']) {
    const answer = loadNativeManifest(id, at, { run: () => ({ status: 0, stdout }) })
    assert.equal(typeof answer.couldNotLook, 'string', stdout)
  }
  for (const changed of [{ id: 999 }, { path: '.github/workflows/other.yml' }, { event: 'pull_request' }, { head_branch: 'main' }]) {
    const answer = loadNativeManifest(id, at, { run: fromMetadata(changed) })
    assert.ok(answer.refused, JSON.stringify(changed))
  }
  for (const changed of [{ status: 'in_progress' }, { conclusion: 'failure' }]) {
    const answer = loadNativeManifest(id, at, { run: fromMetadata(changed) })
    assert.equal(typeof answer.couldNotLook, 'string')
  }

  const corrupt = (_cmd, args) => {
    const answer = execute(_cmd, args)
    if (args.includes('download')) writeFileSync(path.join(scratch, 'qh-linux-amd64'), 'tampered')
    return answer
  }
  assert.match(loadNativeManifest(id, at, { run: corrupt }).refused.join(' '), /checksums/)
  assert.equal(existsSync(scratch), false)
})
