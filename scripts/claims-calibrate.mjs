#!/usr/bin/env node
// claims-calibrate.mjs — put real final messages next to what completionClaim()
// calls them, so a human can label them.
//
// ADR-035 T4. This is the record's pre-registered criterion made runnable: the
// `asserted` arm of the vocabulary survives only if, over at least thirty real
// final messages, at most three classified `asserted` carry no completion
// assertion a reader would recognise — precision ≥ 0.90. Below that the arm is
// withdrawn in the same commit that records the measurement.
//
// REPOSITORY TOOLING. It never ships (CLAUDE.md §1), it reads and writes
// nothing, and it prints only what it found. The labelling is the measurement
// and it is the operator's, not this script's: nothing here decides whether a
// message asserts completion, because a tool grading its own classifier is the
// LLM judge this record rejected wearing a different hat.
//
// It reads the transcripts Claude Code writes under its projects directory. The
// last assistant message of a session is the one the Stop hook would have seen.
import { createReadStream, readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { ASSERTION_ARM_WITHDRAWN } from '../plugin/scripts/claim-status.mjs'

const HOME = path.join(os.homedir(), '.claude', 'projects')

/** Every transcript under the projects directory, newest first. */
export function transcripts(root = HOME) {
  const found = []
  let projects
  try {
    projects = readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const dir = path.join(root, project.name)
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch { continue }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      const file = path.join(dir, entry.name)
      try {
        found.push({ file, at: statSync(file).mtimeMs, project: project.name })
      } catch { /* a file that vanished between readdir and stat is not a sample */ }
    }
  }
  return found.sort((a, b) => b.at - a.at)
}

/**
 * The last assistant text of a session — what the Stop hook would have read.
 *
 * Streamed rather than read whole: a long session's transcript is tens of
 * megabytes, and thirty of them read into memory at once is a different tool.
 */
export async function finalMessage(file) {
  let last = null
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch { continue }
    const message = row?.message
    if (typeof message !== 'object' || message === null) continue
    if (message.role !== 'assistant') continue
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter(block => block && block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text).join('\n').trim()
    if (text) last = text
  }
  return last
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write([
      'claims-calibrate.mjs — real final messages beside completionClaim()\'s answer (ADR-035 T4).',
      '',
      'Usage: node scripts/claims-calibrate.mjs [--limit <n>] [--kind <claim kind>]',
      '',
      'Prints one numbered row per session, newest first. Label the `asserted` rows',
      'by hand: does the message assert completion? Then record the sign-off with',
      'adr-verify --human, naming the sample size, the count, and the precision.',
      '',
    ].join('\n'))
    return 0
  }
  const limitAt = argv.indexOf('--limit')
  const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : 30
  const kindAt = argv.indexOf('--kind')
  const only = kindAt >= 0 ? argv[kindAt + 1] : null

  const { completionClaim } = await import('../plugin/scripts/lifecycle.mjs')
  const files = transcripts()
  if (!files.length) {
    process.stdout.write(`claims-calibrate: no transcripts under ${HOME}. `
      + 'Nothing to label — say so rather than padding the sample.\n')
    return 0
  }

  const rows = []
  for (const entry of files) {
    if (rows.length >= limit) break
    const message = await finalMessage(entry.file)
    if (!message) continue
    const claim = completionClaim(message)
    if (only && claim.kind !== only) continue
    rows.push({ ...entry, message, claim })
  }

  const counts = {}
  for (const row of rows) counts[row.claim.kind] = (counts[row.claim.kind] ?? 0) + 1

  rows.forEach((row, index) => {
    const head = row.message.replace(/\s+/g, ' ').slice(0, 200)
    process.stdout.write(`\n[${String(index + 1).padStart(3)}] ${row.claim.kind.toUpperCase()}`
      + `${row.claim.phrase ? ` — matched: ${JSON.stringify(row.claim.phrase)}` : ''}\n`)
    process.stdout.write(`      ${row.project}\n`)
    process.stdout.write(`      ${head}${row.message.length > 200 ? ' …' : ''}\n`)
  })

  process.stdout.write(`\n${rows.length} session(s) with a final message, of ${files.length} `
    + `transcript(s). By kind: ${Object.entries(counts).sort().map(([k, n]) => `${k}=${n}`).join(' ')}\n`)
  process.stdout.write(ASSERTION_ARM_WITHDRAWN
    // With no `asserted` producer there is nothing to label, and telling a human
    // to label ASSERTED rows would send them looking for a category that cannot
    // occur — the reader would conclude the sample was clean.
    ? '\n⚠ claim detection is WITHDRAWN (BACKLOG §124): the classifier above cannot return '
      + 'ASSERTED, so a run with none is not a precision result. Restoring the arm — a corrected '
      + 'negation vocabulary and a fresh sample — comes before this measurement means anything.\n'
    : 'Label every ASSERTED row: does it assert completion? '
      + 'precision = 1 - (false positives / asserted). The criterion is ≥ 0.90 over ≥ 30 messages.\n')
  process.stdout.write('This script does not judge them. That is the measurement, and it is yours.\n')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}

export { main }
