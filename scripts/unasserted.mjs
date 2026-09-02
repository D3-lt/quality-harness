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
//   node scripts/unasserted.mjs plugin/bin/adr-retire-check [suite.test.mjs ...]
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPython } from './python-interpreter.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const [target, ...suites] = process.argv.slice(2)
if (!target) {
  process.stderr.write('usage: node scripts/unasserted.mjs <gate> [suites...]\n')
  process.exit(2)
}

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
// at startup, and remove it on a clean finish.
const journalPath = path.join(root, '.unasserted-inflight.json')

function recover() {
  if (!existsSync(journalPath)) return
  const { file: was, original: text } = JSON.parse(readFileSync(journalPath, 'utf8'))
  writeFileSync(was, text)
  rmSync(journalPath, { force: true })
  process.stderr.write(`unasserted: restored ${path.relative(root, was)} from an interrupted run\n`)
}
recover()

const file = path.join(root, target)
const original = readFileSync(file, 'utf8')

// REFUSE OVER A DIRTY TARGET. The restore below writes `original` back
// wholesale, so an edit made while this runs is silently rolled back -- the same
// way mutate.mjs lost two patches on 2026-08-26.
const dirty = spawnSync('git', ['status', '--porcelain', '--', target],
  { cwd: root, encoding: 'utf8' })
if (dirty.status === 0 && dirty.stdout.trim()) {
  process.stderr.write(`${target} has uncommitted changes, and this run restores it wholesale -- `
    + 'an edit made while it works would be rolled back. Commit or stash first.\n')
  process.exit(2)
}
writeFileSync(journalPath, JSON.stringify({ file, original }))
const neuter = path.join(root, 'scripts', 'neuter.py')
const py = (...args) => runPython([neuter, ...args], { input: original, encoding: 'utf8' })

const listed = py('list')
if (listed.status !== 0) {
  process.stderr.write(`could not enumerate ${target}: ${listed.stderr}\n`)
  process.exit(2)
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
  ? spawnSync('node', ['--test', ...suites.map(s => path.join(root, s))],
    { cwd: root, encoding: 'utf8',
      env: { ...process.env, QUALITY_HARNESS_MUTATION_IN_FLIGHT: '1' } })
  : spawnSync('bash', [path.join(root, 'scripts', 'selftest.sh')], { cwd: root, encoding: 'utf8' })
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
    process.exit(2)
  }

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
    process.exit(2)
  }
  if (!reachable) {
    process.stderr.write(`neutering every finding in ${target} changed nothing the named `
      + 'suite(s) check, so they do not exercise its findings and no per-site verdict would be '
      + 'evidence. Name the suites that drive this gate, or omit them to run the whole gate.\n')
    process.exit(2)
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
process.exit(survivors.length ? 1 : 0)
