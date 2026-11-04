#!/usr/bin/env node
// ADR-139 T4: merges the Windows shards' per-file rows into the one row scripts/suite-accounting.mjs reads.
// Usage: node scripts/merge-rows.mjs --out <file> <rows-file>...
// Each rows file's LAST line is that shard's row (scripts/file-timing-reporter.mjs appends one per run), as suite-accounting
// reads it. A file in several shards (tests/helpers/shard.mjs carries the sliced files' tests) has its counts summed and its
// reasonless skips joined. Exit: 0 written; 2 a rows file that cannot be read, or no rows file at all.
import { readFileSync, writeFileSync } from 'node:fs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

const COUNTS = ['ms', 'tests', 'cases', 'failed', 'skipped']

export function mergeRows(rows) {
  const byFile = new Map()
  for (const row of rows) {
    if (!Array.isArray(row?.files)) throw new Error('merge-rows: a row with no files list cannot be merged')
    for (const entry of row.files) {
      const file = String(entry.file).replaceAll('\\', '/')
      const into = byFile.get(file) ?? { file, ms: 0, tests: 0, cases: 0, failed: 0, skipped: 0, reasonless: [] }
      for (const key of COUNTS) into[key] += Number.isInteger(entry[key]) ? entry[key] : 0
      into.reasonless.push(...(entry.reasonless ?? []))
      byFile.set(file, into)
    }
  }
  return { at: new Date().toISOString(), concurrency: null, load: null, shards: rows.length, files: [...byFile.values()] }
}

function main(argv) {
  const at = argv.indexOf('--out')
  const out = at >= 0 ? argv[at + 1] : undefined
  const inputs = argv.filter((_, i) => i !== at && i !== at + 1)
  if (!out || inputs.length === 0) {
    process.stderr.write('merge-rows: usage: merge-rows.mjs --out <file> <rows-file>...\n')
    return 2
  }
  try {
    const rows = inputs.map(file => JSON.parse(readFileSync(file, 'utf8').trim().split('\n').at(-1)))
    writeFileSync(out, `${JSON.stringify(mergeRows(rows))}\n`)
  } catch (error) {
    process.stderr.write(`merge-rows: UNRUN — ${error.message}\n`)
    return 2
  }
  return 0
}

if (isMainModule(import.meta.url)) process.exitCode = main(process.argv.slice(2))
