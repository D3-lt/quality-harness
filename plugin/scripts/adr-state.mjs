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
import { adrCorpus } from './lifecycle.mjs'

import { pathToFileURL } from 'node:url'

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
  const corpus = adrCorpus(root)
  const relative = record => path.relative(root, record.file) || record.file
  const label = record => `ADR-${String(record.number ?? '?').padStart(3, '0')}`

  const governing = corpus.filter(record => record.kind === 'governing')
  const byNumber = new Map(corpus.filter(record => record.number !== null)
  .map(record => [String(record.number), record]))

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
  const target = byNumber.get(record.supersededBy)
  if (!target) continue
  if (!replaced.has(target.file)) replaced.set(target.file, [])
  replaced.get(target.file).push(record)
  }

  const contested = [...areas].filter(([, records]) => records.length > 1)
  const orphans = governing.filter(record => record.governs.length === 0)
  const SHOWN = 12
  const dangling = corpus.filter(record => record.supersededBy && !byNumber.has(record.supersededBy))

  if (json) {
  process.stdout.write(`${JSON.stringify({
    read: corpus.length,
    governing: governing.length,
    touchedPaths: touched.size,
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
    danglingSupersession: dangling.map(record => ({ id: label(record), status: record.status })),
  }, null, 2)}\n`)
  return 0
  }

  if (!corpus.length) {
  process.stdout.write('No decision records found under this repository.\n')
  return 0
  }

  const unreadable = corpus.unreadable ?? []
  process.stdout.write(`${corpus.length} record(s) read; ${governing.length} governing; `
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
  const pending = unreadable.filter(entry => /^(?:proposed|draft)\b/i.test(entry.status ?? ''))
  const nameless = unreadable.filter(entry => !entry.status)
  const strange = unreadable.filter(entry => entry.status && !pending.includes(entry))

  if (pending.length) {
    process.stdout.write(`\n${pending.length} record(s) are Proposed or Draft and govern nothing yet, `
      + 'which is correct — they are not counted above.\n')
  }
  if (strange.length || nameless.length) {
    process.stdout.write(`\n${strange.length + nameless.length} file(s) were opened and could NOT be read `
      + 'as a record, so they govern nothing and nothing else will tell you that:\n')
    for (const entry of [...strange, ...nameless].slice(0, SHOWN)) {
      process.stdout.write(`  ${relative(entry)}  `
        + `${entry.status ? `[${entry.status.slice(0, 44)}]` : '[no **Status:** line]'}\n`)
    }
    if (strange.length + nameless.length > SHOWN) {
      process.stdout.write(`  (+${strange.length + nameless.length - SHOWN} more)\n`)
    }
    if (strange.length) {
      process.stdout.write('A status this reader does not know is a decision it cannot apply. '
        + 'Either\nspell it the way the corpus already spells its governing records, or say '
        + 'so here.\n')
    }
  }
  }
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
  process.stdout.write('\nNo record declares a `Governs:` scope. That is normal and nothing is wrong:\n'
    + 'authority is inferred from the paths each record\'s tasks touched, and every\n'
    + 'reader below works from that.\n')
  if (widest.length) {
    process.stdout.write('Declaring one changes what `adr-context` hands the next session to edit '
      + 'those\npaths. These touch the most, so a declaration there is worth the most:\n')
    for (const record of widest) {
      process.stdout.write(`  ${label(record)}  ${record.governs.length} path(s)  ${record.title}\n`)
    }
  }
  process.stdout.write('Ask about one path with `adr-context <path>`.\n')
  }
  if (areas.size) {
  process.stdout.write('\nWhat governs what, as it stands now:\n')
  for (const [declared, records] of [...areas].sort().slice(0, SHOWN)) {
    const holder = records[0]
    process.stdout.write(`  ${declared.padEnd(32)} ${label(holder)}  ${holder.title}\n`)
    for (const old of replaced.get(holder.file) ?? []) {
      process.stdout.write(`  ${' '.repeat(32)} replaced ${label(old)} — ${old.title}\n`)
    }
  }
  if (areas.size > SHOWN) {
    process.stdout.write(`  (+${areas.size - SHOWN} more; --json for all)\n`)
  }
  }
  if (contested.length) {
  process.stdout.write('\nContested — the corpus says two things about the same code:\n')
  for (const [declared, records] of contested) {
    process.stdout.write(`  ${declared}: ${records.map(label).join(' and ')}\n`)
  }
  }
  if (orphans.length) {
  process.stdout.write('\nGoverning nothing this tool can locate — no `Governs:` header and no task\n'
    + '`Affected Files`, so nothing points these decisions at the code:\n')
  for (const record of orphans.slice(0, SHOWN)) {
    process.stdout.write(`  ${label(record)}  ${relative(record)}\n`)
  }
  if (orphans.length > SHOWN) {
    process.stdout.write(`  (+${orphans.length - SHOWN} more; --json for all)\n`)
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
  const rotted = [...new Set(corpus.flatMap(record => record.unresolved))]
    .filter(entry => entry.startsWith('governs:'))
  if (rotted.length) {
  process.stdout.write('\nDeclared but matching nothing git tracks — these decisions govern no\n'
    + 'file, and `adr-context` will answer "none governs" for the code they were\n'
    + 'written about:\n')
  for (const entry of rotted.slice(0, SHOWN)) {
    process.stdout.write(`  ${entry.slice('governs:'.length)}\n`)
  }
  if (rotted.length > SHOWN) {
    process.stdout.write(`  (+${rotted.length - SHOWN} more; --json for all)\n`)
  }
  }
  if (dangling.length) {
  process.stdout.write('\nSuperseded by a record that is not in this corpus:\n')
  for (const record of dangling) {
    process.stdout.write(`  ${label(record)}  ${record.status}\n`)
  }
  }

  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
