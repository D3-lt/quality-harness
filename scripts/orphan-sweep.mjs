#!/usr/bin/env node
// orphan-sweep.mjs — which functions does the plugin DEFINE that nothing SHIPPED calls?
//
// BACKLOG §99. ADR-020 T1 shipped `implausibly_fast` defined, asserted three times
// and called from nothing (issue #6). Every gate said it shipped correctly: the
// Acceptance fence called the predicate directly and the mutation was killed by
// those direct assertions whether or not production invoked it. A mutant proves a
// test NOTICES a change; it never proves the subject is REACHED.
//
// ⚠ THE SCOPE IS THE WHOLE POINT, and getting it wrong makes this report clean
// over a corpus that contains the defect. The first version of this sweep counted
// uses across every tracked file and found NOTHING at dcb7df4 — because
// `implausibly_fast` appears three times in tests/ and twice in an ADR. Tests and
// records do not make a function reachable; that is the entire defect §99 names.
// So the corpus here is `plugin/**` plus README.md — what a user downloads — and
// nothing else.
//
// ⚠ BARE-IDENTIFIER SCAN, never `name(`. The first sweep in §99's own history
// matched `\bname\(` and reported `expandExistingGlob` as an orphan: it is called
// through the spread operator, `...expandExistingGlob(`, and a naive lookbehind
// read the `.` as property access. A check that reports an observation it did not
// make is CLAUDE.md §3's defect. Counting bare identifiers also means a name
// reached through a STRING — a dispatch table, a config key — counts as reached,
// which is correct and is why no exemption list is needed.
//
// THERE IS DELIBERATELY NO ALLOWLIST. §99 worried that a legitimately-uncalled
// function (`main`, a dispatch-table arm) would force an exemption mechanism, and
// that "a name added to silence a red run is indistinguishable from a name that
// belongs there". Measured 2026-09-02: with the scope above, HEAD reports 0 of 440
// with no exemptions at all — `main` appears 72 times in the shipped tree, and the
// `_go_*` helpers are called directly. So the answer to a future legitimate orphan
// is to delete it or make it reachable, never to add a line to a list that rots.
//
// Usage:
//   node scripts/orphan-sweep.mjs [<rev>]     # defaults to HEAD; any rev works
//
// Exit codes:
//   0  no orphans
//   1  at least one definition is unreachable from the shipped tree
//   2  could not look (git unavailable, rev unknown)
import { execFileSync } from 'node:child_process'

const PY_DEF = /^def\s+([a-z_][a-z0-9_]*)\s*\(/gm
const JS_DEF = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/gm
// What a user downloads: `.claude-plugin/marketplace.json` declares `"source":
// "./plugin"`, so this is the reachability universe (CLAUDE.md §1).
export const SHIPPED = f => (f.startsWith('plugin/') || f === 'README.md')
  && (/\.(mjs|js|sh|json|md|cmd)$/.test(f) || /^plugin\/bin\/[a-z-]+$/.test(f))

/**
 * Definitions in `files` whose bare identifier appears nowhere else in `files`.
 *
 * Pure over an in-memory {path: source} map so the test can drive it on fixtures
 * and on real history without a checkout. A definition counts as reached at two
 * or more occurrences: one is its own `def`/`function` line.
 */
export function orphanDefinitions(files) {
  const uses = new Map()
  for (const source of Object.values(files)) {
    for (const m of source.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      uses.set(m[0], (uses.get(m[0]) ?? 0) + 1)
    }
  }
  const found = []
  let defined = 0
  for (const [path, source] of Object.entries(files)) {
    const isPy = /^plugin\/bin\/[a-z-]+$/.test(path) || path.endsWith('.py')
    const isJs = path.endsWith('.mjs') || path.endsWith('.js')
    if (!isPy && !isJs) continue
    for (const m of source.matchAll(isPy ? PY_DEF : JS_DEF)) {
      defined += 1
      if ((uses.get(m[1]) ?? 0) <= 1) found.push({ path, name: m[1] })
    }
  }
  return { orphans: found, defined }
}

/** The shipped tree at `rev`, as {path: source}. Throws only when git cannot answer. */
function shippedTreeAt(rev) {
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', rev], {
    encoding: 'utf8', maxBuffer: 1 << 28,
  }).split('\n').filter(Boolean).filter(SHIPPED)
  const files = {}
  for (const path of names) {
    try {
      files[path] = execFileSync('git', ['show', `${rev}:${path}`], {
        encoding: 'utf8', maxBuffer: 1 << 28,
      })
    } catch { /* a path git lists but cannot show is not a reachability fact. */ }
  }
  return files
}

function main(argv) {
  const rev = argv[0] || 'HEAD'
  let files
  try {
    files = shippedTreeAt(rev)
  } catch (error) {
    console.error(`orphan-sweep: could not read ${rev} — ${error.message.split('\n')[0]}`)
    return 2
  }
  // An empty universe is not a clean one (CLAUDE.md §3). Without this the sweep
  // reports "0 orphans" for a rev whose paths it failed to match, at full coverage.
  if (Object.keys(files).length === 0) {
    console.error(`orphan-sweep: ${rev} has no shipped files matching the scope — could not look`)
    return 2
  }
  const { orphans, defined } = orphanDefinitions(files)
  for (const { path, name } of orphans) console.log(`  ${path}: ${name}`)
  console.log(`${rev}: ${orphans.length} orphan(s) of ${defined} definitions`)
  if (orphans.length) {
    console.log('A definition nothing shipped calls is either dead or unwired. Delete it, or wire it '
      + '— there is deliberately no allowlist (BACKLOG §99).')
  }
  return orphans.length ? 1 : 0
}

// Importable without side effects — tests/package.test.mjs::importing a script
// runs its CLI on nobody asserts this across every script here.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
