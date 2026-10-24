// A passing check names a test file the last pass of the same command ran with that is gone and did not move: a test that
// passed is not removed unremarked. Advice only, said once, at the first pass without it; the check's exit is its own.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { ledgerRefusal } from '../plugin/scripts/ledger-guard.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'
import { GONE, UNREAD, isTestFile, removedTestsLine } from '../plugin/scripts/removed-tests.mjs'
import { remove } from './helpers/remove.mjs'

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-removed-tests-')))
after(() => remove(scratch))
const sink = () => { const chunks = []; return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') } }
const git = (dir, ...args) => {
  const run = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout
}

// A repository whose declared check passes unless a file named `fail` exists, with two test files and a helper committed.
function repo(name) {
  const dir = path.join(scratch, name)
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  writeFileSync(path.join(dir, 'check.mjs'), "import { existsSync } from 'node:fs'\nprocess.exitCode = existsSync('fail') ? 1 : 0\n")
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs' }))
  writeFileSync(path.join(dir, 'a.test.mjs'), "// a\n")
  writeFileSync(path.join(dir, 'b.test.mjs'), "// b\n")
  writeFileSync(path.join(dir, 'helper.mjs'), "// helper\n")
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'start')
  return dir
}
let edits = 0
// Every run is on a new tree, so qh-check runs rather than reusing the last pass.
async function run(dir) {
  writeFileSync(path.join(dir, 'note.txt'), `${edits++}\n`)
  const err = sink()
  const exit = await runCheck({ cwd: dir, stdout: sink(), stderr: err, env: { ...process.env, QUALITY_HARNESS_WAIT: '0' } })
  return { exit, said: err.text() }
}

test('a pass names a test file the last pass ran with that is gone, once, and a move or a helper says nothing', async () => {
  const dir = repo('gone')
  const first = await run(dir)
  assert.equal(first.exit, 0)
  assert.ok(!first.said.includes(GONE) && !first.said.includes(UNREAD), `the first pass has nothing to compare with: ${first.said}`)

  rmSync(path.join(dir, 'a.test.mjs'))
  const removed = await run(dir)
  assert.equal(removed.exit, 0, 'the advice changed the exit')
  assert.ok(removed.said.includes(GONE) && removed.said.includes('a.test.mjs'), `a removed test file is not named: ${removed.said}`)
  assert.ok(!removed.said.includes('b.test.mjs'), `a test file still there is named: ${removed.said}`)

  const again = await run(dir)
  assert.ok(!again.said.includes(GONE) && !again.said.includes(UNREAD), `the removal is said again after a pass without it: ${again.said}`)

  renameSync(path.join(dir, 'b.test.mjs'), path.join(dir, 'moved.test.mjs'))
  rmSync(path.join(dir, 'helper.mjs'))
  const moved = await run(dir)
  assert.ok(!moved.said.includes(GONE) && !moved.said.includes(UNREAD), `a moved test file, or a removed helper, is read as a removed test: ${moved.said}`)
})

test('a failed run says nothing and keeps the last pass to compare with', async () => {
  const dir = repo('failed')
  await run(dir)
  rmSync(path.join(dir, 'a.test.mjs'))
  writeFileSync(path.join(dir, 'fail'), '')
  const red = await run(dir)
  assert.equal(red.exit, 1)
  assert.ok(!red.said.includes(GONE), `a failed run judged the test files: ${red.said}`)
  rmSync(path.join(dir, 'fail'))
  const green = await run(dir)
  assert.ok(green.said.includes(GONE) && green.said.includes('a.test.mjs'), `the failed run replaced the pass compared with: ${green.said}`)
})

test('a pass on a commit the last pass is not an ancestor of says nothing', async () => {
  const dir = repo('branch')
  git(dir, 'checkout', '-q', '-b', 'feature')
  writeFileSync(path.join(dir, 'feature.test.mjs'), '// feature\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'feature')
  await run(dir)
  rmSync(path.join(dir, 'note.txt'))
  git(dir, 'checkout', '-q', 'main')
  const other = await run(dir)
  assert.ok(!other.said.includes(GONE) && !other.said.includes(UNREAD), `a branch switch is read as a removed test: ${other.said}`)

  // The same history, with the removal on top of the pass: named.
  rmSync(path.join(dir, 'note.txt'))
  git(dir, 'checkout', '-q', 'feature')
  await run(dir)
  rmSync(path.join(dir, 'feature.test.mjs'))
  const ahead = await run(dir)
  assert.ok(ahead.said.includes(GONE) && ahead.said.includes('feature.test.mjs'), `a removal on top of the pass is not named: ${ahead.said}`)
})

test('a record of the last pass that cannot be read is could-not-look, never a removal', async () => {
  const dir = repo('unread')
  await run(dir)
  writeFileSync(path.join(stateDir(dir), 'passed-tests.json'), '{"torn')
  rmSync(path.join(dir, 'a.test.mjs'))
  const torn = await run(dir)
  assert.equal(torn.exit, 0)
  assert.ok(torn.said.includes(UNREAD), `an unreadable record is not said: ${torn.said}`)
  assert.ok(!torn.said.includes(GONE), `an unreadable record is read as a removal: ${torn.said}`)
  // That pass's files are kept, so the next comparison has a record again.
  rmSync(path.join(dir, 'b.test.mjs'))
  const next = await run(dir)
  assert.ok(next.said.includes(GONE) && next.said.includes('b.test.mjs') && !next.said.includes('a.test.mjs'), next.said)
})

test('a file with the same bytes as one that stays is no move, and a file now ignored is not gone', async () => {
  const dir = repo('same-bytes')
  mkdirSync(path.join(dir, 'b'))
  writeFileSync(path.join(dir, 'b', 'a.test.mjs'), '// a\n')
  await run(dir)
  rmSync(path.join(dir, 'a.test.mjs'))
  const twin = await run(dir)
  assert.ok(twin.said.includes(GONE) && twin.said.includes('`a.test.mjs`'), `bytes at a path the last pass had read as a move: ${twin.said}`)

  // Ignored now, and still there and runnable: git no longer lists it, and that is not a removal. Removed later, it is.
  writeFileSync(path.join(dir, '.gitignore'), 'b/\n')
  const ignored = await run(dir)
  assert.ok(!ignored.said.includes(GONE) && !ignored.said.includes(UNREAD), `a file now ignored is read as removed: ${ignored.said}`)
  rmSync(path.join(dir, 'b'), { recursive: true })
  const later = await run(dir)
  assert.ok(later.said.includes(GONE) && later.said.includes('b/a.test.mjs'), `an ignored file removed later is not named: ${later.said}`)
})

// A file `git add -A` cannot read fails the check's observation, so no pass reaches this through qh-check: it is a file that
// became unreadable between the observation and this read, so the module is called as qh-check calls it, after the pass.
test('a test file that is listed and cannot be read is not gone, and its last record is kept', { skip: process.platform === 'win32' || process.getuid?.() === 0 ? 'no POSIX permission bits to take away (CLAUDE.md §7), or root reads anything' : false }, async () => {
  const dir = repo('unreadable')
  await run(dir)
  const after = { head: git(dir, 'rev-parse', 'HEAD').trim(), at: new Date().toISOString() }
  const pass = { root: dir, fast: false, command: 'node check.mjs', record: { id: 'after-the-pass', after } }
  chmodSync(path.join(dir, 'a.test.mjs'), 0o000)
  let locked
  try { locked = removedTestsLine(pass) } finally { chmodSync(path.join(dir, 'a.test.mjs'), 0o644) }
  assert.ok(locked?.includes(UNREAD) && !locked.includes(GONE), `an unreadable test file is read as removed, or not said: ${locked}`)
  rmSync(path.join(dir, 'a.test.mjs'))
  const removed = removedTestsLine(pass)
  assert.ok(removed?.includes(GONE) && removed.includes('a.test.mjs'), `the unreadable file's last record was dropped: ${removed}`)
})

test('an entry for this check that qh-check did not write is could-not-look, and the check passes', async () => {
  for (const [name, entry] of [['nul-head', { head: '\u0000', files: {} }], ['null', null], ['empty', {}],
    ['string-files', { head: null, files: 'a.test.mjs' }], ['array-files', { head: null, files: ['a.test.mjs'] }],
    ['bad-hash', { head: null, files: { 'a.test.mjs': 'x' } }]]) {
    const dir = repo(`entry-${name}`)
    await run(dir)
    writeFileSync(path.join(stateDir(dir), 'passed-tests.json'), JSON.stringify({ 'full node check.mjs': entry }))
    rmSync(path.join(dir, 'a.test.mjs'))
    const odd = await run(dir)
    assert.equal(odd.exit, 0, `${name}: the advice changed the exit`)
    assert.ok(odd.said.includes(UNREAD), `${name}: an entry qh-check did not write is not said: ${odd.said}`)
    assert.ok(!odd.said.includes(GONE), `${name}: an entry qh-check did not write is read as a removal: ${odd.said}`)
  }
})

test('a test file is named as its runner collects it by default, and a helper or fixture data is not', () => {
  for (const file of ['a.test.mjs', 'src/x.spec.ts', 'web/App.test.tsx', 'pkg/cart_test.go', 'tests/test_cart.py', 'cart_test.py',
    'tests/Unit/CartTest.php', 'spec/cart_spec.rb']) assert.equal(isTestFile(file), true, file)
  // `go help packages`: the go tool ignores `testdata` and names starting with `.` or `_` (the Codex review of f56e7cb6).
  for (const file of ['tests/helpers/remove.mjs', 'testdata/a.json', 'contest.py', 'src/latest.ts', 'Test.php', 'spec/spec_helper.rb',
    'tests/fixtures/x.txt', 'protest_test.txt', 'testdata/cart_test.go', 'pkg/testdata/x/cart_test.go', 'pkg/_cart_test.go',
    'pkg/.cart_test.go', '_tools/cart_test.go']) assert.equal(isTestFile(file), false, file)
})

test('the ledger guard names passed-tests.json among the files only qh-check writes, in both guards', () => {
  assert.match(ledgerRefusal('x'), /passed-tests\.json/)
  const go = readFileSync(path.join(import.meta.dirname, '..', 'core', 'hooks', 'ledger_guard.go'), 'utf8')
  assert.match(go.slice(go.indexOf('func ledgerRefusal'), go.indexOf('func ledgerWarning')), /passed-tests\.json/)
})
