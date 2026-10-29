#!/usr/bin/env node
// Produce the marketplace pin only after the immutable public bundle can be downloaded and verified.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

async function download(request, url, limit, signal) {
  const response = await request(url, { signal })
  if (!response.ok) throw new Error('public bundle download answered HTTP ' + response.status)
  const chunks = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.byteLength
    if (bytes > limit) throw new Error('public bundle download exceeded its size bound')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function publishedArchive(version, { request = fetch } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('invalid plugin version')
  const signal = AbortSignal.timeout(60_000)
  const base = 'https://github.com/D3-lt/quality-harness/releases/download/v' + version + '/'
  const release = JSON.parse(await download(request, 'https://api.github.com/repos/D3-lt/quality-harness/releases/tags/v' + version, 1 << 20, signal))
  if (release.tag_name !== 'v' + version || release.draft !== false || release.prerelease !== false
    || !/^[0-9a-f]{40}$/.test(release.target_commitish ?? '')) throw new Error('bundle release is not public, final and bound to a source commit')
  const receipt = JSON.parse(await download(request, base + 'quality-harness.zip.json', 16 << 10, signal))
  if (receipt.schema !== 'qh-plugin-bundle-v1' || receipt.version !== version || receipt.at !== release.target_commitish
    || !/^[1-9][0-9]*$/.test(receipt.run ?? '') || !/^[0-9a-f]{64}$/.test(receipt.sha256 ?? '')
    || !Number.isSafeInteger(receipt.files) || receipt.files <= 0) throw new Error('public plugin receipt does not bind this release')
  const bytes = await download(request, base + 'quality-harness.zip', 64 << 20, signal)
  if (createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) throw new Error('public plugin archive checksum differs from its CI receipt')
  return { source: 'archive', url: base + 'quality-harness.zip', sha256: receipt.sha256 }
}

if (isMainModule(import.meta.url)) {
  try {
    const [version, mode] = process.argv.slice(2)
    if (process.argv.length > 4 || (mode !== undefined && mode !== '--check')) throw new Error('usage: marketplace-source.mjs <version> [--check]')
    const source = await publishedArchive(version)
    if (mode === '--check') {
      const marketplace = JSON.parse(await download(fetch,
        'https://raw.githubusercontent.com/D3-lt/quality-harness/main/.claude-plugin/marketplace.json', 1 << 20, AbortSignal.timeout(15_000)))
      const entry = marketplace.plugins?.find(plugin => plugin.name === 'quality-harness')
      const current = entry?.version === version && Object.keys(entry.source ?? {}).length === Object.keys(source).length
        && Object.entries(source).every(([key, value]) => entry.source[key] === value)
      process.stdout.write(current ? 'marketplace: published bundle is advertised\n' : 'marketplace: catalogue promotion is still pending\n')
      process.exitCode = current ? 0 : 2
    } else {
      const marketplace = JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8'))
      const entry = marketplace.plugins.find(plugin => plugin.name === 'quality-harness')
      if (!entry) throw new Error('quality-harness marketplace entry is missing')
      entry.source = source
      entry.version = version
      // The caller applies this result through mrw, then checks, commits and lands the metadata separately.
      process.stdout.write(JSON.stringify(marketplace, null, 2) + '\n')
    }
  } catch (error) {
    process.stderr.write('marketplace-source: ' + error.message + '\n')
    process.exitCode = 1
  }
}

