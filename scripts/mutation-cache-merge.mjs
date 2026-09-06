#!/usr/bin/env node
// Merge the per-shard mutation caches of one CI run into the cache the next run
// restores. BACKLOG §148.
//
// WHY THIS EXISTS AND A UNION DOES NOT WORK. Each shard loads the whole prior
// cache and writes `prior ∪ own` (scripts/mutate.mjs, the ADR-023 T2 S4 block),
// because a shard measures a slice and must not drop the keys it never looked
// at. So twelve shard files each contain every key. Union them and a key that
// shard 3 DELETED — its mutant went GREEN, which is an open finding about a
// test — comes back, carried by the eleven shards that never measured it. The
// verdict is then resurrected by shards that did not take it, which is the
// stored-GREEN hazard ADR-023 refuses, arriving by the back door.
//
// So deletions have to win, and they can only win if a shard says what it
// MEASURED. `measured` is that claim. Inside it, an absent key is a deletion;
// outside it, an absent key is no observation at all (CLAUDE.md §3, ADR-005).
//
// ⚠ AND A SHARD THAT NEVER REPORTED IS NOT A SHARD THAT MEASURED NOTHING. A
// campaign killed at the 25-minute wall writes no file at all — deliberately,
// so a half-run leaves the previous cache intact. Under a merge that inverts:
// the dead shard's keys carry no `measured` claim from anyone, their prior
// verdicts survive untouched, and a mutant that would have gone GREEN stays RED
// in the cache and is never re-measured. That is the same resurrection, reached
// through absence rather than union. This tool therefore REFUSES to merge an
// incomplete run rather than publishing a cache that silently freezes it.

import { readFileSync, writeFileSync } from 'node:fs'

/**
 * One shard's report, or a reason it cannot be read.
 *
 * A file that is missing, unparseable, or carries no `measured` array is not an
 * empty report — it is no report. Predates `measured` counts as unreadable for
 * the same reason: a cache written before §148 cannot say what it measured, and
 * treating its silence as "measured nothing" is the freeze above.
 */
export function readReport(path, read = readFileSync) {
  let parsed
  try { parsed = JSON.parse(read(path, 'utf8')) } catch { return { path, error: 'unreadable' } }
  if (!parsed || typeof parsed !== 'object') return { path, error: 'not an object' }
  if (!parsed.entries || typeof parsed.entries !== 'object') return { path, error: 'no entries' }
  if (!Array.isArray(parsed.measured)) return { path, error: 'no measured claim' }
  return { path, entries: parsed.entries, measured: parsed.measured, shard: parsed.shard ?? null }
}

/**
 * The merged cache, or a refusal.
 *
 * `expected` is how many shard reports this run should have produced. Fewer is
 * a refusal, never a smaller merge: see the file header.
 *
 * Resolution, per key:
 * - measured by some shard  → that shard's value wins; absent there is a DELETE
 * - measured by no shard    → the prior value survives, taken from any report
 *   (every report carries the same prior, which is what makes union tempting)
 *
 * ⚠ TWO SHARDS MEASURING ONE KEY: two catalogue entries whose file, from, to,
 * only and test bytes are all identical share a cache key, so this is reachable
 * without a bug. A DELETE WINS over a RED. Deleting only costs the next run a
 * re-measure; keeping a RED that some shard just refused to confirm is the
 * stored verdict this whole file exists to prevent.
 */
export function merge(reports, expected) {
  const failures = reports.filter(r => r.error)
  if (failures.length || reports.length !== expected) {
    return {
      ok: false,
      reason: reports.length !== expected
        ? `${reports.length} shard report(s), expected ${expected}`
        : `${failures.length} unreadable shard report(s)`,
      failures,
    }
  }

  const entries = {}
  // The prior, from any report: they all carry it, and a key nobody measured
  // must keep exactly what it had.
  for (const [key, value] of Object.entries(reports[0].entries)) entries[key] = value

  const deleted = new Set()
  const seen = new Set()
  for (const report of reports) {
    for (const key of report.measured) {
      seen.add(key)
      // A deletion is final for this merge, however many other shards kept the
      // key: see the two-shards-one-key note above.
      if (deleted.has(key)) continue
      const value = report.entries[key]
      // Absent inside a measured claim is a deletion; the same absence outside
      // one would be no observation at all.
      if (value === undefined) { deleted.add(key); delete entries[key] }
      else entries[key] = value
    }
  }

  return { ok: true, entries, measured: seen.size, deleted: deleted.size }
}

/** Read every path, merge, and write. Returns the process exit code. */
export function run(argv, { read = readFileSync, write = writeFileSync, log = console.log } = {}) {
  const outAt = argv.indexOf('--out')
  if (outAt === -1 || !argv[outAt + 1]) {
    log('usage: mutation-cache-merge.mjs --out <file> <shard-cache>...')
    return 2
  }
  const out = argv[outAt + 1]
  const paths = argv.filter((a, i) => i !== outAt && i !== outAt + 1 && !a.startsWith('--'))
  if (!paths.length) { log('usage: mutation-cache-merge.mjs --out <file> <shard-cache>...'); return 2 }

  const expectedAt = argv.indexOf('--expect')
  const expected = expectedAt === -1 ? paths.length : Number(argv[expectedAt + 1])
  if (!Number.isInteger(expected) || expected < 1) {
    log('mutation-cache-merge: --expect wants a positive integer')
    return 2
  }

  const result = merge(paths.map(p => readReport(p, read)), expected)
  if (!result.ok) {
    // Exit 1 and write NOTHING. The run that follows restores the cache this one
    // declined to replace, which is the same state as before — never a cache
    // that looks complete and is not.
    log(`mutation-cache-merge: REFUSED — ${result.reason}. The previous cache stands; `
      + 'nothing was written. A shard that never reported is not a shard that measured nothing '
      + '(BACKLOG §148).')
    for (const f of result.failures ?? []) log(`  ${f.path}: ${f.error}`)
    return 1
  }

  write(out, `${JSON.stringify({ version: 1, entries: result.entries }, null, 2)}\n`)
  log(`mutation-cache-merge: ${Object.keys(result.entries).length} entr(ies) written to ${out}; `
    + `${result.measured} key(s) measured this run, ${result.deleted} deleted.`)
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(run(process.argv.slice(2)))
