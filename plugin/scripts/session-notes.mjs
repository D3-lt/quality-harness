 // Standing notices shared by the retained CLI tools. Native lifecycle state lives in core/hooks/notes.go.
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { saidMarkerDirectory, sweepStaleMarkers } from './housekeeping.mjs'

const STANDING_FACT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

export function firstMentionHere(root, text, { tmp = os.tmpdir(), now = Date.now() } = {}) {
  const directory = saidMarkerDirectory(tmp)
  const marker = path.join(directory, createHash('sha256').update(`here#${root}#${text}`).digest('hex').slice(0, 32))
  try {
    mkdirSync(directory, { recursive: true })
    sweepStaleMarkers(tmp, now)
    let age = null
    try { age = now - statSync(marker).mtimeMs } catch { age = null }
    if (age !== null && age >= 0 && age < STANDING_FACT_MAX_AGE_MS) return false
    writeFileSync(marker, '')
    utimesSync(marker, new Date(now), new Date(now))
  } catch { /* a marker that cannot be kept errs toward saying */ }
  return true
}
