import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildReleaseAssets } from '../scripts/build-core.mjs'
import { releaseAssetFiles } from '../scripts/release-assets.mjs'
import { world } from './helpers/release-world.mjs'
import { remove } from './helpers/remove.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceIdentity = () => ({ at: 'a'.repeat(40), sources: 'b'.repeat(64) })
test('the workflow builds every target and names every asset, and a release missing one is not released', t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh assets '))
  t.after(() => remove(directory))
  const calls = []
  const run = (cmd, args, options) => {
    calls.push([cmd, args, options.env.GOOS, options.env.GOARCH])
    assert.equal(options.env.CGO_ENABLED, '0')
    assert.ok(args.includes('-trimpath'))
    assert.ok(args.includes('-s -w -X main.version=1.2.3'))
    writeFileSync(args[args.indexOf('-o') + 1], options.env.GOOS + '/' + options.env.GOARCH)
    return { status: 0 }
  }
  buildReleaseAssets(directory, { version: '1.2.3', run, sourceIdentity })
  const names = releaseAssetFiles(directory).map(file => path.basename(file)).sort()
  assert.deepEqual(names, ['SHA256SUMS.txt', 'qh-darwin-amd64', 'qh-darwin-arm64', 'qh-linux-amd64', 'qh-linux-arm64', 'qh-windows-amd64.exe'])
  assert.equal(calls.length, 5)
  const workflow = readFileSync(path.join(repo, '.github', 'workflows', 'selftest.yml'), 'utf8')
  assert.match(workflow, /node scripts\/build-core\.mjs --assets qh-assets/)
  assert.match(workflow, /name: qh-core/)
  rmSync(path.join(directory, 'qh-linux-amd64'))
  assert.throws(() => releaseAssetFiles(directory), /incomplete/)
  const missing = world({ assetFiles: ['qh-assets/SHA256SUMS.txt'] })
  assert.equal(missing.run(), 1)
  assert.ok(!missing.calls.some(call => call.startsWith('gh release create')))
})
test('a failed core build or an altered native asset is never released', t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-assets-'))
  t.after(() => remove(directory))
  assert.throws(() => buildReleaseAssets(directory, { version: '1.2.3', sourceIdentity, run: () => ({ status: 1, stderr: 'build failed' }) }), /build failed/)
  buildReleaseAssets(directory, { version: '1.2.3', sourceIdentity, run: (_cmd, args) => { writeFileSync(args[args.indexOf('-o') + 1], 'native'); return { status: 0 } } })

  writeFileSync(path.join(directory, 'qh-linux-amd64'), 'changed')
  assert.throws(() => releaseAssetFiles(directory), /checksum/)
})
