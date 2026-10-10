// What the ledgers say was checked: the latest check event for a tree, whether it certifies, whether an order could be
// established, which writes git could not see, and the records a session log imports from the check ledger. Moved out of
// lifecycle.mjs unchanged (BACKLOG section 375, stage B3). A log read in part is never read as a log with nothing in it.
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { appendEvent, canonical, canonicalFile, nearestExistingDirectory, readEvents, stateDir } from './event-log.mjs'
import { inside, outsideRoot } from './decision-corpus.mjs'
import { spawnSync } from 'node:child_process'
import { gitRepositoryRoot, observe, observeBudgetMs, observedClean, sameObservation } from './tree-facts.mjs'

/**
 * latestFastPass reads `fast-checks.jsonl`, which no reader of a full pass opens
 * (ADR-081): the LATEST fast record on this tree must grade as a pass. A line it
 * cannot read answers null, so a torn file exempts nothing. `count` is how many
 * fast records there are, which the publish advisory's key carries. A write git
 * cannot see, logged after that pass, answers null too: the full skip's veto,
 * read against the fast ledger's own count (BACKLOG §343).
 */
export function latestFastPass(cwd, tree, root = cwd) {
  let text
  try { text = readFileSync(path.join(stateDir(cwd), 'fast-checks.jsonl'), 'utf8') } catch { return null }
  let latest = null
  let latestSeq = 0
  let count = 0
  // ⚠ qh-check ends every record with a newline, so a last line without one was not written
  // whole even when it parses, and proves nothing: read as the importer reads `checks.jsonl`.
  const lines = text.split('\n')
  if (lines.pop().trim()) return null
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return null }
    // A row that is not a record proves nothing, as the importer reads it.
    if (typeof record?.id !== 'string') return null
    count += 1
    if (record?.after?.tree === tree) { latest = record; latestSeq = count }
  }
  if (!latest || checkEventName(latest) !== 'check.passed') return null
  if (unseenWriteSince(root, { seen: 'fastSeen', seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  return { command: latest.command, count }
}

/**
 * unseenWriteSince says whether any session log holds a write git cannot see that a
 * pass does not cover (ADR-081). A pass covers a write only when the write was
 * recorded before it, by the ledger count `seen` names (`checksSeen` for
 * `checks.jsonl`, `fastSeen` for `fast-checks.jsonl`), AND stamped before the pass
 * started: a clock that went back cannot hide a write the count says came after
 * (Codex review of ADR-081). A write with no count, logged before that count
 * existed, is judged by its time alone. Only a write inside `root` counts: a
 * scratchpad or a peer's temp file is outside what the tree's check reads, and
 * vetoing on one refused an ordinary commit (BACKLOG §343, review). A directory
 * that cannot be listed, or a log that cannot be read whole, may hide such a write,
 * so it answers true.
 */
export function unseenWriteSince(root, { seen, seq, started }) {
  const sessions = path.join(stateDir(root), 'sessions')
  let names = []
  try { names = readdirSync(sessions).filter(name => name.endsWith('.jsonl')) } catch (error) {
    // Absent is no session; a directory that cannot be listed hides what it holds.
    if (error?.code !== 'ENOENT') return true
  }
  for (const name of names) {
    let log
    try { log = readFileSync(path.join(sessions, name), 'utf8') } catch { return true }
    for (const line of log.split('\n')) {
      if (!line.trim()) continue
      let entry
      try { entry = JSON.parse(line) } catch { return true }
      if (entry?.event !== 'file.written' || entry.observable !== false) continue
      // A path that is not absolute says nothing about where it landed, and vetoes.
      if (typeof entry.path === 'string' && path.isAbsolute(entry.path) && writtenOutside(root, entry)) continue
      const counted = entry[seen]
      const recordedBefore = counted === undefined || (Number.isInteger(counted) && counted < seq)
      if (!(recordedBefore && Date.parse(entry.at) < started)) return true
    }
  }
  return false
}

// Whether a recorded write was outside the tree under EVERY spelling it was given: the canonical path the log keeps
// and the one the tool was handed (`lexical`), which differs for a path under a directory link.
function writtenOutside(root, entry) {
  return outsideRoot(root, entry.path)
    && (typeof entry.lexical !== 'string' || !path.isAbsolute(entry.lexical) || outsideRoot(root, entry.lexical))
}

/**
 * passedAlready answers whether the ledger already proves this tree (ADR-081): the
 * LATEST record, by position, for the same command on the tree as it is now must
 * grade `check.passed`. Anything it cannot establish answers null, and the check
 * runs (ADR-005):
 * - a ledger line it cannot read;
 * - a tree it cannot observe;
 * - a directory outside git;
 * - a write git cannot see, recorded in ANY session's log after the pass started,
 *   since a tree hash cannot speak for it. Every session, because a check run by
 *   hand carries no session id; a log last changed before the pass cannot hold one.
 * `observeTree` is the seam a test replaces. It lives here, not in qh-check, because
 * SessionStart reads it too (ADR-094 T2) and qh-check imports this module.
 *
 * ADR-094 T3: with `prose` (declared, validated paths) the tree is also observed with those
 * paths removed, and a row whose `codeTree` is equal, for the same command and the same
 * declared list, stands in for a tree that differs only under them (`viaProse`). A row
 * written before the declaration has no `codeTree` and is never reused this way. The
 * unseen-write veto below runs from the ORIGINAL pass's start either way.
 */
export function passedAlready({ root, git, command, env = process.env, observeTree = observe, prose = [] }) {
  if (git !== true) return null
  const now = prose.length ? observeTree(root, observeBudgetMs(env), { without: prose }) : observeTree(root)
  if (now?.ok !== true) return null
  let text
  try { text = readFileSync(path.join(stateDir(root), 'checks.jsonl'), 'utf8') } catch { return null }
  let latest = null
  const byId = new Map()
  let seq = 0
  let latestSeq = 0
  // ⚠ qh-check ends every record with a newline, so a last line without one was not written
  // whole even when it parses, and proves nothing: read as the importer reads it (ADR-088).
  const lines = text.split('\n')
  if (lines.pop().trim()) return null
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return null }
    // A row that is not a record proves nothing, as the importer reads it.
    if (typeof record?.id !== 'string') return null
    byId.set(record.id, record)
    seq += 1
    const sameTree = record?.after?.tree === now.tree
    const sameCode = !sameTree && prose.length > 0 && typeof now.codeTree === 'string' && record?.after?.codeTree === now.codeTree
      && Array.isArray(record?.prose) && record.prose.length === prose.length && record.prose.every((spec, at) => spec === prose[at])
    if (record?.command === command && (sameTree || sameCode)) latest = record
    if (latest === record) latestSeq = seq
  }
  if (!latest || checkEventName(latest) !== 'check.passed') return null
  if (unseenWriteSince(root, { seen: 'checksSeen', seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  const ms = Date.parse(latest.after?.at) - Date.parse(latest.before?.at)
  // The pass that actually ran: a reuse row names it (`reusedFrom`), so a chain of reuses never stands in for it. A tree
  // identical to the one that pass was taken on is not "prose changed" - nothing changed (a Windows run of 3.8.17).
  const original = typeof latest.reusedFrom === 'string' ? byId.get(latest.reusedFrom) : latest
  const sameAsPass = original?.after?.tree === now.tree
  return { at: latest.after.at, ms: Number.isFinite(ms) ? ms : null, id: latest.id, passOf: original?.id ?? latest.id, tree: now.tree, record: latest, now, rows: seq, viaProse: latest.after.tree !== now.tree && !sameAsPass }
}

// ADR-005: an observation that could not be made never matches anything.
// A `qh-check` record becomes exactly one event, the first rule that applies
// (ADR-060 Decision). Outside git no observation can be ok, so a pass there is
// not unproven: it clears only unobservable writes recorded before it started.
export function checkEventName(record) {
  if (record?.verdict === 'unstarted') return 'check.unstarted'
  // Inside git the evidence is about the TREE: a check that stages or commits has
  // not changed what it checked, and a not-ok side never matches (ADR-005).
  const treeOnly = observation => observation?.ok === true ? { ok: true, tree: observation.tree, index: null, head: null } : observation
  if (record?.verdict === 'timeout' || record?.signal) return 'check.timeout'
  // AFTER the signal: `unproven` is read from a phrase, and a recorded SIGTERM is
  // an observation. "deadline exceeded" at exit 1 with a signal is a timeout.
  if (record?.verdict === 'unproven') return 'check.unproven'
  // ⚠ GRADED ONLY ON THE TYPES qh-check WRITES. A row missing its exit was graded a failure,
  // and one whose `git` was the string "yes" a pass (js-spa-client D5, BACKLOG §319): a field
  // that is not what the writer puts there is a row nobody can read, which is could-not-look.
  if (typeof record?.exit !== 'number') return 'check.unproven'
  if (record.exit !== 0) return 'check.failed'
  if (typeof record.git !== 'boolean') return 'check.unproven'
  if (record.git === true && !sameObservation(treeOnly(record.before), treeOnly(record.after))) return 'check.unproven'
  if (record.verdict === 'no-work') return 'check.no-work'
  return 'check.passed'
}

/**
 * Import what `qh-check` wrote, and say whether the source could be read WHOLE.
 *
 * ⚠ THE SIBLING READER OF THE OTHER APPEND-ONLY FILE. `readEvents` was taught that
 * an incomplete read must not supply a positive verdict; this one still swallowed
 * a torn line with `catch { continue }` and had its return value discarded by the
 * caller. So a newer FAILURE whose line is truncated never reached the session log
 * at all — and `latestCheckFor` cannot refuse an order it cannot establish when
 * the event is simply absent. The older pass stood, and the note said a check had
 * passed. Found by a re-review and independently by an adversarial reader, both on
 * 2026-09-18.
 *
 * ⚠ A TORN APPEND LOSES TWO RECORDS, NOT ONE, and the file never repairs: a
 * truncated write leaves no trailing newline, so the NEXT record lands on the same
 * line and is unparseable with it. Measured by the reader. That is why this
 * reports a state rather than trying to recover the tail.
 */
export function importCheckRecords(cwd, session) {
  let text
  try { text = readFileSync(path.join(stateDir(cwd), 'checks.jsonl'), 'utf8') } catch (error) {
    // Never written is not the same as could-not-read.
    return { imported: 0, complete: error?.code === 'ENOENT' }
  }
  const seen = new Set(readEvents(cwd, session).filter(entry => typeof entry.record === 'string').map(entry => entry.record))
  let imported = 0
  let whole = true
  // ⚠ `checks.jsonl` IS THE AUTHORITY ON THE ORDER CHECKS RAN. It is append-only,
  // written by qh-check, so a record's INDEX in it is the one ordering nothing can
  // race. Stamping it here is what lets `latestCheckFor` refuse to be fooled by the
  // order two interleaved importers happen to append in — a wall clock can tie and
  // can run backwards, so `startedAt` could never be the authority.
  let sequence = 0
  // ⚠ qh-check ends every record with a newline, so a last line without one was not written
  // whole even when it parses — a pass cut right after its `}` is valid JSON. It is torn, and
  // never imported (a Codex review of ADR-088).
  const lines = text.split('\n')
  if (lines.pop().trim()) whole = false
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { whole = false; continue }
    if (typeof record?.id !== 'string') { whole = false; continue }
    sequence += 1
    if (seen.has(record.id)) continue
    appendEvent(cwd, session, {
      event: checkEventName(record), record: record.id, seq: sequence,
      startedAt: record.before?.at ?? null,
      before: record.before ?? null, after: record.after ?? null, exit: record.exit ?? null,
      signal: record.signal ?? null, command: record.command ?? null, origin: record.origin ?? null,
    })
    seen.add(record.id)
    imported += 1
  }
  return { imported, complete: whole }
}

/**
 * The session log `publishVerdict` judges, with every check event `checks.jsonl` does not hold
 * removed, and how many were (ADR-088 T2).
 *
 * The session log is appended to by every hook, and one hand-written `check.passed` line in it
 * cleared ADR-061's refusal (BACKLOG §295 item 9), while the one writer of check events is the
 * importer above, which copies `checks.jsonl`. So a `check.*` event is kept only when its `record`
 * names a ledger record whose grade by `checkEventName` and whose `after.tree` are the event's.
 * `check.source-unreadable` is kept always: it is the could-not-look marker, not a check.
 *
 * ⚠ A LEDGER NOT READ WHOLE BINDS NOTHING, AND SAYS SO. It returns the log unchanged with `torn`
 * set, and `publishVerdict` reads that as could-not-look: ADR-061's advice, never a refusal, and
 * never a silent pass. It cannot rely on the importer's `check.source-unreadable`, because git's
 * own hook discards the importer's answer and records none (a Codex review of ADR-088). A last line
 * with no terminating newline is torn, as the importer reads it. An absent ledger is read whole:
 * no check has been recorded, so every check event is unbound. It never writes, and the log keeps
 * its `complete` flag, which `.filter` would otherwise drop (see `logIncomplete`).
 */
export function ledgerBoundLog(cwd, log) {
  const torn = { log, dropped: 0, torn: true }
  let text
  try { text = readFileSync(path.join(stateDir(cwd), 'checks.jsonl'), 'utf8') } catch (error) {
    if (error?.code !== 'ENOENT') return torn
    text = ''
  }
  const lines = text.split('\n')
  if (lines.pop().trim()) return torn
  const records = new Map()
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return torn }
    if (typeof record?.id !== 'string') return torn
    // The first record of an id is the one the importer copied.
    if (!records.has(record.id)) records.set(record.id, record)
  }
  const bound = entry => {
    if (typeof entry?.event !== 'string' || !entry.event.startsWith('check.') || entry.event === 'check.source-unreadable') return true
    const record = typeof entry.record === 'string' ? records.get(entry.record) : undefined
    return record !== undefined && checkEventName(record) === entry.event && record.after?.tree === entry.after?.tree
  }
  const kept = log.filter(bound)
  kept.complete = log.complete
  return { log: kept, dropped: log.length - kept.length }
}

/**
 * Whether `observation` may stand as a late baseline: the first look of a session that has
 * no baseline, over a clean tree, with no write on record. recordHookEvent adopts it, and
 * publishVerdict applies the same rule without writing, for git's own hook, which prepares
 * none (Codex review of fe918bb, P2).
 *
 * ⚠ NOT AFTER THE TREE WAS SEEN. A shell edit writes no `file.written`, so a failed start,
 * a Stop that saw the edit, a commit and a clean publish look adopted the committed tree and
 * forgave it (Codex review of fe918bb, P1). An earlier look that succeeded, a baseline that
 * looked included, means this is not the first one, and what changed since is not known.
 */
export function lateBaselineAllowed(log, cwd, observation) {
  return !logIncomplete(log) && !log.some(event => event.observation?.ok === true)
    && !log.some(event => event.event === 'file.written' && event.observable !== false)
    && observedClean(cwd, observation)
}

export function recordFileWritten(input) {
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (typeof target !== 'string' || !target) return null
  // Canonical, so this path and rule A's candidate for the same file are one key.
  const absolute = canonicalFile(path.resolve(input.cwd, target))
  // How many records each ledger held when this write happened. Only a pass recorded
  // AFTER it can cover it; the importer may append an earlier pass later in the log.
  const entry = {
    event: 'file.written', path: absolute, observable: false,
    checksSeen: ledgerRecordCount(input.cwd, 'checks.jsonl'), fastSeen: ledgerRecordCount(input.cwd, 'fast-checks.jsonl'),
  }
  // The spelling the tool was given, kept when canonicalising changed it: a path under a directory link that leads out
  // of the tree is canonicalised to its target, and the inside spelling is the only evidence the write was ours to see
  // (a Codex review of ADR-094).
  const lexical = path.resolve(input.cwd, target)
  if (lexical !== absolute) entry.lexical = lexical
  const directory = nearestExistingDirectory(path.resolve(input.cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
  const parent = nearestExistingDirectory(absolute)
  if (root && parent) {
    const resolved = path.join(canonical(parent), path.relative(parent, absolute))
    const relative = path.relative(root, resolved)
    // A symlink inside the tree to a file outside it: git lists the link, and the
    // link does not change when the file behind it does, so the tree hash cannot
    // see this write. Recorded as observable, a check that ran BEFORE the write
    // would be read as covering it (BACKLOG §201). A path that does not exist yet
    // has nothing behind it and keeps the ordinary rule.
    let behind = null
    try { behind = realpathSync(resolved) } catch { behind = null }
    const escapes = behind !== null && (() => {
      const inside = path.relative(canonical(root), behind)
      return inside.startsWith('..') || path.isAbsolute(inside)
    })()
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !escapes) {
      const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', relative], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
      if (!ignored.error && ignored.status === 1) {
        const hashed = spawnSync('git', ['-C', root, 'hash-object', '--', relative], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
        entry.observable = true
        entry.blob = !hashed.error && hashed.status === 0 ? hashed.stdout.trim() : null
      }
    }
  }
  appendEvent(input.cwd, input.session_id, entry)
  return entry
}

// The number of records in a ledger (`checks.jsonl` or `fast-checks.jsonl`), counted
// the way `importCheckRecords` numbers `seq`. Null when the file exists and cannot be
// read: a count that was not taken is not zero (ADR-005). A last line with no terminating
// newline was not written whole, and the importer does not number it, so neither does this.
function ledgerRecordCount(cwd, file) {
  let text
  try { text = readFileSync(path.join(stateDir(cwd), file), 'utf8') } catch (error) {
    return error?.code === 'ENOENT' ? 0 : null
  }
  let count = 0
  for (const line of text.split('\n').slice(0, -1)) {
    if (!line.trim()) continue
    try { if (typeof JSON.parse(line)?.id === 'string') count += 1 } catch { /* the importer skips it too */ }
  }
  return count
}

// "Checked" for a tree: its latest check event is check.passed. A check event
// belongs to the tree of its `after` observation, and the evidence revision of a
// tree is how many check events it has, so a later check re-opens a finding.
function checkEventsFor(log, tree) {
  if (typeof tree !== 'string' || !tree) return []
  return log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.') && entry.after?.tree === tree)
}

/**
 * The check that ran LAST about this tree.
 *
 * ⚠ NOT `.at(-1)`. Two hooks importing the same `checks.jsonl` are not atomic:
 * the importer reads what it has already seen, then appends what it has not, and
 * an interleaving lands them in an order the checks never happened in. The
 * review's probe produced `older-pass, newer-fail, older-pass` and `checked:
 * true` — a stale re-append beat a real failure purely by arriving later.
 *
 * `checks.jsonl` is the authority on when a check ran, and every imported event
 * carries that check's `startedAt`. Ordering by it means a duplicate import can
 * never change WHICH check is latest, which is the guarantee a lock would have
 * bought, without one. Log position remains the tie-break, so a log whose events
 * carry no timestamps behaves exactly as before rather than worse.
 * Found by a different-lineage review of this branch, 2026-09-18.
 */
export function latestCheckFor(log, tree) {
  // ⚠ THE ONE PLACE A PASS BECOMES A VERDICT, SO THE ONE PLACE A TORN LOG IS
  // REFUSED. `ledgerEvidence` guarded this for itself and two other readers did
  // not, which is how `verified` and `QH ✓ checked` were produced from a log with
  // a line missing. A pass that survived may be older than a failure that did not
  // (ADR-005), so an incomplete log cannot certify — for ANY caller.
  const latest = latestRecordedCheck(log, tree)
  return latest?.event === 'check.passed' && logIncomplete(log) ? LOG_INCOMPLETE : latest
}

const LOG_INCOMPLETE = Object.freeze({ event: 'check.unproven', why: 'the log could not be read whole' })

function latestRecordedCheck(log, tree) {
  return latestOf(checkEventsFor(log, tree))
}

// The newest of some check events by when they RAN. One ordering, for the
// verdict about a tree and for the descriptive "Last check:" alike.
const ORDER_UNRESOLVED = Object.freeze({ event: 'check.unresolved', command: null })

export function latestOf(events, { unresolved = 'not-a-pass' } = {}) {
  if (!events.length) return null

  // 1. A RE-IMPORT IS NOT A NEW CHECK. Two hooks reading the same `checks.jsonl`
  //    can each append the same record, so dedupe by the record it came from.
  const seen = new Set()
  const unique = []
  for (const entry of events) {
    const id = typeof entry.record === 'string' && entry.record ? entry.record : null
    if (id !== null && seen.has(id)) continue
    if (id !== null) seen.add(id)
    unique.push(entry)
  }
  if (unique.length === 1) return unique[0]

  // 2. ORDER BY THE AUTHORITY. `checks.jsonl` is append-only and its order IS the
  //    order the checks ran, so the importer stamps each event with that index as
  //    `seq`. `startedAt` is the fallback for logs written before `seq` existed —
  //    a wall clock can tie, and it can go BACKWARDS, so it is not the authority.
  const rankOf = entry => {
    if (Number.isInteger(entry.seq)) return ['seq', entry.seq]
    if (typeof entry.startedAt === 'string' && entry.startedAt) return ['at', entry.startedAt]
    return null
  }
  const ranks = unique.map(rankOf)
  const kinds = new Set(ranks.map(rank => rank?.[0] ?? 'none'))
  let candidates = unique
  if (kinds.size === 1 && !kinds.has('none')) {
    let best = null
    for (const rank of ranks) if (best === null || rank[1] > best) best = rank[1]
    candidates = unique.filter((_, index) => ranks[index][1] === best)
  }
  if (candidates.length === 1) return candidates[0]

  // ⚠ AN ORDER WE CANNOT ESTABLISH MUST NOT CERTIFY. Ties, a mix of stamped and
  // unstamped events, or nothing to order by at all: any of these could be the
  // newest, so if they disagree the one that is NOT a pass is the answer. Taking
  // the last-appended instead is what let a stale re-import beat a real failure
  // (ADR-005 — an unresolved order is could-not-look, not a verdict).
  // That is the right answer for a VERDICT. For the descriptive "Last check:" it
  // is a second unobserved claim — "the failure ran last" — so that caller asks
  // to be told the order could not be established instead.
  if (unresolved === 'say-so' && new Set(candidates.map(entry => entry.event)).size > 1) return ORDER_UNRESOLVED
  return candidates.find(entry => entry.event !== 'check.passed') ?? candidates[0]
}

export function treeChecked(log, tree) {
  return latestCheckFor(log, tree)?.event === 'check.passed'
}

// 'passed' certifies. 'unresolved' is an order that could not be established:
// it must not be said as "no check has passed", and it must not clear the tree.
// 'unknown' is a log that was not read whole.
export function checkStanding(log, tree) {
  if (logIncomplete(log)) return 'unknown'
  const descriptive = latestOf(checkEventsFor(log, tree), { unresolved: 'say-so' })
  if (!descriptive) return 'none'
  if (descriptive.event === 'check.unresolved') return 'unresolved'
  if (descriptive.event === 'check.passed') return 'passed'
  // A check that timed out, never started, or could not observe its tree said
  // nothing about the tree. It is not a failure, and it must not refuse (ADR-061).
  if (COULD_NOT_LOOK.has(descriptive.event)) return 'could-not-look'
  return 'not-passed'
}

const COULD_NOT_LOOK = new Set(['check.unproven', 'check.timeout', 'check.unstarted'])

export function checkRevision(log, tree) {
  return checkEventsFor(log, tree).length
}

// ---- ADR-060's completion rules. They read the event log and git, never the
// transcript. R1 is work no check has passed on, R2 is a newly reachable commit
// whose tree nothing checked, R4 is an observation that could not be made. Each
// speaks once per rule and evidence state, so a finding does not repeat while
// nothing has moved.
export function emittedFor(log, rule, key) {
  return log.some(entry => entry.event === 'action.emitted' && entry.rule === rule && entry.key === key)
}

// R2's own dedupe: one delivered action carries several commit keys in its
// detail, and a commit named in any of them has been said.
export function namedByReview(log, key) {
  return log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R2'
    && (entry.key === key || entry.detail?.commits?.includes(key)))
}

// P already said this tree is unchecked, before the command ran. Saying it again
// at the end of the same turn is the repetition ADR-060 closed (BACKLOG §217).
export function namedByPublish(log, tree, revision) {
  return log.some(entry => entry.event === 'action.emitted' && entry.rule === 'P'
    && entry.detail?.tree === tree && entry.detail?.revision === revision)
}

// A write git cannot see stays outstanding until a check.passed in a log that
// was read whole covers it, and a pass covers it only when BOTH orders agree.
// The record order: a write that counted the check records it saw needs a pass
// with a higher `seq`, because the importer can append an older pass after the
// write (Codex review, 2026-09-22); a write with no count falls back to log
// position, and a count that was taken and failed (`checksSeen: null`) is
// unknown, so that write stays outstanding. And the start order: the pass must
// have STARTED after the write, because a check that was already running did
// not see it. Either order alone failed open: the timestamp alone when a clock
// stepped backwards, the record order alone when a check spanned the write (CI
// mutation campaign on 0150376). Together, only a clock stepping backwards
// DURING a check can still hide a write. An incomplete log leaves every such
// write outstanding.
// ADR-094 T4: given the repository's root, an ABSOLUTE path outside it is not a write this tree could
// hold — `unseenWriteSince` has always skipped it, and a scratchpad Write made the previous-session
// notice and the completion advice accuse a repository nothing had touched. A relative or unplaceable
// path, and a symlink leaf (it keeps its own name inside the tree), still count; no root keeps today's count.
export function unobservableWrites(log, root = null) {
  const writes = (entry) => entry.event === 'file.written' && entry.observable === false
    && !(root && typeof entry.path === 'string' && path.isAbsolute(entry.path) && writtenOutside(root, entry))
  if (logIncomplete(log)) return log.filter(writes)
  const recordedAfter = (write, pass) => write.checksSeen === undefined
    || (Number.isInteger(write.checksSeen) && Number.isInteger(pass.seq) && pass.seq > write.checksSeen)
  const startedAfter = (write, pass) => typeof write.at !== 'string' || typeof pass.startedAt !== 'string'
    || pass.startedAt > write.at
  return log.filter((entry, index) => writes(entry) && !log.some((later, at) => at > index
    && later.event === 'check.passed' && recordedAfter(entry, later) && startedAfter(entry, later)))
}

// The evidence revision where nothing can be observed: every check event is one,
// since there is no tree to attach it to (ADR-005 — unknown is not "the same").
export function revisionFor(log, observation) {
  return observation?.ok === true
    ? checkRevision(log, observation.tree)
    : log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.')).length
}

/**
 * Whether what this session recorded could not be read whole.
 *
 * Two ways, one answer. `complete === false` is a session log with a torn line.
 * `check.source-unreadable` is `checks.jsonl` found unreadable in part — recorded
 * as an EVENT rather than returned, because the condition is durable: a torn
 * append leaves no trailing newline, so the next record lands on the same line
 * and the file never repairs itself. Either way a history missing records cannot
 * support a positive answer (ADR-005). Exported so the status line applies the
 * same precondition instead of a comment claiming it does.
 */
export function logIncomplete(log) {
  // ⚠ WHOLE IS SOMETHING A LOG HAS TO SAY, NOT SOMETHING ITS SILENCE IMPLIES.
  // This read `complete === false`, and `complete` is a property hung on an ARRAY:
  // `[...log]`, `.filter`, `.map`, `.slice` and a JSON round trip all drop it, and
  // the copy of a torn log then certified — `verified`, `QH ✓ checked` — through
  // every exported reader (different-lineage review, 2026-09-19). No production
  // site makes such a copy today; the next one would have been invisible.
  return log?.complete !== true
    || (Array.isArray(log) && log.some(event => event?.event === 'check.source-unreadable'))
}

/**
 * Which record could not be read whole, for the sentence that says so. A torn `checks.jsonl`
 * was reported as the session's own log, which was whole (a corpus-chaos run's D4, at two
 * commits): the verdict, unknown, was right and the file it named was not. `sessionWords` is
 * how the calling sentence spells the session log, kept when that is what tore.
 */
export function tornRecord(log, sessionWords = null) {
  return log?.complete !== true ? sessionWords : '`checks.jsonl`, where `qh-check` records its runs,'
}
