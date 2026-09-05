#!/usr/bin/env node
// A status-line segment: the gates' reading of THIS session, where a person
// already looks, with no prompt text spent on it (BACKLOG §134).
//
//   QH ✓ checked            a recognised check passed after the last edit
//   QH ✗ 3 unverified       edits since the last publish, nothing has checked them
//   QH · nothing edited     (only when the project names a check)
//   QH ? transcript 61MB    too large to read per render; not a verdict
//   (nothing)               no transcript, not a project this plugin can read
//
// Reads the statusLine JSON Claude Code pipes to a statusLine command (stdin:
// session_id, transcript_path, workspace.current_dir / cwd), and NEVER spawns a
// process: a status line renders constantly and a command that waits on git or a
// gate freezes the prompt for as long as they take. The transcript is analysed
// only when its size or mtime changed since the last render, through a
// per-session cache, and only under SIZE_CAP — above it the segment says so
// rather than reading a verdict out of a stale cache (ADR-005).
//
// Wire it from your own statusLine command; the plugin cannot set that for you:
//   node "$(qh-root)/scripts/statusline.mjs" <<< "$input"
// Exit is always 0 and stderr is never written: an error string in a status
// line is permanent noise on the one surface a user cannot dismiss.
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyzeTranscript, projectCheckCommand } from './lifecycle.mjs'

export const SIZE_CAP = 50 * 1024 * 1024

function cachePath(sessionId) {
  const stamp = createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32)
  return path.join(os.tmpdir(), `quality-harness-status-${stamp}`)
}

// The reading, as data. `analyze` is the seam a test drives to prove the cache
// is a cache: an unchanged transcript is not analysed twice.
export function reading(input, { analyze = analyzeTranscript, now = Date.now() } = {}) {
  const transcript = typeof input?.transcript_path === 'string' ? input.transcript_path : null
  const cwd = input?.workspace?.current_dir ?? input?.cwd ?? process.cwd()
  if (!transcript) return null
  let stat
  try { stat = statSync(transcript) } catch { return null }
  if (stat.size > SIZE_CAP) return { kind: 'too-large', bytes: stat.size }
  const key = `${stat.size}:${Math.floor(stat.mtimeMs)}`
  const cache = typeof input.session_id === 'string' && input.session_id ? cachePath(input.session_id) : null
  if (cache) {
    try {
      const cached = JSON.parse(readFileSync(cache, 'utf8'))
      if (cached.key === key) return cached.value
    } catch {}
  }
  let raw
  try { raw = readFileSync(transcript, 'utf8') } catch { return null }
  const state = analyze(raw, cwd)
  const edited = state.mutationPathsSince(state.lastPublish)
  const value = {
    kind: edited.length === 0 ? 'nothing' : state.unverifiedSince(state.lastPublish) ? 'unverified' : 'checked',
    count: edited.length,
    check: projectCheckCommand(cwd) ?? null,
    at: now,
  }
  if (cache) { try { writeFileSync(cache, JSON.stringify({ key, value })) } catch {} }
  return value
}

export function render(value) {
  if (!value) return ''
  if (value.kind === 'too-large') return `QH ? transcript ${Math.round(value.bytes / 1024 / 1024)}MB`
  if (value.kind === 'unverified') return `QH ✗ ${value.count} unverified`
  if (value.kind === 'checked') return 'QH ✓ checked'
  return value.check ? 'QH · nothing edited' : ''
}

export async function main(stdin = process.stdin, stdout = process.stdout) {
  let text = ''
  try {
    for await (const chunk of stdin) text += chunk
  } catch { return 0 }
  let input
  try { input = JSON.parse(text) } catch { return 0 }
  let segment = ''
  try { segment = render(reading(input)) } catch { segment = '' }
  if (segment) stdout.write(`${segment}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
