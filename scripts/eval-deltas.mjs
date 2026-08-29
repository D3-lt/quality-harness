#!/usr/bin/env node
// eval-deltas.mjs — what the recorded eval runs can and cannot tell you.
//
// The suite's own README says the Δ against a no-plugin baseline "is the only
// number worth quoting". This derives that number from the recorded results and,
// more importantly, refuses to derive it where it cannot honestly be derived.
//
// Two rules it exists to enforce, both learned by breaking them here on
// 2026-08-29 (docs/BACKLOG.md §35, §36):
//
//   1. A Δ is only a Δ WITHIN ONE INVOCATION. Pooling a with-arm from one run
//      against a baseline from another manufactures a comparison no experiment
//      performed — the arms saw different case text, a different plugin version
//      and a different day. The first table this session printed did exactly
//      that and produced a confident +0.93 for a paragraph measured at 0.00.
//
//   2. A single run is not a measurement when the case is bimodal. Several cases
//      here score 0.00 and 1.00 on identical inputs in the same hour, so one
//      run's Δ carries the whole range and quoting it is quoting noise.
//
// It reads, judges nothing, and exits 0 whatever it finds. The results directory
// is gitignored on purpose, so "no results on this machine" is a first-class
// answer and never "no effect" — a report whose absence reads as a finding is
// the exact failure this repository documents under ADR-005.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** Every aggregate-result.json under a results tree, newest last. */
export function resultFiles(root) {
  const found = []
  const walk = (dir, depth) => {
    if (depth > 6) return
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.name === 'aggregate-result.json') found.push(full)
    }
  }
  walk(root, 0)
  return found.sort()
}

const mean = values => values.reduce((total, value) => total + value, 0) / values.length

/**
 * True when this run never reached an answer, so its score is not an observation.
 *
 * Measured 2026-08-29 over the 148 recorded runs in this corpus: 35 carry an
 * `error`, and 32 of those are turn exhaustion — the harness reports it as a bare
 * `exit 1: (no stderr)` and the run's `turns` is exactly its own `maxTurns + 1`.
 * Their scores were entering arm means as 0.00, which is what made
 * `gates-advise-never-block` look bimodal: at ONE fixed configuration (maxTurns 8,
 * `--ablation with-without`, n=26) all 15 finished runs scored 1.00 and all 11
 * exhausted runs scored 0.00. The graders were right — a transcript that never
 * answers should fail a grader of the answer. The defect is one level up: a
 * truncated run is UNRUN, and counting it as a zero reports an observation nobody
 * made (ADR-005, CLAUDE.md §3).
 */
export function neverReachedAnAnswer(run) {
  return Boolean(run?.error)
}

/**
 * Whether an unfinished run ran out of turns rather than failing some other way.
 *
 * Named separately from `neverReachedAnAnswer` because the remedy differs: a
 * ceiling is raised in the case's own `max_turns`, while an interruption or a
 * timeout says nothing about the case at all. `maxTurns` is per-case in the
 * report, so a corpus mixing ceilings is still classified run by run.
 */
export function ranOutOfTurns(run, maxTurns) {
  return neverReachedAnAnswer(run)
    && typeof maxTurns === 'number' && typeof run?.turns === 'number'
    && run.turns >= maxTurns
}

/**
 * One row per (invocation, case): the arms that invocation actually ran.
 *
 * `delta` is null when the invocation ran no baseline — which is what
 * `--ablation none` does, and what most of this corpus's recorded runs used. A
 * null here means "this run cannot answer", never "this run measured nothing".
 */
export function observations(files) {
  const rows = []
  for (const file of files) {
    let report
    try { report = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    const invocation = path.basename(path.dirname(file))
    for (const entry of report.cases ?? []) {
      const armRuns = arm => (entry.arms?.[arm] ?? [])
      // Finished runs only. An errored run's score is a number the report happens
      // to carry, not a measurement of the behaviour under test.
      const scores = arm => armRuns(arm)
        .filter(run => !neverReachedAnAnswer(run))
        .map(run => run?.score)
        .filter(score => typeof score === 'number')
      const unfinished = arm => armRuns(arm).filter(neverReachedAnAnswer)
      const withArm = scores('with')
      const baseline = scores('without')
      const dropped = [...unfinished('with'), ...unfinished('without')]
      const recorded = armRuns('with').length + armRuns('without').length
      if (!recorded) continue
      rows.push({
        invocation,
        case: entry.name,
        withArm,
        baseline,
        recorded,
        dropped: dropped.length,
        ceiling: dropped.filter(run => ranOutOfTurns(run, entry.maxTurns)).length,
        // Within one invocation only. This is the whole point of the file.
        delta: withArm.length && baseline.length
          ? mean(withArm) - mean(baseline)
          : null,
      })
    }
  }
  return rows
}

/**
 * What each case's rows support, and what they do not.
 *
 * `spread` is over the with-arm means of separate invocations of the SAME case.
 * A case whose spread approaches the full range is not measuring the thing its
 * name claims; it is measuring the run. §31 and §34 are two earlier instances of
 * this in the same repository, and CLAUDE.md's own rule is that a verdict which
 * changes its mind teaches re-running rather than fixing.
 */
export const BIMODAL_SPREAD = 0.5

export function verdicts(rows) {
  const byCase = new Map()
  for (const row of rows) {
    if (!byCase.has(row.case)) byCase.set(row.case, [])
    byCase.get(row.case).push(row)
  }
  const out = []
  for (const [name, entries] of [...byCase].sort()) {
    const paired = entries.filter(entry => entry.delta !== null)
    const withMeans = entries.filter(entry => entry.withArm.length).map(entry => mean(entry.withArm))
    const spread = withMeans.length > 1 ? Math.max(...withMeans) - Math.min(...withMeans) : 0
    const runs = paired.reduce((total, entry) => total + entry.withArm.length, 0)
    const notes = []
    if (!paired.length) {
      notes.push('NO BASELINE — every recorded invocation ran with-only, so no Δ exists')
    } else if (paired.every(entry => entry.withArm.length === 1 && entry.baseline.length === 1)) {
      notes.push('SINGLE-RUN ARMS — each Δ is one run against one run')
    }
    if (spread >= BIMODAL_SPREAD) {
      notes.push(`BIMODAL — the with-arm alone spans ${spread.toFixed(2)} across invocations`)
    }
    const recorded = entries.reduce((total, entry) => total + entry.recorded, 0)
    const dropped = entries.reduce((total, entry) => total + entry.dropped, 0)
    const ceiling = entries.reduce((total, entry) => total + entry.ceiling, 0)
    if (dropped) {
      // Reported, never silently absorbed: a case whose runs mostly die at the
      // ceiling has not been measured, and the count is the reader's only sign.
      notes.push(`UNFINISHED — ${dropped} of ${recorded} recorded run(s) reached no answer`
        + `${ceiling ? ` (${ceiling} ran out of turns)` : ''} and are excluded, not scored 0`)
    }
    out.push({
      case: name,
      invocations: entries.length,
      pairedInvocations: paired.length,
      pairedRuns: runs,
      recordedRuns: recorded,
      unfinishedRuns: dropped,
      ranOutOfTurns: ceiling,
      deltas: paired.map(entry => Number(entry.delta.toFixed(2))),
      spread: Number(spread.toFixed(2)),
      notes,
    })
  }
  return out
}

export function main(argv = [], cwd = process.cwd()) {
  const unknown = argv.filter(a => a.startsWith('--') && a !== '--json')
  if (unknown.length) {
    process.stderr.write(`unknown option: ${unknown[0]}\n`
      + 'usage: eval-deltas.mjs [--json] [<results dir>]\n')
    return 2
  }
  const asJson = argv.includes('--json')
  const given = argv.find(a => !a.startsWith('--'))
  // `plugin/evals`, not `plugin/evals/results`: the suite writes into TWO trees —
  // that one and `plugin/evals/generated/cases/results` — and defaulting to the
  // first silently dropped 7 of 25 recorded invocations, five of them PAIRED
  // invocations of `adr-against-a-real-corpus`. Found 2026-08-29 by a review that
  // compared the tool's count against the ad-hoc glob it replaced. A reader would
  // have seen a smaller corpus and no sign that anything was missing, which is
  // the same shape as a filter that matched nothing reporting "absent".
  const root = given ? path.resolve(cwd, given) : path.join(cwd, 'plugin', 'evals')

  // COULD NOT LOOK, and it says so. The results tree is gitignored, so a fresh
  // checkout has none — and "no results here" must never render as "no effect".
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    const message = `No results directory at ${path.relative(cwd, root) || root}. `
      + 'This is "I could not look", not "the guidance had no effect" — eval results are '
      + 'gitignored, so a fresh checkout has none. Run the suite first:\n'
      + '  CLAUDE_CODE_WALNUT_SPIRE=1 claude plugin eval --runs 1 --allow-tools Bash .\n'
    process.stdout.write(asJson ? JSON.stringify({ read: null, cases: [] }, null, 2) + '\n' : message)
    return 0
  }

  const files = resultFiles(root)
  const rows = observations(files)
  const report = verdicts(rows)

  if (asJson) {
    process.stdout.write(JSON.stringify({ read: files.length, cases: report }, null, 2) + '\n')
    return 0
  }

  if (!files.length) {
    process.stdout.write(`${root} holds no aggregate-result.json — nothing to read.\n`)
    return 0
  }
  process.stdout.write(`${files.length} recorded invocation(s), ${report.length} case(s).\n\n`)
  process.stdout.write('Δ against the no-plugin baseline, WITHIN each invocation.\n'
    + 'A case is listed once per invocation that ran both arms; runs are never pooled\n'
    + 'across invocations, because arms from different runs saw different case text.\n\n')
  for (const entry of report) {
    const deltas = entry.deltas.length
      ? entry.deltas.map(d => (d >= 0 ? `+${d.toFixed(2)}` : d.toFixed(2))).join('  ')
      : '—'
    process.stdout.write(`  ${entry.case}\n`)
    process.stdout.write(`      invocations ${entry.invocations}, of which paired ${entry.pairedInvocations}`
      + ` (${entry.pairedRuns} run(s) in the with-arm)\n`)
    process.stdout.write(`      Δ per invocation: ${deltas}\n`)
    for (const note of entry.notes) process.stdout.write(`      ${note}\n`)
  }
  const shaky = report.filter(entry => entry.notes.length)
  if (shaky.length) {
    process.stdout.write('\nWhat these numbers will not support:\n')
    process.stdout.write(`  ${shaky.length} of ${report.length} case(s) carry a caveat above. A Δ from a\n`
      + '  single-run pair, or from a case whose with-arm alone swings across invocations,\n'
      + '  is not evidence that an instruction is inert — it is evidence the case cannot\n'
      + '  currently tell inert from noisy. Raise runs per arm before quoting one.\n')
  }
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
