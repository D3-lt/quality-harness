// Compatibility CLI transport. Hook decisions are implemented only by the native core.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { coreAsset } from './core-assets.mjs'
import { verifiedCore } from './qh-fetch.mjs'

const pluginRoot = fileURLToPath(new URL('..', import.meta.url))
export function isBundledPlugin(root) {
  return existsSync(path.join(root, '.claude-plugin', 'bundle.json')) || existsSync(path.join(root, 'native'))
}
export function nativeBinaryPath(version, env = process.env,
  { root = pluginRoot, platform = process.platform, arch = process.arch,
    bundled = isBundledPlugin(root) } = {}) {
  if (env.QUALITY_HARNESS_QH_BIN) return env.QUALITY_HARNESS_QH_BIN
  if (bundled) return path.join(root, 'native', coreAsset(platform, arch))
  const data = env.CLAUDE_PLUGIN_DATA || path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'quality-harness')
  return path.join(data, 'qh', version, coreAsset(platform, arch))
}

export function execNative(args, input) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const { version } = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'))
  // The probe uses this same selector so its identity describes the executable this transport starts.
  const binary = nativeBinaryPath(version)
  if (!process.env.QUALITY_HARNESS_QH_BIN && !verifiedCore(binary)) {
    process.stderr.write('quality-harness: could not run: a verified Go core is missing or its checksum differs; reinstall a bundled plugin, or run qh-fetch for a source checkout\n')
    return 1
  }
  const result = spawnSync(binary, args, {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: root }, timeout: 120_000, windowsHide: true,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'], ...(input === undefined ? {} : { input }),
  })
  if (result.error) process.stderr.write(`quality-harness: could not run the Go core: ${result.error.message}\n`)
  return result.error ? 1 : result.status ?? 1
}
