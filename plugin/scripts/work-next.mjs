#!/usr/bin/env node
// Where this repository is in the lifecycle, and what comes next.
//
// The lifecycle is a DAG and always has been — spec → decision → execution →
// architecture, with retirement and postmortem hanging off it — but it lived
// only as prose spread across twelve skills, so the routing existed in whatever
// the model happened to recall. Measured 2026-08-26 with `claude plugin eval`:
// "mark T3 done in docs/adr/tasks/README.md" fired NO skill at all, because
// recording evidence for finished work is neither "implement an accepted
// decision" nor "a substantive development goal". A stage nobody's description
// claims is a stage nobody routes to.
//
// So the edges are static and written down here, and the STATE is derived from
// the corpus — never maintained beside it, for the same reason adr-state is
// derived: a summary kept next to the truth drifts from it.
//
// Reads only. Suggests only. Exit 0 whatever it finds; a router that refused
// would be the thing this harness spent a week removing.
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from './main-module.mjs'
import { adrCorpus, listedUnderUninterestingDirectory, spawnGate, trackedPaths } from './lifecycle.mjs'

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin')

/**
 * Which tasks are ready, as adr-next answers it — one readiness rule, not two.
 *
 * This file had its own: any exit-0 row meant finished, and nothing read
 * `Depends-on`, `Blocked-on` or the row's digest. adr-next had all three, so
 * the two readers disagreed on the first real corpus a probe was run over
 * (2026-09-23: T4 and T5 offered while their `Depends-on: T3` was pending; a
 * stale-digest task called finished here and ready-unproven there; frozen archive
 * tasks offered by one and not the other). SessionStart already asks adr-next
 * per task directory; so does this now, for the task directories of governing,
 * unfrozen records only — a frozen archive is history, never ready work.
 *
 * A directory adr-next could not answer for is UNPROVEN, named in the state, and
 * never read as "nothing ready" (ADR-005). `spawn` is the seam.
 */
export function readinessFrom(corpus, directory, spawn = spawnGate, allowed = null) {
  // Resolved once. `directory` may be the relative argument `work-next tests/x`
  // was given, and adr-next was handed that relative task directory while ALSO
  // running with the repository as cwd — so it looked for `tests/x/adr/…/tasks`
  // inside `tests/x` and found nothing (Codex review of bdeba73, P2). Every path
  // adr-next is given or hands back is anchored here.
  const root = path.resolve(directory)
  const dirs = new Set()
  for (const record of corpus) {
    if (record.kind !== 'governing' || record.frozen) continue
    // Only task files this reader lists (`taskFiles`: a `.md` directly under
    // `tasks/`, no archive, no fixture path), so the two views of "which tasks
    // exist" cannot drift apart — a record's `taskFiles` includes its archived
    // and nested files, and asking adr-next about those offered history as work.
    for (const file of record.taskFiles ?? []) {
      if (allowed && !allowed.has(path.resolve(file))) continue
      dirs.add(path.dirname(path.resolve(file)))
    }
  }
  const ready = []
  const unproven = []
  // adr-next's own `done` verdict, and every task it LISTED in any bucket, so the
  // "claims done without evidence" check below uses ONE rule of done (§279 item 8)
  // and never reads a task adr-next did not read as a task it judged not done.
  const done = new Set()
  const listed = new Set()
  for (const dir of [...dirs].sort()) {
    const run = spawn(path.join(BIN, 'adr-next'), [dir, '--json'], { cwd: root, encoding: 'utf8', timeout: 60_000 })
    // adr-next answers 0 (a ready task) or 3 (nothing ready) — BOTH with JSON. Reading
    // only 0 as an answer put every finished directory in `unproven` (Codex review of
    // bdeba73, P2); anything else is the gate not running, and that IS unproven.
    const answered = !run.error && (run.status === 0 || run.status === 3)
    let answer = null
    if (answered) { try { answer = JSON.parse(run.stdout) } catch { answer = null } }
    if (!answer || !Array.isArray(answer.ready)) { unproven.push(dir); continue }
    for (const bucket of ['ready', 'done', 'blocked', 'stopped']) {
      for (const task of answer[bucket] ?? []) listed.add(path.resolve(root, task.path))
    }
    for (const task of answer.done ?? []) done.add(path.resolve(root, task.path))
    for (const task of answer.ready) {
      const file = path.resolve(root, task.path)
      // adr-next reads every `*.md` on disk; this reader lists tracked files. An
      // untracked sibling adr-next offered is not one this reader can vouch for.
      if (allowed && !allowed.has(file)) continue
      ready.push(file)
    }
  }
  return { ready, unproven, done, listed }
}

// The DAG, as edges. Each stage names what must be TRUE for it to be the next
// move, so the router explains itself instead of asserting.
export const STAGES = [
  {
    id: 'adr-verify',
    entry: 'adr-verify <task file>',
    when: 'a task is marked done, or claims passing work, with no tool-written exit-0 entry',
    why: 'The corpus\'s whole claim is that `done` means a tool wrote the evidence. '
      + 'This is the stage no skill description claimed, and the one an eval caught firing nothing.',
  },
  {
    id: 'adr-execute',
    entry: '/quality-harness:adr-execute <adr>',
    when: 'an Accepted ADR has tasks that are ready and not yet done',
    why: 'The decision is made and the work is not. Execute it task by task.',
  },
  {
    id: 'adr-retire',
    entry: '/quality-harness:adr-retire',
    when: 'a record is Superseded or Withdrawn but still sits in the active corpus',
    why: 'A retired decision left active still governs, and adr-context will hand it '
      + 'to whoever edits those files next.',
  },
  {
    id: 'arch-write',
    entry: '/quality-harness:arch-write',
    when: 'a structural decision lands and the repository has no architecture document — '
      + 'judged by the work skill\'s class D; this reader cannot tell a structural record from '
      + 'any other, so it never selects this stage itself',
    why: 'A structural decision with no map to change is a map nobody will write later.',
  },
  {
    id: 'adr-write',
    entry: '/quality-harness:adr-write',
    when: 'a spec is Ready-for-ADR and no record Covers its facts',
    why: 'Requirements are settled and nothing has decided how to meet them.',
  },
  {
    id: 'adr-write-no-tasks',
    entry: '/quality-harness:adr-write',
    when: 'accepted records have no task files',
    why: 'The records are classified and there is no task inventory to execute.',
  },
  {
    id: 'core',
    entry: 'verify or execute the current work',
    when: 'no QH corpus is in use',
    why: 'Claim verification does not require a decision corpus.',
  },
  {
    id: 'spec-write',
    entry: '/quality-harness:spec-write',
    when: 'the work is not yet decided',
    why: 'Nothing downstream can be verified against requirements nobody wrote.',
  },
]

const read = file => {
  try {
    return statSync(file).size > 512 * 1024 ? '' : readFileSync(file, 'utf8')
  } catch { return '' }
}

function posixRel(rel) {
  return String(rel).replaceAll('\\', '/')
}

function isArchivePath(rel) {
  return posixRel(rel).split('/').some(part =>
    /(^|[-_])archive(d|s)?$|^archive/i.test(part))
}

function taskFiles(directory, listing) {
  if (listing == null) return null
  const found = []
  for (const rel of listing) {
    const norm = posixRel(rel)
    // A `.md` DIRECTLY under `tasks/`, the same rule as SessionStart's
    // taskDirectories: Ansible's `roles/*/tasks/files/notes.md` counted as a task
    // file here while the orientation reader had already learned to skip it
    // (2026-09-19), so the two disagreed on the task count (BACKLOG §265).
    if (!/(?:^|\/)tasks\/[^/]+$/.test(norm)) continue
    if (!/\.md$/i.test(norm)) continue
    if (/readme\.md$/i.test(norm)) continue
    if (isArchivePath(norm)) continue
    // The same exclusion `adrCorpus` applies, or the count of task files and the
    // `unbacked` list would still carry fixtures whose records were dropped.
    if (listedUnderUninterestingDirectory(norm.split('/').slice(0, -1))) continue
    found.push(path.join(directory, rel))
  }
  return found
}

function specFiles(directory, listing) {
  if (listing == null) return null
  return listing.filter(rel => /(?:^|\/)docs\/specs\/[^/]+\.md$/i.test(posixRel(rel)))
    .map(rel => path.join(directory, rel))
}

function specStatus(text) {
  if (!text) return null
  const block = text.match(/\*\*Status:\*\*\s*([^\n*]+)/)
  return block ? block[1].trim().replace(/\s*·.*$/, '').trim() : null
}

function specBoundIds(text) {
  const ids = new Set()
  for (const line of text.split('\n')) {
    const fact = line.match(/^\|\s*(F-\d+)\s*\|/)
    if (fact) ids.add(fact[1])
    const scen = line.match(/^### (UC\d+-S\d+)\b/)
    if (scen) ids.add(scen[1])
  }
  return ids
}

function coveredIds(corpus) {
  const ids = new Set()
  const files = []
  for (const record of corpus) {
    files.push(record.file)
    for (const file of record.taskFiles ?? []) files.push(file)
  }
  for (const entry of corpus.unreadable ?? []) {
    files.push(entry.file)
    for (const file of entry.taskFiles ?? []) files.push(file)
  }
  for (const file of files) {
    const text = read(file)
    const line = text.match(/\*\*Covers:\*\*\s*([^\n]+)/)
    if (!line || /\bnone\b/i.test(line[1])) continue
    for (const id of line[1].match(/\b(?:F-\d+|UC\d+-S\d+)\b/g) ?? []) ids.add(id)
  }
  return ids
}

/** Observations, each carrying the evidence that produced it. */
export function observe(directory, { spawn = spawnGate } = {}) {
  const listing = trackedPaths(directory)
  const corpus = adrCorpus(directory, { tracked: listing })
  const look = listing == null ? 'UNPROVEN' : (corpus.look ?? 'ok')
  const tasks = taskFiles(directory, listing) ?? []
  const specPaths = specFiles(directory, listing) ?? []

  const readiness = readinessFrom(corpus, directory, spawn, new Set(tasks.map(file => path.resolve(file))))

  // A task that CLAIMS done — in its own `**Status:**`, or in its directory's
  // tasks/README.md row — that adr-next does not call done. This read the task
  // file only and accepted ANY exit-0 row, so a README-marked task whose only
  // evidence was a legacy row for a multi-line fence, and a task whose row named
  // another fence, both passed; work-next then routed to new work while adr-lint
  // refused both (BACKLOG §279 item 8, a Windows corpus). Where adr-next could not
  // answer for the directory, the tool-written-row test is the fallback, and that
  // directory is already reported as readinessUnproven.
  // A README's done ids, read by adr-lint's own rule (done_task_ids): the LEFTMOST
  // cell naming a task is the row's id — a bare `T4`, a `[T4](…)` link, or the
  // second column after an order number — and the row claims done when any LATER
  // cell is exactly `done`. Leftmost matters: a Depends-on cell names other tasks.
  // A narrower reader here repeated shapes adr-lint had already been corrected for
  // (Codex review of 2.108.0).
  const readmeDone = new Map()
  const claimedInReadme = file => {
    const dir = path.dirname(path.resolve(file))
    if (!readmeDone.has(dir)) {
      const ids = new Set()
      for (const raw of read(path.join(dir, 'README.md')).split('\n')) {
        const line = raw.trim()
        if (!line.startsWith('|')) continue
        const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
        const index = cells.findIndex(cell => /^\[?T\d+\b/i.test(cell))
        if (index < 0) continue
        if (cells.slice(index + 1).some(cell => cell.toLowerCase() === 'done')) ids.add(cells[index].match(/T\d+/i)[0].toUpperCase())
      }
      readmeDone.set(dir, ids)
    }
    const id = path.basename(file).match(/^(T\d+)(?!\d)/i)?.[1]?.toUpperCase()
    return id != null && readmeDone.get(dir).has(id)
  }
  const unbacked = tasks.filter(file => {
    const text = read(file)
    // `**Status:** done` puts the colon INSIDE the bold markers, which is how
    // every template in this corpus writes it — a pattern expecting the colon
    // after them matched nothing at all.
    const claimed = /^\s*[-*]?\s*\*{0,2}(?:Status|State):?\*{0,2}:?\s*done\b/im.test(text)
      || /\bmarked\s+done\b/i.test(text) || claimedInReadme(file)
    if (!claimed) return false
    if (readiness.listed.has(path.resolve(file))) return !readiness.done.has(path.resolve(file))
    return !/^- \d{4}-\d{2}-\d{2} · .*· exit 0\b/m.test(text)
  })

  // Attributed by the corpus reader, not by walking the filesystem. A task file
  // is READY only when the record that owns it is Accepted: `Proposed`, `Draft`
  // and archived records are plans and history, never work orders (CLAUDE.md
  // §10). Without this join the router named the tasks of an unaccepted record
  // and said "an Accepted ADR has tasks that are ready" while doing it — correct
  // about the files, wrong about the record, and asserting a status nothing had
  // checked (docs/BACKLOG.md §48).
  const owner = new Map()
  for (const record of corpus) {
    for (const file of record.taskFiles ?? []) owner.set(path.resolve(file), record)
  }
  // A record whose status this reader does not recognise — `Proposed`, `Draft`,
  // anything a corpus spells its own way — is not in `corpus` at all; it is on
  // the non-enumerable `unreadable` list. Its tasks are still attributed, and
  // they are exactly the ones that must be named rather than silently dropped.
  for (const entry of corpus.unreadable ?? []) {
    for (const file of entry.taskFiles ?? []) {
      if (!owner.has(path.resolve(file))) owner.set(path.resolve(file), { kind: null, ...entry })
    }
  }
  const executable = file => owner.get(path.resolve(file))?.kind === 'governing'
  const unfinished = file => {
    const text = read(file)
    // Waiting on something outside this repository is not ready, whatever the log
    // says: adr-next has read `**Blocked-on:**` since v2.83.0 (f8a0698), and this
    // reader went on offering the same task as the next thing to do — the two
    // disagreed on the one fixture that carried the header (BACKLOG §265).
    if (/^\*\*Blocked-on:\*\*\s*\S/im.test(text)) return false
    if (!/^##\s+Acceptance/im.test(text)) return false
    // Tool-run evidence: a fence that exited 0.
    if (/^- \d{4}-\d{2}-\d{2} · .*· exit 0\b/m.test(text)) return false
    // A HUMAN-OBSERVED acceptance has no fence to exit 0, so testing only for that
    // row made every such task permanently ready — adr-lint, adr-debt and the task
    // index would all call it done while this router went on naming it as the next
    // thing to do. Found 2026-08-30 by finishing ADR-012 T4, whose acceptance is
    // human-observed by design: the observation is a person watching another
    // program on their own machine.
    //
    // The sign-off is the evidence, and it is the SAME rule adr-lint applies —
    // such a task needs a `human-observed` Verification Log entry and nothing else
    // satisfies it. This is not a way to hand-declare done: an ordinary fenced task
    // is unaffected, because the acceptance must say so in the words the writer
    // uses (`adr-verify --human` exists for exactly these).
    if (/^\s*Acceptance is human-observed:/im.test(text)
      && /^- \d{4}-\d{2}-\d{2} · human-observed · \S/m.test(text)) return false
    return true
  }
  // Two filters for two questions. `readinessFrom` asks adr-next only about the
  // task directories of governing, unfrozen records; adr-next then reads EVERY
  // task in such a directory, and a directory two records share — one Accepted,
  // one Proposed — hands the Proposed record's task back too. `executable` maps
  // each task to its OWN record. Removed once as redundant (bdeba73, a GREEN
  // mutant on shard 4/48, because no fixture shared a directory); restored on a
  // shared-directory probe (Codex review of 1032720, P2), with that fixture.
  const ready = readiness.ready.filter(file => executable(file))
  // Named rather than dropped in silence: a corpus whose only unfinished work
  // sits under a record nobody has accepted would otherwise read as finished,
  // which is the same "I could not look" / "there is nothing" conflation the
  // gates are held to elsewhere (ADR-005).
  const notYetDecided = tasks.filter(file => unfinished(file) && !executable(file)
    && owner.has(path.resolve(file)))

  // The corpus reader knows which records sit under a frozen archive, because it
  // read the catalog that says so. Two path tests preceded this: `/archive/`
  // missed this repository's `adr-archive`, so all seven retired records were
  // offered for retirement again; `isArchivePath` then matched an ACTIVE
  // `docs/adr/archive-policy.md` and anything under `archive-service/`, hiding
  // real candidates (BACKLOG §263; Codex review of 870a230, P2).
  const retirable = corpus.filter(record => record.kind === 'graveyard' && !record.frozen)

  const covered = coveredIds(corpus)
  const unprovenSpecs = []
  const uncoveredReady = []
  for (const file of specPaths) {
    const text = read(file)
    if (!text) {
      unprovenSpecs.push(file)
      continue
    }
    const status = specStatus(text)
    if (!status) {
      unprovenSpecs.push(file)
      continue
    }
    if (!/^Ready-for-ADR\b/i.test(status)) continue
    const ids = [...specBoundIds(text)]
    if (ids.length === 0 || ids.some(id => !covered.has(id))) uncoveredReady.push(file)
  }

  // Does this corpus record evidence the way adr-verify writes it at all? On a
  // real 149-record corpus that uses its own conventions, 395 of 405 task files
  // carried no exit-0 entry — and calling all 395 "pending" is a confident wrong
  // answer about somebody else's format, not a finding about their work.
  const usesVerificationLog = tasks.some(file =>
    /^- \d{4}-\d{2}-\d{2} · .*· exit 0\b/m.test(read(file)))

  return {
    look,
    usesVerificationLog,
    // Task directories adr-next could not answer for; their tasks are neither
    // ready nor finished here, and a router that read them as "nothing ready"
    // would be the ADR-005 conflation.
    readinessUnproven: readiness.unproven,
    records: corpus.length,
    accepted: corpus.filter(record => record.kind === 'governing').length,
    // `records` counts what this reader could CLASSIFY, and until §48 that was
    // the only number printed — so a tree of eleven records reported "10
    // record(s), 10 accepted", right by exclusion and indistinguishable from
    // right by checking. A count that omits what it could not read reads as
    // coverage; the reader is told the remainder rather than left to subtract.
    undecided: (corpus.unreadable ?? []).length,
    tasks: tasks.length,
    unbacked,
    ready,
    notYetDecided,
    retirable,
    specs: specPaths.length,
    uncoveredReadySpecs: uncoveredReady,
    unprovenSpecs,
    specStatusUnproven: unprovenSpecs.length > 0,
  }
}

export function nextStage(state) {
  if (state.look === 'UNPROVEN' || state.look === 'PARTIAL') return null
  // Both of these read the Verification Log grammar. A corpus that never writes
  // it is not behind on evidence; it keeps its records somewhere this tool
  // cannot see, and saying so is the honest answer.
  if (state.usesVerificationLog && state.unbacked.length) {
    return STAGES.find(s => s.id === 'adr-verify')
  }
  if (state.usesVerificationLog && state.ready.length) {
    return STAGES.find(s => s.id === 'adr-execute')
  }
  if (state.retirable.length) return STAGES.find(s => s.id === 'adr-retire')
  if (state.uncoveredReadySpecs?.length) return STAGES.find(s => s.id === 'adr-write')
  if (state.accepted && !state.tasks) return STAGES.find(s => s.id === 'adr-write-no-tasks')
  if (!state.records && !state.specs && !state.tasks) return STAGES.find(s => s.id === 'core')
  return null
}

export function productLayer(look, nextId) {
  if (look === 'UNPROVEN' || look === 'PARTIAL') return undefined
  if (nextId == null) return 'corpus'
  return nextId === 'core' ? 'core' : 'corpus'
}

/**
 * The CLI half, returning an exit code instead of taking the process with it.
 *
 * This used to run at module top level, `process.exit` and all. Importing the
 * module therefore parsed the IMPORTER's argv — a `--test-name-pattern` read as
 * an unknown option and exited 2 — and, on the branch where nothing is waiting,
 * exited 0 outright. Measured 2026-08-27: `tests/lifecycle.test.mjs` imports
 * this module, and the moment this repository's own corpus became healthy the
 * suite dropped from 82 tests to 80 and still reported `fail 0`, because the
 * process was gone before the runner could say otherwise. The healthier the
 * corpus, the fewer tests ran. Three sibling scripts already had this guard.
 */
export function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json')
  const unknown = argv.filter(a => a.startsWith('--') && a !== '--json')
  if (unknown.length) {
    process.stderr.write(`unknown option: ${unknown[0]}\nusage: work-next.mjs [--json] [<root>]\n`)
    return 2
  }
  const root = argv.find(a => !a.startsWith('--')) ?? process.cwd()
  const state = observe(root)
  const stage = nextStage(state)
  const relative = file => path.relative(root, file) || file

  if (json) {
    process.stdout.write(`${JSON.stringify({
      look: state.look,
      records: state.records,
      accepted: state.accepted,
      undecidedRecords: state.undecided,
      tasks: state.tasks,
      unbackedDoneClaims: state.unbacked.map(relative),
      tasksWithoutEvidence: state.ready.map(relative),
      tasksUnderAnUndecidedRecord: state.notYetDecided.map(relative),
      retirableInActiveCorpus: state.retirable.map(record => relative(record.file)),
      readinessUnproven: state.readinessUnproven.map(relative),
      specs: state.specs,
      uncoveredReadySpecs: (state.uncoveredReadySpecs ?? []).map(relative),
      unprovenSpecs: (state.unprovenSpecs ?? []).map(relative),
      next: stage ? { id: stage.id, entry: stage.entry, when: stage.when } : null,
      layer: productLayer(state.look, stage?.id),
      stages: STAGES.map(({ id, entry, when }) => ({ id, entry, when })),
    }, null, 2)}\n`)
    return 0
  }

  if (state.look === 'UNPROVEN') {
    process.stdout.write('could-not-look: git could not list the tree (UNPROVEN). '
      + 'This is not an empty corpus and not a reason to begin at spec-write.\n')
    return 0
  }
  if (state.look === 'PARTIAL') {
    process.stdout.write('could-not-look: a listed record could not be read (PARTIAL). '
      + 'This is not an empty corpus and not a reason to begin at spec-write.\n')
    return 0
  }

  process.stdout.write(`${state.records} record(s), ${state.accepted} accepted, `
    + `${state.tasks} task file(s), ${state.specs} spec(s).`
    + (state.undecided
      ? ` ${state.undecided} further record(s) carry a status this reader does not act on.\n`
      : '\n'))
  if (state.unprovenSpecs?.length) {
    process.stdout.write(`\n${state.unprovenSpecs.length} spec file(s) have an UNPROVEN Status `
      + '(unreadable or missing). They are not counted as "not Ready-for-ADR".\n')
  }
  // Said whatever the next stage is, and BEFORE it: work that exists and is not
  // executable is the answer to "why is nothing waiting?", and a reader who does
  // not get it concludes the corpus is finished (docs/BACKLOG.md §48).
  // Task files and NO records is a discovery failure, and it is provable without
  // knowing why: two walkers read the same corpus by different rules — tasks by
  // path, records by filename or content — so tasks > 0 with records = 0 means
  // the record walker missed what the task walker found. Printed BEFORE the
  // stage, and regardless of it: the corpus that reported this was routed to
  // `/spec-write` for work already decided, so a message that only fires when no
  // stage is chosen would have stayed silent on the very case it is for
  // (docs/BACKLOG.md §55). `unreadable` cannot cover this either — a file must
  // be opened before it can be classed unopenable.
  if (state.tasks && !state.records) {
    process.stdout.write(`\n${state.tasks} task file(s) and NOT ONE record: this reader found no `
      + 'decision records at all, which over a corpus that plainly has task files is a discovery '
      + 'failure rather than an empty corpus. Records are found by filename (`0043-thing.md`, '
      + '`ADR-12-thing.md`) or, inside an `adr` directory, by carrying both a Status line and a '
      + 'Context or Decision section. Read anything below as a reading of what this tool could '
      + 'find, which here is nothing.\n')
  }
  if (state.notYetDecided.length) {
    process.stdout.write(`\n${state.notYetDecided.length} unfinished task file(s) belong to a record `
      + 'this reader cannot execute — Proposed, Draft, or a status it does not recognise. They are '
      + 'not counted as ready, because a record is a work order only once it is Accepted:\n')
    for (const file of state.notYetDecided.slice(0, 5)) {
      process.stdout.write(`  ${relative(file)}\n`)
    }
    if (state.notYetDecided.length > 5) {
      process.stdout.write(`  (+${state.notYetDecided.length - 5} more; --json for all)\n`)
    }
  }
  if (state.readinessUnproven.length) {
    // Rendered, not only serialised: the JSON carried this while the text printed
    // an all-clear over the same directories (Codex review of bdeba73, P2).
    process.stdout.write(`\n${state.readinessUnproven.length} task director${state.readinessUnproven.length === 1 ? 'y' : 'ies'} `
      + 'could not be read by adr-next, so readiness there is UNPROVEN — not "nothing ready" (ADR-005):\n')
    for (const dir of state.readinessUnproven.slice(0, 5)) process.stdout.write(`  ${relative(dir)}\n`)
    if (state.readinessUnproven.length > 5) process.stdout.write(`  (+${state.readinessUnproven.length - 5} more; --json for all)\n`)
  }
  if (!stage) {
    if (state.tasks && !state.usesVerificationLog) {
      process.stdout.write(`\n${state.tasks} task file(s) and not one exit-0 Verification Log entry: `
        + 'this corpus records evidence some other way, so the execution stages cannot see it. '
        + 'Everything below is still the flow; only the state reading is blind here.\n')
    } else {
      process.stdout.write(state.readinessUnproven.length
        ? '\nNothing this reader could see is waiting; the directories above were not read, so this is not an all-clear.\n'
        : '\nNothing in the QH corpus is waiting.\n')
    }
    for (const entry of STAGES) process.stdout.write(`  ${entry.entry.padEnd(36)} ${entry.when}\n`)
    return 0
  }
  if (stage.id === 'core') {
    process.stdout.write('\nNo QH corpus is in use.\n')
  }
  process.stdout.write(`\nNext: ${stage.entry}\n  because ${stage.when}.\n  ${stage.why}\n`)
  const evidence = stage.id === 'adr-verify' ? state.unbacked
    : stage.id === 'adr-execute' ? state.ready
      : stage.id === 'adr-retire' ? state.retirable.map(record => record.file)
        : stage.id === 'adr-write' ? state.uncoveredReadySpecs
          : []
  for (const file of evidence.slice(0, 5)) process.stdout.write(`    ${relative(file)}\n`)
  if (evidence.length > 5) process.stdout.write(`    (+${evidence.length - 5} more)\n`)
  return 0
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main()
}
