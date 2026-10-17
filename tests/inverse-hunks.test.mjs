import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { measure, operatorsOn, parseHunks, renderTable, verdictOf, waitForLoad } from '../scripts/inverse-hunks.mjs'

// ADR-109 T1. The script reverts one landed hunk at a time against the tests of its commit. Every fixture here is a repository
// this file creates; nothing below spawns git anywhere else (CLAUDE.md §9).

// An empty file, not the null device: git cannot open `\\.\nul` as a config file, and every fixture failed `git init` on
// the Windows CI job (push run 39067161309).
const emptyGitConfig = path.join(mkdtempSync(path.join(tmpdir(), 'qh-inverse-config-')), 'gitconfig')
writeFileSync(emptyGitConfig, '')
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: emptyGitConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (dir, ...args) => {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8', timeout: 60000, windowsHide: true, env: gitEnv })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const put = (dir, file, body) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  writeFileSync(path.join(dir, file), body)
}
const commit = (dir, subject) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', subject); return git(dir, 'rev-parse', 'HEAD') }

const BASE_SRC = `export function add(a, b) {
  return a + b
}
export function isSmall(n) {
  return n < 10
}
export function limit() {
  return 5
}
export function guard(v) {
  if (v) return 1
  const k = 3
  return k
}
`
const BASE_TEST = `import assert from 'node:assert/strict'
import test from 'node:test'
import { add, isSmall } from '../plugin/calc.mjs'

test('add adds', () => { assert.equal(add(1, 2), 3) })
test('isSmall says small', () => { assert.equal(isSmall(5), true) })
`

/** Four commits over one root: tests touched (A, B, C1, C2), tests named by the catalogue, and a file nothing tests. */
function fixture() {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'qh-inverse-fixture-'))
  git(dir, 'init', '-q')
  put(dir, 'plugin/calc.mjs', BASE_SRC)
  put(dir, 'tests/calc.test.mjs', BASE_TEST)
  put(dir, 'tests/mutations/plugin/calc.mjs.json', JSON.stringify({ mutations: [{ label: 'calc', file: 'plugin/calc.mjs', tests: ['tests/calc.test.mjs'], from: 'x', to: 'y' }] }))
  const base = commit(dir, 'base')
  // Commit 2 changes four hunks of plugin/ and one of tests/. isSmall's is seen by the test it adds; limit's is seen by nothing;
  // guard's two hunks open and close one brace, so reverting either alone does not parse.
  put(dir, 'plugin/calc.mjs', BASE_SRC
    .replace('return n < 10', 'return n < 20')
    .replace('return 5', 'return 7')
    .replace('if (v) return 1', 'if (v) { return 1')
    .replace('  return k\n', '  return k }\n'))
  put(dir, 'tests/calc.test.mjs', `${BASE_TEST}test('isSmall is small up to 19', () => { assert.equal(isSmall(15), true); assert.equal(isSmall(25), false) })\n`)
  const seen = commit(dir, 'seen, unseen and unparsable')
  // Commit 3 touches no test: its tests come from the catalogue entry naming this file. add's operands swap, which no test can tell.
  put(dir, 'plugin/calc.mjs', readFileSync(path.join(dir, 'plugin/calc.mjs'), 'utf8').replace('return a + b', 'return b + a'))
  const catalogued = commit(dir, 'catalogue names the tests')
  // Commit 4 adds a file no test and no catalogue entry names.
  put(dir, 'plugin/other.mjs', 'export const other = 1\n')
  const untested = commit(dir, 'a file nothing tests')
  return { dir, base, seen, catalogued, untested }
}

test('a reverted hunk the tests see is noticed, one they do not is unnoticed, and one that breaks the build is inconclusive', () => {
  const f = fixture()
  try {
    const headBefore = git(f.dir, 'rev-parse', 'HEAD')
    const result = measure({ repo: f.dir, range: `${f.base}..HEAD`, timeoutMs: 120000 })
    assert.deepEqual(result.commits.map(c => c.sha), [f.seen, f.catalogued, f.untested])
    const inverse = commitSha => result.commits.find(c => c.sha === commitSha).hunks.map(h => [h.path, h.kinds.inverse.verdict])
    assert.deepEqual(inverse(f.seen), [
      ['plugin/calc.mjs', 'noticed'], // isSmall: the added test fails on the original line
      ['plugin/calc.mjs', 'unnoticed'], // limit: nothing calls it
      ['plugin/calc.mjs', 'inconclusive'], // guard, opening brace alone: does not parse
      ['plugin/calc.mjs', 'inconclusive'], // guard, closing brace alone: does not parse
    ])
    // A revert that does not parse costs no fence run: three inverse runs, for isSmall, limit and the catalogued add.
    assert.equal(result.runs.inverse, 3)
    assert.deepEqual(inverse(f.catalogued), [['plugin/calc.mjs', 'unnoticed']], 'the catalogue entry for the file named the tests that ran')
    assert.deepEqual(inverse(f.untested), [['plugin/other.mjs', 'inconclusive']], 'no test to run is could-not-look, never green')
    // An operator that matches runs too: n < 20 flips to n >= 20 and the added test sees it.
    const seenHunk = result.commits[0].hunks[0]
    assert.equal(seenHunk.kinds.comparison.verdict, 'noticed')
    assert.equal(seenHunk.kinds.boolean, undefined, 'no boolean literal in the hunk: the kind does not apply')
    const text = renderTable(result, { contended: false })
    for (const word of ['inverse', 'comparison', 'boolean', 'numeric', 'total', 'fence runs per unnoticed']) assert.match(text, new RegExp(word))
    // It measured the repository without writing into it.
    assert.equal(git(f.dir, 'rev-parse', 'HEAD'), headBefore)
    assert.equal(git(f.dir, 'status', '--porcelain'), '')
    assert.equal(git(f.dir, 'worktree', 'list').split('\n').length, 1, 'every worktree it made is removed')
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})

test('hunks under tests/ are in no count, even when the pathspec reaches them', () => {
  const f = fixture()
  try {
    // The commit edits tests/calc.test.mjs as well; a pathspec of the whole tree sees that hunk, and the count must not.
    const all = measure({ repo: f.dir, range: `${f.base}..${f.seen}`, path: '.', timeoutMs: 120000 })
    assert.equal(all.commits[0].hunks.length, 4)
    assert.ok(all.commits[0].hunks.every(h => h.path === 'plugin/calc.mjs'))
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})

test('a baseline that does not pass makes every hunk of its commit inconclusive, and a spent budget leaves hunks unrun', () => {
  const f = fixture()
  try {
    // Break the test at the last commit: the tree its hunk is measured in was never green.
    put(f.dir, 'tests/calc.test.mjs', "import test from 'node:test'\ntest('red', () => { throw new Error('x') })\n")
    put(f.dir, 'plugin/other.mjs', 'export const other = 2\n')
    const red = commit(f.dir, 'a red baseline')
    const result = measure({ repo: f.dir, range: `${f.untested}..HEAD`, timeoutMs: 120000 })
    const hunk = result.commits.find(c => c.sha === red).hunks[0]
    assert.equal(hunk.kinds.inverse.verdict, 'inconclusive')
    assert.match(hunk.kinds.inverse.detail, /baseline/)
    const spent = measure({ repo: f.dir, range: `${f.base}..HEAD`, timeoutMs: 120000, deadline: 0, now: () => 1 })
    assert.ok(spent.commits.every(c => c.hunks.every(h => h.kinds.inverse.verdict === 'notrun')))
    assert.equal(git(f.dir, 'worktree', 'list').split('\n').length, 1)
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})

test('verdictOf: a pass is unnoticed, a failure noticed, and a run that says nothing is inconclusive', () => {
  const files = ['/x/a.test.mjs']
  const spec = (mark, n) => Array.from({ length: n }, (_, i) => `${mark} case ${i} (1.0ms)`).join('\n') + `\nℹ pass ${mark === '✔' ? n : 0}\nℹ fail ${mark === '✖' ? n : 0}\n`
  const baseline = { state: 'pass' }
  assert.equal(verdictOf({ baseline, files, run: { status: 0, signal: null, stdout: spec('✔', 2) } }).verdict, 'unnoticed')
  assert.equal(verdictOf({ baseline, files, run: { status: 1, signal: null, stdout: spec('✖', 1) } }).verdict, 'noticed')
  assert.equal(verdictOf({ baseline, files, run: { status: 1, signal: null, stdout: 'SyntaxError\n' } }).verdict, 'inconclusive', 'a file that did not load has no leaf results')
  assert.equal(verdictOf({ baseline, files, run: { status: null, signal: 'SIGTERM', stdout: '' } }).verdict, 'inconclusive', 'a timeout is could-not-look')
  assert.equal(verdictOf({ baseline: { state: 'fail' }, files, run: { status: 1, signal: null, stdout: spec('✖', 1) } }).verdict, 'inconclusive')
})

test('operators apply where they match and say nothing where they do not', () => {
  assert.deepEqual(operatorsOn('  return n < 20'), { comparison: '  return n >= 20', boolean: null, numeric: '  return n < 21' })
  assert.equal(operatorsOn('if (a === b) ok = true').comparison, 'if (a !== b) ok = true')
  assert.equal(operatorsOn('if (a === b) ok = true').boolean, 'if (a === b) ok = false')
  assert.equal(operatorsOn('const f = (x) => x').comparison, null, 'an arrow is not a comparison')
  assert.equal(operatorsOn('const v3 = x.y2').numeric, null, 'a digit inside a name is not a literal')
  assert.equal(operatorsOn('// n < 20 is true').comparison, null, 'a comment line is not code')
  assert.equal(operatorsOn('return').boolean, null)
})

test('hunks come out of a -U0 diff by file and line, tests/ excluded by the caller', () => {
  const diff = 'diff --git a/plugin/a.mjs b/plugin/a.mjs\nindex 1..2 100644\n--- a/plugin/a.mjs\n+++ b/plugin/a.mjs\n@@ -3 +3,2 @@\n-x\n+y\n+z\n@@ -9,0 +11 @@\n+w\n'
  const hunks = parseHunks(diff)
  assert.deepEqual(hunks.map(h => [h.path, h.newStart, h.newCount, h.added]), [['plugin/a.mjs', 3, 2, ['y', 'z']], ['plugin/a.mjs', 11, 1, ['w']]])
  assert.match(hunks[1].patch, /^diff --git a\/plugin\/a\.mjs b\/plugin\/a\.mjs\n/)
  assert.match(hunks[1].patch, /@@ -9,0 \+11 @@\n\+w\n$/)
})

test('waiting for load: a load that falls is not contended, one that stays high is, and the wait is bounded', () => {
  const clock = { t: 0 }
  const sleep = ms => { clock.t += ms }
  const now = () => clock.t
  const falling = [14, 12, 9]
  const calm = waitForLoad({ limit: 10, waitMs: 20 * 60000, pollMs: 60000, load: () => falling.shift() ?? 9, sleep, now })
  assert.equal(calm.contended, false)
  assert.equal(calm.waitedMs, 120000)
  clock.t = 0
  const high = waitForLoad({ limit: 10, waitMs: 5 * 60000, pollMs: 60000, load: () => 15, sleep, now })
  assert.equal(high.contended, true)
  assert.equal(high.waitedMs, 5 * 60000)
})
