// Validation summaries for the explicit Node check runner. Hook decisions live in Go.
import { walk } from './event-log.mjs'

function collectStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value)
    return output
  }
  if (!value || typeof value !== 'object') return output
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectStrings(child, output)
  }
  return output
}

function testCommand(command) {
  return /(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:pytest|unittest|phpunit|pest|rspec|cargo\s+test|go\s+test|dotnet\s+test|swift\s+test|node\s+--test)\b/i.test(command)
}

function reportsZeroTestWork(text, command) {
  if (/\bcargo\s+test\b/i.test(command)) {
    const running = [...text.matchAll(/\brunning\s+(\d+)\s+tests?\b/gi)]
      .map(match => Number(match[1]))
    if (running.length > 0) return running.every(count => count === 0)
    const passed = [...text.matchAll(/\btest result:\s+ok\.\s+(\d+)\s+passed\b/gi)]
      .map(match => Number(match[1]))
    if (passed.length > 0) return passed.every(count => count === 0)
  }
  if (/\bgo\s+test\b/i.test(command)) {
    // `go test ./...` prints one line per package: `ok  <pkg>  0.1s` where tests
    // ran, `?  <pkg>  [no test files]` where none exist, and `ok  <pkg>  [no tests
    // to run]` where a filter matched nothing. A testless package beside tested
    // ones is every module with a main-only or generated package; the phrase
    // match below read it as zero work, and ADR-061's refusal then denied every
    // commit of a green tree — reported from a Go repository on this machine
    // (BACKLOG §273, 2026-09-24). Work happened if any package line says `ok`
    // without `[no tests to run]`; adr-lint has said the same of fences since
    // §"rejects Go's healthy [no test files] status". Under `-json` the same lines
    // arrive inside `"Output":"…"` of one event per line, and a test that passed is
    // its own `{"Action":"pass",…,"Test":"…"}` event — a package-level pass alone
    // is not one (a filter that matched nothing passes the package too). Read from
    // a real `go test -json` run, not the docs (Codex review of 6331340).
    const packageRan = text.split('\n').some(line => {
      // A plain `ok  <package>  <duration>` line is read below, whatever the command (qh-core, 2026-10-27); here only -json.
      if (!line.startsWith('{')) return false
      if (/"Action":"pass"/.test(line) && /"Test":"/.test(line)) return true
      const output = /"Output":"((?:[^"\\]|\\.)*)"/.exec(line)?.[1]
      // Only a COMPLETE summary line counts: test2json splits an Output above
      // 1,024 bytes, so a long package path can put `[no tests to run]` in the
      // next event — an `ok ` fragment with no newline proves nothing (Codex, 6783a61).
      return output !== undefined && /^ok\s/.test(output) && output.endsWith('\\n') && !output.includes('[no tests to run]')
    })
    if (packageRan) return false
  }
  // qh-core, 2026-10-27: `make check` around `go test ./...` printed fourteen `ok  <package>  <duration>` lines and one
  // `?  <package>  [no test files]`, and the rules above are keyed on the COMMAND, so the phrase below matched the testless
  // package and every green run was no-work: the publish refusal then denied every commit of a green tree (BACKLOG §273's
  // class, reached through a wrapper). The runner's own summary is read whatever the command, but only in its exact shape:
  // a Go package line with a duration or `(cached)` and no `[no tests to run]`, or cargo's `test result: ok. N passed` with
  // N above zero. A looser `ok` would let any script's "ok" stand for a test run (CLAUDE.md §16).
  if (text.split('\n').some(line => /^ok\s+\S+\s+(?:\d+(?:\.\d+)?s|\(cached\))(?:\s|$)/.test(line) && !line.includes('[no tests to run]'))) return false
  if (/^test result: ok\. [1-9]\d* passed; \d+ failed\b/m.test(text)) return false
  return /\b(?:no tests? (?:found|ran|collected|matched|to run)|ran 0 tests?|running 0 tests?|collected 0 items|0 tests? (?:run|executed|collected|passed)|0 passing|tests\s+0|no test files)\b/i.test(text)
}

// A command that never got a status. 127 is "not found" and 126 is "found but
// not executable" in every POSIX shell; the rest is what the tools themselves
// say when the thing they need is absent.
// Windows says none of what POSIX says. Asked directly on 2026-08-26 — "is it
// true in windows environment too?" — and it was not: eight of nine shapes
// Windows produces were misread, six of them as a PASS. That is a FAIL-OPEN,
// the opposite of the accusation this taxonomy exists to stop, and the gate
// reported work verified by a check that never ran.
const NEVER_STARTED = new RegExp([
  // POSIX
  'command not found', 'no such file or directory', 'permission denied',
  'executable file not found', 'ENOENT', 'EACCES',
  // cmd.exe
  'is not recognized as an internal or external command',
  // PowerShell, which phrases it completely differently
  'is not recognized as the name of a cmdlet', 'CommandNotFoundException',
  // Win32 error text, which is what most Windows tooling surfaces — including
  // Docker Desktop when its pipe is not there
  'the system cannot find the file specified', 'the system cannot find the path specified',
  'access is denied',
  // Docker on either platform
  'cannot connect to the docker daemon', 'is the docker daemon running',
  // PHP, when the script it was handed is absent. Exit 1 and this one line —
  // measured twice on 2026-09-19 by two Laravel sessions, in clones with no vendor/.
  'could not open input file',
].join('|'), 'i')

const KILLED_ON_TIME = new RegExp([
  'timed out', 'timeout exceeded', 'deadline exceeded', 'ETIMEDOUT',
  // Windows has no signals; a killed process is reported by taskkill, which is
  // also how this harness kills a process tree there.
  'killed by signal', 'SIGKILL', 'SIGTERM', 'terminated by taskkill',
].join('|'), 'i')

// "Command not found" as an exit code: 127 on POSIX, 9009 from cmd.exe. 126 is
// POSIX's "found but not executable".
const NEVER_STARTED_EXITS = new Set([126, 127, 9009])

// ⚠ THESE PHRASES ARE READ ONLY FROM A PROCESS THAT SAID LITTLE. They are what a
// shell or an interpreter prints when the thing it was asked to run is absent —
// and also what any suite that TESTS file or permission errors prints all day. A
// Go suite ran, failed forty-one tests and exited 1, and was recorded `unstarted`
// because one failing assertion quoted "no such file or directory"; the next
// session read "never checked" about a check that was red (peer-measured
// 2026-09-19). A process that never started says almost nothing else; a suite that
// ran says a great deal. The exit codes above need no such help and are not
// subject to it.
const SAID_LITTLE_LINES = 8

function saidLittle(text) {
  return String(text).split('\n').filter(line => line.trim()).length <= SAID_LITTLE_LINES
}

// `anyCommand`: the caller already knows the command is the project's check
// (`qh-check`, ADR-060 T2), so a zero-test summary is read whatever the command is
// spelled. Without it, `sh check.sh` printing `tests 0` read as passed.
export function validationVerdict(result, command, { anyCommand = false } = {}) {
  const text = collectStrings(result).join('\n')
  const serialized = JSON.stringify(result)
  let exitCode = null
  walk(result, object => {
    for (const [key, value] of Object.entries(object)) {
      if (/^(?:exit_code|exitCode)$/.test(key) && Number.isInteger(value) && exitCode === null) {
        exitCode = value
      }
    }
  })
  if (/\b(?:command|process)\s+(?:is\s+)?(?:still\s+)?running\b|\brunning in background\b|\bbackground (?:task|process|command)(?:\s+with)?\s+ID\b/i.test(text)) {
    return 'running'
  }
  // Environment before verdict: a shell that could not start the command reports
  // 127, and reading that as "your tests failed" is the accusation this exists
  // to stop. 124 is GNU timeout's own code.
  // An explicit zero is authoritative, and it must be checked BEFORE the text: a
  // suite that passes while printing one of the phrases above — a test named for
  // the error it asserts — is a pass, not a missing command. Without this,
  // widening the patterns for Windows buys a fail-open in one direction by
  // selling a false alarm in the other.
  if (exitCode === 0) {
    return (anyCommand || testCommand(command)) && reportsZeroTestWork(text, command) ? 'no-work' : 'passed'
  }
  // ⚠ AN EXIT CODE IS EVIDENCE THAT A COMMAND NEVER STARTED; A PHRASE IS NOT. The
  // phrases used to return `unstarted` — a statement that the check never ran —
  // and a real one-line assertion failure, `FAIL testOpenFile: permission denied`
  // at exit 1, was recorded that way: a red check filed as an environment problem
  // (different-lineage review, 2026-09-19). The line count cannot settle it
  // either: the same missing script read `unstarted` or `failed` as its preamble
  // crossed eight lines. So a phrase from a process that said little is UNPROVEN
  // — it did not pass, and whether it ran is not known (ADR-005).
  if (NEVER_STARTED_EXITS.has(exitCode)) return 'unstarted'
  if (exitCode === 124) return 'timeout'
  if (saidLittle(text) && (NEVER_STARTED.test(text) || KILLED_ON_TIME.test(text))) return 'unproven'
  if (result.is_error === true || result.interrupted === true) return 'failed'
  if (exitCode !== null && exitCode !== 0) return 'failed'
  if (/["\']exit_code["\']\s*:\s*[1-9]\d*/i.test(serialized)
      || /\b(?:process|command)\b.{0,80}\bexit(?:ed)?(?: with)?(?: code)?\s+[1-9]\d*/i.test(text)) {
    return 'failed'
  }
  if ((anyCommand || testCommand(command)) && reportsZeroTestWork(text, command)) return 'no-work'
  return 'passed'
}
