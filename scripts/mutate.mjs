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
import { createHash } from 'node:crypto'
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
/**
 * What one unmutated baseline run proved, and why.
 *
 * `false` was not enough. A `spawnSync` that times out returns
 * `{ status: null, signal: 'SIGTERM' }` — no test verdict at all — and storing
 * that as "did not pass" made the report say the suite had ALREADY FAILED and
 * tell the reader to repair it. Nothing failed; nothing ran. Found 2026-08-28
 * by an independent review, in the code written that morning to remove exactly
 * this class from the mutated run. The baseline had inherited the defect it was
 * introduced to fix.
 */
export function baselineOf(run) {
  if (run.signal || run.status === null) return { state: 'unrun', why: run.signal || 'no exit status' }
  return run.status === 0 ? { state: 'pass' } : { state: 'fail' }
}

export function classify({ occurrences, baseline, run }) {
  if (occurrences !== 1) {
    // Decided off the tree, before anything is applied: the `from` no longer
    // describes the code, so there is no mutation to be right or wrong about.
    return { verdict: 'STALE', detail: `matches ${occurrences} times` }
  }
  const observed = (run.signal || run.status === null)
    ? 'HUNG'
    : run.status === 0 ? 'GREEN' : 'RED'
  if (baseline.state !== 'pass') return { verdict: 'UNPROVEN', observed, baseline }
  return { verdict: observed, observed, baseline }
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

/**
 * The test names that failed in a mutated run, read from the reporter's own
 * "failing tests" block.
 *
 * A RED verdict says the suite noticed; it never said WHAT noticed, because the
 * campaign reads an exit status and discards the output. So a mutant killed by
 * an unrelated assertion in the same file — or by a second guard in a caller,
 * which happened in this repository once (CLAUDE.md §4) — is indistinguishable
 * from one killed by the assertion it claims to prove. The names were already in
 * the captured stdout; keeping them costs nothing.
 *
 * REPORTS, never judges. Whether the name that fired is the RIGHT one is a
 * maintainer's read: the catalogue names test FILES, not test names, so a gate
 * deciding this would be asserting a mapping nobody has written down. Raised
 * 2026-08-29 by the agentsmemory session, whose campaigns share the blind spot.
 */
export function killedBy(stdout) {
  if (!stdout) return []
  const block = stdout.split('failing tests:')[1]
  if (!block) return []
  // The reporter prints "✖ <name> (1.2ms)" per failure. A file-level failure
  // repeats the file's own path with no subtest — BACKLOG §49's shape — and is
  // dropped here rather than reported as an assertion name it is not.
  //
  // THE DISCRIMINATOR IS "LOOKS LIKE A PATH", NOT "CONTAINS A SEPARATOR". The
  // first version dropped anything holding `/`, which took three real assertion
  // names with it — `a bin/ gate is spawned…`, `a docs/adr that yields nothing
  // says so`, `a directory in bin/ is not a gate…` — and four mutants were
  // reported killed by nobody while a correctly-named test had killed them
  // (BACKLOG §53, measured 2026-09-01 over the full campaign).
  //
  // A path the reporter prints has no whitespace in it; a test name in this
  // suite always does. Requiring BOTH — no whitespace AND a source extension —
  // keeps §49's row out without eating names that merely mention a directory.
  return [...block.matchAll(/^\s*\u2716 (.+?) \(\d[\d.]*ms\)\s*$/gm)]
    .map(m => m[1])
    .filter(name => !(/^\S+$/.test(name) && /\.(mjs|js|py|cjs)$/.test(name)))
}

/** One report line. UNPROVEN names the failing set and what to do about it. */
export function renderLine(result, width) {
  const note = result.verdict === 'GREEN' ? '  <- the tests did not notice'
    : result.verdict === 'STALE' ? `  <- ${result.detail}`
    : result.verdict === 'HUNG' ? '  <- noticed, but by hanging rather than failing'
    // A kill names its killer where the reporter gave one. Silence when it did
    // not: an empty list is "the names were not recoverable", never a claim that
    // nothing fired.
    // ONE PER LINE, not comma-joined. 138 of this suite's 462 test names contain
    // `, ` themselves, so a joined list cannot be separated back into names —
    // and two figures were computed from one before anybody checked (§53).
    : result.verdict === 'RED' && result.killers?.length
      ? `  <- killed by:\n${result.killers.map(k => `       ${k}`).join('\n')}`
    // The verdict the tests produced stays visible beside the warning, and the
    // line says what to CHANGE rather than only what is wrong — the lesson
    // ADR-005 applied to spec-verify, one tool over.
    : result.verdict === 'UNPROVEN'
      // Two different things, and saying the same words about both is the defect
      // this whole verdict exists to remove. A suite that FAILED needs repairing;
      // a baseline that never finished needs re-running, or a longer timeout, and
      // telling its author to repair a suite sends them after code that is fine.
      ? result.baseline?.state === 'unrun'
        ? `  <- ${result.observed}, but the baseline for ${result.tests.join(', ')} never finished `
          + `(${result.baseline.why}), so nothing was measured against it — re-run, or raise the `
          + 'timeout, before reading any verdict from this set'
        : `  <- ${result.observed}, but ${result.tests.join(', ')} already failed before this `
          + 'mutation was applied; repair that suite and re-run — nothing here is evidence yet'
      : ''
  return `${result.verdict.padEnd(8)} ${result.label.padEnd(width)}${note}`
}

/**
 * The campaign's counts. An UNPROVEN entry is in NEITHER half of the ratio:
 * counting it in the denominator would make a broken suite read as a campaign
 * with poor coverage, which is a different problem with a different fix.
 */
/**
 * The content key a verdict rests on, or null when any input is unreadable.
 *
 * ADR-023. A mutant is (file, from, to, tests) and its verdict is a pure
 * function of those plus the bytes they name. Hash all of it: if every input is
 * byte-identical, re-running is recomputation and cannot produce a different
 * answer. That is what makes reuse honest here and dishonest for a recorded
 * claim (ADR-010) — a claim and its subject are separate things that drift, and
 * a content key makes that drift unrepresentable rather than merely unlikely.
 *
 * ⚠ CONTENT, never a timestamp, a run id or a commit range. A range is history:
 * a rebase, a force-push, a cherry-pick or a revert all produce one that
 * misdescribes what the files hold.
 *
 * ⚠ NULL WHEN ANYTHING IS UNREADABLE, rather than hashing a placeholder. A
 * missing file that hashed to a stable value would freeze the verdict of an
 * entry whose test was deleted — "I could not look" is not "nothing changed"
 * (ADR-005).
 */
export function cacheKey(mutation, readFile) {
  const hash = createHash('sha256')
  // The edit itself, first: a mutation whose from/to text changed is a
  // different mutant even against identical files.
  for (const part of [mutation.file, mutation.from, mutation.to]) {
    hash.update(String(part)); hash.update('\0')
  }
  // Sorted, so two entries naming the same tests in a different order share a
  // key — the same reason ADR-006 sorts before memoising a baseline.
  for (const name of [mutation.file, ...[...mutation.tests].sort()]) {
    const bytes = readFile(name)
    if (bytes === null || bytes === undefined) return null
    hash.update(name); hash.update('\0'); hash.update(bytes); hash.update('\0')
  }
  return hash.digest('hex')
}

/**
 * The stored verdict this run may reuse, or null to measure it.
 *
 * ONLY `RED`. A `GREEN` mutant is an open finding about a test and must be
 * re-run every time until it is fixed; reusing one hides live work. `UNPROVEN`
 * likewise — ADR-006 says a verdict against a failing baseline is evidence of
 * nothing, and a stored one is worse because it looks settled.
 */
export function reusable(mutation, cache, key) {
  if (!key || !cache || typeof cache !== 'object') return null
  const hit = cache[key]
  return hit && hit.verdict === 'RED' ? hit : null
}

/** The cache at `file`, or {} when it is absent, empty or unparseable. */
export function loadCache(file, read = readFileSync) {
  try {
    const parsed = JSON.parse(read(file, 'utf8'))
    // A shape that is not an object of entries is "could not look", not "empty".
    return parsed && typeof parsed.entries === 'object' && parsed.entries ? parsed.entries : {}
  } catch {
    return {}
  }
}

/**
 * The i-th of n shards, balanced by measured cost rather than by index.
 *
 * BACKLOG §106. Index slicing gave 24.6 / 16.1 / 18.1 / 21.3 minutes over four
 * shards: even counts, uneven cost, because three suites are 86% of the
 * campaign and the run waits for the slowest.
 *
 * Longest-processing-time-first: sort by cost descending, then repeatedly give
 * the next entry to the shard with the least work so far. Deterministic for a
 * given input, which matters because eight CI jobs each compute their own slice
 * independently and must agree on the partition without talking to each other.
 *
 * ⚠ THE COSTS ARE MEASURED, NEVER TABULATED. §106 was deferred because the
 * obvious implementation is a hardcoded per-suite table — a list kept beside the
 * artifact, right on the day it is written and silently wrong after any suite
 * changes, with nothing to report the drift. `cost` reads the previous
 * campaign's own timings out of ADR-023's cache instead, so a stale estimate
 * fixes itself on the next run.
 *
 * An entry with no timing sorts FIRST, at Infinity: an unmeasured mutant is the
 * one whose cost is unknown, and putting the unknowns on separate shards is the
 * safer guess than assuming they are cheap. With no timings at all this degrades
 * to round-robin, which partitions correctly and claims nothing about balance.
 */
export function shardByCost(mutations, index, total, cost) {
  if (total <= 1) return [...mutations]
  const ordered = mutations
    .map((mutation, at) => ({ mutation, at, ms: cost(mutation) }))
    // `at` breaks ties, so the order is total and every shard derives the same
    // partition from the same catalogue without coordinating.
    .sort((a, b) => (b.ms ?? Infinity) - (a.ms ?? Infinity) || a.at - b.at)
  const loads = Array.from({ length: total }, () => 0)
  const bins = Array.from({ length: total }, () => [])
  for (const entry of ordered) {
    let lightest = 0
    for (let i = 1; i < total; i += 1) if (loads[i] < loads[lightest]) lightest = i
    bins[lightest].push(entry)
    // ⚠ AN UNKNOWN COST IS ONE UNIT, NEVER ZERO. With `?? 0` every load stayed 0,
    // `lightest` was always bin 0, and a campaign with no timings put ALL 443
    // entries in shard 1 and left the other seven empty — `shard 4/8: 0 of 443`,
    // which is what broke every mutation job in CI while passing here, where a
    // cache happened to exist. The claim in this function's own docstring, that
    // it degrades to round-robin, is only true with this line.
    loads[lightest] += entry.ms ?? 1
  }
  // Back into catalogue order within the shard, so a campaign's log reads the
  // way the file does rather than by descending cost.
  return bins[index - 1].sort((a, b) => a.at - b.at).map(e => e.mutation)
}


export function summarise(results) {
  const unproven = results.filter(r => r.verdict === 'UNPROVEN')
  const judged = results.filter(r => r.verdict !== 'UNPROVEN')
  const missed = judged.filter(r => r.verdict === 'GREEN' || r.verdict === 'STALE')
  // Whether the failing set is ENTIRELY stale. A stale mutation is not a finding
  // about a test — nothing was applied, so no test was challenged — and saying
  // otherwise borrows the vocabulary of a verdict for a check that could not run.
  const staleOnly = missed.length > 0 && missed.every(r => r.verdict === 'STALE')
  // ADR-023 T2. A campaign printing `430/430 noticed` while running six claims
  // more than happened. These two are reported beside the ratio, never folded
  // into it: the ratio is ADR-006's and means the same thing it always did.
  const reused = judged.filter(r => r.reused).length
  return {
    total: judged.length,
    noticed: judged.length - missed.length,
    reused,
    measured: judged.length - reused,
    unproven: unproven.length,
    // Unchanged by ADR-006: GREEN and STALE fail the run. An UNPROVEN entry
    // instructs and does not block — a block leaves the user with no next move,
    // and the line above has just told them what theirs is.
    failing: missed.length > 0,
    staleOnly,
  }
}

export function main(argv) {
  // An unknown option used to be ignored in silence, and the run it produced
  // looked exactly like the run that was asked for. Measured 2026-08-27:
  // `--filter 'sync:'` — the flag is `--case` — selected nothing, so the filter
  // stayed null and all 181 mutations ran for twenty minutes while the caller
  // waited on three. Every gate in this project names the offending option.
  const KNOWN = new Set(['--case', '--list', '--force', '--shard', '--no-cache', '--cache'])
  const unknown = argv.filter(argument => argument.startsWith('--') && !KNOWN.has(argument))
  if (unknown.length) {
    process.stderr.write(`mutate: unknown option: ${unknown[0]}\n`
      + 'usage: mutate.mjs [--case <substring>] [--shard i/n] [--list] [--force] [--no-cache] [--cache <path>]\n')
    return 2
  }
  const filter = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null
  let selected = catalogue.mutations.filter(m => !filter || m.label.includes(filter))

  // `--shard i/n` runs the i-th of n equal slices, 1-based. The campaign is the
  // most valuable check here and the slowest: it is the only one that measures
  // whether the other checks detect anything, and it grew from 145 entries to
  // 268 in two days. On 2026-08-28 its CI job was killed at thirty minutes with
  // exit 143, which reads as an infrastructure hiccup rather than as "this gate
  // no longer fits", and a gate people cannot tell apart from a flake is a gate
  // they learn to re-run rather than read.
  //
  // Sliced by INDEX, not grouped by test-set, so every shard carries a mix and
  // no single one inherits the slowest suite. Baselines are memoised per set
  // within a shard, so slicing costs a few extra baseline runs and nothing else.
  if (argv.includes('--shard')) {
    const spec = argv[argv.indexOf('--shard') + 1] ?? ''
    const [index, total] = spec.split('/').map(Number)
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1
        || index < 1 || index > total) {
      process.stderr.write(`mutate: --shard wants i/n with 1 <= i <= n, not ${JSON.stringify(spec)}\n`)
      return 2
    }
    // BACKLOG §106. Cost-balanced when the previous run left timings, round-robin
    // when it did not. The cache is read here rather than below because the
    // shard is taken before anything else looks at an entry.
    const priorFile = argv.includes('--cache')
      ? argv[argv.indexOf('--cache') + 1]
      : path.join(root, '.mutation-cache.json')
    const prior = loadCache(priorFile)
    const readForCost = name => {
      try { return readFileSync(path.join(root, name), 'utf8') } catch { return null }
    }
    const msOf = mutation => {
      const key = cacheKey(mutation, readForCost)
      const ms = key ? prior[key]?.ms : undefined
      return typeof ms === 'number' ? ms : undefined
    }
    const timed = selected.filter(m => msOf(m) !== undefined).length
    selected = shardByCost(selected, index, total, msOf)
    console.log(`shard ${index}/${total}: ${selected.length} of ${catalogue.mutations.length} mutations`
      + (timed ? ` (balanced by ${timed} measured timing(s))` : ' (no timings yet — even counts)'))
  }

  const width = Math.max(0, ...selected.map(m => m.label.length))

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
  // ADR-023 T2. The cache is consulted BEFORE the baselines, because a baseline
  // exists to license a verdict — and an entry we are not going to measure needs
  // no licence. Skipping those spawns is most of the saving on a quiet commit.
  const cacheFile = argv.includes('--cache')
    ? argv[argv.indexOf('--cache') + 1]
    : path.join(root, '.mutation-cache.json')
  const cache = argv.includes('--no-cache') ? {} : loadCache(cacheFile)
  const readForKey = name => {
    try { return readFileSync(path.join(root, name), 'utf8') } catch { return null }
  }
  const keys = new Map(selected.map(m => [m.label, cacheKey(m, readForKey)]))
  const reuse = new Map()
  if (!argv.includes('--no-cache')) {
    for (const m of selected) {
      const hit = reusable(m, cache, keys.get(m.label))
      if (hit) reuse.set(m.label, hit)
    }
  }
  const toMeasure = selected.filter(m => !reuse.has(m.label))

  const sets = testSets(toMeasure)
  const baselines = new Map()
  for (const set of sets) {
    // The same files and the same arguments as the mutated run below, or this
    // would be measuring a different thing than the one it licenses.
    const run = spawnSync(process.execPath,
      ['--test', ...set.tests.map(t => path.join(root, t))],
      { cwd: root, encoding: 'utf8', timeout: timeoutMs,
        env: { ...process.env, QUALITY_HARNESS_MUTATION_IN_FLIGHT: '1' } })
    baselines.set(set.tests.join('\0'), baselineOf(run))
  }

  const results = []
  for (const mutation of selected) {
    const hit = reuse.get(mutation.label)
    if (hit) {
      // NAMED, not silent. A reused row says where its verdict was measured, so
      // a reader can go and look rather than taking the run's word for it.
      results.push({ ...mutation, verdict: 'RED', observed: 'RED', reused: true, at: hit.sha })
      console.log(`REUSED   ${mutation.label.padEnd(width)}  <- RED at ${hit.sha ?? 'an earlier run'}`)
      continue
    }
    const file = path.join(root, mutation.file)
    const original = readFileSync(file, 'utf8')
    const occurrences = original.split(mutation.from).length - 1
    const baseline = baselines.get([...mutation.tests].sort().join('\0'))
      ?? { state: 'unrun', why: 'no baseline was taken' }

    if (occurrences !== 1) {
      // PRINTED, like every other verdict. This branch used to push and continue
      // in silence, so a mutation whose `from` no longer matched produced no line
      // at all — and the campaign then closed by telling the author a test had
      // stayed green with its mechanism broken, about a mechanism nothing had
      // touched. Found 2026-09-03 executing ADR-028, from an over-escaped `from`
      // in tests/mutations.json. A report must not state an observation it did
      // not make (CLAUDE.md §3).
      const staleResult = { ...mutation, ...classify({ occurrences, baseline, run: null }) }
      results.push(staleResult)
      console.log(renderLine(staleResult, width))
      continue
    }

    begin(file, original)
    writeFileSync(file, original.replace(mutation.from, mutation.to))
    const startedAt = Date.now()
    const run = spawnSync(process.execPath,
      ['--test', ...mutation.tests.map(t => path.join(root, t))],
      { cwd: root, encoding: 'utf8', timeout: timeoutMs,
        env: { ...process.env, QUALITY_HARNESS_MUTATION_IN_FLIGHT: '1' } })
    const elapsedMs = Date.now() - startedAt
    finish(file, original)

    const result = { ...mutation, ...classify({ occurrences, baseline, run }),
      killers: killedBy(run?.stdout), elapsedMs }
    results.push(result)
    console.log(renderLine(result, width))
  }

  // Verdicts are printed AS THEY ARE DECIDED, above. Collecting them and
  // printing at the end meant a campaign killed mid-run said nothing whatever —
  // on 2026-08-28 a shard was SIGTERMed at nine minutes and its log held no
  // verdict lines, so three CI runs reported only exit 143 and the actual cause
  // took a fourth to find. A long gate that cannot be watched is a gate whose
  // failures are indistinguishable from infrastructure.

  // ADR-023 T2 S4. ONLY RED is written back. A GREEN is an open finding and a
  // stored one would hide live work; UNPROVEN is evidence of nothing (ADR-006).
  // Written after the loop so a killed campaign leaves the previous cache intact
  // rather than a half-updated one.
  if (!argv.includes('--no-cache')) {
    const sha = (() => {
      const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' })
      return r.status === 0 ? r.stdout.trim() : null
    })()
    const entries = { ...cache }
    for (const result of results) {
      const key = keys.get(result.label)
      if (!key) continue
      if (result.reused) continue
      // The duration rides along for BACKLOG §106's cost-balanced slicing: a
      // measurement from the campaign's own last run, never a table beside it.
      if (result.verdict === 'RED') {
        entries[key] = { verdict: 'RED', sha, label: result.label, ms: result.elapsedMs }
      }
      else delete entries[key]
    }
    try {
      writeFileSync(cacheFile, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`)
    } catch { /* a cache that cannot be written costs a re-run, never a verdict. */ }
  }

  const counts = summarise(results)
  console.log(`\n${counts.noticed}/${counts.total} mutations were noticed.`)
  if (counts.reused) {
    console.log(`${counts.measured} measured this run; ${counts.reused} reused a RED verdict `
      + 'whose subject and tests are byte-identical to the run that took it (ADR-023). '
      + 'Pass --no-cache to measure everything.')
  }
  if (counts.unproven) {
    console.log(`${counts.unproven} could not be judged: their test-set did not pass at baseline, `
      + 'so neither verdict is evidence. The line above each says whether that suite FAILED or '
      + 'never finished — they need different things done to them.')
  }
  if (counts.failing) {
    console.log(counts.staleOnly
      // NOTHING WAS APPLIED, so nothing was learned about any test. Saying the
      // other sentence here is a verdict about a suite that was never challenged.
      ? 'Nothing was measured: every failing entry is STALE — its `from` no longer '
        + 'matches the file, so no mutation was applied. Re-read the subject and fix '
        + 'the catalogue entry; this says nothing about the tests.'
      : 'A test that stays green with its mechanism broken is asserting something else.')
    return 1
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
