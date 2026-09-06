#!/usr/bin/env node
// What do THIS corpus's numbers look like, in a form you can paste somewhere?
//
// WHY THIS EXISTS, and it is a claim about the project rather than about your
// repository. This plugin's distinguishing claim is that `done` is a tool-written,
// digest-bound, mutation-backed log entry rather than a model's say-so. That claim
// has been exercised on essentially one corpus — this project's own — and a
// mechanism demonstrated once is a claim about a set of one. The pieces to answer
// it elsewhere already ship (`trajectory-metrics.mjs`, `adr-verify --sweep`); what
// was missing was one command that puts a corpus's numbers in front of its owner in
// a shape they can hand back.
//
// ⚠ READ-ONLY, AND IT NEVER RUNS YOUR FENCES. Re-checking a recorded claim means
// executing that task's own acceptance command, which in this repository has meant
// running a mutation campaign (BACKLOG §120). A reporting tool that quietly does
// that to somebody else's checkout is not a reporting tool. So the expensive half
// is NOT run here and is NOT guessed at: it is reported as UNRUN, in those words,
// with the command that would take it (CLAUDE.md §3, ADR-005).
//
// ⚠ EVERY PATH THAT LEAVES THIS FILE IS SANITISED, and §6 is a hard requirement
// here rather than an incidental one: this output is DESIGNED to be posted in
// public. A first version rewrote only the corpus root and shipped absolute paths
// anyway — through `unreadableDirs`, and through `outcomeOnlyFiles` in `--json`. A
// reviewer reproduced a rendered `../../home/alice/...`, which names a person.
// Nothing path-shaped is printed now except relative to the corpus, and anything
// escaping it becomes a placeholder rather than a path.
//
//   node corpus-report.mjs [<corpus-dir>] [--json]

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { measure, taskFiles } from './trajectory-metrics.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

export const OUTSIDE = '<outside the corpus>'

/**
 * A path safe to publish: relative to `base`, forward slashes, or a placeholder.
 *
 * ⚠ THE PLACEHOLDER IS THE POINT. A path escaping `base` cannot be shown relatively
 * without walking up through directories that name a person, and a different drive
 * letter or UNC share cannot be relativised at all — `path.win32.relative` hands
 * back the original absolute path. Those cases lose the PATH rather than the
 * anonymity. `flavour` is the platform seam (CLAUDE.md §7), so the Windows arm is
 * reachable from any host.
 */
export function publicPath(target, base, flavour = path) {
  if (typeof target !== 'string' || !target) return OUTSIDE
  let rel
  try { rel = flavour.relative(base, target) } catch { return OUTSIDE }
  if (!rel) return '.'
  if (flavour.isAbsolute(rel)) return OUTSIDE
  if (rel.split(/[\\/]/)[0] === '..') return OUTSIDE
  return rel.split(/[\\/]/).join('/')
}

/** The shipped version, or null when the manifest cannot be read. */
export function pluginVersion(read = readFileSync) {
  try {
    return JSON.parse(read(path.join(here, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null
  } catch { return null }
}

/**
 * How many `ADR-*.md` FILES the corpus root holds, or null when it cannot be read.
 *
 * `withFileTypes`, because a DIRECTORY named `ADR-something.md` is not a record and
 * a name-only match counted one.
 */
export function recordCount(root, readdir = readdirSync) {
  try {
    return readdir(root, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^ADR-.*\.md$/.test(entry.name)).length
  } catch { return null }
}

/**
 * A corpus's numbers, with everything nobody measured left NULL rather than zero.
 *
 * ⚠ AN UNREADABLE ROOT HAS NO TOTALS AT ALL. The first version walked an unlistable
 * directory, found no files, and published a complete set of confident zeros — zero
 * entries, zero red, zero killed — none of which anyone measured. `taskFiles` puts
 * the root itself into the unreadable sink when it cannot list it, which is exactly
 * the signal needed to say UNRUN instead (ADR-005).
 */
export function collect(root, { read = readFileSync, readdir = readdirSync } = {}) {
  const unreadableDirs = []
  const files = taskFiles(root, unreadableDirs, readdir)
  const rootUnreadable = unreadableDirs.includes(root)
  const totals = rootUnreadable ? null : measure(files, read)
  return {
    version: pluginVersion(read),
    records: recordCount(root, readdir),
    rootUnreadable,
    // Sanitised at the boundary, so no caller can publish one by accident.
    unreadableDirs: unreadableDirs.filter(dir => dir !== root).map(dir => publicPath(dir, root)),
    totals: totals && { ...totals, outcomeOnlyFiles: totals.outcomeOnlyFiles.map(f => publicPath(f, root)) },
  }
}

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : 'n/a')

/** A corpus path as an argument someone can paste into a shell. */
export function asArgument(shown) {
  return /^[A-Za-z0-9._/-]+$/.test(shown) ? shown : `'${shown.replace(/'/g, "'\\''")}'`
}

/** The paste-ready block. */
export function render(report) {
  const t = report.totals
  const lines = [
    `quality-harness corpus report${report.version ? ` · plugin ${report.version}` : ''}`,
    `corpus: ${report.root} · ${report.records === null ? 'records unreadable' : `${report.records} record(s)`}`
      + ` · ${t === null ? 'task files UNRUN' : `${t.tasks} task file(s)`}`,
    '',
    'DOES THIS CORPUS PROVE ITS CHECKS CAN FAIL?',
  ]
  if (t === null) {
    lines.push('  UNRUN — the corpus directory could not be listed, so nothing was counted.',
      '  This is not a corpus with no tasks; it is one nobody could look inside (ADR-005).')
  } else {
    lines.push(
      `  evidenced tasks        ${t.evidenced} of ${t.tasks}  (a task claiming nothing is outside the ratio)`,
      `  ... shown able to fail ${t.showsFailing} (${pct(t.showsFailing, t.evidenced)})`
        + '  — a red acceptance entry, a killed mutant, or both',
      // ⚠ NOT "passed". An entry-shaped row whose exit code could not be read is
      // counted in the entry total and in NEITHER half, so a task holding only
      // those lands here having passed nothing. The tool this composes warns about
      // it; the first version of this renderer dropped that warning and published
      // `outcome only 1 — passed` over a row nobody could judge.
      `  ... outcome only       ${t.outcomeOnly}  — nothing shows the check could have failed here`,
      // ⚠ NO `?? 0` ON THESE. A `??` turns a renamed or absent field into a
      // confident number, and this file printed `killed 0` over 151 killed mutants
      // on its first run for exactly that reason.
      `  entries ${t.entries} · red ${t.redEntries} · killed ${t.killed}`
        + ` · survived ${t.survived} · inconclusive ${t.inconclusive}`,
    )
    if (t.unjudgedEntries) {
      lines.push(`  ⚠ ${t.unjudgedEntries} entr(ies) are entry-shaped and carry no exit code this could`,
        '    read. They are in NEITHER red nor green, so a task holding only those reads',
        '    as outcome-only without anything having passed.')
    }
    if (t.unreadable) lines.push(`  ⚠ ${t.unreadable} task file(s) could not be read — in neither half of the ratio.`)
  }
  if (report.unreadableDirs.length) {
    lines.push(`  ⚠ ${report.unreadableDirs.length} directory(ies) could not be listed: `
      + `${report.unreadableDirs.slice(0, 3).join(', ')} — PARTIAL, not clean.`)
  }
  lines.push(
    '',
    'RECORDED CLAIMS RE-CHECKED LATER — UNRUN.',
    '  Nothing here re-ran anything. Re-checking a claim EXECUTES that task\'s own',
    '  acceptance command, and this tool will not do that to your checkout. To take',
    '  that measurement yourself:',
    '',
    `      adr-verify --sweep ${asArgument(report.root)}`,
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
  // The root is published relative to the WORKING DIRECTORY; one escaping it becomes
  // a placeholder, because walking up out of a checkout spells a home directory and
  // a username (CLAUDE.md §6).
  const report = { ...collect(given, { read, readdir }), root: publicPath(path.resolve(cwd, given), cwd) }
  log(argv.includes('--json') ? JSON.stringify(report, null, 2) : render(report))
  return 0
}

// `import.meta.url` is a URL and `process.argv[1]` is a PATH; a `file://${argv}`
// template never matches on Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)))
}
