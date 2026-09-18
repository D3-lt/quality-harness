#!/usr/bin/env node
// A status-line segment: the gates' reading of THIS session, where a person
// already looks, with no prompt text spent on it (BACKLOG §134).
//
//   QH ✓ checked · last observed 4s ago       a qh-check passed on this tree
//   QH ✗ 3 unverified · last observed 1m ago  writes since the last passing check
//   QH ✗ unverified · last observed 1m ago    the tree moved and nothing checked it
//   QH · nothing edited · last observed 2s ago  (only when the project names a check)
//   QH ? could not look · last observed 5s ago  the tree could not be observed (ADR-005)
//   QH ? last observed 41m ago                the newest observation is too old to be a verdict
//   QH ? unknown                              a session with a check and no event log yet
//   QH CI ✓                 CI of this branch is green (no session token)
//   QH CI ✗ / QH CI … / QH CI ?   CI red, in flight, or unknown
//   (nothing)               not a project this plugin can read
//
// Reads the statusLine JSON Claude Code pipes to a statusLine command (stdin:
// session_id, transcript_path, workspace.current_dir / cwd). Its input is
// ADR-060's per-session event log, which is small and already written: the
// transcript is not parsed here any more, and the log is located without
// starting a process (`stateDir(cwd, {spawn: false})`), because a status line
// renders constantly. ⚠ `projectCheckCommand` DOES spawn `git rev-parse`
// (docs/BACKLOG.md §229); the cache below is what keeps that off most renders.
//
// Keep that command (and any refreshInterval). Feed the same $input to this
// script and append its stdout — one line, or empty.
// The plugin cannot set Claude's statusLine:
//   qh=$(node "$(qh-root)/scripts/statusline.mjs" <<< "$input" 2>/dev/null)
//   [ -n "$qh" ] && printf '%s\n' "$qh"
// Exit is always 0 and stderr is never written: an error string in a status
// line is permanent noise on the one surface a user cannot dismiss.
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { latestCheckFor, projectCheckCommand, readEvents, sessionLogFile } from './lifecycle.mjs'
import { usableCache } from './branch-state.mjs'
import { findGitDir } from './git-directory.mjs'
export { findGitDir } from './git-directory.mjs'

// An observation older than this is not a verdict about the tree as it is now;
// it is the last thing that WAS seen, and the segment says so instead.
export const STALE_MS = 15 * 60_000

function cachePath(sessionId) {
  const stamp = createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32)
  return path.join(os.tmpdir(), `quality-harness-status-${stamp}`)
}

export function renderAge(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

// The reading, as data, from the session's event log. `read` is the seam a test
// drives to prove the cache is a cache: an unchanged log is not read twice.
export function reading(input, { read = readEvents, now = Date.now() } = {}) {
  const cwd = input?.workspace?.current_dir ?? input?.cwd ?? process.cwd()
  const session = typeof input?.session_id === 'string' && input.session_id ? input.session_id : null
  if (!session) return null
  let key = 'absent'
  try {
    const stat = statSync(sessionLogFile(cwd, session, { spawn: false }))
    key = `${stat.size}:${Math.floor(stat.mtimeMs)}`
  } catch {}
  const cache = cachePath(session)
  let value
  let hit = false
  try {
    const cached = JSON.parse(readFileSync(cache, 'utf8'))
    if (cached.key === key) { value = cached.value; hit = true }
  } catch {}
  if (!hit) {
    const check = projectCheckCommand(cwd) ?? null
    const log = read(cwd, session, { spawn: false })
    const observed = log.filter(entry => entry.observation).at(-1)
    value = observed ? observedReading(log, observed, check) : check ? { kind: 'unknown', check, observedAtMs: null } : null
    try { writeFileSync(cache, JSON.stringify({ key, value })) } catch {}
  }
  if (!value) return null
  // The AGE is computed on every render, hit or miss: a cached age would freeze
  // while the log sat still, which is exactly when it is worth saying.
  const ageMs = typeof value.observedAtMs === 'number' ? Math.max(0, now - value.observedAtMs) : null
  return { ...value, ageMs, at: now }
}

// What the log alone can say. It holds no commit history, so this speaks for the
// tree and the writes and never for a commit — a status line that claimed more
// than it observed would be the failure ADR-005 is about.
function observedReading(log, observed, check) {
  const observation = observed.observation
  const observedAt = Date.parse(observed.at ?? '')
  const baseline = log.find(entry => entry.event === 'session.started')?.observation
  const checks = log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.'))
  const lastPass = checks.filter(entry => entry.event === 'check.passed').at(-1)
  const since = lastPass?.startedAt ?? null
  const writes = log.filter(entry => entry.event === 'file.written'
    && (typeof since !== 'string' || typeof entry.at !== 'string' || entry.at > since))
  // ⚠ THE SAME RULE THE ADVISORIES USE — AND NOW LITERALLY THE SAME FUNCTION.
  // This was a second copy of the rule, `…filter(…).at(-1)`, under a comment that
  // already claimed they agreed. They did not: when `treeChecked` learned to
  // dedupe re-imports and refuse an unresolved order, this kept certifying from
  // the last-APPENDED event, so a stale re-imported pass still read `checked`
  // here after the advisories had stopped believing it. Two copies of one rule is
  // exactly what CLAUDE.md §5 is about, and the comment is what made it invisible.
  const checked = observation?.ok === true
    && latestCheckFor(log, observation.tree)?.event === 'check.passed'
  const kind = observation?.ok !== true ? 'could-not-look'
    : checked ? 'checked'
    : writes.length === 0 && baseline?.ok === true && observation.tree === baseline.tree ? 'nothing'
    : 'unverified'
  return { kind, count: writes.length, check, observedAtMs: Number.isFinite(observedAt) ? observedAt : null }
}

// The CI verdict, read from the cache the branch-state hook writes into `.git/`
// (BACKLOG §137) — a second READER of an answer that exists, never a second
// asker: this renders constantly and `gh` takes seconds. `.git` is found by
// walking up, without spawning git; a worktree's `.git` file names its dir.
export const CI_STALE_MS = 15 * 60_000


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
  const age = typeof value?.ageMs === 'number' ? `last observed ${renderAge(value.ageMs)} ago` : null
  if (value) {
    // Too old to speak for the tree as it is now: what was seen, and when, with
    // no verdict attached to it (ADR-005).
    const stale = age !== null && value.ageMs > STALE_MS && value.kind !== 'unknown'
    const token = value.kind === 'unknown' ? 'QH ? unknown'
      : stale ? `QH ? ${age}`
      : value.kind === 'could-not-look' ? 'QH ? could not look'
      : value.kind === 'unverified' ? `QH ✗ ${value.count > 0 ? `${value.count} unverified` : 'unverified'}`
      : value.kind === 'checked' ? 'QH ✓ checked'
      : value.check ? 'QH · nothing edited'
      : null
    if (token) parts.push(!stale && age && value.kind !== 'unknown' ? `${token} · ${age}` : token)
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
