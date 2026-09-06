#!/usr/bin/env node
// Which tests in a run were far slower than the rest of that same run?
// BACKLOG §144.
//
// THE DEFECT THIS ANSWERS. A test that takes 19 s and the same test taking 232 s
// are both a green tick. The suite says nothing until a duration crosses a cap,
// and then it reports a FAILURE — which is what a correctness defect looks like.
// On 2026-09-06 one test moved between 19 s and 242 s across a single session on
// an unchanged machine, and the run that hit its cap read as "my change broke
// arch-lint". Only the earlier logs settled it. The per-test milliseconds were in
// the output the whole time and nothing read them.
//
// ⚠ NO STORED BASELINE, DELIBERATELY. A checked-in table of expected durations is
// a list kept beside the artifact: right on the day it is written, silently wrong
// after any machine, runner or suite change, with nothing to report the drift —
// the defect BACKLOG §106 named when it made the campaign's shard costs come from
// the campaign's own last run instead of a table. So the comparison here is
// WITHIN ONE RUN: every test is measured against the median of the same run. A
// loaded machine moves the median with the outliers, which is exactly the
// property that makes the answer portable across machines and CI runners without
// anything to maintain.
//
// ⚠ AND IT IS A RATIO, NOT A VERDICT. Being slower than your peers is not a
// defect — some tests spawn a gate twelve times and are honestly slow. This
// reports a PLACE TO LOOK, blocks nothing, and exits 0 whatever it finds
// (CLAUDE.md §3). What it is really for is the SECOND run: the same test at 40x
// today and 3x yesterday is the signal, and neither number alone is.
//
// Repository-owned, like scripts/selftest.sh: it reads tests/ output and never
// ships.
//
//   QUALITY_HARNESS_TAP=run.tap bash scripts/selftest.sh
//   node scripts/slow-tests.mjs run.tap [--ratio 20] [--top 15] [--json]

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Every `ok`/`not ok` line paired with the `duration_ms` that follows it.
 *
 * TAP puts the duration in the YAML block AFTER its assertion line, so the name
 * is remembered and closed by the next duration seen. Nested subtests indent, and
 * the indentation is kept in the name so a `> ` prefix does not collide with a
 * top-level test of the same name.
 */
export function parseTap(text) {
  const tests = []
  let pending = null
  for (const line of text.split(/\r?\n/)) {
    const assertion = /^(\s*)(not ok|ok)\s+\d+\s+-\s+(.*?)\s*$/.exec(line)
    if (assertion) {
      pending = { name: assertion[3], depth: assertion[1].length / 4, ok: assertion[2] === 'ok' }
      continue
    }
    const duration = /^\s*duration_ms:\s*([\d.]+)\s*$/.exec(line)
    if (duration && pending) {
      tests.push({ ...pending, ms: Number(duration[1]) })
      pending = null
    }
  }
  return tests
}

/** The middle value, or null for an empty run — never 0, which would divide badly. */
export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The outliers of one run, with the ratio each is at.
 *
 * ⚠ ONLY LEAF TESTS COUNT TOWARD THE MEDIAN. A suite's own line carries the sum
 * of its children, so including those pulls the median up by roughly the branching
 * factor and hides the very outliers this is for.
 */
export function outliers(tests, { ratio = 20 } = {}) {
  const leaves = tests.filter(t => t.depth === 0)
  const mid = median(leaves.map(t => t.ms))
  // A median of 0 means most tests were too fast to time; a ratio against it is
  // infinity for everything, which is noise rather than a finding (ADR-005).
  if (mid === null || mid <= 0) return { median: mid, unusable: true, found: [] }
  const found = leaves
    .map(t => ({ ...t, ratio: t.ms / mid }))
    .filter(t => t.ratio >= ratio)
    .sort((a, b) => b.ms - a.ms)
  return { median: mid, unusable: false, found, counted: leaves.length }
}

/** Read, report, and return the process exit code — which is always 0. */
export function run(argv, { read = readFileSync, log = console.log } = {}) {
  const file = argv.find(a => !a.startsWith('--'))
  const numeric = (flag, fallback) => {
    const at = argv.indexOf(flag)
    if (at === -1) return fallback
    const value = Number(argv[at + 1])
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
  if (!file) {
    log('usage: slow-tests.mjs <run.tap> [--ratio 20] [--top 15] [--json]')
    log('  produce the TAP with: QUALITY_HARNESS_TAP=run.tap bash scripts/selftest.sh')
    return 0
  }

  let text
  // UNRUN, in those words. An unreadable transcript is not a fast suite
  // (CLAUDE.md §3, ADR-005), and this is the arm a caller in CI actually hits
  // when the upload it expected did not happen.
  try { text = read(file, 'utf8') } catch (error) {
    log(`UNRUN — could not read ${file}: ${error.code ?? error.message}. Nothing was measured.`)
    return 0
  }

  const tests = parseTap(text)
  if (!tests.length) {
    log(`UNRUN — ${file} carries no timed tests. Nothing was measured.`)
    return 0
  }

  const result = outliers(tests, { ratio: numeric('--ratio', 20) })
  if (result.unusable) {
    log(`UNRUN — the median of ${tests.length} test(s) is ${result.median}ms, `
      + 'so a ratio against it says nothing. Nothing was measured.')
    return 0
  }

  const top = numeric('--top', 15)
  const shown = result.found.slice(0, top)
  if (argv.includes('--json')) {
    log(JSON.stringify({ median_ms: result.median, counted: result.counted, outliers: shown }, null, 2))
    return 0
  }

  log(`median ${result.median.toFixed(1)}ms over ${result.counted} top-level test(s).`)
  if (!shown.length) {
    log('No test was far slower than its peers in this run.')
  } else {
    for (const t of shown) log(`  ${t.ms.toFixed(0).padStart(8)}ms  ${t.ratio.toFixed(0).padStart(4)}x  ${t.name}`)
    if (result.found.length > shown.length) log(`  … and ${result.found.length - shown.length} more`)
  }
  log('\nA ratio is a PLACE TO LOOK, never a verdict: some tests spawn a gate a dozen times and are'
    + '\nhonestly slow. What this is for is the comparison BETWEEN runs — the same test at 40x today'
    + '\nand 3x yesterday is the signal, and neither number alone is (BACKLOG §144).')
  return 0
}

// `import.meta.url` is a URL and `process.argv[1]` is a PATH; a `file://${argv}`
// template never matches on Windows (tests/package.test.mjs sweeps for it).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)))
}
