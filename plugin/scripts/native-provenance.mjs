// The installed probe verifies actual native bytes against the retained CI manifest.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CORE_TARGETS, coreAsset } from './core-assets.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const assets = new Set(CORE_TARGETS.map(([os, arch]) => coreAsset(os, arch)))

/** Legacy manifests still install; only a versioned source header can bind new native evidence. */
export function parseCoreManifest(text) {
  let source = null
  let headers = 0
  const sums = {}
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue
    if (line.startsWith('# qh-core-source-')) {
      const header = /^# qh-core-source-v1 ([0-9a-f]{40}|-) ([0-9a-f]{64}) ([1-9][0-9]*|-)$/.exec(line)
      if (!header || ++headers !== 1) throw new Error('invalid or duplicate native source manifest header')
      source = { at: header[1] === '-' ? null : header[1], sources: header[2], run: header[3] === '-' ? null : header[3] }
      continue
    }
    if (line.startsWith('#')) continue
    const entry = /^([0-9a-f]{64}) [ *](\S+)$/.exec(line)
    if (!entry || !assets.has(entry[2]) || Object.hasOwn(sums, entry[2])) throw new Error('invalid, duplicate or unknown native checksum entry')
    sums[entry[2]] = entry[1]
  }
  if (!Object.keys(sums).length) throw new Error('native checksum manifest has no assets')
  return { source, sums }
}

/** The bytes actually selected by the caller, matched to its platform in the adjacent manifest. */
export function nativeBinaryIdentity(binary, { platform = process.platform, arch = process.arch, read = readFileSync } = {}) {
  try {
    const asset = coreAsset(platform, arch)
    const manifest = parseCoreManifest(read(path.join(path.dirname(binary), 'SHA256SUMS.txt'), 'utf8'))
    const sha256 = digest(read(binary))
    if (manifest.sums[asset] !== sha256) return { look: 'UNPROVEN', reason: 'native binary does not match its target checksum' }
    if (!manifest.source?.at || !manifest.source.run) return { look: 'UNPROVEN', reason: 'native binary has no committed CI source identity' }
    return { look: 'ok', ...manifest.source, asset, sha256 }
  } catch { return { look: 'UNPROVEN', reason: 'native binary or its source manifest could not be read' } }
}

/** A binary/source swap during the probe cannot be described by its final state alone. */
export function nativeIdentityOfRun(start, end) {
  return JSON.stringify(start) === JSON.stringify(end) ? end
    : { look: 'UNPROVEN', reason: 'the native binary or its source identity changed during the probe' }
}
