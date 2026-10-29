#!/usr/bin/env node
// Package only the release commit's plugin tree plus its verified native artifact.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { releaseAssetFiles } from './core-release-assets.mjs'
import { pythonArgv } from './python-interpreter.mjs'

export const PLUGIN_ARCHIVE = 'quality-harness.zip'
export const PLUGIN_RECEIPT = 'quality-harness.zip.json'
const repository = fileURLToPath(new URL('..', import.meta.url))

export function pluginBundle(assets, output, { root = repository, at, run, verify = false } = {}) {
  if (!/^[0-9a-f]{40}$/.test(at ?? '') || !/^[1-9][0-9]*$/.test(run ?? '')) throw new Error('plugin bundle requires a source commit and CI run')
  releaseAssetFiles(assets, { at, run })
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-plugin-source-'))
  const options = { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 1 << 20, windowsHide: true }
  try {
    const source = path.join(directory, 'plugin.tar')
    const git = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'tar.umask=0022', 'archive', '--format=tar', '--output', source, at + ':plugin'], options)
    if (git.error || git.status !== 0) throw new Error('plugin source could not be archived: ' + (git.error?.message ?? git.stderr))
    const [python, ...prefix] = pythonArgv()
    const packaged = spawnSync(python, [...prefix, fileURLToPath(new URL('plugin-bundle.py', import.meta.url)),
      verify ? 'verify' : 'build', source, path.resolve(assets), path.resolve(output)], options)
    if (packaged.error || packaged.status !== 0) throw new Error('plugin bundle did not verify: ' + (packaged.error?.message ?? packaged.stderr))
    const { version, files } = JSON.parse(packaged.stdout)
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('plugin bundle version is invalid')
    return { schema: 'qh-plugin-bundle-v1', version, at, run, files, sha256: createHash('sha256').update(readFileSync(output)).digest('hex') }
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 20 })
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const [assets, output] = process.argv.slice(2)
    if (!assets || !output) throw new Error('usage: build-plugin.mjs <native assets> <output.zip>')
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', timeout: 10_000, windowsHide: true })
    if (head.error || head.status !== 0) throw new Error('source commit could not be read')
    const receipt = pluginBundle(assets, output, { at: head.stdout.trim(), run: process.env.GITHUB_RUN_ID })
    writeFileSync(path.join(path.dirname(output), PLUGIN_RECEIPT), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
    process.stdout.write(JSON.stringify(receipt) + '\n')
  } catch (error) {
    process.stderr.write('build-plugin: ' + error.message + '\n')
    process.exitCode = 1
  }
}
