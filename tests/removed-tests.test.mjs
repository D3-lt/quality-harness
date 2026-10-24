// A passing check names a test file the last pass of the same command ran with that is gone and did not move: a test that
// passed is not removed unremarked. Advice only, said once, at the first pass without it; the check's exit is its own.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { ledgerRefusal } from '../plugin/scripts/ledger-guard.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'
import { COUNT_DROP, GONE, SKIPPED, TESTS_GONE, UNREAD, isTestFile, removedTestsLine, testCounter, testNames } from '../plugin/scripts/removed-tests.mjs'
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

test('a test file that is a link whose target is gone is gone', { skip: process.platform === 'win32' ? 'a symbolic link needs a privilege a Windows runner may not have (CLAUDE.md §7)' : false }, async () => {
  const dir = repo('dangling')
  writeFileSync(path.join(dir, 'target.mjs'), '// the linked test\n')
  symlinkSync('target.mjs', path.join(dir, 'linked.test.mjs'))
  await run(dir)
  rmSync(path.join(dir, 'target.mjs'))
  const dangling = await run(dir)
  assert.ok(dangling.said.includes(GONE) && dangling.said.includes('linked.test.mjs'), `a dangling test link is kept as present: ${dangling.said}`)
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

const js = (...lines) => `import { test } from 'node:test'\n${lines.join('\n')}\n`

test('a test removed from a file that stays is named; a rename in place, a move, a reformat or an untouched file says nothing', async () => {
  const dir = repo('in-file')
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('one', () => {})", "test('two', () => {})", "test('three', () => {})"))
  writeFileSync(path.join(dir, 'y.test.mjs'), js("test('other', () => {})"))
  await run(dir)

  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('one', () => {})", "test('three', () => {})"))
  const removed = await run(dir)
  assert.ok(removed.said.includes(TESTS_GONE) && removed.said.includes('`x.test.mjs` (1 fewer; not there now: `two`)'), `a removed test is not named: ${removed.said}`)
  assert.ok(!removed.said.includes('`one`') && !removed.said.includes('`three`') && !removed.said.includes(GONE), removed.said)

  const quiet = async (label, files) => {
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)
    const { said } = await run(dir)
    assert.ok(!said.includes(TESTS_GONE) && !said.includes(SKIPPED) && !said.includes(UNREAD), `${label} is read as a removal: ${said}`)
  }
  await quiet('a rename in place', { 'x.test.mjs': js("test('uno', () => {})", "test('three', () => {})") })
  await quiet('a move to another file', { 'x.test.mjs': js("test('uno', () => {})"), 'y.test.mjs': js("test('other', () => {})", "test('three', () => {})") })
  await quiet('a name moved to the next line', { 'x.test.mjs': js('test(', "  'uno',", '  () => {})') })

  writeFileSync(path.join(dir, 'x.test.mjs'), js("// test('uno', () => {})"))
  const commented = await run(dir)
  assert.ok(commented.said.includes(TESTS_GONE) && commented.said.includes('`uno`'), `a test commented out is not named: ${commented.said}`)
})

test('a test the last pass ran that is skipped now is named; a conditional skip, a todo, or a skip already there is not', async () => {
  const dir = repo('skipped')
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('a', () => {})", "test('b', () => {})", "test('c', () => {})", "test('d', () => {})", "test.skip('e', () => {})"))
  await run(dir)
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test.skip('a', () => {})", "test('b', { skip: 'not on this branch' }, () => {})",
    "test('c', { skip: process.env.CI === '1' }, () => {})", "test.todo('d', () => {})", "test.skip('e', () => {})"))
  const { said } = await run(dir)
  assert.ok(said.includes(`${SKIPPED}: \`x.test.mjs\`: \`a\`, \`b\`. `), `a test skipped in place is not named, or a conditional one is: ${said}`)
  assert.ok(!said.includes(TESTS_GONE), said)
})

test('pytest and go test names are read as their runners collect them', async () => {
  const dir = repo('py-go')
  writeFileSync(path.join(dir, 'test_x.py'), 'import pytest\ndef test_one(): pass\ndef test_two(): pass\ndef test_three(): pass\n')
  writeFileSync(path.join(dir, 'x_test.go'), 'package x\nimport "testing"\nfunc TestA(t *testing.T) {}\nfunc TestB(t *testing.T) {}\n')
  await run(dir)
  writeFileSync(path.join(dir, 'test_x.py'), 'import pytest\n@pytest.mark.skipif(True, reason="r")\ndef test_one(): pass\n@pytest.mark.skip(reason="r")\ndef test_three(): pass\n')
  writeFileSync(path.join(dir, 'x_test.go'), 'package x\nimport "testing"\nfunc TestA(t *testing.T) { t.Skip("x") }\n')
  const { said } = await run(dir)
  assert.ok(said.includes('`test_x.py` (1 fewer; not there now: `test_two`)') && said.includes('`x_test.go` (1 fewer; not there now: `TestB`)'), said)
  assert.ok(said.includes(`${SKIPPED}: \`test_x.py\`: \`test_three\``) && !said.includes('`test_one`') && !said.includes('`TestA`'), said)
})

test('an entry written before test names were kept is still read, and compares names from the next pass on', async () => {
  const dir = repo('old-entry')
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('one', () => {})", "test('two', () => {})", "test('three', () => {})"))
  await run(dir)
  const state = path.join(stateDir(dir), 'passed-tests.json')
  const entries = JSON.parse(readFileSync(state, 'utf8'))
  for (const entry of Object.values(entries)) delete entry.tests
  writeFileSync(state, JSON.stringify(entries))
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('one', () => {})", "test('three', () => {})"))
  const first = await run(dir)
  assert.ok(!first.said.includes(UNREAD) && !first.said.includes(TESTS_GONE), `an entry from 3.8.56 is not read as one: ${first.said}`)
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('one', () => {})"))
  const next = await run(dir)
  assert.ok(next.said.includes(TESTS_GONE) && next.said.includes('`three`'), next.said)
})

test('test names: a file is read whole or not at all, and a name is the one the runtime sees', () => {
  assert.deepEqual(testNames('a.test.mjs', "test('a', f)\nit(\"b\", f)\ntest(`c`, f)\nawait test('it\\'s', f)\nconst e = \"test('e', f)\"\nv.it('f')\nsubmit('g')\n"),
    { run: ['a', 'b', 'c', "it's"], skip: [] })
  assert.deepEqual(testNames('a.test.mjs', "test(\r\n  'a',\r\n  f)\r\ntest('b', { label: 'skip: true,' }, f)\r\ntest('c', { timeout: 1, skip: 'why' }, f)\r\n"),
    { run: ['a', 'b'], skip: ['c'] })
  assert.deepEqual(testNames('a.test.mjs', "/*\ntest('commented', f)\n*/\ntest('a', f)\n"), { run: ['a'], skip: [] })
  // Any call this cannot name makes the file unread: a loop, test.each, a template with ${}, a call that does not start a line.
  for (const text of ["test('a', f)\nfor (const n of ['b']) test(n, f)\n", "test.each([1])('a %s', f)\n", 'test(`d ${x}`, f)\n',
    "describe('g', () => { test('a', f) })\n"]) assert.equal(testNames('a.test.mjs', text), null, text)
  assert.deepEqual(testNames('a.test.mjs', "test.after(() => {})\nit.beforeEach(() => {})\ntest('a', f)\n"), { run: ['a'], skip: [] })
  assert.equal(testNames('a.test.mjs', "test ('a', f)\n{ test('b', f) }\n"), null, 'a definition and a call that are not the same one read the file in part')
  for (const text of ["test('a', f)\n/* explanation\nends here */ test('b', f)\n", "test('a', f) /* opens\ntest('b', f)\n*/\n", "test('a', f)\n/* never closed\n"]) {
    assert.equal(testNames('a.test.mjs', text), null, `a block comment beside code, or one never closed, is cut cleanly: ${text}`)
  }
  assert.deepEqual(testNames('a.test.mjs', "const glob = 'migrations/*.sql'\ntest('a', f) // see a/*b\ntest('b', f)\n"), { run: ['a', 'b'], skip: [] },
    'a /* inside a string or after // is read as a block comment')
  // The review of fa59d357: what this cannot be sure of makes the file unread, never a file read without it.
  for (const text of ["test('a', f)\ntest\n('b', f)\n", "test('a', { skip: true, ...options }, f)\n", "test('a', { skip: true, skip: false }, f)\n"]) {
    assert.equal(testNames('a.test.mjs', text), null, text)
  }
  assert.equal(testNames('test_x.py', 'def test_outer():\n    def test_helper(): pass\n    test_helper()\n'), null, 'a nested def read as a test')
  assert.equal(testNames('test_x.py', 'class Helper:\n    def test_x(self): pass\n'), null, 'a method of a class pytest does not collect read as a test')
  assert.deepEqual(testNames('test_x.py', 'class TestK:\n    def test_a(self): pass\n\ndef test_b(): pass\n'), { run: ['test_a', 'test_b'], skip: [] })
  assert.deepEqual(testNames('test_x.py', '# Example delimiter: """\ndef test_a(): pass\ndef test_b(): """Doc."""\n'), { run: ['test_a', 'test_b'], skip: [] })
  assert.equal(testNames('test_x.py', 'x = 1  # """\ndef test_a(): pass\n'), null)
  assert.deepEqual(testNames('x_test.go', 'func TestA(t *testing.T) {}\nfunc TestB(\n\tt *testing.T,\n) {}\nfunc Test(t *testing.T) {}\nfunc TestMain(m *testing.M) {}\nfunc BenchmarkB(b *testing.B) {}\n// func TestC(t *testing.T) {}\n'),
    { run: ['TestA', 'TestB', 'Test'], skip: [] })
  assert.equal(testNames('x_test.go', 'func TestA(t *testing.T) {}\nfunc TestTable(t *testing.T, extra int) {}\n'), null)
  assert.deepEqual(testNames('test_x.py', '@pytest.mark.skip\ndef test_a(): pass\nclass TestK:\n    async def test_b(self): pass\n# def test_c(): pass\n"""\ndef test_d(): pass\n"""\ndef helper(): pass\n'),
    { run: ['test_b'], skip: ['test_a'] })
  assert.equal(testNames('CartTest.php', 'function testA() {}'), null)
})

test('an edit that keeps every test says nothing: a reformat, an example, a loop, a skipped twin or a requoted name', async () => {
  const dir = repo('keeps')
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('a', () => {})", "test('b', () => {})", "test('it\\'s', () => {})",
    "const example = \"test('ghost', () => {})\"", "validator.it('ghost2')", '/*', "test('ghost3', () => {})", '*/'))
  writeFileSync(path.join(dir, 'loop.test.mjs'), js("test('one', () => {})", "test('two', () => {})"))
  writeFileSync(path.join(dir, 'x_test.go'), 'package x\nimport "testing"\nfunc TestA(t *testing.T) {}\n')
  await run(dir)
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test(\r\n  'a',\r\n  () => {})", "test('b', { label: 'skip: true,' }, () => {})",
    "test.skip('b', () => {})", 'test("it\'s", () => {})'))
  writeFileSync(path.join(dir, 'loop.test.mjs'), js("for (const name of ['one', 'two']) test(name, () => {})"))
  writeFileSync(path.join(dir, 'x_test.go'), 'package x\nimport "testing"\nfunc TestA(\n\tt *testing.T,\n) {}\n')
  const { said } = await run(dir)
  assert.ok(!said.includes(TESTS_GONE) && !said.includes(SKIPPED) && !said.includes(UNREAD) && !said.includes(GONE), `an edit that keeps every test is read as a removal: ${said}`)
  // The reader still sees through the same file once it is whole again: the next removal is named.
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('a', () => {})", "test.skip('b', () => {})", 'test("it\'s", () => {})'))
  await run(dir)
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('a', () => {})", "test.skip('b', () => {})"))
  const next = await run(dir)
  assert.ok(next.said.includes(TESTS_GONE) && next.said.includes("`it's`"), next.said)
})

test('a test moved into a file that cannot be read whole is not named gone', async () => {
  const dir = repo('into-unread')
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('a', () => {})", "test('b', () => {})"))
  writeFileSync(path.join(dir, 'y.test.mjs'), js("for (const n of ['c']) test(n, () => {})"))
  await run(dir)
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('b', () => {})"))
  writeFileSync(path.join(dir, 'y.test.mjs'), js("for (const n of ['c']) test(n, () => {})", "test('a', () => {})"))
  const moved = await run(dir)
  assert.ok(!moved.said.includes(TESTS_GONE), `a move into an unread file is read as a removal: ${moved.said}`)
  // With the unread file unchanged, a removal is still named.
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('b', () => {})", "test('d', () => {})"))
  await run(dir)
  writeFileSync(path.join(dir, 'x.test.mjs'), js("test('b', () => {})"))
  const removed = await run(dir)
  assert.ok(removed.said.includes(TESTS_GONE) && removed.said.includes('`d`'), removed.said)
})

// Each runner's summary as it printed it on 2026-10-24 (node v24.22.1, pytest 9.0.3, Python 3.15 unittest, go1.27.3).
const counted = (text, chunk = 1) => {
  const counter = testCounter()
  const bytes = Buffer.from(text)
  for (let at = 0; at < bytes.length; at += chunk) counter.feed(bytes.subarray(at, at + chunk))
  return counter.result()
}
test('test counts are read from each measured runner summary, whole or split at any byte, and a run with none has no count', () => {
  const node = 'ℹ tests 10\nℹ suites 0\nℹ pass 5\nℹ fail 0\nℹ cancelled 0\nℹ skipped 4\nℹ todo 1\nℹ duration_ms 36.8\n'
  assert.deepEqual(counted(node), { passed: 5, skipped: 4 }, 'node spec, fed one byte at a time')
  assert.deepEqual(counted(node.replaceAll('ℹ', '#'), 7), { passed: 5, skipped: 4 }, 'node TAP')
  assert.deepEqual(counted(`${node}${node}`, 3), { passed: 10, skipped: 8 }, 'two suites in one check add up')
  assert.deepEqual(counted('\x1b[34mℹ pass 5\x1b[39m\r\n'), { passed: 5, skipped: 0 }, 'colour and CRLF')
  assert.deepEqual(counted('=================== 2 passed, 3 skipped, 1 xfailed in 0.01s ====================\n'), { passed: 2, skipped: 3 })
  assert.deepEqual(counted('2 passed, 3 skipped, 1 xfailed in 0.01s'), { passed: 2, skipped: 3 }, 'pytest -q, with no last newline')
  assert.deepEqual(counted('Ran 2 tests in 0.000s\n\nOK (skipped=1)\n'), { passed: 1, skipped: 1 })
  assert.deepEqual(counted('=== RUN   TestPlain\n--- PASS: TestPlain (0.00s)\n--- SKIP: TestSkip (0.00s)\n    --- PASS: TestPlain/sub (0.00s)\n--- PASS: Test_under (0.00s)\nPASS\nok  \tm\t0.004s\n'),
    { passed: 2, skipped: 1 }, 'go -v counts top-level tests, not subtests')
  assert.deepEqual(counted('{"Time":"t","Action":"pass","Package":"m","Test":"TestPlain","Elapsed":0}\n{"Time":"t","Action":"pass","Package":"m","Test":"TestPlain/sub"}\n{"Time":"t","Action":"skip","Package":"m","Test":"TestSkip"}\n{"Time":"t","Action":"pass","Package":"m","Elapsed":0}\n'),
    { passed: 1, skipped: 1 }, 'go -json counts top-level test events, not subtests or the package')
  for (const text of ['...........\n', 'ok  \tm\t0.005s\n', 'no tests ran in 0.01s\n', 'Ran 2 tests in 0.000s\n\nFAILED (failures=1)\n', '']) {
    assert.equal(counted(text), null, `a run whose output holds no summary was counted: ${JSON.stringify(text)}`)
  }
  // The review of 0d412bff: a retried suite prints the passes of its failed attempt too, and that total counts no suite.
  for (const text of ['ℹ pass 1\nℹ fail 1\nℹ pass 2\nℹ fail 0\n', '1 failed, 2 passed in 0.10s\n3 passed in 0.10s\n', '--- FAIL: TestA (0.00s)\n--- PASS: TestA (0.00s)\n',
    'Ran 2 tests in 0.0s\n\nFAILED (failures=1)\nRan 2 tests in 0.0s\n\nOK\n', '{"Action":"fail","Package":"m","Test":"TestA"}\n{"Action":"pass","Package":"m","Test":"TestA"}\n',
    'ℹ skipped 0\n', '10 files in 0.01s\n']) assert.equal(counted(text), null, `a failed, retried or passless run was counted: ${JSON.stringify(text)}`)
  assert.deepEqual(counted(`${'x'.repeat(200_000)}\nℹ pass 4\n`, 8192), { passed: 4, skipped: 0 }, 'a summary after a line with no end in sight')
})

// A repository whose check prints a node:test summary of `count.txt` passed tests.
function counting(name, config = {}) {
  const dir = repo(name)
  writeFileSync(path.join(dir, 'check.mjs'), "import { readFileSync } from 'node:fs'\nconsole.log(`ℹ tests 9\\nℹ pass ${readFileSync('count.txt', 'utf8').trim()}\\nℹ skipped 0`)\n")
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs', ...config }))
  return dir
}
test('a full pass that ran fewer tests than the last says so, unless a removal above already accounts for it', async () => {
  const dir = counting('count')
  writeFileSync(path.join(dir, 'count.txt'), '9')
  await run(dir)
  writeFileSync(path.join(dir, 'count.txt'), '9')
  const same = await run(dir)
  assert.ok(!same.said.includes(COUNT_DROP), same.said)
  writeFileSync(path.join(dir, 'count.txt'), '7')
  const fewer = await run(dir)
  assert.ok(fewer.said.includes(`${COUNT_DROP}: 7 passed, against 9 at that pass.`), `a drop in the count is not said: ${fewer.said}`)
  writeFileSync(path.join(dir, 'count.txt'), '8')
  const more = await run(dir)
  assert.ok(!more.said.includes(COUNT_DROP), `a rise is read as a drop: ${more.said}`)

  // A test file removed is named by the file-level sentence, and the count says nothing more.
  rmSync(path.join(dir, 'a.test.mjs'))
  writeFileSync(path.join(dir, 'count.txt'), '6')
  const named = await run(dir)
  assert.ok(named.said.includes(GONE) && !named.said.includes(COUNT_DROP), named.said)
})

test('a fast check is not counted, and a pass with no summary keeps no count to compare with', async () => {
  const dir = counting('count-fast', { fastCheck: 'node check.mjs' })
  writeFileSync(path.join(dir, 'count.txt'), '9')
  const fast = async () => {
    writeFileSync(path.join(dir, 'note.txt'), `${edits++}\n`)
    const err = sink()
    await runCheck({ cwd: dir, stdout: sink(), stderr: err, fast: true, env: { ...process.env, QUALITY_HARNESS_WAIT: '0' } })
    return err.text()
  }
  await fast()
  writeFileSync(path.join(dir, 'count.txt'), '3')
  assert.ok(!(await fast()).includes(COUNT_DROP), 'a fast check that selects its tests is compared')

  const quiet = repo('count-none')
  await run(quiet)
  await run(quiet)
  const state = JSON.parse(readFileSync(path.join(stateDir(quiet), 'passed-tests.json'), 'utf8'))
  assert.equal(Object.values(state)[0].count, undefined, 'a run with no summary kept a count')
})

test('a check that retried a failed attempt keeps no count, so the clean run after it says nothing', async () => {
  const dir = counting('count-retry')
  writeFileSync(path.join(dir, 'count.txt'), '2')
  await run(dir)
  // The same two tests, the first attempt failing one of them: its passes are printed beside the retry's.
  writeFileSync(path.join(dir, 'check.mjs'), "console.log('ℹ tests 2\\nℹ pass 1\\nℹ fail 1\\nℹ tests 2\\nℹ pass 2\\nℹ fail 0')\n")
  const retried = await run(dir)
  assert.equal(retried.exit, 0)
  writeFileSync(path.join(dir, 'check.mjs'), "console.log('ℹ tests 2\\nℹ pass 2\\nℹ fail 0')\n")
  const clean = await run(dir)
  assert.ok(!clean.said.includes(COUNT_DROP), `a retried run's total was compared: ${clean.said}`)
  writeFileSync(path.join(dir, 'check.mjs'), "console.log('ℹ tests 1\\nℹ pass 1\\nℹ fail 0')\n")
  const fewer = await run(dir)
  assert.ok(fewer.said.includes(`${COUNT_DROP}: 1 passed, against 2 at that pass.`), fewer.said)
})
