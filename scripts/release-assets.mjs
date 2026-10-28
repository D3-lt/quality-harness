#!/usr/bin/env node
// Download the landing run's native assets, verify the complete set, then hand paths to release.mjs.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CORE_TARGETS, coreAsset } from '../plugin/scripts/core-assets.mjs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { parseCoreManifest } from '../plugin/scripts/native-provenance.mjs'

export function releaseAssetFiles(directory, { at = null, run = null } = {}) {
  const assets = CORE_TARGETS.map(([os, arch]) => coreAsset(os, arch))
  const expected = [...assets, 'SHA256SUMS.txt'].sort()
  const found = readdirSync(directory).sort()
  if (JSON.stringify(found) !== JSON.stringify(expected)) throw new Error('native release assets are incomplete or include an unexpected file')
  const manifest = readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8')
  for (const name of assets) {
    const entries = manifest.split(/\r?\n/).map(line => /^([a-f0-9]{64}) [ *](\S+)$/.exec(line)).filter(entry => entry?.[2] === name)
    const file = path.join(directory, name)
    if (entries.length !== 1 || !lstatSync(file).isFile() || createHash('sha256').update(readFileSync(file)).digest('hex') !== entries[0][1]) throw new Error(`native asset checksum does not verify: ${name}`)
  }
  if (at !== null || run !== null) {
    const source = parseCoreManifest(manifest).source
    if (source?.at !== at || source?.run !== run) throw new Error('native assets do not bind the expected source commit and landing run')
  }
  return expected.map(name => path.join(directory, name))
}
if (isMainModule(import.meta.url)) {
  try {
    const [runId, at] = process.argv.slice(2)
    if (!/^[1-9][0-9]*$/.test(runId ?? '') || (at !== undefined && !/^[a-f0-9]{40}$/.test(at))) {
      throw new Error('usage: release-assets.mjs <completed landing run id> [source sha]')
    }
    const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-release-assets-'))
    const downloaded = spawnSync('gh', ['run', 'download', runId, '--name', 'qh-core', '--dir', directory], { encoding: 'utf8', timeout: 120_000, windowsHide: true })
    if (downloaded.error || downloaded.status !== 0) throw new Error(`native assets could not be downloaded: ${downloaded.error?.message ?? downloaded.stderr}`)
    process.stdout.write(JSON.stringify(releaseAssetFiles(directory, at ? { at, run: runId } : {})) + '\n')
  } catch (error) {
    process.stderr.write(`release-assets: ${error.message}\n`)
    process.exitCode = 1
  }
}
