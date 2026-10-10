// What a session keeps for itself and for the next one: the note PreCompact leaves and the compact SessionStart hands back,
// the last session that ended here, the once-per-session mention markers, and the claim that serves a note once. Moved out
// of lifecycle.mjs unchanged (BACKLOG section 375, stage B4). A note that cannot be tied to its compaction is not served.
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { mkdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { checkInCode, shownPath } from './corpus-text.mjs'
import { trackedPaths } from './decision-corpus.mjs'
import { nearestExistingDirectory } from './event-log.mjs'
import { gitRepositoryRoot, locationKey } from './tree-facts.mjs'
import { checkCommandOrigin, projectCheckCommand } from './check-command.mjs'
import { passedAlready } from './check-ledger.mjs'
import { readyTaskLines } from './ready-lines.mjs'
import { SAID_MARKER_MAX_AGE_MS, saidMarkerDirectory, sweepStaleMarkers } from './housekeeping.mjs'

// Said once per path per session. New context at every Edit would repeat the
// same decisions all session for a hot file, which is how a delivery becomes a
// nag — the failure this whole release is about. Session-scoped because a marker
// that outlived the session would silence the FIRST edit of the next one.
// Compaction is the one event that empties what these markers protect: after
// it the agent has lost every context they gated, and a marker that survived
// would keep the SECOND mention silent for exactly the session that no longer
// has the first. So a session carries a generation, bumped at SessionStart on
// `compact` (and `clear`), and the stamp includes it.
function sessionGenerationPath(sessionId) {
  const stamp = createHash('sha256').update(sessionId).digest('hex').slice(0, 32)
  return path.join(os.tmpdir(), `quality-harness-gen-${stamp}`)
}

function sessionGeneration(sessionId) {
  try { return Number(readFileSync(sessionGenerationPath(sessionId), 'utf8').trim()) || 0 } catch { return 0 }
}

export function bumpSessionGeneration(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return 0
  const next = sessionGeneration(sessionId) + 1
  try { writeFileSync(sessionGenerationPath(sessionId), String(next)) } catch {}
  return next
}

export function sessionStateNote(facts, cwd, root, insideRepository, now = new Date(), { tasks = true } = {}) {
  const files = Array.isArray(facts?.files) ? facts.files : []
  const other = Number(facts?.other) || 0
  const shown = files.slice(0, 5).map(file => shownPath(path.relative(cwd, file) || file))
  if (files.length > shown.length) shown.push(`+${files.length - shown.length} more`)
  const pending = facts?.pending === true
  const late = facts?.late === true
  // Three states, not two: 'neutral' is a session that changed nothing, which
  // says nothing about what an EARLIER session left — a reader walking back must
  // not stop on it (Codex review, 2026-09-05).
  // A tree nothing could observe is never 'neutral' and never 'verified': those
  // are claims about a tree that was looked at.
  const observed = facts?.observed !== false
  // Credit a check only when one is ON RECORD as having passed. `pending` being
  // false is not evidence that anything ran — an inherited dirty tree is not
  // `treeUnchecked`, so it arrives here with pending false and no check at all.
  // ⚠ ONLY the check for THIS tree can credit it. `lastCheck` is the newest check
  // event whatever tree it was about, so `|| lastCheck.verdict === 'passed'` let a
  // pass for an UNRELATED tree certify these paths. It stays descriptive — the
  // note prints it as "Last check:" — and certifies nothing.
  const passed = facts?.checked === true
  // ⚠ `neutral` IS A CLAIM THAT NOTHING IS OUTSTANDING, so `pending` gates it too.
  // A turn that COMMITS its work has no uncommitted file and an unchecked tree:
  // it took this arm, persisted `neutral`, and the next session was told nothing
  // — while R1, same session, same tree, named the commit by sha (audit B1).
  const status = !observed ? 'unverified'
    // ...and a LATE baseline cannot make that claim for the session: it covers
    // only what followed it (different-lineage review, 2026-09-19).
    : files.length === 0 && other === 0 && !pending ? (late ? 'unverified' : 'neutral')
      : pending || !passed ? 'unverified' : 'verified'
  const parts = []
  const unordered = facts?.treeOrder === 'unresolved'
  // A check that could not look after a pass is not "no check passed" (ADR-061).
  const unobserved = facts?.treeOrder === 'could-not-look'
  if (files.length && observed) {
    const verdict = unordered ? 'which check ran last on this tree could not be established'
      : unobserved ? 'the latest `qh-check` on this tree could not observe it, so it is not known to be checked'
      : pending ? 'no `qh-check` has passed on them'
      : passed ? `a \`qh-check\` passed on them${facts?.checkOrigin === 'inferred'
        ? ` — using an INFERRED check (${checkInCode(facts.checkCommand ?? 'unknown')}), guessed from a manifest and not declared, so it may not be this project's whole gate; declare the real command as \`check\` in .quality-harness.json`
        : ''}`
        : 'nothing here changed them since the session began, and no `qh-check` has passed on them'
    parts.push(`${files.length} changed path(s)${other ? ` and ${other} write(s) git cannot see` : ''}; `
      + `${verdict}${shown.length ? `: ${shown.join(', ')}` : ''}.`)
  } else if (other) {
    parts.push(`${other} write(s) git cannot see since the last passing check.`)
  } else if (!observed) {
    parts.push(`${facts?.why ?? 'the working tree could not be observed'}, so what changed here is unknown.`
      + (files.length ? ` Git lists ${files.length} changed path(s): ${shown.join(', ')}.` : ''))
  } else if (pending) {
    parts.push(unordered
      ? 'nothing is uncommitted, and which check ran last on the tree at HEAD could not be established.'
      : unobserved
        ? 'nothing is uncommitted, and the latest `qh-check` on the tree at HEAD could not observe it.'
        : 'nothing is uncommitted, and the tree at HEAD is one no `qh-check` has passed on.')
  } else {
    parts.push(late
      ? 'nothing has changed in the working tree since this plugin began watching — which was partway through this '
        + 'session, so what happened before that, a commit included, is unknown here (ADR-005).'
      : 'nothing has changed in the working tree.')
  }
  parts.push(facts?.whole === false ? 'Which check ran last is unknown.'
    : facts?.lastCheck?.verdict === 'unresolved' ? 'Which check ran last could not be established: the records disagree and cannot be ordered.'
      : facts?.lastCheck
        ? `Last check: ${checkInCode(facts.lastCheck.command ?? 'qh-check')} ${facts.lastCheck.verdict}.`
        : 'No check has run this session.')
  if (tasks) {
    const listing = insideRepository ? trackedPaths(root) : null
    const ready = readyTaskLines(root, insideRepository, listing)
    if (ready.look === 'UNPROVEN') {
      parts.push('ADR tasks in flight: UNPROVEN (git could not list the tree).')
    } else if (ready.lines.length) {
      const unproven = ready.lines.find(line => line.includes('UNPROVEN'))
      parts.push(`ADR task in flight: ${(unproven ?? ready.lines[0]).trim()}`)
    }
  }
  return { at: now.toISOString(), status, unverified: pending, files, other, text: parts.join(' ') }
}

function sessionNotePath(sessionId) {
  const stamp = createHash('sha256').update(sessionId).digest('hex').slice(0, 32)
  return path.join(os.tmpdir(), `quality-harness-note-${stamp}`)
}

export function readSessionNote(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  try { return JSON.parse(readFileSync(sessionNotePath(sessionId), 'utf8')) } catch { return null }
}

/**
 * Replace this session's state note, or leave NONE. Null removes it.
 *
 * The old note goes first, so a replace that fails cannot leave a stale one behind
 * to be handed back as current (Codex review, 2026-09-05): a note from an EARLIER
 * compaction read as this one's is worse than no note. `write` is a parameter
 * because nothing outside can make a real write fail on demand, and a branch with
 * no injectable seam has no test (CLAUDE.md §7) — this one lost its only test when
 * PreCompact stopped reading transcripts, and its mutant survived until 2026-09-19.
 */
export function replaceSessionNote(sessionId, note, write = writeFileSync) {
  if (typeof sessionId !== 'string' || !sessionId) return false
  // ⚠ "OR LEAVE NONE" HAS TO BE TRUE WHEN THE UNLINK FAILS TOO. This swallowed
  // every unlink error, so EACCES followed by a failed write left the OLD note in
  // place and readable, and with `note === null` it even returned true over it.
  // A missing file is the only failure that means "there is none".
  let cleared = true
  try { unlinkSync(sessionNotePath(sessionId)) } catch (failure) { cleared = failure?.code === 'ENOENT' }
  if (note === null) {
    if (!cleared) process.stderr.write('[quality-harness] PreCompact: an earlier state note could not be removed; it is older than this compaction.\n')
    return cleared
  }
  try { write(sessionNotePath(sessionId), JSON.stringify(note)); return true } catch (failure) {
    process.stderr.write(`[quality-harness] PreCompact: could not keep the state note (${failure.code ?? failure.message})`
      + `${cleared ? '' : ', and an earlier one could not be removed; it is older than this compaction'}.\n`)
    return false
  }
}

// The last row SessionEnd wrote for this location that SAYS something: a
// neutral session (nothing edited since its last publish) is skipped, because
// it proves nothing about what an earlier one left. Null when there is no
// home, no ledger, or no such row — "nothing known", which a first session
// deserves. Rows from before `location` existed are matched on cwd.
function previousSessionHere(cwd, platform = process.platform) {
  const home = process.env.CLAUDE_PLUGIN_DATA
  if (!home || typeof cwd !== 'string') return null
  let rows
  try { rows = readFileSync(path.join(home, 'sessions.jsonl'), 'utf8').split('\n').filter(Boolean) } catch { return null }
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const here = locationKey((directory && gitRepositoryRoot(directory)) ?? directory ?? cwd, platform)
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    let row
    try { row = JSON.parse(rows[index]) } catch { continue }
    const key = typeof row.location === 'string' ? row.location : typeof row.cwd === 'string' ? locationKey(row.cwd, platform) : null
    if (key !== here) continue
    if (row.status === 'neutral') continue
    return row
  }
  return null
}

export function previousSessionNotice(cwd, platform = process.platform) {
  const row = previousSessionHere(cwd, platform)
  if (!row || row.status !== 'unverified') return ''
  const files = Array.isArray(row.files) ? row.files.slice(0, 5).map(file => shownPath(path.relative(cwd, file) || file)) : []
  const other = Number(row.other) || 0
  const what = [row.files?.length ? `${row.files.length} edit(s)` : '', other ? `${other} write(s) git cannot see` : ''].filter(Boolean).join(' and ') || 'edits'
  const check = projectCheckCommand(cwd)
  // ADR-094 T2: a pass recorded for the tree as it is now answers this notice, dirty or clean. No pass, a
  // tree that could not be observed and no declared check all keep it: only a proven tree is silent.
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const repository = directory ? gitRepositoryRoot(directory) : null
  const declared = repository ? checkCommandOrigin(repository).command : null
  if (repository && declared && passedAlready({ root: repository, git: true, command: declared })) return ''
  // ⚠ AN `unverified` ROW IS NOT ALWAYS A ROW ABOUT EDITS. A session whose tree
  // could not be observed, or that was watched only from partway through, is
  // persisted `unverified` with NO files — and `|| 'edits'` above then told the
  // next session it "ended with edits after which no recognised check passed":
  // an observation nobody made, about work that may not exist (ADR-005).
  if (typeof row.unknown === 'string' && row.unknown) {
    return `The previous session in this directory ended (${row.reason ?? 'unknown reason'}, ${row.at}) with its state `
      + `UNKNOWN to this plugin — ${row.unknown}.${files.length ? ` Git listed: ${files.join(', ')}.` : ''}`
      // What IS known stays said: a write recorded with no passing check after it
      // does not stop being outstanding because the tree could not be seen. Worded
      // as what is ON RECORD — the row may come from a log that lost a line, and
      // "no check passed" would be a verdict about the line that was lost.
      + `${other ? ` ${other} write(s) git cannot see were recorded, and no passing check after them is on record.` : ''} `
      + (check ? `${checkInCode(check)} is this project's check.` : 'No check is declared here.')
  }
  return `The previous session in this directory ended (${row.reason ?? 'unknown reason'}, ${row.at}) with `
    + `${what} after which no recognised check passed${files.length ? `: ${files.join(', ')}` : ''}. `
    // The one sentence here that says Run names qh-check: the span beside it is the declared
    // command's text, and running that any other way records nothing (Codex review of ffd4892, #4).
    + (check ? `Run \`qh-check\` (it runs ${checkInCode(check)}) before building on them.` : 'Nothing has checked them since.')
}

function sessionMentionPath(sessionId, key) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  const generation = sessionGeneration(sessionId)
  const stamp = createHash('sha256').update(`${sessionId}#${generation}#${key}`).digest('hex').slice(0, 32)
  return path.join(saidMarkerDirectory(), stamp)
}

export function alreadyMentionedThisSession(sessionId, key) {
  const marker = sessionMentionPath(sessionId, key)
  if (!marker) return false
  try { return Date.now() - statSync(marker).mtimeMs <= SAID_MARKER_MAX_AGE_MS } catch { return false }
}

// ADR-094 T2: a STANDING fact is said once per repository and text for three days, not at every start.
// Keyed on the repository and the text's hash, in the directory and under the sweep of the per-session
// markers, so a changed text is a new key and is said. True means "say it now" and refreshes the marker;
// a marker that cannot be kept errs toward saying, as firstMentionThisSession does. Compaction and clear
// lose the context, so they never ask.
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

export function firstMentionThisSession(sessionId, key) {
  const marker = sessionMentionPath(sessionId, key)
  if (!marker) return true
  sweepStaleMarkers()
  // Exclusive create: two parallel tool calls carrying the same finding both
  // saw no marker and both said it in full (Codex review, 2026-09-05). EEXIST
  // is the second caller's answer; any other failure means the marker cannot
  // be kept and the finding is said, which errs toward not hiding.
  try { writeFileSync(marker, '', { flag: 'wx' }) } catch (error) { return error?.code !== 'EEXIST' }
  return true
}

// One compact SessionStart serves the note. Two readers can both see the log
// before either appends note.served, so the claim is an exclusive create.
// EEXIST means the other reader won. Any other failure does not serve the note.
export function claimCompaction(sessionId, compactionId, tmp = os.tmpdir()) {
  if (typeof sessionId !== 'string' || !sessionId || typeof compactionId !== 'string' || !compactionId) {
    return { claimed: false, reason: 'missing id' }
  }
  const directory = saidMarkerDirectory(tmp)
  try { mkdirSync(directory, { recursive: true }) } catch (error) {
    return { claimed: false, reason: error?.code ?? 'mkdir failed' }
  }
  const stamp = createHash('sha256').update(`${sessionId}#${compactionId}`).digest('hex').slice(0, 32)
  const marker = path.join(directory, stamp)
  try {
    writeFileSync(marker, '', { flag: 'wx' })
    return { claimed: true, reason: '' }
  } catch (error) {
    if (error?.code === 'EEXIST') return { claimed: false, reason: 'claimed' }
    return { claimed: false, reason: error?.code ?? 'create failed' }
  }
}
