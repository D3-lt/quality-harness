// What the ledgers say was checked: the latest check event for a tree, whether it certifies, whether an order could be
// established, which writes git could not see, and the records a session log imports from the check ledger. Moved out of
// lifecycle.mjs unchanged (BACKLOG section 375, stage B3). A log read in part is never read as a log with nothing in it.
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { outsideRoot, stateDir } from './event-log.mjs'
import { observe, observeBudgetMs, sameObservation } from './tree-facts.mjs'
import { fastCheckCommand } from './check-command.mjs'

// ADR-111 T3: the baseline kept for a tree and a command, or null: the last bound row of baseline.jsonl, the ledger a
// session-start check is written to (Decision 1's correction). Only the turn end reads it, so no reader of a pass can be
// handed a baseline; a row whose tree moved during its run is unbound and is never returned.
export function baselineFor(root, tree, command) {
  let text
  try { text = readFileSync(path.join(stateDir(root), 'baseline.jsonl'), 'utf8') } catch { return null }
  let found = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (row?.baseline?.bound === true && row.baseline.tree === tree && row.command === command && typeof row.verdict === 'string') found = row
  }
  return found
}

/**
 * ledgerPass reads one check ledger strictly (ADR-101 T2): `checks.jsonl` for the full check, `fast-checks.jsonl` for the
 * fast one, the same rules for both. The LATEST row `match` accepts, by position, must grade `check.passed`, and no write
 * git cannot see may be logged after it (`unseenWriteSince`, against `seen`, the ledger's own count key). Anything it cannot
 * establish answers null (ADR-005): a ledger it cannot read, a last line with no newline (qh-check ends every record with
 * one, so that line was not written whole even when it parses), an unparsable line, or a row without an `id`. The answer
 * carries the row, its position, the number of rows and every row by id, so each caller builds what it says from one read.
 * `vetoRoot` is the tree the unseen writes are judged inside.
 */
export function ledgerPass(stateRoot, { file, seen, match, vetoRoot = stateRoot }) {
  let text
  try { text = readFileSync(path.join(stateDir(stateRoot), file), 'utf8') } catch { return null }
  const lines = text.split('\n')
  if (lines.pop().trim()) return null
  let latest = null
  let latestSeq = 0
  let count = 0
  const byId = new Map()
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return null }
    // A row that is not a record proves nothing, as the importer reads it.
    if (typeof record?.id !== 'string') return null
    byId.set(record.id, record)
    count += 1
    if (match(record)) { latest = record; latestSeq = count }
  }
  if (!latest || checkEventName(latest) !== 'check.passed') return null
  if (unseenWriteSince(vetoRoot, { seen, seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  return { latest, seq: latestSeq, count, byId }
}

/**
 * latestFastPass reads `fast-checks.jsonl`, which no reader of a full pass opens
 * (ADR-081): the LATEST fast record on this tree, for the fastCheck the project declares
 * now, must grade as a pass. A row for another command is no fast pass of this one
 * (ADR-113 T3). `count` is how many fast records there are, which the publish advisory's
 * key carries. A write git cannot see, logged after that pass, answers null: the full
 * skip's veto, read against the fast ledger's own count (BACKLOG §343).
 */
export function latestFastPass(cwd, tree, root = cwd) {
  const command = fastCheckCommand(root)
  if (!command) return null
  const pass = ledgerPass(cwd, { file: 'fast-checks.jsonl', seen: 'fastSeen', match: record => record?.after?.tree === tree && record.command === command, vetoRoot: root })
  return pass ? { command: pass.latest.command, count: pass.count } : null
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
  const match = record => {
    const sameTree = record?.after?.tree === now.tree
    const sameCode = !sameTree && prose.length > 0 && typeof now.codeTree === 'string' && record?.after?.codeTree === now.codeTree
      && Array.isArray(record?.prose) && record.prose.length === prose.length && record.prose.every((spec, at) => spec === prose[at])
    return record?.command === command && (sameTree || sameCode)
  }
  const pass = ledgerPass(root, { file: 'checks.jsonl', seen: 'checksSeen', match })
  if (!pass) return null
  const { latest, byId, count } = pass
  const ms = Date.parse(latest.after?.at) - Date.parse(latest.before?.at)
  // The pass that actually ran: a reuse row names it (`reusedFrom`), so a chain of reuses never stands in for it. A tree
  // identical to the one that pass was taken on is not "prose changed" - nothing changed (a Windows run of 3.8.17).
  const original = typeof latest.reusedFrom === 'string' ? byId.get(latest.reusedFrom) : latest
  const sameAsPass = original?.after?.tree === now.tree
  return { at: latest.after.at, ms: Number.isFinite(ms) ? ms : null, id: latest.id, passOf: original?.id ?? latest.id, tree: now.tree, record: latest, now, rows: count, viaProse: latest.after.tree !== now.tree && !sameAsPass }
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
 * ADR-103 T2. The line a full run says when it took at least 1.5 times the median of this command's own last 20 full passes,
 * given at least five, or null. `records` are the ledger rows BEFORE this run's own. A pass is a row `checkEventName` grades
 * `check.passed` and no reuse (`reusedFrom`, ADR-094): a reused row carries another run's times, so counting it would count
 * one measurement twice. A run's time is its window, `after.at` less `before.at`; the median of an even count is the lower
 * middle. The load and the checks beside the run are said on lines qh-check already prints (ADR-075, ADR-077), so not here.
 */
export function slowRunLine(records, command, ms) {
  const times = records
    .filter(record => record?.command === command && record.reusedFrom === undefined && checkEventName(record) === 'check.passed')
    .slice(-20)
    .map(record => Date.parse(record.after?.at) - Date.parse(record.before?.at))
    .filter(Number.isFinite)
  if (times.length < 5 || !Number.isFinite(ms)) return null
  const median = [...times].sort((a, b) => a - b)[Math.floor((times.length - 1) / 2)]
  if (!(median > 0) || ms < 1.5 * median) return null
  const seconds = value => `${(value / 1000).toFixed(1)} s`
  return `this run took ${seconds(ms)}, ${(ms / median).toFixed(1)}x the median ${seconds(median)} of its last ${times.length} passes`
}

/** `slowRunLine` for the full run `record` qh-check just wrote: the rows of `checks.jsonl` other than its own. */
// ADR-103 T3: the history is the rows BEFORE this run's own, never one written after it (a concurrent writer's, the Codex review of
// T2), read from the ledger's last MiB, so a ledger that grows for years costs no more per run; a partial first line is not a
// row. A run the tail does not hold has no place to end its history, and says nothing.
const SLOW_RUN_TAIL_BYTES = 1024 * 1024
export function slowRunLineAfter(root, record) {
  let text
  try {
    const file = path.join(stateDir(root), 'checks.jsonl')
    const size = statSync(file).size
    const from = Math.max(0, size - SLOW_RUN_TAIL_BYTES)
    const bytes = Buffer.alloc(size - from)
    const fd = openSync(file, 'r')
    try { readSync(fd, bytes, 0, bytes.length, from) } finally { closeSync(fd) }
    text = bytes.toString('utf8')
    if (from > 0) text = text.slice(text.indexOf('\n') + 1)
  } catch { return null }
  const rows = text.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  const at = rows.findIndex(row => row?.id === record.id)
  if (at < 0) return null
  return slowRunLine(rows.slice(0, at), record.command, Date.parse(record.after?.at) - Date.parse(record.before?.at))
}

/**
 * Import what `qh-check` wrote, and say whether the source could be read WHOLE.
 *
 * ⚠ THE SIBLING READER OF THE OTHER APPEND-ONLY FILE. The session-log reader was taught that
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


// A write whose files its input does not name (an mrw grep/sub write): recorded with no path, which every reader of an unseen
// write counts until a check passes after it (`unobservableWrites`, `unseenWriteSince`).

// How many records each ledger held when a write happened. Only a pass recorded AFTER it can cover it; the importer may append
// an earlier pass later in the log.

// The number of records in a ledger (`checks.jsonl` or `fast-checks.jsonl`), counted
// the way `importCheckRecords` numbers `seq`. Null when the file exists and cannot be
// read: a count that was not taken is not zero (ADR-005). A last line with no terminating
// newline was not written whole, and the importer does not number it, so neither does this.

// "Checked" for a tree: its latest check event is check.passed. A check event
// belongs to the tree of its `after` observation, and the evidence revision of a
// tree is how many check events it has, so a later check re-opens a finding.
//
// ADR-120 T9: with a `carry` ({ codeTree, prose }, that tree's code tree under the project's declared list), the events of
// any tree with the same code tree under the same list belong to it too, whatever their grade: a pass stands for a tree that
// differs only under the list, and a newer failure on that code still beats it.
function checkEventsFor(log, tree, carry = null) {
  if (typeof tree !== 'string' || !tree) return []
  const carried = carriedBy(carry)
  return log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.') && (entry.after?.tree === tree || carried(entry)))
}

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((spec, at) => spec === b[at])
// The events a carry speaks for: those taken on its code tree under its list.
const carriedBy = carry => entry => typeof carry?.codeTree === 'string' && entry.after?.codeTree === carry.codeTree && sameList(entry.prose, carry.prose)

/**
 * ADR-120 T9. What a pass may be carried by for one tree: its code tree and the declared list it was taken under, or null.
 * Null when the tree has no code tree (the project declares nothing, or git could not say), and null while a write git cannot
 * see is outstanding: the code tree speaks for what git lists, so it cannot speak for that write (ADR-005).
 */
export function carryFor(log, root, codeTree, prose) {
  const carry = unobservableWrites(log, root).length === 0 ? carryWith(codeTree, prose) : null
  return carry && !carriedPassUnseen(log, root, carry) ? carry : null
}

/**
 * Whether a write git cannot see, in ANY session's log of this repository, follows the pass a carry would stand on: the pass is the
 * latest check event taken on that code tree under that list, and the veto is `passedAlready`'s (`unseenWriteSince`, from the
 * pass's own start and ledger position). `carryFor` looked only at the log it was handed, so a write another session made to a
 * file the check reads (an ignored one) left the carry standing. No root says nothing about where to look, so it vetoes nothing.
 */
export function carriedPassUnseen(log, root, carry) {
  if (!carry || !root) return false
  const carried = log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.') && carriedBy(carry)(entry))
  const latest = latestOf(carried)
  if (latest?.event !== 'check.passed') return false
  return unseenWriteSince(root, { seen: 'checksSeen', seq: latest.seq, started: Date.parse(latest.before?.at) })
}

// The carry without the write check, for a judge that is handed its writes (tests/pure-judges.test.mjs keeps it from reading files).
export function carryWith(codeTree, prose) {
  if (typeof codeTree !== 'string' || !codeTree || !Array.isArray(prose) || prose.length === 0) return null
  return { codeTree, prose }
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
export function latestCheckFor(log, tree, carry = null) {
  // ⚠ THE ONE PLACE A PASS BECOMES A VERDICT, SO THE ONE PLACE A TORN LOG IS
  // REFUSED. `ledgerEvidence` guarded this for itself and two other readers did
  // not, which is how `verified` and `QH ✓ checked` were produced from a log with
  // a line missing. A pass that survived may be older than a failure that did not
  // (ADR-005), so an incomplete log cannot certify — for ANY caller.
  const latest = latestRecordedCheck(log, tree, carry)
  return latest?.event === 'check.passed' && logIncomplete(log) ? LOG_INCOMPLETE : latest
}

const LOG_INCOMPLETE = Object.freeze({ event: 'check.unproven', why: 'the log could not be read whole' })

function latestRecordedCheck(log, tree, carry) {
  return latestOf(checkEventsFor(log, tree, carry))
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

// 'passed' certifies. 'unresolved' is an order that could not be established:
// it must not be said as "no check has passed", and it must not clear the tree.
// 'unknown' is a log that was not read whole.



// ---- ADR-060's completion rules. They read the event log and git, never the
// transcript. R1 is work no check has passed on, R4 is an observation that
// could not be made (R2, a newly reachable commit, is retired: ADR-128 T1).
// Each speaks once per rule and evidence state, so a finding does not repeat
// while nothing has moved.
// Who a finding is for (ADR-096): on Stop and PreToolUse the agent, whose context those events reach; on every other event only
// the user. A finding a rule decides whether to say is checked against what that audience has already heard.
// Who a delivery reached: Stop (unless the project keeps turn-end findings user-only) and PreToolUse reach the agent's context and
// the user's screen together, so a finding said there is not said again to either; every other event reaches the user alone.
// A row counts for an audience when its delivery reached it. A row written before ADR-096 carries no channel and counts for every
// audience, so nothing said before the upgrade is said again; with no audience asked for, every row counts.

// ADR-122 T3: what was said in an earlier context of this session is not in this one. A session's generation is bumped by a
// compaction and a clear (session-notes.mjs), each `action.emitted` row carries the generation it was said in, and the guards
// read only this generation's rows; a row written before rows carried one counts as generation 0. A resume keeps the generation.


// P already said this tree is unchecked, before the command ran. Saying it again
// at the end of the same turn is the repetition ADR-060 closed (BACKLOG §217).
// Only a publish from this tree has said it: an advice about a mention, a commit
// into a repository the command creates, or one into another repository says "if
// it does publish, run qh-check first", which the agent reads as not met, and
// counting it kept a changed tree's turn end silent (Stage 5, 2026-10-18).

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
