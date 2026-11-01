// spec-verify --implemented calls a binding passed only when it saw the named test run. Two ways it passed without that, found
// by the cold review of ADR-123 (2026-10-22): a runner whose filter selected nothing exits 0 (measured here 2026-10-22: cargo
// 1.99.1 prints "running 0 tests … 0 passed" and exits 0; .claude/rules/16 records vitest 4.1.6 and 5.0.0 printing
// "Tests  3 skipped" and PHPUnit 8.5.40 printing "No tests executed!", each exiting 0), and a Cmd override that does nothing.
// The runners here are stubs printing those measured outputs, so the grade turns on the output, not on the machine's toolchain.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const NO_POSIX_STUB = process.platform === 'win32' && 'a #!/bin/sh stub cannot be executed on Windows'

function fixture(testCell, cmd, files) {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-specran-'))
  cpSync(join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text, { mode: rel.includes('/bin/') ? 0o755 : 0o644 })
  }
  const spec = join(dir, 'spec-selftest.md')
  writeFileSync(spec, readFileSync(spec, 'utf8').replace(
    '| F-1 | A conforming ADR + task pair makes adr-lint exit 0 | `test_selftest_fixture.py::test_gates_run` | @spec | |',
    `| F-1 | A conforming ADR + task pair makes adr-lint exit 0 | \`${testCell}\` | @implemented | ${cmd} |`))
  return { dir, spec }
}
function stub(dir, name, output, exit = 0) {
  const stubs = join(dir, 'stub-bin')
  mkdirSync(stubs, { recursive: true })
  writeFileSync(join(stubs, name), `#!/bin/sh\nprintf '%s' '${output}'\nexit ${exit}\n`, { mode: 0o755 })
  return { ...process.env, PATH: `${stubs}${delimiter}${process.env.PATH ?? ''}` }
}
const verify = (f, runEnv) => spawnSync('python3', [join(bin, 'spec-verify'), '--implemented', '--repo', f.dir, f.spec],
  { cwd: f.dir, env: runEnv, encoding: 'utf8', timeout: 60_000 })

test('a runner whose filter selected nothing is UNRUN, and one that reports the test passing is a pass', { skip: NO_POSIX_STUB }, t => {
  // cargo is chosen from the repository root (detect_stack); path_stack knows no Cargo marker.
  const rust = { 'Cargo.toml': '[package]\nname = "c"\nversion = "0.1.0"\n', 'src/lib.rs': '#[test]\nfn it_works() { assert_eq!(1, 1); }\n' }
  const cargo = fixture('src/lib.rs::it_works', '', rust)
  t.after(() => remove(cargo.dir))
  const none = verify(cargo, stub(cargo.dir, 'cargo', '\nrunning 0 tests\n\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out; finished in 0.00s\n'))
  assert.equal(none.status, 4, `cargo selecting nothing is could-not-run:\n${none.stdout}`)
  // cargo 1.99.1, measured 2026-10-22: every test the filter matched prints its own `test <path> ... ok|ignored` line.
  const ran = verify(cargo, stub(cargo.dir, 'cargo', '\nrunning 1 test\ntest it_works ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n'))
  assert.equal(ran.status, 0, `cargo reporting the bound test ok is a pass:\n${ran.stdout}`)
  // The release review of 3.8.52 (A2): a substring filter that matched another test, while the bound one was ignored.
  const other = verify(cargo, stub(cargo.dir, 'cargo', '\nrunning 2 tests\ntest it_works ... ignored\ntest it_works_other ... ok\n\ntest result: ok. 1 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s\n'))
  assert.equal(other.status, 4, `another test passing is not the bound one passing:\n${other.stdout}`)
  // The verification review of 3.8.52's fix (A2): a bound name two tests end in is not attributable, whichever passed.
  const twin = verify(cargo, stub(cargo.dir, 'cargo', '\nrunning 2 tests\ntest it_works ... ignored\ntest other::it_works ... ok\n\ntest result: ok. 1 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s\n'))
  assert.equal(twin.status, 4, `two tests named it_works cannot tell which one ran:\n${twin.stdout}`)
  // The second verification review (A2): an ignored test with a reason prints `... ignored, <reason>`; it is still a candidate.
  const reason = verify(cargo, stub(cargo.dir, 'cargo', '\nrunning 2 tests\ntest it_works ... ignored, needs network\ntest other::it_works ... ok\n\ntest result: ok. 1 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s\n'))
  assert.equal(reason.status, 4, `an ignored test with a reason is still one of two candidates:\n${reason.stdout}`)

  const web = { 'web/package.json': '{"name":"w"}\n', 'web/node_modules/.keep': '', 'web/a.test.js': "test('adds', () => { expect(1).toBe(1) })\n" }
  const vitest = fixture('web/a.test.js::adds', '', web)
  t.after(() => remove(vitest.dir))
  const skipped = verify(vitest, stub(vitest.dir, 'npx', ' RUN  v4.1.6\n Test Files  1 skipped (1)\n      Tests  3 skipped (3)\n'))
  assert.equal(skipped.status, 4, `vitest skipping every test is could-not-run:\n${skipped.stdout}`)
  const passed = verify(vitest, stub(vitest.dir, 'npx', ' Test Files  1 passed (1)\n      Tests  1 passed | 2 skipped (3)\n'))
  assert.equal(passed.status, 0, `vitest with a passed test is a pass:\n${passed.stdout}`)

  const php = { 'api/composer.json': '{}\n', 'api/tests/ATest.php': '<?php\nclass ATest { public function testYes() {} }\n',
    'api/vendor/bin/phpunit': "#!/bin/sh\nprintf 'No tests executed!\\n'\nexit 0\n" }
  const unit = fixture('api/tests/ATest.php::testYes', '', php)
  t.after(() => remove(unit.dir))
  const empty = verify(unit, process.env)
  assert.equal(empty.status, 4, `phpunit executing no test is could-not-run:\n${empty.stdout}`)
  writeFileSync(join(unit.dir, 'api/vendor/bin/phpunit'), "#!/bin/sh\nprintf 'OK (1 test, 1 assertion)\\n'\nexit 0\n", { mode: 0o755 })
  assert.equal(verify(unit, process.env).status, 0, 'phpunit reporting OK (1 test) is a pass')
})

test('a Cmd override that runs nothing is UNRUN, not a pass', { skip: NO_POSIX_STUB }, t => {
  // The release review of 3.8.52 (A1): a separator, a comment or a chain of no-ops runs nothing either (each measured in bash
  // and sh, 2026-10-22: exit 0).
  // The second verification review (A1): a command no execution reaches runs nothing either: after `exit`, or behind `||` a
  // no-op answered (measured in bash and sh, 2026-10-22: exit 0 without running the test).
  for (const cmd of ['`true`', '`:`', '`exit 0`', '`/usr/bin/true`', '`true;`', '`exit 0;`', '`: # no test`', '`true && :`', '` true ; : `',
    '`exit 0; test -f nowhere.md`', '`true \\|\\| test -f nowhere.md`']) {
    const f = fixture('test_selftest_fixture.py::test_gates_run', cmd, {})
    t.after(() => remove(f.dir))
    const run = verify(f, process.env)
    assert.equal(run.status, 4, `${cmd} proves nothing ran:\n${run.stdout}`)
    // The no-op refusal itself, not any UNRUN: since ADR-134 an override that runs and prints nothing is UNRUN too, so a
    // generic match no longer notices the no-op guard removed (the Codex review of 558e552e, 2026-11-01).
    assert.match(run.stdout, /runs no test/, `${cmd} is refused before it runs:\n${run.stdout}`)
  }
  // Twin: an override that runs something real, and names the bound test (ADR-134), still answers with its exit.
  const real = fixture('test_selftest_fixture.py::test_gates_run', '`test -f spec-selftest.md && echo test_gates_run`', {})
  t.after(() => remove(real.dir))
  assert.equal(verify(real, process.env).status, 0)
  // Twin: a no-op beside a real command runs that command.
  const chained = fixture('test_selftest_fixture.py::test_gates_run', '`true; test -f nowhere.md`', {})
  t.after(() => remove(chained.dir))
  assert.equal(verify(chained, process.env).status, 3, 'the real command after the no-op is run, and its failure is a failure')
})

// ADR-134: an override that exits 0 is a pass only when its output names the bound test. Reproduced 2026-10-31 through this
// CLI: `printf audit-marker` printed [PASS] and exited 0 with no test run (BACKLOG §404 named the class on 2026-10-22).
test('a Cmd override that exits 0 without naming the bound test is UNRUN and not a pass', { skip: NO_POSIX_STUB }, t => {
  // The dirty answers: output that says nothing about test_gates_run, and no output at all.
  for (const cmd of ['`printf audit-marker`', '`test -f spec-selftest.md`']) {
    const f = fixture('test_selftest_fixture.py::test_gates_run', cmd, {})
    t.after(() => remove(f.dir))
    const run = verify(f, process.env)
    assert.equal(run.status, 4, `${cmd} exits 0 without showing the bound test ran:\n${run.stdout}`)
    assert.match(run.stdout, /UNRUN/)
    assert.match(run.stdout, /test_gates_run/, `the reason names the test it looked for:\n${run.stdout}`)
  }
  // The clean answer: the output names the bound test.
  const named = fixture('test_selftest_fixture.py::test_gates_run', '`printf "test_gates_run PASSED"`', {})
  t.after(() => remove(named.dir))
  assert.equal(verify(named, process.env).status, 0, 'an override whose output names the bound test is a pass')
  // A named failure is still a failure, not UNRUN.
  const failed = fixture('test_selftest_fixture.py::test_gates_run', '`printf "test_gates_run FAILED"; exit 1`', {})
  t.after(() => remove(failed.dir))
  assert.equal(verify(failed, process.env).status, 3, 'an override that exits 1 is a failing test')
})
