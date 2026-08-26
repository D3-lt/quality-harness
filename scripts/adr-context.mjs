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
import { adrCorpus, decisionsGoverning } from './lifecycle.mjs'

const argv = process.argv.slice(2)
const json = argv.includes('--json')
const targets = argv.filter(argument => !argument.startsWith('--'))

if (!targets.length) {
  process.stderr.write('usage: adr-context [--json] <path>...\n')
  process.exit(2)
}

const root = process.cwd()
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
    process.stdout.write(`GOVERNS   ${shape(record).file} — ${record.title}\n`)
  }
  for (const record of graveyard) {
    process.stdout.write(`DECIDED AGAINST  ${shape(record).file} — ${record.title} [${record.status}]\n`)
  }
}
