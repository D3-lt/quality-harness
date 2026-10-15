#!/usr/bin/env node
// The order scripts/selftest.sh runs its test files in. Stage 1 of the plan to make the check fast without letting it claim
// more (BACKLOG §378): node --test starts files in the order it is given them, nine at a time, and the glob's order started the
// longest file (125 s, measured 2026-10-14) late enough to end the run alone.
//
// From the latest row of per-file times (selftest-files.jsonl, kept by the gate): files that failed in that run first, so a
// still-red file says so early; then files the row does not name, since a new or renamed file has no time to be ranked by;
// then the rest, longest first. Ties keep the order given. The times are the last run's own, never a table kept beside the
// suite (the rule shardByCost in scripts/mutate.mjs follows). A file whose row counted no tests of its own is unmeasured too:
// its tests were charged to the helper that registered them (file-timing-reporter.mjs), so its 0 ms is not its time.
//
// ⚠ THE SAME FILES, ALWAYS. The output is the input reordered: every file given is printed once and nothing else, so an
// ordering can make a run faster and never make it check less. With no row, or a row that cannot be read, the order given is
// printed unchanged and said on stderr.
//
// ⚠ IT SAYS WHICH ORDER IT PRINTED. The first line is `order: times` or `order: given`, then one file per line: the gate names
// the order its files ran in from that line, never from whether a list came back, since a list comes back either way.
//
// Usage: node scripts/test-order.mjs <times.jsonl> <root> <file>...
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

/** The latest row of per-file times that names any file, or null. */
export function latestTimes(text) {
  const lines = String(text ?? '').split('\n').filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const row = JSON.parse(lines[index])
      if (Array.isArray(row?.files) && row.files.length) return row
    } catch {}
  }
  return null
}

/** `files` reordered by `row`: failed first, then unmeasured, then longest first; ties in the order given. */
export function order(files, row, nameOf = file => file) {
  if (!row) return [...files]
  const times = new Map(row.files.map(entry => [entry.file, entry]))
  const rank = file => {
    const entry = times.get(nameOf(file))
    if (!entry || (entry.tests === 0 && !(entry.failed > 0))) return [1, 0]
    return [entry.failed > 0 ? 0 : 2, -(entry.ms ?? 0)]
  }
  return files
    .map((file, index) => ({ file, index, rank: rank(file) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(entry => entry.file)
}

if (isMainModule(import.meta.url)) {
  const [timesFile, root, ...files] = process.argv.slice(2)
  if (!timesFile || !root) {
    process.stderr.write('usage: test-order.mjs <times.jsonl> <root> <file>...\n')
    process.exit(2)
  }
  let row = null
  try { row = latestTimes(readFileSync(timesFile, 'utf8')) } catch {}
  if (!row) process.stderr.write('test-order: no per-file times yet; the files run in the order given\n')
  const nameOf = file => path.relative(root, file).split(path.sep).join('/')
  process.stdout.write(`order: ${row ? 'times' : 'given'}\n${order(files, row, nameOf).map(file => `${file}\n`).join('')}`)
}
