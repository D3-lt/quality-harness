#!/usr/bin/env node
// Build the same native core for source checks and release assets; binaries never enter the tracked tree.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORE_TARGETS, coreAsset } from '../plugin/scripts/core-assets.mjs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { coreManifest, nativeSourceIdentity } from './native-source.mjs'

const core = fileURLToPath(new URL('../core', import.meta.url))
export function buildCore({ goos, goarch, output, version, run = spawnSync }) {
  const answer = run('go', ['build', '-p', '2', '-trimpath', '-ldflags', `-s -w -X main.version=${version}`, '-o', output, './cmd/qh'], {
    cwd: core, encoding: 'utf8', timeout: 300_000, windowsHide: true,
    env: { ...process.env, CGO_ENABLED: '0', GOOS: goos, GOARCH: goarch },
  })
  if (answer.error || answer.status !== 0) throw new Error(`core build ${goos}/${goarch} failed: ${answer.error?.message ?? answer.stderr ?? answer.status}`)
}
export function buildReleaseAssets(directory, { version, run = spawnSync,
  sourceIdentity = () => nativeSourceIdentity(path.dirname(core)), landingRun = process.env.GITHUB_RUN_ID || null }) {
  mkdirSync(directory, { recursive: true })
  const sums = []
  const source = sourceIdentity()
  if (!source.sources) throw new Error(source.reason)
  for (const [goos, goarch] of CORE_TARGETS) {
    const name = coreAsset(goos, goarch)
    const output = path.resolve(directory, name)
    buildCore({ goos, goarch, output, version, run })
    sums.push([name, createHash('sha256').update(readFileSync(output)).digest('hex')])
  }
  const after = sourceIdentity()
  if (after.at !== source.at || after.sources !== source.sources) throw new Error('native sources changed while release assets were built')
  writeFileSync(path.join(directory, 'SHA256SUMS.txt'), coreManifest({ at: source.at, sources: source.sources,
    run: landingRun }, sums))
}
if (isMainModule(import.meta.url)) {
  try {
    const [mode, output] = process.argv.slice(2)
    if (!output || !['--native', '--assets'].includes(mode)) throw new Error('usage: build-core.mjs <--native output|--assets directory>')
    const { version } = JSON.parse(readFileSync(new URL('../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'))
    if (mode === '--assets') buildReleaseAssets(output, { version })
    else buildCore({ goos: process.platform === 'win32' ? 'windows' : process.platform, goarch: process.arch === 'x64' ? 'amd64' : process.arch, output, version })
  } catch (error) {
    process.stderr.write(`build-core: ${error.message}\n`)
    process.exitCode = 1
  }
}
