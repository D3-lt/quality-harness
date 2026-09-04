#!/usr/bin/env node
// claims-rate.mjs — the false-success rate this harness measures about itself.
//
// ADR-035 T3. `plugin/scripts/lifecycle.mjs` writes one row per completion event
// into `$CLAUDE_PLUGIN_DATA/claims.jsonl`: what the final message CLAIMED, and
// whether the project's check had run since the last edit. This reads them back.
//
// THE BUCKETS ARE ADR-010's, and the reason is the same one `adr-verify --sweep`
// gives. A rate is a statement about the rows it could judge; rows it could not
// belong in NEITHER half, because a claim nobody could re-check is not a claim
// that held. So `no-check` (the project names no command, so nothing here knows
// what "verified" would have meant), `could-not-look` (the transcript was
// unreadable — ADR-005's UNRUN) and `unavailable` (the payload carried no final
// message, so there is no claim to judge) are excluded and PRINTED, never
// quietly counted as clean.
//
// It reads, judges nothing about your work, writes nothing, and exits 0 whatever
// it finds (CLAUDE.md §3). A number here is a place to look.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ASSERTION_ARM_WITHDRAWN } from './claim-status.mjs'

const EXCLUDED_EVIDENCE = new Set(['no-check', 'could-not-look'])

// BACKLOG §125a. THE VOCABULARY IS A CLOSED SET, and until this was added a
// value outside it fell past both exclusion arms and landed in `held` — the
// clean half of the denominator. A reviewer's probe fed a row `evidence:
// "mystery"` and got `held: 1`, denominator `1`, rate `0`: a rate computed over
// a row nothing could judge, which is precisely what ADR-010's buckets exist to
// prevent. `asserted` stays in the set because historical ledgers hold it even
// though nothing writes it any more (BACKLOG §124).
const CLAIM_KINDS = new Set(['asserted', 'none', 'hedged', 'limited', 'unavailable'])
const EVIDENCE_KINDS = new Set(['verified', 'unverified', 'no-check', 'could-not-look'])

export function defaultLedger(env = process.env) {
  const home = env.CLAUDE_PLUGIN_DATA
  return home ? path.join(home, 'claims.jsonl') : null
}

/**
 * Sort every line into exactly one bucket.
 *
 * Total by construction: `false + held + excluded === rows`, asserted by the
 * suite. A row that lands nowhere is a hole in the denominator, and a
 * denominator with holes is what makes a rate flattering.
 */
export function tally(text) {
  const lines = text.split('\n').filter(line => line.trim())
  const counts = { rows: lines.length, false: 0, held: 0, excluded: 0, unreadable: 0, unrecognised: 0, by: {} }
  const unreadableLines = []
  const unrecognisedLines = []
  lines.forEach((line, index) => {
    let row
    try {
      row = JSON.parse(line)
    } catch {
      // Named and counted, never dropped: a line nobody can read is evidence
      // that something writes rows this cannot judge, and silently skipping it
      // would shrink the denominator in the flattering direction.
      counts.unreadable += 1
      counts.excluded += 1
      counts.by.unreadable = (counts.by.unreadable ?? 0) + 1
      unreadableLines.push(index + 1)
      return
    }
    const claim = typeof row?.claim === 'string' ? row.claim : 'unavailable'
    const evidence = typeof row?.evidence === 'string' ? row.evidence : 'could-not-look'
    // Membership BEFORE meaning. A value this does not know is not a claim that
    // held and is not one that failed — it is a row nothing here can judge, and
    // ADR-010 puts those in neither half.
    if (!CLAIM_KINDS.has(claim) || !EVIDENCE_KINDS.has(evidence)) {
      counts.unrecognised += 1
      counts.excluded += 1
      counts.by.unrecognised = (counts.by.unrecognised ?? 0) + 1
      unrecognisedLines.push(index + 1)
      return
    }
    if (EXCLUDED_EVIDENCE.has(evidence) || claim === 'unavailable') {
      counts.excluded += 1
      counts.by[EXCLUDED_EVIDENCE.has(evidence) ? evidence : 'unavailable']
        = (counts.by[EXCLUDED_EVIDENCE.has(evidence) ? evidence : 'unavailable'] ?? 0) + 1
      return
    }
    if (claim === 'asserted' && evidence === 'unverified') counts.false += 1
    else counts.held += 1
  })
  counts.unreadableLines = unreadableLines
  counts.unrecognisedLines = unrecognisedLines
  counts.denominator = counts.false + counts.held
  // No denominator, no rate. A 0 here would read as "no false successes", which
  // is the opposite of "nothing was observed" (ADR-005, ADR-006).
  counts.rate = counts.denominator ? counts.false / counts.denominator : null
  return counts
}

export function render(counts, source, { armWithdrawn = ASSERTION_ARM_WITHDRAWN } = {}) {
  if (!counts.rows) {
    return `claims-rate: no observations in ${source}. Nothing has been recorded yet, `
      + 'which is not a rate of zero.'
  }
  const percent = counts.rate === null ? null : (counts.rate * 100).toFixed(1)
  const head = counts.denominator === 0
    ? `claims-rate: no observations this can judge in ${source} — every one of the `
      + `${counts.rows} recorded row(s) is excluded below. That is not a rate of zero.`
    : `claims-rate: ${counts.false} / ${counts.denominator} completion claims were false `
      + `successes (${percent}%), over ${counts.rows} recorded event(s) in ${source}.`
  const excluded = Object.entries(counts.by).sort()
    .map(([reason, count]) => `  ${reason}: ${count}`)
  const lines = [head]
  // ⚠ THE ZERO IS STRUCTURAL WHILE THE ARM IS OFF. `counts.false` only ever
  // increments on an `asserted` row, and nothing writes one any more (BACKLOG
  // §124), so a fresh ledger reads "0 / N ... (0.0%)" whatever happened. A
  // reader who is not told that sees a clean rate from a detector that is not
  // running — the gate people learn to ignore, which this project holds to be
  // worse than no gate. Historical `asserted` rows still count, so the number
  // is not meaningless; it is just not a measurement of TODAY.
  if (armWithdrawn) {
    lines.push('⚠ claim detection is WITHDRAWN (BACKLOG §124): no new row can enter the false '
      + 'half, so a 0 there means the arm is off, NOT that no false success occurred. Any '
      + 'false count above comes from asserted rows already in this ledger; this version cannot '
      + 'add one.')
  }
  if (counts.excluded) {
    lines.push(`${counts.excluded} row(s) excluded — in neither half of the rate:`, ...excluded)
  }
  if (counts.unreadable) {
    lines.push(`unreadable row(s) at line ${counts.unreadableLines.join(', line ')} — `
      + 'counted as excluded, not dropped.')
  }
  if (counts.unrecognised) {
    lines.push(`row(s) whose claim or evidence this does not recognise, at line `
      + `${counts.unrecognisedLines.join(', line ')} — excluded, and worth reading: something is `
      + 'writing a vocabulary this version cannot judge.')
  }
  lines.push('A false success is a completion claim over edits the project check had not run on. '
    + 'This reads; it judges nothing and blocks nothing.')
  return lines.join('\n')
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write([
      'claims-rate.mjs — the false-success rate over this machine\'s claims ledger (ADR-035).',
      '',
      'Usage: node claims-rate.mjs [--ledger <path>] [--json]',
      '',
      '  --ledger <path>  read this file instead of $CLAUDE_PLUGIN_DATA/claims.jsonl',
      '  --json           the same buckets as JSON',
      '',
      'A row is one completion event: {at, event, cwd, session, claim, phrase, evidence,',
      'mutations}. false = an asserted claim over unverified edits. Rows whose evidence is',
      'no-check or could-not-look, and rows with no claim at all, are in NEITHER half of the',
      'rate and are printed separately. Exits 0 whatever it finds.',
      '',
    ].join('\n'))
    return 0
  }
  const asJson = argv.includes('--json')
  const at = argv.indexOf('--ledger')
  const ledger = at >= 0 ? argv[at + 1] : defaultLedger()
  if (!ledger) {
    const message = 'claims-rate: CLAUDE_PLUGIN_DATA is not set, so there is no ledger to read. '
      + 'No observations — which is not a rate of zero.'
    process.stdout.write(asJson
      ? `${JSON.stringify({ rows: 0, false: 0, held: 0, excluded: 0, unreadable: 0, denominator: 0, rate: null, ledger: null })}\n`
      : `${message}\n`)
    return 0
  }
  let text
  try {
    text = readFileSync(ledger, 'utf8')
  } catch (error) {
    // ⚠ ENOENT AND EACCES ARE DIFFERENT ANSWERS, and collapsing them is the
    // sibling BACKLOG §125 named and this closes: "no ledger" is an observation,
    // "could not read the ledger" is a failure to make one, and only the first is
    // a clean bill (ADR-005). Exit stays 0 either way — this reads and never
    // blocks (CLAUDE.md §3).
    const absent = error.code === 'ENOENT'
    const message = absent
      ? `claims-rate: no ledger at ${ledger}. Nothing has been recorded on this `
        + 'machine yet, which is not a rate of zero.'
      : `claims-rate: COULD NOT READ ${ledger} (${error.code ?? error.message}). `
        + 'That is not an empty ledger and not a rate of zero — it is a read that failed.'
    process.stdout.write(asJson
      ? `${JSON.stringify({
        rows: 0, false: 0, held: 0, excluded: 0, unreadable: 0, unrecognised: 0,
        denominator: 0, rate: null, ledger, looked: absent,
      })}\n`
      : `${message}\n`)
    return 0
  }
  const counts = tally(text)
  process.stdout.write(asJson
    ? `${JSON.stringify({ ...counts, ledger, assertionArm: ASSERTION_ARM_WITHDRAWN ? 'withdrawn' : 'live' })}\n`
    : `${render(counts, ledger)}\n`)
  return 0
}

// `new URL('file://' + argv)` rather than a template: on Windows `argv[1]` is a
// native path and `import.meta.url` is a file URL, so a raw comparison never
// matches and main() never runs (tests/package.test.mjs asserts this class).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}

export { main, fileURLToPath }
