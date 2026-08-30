#!/usr/bin/env node
// Which findings does a gate report that NOTHING asserts?
//
// Coverage cannot answer this and neither can reading the code: a finding site is
// "covered" the moment any test executes the file. The only honest question is
// whether disabling the finding makes something fail. So this disables each one in
// turn -- replacing the whole `errors.append(...)` / `errors.advise(...)` statement
// with `pass` -- and runs the suites. A SURVIVOR is a behaviour the gate claims and
// no test requires.
//
// Repository-owned, like scripts/selftest.sh and scripts/mutate.mjs: it reads
// tests/ and never ships. Restores the file in a `finally`, so an interrupted run
// does not leave a gate neutered (ADR-002's rule for scripts/mutate.mjs).
//
//   node scripts/unasserted.mjs plugin/bin/adr-retire-check [suite.test.mjs ...]
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const [target, ...suites] = process.argv.slice(2)
if (!target) {
  process.stderr.write('usage: node scripts/unasserted.mjs <gate> [suites...]\n')
  process.exit(2)
}

/** The finding statements in `text`, as [start, end) offsets, outermost first. */
export function findingStatements(text) {
  const out = []
  // The first argument must LOOK like a message. `out.append(q)` is a list being
  // built, not a finding, and neutering it reported a survivor for a line that
  // reports nothing -- a false positive in the instrument is the same defect as a
  // false verdict in a gate.
  const call = /(^[ \t]*)((?:errors|errs)\.(?:append|advise)\(\s*(?=f?["']))/gm
  for (let m; (m = call.exec(text));) {
    // Balance from the opening paren so a multi-line message is taken whole. A
    // regex to the line end would leave a dangling tail that does not parse, and
    // a gate that cannot start is not a gate that failed to report.
    let depth = 0, i = m.index + m[0].length - 1
    for (; i < text.length; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') { depth--; if (depth === 0) { i++; break } }
    }
    out.push({ indent: m[1], start: m.index, end: i })
  }
  return out
}

const file = path.join(root, target)
const original = readFileSync(file, 'utf8')
const sites = findingStatements(original)
const python = /\.(py)$|^#!.*python/.test(original.slice(0, 64)) || !target.endsWith('.mjs')

const run = () => {
  if (suites.length) {
    return spawnSync('node', ['--test', ...suites.map(s => path.join(root, s))],
      { cwd: root, encoding: 'utf8' }).status !== 0
  }
  return spawnSync('bash', [path.join(root, 'scripts', 'selftest.sh')],
    { cwd: root, encoding: 'utf8' }).status !== 0
}

// A BASELINE FIRST. Every verdict below is "the suite noticed", and a suite that
// was already failing notices everything -- so without this the tool reports zero
// survivors precisely when it can tell you least. scripts/mutate.mjs learned the
// same lesson and calls that state UNPROVEN rather than a verdict.
if (run()) {
  process.stderr.write(
    `the suite already fails before anything was neutered, so no verdict here would `
    + `be evidence. Repair it and re-run.\n`)
  process.exit(2)
}

/** Whether the file still parses, so a broken edit is never read as a verdict. */
function parses(f) {
  const cmd = python
    ? ['python3', ['-c', 'import ast,sys;ast.parse(open(sys.argv[1]).read())', f]]
    : ['node', ['--check', f]]
  return spawnSync(cmd[0], cmd[1], { encoding: 'utf8' }).status === 0
}

const survivors = []
const unusable = []
try {
  process.stdout.write(`${sites.length} finding site(s) in ${target}\n\n`)
  for (const [n, site] of sites.entries()) {
    const quoted = original.slice(site.start, site.end).replace(/\s+/g, ' ').slice(0, 68)
    const neutered = original.slice(0, site.start)
      + site.indent + (python ? 'pass' : 'void 0')
      + original.slice(site.end)
    writeFileSync(file, neutered)
    // A neutered file that no longer PARSES is not a measurement. The balancer
    // counts raw parentheses, so a message containing an unbalanced `)` inside its
    // string would take the statement's extent wrong -- today no gate has one, but
    // that is luck rather than design, and the failure mode is silent: the gate
    // stops starting, every suite goes red, and the site reads as "killed". A
    // check that cannot tell a broken instrument from a real verdict is the defect
    // this repository exists to refuse (CLAUDE.md §3).
    if (!parses(file)) {
      unusable.push(quoted)
      process.stdout.write(`${String(n + 1).padStart(3)}  UNUSABLE  ${quoted}\n`)
      continue
    }
    const noticed = run()
    if (!noticed) survivors.push(quoted)
    process.stdout.write(`${String(n + 1).padStart(3)}  ${noticed ? 'killed  ' : 'SURVIVED'}  ${quoted}\n`)
  }
} finally {
  writeFileSync(file, original)
}

process.stdout.write(`\nrestored. ${survivors.length} of ${sites.length} assert nothing.\n`)
if (unusable.length) {
  process.stdout.write(
    `${unusable.length} site(s) could not be measured -- neutering them left a file that does `
    + `not parse, so those are UNUSABLE rather than killed or surviving.\n`)
}
process.exit(survivors.length ? 1 : 0)
