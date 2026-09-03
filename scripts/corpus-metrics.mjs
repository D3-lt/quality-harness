#!/usr/bin/env node
// Numbers about this corpus, derived from the corpus.
//
// Every figure here is read out of tracked files at the moment you run it. None
// is stored, because a stored count is wrong the moment anyone writes — the same
// reason this project refuses a list kept beside an artifact. Quote a number from
// here with the date you ran it, or re-run it.
//
// It READS and judges nothing. Exit 0 whatever it finds: a metric with a
// threshold becomes a gate, and this is not one.
//
// ⚠ WHAT IT CANNOT SEE, stated because a metrics script that lists only what it
// measured invites the reader to think that is everything:
//   - turns, tokens or wall-clock per implementation. Those live in the agent
//     transcript, which is not in this repository and is not derivable from it.
//   - whether the lifecycle CAUSED any of this. These are descriptive counts of
//     one corpus that used it, with no control. The with/without question is the
//     ablation evals' job (plugin/evals/), and their delta is the only number
//     here that has a baseline.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const git = (...args) =>
  execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' })

const tracked = pattern => git('ls-files', pattern).split('\n').filter(Boolean)

const read = rel => readFileSync(join(repoRoot, rel), 'utf8')

/** Every Verification Log entry line across every task file, parsed. */
export function verificationEntries(texts) {
  const ENTRY = /^- (\d{4}-\d\d-\d\d) · (\S+?)(\*?) · exit (\d+) ·.*?(?: · ms:(\d+))?$/gm
  const rows = []
  for (const text of texts) {
    for (const m of text.matchAll(ENTRY)) {
      rows.push({ date: m[1], dirty: m[3] === '*', exit: Number(m[4]), ms: m[5] ? Number(m[5]) : null })
    }
  }
  return rows
}

/** Mutation Log verdicts. `survived` is the interesting one: a test that did not notice. */
export function mutationVerdicts(texts) {
  const rows = []
  // Anchored to line start. Unanchored, this also matched the ADR prose that
  // QUOTES the row grammar while explaining it, which inflated the count by one
  // — a metric reading documentation about itself as data.
  for (const text of texts) {
    for (const m of text.matchAll(/^- \d{4}-\d\d-\d\d · \S+ · mutant (killed|survived) ·/gm)) rows.push(m[1])
  }
  return rows
}

/** A second, deliberately dumber count of the same two things.
 *
 * Both bugs this script shipped in its first draft were regexes that returned a
 * confident wrong number — a recursive git glob reading 103 records where there
 * are 25, and an unanchored pattern counting the prose that explains the row
 * grammar as a row. Neither could be noticed from the output alone.
 *
 * So the parse is counted twice, by different means, and a disagreement is
 * PRINTED rather than resolved. A metric that cannot be cross-checked is a
 * number you are asked to trust, which is the thing this project is against.
 */
export function crossCheck(texts) {
  let entries = 0
  let mutations = 0
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (!line.startsWith('- ')) continue
      if (!line.includes(' · exit ') && !line.includes(' · mutant ')) continue
      if (line.includes(' · mutant ')) mutations += 1
      else entries += 1
    }
  }
  return { entries, mutations }
}

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`)

function median(ns) {
  if (ns.length === 0) return null
  const s = [...ns].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function main() {
  const taskFiles = tracked('docs/adr/*/tasks/T*.md')
  const texts = taskFiles.map(read)
  const entries = verificationEntries(texts)
  const verdicts = mutationVerdicts(texts)

  const catalogue = JSON.parse(read('tests/mutations.json'))
  const mutants = Array.isArray(catalogue) ? catalogue : catalogue.mutations

  const green = entries.filter(e => e.exit === 0).length
  const red = entries.filter(e => e.exit !== 0).length
  const timed = entries.filter(e => e.ms !== null).map(e => e.ms)
  const survived = verdicts.filter(v => v === 'survived').length

  const out = []
  out.push(`corpus-metrics · ${new Date().toISOString().slice(0, 10)} · ${git('rev-parse', '--short', 'HEAD').trim()}`)
  out.push('')
  out.push('SIZE')
  // ⚠ `git ls-files 'docs/adr/*.md'` is RECURSIVE — git's pathspec glob crosses
  // directory boundaries, so it returned 103 (every task file too) where the
  // answer is 25. Caught by reading the output against a number I already knew;
  // nothing in the script could have noticed, which is why the check below exists.
  const records = tracked('docs/adr/*.md').filter(p => /^docs\/adr\/[^/]+\.md$/.test(p))
  out.push(`  decision records               ${records.length}`)
  out.push(`  executable task files          ${taskFiles.length}`)
  out.push(`  catalogued mutations           ${mutants.length}`)
  out.push('')
  out.push('WHAT THE EVIDENCE CHAIN RECORDED  (tool-written, never typed)')
  out.push(`  verification entries           ${entries.length}`)
  out.push(`    exit 0                       ${green}`)
  out.push(`    non-zero                     ${red}   ${pct(red, entries.length)}`)
  out.push(`    taken on a dirty tree        ${entries.filter(e => e.dirty).length}`)
  out.push('')
  out.push('  A non-zero entry is the TDD red run, which `adr-execute` step 2 tells')
  out.push('  the author to RECORD rather than discard. So this ratio is a compliance')
  out.push(`  figure about this corpus, and it is not flattering: ${red} recorded red runs`)
  out.push(`  across ${taskFiles.length} task files. Either the red run is being taken and not`)
  out.push('  recorded, or it is being skipped. The evidence chain cannot tell those')
  out.push('  apart — it only knows what was written down — and saying so is the point.')
  out.push('')
  out.push('WHAT THE MUTATION EVIDENCE FOUND')
  out.push(`  recorded verdicts              ${verdicts.length}`)
  out.push(`    killed                       ${verdicts.length - survived}`)
  out.push(`    SURVIVED                     ${survived}   ${pct(survived, verdicts.length)}`)
  out.push('')
  out.push('  Each survivor is a test that did not notice its own subject being')
  out.push('  broken — found by the tool, at authoring time, in a suite that was')
  out.push('  green throughout. That count is the point of the campaign, so it is')
  out.push('  reported rather than tidied away.')
  out.push('')
  out.push('FENCE COST  (what the lifecycle actually charges per task)')
  if (timed.length === 0) {
    out.push('  no entry carries an ms: field — nothing to report, and that is not zero cost')
  } else {
    out.push(`  entries carrying a duration    ${timed.length} of ${entries.length}   ${pct(timed.length, entries.length)}`)
    out.push(`    median                       ${median(timed)} ms`)
    out.push(`    slowest                      ${Math.max(...timed)} ms`)
    out.push('')
    out.push('  Entries predating ADR-020 carry no duration and cannot be backfilled:')
    out.push('  an invented ms is a tool-written field filled in by hand.')
  }
  out.push('')
  const second = crossCheck(texts)
  if (second.entries !== entries.length || second.mutations !== verdicts.length) {
    out.push('⚠ THE TWO COUNTS DISAGREE — trust neither until you know why')
    out.push(`  verification entries   regex ${entries.length}   line-scan ${second.entries}`)
    out.push(`  mutation verdicts      regex ${verdicts.length}   line-scan ${second.mutations}`)
    out.push('')
  }
  out.push('NOT MEASURED HERE')
  out.push('  turns / tokens / wall-clock per implementation — not in this repository')
  out.push('  whether any of this was CAUSED by the lifecycle — no control arm.')
  out.push('  The with/without question belongs to plugin/evals/, whose ablation')
  out.push('  delta is the only figure in this project that has a baseline.')

  console.log(out.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
