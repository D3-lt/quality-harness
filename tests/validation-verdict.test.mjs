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
