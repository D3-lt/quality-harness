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
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyzeTranscript, projectCheckCommand } from './lifecycle.mjs'
import { usableCache } from './branch-state.mjs'

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

// The CI verdict, read from the cache the branch-state hook writes into `.git/`
// (BACKLOG §137) — a second READER of an answer that exists, never a second
// asker: this renders constantly and `gh` takes seconds. `.git` is found by
// walking up, without spawning git; a worktree's `.git` file names its dir.
export const CI_STALE_MS = 15 * 60_000

export function findGitDir(start) {
  // realpath first: a cwd that is a symlink into a repository walks the wrong
  // parents otherwise, and a relative `gitdir:` resolves against the wrong
  // directory (Codex review, 2026-09-05).
  let here = path.resolve(start)
  try { here = realpathSync(here) } catch {}
  for (;;) {
    // A bare repository is its own git dir: HEAD and objects/ at the root.
    try {
      if (statSync(path.join(here, 'HEAD')).isFile() && statSync(path.join(here, 'objects')).isDirectory()) return here
    } catch {}
    const candidate = path.join(here, '.git')
    try {
      const stat = statSync(candidate)
      if (stat.isDirectory()) return candidate
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(candidate, 'utf8'))
      if (pointer) return path.resolve(here, pointer[1].trim())
    } catch {}
    const parent = path.dirname(here)
    if (parent === here) return null
    here = parent
  }
}

export function ciReading(cwd, now = Date.now()) {
  const gitDir = findGitDir(cwd ?? process.cwd())
  if (!gitDir) return null
  let cache
  try { cache = JSON.parse(readFileSync(path.join(gitDir, 'qh-branch-state.json'), 'utf8')) } catch { return null }
  if (!usableCache(cache, now)) return null
  const age = now - cache.at
  if (age > CI_STALE_MS) return { state: 'stale', ageMinutes: Math.round(age / 60_000) }
  const ci = cache.state.looked ? cache.state.ci : null
  if (!ci || !ci.looked) return { state: 'unknown' }
  if (ci.status !== 'completed') return { state: 'running', sha: ci.sha }
  if (ci.conclusion === 'success') return { state: 'green', sha: ci.sha }
  return { state: 'red', sha: ci.sha, failed: ci.failed ?? [] }
}

export function renderCi(ci) {
  if (!ci) return ''
  if (ci.state === 'green') return 'CI ✓'
  if (ci.state === 'red') return `CI ✗${ci.failed?.length ? ` ${ci.failed.length} job(s)` : ''}`
  if (ci.state === 'running') return 'CI …'
  if (ci.state === 'stale') return `CI ? (${ci.ageMinutes}m old)`
  return 'CI ?'
}

export function render(value, ci = null) {
  const parts = []
  if (value) {
    if (value.kind === 'too-large') parts.push(`QH ? transcript ${Math.round(value.bytes / 1024 / 1024)}MB`)
    else if (value.kind === 'unverified') parts.push(`QH ✗ ${value.count} unverified`)
    else if (value.kind === 'checked') parts.push('QH ✓ checked')
    else if (value.check) parts.push('QH · nothing edited')
  }
  const tail = renderCi(ci)
  if (tail) parts.push(parts.length ? tail : `QH ${tail}`)
  return parts.join(' · ')
}

export async function main(stdin = process.stdin, stdout = process.stdout) {
  let text = ''
  try {
    for await (const chunk of stdin) text += chunk
  } catch { return 0 }
  let input
  try { input = JSON.parse(text) } catch { return 0 }
  let segment = ''
  try { segment = render(reading(input), ciReading(input?.workspace?.current_dir ?? input?.cwd)) } catch { segment = '' }
  if (segment) stdout.write(`${segment}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
