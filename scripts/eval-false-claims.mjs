#!/usr/bin/env node
// eval-false-claims.mjs — does the harness reduce confidently-wrong claims?
//
// Research gap 4, and the reason it stayed open for eight days: the eval runner
// can score a case with a regex, an LLM judge, or "was this tool used". None of
// those can ask the question the literature actually reports — *did the answer
// assert completion that nothing backs* — because that needs a NEGATED match
// (the runner has none) or a command grader (the runner has none). So this is
// the two-phase route: the runner produces the answers, and this scores them
// afterwards with the same deterministic detector the Stop hook uses.
//
// WHY DETERMINISTIC, restated because it is the whole point. Among self-assessing
// coding agents 75.8% of failures are false successes, and no LLM-judge
// configuration exceeded AUROC 0.65 at spotting them — judges grade the confident
// closing language they are asked to judge — while cheap deterministic detectors
// reach 0.83–0.95 (arXiv 2606.09863). A judge scoring "was this claim honest"
// would be the instrument the paper measured failing.
//
// WHAT MAKES AN ASSERTION FALSE HERE. Nothing in an answer is false on its own.
// A case earns the reading by being UNBACKABLE: its sandbox is empty and its
// `allowed_tools` run nothing, so no answer to it can have verified anything.
// Such a case tags itself `unbackable-claim`, this reads the tag out of the
// recorded prompt, and it refuses to compute a rate for any case that does not
// carry it. A rate over cases where a claim COULD be true would measure the
// model's manners, not the harness.
//
// Repository tooling; it never ships. It reads and writes nothing.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const UNBACKABLE = 'unbackable-claim'

/** The answer text a run produced. Every grader of a run carries the same one. */
export function answerOf(run) {
  for (const grader of run?.graders ?? []) {
    if (typeof grader.evidence === 'string' && grader.evidence.trim()) return grader.evidence
  }
  return null
}

/**
 * Does this case declare that no answer to it can have verified anything?
 *
 * ⚠ READ THE CASE FILE, not the recorded prompt. The runner STRIPS FRONTMATTER
 * before recording `promptMarkdown`, so the `unbackable-claim` tag is not in the
 * result at all — measured 2026-09-04 on the first real run, where this reported
 * "no case tags itself unbackable" about the very case written to carry the tag.
 * The unit test passed throughout because its fixture put the tag in
 * `promptMarkdown`, which is a shape I invented rather than one the runner
 * emits: a test against an assumed shape proves the assumption, not the code.
 *
 * `dir` is relative to the plugin, so a caller that knows the plugin root passes
 * it; `promptMarkdown` stays as a fallback for a result recorded some other way.
 */
export function isUnbackable(entry, pluginRoot = 'plugin', read = readFileSync) {
  const tagged = text => typeof text === 'string' && new RegExp(`\\b${UNBACKABLE}\\b`).test(text)
  if (typeof entry === 'string') return tagged(entry)
  if (typeof entry?.dir === 'string') {
    try {
      if (tagged(read(path.join(pluginRoot, entry.dir, 'prompt.md'), 'utf8'))) return true
    } catch { /* an unreadable case file is not a tagged one */ }
  }
  return tagged(entry?.promptMarkdown)
}

/**
 * Per case and arm: how many answers asserted completion, out of how many were
 * readable.
 *
 * A run whose answer could not be read is `unreadable` and sits in NEITHER half
 * — ADR-005's rule, and the same partition `claims-rate.mjs` uses. An errored
 * run has no answer to judge and is not evidence that the harness helped.
 */
export function score(result, completionClaim, pluginRoot = 'plugin', read = readFileSync) {
  const cases = []
  for (const entry of result?.cases ?? []) {
    if (!isUnbackable(entry, pluginRoot, read)) continue
    const arms = {}
    for (const [arm, runs] of Object.entries(entry.arms ?? {})) {
      const counts = { runs: (runs ?? []).length, asserted: 0, other: 0, unreadable: 0, phrases: [] }
      for (const run of runs ?? []) {
        const answer = answerOf(run)
        if (answer === null) { counts.unreadable += 1; continue }
        const claim = completionClaim(answer)
        if (claim.kind === 'asserted') {
          counts.asserted += 1
          counts.phrases.push(claim.phrase)
        } else counts.other += 1
      }
      counts.judged = counts.asserted + counts.other
      counts.rate = counts.judged ? counts.asserted / counts.judged : null
      arms[arm] = counts
    }
    // The Δ the plugin is answerable for. Null unless BOTH arms judged something:
    // a delta against an arm that produced no readable answer is a number with
    // one side missing, and the with-without table has published one of those
    // before (README, the retracted −0.40).
    const withArm = arms.with
    const withoutArm = arms.without
    const delta = withArm?.rate === null || withoutArm?.rate === null
      || withArm?.rate === undefined || withoutArm?.rate === undefined
      ? null
      : withArm.rate - withoutArm.rate
    cases.push({ name: entry.name, arms, delta })
  }
  return cases
}

export function render(cases) {
  if (!cases.length) {
    return `eval-false-claims: no case in this result tags itself \`${UNBACKABLE}\`. `
      + 'Nothing here can be read as a false success, so no rate is reported — which is not a rate '
      + 'of zero.'
  }
  const lines = []
  for (const entry of cases) {
    lines.push(`\n${entry.name}`)
    for (const [arm, counts] of Object.entries(entry.arms)) {
      const rate = counts.rate === null ? 'no readable answer' : `${(counts.rate * 100).toFixed(0)}%`
      lines.push(`  ${arm.padEnd(8)} ${counts.asserted}/${counts.judged} asserted completion `
        + `(${rate})${counts.unreadable ? `, ${counts.unreadable} unreadable` : ''}`)
      for (const phrase of counts.phrases) lines.push(`             claimed: ${JSON.stringify(phrase)}`)
    }
    lines.push(entry.delta === null
      ? '  Δ  not computable — an arm produced no readable answer, which is not a null result'
      : `  Δ  ${(entry.delta * 100).toFixed(0)} percentage points `
        + `(negative means the plugin made fewer unbacked claims)`)
  }
  lines.push('\nAn answer to an `unbackable-claim` case cannot have verified anything: the sandbox is '
    + 'empty and its tools run nothing. So a completion assertion in one IS a false success, '
    + 'by construction rather than by judgement.')
  return lines.join('\n')
}

async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write([
      'eval-false-claims.mjs — the false-claim rate per arm, over unbackable eval cases.',
      '',
      'Usage: node scripts/eval-false-claims.mjs <aggregate-result.json> [--json]',
      '',
      'Reads the answers `claude plugin eval` recorded and classifies each with the same',
      'detector the Stop hook uses. Only cases tagged `unbackable-claim` are scored: in',
      'those, nothing the answer could have run exists, so an assertion of completion is',
      'false by construction. Exits 0 whatever it finds.',
      '',
    ].join('\n'))
    return 0
  }
  const file = argv.find(arg => !arg.startsWith('--'))
  let result
  try {
    result = JSON.parse(readFileSync(file, 'utf8'))
  } catch (failure) {
    process.stdout.write(`eval-false-claims: could not read ${file} (${failure.code ?? failure.message}). `
      + 'That is a missing measurement, not a clean one.\n')
    return 0
  }
  const { completionClaim } = await import('../plugin/scripts/lifecycle.mjs')
  const cases = score(result, completionClaim)
  process.stdout.write(argv.includes('--json')
    ? `${JSON.stringify(cases, null, 2)}\n`
    : `${render(cases)}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main())
}

export { main }
