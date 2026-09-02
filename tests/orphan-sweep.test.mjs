// BACKLOG §99 — a function the plugin defines that nothing shipped calls.
//
// The falsifiability half of this file is not decoration. The first version of
// this sweep counted uses across EVERY tracked file and reported clean at the
// commit that shipped the defect, because the orphan is referenced three times in
// tests/. A sweep that reports 0 at HEAD and 0 where a known defect lives is
// measuring nothing, and it looks exactly like a sweep that works.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { orphanDefinitions } from '../scripts/orphan-sweep.mjs'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const git = (...args) => execFileSync('git', args, {
  cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28,
})
const SHIPPED = f => (f.startsWith('plugin/') || f === 'README.md')
  && (/\.(mjs|js|sh|json|md|cmd)$/.test(f) || /^plugin\/bin\/[a-z-]+$/.test(f))

function shippedAt(rev) {
  const files = {}
  for (const path of git('ls-tree', '-r', '--name-only', rev).split('\n').filter(Boolean).filter(SHIPPED)) {
    try { files[path] = git('show', `${rev}:${path}`) } catch { /* unreadable blob */ }
  }
  return files
}

test('the shipped tree defines nothing it does not reach', () => {
  const { orphans, defined } = orphanDefinitions(shippedAt('HEAD'))
  assert.deepEqual(orphans, [],
    'these are defined in the plugin and called from nothing a user downloads')
  assert.ok(defined > 300, `expected the plugin to define hundreds of functions, saw ${defined}`)
})

test('...and it finds the two orphans this repository actually shipped', () => {
  // THE PROOF THE CHECK CAN FAIL, on real content rather than a fixture. Both
  // commits are in this repository's history, so this cannot rot into a tautology
  // the way a hand-built fixture can.
  //
  // dcb7df4 (v2.47.0) shipped `implausibly_fast` — BACKLOG §99, GitHub issue #6.
  // It carries `gitBranch` too, which §100 later deleted.
  const shipped = orphanDefinitions(shippedAt('dcb7df4')).orphans.map(o => o.name).sort()
  assert.deepEqual(shipped, ['gitBranch', 'implausibly_fast'],
    'the sweep must catch the defect at the commit that shipped it')

  // cb45a39 is the commit that deleted gitBranch (§100), so its parent still has
  // it and no longer has implausibly_fast — a second, independent data point.
  const before = orphanDefinitions(shippedAt('cb45a39^')).orphans.map(o => o.name)
  assert.deepEqual(before, ['gitBranch'])
})

test('tests and records do not make a function reachable', () => {
  // The exact mistake that made the first sweep useless, pinned so it cannot come
  // back: `implausibly_fast` was referenced 3x in tests/ and 2x in an ADR, and
  // counting those reported the corpus clean. A mutant proves a test notices a
  // change; it never proves production reaches the subject.
  const defined = { 'plugin/bin/gate': 'def only_a_test_calls_me(x):\n    return x\n' }
  assert.deepEqual(orphanDefinitions(defined).orphans,
    [{ path: 'plugin/bin/gate', name: 'only_a_test_calls_me' }])

  // Adding a test that exercises it changes nothing, because the corpus is the
  // shipped tree and a test file is not in it.
  const withCaller = { ...defined, 'plugin/bin/other': 'x = only_a_test_calls_me(1)\n' }
  assert.deepEqual(orphanDefinitions(withCaller).orphans, [],
    'a call from another SHIPPED file does make it reachable')
})

test('a name reached only through a string literal counts as reached', () => {
  // Why no allowlist is needed. A dispatch table, a config key or a help string
  // carries the bare identifier, so the arms §99 worried about resolve by
  // themselves. This is also why the scan must be bare-identifier and not `name(`.
  const dispatch = {
    'plugin/bin/gate': 'def _go_pass_marker(p):\n    return p\n',
    'plugin/bin/table': 'ARMS = {"go": "_go_pass_marker"}\n',
  }
  assert.deepEqual(orphanDefinitions(dispatch).orphans, [])

  // ...and the spread-operator call that a `name(` scan misreported as an orphan.
  const spread = {
    'plugin/scripts/a.mjs': 'export function expandExistingGlob(p) { return [p] }\n',
    'plugin/scripts/b.mjs': 'const all = [...expandExistingGlob(x)]\n',
  }
  assert.deepEqual(orphanDefinitions(spread).orphans, [])
})

test('an empty universe is not a clean one', () => {
  // CLAUDE.md §3. `[].every()`-shaped vacuity, one directory over: with no files
  // the sweep finds no orphans, and that must never read as a pass. The CLI turns
  // this into exit 2 rather than 0; here we pin that it also reports nothing
  // DEFINED, which is the signal the CLI branches on.
  const { orphans, defined } = orphanDefinitions({})
  assert.deepEqual(orphans, [])
  assert.equal(defined, 0, 'zero definitions is "could not look", and the CLI must exit 2')
})
