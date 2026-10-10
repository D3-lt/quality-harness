// What a run leaves behind: the verdict a finished child earns, the row that describes the run, the row a prose-only reuse
// stands in as, and the three writes (a reuse, a skip, a run) with the sentences said beside them. Moved out of qh-check.mjs
// (BACKLOG section 376). The first three are functions of what they are handed; the writes are the only part that touches
// the ledgers, and a ledger that cannot be written is said and never changes the check's exit (CLAUDE.md section 3).
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { stateDir } from './event-log.mjs'
import { inSeconds } from './check-child.mjs'
import { validationVerdict } from './completion-rules.mjs'

// A neighbour as the record keeps it: what its lease says, or that it could not be read.
const recorded = seen => (seen ? [...seen.live, ...seen.unknown].map(({ file: _file, ...entry }) => entry) : null)

// How a finished child ended, said once: the signal that stopped it (the one this process forwarded wins), its exit, and the
// verdict that earns. A check a signal ended did not finish, so it has no verdict: "failed" said it had one, five times over
// a run that was SIGKILLed (BACKLOG section 295 item 24, ADR-005).
export function classifyRun({ ended, received, kept, command }) {
  const signal = received ?? ended.signal ?? null
  const exit = ended.error ? null : ended.code
  const verdict = ended.error
    ? 'unstarted'
    : signal
      ? 'interrupted'
      : validationVerdict({ exit_code: exit ?? 1, stdout: kept.toString('utf8') }, command, { anyCommand: true })
  return { signal, exit, verdict }
}

// The row that describes a run. The id is handed in: a function of its arguments makes none.
export function runRecord({ id, git, command, origin, before, after, run, cores, contended, beside, besideAtEnd, waitedMs, prose }) {
  return { id, at: after.at, git, command, origin, before, after, exit: run.exit, signal: run.signal, verdict: run.verdict, cores, contended,
    beside: recorded(beside), besideAtEnd: recorded(besideAtEnd), waitedMs, ...(prose.specs.length ? { prose: prose.specs } : {}) }
}

// The row a prose-only reuse is: a pass for THIS tree whose times are the original's (it claims no more) and whose marker is
// `reusedFrom`, so the publish verdict reads it as it reads any pass (ADR-094).
export function proseReuseRow({ already, prose, git, command }, id, at) {
  const original = already.record
  return { id, at, git, command, origin: original.origin,
    before: { ...already.now, at: original.before.at }, after: { ...already.now, at: original.after.at },
    exit: 0, signal: null, verdict: original.verdict, cores: original.cores, contended: original.contended,
    beside: null, besideAtEnd: null, waitedMs: 0, prose: prose.specs, reusedFrom: original.reusedFrom ?? original.id }
}

// A prose reuse is a pass row for THIS tree (see below); the record it appends can veto the reuse, which is why this is a
// step of the run and not a part of the plan. Returns the pass that stands for this tree, or null when the check must run.
export function reuseByProse({ already, prose, git, command, root, stderr, beforeReuse }) {
  // A prose reuse is a pass row for THIS tree, so the publish verdict reads it as it reads any pass: its times are the
  // original's (it claims no more), its marker is `reusedFrom`, and one that cannot be written runs the check instead.
  if (already?.viaProse) {
    const row = proseReuseRow({ already, prose, git, command }, randomUUID(), new Date().toISOString())
    // The reuse row must land where the decision left the ledger: a record appended in between (a concurrent `--again`
    // that failed, say) would be followed by this pass and read as superseded (Codex reviews of ADR-094). The append is
    // atomic and a count read before it is not, so the position is checked AFTER: ours must be the next row. If it is
    // not, the check runs, and its own row follows ours and decides. `beforeReuse` is the seam a test uses to be that
    // concurrent writer.
    beforeReuse()
    const ledgerFile = path.join(stateDir(root), 'checks.jsonl')
    let appended = false
    try {
      mkdirSync(stateDir(root), { recursive: true })
      appendFileSync(ledgerFile, `${JSON.stringify(row)}\n`, 'utf8')
      appended = true
      const ids = readFileSync(ledgerFile, 'utf8').split('\n').filter(line => line.trim()).map(line => { try { return JSON.parse(line).id } catch { return null } })
      if (ids.indexOf(row.id) !== already.rows) throw Object.assign(new Error('the ledger gained a record between the decision and the append'), { code: 'ELEDGER' })
    } catch (failure) {
      // An append cannot be undone, and a reuse row left as the tree's latest would pass a tree nobody checked if the
      // run that follows is interrupted: it is retracted by a row that grades as unproven (a Codex review of ADR-094).
      if (appended) {
        try {
          appendFileSync(ledgerFile, `${JSON.stringify({ ...row, id: randomUUID(), at: new Date().toISOString(), exit: null, verdict: 'unproven', reusedFrom: undefined, retracts: row.id })}\n`, 'utf8')
        } catch (retraction) {
          stderr.write(`qh-check: the prose reuse could not be retracted either (${retraction.code ?? retraction.message}); \`qh-check --again\` writes the row that decides.\n`)
        }
      }
      stderr.write(`qh-check: the prose reuse could not be relied on (${failure.code ?? failure.message}), so the check runs.\n`)
      already = null
    }
    if (already) already.reuse = row
  }
  return already
}

// The owner, 2026-10-02: a skip left no trace, so how often it saves a run could not be counted (ADR-081's follow-up).
export function recordSkip({ already, command, prose, root, stderr }) {
  const took = already.ms === null ? '' : `, in ${inSeconds(already.ms)}`
  stderr.write(already.viaProse
    ? `qh-check: only prose changed (${prose.specs.join(', ')}), so the pass at ${already.at}${took} (\`${command}\`) stands for this tree — not run again; `
      + `recorded as a reuse of ${already.reuse.reusedFrom}. The tree without the prose covers no ignored file, environment or service; \`qh-check --again\` runs it.\n`
    : `qh-check: already passed on this tree at ${already.at}${took} (\`${command}\`) — not run again. `
      + 'A tree hash covers no ignored file, environment or service; `qh-check --again` runs it.\n')
  // The owner, 2026-10-02: a skip left no trace, so how often it saves a run could not be
  // counted (ADR-081's follow-up). It goes to `skips.jsonl`, where no reader of a pass looks —
  // a row in checks.jsonl would become the tree's latest record and undo the next skip. A
  // ledger that cannot be written is said; the skip and its exit stand (CLAUDE.md §3).
  try {
    mkdirSync(stateDir(root), { recursive: true })
    appendFileSync(path.join(stateDir(root), 'skips.jsonl'), `${JSON.stringify({ id: randomUUID(), at: new Date().toISOString(),
      command, tree: already.tree, passId: already.passOf ?? already.id, passedAt: already.at, savedMs: already.ms,
      ...(already.viaProse ? { viaProse: true } : {}) })}\n`, 'utf8')
  } catch (failure) {
    stderr.write(`qh-check: the skip could not be recorded (${failure.code ?? failure.message}).\n`)
  }
}

// Said on STDERR, once, after the record exists; the record is the check's and the sentence is for whoever ran it.
export function recordRun({ record, fast, root, startedAt, after, signal, verdict, command, origin, stderr }) {
  try {
    const directory = stateDir(root)
    mkdirSync(directory, { recursive: true })
    // A fast record goes where no reader of a full pass looks, in any version (ADR-081).
    const file = path.join(directory, fast ? 'fast-checks.jsonl' : 'checks.jsonl')
    appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
    // Said on STDERR, once, after the record exists: a check run by hand showed only
    // its own output, so nobody could tell what ran, whether it was declared or
    // inferred, or that a record was written (BACKLOG §280 item 1). Stdout stays
    // the check's own.
    const shown = path.relative(root, file)
    const took = inSeconds(Date.parse(after.at) - Date.parse(startedAt))
    const said = signal ? `interrupted by ${signal} before it finished, so there is no verdict` : `${verdict} in ${took}`
    stderr.write(`qh-check: ran \`${command}\` (${origin}) — ${said}; recorded in ${shown.startsWith('..') || path.isAbsolute(shown) ? file : shown}\n`)
  } catch (failure) {
    stderr.write(`qh-check: the check ran, but its record could not be written (${failure.code ?? failure.message}).\n`)
  }
}
