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
//     tree carried a broken gate until it was noticed. Every path here restores,
//     including on SIGINT.
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
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogue = JSON.parse(readFileSync(path.join(root, 'tests', 'mutations.json'), 'utf8'))

const argv = process.argv.slice(2)
const filter = argv.includes('--case') ? argv[argv.indexOf('--case') + 1] : null
const listOnly = argv.includes('--list')
const timeoutMs = 180_000

const selected = catalogue.mutations.filter(m => !filter || m.label.includes(filter))
if (listOnly) {
  for (const m of selected) console.log(`${m.label}\n  ${m.file} -> ${m.tests.join(', ')}`)
  process.exit(0)
}
if (selected.length === 0) {
  process.stderr.write(`no mutation matches ${filter}\n`)
  process.exit(1)
}

// A mutation left applied is worse than a mutation not run.
//
// In-process handlers are not enough, and this script proved it on its own first
// run: something killed it hard, `process.on('exit')` never fired, and
// scripts/lifecycle.mjs sat mutated in the working tree until a later run
// reported the mutation STALE. SIGKILL runs no JavaScript.
//
// So the intent is written to disk BEFORE the source is touched, and any leftover
// is repaired at startup. A crash can lose the process; it cannot lose the file.
const journalPath = path.join(root, '.mutate-inflight.json')

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

process.on('SIGINT', () => { recover(); process.exit(130) })
process.on('SIGTERM', () => { recover(); process.exit(143) })
process.on('exit', () => { recover() })

recover()

const results = []
for (const mutation of selected) {
  const file = path.join(root, mutation.file)
  const original = readFileSync(file, 'utf8')
  const occurrences = original.split(mutation.from).length - 1

  if (occurrences !== 1) {
    // Neither a pass nor a failure of the tests: the mutation no longer
    // describes the code, so it asserts nothing and has to be rewritten.
    results.push({ ...mutation, verdict: 'STALE', detail: `matches ${occurrences} times` })
    continue
  }

  begin(file, original)
  writeFileSync(file, original.replace(mutation.from, mutation.to))
  const run = spawnSync(process.execPath,
    ['--test', ...mutation.tests.map(t => path.join(root, t))],
    { cwd: root, encoding: 'utf8', timeout: timeoutMs })
  finish(file, original)

  const verdict = (run.signal || run.status === null)
    ? 'HUNG'
    : run.status === 0 ? 'GREEN' : 'RED'
  results.push({ ...mutation, verdict })
}

const width = Math.max(...results.map(r => r.label.length))
for (const r of results) {
  const note = r.verdict === 'GREEN' ? '  <- the tests did not notice'
    : r.verdict === 'STALE' ? `  <- ${r.detail}`
    : r.verdict === 'HUNG' ? '  <- noticed, but by hanging rather than failing'
    : ''
  console.log(`${r.verdict.padEnd(5)} ${r.label.padEnd(width)}${note}`)
}

const missed = results.filter(r => r.verdict === 'GREEN' || r.verdict === 'STALE')
console.log(`\n${results.length - missed.length}/${results.length} mutations were noticed.`)
if (missed.length) {
  console.log('A test that stays green with its mechanism broken is asserting something else.')
  process.exit(1)
}
