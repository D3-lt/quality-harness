#!/usr/bin/env node
// chaos-fixture-sweep.mjs — a finding from an outside run that landed in no fixture.
//
// ADR-064 T5. Every defect that reached an adopter was in what a reader said about
// a corpus shaped unlike this one, and the matrix is the one check that runs every
// reader as a process on all three platforms. A fix guarded only by a unit test is
// one the matrix never sees, so a confirmed wild finding changes the reader AND lands
// in a fixture corpus's expected.json — or its section says why not.
//
// This lists the BACKLOG sections that did neither: numbered after the cutoff, a
// heading that says the finding came from an outside run, and a body naming no
// `tests/fixtures/corpora/` path and no `(fixture-waived: <reason>)`.
//
// ⚠ A PLACE TO LOOK, NOT A CENSUS. `OUTSIDE_RUN` is a classifier over prose
// (CLAUDE.md §16): a heading it does not match is not swept, and the output says so.
// ⚠ SECTIONS UP TO THE CUTOFF ARE HISTORY. They predate the rule, and CLAUDE.md §10
// forbids rewriting them to satisfy it.
//
// Usage:  node scripts/chaos-fixture-sweep.mjs [<BACKLOG.md>]
// Exit code is 0 whatever it finds (CLAUDE.md §3).
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { sections } from './backlog-record-sweep.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A heading that says its finding came from somebody else's run. */
export const OUTSIDE_RUN = /\breported (?:from|by)\b|\boutside runs?\b|\bcorpus-chaos\b/i
/** The last section written before the rule (ADR-064, accepted 2026-09-24). */
export const CUTOFF = 282
const FIXTURE = /tests\/fixtures\/corpora\//
const WAIVER = /\(fixture-waived:\s*[^)]+\)/

/** The sections after the cutoff reported from outside that name no fixture and no waiver. */
export function unfixtured (markdown, cutoff = CUTOFF) {
  return sections(markdown).filter(section => section.number > cutoff
    && OUTSIDE_RUN.test(section.heading)
    && !FIXTURE.test(section.body) && !WAIVER.test(section.body))
}

export function main (argv = process.argv.slice(2)) {
  const file = argv[0] ?? join(repoRoot, 'docs', 'BACKLOG.md')
  const found = unfixtured(readFileSync(file, 'utf8'))
  for (const section of found) {
    process.stdout.write(`§${section.number} ${section.heading}\n  reported from an outside run, and names no tests/fixtures/corpora/ path and no (fixture-waived: …)\n`)
  }
  process.stdout.write(`${found.length} section(s) after §${CUTOFF} reported from an outside run name no fixture and no waiver. A place to look, not a census: a heading this sweep's regex does not match is not swept.\n`)
  return 0
}

if (isMainModule(import.meta.url)) process.exitCode = main()
