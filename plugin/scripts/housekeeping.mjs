// The sweeps that keep the harness's own files from growing: stale once-per-session markers and week-old session logs with
// no write git could not see, at most once a day. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage B4). They
// touch disk only, and never throw.
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { sessionLogFile, stateDir } from './event-log.mjs'

// Where the "already said this" markers live, and the sweep that bounds them
// (BACKLOG §146). One zero-byte file per (session, generation, finding), and
// nothing ever removed one: a Windows peer counted 48 from a single review
// session still sitting in TEMP the next day. Markers now live in a directory
// of their own, so the sweep reads that directory and not the whole temp root,
// and a once-a-day guard bounds even that to one readdir per machine per day.
export const SAID_MARKER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const SAID_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

// The shapes that sat directly under the temp root before the directory
// existed: said- markers from earlier releases, and the one-per-session note
// file, which is written at PreCompact and consumed seconds later by the
// compact SessionStart — a week-old one is dead by construction.
//
// ⚠ `gen-` IS DELIBERATELY NOT HERE, and that is a correction (Codex review,
// 2026-09-06). A generation file is not a marker, it is session STATE, and the
// two fail in opposite directions: losing a marker re-says a finding, which is
// the side this mechanism errs toward, while losing a generation resets it to
// 0 — after which a compaction bumps it back to 1 and a generation-1 marker
// that is still live suppresses a finding that should have been said. Age
// cannot tell a long-running session from an abandoned one, so gen files are
// left to accumulate until something knows which sessions are alive; that
// residual is named in BACKLOG §146 rather than traded for a wrong suppression.
const LEGACY_MARKER = /^quality-harness-(?:said|note)-[0-9a-f]{32}$/

// A marker's own name, and the only thing the marker directory sweep will
// unlink. `!== '.swept'` was the first draft and it made the directory's whole
// contents eligible, which is not what this file claims anywhere (Codex
// review, 2026-09-06).
const MARKER_NAME = /^[0-9a-f]{32}$/

export function saidMarkerDirectory(tmp = os.tmpdir()) {
  return path.join(tmp, 'quality-harness-said')
}

// Remove markers older than a week, at most once a day per machine. NEVER
// THROWS: it runs inside a hook on the way to saying a finding, and a sweep
// that failed must not cost the finding. Returns what it did — `swept` false
// means the daily guard held and nothing was read; `unreadable` names every
// place it could not look — so a caller or a test can tell "nothing was old"
// from "could not look" (ADR-005). A live marker belongs to a session under a
// week old; one older is re-said at worst once, which is the side this whole
// mechanism errs toward. The guard stores the time it was given rather than
// trusting its own mtime, so a test can drive the clock.
export function sweepStaleMarkers(tmp = os.tmpdir(), now = Date.now()) {
  const directory = saidMarkerDirectory(tmp)
  const report = { swept: false, removed: 0, kept: 0, unreadable: [] }
  try { mkdirSync(directory, { recursive: true }) } catch (error) { report.unreadable.push(`mkdir: ${error?.code ?? error}`); return report }
  const guard = path.join(directory, '.swept')
  if (!claimDailySweep(guard, now, report)) return report
  report.swept = true
  const stale = file => {
    try { return now - statSync(file).mtimeMs > SAID_MARKER_MAX_AGE_MS } catch { return false }
  }
  const sweep = (dir, accept) => {
    let names
    try { names = readdirSync(dir) } catch (error) { report.unreadable.push(`${dir}: ${error?.code ?? error}`); return }
    for (const name of names) {
      if (!accept(name)) continue
      const file = path.join(dir, name)
      if (!stale(file)) { report.kept += 1; continue }
      try { unlinkSync(file); report.removed += 1 } catch { report.kept += 1 }
    }
  }
  sweep(directory, name => MARKER_NAME.test(name))
  sweep(tmp, name => LEGACY_MARKER.test(name))
  return report
}

// Whether today's sweep is still owed, with the guard stamped for it. False means the
// guard held, or could not be written (said in `report.unreadable`): either way the
// caller removes nothing. One definition for both sweeps, so they cannot disagree.
function claimDailySweep(guard, now, report) {
  // ⚠ ONLY A FINITE STAMP INSIDE THE WINDOW HOLDS THE SWEEP. A stamp in the
  // future — a clock that jumped forward and was corrected, or `Infinity` from
  // a corrupted file — would otherwise suppress every sweep from then on, and
  // a guard that wedges shut is worse than no guard because nothing says it
  // happened (Codex review, 2026-09-06). Garbage reads as NaN and self-heals.
  let last = NaN
  try { last = Number(readFileSync(guard, 'utf8')) } catch {}
  if (Number.isFinite(last) && last <= now && now - last < SAID_SWEEP_INTERVAL_MS) return false
  // Written before the sweep, so a sweep that fails halfway does not retry on
  // every hook call for the rest of the day. If it cannot be written the work
  // cannot be bounded AT ALL, and an unbounded readdir of the temp root on
  // every hook call is worse than markers accumulating — which is only the
  // state §146 already described. So it is said and nothing is read.
  try { writeFileSync(guard, String(now)) } catch (error) {
    report.unreadable.push(`guard: ${error?.code ?? error}`)
    return false
  }
  return true
}

// Session logs older than a week, removed at most once a day per repository, so the
// directory stops growing without bound (the per-event cost is not the problem, the
// disk is: every log carries a full copy of `checks.jsonl`).
//
// ⚠ A LOG THAT HOLDS A WRITE GIT COULD NOT SEE IS KEPT, WHATEVER ITS AGE.
// `unseenWriteSince` reads every log in this directory and vetoes a commit on such a
// write recorded after a check began. Deleting that log would turn the veto into a pass
// for a check older than the write — the fail-open direction (ADR-005). Age cannot tell
// the two apart, so the log is read; one that cannot be read is kept. Never throws: it
// runs inside a hook, and a failed sweep costs disk and nothing else. `swept` false means
// the daily guard held; `unreadable` names every place it could not look.
const UNSEEN_WRITE_LINE = /"observable":\s*false/

export function sweepStaleSessionLogs(cwd, session, now = Date.now()) {
  const report = { swept: false, removed: 0, kept: 0, unreadable: [] }
  const directory = path.join(stateDir(cwd), 'sessions')
  const guard = path.join(directory, '.swept')
  let names
  try { names = readdirSync(directory) } catch (error) {
    if (error?.code !== 'ENOENT') report.unreadable.push(`${directory}: ${error?.code ?? error}`)
    return report
  }
  if (!claimDailySweep(guard, now, report)) return report
  report.swept = true
  const own = typeof session === 'string' && session ? path.basename(sessionLogFile(cwd, session)) : null
  for (const name of names) {
    if (!name.endsWith('.jsonl') || name === own) continue
    const file = path.join(directory, name)
    try {
      if (now - statSync(file).mtimeMs <= SAID_MARKER_MAX_AGE_MS || UNSEEN_WRITE_LINE.test(readFileSync(file, 'utf8'))) {
        report.kept += 1
        continue
      }
      unlinkSync(file)
      report.removed += 1
    } catch (error) {
      report.kept += 1
      report.unreadable.push(`${name}: ${error?.code ?? error}`)
    }
  }
  return report
}
