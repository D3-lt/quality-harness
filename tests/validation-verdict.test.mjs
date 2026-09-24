// What `qh-check` concludes from a check that did not pass.
//
// `validationVerdict` decides the verdict of every check this plugin records, and
// until 2026-09-19 no test asserted it: `tests/lifecycle.test.mjs` IMPORTED it and
// never called it, which is worse than not importing it, because a grep for the
// name reads as coverage (audit 2026-09-18, G7).
//
// It was wrong in both directions at once, and two peer sessions measured one each
// against scratch clones of their own repositories:
//
//   - A Go suite RAN, failed ~41 tests, exited 1 — and was recorded `unstarted`,
//     because its output held "no such file or directory" inside a failing
//     assertion. The next session read `lastVerdict: "unstarted"` and could not
//     tell "never checked" from "checked and red".
//   - PHP could not open `vendor/bin/phpunit` in a clone with no vendor/, exited 1
//     with exactly one line — and was recorded `failed`: "your tests failed", about
//     tests that never loaded.
//
// The phrases are what a SHELL or an INTERPRETER says when the thing it was asked
// to run is absent. A process that never started says almost nothing else; a suite
// that ran says a great deal. So the phrase counts only when the output is short.
// Neither verdict certifies anything — this is about what the record tells the
// next reader, and an accusation is the expensive way to be wrong (CLAUDE.md §16).
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkEventName, validationVerdict } from '../plugin/scripts/lifecycle.mjs'
import { repositoryDiscovery } from '../plugin/scripts/qh-check.mjs'

const verdict = (exit_code, stdout, command = 'sh check.sh') =>
  validationVerdict({ exit_code, stdout }, command, { anyCommand: true })
const ran = count => Array.from({ length: count }, (_, index) => `--- PASS: TestThing${index} (0.00s)`).join('\n')

test('a suite that ran and failed is `failed`, whatever its assertions happen to say', () => {
  const output = `${ran(40)}\n--- FAIL: TestOpenMissing (0.00s)\n    store_test.go:41: open /x/y: no such file or directory\nFAIL`
  // The control: the phrase IS one this function acts on, or the case proves nothing.
  assert.equal(verdict(1, 'sh: 1: nosuchtool: no such file or directory'), 'unproven')
  assert.equal(verdict(1, output), 'failed', 'forty tests ran; that is not a command that never started')
  for (const phrase of ['permission denied', 'ENOENT: no such file', 'command not found', 'EACCES']) {
    assert.equal(verdict(1, `${ran(40)}\n--- FAIL: TestIt (0.00s)\n    x_test.go:9: got "${phrase}"\nFAIL`), 'failed', phrase)
  }
})

test('a check that could not start is `unstarted` by its EXIT CODE; by words alone it is `unproven`', () => {
  // The exit code alone: every POSIX shell uses 127 and 126, cmd.exe 9009.
  for (const code of [126, 127, 9009]) assert.equal(verdict(code, ''), 'unstarted', String(code))
  assert.equal(verdict(127, '> app@1.0.0 test\n> vitest run\n\nsh: vitest: command not found'), 'unstarted')
  // ⚠ A PHRASE IS NOT AN OBSERVATION THAT NOTHING RAN. These all returned
  // `unstarted`, and so did a real one-line assertion failure at exit 1 — a red
  // check filed as an environment problem (different-lineage review, 2026-09-19).
  // The words still keep a run that may never have started from being called a
  // FAILURE of the change; they no longer claim to know it did not start.
  assert.equal(verdict(1, 'FAIL testOpenFile: permission denied'), 'unproven', 'the case that was misfiled')
  // Exit 1 and one line: measured twice on 2026-09-19, by two Laravel sessions, in
  // clones that had no vendor/ directory.
  assert.equal(verdict(1, 'Could not open input file: vendor/bin/phpunit', 'php vendor/bin/phpunit'), 'unproven')
  // Windows shells exit 1 and say it in words; that is why the text is read at all.
  assert.equal(verdict(1, "'vitest' is not recognized as an internal or external command,\noperable program or batch file."), 'unproven')
  // Win32 error text, which is what most Windows tooling surfaces — Docker Desktop
  // included, when its pipe is not there.
  assert.equal(verdict(1, 'The system cannot find the file specified.'), 'unproven')
  assert.equal(verdict(1, 'The system cannot find the path specified.'), 'unproven')
  assert.equal(verdict(1, 'the run timed out'), 'unproven', 'and the same for a kill reported only in words')
  // Neither word certifies anything: only `check.passed` does.
  for (const word of ['unstarted', 'unproven']) assert.notEqual(checkEventName({ verdict: word, exit: 0, git: false }), 'check.passed')
})

test('a root query that did not answer is not a confirmed non-git repository', () => {
  assert.equal(repositoryDiscovery({ error: { code: 'ETIMEDOUT' }, status: null, stdout: '' }), null)
  assert.equal(repositoryDiscovery({ status: 128, stdout: '' }), false)
  assert.equal(repositoryDiscovery({ status: 0, stdout: '/repo\n' }), true)
  assert.equal(checkEventName({ verdict: 'passed', exit: 0, git: null }), 'check.unproven')
  assert.equal(checkEventName({ verdict: 'passed', exit: 0, git: false }), 'check.passed')
  assert.equal(checkEventName({ verdict: 'failed', exit: 1, git: null }), 'check.failed')
})

test('an explicit zero is a pass even when the output quotes an error', () => {
  assert.equal(verdict(0, `${ran(3)}\n--- PASS: TestReportsCommandNotFound (0.00s)\nok`), 'passed')
  assert.equal(verdict(0, 'ok  \tcommand not found is handled\t0.1s'), 'passed')
})

test('a timeout and a plain failure keep their own names', () => {
  assert.equal(verdict(124, ''), 'timeout')
  assert.equal(verdict(1, `${ran(2)}\n--- FAIL: TestX (0.00s)\nFAIL`), 'failed')
  assert.equal(verdict(2, ''), 'failed')
})

test('a green `go test ./...` with one testless package is `passed`; all testless is `no-work`', () => {
  // `go test ./...` prints `?  <pkg>  [no test files]` for a main-only or generated
  // package beside the `ok` lines of the packages that ran. The phrase match read
  // that as zero work, and ADR-061's refusal then denied every commit of a green
  // Go tree — reported from a Go repository on this machine (BACKLOG §273).
  const go = (out, cmd = 'go test ./...') => verdict(0, out, cmd)
  const ok = pkg => `ok  \tgithub.com/x/y/${pkg}\t0.123s`
  const none = pkg => `?   \tgithub.com/x/y/${pkg}\t[no test files]`
  assert.equal(go([ok('internal/a'), none('cmd/curve'), ok('internal/b')].join('\n')), 'passed', 'two packages ran')
  assert.equal(go([none('cmd/curve'), ok('internal/a')].join('\n')), 'passed', 'the testless package first')
  // The controls: zero work is still zero work.
  assert.equal(go([none('cmd/curve'), none('internal/a')].join('\n')), 'no-work', 'every package testless')
  assert.equal(go(none('cmd/curve'), 'go test ./cmd/curve'), 'no-work', 'one testless package alone')
  assert.equal(go(`ok  \tgithub.com/x/y/internal/a\t0.001s [no tests to run]`, 'go test -run zzz ./...'), 'no-work',
    'a filter that matched nothing is not work (CLAUDE.md §16 measured go test -run at exit 0)')
  // And a non-Go command with the same words keeps the phrase reading.
  assert.equal(verdict(0, 'no test files', 'sh check.sh'), 'no-work')
})

test('the same Go shapes under `go test -json` (real event lines) read the same', () => {
  // Codex review of 6331340: JSON events begin with `{`, so the `ok` line inside
  // `"Output"` never matched `^ok`, and the testless package's Output still said
  // `no test files` — a `-json` run of a green tree was `no-work` again. These
  // lines are a real `go test -json ./...` over one tested and one testless package
  // (go1.27.1), and a real `-run zzz` filter; the timestamps are shortened.
  const json = (out, cmd = 'go test -json ./...') => verdict(0, out, cmd)
  const testless = '{"Time":"T","Action":"output","Package":"example.com/m/cmd","Output":"?   \\texample.com/m/cmd\\t[no test files]\\n"}'
  const testPass = '{"Time":"T","Action":"pass","Package":"example.com/m/p","Test":"TestAdd","Elapsed":0}'
  const packageOk = '{"Time":"T","Action":"output","Package":"example.com/m/p","Output":"ok  \\texample.com/m/p\\t0.260s\\n"}'
  const packagePass = '{"Time":"T","Action":"pass","Package":"example.com/m/p","Elapsed":0.26}'
  const filteredOk = '{"Time":"T","Action":"output","Package":"example.com/m/p","Output":"ok  \\texample.com/m/p\\t0.066s [no tests to run]\\n"}'
  const filteredWarn = '{"Time":"T","Action":"output","Package":"example.com/m/p","Output":"testing: warning: no tests to run\\n"}'
  assert.equal(json([testless, testPass, packageOk, packagePass].join('\n')), 'passed', 'a test passed and its package printed ok')
  assert.equal(json([testless, packageOk, packagePass].join('\n')), 'passed', 'the package ok line alone is work')
  assert.equal(json([testless, testPass].join('\n')), 'passed', 'a test-level pass alone is work')
  // The controls.
  assert.equal(json(testless), 'no-work', 'every package testless')
  assert.equal(json([filteredWarn, filteredOk, packagePass].join('\n'), 'go test -json -run zzz ./p'), 'no-work',
    'a package-level pass with [no tests to run] is not work')
  // test2json splits an Output above 1,024 bytes (cmd/internal/test2json), so a long
  // package path lands `[no tests to run]` in the NEXT event; the `ok ` fragment has
  // no newline and is not a summary (Codex, 6783a61).
  const long = 'example.com/' + 'segment/'.repeat(130) + 'p'
  const splitHead = `{"Time":"T","Action":"output","Package":"${long}","Output":"ok  \\t${long}\\t0.066s "}`
  const splitTail = `{"Time":"T","Action":"output","Package":"${long}","Output":"[no tests to run]\\n"}`
  const longPass = `{"Time":"T","Action":"pass","Package":"${long}","Elapsed":0.07}`
  assert.equal(json([splitHead, splitTail, longPass].join('\n'), 'go test -json -run zzz ./...'), 'no-work',
    'a split summary is not a summary')
})
