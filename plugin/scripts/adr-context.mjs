#!/usr/bin/env node
// Which decisions govern these paths, and which were already killed here.
//
// Read-only and side-effect free, deliberately: it answers, it never approves,
// and it cannot fail. Exit 0 whatever it finds — "no decision governs this file"
// is an answer, not a finding. The only non-zero exit is a broken invocation.
//
// The hook calls the same resolver in-process, so this and the edit-boundary
// context can never drift apart.
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { adrCorpus, decisionsGoverning } from './lifecycle.mjs'

// The CLI is behind an import guard (BACKLOG §27). It used to run at module
// scope, so importing this file — to test it, or from any tool that walks the
/**
 * Whether a target lies inside the corpus root. Both sides realpath'd where they
 * exist, so `/tmp` and `/private/tmp` agree, and compared by path SEGMENT: a
 * prefix test alone makes `/repo-other` look like it is inside `/repo`.
 */
export function within(root, target) {
  const base = (() => {
    const absolute = path.resolve(root)
    try { return realpathSync(absolute) } catch { return absolute }
  })()
  // A RELATIVE target is repository-relative, the way `decisionsGoverning`
  // reads it — resolving it against the process's directory instead would make
  // `adr-context src/pay.js` outside its own corpus whenever the caller ran it
  // from elsewhere with an explicit root.
  const here = (() => {
    const absolute = path.isAbsolute(target) ? target : path.resolve(base, target)
    try { return realpathSync(absolute) } catch { return absolute }
  })()
  if (here === base) return true
  return here.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
}

// directory — read the corpus and printed a report as a side effect of the
// import itself.
export function main(argv, root = process.cwd()) {
  const json = argv.includes('--json')
  const targets = argv.filter(argument => !argument.startsWith('--'))

  if (!targets.length) {
    process.stderr.write('usage: adr-context [--json] <path>...\n')
    return 2
  }

  // A path outside this corpus's repository is a question this corpus cannot
  // answer, and "none governs" is the wrong words for it (ADR-005, ADR-031).
  // Measured 2026-09-05 against five foreign corpora: run from one repository
  // and asked about another's file, this printed "Read 35 record(s); none
  // governs …/internal/auth/origin.go" — while that file's own corpus names
  // ADR-049 and the test enforcing it. A confident negative about a tree the
  // tool never read (BACKLOG §138).
  const outside = targets.filter(target => !within(root, target))
  if (outside.length) {
    const message = `Outside this corpus: ${outside.join(', ')} ${outside.length > 1 ? 'are' : 'is'} not under ${root}, `
      + 'so the records here say nothing about it. This is NOT "no decision governs it" — ask from that '
      + "repository, where its own corpus can answer."
    if (json) process.stdout.write(`${JSON.stringify({ read: null, outside, governing: [], graveyard: [] }, null, 2)}\n`)
    else process.stdout.write(`${message}\n`)
    return 2
  }

  const corpus = adrCorpus(root)
  const { governing, graveyard } = decisionsGoverning(targets, root, corpus)
  const shape = record => ({
    file: path.relative(root, record.file) || record.file,
    title: record.title,
    status: record.status,
    governs: record.governs,
    // Present only when there is one, so a machine consumer can tell "no
    // enforcement declared" from "this tool does not report it". Omitted
    // entirely at first: prose readers saw `[caught by: …]` and JSON readers
    // saw nothing. Found by review, not by a test — the prose renderer had one
    // and the JSON renderer beside it had none.
    ...(record.enforcedBy?.length ? { enforcedBy: record.enforcedBy } : {}),
  })

  if (json) {
    process.stdout.write(`${JSON.stringify({
      read: corpus.length,
      governing: governing.map(shape),
      graveyard: graveyard.map(shape),
    }, null, 2)}\n`)
  } else if (!corpus.length) {
    process.stdout.write('No decision records found under this repository.\n')
  } else if (!governing.length && !graveyard.length) {
    process.stdout.write(`Read ${corpus.length} record(s); none governs ${targets.join(', ')}.\n`)
  } else {
    for (const record of governing) {
      // The enforcing check goes on the SAME line, because this arrives at the
      // moment an agent is about to edit the file and a second line is a second
      // thing to read. Silence where a record has no header: most decisions are
      // not mechanically enforced, and padding every line with `None` is noise
      // exactly where attention is scarcest.
      const enforced = record.enforcedBy?.length
        ? `  [caught by: ${record.enforcedBy.join(', ')}]`
        : ''
      process.stdout.write(`GOVERNS   ${shape(record).file} — ${record.title}${enforced}\n`)
    }
    for (const record of graveyard) {
      process.stdout.write(`DECIDED AGAINST  ${shape(record).file} — ${record.title} [${record.status}]\n`)
    }
  }

  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
