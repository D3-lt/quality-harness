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


/**
 * BACKLOG §475.2: what gh says when a run holds no artifact of that name: none matches it, or every artifact of the run is
 * expired or gone (gh v2.105.0, pkg/cmd/run/download/download.go). Either way the artifact cannot be had from this run.
 */
export const artifactMissing = said => /no artifact matches any of the names or patterns provided|no valid artifacts found to download/.test(said)

/** The remedy for an artifact the judged attempt lacks: a re-run of every job makes them all under one attempt. */
export const missingArtifact = (runId, exact) => `run ${runId} has no artifact ${exact} available to download. `
  + `Re-run every job of the run (\`gh run rerun ${runId}\`) and wait for it, then run the release again`

/** One artifact of a run by its exact name, into `directory`; `options` reach gh (its working directory names the repository). */
export function downloadNamed(runId, exact, directory, run = spawnSync, options = {}) {
  const got = run('gh', ['run', 'download', String(runId), '--name', exact, '--dir', directory], { encoding: 'utf8', timeout: 120_000, windowsHide: true, ...options })
  if (!got.error && got.status === 0) return
  const said = String(got.error?.message ?? got.stderr ?? '').trim()
  throw new Error(artifactMissing(said) ? missingArtifact(runId, exact) : `${exact} could not be downloaded from run ${runId}: ${said}`)
}

/**
 * BACKLOG §475.2: one attempt's artifact of a run, by its exact name. The workflow names each released artifact with the
 * attempt that made it, since `gh run download --name` takes a run's first unexpired match, which after a re-run can be an
 * earlier attempt's. An attempt that is not a positive number asks gh nothing.
 */
export function downloadArtifact(runId, attempt, name, directory, run = spawnSync, options = {}) {
  if (!/^[1-9][0-9]*$/.test(String(attempt))) throw new Error(`the attempt of run ${runId} is not known (${attempt}), so no artifact of it is asked for`)
  downloadNamed(runId, `${name}-${attempt}`, directory, run, options)
}
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
    const [runId, at, attempt] = process.argv.slice(2)
    if (!/^[1-9][0-9]*$/.test(runId ?? '') || !/^[a-f0-9]{40}$/.test(at ?? '') || !/^[1-9][0-9]*$/.test(attempt ?? '')) {
      throw new Error('usage: release-assets.mjs <completed landing run id> <source sha> <the attempt release-evidence judged>')
    }
    const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-release-assets-'))
    downloadArtifact(runId, attempt, 'qh-core', directory)
    const native = releaseAssetFiles(directory, { at, run: runId })
    const bundles = mkdtempSync(path.join(os.tmpdir(), 'qh-release-plugin-'))
    downloadArtifact(runId, attempt, 'qh-plugin', bundles)
    process.stdout.write(JSON.stringify([...native, ...releasePluginFiles(bundles, directory, { at, run: runId })]) + '\n')
  } catch (error) {
    process.stderr.write(`release-assets: ${error.message}\n`)
    process.exitCode = 1
  }
}
