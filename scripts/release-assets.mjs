#!/usr/bin/env node
// Download the landing run's native assets and complete plugin bundle, then verify both.
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { releaseAssetFiles } from './core-release-assets.mjs'
import { PLUGIN_ARCHIVE, PLUGIN_RECEIPT, pluginBundle } from './build-plugin.mjs'

// Retained import contract for callers and historical acceptance tests.
export { releaseAssetFiles } from './core-release-assets.mjs'

export function releasePluginFiles(directory, assets, { at, run, root } = {}) {
  const file = path.join(directory, PLUGIN_ARCHIVE)
  if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify([PLUGIN_ARCHIVE, PLUGIN_RECEIPT].sort())
    || !lstatSync(file).isFile() || !lstatSync(path.join(directory, PLUGIN_RECEIPT)).isFile()) throw new Error('plugin archive artifact is incomplete or contains unexpected entries')
  const receipt = JSON.parse(readFileSync(path.join(directory, PLUGIN_RECEIPT), 'utf8'))
  const verified = pluginBundle(assets, file, { root, at, run, verify: true })
  if (Object.keys(receipt).length !== Object.keys(verified).length
    || !Object.entries(verified).every(([key, value]) => receipt[key] === value)) throw new Error('plugin archive receipt differs from verified bytes or source')
  return [file, path.join(directory, PLUGIN_RECEIPT)]
}
if (isMainModule(import.meta.url)) {
  try {
    const [runId, at] = process.argv.slice(2)
    if (!/^[1-9][0-9]*$/.test(runId ?? '') || !/^[a-f0-9]{40}$/.test(at ?? '')) {
      throw new Error('usage: release-assets.mjs <completed landing run id> <source sha>')
    }
    const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-release-assets-'))
    const downloaded = spawnSync('gh', ['run', 'download', runId, '--name', 'qh-core', '--dir', directory], { encoding: 'utf8', timeout: 120_000, windowsHide: true })
    if (downloaded.error || downloaded.status !== 0) throw new Error(`native assets could not be downloaded: ${downloaded.error?.message ?? downloaded.stderr}`)
    const native = releaseAssetFiles(directory, { at, run: runId })
    const bundles = mkdtempSync(path.join(os.tmpdir(), 'qh-release-plugin-'))
    const downloadedPlugin = spawnSync('gh', ['run', 'download', runId, '--name', 'qh-plugin', '--dir', bundles], { encoding: 'utf8', timeout: 120_000, windowsHide: true })
    if (downloadedPlugin.error || downloadedPlugin.status !== 0) throw new Error('plugin archive could not be downloaded: ' + (downloadedPlugin.error?.message ?? downloadedPlugin.stderr))
    process.stdout.write(JSON.stringify([...native, ...releasePluginFiles(bundles, directory, { at, run: runId })]) + '\n')
  } catch (error) {
    process.stderr.write(`release-assets: ${error.message}\n`)
    process.exitCode = 1
  }
}
