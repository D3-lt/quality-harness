#!/usr/bin/env node
// What do THIS corpus's numbers look like, in a form you can paste somewhere?
//
// WHY THIS EXISTS, and it is a claim about the project rather than about your
// repository. This plugin's distinguishing claim is that `done` is a tool-written,
// digest-bound, mutation-backed log entry rather than a model's say-so. That claim
// has been exercised on essentially one corpus — this project's own — and a
// mechanism demonstrated once is a claim about a set of one. The pieces to answer
// it elsewhere already ship (`trajectory-metrics.mjs`, `claims-rate.mjs`,
// `adr-verify --sweep`); what was missing was one command that puts a corpus's
// numbers in front of its owner in a shape they can hand back.
//
// ⚠ READ-ONLY, AND IT NEVER RUNS YOUR FENCES. Re-checking a recorded claim means
// executing that task's own acceptance command, which in this repository has meant
// running a mutation campaign (BACKLOG §120). A reporting tool that quietly does
// that to somebody else's checkout is not a reporting tool. So the expensive half
// is NOT run here and is NOT guessed at: it is reported as UNRUN, in those words,
// with the command that would take it (CLAUDE.md §3, ADR-005).
//
//   node corpus-report.mjs [<corpus-dir>] [--json]

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { measure, taskFiles } from './trajectory-metrics.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** The shipped version, or null when the manifest cannot be read. */
export function pluginVersion(read = readFileSync) {
  try {
    return JSON.parse(read(path.join(here, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null
  } catch { return null }
}

/** Records are the `ADR-*.md` files beside the task directories. */
export function recordCount(root, readdir = readdirSync) {
  try {
    return readdir(root).filter(name => /^ADR-.*\.md$/.test(name)).length
  } catch { return null }
}

/**
 * A corpus's numbers, with the parts nobody measured left as null.
 *
 * ⚠ NULL IS NOT ZERO ANYWHERE HERE. A corpus directory that cannot be read has a
 * null record count, not a count of nothing, and the renderer says so — the same
 * distinction the gates make between a finding and a failure to look.
 */
export function collect(root, { read = readFileSync, readdir = readdirSync } = {}) {
  const unreadableDirs = []
  const files = taskFiles(root, unreadableDirs, readdir)
  return {
    root,
    version: pluginVersion(read),
    records: recordCount(root, readdir),
    unreadableDirs,
    totals: measure(files, read),
  }
}

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : 'n/a')

/** The paste-ready block. */
export function render(report) {
  const t = report.totals
  const lines = [
    `quality-harness corpus report${report.version ? ` · plugin ${report.version}` : ''}`,
    `corpus: ${report.root} · ${report.records === null ? 'records unreadable' : `${report.records} record(s)`}`
      + ` · ${t.tasks} task file(s)`,
    '',
    'DOES THIS CORPUS PROVE ITS CHECKS CAN FAIL?',
    `  evidenced tasks        ${t.evidenced} of ${t.tasks}  (a task claiming nothing is outside the ratio)`,
    `  ... shown able to fail ${t.showsFailing} (${pct(t.showsFailing, t.evidenced)})`
      + '  — a red acceptance entry, a killed mutant, or both',
    `  ... outcome only       ${t.outcomeOnly}  — passed, and nothing shows it could have done otherwise`,
    // ⚠ NO `?? 0` ON THESE. Writing `t.killed ?? 0` turns a RENAMED field into a
    // confident zero, and this file did exactly that on its first run: it printed
    // `killed 0 · survived 0` over a corpus holding 151 killed mutants, because the
    // keys were guessed rather than read. A missing field must read as missing.
    `  entries ${t.entries} · red ${t.redEntries} · killed ${t.killed}`
      + ` · survived ${t.survived} · inconclusive ${t.inconclusive}`,
  ]
  if (t.unreadable) lines.push(`  ⚠ ${t.unreadable} task file(s) could not be read — in neither half of the ratio.`)
  if (report.unreadableDirs.length) {
    lines.push(`  ⚠ ${report.unreadableDirs.length} directory(ies) could not be listed: `
      + `${report.unreadableDirs.slice(0, 3).join(', ')}`)
  }
  lines.push(
    '',
    'RECORDED CLAIMS RE-CHECKED LATER — UNRUN.',
    '  Nothing here re-ran anything. Re-checking a claim EXECUTES that task\'s own',
    '  acceptance command, and this tool will not do that to your checkout. To take',
    '  that measurement yourself:',
    '',
    `      adr-verify --sweep ${report.root}`,
    '',
    '  It reports four disjoint buckets — held, false, superseded, unrunnable — and',
    '  a zero in the false half means something only if the run happened.',
    '',
    'If you are willing to share these numbers, they are worth more than this project',
    'can produce alone: the mechanism has been exercised on almost one corpus, and',
    '"the only tool that does X" is a claim about a set of one until somebody else',
    'reports their buckets.',
  )
  return lines.join('\n')
}

/** Read, report, and return the exit code — always 0. This reports; it judges nothing. */
export function run(argv, { read = readFileSync, readdir = readdirSync, log = console.log, cwd = process.cwd() } = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    log('corpus-report.mjs — your corpus\'s numbers, in a form you can hand back.\n\n'
      + 'Usage: node corpus-report.mjs [<corpus-dir>] [--json]\n\n'
      + 'Read-only. It never runs a fence, and says so where a measurement was not taken.')
    return 0
  }
  const given = argv.find(arg => !arg.startsWith('--')) ?? 'docs/adr'
  // RELATIVE IN THE OUTPUT. This block is meant to be pasted somewhere public, and
  // an absolute path carries a home directory with it (CLAUDE.md §6).
  const shown = path.isAbsolute(given) ? (path.relative(cwd, given) || '.') : given
  const report = { ...collect(given, { read, readdir }), root: shown }
  log(argv.includes('--json') ? JSON.stringify(report, null, 2) : render(report))
  return 0
}

// `import.meta.url` is a URL and `process.argv[1]` is a PATH; a `file://${argv}`
// template never matches on Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)))
}
