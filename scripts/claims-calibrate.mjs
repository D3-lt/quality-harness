#!/usr/bin/env node
// claims-calibrate.mjs — print real final assistant messages beside what
// `completionClaim()` says about them, so a human can label them.
//
//   node scripts/claims-calibrate.mjs [count]
//
// ADR-035 T4. Repository tooling: it never ships, and nothing consumes its
// output but a person reading it.
//
// ⚠ WHAT THIS CAN AND CANNOT MEASURE, AS OF 2026-09-06.
//
// T4 was written to measure the PRECISION of `completionClaim()`'s `asserted`
// arm: at least thirty real final messages, at most three `asserted` rows that
// no reader would call a completion claim, or the arm is withdrawn.
//
// The arm was withdrawn first — on 2026-09-04, by that same criterion, after the
// first real eval run classified three answers `asserted` and all three were
// honest disclosures (BACKLOG §124). `completionClaim()` now returns only
// `unavailable`, `limited`, `hedged` or `none`; there is no producer of
// `asserted` anywhere.
//
// So the labelling exercise T4 describes CANNOT BE RUN: it asks a human to label
// rows of a kind the classifier can no longer emit, and a run that reports
// "0 asserted, 0 false positives, precision 1.00" would be arithmetic on an
// empty set dressed as a measurement. This tool refuses to print that number.
//
// What it does instead is the half that is still true and still useful: show the
// distribution over REAL final messages of the arms that do exist. That is what
// a future attempt to restore `asserted` has to beat, and it is the baseline
// nobody has taken.
//
// Exit codes:
//   0  a sample was printed
//   2  usage, or no transcripts could be read
import { createReadStream } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { completionClaim } from '../plugin/scripts/lifecycle.mjs'

// The transcripts directory is assembled at runtime and never written down:
// it names a person, and this repository publishes its own corpus (CLAUDE.md §6).
const PROJECTS = join(homedir(), '.claude', 'projects')

/** The last assistant text message in one transcript, or null. */
async function finalMessage(file) {
  let last = null
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    const message = row?.message
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue
    const text = message.content.filter(b => b?.type === 'text').map(b => b.text).join('\n').trim()
    if (text) last = text
  }
  return last
}

/** The newest `count` transcripts across every project, newest first. */
function newestTranscripts(count) {
  const files = []
  let projects
  try { projects = readdirSync(PROJECTS, { withFileTypes: true }) } catch { return [] }
  for (const entry of projects) {
    if (!entry.isDirectory()) continue
    const dir = join(PROJECTS, entry.name)
    let names
    try { names = readdirSync(dir) } catch { continue }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const path = join(dir, name)
      try { files.push({ path, mtime: statSync(path).mtimeMs, project: entry.name }) } catch { /* gone */ }
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, count)
}

async function main() {
  const count = Number(process.argv[2] ?? 30)
  if (!Number.isInteger(count) || count < 1) {
    console.log('usage: node scripts/claims-calibrate.mjs [count]   (default 30)')
    process.exitCode = 2
    return
  }

  const transcripts = newestTranscripts(count)
  if (!transcripts.length) {
    // ADR-005: could-not-look is said in those words, never reported as a clean
    // sample. A machine with no transcripts and a machine whose finals are all
    // `none` must not print the same thing.
    console.log(`UNRUN: no transcripts found under the Claude projects directory (${PROJECTS}).`)
    console.log('Nothing was measured. This is not a sample of zero.')
    process.exitCode = 2
    return
  }

  const rows = []
  for (const t of transcripts) {
    const text = await finalMessage(t.path)
    if (text === null) continue
    rows.push({ project: t.project, claim: completionClaim(text).kind, text })
  }

  console.log(`claims-calibrate · ${rows.length} session(s) with a final assistant message, of ${transcripts.length} newest transcripts`)
  console.log('')
  rows.forEach((r, i) => {
    const preview = r.text.replace(/\s+/g, ' ').slice(0, 200)
    console.log(`${String(i + 1).padStart(3)}. [${r.claim}] ${preview}`)
  })

  const tally = new Map()
  for (const r of rows) tally.set(r.claim, (tally.get(r.claim) ?? 0) + 1)
  console.log('')
  console.log('DISTRIBUTION')
  for (const [kind, n] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(14)} ${String(n).padStart(4)}`)
  }

  console.log('')
  if (!tally.has('asserted')) {
    // The refusal T4's criterion earns. Printing a precision here would be
    // arithmetic over an empty set wearing the costume of a measurement, which
    // is the class this whole record exists to refuse (CLAUDE.md §4).
    console.log('NO PRECISION IS REPORTED, and that is the finding.')
    console.log('')
    console.log('  `completionClaim()` has no `asserted` arm: it can return only unavailable,')
    console.log('  limited, hedged or none. The arm T4 was written to calibrate was withdrawn')
    console.log('  on 2026-09-04 by ADR-035\'s own pre-registered criterion (BACKLOG §124),')
    console.log('  before this measurement was ever taken.')
    console.log('')
    console.log('  So there is nothing to label, and "0 false positives, precision 1.00" would')
    console.log('  be a number computed over an empty set. T4\'s criterion is satisfied by its')
    console.log('  OTHER branch — the arm is withdrawn — not by a calibration that passed.')
    console.log('')
    console.log('  The distribution above is the baseline a restored `asserted` arm must beat.')
    console.log('  It is not a verdict on anything.')
  } else {
    console.log('LABEL EVERY `asserted` ROW ABOVE BY HAND (ADR-035 T4 step 2).')
    console.log('The labels are the operator\'s, not this tool\'s. Count the rows that assert')
    console.log('no completion a reader would recognise; precision below 0.90 withdraws the arm.')
  }
}

main()
