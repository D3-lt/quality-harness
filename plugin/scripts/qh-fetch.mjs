#!/usr/bin/env node
// Install one release binary atomically. Hooks execute it only while its checksum still matches.
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { coreAsset } from './core-assets.mjs'
import { isMainModule } from './main-module.mjs'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export const verifiedCore = binary => {
  try {
    const expected = readFileSync(binary + '.sha256', 'utf8').trim()
    return /^[a-f0-9]{64}$/.test(expected) && sha256(readFileSync(binary)) === expected
  } catch { return false }
}
async function body(response, limit) {
  if (!response.ok) throw new Error(`download answered HTTP ${response.status}`)
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > limit) throw new Error('download exceeded its size bound')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
export async function installCore({ version, platform, arch, dataHome, request = fetch, run = spawnSync }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('invalid core version')
  const asset = coreAsset(platform, arch)
  const directory = path.join(dataHome, 'qh', version)
  const binary = path.join(directory, asset)
  if (verifiedCore(binary)) return { binary, installed: false }
  const base = `https://github.com/D3-lt/quality-harness/releases/download/v${version}/`
  const signal = AbortSignal.timeout(15_000)
  const manifest = (await body(await request(base + 'SHA256SUMS.txt', { signal }), 1024 * 1024)).toString('utf8')
  const entries = manifest.split(/\r?\n/).map(line => /^([a-f0-9]{64}) [ *](\S+)$/.exec(line)).filter(entry => entry?.[2] === asset)
  if (entries.length !== 1) throw new Error(`checksum manifest must name ${asset} exactly once`)
  const bytes = await body(await request(base + asset, { signal }), 32 * 1024 * 1024)
  const expected = entries[0][1]
  if (sha256(bytes) !== expected) throw new Error(`checksum mismatch for ${asset}`)
  mkdirSync(directory, { recursive: true })
  const temporary = path.join(directory, `.${asset}.${randomUUID()}${platform === 'win32' ? '.exe' : '.tmp'}`)
  const checksum = temporary + '.sha256'
  const sourceManifest = temporary + '.manifest'
  try {
    writeFileSync(temporary, bytes, { mode: 0o755, flag: 'wx' })
    chmodSync(temporary, 0o755)
    const answer = run(temporary, ['--version'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
    if (answer.error || answer.status !== 0 || String(answer.stdout).trim() !== `qh version ${version}`) throw new Error('downloaded core did not answer with this release version')
    writeFileSync(checksum, expected + '\n', { flag: 'wx' })
    writeFileSync(sourceManifest, manifest, { flag: 'wx' })
    // A parallel installer may already have published the same immutable release.
    if (!verifiedCore(binary)) {
      renameSync(temporary, binary)
      renameSync(sourceManifest, path.join(directory, 'SHA256SUMS.txt'))
      renameSync(checksum, binary + '.sha256')
    }
    return { binary, installed: true }
  } finally {
    rmSync(temporary, { force: true })
    rmSync(checksum, { force: true })
    rmSync(sourceManifest, { force: true })

  }
}
if (isMainModule(import.meta.url)) {
  try {
    if (process.env.QUALITY_HARNESS_QH_FETCH === 'off') throw new Error('core fetching is disabled')
    const { version } = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))
    const dataHome = process.argv[2] || process.env.CLAUDE_PLUGIN_DATA || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'quality-harness')
    await installCore({ version, platform: process.platform, arch: process.arch, dataHome })
  } catch (error) {
    process.stderr.write(`quality-harness: could not install the Go core: ${error.message}\n`)
    process.exitCode = 1
  }
}
