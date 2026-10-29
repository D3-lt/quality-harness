// Verify the complete native artifact before packaging, publishing or reading its provenance.
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { CORE_TARGETS, coreAsset } from '../plugin/scripts/core-assets.mjs'
import { parseCoreManifest } from '../plugin/scripts/native-provenance.mjs'

export function releaseAssetFiles(directory, { at = null, run = null } = {}) {
  const assets = CORE_TARGETS.map(([os, arch]) => coreAsset(os, arch))
  const expected = [...assets, 'SHA256SUMS.txt'].sort()
  if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(expected)) throw new Error('native release assets are incomplete or include an unexpected file')
  const manifest = parseCoreManifest(readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8'))
  for (const name of assets) {
    const file = path.join(directory, name)
    if (!lstatSync(file).isFile() || createHash('sha256').update(readFileSync(file)).digest('hex') !== manifest.sums[name]) throw new Error('native asset checksum does not verify: ' + name)
  }
  if ((at !== null || run !== null) && (manifest.source?.at !== at || manifest.source?.run !== run)) throw new Error('native assets do not bind the expected source commit and landing run')
  return expected.map(name => path.join(directory, name))
}

