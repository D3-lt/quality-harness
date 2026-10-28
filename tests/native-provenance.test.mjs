import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { nativeBinaryIdentity, nativeIdentityOfRun, parseCoreManifest } from '../plugin/scripts/native-provenance.mjs'
import { coreManifest, nativeSourceIdentity, nativeSourcesAt, isNativeReaderPath } from '../scripts/native-source.mjs'
import { remove } from './helpers/remove.mjs'
import { installCore } from '../plugin/scripts/qh-fetch.mjs'
import { attestation } from '../plugin/scripts/corpus-probe.mjs'
import { buildReleaseAssets } from '../scripts/build-core.mjs'

import { releaseAssetFiles } from '../scripts/release-assets.mjs'
const at = 'a'.repeat(40), sources = 'b'.repeat(64), run = '123'
const bytes = Buffer.from('fixture native binary')
const sha = createHash('sha256').update(bytes).digest('hex')
const source = { at, sources, run }

test('native manifests bind source, run, target and actual executable bytes', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh native identity '))
  t.after(() => remove(root))
  const binary = path.join(root, 'custom.exe')
  writeFileSync(binary, bytes)
  const manifest = coreManifest(source, [['qh-windows-amd64.exe', sha]])
  writeFileSync(path.join(root, 'SHA256SUMS.txt'), manifest)
  const identity = () => nativeBinaryIdentity(binary, { platform: 'win32', arch: 'x64' })
  assert.deepEqual(identity(), { look: 'ok', ...source, asset: 'qh-windows-amd64.exe', sha256: sha })
  appendFileSync(binary, 'tampered')
  assert.equal(identity().look, 'UNPROVEN')
  writeFileSync(binary, bytes)
  assert.equal(nativeBinaryIdentity(binary, { platform: 'linux', arch: 'x64' }).look, 'UNPROVEN')
  writeFileSync(path.join(root, 'SHA256SUMS.txt'), sha + '  qh-windows-amd64.exe\n')
  assert.equal(identity().look, 'UNPROVEN', 'legacy checksum alone does not attest native sources')
  writeFileSync(path.join(root, 'SHA256SUMS.txt'), coreManifest({ ...source, at: null }, [['qh-windows-amd64.exe', sha]]))
  assert.equal(identity().look, 'UNPROVEN', 'uncommitted native build cannot name a source commit')
  writeFileSync(path.join(root, 'SHA256SUMS.txt'), coreManifest({ ...source, run: null }, [['qh-windows-amd64.exe', sha]]))
  assert.equal(identity().look, 'UNPROVEN', 'a local build is not a verified landing artifact')
})

test('native manifest parsing rejects malformed, duplicate and unknown identity', () => {
  const valid = coreManifest(source, [['qh-linux-amd64', sha]])
  assert.deepEqual(parseCoreManifest(valid.replaceAll('\n', '\r\n')).source, source)
  assert.equal(parseCoreManifest(sha + '  qh-linux-amd64\n').source, null)
  for (const text of [valid + valid, valid.replace('source-v1', 'source-v2'), valid.replace(at, '../bad'),
    valid.replace('qh-linux-amd64', '../qh-linux-amd64'), valid.replace(sha, 'g'.repeat(64)), '']) {
    assert.throws(() => parseCoreManifest(text), /native|checksum|manifest/)
  }
})

test('native source identity matches Git but does not hide untracked, edited or deleted production files', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh native source '))
  t.after(() => remove(root))
  const put = (file, value) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), value) }
  put('core/go.mod', 'module fixture\n')
  put('core/main.go', 'package main\n')
  put('core/main_test.go', 'package main\n')
  put('docs/README.md', 'documentation\n')
  put('scripts/build-core.mjs', 'export const flags = 1\n')
  const git = (...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'core.autocrlf=false', ...args], { cwd: root, timeout: 10_000, windowsHide: true })
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'native']]) assert.equal(git(...args).status, 0)
  const commit = String(git('rev-parse', 'HEAD').stdout).trim()
  const before = nativeSourceIdentity(root)
  assert.equal(before.at, commit)
  assert.equal(before.sources, nativeSourcesAt(git, commit))
  put('core/main_test.go', 'package main\n// test change\n')
  put('docs/README.md', 'changed docs\n')
  assert.deepEqual(nativeSourceIdentity(root), before)
  put('core/main.go', 'package main\r\n')
  assert.deepEqual(nativeSourceIdentity(root), before, 'LF normalization agrees with importer')
  put('core/extra.go', 'package main\n')
  const extra = nativeSourceIdentity(root)
  assert.equal(extra.at, null)
  assert.notEqual(extra.sources, before.sources)
  put('core/main.go', 'package main\n// production change\n')
  assert.notEqual(nativeSourceIdentity(root).sources, extra.sources)
  unlinkSync(path.join(root, 'core/main.go'))
  assert.equal(nativeSourceIdentity(root).sources, null, 'a deleted production file cannot name HEAD')
  put('core/main.go', 'package main\n')
  unlinkSync(path.join(root, 'core/extra.go'))
  put('.gitignore', 'core/ignored.go\n')
  put('core/ignored.go', 'package main\n// ignored but compiled\n')
  assert.equal(nativeSourceIdentity(root).at, null, 'Git ignore does not remove a compiler input')
  unlinkSync(path.join(root, 'core/ignored.go'))
  put('core/data.bin', Buffer.from([0xff, 0x0d, 0x0a, 0x00]))
  assert.equal(git('add', '-A').status, 0)
  assert.equal(git('commit', '-qm', 'binary input').status, 0)
  const binaryIdentity = nativeSourceIdentity(root)
  assert.equal(binaryIdentity.at, String(git('rev-parse', 'HEAD').stdout).trim())
  put('core/data.bin', Buffer.from([0xfe, 0x0d, 0x0a, 0x00]))
  assert.notEqual(nativeSourceIdentity(root).sources, binaryIdentity.sources, 'binary inputs are hashed as bytes')
  assert.equal(isNativeReaderPath('core\\main.go'), true)
  assert.equal(isNativeReaderPath('core\\main_test.go'), false)
})


test('native installation retains the fetched source manifest for the executed cache binary', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh native install '))
  t.after(() => remove(root))
  const manifest = coreManifest(source, [['qh-linux-amd64', sha]])
  const installed = await installCore({ version: '3.8.61', platform: 'linux', arch: 'x64', dataHome: root,
    request: async url => new Response(url.endsWith('SHA256SUMS.txt') ? manifest : bytes),
    run: () => ({ status: 0, stdout: 'qh version 3.8.61\n' }) })
  assert.equal(readFileSync(path.join(path.dirname(installed.binary), 'SHA256SUMS.txt'), 'utf8'), manifest)
  assert.equal(nativeBinaryIdentity(installed.binary, { platform: 'linux', arch: 'x64' }).sha256, sha)
})


test('attestation covers the actual stable native reader and compares native-only changes', () => {
  const native = { look: 'ok', ...source, asset: 'qh-linux-amd64', sha256: sha }
  const report = {
    probe: { version: '3.8.61', readers: { git: at, sha256: 'c'.repeat(64), dirty: false }, native },
    look: 'ok', corpora: ['fixture'], adrLint: [{ file: 'a.md', verdict: 'PASS' }],
    workNext: { records: 1, tasks: 1, readinessUnproven: [] }, adrNext: [],
    sessionStart: { exit: 0, lines: [] },
    couldNotRun: [], disagreements: [],
  }
  assert.equal(attestation(report, 'fixture').at, at)
  assert.deepEqual(attestation(report, 'fixture').native, native)
  const before = structuredClone(report)
  before.probe.native.sources = 'd'.repeat(64)
  assert.deepEqual(attestation(report, 'fixture', { since: before }).verdictChanges, { compared: 1, passToFail: 0, failToPass: 0 })
  assert.equal(attestation(report, 'fixture', { since: report }).verdictChanges, null)
  for (const changed of [{ ...native, at: 'f'.repeat(40) }, { look: 'UNPROVEN', reason: 'unread' },
    nativeIdentityOfRun(native, { ...native, sha256: 'e'.repeat(64) })]) {
    const unknown = attestation({ ...report, probe: { ...report.probe, native: changed } }, 'fixture')
    assert.equal(unknown.at, null)
    assert.match(unknown.atReason, /native/)
  }
  const legacy = structuredClone(report)
  delete legacy.probe.native
  assert.equal(attestation(legacy, 'legacy').at, at, 'historical plugin-only reports retain their original semantics')
})


test('release manifests bind a stable source snapshot and refuse changes during a build', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh native build '))
  t.after(() => remove(root))
  const run = (_cmd, args) => { writeFileSync(args[args.indexOf('-o') + 1], bytes); return { status: 0 } }
  buildReleaseAssets(root, { version: '3.8.61', run, landingRun: source.run, sourceIdentity: () => source })
  assert.deepEqual(parseCoreManifest(readFileSync(path.join(root, 'SHA256SUMS.txt'), 'utf8')).source, source)
  assert.equal(releaseAssetFiles(root, { at: source.at, run: source.run }).length, 6)
  for (const expected of [{ at: 'f'.repeat(40), run: source.run }, { at: source.at, run: '999' }]) {
    assert.throws(() => releaseAssetFiles(root, expected), /expected source commit and landing run/)
  }
  let reads = 0
  assert.throws(() => buildReleaseAssets(root, { version: '3.8.61', run, landingRun: source.run,
    sourceIdentity: () => ++reads === 1 ? source : { ...source, sources: 'd'.repeat(64) } }), /sources changed/)
})

test('native version metadata has a stable checkout representation', () => {
  const repoRoot = new URL('../', import.meta.url)
  const attr = spawnSync('git', ['check-attr', 'eol', '--', 'plugin/.claude-plugin/plugin.json', 'LICENSE'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(attr.status, 0, attr.stderr)
  assert.match(attr.stdout, /plugin\.json: eol: lf/)
  assert.match(attr.stdout, /LICENSE: eol: unspecified/, 'the attribute query can distinguish an unpinned file')
})
