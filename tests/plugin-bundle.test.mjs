import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pluginBundle, PLUGIN_ARCHIVE, PLUGIN_RECEIPT } from '../scripts/build-plugin.mjs'
import { releasePluginFiles } from '../scripts/release-assets.mjs'
import { coreManifest } from '../scripts/native-source.mjs'
import { CORE_TARGETS, coreAsset } from '../plugin/scripts/core-assets.mjs'
import { publishedArchive } from '../scripts/marketplace-source.mjs'
import { runPython } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'
import { world } from './helpers/release-world.mjs'

function fixture(t) {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh plugin bundle '))
  t.after(() => remove(top))
  const root = path.join(top, 'source'), assets = path.join(top, 'assets'), dist = path.join(top, 'dist')
  for (const dir of [path.join(root, 'plugin', '.claude-plugin'), assets, dist]) mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(root, 'plugin', '.claude-plugin', 'plugin.json'), '{"name":"quality-harness","version":"1.2.3"}\n')
  writeFileSync(path.join(root, 'plugin', 'README.md'), 'Only the committed plugin ships.\n')
  mkdirSync(path.join(root, 'plugin', 'agents'))
  writeFileSync(path.join(root, 'plugin', 'agents', 'qh-fixture.md'), 'A shipped agent fixture.\n')
  writeFileSync(path.join(root, 'private.txt'), 'repository-only')
  const git = (...args) => {
    const answer = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true })
    assert.equal(answer.status, 0, answer.stderr)
    return answer.stdout.trim()
  }
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture')
  git('add', '.'); git('commit', '-qm', 'fixture')
  const at = git('rev-parse', 'HEAD'), run = '123'
  const sums = CORE_TARGETS.map(([os, arch]) => {
    const name = coreAsset(os, arch), bytes = Buffer.from(name)
    writeFileSync(path.join(assets, name), bytes)
    return [name, createHash('sha256').update(bytes).digest('hex')]
  })
  writeFileSync(path.join(assets, 'SHA256SUMS.txt'), coreManifest({ at, sources: 'b'.repeat(64), run }, sums))
  // The release source stays frozen even when HEAD and the working tree move on.
  writeFileSync(path.join(root, 'plugin', 'README.md'), 'later commit')
  git('add', 'plugin/README.md'); git('commit', '-qm', 'later source')
  writeFileSync(path.join(root, 'plugin', 'README.md'), 'uncommitted edit')
  writeFileSync(path.join(root, 'plugin', 'private.txt'), 'untracked')
  return { top, root, assets, dist, at, run, git, output: path.join(dist, PLUGIN_ARCHIVE) }
}

test('the bundle contains exactly the committed plugin and all verified native targets with executable modes', t => {
  const f = fixture(t)
  const receipt = pluginBundle(f.assets, f.output, f)
  writeFileSync(path.join(f.dist, PLUGIN_RECEIPT), JSON.stringify(receipt))
  assert.deepEqual(releasePluginFiles(f.dist, f.assets, f), [f.output, path.join(f.dist, PLUGIN_RECEIPT)])
  assert.equal(receipt.files, 15)
  assert.equal(receipt.version, '1.2.3')
  const checked = runPython(['-c', [
    'import sys,zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as z:',
    ' assert z.read("README.md") == b"Only the committed plugin ships.\\n"',
    ' assert "private.txt" not in z.namelist()',
    ' assert "core" not in z.namelist()',
    ' assert z.getinfo("native/qh-darwin-arm64").external_attr >> 16 & 0o111 == 0o111',
    ' assert z.read("native/qh-windows-amd64.exe") == b"qh-windows-amd64.exe"',
  ].join('\n'), f.output], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(checked.status, 0, checked.stderr)
  assert.throws(() => pluginBundle(f.assets, f.output, { ...f, at: 'f'.repeat(40) }), /expected source commit/)
  writeFileSync(path.join(f.dist, PLUGIN_RECEIPT), JSON.stringify({ ...receipt, run: '456' }))
  assert.throws(() => releasePluginFiles(f.dist, f.assets, f), /receipt differs/)
  writeFileSync(path.join(f.assets, 'qh-linux-amd64'), 'altered native bytes')
  assert.throws(() => pluginBundle(f.assets, path.join(f.top, 'invalid.zip'), f), /checksum/)
})

test('missing, duplicate, injected, altered and nonexecutable archive entries are refused before release', t => {
  const f = fixture(t)
  pluginBundle(f.assets, f.output, f)
  for (const kind of ['missing', 'duplicate', 'injected', 'altered', 'mode', 'source']) {
    const changed = path.join(f.dist, kind + '.zip')
    copyFileSync(f.output, changed)
    const altered = runPython(['-c', [
      'import sys,zipfile',
      'file,kind=sys.argv[1:]',
      'with zipfile.ZipFile(file) as z: entries=[(i,z.read(i)) for i in z.infolist()]',
      'with zipfile.ZipFile(file,"w") as z:',
      ' for info,data in entries:',
      '  if info.filename=="native/qh-linux-amd64":',
      '   if kind=="missing": continue',
      '   if kind=="mode": info.external_attr=(0o100644 << 16)',
      '   if kind=="altered": data=data.upper()',
      '   if kind=="duplicate": z.writestr(info,data)',
      '  if kind=="source" and info.filename=="README.md": data=b"x"*len(data)',
      '  z.writestr(info,data)',
      ' if kind=="injected": z.writestr("../escape",b"injected")',
    ].join('\n'), changed, kind], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    assert.equal(altered.status, 0, altered.stderr)
    assert.throws(() => pluginBundle(f.assets, changed, { ...f, verify: true }), /archive/, kind)
  }
  const missing = world({ assetFiles: ['qh-assets/SHA256SUMS.txt'] })
  assert.equal(missing.run(), 1)
  assert.ok(!missing.calls.some(call => call.startsWith('gh release create')))
})

test('a marketplace pin is produced only for a complete public immutable bundle whose checksum verifies', async () => {
  const bytes = Buffer.from('published archive'), sha256 = createHash('sha256').update(bytes).digest('hex')
  const at = 'a'.repeat(40), version = '1.2.3', calls = []
  const release = { tag_name: 'v' + version, draft: false, prerelease: false, target_commitish: at }
  const receipt = { schema: 'qh-plugin-bundle-v1', at, version, run: '123', files: 13, sha256 }
  const request = async url => {
    calls.push(url)
    return new Response(url.includes('api.github.com') ? JSON.stringify(release)
      : url.endsWith('.json') ? JSON.stringify(receipt) : bytes)
  }
  const source = await publishedArchive(version, { request })
  assert.deepEqual(source, { source: 'archive', url: 'https://github.com/D3-lt/quality-harness/releases/download/v1.2.3/quality-harness.zip', sha256 })
  assert.equal(calls.length, 3)
  await assert.rejects(publishedArchive(version, { request: async () => new Response('', { status: 404 }) }), /HTTP 404/)
  release.draft = true
  await assert.rejects(publishedArchive(version, { request }), /public/)
  release.draft = false; receipt.at = 'b'.repeat(40)
  await assert.rejects(publishedArchive(version, { request }), /receipt/)
  receipt.at = at; receipt.sha256 = '0'.repeat(64)
  await assert.rejects(publishedArchive(version, { request }), /checksum/)
  await assert.rejects(publishedArchive(version, { request: async () => new Response('x'.repeat((1 << 20) + 1)) }), /size bound/)
})

function assertReleaseSource(entry) {
  assert.match(entry.version, /^\d+\.\d+\.\d+$/)
  const source = entry.source
  assert.equal(typeof source, 'object', 'a live checkout must not advertise an unpublished plugin version')
  if (source.source === 'archive') {
    assert.equal(source.url, 'https://github.com/D3-lt/quality-harness/releases/download/v' + entry.version + '/quality-harness.zip')
    assert.match(source.sha256, /^[0-9a-f]{64}$/)
    assert.deepEqual(Object.keys(source).sort(), ['sha256', 'source', 'url'])
  } else {
    // Initial migration and rollback may pin a previously published directory-based release.
    assert.equal(source.source, 'git-subdir')
    assert.equal(source.url, 'D3-lt/quality-harness')
    assert.equal(source.path, 'plugin')
    assert.equal(source.ref, 'v' + entry.version)
    assert.match(source.sha, /^[0-9a-f]{40}$/)
    assert.deepEqual(Object.keys(source).sort(), ['path', 'ref', 'sha', 'source', 'url'])
  }
}

test('the catalogue selects one immutable release package and cannot expose the repository or a live checkout', () => {
  const marketplace = JSON.parse(readFileSync(fileURLToPath(new URL('../.claude-plugin/marketplace.json', import.meta.url)), 'utf8'))
  const entries = marketplace.plugins.filter(entry => entry.name === 'quality-harness')
  assert.equal(entries.length, 1)
  assertReleaseSource(entries[0])
  for (const surface of ['.claude-plugin/plugin.json', 'README.md', 'agents', 'bin', 'evals', 'hooks/hooks.json', 'lib', 'scripts', 'skills', 'templates', 'workflows']) {
    assert.ok(existsSync(fileURLToPath(new URL('../plugin/' + surface, import.meta.url))), surface + ' remains in the product source')
  }
  for (const source of ['.', './plugin', { ...entries[0].source, path: '.' }]) {
    assert.throws(() => assertReleaseSource({ ...entries[0], source }))
  }
  assertReleaseSource({ version: '1.2.3', source: { source: 'archive',
    url: 'https://github.com/D3-lt/quality-harness/releases/download/v1.2.3/quality-harness.zip', sha256: 'a'.repeat(64) } })
})

test('a tracked file outside the declared plugin surfaces cannot enter a bundle', t => {
  const f = fixture(t)
  f.git('add', 'plugin/private.txt'); f.git('commit', '-qm', 'unexpected surface')
  f.at = f.git('rev-parse', 'HEAD')
  const manifest = path.join(f.assets, 'SHA256SUMS.txt')
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/^# qh-core-source-v1 [0-9a-f]{40}/, '# qh-core-source-v1 ' + f.at))
  assert.throws(() => pluginBundle(f.assets, f.output, f), /unsupported plugin source entry/)
})

test('a published release stays incomplete until the public catalogue advertises the verified bundle', () => {
  const pending = world({ marketplace: 2 })
  assert.equal(pending.run(), 2)
  assert.ok(pending.state.released)
  assert.match(pending.said.join('\n'), /published.*cold archive install/)
  const resumed = world({ tags: ['v1.0.1'], released: true, marketplace: 2 })
  assert.equal(resumed.run(), 2)
  assert.equal(resumed.calls.some(call => call.startsWith('gh release create')), false)
  const current = world({ tags: ['v1.0.1'], released: true, marketplace: 0 })
  assert.equal(current.run(), 0)
})

test('the marketplace CLI checks the public catalogue instead of trusting an unlanded local pin', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh marketplace cli '))
  t.after(() => remove(top))
  for (const dir of ['scripts', 'plugin/scripts', '.claude-plugin']) mkdirSync(path.join(top, dir), { recursive: true })
  for (const file of ['scripts/marketplace-source.mjs', 'plugin/scripts/main-module.mjs']) {
    copyFileSync(fileURLToPath(new URL('../' + file, import.meta.url)), path.join(top, file))
  }
  const version = '1.2.3', at = 'a'.repeat(40), bytes = 'published archive'
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const source = { source: 'archive', url: 'https://github.com/D3-lt/quality-harness/releases/download/v1.2.3/quality-harness.zip', sha256 }
  const current = { name: 'quality-harness', owner: { name: 'Fixture' }, plugins: [{ name: 'quality-harness', version, source }] }
  writeFileSync(path.join(top, '.claude-plugin', 'marketplace.json'), JSON.stringify(current))
  const preload = path.join(top, 'fetch.mjs')
  writeFileSync(preload, [
    'const current = JSON.parse(process.env.QH_PUBLIC_CATALOGUE)',
    'globalThis.fetch = async url => {',
    ' if (process.env.QH_PUBLIC_MISSING === "1") return new Response("", {status:404})',
    ' return new Response(url.includes("api.github.com") ? JSON.stringify(' + JSON.stringify({ tag_name: 'v' + version, target_commitish: at, draft: false, prerelease: false }) + ')',
    ' : url.includes("raw.githubusercontent.com") ? JSON.stringify(current)',
    ' : url.endsWith(".json") ? JSON.stringify(' + JSON.stringify({ schema: 'qh-plugin-bundle-v1', version, at, run: '123', files: 14, sha256 }) + ')',
    ' : ' + JSON.stringify(bytes) + ')',
    '}',
  ].join('\n'))
  const invoke = (catalogue, args, missing = '') => spawnSync(process.execPath,
    ['--import', preload, path.join(top, 'scripts', 'marketplace-source.mjs'), version, ...args],
    { encoding: 'utf8', timeout: 10_000, windowsHide: true,
      env: { ...process.env, QH_PUBLIC_CATALOGUE: JSON.stringify(catalogue), QH_PUBLIC_MISSING: missing } })
  const old = { ...current, plugins: [{ name: 'quality-harness', version: '1.2.2', source: './plugin' }] }
  const pending = invoke(old, ['--check'])
  assert.equal(pending.status, 2, pending.stderr)
  assert.match(pending.stdout, /pending/)
  const verified = invoke(current, ['--check'])
  assert.equal(verified.status, 0, verified.stderr)
  assert.match(verified.stdout, /advertised/)
  const failed = invoke(current, ['--check'], '1')
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /HTTP 404/)
  const generated = invoke(old, [])
  assert.equal(generated.status, 0, generated.stderr)
  assert.deepEqual(JSON.parse(generated.stdout), current)
})

test('archive packages retain eval-ignore and LF checkout anchors', t => {
  const f = fixture(t)
  for (const name of ['.gitignore', '.gitattributes']) {
    copyFileSync(fileURLToPath(new URL('../' + name, import.meta.url)), path.join(f.root, name))
  }
  f.git('config', 'core.excludesFile', os.devNull)
  const options = { cwd: f.root, encoding: 'utf8', timeout: 10_000, windowsHide: true }
  const ignored = spawnSync('git', ['check-ignore', '-q', 'plugin/evals/results/probe.json'], options)
  assert.equal(ignored.status, 0, 'eval results stay ignored under the product source')
  const ordinary = spawnSync('git', ['check-ignore', '-q', 'plugin/evals/probe.mjs'], options)
  assert.equal(ordinary.status, 1, 'an ordinary shipped eval is not ignored')
  assert.match(f.git('check-attr', 'eol', '--', 'plugin/bin/adr-lint'), /eol: lf$/)
  assert.match(f.git('check-attr', 'eol', '--', 'LICENSE'), /eol: unspecified$/)
})
