#!/usr/bin/env node
// Which decisions govern these paths, and which were already killed here.
//
// Read-only and side-effect free, deliberately: it answers, it never approves,
// and it cannot fail. Exit 0 whatever it finds — "no decision governs this file"
// is an answer, not a finding. The only non-zero exit is a broken invocation.
//
// The hook calls the same resolver in-process, so this and the edit-boundary
// context can never drift apart.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { adrCorpus, decisionsGoverning } from './lifecycle.mjs'

// The CLI is behind an import guard (BACKLOG §27). It used to run at module
// scope, so importing this file — to test it, or from any tool that walks the
// directory — read the corpus and printed a report as a side effect of the
// import itself.
export function main(argv, root = process.cwd()) {
  const json = argv.includes('--json')
  const targets = argv.filter(argument => !argument.startsWith('--'))

  if (!targets.length) {
    process.stderr.write('usage: adr-context [--json] <path>...\n')
    return 2
  }

  const corpus = adrCorpus(root)
  const { governing, graveyard } = decisionsGoverning(targets, root, corpus)
  const shape = record => ({
    file: path.relative(root, record.file) || record.file,
    title: record.title,
    status: record.status,
    governs: record.governs,
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
