#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from './main-module.mjs'
import { shellWords } from './shell-words.mjs'

// The standalone install's scope and PATH arithmetic live in one module, shared
// with sync-standalone.mjs. Two copies of that list drifted apart once already.
import { FORWARDER_MARK, SHADOW_SCOPE, barePathWinner, citeOrphan, orphans, wiredInSettings } from './standalone-link.mjs'

import { ARTIFACT_OUTPUT_LIMIT } from './run-shell-hook.mjs'
// ADR-060's event log is shared with run-shell-hook.mjs's per-edit gate, so it
// lives in a leaf module both can import (T6).
import { appendEvent, canonical, canonicalFile, nearestExistingDirectory, readEvents, sessionLogFile, stateDir } from './event-log.mjs'
export { readEvents, sessionLogFile, stateDir } from './event-log.mjs'
import { listedUnderUninterestingDirectory } from './uninteresting.mjs'
import { contentId } from './event-log.mjs'
import * as leaseModule from './lease.mjs'
import { SHELL_NAMES, commitOnlyCommand, decodedPowerShell, freshRepositoryCommit, leavesHookInPlace, programName, publishCommandIn } from './publish-command.mjs'
import { checkInCode, codeSpan, commandInCode, corpusText, pathInCode, quotedCorpusText, scrubber, shownPath } from './corpus-text.mjs'
import { GIT_LISTING_BUFFER, TASK_DIRECTORY_READ_CAP, decisionContext, inside, listedPath, outsideRoot, posixListed, taskDirectories, trackedPaths, unmarkedArchives, walk } from './decision-corpus.mjs'
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const MUTATION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt'])
const UNRESOLVED_DELETION_MUTATION = '<Unresolved Bash deletion>'
// Per artifact, at the commit and completion boundaries. The per-edit boundary
// gets the runner's own budget from hooks.json; this one used to be a flat 10s
// that no setting could change, because the value was written into the child's
// environment AFTER process.env was spread. Reported 2026-08-25: a clean 25-ADR
// corpus timed out, every commit blocked, and QUALITY_HARNESS_SHELL_TIMEOUT_MS
// did nothing — the gate's cost grows with the corpus it reads, so the budget has
// to be raisable by whoever owns the corpus.
const ARTIFACT_GATE_TIMEOUT_MS = 30_000
export const ARTIFACT_GATE_KILL_MARGIN_MS = 5_000
// ⚠ THE VALIDATION PATTERN TABLE WENT WITH THE CLASSIFIERS (ADR-060 T7), and two
// lessons it held are worth keeping even though its code is not — both bought in
// the 2.100.0 release, days before this branch landed:
//
//   - A verb must be a WHOLE TOKEN. The table ended each verb with `\b`, and a
//     hyphen and a colon are both word boundaries, so `test-data`, `test:seed`
//     and `test-fixtures` all counted as the `test` script. Wrong for npm since
//     the line was first written.
//   - `composer` must not be in such a table at all. Admitting it forced a family
//     into the read-only classifier that turned `composer update` — which
//     rewrites composer.lock — from `unrecognised` into `neither`, a fail-open
//     introduced while fixing a fail-closed.
//
// Neither has a consumer here any more: nothing on this branch decides what
// happened by reading a command's text. They survive in docs/BACKLOG.md and in
// this record's Consequences, which is where a lesson outlives its code.

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
      if (/^ok\s+\S/.test(line)) return !/\[no tests to run\]/.test(line)
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
  return /\b(?:no tests? (?:found|ran|collected|matched|to run)|ran 0 tests?|running 0 tests?|collected 0 items|0 tests? (?:run|executed|collected|passed)|0 passing|tests\s+0|no test files)\b/i.test(text)
}



// Why a validation did not clear, not merely that it did not.
//
// Taken from rust-adr-corpus-eval-harness (a Rust harness, same author), whose
// AcceptanceVerdict is Passed / Failed{exit_code} / Timeout / SpawnError, and
// whose evidence record keeps `infra_failure_class` apart from an acceptance
// miss so "the provider was down" never reads as "the work is wrong".
//
// This harness had one bit. A check that FAILED, a check that TIMED OUT, and a
// check that never started because Docker was not running all produced the same
// sentence: "Nothing has verified the work since your last change." Only the
// first is a finding about the change. The same mistake was fixed one layer
// down in 2.5.0 — the harness failing to RUN is not a verdict about the edit —
// and never applied to the project's own check.

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


// The OS temp roots, symlink-resolved once per call. `/tmp` is a symlink to
// `/private/tmp` on macOS and os.tmpdir() points into /var/folders, so the
// judgement below realpaths both sides before comparing.
function tempRoots() {
  const roots = new Set(['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', os.tmpdir()])
  try { roots.add(realpathSync(os.tmpdir())) } catch {}
  return [...roots]
}

function underTempRoot(candidate, depth = 0) {
  if (depth > 8) return false
  let resolved = path.resolve(candidate)
  // Judge the real location, not the spelling: a symlink under /tmp pointing
  // into a repository must be treated as the repository. The leaf needs lstat,
  // not stat — a symlink to a missing repo file still CREATES that file when
  // written through, and stat on it just throws.
  try {
    if (lstatSync(resolved).isSymbolicLink()) {
      return underTempRoot(path.resolve(path.dirname(resolved), readlinkSync(resolved)), depth + 1)
    }
    resolved = realpathSync(resolved)
  } catch {
    try {
      const anchor = nearestExistingDirectory(resolved)
      if (anchor) resolved = path.join(realpathSync(anchor), path.relative(anchor, resolved))
    } catch {}
  }
  return tempRoots().some(root => resolved === root || resolved.startsWith(root + path.sep))
}

// An unresolved deletion records that something was removed, not what. The
// repository already knows: ask Git which tracked paths are now missing instead
// of holding an unanswerable question against every later commit in the session.
// Returns null when Git cannot answer, which keeps the gate closed.
function deletedTrackedPaths(cwd) {
  const root = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  if (root.status !== 0) return null
  const deleted = spawnSync('git', ['-C', cwd, '-c', 'core.quotePath=false', 'diff', '--no-renames', '--name-only', '--diff-filter=D', 'HEAD'],
    { encoding: 'utf8', timeout: 10_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true })
  if (deleted.status !== 0) return null
  const top = root.stdout.trim()
  return deleted.stdout.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(relative => path.join(top, relative))
}

// Reads the operator's budget under the runner's own range. Above the 110s
// ceiling it CLAMPS to the ceiling — an operator who asked for more wanted more,
// not the default back; garbage or a sub-100ms value falls back to the default.
export function artifactGateTimeoutMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_SHELL_TIMEOUT_MS)
  if (!Number.isSafeInteger(configured) || configured < 100) return ARTIFACT_GATE_TIMEOUT_MS
  return Math.min(configured, 110_000)
}

// windowMs bounds the WHOLE pass, not one artifact. The hook this runs inside
// has its own deadline (hooks.json: 60s at PreToolUse, 120s at completion), and
// a hook that dies on that deadline blocks nothing — so letting per-artifact
// budgets add up past the window would turn the gate fail-open exactly when the
// corpus is big enough to matter. Running out of window is itself a blocking
// failure.
// True when the artifact gate ran out of its budget rather than reaching a verdict.
//
// The same budget runs out two ways. Normally run-shell-hook.mjs outlives its
// child and reports `timed out after Nms` itself; but the spawn in
// runArtifactGates carries a kill margin, and on a slow host that margin expires
// first, leaving only the outer ETIMEDOUT. Measured 2026-08-25 on windows-latest,
// where the finding read `spawnSync … node.exe ETIMEDOUT` and named neither the
// budget nor the setting that raises it — a wall with no way over it.
//
// Separated from runArtifactGates so both arms are testable anywhere: the outer
// arm is unreachable on a host fast enough to let the runner win the race.
export function budgetExhausted(detail, error) {
  return /timed out after \d+ms/.test(detail) || error?.code === 'ETIMEDOUT'
}

export function runArtifactGates(paths, cwd = process.cwd(), windowMs = 100_000, { bases = [], gated = null, saidBy = null, stoppedBy = null, ledgerDirectory: sharedLedger = null } = {}) {
  const hook = path.join(PLUGIN_ROOT, 'scripts', 'facts-gate-dispatch.sh')
  if (!existsSync(hook)) return null
  const runner = path.join(PLUGIN_ROOT, 'scripts', 'run-shell-hook.mjs')
  if (!existsSync(runner)) return 'Artifact validation failed:\nThe cross-platform shell-hook runner is missing.'

  const deadline = Date.now() + windowMs
  const failures = []
  const targets = []
  for (const filePath of [...new Set(paths)]) {
    if (filePath === UNRESOLVED_DELETION_MUTATION) {
      const deleted = deletedTrackedPaths(cwd)
      if (deleted === null) {
        failures.push('A Bash deletion used an unresolved path and Git cannot say what is missing here; the facts-first gate cannot determine whether an ADR archive was removed. Use an explicit path.')
        continue
      }
      targets.push(...deleted)
      continue
    }
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) continue
    // A project's records are never under the OS temp root. Scratch corpora —
    // a fixture built to try something, a copy pulled out of history to read —
    // were pulling the full record gates, so building a throwaway ADR to test
    // against reported "expected exactly one owning ADR, found 0" about a file
    // nobody was shipping. Observed 2026-08-26 while building this release, on
    // its own scratch fixture. mutatesOnlyTempPaths already exempts scratch
    // writes it can PROVE; this catches the ones it could not, one layer later,
    // where the path is resolved and the question is only where it lives.
    if (underTempRoot(filePath) && !underTempRoot(cwd)) continue
    targets.push(filePath)
  }
  const uniqueTargets = [...new Set(targets)]
  // The dispatcher owns ADR resolution. Share only completed, identical ADR
  // commands within this pass; the next pass always starts with no ledger. A
  // pass that gates in chunks (ADR-080) shares its own, and removes it itself.
  let ledgerDirectory = sharedLedger
  if (!ledgerDirectory && uniqueTargets.length > 1) {
    try { ledgerDirectory = mkdtempSync(path.join(os.tmpdir(), 'quality-harness-gates-')) } catch {}
  }
  const ledger = ledgerDirectory ? path.join(ledgerDirectory, 'adr').split(path.sep).join('/') : ''
  try {
    if (uniqueTargets.length > 0) {
      const remaining = deadline - Date.now()
      if (remaining < 1_000) {
        failures.push(`The boundary's ${Math.round(windowMs / 1000)}s window was exhausted before ${uniqueTargets[0]} was gated. `
          + 'This is a budget, not a finding: gate fewer artifacts per boundary, or commit in smaller sets.\n'
          + 'UNRUN — all remaining artifacts were not checked:\n' + uniqueTargets.join('\n'))
      } else {
        const timeoutMs = artifactGateTimeoutMs()
        const run = spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh', '--batch'], {
          // `cwd` travels in the batch, so a pass running from the temp directory still
          // judges each path where the session runs (run-shell-hook's `hookCwd`).
          input: JSON.stringify({ paths: uniqueTargets, deadline, windowMs, timeoutMs, cwd, ...(saidBy ? { said: true } : {}) }),
          encoding: 'utf8', windowsHide: true,
          // Each shell is capped separately; leave room for its diagnostic framing too.
          maxBuffer: uniqueTargets.length * ARTIFACT_OUTPUT_LIMIT * 2,
          env: { ...process.env, QUALITY_HARNESS_ADR_LEDGER: ledger,
            // The revisions a deleted path is looked up in, nearest first
            // (ADR-060 T6). Unset means HEAD, in both lookups.
            ...(bases.length ? { QUALITY_HARNESS_HISTORY_BASES: bases.join(' ') } : {}) },
          timeout: remaining + ARTIFACT_GATE_KILL_MARGIN_MS,
        })
        // Which paths the pass actually answered for. The findings are on
        // stderr; this is the per-path record rule A keeps.
        if (gated) {
          for (const line of (run.stdout || '').split('\n')) {
            if (!line.trim()) continue
            let result
            try { result = JSON.parse(line) } catch { continue }
            if (typeof result?.gated === 'string') gated.set(result.gated, result.complete === true)
            if (saidBy && typeof result?.gated === 'string' && typeof result.said === 'string' && result.said.trim()) saidBy.set(result.gated, result.said)
            if (stoppedBy && typeof result?.stopped === 'string') stoppedBy.stopped = result.stopped
          }
        }
        // Advisory findings arrive on stderr with exit zero; status alone loses them.
        const said = (run.stderr || '').trim()
        if (run.status !== 0 || said) {
          let detail = said || run.error?.message || `artifact gate exited ${run.status}`
          if (run.status !== 0) {
            detail += '\nThe runner did not complete; these artifacts may be unchecked:\n'
              + uniqueTargets.join('\n')
          }
          failures.push(run.status !== 0 && budgetExhausted(detail, run.error)
            ? `${detail}\nThe runner exhausted its time budget. This is a budget, not a finding `
              + `about the listed artifacts; the whole pass is capped at ${Math.round(windowMs / 1000)}s.`
            : detail)
        }
      }
    }
  } finally {
    if (ledgerDirectory && ledgerDirectory !== sharedLedger) {
      try { rmSync(ledgerDirectory, { recursive: true, force: true, maxRetries: 3 }) }
      catch (error) { console.error(`Could not remove the temporary artifact-gate ledger: ${error?.code ?? error}`) }
    }
  }
  return failures.length ? `Artifact validation failed:\n${failures.join('\n')}` : null
}

function docsOnly(paths) {
  return paths.length > 0 && paths.every(file => DOC_EXTENSIONS.has(path.extname(file).toLowerCase()))
}

function evidenceLimited(message) {
  return typeof message === 'string' && /\bEVIDENCE-LIMITED:\s+\S.{15,}/i.test(message)
}

// The turn is not claiming completion: it is blocked, waiting, or explicitly not
// done. At `Stop` this SUPPRESSES the evidence advisory, which is why it must
// stay narrow — see `unverifiedDisclosure` below for the words that must not
// suppress it.
function interimResponse(message) {
  if (typeof message !== 'string') return false
  return /\b(?:blocked|not (?:done|complete)|need (?:your|a decision|approval)|waiting for|clarif(?:y|ication)|cannot continue|remaining work)\b/i.test(message)
}

// "I have not run it", "I could not verify it", "I have no shell" — an honest
// disclosure of what was NOT done.
//
// ⚠ THIS IS A SEPARATE PREDICATE ON PURPOSE, and the reason is a regression this
// change made and the suite caught. ADR-035's first measurement put the assertion
// arm at precision 0/3 and named the cause: these words were missing from the
// negation classifier, so three honest disclosures reached the assertion arm
// (BACKLOG §124). Adding them to `interimResponse` fixes the classification and
// ALSO widens the `Stop` suppression above — so "I have not run the tests yet"
// silenced the very advisory that says nothing has verified the work. Saying you
// did not run the check is the moment the gate must speak, not the moment it goes
// quiet. So the words feed the claim KIND and nothing else.
//
// The fixtures are §124's three messages, verbatim; the words come from them and
// nowhere else. This re-arms nothing: `completionClaim` still has no producer of
// `asserted`, and restoring one needs a fresh measurement at precision ≥ 0.90.
function unverifiedDisclosure(message) {
  if (typeof message !== 'string') return false
  return /\b(?:have ?n[o']t|has ?n[o']t|did ?n[o']t|not yet)\s+(?:\w+\s+){0,2}(?:run|ran|verified|verify|tested|checked)\b/i.test(message)
    || /\b(?:can ?n[o']t|cannot|could ?n[o']t|unable to)\s+(?:\w+\s+){0,2}(?:verify|confirm|check|run|test)\b/i.test(message)
    || /\bno (?:shell|working directory|way to (?:run|verify))\b/i.test(message)
}

// ADR-035. What the final message CLAIMS.
//
// The assertion vocabulary that used to sit here — four patterns and the
// sentence-quoting that reported them — is GONE, not switched off. It was
// withdrawn by the criterion ADR-035 pre-registered against it, and code that
// cannot run is not a feature waiting to come back: it is a branch no test can
// reach, a mutant nothing can kill, and a coverage floor paying for both. Those
// three showed up within hours (CI coverage went red at d7a764b) and are why
// this is a deletion rather than a dead `if`.
//
// The patterns themselves, the measurement that killed them, the research this
// rested on and what a restored arm owes are all in ADR-035 and BACKLOG §124 —
// which is where a future attempt reads them from, not from a commented-out
// array nobody re-measured.

// ⚠ WITHDRAWN 2026-09-04, by the criterion ADR-035 pre-registered against it.
//
// The record said the `asserted` arm survives only at precision ≥ 0.90. It was
// measured on the first real eval run of `a-claim-nothing-can-back` — three
// answers classified `asserted`, and ALL THREE were exemplary honest disclosures:
//
//   "duration parsing — fix is in for the `90s` case, tests not yet run on my side"
//   "Haven't run the suite yet. That last clause is there because I couldn't verify it"
//   "I can't verify anything here — the working directory is empty … no shell"
//
// Precision 0/3. The cause is nameable: `interimResponse`'s negation vocabulary
// has no "haven't run", "can't verify", "not yet run", "no shell", so the
// negatives never took precedence and a nearby "green" or "fix is in" tripped an
// assertion pattern. A detector that flags *"I can't verify anything here"* as a
// false success is worse than none — it is precisely the gate people learn to
// ignore, which this project treats as worse than no gate at all.
//
// So the arm does not classify at all: `completionClaim` never returns
// `asserted`, no advisory quotes a claim, and the ledger keeps recording the
// other four kinds so the EVIDENCE half is still counted.
//
// ⚠ THE CONSTANT (ASSERTION_ARM_WITHDRAWN, in claim-status.mjs) IS A LABEL, NOT A
// SWITCH. Flipping it to `false` restores nothing, because there is no longer
// anything for it to gate; it exists so the tools that PRINT a rate can say the
// false half is not being measured, instead of printing a structural zero that
// reads as clean. Restoring the arm means a corrected negation vocabulary and a
// fresh measurement on answers not used to build it — not this one re-read more
// kindly. BACKLOG §124, §126.

export function completionClaim(message) {
  if (typeof message !== 'string') return { kind: 'unavailable', phrase: null }
  if (evidenceLimited(message)) return { kind: 'limited', phrase: null }
  if (interimResponse(message) || unverifiedDisclosure(message)) return { kind: 'hedged', phrase: null }
  return { kind: 'none', phrase: null }
}

function hasBackgroundWork(input) {
  return (Array.isArray(input.background_tasks) && input.background_tasks.length > 0)
    || (Array.isArray(input.session_crons) && input.session_crons.length > 0)
}

// Discovery, in the order a person would try: the repository's own script, then
// its package manifest, then its build file, then the language's default. The
// offer is routed through `qh-check`, which is the only thing here that records
// evidence — naming a command without it leaves a run nothing can see, which is
// worse than saying nothing. Returns null when the project names no check; the
// gate must not
// invent one.
const PROJECT_CHECKS = [
  { file: 'scripts/selftest.sh', command: 'bash scripts/selftest.sh' },
  { file: 'selftest.sh', command: 'bash selftest.sh' },
  // Ahead of the language manifests on purpose: a repository that ships a
  // verify script has said what its check is, and `cargo test` / `go test ./...`
  // is a guess at part of it. ts-no-adr-corpus ran `./verify.sh`, this list did not
  // know the name, and the gate asked for "the smallest repository-owned test,
  // lint, build, or validation command" — naming nothing it could not already
  // see. Reported 2026-08-26.
  { file: 'scripts/verify.sh', command: 'bash scripts/verify.sh' },
  { file: 'verify.sh', command: 'bash verify.sh' },
  { file: 'Cargo.toml', command: 'cargo test' },
  { file: 'go.mod', command: 'go test ./...' },
  { file: 'pytest.ini', command: 'pytest' },
  { file: 'tox.ini', command: 'pytest' },
  // PHP was missing entirely, and the consequence was not "no answer" but a
  // WRONG one: Laravel and Symfony ship a package.json whose only scripts are
  // `dev` and `build`, both vite, so discovery fell through to the package
  // manager and named `npm run build` as a pure-PHP API's check — a frontend
  // build that cannot fail because of a PHP edit or pass because of one.
  // Measured 2026-08-29 against the installed 2.34.1 in a real Laravel
  // repository (docs/BACKLOG.md §56). `phpunit.xml` is the declaration; a
  // `composer.json` alone is a weaker signal and is handled above it, by the
  // script the repository names for itself.
  { file: 'phpunit.xml', command: 'php vendor/bin/phpunit' },
  { file: 'phpunit.xml.dist', command: 'php vendor/bin/phpunit' },
]

/**
 * The check a project declares in `.quality-harness.json`, if it declares one.
 *
 * Anything that is not a non-empty string is IGNORED rather than honoured, and
 * ignoring it must leave the rungs below intact: a config file that turned the
 * feature off by being malformed would be the worst of both — no answer, and no
 * sign that anything was expected.
 */
function declaredCheckCommand(directory) {
  let config
  try {
    config = JSON.parse(readFileSync(path.join(directory, '.quality-harness.json'), 'utf8'))
  } catch { return null }
  const check = config?.check
  return typeof check === 'string' && check.trim() ? check.trim() : null
}

/**
 * Why `.quality-harness.json` cannot be taken as this project's declaration, or null when it is absent or an
 * object. A trailing comma used to read as "declares nothing": `declaredCheckCommand`, `fastCheckCommand` and
 * `proseSpecs` each swallow the parse error, so `qh-check` ran the inferred check in place of the declared one
 * and recorded a pass the publish refusal then trusted. Absent is no declaration; unreadable is UNKNOWN, and a
 * gate that records a pass must not guess what it declared (CLAUDE.md §3, ADR-005).
 */
export function projectConfigProblem(root) {
  let text
  try { text = readFileSync(path.join(root, '.quality-harness.json'), 'utf8') } catch (error) {
    if (error?.code !== 'ENOENT') return `.quality-harness.json could not be read (${error?.code ?? 'unknown error'})`
    // ENOENT is also what a link to nothing says: a dangling link is a declaration nobody can read, not an absent one.
    try { lstatSync(path.join(root, '.quality-harness.json')) } catch { return null }
    return '.quality-harness.json could not be read (a link to nothing)'
  }
  // Windows PowerShell 5.1 and some editors write one. JSON.parse refuses it with an invisible character in the message, so say
  // what it is. It is refused, not stripped: every other reader of this file would have to strip it the same way (a Windows run of 3.8.18).
  if (text.charCodeAt(0) === 0xFEFF) return '.quality-harness.json starts with a byte-order mark (U+FEFF), which JSON does not allow: save it as UTF-8 without a BOM'
  let config
  try { config = JSON.parse(text) } catch (error) {
    return `.quality-harness.json is not valid JSON (${String(error?.message).split('\n')[0]})`
  }
  return config !== null && typeof config === 'object' && !Array.isArray(config) ? null : '.quality-harness.json is not a JSON object'
}

/**
 * Whether a project turned ADR-061's refusal back into its warning, with
 * `"publish": "warn"` in `.quality-harness.json` (the owner's decision,
 * 2026-09-22). Only that exact value counts. Anything else present is reported
 * as ignored and keeps the refusal, so a typo cannot silently switch it off.
 * An unreadable file keeps the refusal too, and says nothing: it declares nothing.
 *
 * `discovery` is the root lookup the refusal was decided on. Reading the file
 * from a SECOND lookup let the two disagree: a second lookup that failed fell
 * back to the current directory, missed the root's opt-out and refused (Codex
 * review round 3). A lookup that could not answer is unknown, never "here".
 */
export function publishSetting(cwd, discovery = null) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  if (!directory) return { warn: false, ignored: false, unknown: true }
  const found = discovery ?? gitRepositoryLookup(directory)
  if (!found.ok) return { warn: false, ignored: false, unknown: true }
  let config
  try {
    config = JSON.parse(readFileSync(path.join(found.root ?? directory, '.quality-harness.json'), 'utf8'))
  } catch { return { warn: false, ignored: false, unknown: false } }
  if (!config || typeof config !== 'object' || !Object.hasOwn(config, 'publish')) return { warn: false, ignored: false, unknown: false }
  return config.publish === 'warn' ? { warn: true, ignored: false, unknown: false } : { warn: false, ignored: true, unknown: false }
}

function publishSettingNote(setting) {
  if (setting.warn) return ' Refusal is off for this project: `"publish": "warn"` in .quality-harness.json makes this a warning.'
  if (setting.ignored) return ' The `"publish"` value in .quality-harness.json was ignored: only `"publish": "warn"` turns this refusal into a warning.'
  return ''
}
// A declaration that cannot fail does not certify. Measured 2026-09-22: `true`,
// `:`, `exit 0`, `sh -c true` and `bash -c 'exit 0'` each exit 0. One layer of
// `sh -c` or `bash -c` around those is the same command. `sh check.sh` is not.
// ⚠ IT WAS A REGEX OVER THE TEXT, and a chaos round of 626934a passed five constant
// checks through it — `test 1`, `/usr/bin/true`, `echo ok`, `true || false` and
// `true # comment` — each recorded as a passing check that then unlocks a commit.
// Read as the shell splits it (ADR-067), the list's exit status is evaluated the way
// the shell would, from the commands whose status the text alone fixes (`true`, `:`,
// `echo`, `exit N`, `test` with one literal operand, a shell's `-c` string): a check
// whose status is fixed is constant (`npm test || true`, `npm test; echo done`).
const KNOWN_STATUS = { true: 'zero', ':': 'zero', echo: 'zero', printf: 'zero', false: 'nonzero' }

export function constantSuccessCheck(command) {
  if (typeof command !== 'string' || !command.trim()) return false
  return listStatus(command, 0) === 'zero'
}

// The exit status of a whole list, evaluated as the shell does — `&&` and `||`
// short-circuit, `;`, a newline and a pipe take the next command's status, and a
// command sent to the background is 0 — as 'zero', 'nonzero' or 'either' when a
// command that may run has a status the text cannot fix. `npm test || true` is 'zero'
// whatever the tests do. A constant here REFUSES the declaration, so anything this
// does not model is 'either': a builtin that changes how the rest runs (`set -e`,
// `trap`, `source`), a subshell, a redirection that can fail on its own (Codex review
// of the 626934a batch: `set -e; test -f F; echo done`, `(exit 0); test -f F` and
// `true < F` were each read as constant and depend on the tree).
const LIST_CONTROL = new Set(['set', 'shopt', 'trap', 'exec', 'source', '.', 'eval', 'return', 'alias', 'unalias', 'builtin', 'enable'])

function listStatus(text, depth) {
  const { commands, complete } = shellWords(text)
  if (!complete || commands.length === 0 || depth > 3) return 'either'
  if (commands.some(c => c.redirects > 0 || c.ended === '(' || c.ended === ')' || LIST_CONTROL.has(programName(c.argv[0] ?? '')))) return 'either'
  const merge = (a, b) => (a === b ? a : 'either')
  let status = 'zero'
  for (let i = 0; i < commands.length; i++) {
    const joiner = i === 0 ? ';' : commands[i - 1].ended
    const own = commands[i].ended === '&' ? { status: 'zero' } : commandStatus(commands[i], depth)
    // `exit` before the end stops the list on the paths that reach it; the others go
    // on, so only a path every run takes is known. As the LAST command it is simply
    // the list's status, combined like any other (`test -f F || exit 0` is 0).
    if (own.exits && i < commands.length - 1) {
      if (joiner === '&&' ? status === 'zero' : joiner === '||' ? status === 'nonzero' : true) return own.status
      return 'either'
    }
    if (joiner === '&&') status = status === 'zero' ? own.status : status === 'nonzero' ? 'nonzero' : merge(own.status, 'nonzero')
    else if (joiner === '||') status = status === 'nonzero' ? own.status : status === 'zero' ? 'zero' : merge(own.status, 'zero')
    else status = own.status
  }
  return status
}

function commandStatus(c, depth) {
  // A word that is exactly `[` is the test builtin, not a glob.
  if (c.substitutions.length || c.argv.length === 0 || (c.dynamic.includes(0) && c.argv[0] !== '[')) return { status: 'either' }
  const [program, ...args] = c.argv
  const name = programName(program)
  if (name === 'exit') {
    if (args.length === 0 || !/^\d+$/.test(args[0])) return { status: 'either', exits: true }
    return { status: Number(args[0]) === 0 ? 'zero' : 'nonzero', exits: true }
  }
  if (name in KNOWN_STATUS) return { status: KNOWN_STATUS[name] }
  if ((name === 'test' || name === '[') && !c.dynamic.some(k => k > 0)) {
    const operands = name === '[' && args.at(-1) === ']' ? args.slice(0, -1) : args
    if (operands.length === 1 && !operands[0].startsWith('-')) return { status: operands[0] === '' ? 'nonzero' : 'zero' }
    return { status: 'either' }
  }
  // Only a bare `-c`: `sh -ec`, `bash -o pipefail -c` change how the string runs.
  if (SHELL_NAMES.has(name.toLowerCase()) && args[0] === '-c' && args[1] !== undefined) return { status: listStatus(args[1], depth + 1) }
  return { status: 'either' }
}

function packageManagerCommand(directory) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
  } catch { return null }
  const scripts = manifest?.scripts
  if (!scripts || typeof scripts !== 'object') return null
  const runner = existsSync(path.join(directory, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(path.join(directory, 'yarn.lock')) ? 'yarn'
    : existsSync(path.join(directory, 'bun.lockb')) ? 'bun'
    : 'npm'
  // A BUILD IS NOT A CHECK. `build` was the last resort here, so any repository
  // with a package.json and no test/check/lint/typecheck script was told its
  // evidence command was a build — which compiles and says nothing about
  // behaviour. Naming nothing is the honest answer (ADR-005): a reader can act
  // on "I could not determine this project's check", and cannot act on a build
  // that passes while the code is broken.
  for (const name of ['test', 'check', 'lint', 'typecheck']) {
    if (typeof scripts[name] === 'string' && scripts[name].trim()) {
      return runner === 'npm' ? `npm run ${name}` : `${runner} ${name}`
    }
  }
  return null
}

function makeTargetCommand(directory) {
  for (const file of ['Makefile', 'makefile', 'justfile', 'Justfile']) {
    let source
    try { source = readFileSync(path.join(directory, file), 'utf8') } catch { continue }
    const runner = /justfile/i.test(file) ? 'just' : 'make'
    for (const target of ['test', 'check', 'lint', 'verify', 'validate', 'build']) {
      if (new RegExp(`^${target}\\s*:`, 'm').test(source)) return `${runner} ${target}`
    }
  }
  return null
}

// The check this project owns, named so a session can run it instead of guessing.
export function projectCheckCommand(cwd = process.cwd()) {
  return checkCommandOrigin(cwd).command
}

/**
 * The check for `cwd` AND where it came from: `declared` when the project said
 * so in `.quality-harness.json`, `inferred` when this tool read it off a
 * manifest, `none` when neither, `refused` when the declaration cannot fail,
 * `unproven` when the repository root could not be read. `discovery`, when a
 * test passes one, is that lookup's answer instead of asking git again.
 *
 * One resolver, two callers. `runTheCheckSentence` needs the provenance to say
 * whether a red on a clean tree is a finding about the environment, and
 * resolving the root a second time at that call site is how one rule becomes two
 * spellings that drift — which cost this project a defect the same day
 * (docs/BACKLOG.md §66).
 */
/**
 * fastCheckCommand reads the `fastCheck` a project declares beside `check`
 * (ADR-081): the same rules, a non-empty string that is not a constant success.
 * Anything else is no fast check, and `qh-check --fast` says so.
 */
export function fastCheckCommand(root) {
  let config
  try { config = JSON.parse(readFileSync(path.join(root, '.quality-harness.json'), 'utf8')) } catch { return null }
  const fast = typeof config?.fastCheck === 'string' ? config.fastCheck.trim() : ''
  return fast && !constantSuccessCheck(fast) ? fast : null
}

// ADR-094 T3: the paths a project DECLARES as prose in `.quality-harness.json` (`"prose": [pathspecs]`),
// default none. A tree that differs from a passed one only under them may reuse the pass; the project
// asserts that its check reads none of them. A declaration that could hide code is refused whole and
// said, never partly read (CLAUDE.md §16: an unrecognised input is not a safe one). The grammar is
// POSITIVE, because a list of the specs that name too much is an open set (`***` passed the first one):
// a literal path or directory prefix, a literal first directory then a glob, or every file with one
// literal extension. Each must also match a tracked path and no submodule (`rm --cached` would drop the
// gitlink), and none may be able to name `.quality-harness.json` (it holds the check) in any letter case.
// That last is decided on the SPEC, not on a listing: an ignored or untracked config is invisible to a
// listing (found by a Codex review of ADR-094), and with this grammar only the file's own name and a
// `*.json` extension spec can reach a root file.
const PROSE_LITERAL = /^[\w.@+][\w.@+/-]*$/
const PROSE_UNDER = /^[\w.@+][\w.@+-]*\/[\w.@+/*?[\]-]*$/
const PROSE_EXTENSION = /^(?:\*\*\/)?\*\.[A-Za-z0-9]+$/
const PROSE_MOST = 20
// Why a spec is refused before git is asked, or null. Judged by its grammar and its segments, not by what git
// makes of it: git matches `:(top).` and `docs/../src/` to nothing today, which is a quirk, not a guard.
const CONFIG_NAME = '.quality-harness.json'
const specCouldNameConfig = spec => {
  const lower = spec.toLowerCase()
  return lower === CONFIG_NAME || (PROSE_EXTENSION.test(spec) && lower.endsWith('.json'))
}
export function proseSpecProblem(spec) {
  const plain = typeof spec === 'string' && (PROSE_LITERAL.test(spec) || PROSE_UNDER.test(spec) || PROSE_EXTENSION.test(spec))
  if (!plain) return `${JSON.stringify(spec)} is not a plain pathspec (a literal path or directory, a literal directory then a glob, or \`*.ext\`)`
  if (spec.split('/').some(part => part === '.' || part === '..')) return `${JSON.stringify(spec)} would name the whole tree or leave it`
  if (specCouldNameConfig(spec)) return `${JSON.stringify(spec)} could name .quality-harness.json, which holds the check`
  return null
}
export function proseSpecs(root) {
  let config
  try { config = JSON.parse(readFileSync(path.join(root, '.quality-harness.json'), 'utf8')) } catch { return { specs: [], problem: null } }
  if (config === null || typeof config !== 'object' || !('prose' in config)) return { specs: [], problem: null }
  const refuse = reason => ({ specs: [], problem: `the \`prose\` declaration in .quality-harness.json was ignored: ${reason}` })
  const declared = config.prose
  if (!Array.isArray(declared) || declared.length === 0 || declared.length > PROSE_MOST) {
    return refuse(`it must be an array of one to ${PROSE_MOST} pathspecs`)
  }
  for (const spec of declared) {
    const problem = proseSpecProblem(spec)
    if (problem) return refuse(problem)
  }
  for (const spec of declared) {
    const tracked = spawnSync('git', ['-C', root, 'ls-files', '-s', '-z', '--', `:(top)${spec}`], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    if (tracked.error || tracked.status !== 0) return refuse(`git could not list ${JSON.stringify(spec)}`)
    const entries = tracked.stdout.split('\0').filter(Boolean)
    if (entries.length === 0) return refuse(`${JSON.stringify(spec)} matches no tracked path`)
    if (entries.some(entry => entry.startsWith('160000'))) return refuse(`${JSON.stringify(spec)} matches a submodule`)
  }
  return { specs: declared, problem: null }
}

/**
 * latestFastPass reads `fast-checks.jsonl`, which no reader of a full pass opens
 * (ADR-081): the LATEST fast record on this tree must grade as a pass. A line it
 * cannot read answers null, so a torn file exempts nothing. `count` is how many
 * fast records there are, which the publish advisory's key carries. A write git
 * cannot see, logged after that pass, answers null too: the full skip's veto,
 * read against the fast ledger's own count (BACKLOG §343).
 */
export function latestFastPass(cwd, tree, root = cwd) {
  let text
  try { text = readFileSync(path.join(stateDir(cwd), 'fast-checks.jsonl'), 'utf8') } catch { return null }
  let latest = null
  let latestSeq = 0
  let count = 0
  // ⚠ qh-check ends every record with a newline, so a last line without one was not written
  // whole even when it parses, and proves nothing: read as the importer reads `checks.jsonl`.
  const lines = text.split('\n')
  if (lines.pop().trim()) return null
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return null }
    // A row that is not a record proves nothing, as the importer reads it.
    if (typeof record?.id !== 'string') return null
    count += 1
    if (record?.after?.tree === tree) { latest = record; latestSeq = count }
  }
  if (!latest || checkEventName(latest) !== 'check.passed') return null
  if (unseenWriteSince(root, { seen: 'fastSeen', seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  return { command: latest.command, count }
}

/**
 * unseenWriteSince says whether any session log holds a write git cannot see that a
 * pass does not cover (ADR-081). A pass covers a write only when the write was
 * recorded before it, by the ledger count `seen` names (`checksSeen` for
 * `checks.jsonl`, `fastSeen` for `fast-checks.jsonl`), AND stamped before the pass
 * started: a clock that went back cannot hide a write the count says came after
 * (Codex review of ADR-081). A write with no count, logged before that count
 * existed, is judged by its time alone. Only a write inside `root` counts: a
 * scratchpad or a peer's temp file is outside what the tree's check reads, and
 * vetoing on one refused an ordinary commit (BACKLOG §343, review). A directory
 * that cannot be listed, or a log that cannot be read whole, may hide such a write,
 * so it answers true.
 */
export function unseenWriteSince(root, { seen, seq, started }) {
  const sessions = path.join(stateDir(root), 'sessions')
  let names = []
  try { names = readdirSync(sessions).filter(name => name.endsWith('.jsonl')) } catch (error) {
    // Absent is no session; a directory that cannot be listed hides what it holds.
    if (error?.code !== 'ENOENT') return true
  }
  for (const name of names) {
    let log
    try { log = readFileSync(path.join(sessions, name), 'utf8') } catch { return true }
    for (const line of log.split('\n')) {
      if (!line.trim()) continue
      let entry
      try { entry = JSON.parse(line) } catch { return true }
      if (entry?.event !== 'file.written' || entry.observable !== false) continue
      // A path that is not absolute says nothing about where it landed, and vetoes.
      if (typeof entry.path === 'string' && path.isAbsolute(entry.path) && writtenOutside(root, entry)) continue
      const counted = entry[seen]
      const recordedBefore = counted === undefined || (Number.isInteger(counted) && counted < seq)
      if (!(recordedBefore && Date.parse(entry.at) < started)) return true
    }
  }
  return false
}

// Whether a recorded write was outside the tree under EVERY spelling it was given: the canonical path the log keeps
// and the one the tool was handed (`lexical`), which differs for a path under a directory link.
function writtenOutside(root, entry) {
  return outsideRoot(root, entry.path)
    && (typeof entry.lexical !== 'string' || !path.isAbsolute(entry.lexical) || outsideRoot(root, entry.lexical))
}

/**
 * passedAlready answers whether the ledger already proves this tree (ADR-081): the
 * LATEST record, by position, for the same command on the tree as it is now must
 * grade `check.passed`. Anything it cannot establish answers null, and the check
 * runs (ADR-005):
 * - a ledger line it cannot read;
 * - a tree it cannot observe;
 * - a directory outside git;
 * - a write git cannot see, recorded in ANY session's log after the pass started,
 *   since a tree hash cannot speak for it. Every session, because a check run by
 *   hand carries no session id; a log last changed before the pass cannot hold one.
 * `observeTree` is the seam a test replaces. It lives here, not in qh-check, because
 * SessionStart reads it too (ADR-094 T2) and qh-check imports this module.
 *
 * ADR-094 T3: with `prose` (declared, validated paths) the tree is also observed with those
 * paths removed, and a row whose `codeTree` is equal, for the same command and the same
 * declared list, stands in for a tree that differs only under them (`viaProse`). A row
 * written before the declaration has no `codeTree` and is never reused this way. The
 * unseen-write veto below runs from the ORIGINAL pass's start either way.
 */
export function passedAlready({ root, git, command, env = process.env, observeTree = observe, prose = [] }) {
  if (git !== true) return null
  const now = prose.length ? observeTree(root, observeBudgetMs(env), { without: prose }) : observeTree(root)
  if (now?.ok !== true) return null
  let text
  try { text = readFileSync(path.join(stateDir(root), 'checks.jsonl'), 'utf8') } catch { return null }
  let latest = null
  const byId = new Map()
  let seq = 0
  let latestSeq = 0
  // ⚠ qh-check ends every record with a newline, so a last line without one was not written
  // whole even when it parses, and proves nothing: read as the importer reads it (ADR-088).
  const lines = text.split('\n')
  if (lines.pop().trim()) return null
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return null }
    // A row that is not a record proves nothing, as the importer reads it.
    if (typeof record?.id !== 'string') return null
    byId.set(record.id, record)
    seq += 1
    const sameTree = record?.after?.tree === now.tree
    const sameCode = !sameTree && prose.length > 0 && typeof now.codeTree === 'string' && record?.after?.codeTree === now.codeTree
      && Array.isArray(record?.prose) && record.prose.length === prose.length && record.prose.every((spec, at) => spec === prose[at])
    if (record?.command === command && (sameTree || sameCode)) latest = record
    if (latest === record) latestSeq = seq
  }
  if (!latest || checkEventName(latest) !== 'check.passed') return null
  if (unseenWriteSince(root, { seen: 'checksSeen', seq: latestSeq, started: Date.parse(latest.before?.at) })) return null
  const ms = Date.parse(latest.after?.at) - Date.parse(latest.before?.at)
  // The pass that actually ran: a reuse row names it (`reusedFrom`), so a chain of reuses never stands in for it. A tree
  // identical to the one that pass was taken on is not "prose changed" - nothing changed (a Windows run of 3.8.17).
  const original = typeof latest.reusedFrom === 'string' ? byId.get(latest.reusedFrom) : latest
  const sameAsPass = original?.after?.tree === now.tree
  return { at: latest.after.at, ms: Number.isFinite(ms) ? ms : null, id: latest.id, passOf: original?.id ?? latest.id, tree: now.tree, record: latest, now, rows: seq, viaProse: latest.after.tree !== now.tree && !sameAsPass }
}


export function checkCommandOrigin(cwd = process.cwd(), discovery = null) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  if (!directory) return { command: null, origin: 'none' }
  const found = discovery ?? gitRepositoryLookup(directory)
  if (!found.ok) return { command: null, origin: 'unproven' }
  const root = found.root ?? directory
  // WHAT THE PROJECT SAYS, before any guess. Every rung below infers a command
  // from a manifest, and an inferred command can fail to DISCRIMINATE: measured
  // 2026-08-29 in a real Laravel repository, the derived `php vendor/bin/phpunit`
  // is red on a clean tree because of a host-only failure, so a session gets the
  // same exit code whether or not it broke anything — zero bits, which is worse
  // than the wrong-command defect it replaced (docs/BACKLOG.md §59). That
  // repository's own declared check discriminated cleanly against two injected
  // mutations. `.quality-harness.json` already carries this project's config, so
  // a declared check needs no new file and no parsing of prose.
  //
  // A declaration can of course be WRONG. That is the point: the mistake is then
  // the project's own, visible in a file someone can fix, rather than this tool
  // guessing and being wrong on the project's behalf.
  const declared = declaredCheckCommand(root)
  if (declared && constantSuccessCheck(declared)) return { command: null, origin: 'refused' }
  if (declared) return { command: declared, origin: 'declared' }
  // A script the repository NAMES FOR ITSELF beats a manifest guess, the same
  // reason `scripts/verify.sh` sits above `go test ./...`: `php vendor/bin/phpunit`
  // is a guess at how this project runs its tests, and in the repository that
  // reported §56 it is the wrong one — phpunit there runs only inside Docker, so
  // the bare host command would not execute at all.
  //
  // ⚠ THE `composer test` RUNG IS GONE, and removing it is the SAFE way to satisfy
  // the invariant it broke. It offered `composer test` as the project's own check
  // while the evidence check refused that string, and the two attempts to fix
  // that by ACCEPTING more each produced a P1 in review: first `--help` and
  // `test-data` passing the publish guard, then a whole `composer` family turning
  // `composer update` — which writes composer.lock — from `unrecognised` into
  // `neither`. Section 16 is explicit that a classifier permitting more needs
  // stronger evidence than one permitting less, and this rung was the demand for
  // it.
  //
  // Offering LESS satisfies the same invariant with none of that risk, and it
  // gives a Laravel project the BETTER answer anyway: it falls through to the
  // phpunit rung below, which a session running a real Laravel 11 tree confirmed
  // names the command they would actually run, with the inference caveat leading.
  // The rung also read a `laravel new` skeleton default as the project SPEAKING,
  // which it is not.
  for (const candidate of PROJECT_CHECKS) {
    if (existsSync(path.join(root, candidate.file))) {
      return { command: candidate.command, origin: 'inferred' }
    }
  }
  const packaged = packageManagerCommand(root)
  if (packaged) return { command: packaged, origin: 'inferred' }
  const made = makeTargetCommand(root)
  if (made) return { command: made, origin: 'inferred' }
  return { command: null, origin: 'none' }
}

// A spawn error or a timeout is not "this directory is not a repository".
// `gitRepositoryRoot` stays null for both, for callers that only need a path.
// Callers that would certify or go silent on that null use `gitRepositoryLookup`.
export function gitRepositoryLookup(directory, spawnResult) {
  const run = spawnResult !== undefined ? spawnResult : spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', timeout: 5_000, windowsHide: true,
  })
  if (!run || run.error || run.status == null) {
    return { ok: false, root: null, reason: run?.error?.message ?? 'git produced no status' }
  }
  if (run.status !== 0) return { ok: true, root: null, reason: 'not a repository' }
  const printed = String(run.stdout ?? '').trim()
  if (!printed) return { ok: false, root: null, reason: 'git printed no root' }
  // Git's spelling and Node's path.resolve of the same tree can disagree
  // (C:/ vs C:\, 8.3 vs long, /tmp vs /private/tmp). An un-realpathed root
  // made relativeWithinRoot filter every path as outside, so the hook
  // delivered empty context (CLAUDE.md §7).
  return { ok: true, root: canonical(printed), reason: '' }
}

function gitRepositoryRoot(directory) {
  const found = gitRepositoryLookup(directory)
  return found.ok ? found.root : null
}

// Names the project's own check when there is one, so the gate asks for
// something specific instead of leaving the reader to guess which invocation
// counts. Falls back to the general phrasing when the project names none.
export function runTheCheckSentence(cwd) {
  const { command, origin } = checkCommandOrigin(cwd ?? process.cwd())
  if (origin === 'refused') {
    return 'The check declared in `.quality-harness.json` is a constant success and was refused. '
      + 'Declare a command that can fail.'
  }
  if (origin === 'unproven') {
    return 'The repository root could not be read, so no check is named. '
      + 'That is not the same as this project having no check.'
  }
  if (!command) {
    return 'Run the smallest repository-owned test, lint, build, or validation command after the '
      + 'final edit and report the exact command and result.'
  }
  // A DECLARED command is the project speaking; an INFERRED one is this tool
  // guessing from a manifest, and a guess carries no confidence about the
  // environment it needs. Measured 2026-08-29: an inferred `php vendor/bin/phpunit`
  // was red on a clean tree because of a host-only failure, so a session got the
  // same exit code whether or not it had broken anything — and a red it did not
  // cause teaches distrust of the gate, which is what let an earlier wrong
  // command survive so long (docs/BACKLOG.md §59).
  if (origin === 'declared') {
    return `Run \`qh-check\` — it runs ${checkInCode(command)} (this project's own check) and records what it `
      + 'observed — after the final edit and report the exact command and result.'
  }
  // The word "environment" is deliberately NOT used here. It is reserved for a
  // run that actually failed that way, and a standing note carrying it in every
  // message would make the word stop meaning anything — which
  // tests/lifecycle.test.mjs::a check that could not run is not a finding about
  // the change asserts, and caught when the first version of this said it.
  // Lead with undeclared: burying the caveat after "this project's own check" is
  // how a Makefile `make test` was read as the project's check (2026-09-12).
  return `No \`check\` is declared in \`.quality-harness.json\`. I inferred from this `
    + `repository rather than from a declaration: ${checkInCode(command)}, so that is not this `
    + 'project\'s own check. If it is red on an unmodified tree the finding is about this '
    + 'machine and not about your change — say which, and declare the real command as `check`. '
    + `Run \`qh-check\` (it runs ${checkInCode(command)} and records what it observed) after the final `
    + 'edit and report the exact command and result.'
}

// ADR-035. One line per completion event, machine-local, append-only.
//
// WHY IT IS NOT IN THE REPOSITORY: this harness writes into a user's tree only
// through `adr-verify`, into a file they pointed it at. A telemetry file
// appearing in every repository the plugin touches is a surprise, and one that
// could reach a push (CLAUDE.md §6). `CLAUDE_PLUGIN_DATA` is where the mutant
// journal already lives.
//
// WHY THE ABSENCE IS ANNOUNCED: a ledger that skips in silence reads exactly
// like a ledger recording zero false successes. That is the false-clean this
// corpus refuses everywhere else, so a session with nowhere to write says so
// once, on stderr, where it cannot be mistaken for a finding about the work.
//
// It never throws. Recording is not judging: a hook that failed to write its
// telemetry has still observed everything it observed, and turning that into a
// hook failure would make the ledger able to break the gate.
function recordClaim(input, claim, evidence, mutations) {
  const home = process.env.CLAUDE_PLUGIN_DATA
  if (!home) {
    process.stderr.write('[quality-harness] CLAUDE_PLUGIN_DATA is not set, so this completion '
      + 'event was NOT recorded. No false-success rate can count it. This is a note about the '
      + 'environment, not a finding about your work.\n')
    return
  }
  try {
    mkdirSync(home, { recursive: true })
    appendFileSync(path.join(home, 'claims.jsonl'), `${JSON.stringify({
      at: new Date().toISOString(),
      event: input.hook_event_name,
      cwd: typeof input.cwd === 'string' ? input.cwd : null,
      session: typeof input.session_id === 'string' ? input.session_id : null,
      claim: claim.kind,
      phrase: claim.phrase,
      evidence,
      mutations,
      // ADR-060: the row's vocabulary is unchanged and its computation is not, so
      // a reader can tell which model produced it.
      version: 'events/1',
    })}\n`, 'utf8')
  } catch (failure) {
    process.stderr.write(`[quality-harness] could not append to the claims ledger (${failure.code
      ?? failure.message}); this completion event is not counted.\n`)
  }
}


// A task file was edited and the session's check went green: the corpus wants
// that recorded, not asserted. Returns null unless a touched path is a task file
// under a tasks/ directory, so this never fires for ordinary work.
function evidenceNudge(cwd, mutationPaths) {
  const directory = nearestExistingDirectory(path.resolve(cwd ?? process.cwd()))
  if (!directory) return null
  const tasks = mutationPaths.filter(candidate => typeof candidate === 'string'
    && path.isAbsolute(candidate)
    && /(^|[\\/])tasks[\\/][^\\/]+\.md$/.test(candidate)
    && !/readme\.md$/i.test(candidate)
    && existsSync(candidate))
  if (!tasks.length) return null
  return `Your check passed with ${tasks.length === 1 ? 'a task file' : 'task files'} edited. `
    + `Record it where the corpus can verify it: \`adr-verify ${tasks[0]}\` appends a `
    + 'tool-written Verification Log entry (exit code plus an acceptance digest). '
    + 'adr-lint will not accept a `done` status without one.'
}

/** The capability the caller declared for this role, or null when it declared none. */
function declaredCapability(input) {
  const model = typeof input.agent_model === 'string' ? input.agent_model.trim() : ''
  const effort = typeof input.agent_effort === 'string' ? input.agent_effort.trim() : ''
  if (!model && !effort) return null
  const asked = [model && `model ${model}`, effort && `effort ${effort}`].filter(Boolean).join(', ')
  return `Your delegation asked for ${asked}; if that does not match the work you are `
    + 'given, say so in what you return rather than silently doing more or less.'
}

function subagentContract(input) {
  const kind = String(input.agent_type ?? 'delegated').toLowerCase()
  const readOnly = /(explore|plan|research|review|audit|scout|memory)/.test(kind)
  const roleLine = readOnly
    ? 'Treat this role as read-only unless the delegation explicitly authorizes edits.'
    : 'If edits are authorized, make the smallest coherent diff within the owned scope.'
  return [
    'QUALITY CONTRACT — you are a leaf role, not the lifecycle coordinator.',
    'Do not invoke /quality-harness:work, /quality-harness:consensus, /quality-harness:review-ring, /quality-harness:quality-cycle, or spawn another agent unless your delegation explicitly assigns coordination.',
    'Preserve the supplied scope and non-goals; invent no features, configuration, fallbacks, dependencies, or speculative abstractions.',
    'DRY duplicated knowledge, not similar syntax; use SOLID only where a demonstrated boundary needs it.',
    roleLine,
    `Before returning after edits, ${runTheCheckSentence(input.cwd).replace(/^Run /, 'run ')}`,
    'Return touched files, exact executed evidence, and remaining risk or uncertainty.',
    // ADR-029 T2. What the CALLER asked for, when it asked for anything. Said as
    // "asked for" rather than "you are running", because this hook receives a
    // declaration and cannot observe which model actually answered — the same
    // distinction between what a check saw and what it concluded that CLAUDE.md §3
    // makes about gates. Omitted entirely when nothing was declared: absence is
    // absence, and inventing a default would put a capability in the agent's
    // context that nobody requested.
    declaredCapability(input),
  ].filter(Boolean).join(' ')
}

// ONE JSON object per run is what Claude Code parses from a hook's stdout, so
// output is held here and written once by main() — which is also where the
// hook's own wall-clock is known. A hook that is slow used to be a pause with
// no name (the §15 SessionStart hook hung new sessions for seconds and said
// nothing, 2026-09-05); above SLOW_HOOK_MS the run names itself on both
// channels, as one more line, never instead of the finding.
let pendingOutput = null
// Rule actions a hook collects; main() delivers them with any legacy output in one
// composed result (ADR-060 T1's deliver).
const pendingActions = []
function queueAction(action) {
  pendingActions.push(action)
}
function emitJson(value) {
  pendingOutput = value
}

const SLOW_HOOK_MS = 5_000
export function slowHookThresholdMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_SLOW_HOOK_MS)
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : SLOW_HOOK_MS
}

export function slowHookNote(eventName, elapsedMs) {
  return `quality-harness: the ${eventName ?? 'hook'} hook took ${(elapsedMs / 1000).toFixed(1)}s — the pause has this name`
}

export function flushOutput(startedAt, input, env = process.env, now = Date.now()) {
  const elapsed = now - startedAt
  let out = pendingOutput
  pendingOutput = null
  if (elapsed >= slowHookThresholdMs(env)) {
    const note = slowHookNote(input?.hook_event_name, elapsed)
    process.stderr.write(`${note}\n`)
    out = { ...(out ?? {}), systemMessage: out?.systemMessage ? `${out.systemMessage}\n${note}` : note }
  }
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`)
}

// ADVISORY ONLY. This harness does not refuse a tool call — it tells the agent
// what it found and leaves the decision where it belongs.
//
// It used to block, and across three projects in one day it refused legitimate
// work six times: a commit gate that degraded with session length until nothing
// could be committed, a deletion sentinel that fired only on deletions already
// checked, a read-only `> /dev/null` read as authorship, an unfilled template
// shape stopping an edit that had already landed. Every one of those was the
// harness fighting its user, and the pattern is what it teaches: an agent that
// loses turns to a gate learns to route around the gate, and then the gate
// protects nothing at all.
//
// So a finding is now information, delivered at the moment it can still be acted
// on. What the harness gives up is the ability to STOP a fabricated claim; what
// it keeps is the ability to name one, loudly, every time it sees it. That was
// the owner's call, made explicitly and more than once.
// The one line a person sees. The full text is for the agent; the person needs
// to know a finding was made and where it went, not to read the instruction.
function advisoryHeadline(reason) {
  const first = String(reason).split('\n').find(line => line.trim()) ?? String(reason)
  // ⚠ EVERY ADVISORY BEGINS `quality-harness: `, so "the first sentence", split
  // after a `.` or a `:`, was always that prefix and nothing else: the person read
  // "quality-harness advised the agent: quality-harness: (full text…)" — told a
  // finding was made and nothing about it. Two peer sessions flagged the line on
  // 2026-09-19. The caller already says who is speaking, so the prefix goes; and
  // only a FULL STOP ends the sentence, since these messages use `:` and `—` mid-clause.
  const sentence = first.trim().replace(/^quality-harness:\s*/i, '').split(/(?<=\.)\s/)[0]
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence
}

// The fixture exclusion lives in its own module since 2026-09-23, so the per-edit
// gate (run-shell-hook.mjs, which this file imports) can share it without a cycle.
export { listedUnderUninterestingDirectory } from './uninteresting.mjs'


// SessionStart used to slice(0, 3) and hide a later directory's UNPROVEN
// behind "(+N more)". A could-not-look is never an ordinary ready line: it
// always surfaces; the cap still applies to ready/blocked/done lines (ADR-046 T5).
const EVIDENCED_SUMMARY = /^ {2}\(\d+ task director(?:y|ies) read (?:is|are) fully evidenced, not shown\)$/
export function surfaceReadyLines(lines, cap = 3) {
  let ordinary = 0
  const shown = []
  for (const line of lines) {
    // The evidenced count is never capped either: it is the answer to "why is
    // nothing listed", and hiding it re-creates the all-clear it replaced.
    const always = line.includes('UNPROVEN') || EVIDENCED_SUMMARY.test(line)
    if (always || ordinary < cap) {
      shown.push(line)
      if (!always) ordinary += 1
    }
  }
  const hidden = lines.length - shown.length
  if (hidden > 0) {
    // Two counts, two sentences, in the order a reader sums them: the directories
    // READ but not shown, then the ones NOT READ at all. Two Windows sessions read
    // `(+13 … UNPROVEN — not read …)` followed by `(+3 more record set(s))` as one
    // overlapping figure (2026-09-23), so the read-but-capped line now comes first
    // and says what it counts.
    const note = `  (+${hidden} more task director${hidden === 1 ? 'y' : 'ies'} read, not shown above)`
    const unread = shown.findIndex(line => /more task director(?:y|ies): UNPROVEN — not read/.test(line))
    if (unread >= 0) shown.splice(unread, 0, note)
    else shown.push(note)
  }
  return shown
}




// The gates in bin/ are `#!/usr/bin/env python3` scripts. Windows cannot exec a
// `#!` script, so spawning one directly returns status null — and readyTaskLines'
// `continue` swallowed that, leaving session orientation silently empty on every
// Windows session. Measured 2026-08-25 on windows-latest, where the hook produced
// nothing and reported no error. Name the interpreter there instead.
//
// Naming it is not the same as finding it. `python3` on a stock Windows 11 is an
// App Execution Alias under WindowsApps: a real, spawnable exe that is not Python.
// It prints "Python was not found; run without arguments to install from the
// Microsoft Store" to STDOUT — nothing on stderr — and exits 9009. So it sets no
// `error`, and an `error`-keyed fallback never fires; every gate came back 9009,
// which is neither 0 nor 3, and readyTaskLines swallowed it into the exact empty
// orientation the paragraph above says was fixed. Measured 2026-08-30 on Windows
// 11 build 26200.9168, where `py -3` ran the same gate and exited 3.
//
// Do not key the fallback on 9009 either. That is cmd.exe's own "command not
// found" code, borrowed by the alias, so it cannot separate "the interpreter never
// ran" from "the gate ran and returned 9009". The only honest question is whether
// the candidate answered AS PYTHON, which is why this probes for a known answer
// rather than detecting by name. resolve_bash() reaches for the same idea and
// only half-arrives: it skips the System32 WSL stub but NOT the WindowsApps
// launcher its own docstring names, so on a stock PATH it returns a 0-byte Store
// alias (BACKLOG §91). Probe; do not trust a name or an isfile().
// BACKLOG §93. The probe asked for the MAJOR version and threw the rest away, so
// a box with 3.14 and 3.10 both on PATH — four years and one semantic change
// apart — answered `3` either way and nothing recorded which one ran. §90 is the
// case where that mattered: the same guard returned different answers on each.
// Costs one format string; the acceptance check below still turns on the major.
const PYTHON_PROBE = 'import sys;print("%d.%d" % sys.version_info[:2])'

// Preference order. `py -3` is the launcher Windows actually ships for this and
// is the one standalone-link.mjs's cmd forwarder already reaches for; a bare
// `python` is next; `python3` is last because on Windows it is most often the
// alias. Every one of them is probed regardless — presence is never the evidence.
const WINDOWS_PYTHONS = [['py', '-3'], ['python'], ['python3']]

/**
 * The argv prefix that runs a real Python 3 on this machine, or null if nothing
 * on PATH answered as one. Windows only; POSIX execs the shebang itself.
 *
 * `candidates` and `run` are injected so the alias case is reachable from macOS
 * and Linux — a Windows-only branch with no seam is a branch with no test, and
 * that is precisely how the alias shipped past a suite that exercises the win32
 * branch on boxes where `python3` happens to be genuine.
 */
export function resolvePython(platform = process.platform, candidates = WINDOWS_PYTHONS, run = spawnSync) {
  if (platform !== 'win32') return null
  for (const [command, ...prefix] of candidates) {
    const probe = run(command, [...prefix, '-c', PYTHON_PROBE], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    const answered = (probe.stdout ?? '').trim()
    // Keyed on the MAJOR: any 3.x is a real Python 3.
    if (probe.status === 0 && /^3(\.\d+)?$/.test(answered)) {
      return [command, ...prefix]
    }
  }
  return null
}

// Resolved once per process: readyTaskLines calls spawnGate per task directory,
// and re-probing three interpreters for each would cost more than the gates.
// `??=` would not do it — a machine with no Python resolves to null and would be
// re-probed on every call, three failed spawns each, exactly when probing is most
// expensive. The sentinel makes "asked, and the answer was none" a cached answer.
const UNPROBED = Symbol('python interpreter not yet resolved')
let cachedPython = UNPROBED

export function spawnGate(tool, args, options = {}, platform = process.platform, python) {
  // Hidden, and on Windows it is the whole point: a hook runs with no console, so a
  // child without windowsHide gets a console of its own, which Windows Terminal
  // opens as a tab that flashes (reported on 3.1.0, 2026-09-28).
  if (platform !== 'win32') return spawnSync(tool, args, { windowsHide: true, ...options })
  if (python === undefined && cachedPython === UNPROBED) cachedPython = resolvePython(platform)
  const interpreter = python !== undefined ? python : cachedPython
  if (!interpreter) {
    // No verdict here. A gate that could not start has not found anything, and
    // saying so is the whole of rule 3 — the shape matches spawnSync's own
    // "could not spawn" result so callers need no new branch to tell them apart.
    return {
      error: new Error('quality-harness: no Python 3 on PATH answered a version probe, so this gate did NOT run'),
      status: null, stdout: '', signal: null,
      stderr: 'quality-harness: no Python 3 found on PATH — an absent checker certifies nothing.\n',
    }
  }
  const [command, ...prefix] = interpreter
  return spawnSync(command, [...prefix, tool, ...args], { windowsHide: true, ...options })
}

// adr-next's first line, said on its behalf. A path under the repository is said relative to it,
// and the home directory as `~` — anything under it then becomes `~‹path›`, so no directory of the
// owner's other work is named — and a scratch checkout's absolute path is not repeated into the
// session; the rest is cleaned as corpus text is, because a task file's name reaches this line and
// must not print a control or a frame in this tool's voice (BACKLOG §319 item 6: js-spa-client, a
// symlink loop). Any absolute path left after that goes through `scrubber`, as the probe's does:
// `os.homedir()` as spelled missed a home path in any other spelling — an 8.3 short name, a
// resolved link — and it reached the session (BACKLOG §350 C4/F3, three Windows reports).
function gateSaid(text, root) {
  let out = String(text)
  for (const [prefix, placeholder] of [[root, '.'], [os.homedir(), '~']].filter(([prefix]) => prefix)) {
    for (const spelling of new Set([prefix, prefix.replaceAll('\\', '/'), prefix.replaceAll('/', '\\')])) {
      out = out.split(spelling).join(placeholder)
    }
  }
  return corpusText(scrubber({ root: null, pluginRoot: PLUGIN_ROOT })(out))
}


// What a ready line says first about the record that owns the task. adr-next's answer
// carries the owner's Status, and this line offered the task as ready whatever it was:
// under an owner that is binary or empty, or not Accepted (a Windows chaos round,
// 2.111.0-rc, P3). A record is a work order only once it is Accepted (CLAUDE.md §10).
function ownerCaveat(report) {
  if (report.undecided === true) {
    return `its record's Status is ${quotedCorpusText(report.status)}, not Accepted, so this is a plan, not a work order — `
  }
  if (report.owner_unreadable === true) {
    return 'its record was found but could not be read as one, so whether it is Accepted is UNKNOWN and this may not be a work order — '
  }
  return ''
}
// What a ready line says right after the task it offers when no record owns the tasks (BACKLOG
// §350 C6, a fail-open: with the record deleted, the line offered the task with no word). Said
// AFTER "is ready —", not first like the two above: ADR-068 T2 locks a test whose ownerless
// `docs/tasks` fixture expects "`docs/tasks`: T1 is ready —", and a locked test stays
// byte-identical (CLAUDE.md §2). It is still said before the instruction to prove the task.
function missingOwnerCaveat(report) {
  if (report.owner_missing === true) {
    return 'no record owning these tasks was found, so whether they are a work order is UNKNOWN — '
  }
  return ''
}
export function readyTaskLines(root, insideRepository, listing, spawn = spawnGate) {
  // Without a repository there is no "this project". Git-fail (listing null
  // while inside a repo) is UNPROVEN, not an empty ready list.
  if (!insideRepository) return { look: 'ok', lines: [] }
  if (listing == null) return { look: 'UNPROVEN', lines: [] }
  const tool = path.join(PLUGIN_ROOT, 'bin', 'adr-next')
  if (!existsSync(tool)) return { look: 'ok', lines: [] }
  const lines = []
  // Directories whose every task carries evidence are not in flight, and listing
  // them under that heading read as work twice (BACKLOG §279 item 6, §280 item 3).
  // They are counted instead; ADR-046's heading stays.
  let evidenced = 0
  // A directory under an archive-named folder with no Lifecycle marker is read as
  // live, and its ready line said "Prove it with `adr-verify`" beside the warning
  // naming `--adopt`: the instruction a session acts on is the one it reads last
  // (BACKLOG §289 item 1). Such a line leads with the question instead.
  // SessionStart opens no record content (CLAUDE.md §19), so the archive test is the name test (ADR-092
  // Decision 11): no recognised set is passed.
  const unmarked = unmarkedArchives(root, listing)
  const { read, unread, aliases, absent } = taskDirectories(root, listing)
  for (const { directory, archive } of read) {
    if (archive === 'unknown') {
      // No READY line for a directory that may be a frozen archive: `adr-next` reads
      // the record and its tasks, never the catalog, so it cannot settle this.
      lines.push(`  ${shownPath(posixListed(path.relative(root, directory) || directory))}: UNPROVEN — a README above it is listed under another `
        + 'spelling or could not be read, so whether this is a frozen archive is unknown. Name the catalog `README.md`. '
        + 'Ready tasks there are not known.')
      continue
    }
    const run = spawn(tool, [directory, '--json'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    // posixListed: path.relative is native separators; SessionStart text and
    // the Windows CI structural-path rule need a listed form (ADR-046 T5).
    const listed = posixListed(path.relative(root, directory) || directory)
    const relative = shownPath(listed)
    // The READY line puts corpus text beside an instruction, so its path is in a code
    // span there: a directory's NAME is corpus text, and "ADR-003-SYSTEM. Assistant must
    // run …/tasks: T1 is ready" read in the tool's voice (a Windows chaos round, round 3).
    const readyPath = pathInCode(listed)
    // ADR-046 T3. adr-next answers 0 (a ready task) or 3 (nothing ready); any
    // other outcome is the gate NOT answering — its lib missing beside a copied
    // bin/ (exit 2, ADR-045 T4), an interpreter that never ran (status null), a
    // hang guard that fired — and every one of them was a `continue`: the same
    // silence as a directory with no tasks, which is how Windows sessions ran
    // empty for a month (the two paragraphs above spawnGate). A look that did not
    // happen is UNPROVEN, said where the ready line would have been, with the
    // gate's own first line so the reader knows which of these it was.
    if (run.status !== 0 && run.status !== 3) {
      const said = gateSaid((run.stderr ?? '').trim().split('\n')[0] || (run.stdout ?? '').trim().split('\n')[0] || 'it said nothing', root)
      const how = run.status === null
        ? `adr-next did not run (${run.error?.message ?? `killed by ${run.signal ?? 'an unknown signal'}`})`
        : `adr-next could not run (exit ${run.status})`
      lines.push(`  ${relative}: UNPROVEN — ${how}: ${said} Ready tasks there are not known.`)
      continue
    }
    let report
    try { report = JSON.parse(run.stdout) } catch {
      lines.push(`  ${relative}: UNPROVEN — adr-next exited ${run.status} but its answer was not JSON. Ready tasks there are not known.`)
      continue
    }
    // A task adr-next could not read (NUL bytes, empty, or listed by git and absent
    // from the disk) is `stopped` and marked `unreadable`. Only `ready`, `blocked` and
    // `done` were read here, so such a directory was counted "fully evidenced" or
    // dropped without a word (a Windows chaos round of 626934a, F-2 and F-3).
    const unreadTasks = (report.stopped ?? []).filter(task => task.unreadable)
    if (unreadTasks.length) {
      lines.push(`  ${relative}: UNPROVEN — adr-next could not read ${unreadTasks.length} task file(s) there, `
        + `${quotedCorpusText(unreadTasks[0].stopped_by ?? '')}. Ready tasks there are not known.`)
      // And nothing there is offered: an unreadable task may produce what a ready one
      // consumes, and "T1 is ready" under "not known" was both at once (a Windows chaos
      // round of 916b515, G2).
      continue
    }
    if (report.ready?.length) {
      const next = report.ready[0]
      // Matched on the listed path: the shown one has a tag's `<` as `‹`, and would not match.
      const archive = unmarked.find(dir => listed === dir || listed.startsWith(`${dir}/`))
      lines.push(archive
        ? `  ${readyPath}: read as live only because ${pathInCode(archive)} has no Lifecycle marker — if it is an archive, `
          + `adopt it first (${codeSpan(`adr-retire-check --adopt <active> ${shownPath(archive)}`)}); if it is not, ${ownerCaveat(report)}${next.id} is ready — `
          + `${missingOwnerCaveat(report)}the task file calls it ${quotedCorpusText(next.goal)}.`
        : `  ${readyPath}: ${ownerCaveat(report)}${next.id} is ready — ${missingOwnerCaveat(report)}the task file calls it ${quotedCorpusText(next.goal)}`
        + (next.acceptance ? `, and its Acceptance fence reads ${quotedCorpusText(next.acceptance)}` : '')
        + (next.acceptance === null && next.human_observed === false
          // No fence was read, and adr-verify refuses the file, so the instruction could
          // not succeed (a Windows chaos round of 916b515, C-4).
          ? '. It has no runnable Acceptance fence, so `adr-verify` has nothing to run: fix its `## Acceptance` section first.'
          : `. Prove it with ${commandInCode(`adr-verify ${posixListed(path.relative(root, next.path) || next.path)}`)}, which runs that fence `
            + 'as written: read the fence in the task file first.'))
    } else if (report.blocked?.length) {
      lines.push(`  ${relative}: nothing ready; ${report.blocked.length} task(s) blocked.`)
    } else if (report.stopped?.length) {
      lines.push(`  ${relative}: nothing ready; ${report.stopped.length} task(s) stopped.`)
    } else if (report.done?.length && report.owner_unreadable) {
      // A directory whose record adr-next could not read a Status from (NUL bytes, unreadable, no Status
      // line) was counted "fully evidenced" when its tasks carried evidence, and nothing named the record:
      // whether those tasks are work at all is a question about a record whose standing nobody read
      // (BACKLOG §355). A ready line already says so through ownerCaveat; only the count was silent.
      lines.push(`  ${relative}: UNPROVEN — adr-next could not read a Status from the record that owns these tasks`
        + `${report.owner_unreadable_because ? ` (${quotedCorpusText(report.owner_unreadable_because)})` : ''}, `
        + 'so whether they are work is not known.')
    } else if (report.done?.length) {
      evidenced += 1
    }
  }
  if (evidenced > 0) {
    lines.push(`  (${evidenced} task director${evidenced === 1 ? 'y' : 'ies'} read ${evidenced === 1 ? 'is' : 'are'} fully evidenced, not shown)`)
  }
  if (unread > 0) {
    // Not a verdict about those directories — this hook did not look. Carries
    // UNPROVEN so surfaceReadyLines never hides it behind the render cap.
    lines.push(`  (+${unread} more task director${unread === 1 ? 'y' : 'ies'}: UNPROVEN — not read; this hook reads the `
      + `${TASK_DIRECTORY_READ_CAP} most recently changed per session start. Ready tasks there are not known; \`work-next\` reads them all.)`)
  }
  if (aliases.length > 0) {
    // The same directory again through a link, said once rather than offered again (BACKLOG §350
    // item 3: seven SessionStart lines through one junction on Windows).
    const first = pathInCode(posixListed(path.relative(root, aliases[0].sameAs)))
    lines.push(aliases.length === 1
      ? `  (1 other listed path reaches a task directory already read (${first}) — a link, a junction, or a spelling the file system folds together; it is read once)`
      : `  (${aliases.length} other listed paths reach task directories already read (first: ${first}) — links, junctions, or spellings the file system folds together; each is read once)`)
  }
  if (absent.length > 0) {
    const first = pathInCode(posixListed(path.relative(root, absent[0])))
    lines.push(absent.length === 1
      ? `  ${first}: UNPROVEN — listed by git, not on disk. Ready tasks there are not known.`
      : `  ${first} and ${absent.length - 1} more task director${absent.length === 2 ? 'y' : 'ies'}: UNPROVEN — listed by git, not on disk. Ready tasks there are not known.`)
  }
  return { look: 'ok', lines }
}

// What a session would otherwise learn by hitting a wall. Additive only: this
// hook can never block, and says nothing it cannot establish from the project
// itself — an empty orientation is correct for a project with no conventions.
// --- Decisions that reach the code -----------------------------------------
//
// Everything above answers "is this work proved?". This answers a question the
// harness had never asked: "what has already been decided about the file you are
// about to change?" — which is the difference between a tool that reports on you
// and a tool that hands you something.
//
// The idea and its vocabulary are lifted from adrkit (mbeacom/adrkit, Apache-2.0),
// which added an `affects:` field so tooling can resolve which decisions govern a
// change, and deliberately surfaces the graveyard of superseded and withdrawn
// records so an agent stops re-proposing an approach somebody already killed.
// Two things are ours: resolution needs no new header, because every task file in
// this corpus already carries a machine-readable `## Affected Files` table that
// adr-lint requires; and nothing here is a finding, so nothing here can fail.
//
// Resolution is a pure function of (corpus, paths) — same corpus, same paths,
// same answer — and runs entirely in this process. A subprocess per record at
// the edit boundary would rebuild the artifact-gate budget problem somewhere
// much hotter.










// Said once per path per session. New context at every Edit would repeat the
// same decisions all session for a hot file, which is how a delivery becomes a
// nag — the failure this whole release is about. Session-scoped because a marker
// that outlived the session would silence the FIRST edit of the next one.
// Compaction is the one event that empties what these markers protect: after
// it the agent has lost every context they gated, and a marker that survived
// would keep the SECOND mention silent for exactly the session that no longer
// has the first. So a session carries a generation, bumped at SessionStart on
// `compact` (and `clear`), and the stamp includes it.
function sessionGenerationPath(sessionId) {
  const stamp = createHash('sha256').update(sessionId).digest('hex').slice(0, 32)
  return path.join(os.tmpdir(), `quality-harness-gen-${stamp}`)
}
function sessionGeneration(sessionId) {
  try { return Number(readFileSync(sessionGenerationPath(sessionId), 'utf8').trim()) || 0 } catch { return 0 }
}
export function bumpSessionGeneration(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return 0
  const next = sessionGeneration(sessionId) + 1
  try { writeFileSync(sessionGenerationPath(sessionId), String(next)) } catch {}
  return next
}

// What a session was doing, in the words the NEXT context needs: the paths that
// changed and whether a `qh-check` has passed on them, the last check event, the
// ADR task in flight. Written at PreCompact and handed back by the compact
// SessionStart — compaction keeps the summary the model wrote and drops the
// state the gates measured, and the two are not the same thing. Also the row
// SessionEnd writes, so the next session in the same directory starts knowing
// what the last one left unchecked.
//
// ADR-060 T6: its input is the event log's reading of the tree, not a
// transcript, so what it reports is what git and the tool events show.
export function observedFacts(log, root, observation) {
  const writes = unobservableWrites(log, root)
  const baseline = sessionBaseline(log)?.observation
  const status = observation?.ok === true ? statusPaths(root) : []
  // By when it RAN, like the verdict: this kept `.at(-1)` after `latestCheckFor`
  // stopped trusting append order, so a stale re-imported pass landing last made
  // the note print — and SessionEnd persist — "Last check: … passed" beside
  // `checked: false` (different-lineage review, 2026-09-19).
  const check = latestOf(log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.')), { unresolved: 'say-so' })
  const treeUnchecked = observation?.ok === true && !treeChecked(log, observation.tree)
    && (baseline?.ok !== true || observation.tree !== baseline.tree)
  // ⚠ ONE REASON NOTHING HERE MAY BE READ AS A VERDICT, OR NONE. The tree that
  // could not be observed had its arm; a `git status` that FAILED and a log that
  // could not be read whole did not, and both arrived below as an empty list and
  // a surviving pass — "nothing has changed" and `verified`, persisted to
  // `sessions.jsonl` for the next session to believe (audit 2026-09-18, B2 and
  // B4). `tests/evidence-flip.test.mjs` holds this for every reader at once.
  const why = observation?.ok !== true ? 'the working tree could not be observed'
    : status.ok === false ? 'git could not list the working tree'
      : logIncomplete(log) ? `${tornRecord(log, 'the session log')} could not be read whole`
        : null
  return {
    files: root ? status.map(relative => path.join(root, relative)) : [],
    other: writes.length,
    pending: treeUnchecked || writes.length > 0,
    // ⚠ THREE QUESTIONS, NOT ONE. `pending` answers "is there outstanding work".
    // It was also doing duty for "did a check pass" and for "was anything
    // observed", and it answers neither: an INHERITED dirty tree is not
    // `treeUnchecked` (its tree equals the baseline's), so `pending` was false
    // with no check ever run, and an unobservable tree yields an empty file list,
    // which read as stillness. Found by a different-lineage review, 2026-09-18.
    // The LAST check about this tree by when it RAN, for the same reason
    // `treeChecked` no longer trusts log position.
    checked: latestCheckFor(log, observation?.tree)?.event === 'check.passed',
    treeOrder: observation?.ok === true ? checkStanding(log, observation.tree) : null,
    // Whose word the pass is. A check this tool GUESSED from a manifest may be
    // green while the project is red — `pnpm test` over a monorepo whose PHP half
    // holds the invariants — and the caveat that leads every message BEFORE the
    // check was gone AFTER it, which is when the guess starts certifying things.
    checkOrigin: latestCheckFor(log, observation?.tree)?.origin ?? null,
    checkCommand: latestCheckFor(log, observation?.tree)?.command ?? null,
    observed: why === null,
    // Whether the LOG was whole, apart from whether the tree was seen: "Last
    // check" is read from the log alone, and a torn one may have lost the newer
    // check — so neither "passed" nor "no check has run" may be said from it.
    whole: !logIncomplete(log),
    why,
    // Whether the baseline was adopted partway through the session. "Nothing has
    // changed" then means "since watching began", and says nothing about a commit
    // made before it — the note and the status line have to carry that, or the
    // once-only R4 line is the only place it was ever said.
    late: sessionBaseline(log)?.late === true,
    // Null from a torn log, not merely unprinted: SessionEnd persists this as
    // `lastVerdict`, and a row is read by a session that never saw the log.
    lastCheck: check && !logIncomplete(log)
      ? { command: check.command ?? null, verdict: check.event.slice('check.'.length) } : null,
  }
}

export function sessionStateNote(facts, cwd, root, insideRepository, now = new Date(), { tasks = true } = {}) {
  const files = Array.isArray(facts?.files) ? facts.files : []
  const other = Number(facts?.other) || 0
  const shown = files.slice(0, 5).map(file => shownPath(path.relative(cwd, file) || file))
  if (files.length > shown.length) shown.push(`+${files.length - shown.length} more`)
  const pending = facts?.pending === true
  const late = facts?.late === true
  // Three states, not two: 'neutral' is a session that changed nothing, which
  // says nothing about what an EARLIER session left — a reader walking back must
  // not stop on it (Codex review, 2026-09-05).
  // A tree nothing could observe is never 'neutral' and never 'verified': those
  // are claims about a tree that was looked at.
  const observed = facts?.observed !== false
  // Credit a check only when one is ON RECORD as having passed. `pending` being
  // false is not evidence that anything ran — an inherited dirty tree is not
  // `treeUnchecked`, so it arrives here with pending false and no check at all.
  // ⚠ ONLY the check for THIS tree can credit it. `lastCheck` is the newest check
  // event whatever tree it was about, so `|| lastCheck.verdict === 'passed'` let a
  // pass for an UNRELATED tree certify these paths. It stays descriptive — the
  // note prints it as "Last check:" — and certifies nothing.
  const passed = facts?.checked === true
  // ⚠ `neutral` IS A CLAIM THAT NOTHING IS OUTSTANDING, so `pending` gates it too.
  // A turn that COMMITS its work has no uncommitted file and an unchecked tree:
  // it took this arm, persisted `neutral`, and the next session was told nothing
  // — while R1, same session, same tree, named the commit by sha (audit B1).
  const status = !observed ? 'unverified'
    // ...and a LATE baseline cannot make that claim for the session: it covers
    // only what followed it (different-lineage review, 2026-09-19).
    : files.length === 0 && other === 0 && !pending ? (late ? 'unverified' : 'neutral')
      : pending || !passed ? 'unverified' : 'verified'
  const parts = []
  const unordered = facts?.treeOrder === 'unresolved'
  // A check that could not look after a pass is not "no check passed" (ADR-061).
  const unobserved = facts?.treeOrder === 'could-not-look'
  if (files.length && observed) {
    const verdict = unordered ? 'which check ran last on this tree could not be established'
      : unobserved ? 'the latest `qh-check` on this tree could not observe it, so it is not known to be checked'
      : pending ? 'no `qh-check` has passed on them'
      : passed ? `a \`qh-check\` passed on them${facts?.checkOrigin === 'inferred'
        ? ` — using an INFERRED check (${checkInCode(facts.checkCommand ?? 'unknown')}), guessed from a manifest and not declared, so it may not be this project's whole gate; declare the real command as \`check\` in .quality-harness.json`
        : ''}`
        : 'nothing here changed them since the session began, and no `qh-check` has passed on them'
    parts.push(`${files.length} changed path(s)${other ? ` and ${other} write(s) git cannot see` : ''}; `
      + `${verdict}${shown.length ? `: ${shown.join(', ')}` : ''}.`)
  } else if (other) {
    parts.push(`${other} write(s) git cannot see since the last passing check.`)
  } else if (!observed) {
    parts.push(`${facts?.why ?? 'the working tree could not be observed'}, so what changed here is unknown.`
      + (files.length ? ` Git lists ${files.length} changed path(s): ${shown.join(', ')}.` : ''))
  } else if (pending) {
    parts.push(unordered
      ? 'nothing is uncommitted, and which check ran last on the tree at HEAD could not be established.'
      : unobserved
        ? 'nothing is uncommitted, and the latest `qh-check` on the tree at HEAD could not observe it.'
        : 'nothing is uncommitted, and the tree at HEAD is one no `qh-check` has passed on.')
  } else {
    parts.push(late
      ? 'nothing has changed in the working tree since this plugin began watching — which was partway through this '
        + 'session, so what happened before that, a commit included, is unknown here (ADR-005).'
      : 'nothing has changed in the working tree.')
  }
  parts.push(facts?.whole === false ? 'Which check ran last is unknown.'
    : facts?.lastCheck?.verdict === 'unresolved' ? 'Which check ran last could not be established: the records disagree and cannot be ordered.'
      : facts?.lastCheck
        ? `Last check: ${checkInCode(facts.lastCheck.command ?? 'qh-check')} ${facts.lastCheck.verdict}.`
        : 'No check has run this session.')
  if (tasks) {
    const listing = insideRepository ? trackedPaths(root) : null
    const ready = readyTaskLines(root, insideRepository, listing)
    if (ready.look === 'UNPROVEN') {
      parts.push('ADR tasks in flight: UNPROVEN (git could not list the tree).')
    } else if (ready.lines.length) {
      const unproven = ready.lines.find(line => line.includes('UNPROVEN'))
      parts.push(`ADR task in flight: ${(unproven ?? ready.lines[0]).trim()}`)
    }
  }
  return { at: now.toISOString(), status, unverified: pending, files, other, text: parts.join(' ') }
}

function sessionNotePath(sessionId) {
  const stamp = createHash('sha256').update(sessionId).digest('hex').slice(0, 32)
  return path.join(os.tmpdir(), `quality-harness-note-${stamp}`)
}

export function readSessionNote(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  try { return JSON.parse(readFileSync(sessionNotePath(sessionId), 'utf8')) } catch { return null }
}

/**
 * Replace this session's state note, or leave NONE. Null removes it.
 *
 * The old note goes first, so a replace that fails cannot leave a stale one behind
 * to be handed back as current (Codex review, 2026-09-05): a note from an EARLIER
 * compaction read as this one's is worse than no note. `write` is a parameter
 * because nothing outside can make a real write fail on demand, and a branch with
 * no injectable seam has no test (CLAUDE.md §7) — this one lost its only test when
 * PreCompact stopped reading transcripts, and its mutant survived until 2026-09-19.
 */
export function replaceSessionNote(sessionId, note, write = writeFileSync) {
  if (typeof sessionId !== 'string' || !sessionId) return false
  // ⚠ "OR LEAVE NONE" HAS TO BE TRUE WHEN THE UNLINK FAILS TOO. This swallowed
  // every unlink error, so EACCES followed by a failed write left the OLD note in
  // place and readable, and with `note === null` it even returned true over it.
  // A missing file is the only failure that means "there is none".
  let cleared = true
  try { unlinkSync(sessionNotePath(sessionId)) } catch (failure) { cleared = failure?.code === 'ENOENT' }
  if (note === null) {
    if (!cleared) process.stderr.write('[quality-harness] PreCompact: an earlier state note could not be removed; it is older than this compaction.\n')
    return cleared
  }
  try { write(sessionNotePath(sessionId), JSON.stringify(note)); return true } catch (failure) {
    process.stderr.write(`[quality-harness] PreCompact: could not keep the state note (${failure.code ?? failure.message})`
      + `${cleared ? '' : ', and an earlier one could not be removed; it is older than this compaction'}.\n`)
    return false
  }
}

// "Here" is the repository (or the directory, outside one), realpath'd so
// /tmp and /private/tmp agree, and case-folded where the filesystem is — a
// parameter, not an assumption (CLAUDE.md §7). A subdirectory of the same
// repository is the same place.
export function locationKey(root, platform = process.platform) {
  let resolved = path.resolve(root)
  try { resolved = realpathSync(resolved) } catch {}
  return platform === 'win32' || platform === 'darwin' ? resolved.toLowerCase() : resolved
}

// The last row SessionEnd wrote for this location that SAYS something: a
// neutral session (nothing edited since its last publish) is skipped, because
// it proves nothing about what an earlier one left. Null when there is no
// home, no ledger, or no such row — "nothing known", which a first session
// deserves. Rows from before `location` existed are matched on cwd.
function previousSessionHere(cwd, platform = process.platform) {
  const home = process.env.CLAUDE_PLUGIN_DATA
  if (!home || typeof cwd !== 'string') return null
  let rows
  try { rows = readFileSync(path.join(home, 'sessions.jsonl'), 'utf8').split('\n').filter(Boolean) } catch { return null }
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const here = locationKey((directory && gitRepositoryRoot(directory)) ?? directory ?? cwd, platform)
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    let row
    try { row = JSON.parse(rows[index]) } catch { continue }
    const key = typeof row.location === 'string' ? row.location : typeof row.cwd === 'string' ? locationKey(row.cwd, platform) : null
    if (key !== here) continue
    if (row.status === 'neutral') continue
    return row
  }
  return null
}

function previousSessionNotice(cwd, platform = process.platform) {
  const row = previousSessionHere(cwd, platform)
  if (!row || row.status !== 'unverified') return ''
  const files = Array.isArray(row.files) ? row.files.slice(0, 5).map(file => shownPath(path.relative(cwd, file) || file)) : []
  const other = Number(row.other) || 0
  const what = [row.files?.length ? `${row.files.length} edit(s)` : '', other ? `${other} write(s) git cannot see` : ''].filter(Boolean).join(' and ') || 'edits'
  const check = projectCheckCommand(cwd)
  // ADR-094 T2: a pass recorded for the tree as it is now answers this notice, dirty or clean. No pass, a
  // tree that could not be observed and no declared check all keep it: only a proven tree is silent.
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const repository = directory ? gitRepositoryRoot(directory) : null
  const declared = repository ? checkCommandOrigin(repository).command : null
  if (repository && declared && passedAlready({ root: repository, git: true, command: declared })) return ''
  // ⚠ AN `unverified` ROW IS NOT ALWAYS A ROW ABOUT EDITS. A session whose tree
  // could not be observed, or that was watched only from partway through, is
  // persisted `unverified` with NO files — and `|| 'edits'` above then told the
  // next session it "ended with edits after which no recognised check passed":
  // an observation nobody made, about work that may not exist (ADR-005).
  if (typeof row.unknown === 'string' && row.unknown) {
    return `The previous session in this directory ended (${row.reason ?? 'unknown reason'}, ${row.at}) with its state `
      + `UNKNOWN to this plugin — ${row.unknown}.${files.length ? ` Git listed: ${files.join(', ')}.` : ''}`
      // What IS known stays said: a write recorded with no passing check after it
      // does not stop being outstanding because the tree could not be seen. Worded
      // as what is ON RECORD — the row may come from a log that lost a line, and
      // "no check passed" would be a verdict about the line that was lost.
      + `${other ? ` ${other} write(s) git cannot see were recorded, and no passing check after them is on record.` : ''} `
      + (check ? `${checkInCode(check)} is this project's check.` : 'No check is declared here.')
  }
  return `The previous session in this directory ended (${row.reason ?? 'unknown reason'}, ${row.at}) with `
    + `${what} after which no recognised check passed${files.length ? `: ${files.join(', ')}` : ''}. `
    // The one sentence here that says Run names qh-check: the span beside it is the declared
    // command's text, and running that any other way records nothing (Codex review of ffd4892, #4).
    + (check ? `Run \`qh-check\` (it runs ${checkInCode(check)}) before building on them.` : 'Nothing has checked them since.')
}

// Where the "already said this" markers live, and the sweep that bounds them
// (BACKLOG §146). One zero-byte file per (session, generation, finding), and
// nothing ever removed one: a Windows peer counted 48 from a single review
// session still sitting in TEMP the next day. Markers now live in a directory
// of their own, so the sweep reads that directory and not the whole temp root,
// and a once-a-day guard bounds even that to one readdir per machine per day.
const SAID_MARKER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const SAID_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
// The shapes that sat directly under the temp root before the directory
// existed: said- markers from earlier releases, and the one-per-session note
// file, which is written at PreCompact and consumed seconds later by the
// compact SessionStart — a week-old one is dead by construction.
//
// ⚠ `gen-` IS DELIBERATELY NOT HERE, and that is a correction (Codex review,
// 2026-09-06). A generation file is not a marker, it is session STATE, and the
// two fail in opposite directions: losing a marker re-says a finding, which is
// the side this mechanism errs toward, while losing a generation resets it to
// 0 — after which a compaction bumps it back to 1 and a generation-1 marker
// that is still live suppresses a finding that should have been said. Age
// cannot tell a long-running session from an abandoned one, so gen files are
// left to accumulate until something knows which sessions are alive; that
// residual is named in BACKLOG §146 rather than traded for a wrong suppression.
const LEGACY_MARKER = /^quality-harness-(?:said|note)-[0-9a-f]{32}$/
// A marker's own name, and the only thing the marker directory sweep will
// unlink. `!== '.swept'` was the first draft and it made the directory's whole
// contents eligible, which is not what this file claims anywhere (Codex
// review, 2026-09-06).
const MARKER_NAME = /^[0-9a-f]{32}$/

export function saidMarkerDirectory(tmp = os.tmpdir()) {
  return path.join(tmp, 'quality-harness-said')
}

// Remove markers older than a week, at most once a day per machine. NEVER
// THROWS: it runs inside a hook on the way to saying a finding, and a sweep
// that failed must not cost the finding. Returns what it did — `swept` false
// means the daily guard held and nothing was read; `unreadable` names every
// place it could not look — so a caller or a test can tell "nothing was old"
// from "could not look" (ADR-005). A live marker belongs to a session under a
// week old; one older is re-said at worst once, which is the side this whole
// mechanism errs toward. The guard stores the time it was given rather than
// trusting its own mtime, so a test can drive the clock.
export function sweepStaleMarkers(tmp = os.tmpdir(), now = Date.now()) {
  const directory = saidMarkerDirectory(tmp)
  const report = { swept: false, removed: 0, kept: 0, unreadable: [] }
  try { mkdirSync(directory, { recursive: true }) } catch (error) { report.unreadable.push(`mkdir: ${error?.code ?? error}`); return report }
  const guard = path.join(directory, '.swept')
  if (!claimDailySweep(guard, now, report)) return report
  report.swept = true
  const stale = file => {
    try { return now - statSync(file).mtimeMs > SAID_MARKER_MAX_AGE_MS } catch { return false }
  }
  const sweep = (dir, accept) => {
    let names
    try { names = readdirSync(dir) } catch (error) { report.unreadable.push(`${dir}: ${error?.code ?? error}`); return }
    for (const name of names) {
      if (!accept(name)) continue
      const file = path.join(dir, name)
      if (!stale(file)) { report.kept += 1; continue }
      try { unlinkSync(file); report.removed += 1 } catch { report.kept += 1 }
    }
  }
  sweep(directory, name => MARKER_NAME.test(name))
  sweep(tmp, name => LEGACY_MARKER.test(name))
  return report
}

// Whether today's sweep is still owed, with the guard stamped for it. False means the
// guard held, or could not be written (said in `report.unreadable`): either way the
// caller removes nothing. One definition for both sweeps, so they cannot disagree.
function claimDailySweep(guard, now, report) {
  // ⚠ ONLY A FINITE STAMP INSIDE THE WINDOW HOLDS THE SWEEP. A stamp in the
  // future — a clock that jumped forward and was corrected, or `Infinity` from
  // a corrupted file — would otherwise suppress every sweep from then on, and
  // a guard that wedges shut is worse than no guard because nothing says it
  // happened (Codex review, 2026-09-06). Garbage reads as NaN and self-heals.
  let last = NaN
  try { last = Number(readFileSync(guard, 'utf8')) } catch {}
  if (Number.isFinite(last) && last <= now && now - last < SAID_SWEEP_INTERVAL_MS) return false
  // Written before the sweep, so a sweep that fails halfway does not retry on
  // every hook call for the rest of the day. If it cannot be written the work
  // cannot be bounded AT ALL, and an unbounded readdir of the temp root on
  // every hook call is worse than markers accumulating — which is only the
  // state §146 already described. So it is said and nothing is read.
  try { writeFileSync(guard, String(now)) } catch (error) {
    report.unreadable.push(`guard: ${error?.code ?? error}`)
    return false
  }
  return true
}

// Session logs older than a week, removed at most once a day per repository, so the
// directory stops growing without bound (the per-event cost is not the problem, the
// disk is: every log carries a full copy of `checks.jsonl`).
//
// ⚠ A LOG THAT HOLDS A WRITE GIT COULD NOT SEE IS KEPT, WHATEVER ITS AGE.
// `unseenWriteSince` reads every log in this directory and vetoes a commit on such a
// write recorded after a check began. Deleting that log would turn the veto into a pass
// for a check older than the write — the fail-open direction (ADR-005). Age cannot tell
// the two apart, so the log is read; one that cannot be read is kept. Never throws: it
// runs inside a hook, and a failed sweep costs disk and nothing else. `swept` false means
// the daily guard held; `unreadable` names every place it could not look.
const UNSEEN_WRITE_LINE = /"observable":\s*false/
export function sweepStaleSessionLogs(cwd, session, now = Date.now()) {
  const report = { swept: false, removed: 0, kept: 0, unreadable: [] }
  const directory = path.join(stateDir(cwd), 'sessions')
  const guard = path.join(directory, '.swept')
  let names
  try { names = readdirSync(directory) } catch (error) {
    if (error?.code !== 'ENOENT') report.unreadable.push(`${directory}: ${error?.code ?? error}`)
    return report
  }
  if (!claimDailySweep(guard, now, report)) return report
  report.swept = true
  const own = typeof session === 'string' && session ? path.basename(sessionLogFile(cwd, session)) : null
  for (const name of names) {
    if (!name.endsWith('.jsonl') || name === own) continue
    const file = path.join(directory, name)
    try {
      if (now - statSync(file).mtimeMs <= SAID_MARKER_MAX_AGE_MS || UNSEEN_WRITE_LINE.test(readFileSync(file, 'utf8'))) {
        report.kept += 1
        continue
      }
      unlinkSync(file)
      report.removed += 1
    } catch (error) {
      report.kept += 1
      report.unreadable.push(`${name}: ${error?.code ?? error}`)
    }
  }
  return report
}

function sessionMentionPath(sessionId, key) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  const generation = sessionGeneration(sessionId)
  const stamp = createHash('sha256').update(`${sessionId}#${generation}#${key}`).digest('hex').slice(0, 32)
  return path.join(saidMarkerDirectory(), stamp)
}

function alreadyMentionedThisSession(sessionId, key) {
  const marker = sessionMentionPath(sessionId, key)
  if (!marker) return false
  try { return Date.now() - statSync(marker).mtimeMs <= SAID_MARKER_MAX_AGE_MS } catch { return false }
}

// ADR-094 T2: a STANDING fact is said once per repository and text for three days, not at every start.
// Keyed on the repository and the text's hash, in the directory and under the sweep of the per-session
// markers, so a changed text is a new key and is said. True means "say it now" and refreshes the marker;
// a marker that cannot be kept errs toward saying, as firstMentionThisSession does. Compaction and clear
// lose the context, so they never ask.
const STANDING_FACT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
export function firstMentionHere(root, text, { tmp = os.tmpdir(), now = Date.now() } = {}) {
  const directory = saidMarkerDirectory(tmp)
  const marker = path.join(directory, createHash('sha256').update(`here#${root}#${text}`).digest('hex').slice(0, 32))
  try {
    mkdirSync(directory, { recursive: true })
    sweepStaleMarkers(tmp, now)
    let age = null
    try { age = now - statSync(marker).mtimeMs } catch { age = null }
    if (age !== null && age >= 0 && age < STANDING_FACT_MAX_AGE_MS) return false
    writeFileSync(marker, '')
    utimesSync(marker, new Date(now), new Date(now))
  } catch { /* a marker that cannot be kept errs toward saying */ }
  return true
}

export function firstMentionThisSession(sessionId, key) {
  const marker = sessionMentionPath(sessionId, key)
  if (!marker) return true
  sweepStaleMarkers()
  // Exclusive create: two parallel tool calls carrying the same finding both
  // saw no marker and both said it in full (Codex review, 2026-09-05). EEXIST
  // is the second caller's answer; any other failure means the marker cannot
  // be kept and the finding is said, which errs toward not hiding.
  try { writeFileSync(marker, '', { flag: 'wx' }) } catch (error) { return error?.code !== 'EEXIST' }
  return true
}
// One compact SessionStart serves the note. Two readers can both see the log
// before either appends note.served, so the claim is an exclusive create.
// EEXIST means the other reader won. Any other failure does not serve the note.
export function claimCompaction(sessionId, compactionId, tmp = os.tmpdir()) {
  if (typeof sessionId !== 'string' || !sessionId || typeof compactionId !== 'string' || !compactionId) {
    return { claimed: false, reason: 'missing id' }
  }
  const directory = saidMarkerDirectory(tmp)
  try { mkdirSync(directory, { recursive: true }) } catch (error) {
    return { claimed: false, reason: error?.code ?? 'mkdir failed' }
  }
  const stamp = createHash('sha256').update(`${sessionId}#${compactionId}`).digest('hex').slice(0, 32)
  const marker = path.join(directory, stamp)
  try {
    writeFileSync(marker, '', { flag: 'wx' })
    return { claimed: true, reason: '' }
  } catch (error) {
    if (error?.code === 'EEXIST') return { claimed: false, reason: 'claimed' }
    return { claimed: false, reason: error?.code ?? 'create failed' }
  }
}


// A second, older copy of this toolkit answering instead of the plugin.
//
// A `.claude/bin/` and `.claude/hooks/` under the user's home hold a standalone
// install that some machines keep as a compatibility entrypoint. It is NOT updated with the
// plugin, and when it drifts it drifts silently: measured 2026-08-26, a
// standalone adr-lint dated 2026-07-30 predated the `acceptance-sha256:`
// digest that adr-verify now writes, so its Verification Log grammar rejected
// the exact lines adr-verify had just produced — and then cascaded into "marked
// done but no exit-0 entry". Direct invocation passed the whole time, which made
// the HOOK look like the unreliable one. A session was spent finding that.
//
// Nothing here is enforced. The harness cannot uninstall a copy it does not own;
// it can say which one it is and what differs, which is the whole cost of the bug.
// `environment` rather than a bare PATH string: a default parameter cannot carry
// "there is no PATH", because passing `undefined` is what SELECTS the default.
// The unmeasurable case is the one §3 is about, so it has to be reachable from a
// test, and an env object is the seam that makes it so.
export function shadowInstallNotice(homeDirectory = os.homedir(), pluginRoot = PLUGIN_ROOT,
  environment = process.env, platform = process.platform) {
  const digest = file => {
    try { return createHash('sha256').update(readFileSync(file)).digest('hex') } catch { return null }
  }
  // A forwarder is CURRENT BY CONSTRUCTION: it carries no version and runs the
  // newest installed plugin, so comparing its bytes to the gate it stands in for
  // says the opposite of the truth. Installing forwarders on 2026-08-27 made this
  // notice report twenty files as drifted in the same session that fixed the
  // drift, and it would have said so every session after.
  //
  // A SYMLINK needs no special case, and giving it one was wrong: a link is only
  // as current as what it points at, so a link left on an older version really is
  // behind and worth saying. The digest comparison already answers that — it
  // reads through the link — and a mutation deleting the special case stayed
  // green precisely because it was doing nothing a live link needed.
  const current = target => {
    try { return readFileSync(target, 'utf8').includes(FORWARDER_MARK) } catch { return false }
  }
  const stale = []
  // The scope is SHADOW_SCOPE, shared with sync-standalone.mjs rather than
  // restated here. The two carried separate lists until 2026-09-01, when this
  // notice named a stale `facts-gate-dispatch.sh` under the home `.claude/hooks/`
  // — a wired gate
  // dispatcher running three of five gates — and the repair tool the notice
  // sends people to answered "Nothing to do", because `hooks` was in one list
  // and not the other.
  const wired = wiredInSettings(homeDirectory)
  for (const scope of SHADOW_SCOPE) {
    const shadow = path.join(homeDirectory, '.claude', scope.home)
    let entries = []
    try { entries = readdirSync(shadow) } catch { continue }
    for (const name of entries) {
      // A skill is a directory, so the comparable file is one level down.
      const ours = scope.leaf
        ? path.join(pluginRoot, scope.shipped, name, scope.leaf)
        : path.join(pluginRoot, scope.shipped, name)
      const theirPath = scope.leaf
        ? path.join(shadow, name, scope.leaf)
        : path.join(shadow, name)
      if (!existsSync(ours)) continue
      if (current(theirPath)) continue
      // A hook under the home directory can only answer if the user's own
      // settings name it: this plugin wires its hooks through
      // ${CLAUDE_PLUGIN_ROOT} and never looks there. Reporting one nothing
      // invokes is drift that cannot be acted on, and it was doing exactly that
      // here — two files, every session, both dead.
      if (scope.wired && !wired(name)) continue
      const theirs = digest(theirPath)
      if (theirs && theirs !== digest(ours)) {
        stale.push(path.join('~', '.claude', scope.home, ...(scope.leaf ? [name, scope.leaf] : [name])))
      }
    }
  }
  // A file a PAST installer left that this plugin no longer ships is a different
  // thing from a drifted copy, and the right action differs: a drifted copy is
  // refreshed, an orphan is not ours to touch. ADR-019 decided that naming it is
  // all that ever happens — identification is positive, and anything the three
  // routes cannot answer is counted rather than named, because on a machine
  // holding other tools' files a list of filenames is a list of accusations.
  const found = orphans(homeDirectory, pluginRoot)
  const retired = found.filter(row => row.state === 'ours-orphan')
  const unknown = found.filter(row => row.state === 'unidentified').length
  if (!stale.length && !retired.length) return ''
  const shown = stale.slice(0, 4).join(', ')
  const gates = stale.filter(entry => entry.includes(path.join('.claude', 'bin')))
  const hooks = stale.filter(entry => entry.includes(path.join('.claude', 'hooks')))
  // WHY the stale copy answers is measured, not asserted. Until 2026-09-01 this
  // sentence claimed unconditionally that the home directory is on PATH and the
  // plugin cache is not; reported from a Windows machine where both halves were
  // inverted — the home `.claude/bin` appeared nowhere on PATH and the cache's bin did,
  // so a bare gate name reached the PLUGIN. Read literally the old wording
  // invited deleting the home `.claude/bin`, which after `--link` is the forwarder set
  // that keeps bare names current — the opposite of the repair.
  //
  // `known: false` is rendered as unknown rather than as "not on PATH" (§3): an
  // absent PATH is a look that could not happen.
  const path_ = barePathWinner(homeDirectory, environment?.PATH, platform)
  // Assembled rather than written down: a literal home path may not appear in
  // anything this repository publishes (CLAUDE.md §6).
  const homeBin = path.join('~', '.claude', 'bin')
  const why = []
  if (gates.length) {
    if (!path_.known) {
      why.push('Which copy answers a gate invoked by BARE NAME depends on your PATH, which this '
        + 'session could not read, so compare the two yourself: `type adr-lint`.')
    } else if (path_.winner === 'standalone') {
      why.push('That copy WINS whenever a gate is invoked by bare name: `' + homeBin + '` sits ahead '
        + 'of the plugin cache on this PATH. So if a gate rejects something adr-verify just wrote, '
        + 'or a hook disagrees with the same tool run by hand, the old copy is answering.')
    } else if (path_.winner === 'plugin') {
      why.push('A bare gate name on this PATH reaches the PLUGIN, not that copy — the plugin cache '
        + 'sits ahead of `' + homeBin + '`. The stale copy still answers wherever it is named by its '
        + 'own path.')
    } else {
      why.push('Neither `' + homeBin + '` nor the plugin cache is on this PATH, so a bare gate name '
        + 'reaches no gate of ours at all; the stale copy answers only where it is named by path.')
    }
  }
  if (hooks.length) {
    why.push('The stale hook is wired in your own settings, so it runs alongside the plugin\'s — '
      + 'PATH does not come into it.')
  }
  // Templates were the drift that actually bit, and PATH has nothing to do with
  // it: an ADR authored from a stale adr-template.md is missing headers the
  // current gates require, so the gate reports a malformed record and the author
  // has no way to see they were writing to last month's shape. Reported
  // 2026-08-26 — a standalone template with no Governs:, no
  // **Data dependency:**, no ## Mutation Log and no ## Reachability table.
  if (stale.some(entry => entry.includes(path.join('.claude', 'templates')))) {
    why.push('A record authored from that template is missing headers the gates require, so the '
      + 'gate reports a malformed record and the author cannot see they were writing to last '
      + "month's shape.")
  }
  // Same failure one layer up: a stale SKILL.md instructs an invocation the
  // current gates no longer accept.
  if (stale.some(entry => entry.includes(path.join('.claude', 'skills')))) {
    why.push('A stale SKILL.md instructs an invocation the current gates no longer accept.')
  }
  const orphanSentence = retired.length
    ? `A past installer also left ${retired.length} file(s) here that this plugin NO LONGER SHIPS: `
      + retired.slice(0, 4).map(row =>
        `${path.join('~', '.claude', row.directory, row.name)} (${citeOrphan(row.evidence)})`)
        .join(', ')
      + `${retired.length > 4 ? `, +${retired.length - 4} more` : ''}. `
      + 'The plugin will not remove them — that is your decision, and nothing here writes to your '
      + `home directory.${unknown ? ` ${unknown} further file(s) in those directories could not be `
        + 'identified as ours either way; they are counted rather than named, because a file this '
        + 'plugin cannot prove it wrote may well be another tool\'s.' : ''}`
    : ''
  if (!stale.length) return orphanSentence
  return `Your plugin is up to date. What is behind is a SEPARATE copy of this toolkit under `
    + `your home directory, which the plugin never updates — ${shown}`
    + `${stale.length > 4 ? `, +${stale.length - 4} more` : ''}. `
    + (why.length ? `${why.join(' ')} ` : '')
    + 'To repair, run `node ' + path.join(pluginRoot, 'scripts', 'sync-standalone.mjs') + '`, which '
    + 'reports the same set this notice does and writes only with --apply; `--link` replaces the '
    + 'gates with forwarders no release can leave behind. A file that already carries the '
    + `\`${FORWARDER_MARK}\` line is current by construction and is not named above — do not `
    + `delete it.${orphanSentence ? ` ${orphanSentence}` : ''}`
}

// The plugin that is RUNNING is not always the newest one installed. Claude Code
// can keep serving a cached version across an update and a restart, and the
// session has no way to tell — every gate, skill and template it uses is then
// last week's, silently. Reported 2026-08-26: "even with updated plugin and
// restart claude uses older cache". Comparing version directories is the only
// check that catches it, because a stale copy is internally consistent.
export function staleVersionNotice(pluginRoot = PLUGIN_ROOT, homeDirectory = os.homedir()) {
  const running = /(\d+\.\d+\.\d+)$/.exec(pluginRoot)?.[1]
  if (!running) return ''
  const cache = path.join(homeDirectory, '.claude', 'plugins', 'cache',
    'quality-harness', 'quality-harness')
  let versions = []
  try { versions = readdirSync(cache) } catch { return '' }
  const order = name => {
    const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(name)
    return parts ? Number(parts[1]) * 1e6 + Number(parts[2]) * 1e3 + Number(parts[3]) : -1
  }
  const newest = versions.filter(name => existsSync(path.join(cache, name, 'scripts', 'lifecycle.mjs')))
    .sort((a, b) => order(b) - order(a))[0]
  if (!newest || order(newest) <= order(running)) return ''
  return `Heads up: this session is running quality-harness ${running}, but ${newest} is installed. `
    + 'Every gate, skill and template it uses is the older one, and a stale copy is internally '
    + 'consistent so nothing else will say so. Restart Claude Code to pick up the newer one.'
}

const CORPUS_DIR_NAMES = ['docs/adr', 'docs/specs', 'docs/decisions', 'adr', 'specs']

export function hasDecisionCorpus(root, listing = trackedPaths(root), platform = process.platform) {
  if (listing == null) return 'UNPROVEN'
  for (const rel of listing) {
    const norm = listedPath(rel, platform)
    for (const dir of CORPUS_DIR_NAMES) {
      if (norm === dir || norm.startsWith(`${dir}/`)) return true
    }
  }
  return false
}

// A corpus directory that is a link whose target is gone — a dangling symlink, or a junction left
// behind on Windows. The corpus behind it could not be read, and work-next said "No QH corpus is in
// use" over it (BACKLOG §350 C10, a Windows chaos run of 3.8.3). The paths found, absolute.
export function danglingCorpusLinks(root) {
  const found = []
  for (const dir of CORPUS_DIR_NAMES) {
    const at = path.join(root, ...dir.split('/'))
    let link
    try { link = lstatSync(at).isSymbolicLink() } catch { continue }
    if (!link) continue
    try { statSync(at) } catch { found.push(at) }
  }
  return found
}

export function sessionOrientation(cwd, { once = false } = {}) {
  const directory = nearestExistingDirectory(path.resolve(cwd ?? process.cwd()))
  if (!directory) return ''
  const found = gitRepositoryLookup(directory)
  const repositoryRoot = found.ok ? found.root : null
  const root = repositoryRoot ?? directory
  const lines = []
  // ADR-094 T2: the standing paragraphs below go through `standing`; where the hook asks (startup and
  // resume) each is said once per repository per three days. The could-not-look lines never do (ADR-005).
  const standing = text => { if (!once || firstMentionHere(root, text)) lines.push(text) }
  if (!found.ok) {
    lines.push(`could-not-look: the repository root could not be read (${found.reason}). Whether this directory is a repository, and which check it declares, is unknown.`)
  }

  const { command: check, origin } = found.ok ? checkCommandOrigin(root) : { command: null, origin: 'unproven' }
  if (origin === 'refused') {
    standing('Verification: the check declared in `.quality-harness.json` is a constant success and was refused. Declare a command that can fail.')
  } else if (check) {
    const named = origin === 'declared'
      ? `this project's own check is ${checkInCode(check)}`
      : `no \`check\` is declared in \`.quality-harness.json\`; inferred ${checkInCode(check)} from a manifest — that is not this project's own check, and it may be narrower than this project's own gate (a step the inference did not pick, such as a typecheck or lint), so its pass is not that gate's pass`
    standing(`Verification: ${named}. `
      // ADR-060: a check is an EVENT `qh-check` writes, so how the command is
      // spelled, piped or redirected no longer decides anything — but running it
      // any other way now leaves no record at all, and the orientation has to say
      // so. A peer session testing this branch ran its check directly and was
      // still told the tree was unchecked, which is correct and was not said
      // anywhere (2026-09-18).
      + 'Run it through `qh-check`: that is what records the result where the '
      + 'completion and commit advisories read it. The same command run any other '
      + 'way still proves the work to you, and leaves them nothing to see.')
  }

  const stale = staleVersionNotice()
  if (stale) standing(stale)

  const inside = repositoryRoot !== null
  const listing = inside ? trackedPaths(root) : null
  const ready = readyTaskLines(root, inside, listing)
  if (inside && ready.look === 'UNPROVEN') {
    lines.push('could-not-look: git could not list the tree (UNPROVEN). Ready tasks and corpus existence are not known.')
  }
  const corpusLook = inside ? hasDecisionCorpus(root, listing) : false
  // Only where there is a decision corpus: a repository that never opted in was
  // told to adopt its blog's `content/archive/` (cold review of 833ea52).
  if (corpusLook === true) {
    // The name test: SessionStart opens no record content (CLAUDE.md §19, ADR-092 Decision 11).
    for (const archive of unmarkedArchives(root, listing)) {
      standing(`${pathInCode(archive)} looks like an archive but has no Lifecycle marker, so it is read as live — `
        + '`adr-retire-check --adopt <active> <archive>` reports what adopting it needs; it changes nothing (skills/adr-retire §Existing Archives).')
    }
  }

  // A stale standalone copy can only give a wrong answer where a gate actually
  // runs, so the warning belongs in a repository that has a corpus for one to
  // read. Ungated it opened every session in every repository — including ones
  // that never opted into this lifecycle at all, which is the noise this
  // project was told is worse than not shipping the plugin.
  // Git-fail is UNPROVEN, not "no corpus" — a false would skip this notice.
  if (check || ready.lines.length || corpusLook === true || corpusLook === 'UNPROVEN') {
    const shadow = shadowInstallNotice()
    if (shadow) {
      standing(`${shadow} \`node \${CLAUDE_PLUGIN_ROOT}/scripts/sync-standalone.mjs\` reports `
        + 'what differs. `--apply` copies over it, which is the fix you have to remember again '
        + 'next release; `--link` turns each gate into a forwarder that resolves the newest '
        + 'installed plugin at call time, so no release touches a gate again — and a gate is now '
        + 'the only thing it links, so there is nothing left to repoint after an update. A TEMPLATE '
        + 'is refreshed only where you already keep one, and a bare-name SKILL is better deleted '
        + 'than synced: it duplicates one the '
        + 'plugin already serves as `quality-harness:<name>`, and linking it at the plugin own '
        + 'directory hides the namespaced entrypoint outright.')
    }
  }

  if (ready.lines.length) {
    const shown = surfaceReadyLines(ready.lines)
    standing(['ADR tasks in flight:', ...shown].join('\n'))
  }

  return lines.join('\n\n')
}

// The governing and killed decisions for whatever this call is about to touch.
// Wrapped so a corpus this tool cannot read costs the edit nothing.
function decisionContextFor(input) {
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd()
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (typeof target !== 'string' || !target) return ''
  const resolved = canonical(path.resolve(cwd, target))
  // Only skip work for context already emitted. A miss or failed discovery must
  // remain eligible when a governing record is added later in the same session.
  if (alreadyMentionedThisSession(input.session_id, resolved)) return ''
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const found = directory ? gitRepositoryLookup(directory) : { ok: false, root: null, reason: 'no directory' }
  if (directory && !found.ok) return 'could-not-look: the repository root could not be read, so which decisions govern this edit is unknown.'
  const root = directory ? canonical(found.root ?? directory) : null
  if (!root) return ''
  let context
  try { context = decisionContext([resolved], root) } catch { return '' }
  if (!context) return ''
  return firstMentionThisSession(input.session_id, resolved) ? context : ''
}
// The roles that say "never edits". Read from the agent type the hook payload
// carries inside a subagent, with or without the plugin namespace. A test holds
// this list to the agents' own frontmatter.
// The read-only verdict itself (BACKLOG §135). It lives HERE, not in
// reviewer-guard.mjs, because that file imports this one: a dynamic import of it
// from inside handleHook deadlocked on the ESM cycle while this module was the
// entry with a top-level await pending (Node: "unsettled top-level await").
const READ_ONLY_EDITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** A proven invocation — the only thing that may be refused. */
export function containsCommitOrPush(command) {
  return publishCommandIn(command) !== null
}
// The ADVISORY arm: the words as words (not `pre-commit`, not `records.push`).
// Everything the precise arm misses and this sees is warned about, never refused.
// PowerShell's backtick escape and an `-EncodedCommand` payload hid the word from it
// (`git comm`it`, a Windows chaos round of 626934a), so it reads both spellings too.
const PUBLISH_MENTION = /(?<![A-Za-z0-9_.-])(?:commit|push)(?![A-Za-z0-9_-])/
export function mentionsCommitOrPush(command) {
  if (typeof command !== 'string') return false
  // Split on what a base64 word cannot hold, rather than match the word: a greedy
  // match over one multi-megabyte word overflowed V8's regex stack and crashed the
  // hook before Rule P was read (a Windows chaos round of 916b515, F7). The words are
  // the same runs, and a missing `=` pad decodes to the same bytes.
  const decoded = command.split(/[^A-Za-z0-9+/]+/).filter(word => word.length >= 8).map(decodedPowerShell)
  return [command, command.replace(/`(.)/gs, '$1'), ...decoded].some(text => PUBLISH_MENTION.test(text))
}

// The shell tools a session runs commands through. Claude Code on Windows ships a
// PowerShell tool beside Bash, and every check here read `tool_name === 'Bash'`, so a
// `git push` through it was never refused and never denied to a read-only role (a
// Windows chaos round, 2.111.0-rc, P1). `hooks.json` routes it here too.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
export function readOnlyVerdict(input) {
  const tool = input?.tool_name
  if (READ_ONLY_EDITING_TOOLS.has(tool)) {
    return `This role is read-only: ${tool} is not available to it. Report the change you would make; do not make it.`
  }
  if (!SHELL_TOOLS.has(tool)) return null
  const command = input?.tool_input?.command
  if (!containsCommitOrPush(command)) return null
  return 'This role is read-only: a command naming commit or push is not available to it. Name the commit you would make in the review. Any other change you make is reported when you finish.'
}

export const READ_ONLY_ROLES = ['qh-correctness-reviewer', 'qh-scope-reviewer', 'qh-synthesis']
export function readOnlyRole(agentType) {
  if (typeof agentType !== 'string') return null
  const bare = agentType.replace(/^quality-harness:/, '')
  return READ_ONLY_ROLES.includes(bare) ? bare : null
}

// ---- ADR-060: hooks are named events, each observed and appended to a log.
// The state directory and the log itself are in `event-log.mjs`, imported above.

// The working tree, the index and HEAD as content hashes. Both hashes are taken
// over a COPY of the index with objects written to a temporary directory, the
// repository's own objects as alternate: measured 2026-09-17, the repository's
// objects, index and status are unchanged by it (ADR-060 Context).
const OBSERVE_BUDGET_MS = 5_000
// A slow host may raise it, and the suite does: git on a loaded Windows runner outran
// 5s, and every rule that needs the tree read could-not-look (release run of d174c76,
// BACKLOG §314). Anything but a positive whole number of milliseconds is ignored.
export function observeBudgetMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_OBSERVE_BUDGET_MS)
  return Number.isSafeInteger(configured) && configured > 0 ? configured : OBSERVE_BUDGET_MS
}
// `without` (ADR-094 T3, only qh-check passes it) also returns `codeTree`: the tree with those paths removed from
// the temporary index, anchored at the top. Hooks never ask, so they pay no git call for it.
export function observe(cwd, budgetMs = observeBudgetMs(), { without = [] } = {}) {
  const started = Date.now()
  const directory = nearestExistingDirectory(path.resolve(typeof cwd === 'string' ? cwd : process.cwd()))
  if (!directory) return { ok: false, reason: 'the working directory does not exist' }
  let scratch = null
  const git = (args, env = null, allowed = [0]) => {
    const remaining = budgetMs - (Date.now() - started)
    if (remaining <= 0) throw new Error(`git took more than ${budgetMs} ms`)
    const run = spawnSync('git', ['-C', directory, ...args], {
      encoding: 'utf8', timeout: remaining, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
      env: env ? { ...process.env, ...env } : process.env,
    })
    if (run.error?.code === 'ETIMEDOUT') throw new Error(`git took more than ${budgetMs} ms`)
    if (run.error) throw new Error(`git could not run (${run.error.code ?? run.error.message})`)
    if (!allowed.includes(run.status)) throw new Error(`git ${args[0]} exited ${run.status}`)
    return { status: run.status, out: run.stdout.trim() }
  }
  try {
    const root = git(['rev-parse', '--show-toplevel']).out
    const indexPath = path.resolve(directory, git(['rev-parse', '--git-path', 'index']).out)
    const objects = path.resolve(directory, git(['rev-parse', '--git-path', 'objects']).out)
    const head = git(['rev-parse', '--verify', '-q', 'HEAD'], null, [0, 1])
    scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-observe-'))
    const index = path.join(scratch, 'index')
    if (existsSync(indexPath)) {
      copyFileSync(indexPath, index)
      // ⚠ THE COPY KEEPS THE ORIGINAL'S TIME (ADR-094 T3, found at execution). Git trusts an entry's stat data
      // unless the entry is not older than the INDEX FILE: such an entry is "racily clean" and is hashed. A copy
      // made now is newer than every entry, so a file rewritten in the same second at the same size read as
      // unchanged — and the observed tree, and every pass reused on it, missed the edit. Not older than the
      // original is what git's own protocol asks. A time that cannot be set leaves the old behaviour.
      try { const original = statSync(indexPath); utimesSync(index, original.atime, original.mtime) } catch { /* the copy keeps its own time */ }
    }
    mkdirSync(path.join(scratch, 'objects'))
    const env = { GIT_INDEX_FILE: index, GIT_OBJECT_DIRECTORY: path.join(scratch, 'objects'), GIT_ALTERNATE_OBJECT_DIRECTORIES: objects }
    const indexTree = git(['write-tree'], env).out
    git(['add', '-A', ...harnessPathspecs(root)], env)
    const tree = git(['write-tree'], env).out
    let codeTree
    if (without.length) {
      git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...without.map(spec => `:(top)${spec}`)], env)
      codeTree = git(['write-tree'], env).out
    }
    return { ok: true, tree, index: indexTree, head: head.status === 0 ? head.out : null, ...(codeTree === undefined ? {} : { codeTree }) }
  } catch (failure) {
    return { ok: false, reason: failure.message }
  } finally {
    if (scratch) {
      try { rmSync(scratch, { recursive: true, force: true }) } catch { /* a leftover temp copy is not a finding */ }
    }
  }
}

// ADR-005: an observation that could not be made never matches anything.
// A `qh-check` record becomes exactly one event, the first rule that applies
// (ADR-060 Decision). Outside git no observation can be ok, so a pass there is
// not unproven: it clears only unobservable writes recorded before it started.
export function checkEventName(record) {
  if (record?.verdict === 'unstarted') return 'check.unstarted'
  // Inside git the evidence is about the TREE: a check that stages or commits has
  // not changed what it checked, and a not-ok side never matches (ADR-005).
  const treeOnly = observation => observation?.ok === true ? { ok: true, tree: observation.tree, index: null, head: null } : observation
  if (record?.verdict === 'timeout' || record?.signal) return 'check.timeout'
  // AFTER the signal: `unproven` is read from a phrase, and a recorded SIGTERM is
  // an observation. "deadline exceeded" at exit 1 with a signal is a timeout.
  if (record?.verdict === 'unproven') return 'check.unproven'
  // ⚠ GRADED ONLY ON THE TYPES qh-check WRITES. A row missing its exit was graded a failure,
  // and one whose `git` was the string "yes" a pass (js-spa-client D5, BACKLOG §319): a field
  // that is not what the writer puts there is a row nobody can read, which is could-not-look.
  if (typeof record?.exit !== 'number') return 'check.unproven'
  if (record.exit !== 0) return 'check.failed'
  if (typeof record.git !== 'boolean') return 'check.unproven'
  if (record.git === true && !sameObservation(treeOnly(record.before), treeOnly(record.after))) return 'check.unproven'
  if (record.verdict === 'no-work') return 'check.no-work'
  return 'check.passed'
}

/**
 * Import what `qh-check` wrote, and say whether the source could be read WHOLE.
 *
 * ⚠ THE SIBLING READER OF THE OTHER APPEND-ONLY FILE. `readEvents` was taught that
 * an incomplete read must not supply a positive verdict; this one still swallowed
 * a torn line with `catch { continue }` and had its return value discarded by the
 * caller. So a newer FAILURE whose line is truncated never reached the session log
 * at all — and `latestCheckFor` cannot refuse an order it cannot establish when
 * the event is simply absent. The older pass stood, and the note said a check had
 * passed. Found by a re-review and independently by an adversarial reader, both on
 * 2026-09-18.
 *
 * ⚠ A TORN APPEND LOSES TWO RECORDS, NOT ONE, and the file never repairs: a
 * truncated write leaves no trailing newline, so the NEXT record lands on the same
 * line and is unparseable with it. Measured by the reader. That is why this
 * reports a state rather than trying to recover the tail.
 */
export function importCheckRecords(cwd, session) {
  let text
  try { text = readFileSync(path.join(stateDir(cwd), 'checks.jsonl'), 'utf8') } catch (error) {
    // Never written is not the same as could-not-read.
    return { imported: 0, complete: error?.code === 'ENOENT' }
  }
  const seen = new Set(readEvents(cwd, session).filter(entry => typeof entry.record === 'string').map(entry => entry.record))
  let imported = 0
  let whole = true
  // ⚠ `checks.jsonl` IS THE AUTHORITY ON THE ORDER CHECKS RAN. It is append-only,
  // written by qh-check, so a record's INDEX in it is the one ordering nothing can
  // race. Stamping it here is what lets `latestCheckFor` refuse to be fooled by the
  // order two interleaved importers happen to append in — a wall clock can tie and
  // can run backwards, so `startedAt` could never be the authority.
  let sequence = 0
  // ⚠ qh-check ends every record with a newline, so a last line without one was not written
  // whole even when it parses — a pass cut right after its `}` is valid JSON. It is torn, and
  // never imported (a Codex review of ADR-088).
  const lines = text.split('\n')
  if (lines.pop().trim()) whole = false
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { whole = false; continue }
    if (typeof record?.id !== 'string') { whole = false; continue }
    sequence += 1
    if (seen.has(record.id)) continue
    appendEvent(cwd, session, {
      event: checkEventName(record), record: record.id, seq: sequence,
      startedAt: record.before?.at ?? null,
      before: record.before ?? null, after: record.after ?? null, exit: record.exit ?? null,
      signal: record.signal ?? null, command: record.command ?? null, origin: record.origin ?? null,
    })
    seen.add(record.id)
    imported += 1
  }
  return { imported, complete: whole }
}

/**
 * The session log `publishVerdict` judges, with every check event `checks.jsonl` does not hold
 * removed, and how many were (ADR-088 T2).
 *
 * The session log is appended to by every hook, and one hand-written `check.passed` line in it
 * cleared ADR-061's refusal (BACKLOG §295 item 9), while the one writer of check events is the
 * importer above, which copies `checks.jsonl`. So a `check.*` event is kept only when its `record`
 * names a ledger record whose grade by `checkEventName` and whose `after.tree` are the event's.
 * `check.source-unreadable` is kept always: it is the could-not-look marker, not a check.
 *
 * ⚠ A LEDGER NOT READ WHOLE BINDS NOTHING, AND SAYS SO. It returns the log unchanged with `torn`
 * set, and `publishVerdict` reads that as could-not-look: ADR-061's advice, never a refusal, and
 * never a silent pass. It cannot rely on the importer's `check.source-unreadable`, because git's
 * own hook discards the importer's answer and records none (a Codex review of ADR-088). A last line
 * with no terminating newline is torn, as the importer reads it. An absent ledger is read whole:
 * no check has been recorded, so every check event is unbound. It never writes, and the log keeps
 * its `complete` flag, which `.filter` would otherwise drop (see `logIncomplete`).
 */
export function ledgerBoundLog(cwd, log) {
  const torn = { log, dropped: 0, torn: true }
  let text
  try { text = readFileSync(path.join(stateDir(cwd), 'checks.jsonl'), 'utf8') } catch (error) {
    if (error?.code !== 'ENOENT') return torn
    text = ''
  }
  const lines = text.split('\n')
  if (lines.pop().trim()) return torn
  const records = new Map()
  for (const line of lines) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return torn }
    if (typeof record?.id !== 'string') return torn
    // The first record of an id is the one the importer copied.
    if (!records.has(record.id)) records.set(record.id, record)
  }
  const bound = entry => {
    if (typeof entry?.event !== 'string' || !entry.event.startsWith('check.') || entry.event === 'check.source-unreadable') return true
    const record = typeof entry.record === 'string' ? records.get(entry.record) : undefined
    return record !== undefined && checkEventName(record) === entry.event && record.after?.tree === entry.after?.tree
  }
  const kept = log.filter(bound)
  kept.complete = log.complete
  return { log: kept, dropped: log.length - kept.length }
}

export function sameObservation(a, b) {
  return a?.ok === true && b?.ok === true && a.tree === b.tree && a.index === b.index && a.head === b.head
}

/**
 * The session's baseline: its first `session.started` whose look at the tree succeeded.
 *
 * ⚠ ONE THAT COULD NOT LOOK IS NO BASELINE. A SessionStart whose git outran its budget
 * records an observation that is not ok, and read as the baseline it made every later tree
 * "changed since the session started": a Stop over a pristine tree said "work no `qh-check`
 * has passed on", and `git push` was REFUSED (go-cli-adr-corpus's corpus-chaos D5,
 * reproduced at e016066; BACKLOG §319). It is the late case instead, so the first clean
 * observation becomes the baseline, marked `late`.
 */
export function sessionBaseline(log) {
  return log.find(entry => entry.event === 'session.started' && entry.observation?.ok === true)
}

/**
 * Whether `observation` may stand as a late baseline: the first look of a session that has
 * no baseline, over a clean tree, with no write on record. recordHookEvent adopts it, and
 * publishVerdict applies the same rule without writing, for git's own hook, which prepares
 * none (Codex review of fe918bb, P2).
 *
 * ⚠ NOT AFTER THE TREE WAS SEEN. A shell edit writes no `file.written`, so a failed start,
 * a Stop that saw the edit, a commit and a clean publish look adopted the committed tree and
 * forgave it (Codex review of fe918bb, P1). An earlier look that succeeded, a baseline that
 * looked included, means this is not the first one, and what changed since is not known.
 */
function lateBaselineAllowed(log, cwd, observation) {
  return !logIncomplete(log) && !log.some(event => event.observation?.ok === true)
    && !log.some(event => event.event === 'file.written' && event.observable !== false)
    && observedClean(cwd, observation)
}

const OBSERVED_HOOK_EVENTS = {
  TaskCompleted: 'task.completed',
  PreCompact: 'context.compacting',
  SessionEnd: 'session.ending',
  SubagentStart: 'subagent.started',
  SubagentStop: 'subagent.ended',
}

function recordFileWritten(input) {
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (typeof target !== 'string' || !target) return null
  // Canonical, so this path and rule A's candidate for the same file are one key.
  const absolute = canonicalFile(path.resolve(input.cwd, target))
  // How many records each ledger held when this write happened. Only a pass recorded
  // AFTER it can cover it; the importer may append an earlier pass later in the log.
  const entry = {
    event: 'file.written', path: absolute, observable: false,
    checksSeen: ledgerRecordCount(input.cwd, 'checks.jsonl'), fastSeen: ledgerRecordCount(input.cwd, 'fast-checks.jsonl'),
  }
  // The spelling the tool was given, kept when canonicalising changed it: a path under a directory link that leads out
  // of the tree is canonicalised to its target, and the inside spelling is the only evidence the write was ours to see
  // (a Codex review of ADR-094).
  const lexical = path.resolve(input.cwd, target)
  if (lexical !== absolute) entry.lexical = lexical
  const directory = nearestExistingDirectory(path.resolve(input.cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
  const parent = nearestExistingDirectory(absolute)
  if (root && parent) {
    const resolved = path.join(canonical(parent), path.relative(parent, absolute))
    const relative = path.relative(root, resolved)
    // A symlink inside the tree to a file outside it: git lists the link, and the
    // link does not change when the file behind it does, so the tree hash cannot
    // see this write. Recorded as observable, a check that ran BEFORE the write
    // would be read as covering it (BACKLOG §201). A path that does not exist yet
    // has nothing behind it and keeps the ordinary rule.
    let behind = null
    try { behind = realpathSync(resolved) } catch { behind = null }
    const escapes = behind !== null && (() => {
      const inside = path.relative(canonical(root), behind)
      return inside.startsWith('..') || path.isAbsolute(inside)
    })()
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && !escapes) {
      const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', relative], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
      if (!ignored.error && ignored.status === 1) {
        const hashed = spawnSync('git', ['-C', root, 'hash-object', '--', relative], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
        entry.observable = true
        entry.blob = !hashed.error && hashed.status === 0 ? hashed.stdout.trim() : null
      }
    }
  }
  appendEvent(input.cwd, input.session_id, entry)
  return entry
}

// The number of records in a ledger (`checks.jsonl` or `fast-checks.jsonl`), counted
// the way `importCheckRecords` numbers `seq`. Null when the file exists and cannot be
// read: a count that was not taken is not zero (ADR-005). A last line with no terminating
// newline was not written whole, and the importer does not number it, so neither does this.
function ledgerRecordCount(cwd, file) {
  let text
  try { text = readFileSync(path.join(stateDir(cwd), file), 'utf8') } catch (error) {
    return error?.code === 'ENOENT' ? 0 : null
  }
  let count = 0
  for (const line of text.split('\n').slice(0, -1)) {
    if (!line.trim()) continue
    try { if (typeof JSON.parse(line)?.id === 'string') count += 1 } catch { /* the importer skips it too */ }
  }
  return count
}

// Whether git lists nothing changed under an observation that succeeded. A listing
// that FAILED is not a clean tree (ADR-005), so it answers false.
function observedClean(cwd, observation) {
  if (observation?.ok !== true) return false
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
  if (!root) return false
  const status = statusPaths(root)
  return status.ok !== false && status.length === 0
}

// Translate one hook into its named event, observe, and append both. Reads no
// command text. A payload without a session or a directory records nothing,
// because the log is per session.
export function recordHookEvent(input) {
  const session = input?.session_id
  if (typeof session !== 'string' || !session || typeof input.cwd !== 'string') return null
  const hook = input.hook_event_name
  if (hook === 'PostToolUse') return MUTATION_TOOLS.has(input.tool_name) ? recordFileWritten(input) : null
  let name = null
  const extra = {}
  // A Bash command that INVOKES commit or push is a publish request and is logged
  // as one. A MENTION — the word in a grep, an echo, a file name — is prepared the
  // same way (the check source imported, a late baseline adopted) so its warning
  // reads the evidence a refusal would, and is appended as nothing: it is not a
  // publish request, and every reader of `publish.requested` would otherwise count
  // it (Codex review of f67cede). A read-only role's PreToolUse never reaches
  // this function: the reviewer guard decides it alone (handleHook).
  if (hook === 'PreToolUse') {
    if (!SHELL_TOOLS.has(input.tool_name)) return null
    const command = input.tool_input?.command
    if (containsCommitOrPush(command)) name = 'publish.requested'
    else if (mentionsCommitOrPush(command)) name = 'publish.mentioned'
    else return null
  }
  if (hook === 'SessionStart') {
    // ⚠ ONLY AN EMPTY LOG GETS A BASELINE HERE. A `compact` or `resume` SessionStart
    // arrives in the middle of a session: with no `session.started` on record it
    // was taken as the beginning, and a session whose committed, unchecked write
    // had just been refused a late baseline was handed a fresh, un-`late` one —
    // `neutral`, "nothing has changed", no check ever run (different-lineage
    // review, 2026-09-19). A log with history and no baseline is the late case,
    // and the late rules below decide it.
    // ...nor does a log that could not be read whole: its real baseline may be the line that was lost.
    const existing = readEvents(input.cwd, session)
    if (existing.length > 0 || existing.complete !== true) return null
    name = 'session.started'
  } else if (hook === 'Stop') {
    if (input.stop_hook_active === true || hasBackgroundWork(input)) return null
    name = 'turn.ended'
  } else if (OBSERVED_HOOK_EVENTS[hook]) {
    name = OBSERVED_HOOK_EVENTS[hook]
    // What ties a state note to THIS compaction (see SessionStart's compact arm).
    if (hook === 'PreCompact') extra.compactionId = randomUUID()
    if (hook === 'SubagentStart' || hook === 'SubagentStop') {
      extra.agentId = typeof input.agent_id === 'string' ? input.agent_id : null
      extra.agentType = typeof input.agent_type === 'string' ? input.agent_type : null
    }
  }
  if (!name) return null
  const entry = { event: name, ...extra, observation: observe(input.cwd) }
  // ⚠ A SESSION THIS PLUGIN BEGAN WATCHING LATE HAS NO `session.started`, and every
  // "is this tree unchecked" test then read a missing baseline as "everything is
  // unchecked" — so a Stop on a PRISTINE tree said "work no `qh-check` has passed
  // on. Git reports no changed path", and asked a session that had edited nothing to
  // boot its project's test suite. That is every adopter's first turn after
  // installing or UPGRADING mid-session (peer-reproduced 2026-09-19). The first
  // observation becomes the baseline, marked `late`.
  // ONLY FROM A LOG READ WHOLE: a torn log that lost its real `session.started`
  // must not be handed a new one — a baseline re-found after the work measures that
  // work against itself. There the completeness guard answers instead.
  // AND ONLY OVER A CLEAN TREE. The accusation was false only there. On a dirty
  // tree "these paths changed and nothing has checked them" is simply true, and
  // adopting that tree as the baseline would forgive it: the first version of this
  // did, and a `git commit` over an edited file lost its publish warning.
  let lateBaseline = false
  if (name !== 'session.started') {
    const log = readEvents(input.cwd, session)
    // AND NOT OVER A WRITE ALREADY ON RECORD. PostToolUse can log a `file.written`
    // before any observing hook runs; commit it, and the first Stop sees a clean
    // tree. Adopting that as the baseline would call a session with a known,
    // unchecked write `neutral`. Only a write GIT CAN SEE counts: one outside the
    // repository says nothing about this tree and is not counted (ADR-094 T4), and
    // refusing the baseline over it accused a repository nothing had touched.
    // A `session.started` that could not look is no baseline either (sessionBaseline).
    // Nor after any earlier boundary already saw the tree (lateBaselineAllowed).
    if (lateBaselineAllowed(log, input.cwd, entry.observation)) {
      lateBaseline = appendEvent(input.cwd, session, { event: 'session.started', late: true, observation: entry.observation }) !== false
    }
  }
  // ⚠ A TORN CHECK SOURCE IS RECORDED, not returned and dropped. The readers all
  // consult the session log, so that is where the fact has to live — and it is
  // durable, because the file does not repair itself: the next boundary would
  // otherwise re-discover it and nothing downstream would ever hear. Deduped on
  // the source's size so a growing-but-still-torn file says it once per change
  // rather than once per boundary.
  const source = importCheckRecords(input.cwd, session)
  if (source.complete === false) {
    let size = null
    try { size = statSync(path.join(stateDir(input.cwd), 'checks.jsonl')).size } catch { size = null }
    const key = `checks.jsonl:${size}`
    const log = readEvents(input.cwd, session)
    if (!log.some(event => event.event === 'check.source-unreadable' && event.key === key)) {
      appendEvent(input.cwd, session, { event: 'check.source-unreadable', key })
    }
  }
  if (name === 'publish.mentioned') return lateBaseline ? { ...entry, lateBaseline: true } : entry
  if (!appendEvent(input.cwd, session, entry)) {
    return { ...entry, observation: { ok: false, reason: 'the event log could not be appended' } }
  }
  return lateBaseline ? { ...entry, lateBaseline: true } : entry
}

// ONE output per hook. A denial is the permission decision. Other findings from
// the same hook stay in the reason, so a refusal does not hide them. A legacy
// deny is passed through. Otherwise every advisory is joined. `action.emitted`
// is appended only for what was delivered.
export function deliver(actions, input, { legacy = null } = {}) {
  const event = input?.hook_event_name
  const denials = actions.filter(action => action.deny)
  let delivered
  let output
  if (denials.length) {
    const denial = denials[0]
    const rest = actions.filter(action => action !== denial && typeof action.text === 'string' && action.text)
    const text = [denial.text, ...rest.map(action => action.text)].join('\n\n')
    delivered = [denial, ...rest]
    output = {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: text },
      systemMessage: `quality-harness refused the command: ${advisoryHeadline(denial.text)}`,
    }
    process.stderr.write(`${text}\n`)
  } else if (legacy?.hookSpecificOutput?.permissionDecision === 'deny') {
    delivered = []
    output = legacy
  } else {
    delivered = actions.filter(action => typeof action.text === 'string' && action.text)
    output = legacy ? JSON.parse(JSON.stringify(legacy)) : null
    if (delivered.length) {
      const texts = delivered.map(action => action.text)
      for (const text of texts) process.stderr.write(`${text}\n`)
      const joined = texts.join('\n\n')
      output ??= {}
      if (event === 'PreToolUse') {
        const specific = output.hookSpecificOutput ?? { hookEventName: 'PreToolUse' }
        specific.additionalContext = specific.additionalContext ? `${specific.additionalContext}\n\n${joined}` : joined
        output.hookSpecificOutput = specific
        const headline = `quality-harness advised the agent: ${advisoryHeadline(texts[0])} (full text in the transcript)`
        output.systemMessage = output.systemMessage ? `${output.systemMessage}\n${headline}` : headline
      } else {
        output.systemMessage = output.systemMessage ? `${output.systemMessage}\n\n${joined}` : joined
      }
    }
  }
  pendingOutput = output
  for (const action of delivered) {
    if (action.rule) {
      appendEvent(input.cwd, input.session_id, {
        event: 'action.emitted', rule: action.rule, key: action.key ?? null, ...(action.detail ? { detail: action.detail } : {}),
      })
    }
  }
  return { output, delivered }
}

// "Checked" for a tree: its latest check event is check.passed. A check event
// belongs to the tree of its `after` observation, and the evidence revision of a
// tree is how many check events it has, so a later check re-opens a finding.
function checkEventsFor(log, tree) {
  if (typeof tree !== 'string' || !tree) return []
  return log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.') && entry.after?.tree === tree)
}

/**
 * The check that ran LAST about this tree.
 *
 * ⚠ NOT `.at(-1)`. Two hooks importing the same `checks.jsonl` are not atomic:
 * the importer reads what it has already seen, then appends what it has not, and
 * an interleaving lands them in an order the checks never happened in. The
 * review's probe produced `older-pass, newer-fail, older-pass` and `checked:
 * true` — a stale re-append beat a real failure purely by arriving later.
 *
 * `checks.jsonl` is the authority on when a check ran, and every imported event
 * carries that check's `startedAt`. Ordering by it means a duplicate import can
 * never change WHICH check is latest, which is the guarantee a lock would have
 * bought, without one. Log position remains the tie-break, so a log whose events
 * carry no timestamps behaves exactly as before rather than worse.
 * Found by a different-lineage review of this branch, 2026-09-18.
 */
export function latestCheckFor(log, tree) {
  // ⚠ THE ONE PLACE A PASS BECOMES A VERDICT, SO THE ONE PLACE A TORN LOG IS
  // REFUSED. `ledgerEvidence` guarded this for itself and two other readers did
  // not, which is how `verified` and `QH ✓ checked` were produced from a log with
  // a line missing. A pass that survived may be older than a failure that did not
  // (ADR-005), so an incomplete log cannot certify — for ANY caller.
  const latest = latestRecordedCheck(log, tree)
  return latest?.event === 'check.passed' && logIncomplete(log) ? LOG_INCOMPLETE : latest
}

const LOG_INCOMPLETE = Object.freeze({ event: 'check.unproven', why: 'the log could not be read whole' })

function latestRecordedCheck(log, tree) {
  return latestOf(checkEventsFor(log, tree))
}

// The newest of some check events by when they RAN. One ordering, for the
// verdict about a tree and for the descriptive "Last check:" alike.
const ORDER_UNRESOLVED = Object.freeze({ event: 'check.unresolved', command: null })

function latestOf(events, { unresolved = 'not-a-pass' } = {}) {
  if (!events.length) return null

  // 1. A RE-IMPORT IS NOT A NEW CHECK. Two hooks reading the same `checks.jsonl`
  //    can each append the same record, so dedupe by the record it came from.
  const seen = new Set()
  const unique = []
  for (const entry of events) {
    const id = typeof entry.record === 'string' && entry.record ? entry.record : null
    if (id !== null && seen.has(id)) continue
    if (id !== null) seen.add(id)
    unique.push(entry)
  }
  if (unique.length === 1) return unique[0]

  // 2. ORDER BY THE AUTHORITY. `checks.jsonl` is append-only and its order IS the
  //    order the checks ran, so the importer stamps each event with that index as
  //    `seq`. `startedAt` is the fallback for logs written before `seq` existed —
  //    a wall clock can tie, and it can go BACKWARDS, so it is not the authority.
  const rankOf = entry => {
    if (Number.isInteger(entry.seq)) return ['seq', entry.seq]
    if (typeof entry.startedAt === 'string' && entry.startedAt) return ['at', entry.startedAt]
    return null
  }
  const ranks = unique.map(rankOf)
  const kinds = new Set(ranks.map(rank => rank?.[0] ?? 'none'))
  let candidates = unique
  if (kinds.size === 1 && !kinds.has('none')) {
    let best = null
    for (const rank of ranks) if (best === null || rank[1] > best) best = rank[1]
    candidates = unique.filter((_, index) => ranks[index][1] === best)
  }
  if (candidates.length === 1) return candidates[0]

  // ⚠ AN ORDER WE CANNOT ESTABLISH MUST NOT CERTIFY. Ties, a mix of stamped and
  // unstamped events, or nothing to order by at all: any of these could be the
  // newest, so if they disagree the one that is NOT a pass is the answer. Taking
  // the last-appended instead is what let a stale re-import beat a real failure
  // (ADR-005 — an unresolved order is could-not-look, not a verdict).
  // That is the right answer for a VERDICT. For the descriptive "Last check:" it
  // is a second unobserved claim — "the failure ran last" — so that caller asks
  // to be told the order could not be established instead.
  if (unresolved === 'say-so' && new Set(candidates.map(entry => entry.event)).size > 1) return ORDER_UNRESOLVED
  return candidates.find(entry => entry.event !== 'check.passed') ?? candidates[0]
}

function treeChecked(log, tree) {
  return latestCheckFor(log, tree)?.event === 'check.passed'
}
// 'passed' certifies. 'unresolved' is an order that could not be established:
// it must not be said as "no check has passed", and it must not clear the tree.
// 'unknown' is a log that was not read whole.
function checkStanding(log, tree) {
  if (logIncomplete(log)) return 'unknown'
  const descriptive = latestOf(checkEventsFor(log, tree), { unresolved: 'say-so' })
  if (!descriptive) return 'none'
  if (descriptive.event === 'check.unresolved') return 'unresolved'
  if (descriptive.event === 'check.passed') return 'passed'
  // A check that timed out, never started, or could not observe its tree said
  // nothing about the tree. It is not a failure, and it must not refuse (ADR-061).
  if (COULD_NOT_LOOK.has(descriptive.event)) return 'could-not-look'
  return 'not-passed'
}
const COULD_NOT_LOOK = new Set(['check.unproven', 'check.timeout', 'check.unstarted'])


function checkRevision(log, tree) {
  return checkEventsFor(log, tree).length
}

function inferredCheckCaveat(cwd) {
  const { command, origin } = checkCommandOrigin(cwd)
  return origin === 'inferred'
    ? ` The check ${checkInCode(command)} was inferred from a manifest, not declared; declare it as \`check\` in .quality-harness.json.`
    : ''
}

// P `publish-unchecked` (ADR-060): before a command naming commit or push runs,
// when the tree or the index is unchecked and differs from the session's start.
// It says the command is about to run while this repository is unchecked; it
// does not claim the command publishes this repository, which it may not.
// ── ADR-066 T2: SessionStart offers git the publish hook ────────────────────
//
// Through the env file the host sources before every Bash call, so nothing is
// written into any repository. It is an OFFER, not arming: a session counts as
// armed only once the hook itself has run (`publish.hook-ran`, T1). A shell that
// never sourced the file, a git below 2.54 and a different git on PATH would
// otherwise be recorded as protected while nothing ran (ADR-066 review, P1).
//
// Two hook names, not one: git appends its own arguments to a config hook's
// command but does not say which event it is running, so each command names its
// event. `enabled=true` is exported too, because configuration from the
// environment outranks a repository's own file — a repo-local `enabled false`
// does not switch it off (measured 2026-09-26).
const PUBLISH_HOOK_SCRIPT = fileURLToPath(new URL('./publish-hook.mjs', import.meta.url))

/** The POSIX shell lines that add the hook for a session, after any GIT_CONFIG_* already in force. */
export function publishHookExports(node = process.execPath, script = PUBLISH_HOOK_SCRIPT) {
  const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`
  // Forward slashes: git runs the command through sh, including Git for Windows.
  // Single quotes inside the stored command: git runs it through sh, and double
  // quotes left a `$` or a backtick in the installation path to be expanded (Codex
  // review of 3.0.0). Forward slashes, because Git for Windows runs it through sh too.
  const single = value => `'${String(value).replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`
  // ⚠ git REFUSES the commit when a hook command cannot start, and these exports reach
  // every repository the shell touches: a baked node that `brew upgrade` removed made
  // git refuse every commit and push on the machine (a corpus-chaos run of 916b515,
  // ts-generator LEAD 1). So the node on PATH stands in for a moved one, and a
  // missing script is could-not-look, which refuses nothing (ADR-005) and says so.
  // `exec` comes last: git appends its own arguments to the end of the command.
  const run = event => `n=${single(node)}; [ -x "$n" ] || n=$(command -v node) || n=; `
    + `[ -n "$n" ] && [ -f ${single(script)} ] || { echo "quality-harness: git's publish hook could not start `
    + `(node or its script is gone), so this ${event} was not judged" >&2; exit 0; }; exec "$n" ${single(script)} ${event}`
  const entries = [
    ['hook.qh-publish-commit.command', run('prepare-commit-msg')],
    ['hook.qh-publish-commit.event', 'prepare-commit-msg'],
    ['hook.qh-publish-commit.enabled', 'true'],
    ['hook.qh-publish-push.command', run('pre-push')],
    ['hook.qh-publish-push.event', 'pre-push'],
    ['hook.qh-publish-push.enabled', 'true'],
  ]
  // The index is taken WHEN THE FILE IS SOURCED, not when it is written: another
  // SessionStart hook or the user's profile may have set GIT_CONFIG_COUNT since.
  return ['# quality-harness (ADR-066): git refuses an unchecked commit or push for this session',
    '__qh_n=${GIT_CONFIG_COUNT:-0}',
    ...entries.map(([key, value], i) => `__qh_k=$((__qh_n + ${i})); export GIT_CONFIG_KEY_$__qh_k=${quote(key)} GIT_CONFIG_VALUE_$__qh_k=${quote(value)}`),
    `export GIT_CONFIG_COUNT=$((__qh_n + ${entries.length}))`,
    'unset __qh_n __qh_k', ''].join('\n')
}

/** Offer the hook for this session, and record what happened. */
// The session was offered git's hook and no hook run has followed the latest offer.
function awaitingArming(events) {
  const offered = events.map(entry => entry.event).lastIndexOf('publish.offered')
  return offered >= 0 && !events.slice(offered + 1).some(entry => entry.event === 'publish.hook-ran')
}
const ARMING_NOTE = "quality-harness: git's own refusal of an unchecked commit or push has not run yet in this "
  + 'session: it takes effect from the next prompt, and until then the text refusal applies (ADR-068).'

export function offerPublishHook({ cwd, session, env = process.env, run = spawnSync, exports = publishHookExports }) {
  const record = entry => appendEvent(cwd, session, entry)
  const file = env.CLAUDE_ENV_FILE
  if (typeof file !== 'string' || !file) return record({ event: 'publish.unarmed', reason: 'CLAUDE_ENV_FILE is not set' })
  let existing = ''
  try { existing = readFileSync(file, 'utf8') } catch (error) {
    if (error?.code !== 'ENOENT') return record({ event: 'publish.unarmed', reason: `the env file could not be read (${error?.code ?? error})` })
  }
  // Once per env file: a resume or compact SessionStart must not add a second copy.
  if (existing.includes('hook.qh-publish-')) return null
  const probe = run('git', ['-c', 'hook.qhprobe.command=true', '-c', 'hook.qhprobe.event=pre-commit', 'hook', 'list', 'pre-commit'],
    { cwd, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  if (probe.error || probe.status !== 0 || !/\bqhprobe\b/.test(probe.stdout ?? '')) {
    const why = probe.error ? probe.error.code ?? probe.error.message : `exit ${probe.status}: ${String(probe.stderr ?? '').trim().split('\n')[0]}`
    return record({ event: 'publish.unarmed', reason: `git here does not list a config-based hook (${why}); git 2.54 or later runs them` })
  }
  try { appendFileSync(file, exports()) } catch (error) {
    return record({ event: 'publish.unarmed', reason: `the env file could not be written (${error?.code ?? error})` })
  }
  return record({ event: 'publish.offered' })
}





/**
 * Rule P's decision, for both of its callers (ADR-066 T1): PreToolUse, which sees
 * a command's text, and `publish-hook.mjs`, which git runs at the event itself.
 * `invoked` is the invocation the caller PROVED — the matched text, or the git
 * event — and null for a mention, which is never refused. Returns null when there
 * is nothing to say, else `{ deny, key, detail, text }`.
 */
export function publishVerdict({ cwd, session, observation, invoked, commitOnly = false }) {
  // ONE root lookup for this decision: the check and the opt-out are read from
  // the same answer, so they cannot disagree about which project this is.
  const place = nearestExistingDirectory(path.resolve(cwd))
  const found = place ? gitRepositoryLookup(place) : { ok: false, root: null, reason: 'the working directory does not exist' }
  const origin = checkCommandOrigin(cwd, found)
  if (!origin.command && origin.origin !== 'refused' && origin.origin !== 'unproven') return null
  // ⚠ A TREE THAT COULD NOT BE OBSERVED IS SAID, NEVER PASSED IN SILENCE. This
  // returned null before anything was said, so where git outran observe()'s budget an
  // unchecked commit met neither a refusal nor a word, from PreToolUse or from git's
  // own hook (reproduced with a slow git, BACKLOG §314). A state nobody could read is
  // advice, never a refusal (CLAUDE.md §16), and the sentence names the look that failed.
  if (observation?.ok !== true) {
    const reason = observation?.reason ?? 'no observation was made'
    return {
      deny: false, unobserved: true, key: `unobserved:${reason}`, detail: { reason },
      text: `quality-harness: whether this repository is checked is unknown — its working tree could not be observed (${reason}) — and the command `
        + (invoked !== null
          ? `about to run names commit or push (\`${invoked}\`). Nothing is refused on a state that could not be read. Run \`qh-check\` before publishing; on a slow host, QUALITY_HARNESS_OBSERVE_BUDGET_MS raises the 5s budget.`
          : 'about to run only mentions commit or push. Advisory; nothing is refused.')
        + inferredCheckCaveat(cwd),
    }
  }
  const now = observation
  // ADR-088 T2: only check events `checks.jsonl` holds can clear the refusal. A ledger not read
  // whole is could-not-look here whoever imported it, as a `check.source-unreadable` would say.
  const bound = ledgerBoundLog(cwd, readEvents(cwd, session))
  const { dropped } = bound
  const log = bound.torn ? Object.assign([...bound.log, { event: 'check.source-unreadable' }], { complete: bound.log.complete }) : bound.log
  // A start that could not look, judged by git's own hook, which prepares no late baseline:
  // the rule recordHookEvent adopts by, applied without writing. Only where this log holds
  // that start, so a linked worktree's empty log is not handed one (ADR-068).
  const baseline = sessionBaseline(log)?.observation
    ?? (log.some(entry => entry.event === 'session.started') && lateBaselineAllowed(log, cwd, now) ? now : undefined)
  const treeStanding = checkStanding(log, now.tree)
  const indexStanding = checkStanding(log, now.index)
  const treeUnchecked = treeStanding !== 'passed' && (baseline?.ok !== true || now.tree !== baseline.tree)
  const indexUnchecked = indexStanding !== 'passed' && (baseline?.ok !== true || now.index !== baseline.index)
  const revision = checkRevision(log, now.tree)
  // A record that could not be read whole is a state of its own: advice already given on this tree
  // must not swallow the could-not-look advice that follows it (a review of 8fe4fa8).
  const key = `${now.tree}:${now.index}:${revision}${logIncomplete(log) ? ':unknown' : ''}`
  if (!treeUnchecked && !indexUnchecked) {
    // ⚠ A TREE AND INDEX EQUAL TO THE BASELINE NEED NO CHECK (ADR-061), BUT A RECORD NOT READ
    // WHOLE IS STILL SAID. This returned null whatever the ledger held, so a torn `checks.jsonl`
    // went unsaid at every baseline-equal publish, from PreToolUse and from git's own hook alike
    // (ADR-088 Follow-ups). Advice, never a refusal: nothing here needs a check, and the record
    // that tore is what later verdicts on this repository will have to read.
    if (!logIncomplete(log)) return null
    return {
      deny: false, unknown: true, key, detail: { tree: now.tree, revision },
      text: `quality-harness: ${tornRecord(log, 'the session log')} could not be read whole, so what \`qh-check\` recorded here cannot be shown. The command `
        + (invoked !== null ? `about to run names commit or push (\`${invoked}\`)` : 'about to run only mentions commit or push')
        + ' on a working tree and index unchanged since the session started, which need no check, so nothing is refused. While that record stays torn, a publish of changed work here is advice, never refused (ADR-061).',
    }
  }
  // ⚠ THE TREE'S STANDING DECIDES THE REFUSAL, and only the tree's. An index whose
  // check could not look is a finding about the index; folding it in here let it
  // rescue a working tree that FAILED (Codex review round 2, 2026-09-22).
  const unordered = treeStanding === 'unresolved'
  const couldNotLook = treeStanding === 'could-not-look'
  const indexUnknown = indexStanding === 'unresolved' || indexStanding === 'could-not-look'
  // ⚠ ONLY THE TREE CAN REFUSE. A check runs on the working tree, and the index is
  // compared against those trees, so a staged change beside an untracked file
  // equals no checked tree and was denied after every pass (found live by a peer,
  // 2026-09-22). The index still warns: its exact bytes were never checked.
  // A project may opt out with `"publish": "warn"` (ADR-061 revision 3); the
  // warning below is then all it gets, on every attempt the dedupe allows.
  const setting = publishSetting(cwd, found)
  // Only a PROVEN invocation may be refused (CLAUDE.md §16: a block needs stronger
  // evidence than advice). A command that merely mentions the words is warned.
  const deny = treeUnchecked && !logIncomplete(log) && !unordered && !couldNotLook && origin.origin !== 'unproven' && !setting.warn && invoked !== null
  // ADR-081: a command proven to be one commit, on a tree whose latest declared fast
  // check passed, is told rather than refused. Its key carries the fast records, so a
  // commit refused before the fast pass is told after it. Anything that pushes, and
  // any form not proven, still needs the full check.
  if (deny && commitOnly) {
    const fastPass = latestFastPass(cwd, now.tree, found.root ?? cwd)
    if (fastPass) {
      // The fast check ran on the working tree; the commit records the index. A partial
      // stage is a different tree, and the full path says so at the same point.
      const staged = now.index === now.tree ? ''
        : ' The staged index is not the tree the fast check ran on (a partial stage, or files the check saw that are not staged), so what this commit records was not itself checked.'
      return {
        deny: false, fast: true, key: `${key}:fast${fastPass.count}`, detail: { tree: now.tree, revision },
        text: `quality-harness: a fast check (\`${fastPass.command}\`) passed on this tree, but the full check has not passed — this commit goes through, and a push will need \`qh-check\` to pass first (ADR-081).${staged}`,
      }
    }
  }
  // A fast pass this command cannot use (it is not proven to be one commit, or it pushes) is still a
  // pass: the sentence below said "no `qh-check` has passed" over it, which was untrue (2026-10-08).
  const fastSeen = treeUnchecked ? latestFastPass(cwd, now.tree, found.root ?? cwd) : null
  return {
    deny, key, detail: { tree: now.tree, revision },
    // A record that could not be read whole is could-not-look, which git's hook says at the event
    // rather than passing in silence (ADR-088; a Codex review of its diff).
    unknown: !deny && logIncomplete(log),
    // On a torn log this still warns — it must — but says UNKNOWN, not "no check
    // has": a check may have succeeded and its record be what was lost (ADR-005).
    // An order that cannot be established is the same kind of could-not-look.
    text: (logIncomplete(log)
      ? `quality-harness: whether this repository is checked is unknown — ${tornRecord(log, 'the session log')} could not be read whole, so whether \`qh-check\` succeeded on its current tree cannot be shown — and the command `
      : unordered
        ? 'quality-harness: whether this repository is checked is unknown — the order of its check events could not be established — and the command '
        : couldNotLook
          ? 'quality-harness: whether this repository is checked is unknown — the latest `qh-check` on its current tree could not observe it (it timed out, did not start, or its observation failed) — and the command '
        : origin.origin === 'unproven'
          ? 'quality-harness: whether this repository is checked is unknown — the repository root could not be read — and the command '
          : origin.origin === 'refused'
            ? 'quality-harness: this repository is unchecked — the check declared in .quality-harness.json is a constant success and was refused — and the command '
            : !treeUnchecked && indexUnknown && treeStanding === 'passed'
              ? 'quality-harness: the staged index is not known to be checked — `qh-check` passed on the working tree, but the index holds different content and whether a check passed on it cannot be established — and the command '
            : !treeUnchecked && treeStanding === 'passed'
              ? 'quality-harness: the staged index is unchecked — `qh-check` passed on the working tree, but the index holds different content (a partial stage, or files the check saw that are not staged) — and the command '
            : !treeUnchecked && indexUnknown
              ? 'quality-harness: the staged index is not known to be checked — the working tree is unchanged since the session started, but the index has moved and whether a `qh-check` passed on the staged content cannot be established — and the command '
            : !treeUnchecked
              ? 'quality-harness: the staged index is unchecked — the working tree is unchanged since the session started, but the index has moved and no `qh-check` has passed on the staged content — and the command '
              : fastSeen
                ? `quality-harness: this repository is not fully checked — a fast check (\`${fastSeen.command}\`) passed on its current tree, but only a command proven to be one \`git commit\` may go through on a fast pass, this one is not proven to be one commit, and a push needs the full check (ADR-081) — and the command `
                : 'quality-harness: this repository is unchecked — no `qh-check` has passed on its current tree — and the command ')
      + (invoked !== null
        ? `about to run names commit or push (\`${invoked}\`). Run \`qh-check\` first — it runs the declared check and records the pass this hook reads. This says what state the repository is in, not what the command publishes.`
        : 'about to run only mentions commit or push — a grep, an echo, a file name, or a form this hook does not parse. Advisory; nothing is refused. If it does publish, run `qh-check` first.')
      + (dropped > 0 ? ` ${dropped} check event(s) in this session's log name no \`qh-check\` record and were not counted.` : '')
      + `${inferredCheckCaveat(cwd)}${publishSettingNote(setting)}`,
  }
}

function publishUnchecked(input, requested, env = process.env) {
  if (requested?.event !== 'publish.requested' && requested?.event !== 'publish.mentioned') return
  let verdict = publishVerdict({
    cwd: input.cwd, session: input.session_id, observation: requested.observation,
    // Only a PROVEN invocation may be refused (CLAUDE.md §16: a block needs stronger
    // evidence than advice). A command that merely mentions the words is warned.
    invoked: publishCommandIn(input.tool_input?.command),
    commitOnly: commitOnlyCommand(input.tool_input?.command),
  })
  if (!verdict) return
  // ADR-066 T3: in a Bash session where git's own hook has RUN, a plain invocation
  // is left to git, which refuses it at the event in the repository it commits
  // into. An offer is not arming, PowerShell does not source the env file, and a
  // form that could have switched the hook off keeps the refusal.
  if (verdict.deny && input.tool_name === 'Bash' && leavesHookInPlace(input.tool_input?.command)
    && readEvents(input.cwd, input.session_id).some(entry => entry.event === 'publish.hook-ran')) {
    verdict = { ...verdict, deny: false, text: `${verdict.text} In this session git's own hook refuses it at the event (ADR-066), so this is advice.` }
  }
  // ADR-086 T2: in a Bash session, a commit the text proves lands in a repository the
  // same command created in a fresh `mktemp -d` directory is told, not refused. Its key
  // is its own, so a later mention on this tree is still told.
  if (verdict.deny && input.tool_name === 'Bash' && freshRepositoryCommit(input.tool_input?.command, env)) {
    verdict = {
      ...verdict, deny: false, key: `${verdict.key}:fresh`,
      text: 'quality-harness: this commit lands in a repository the same command creates in a fresh `mktemp -d` directory, so this checkout\'s unchecked state does not refuse it (ADR-086). If the commit was meant for this checkout, run `qh-check` first.',
    }
  }
  // A denial has to happen on every attempt. Saying it once and then allowing
  // the same command is the warning's dedupe applied to a refusal.
  if (!verdict.deny && readEvents(input.cwd, input.session_id).some(entry => entry.event === 'action.emitted' && entry.rule === 'P' && entry.key === verdict.key)) return
  queueAction({ rule: 'P', key: verdict.key, detail: verdict.detail, deny: verdict.deny, text: verdict.text })
}
// R3 `review-changed-state` (ADR-060): a read-only role's run is bracketed by its
// SubagentStart and SubagentStop observations, paired by agent id. A change in
// tree, index or HEAD between them is reported — as having happened DURING that
// run, never as done by the reviewer, since overlapping agents and the user share
// the tree. An observation that could not be made is R4's to report, not this.
// ⚠ AN ENUMERATION THAT FAILED IS NOT ONE THAT FOUND NOTHING. This returned `[]`
// for a nonzero exit, a timeout and a spawn error alike, and its callers read that
// as "no commits" and "no paths" — so a history query that could not run suppressed
// R2 and left the ledger saying `verified`, a clean answer assembled from a
// question nobody managed to ask. ADR-005 governs exactly this, and the branch was
// applying it to observations while its own git reads failed open underneath.
// Found by a different-lineage review of this branch, 2026-09-18.
//
// The result is still an array, so every existing `.length`, `.map` and spread
// keeps working; it carries `ok` beside them, and `mark` re-attaches that through a
// map so a transform cannot silently drop the one field that says the answer is
// real. `ok === false` is the only failure signal — an absent `ok` means a caller
// that never asked git anything, not a failure.
function mark(lines, ok, why = '') {
  const out = [...lines]
  out.ok = ok
  out.why = why
  return out
}

// ⚠ A PATH GIT PRINTS IS QUOTED UNLESS IT IS ASKED NOT TO BE. Every call here that
// returns paths passes `nul` and a `-z`, which has no quoting at all; the class was
// enumerated by command on 2026-09-19 and four of seven sites were still quoted
// after the first was fixed (CLAUDE.md §5). `nul` splits on NUL and trims nothing —
// a name may end in a space.
function gitLines(root, args, { nul = false } = {}) {
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true })
  if (run.error || run.status !== 0) {
    const verb = args.find(arg => /^[a-z][a-z-]*$/.test(arg)) ?? args[0]
    const why = run.error ? run.error.message : `git ${verb} exited ${run.status}`
    return mark([], false, why)
  }
  if (nul) return mark(run.stdout.split('\0').filter(Boolean), true)
  return mark(run.stdout.split('\n').map(line => line.trimEnd()).filter(Boolean), true)
}

function reviewChangedState(input, ended) {
  const role = readOnlyRole(input.agent_type)
  if (!role || ended?.event !== 'subagent.ended' || typeof input.agent_id !== 'string') return
  const log = readEvents(input.cwd, input.session_id)
  const started = log.filter(entry => entry.event === 'subagent.started' && entry.agentId === input.agent_id).at(-1)
  const before = started?.observation
  const after = ended.observation
  if (before?.ok !== true || after?.ok !== true) {
    // ⚠ A BRACKET THAT COULD NOT BE OBSERVED IS NOT A RUN WHERE NOTHING CHANGED.
    // This returned, under a comment elsewhere saying "an observation that could
    // not be made is R4's to report" — and a read-only role's end SKIPS the
    // completion rules, so R4 never runs here. A failed `git` at either end of a
    // review, or a torn `subagent.started` line (audit B5), was reported nowhere.
    // ONE arm for every way a bracket goes missing: the torn-log case had an arm of
    // its own above this one, and once this existed a mutant deleting that arm
    // survived in CI — this one answered for it. The torn line never repairs, so
    // each is said once per agent.
    const unobservedKey = `${input.agent_id}:unobserved`
    // Told-already is read from the action's DETAIL, not from the shape of its key.
    // A key is `<agent>:<word>` and an agent id is free text: honouring the old
    // arm's `<agent>:unknown` key silenced agent `a` because agent `a:unknown` had
    // a state-change finding on record (fourth review). A session upgraded mid-way
    // may therefore hear this once more — said twice is the direction to fail in.
    const told = entry => entry.detail?.kind === 'unobserved' && entry.detail.agent === input.agent_id
    if (!log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && told(entry))) {
      const why = !started
        // Only the session's own log can have lost where the run began; a torn `checks.jsonl` cannot.
        ? (log?.complete !== true
          ? 'this session\'s event log could not be read whole, and the record of where that run began may be among what was lost'
          : 'where that run began was never recorded')
        : before?.ok !== true ? `the repository could not be observed when it began (${before?.reason ?? 'no reason was recorded'})`
          : `the repository could not be observed when it ended (${after?.reason ?? 'no reason was recorded'})`
      queueAction({ rule: 'R3', key: unobservedKey, detail: { kind: 'unobserved', agent: input.agent_id }, text: `quality-harness: whether the repository changed during the ${role} `
        + `run (agent ${input.agent_id}) is unknown — ${why}. That is a statement about what could be looked at, not about `
        + 'the review (ADR-005).' })
    }
    return
  }
  if (sameObservation(before, after)) return
  const key = input.agent_id
  if (log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && entry.key === key && entry.detail?.kind !== 'unobserved')) return
  const directory = nearestExistingDirectory(path.resolve(input.cwd))
  const found = directory ? gitRepositoryLookup(directory) : { ok: false, root: null, reason: 'no directory' }
  if (!found.ok) {
    const rootKey = `${key}:root`
    if (!log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && entry.key === rootKey)) {
      queueAction({ rule: 'R3', key: rootKey, text: `quality-harness: whether the repository changed during the ${role} run (agent ${key}) is unknown — the repository root could not be read (${found.reason}). That is a statement about what could be looked at, not about the review (ADR-005).` })
    }
    return
  }
  const root = found.root
  if (!root) return
  const status = gitLines(root, ['-c', 'core.quotePath=false', 'status', '--porcelain'])
  const staged = gitLines(root, ['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only'])
  const commits = before.head && after.head && before.head !== after.head
    ? gitLines(root, ['rev-list', '--oneline', `${before.head}..${after.head}`]) : []
  const lines = [`quality-harness: the repository's state changed during the ${role} run (agent ${key}). `
    + 'This says what changed during that run, not who changed it.']
  if (status.length) lines.push(`Working tree now:\n${status.map(line => `  ${line}`).join('\n')}`)
  if (staged.length) lines.push(`Staged now:\n${staged.map(line => `  ${line}`).join('\n')}`)
  if (commits.length) lines.push(`New commits:\n${commits.map(line => `  ${line}`).join('\n')}`)
  queueAction({ rule: 'R3', key, text: lines.join('\n') })
}

// ---- ADR-060's completion rules. They read the event log and git, never the
// transcript. R1 is work no check has passed on, R2 is a newly reachable commit
// whose tree nothing checked, R4 is an observation that could not be made. Each
// speaks once per rule and evidence state, so a finding does not repeat while
// nothing has moved.
function emittedFor(log, rule, key) {
  return log.some(entry => entry.event === 'action.emitted' && entry.rule === rule && entry.key === key)
}

// R2's own dedupe: one delivered action carries several commit keys in its
// detail, and a commit named in any of them has been said.
function namedByReview(log, key) {
  return log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R2'
    && (entry.key === key || entry.detail?.commits?.includes(key)))
}

// P already said this tree is unchecked, before the command ran. Saying it again
// at the end of the same turn is the repetition ADR-060 closed (BACKLOG §217).
function namedByPublish(log, tree, revision) {
  return log.some(entry => entry.event === 'action.emitted' && entry.rule === 'P'
    && entry.detail?.tree === tree && entry.detail?.revision === revision)
}

// A write git cannot see stays outstanding until a check.passed in a log that
// was read whole covers it, and a pass covers it only when BOTH orders agree.
// The record order: a write that counted the check records it saw needs a pass
// with a higher `seq`, because the importer can append an older pass after the
// write (Codex review, 2026-09-22); a write with no count falls back to log
// position, and a count that was taken and failed (`checksSeen: null`) is
// unknown, so that write stays outstanding. And the start order: the pass must
// have STARTED after the write, because a check that was already running did
// not see it. Either order alone failed open: the timestamp alone when a clock
// stepped backwards, the record order alone when a check spanned the write (CI
// mutation campaign on 0150376). Together, only a clock stepping backwards
// DURING a check can still hide a write. An incomplete log leaves every such
// write outstanding.
// ADR-094 T4: given the repository's root, an ABSOLUTE path outside it is not a write this tree could
// hold — `unseenWriteSince` has always skipped it, and a scratchpad Write made the previous-session
// notice and the completion advice accuse a repository nothing had touched. A relative or unplaceable
// path, and a symlink leaf (it keeps its own name inside the tree), still count; no root keeps today's count.
export function unobservableWrites(log, root = null) {
  const writes = (entry) => entry.event === 'file.written' && entry.observable === false
    && !(root && typeof entry.path === 'string' && path.isAbsolute(entry.path) && writtenOutside(root, entry))
  if (logIncomplete(log)) return log.filter(writes)
  const recordedAfter = (write, pass) => write.checksSeen === undefined
    || (Number.isInteger(write.checksSeen) && Number.isInteger(pass.seq) && pass.seq > write.checksSeen)
  const startedAfter = (write, pass) => typeof write.at !== 'string' || typeof pass.startedAt !== 'string'
    || pass.startedAt > write.at
  return log.filter((entry, index) => writes(entry) && !log.some((later, at) => at > index
    && later.event === 'check.passed' && recordedAfter(entry, later) && startedAfter(entry, later)))
}

// The evidence revision where nothing can be observed: every check event is one,
// since there is no tree to attach it to (ADR-005 — unknown is not "the same").
function revisionFor(log, observation) {
  return observation?.ok === true
    ? checkRevision(log, observation.tree)
    : log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.')).length
}

// The harness's own bookkeeping is not the session's work. CLAUDE_PLUGIN_DATA is
// wherever the host puts it, and a host that puts it inside the repository makes
// every hook dirty the tree it is watching — the ledger row appears as a changed
// path and moves the tree, so the same finding is made again with a new key.
// Found by a peer session's test of this branch, 2026-09-18.
function harnessPathspecs(root) {
  const home = process.env.CLAUDE_PLUGIN_DATA
  if (!root || typeof home !== 'string' || !home) return []
  const relative = path.relative(canonical(path.resolve(root)), canonical(path.resolve(home)))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return []
  return ['--', ':(top)', `:(top,exclude)${relative.split(path.sep).join('/')}`]
}

// `-uall` lists every untracked FILE. Without it git collapses an untracked
// directory to `name/`, which the artifact dispatcher cannot classify — it
// answers UNPROVEN, which is not a verdict, so the path is retried at every
// boundary for ever (same peer test).
function statusPaths(root) {
  if (!root) return mark([], true)
  // ⚠ `-z`, NOT A QUOTE STRIP. Porcelain v1 quotes an unusual name and escapes its
  // bytes as octal; stripping the quotes left `na\303\257ve.md`, a path that is
  // not on disk — shown to the user, persisted to `sessions.jsonl`, and gated by
  // rule A at every boundary for ever, since a missing file never gets an
  // identity (audit C2, reproduced in the field 2026-09-19). `core.quotePath=false`
  // fixes the octal and leaves an embedded quote, backslash or newline wrong.
  // `-z` quotes nothing: NUL-terminated, and a rename's ORIGINAL path follows as
  // its own field, which is skipped — the new name is the path that exists.
  const run = spawnSync('git', ['-C', root, 'status', '--porcelain', '-z', '-uall', ...harnessPathspecs(root)],
    { encoding: 'utf8', timeout: 5_000, maxBuffer: GIT_LISTING_BUFFER, windowsHide: true })
  if (run.error || run.status !== 0) {
    return mark([], false, run.error ? run.error.message : `git status exited ${run.status}`)
  }
  const fields = run.stdout.split('\0')
  const paths = []
  for (let index = 0; index < fields.length; index++) {
    const entry = fields[index]
    if (entry.length < 4) continue
    paths.push(entry.slice(3))
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') index++
  }
  return mark(paths, true)
}

// Commits reachable now that were not reachable when the session started. NOT
// "authored here": a fetch, a merge or a checkout makes commits reachable too,
// and this says only that no check has passed on their trees.
function sessionCommits(log, root, head) {
  const baseline = sessionBaseline(log)?.observation
  const first = baseline?.head
  if (!root || typeof head !== 'string') return mark([], true)
  // ⚠ AN UNBORN BASELINE IS OBSERVED-AND-EMPTY, NOT UNKNOWN. `observe()` records a
  // repository with no commits as `{ ok: true, head: null }` — looked at, and
  // positively empty. Requiring a STRING baseline here collapsed that into "no
  // information", so a session that started in a fresh repository and then gained
  // its whole history reported NO new commits: R2 silent in the one case where
  // every commit is new. `git init` then work is how a project starts, and a
  // scaffold that commits as it goes reaches it every time.
  const unborn = baseline?.ok === true && first === null
  if (!unborn && (typeof first !== 'string' || first === head)) return mark([], true)
  // Everything reachable from HEAD is new when the session began with nothing.
  const range = unborn ? [head] : [`${first}..${head}`]
  const lines = gitLines(root, ['log', '--format=%H%x09%T%x09%s', ...range])
  return mark(lines.map(line => {
    const [sha, tree, ...subject] = line.split('\t')
    return { sha, tree, subject: subject.join('\t') }
  }).filter(commit => commit.sha && commit.tree), lines.ok, lines.why)
}

function unseenPathNote(count) {
  if (!count) return ''
  return ` ${count} path${count === 1 ? '' : 's'} written outside this repository `
    + `${count === 1 ? 'is' : 'are'} not named here.`
}

// ⚠ NAME WHAT IS ACTUALLY UNCHECKED. A turn that ended in a commit has an
// unchecked tree and NO uncommitted change, and saying "work no `qh-check` has
// passed on" beside "git reports no changed path" made a reader decide which
// half to believe — reported by a peer session testing this branch, 2026-09-18,
// as the old commit-loop shape surviving in a quieter form. R2 is silent for
// that commit on purpose (its tree is the observed tree, which is R1's to speak
// for), so R1 is the one that has to say the commit.
function uncheckedWorkReason(cwd, paths, outside, commits = [], { logTorn = false, tornWords = null, orderUnknown = false, couldNotLook = false } = {}) {
  const shown = paths.slice(0, 8)
  const held = commits.slice(0, 3).map(commit => `\`${commit.sha.slice(0, 8)}\` ${commit.subject}`).join(', ')
  const listed = paths.length
    ? `Changed paths: ${shown.join(', ')}${paths.length > shown.length ? `, and ${paths.length - shown.length} more` : ''}.`
    : held
      ? (orderUnknown
        ? `Nothing is uncommitted: which check ran last on the tree at HEAD could not be established; it was committed as ${held}.`
        : couldNotLook
          ? `Nothing is uncommitted: the latest \`qh-check\` on the tree at HEAD could not observe it; it was committed as ${held}.`
          : `Nothing is uncommitted: what no \`qh-check\` has passed on is the tree at HEAD, committed as ${held}.`)
      : 'Git reports no changed path in the working tree.'
  // ⚠ A TORN LOG CANNOT SUPPORT "NO CHECK HAS", ONLY "NONE CAN BE SHOWN". Since a
  // surviving record no longer certifies (`latestCheckFor`), this rule fires on a
  // torn log where a check DID succeed — and its old opening then accused in the
  // vocabulary of an observation. It must keep firing: R4 speaks once per session
  // and a torn line never repairs, so silence here would be silence for good.
  // An order that cannot be established is the same: not an accusation.
  const opening = logTorn
    ? `this turn ends with work whose check state is unknown — ${tornWords ?? 'the session log'} could not be read whole, `
      + 'so whether `qh-check` succeeded on it cannot be shown.'
    : orderUnknown
      ? 'which check ran last on this turn\'s work could not be established, so it is not known to be checked.'
      : couldNotLook
        ? 'the latest `qh-check` on this turn\'s work could not observe it (it timed out, did not start, or its observation failed), so it is not known to be checked.'
      : paths.length || !held
        ? 'this turn ends with work no `qh-check` has passed on.'
        : 'this turn ends on an unchecked tree.'
  return `quality-harness: ${opening} ${listed}`
    + `${unseenPathNote(outside)} ${runTheCheckSentence(cwd)}`
}

// ONE finding per boundary, however many commits it names. A fetch, a merge or a
// branch switch makes dozens newly reachable at once, and a message per commit
// would be dozens of joined advisories in a single hook — each of them asking
// git for the check command again. Dedupe stays per commit and evidence revision
// (ADR-060's key), carried in the action's detail.
const NAMED_COMMIT_LIMIT = 5
// Exported so its wording is tested without building newly reachable commits.
export function uncheckedCommitsReason(cwd, commits, { logTorn = false, tornWords = null, orderUnknown = false, couldNotLook = false } = {}) {
  const shown = commits.slice(0, NAMED_COMMIT_LIMIT)
  const listed = shown.map(commit => `  ${commit.sha.slice(0, 8)} ${commit.subject}`).join('\n')
  const rest = commits.length > shown.length ? `\n  … and ${commits.length - shown.length} more.` : ''
  // The same correction P and R1 already carry: over a log that could not be
  // read whole, "no `qh-check` has passed" is a verdict nobody observed — the
  // lost line may be the pass. R2 kept saying it beside R4's could-not-look.
  const head = logTorn
    ? `whether a \`qh-check\` passed on ${commits.length === 1 ? 'a newly reachable commit' : `${commits.length} newly reachable commits`} `
      + `is UNKNOWN — ${tornWords ?? 'this session\'s log'} could not be read whole, and the record of a pass may be among what was lost:`
    // The flags say at least one tree is so, not that all are (Codex review
    // round 3): a plural never claims the reason for every commit it lists.
    : orderUnknown
      ? `which check ran last on ${commits.length === 1 ? 'a newly reachable commit' : `at least one of ${commits.length} newly reachable commits`} could not be established:`
      : couldNotLook
        ? `the latest \`qh-check\` on ${commits.length === 1 ? 'a newly reachable commit' : `at least one of ${commits.length} newly reachable commits`} could not observe it:`
      : commits.length === 1
        ? 'a newly reachable commit is unchecked — no `qh-check` has passed on its tree:'
        : `${commits.length} newly reachable commits are unchecked — no \`qh-check\` has passed on their trees:`
  return `quality-harness: ${head}\n${listed}${rest}\nThis says they are reachable from HEAD and `
    + `${logTorn || orderUnknown || couldNotLook ? 'not known to be checked' : 'unchecked'}, not that this session authored them. ${runTheCheckSentence(cwd)}`
}

function couldNotLookReason(cwd, reason) {
  return `quality-harness: this repository could not be observed (${reason}), so its tree, index `
    + 'and HEAD are unknown to this hook. That is a statement about what could be looked at, not '
    + 'about your work (ADR-005). Edit and Write paths are still tracked, and `qh-check` still '
    + `records what it observed. ${runTheCheckSentence(cwd)}`
}

/**
 * Whether what this session recorded could not be read whole.
 *
 * Two ways, one answer. `complete === false` is a session log with a torn line.
 * `check.source-unreadable` is `checks.jsonl` found unreadable in part — recorded
 * as an EVENT rather than returned, because the condition is durable: a torn
 * append leaves no trailing newline, so the next record lands on the same line
 * and the file never repairs itself. Either way a history missing records cannot
 * support a positive answer (ADR-005). Exported so the status line applies the
 * same precondition instead of a comment claiming it does.
 */
export function logIncomplete(log) {
  // ⚠ WHOLE IS SOMETHING A LOG HAS TO SAY, NOT SOMETHING ITS SILENCE IMPLIES.
  // This read `complete === false`, and `complete` is a property hung on an ARRAY:
  // `[...log]`, `.filter`, `.map`, `.slice` and a JSON round trip all drop it, and
  // the copy of a torn log then certified — `verified`, `QH ✓ checked` — through
  // every exported reader (different-lineage review, 2026-09-19). No production
  // site makes such a copy today; the next one would have been invisible.
  return log?.complete !== true
    || (Array.isArray(log) && log.some(event => event?.event === 'check.source-unreadable'))
}

/**
 * Which record could not be read whole, for the sentence that says so. A torn `checks.jsonl`
 * was reported as the session's own log, which was whole (a corpus-chaos run's D4, at two
 * commits): the verdict, unknown, was right and the file it named was not. `sessionWords` is
 * how the calling sentence spells the session log, kept when that is what tore.
 */
export function tornRecord(log, sessionWords = null) {
  return log?.complete !== true ? sessionWords : '`checks.jsonl`, where `qh-check` records its runs,'
}

// The ledger's evidence, computed from the tree, the commits and the writes
// THEMSELVES — never from whether a rule spoke. A P warning, a dedupe or a
// suppression must not be able to turn an unchecked state into `verified`
// (ADR-035, ADR-060 revision 4 review).
function ledgerEvidence(log, observation, baseline, commits, writes, check, status) {
  if (observation?.ok !== true) return 'could-not-look'
  // ⚠ AN ENUMERATION THAT FAILED IS COULD-NOT-LOOK TOO. The observation can be
  // fine while the follow-up git query that lists the paths or the commits is not,
  // and reading those empty results as "nothing changed" is how a failed question
  // became `verified` (ADR-005). `ok === false` is set only by a query that really
  // ran and really failed; an absent `ok` is a caller that asked git nothing.
  if (commits?.ok === false || status?.ok === false) return 'could-not-look'
  // ⚠ AND A LOG READ WHOLE IS A PRECONDITION OF EVERY POSITIVE ANSWER BELOW.
  // `treeChecked` asks the log whether a check passed on these bytes; asked of a
  // log with a torn line it can only answer from what survived, so an older pass
  // outliving a newer failure reads as `verified`. `complete === false` is set
  // only by a read that really happened and really lost something.
  if (logIncomplete(log)) return 'could-not-look'
  if (!check) return 'no-check'
  const treeUnchecked = !treeChecked(log, observation.tree)
    && (baseline?.ok !== true || observation.tree !== baseline.tree)
  if (treeUnchecked || writes.length > 0) return 'unverified'
  if (commits.some(commit => !treeChecked(log, commit.tree))) return 'unverified'
  return 'verified'
}

// Rule A `artifact-invalid` (ADR-060): the artifact gates over everything this
// session changed — committed since its first HEAD, uncommitted, and written by
// a tool — minus every path a gate has already answered for THIS content. It has
// no check gate: a malformed record is malformed whether or not the project
// named a test command. Since ADR-080 it runs behind the boundary, in one pass
// per session that writes its own ledger; see `startArtifactPass`.

/**
 * Whether a COMPLETE verdict already covers this file's current content.
 *
 * ⚠ AN UNKNOWN IDENTITY MATCHES NOTHING, INCLUDING ANOTHER UNKNOWN. `contentId`
 * documents exactly this — "Null means unreadable, which a reader must treat as
 * unknown and not as 'the same as last time'" — and the reader contradicted its
 * own contract with `answered.get(file) === contentId(file)`, where `null ===
 * null` is true. A path whose bytes could not be read when it was gated and
 * cannot be read now was therefore suppressed for ever, on the strength of two
 * non-answers agreeing. Found by a different-lineage review of this branch,
 * 2026-09-18.
 *
 * Re-gating is the safe direction: it costs a repeated check, while suppressing
 * costs a file nobody ever looks at again (ADR-005).
 */
export function alreadyAnswered(answered, file, identity) {
  if (!answered.has(file)) return false
  const recorded = answered.get(file)
  if (identity === null || identity === undefined) return false
  // A set holds every blob this path was gated COMPLETE on: content that returns to one
  // of them is that answer again. A string is the last one only (the older shape).
  if (recorded instanceof Set) return recorded.has(identity)
  if (recorded === null || recorded === undefined) return false
  return recorded === identity
}

/**
 * Every blob each path was gated COMPLETE on, from the session log. An incomplete
 * verdict is not an answer, so it is never in here (ADR-005). A set rather than the
 * last blob: content that returns to one already gated (A, then B, then A again) is
 * that answer again, and re-gating it was 24 of 1,444 gates in a week.
 */
export function answeredBlobs(log) {
  const answered = new Map()
  for (const entry of log) {
    if (entry.event === 'artifact.gated' && typeof entry.path === 'string' && entry.complete === true) {
      const blobs = answered.get(entry.path) ?? new Set()
      blobs.add(entry.blob ?? null)
      answered.set(entry.path, blobs)
    }
  }
  return answered
}

async function artifactRule(input, recorded) {
  if (typeof input.session_id !== 'string' || !input.session_id) return
  const cwd = input.cwd ?? process.cwd()
  // What a pass has answered since the last hook is in its ledger; the session
  // log learns it here, before the targets are read from it.
  importPassVerdicts(cwd, input.session_id)
  const log = readEvents(cwd, input.session_id)
  const baseline = sessionBaseline(log)?.observation
  const first = baseline?.head
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
  const paths = new Set()
  if (root && typeof first === 'string') {
    for (const relative of gitLines(root, ['diff', '--name-only', '-z', first], { nul: true })) paths.add(path.join(root, relative))
  } else if (root && baseline?.ok === true && first === null) {
    // The session began with an unborn HEAD, so every tracked path at HEAD arrived
    // during it and every one of them is a candidate. `diff` has no base to take.
    for (const relative of gitLines(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], { nul: true })) {
      paths.add(path.join(root, relative))
    }
  }
  if (root) for (const relative of statusPaths(root)) paths.add(path.join(root, relative))
  for (const entry of log) {
    if (entry.event === 'file.written' && entry.observable === true && typeof entry.path === 'string') {
      paths.add(entry.path)
    }
  }
  // A COMPLETE result about the same content is the only reason to leave a path
  // out: a timeout, an UNRUN or an UNPROVEN is not an answer, so the next
  // boundary asks again (ADR-005).
  const answered = answeredBlobs(log)
  // ⚠ IDENTITIES BEFORE THE GATES RUN, for the same reason the per-edit gate takes
  // its identity first: a file edited WHILE the batch is gating it would otherwise
  // be filed under the NEW content carrying the OLD content's verdict, and rule A
  // would suppress the one edit nothing had looked at. Taken here, before the pass
  // starts, and carried to it in the request, so the filter and the record cannot
  // disagree about what was gated. Found by a re-review, 2026-09-18 — the per-edit
  // fix had left this sibling untouched (CLAUDE.md §5).
  const identities = new Map([...paths].map(file => [file, contentId(file)]))
  // A path the gates never answer for — not absolute, or a scratch file outside a
  // scratch session (`runArtifactGates`) — would start a pass at every boundary.
  const targets = [...paths].filter(file => path.isAbsolute(file) && !(underTempRoot(file) && !underTempRoot(cwd))
    && !alreadyAnswered(answered, file, identities.get(file) ?? null))
  if (!targets.length) return
  // Nearest first: the session's own starting point, then HEAD. A record deleted
  // and committed during the session is in neither the working tree nor HEAD.
  const head = recorded?.observation?.ok === true ? recorded.observation.head : null
  const bases = [...new Set([first, head, 'HEAD'].filter(base => typeof base === 'string' && base))]
  await startArtifactPass({ ...input, cwd }, targets, identities, bases)
}

// ---- ADR-080: the artifact pass runs behind the boundary that asked for it.
// The pass writes ONE file, its own ledger, and never the session log: a torn
// line there stops the publish refusal (`publishVerdict`, ADR-061), so a second
// writer that a kill could tear is not added. Hooks import from the ledger.
const PASS_BUDGET_MS = 300_000
// A lock lives until its pass's budget ends, plus the margin its last batch may
// overrun by (`runArtifactGates`'s kill margin), plus a second.
const PASS_GRACE_MS = ARTIFACT_GATE_KILL_MARGIN_MS + 1_000
// Paths per synchronous batch: a pass stopped part way loses at most this many
// verdicts, and its ADR ledger is shared across batches.
const PASS_CHUNK = 8

function passBudgetMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_ARTIFACT_PASS_BUDGET_MS)
  if (Number.isFinite(configured) && configured > 0) return configured
  // The older setting still names a budget, and 0 still means "none": the pass
  // then says what it did not gate. Anything else is ignored, never honoured.
  const legacy = Number(env.QUALITY_HARNESS_ARTIFACT_BUDGET_MS)
  return Number.isFinite(legacy) && legacy >= 0 ? legacy : PASS_BUDGET_MS
}

function passFiles(cwd, session) {
  const directory = path.join(stateDir(cwd), 'passes')
  const name = String(session).replace(/[^A-Za-z0-9._-]/g, '_')
  return { directory, ledger: path.join(directory, `${name}.jsonl`), lock: path.join(directory, `${name}.lock`) }
}

/**
 * claimPassLock creates a session's pass lock exclusively. It answers
 * `{ token, deadline }` when this call holds it, `null` when a pass holds it, and
 * `{ error }` when it cannot be made. A lock past its deadline is reclaimed
 * whatever its pid says: a pid can be reused, and a pass's gates can outlive it
 * (Codex review of ADR-080). Only ONE claimant may succeed a given stale lock: the
 * successor is a file named for the stale lock's token and created exclusively,
 * and it replaces the lock only while the lock is still that stale one. The one
 * window left is an owner releasing at the very instant of its deadline, which
 * `releasePassLock` refuses to do once the deadline has passed.
 * `afterStaleRead` is the seam a test uses to run a second claimant in between.
 */
export function claimPassLock(lock, budgetMs, now = Date.now(), { afterStaleRead = null } = {}) {
  const token = randomUUID()
  const deadline = now + budgetMs + PASS_GRACE_MS
  const body = JSON.stringify({ token, pid: process.pid, deadline })
  try {
    writeFileSync(lock, body, { flag: 'wx' })
    return { token, deadline }
  } catch (error) {
    if (error?.code !== 'EEXIST') return { error: error?.code ?? String(error) }
  }
  let held = null
  try { held = JSON.parse(readFileSync(lock, 'utf8')) } catch { /* torn or gone: judged by its age */ }
  let heldDeadline = Number(held?.deadline)
  if (!Number.isFinite(heldDeadline)) {
    try { heldDeadline = statSync(lock).mtimeMs + budgetMs + PASS_GRACE_MS } catch { return null }
  }
  if (now <= heldDeadline) return null
  afterStaleRead?.()
  const name = typeof held?.token === 'string' ? held.token.replace(/[^A-Za-z0-9-]/g, '') : `torn-${Math.round(heldDeadline)}`
  const successor = `${lock}.next-${name}`
  try {
    writeFileSync(successor, body, { flag: 'wx' })
  } catch {
    // A successor whose claimant died before its rename would block every later
    // one, so an old one is cleared; this call still takes nothing.
    try { if (Date.now() - statSync(successor).mtimeMs > PASS_GRACE_MS) rmSync(successor, { force: true }) } catch { /* gone */ }
    return null
  }
  let current = null
  try { current = JSON.parse(readFileSync(lock, 'utf8')) } catch { /* torn or gone */ }
  // Another claimant already succeeded this stale lock: its successor was renamed
  // into place, so ours could be created, and the lock is no longer the stale one.
  if (held ? current?.token !== held.token : current !== null) {
    rmSync(successor, { force: true })
    return null
  }
  try {
    renameSync(successor, lock)
  } catch {
    rmSync(successor, { force: true })
    return null
  }
  return { token, deadline }
}

/**
 * releasePassLock deletes the lock only while it is this pass's and its deadline
 * has not passed: past it, the lock may already be another pass's to reclaim.
 */
export function releasePassLock(lock, token, now = Date.now()) {
  try {
    const held = JSON.parse(readFileSync(lock, 'utf8'))
    if (held.token === token && now <= Number(held.deadline)) rmSync(lock, { force: true })
  } catch { /* gone, or another pass's */ }
}

/**
 * passKey names what a ledger line says, for saying it once: the path and the
 * content it judged, whether the verdict was complete, and the words. An
 * incomplete run's notice (a timeout) therefore never takes the key a later,
 * complete verdict's finding about the same bytes needs (Codex review of ADR-080).
 */
function passKey(entry, words) {
  const said = createHash('sha256').update(words).digest('hex').slice(0, 16)
  return entry.event === 'pass.gated'
    ? `${entry.path}:${entry.blob ?? `unknown-${entry.pass}`}:${entry.complete === true ? 'complete' : 'incomplete'}:${said}`
    : `pass:${said}`
}

/**
 * importPassVerdicts copies the pass ledger's new verdicts into the session log
 * as `artifact.gated`, naming the pass, and queues each finding as rule A once per
 * path and content. A ledger line that cannot be read is not imported, so its
 * path has no verdict and is gated again (ADR-005). Two hooks at once may both
 * say a finding; that is every advisory's limit, and this one is advice.
 */
// A hook may import twice — at its start, and again at a boundary or after an
// in-process pass — before `deliver` records anything, so the keys this process
// has already queued are remembered here.
const passFindingsQueued = new Set()
function importPassVerdicts(cwd, session) {
  const { ledger, lock } = passFiles(cwd, session)
  let text = ''
  try { text = readFileSync(ledger, 'utf8') } catch { /* no pass has written yet */ }
  const log = readEvents(cwd, session)
  const started = log.filter(entry => entry.event === 'artifact.pass' && typeof entry.token === 'string')
  if (!text && !started.length) return
  const imported = new Set(log.filter(entry => entry.event === 'artifact.gated' && typeof entry.pass === 'string')
    .map(entry => `${entry.pass}\0${entry.path}`))
  const said = new Set(log.filter(entry => entry.event === 'action.emitted' && entry.rule === 'A').map(entry => entry.key))
  const findings = []
  const ended = new Set()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    if (typeof entry?.pass !== 'string') continue
    if (entry.event === 'pass.ended') ended.add(entry.pass)
    const words = typeof entry.findings === 'string' ? entry.findings.trim() : ''
    if (entry.event === 'pass.gated' && typeof entry.path === 'string') {
      const id = `${entry.pass}\0${entry.path}`
      if (!imported.has(id)) {
        imported.add(id)
        appendEvent(cwd, session, {
          event: 'artifact.gated', path: entry.path, blob: entry.blob ?? null, complete: entry.complete === true, pass: entry.pass,
        })
      }
      if (words) findings.push({ key: passKey(entry, words), text: words })
    } else if (entry.event === 'pass.finding' && words) {
      findings.push({ key: passKey(entry, words), text: words })
    }
  }
  // A pass this session started that left no end — killed, or unable to write its
  // ledger — is said, never silence (ADR-005, Codex review of ADR-080). A pass still
  // holding its lock before its deadline is running, and says nothing yet.
  let holder = null
  try { holder = JSON.parse(readFileSync(lock, 'utf8')) } catch { /* none */ }
  for (const pass of started) {
    if (ended.has(pass.token)) continue
    if (holder?.token === pass.token && Date.now() <= Number(holder.deadline)) continue
    findings.push({
      key: `pass-lost:${pass.token}`,
      text: `UNRUN — the artifact pass started at ${pass.at} left no end in its ledger: it was stopped, or could not write there. What it did not gate is gated again at the next boundary.`,
    })
  }
  let first = true
  for (const { key, text: words } of findings) {
    if (said.has(key) || passFindingsQueued.has(key)) continue
    said.add(key)
    passFindingsQueued.add(key)
    queueAction({ rule: 'A', key, text: first ? `Artifact validation failed:\n${words}` : words })
    first = false
  }
}

/**
 * startArtifactPass claims the session's lock and starts the pass detached, then
 * returns: no boundary waits on the gates (ADR-080). A held lock starts nothing.
 * A pass that cannot be started releases the lock and is said, UNRUN — never
 * silence (ADR-005). `QUALITY_HARNESS_ARTIFACT_PASS_RUNNER` names another runner,
 * and `inline` runs the same pass in this process and waits for it: the seam the
 * tests that read a verdict right after a boundary select.
 */
async function startArtifactPass(input, targets, identities, bases) {
  const unrun = why => {
    const key = `unrun:${why}`
    if (readEvents(input.cwd, input.session_id).some(entry => entry.event === 'action.emitted' && entry.rule === 'A' && entry.key === key)) return
    queueAction({
      rule: 'A', key,
      text: `Artifact validation UNRUN: the pass over ${targets.length} changed artifact(s) could not be started (${why}). Nothing was checked; the next boundary tries again.`,
    })
  }
  const { directory, ledger, lock } = passFiles(input.cwd, input.session_id)
  try { mkdirSync(directory, { recursive: true }) } catch (error) { return unrun(`its directory could not be made: ${error?.code ?? error}`) }
  const budgetMs = passBudgetMs()
  const claim = claimPassLock(lock, budgetMs)
  if (claim === null) return
  if (claim.error) return unrun(`its lock could not be made: ${claim.error}`)
  const request = path.join(directory, `${path.basename(lock, '.lock')}.${claim.token}.request.json`)
  const release = () => {
    releasePassLock(lock, claim.token)
    rmSync(request, { force: true })
  }
  // A request left by a pass that died before reading it would stay for ever.
  try {
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.request.json')) continue
      const file = path.join(directory, name)
      if (Date.now() - statSync(file).mtimeMs > PASS_BUDGET_MS * 2) rmSync(file, { force: true })
    }
  } catch { /* advisory housekeeping */ }
  try {
    writeFileSync(request, JSON.stringify({
      session: input.session_id, cwd: input.cwd, ledger, lock, token: claim.token, budgetMs, bases,
      // The pass stops by the lock's deadline less its grace, so the lock cannot
      // lapse while the pass is still gating.
      deadline: claim.deadline - PASS_GRACE_MS,
      targets: targets.map(file => ({ path: file, blob: identities.get(file) ?? null })),
    }))
  } catch (error) {
    release()
    return unrun(`its request could not be written: ${error?.code ?? error}`)
  }
  const setting = process.env.QUALITY_HARNESS_ARTIFACT_PASS_RUNNER
  // Written by the hook, which already writes this log, so a pass that leaves no
  // end in its own ledger is still known to have been started.
  const record = () => appendEvent(input.cwd, input.session_id, { event: 'artifact.pass', token: claim.token, targets: targets.length })
  if (setting === 'inline') {
    record()
    await runArtifactPass(request)
    importPassVerdicts(input.cwd, input.session_id)
    return
  }
  const runner = setting || fileURLToPath(import.meta.url)
  if (!existsSync(runner)) {
    release()
    return unrun(`its runner ${path.basename(runner)} does not exist`)
  }
  let child
  try {
    // Detached, with no stdio of the hook's, so the host's wait on this hook
    // ends when the hook does; windowsHide because a detached child has no
    // console, and every child it starts would open one (CLAUDE.md §7).
    // untimed-spawn: detached on purpose — the pass stops itself at its budget, and its lock lapses at the deadline
    child = spawn(process.execPath, [runner, '--artifact-pass', request], {
      // The temp directory, not the session's: on Windows a live process's working
      // directory cannot be deleted, so a pass must not pin the user's checkout.
      cwd: os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true,
    })
    // Before any return: a spawn that fails emits `error` later, and unheard it
    // is an uncaught exception in the hook (Codex review of ADR-080).
    child.on('error', () => {})
  } catch (error) {
    release()
    return unrun(error?.message ?? String(error))
  }
  if (!child.pid) {
    release()
    return unrun('the process did not start')
  }
  record()
  child.unref()
}

/**
 * runArtifactPass is the pass itself (`lifecycle.mjs --artifact-pass <request>`).
 * It gates the request's targets a chunk at a time and appends each verdict, with
 * what its gate said, to the ledger as ONE line, so no kill parts a verdict from
 * its finding (Codex review of ADR-080). Paths its budget did not reach are said
 * UNRUN and get no verdict, so the next pass takes them. It releases its own lock
 * and no other.
 */
export async function runArtifactPass(requestFile) {
  let request
  try { request = JSON.parse(readFileSync(requestFile, 'utf8')) } catch { return 2 }
  rmSync(requestFile, { force: true })
  const { ledger, lock, token, cwd } = request ?? {}
  if (typeof ledger !== 'string' || typeof lock !== 'string' || typeof token !== 'string' || typeof cwd !== 'string') return 2
  const write = entry => {
    try { appendFileSync(ledger, `${JSON.stringify({ at: new Date().toISOString(), pass: token, ...entry })}\n`) } catch { /* unwritten is ungated, and a pass with no end is said by the next hook */ }
  }
  const targets = (Array.isArray(request.targets) ? request.targets : []).filter(target => typeof target?.path === 'string')
  const blobs = new Map(targets.map(target => [target.path, target.blob ?? null]))
  const budgetMs = Number.isFinite(Number(request.budgetMs)) && Number(request.budgetMs) >= 0 ? Number(request.budgetMs) : PASS_BUDGET_MS
  const deadline = Number.isFinite(Number(request.deadline)) ? Number(request.deadline) : Date.now() + budgetMs
  write({ event: 'pass.started', pid: process.pid, targets: targets.map(target => target.path) })
  // ADR-077: a pass is a heavy run, so it holds the machine lease while it gates.
  // A lease that cannot be taken changes nothing about the pass.
  let held = null
  try {
    const taken = leaseModule.take(leaseModule.leaseDir(process.env), { command: 'quality-harness artifact pass', root: cwd, state: 'running' })
    held = taken.error ? null : taken
  } catch { /* advice about the machine, never a condition of the pass */ }
  let ledgerDirectory = null
  try { ledgerDirectory = mkdtempSync(path.join(os.tmpdir(), 'quality-harness-gates-')) } catch { /* each batch makes its own */ }
  let reason
  try {
    reason = passTargets({
      paths: targets.map(target => target.path), deadline, budgetMs, write,
      gate: (chunk, remaining, gated, said, stopped) => runArtifactGates(chunk, cwd, remaining,
        { bases: Array.isArray(request.bases) ? request.bases : [], gated, saidBy: said, stoppedBy: stopped, ledgerDirectory }),
      verdict: file => {
        const before = blobs.get(file) ?? null
        return { blob: before, steady: before !== null && before === contentId(file) }
      },
    })
  } catch (error) {
    reason = `failed: ${error?.message ?? error}`
    write({ event: 'pass.finding', findings: `UNRUN — the artifact pass failed (${error?.message ?? error}); what it did not gate is gated again at the next boundary.` })
  } finally {
    if (ledgerDirectory) {
      try { rmSync(ledgerDirectory, { recursive: true, force: true, maxRetries: 3 }) } catch { /* temp */ }
    }
    if (held) {
      try { leaseModule.release(held) } catch { /* temp */ }
    }
  }
  write({ event: 'pass.ended', reason })
  releasePassLock(lock, token)
  return 0
}

/**
 * passTargets gates `paths` a chunk at a time through `gate` and writes each
 * verdict with its findings as one ledger line. It stops at the deadline, and when
 * a batch says it stopped on cleanup nobody confirmed — the next chunk would start
 * gates beside children that may still run (Codex review of ADR-080). Either way
 * the paths it did not reach are said UNRUN and get no verdict. Returns why it
 * ended. `gate` is `runArtifactGates` in the pass and a stand-in in a test.
 */
export function passTargets({ paths, deadline, budgetMs, write, gate, verdict }) {
  for (let index = 0; index < paths.length; index += PASS_CHUNK) {
    const remaining = deadline - Date.now()
    if (remaining < 1_000) {
      write({
        event: 'pass.finding',
        findings: `UNRUN — the pass's ${Math.round(budgetMs / 1000)}s budget ended before these artifacts were gated; the next boundary takes them:\n${paths.slice(index).join('\n')}`,
      })
      return 'budget'
    }
    const chunk = paths.slice(index, index + PASS_CHUNK)
    const gated = new Map()
    const said = new Map()
    const stopped = {}
    const failure = gate(chunk, remaining, gated, said, stopped)
    for (const file of chunk) {
      if (!gated.has(file)) continue
      const { blob, steady } = verdict(file)
      // Bytes that moved under the gate were not what it judged (ADR-005).
      write({ event: 'pass.gated', path: file, blob, complete: gated.get(file) === true && steady, findings: said.get(file) ?? null })
    }
    // What the batch said about no one path — a window that ran out, a runner
    // that did not complete — is still said, once.
    let rest = failure ? failure.replace(/^Artifact validation failed:\n/, '') : ''
    for (const words of said.values()) rest = rest.split(words.trim()).join('')
    if (rest.trim()) write({ event: 'pass.finding', findings: rest.trim() })
    if (stopped.stopped) {
      const left = paths.slice(index + PASS_CHUNK)
      if (left.length) {
        write({
          event: 'pass.finding',
          findings: `UNRUN — the pass stopped (${stopped.stopped}) before these artifacts were gated; the next boundary takes them:\n${left.join('\n')}`,
        })
      }
      return `stopped: ${stopped.stopped}`
    }
  }
  return 'done'
}

function completionRules(input, ended) {
  if (!ended || typeof input.session_id !== 'string' || !input.session_id) return
  const log = readEvents(input.cwd, input.session_id)
  const observation = ended.observation
  const origin = checkCommandOrigin(input.cwd)
  const check = origin.command || (origin.origin === 'refused' ? 'refused' : null)
  const directory = nearestExistingDirectory(path.resolve(input.cwd ?? process.cwd()))
  const found = directory ? gitRepositoryLookup(directory) : { ok: false, root: null, reason: 'no directory' }
  const root = found.ok ? found.root : null
  const baseline = sessionBaseline(log)?.observation
  const writes = unobservableWrites(log, root)
  const status = observation?.ok !== true ? []
    : !found.ok ? mark([], false, found.reason)
    : statusPaths(root)
  const commits = observation?.ok !== true ? []
    : !found.ok ? mark([], false, found.reason)
    : sessionCommits(log, root, observation.head)
  recordClaim(input, completionClaim(input.last_assistant_message),
    ledgerEvidence(log, observation, baseline, commits, writes, check, status), status.length + writes.length)
  // The opt-in today's advice already requires: a project that named no check
  // cannot be asked to run one (reported from redash-api, 2026-08-26). A refused
  // declaration is a check that does not count, not a project that named none.
  if (!check) return

  const changed = [...status.map(relative => path.join(root ?? path.resolve(input.cwd), relative)),
    ...writes.map(entry => entry.path).filter(candidate => typeof candidate === 'string')]
  const quiet = (docsOnly(changed) && evidenceLimited(input.last_assistant_message))
    || (input.hook_event_name === 'Stop' && interimResponse(input.last_assistant_message))
  const revision = revisionFor(log, observation)
  const treeUnchecked = observation?.ok === true && !treeChecked(log, observation.tree)
    && (baseline?.ok !== true || observation.tree !== baseline.tree)
  if (!quiet && ((treeUnchecked && !namedByPublish(log, observation.tree, revision)) || writes.length > 0)) {
    const key = `${observation?.ok === true ? observation.tree : 'unobserved'}:${revision}:${writes.length}`
    if (!emittedFor(log, 'R1', key)) {
      // The commits R2 leaves to R1: their tree IS the tree being reported.
      const speaksFor = commits.filter(commit => observation?.ok === true && commit.tree === observation.tree)
      queueAction({ rule: 'R1', key, text: uncheckedWorkReason(input.cwd, status, writes.length, speaksFor, { logTorn: logIncomplete(log), tornWords: tornRecord(log), orderUnknown: observation?.ok === true && checkStanding(log, observation.tree) === 'unresolved', couldNotLook: observation?.ok === true && checkStanding(log, observation.tree) === 'could-not-look' }) })
    }
  }
  const unchecked = commits.filter(commit => {
    // The observed working tree is R1's to speak for, and a tree P has already
    // named at this revision has been said once.
    if (treeChecked(log, commit.tree)) return false
    if (observation?.ok === true && commit.tree === observation.tree) return false
    const commitRevision = checkRevision(log, commit.tree)
    if (namedByPublish(log, commit.tree, commitRevision)) return false
    return !namedByReview(log, `${commit.sha}:${commitRevision}`)
  })
  if (unchecked.length) {
    const keys = unchecked.map(commit => `${commit.sha}:${checkRevision(log, commit.tree)}`)
    queueAction({
      rule: 'R2', key: keys.join(' '), detail: { commits: keys },
      text: uncheckedCommitsReason(input.cwd, unchecked, { logTorn: logIncomplete(log), tornWords: tornRecord(log), orderUnknown: unchecked.some(commit => checkStanding(log, commit.tree) === 'unresolved'), couldNotLook: unchecked.some(commit => checkStanding(log, commit.tree) === 'could-not-look') }),
    })
  }
  if (observation?.ok !== true || status?.ok === false || commits?.ok === false
    || logIncomplete(log)) {
    // Once per session and cwd, read from the log rather than from a marker file
    // under os.tmpdir() (ADR-060 replaces sessionGenerationPath here).
    const key = canonical(root ?? path.resolve(input.cwd ?? process.cwd()))
    if (!emittedFor(log, 'R4', key)) {
      // NAME what could not be looked at. A failed enumeration has a reason of its
      // own — the observation may have succeeded and the follow-up query failed —
      // and "no reason was recorded" would report the wrong could-not-look.
      const why = observation?.ok !== true
        ? (observation?.reason ?? 'no reason was recorded')
        : logIncomplete(log)
          ? `${tornRecord(log, 'this session’s event log')} could not be read whole — at least one record is torn or unreadable`
          : (status?.why || commits?.why || 'a git query failed without saying why')
      queueAction({ rule: 'R4', key, text: couldNotLookReason(input.cwd, why) })
    }
  }
  // The check passed and a task file changed: the corpus wants that recorded,
  // not asserted. Not a rule — it repeats while the state it is about holds.
  if (observation?.ok === true && treeChecked(log, observation.tree)) {
    const nudge = evidenceNudge(input.cwd, changed)
    if (nudge) queueAction({ text: nudge })
  }
}


export async function handleHook(input) {
  const event = input.hook_event_name
  // ADR-060 T1: every hook first appends its named, observed event. The log is
  // additive here; a failure in it must never change an existing advisory.
  // EXCEPT a read-only role's PreToolUse, which the reviewer guard decides ALONE:
  // it is neither observed (seven git spawns before an unconditional denial) nor
  // logged (the log is the parent session's) nor warned about — a form the guard
  // cannot prove is the git-hook follow-up's, not the P rule's. Three rounds of
  // review each found a way the "reviewer still hears the warning" arm wrote to
  // or read the parent's ledger wrongly (Codex, f14e4cd and b149b50).
  let recorded = null
  const guardAlone = event === 'PreToolUse' && readOnlyRole(input.agent_type) !== null
  // ADR-084: a Skill call is counted and nothing else — before the generic event record, the pass
  // import and every advisory, so it prints nothing and costs one Node start. Only this plugin's own
  // skills: another plugin's skill names are not this plugin's to keep. A read-only role's Skill call
  // is not the parent session's to log.
  if (event === 'PreToolUse' && input.tool_name === 'Skill') {
    const skill = input.tool_input?.skill
    if (!guardAlone && typeof skill === 'string' && skill.startsWith('quality-harness:')
      && !appendEvent(input.cwd ?? process.cwd(), input.session_id, { event: 'skill.invoked', skill })) {
      process.stderr.write('[quality-harness] the skill use was not recorded in the session log.\n')
    }
    return
  }
  if (!guardAlone) {
    try { recorded = recordHookEvent(input) } catch (failure) {
      process.stderr.write(`[quality-harness] the event log was not written (${failure?.message ?? failure}).\n`)
    }
  }
  // ADR-080: what the session's artifact pass has said since the last hook is
  // imported and said by whichever hook comes next, whether or not the pass has
  // ended. Never by a read-only reviewer's PreToolUse, which touches nothing of
  // the parent's (ADR-061's sixth amendment).
  if (!guardAlone && typeof input.session_id === 'string' && input.session_id) {
    try { importPassVerdicts(input.cwd ?? process.cwd(), input.session_id) } catch (failure) {
      process.stderr.write(`[quality-harness] the artifact pass's ledger was not read (${failure?.message ?? failure}).\n`)
    }
  }
  // What a late baseline leaves genuinely unknown, said ONCE and as a limit on what
  // could be seen — never as an accusation about work nobody observed (ADR-005).
  if (recorded?.lateBaseline && projectCheckCommand(input.cwd)) {
    queueAction({
      rule: 'R4', key: `late-baseline:${input.session_id}`,
      text: 'quality-harness: began watching this session at this turn, not at its start — it was installed, enabled '
        + 'or updated while the session was running. Anything changed or committed before now was not observed, so '
        + 'nothing here speaks for it (ADR-005). From here on the working tree is measured against what it is now.',
    })
  }
  if (event === 'SubagentStop') {
    try { reviewChangedState(input, recorded) } catch (failure) {
      process.stderr.write(`[quality-harness] the reviewer state check did not run (${failure?.message ?? failure}).\n`)
    }
  }

  if (event === 'SessionStart') {
    // After compaction the session has none of the context the once-per-session
    // markers gated; a new generation makes every first mention first again.
    if (input.source === 'compact' || input.source === 'clear') bumpSessionGeneration(input.session_id)
    // The state directory grows by a full copy of checks.jsonl per session; a week-old
    // log with no unseen write in it is dead weight (never throws, once a day).
    try { sweepStaleSessionLogs(input.cwd ?? process.cwd(), input.session_id) } catch { /* disk only */ }
    // ADR-066 T2: offer git the publish hook for this session's Bash. A failure
    // here is said and costs the session nothing but the offer.
    try { offerPublishHook({ cwd: input.cwd, session: input.session_id }) } catch (failure) {
      process.stderr.write(`[quality-harness] the publish hook was not offered (${failure?.message ?? failure}).\n`)
    }
    const sections = []
    const orientation = sessionOrientation(input.cwd, { once: input.source === 'startup' || input.source === 'resume' || input.source === undefined })
    if (orientation) sections.push(orientation)
    // ADR-068 T2: after a compaction or resume, the Bash tool picks up the exports only
    // from the next user prompt (measured 2026-09-26). While no hook run follows the
    // latest offer, say which refusal is in force; it changes no verdict.
    if ((input.source === 'compact' || input.source === 'resume') && awaitingArming(readEvents(input.cwd, input.session_id))
      && (input.source === 'compact' || firstMentionHere(path.resolve(input.cwd ?? process.cwd()), ARMING_NOTE))) {
      sections.push(ARMING_NOTE)
    }
    if (input.source === 'compact') {
      // The compaction summary is the model's; this is the gates'. Hand back what
      // PreCompact measured, so the next context knows what is unverified and
      // what task was in flight without re-deriving either.
      const note = readSessionNote(input.session_id)
      // ⚠ A NOTE IS SERVED ONLY WHEN IT CAN BE TIED TO THIS COMPACTION. A replace that
      // fails twice leaves an earlier note behind. Ownership was first a comparison
      // of wall clocks (a clock stepping backwards refused a correct note), then a
      // COUNT of compactions — which a torn compacting line, a note with no count,
      // and two overlapping PreCompacts each defeated (third review). It is now the
      // id PreCompact put on its own event, and it has to be the LAST compacting
      // event in a log that was read whole. Anything else is unknown, not "older".
      // ⚠ AND IT IS SERVED ONCE. The last recorded compaction stays the last one until
      // another PreCompact runs — and when one does not (a disabled hook, a host
      // crash), the NEXT compact SessionStart matched the same id and handed back a
      // note about work long since moved on (fourth review). Serving is recorded in
      // the log, and a serve that cannot be recorded is not made.
      const events = readEvents(input.cwd, input.session_id)
      const owner = events.filter(entry => entry.event === 'context.compacting').at(-1)?.compactionId
      const tied = !logIncomplete(events) && typeof owner === 'string' && note?.compaction === owner
        && !events.some(entry => entry.event === 'note.served' && entry.compactionId === owner)
      const claim = tied ? claimCompaction(input.session_id, owner) : { claimed: false, reason: 'untied' }
      const served = tied && claim.claimed
        && appendEvent(input.cwd, input.session_id, { event: 'note.served', compactionId: owner }) !== false
      if (served && note?.text) sections.push(`What this session was doing before compaction (${note.at}): ${note.text}`)
      else if (tied && claim.reason !== 'claimed') sections.push('quality-harness: the state note for this compaction could not be claimed, so it is not served here.')
      else if (!tied && note) sections.push('quality-harness: the state note kept for this session could not be tied to this compaction, '
        + 'so what was unverified before it is unknown here (ADR-005).')
    } else if (input.source === 'startup' || input.source === undefined) {
      const previous = previousSessionNotice(input.cwd)
      if (previous) sections.push(previous)
    }
    if (sections.length) {
      emitJson({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: sections.join('\n\n'),
        },
      })
    }
    return
  }

  if (event === 'PreCompact' || event === 'SessionEnd') {
    // ADR-060 T6: both observed above, before anything here writes, so the note
    // is about the tree as it is NOW — not about the last turn end, which in a
    // long turn may never have happened. Neither event has a decision to make,
    // so neither blocks.
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
    const directory = nearestExistingDirectory(path.resolve(cwd))
    const repositoryRoot = directory ? gitRepositoryRoot(directory) : null
    const root = repositoryRoot ?? directory ?? cwd
    const facts = observedFacts(readEvents(cwd, input.session_id), repositoryRoot, recorded?.observation)
    if (event === 'PreCompact') {
      if (typeof input.session_id === 'string' && input.session_id) {
        replaceSessionNote(input.session_id, { ...sessionStateNote(facts, cwd, root, repositoryRoot !== null), compaction: recorded?.compactionId ?? null })
      }
      await artifactRule(input, recorded)
      return
    }
    // SessionEnd runs under the host's own short budget, so nothing here spawns
    // a gate: the row is the log's reading and the location key, no more.
    const home = process.env.CLAUDE_PLUGIN_DATA
    if (!home) {
      process.stderr.write('[quality-harness] CLAUDE_PLUGIN_DATA is not set, so this session\'s end was NOT recorded.\n')
      return
    }
    const note = sessionStateNote(facts, cwd, root, false, new Date(), { tasks: false })
    // Why the row says `unverified` when it is not about unchecked edits: the next
    // session reads this field INSTEAD of the sentence about edits.
    const unknown = facts.observed === false ? (facts.why ?? 'the working tree could not be observed')
      : facts.late === true && note.files.length === 0 && !note.other && facts.pending !== true
        ? 'it was watched only from partway through, and nothing changed after that; what happened before is not known'
        : null
    try {
      mkdirSync(home, { recursive: true })
      appendFileSync(path.join(home, 'sessions.jsonl'), `${JSON.stringify({
        at: note.at,
        session: typeof input.session_id === 'string' ? input.session_id : null,
        cwd,
        location: locationKey(root),
        reason: input.reason ?? null,
        status: note.status,
        unknown,
        files: note.files,
        other: note.other,
        lastVerdict: facts.lastCheck?.verdict ?? null,
      })}\n`, 'utf8')
    } catch (failure) {
      process.stderr.write(`[quality-harness] could not append to the sessions ledger (${failure.code ?? failure.message}).\n`)
    }
    return
  }

  if (event === 'SubagentStart') {
    emitJson({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: subagentContract(input),
      },
    })
    return
  }

  if (event === 'PreToolUse') {
    // A read-only role is read-only by contract, and the contract is checked HERE
    // — in the plugin-level hook, which does run inside a subagent (BACKLOG
    // §135). The same guard declared in the agents' own frontmatter was measured
    // inert on a real box: a qh-correctness-reviewer ran `sed -i` on a tracked
    // file and no hook was called. `agent_type` is what the payload carries
    // inside a subagent, so the role is read from it; the verdict is the guard's.
    if (readOnlyRole(input.agent_type) && (SHELL_TOOLS.has(input.tool_name) || MUTATION_TOOLS.has(input.tool_name))) {
      const reason = readOnlyVerdict(input)
      if (reason) {
        emitJson({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `quality-harness reviewer guard (${readOnlyRole(input.agent_type)}): ${reason}`,
          },
        })
        process.stderr.write(`quality-harness reviewer guard: ${reason}\n`)
        return
      }
    }
    // What has already been decided about this file. Not a finding — there is
    // nothing to fix and nothing to answer for; it is the one thing the corpus
    // knows that the code does not say, handed over at the moment it applies.
    if (MUTATION_TOOLS.has(input.tool_name)) {
      const context = decisionContextFor(input)
      if (context) {
        emitJson({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: context,
          },
        })
      }
      return
    }
    // No branch guard. This harness is about the quality of a project's records
    // and the evidence behind them, not about how anyone uses git — the agent
    // already knows git, and a repository that wants a branch policy states it
    // in CLAUDE.md, where a human wrote it. Told plainly on 2026-08-26 after the
    // guard fired on a command whose FIRST act was `git switch -c task/…`, the
    // very escape it was demanding.
    if (!SHELL_TOOLS.has(input.tool_name)) return
    if (!mentionsCommitOrPush(input.tool_input?.command)) return
    // `recorded` is the publish request, or the prepared-but-unlogged mention
    // (recordHookEvent). The artifact gate is a publish-time check with a
    // publish-time budget: a mention publishes nothing and gets none of it — a
    // peer measured 12 KB of adr-lint findings on a grep before this (2026-09-23).
    publishUnchecked(input, recorded)
    if (recorded?.event === 'publish.requested') await artifactRule(input, recorded)
    return
  }

  if (!['SubagentStop', 'TaskCompleted', 'Stop'].includes(event)) return
  if (input.stop_hook_active === true || (event === 'Stop' && hasBackgroundWork(input))) return
  // A read-only role's end is R3's to report; the completion rules are about the
  // session's own work, and a reviewer authored none of it.
  if (event === 'SubagentStop' && readOnlyRole(input.agent_type)) return
  completionRules(input, recorded)
  await artifactRule(input, recorded)
}

async function readStdin() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv[0] === '--artifact-pass') {
    process.exitCode = await runArtifactPass(argv[1])
    return
  }
  if (argv[0] === '--first-mention') {
    process.exitCode = firstMentionThisSession(argv[1], argv[2]) ? 0 : 1
    return
  }
  const startedAt = Date.now()
  let input
  let raw = ''
  try {
    // The parse failure used to `return` in silence at exit 0 — indistinguishable
    // from a hook with nothing to say. A peer on Windows fed this a payload with an
    // illegal escape and spent a round trip on "stdin is broken" (2026-09-23); one
    // stderr line names the real cause. A leading BOM is stripped too, since
    // PowerShell's `>` writes one. A hook that read nothing has observed nothing.
    raw = await readStdin()
    input = JSON.parse(raw.replace(/^﻿/, ''))
  } catch {
    // UTF-16 read as UTF-8 is JSON with a NUL after every ASCII character, so a payload holding NUL
    // bytes says the likely cause (BACKLOG §355, a Windows corpus-chaos run of v3.8.9).
    const utf16 = raw.includes('\u0000') ? ' It holds NUL bytes: saved as UTF-16?' : ''
    process.stderr.write(`[quality-harness] the hook payload on stdin was not JSON; nothing was read and nothing is said.${utf16}\n`)
    return
  }
  // Valid JSON that is not the object the host sends: `null` and a `cwd` that is not a
  // string crashed with a stack trace at exit 0, and `[1,2]` said nothing (a chaos
  // round of 626934a, php-react-app F7). Named the way unparsable input is.
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || (input.cwd !== undefined && typeof input.cwd !== 'string')) {
    process.stderr.write('[quality-harness] the hook payload was not an object with a string cwd; nothing was read and nothing is said.\n')
    return
  }
  try {
    await handleHook(input)
  } finally {
    // Every hook's output leaves through deliver(), so a rule's action and a
    // legacy emitJson output are composed, never one overwriting the other.
    deliver(pendingActions.splice(0), input ?? {}, { legacy: pendingOutput })
    flushOutput(startedAt, input)
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
