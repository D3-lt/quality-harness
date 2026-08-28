#!/usr/bin/env node
// mutate.mjs — break the code on purpose and check the tests notice.
//
// docs/TEST-PLAN.md gives every row three fields: the assertion, the killing
// mutation, and the harness it lands in. The first and third live in the repo.
// This makes the second one executable, because a mutation that only ever
// appeared in a commit message is a claim, not a check.
//
// Two things learned running ~60 of these by hand, both of which are why this is
// a script rather than a habit:
//
//   * An interrupted run leaves the source mutated. It happened, and the working
//     tree carried a broken gate until it was noticed. The ON-DISK JOURNAL is
//     what protects you, and it is the only thing that does: this campaign is
//     one long SYNCHRONOUS loop, so Node never reaches the event loop and the
//     SIGINT and SIGTERM handlers below cannot run while it is working.
//     Measured 2026-08-27 — SIGTERM was sent twice and the run carried on
//     through several more mutations. The handlers are kept because they fire
//     if the process is ever idle; the guarantee is the file.
//   * A mutation can HANG rather than fail. Removing path_stack's relative_to
//     guard makes an upward walk never terminate, because Path("/").parent is
//     Path("/"). A hang is not a pass and not an ordinary failure — it gets its
//     own verdict.
//
// Usage:
//   node scripts/mutate.mjs                 run every mutation
//   node scripts/mutate.mjs --list          name them without running anything
//   node scripts/mutate.mjs --case <substring>
//
// Exit: 0 = every mutation was noticed
//       1 = a mutation left its suite GREEN, or no longer describes the code
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogue = JSON.parse(readFileSync(path.join(root, 'tests', 'mutations.json'), 'utf8'))

const timeoutMs = 180_000

// A mutation left applied is worse than a mutation not run.
//
// In-process handlers are not enough, and this script proved it on its own first
// run: something killed it hard, `process.on('exit')` never fired, and
// scripts/lifecycle.mjs sat mutated in the working tree until a later run
// reported the mutation STALE. SIGKILL runs no JavaScript.
//
// So the intent is written to disk BEFORE the source is touched, and any leftover
// is repaired at startup. A crash can lose the process; it cannot lose the file.
// Beside the lock: a run that owns its own lock owns its own journal, or the
// two campaigns repair each other's files.
const journalPath = process.env.QUALITY_HARNESS_MUTATE_LOCK
  ? `${process.env.QUALITY_HARNESS_MUTATE_LOCK}.inflight.json`
  : path.join(root, '.mutate-inflight.json')

function recover() {
  if (!existsSync(journalPath)) return
  const { file, original } = JSON.parse(readFileSync(journalPath, 'utf8'))
  writeFileSync(file, original)
  rmSync(journalPath, { force: true })
  process.stderr.write(`mutate: restored ${path.relative(root, file)} from an interrupted run\n`)
}

function begin(file, original) {
  writeFileSync(journalPath, JSON.stringify({ file, original }))
}

function finish(file, original) {
  writeFileSync(file, original)
  rmSync(journalPath, { force: true })
}

// One runner at a time, and never over an editor.
//
// This mutates real source and restores it from a journal. Two things break
// that, and both happened on 2026-08-26: a SECOND runner started while one was
// going, and — twice — a patch written while a run was in flight was silently
// rolled back by the restore. The work looked applied, the tests ran against the
// old code, and the only clue was a test failing for a reason that made no
// sense. A lock and a clean-tree check cost nothing next to that.
// The path is overridable so the suite can exercise these guards without
// colliding with a real campaign that may be running in the same checkout —
// which is exactly the collision the lock exists to prevent, and it made the
// dirty-tree guard untestable because the lock refused the inner run first.
const lockPath = process.env.QUALITY_HARNESS_MUTATE_LOCK || path.join(root, '.mutate-lock')

function claimTheRun() {
  if (existsSync(lockPath)) {
    const owner = readFileSync(lockPath, 'utf8').trim()
    let alive = true
    try { process.kill(Number(owner), 0) } catch { alive = false }
    if (alive) {
      process.stderr.write(`mutate: another run is in flight (pid ${owner}). `
        + 'Two runners restore each other\'s files and both report nonsense.\n')
      return false
    }
    // A dead owner left it behind; recover() has already repaired the source.
    rmSync(lockPath, { force: true })
  }
  writeFileSync(lockPath, String(process.pid))
  return true
}

function releaseTheRun() {
  try {
    if (readFileSync(lockPath, 'utf8').trim() === String(process.pid)) {
      rmSync(lockPath, { force: true })
    }
  } catch {}
}

/** Files this run will rewrite, so an edit in flight is refused rather than lost. */
function dirtyTargets(selected) {
  const targets = [...new Set(selected.map(mutation => mutation.file))]
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain', '--', ...targets],
    { encoding: 'utf8' })
  if (status.status !== 0) return []
  return status.stdout.split('\n').map(line => line.slice(3).trim()).filter(Boolean)
}


/**
 * The verdict for one catalogue entry, from what was actually observed.
 *
 * Pure so it can be asserted without spawning a campaign. Until ADR-006 this
 * logic lived inline in the loop and had no test of its own — the runner was
 * exercised only by another suite spawning it whole.
 *
 * `baselineOk` is whether the entry's named tests PASSED BEFORE the mutation was
 * applied. Without it a suite already failing for an unrelated reason returns a
 * nonzero exit on every entry that names it, and every one is counted RED —
 * noticed. Nothing was proved: the tests were broken to begin with.
 *
 * What a baseline does NOT prove is that the mutation was EXERCISED. A vacuous
 * assertion — one that could not have failed either way — still reports GREEN,
 * and that is correct here. Coverage was measured 2026-08-28 and cannot see that
 * case: 100% line and 100% branch, before and after, with the test passing and
 * the mechanism broken. See ADR-006.
 */
export function classify({ occurrences, baselineOk, run }) {
  if (occurrences !== 1) {
    // Decided off the tree, before anything is applied: the `from` no longer
    // describes the code, so there is no mutation to be right or wrong about.
    return { verdict: 'STALE', detail: `matches ${occurrences} times` }
  }
  const observed = (run.signal || run.status === null)
    ? 'HUNG'
    : run.status === 0 ? 'GREEN' : 'RED'
  if (!baselineOk) return { verdict: 'UNPROVEN', observed }
  return { verdict: observed, observed }
}

/**
 * The distinct test-sets a catalogue names, each with the entries that use it.
 *
 * One baseline per SET, not per mutation. Measured 2026-08-28: 204 mutations over
 * 13 distinct sets, so this costs 13 extra spawns — about 6% of a campaign, where
 * a baseline per mutation would roughly double it. Sorted, so two entries naming
 * the same files in a different order share one baseline.
 */
export function testSets(mutations) {
  const byKey = new Map()
  for (const mutation of mutations) {
    const tests = [...mutation.tests].sort()
    const key = tests.join('\0')
    if (!byKey.has(key)) byKey.set(key, { tests, mutations: [] })
    byKey.get(key).mutations.push(mutation)
  }
  return [...byKey.values()]
}

/** One report line. UNPROVEN names the failing set and what to do about it. */
export function renderLine(result, width) {
  const note = result.verdict === 'GREEN' ? '  <- the tests did not notice'
    : result.verdict === 'STALE' ? `  <- ${result.detail}`
    : result.verdict === 'HUNG' ? '  <- noticed, but by hanging rather than failing'
    // The verdict the tests produced stays visible beside the warning, and the
    // line says what to CHANGE rather than only what is wrong — the lesson
    // ADR-005 applied to spec-verify, one tool over.
    : result.verdict === 'UNPROVEN'
      ? `  <- ${result.observed}, but ${result.tests.join(', ')} already failed before this `
        + 'mutation was applied; repair that suite and re-run — nothing here is evidence yet'
      : ''
  return `${result.verdict.padEnd(8)} ${result.label.padEnd(width)}${note}`
}

/**
 * The campaign's counts. An UNPROVEN entry is in NEITHER half of the ratio:
 * counting it in the denominator would make a broken suite read as a campaign
 * with poor coverage, which is a different problem with a different fix.
 */
export function summarise(results) {
  const unproven = results.filter(r => r.verdict === 'UNPROVEN')
  const judged = results.filter(r => r.verdict !== 'UNPROVEN')
  const missed = judged.filter(r => r.verdict === 'GREEN' || r.verdict === 'STALE')
  return {
    total: judged.length,
    noticed: judged.length - missed.length,
    unproven: unproven.length,
    // Unchanged by ADR-006: GREEN and STALE fail the run. An UNPROVEN entry
    // instructs and does not block — a block leaves the user with no next move,
    // and the line above has just told them what theirs is.
    failing: missed.length > 0,
  }
}

export function main(argv) {
  // An unknown option used to be ignored in silence, and the run it produced
  // looked exactly like the run that was asked for. Measured 2026-08-27:
  // `--filter 'sync:'` — the flag is `--case` — selected nothing, so the filter
  // stayed null and all 181 mutations ran for twenty minutes while the caller
  // waited on three. Every gate in this project names the offending option.
  const KNOWN = new Set(['--case', '--list', '--force'])
  const unknown = argv.filter(argument => argument.startsWith('--') && !KNOWN.has(argument))
  if (unknown.length) {
    process.stderr.write(`mutate: unknown option: ${unknown[0]}\n`
      + 'usage: mutate.mjs [--case <substring of a label>] [--list] [--force]\n')
    return 2
  }
  const filter = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null
  const selected = catalogue.mutations.filter(m => !filter || m.label.includes(filter))

  if (argv.includes('--list')) {
    for (const m of selected) console.log(`${m.label}\n  ${m.file} -> ${m.tests.join(', ')}`)
    return 0
  }

  process.on('exit', () => { releaseTheRun() })
  process.on('SIGINT', () => { recover(); process.exit(130) })
  process.on('SIGTERM', () => { recover(); process.exit(143) })

  // The lock BEFORE the repair, not after. recover() restores whatever the
  // journal names, so a second invocation was un-mutating a live campaign's file
  // and deleting its journal — the outer run then measured an unmutated source
  // and reported the mutation unnoticed. Found on 2026-08-26 by a test that
  // spawns this runner: the guard it was written for could never fail, because
  // this ran first and quietly repaired the thing under test.
  if (!claimTheRun()) return 2
  recover()
  // AFTER the repair, not before. `--case` with no match used to exit here-ish
  // and leave a killed run's mutation applied — the same class of bug as
  // recover() running before claimTheRun(), which was fixed on 2026-08-26 as a
  // single instance. One early exit was fixed; the class was not audited.
  // Every path a campaign can take now repairs before it can refuse.
  if (selected.length === 0) {
    process.stderr.write(`no mutation matches ${filter}\n`)
    return 1
  }
  const dirty = dirtyTargets(selected)
  if (dirty.length && !argv.includes('--force')) {
    process.stderr.write(`mutate: ${dirty.join(', ')} ${dirty.length === 1 ? 'has' : 'have'} `
      + 'uncommitted changes, and this run rewrites and restores exactly those files — an edit '
      + 'made while it runs is silently rolled back. Commit or stash first, or pass --force if '
      + 'you accept losing them.\n')
    return 2
  }

  // The baselines FIRST, on an unmutated tree, before begin() has anything to
  // journal — so this adds no window in which a crash could leave the tree
  // broken (ADR-002). One spawn per distinct set, memoised by it.
  const sets = testSets(selected)
  const baselineOf = new Map()
  for (const set of sets) {
    // The same files and the same arguments as the mutated run below, or this
    // would be measuring a different thing than the one it licenses.
    const run = spawnSync(process.execPath,
      ['--test', ...set.tests.map(t => path.join(root, t))],
      { cwd: root, encoding: 'utf8', timeout: timeoutMs })
    baselineOf.set(set.tests.join('\0'), run.status === 0 && !run.signal)
  }

  const results = []
  for (const mutation of selected) {
    const file = path.join(root, mutation.file)
    const original = readFileSync(file, 'utf8')
    const occurrences = original.split(mutation.from).length - 1
    const baselineOk = baselineOf.get([...mutation.tests].sort().join('\0')) === true

    if (occurrences !== 1) {
      results.push({ ...mutation, ...classify({ occurrences, baselineOk, run: null }) })
      continue
    }

    begin(file, original)
    writeFileSync(file, original.replace(mutation.from, mutation.to))
    const run = spawnSync(process.execPath,
      ['--test', ...mutation.tests.map(t => path.join(root, t))],
      { cwd: root, encoding: 'utf8', timeout: timeoutMs })
    finish(file, original)

    results.push({ ...mutation, ...classify({ occurrences, baselineOk, run }) })
  }

  const width = Math.max(...results.map(r => r.label.length))
  for (const r of results) console.log(renderLine(r, width))

  const counts = summarise(results)
  console.log(`\n${counts.noticed}/${counts.total} mutations were noticed.`)
  if (counts.unproven) {
    console.log(`${counts.unproven} could not be judged: their tests were already failing before `
      + 'the mutation was applied, so neither verdict is evidence. Repair those suites and re-run.')
  }
  if (counts.failing) {
    console.log('A test that stays green with its mechanism broken is asserting something else.')
    return 1
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
