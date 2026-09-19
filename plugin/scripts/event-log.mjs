// The per-session event log ADR-060's rules read, and the state directory that
// holds it. It lives here rather than in lifecycle.mjs because TWO processes
// write it: the hook (lifecycle.mjs) and the per-edit artifact gate
// (run-shell-hook.mjs). Importing the lifecycle from the runner the lifecycle
// itself imports would be a module cycle; a shared leaf is not.
//
// The state directory is `<git-dir>/quality-harness/` inside a repository — the
// git directory of THIS worktree, so a check run in one worktree never clears
// another's findings — and `<tmp>/quality-harness/<sha256 of the canonical
// cwd>/` outside one. Both are outside the working tree, so observing a tree
// never observes this log.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { findGitDir } from './git-directory.mjs'

/** The nearest existing directory at or above a path, or null when none exists. */
export function nearestExistingDirectory(candidate) {
  let current = candidate
  try {
    if (!statSync(current).isDirectory()) current = path.dirname(current)
  } catch {
    current = path.dirname(current)
  }
  while (!existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
  return current
}

/**
 * canonical resolves a path the way Git spells it, and falls back to the lexical
 * path when it cannot be resolved.
 */
export function canonical(candidate) {
  try {
    // Native first: the JS realpath leaves Windows 8.3 names in place while
    // Git answers with the long form (run-shell-hook.mjs; BACKLOG §188).
    let resolved
    try { resolved = realpathSync.native(candidate) } catch { resolved = realpathSync(candidate) }
    if (resolved.startsWith('\\\\?\\UNC\\')) return '\\\\' + resolved.slice(8)
    if (resolved.startsWith('\\\\?\\')) return resolved.slice(4)
    return resolved
  } catch {
    return candidate
  }
}

/**
 * The ONE spelling a file gets when it is persisted as an event key.
 *
 * `canonical` needs a path that exists; a key is often recorded for a file that was
 * just deleted, or does not exist yet. So the nearest existing ancestor is
 * canonicalised and the remainder re-appended — the same walk `recordFileWritten`
 * already did to ask git about the file, before recording the OTHER spelling.
 *
 * ⚠ THREE SITES BUILD THIS KEY AND ONLY ONE WAS CANONICAL. Rule A's candidates are
 * `path.join(canonical(top), relative)`. The per-edit gate's `artifact.gated` key and
 * the `file.written` path were merely resolved, so through a symlinked checkout or
 * a Windows 8.3 short name the verdict was stored under one spelling and looked up
 * under another, and the dedupe never fired (audit 2026-09-18, C1).
 */
export function canonicalFile(absolute) {
  const parent = nearestExistingDirectory(absolute)
  return parent ? path.join(canonical(parent), path.relative(parent, absolute)) : absolute
}

const stateDirectories = new Map()
export function stateDir(cwd, { spawn = true } = {}) {
  const directory = nearestExistingDirectory(path.resolve(typeof cwd === 'string' ? cwd : process.cwd()))
  const key = `${directory ?? String(cwd)}:${spawn}`
  if (stateDirectories.has(key)) return stateDirectories.get(key)
  let resolved = null
  if (directory) {
    // findGitDir walks the checkout without starting a process, and answers a
    // linked worktree with its OWN git directory, which is what makes one
    // worktree's check unable to clear another's findings. The spawn is the
    // second rung for the cases it cannot see (a GIT_DIR in the environment);
    // a reader that must not start a process asks for it to be skipped.
    resolved = findGitDir(directory)
    if (resolved) resolved = path.join(canonical(resolved), 'quality-harness')
    if (!resolved && spawn) {
      const run = spawnSync('git', ['-C', directory, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8', timeout: 5_000 })
      if (!run.error && run.status === 0 && run.stdout.trim()) resolved = path.join(canonical(run.stdout.trim()), 'quality-harness')
    }
  }
  resolved ??= path.join(os.tmpdir(), 'quality-harness',
    createHash('sha256').update(directory ? canonical(directory) : String(cwd)).digest('hex'))
  stateDirectories.set(key, resolved)
  return resolved
}

export function sessionLogFile(cwd, session, options) {
  return path.join(stateDir(cwd, options), 'sessions', `${String(session).replace(/[^A-Za-z0-9._-]/g, '_')}.jsonl`)
}

export function appendEvent(cwd, session, entry) {
  if (typeof session !== 'string' || !session) return false
  try {
    const file = sessionLogFile(cwd, session)
    mkdirSync(path.dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}

// ⚠ AN INCOMPLETE READ MUST NOT ANSWER LIKE A COMPLETE ONE. A torn line was
// skipped and a read error became "no events", so a log holding an older PASS and
// a newer FAILURE whose line is truncated read as "the pass is the latest thing
// that happened", and the ledger said `verified`. An append is not atomic, so a
// truncated tail is the ordinary shape of a crash rather than an exotic one.
// Found by a different-lineage review of this branch, 2026-09-18.
//
// The result is still an array, so every existing caller keeps working. It
// carries `complete` beside the entries: false means SOME events are missing and
// the reader may not build a positive verdict on it. A partial log is still
// usable for FINDING work, because that direction can only ever find more
// (ADR-005).
export function readEvents(cwd, session, options) {
  if (typeof session !== 'string' || !session) return complete([], true)
  let text
  try { text = readFileSync(sessionLogFile(cwd, session, options), 'utf8') } catch (error) {
    // ENOENT is a session that has written nothing yet — genuinely no events.
    // Anything else is a log we could not read, which is not the same answer.
    return complete([], error?.code === 'ENOENT')
  }
  const entries = []
  let whole = true
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { entries.push(JSON.parse(line)) } catch { whole = false }
  }
  return complete(entries, whole)
}

function complete(entries, whole) {
  const out = [...entries]
  out.complete = whole
  return out
}

/** The identity of a path that positively DOES NOT EXIST. */
export const ABSENT = 'absent'

/**
 * contentId identifies the CONTENT a gate gave a verdict on, so a later edit of
 * the same path is a new question. It is a hash of the bytes rather than a Git
 * blob id, because both writers must agree on it without starting a process,
 * and an uncommitted or deleted file has no blob.
 *
 * THREE ANSWERS, NOT TWO, and the third is why this is not simply a hash:
 *   <hex>    these exact bytes
 *   ABSENT   the path is not there — a positive observation, and the state a
 *            DELETED record is in after its deletion has been gated
 *   null     the path is there and could not be read — UNKNOWN, which a reader
 *            must never treat as "the same as last time"
 *
 * ⚠ Absence used to collapse into null, and `null === null` then suppressed a
 * deleted record for ever on the strength of two non-answers agreeing. Splitting
 * absence out is what lets the null rule be strict without re-gating every
 * deletion at every boundary (ADR-005; a different-lineage review, 2026-09-18).
 */
export function contentId(file) {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex') } catch (error) {
    return error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? ABSENT : null
  }
}
