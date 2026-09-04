#!/usr/bin/env node
// trajectory-metrics.mjs — what the corpus's evidence shows about the SEQUENCE,
// not the outcome.
//
// Research gap 2. Five process-shape checks already exist inside `adr-lint`, and
// every one of them is per-record advice: step 1 must establish a failing test;
// every entry passed with no mutant killed; MUTATION_REQUIRED_FROM;
// DURATION_REQUIRED_FROM; a committed entry gone missing. Nothing aggregated
// them, so there was no trajectory number to report — and a metric CLASS, which
// is what Google and OpenAI mean by trajectory evaluation, is exactly the thing
// a per-record advisory is not.
//
// WHAT IT MEASURES, and the distinction is the whole point. An acceptance entry
// says the check PASSED. It says nothing about whether the check could ever have
// failed here. Two things in a task's own logs do:
//
//   a RED entry   — the fence was run and exited non-zero at least once, so the
//                   command discriminates on this tree
//   a KILLED mutant — the mechanism was broken on purpose and the fence noticed
//
// A task with neither has proved its outcome and nothing about its trajectory.
// That is not a defect on its own — the work may predate the rule, or the fence
// may be honestly hard to fail — which is why this reports and never blocks
// (CLAUDE.md §3), and why the number is a compliance figure about a corpus
// rather than a verdict on it.
//
// Buckets follow ADR-010: a task whose log cannot be read is `unreadable` and
// sits in NEITHER half. "I could not look" is not "it showed nothing".
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const ENTRY = /^-\s+\d{4}-\d{2}-\d{2}\s+·/
const EXIT = /·\s*exit\s+(\d+)\s*·/
const MUTANT = /·\s*mutant\s+(killed|survived|inconclusive)\s*·/

/** Every `*.md` under a `tasks/` directory below root, README excluded. */
export function taskFiles(root, unreadableDirs = [], readdir = readdirSync) {
  const found = []
  const walk = dir => {
    let entries
    try {
      entries = readdir(dir, { withFileTypes: true })
    } catch {
      // BACKLOG §125. Swallowed, this shrank a real denominator in the
      // flattering direction and rendered identically to a corpus that simply
      // has no tasks. The sink is optional so no caller had to change; a caller
      // that passes one can say PARTIAL instead of implying it looked at
      // everything (ADR-005).
      unreadableDirs.push(dir)
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.md')
        && path.basename(dir) === 'tasks' && entry.name.toLowerCase() !== 'readme.md') found.push(full)
    }
  }
  walk(root)
  return found.sort()
}

/**
 * The lines under one `## Heading`, up to the next heading or end of file.
 *
 * ⚠ SPLIT, not a lookahead. This was `(?=^## |\Z)`, and `\Z` IS NOT A JAVASCRIPT
 * ESCAPE — it is an identity escape matching the letter Z, so a section that ran
 * to the end of the file was never captured. `## Mutation Log` is the last
 * section of many task files, so every killed mutant in the corpus went
 * uncounted and the reader reported `0 red of 53 entries` about a corpus whose
 * own README records eight red runs. Found 2026-09-04 by a fixture that put the
 * mutation log last; it read as a clean answer, which is the shape §4 is about.
 */
function section(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex(line => line.trim() === `## ${heading}`)
  if (start < 0) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => line.startsWith('## '))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

export function readTask(file, read = readFileSync) {
  let text
  try {
    text = read(file, 'utf8')
  } catch {
    return { file, unreadable: true }
  }
  const log = section(text, 'Verification Log').split('\n').filter(line => ENTRY.test(line))
  const mlog = section(text, 'Mutation Log').split('\n').filter(line => ENTRY.test(line))
  // ⚠ `log` is every ENTRY-SHAPED line; `exits` is only those whose exit code
  // PARSED. The difference is a line this cannot judge, and counting it in
  // `entries` while it cannot reach `red` or `green` is what made a corpus with
  // one malformed entry report "every entry passed" (BACKLOG §125b).
  const exits = log.map(line => EXIT.exec(line)).filter(Boolean).map(hit => Number(hit[1]))
  const mutants = mlog.map(line => MUTANT.exec(line)).filter(Boolean).map(hit => hit[1])
  return {
    file,
    unreadable: false,
    entries: log.length,
    unjudged: log.length - exits.length,
    red: exits.filter(code => code !== 0).length,
    green: exits.filter(code => code === 0).length,
    killed: mutants.filter(verdict => verdict === 'killed').length,
    survived: mutants.filter(verdict => verdict === 'survived').length,
    inconclusive: mutants.filter(verdict => verdict === 'inconclusive').length,
  }
}

/**
 * Corpus totals, in four disjoint buckets over the tasks that carry evidence.
 *
 * `unevidenced` is not a finding: a task with no log has not claimed anything,
 * so there is no trajectory to judge and it is outside the ratio entirely.
 */
export function measure(files, read = readFileSync) {
  const tasks = files.map(file => readTask(file, read))
  const totals = {
    tasks: tasks.length,
    unreadable: 0,
    unevidenced: 0,
    evidenced: 0,
    showsFailing: 0,
    outcomeOnly: 0,
    entries: 0,
    unjudgedEntries: 0,
    redEntries: 0,
    killed: 0,
    survived: 0,
    inconclusive: 0,
    outcomeOnlyFiles: [],
  }
  for (const task of tasks) {
    if (task.unreadable) { totals.unreadable += 1; continue }
    if (!task.entries && !task.killed) { totals.unevidenced += 1; continue }
    totals.evidenced += 1
    totals.entries += task.entries
    totals.unjudgedEntries += task.unjudged
    totals.redEntries += task.red
    totals.killed += task.killed
    totals.survived += task.survived
    totals.inconclusive += task.inconclusive
    if (task.red > 0 || task.killed > 0) totals.showsFailing += 1
    else {
      totals.outcomeOnly += 1
      totals.outcomeOnlyFiles.push(task.file)
    }
  }
  totals.rate = totals.evidenced ? totals.showsFailing / totals.evidenced : null
  return totals
}

export function render(totals, root, { unreadableDirs = [] } = {}) {
  // ⚠ COMPUTED BEFORE THE EARLY RETURNS, not appended after them. It used to be
  // pushed at the end, so the two cases that return early — no task files, and
  // none carrying evidence — dropped it entirely. Those are exactly the shapes an
  // unreadable root produces, so the one case PARTIAL exists for was the one case
  // that never said it.
  const partial = unreadableDirs.length
    ? [`  ⚠ PARTIAL: ${unreadableDirs.length} director(ies) under ${root} could not be read, so `
      + 'what is reported here is a subset of what is there — not the whole of it.']
    : []
  if (!totals.tasks) {
    return [`trajectory-metrics: no task files under ${root}. Nothing to measure, `
      + 'which is not a corpus that measures clean.', ...partial].join('\n')
  }
  if (!totals.evidenced) {
    return [`trajectory-metrics: ${totals.tasks} task file(s) under ${root}, none carrying evidence. `
      + 'No trajectory to report — not a rate of zero.', ...partial].join('\n')
  }
  const percent = (totals.rate * 100).toFixed(0)
  const lines = [
    `trajectory-metrics: ${totals.showsFailing} / ${totals.evidenced} evidenced task(s) show their `
      + `check COULD have failed here (${percent}%) — a red run, a killed mutant, or both.`,
    `  ${totals.redEntries} red of ${totals.entries} acceptance entries · ${totals.killed} killed `
      + `· ${totals.survived} survived · ${totals.inconclusive} inconclusive`,
    `  ${totals.outcomeOnly} evidenced task(s) show OUTCOME ONLY: no entry recorded a non-zero `
      + 'exit and no mutant was killed, so nothing there shows the fence can fail.',
  ]
  for (const file of totals.outcomeOnlyFiles.slice(0, 10)) lines.push(`    ${file}`)
  if (totals.outcomeOnlyFiles.length > 10) {
    lines.push(`    …and ${totals.outcomeOnlyFiles.length - 10} more`)
  }
  if (totals.unevidenced) {
    lines.push(`  ${totals.unevidenced} task(s) carry no evidence at all — outside the ratio: `
      + 'a task that has claimed nothing has no trajectory to judge.')
  }
  if (totals.unreadable) {
    lines.push(`  ${totals.unreadable} task(s) could not be read — in NEITHER half (ADR-005).`)
  }
  if (totals.unjudgedEntries) {
    lines.push(`  ⚠ ${totals.unjudgedEntries} acceptance entr(ies) are entry-shaped but carry no `
      + 'exit code this could read. They are counted in the entry total and in NEITHER red nor '
      + 'green, so a task holding only those reads as outcome-only without anything having passed.')
  }
  lines.push(...partial)
  lines.push('This reads and judges nothing. A task showing outcome only is a place to look, '
    + 'not a defect: the work may predate the rule, or the fence may be honestly hard to fail.')
  return lines.join('\n')
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write([
      'trajectory-metrics.mjs — does this corpus prove its checks CAN fail? (research gap 2)',
      '',
      'Usage: node trajectory-metrics.mjs <corpus-dir> [--json]',
      '',
      'An acceptance entry says the check passed. A red entry or a killed mutant says it',
      'could have failed here. This aggregates the second across a corpus, which the five',
      'per-record advisories in adr-lint never did. Exits 0 whatever it finds.',
      '',
    ].join('\n'))
    return 0
  }
  const root = argv.find(arg => !arg.startsWith('--')) ?? 'docs/adr'
  const unreadableDirs = []
  const totals = measure(taskFiles(root, unreadableDirs))
  process.stdout.write(argv.includes('--json')
    ? `${JSON.stringify({ ...totals, root, unreadableDirs }, null, 2)}\n`
    : `${render(totals, root, { unreadableDirs })}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}

export { main }
