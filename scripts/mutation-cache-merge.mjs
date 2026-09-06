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
import { pathToFileURL } from 'node:url'

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

  // ⚠ A COUNT IS NOT COMPLETENESS, and the gap is reachable. Twelve reports in
  // which `2/12` appears twice and `3/12` not at all passes any count check —
  // and then shard 3's deletions never happen (a stale RED survives) or its new
  // verdicts are lost. The identities are in the files; ask for all of them.
  // Found by review, 2026-09-06.
  if (expected > 1) {
    const missing = []
    const seen = new Map()
    for (const report of reports) seen.set(report.shard, (seen.get(report.shard) ?? 0) + 1)
    for (let i = 1; i <= expected; i += 1) {
      const identity = `${i}/${expected}`
      if (seen.get(identity) !== 1) missing.push(`${identity} x${seen.get(identity) ?? 0}`)
    }
    if (missing.length) {
      return {
        ok: false,
        reason: `shard identities are not exactly 1..${expected}: ${missing.join(', ')}`,
        failures: [],
      }
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

/**
 * Read every path, merge, and write. Returns the process exit code.
 *
 * ⚠ OPTIONS ARE CONSUMED BEFORE POSITIONALS, and that ordering is the whole
 * correctness of this function. Filtering out only the flags themselves leaves
 * every OPERAND behind, so `--expect 12` contributed a thirteenth "path" named
 * `12`, every real invocation refused as incomplete, and the save never ran. The
 * CLI test missed it because its refusal arm passed for the wrong reason: eleven
 * files plus a stray `12` is twelve paths, one of them unreadable, which is also
 * a refusal. Found by review, 2026-09-06.
 */
export function run(argv, { read = readFileSync, write = writeFileSync, log = console.log } = {}) {
  const usage = () => { log('usage: mutation-cache-merge.mjs --out <file> [--expect <n>] <shard-cache>...'); return 2 }
  const OPTIONS = new Set(['--out', '--expect'])

  const values = new Map()
  const paths = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (OPTIONS.has(arg)) {
      if (argv[i + 1] === undefined) return usage()
      values.set(arg, argv[i + 1])
      i += 1               // the OPERAND, never a path
      continue
    }
    if (arg.startsWith('--')) { log(`mutation-cache-merge: unknown option: ${arg}`); return 2 }
    paths.push(arg)
  }

  const out = values.get('--out')
  if (!out) return usage()
  if (!paths.length) return usage()

  const expected = values.has('--expect') ? Number(values.get('--expect')) : paths.length
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

// `import.meta.url` is a URL and `process.argv[1]` is a PATH — on Windows a
// `file://${argv}` template never matches, so the script would exit 0 having run
// nothing at all. tests/package.test.mjs sweeps every tracked .mjs for that shape.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)))
}
