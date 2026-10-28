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
//   … · ↑3 ↓1 · !rev 2      3 commits ahead of origin, 1 behind it, 2 no recorded review reaches (branch-state's cache)
//   … · ⧗ check 2m          a qh-check (or ⧗ campaign, a mutation run) in flight for this checkout, from its lease
//   … · ⧗ waiting 1m        a run waiting for its turn
//   … · load 1.52×          the load average over the core count, only when it is above 1: a pass now is unattributable
//   (nothing)               not a project this plugin can read
//
// Reads the statusLine JSON Claude Code pipes to a statusLine command (stdin:
// session_id, transcript_path, workspace.current_dir / cwd). Its input is
// ADR-060's per-session event log, which is small and already written: the
// transcript is not parsed here any more, and the log is located without
// starting a process (`stateDir(cwd, {spawn: false})`), because a status line
// renders constantly. ⚠ `projectCheckCommand` DOES spawn `git rev-parse`
// (docs/BACKLOG.md §246); the cache below is what keeps that off most renders.
//
// Keep that command (and any refreshInterval). Feed the same $input to this
// script and append its stdout — one line, or empty.
// The plugin cannot set Claude's statusLine:
//   qh=$(node "$(qh-root)/scripts/statusline.mjs" <<< "$input" 2>/dev/null)
//   [ -n "$qh" ] && printf '%s\n' "$qh"
// Exit is always 0 and stderr is never written: an error string in a status
// line is permanent noise on the one surface a user cannot dismiss.
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'
import { readEvents, sessionLogFile } from './event-log.mjs'
import { carryFor, latestCheckFor, logIncomplete } from './check-ledger.mjs'
import { projectCheckCommand } from './check-command.mjs'
import { sessionBaseline } from './tree-facts.mjs'
import { snapshotKey, usableCache } from './branch-state.mjs'
import { findGitDir } from './git-directory.mjs'
import { alive, leaseDir } from './lease.mjs'
import { sampleLoad } from './load.mjs'

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
  const began = sessionBaseline(log)
  const baseline = began?.observation
  const checks = log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.'))
  const lastPass = checks.filter(entry => entry.event === 'check.passed').at(-1)
  const since = lastPass?.startedAt ?? null
  const writes = log.filter(entry => entry.event === 'file.written'
    && (typeof since !== 'string' || typeof entry.at !== 'string' || entry.at > since))
  // ⚠ THE SAME RULE THE ADVISORIES USE — THE SAME FUNCTION, AND THE SAME PRECONDITION.
  // This was a second copy of the rule, `…filter(…).at(-1)`, under a comment that
  // already claimed they agreed. They did not: when the verdict reader learned to
  // dedupe re-imports and refuse an unresolved order, this kept certifying from
  // the last-APPENDED event, so a stale re-imported pass still read `checked`
  // here after the advisories had stopped believing it. Two copies of one rule is
  // exactly what CLAUDE.md §5 is about, and the comment is what made it invisible.
  const latest = observation?.ok === true ? latestCheckFor(log, observation.tree, carryFor(log, null, observation.codeTree, observation.prose)) : null
  const checked = latest?.event === 'check.passed'
  // ⚠ A WRITE THE LAST OBSERVATION DOES NOT COVER OUTRANKS A PASS ON THAT TREE.
  // `checked` came first, so a pass on T followed by a write git cannot see — or
  // by any write made AFTER the observation that named T — still rendered
  // `QH ✓ checked`, with `count: 1` sitting unread beside it, while the session
  // note for the same log said `unverified` (different-lineage review,
  // 2026-09-19). A `file.written` carries no observation of its own, so until
  // another boundary looks, the tree it left is not the tree that was checked.
  // By POSITION in the log, which is append-ordered — not by timestamp, which can
  // tie: a write appended after the observation in the same millisecond compared
  // equal and was read as covered.
  const observedIndex = log.lastIndexOf(observed)
  const uncovered = log.filter((entry, index) => writes.includes(entry) && (entry.observable === false || index > observedIndex))
  // A log that could not be read whole says nothing positive: not `checked`, and
  // not `nothing edited` either — the lost line may be the write (audit B3).
  const kind = observation?.ok !== true || logIncomplete(log) ? 'could-not-look'
    : uncovered.length ? 'unverified'
    : checked ? 'checked'
    : writes.length === 0 && baseline?.ok === true && observation.tree === baseline.tree ? 'nothing'
    : 'unverified'
  // `inferred` rides with the verdict, because a tick earned by a command this
  // tool GUESSED is worth less than one earned by the project's declared gate.
  return { kind, count: writes.length, check, inferred: checked && latest?.origin === 'inferred',
    // A baseline adopted partway through speaks only for what followed it.
    late: kind === 'nothing' && began?.late === true, observedAtMs: Number.isFinite(observedAt) ? observedAt : null }
}

// The CI verdict, read from the cache the branch-state hook writes into `.git/`
// (BACKLOG §137) — a second READER of an answer that exists, never a second
// asker: this renders constantly and `gh` takes seconds. `.git` is found by
// walking up, without spawning git; a worktree's `.git` file names its dir.
export const CI_STALE_MS = 15 * 60_000


// The branch-state cache and the Git directory it was found in, or null when there is none this reader may trust (the
// hook's own guard).
function branchCache(cwd, now) {
  const gitDir = findGitDir(cwd ?? process.cwd())
  if (!gitDir) return null
  let cache
  try { cache = JSON.parse(readFileSync(path.join(gitDir, 'qh-branch-state.json'), 'utf8')) } catch { return null }
  return usableCache(cache, now) ? { cache, gitDir } : null
}

export function ciReading(cwd, now = Date.now()) {
  const { cache } = branchCache(cwd, now) ?? {}
  if (!cache) return null
  const age = now - cache.at
  if (age > CI_STALE_MS) return { state: 'stale', ageMinutes: Math.round(age / 60_000) }
  const ci = cache.state.looked ? cache.state.ci : null
  if (!ci || !ci.looked) return { state: 'unknown' }
  if (ci.status !== 'completed') return { state: 'running', sha: ci.sha }
  if (ci.conclusion === 'success') return { state: 'green', sha: ci.sha }
  return { state: 'red', sha: ci.sha, failed: ci.failed ?? [] }
}

// What is ahead of origin and what no recorded review reaches, from the same cache on the same terms: fresh, or nothing.
// A count the hook could not take (null) or did not take (no review ledger) is no token, never a zero.
export function gitReading(cwd, now = Date.now()) {
  const { cache, gitDir } = branchCache(cwd, now) ?? {}
  if (!cache || now - cache.at > CI_STALE_MS || cache.state.looked !== true) return null
  // Both are counts of HEAD against its upstream, so a commit, a push or a branch switch since the hook took them makes them
  // another tree's. The key is read from files, as the hook reads it, and a key that cannot be proved is no answer.
  const key = snapshotKey(gitDir)
  if (key === null || cache.key !== key) return null
  const count = value => (Number.isSafeInteger(value) && value > 0 ? value : 0)
  return { ahead: count(cache.state.ahead), behind: count(cache.state.behind), unreviewed: count(cache.state.unreviewed) }
}

export function renderGit(git) {
  if (!git) return ''
  const drift = [git.ahead ? `↑${git.ahead}` : '', git.behind ? `↓${git.behind}` : ''].filter(Boolean).join(' ')
  return [drift, git.unreviewed ? `!rev ${git.unreviewed}` : ''].filter(Boolean).join(' · ')
}

// A check or a campaign in flight for this checkout, from its lease (ADR-077). Read only: `lease.observe` removes a dead
// run's lease, and a status line that renders every few seconds must not write. A run is in flight only while one of its
// processes is proven alive; dead and unknown are not shown.
const SPOKEN = [[/^qh-check\b/, 'check'], [/^mutate\.mjs\b/, 'campaign']]
// The filesystem's spelling of a path, and for one that does not exist, of the part of it that does, with the rest joined
// on as written. A cwd that did not exist was resolved by spelling alone, and beside a root the filesystem resolved, an 8.3
// short name or a link spelled the two apart (CI windows, 3.8.24). The whole path is asked first: `path.resolve` removes a
// `..` lexically, before a link it follows is followed (the Codex review of 26440a7d).
const canonicalPath = target => {
  try { return realpathSync.native(target) } catch {}
  const missing = []
  for (let at = path.resolve(target); ; at = path.dirname(at)) {
    try { return path.join(realpathSync.native(at), ...missing) } catch {}
    if (path.dirname(at) === at) return path.resolve(target)
    missing.unshift(path.basename(at))
  }
}

export function flightReading(cwd, { dir = leaseDir(), now = Date.now(), alive: isAlive = alive } = {}) {
  const here = canonicalPath(cwd ?? process.cwd())
  // A checkout is its Git directory, not a path prefix: a linked worktree nested inside another checkout is a subdirectory
  // of it on disk and still a different checkout, so containment alone showed the parent's run there.
  const home = findGitDir(here)
  let names
  try { names = readdirSync(dir).filter(name => name.endsWith('.json')).sort() } catch { return null }
  for (const name of names) {
    let lease = null
    try { lease = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) } catch { continue }
    if (!lease || typeof lease !== 'object' || typeof lease.root !== 'string') continue
    if (![lease.pid, lease.child].some(pid => pid !== undefined && isAlive(pid) === 'alive')) continue
    const root = canonicalPath(lease.root)
    const relative = path.relative(root, here)
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue
    if (findGitDir(root) !== home) continue
    const started = Date.parse(lease.start ?? '')
    const what = lease.state === 'waiting' ? 'waiting'
      : SPOKEN.find(([pattern]) => pattern.test(String(lease.command ?? '')))?.[1] ?? 'run'
    return { what, ageMs: Number.isFinite(started) ? Math.max(0, now - started) : null }
  }
  return null
}

export function renderFlight(flight) {
  if (!flight) return ''
  return `⧗ ${flight.what}${flight.ageMs === null ? '' : ` ${renderAge(flight.ageMs)}`}`
}

// A contended machine, where a gate's pass is unattributable (CLAUDE.md §18): the load average over the core count, only
// above 1, rounded UP so just over is never shown as 1.00. A platform that keeps no load average says nothing (load.mjs).
export function loadReading(sampler = {}) {
  const { load, cores } = sampleLoad(sampler)
  return load !== null && cores !== null && load > cores ? load / cores : null
}

export function renderLoad(ratio) {
  return ratio === null ? '' : `load ${(Math.ceil(ratio * 100) / 100).toFixed(2)}×`
}

export function renderCi(ci) {
  if (!ci) return ''
  if (ci.state === 'green') return 'CI ✓'
  if (ci.state === 'red') {
    // A workflow branch-state named without reading its jobs is not a job (BACKLOG §348).
    const unread = (ci.failed ?? []).filter(entry => / — jobs not read$/.test(entry)).length
    const jobs = (ci.failed?.length ?? 0) - unread
    return `CI ✗${jobs ? ` ${jobs} job(s)` : ''}${unread ? ` +${unread} unread` : ''}`
  }
  if (ci.state === 'running') return 'CI …'
  if (ci.state === 'stale') return `CI ? (${ci.ageMinutes}m old)`
  return 'CI ?'
}

export function render(value, ci = null, extras = []) {
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
      : value.kind === 'checked' ? (value.inferred ? 'QH ✓ checked (inferred check)' : 'QH ✓ checked')
      : value.check ? (value.late ? 'QH · nothing edited since watching began' : 'QH · nothing edited')
      : null
    if (token) parts.push(!stale && age && value.kind !== 'unknown' ? `${token} · ${age}` : token)
  }
  const tail = renderCi(ci)
  if (tail) parts.push(parts.length ? tail : `QH ${tail}`)
  // The extras ride on a QH or CI piece and never stand alone: a project this plugin cannot read gets nothing.
  if (parts.length) parts.push(...extras.filter(Boolean))
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
  const cwd = input?.workspace?.current_dir ?? input?.cwd
  try {
    segment = render(reading(input), ciReading(cwd), [renderGit(gitReading(cwd)), renderFlight(flightReading(cwd)), renderLoad(loadReading())])
  } catch { segment = '' }
  if (segment) stdout.write(`${segment}\n`)
  return 0
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main()
}
