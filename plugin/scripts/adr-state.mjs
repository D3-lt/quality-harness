#!/usr/bin/env node
// adr-state — what this corpus has decided, as it stands now.
//
// A decision corpus records CHANGES: each record is a delta, and after thirty of
// them "what governs this area right now" means reading thirty records and
// applying the supersessions in your head. OpenSpec solves that by keeping an
// accumulated `specs/` beside its `changes/`; this derives the same view instead
// of asking anyone to maintain it, because a summary kept beside the truth is a
// summary that drifts from it.
//
// It reads. It never writes, never judges the quality of a record, and exits 0
// whatever it finds — `adr-lint` and `adr-judge` are where verdicts live. What
// is NOT here on purpose: anything about lessons learned. That is a different
// kind of memory with a different lifetime, and it lives outside this harness.
import path from 'node:path'
import { adrCorpus, quotedCorpusText, recordStatusKind, terminalText, trackedPaths } from './lifecycle.mjs'

import { isMainModule } from './main-module.mjs'

// The CLI is behind an import guard (BACKLOG §27). It used to run at module
// scope, so importing this file read the whole corpus and printed a report as a
// side effect of the import.
export function main(argv) {
  const json = argv.includes('--json')
  const unknown = argv.filter(a => a.startsWith('--') && a !== '--json')
  if (unknown.length) {
  process.stderr.write(`unknown option: ${unknown[0]}\nusage: adr-state.mjs [--json] [<root>]\n`)
  return 2
  }
  const root = argv.find(a => !a.startsWith('--')) ?? process.cwd()
  const listing = trackedPaths(root)
  const corpus = adrCorpus(root, { tracked: listing })
  if (listing == null) {
    if (json) process.stdout.write(`${JSON.stringify({ look: 'UNPROVEN', read: null })}\n`)
    else process.stdout.write('could-not-look: git could not list the tree (UNPROVEN).\n')
    return 0
  }
  // POSIX separators, as every other reader's JSON (BACKLOG §350 C9).
  const relative = record => (path.relative(root, record.file) || record.file).replaceAll('\\', '/')
  // A record with neither number nor dated stem (ADR-063) is named by its file, never `ADR-00?`.
  const label = record => record.id
    ?? (record.number != null ? `ADR-${String(record.number).padStart(3, '0')}` : path.basename(record.file, '.md'))

  const governing = corpus.filter(record => record.kind === 'governing')
  // Keyed by id (ADR-063), so a supersession by a dated record's stem resolves.
  const byId = new Map(corpus.filter(record => record.id !== null && record.id !== undefined)
  .map(record => [record.id, record]))
  // One id, several records: nothing said so, and each could be read as the other
  // (a Windows chaos round of 916b515, C1 and C6 — the same id in one root, or three).
  // An undecided record claims its id too: `# ADR 006` with a Status no reader acts on, beside an
  // Accepted ADR-006, was named nowhere (an outside probe run, 2026-10-07).
  const byIdAll = new Map()
  const undecidedRecords = (corpus.unreadable ?? []).filter(entry => !entry.reason && !entry.alias)
  for (const record of [...corpus, ...undecidedRecords]) {
    if (record.id === null || record.id === undefined) continue
    if (!byIdAll.has(record.id)) byIdAll.set(record.id, [])
    byIdAll.get(record.id).push(record)
  }
  const duplicateIds = [...byIdAll].filter(([, records]) => records.length > 1)

  // One entry per governed path, naming the accepted record that holds it and
  // whatever it replaced. A path claimed by two accepted records is contested:
  // the corpus says two things about the same code and cannot say which wins.
  const areas = new Map()
  for (const record of governing) {
  for (const declared of record.declares) {
    if (!areas.has(declared)) areas.set(declared, [])
    areas.get(declared).push(record)
  }
  }
  // What the corpus has TOUCHED, counted rather than listed. On a real corpus this
  // is a thousand paths, and printing them buries the answer; `adr-context <path>`
  // is where the per-file question belongs.
  const touched = new Set(governing.flatMap(record => record.governs))

  // What each accepted record replaced, followed back through the chain.
  const replaced = new Map()
  for (const record of corpus) {
  if (!record.supersededBy) continue
  const target = byId.get(record.supersededBy)
  if (!target) continue
  if (!replaced.has(target.file)) replaced.set(target.file, [])
  replaced.get(target.file).push(record)
  }

  const contested = [...areas].filter(([, records]) => records.length > 1)
  // A record whose task files could not all be opened has a scope nobody read, which
  // is not an empty one (a Windows chaos round of 916b515, C-5).
  const orphans = governing.filter(record => record.governs.length === 0 && !record.unreadTasks?.length)
  // Any unread task, not only under a record that governs nothing: one more unread task file under
  // a record that governs three paths left its fourth path unknown, and nothing named it (§350 C5).
  const unknownScope = governing.filter(record => record.unreadTasks?.length)
  const SHOWN = 12
  // A superseder that is there and could not be read is not "not in this corpus" (BACKLOG §350
  // C8): matched to an unread file by its stem, or by the number its name starts with.
  const numberOf = text => /^(?:adr[-_]?)?0*(\d{1,4})\b/i.exec(String(text))?.[1]
  // In the superseded record's own directory only: a number matched across corpora let another
  // corpus's unreadable file hide a supersession that is dangling (a stand-in review of f8d1eaf).
  const unreadSuperseder = record => (corpus.unreadable ?? []).find(entry => {
    if (path.dirname(entry.file) !== path.dirname(record.file)) return false
    const stem = path.basename(entry.file).replace(/\.md$/i, '')
    return stem === record.supersededBy || (numberOf(stem) !== undefined && numberOf(stem) === numberOf(record.supersededBy))
  })
  const superseded = corpus.filter(record => record.supersededBy && !byId.has(record.supersededBy))
  const supersededByUnread = superseded.filter(record => unreadSuperseder(record))
  const dangling = superseded.filter(record => !unreadSuperseder(record))
  // Declared paths that match nothing git tracks, in the text AND the JSON: the text said
  // `--json for all` and the JSON had no such field (go-cli-adr-corpus's corpus-chaos
  // run, BACKLOG §319).
  const rotted = [...new Set(corpus.flatMap(record => record.unresolved))]
    .filter(entry => entry.startsWith('governs:'))

  const unreadable = corpus.unreadable ?? []
  // Proposed and Draft govern nothing yet BY DESIGN; the text and the JSON split on this one test.
  const isPending = entry => recordStatusKind(entry.status) === 'pending'
  // Why an entry governs nothing, for the JSON: it gave a file and a status and no why for a
  // record the corpus reader had opened, where the text said why (a corpus-chaos run's X1,
  // BACKLOG §293 and §319). Each arm says only what this reader observed (ADR-005):
  // - a file the corpus reader never read: its own `reason`, verbatim;
  // - a standing the corpus reader could not establish: its words for what it could not tell.
  //   Not "frozen", and not "its catalog": beside an unreadable README, or one of another
  //   spelling, whether the directory is an archive at all is unknown (a review of this fix);
  // - a status: the kind lifecycle's recordStatusKind gives it, as recordStatus reads it.
  //   ADR-074 gives every reader that one reading (tests/status-reading.test.mjs), so what
  //   this says is what adr-lint and adr-next say too. An empty Status line reads as none,
  //   so "value" covers both.
  // The text still lists an UNPROVEN record among the statuses it does not know, with a
  // spelling remedy that cannot apply to it; the JSON does not copy that.
  const why = entry => entry.reason
    || (entry.unproven ? `whether it governs could not be established, so it is not counted as governing (UNPROVEN): ${entry.unproven}`
      : !entry.status ? 'it has no **Status:** value this reader can read, so it governs nothing'
        : isPending(entry) ? 'it is Proposed or Draft, so it governs nothing yet, which is correct'
          : 'its status does not start with a word this reader knows (Accepted, Active, Proposed, Draft, Rejected, Superseded, Withdrawn or Deprecated), so it governs nothing')
  if (json) {
    const look = corpus.look ?? ((corpus.unreadable ?? []).length ? 'PARTIAL' : 'ok')
  process.stdout.write(`${JSON.stringify({
    look,
    read: corpus.length,
    governing: governing.length,
    touchedPaths: touched.size,
    // Named, as the human output names them: a record with a status this reader does
    // not act on, or that it could not open, made `read` 0 with `look` ok and said
    // nothing else (a Windows chaos round of 626934a, F-1: `**Status：**`). `reason` is
    // the corpus reader's own, set only for a file it never read, so null still marks
    // one it opened (lifecycle.mjs adrCorpus); `why` says why each one governs nothing.
    unread: unreadable.map(entry => ({ file: relative(entry), status: entry.status ?? null, reason: entry.reason ?? null, why: why(entry) })),
    // Files the corpus reader dropped because adr-lint does not recognise them as records: counted by
    // no reader, and named here as work-next names them (the owner, 2026-10-07).
    notRead: (corpus.notRecognised ?? []).map(file => ({ file: relative({ file }) })),
    areas: [...areas].map(([declared, records]) => ({
      path: declared,
      governedBy: records.map(record => ({ id: label(record), file: relative(record), title: record.title })),
      replaced: records.flatMap(record => (replaced.get(record.file) ?? [])
        .map(old => ({ id: label(old), title: old.title }))),
    })),
    contested: contested.map(([declared, records]) => ({
      path: declared, records: records.map(label),
    })),
    governingNothing: orphans.map(record => ({ id: label(record), file: relative(record) })),
    governsUnproven: unknownScope.map(record => ({ id: label(record), file: relative(record), unreadTasks: record.unreadTasks.map(file => relative({ file })) })),
    governsUnmatched: rotted.map(entry => entry.slice('governs:'.length)),
    danglingSupersession: dangling.map(record => ({ id: label(record), status: record.status })),
    supersededByUnreadable: supersededByUnread.map(record => ({ id: label(record), status: record.status, target: record.supersededBy,
      file: relative(unreadSuperseder(record)), reason: unreadSuperseder(record).reason ?? 'its Status could not be read' })),
    duplicateIds: duplicateIds.map(([id, records]) => ({ id, files: records.map(record => relative(record)) })),
  }, null, 2)}\n`)
  return 0
  }

  // Every human line goes through `say`: a corpus name or title reached a terminal and
  // a session's context raw (a corpus-chaos run of 916b515). The JSON keeps exact values.
  const say = text => process.stdout.write(terminalText(text))
  // Files the corpus reader dropped because adr-lint does not recognise them as records (the owner,
  // 2026-10-07): no reader counts them, so they are named wherever this says what it read, or the count
  // reads as coverage.
  const notRecognised = corpus.notRecognised ?? []
  const sayNotRead = () => {
    if (!notRecognised.length) return
    say(`\n${notRecognised.length} file(s) are not records adr-lint recognises (no Status, no \`## Context\` or `
      + '`## Decision` heading, or a Status other than `**Status:**` outside an adr or decisions directory), '
      + 'so no reader counts them:\n')
    for (const file of notRecognised.slice(0, SHOWN)) say(`  ${relative({ file })}\n`)
    if (notRecognised.length > SHOWN) say(`  (+${notRecognised.length - SHOWN} more; --json for all)\n`)
  }
  // With no record read, a file that was never opened makes this PARTIAL; one that
  // was opened and carries no status this reader acts on is listed below, as it is
  // beside records that were read. The JSON says the same (look from the corpus).
  if (!corpus.length && corpus.look === 'PARTIAL') {
    say('could-not-look: a listed record could not be read, or its standing could not be established (PARTIAL). '
      + 'This is not "no decision records found".\n')
    sayNotRead()
    return 0
  }
  if (!corpus.length && !unreadable.length) {
    say('No decision records found under this repository.\n')
    sayNotRead()
    return 0
  }


  say(`${corpus.length} record(s) read; ${governing.length} governing; `
  + `${touched.size} path(s) touched by their tasks.\n`)

  // Said immediately, and before anything else this tool has to say. A corpus
  // reader that reports what it read and stays quiet about what it could not is
  // the shape this whole harness exists to catch: the number looks like coverage.
  if (unreadable.length) {
  // Split three ways, because lumping them together overstates the problem and a
  // reader who is told 20 records are unreadable will stop believing the tool.
  // Most are proposals, which govern nothing BY DESIGN. Measured against a real
  // 171-record corpus 2026-08-27: 11 Proposed, 7 `Implemented…`, 1 `Amended by
  // ADR-050`, 1 with no status line.
  const unopened = unreadable.filter(entry => entry.reason)
  const read = unreadable.filter(entry => !entry.reason)
  const pending = read.filter(isPending)
  const nameless = read.filter(entry => !entry.status)
  const strange = read.filter(entry => entry.status && !pending.includes(entry))

  // Never read at all, so nothing here can say what they decide (PARTIAL).
  if (unopened.length) {
    say(`\n${unopened.length} listed file(s) could NOT be opened, so this is PARTIAL — `
      + 'nothing below says what they decide:\n')
    for (const entry of unopened.slice(0, SHOWN)) {
      say(`  ${relative(entry)}  [${entry.reason}]\n`)
    }
  }
  if (pending.length) {
    say(`\n${pending.length} record(s) are Proposed or Draft and govern nothing yet, `
      + 'which is correct — they are not counted above.\n')
  }
  if (strange.length || nameless.length) {
    say(`\n${strange.length + nameless.length} file(s) were opened and could NOT be read `
      + 'as a record, so they govern nothing and nothing else will tell you that:\n')
    for (const entry of [...strange, ...nameless].slice(0, SHOWN)) {
      say(`  ${relative(entry)}  `
        + `${entry.status ? `[${entry.status.slice(0, 44)}]` : '[no **Status:** line]'}\n`)
    }
    if (strange.length + nameless.length > SHOWN) {
      say(`  (+${strange.length + nameless.length - SHOWN} more)\n`)
    }
    if (strange.length) {
      say('A status this reader does not know is a decision it cannot apply. '
        + 'Either\nspell it the way the corpus already spells its governing records, or say '
        + 'so here.\n')
    }
  }
  }
  sayNotRead()
  if (!areas.size && touched.size) {
  // BACKLOG §85c. This is a STATE, not a finding — it exits 0 and nothing is
  // wrong — but it read like one, and the remedy it named ("add Governs: to the
  // records whose scope is broader than the files that first implemented them")
  // asks for a judgement the line did not help anyone make. Two adopting corpora
  // sorted it into "TRUE but I could not tell what to do next".
  //
  // So: say it is normal, and name the records where declaring would change the
  // most, which is the judgement the reader was left to make unaided.
  const widest = governing
    .filter(record => record.governs.length)
    .sort((a, b) => b.governs.length - a.governs.length)
    .slice(0, 3)
  say('\nNo record declares a `Governs:` scope. That is normal and nothing is wrong:\n'
    + 'authority is inferred from the paths each record\'s tasks touched, and every\n'
    + 'reader below works from that.\n')
  if (widest.length) {
    say('Declaring one changes what `adr-context` hands the next session to edit '
      + 'those\npaths. These touch the most, so a declaration there is worth the most:\n')
    for (const record of widest) {
      say(`  ${label(record)}  ${record.governs.length} path(s)  ${quotedCorpusText(record.title)}\n`)
    }
  }
  say('Ask about one path with `adr-context <path>`.\n')
  }
  if (areas.size) {
  say('\nWhat governs what, as it stands now:\n')
  for (const [declared, records] of [...areas].sort().slice(0, SHOWN)) {
    const holder = records[0]
    say(`  ${declared.padEnd(32)} ${label(holder)}  ${quotedCorpusText(holder.title)}\n`)
    for (const old of replaced.get(holder.file) ?? []) {
      say(`  ${' '.repeat(32)} replaced ${label(old)} — ${quotedCorpusText(old.title)}\n`)
    }
  }
  if (areas.size > SHOWN) {
    say(`  (+${areas.size - SHOWN} more; --json for all)\n`)
  }
  }
  if (contested.length) {
  say('\nContested — the corpus says two things about the same code:\n')
  for (const [declared, records] of contested) {
    say(`  ${declared}: ${records.map(label).join(' and ')}\n`)
  }
  }
  if (duplicateIds.length) {
  say('\nOne id names more than one record — each is read on its own, and nothing here can\n'
    + 'say which one a reference to that id means:\n')
  for (const [id, records] of duplicateIds.slice(0, SHOWN)) {
    say(`  ${id}  ${records.map(record => relative(record)).join(', ')}\n`)
  }
  }
  if (orphans.length) {
  say('\nGoverning nothing this tool can locate — no `Governs:` header and no task\n'
    + '`Affected Files`, so nothing points these decisions at the code:\n')
  for (const record of orphans.slice(0, SHOWN)) {
    say(`  ${label(record)}  ${relative(record)}\n`)
  }
  if (orphans.length > SHOWN) {
    say(`  (+${orphans.length - SHOWN} more; --json for all)\n`)
  }
  }
  if (unknownScope.length) {
  say('\nWhat these govern is UNPROVEN — a task file beside them could not be opened, so its\n'
    + '`Affected Files` were never read:\n')
  for (const record of unknownScope.slice(0, SHOWN)) {
    say(`  ${label(record)}  ${record.unreadTasks.map(file => relative({ file })).join(', ')}\n`)
  }
  }
  // A declaration that matches nothing tracked, said by the tool that answers
  // "what governs what" — because the failure mode is this tool having LESS to
  // say rather than saying something wrong. After ADR-008 moved the tree, seven
  // records' declarations stopped matching and `adr-context` answered "none
  // governs" for the whole gate surface, with every gate green.
  //
  // With no tracked listing the corpus reader reports none of these, so silence
  // here means "nothing to report" only when git could answer. That is the
  // reader's contract (ADR-005), not a claim made in this renderer.
  if (rotted.length) {
  say('\nDeclared but matching nothing git tracks — these decisions govern no\n'
    + 'file, and `adr-context` will answer "none governs" for the code they were\n'
    + 'written about:\n')
  for (const entry of rotted.slice(0, SHOWN)) {
    say(`  ${entry.slice('governs:'.length)}\n`)
  }
  if (rotted.length > SHOWN) {
    say(`  (+${rotted.length - SHOWN} more; --json for all)\n`)
  }
  }
  if (dangling.length) {
  say('\nSuperseded by a record that is not in this corpus:\n')
  for (const record of dangling) {
    say(`  ${label(record)}  ${record.status}\n`)
  }
  }
  if (supersededByUnread.length) {
  say('\nSuperseded by a record that could not be read:\n')
  for (const record of supersededByUnread) {
    say(`  ${label(record)}  ${record.status} → ${record.supersededBy} (${unreadSuperseder(record).reason ?? 'its Status could not be read'})\n`)
  }
  }

  return 0
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
