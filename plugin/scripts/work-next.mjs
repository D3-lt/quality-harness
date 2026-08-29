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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { adrCorpus } from './lifecycle.mjs'

// The DAG, as edges. Each stage names what must be TRUE for it to be the next
// move, so the router explains itself instead of asserting.
const STAGES = [
  {
    id: 'adr-verify',
    entry: 'adr-verify <task file>',
    when: 'a task is marked done, or claims passing work, with no tool-written exit-0 entry',
    why: 'The corpus\'s whole claim is that `done` means a tool wrote the evidence. '
      + 'This is the stage no skill description claimed, and the one an eval caught firing nothing.',
  },
  {
    id: 'adr-execute',
    entry: '/adr-execute <adr>',
    when: 'an Accepted ADR has tasks that are ready and not yet done',
    why: 'The decision is made and the work is not. Execute it task by task.',
  },
  {
    id: 'adr-retire',
    entry: '/adr-retire',
    when: 'a record is Superseded or Withdrawn but still sits in the active corpus',
    why: 'A retired decision left active still governs, and adr-context will hand it '
      + 'to whoever edits those files next.',
  },
  {
    id: 'arch-write',
    entry: '/arch-write',
    when: 'every task of an Accepted ADR carries evidence and the architecture document '
      + 'is older than the record',
    why: 'The decision shipped and the map still shows the old shape.',
  },
  {
    id: 'adr-write',
    entry: '/adr-write',
    when: 'a spec is Ready-for-ADR and no record Covers its facts',
    why: 'Requirements are settled and nothing has decided how to meet them.',
  },
  {
    id: 'spec-write',
    entry: '/spec-write',
    when: 'there is no spec corpus at all, or the work is not yet decided',
    why: 'Nothing downstream can be verified against requirements nobody wrote.',
  },
]

const read = file => {
  try {
    return statSync(file).size > 512 * 1024 ? '' : readFileSync(file, 'utf8')
  } catch { return '' }
}

function taskFiles(directory) {
  const found = []
  const walk = (dir, depth) => {
    if (depth > 5 || found.length > 400) return
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const child = path.join(dir, entry.name)
      // An ARCHIVE is history, never a work order (CLAUDE.md §10). `adr-state`
      // and `adr-context` read archives deliberately — they answer "what was
      // decided, and what was killed" — but this reader answers "what should be
      // done next", and an archived task is by definition not that. Measured
      // 2026-08-29 on a consumer corpus where this listed 75 archived tasks as
      // executable next work, including a record archived precisely because
      // re-running its acceptance would stamp July's work with today's date
      // (docs/BACKLOG.md §62).
      if (entry.isDirectory() && /(^|[-_])archive(d|s)?$|^archive/i.test(entry.name)) continue
      if (entry.isDirectory()) walk(child, depth + 1)
      else if (entry.name.toLowerCase().endsWith('.md') && /[\\/]tasks[\\/]/.test(child)
        && !/readme\.md$/i.test(entry.name)) found.push(child)
    }
  }
  const docs = path.join(directory, 'docs')
  walk(existsSync(docs) ? docs : directory, 0)
  return found
}

/** Observations, each carrying the evidence that produced it. */
export function observe(directory) {
  const corpus = adrCorpus(directory)
  const tasks = taskFiles(directory)

  // A task that CLAIMS done without a tool-written exit-0 entry. The grammar is
  // adr-verify's, and anything off it was typed by a person.
  const unbacked = tasks.filter(file => {
    const text = read(file)
    // `**Status:** done` puts the colon INSIDE the bold markers, which is how
    // every template in this corpus writes it — a pattern expecting the colon
    // after them matched nothing at all.
    if (!/^\s*[-*]?\s*\*{0,2}(?:Status|State):?\*{0,2}:?\s*done\b/im.test(text)
      && !/\bmarked\s+done\b/i.test(text)) return false
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
    return !/^- \d{4}-\d{2}-\d{2} · .*· exit 0\b/m.test(text)
      && /^##\s+Acceptance/im.test(text)
  }
  const ready = tasks.filter(file => unfinished(file) && executable(file))
  // Named rather than dropped in silence: a corpus whose only unfinished work
  // sits under a record nobody has accepted would otherwise read as finished,
  // which is the same "I could not look" / "there is nothing" conflation the
  // gates are held to elsewhere (ADR-005).
  const notYetDecided = tasks.filter(file => unfinished(file) && !executable(file)
    && owner.has(path.resolve(file)))

  const retirable = corpus.filter(record => record.kind === 'graveyard'
    && !/[\\/]archive[\\/]/i.test(record.file))

  const specs = existsSync(path.join(directory, 'docs', 'specs'))
    ? readdirSync(path.join(directory, 'docs', 'specs')).filter(n => n.endsWith('.md'))
    : []

  // Does this corpus record evidence the way adr-verify writes it at all? On a
  // real 149-record corpus that uses its own conventions, 395 of 405 task files
  // carried no exit-0 entry — and calling all 395 "pending" is a confident wrong
  // answer about somebody else's format, not a finding about their work.
  const usesVerificationLog = tasks.some(file =>
    /^- \d{4}-\d{2}-\d{2} · .*· exit 0\b/m.test(read(file)))

  return {
    usesVerificationLog,
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
    specs: specs.length,
  }
}

export function nextStage(state) {
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
  if (state.accepted && !state.tasks) return STAGES.find(s => s.id === 'adr-write')
  if (!state.records && !state.specs) return STAGES.find(s => s.id === 'spec-write')
  return null
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
      records: state.records,
      accepted: state.accepted,
      undecidedRecords: state.undecided,
      tasks: state.tasks,
      unbackedDoneClaims: state.unbacked.map(relative),
      tasksWithoutEvidence: state.ready.map(relative),
      tasksUnderAnUndecidedRecord: state.notYetDecided.map(relative),
      retirableInActiveCorpus: state.retirable.map(record => relative(record.file)),
      specs: state.specs,
      next: stage ? { id: stage.id, entry: stage.entry, when: stage.when } : null,
      stages: STAGES.map(({ id, entry, when }) => ({ id, entry, when })),
    }, null, 2)}\n`)
    return 0
  }

  process.stdout.write(`${state.records} record(s), ${state.accepted} accepted, `
    + `${state.tasks} task file(s), ${state.specs} spec(s).`
    + (state.undecided
      ? ` ${state.undecided} further record(s) carry a status this reader does not act on.\n`
      : '\n'))
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
  if (!stage) {
    if (state.tasks && !state.usesVerificationLog) {
      process.stdout.write(`\n${state.tasks} task file(s) and not one exit-0 Verification Log entry: `
        + 'this corpus records evidence some other way, so the execution stages cannot see it. '
        + 'Everything below is still the flow; only the state reading is blind here.\n')
    } else {
      process.stdout.write('\nNothing in the corpus is waiting on a lifecycle stage. '
        + 'Anything you start now begins at /spec-write or /adr-write.\n')
    }
    for (const entry of STAGES) process.stdout.write(`  ${entry.entry.padEnd(24)} ${entry.when}\n`)
    return 0
  }
  process.stdout.write(`\nNext: ${stage.entry}\n  because ${stage.when}.\n  ${stage.why}\n`)
  const evidence = stage.id === 'adr-verify' ? state.unbacked
    : stage.id === 'adr-execute' ? state.ready
      : stage.id === 'adr-retire' ? state.retirable.map(record => record.file)
        : []
  for (const file of evidence.slice(0, 5)) process.stdout.write(`    ${relative(file)}\n`)
  if (evidence.length > 5) process.stdout.write(`    (+${evidence.length - 5} more)\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
