#!/usr/bin/env node
// Which findings does a gate report that NOTHING asserts?
//
// Coverage cannot answer this and neither can reading the code: a finding site is
// "covered" the moment any test executes the file. The only honest question is
// whether disabling the finding makes something fail. So this replaces each
// `errors.append(...)` / `errors.advise(...)` statement with `pass` in turn and
// runs the suites. A SURVIVOR is a behaviour the gate claims and no test requires.
//
// Enumeration and the EDIT both happen in scripts/neuter.py. Doing the arithmetic
// in one language removed the bug that produced `pass    return errs`: ast reports
// col_offset in UTF-8 BYTES, these messages are full of `—` and `·`, and slicing
// the string by those numbers cut at the wrong character. The neutered file then
// failed to parse, every suite went red, and the site read as `killed` -- the tool
// was most confident exactly where it was broken.
//
// Repository-owned, like scripts/selftest.sh and scripts/mutate.mjs: it reads
// tests/ and never ships.
//
// ADR-076: it neuters and runs its suites in a worktree of this checkout's working-tree
// content, built by the plugin's worktree module, so a peer session or an editor never meets
// a neutered gate. `--in-place` neuters the checkout itself, as before.
//
//   node scripts/unasserted.mjs plugin/bin/adr-retire-check [suite.test.mjs ...] [--in-place]
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { addOwned, build, remove, sweep } from '../plugin/scripts/worktree.mjs'
import { runPython } from './python-interpreter.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// A whole suite run under a neutered gate. The suite itself takes ~1-2 minutes;
// this is the bound a hung mutant run hits before the CI job cap does, so the
// tool can restore the gate and say HUNG rather than be killed mid-restore.
const SUITE_TIMEOUT_MS = 20 * 60_000

// AN ON-DISK JOURNAL, and it is the only thing that protects the tree.
//
// This neuters real source and restores it. A `finally` handles an ordinary
// throw; it does NOT handle SIGINT, SIGTERM or a lost process, and this is one
// long SYNCHRONOUS loop, so Node never reaches the event loop and a signal
// handler could not run while it is working. scripts/mutate.mjs learned exactly
// this on 2026-08-27 -- SIGTERM was sent twice and the run carried on. A review
// pointed out this tool had the same shape and none of the protection.
//
// So: write the original beside the run before touching anything, recover from it
// at startup, and remove it on a clean finish. Isolated, the journal sits in the
// worktree and goes with it; the one recovered at startup is an in-place run's.
const JOURNAL = '.unasserted-inflight.json'

function recover() {
  const journalPath = path.join(root, JOURNAL)
  if (!existsSync(journalPath)) return
  const { file: was, original: text } = JSON.parse(readFileSync(journalPath, 'utf8'))
  writeFileSync(was, text)
  rmSync(journalPath, { force: true })
  process.stderr.write(`unasserted: restored ${path.relative(root, was)} from an interrupted run\n`)
}

// The suites' environment. NODE_TEST_CONTEXT is the runner this tool was started from: an
// inner `node --test` that inherits it reports as that runner's child, and its exit no longer
// says whether the suite failed (spec F-13; scripts/mutate.mjs's childEnv strips it too).
const { NODE_TEST_CONTEXT: _runner, ...inherited } = process.env
const suiteEnv = { ...inherited, QUALITY_HARNESS_MUTATION_IN_FLIGHT: '1' }

/** The measurement over `base` (the worktree, or the checkout with --in-place): an exit code. */
function measure(base, target, suites, inPlace) {
  const journalPath = path.join(base, JOURNAL)
  const file = path.join(base, target)
  // A tracked symlink is carried into the worktree as a link, and one pointing back into the
  // checkout would be neutered THERE (Codex review of ADR-076, finding 4).
  if (!inPlace && existsSync(file)) {
    const resolved = realpathSync(file)
    const home = realpathSync(base)
    if (resolved !== home && !resolved.startsWith(home + path.sep)) {
      process.stderr.write(`unasserted: ${target} resolves outside the worktree, to ${resolved}, so `
        + 'neutering it here would neuter that file. Nothing was neutered. Re-run with --in-place '
        + 'to neuter the checkout itself.\n')
      return 2
    }
  }
  const original = readFileSync(file, 'utf8')

  // REFUSE OVER A DIRTY TARGET, IN PLACE. The restore below writes `original` back
  // wholesale, so an edit made while this runs is silently rolled back -- the same
  // way mutate.mjs lost two patches on 2026-08-26. Isolated, the worktree's copy is
  // what is neutered and restored, so there is no edit of anyone's to roll back.
  if (inPlace) {
    const dirty = spawnSync('git', ['status', '--porcelain', '--', target],
      { cwd: base, encoding: 'utf8', timeout: 60_000 })
    if (dirty.status === 0 && dirty.stdout.trim()) {
      process.stderr.write(`${target} has uncommitted changes, and this run restores it wholesale -- `
        + 'an edit made while it works would be rolled back. Commit or stash first.\n')
      return 2
    }
  }
  // ⚠ NOT YET. The journal means "a finding is neutered right now", and nothing is
  // neutered until the baseline has passed — the refusal below exits without
  // touching the file. Writing it here stranded a journal on every refusal, and a
  // stranded journal fails the suite that the next run needs, so one bad baseline
  // made the tool permanently unusable. Measured 2026-09-02, twice.
  const neuter = path.join(root, 'scripts', 'neuter.py')
  const py = (...args) => runPython([neuter, ...args], { input: original, encoding: 'utf8' })

  const listed = py('list')
  if (listed.status !== 0) {
    process.stderr.write(`could not enumerate ${target}: ${listed.stderr}\n`)
    return 2
  }
  const sites = listed.stdout.split('\n').filter(Boolean)
    .map(l => l.split(':').slice(2).join(':'))

  /** True when the suites FAILED — the only signal this tool has. */
  const run = () => (suites.length
    // IN_FLIGHT is declared to the child, because this tool's own journal is
    // present while it runs the suite — and a suite that refuses to pass while a
    // journal exists would deadlock the tool that writes one. Added 2026-09-02
    // after exactly that: the guard fired on the sweep's own baseline, the sweep
    // refused, and the journal it had already written failed every later run.
    ? spawnSync('node', ['--test', ...suites.map(s => path.join(base, s))],
      { cwd: base, encoding: 'utf8', timeout: SUITE_TIMEOUT_MS, env: suiteEnv })
    // BOTH branches, and missing this one is how the deadlock survived its own
    // fix: with no suites named this runs the WHOLE selftest, which carries the
    // same guard. One path was taught and the other was not, so the tool went on
    // refusing at baseline while the targeted path worked.
    : spawnSync('bash', [path.join(base, 'scripts', 'selftest.sh')],
      { cwd: base, encoding: 'utf8', timeout: SUITE_TIMEOUT_MS, env: suiteEnv })
  ).status !== 0

  /** Whether the file still parses, so a broken edit is never read as a verdict. */
  const parses = f => runPython(['-c', 'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read())', f],
    { encoding: 'utf8' }).status === 0

  const survivors = []
  const unusable = []
  try {
    // A BASELINE FIRST. Every verdict below is "the suite noticed", and a suite that
    // was already failing notices everything -- so without this the tool reports zero
    // survivors precisely when it can tell you least. scripts/mutate.mjs learned the
    // same lesson and calls that state UNPROVEN rather than a verdict.
    if (run()) {
      process.stderr.write('the suite already fails before anything was neutered, so no verdict '
        + 'here would be evidence. Repair it and re-run.\n')
      return 2
    }
    // NOW, with a passing baseline behind us and the first edit about to happen.
    writeFileSync(journalPath, JSON.stringify({ file, original }))

    // A REACHABILITY CONTROL. Neuter every finding at once: if the suites still pass,
    // they do not exercise this gate's findings at all, and "17 of 33 assert nothing"
    // would be true, useless, and indistinguishable from a real result.
    const all = py('all')
    writeFileSync(file, all.status === 0 ? all.stdout : original)
    const wholeParses = all.status === 0 && parses(file)
    const reachable = wholeParses && run()
    writeFileSync(file, original)
    if (!wholeParses) {
      process.stderr.write(`neutering every finding in ${target} left a file that does not parse, `
        + 'so nothing has been measured. This is a defect in THIS TOOL, not in the suites.\n')
      return 2
    }
    if (!reachable) {
      process.stderr.write(`neutering every finding in ${target} changed nothing the named `
        + 'suite(s) check, so they do not exercise its findings and no per-site verdict would be '
        + 'evidence. Name the suites that drive this gate, or omit them to run the whole gate.\n')
      return 2
    }

    process.stdout.write(`${sites.length} finding site(s) in ${target}\n\n`)
    for (const [n, quoted] of sites.entries()) {
      const cut = py('cut', String(n))
      writeFileSync(file, cut.status === 0 ? cut.stdout : original)
      if (cut.status !== 0 || !parses(file)) {
        unusable.push(quoted)
        process.stdout.write(`${String(n + 1).padStart(3)}  UNUSABLE  ${quoted.slice(0, 68)}\n`)
        continue
      }
      const noticed = run()
      if (!noticed) survivors.push(quoted)
      process.stdout.write(
        `${String(n + 1).padStart(3)}  ${noticed ? 'killed  ' : 'SURVIVED'}  ${quoted.slice(0, 68)}\n`)
    }
  } finally {
    // The journal is the guarantee; this is the fast path for an ordinary exit.
    writeFileSync(file, original)
    rmSync(journalPath, { force: true })
  }

  process.stdout.write(`\nrestored. ${survivors.length} of ${sites.length} assert nothing.\n`)
  if (unusable.length) {
    process.stdout.write(`${unusable.length} site(s) could not be measured -- neutering them left a `
      + 'file that does not parse, so those are UNUSABLE rather than killed or surviving.\n')
  }
  return survivors.length ? 1 : 0
}

function main(argv) {
  const inPlace = argv.includes('--in-place')
  const [target, ...suites] = argv.filter(word => word !== '--in-place')
  if (!target) {
    process.stderr.write('usage: node scripts/unasserted.mjs <gate> [suites...] [--in-place]\n')
    return 2
  }
  recover()
  if (inPlace) return measure(root, target, suites, true)
  sweep(root, line => process.stderr.write(`unasserted: ${line}\n`))
  const built = build(root, { owner: process.pid, exclude: [path.join(root, JOURNAL)] })
  if (!built.ok) {
    process.stderr.write(`unasserted: could not isolate: ${built.error}. Nothing was neutered. `
      + 'Re-run with --in-place to neuter the checkout itself.\n')
    return 2
  }
  // ONE CLEANUP BOUNDARY. Every exit after the build — the enumeration failure, the failing
  // baseline, the unreachable suite, a finished run — returns through it, so the tree goes on
  // each (ADR-076). A signal still ends this synchronous loop at once; the next isolated run
  // of any tool sweeps what it leaves.
  try {
    // The suites join this process's group (spawnSync does not detach them), so the group is
    // recorded before any starts: a killed owner then leaves a tree no sweep removes under a
    // suite still running in it (Codex review of ADR-076, finding 3).
    const group = processGroup()
    if (group) addOwned(built.id, { group })
    else if (process.platform !== 'win32') {
      process.stderr.write('unasserted: could not read this process\'s group, so the worktree is kept '
        + 'only while this process lives\n')
    }
    return measure(built.tree, target, suites, false)
  } finally {
    remove(built.id)
  }
}

// This process's group, which the suites it runs join. POSIX only: Windows has no process group
// for a sweep to ask about, so there the owner alone is recorded.
function processGroup() {
  if (process.platform === 'win32') return null
  const asked = spawnSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8', timeout: 30_000 })
  const group = Number((asked.stdout ?? '').trim())
  return asked.status === 0 && Number.isInteger(group) && group > 0 ? group : null
}

process.exit(main(process.argv.slice(2)))
