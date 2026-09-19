#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The standalone install's scope and PATH arithmetic live in one module, shared
// with sync-standalone.mjs. Two copies of that list drifted apart once already.
import {
  FORWARDER_MARK, SHADOW_SCOPE, barePathWinner, citeOrphan, orphans, wiredInSettings,
} from './standalone-link.mjs'

import { ARTIFACT_OUTPUT_LIMIT } from './run-shell-hook.mjs'
import { findGitDir } from './git-directory.mjs'
// ADR-060's event log is shared with run-shell-hook.mjs's per-edit gate, so it
// lives in a leaf module both can import (T6).
import {
  appendEvent, canonical, nearestExistingDirectory, readEvents, sessionLogFile, stateDir,
} from './event-log.mjs'
export { appendEvent, readEvents, sessionLogFile, stateDir } from './event-log.mjs'
import { contentId } from './event-log.mjs'
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

function walk(value, visit) {
  if (!value || typeof value !== 'object') return
  visit(value)
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  for (const child of Object.values(value)) walk(child, visit)
}

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
  return /\b(?:no tests? (?:found|ran|collected|matched|to run)|ran 0 tests?|running 0 tests?|collected 0 items|0 tests? (?:run|executed|collected|passed)|0 passing|tests\s+0|no test files)\b/i.test(text)
}


function shellWords(command) {
  const words = []
  let word = ''
  let wordStarted = false
  let quote = null

  const finishWord = () => {
    if (!wordStarted) return
    words.push(word)
    word = ''
    wordStarted = false
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (quote === "'") {
      if (character === "'") quote = null
      else word += character
      continue
    }
    if (quote === '"') {
      if (character === '"') {
        quote = null
      } else if (character === '\\') {
        const next = command[index + 1]
        if (next && '$`"\\\n'.includes(next)) word += command[++index]
        else word += character
      } else {
        word += character
      }
      continue
    }
    if (/\s/.test(character)) {
      finishWord()
      continue
    }
    wordStarted = true
    if (character === "'" || character === '"') {
      quote = character
    } else if (character === '\\' && index + 1 < command.length) {
      word += command[++index]
    } else {
      word += character
    }
  }
  finishWord()
  return words
}



// Why a validation did not clear, not merely that it did not.
//
// Taken from zeus-eval-harness (a Rust harness, same author), whose
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
  const terse = saidLittle(text)
  if (NEVER_STARTED_EXITS.has(exitCode) || (terse && NEVER_STARTED.test(text))) return 'unstarted'
  if (exitCode === 124 || (terse && KILLED_ON_TIME.test(text))) return 'timeout'
  if (result.is_error === true || result.interrupted === true) return 'failed'
  if (exitCode !== null && exitCode !== 0) return 'failed'
  if (/["\']exit_code["\']\s*:\s*[1-9]\d*/i.test(serialized)
      || /\b(?:process|command)\b.{0,80}\bexit(?:ed)?(?: with)?(?: code)?\s+[1-9]\d*/i.test(text)) {
    return 'failed'
  }
  if ((anyCommand || testCommand(command)) && reportsZeroTestWork(text, command)) return 'no-work'
  return 'passed'
}

const CD_ONLY = /^cd\s+(?:"[^"]*"|'[^']*'|\S+)$/

// A command substitution inside a `cd` argument still runs a command, so it
// cannot be waved past the guard on faith — but `cd "$(git rev-parse
// --show-toplevel)" && ./verify.sh` is how a script finds its own repository
// root, and the whole-command guard rejected it as if the `$(` were hiding
// something. The project's check had just run and the gate asked for it again.
// Reported from blueprints, 2026-08-26. An explicit list of read-only idioms,
// not an inference: anything else keeps failing the guard.
const INERT_SUBSTITUTION = /^\s*(?:git\s+rev-parse\s+--show-toplevel|pwd|dirname\s+[^;&|`$()]*|realpath\s+[^;&|`$()]*|basename\s+[^;&|`$()]*)\s*$/

// Everything the whole-command guard used to reject: a second command hiding
// behind a separator, a redirect, a pipe, a background job, a substitution.
// Applied per segment now rather than to the whole string, so navigation can be
// dropped first without letting anything ride along with the validation itself.
const UNSAFE_SEGMENT = /[;`>]|\|\||\$\(|(?:^|[^|])\|(?:[^|]|$)|(?:^|[^&])&(?:[^&]|$)/
const ASSIGNMENT_ONLY = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s*)+$/

// A command run inside a container is still that command.
//
// `docker compose exec -T app php artisan test` was not validation, so a project
// whose tests run in a container produced no evidence the gate could see — 286
// passing tests, and the completion gate still asking for a check. Reported from
// a live session on 2026-08-26.
//
// Peels one container-runner prefix and one `sh -c '…'` wrapper, which together
// cover the shape people actually type:
//   docker compose run --rm --no-deps node sh -c 'cd /var/www && npm run build'
//
// Deliberately narrow. The runner words are fixed, the flag skip stops at the
// first non-flag token (the service or image), and only ONE layer of each is
// peeled — guessing deeper is how a wrapper starts laundering a mutation.
const CONTAINER_RUNNER = /^(?:sudo\s+)?(?:docker|podman)(?:\s+compose)?\s+(?:run|exec)\b/
const FLAG_WITH_VALUE = /^(?:-e|--env|-u|--user|-w|--workdir|-v|--volume|--entrypoint|-p|--publish)$/


const INTERPRETER_WORD = /\b(?:python3?|node|ruby|perl|php)\b/

const VISIBLE_CODE_MUTATION_TOKENS = new RegExp([
  'write_text', 'write_bytes', 'writeFile', 'appendFile', 'createWriteStream',
  'unlink', 'remove', 'rmtree', 'rmdir', 'rmSync', 'mkdir', 'makedirs',
  'copyfile', 'copytree', 'rename', 'replace', 'chmod', 'chown', 'shutil',
  // A USE of subprocess, not its import: a read-only argv is stripped above,
  // and `import re,pathlib,subprocess,json` on its own writes nothing.
  'subprocess\\.', 'os\\.system', 'popen', '\\bexec\\b', '\\beval\\b',
  '__import__', 'importlib', 'runpy', 'child_process', 'urlopen', 'requests',
  '\\bfetch\\b', 'axios', '\\bsocket\\b', '\\bdump\\s*\\(', 'to_csv',
  '\\bdel\\s+', '\\bunlink\\s+', '\\bFile\\.write\\b',
].join('|'), 'i')
const SAFE_VISIBLE_CALLS = new Set([
  'all', 'any', 'bool', 'console.error', 'console.log', 'dict', 'enumerate',
  'float', 'int', 'JSON.parse', 'JSON.stringify', 'json.dumps', 'json.loads',
  'len', 'list', 'map', 'max', 'min', 'Object.entries', 'Object.keys',
  'Object.values', 'Path', 'Path.cwd', 'Path.home', 'print', 'printf', 'puts',
  'range', 'read_bytes', 'read_text', 'repr', 'set', 'sorted', 'str', 'sum',
  'tuple', 'type', 'zip',
  // Introspection. Asking an object what it is writes nothing, and the default
  // here is "an unrecognised call is a mutation" — so `python -c "import
  // inspect; print(inspect.signature(X.__init__))"` was authorship, and looking
  // something up meant re-running the project's check. Reported 2026-08-26 from
  // redash-api, where the whole command was a `print` of a signature.
  'dir', 'getattr', 'hasattr', 'id', 'inspect.getmembers', 'inspect.getmodule',
  'inspect.getsource', 'inspect.isclass', 'inspect.isfunction',
  'inspect.signature', 'isinstance', 'issubclass', 'getmembers', 'getsource',
  'isclass', 'isfunction', 'signature', 'vars',
  // Pure string, regex, container and path-READ calls. Reported 2026-09-08 from
  // an outside corpus (BACKLOG §175): a heredoc that grepped the tree and printed
  // a JSON summary was a MUTATION on the strength of `re.findall(` and
  // `s.strip(`, because the default here is that an unrecognised call writes.
  'findall', 'search', 'match', 'fullmatch', 'compile', 'sub', 'split', 'strip',
  'lstrip', 'rstrip', 'join', 'lower', 'upper', 'startswith', 'endswith', 'format',
  'get', 'items', 'keys', 'values', 'append', 'extend', 'add', 'group', 'groups',
  'count', 'index', 'splitlines', 'encode', 'decode', 'glob', 'rglob', 'iterdir',
  'exists', 'is_file', 'is_dir', 'relative_to', 'resolve', 'stat', 'as_posix',
  'read', 'readline', 'readlines', 'loads', 'setdefault', 'pop', 'sort', 'reversed',
  'abs', 'round', 'hex', 'chr', 'ord', 'frozenset', 'filter', 'iter', 'next',
])

// Commands positively KNOWN to read and not write. ⚠ AN ALLOWLIST, NOT THE
// ABSENCE OF A DENYLIST. The first version stripped any subprocess whose argv
// the old mutation classifier did not recognise as mutating, which treats "I do
// not know this command" as "it is safe" — the could-not-look-is-not-a-verdict
// rule (ADR-005) inverted, inside the gate that enforces it. Codex found four
// that slipped through: `tar -xf` extracts, `find -exec` runs anything, a
// computed argv element hides the executable, and `stdout=open(...)` writes a
// file the argv never names (BACKLOG §180).
// ⚠ `sed`, `tee` and `awk` WERE IN THIS LIST AND ALL THREE WRITE. `sed -i` edits
// in place, `tee` writes every file it is given, and an awk program can redirect
// with `print > "f"`. They were typed here as "text utilities" — the exact error
// CLAUDE.md §16 is about, made by the author of §16 in the same day's work, and
// found by a different-lineage review (BACKLOG §187). A name is not a behaviour.
const READ_ONLY_CHILD = /^(?:grep|rg|ag|cat|head|tail|wc|sort|uniq|cut|tr|ls|find|stat|file|which|echo|printf|true|pwd|date|basename|dirname|realpath|readlink|diff|cmp|md5sum|sha256sum|jq|column|nl)$/
// `find` is read-only only while it neither executes nor deletes.
const FIND_WRITES = /(?:^|\s)-(?:exec|execdir|ok|okdir|delete|fls|fprint|fprint0|fprintf|fputs)(?:\s|$)/


// Canonical form of a directory, so a symlink cannot make an inside path look
function isDirectory(candidate) {
  try {
    return statSync(candidate).isDirectory()
  } catch {
    return false
  }
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

const collapse = text => text.replace(/\s+/g, ' ').trim()

// An unresolved deletion records that something was removed, not what. The
// repository already knows: ask Git which tracked paths are now missing instead
// of holding an unanswerable question against every later commit in the session.
// Returns null when Git cannot answer, which keeps the gate closed.
function deletedTrackedPaths(cwd) {
  const options = { encoding: 'utf8', timeout: 10_000 }
  const root = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], options)
  if (root.status !== 0) return null
  const deleted = spawnSync('git', ['-C', cwd, '-c', 'core.quotePath=false', 'diff', '--no-renames', '--name-only', '--diff-filter=D', 'HEAD'], options)
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

export function runArtifactGates(paths, cwd = process.cwd(), windowMs = 100_000, { bases = [], gated = null } = {}) {
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
  // commands within this pass; the next boundary always starts with no ledger.
  let ledgerDirectory
  if (uniqueTargets.length > 1) {
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
          input: JSON.stringify({ paths: uniqueTargets, deadline, windowMs, timeoutMs }),
          encoding: 'utf8',
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
    if (ledgerDirectory) {
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
// ⚠ THIS CONSTANT IS A LABEL, NOT A SWITCH. Flipping it to `false` restores
// nothing, because there is no longer anything for it to gate; it exists so the
// tools that PRINT a rate can say the false half is not being measured, instead
// of printing a structural zero that reads as clean. Restoring the arm means a
// corrected negation vocabulary and a fresh measurement on answers not used to
// build it — not this one re-read more kindly. BACKLOG §124, §126.
export { ASSERTION_ARM_WITHDRAWN } from './claim-status.mjs'

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
  // is a guess at part of it. blueprints ran `./verify.sh`, this list did not
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
 * manifest, `none` when neither.
 *
 * One resolver, two callers. `runTheCheckSentence` needs the provenance to say
 * whether a red on a clean tree is a finding about the environment, and
 * resolving the root a second time at that call site is how one rule becomes two
 * spellings that drift — which cost this project a defect the same day
 * (docs/BACKLOG.md §66).
 */
export function checkCommandOrigin(cwd = process.cwd()) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  if (!directory) return { command: null, origin: 'none' }
  const root = gitRepositoryRoot(directory) ?? directory
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

function gitRepositoryRoot(directory) {
  const run = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', timeout: 5_000,
  })
  if (run.status !== 0) return null
  // Git's spelling and Node's path.resolve of the same tree can disagree
  // (C:/ vs C:\, 8.3 vs long, /tmp vs /private/tmp). An un-realpathed root
  // made relativeWithinRoot filter every path as outside, so the hook
  // delivered empty context (CLAUDE.md §7).
  return canonical(run.stdout.trim())
}

// Names the project's own check when there is one, so the gate asks for
// something specific instead of leaving the reader to guess which invocation
// counts. Falls back to the general phrasing when the project names none.
export function runTheCheckSentence(cwd) {
  const { command, origin } = checkCommandOrigin(cwd ?? process.cwd())
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
    return `Run \`qh-check\` — it runs \`${command}\` (this project's own check) and records what it `
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
    + `repository rather than from a declaration: \`${command}\`, so that is not this `
    + 'project\'s own check. If it is red on an unmodified tree the finding is about this '
    + 'machine and not about your change — say which, and declare the real command as `check`. '
    + `Run \`qh-check\` (it runs \`${command}\` and records what it observed) after the final `
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

export function flushOutput(startedAt, input, env = process.env, now = Date.now()) {
  const elapsed = now - startedAt
  let out = pendingOutput
  pendingOutput = null
  if (elapsed >= slowHookThresholdMs(env)) {
    const note = `quality-harness: the ${input?.hook_event_name ?? 'hook'} hook took ${(elapsed / 1000).toFixed(1)}s — the pause has this name`
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

function advise(reason, input = null) {
  // BOTH channels, because each alone can hide the finding. Exit-0 stderr is
  // surfaced only in transcript view, so a finding written there alone reaches
  // nobody — advisory-that-nobody-sees is concealment, which the owner has
  // named as worse than having no plugin at all. stderr keeps it in the
  // transcript; what the session shows depends on the event.
  process.stderr.write(`${reason}\n`)
  if (input?.hook_event_name !== 'PreToolUse') {
    emitJson({ systemMessage: reason })
    return
  }
  // At a tool boundary the reader is the agent, and `systemMessage` is rendered
  // to the PERSON, one "PreToolUse:Bash says:" line per line of text — a
  // twelve-line adr-lint report became twelve of them, on every commit attempt,
  // in the owner's terminal (2026-09-05). So the instruction goes where the
  // agent reads, `additionalContext`, and the person gets one line saying a
  // finding was made and where the rest is. Said in full once per finding per
  // session; a repeat of the same finding is one line for the agent and nothing
  // for the person, because the second reading of an unchanged report is the
  // nag every advisory here exists not to be.
  const key = `advisory:${createHash('sha256').update(String(reason)).digest('hex').slice(0, 32)}`
  const first = firstMentionThisSession(input.session_id, key)
  const headline = advisoryHeadline(reason)
  emitJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: first
        ? reason
        : `quality-harness: the same finding as earlier this session still stands — ${headline}`,
    },
    ...(first ? { systemMessage: `quality-harness advised the agent: ${headline} (full text in the transcript)` } : {}),
  })
}

const UNINTERESTING_DIRECTORY = /^(?:node_modules|vendor|target|dist|build|coverage|__pycache__|tests?|spec|fixtures?|testdata|examples?)$/i

// ADR task directories belonging to THIS repository. Deliberately narrow:
// walking a directory that is not a repository once surfaced another project's
// tasks from a shared temp directory, and a session must never be handed work
// that belongs to a codebase it was not opened on.
export function posixListed(rel) {
  return String(rel).replaceAll('\\', '/')
}

// SessionStart used to slice(0, 3) and hide a later directory's UNPROVEN
// behind "(+N more)". A could-not-look is never an ordinary ready line: it
// always surfaces; the cap still applies to ready/blocked/done lines (ADR-046 T5).
export function surfaceReadyLines(lines, cap = 3) {
  let ordinary = 0
  const shown = []
  for (const line of lines) {
    const unproven = line.includes('UNPROVEN')
    if (unproven || ordinary < cap) {
      shown.push(line)
      if (!unproven) ordinary += 1
    }
  }
  const hidden = lines.length - shown.length
  if (hidden > 0) shown.push(`  (+${hidden} more record set(s))`)
  return shown
}

function listedAbsolute(root, rel) {
  const parts = posixListed(rel).split('/').filter(part => part && part !== '.')
  return parts.length ? path.join(root, ...parts) : root
}

// The exact line `adr-retire-check`, `facts-gate-dispatch.sh`, `run-shell-hook.mjs`
// and `adr-lint` recognise an archive by. Whole-line, so prose ABOUT archives in a
// sibling directory's README does not freeze that directory.
const ARCHIVE_LIFECYCLE_LINE = '**Lifecycle:** Frozen historical ADR records'

// Whether a listed directory sits under a frozen archive. Asked only of candidate
// `tasks/` directories and cached per ancestor, so the orientation does not open a
// README for every directory git lists.
function underFrozenArchive(root, dirParts, cache) {
  for (let depth = 1; depth < dirParts.length; depth++) {
    const key = dirParts.slice(0, depth).join('/')
    if (!cache.has(key)) {
      let frozen = false
      try {
        frozen = readFileSync(path.join(root, ...dirParts.slice(0, depth), 'README.md'), 'utf8')
          .split(/\r?\n/).includes(ARCHIVE_LIFECYCLE_LINE)
      } catch {}
      cache.set(key, frozen)
    }
    if (cache.get(key)) return true
  }
  return false
}

// ADR task directories from the git listing, not a disk walk. A gitignored
// tasks/ dir is not in flight; git-fail is UNPROVEN at the caller.
// ⚠ AND NEITHER IS A RETIRED ONE. A frozen archive is "historical evidence, never
// an executable plan" (adr-execute), and this walked it anyway: the day this
// repository retired its first records, every session was offered their tasks as
// READY with the command to run. Skipped BEFORE the cap below, or three frozen
// task sets would also crowd three live ones out of the orientation.
function taskDirectories(root, listing) {
  if (listing == null) return []
  const found = []
  const seen = new Set()
  const frozen = new Map()
  for (const rel of listing) {
    if (found.length >= 6) break
    const norm = posixListed(rel)
    const parts = norm.split('/').filter(Boolean)
    const index = parts.indexOf('tasks')
    if (index < 0) continue
    const dirParts = parts.slice(0, index + 1)
    if (dirParts.some((part, i) => i < dirParts.length - 1 && UNINTERESTING_DIRECTORY.test(part))) continue
    if (underFrozenArchive(root, dirParts, frozen)) continue
    const key = dirParts.join('/')
    if (seen.has(key)) continue
    seen.add(key)
    found.push(listedAbsolute(root, key))
  }
  return found
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
  // CLEARED FIRST. Without this a failed resolve left the PREVIOUS run's version
  // readable, so a caller recording "which Python answered" would record one that
  // did not — stale evidence, which is worse than none and is the exact class §93
  // is about.
  lastPythonVersion = null
  if (platform !== 'win32') return null
  for (const [command, ...prefix] of candidates) {
    const probe = run(command, [...prefix, '-c', PYTHON_PROBE], { encoding: 'utf8', timeout: 10_000 })
    const answered = (probe.stdout ?? '').trim()
    // Still keyed on the MAJOR — any 3.x is a real Python 3 — but the full answer
    // is kept so a run can say which one it was.
    if (probe.status === 0 && /^3(\.\d+)?$/.test(answered)) {
      lastPythonVersion = answered
      return [command, ...prefix]
    }
  }
  return null
}

// What the last successful probe answered, e.g. `3.14`, or null if nothing has
// been probed or nothing answered. Read by whatever wants to RECORD which
// interpreter ran, which is the half §93 is actually about: the gates ship as
// `#!/usr/bin/env python3`, so the environment picks, and until now nothing
// pinned, probed or recorded the choice.
let lastPythonVersion = null
export const probedPythonVersion = () => lastPythonVersion

// Resolved once per process: readyTaskLines calls spawnGate per task directory,
// and re-probing three interpreters for each would cost more than the gates.
// `??=` would not do it — a machine with no Python resolves to null and would be
// re-probed on every call, three failed spawns each, exactly when probing is most
// expensive. The sentinel makes "asked, and the answer was none" a cached answer.
const UNPROBED = Symbol('python interpreter not yet resolved')
let cachedPython = UNPROBED

export function spawnGate(tool, args, options = {}, platform = process.platform, python) {
  if (platform !== 'win32') return spawnSync(tool, args, options)
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
  return spawnSync(command, [...prefix, tool, ...args], options)
}

export function readyTaskLines(root, insideRepository, listing, spawn = spawnGate) {
  // Without a repository there is no "this project". Git-fail (listing null
  // while inside a repo) is UNPROVEN, not an empty ready list.
  if (!insideRepository) return { look: 'ok', lines: [] }
  if (listing == null) return { look: 'UNPROVEN', lines: [] }
  const tool = path.join(PLUGIN_ROOT, 'bin', 'adr-next')
  if (!existsSync(tool)) return { look: 'ok', lines: [] }
  const lines = []
  for (const directory of taskDirectories(root, listing)) {
    const run = spawn(tool, [directory, '--json'], { encoding: 'utf8', timeout: 10_000 })
    // posixListed: path.relative is native separators; SessionStart text and
    // the Windows CI structural-path rule need a listed form (ADR-046 T5).
    const relative = posixListed(path.relative(root, directory) || directory)
    // ADR-046 T3. adr-next answers 0 (a ready task) or 3 (nothing ready); any
    // other outcome is the gate NOT answering — its lib missing beside a copied
    // bin/ (exit 2, ADR-045 T4), an interpreter that never ran (status null), a
    // hang guard that fired — and every one of them was a `continue`: the same
    // silence as a directory with no tasks, which is how Windows sessions ran
    // empty for a month (the two paragraphs above spawnGate). A look that did not
    // happen is UNPROVEN, said where the ready line would have been, with the
    // gate's own first line so the reader knows which of these it was.
    if (run.status !== 0 && run.status !== 3) {
      const said = (run.stderr ?? '').trim().split('\n')[0] || (run.stdout ?? '').trim().split('\n')[0] || 'it said nothing'
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
    if (report.ready?.length) {
      const next = report.ready[0]
      lines.push(`  ${relative}: ${next.id} is ready — ${next.goal}`
        + (next.acceptance ? `; acceptance \`${next.acceptance}\`` : '')
        + `. Prove it with \`adr-verify ${posixListed(path.relative(root, next.path) || next.path)}\`.`)
    } else if (report.blocked?.length) {
      lines.push(`  ${relative}: nothing ready; ${report.blocked.length} task(s) blocked.`)
    } else if (report.done?.length) {
      lines.push(`  ${relative}: all ${report.done.length} task(s) carry exit-0 evidence.`)
    }
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

// A record's filename, and NOT an ISO-dated one: `2026-03-08-retrospective.md`
// begins with four digits and a dash like every `0043-thing.md` does, so a
// postmortem or a journal entry was read as ADR-2026. Measured on a real corpus,
// 2026-08-26.
const ADR_FILE = /^(?!\d{4}-\d{2}-\d{2})(?:adr[-_]?)?\d{3,4}[-._]/i
const RECORD_BUDGET = 200

// A `## Heading` section's body. Written as a scan rather than one regex because
// JavaScript has no `\Z`: `(?=^##\s|\Z)` requires a literal Z, so the lookahead
// never matched and every section read came back empty — silently, which is the
// only way a corpus-reading feature can ship looking like an empty corpus.
function markdownSection(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex(line => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(line))
  if (start < 0) return ''
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s+\S/.test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

// `**Status:** Accepted`, `Status: Accepted`, or a `## Status` section's first line.
function recordStatus(text) {
  const inline = text.match(/^[ \t]*\*{0,2}Status:?\*{0,2}[ \t]*:?[ \t]*(.+)$/im)
  if (inline) return inline[1].replace(/[*_`]/g, '').trim()
  const section = markdownSection(text, 'Status')
  return section.split('\n').map(line => line.trim()).find(Boolean) ?? ''
}

// Accepted governs — including in the archive, where "an archived Accepted ADR
// may still govern" is this corpus's own stated rule. Proposed and Draft govern
// nothing yet, and are neither.
function statusKind(status) {
  if (/^accepted\b/i.test(status)) return 'governing'
  if (/^(?:superseded|withdrawn|rejected|deprecated)\b/i.test(status)) return 'graveyard'
  return null
}

// What the archive catalog beside a frozen record says its decision's effect is
// NOW: `governing`, `withdrawn`, or `superseded by ADR-NNN` — or null when the
// directory is not an archive, or lists no row for this record.
//
// ⚠ THE CATALOG, NOT THE FILE, IS THE AUTHORITY FOR A FROZEN RECORD. A retired file
// is never edited — that is what frozen means — so one withdrawn in 2026 says
// `Status: Accepted` for ever. This reader took the file's word, and on a session's
// first edit of a governed file `adr-context` answered, unprompted, that three
// withdrawn and superseded records GOVERN lifecycle.mjs, each "caught by" a test
// that had been deleted with them. Found 2026-09-19, the day after this repository
// first retired anything; the comment above quoted half the rule and not this half.
function archiveDecisionEffect(file, reader, cache) {
  const directory = path.dirname(file)
  if (!cache.has(directory)) {
    let effects = null
    try {
      const catalog = reader.text(path.join(directory, 'README.md'))
      if (catalog.split(/\r?\n/).includes(ARCHIVE_LIFECYCLE_LINE)) {
        effects = new Map()
        for (const row of catalog.matchAll(/^\|\s*\[ADR-0*(\d+)\]\([^)]*\)\s*\|[^|\n]*\|\s*([^|\n]+?)\s*\|/gm)) {
          effects.set(Number(row[1]), row[2])
        }
      }
    } catch {}
    cache.set(directory, effects)
  }
  return cache.get(directory)
}

// One glob component at a time, so `**` can cross separators and `*` cannot.
function globToRegExp(pattern) {
  const normalised = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  let source = '^'
  for (let index = 0; index < normalised.length; index += 1) {
    const character = normalised[index]
    if (character === '*') {
      if (normalised[index + 1] === '*') {
        source += '.*'
        index += normalised[index + 2] === '/' ? 2 : 1
      } else {
        source += '[^/]*'
      }
    } else if (character === '?') source += '[^/]'
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  try {
    return new RegExp(`${source}$`, 'i')
  } catch {
    return null
  }
}

// A declared path matches the file itself, anything under it when it names a
// directory, and whatever its globs cover.
export const __pathMatchesDeclarationForTest = (candidate, declaration) =>
  pathMatchesDeclaration(candidate, declaration)

export function pathMatchesDeclaration(candidate, declaration) {
  const file = candidate.replace(/\\/g, '/').replace(/^\.\//, '')
  const declared = declaration.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
  if (!declared) return false
  if (/[*?]/.test(declared)) return globToRegExp(declared)?.test(file) ?? false
  return file === declared || file.startsWith(`${declared}/`)
}

// `**Governs:**` is optional and additive: a corpus that never adopts it still
// resolves through its task tables. Both the plain list and adrkit's typed
// matcher form are read; only `type: path` is RESOLVED, and the others are
// recorded rather than silently matching nothing — a matcher that matches
// nothing reads as coverage while covering nothing, which is the vacuous pass
// this project's own arch-write skill warns about.
/** The checks a record says enforce it, or [] for absent or `None — <reason>`. */
export const __declaredEnforcementForTest = text => declaredEnforcement(text)

function declaredEnforcement(text) {
  const header = text.match(/^[ \t]*\*{0,2}Enforced-by:?\*{0,2}[ \t]*:?[ \t]*(.*)$/im)
  if (!header) return []
  const inline = header[1].trim()
  if (!inline || /^none\b/i.test(inline)) return []
  // A BACKTICKED span is one item, commas inside it included — a mutation label
  // reads "…mutates, exactly once" and splitting on every comma tears it in
  // half. Whatever is left outside the backticks is then comma-separated. Both
  // cases are in the truth table mirrored from tests/gate-regressions.py.
  const parts = []
  const rest = []
  let position = 0
  for (const span of inline.matchAll(/`([^`]*)`/g)) {
    rest.push(inline.slice(position, span.index))
    parts.push(span[1].trim())
    position = span.index + span[0].length
  }
  rest.push(inline.slice(position))
  parts.push(...rest.join(',').split(',').map(part => part.trim()))
  return parts.filter(value => value && !/^[<(]/.test(value))
}

function declaredGoverns(text) {
  const paths = []
  const unresolved = []
  const header = text.match(/^[ \t]*\*{0,2}Governs:?\*{0,2}[ \t]*:?[ \t]*(.*)$/im)
  if (header) {
    const inline = header[1]
    if (!/^none\b/i.test(inline.trim())) {
      for (const token of inline.matchAll(/`([^`]+)`|([^\s,]+)/g)) {
        const value = (token[1] ?? token[2]).trim()
        if (value && !/^[<(]/.test(value)) paths.push(value)
      }
    }
    // The dashed/indented run under the header. The first split element is the
    // remainder of the header line itself, which `(.*)` already consumed.
    const following = text.slice(text.indexOf(header[0]) + header[0].length).split('\n').slice(1)
    const block = []
    for (const line of following) {
      if (!line.trim()) { if (block.length) break; else continue }
      if (!/^\s*-/.test(line) && !/^\s\s+\S/.test(line)) break
      block.push(line)
    }
    for (const matcher of block.join('\n').matchAll(/-\s*type:\s*(\w+)[\s\S]*?pattern:\s*["']?([^"'\n]+?)["']?\s*$/gm)) {
      if (matcher[1].toLowerCase() === 'path') paths.push(matcher[2].trim())
      else unresolved.push(`${matcher[1]}:${matcher[2].trim()}`)
    }
  }
  return { paths, unresolved }
}

// Cell 0 of every `## Affected Files` row. The table is required by adr-lint, so
// this resolves on records nobody has touched for this feature.
function affectedFiles(text) {
  const section = markdownSection(text, 'Affected Files')
  if (!section) return []
  const paths = []
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const first = line.split('|')[1]?.trim() ?? ''
    const cell = first.match(/`([^`]+)`/)?.[1] ?? first
    if (!cell || /^-+$/.test(cell) || /^file$/i.test(cell) || /^</.test(cell)) continue
    // A path, not prose. On a real corpus, cell 0 of neighbouring tables produced
    // `(T3's two tests)`, `(compile)` and `! rg -iq 'MCP stdio' README.md`, every
    // one reported as a governed path. A cell with a space in it is a sentence.
    if (/\s/.test(cell) || !/[./\\]/.test(cell)) continue
    paths.push(cell)
  }
  return paths
}

// ADR-014, 014-thing.md, `# ADR-14: …` — the number, however this corpus spells it.
function adrNumber(file, text) {
  const fromTitle = text.match(/^#\s+ADR[-_ ]?(\d{1,4})\b/im)
  // Anchored, and the bare form only at the START of the basename: unanchored,
  // `(\d{3,4})[-._]` read the `2026` of a date as an ADR number and the corpus
  // grew an ADR-2026. Measured on a real corpus, 2026-08-26.
  const fromName = path.basename(file).match(/^(?!\d{4}-\d{2}-\d{2})(?:adr[-_]?)?(\d{1,4})[-._]/i)
  const raw = fromTitle?.[1] ?? fromName?.[1]
  return raw === undefined ? null : Number(raw)
}

// Shared task directories are read by several records. Keep one observation per
// scan, including read failures; the next scan starts fresh and can see repairs.
function corpusReader() {
  const once = read => {
    const results = new Map()
    return key => {
      if (!results.has(key)) {
        try { results.set(key, { value: read(key) }) }
        catch (error) { results.set(key, { error }) }
      }
      const result = results.get(key)
      if ('error' in result) throw result.error
      return result.value
    }
  }
  return {
    text: once(file => readFileSync(file, 'utf8')),
    entries: once(directory => readdirSync(directory, { withFileTypes: true })),
  }
}

// Where a record's tasks actually live. Two layouts, both real: `tasks/` beside
// the record, and a sibling directory NAMED FOR THE RECORD holding it —
// `docs/adr/ADR-110-slug.md` with `docs/adr/ADR-110/tasks/`. Measured against a
// 171-record corpus on 2026-08-26, where the second is the only layout used and
// looking beside the record found nothing: 142 accepted decisions reported as
// governing no code, which is a confident wrong answer rather than a gap.
//
// `owned` says the directory is named for this record, which is attribution in
// itself — no back-reference needed, and that corpus has none: its task files
// never name their ADR in the text.
function taskDirectoriesFor(file, number, reader) {
  const directory = path.dirname(file)
  const found = [{ path: path.join(directory, 'tasks'), owned: false }]
  // A record with no number still owns the directory named after it. Ownership
  // was matched on the ADR NUMBER alone, so `2026-08-17-thing.md` beside
  // `2026-08-17-thing/tasks/` was classified correctly and reported zero tasks —
  // the record found, its work invisible (docs/BACKLOG.md §55). The stem is
  // exact, so it cannot bind a directory to the wrong record the way a loose
  // numeric prefix could.
  const stem = path.basename(file).replace(/\.md$/i, '')
  let siblings = []
  try { siblings = reader.entries(directory) } catch { return found }
  for (const entry of siblings) {
    if (!entry.isDirectory()) continue
    const owns = number !== null && /^(?:adr[-_]?)?0*(\d{1,4})\b/i.exec(entry.name)
    if ((owns && Number(owns[1]) === number) || entry.name === stem) {
      found.push({ path: path.join(directory, entry.name, 'tasks'), owned: true })
    }
  }
  return found
}

/**
 * The task files a record owns, by directory ownership and by self-naming.
 *
 * Extracted so a record this reader cannot CLASSIFY still has its tasks
 * attributed: `adrCorpus` needs the texts as well and inlines the same walk for
 * the governed-path union, and both call `taskDirectoriesFor` with the same
 * number. Kept beside it rather than duplicated at the caller — a second
 * attribution rule is a second thing to keep in step (ADR-001, ADR-004).
 */
function taskFilesFor(file, text, reader = corpusReader()) {
  const found = []
  for (const tasks of taskDirectoriesFor(file, adrNumber(file, text), reader)) {
    let entries = []
    try {
      entries = reader.entries(tasks.path).map(entry => entry.name).filter(name => name.toLowerCase().endsWith('.md')
        && name.toLowerCase() !== 'readme.md')
    } catch { continue }
    for (const name of entries) found.push(path.join(tasks.path, name))
  }
  return [...new Set(found)]
}

/**
 * A record this reader would otherwise never open, recognised by CONTENT.
 *
 * `ADR_FILE` matches a numeric filename and deliberately excludes an ISO-dated
 * one, because `2026-03-08-retrospective.md` was being read as ADR-2026. That
 * exclusion took an entire naming convention with it: a corpus whose records are
 * all named `2026-08-17-thing.md` produced ZERO records, and the reader then said
 * "Nothing in the corpus is waiting" over two dozen unfinished task files.
 * Measured 2026-08-29 on a 56-record corpus by the session that owns it, and
 * reproduced here on identical bytes under two filenames (docs/BACKLOG.md §55).
 *
 * So the fix is a probe, not a wider pattern. Inside an `adr` directory a file
 * carrying a `Status:` line is a record whatever it is called; everything else
 * still needs the filename. Measured against that corpus before shipping: of 56
 * `.md` files under its `docs/adr`, the 31 with no status line are all
 * non-records (task files, tasks/README.md, an index, a research note), and no
 * postmortem, runbook or spec in the tree carries the line at all.
 *
 * A task file is excluded by PATH rather than by content, because a
 * `tasks/README.md` may well acquire a status line and is never a decision.
 *
 * A STATUS LINE ALONE IS NOT ENOUGH, and this repository's own fixtures prove
 * why: `2026-03-08-retrospective.md` carrying `**Status:** Accepted` is the
 * defect the filename guard was added for, and a probe reading only the status
 * would re-open it. A decision record also SAYS something — it carries the
 * Context or Decision section every template in this project requires — so the
 * probe asks for both. The corpus that reported §55 confirms the discrimination
 * holds there: its 31 status-less files are all non-records, and the three
 * record-SHAPED filenames that are not records (an index, a research note, a
 * `.queries.md` companion) self-excluded only by luck, which is exactly the
 * fragility a second condition removes.
 */
function looksLikeRecord(file, directory, reader) {
  if (!/(^|[\\/])adr([\\/]|$)/i.test(directory)) return false
  if (/(^|[\\/])tasks([\\/]|$)/i.test(directory)) return false
  let text
  try { text = reader.text(file) } catch { return 'unreadable' }
  return /^[ \t]*\*{0,2}Status:?\*{0,2}[ \t]*:?[ \t]*\S/im.test(text)
    && /^##\s+(Context|Decision)\b/im.test(text)
}

function recordFilesFromListing(root, tracked, reader) {
  const files = []
  for (const rel of tracked) {
    if (files.length >= RECORD_BUDGET) break
    const norm = posixListed(rel)
    if (!/\.md$/i.test(norm)) continue
    if (/(?:^|\/)tasks\//i.test(norm)) continue
    const slash = norm.lastIndexOf('/')
    const base = slash < 0 ? norm : norm.slice(slash + 1)
    const dirNorm = slash < 0 ? '' : norm.slice(0, slash)
    const absolute = listedAbsolute(root, rel)
    if (ADR_FILE.test(base) || looksLikeRecord(absolute, dirNorm, reader) !== false) files.push(absolute)
  }
  return files
}

/**
/**
 * Repository-relative paths git knows about, or null when git cannot answer.
 *
 * null and an EMPTY ARRAY are different answers and must never collapse. An
 * empty listing says "this tree holds no files"; null says "I could not look",
 * and a declaration checked against a null read as empty would report every
 * record in the corpus as rot at once — a tool asserting an observation it
 * never made (ADR-005).
 *
 * `--others --exclude-standard` because a record and the files it governs are
 * commonly added in the same commit, and against git rather than the filesystem
 * because `existsSync` answers "is this on THIS machine" (ADR-008).
 */
export function trackedPaths(root) {
  const found = new Set()
  for (const args of [['ls-files'], ['ls-files', '--others', '--exclude-standard']]) {
    const run = spawnSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args],
      { encoding: 'utf8', timeout: 30000 })
    if (run.error || run.status !== 0 || typeof run.stdout !== 'string') return null
    for (const line of run.stdout.split('\n')) {
      const value = line.trim()
      if (value) found.add(value)
    }
  }
  return [...found]
}

/**
 * Every decision record in a repository, with what it governs already resolved.
 *
 * Asks git which paths it tracks, then inventories record files from that
 * listing. `tracked` is an injectable seam: pass a listing to make the look
 * hermetic. null means the look could not happen — no disk walk, no Governs
 * resolution (ADR-005). An empty array means the tree was listed and held
 * no files. Nothing here writes, and nothing here runs a check.
 */
export function adrCorpus(root, { tracked = trackedPaths(root) } = {}) {
  const archiveEffects = new Map()
  const records = []
  const unreadable = []
  Object.defineProperty(records, 'unreadable', { value: unreadable, enumerable: false })
  Object.defineProperty(records, 'look', {
    value: tracked == null ? 'UNPROVEN' : 'ok', enumerable: false, writable: true,
  })
  if (tracked == null) return records
  const reader = corpusReader()
  const files = recordFilesFromListing(root, tracked, reader)
  const recordsPerDirectory = new Map()
  for (const file of files) {
    const directory = path.dirname(file)
    recordsPerDirectory.set(directory, (recordsPerDirectory.get(directory) ?? 0) + 1)
  }
  for (const file of files) {
    let text
    try {
      // `reason` marks a file this reader NEVER READ, so a consumer can keep it
      // apart from the entries below, which were read and carry a status this
      // reader cannot apply. Without it adr-state said the file "was opened"
      // and had "[no **Status:** line]" — an observation it never made (ADR-005).
      if (statSync(file).size > 512 * 1024) {
        unreadable.push({ file, status: null, taskFiles: [], reason: 'over 512 KiB' })
        records.look = 'PARTIAL'
        continue
      }
      text = reader.text(file)
    } catch (error) {
      unreadable.push({ file, status: null, taskFiles: [], reason: error?.code ?? 'unreadable' })
      records.look = 'PARTIAL'
      continue
    }
    // A frozen record's effect comes from its archive's catalog, when that catalog
    // has a row for it; `governing` there leaves the file's own status standing.
    const effect = archiveDecisionEffect(file, reader, archiveEffects)?.get(Number(adrNumber(file, text)))
    const retired = typeof effect === 'string' && /^(?:withdrawn|superseded\b)/i.test(effect)
    const status = retired ? effect : recordStatus(text)
    const kind = statusKind(status)
    if (!kind) {
      // A file that looks like a record and carries no status this reader knows
      // is DROPPED, and until 2026-08-27 dropped in silence. Measured against a
      // real 171-record corpus that day: 149 were read and `adr-state` said
      // "149 record(s) read" — never that 22 files it had opened were skipped,
      // 25 of them carrying no `**Status:**` line at all and 12 carrying one it
      // does not recognise, `Implemented` among them. A count that omits what it
      // could not read is a count that reads as coverage.
      // Its TASK FILES are attributed anyway, by the same rule the governing
      // records use. A Proposed or Draft record governs nothing yet — correctly —
      // but its tasks still exist, and a consumer that cannot see whose they are
      // has only two options, both wrong: treat them as executable (§48, where
      // the router offered an unaccepted record's tasks) or ignore them and
      // report a corpus with unfinished work as finished.
      unreadable.push({ file, status: status || null, taskFiles: taskFilesFor(file, text, reader) })
      continue
    }
    const declared = declaredGoverns(text)
    // Two different claims, deliberately kept apart. `declares` is a record
    // saying "I am authoritative over this"; `touches` is a task table saying
    // "this change edited that file". Conflating them made every file five
    // accepted ADRs had edited over two years look like five decisions
    // contradicting each other — 278 of them on a real corpus, every one noise.
    // Authority contests; history does not.
    const declares = new Set(declared.paths)
    const governs = new Set(declared.paths)
    // Sibling task files carry the per-task Affected Files tables. Attribution
    // matters: several ADRs commonly share one `tasks/` directory, and taking
    // every table would make each record claim its neighbours' files. A task
    // names its ADR in its title (`# Task ADR-001-T1: …`); where no task does,
    // the directory is attributed only if this is the one record beside it.
    const number = adrNumber(file, text)
    // The task files attributed to this record, PATHS included. The paths are
    // what lets a caller ask "whose task is this?" — `work-next` needs it to stop
    // calling an unaccepted record's tasks ready (docs/BACKLOG.md §48), and
    // deriving it a second time at the caller would be a second attribution rule
    // to keep in step with this one.
    const owned = []
    const texts = []
    for (const tasks of taskDirectoriesFor(file, number, reader)) {
      let taskEntries = []
      try {
        taskEntries = reader.entries(tasks.path).map(entry => entry.name).filter(name => name.toLowerCase().endsWith('.md')
          && name.toLowerCase() !== 'readme.md')
      } catch { continue }
      for (const name of taskEntries) {
        const taskPath = path.join(tasks.path, name)
        let taskText
        try { taskText = reader.text(taskPath) } catch { continue }
        // A directory NAMED for this record is attribution in itself.
        if (tasks.owned) {
          owned.push(taskPath)
          for (const declaredPath of affectedFiles(taskText)) governs.add(declaredPath)
        } else {
          texts.push({ path: taskPath, text: taskText })
        }
      }
    }
    const claimed = number
      ? texts.filter(entry => new RegExp(`ADR[-_ ]?0*${number}\\b`, 'i').test(entry.text))
      : []
    // Only when this is the one record beside them: a shared tasks/ directory
    // whose files name no ADR cannot be attributed, and guessing would make
    // every record claim its neighbours' files.
    const sole = recordsPerDirectory.get(path.dirname(file)) === 1
    for (const entry of (claimed.length ? claimed : (sole ? texts : []))) {
      owned.push(entry.path)
      for (const declaredPath of affectedFiles(entry.text)) governs.add(declaredPath)
    }
    records.push({
      file,
      number,
      title: (text.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(file, '.md')).trim(),
      status,
      kind,
      // Which record replaced this one, when the status says so. The number
      // alone, because a corpus spells the reference every way there is:
      // `Superseded by ADR-0004`, `superseded by ADR-4`, `Superseded by 0004`.
      supersededBy: /^superseded\s+by\b/i.test(status)
        ? (/(\d{1,4})/.exec(status)?.[1] ?? null) && String(Number(/(\d{1,4})/.exec(status)[1]))
        : null,
      governs: [...governs],
      // What FAILS when this decision is violated, or null. `Governs:` on its
      // own tells an agent a rule exists and nothing about what happens if it
      // breaks it — ADR-009. Read here rather than at each caller so the hook
      // and the CLI cannot disagree about what a header means, which is the
      // drift ADR-001 and ADR-004 were both about.
      enforcedBy: declaredEnforcement(text),
      // The task files this record owns, by the same attribution the governed
      // paths use. A consumer that walks the filesystem for task files instead
      // gets the files right and the RECORD wrong — §48, where the router named
      // a Proposed record's tasks as ready to execute.
      taskFiles: [...new Set(owned)],
      declares: [...declares],
      // Two sources, one slot, told apart by the prefix. A `type: package`
      // matcher was never resolvable here; a `governs:` entry WAS resolvable and
      // resolved to nothing, which is the rot ADR-011 is about. With no listing
      // this stays empty — the reader could not look, and saying nothing is the
      // only honest answer (ADR-005).
      unresolved: [
        ...declared.unresolved,
        ...(tracked
          ? declared.paths
            .filter(declaration => !tracked.some(file => pathMatchesDeclaration(file, declaration)))
            .map(declaration => `governs:${declaration}`)
          : []),
      ],
    })
  }
  return records
}

// `/tmp` is a symlink to `/private/tmp` on macOS, and git answers with the real
// path while the hook payload carries the spelling. A plain path.relative then
// produced `../../tmp/...`, which escapes the root and filtered every path out —
// so on a symlinked checkout the corpus read as empty, silently. The same trap
// underTempRoot already realpaths both sides for.
function relativeWithinRoot(root, candidate) {
  // Same `inside` as underDirectory (BACKLOG §188). `!startsWith('..')` is not
  // enough: when git's spelling and Node's disagree, path.relative is an
  // absolute path, which then survives the posix replace as `C:/…` and is
  // kept as if it were in-repo (Windows CI: empty decision context).
  const posix = value => value.replace(/\\/g, '/')
  const inside = value => value === '' || (!value.startsWith('..') && !path.isAbsolute(value)
    && !/^[A-Za-z]:/.test(posix(value)))
  const fold = value => (process.platform === 'win32' || process.platform === 'darwin')
    ? value.toLowerCase() : value
  const real = target => {
    if (existsSync(target)) return fold(canonical(target))
    const anchor = nearestExistingDirectory(target)
    try { return fold(anchor ? path.join(canonical(anchor), path.relative(anchor, target)) : target) }
    catch { return fold(target) }
  }
  const attempts = [path.relative(root, candidate), path.relative(real(root), real(candidate))]
  const hit = attempts.find(inside)
  if (hit !== undefined) return hit
  const rp = posix(real(root)).replace(/\/$/, '')
  const cp = posix(real(candidate))
  if (rp && cp.startsWith(rp + '/')) return cp.slice(rp.length + 1)
  if (cp === rp) return ''
  return attempts[attempts.length - 1]
}

/**
 * The decisions that govern a set of paths, and the ones that were killed.
 *
 * The graveyard is the half an agent needs most: re-proposing an approach the
 * team already rejected is the expensive failure of working without memory, and
 * it is invisible from the code alone.
 */
export function decisionsGoverning(paths, root, corpus = adrCorpus(root)) {
  const relative = paths
    .map(candidate => (path.isAbsolute(candidate) ? relativeWithinRoot(root, candidate) : candidate))
    .map(candidate => candidate?.replace(/\\/g, '/'))
    .filter(candidate => candidate && !candidate.startsWith('..') && !path.isAbsolute(candidate)
      && !/^[A-Za-z]:/.test(candidate))
  const hits = record => relative.some(candidate =>
    record.governs.some(declaration => pathMatchesDeclaration(candidate, declaration)))
  return {
    governing: corpus.filter(record => record.kind === 'governing' && hits(record)),
    graveyard: corpus.filter(record => record.kind === 'graveyard' && hits(record)),
    look: corpus.look ?? 'ok',
  }
}

/** The same answer as prose, or '' when the corpus has nothing to say. */
export function decisionContext(paths, root) {
  const { governing, graveyard } = decisionsGoverning(paths, root)
  if (!governing.length && !graveyard.length) return ''
  const lines = []
  const name = record => `${path.relative(root, record.file) || record.file} — ${record.title}`
  // The hook and `adr-context` render the SAME answer from the same resolver.
  // Two callers of one resolver is where this project has drifted before
  // (ADR-001, ADR-004), so the enforcing check appears in both or neither.
  const caught = record => (record.enforcedBy?.length
    ? `  [caught by: ${record.enforcedBy.join(', ')}]`
    : '')
  if (governing.length) {
    lines.push('Decisions that govern what you are about to change:')
    for (const record of governing.slice(0, 5)) lines.push(`  ${name(record)}${caught(record)}`)
    if (governing.length > 5) lines.push(`  (+${governing.length - 5} more)`)
  }
  if (graveyard.length) {
    lines.push('Already decided against here — do not re-propose without saying why it is different now:')
    for (const record of graveyard.slice(0, 5)) {
      lines.push(`  ${name(record)} [${record.status}]`)
    }
    if (graveyard.length > 5) lines.push(`  (+${graveyard.length - 5} more)`)
  }
  const unresolved = [...new Set([...governing, ...graveyard].flatMap(record => record.unresolved))]
  if (unresolved.length) {
    lines.push(`Recorded but not resolved by this tool: ${unresolved.slice(0, 4).join(', ')}. `
      + 'Only `type: path` matchers are matched against files; read those records yourself.')
  }
  return lines.join('\n')
}

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
  const writes = unobservableWrites(log)
  const baseline = log.find(entry => entry.event === 'session.started')?.observation
  const status = observation?.ok === true ? statusPaths(root) : []
  const check = log.filter(entry => typeof entry.event === 'string' && entry.event.startsWith('check.')).at(-1)
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
      : logIncomplete(log) ? 'the session log could not be read whole'
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
    observed: why === null,
    // Whether the LOG was whole, apart from whether the tree was seen: "Last
    // check" is read from the log alone, and a torn one may have lost the newer
    // check — so neither "passed" nor "no check has run" may be said from it.
    whole: !logIncomplete(log),
    why,
    // Null from a torn log, not merely unprinted: SessionEnd persists this as
    // `lastVerdict`, and a row is read by a session that never saw the log.
    lastCheck: check && !logIncomplete(log)
      ? { command: check.command ?? null, verdict: check.event.slice('check.'.length) } : null,
  }
}

export function sessionStateNote(facts, cwd, root, insideRepository, now = new Date(), { tasks = true } = {}) {
  const files = Array.isArray(facts?.files) ? facts.files : []
  const other = Number(facts?.other) || 0
  const shown = files.slice(0, 5).map(file => path.relative(cwd, file) || file)
  if (files.length > shown.length) shown.push(`+${files.length - shown.length} more`)
  const pending = facts?.pending === true
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
    : files.length === 0 && other === 0 && !pending ? 'neutral'
      : pending || !passed ? 'unverified' : 'verified'
  const parts = []
  if (files.length && observed) {
    const verdict = pending ? 'no `qh-check` has passed on them'
      : passed ? 'a `qh-check` passed on them'
        : 'nothing here changed them since the session began, and no `qh-check` has passed on them'
    parts.push(`${files.length} changed path(s)${other ? ` and ${other} write(s) git cannot see` : ''}; `
      + `${verdict}${shown.length ? `: ${shown.join(', ')}` : ''}.`)
  } else if (other) {
    parts.push(`${other} write(s) git cannot see since the last passing check.`)
  } else if (!observed) {
    parts.push(`${facts?.why ?? 'the working tree could not be observed'}, so what changed here is unknown.`
      + (files.length ? ` Git lists ${files.length} changed path(s): ${shown.join(', ')}.` : ''))
  } else if (pending) {
    parts.push('nothing is uncommitted, and the tree at HEAD is one no `qh-check` has passed on.')
  } else {
    parts.push('nothing has changed in the working tree.')
  }
  parts.push(facts?.whole === false ? 'Which check ran last is unknown.'
    : facts?.lastCheck
      ? `Last check: \`${facts.lastCheck.command ?? 'qh-check'}\` ${facts.lastCheck.verdict}.`
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

function readSessionNote(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  try { return JSON.parse(readFileSync(sessionNotePath(sessionId), 'utf8')) } catch { return null }
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
  const files = Array.isArray(row.files) ? row.files.slice(0, 5).map(file => path.relative(cwd, file) || file) : []
  const other = Number(row.other) || 0
  const what = [row.files?.length ? `${row.files.length} edit(s)` : '', other ? `${other} shell mutation(s)` : ''].filter(Boolean).join(' and ') || 'edits'
  const check = projectCheckCommand(cwd)
  return `The previous session in this directory ended (${row.reason ?? 'unknown reason'}, ${row.at}) with `
    + `${what} after which no recognised check passed${files.length ? `: ${files.join(', ')}` : ''}. `
    + (check ? `Run \`${check}\` before building on them.` : 'Nothing has checked them since.')
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
  // ⚠ ONLY A FINITE STAMP INSIDE THE WINDOW HOLDS THE SWEEP. A stamp in the
  // future — a clock that jumped forward and was corrected, or `Infinity` from
  // a corrupted file — would otherwise suppress every sweep from then on, and
  // a guard that wedges shut is worse than no guard because nothing says it
  // happened (Codex review, 2026-09-06). Garbage reads as NaN and self-heals.
  let last = NaN
  try { last = Number(readFileSync(guard, 'utf8')) } catch {}
  if (Number.isFinite(last) && last <= now && now - last < SAID_SWEEP_INTERVAL_MS) return report
  // Written before the sweep, so a sweep that fails halfway does not retry on
  // every hook call for the rest of the day. If it cannot be written the work
  // cannot be bounded AT ALL, and an unbounded readdir of the temp root on
  // every hook call is worse than markers accumulating — which is only the
  // state §146 already described. So it is said and nothing is read.
  try { writeFileSync(guard, String(now)) } catch (error) {
    report.unreadable.push(`guard: ${error?.code ?? error}`)
    return report
  }
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

export function hasDecisionCorpus(root, listing = trackedPaths(root)) {
  if (listing == null) return 'UNPROVEN'
  for (const rel of listing) {
    const norm = posixListed(rel)
    for (const dir of CORPUS_DIR_NAMES) {
      if (norm === dir || norm.startsWith(`${dir}/`)) return true
    }
  }
  return false
}

export function sessionOrientation(cwd) {
  const directory = nearestExistingDirectory(path.resolve(cwd ?? process.cwd()))
  if (!directory) return ''
  const repositoryRoot = gitRepositoryRoot(directory)
  const root = repositoryRoot ?? directory
  const lines = []

  const { command: check, origin } = checkCommandOrigin(root)
  if (check) {
    const named = origin === 'declared'
      ? `this project's own check is \`${check}\``
      : `no \`check\` is declared in \`.quality-harness.json\`; inferred \`${check}\` from a manifest — that is not this project's own check`
    lines.push(`Verification: ${named}. `
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
  if (stale) lines.push(stale)

  const inside = repositoryRoot !== null
  const listing = inside ? trackedPaths(root) : null
  const ready = readyTaskLines(root, inside, listing)
  if (inside && ready.look === 'UNPROVEN') {
    lines.push('could-not-look: git could not list the tree (UNPROVEN). Ready tasks and corpus existence are not known.')
  }
  const corpusLook = inside ? hasDecisionCorpus(root, listing) : false

  // A stale standalone copy can only give a wrong answer where a gate actually
  // runs, so the warning belongs in a repository that has a corpus for one to
  // read. Ungated it opened every session in every repository — including ones
  // that never opted into this lifecycle at all, which is the noise this
  // project was told is worse than not shipping the plugin.
  // Git-fail is UNPROVEN, not "no corpus" — a false would skip this notice.
  if (check || ready.lines.length || corpusLook === true || corpusLook === 'UNPROVEN') {
    const shadow = shadowInstallNotice()
    if (shadow) {
      lines.push(`${shadow} \`node \${CLAUDE_PLUGIN_ROOT}/scripts/sync-standalone.mjs\` reports `
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
    lines.push(['ADR tasks in flight:', ...shown].join('\n'))
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
  const root = directory ? canonical(gitRepositoryRoot(directory) ?? directory) : null
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

// The one reading of a command's text that stays (ADR-060): whether it names
// `commit` or `push` as a word — no letter, digit, `_` or `-` directly before or
// after. Nothing else is parsed, so a wrapped publish (`pwsh -Command 'git push'`,
// a Python subprocess) is caught, and `pre-commit` is not.
const COMMIT_OR_PUSH_WORD = /(?<![A-Za-z0-9_-])(?:commit|push)(?![A-Za-z0-9_-])/
export function containsCommitOrPush(command) {
  return typeof command === 'string' && COMMIT_OR_PUSH_WORD.test(command)
}

export function readOnlyVerdict(input) {
  const tool = input?.tool_name
  if (READ_ONLY_EDITING_TOOLS.has(tool)) {
    return `This role is read-only: ${tool} is not available to it. Report the change you would make; do not make it.`
  }
  if (tool !== 'Bash') return null
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
export function observe(cwd, budgetMs = OBSERVE_BUDGET_MS) {
  const started = Date.now()
  const directory = nearestExistingDirectory(path.resolve(typeof cwd === 'string' ? cwd : process.cwd()))
  if (!directory) return { ok: false, reason: 'the working directory does not exist' }
  let scratch = null
  const git = (args, env = null, allowed = [0]) => {
    const remaining = budgetMs - (Date.now() - started)
    if (remaining <= 0) throw new Error(`git took more than ${budgetMs} ms`)
    const run = spawnSync('git', ['-C', directory, ...args], {
      encoding: 'utf8', timeout: remaining, maxBuffer: 16 * 1024 * 1024,
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
    if (existsSync(indexPath)) copyFileSync(indexPath, index)
    mkdirSync(path.join(scratch, 'objects'))
    const env = { GIT_INDEX_FILE: index, GIT_OBJECT_DIRECTORY: path.join(scratch, 'objects'), GIT_ALTERNATE_OBJECT_DIRECTORIES: objects }
    const indexTree = git(['write-tree'], env).out
    git(['add', '-A', ...harnessPathspecs(root)], env)
    const tree = git(['write-tree'], env).out
    return { ok: true, tree, index: indexTree, head: head.status === 0 ? head.out : null }
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
  if (record?.exit !== 0) return 'check.failed'
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
function importCheckRecords(cwd, session) {
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
  for (const line of text.split('\n')) {
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

export function sameObservation(a, b) {
  return a?.ok === true && b?.ok === true && a.tree === b.tree && a.index === b.index && a.head === b.head
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
  const absolute = path.resolve(input.cwd, target)
  const entry = { event: 'file.written', path: absolute, observable: false }
  const directory = nearestExistingDirectory(path.resolve(input.cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
  const parent = nearestExistingDirectory(absolute)
  if (root && parent) {
    const resolved = path.join(canonical(parent), path.relative(parent, absolute))
    const relative = path.relative(root, resolved)
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', relative], { encoding: 'utf8', timeout: 5_000 })
      if (!ignored.error && ignored.status === 1) {
        const hashed = spawnSync('git', ['-C', root, 'hash-object', '--', relative], { encoding: 'utf8', timeout: 5_000 })
        entry.observable = true
        entry.blob = !hashed.error && hashed.status === 0 ? hashed.stdout.trim() : null
      }
    }
  }
  appendEvent(input.cwd, input.session_id, entry)
  return entry
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
  // A read-only role's PreToolUse is decided by the reviewer deny and never
  // observed; outside one, a Bash command naming commit or push is a publish request.
  if (hook === 'PreToolUse') {
    if (readOnlyRole(input.agent_type) || input.tool_name !== 'Bash' || !containsCommitOrPush(input.tool_input?.command)) return null
    name = 'publish.requested'
  }
  if (hook === 'SessionStart') {
    if (readEvents(input.cwd, session).some(entry => entry.event === 'session.started')) return null
    name = 'session.started'
  } else if (hook === 'Stop') {
    if (input.stop_hook_active === true || hasBackgroundWork(input)) return null
    name = 'turn.ended'
  } else if (OBSERVED_HOOK_EVENTS[hook]) {
    name = OBSERVED_HOOK_EVENTS[hook]
    if (hook === 'SubagentStart' || hook === 'SubagentStop') {
      extra.agentId = typeof input.agent_id === 'string' ? input.agent_id : null
      extra.agentType = typeof input.agent_type === 'string' ? input.agent_type : null
    }
  }
  if (!name) return null
  const entry = { event: name, ...extra, observation: observe(input.cwd) }
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
  if (!appendEvent(input.cwd, session, entry)) {
    return { ...entry, observation: { ok: false, reason: 'the event log could not be appended' } }
  }
  return entry
}

// ONE output per hook. A deny is delivered alone, and a legacy deny as well;
// otherwise every advisory is joined, beside any legacy output passed in, so no
// finding overwrites another. `action.emitted` is appended only for what was
// delivered (ADR-060 revision 3 review: `emitJson` kept only the last output).
export function deliver(actions, input, { legacy = null } = {}) {
  const event = input?.hook_event_name
  const denials = actions.filter(action => action.deny)
  let delivered
  let output
  if (denials.length) {
    delivered = [denials[0]]
    output = {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denials[0].text },
    }
    process.stderr.write(`${denials[0].text}\n`)
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
  const events = checkEventsFor(log, tree)
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
  return candidates.find(entry => entry.event !== 'check.passed') ?? candidates[0]
}

function treeChecked(log, tree) {
  return latestCheckFor(log, tree)?.event === 'check.passed'
}

function checkRevision(log, tree) {
  return checkEventsFor(log, tree).length
}

function inferredCheckCaveat(cwd) {
  const { command, origin } = checkCommandOrigin(cwd)
  return origin === 'inferred'
    ? ` The check \`${command}\` was inferred from a manifest, not declared; declare it as \`check\` in .quality-harness.json.`
    : ''
}

// P `publish-unchecked` (ADR-060): before a command naming commit or push runs,
// when the tree or the index is unchecked and differs from the session's start.
// It says the command is about to run while this repository is unchecked; it
// does not claim the command publishes this repository, which it may not.
function publishUnchecked(input, requested) {
  if (requested?.event !== 'publish.requested' || requested.observation?.ok !== true) return
  if (!projectCheckCommand(input.cwd)) return
  const now = requested.observation
  const log = readEvents(input.cwd, input.session_id)
  const baseline = log.find(entry => entry.event === 'session.started')?.observation
  const treeUnchecked = !treeChecked(log, now.tree) && (baseline?.ok !== true || now.tree !== baseline.tree)
  const indexUnchecked = !treeChecked(log, now.index) && (baseline?.ok !== true || now.index !== baseline.index)
  if (!treeUnchecked && !indexUnchecked) return
  const revision = checkRevision(log, now.tree)
  const key = `${now.tree}:${now.index}:${revision}`
  if (log.some(entry => entry.event === 'action.emitted' && entry.rule === 'P' && entry.key === key)) return
  queueAction({
    rule: 'P', key, detail: { tree: now.tree, revision },
    // On a torn log this still warns — it must — but says UNKNOWN, not "no check
    // has": a check may have succeeded and its record be what was lost (ADR-005).
    text: (logIncomplete(log)
      ? 'quality-harness: whether this repository is checked is unknown — the session log could not be read whole, so whether `qh-check` succeeded on its current tree cannot be shown — and the command '
      : 'quality-harness: this repository is unchecked — no `qh-check` has passed on its current tree — and the command ')
      + 'about to run names commit or push. Run `qh-check` first. This says what state the repository is in, not what '
      + `the command publishes.${inferredCheckCaveat(input.cwd)}`,
  })
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
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5_000 })
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
  if (!started && logIncomplete(log)) {
    // ⚠ A LOST BRACKET IS NOT A RUN WHERE NOTHING CHANGED (audit B5, confirmed by
    // execution 2026-09-19). Tear the `subagent.started` line and `before` is
    // undefined, so this returned — and a read-only role's end skips the
    // completion rules, so R4 never spoke either. A state change during a review
    // was reported NOWHERE. The torn line never repairs, so say it once per agent.
    const unknownKey = `${input.agent_id}:unknown`
    if (!log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && entry.key === unknownKey)) {
      queueAction({ rule: 'R3', key: unknownKey, text: `quality-harness: whether the repository changed during the ${role} `
        + `run (agent ${input.agent_id}) is unknown — this session's event log could not be read whole, and the record of `
        + 'where that run began may be among what was lost. That is a statement about what could be looked at, not about '
        + 'the review (ADR-005).' })
    }
    return
  }
  if (before?.ok !== true || after?.ok !== true || sameObservation(before, after)) return
  const key = input.agent_id
  if (log.some(entry => entry.event === 'action.emitted' && entry.rule === 'R3' && entry.key === key)) return
  const directory = nearestExistingDirectory(path.resolve(input.cwd))
  const root = directory ? gitRepositoryRoot(directory) : null
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

// A write git cannot see — outside the repository, ignored, or with no git at
// all. The last passing check observed the work as it was when it STARTED, so a
// write made while it ran is not covered by it.
function unobservableWrites(log) {
  const since = log.filter(entry => entry.event === 'check.passed').at(-1)?.startedAt ?? null
  return log.filter(entry => entry.event === 'file.written' && entry.observable === false
    && (typeof since !== 'string' || typeof entry.at !== 'string' || entry.at > since))
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
    { encoding: 'utf8', timeout: 5_000 })
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
  const baseline = log.find(entry => entry.event === 'session.started')?.observation
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
function uncheckedWorkReason(cwd, paths, outside, commits = [], { logTorn = false } = {}) {
  const shown = paths.slice(0, 8)
  const held = commits.slice(0, 3).map(commit => `\`${commit.sha.slice(0, 8)}\` ${commit.subject}`).join(', ')
  const listed = paths.length
    ? `Changed paths: ${shown.join(', ')}${paths.length > shown.length ? `, and ${paths.length - shown.length} more` : ''}.`
    : held
      ? `Nothing is uncommitted: what no \`qh-check\` has passed on is the tree at HEAD, committed as ${held}.`
      : 'Git reports no changed path in the working tree.'
  // ⚠ A TORN LOG CANNOT SUPPORT "NO CHECK HAS", ONLY "NONE CAN BE SHOWN". Since a
  // surviving record no longer certifies (`latestCheckFor`), this rule fires on a
  // torn log where a check DID succeed — and its old opening then accused in the
  // vocabulary of an observation. It must keep firing: R4 speaks once per session
  // and a torn line never repairs, so silence here would be silence for good.
  const opening = logTorn
    ? 'this turn ends with work whose check state is unknown — the session log could not be read whole, '
      + 'so whether `qh-check` succeeded on it cannot be shown.'
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
function uncheckedCommitsReason(cwd, commits) {
  const shown = commits.slice(0, NAMED_COMMIT_LIMIT)
  const listed = shown.map(commit => `  ${commit.sha.slice(0, 8)} ${commit.subject}`).join('\n')
  const rest = commits.length > shown.length ? `\n  … and ${commits.length - shown.length} more.` : ''
  const head = commits.length === 1
    ? 'a newly reachable commit is unchecked — no `qh-check` has passed on its tree:'
    : `${commits.length} newly reachable commits are unchecked — no \`qh-check\` has passed on their trees:`
  return `quality-harness: ${head}\n${listed}${rest}\nThis says they are reachable from HEAD and `
    + `unchecked, not that this session authored them. ${runTheCheckSentence(cwd)}`
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
  return log?.complete === false
    || (Array.isArray(log) && log.some(event => event?.event === 'check.source-unreadable'))
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
// named a test command.
const ARTIFACT_BUDGETS = { 'publish.requested': 45_000, 'context.compacting': 20_000 }
function artifactBudgetMs(eventName) {
  // The seam the zero-budget case needs; anything but a number of milliseconds
  // is ignored, so a typo cannot silently disable the pass.
  const configured = Number(process.env.QUALITY_HARNESS_ARTIFACT_BUDGET_MS)
  if (Number.isFinite(configured) && configured >= 0) return configured
  return ARTIFACT_BUDGETS[eventName] ?? 90_000
}

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
  if (recorded === null || recorded === undefined || identity === null || identity === undefined) return false
  return recorded === identity
}

function artifactRule(input, recorded) {
  if (typeof input.session_id !== 'string' || !input.session_id) return
  const log = readEvents(input.cwd, input.session_id)
  const baseline = log.find(entry => entry.event === 'session.started')?.observation
  const first = baseline?.head
  const directory = nearestExistingDirectory(path.resolve(input.cwd ?? process.cwd()))
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
  const answered = new Map()
  for (const entry of log) {
    if (entry.event === 'artifact.gated' && typeof entry.path === 'string' && entry.complete === true) {
      answered.set(entry.path, entry.blob ?? null)
    }
  }
  // ⚠ IDENTITIES BEFORE THE GATES RUN, for the same reason the per-edit gate takes
  // its identity first: a file edited WHILE the batch is gating it would otherwise
  // be filed under the NEW content carrying the OLD content's verdict, and rule A
  // would suppress the one edit nothing had looked at. Computed once here and
  // reused below, so the filter and the record cannot disagree about what was
  // gated. Found by a re-review, 2026-09-18 — the per-edit fix had left this
  // sibling untouched (CLAUDE.md §5).
  const identities = new Map([...paths].map(file => [file, contentId(file)]))
  const targets = [...paths].filter(file => !alreadyAnswered(answered, file, identities.get(file) ?? null))
  if (!targets.length) return
  // Nearest first: the session's own starting point, then HEAD. A record deleted
  // and committed during the session is in neither the working tree nor HEAD.
  const head = recorded?.observation?.ok === true ? recorded.observation.head : null
  const bases = [...new Set([first, head, 'HEAD'].filter(base => typeof base === 'string' && base))]
  const gated = new Map()
  const failure = runArtifactGates(targets, input.cwd, artifactBudgetMs(recorded?.event), { bases, gated })
  for (const file of targets) {
    // Only an answer is recorded. A path the budget cut gets no event, which is
    // exactly what makes the next boundary retry it.
    if (gated.get(file) !== true) continue
    const before = identities.get(file) ?? null
    const after = contentId(file)
    appendEvent(input.cwd, input.session_id, {
      event: 'artifact.gated', path: file, blob: before,
      // If the bytes moved under the gate, its verdict is about content that is
      // no longer there, so the next boundary asks again (ADR-005).
      complete: before !== null && before === after,
    })
  }
  if (!failure) return
  const tree = recorded?.observation?.ok === true ? recorded.observation.tree : 'unobserved'
  const key = `${tree}:${createHash('sha256').update(failure).digest('hex').slice(0, 16)}`
  if (log.some(entry => entry.event === 'action.emitted' && entry.rule === 'A' && entry.key === key)) return
  queueAction({ rule: 'A', key, text: failure })
}

function completionRules(input, ended) {
  if (!ended || typeof input.session_id !== 'string' || !input.session_id) return
  const log = readEvents(input.cwd, input.session_id)
  const observation = ended.observation
  const check = projectCheckCommand(input.cwd)
  const directory = nearestExistingDirectory(path.resolve(input.cwd ?? process.cwd()))
  const root = directory ? gitRepositoryRoot(directory) : null
  const baseline = log.find(entry => entry.event === 'session.started')?.observation
  const writes = unobservableWrites(log)
  const status = observation?.ok === true ? statusPaths(root) : []
  const commits = observation?.ok === true ? sessionCommits(log, root, observation.head) : []
  recordClaim(input, completionClaim(input.last_assistant_message),
    ledgerEvidence(log, observation, baseline, commits, writes, check, status), status.length + writes.length)
  // The opt-in today's advice already requires: a project that named no check
  // cannot be asked to run one (reported from redash-api, 2026-08-26).
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
      queueAction({ rule: 'R1', key, text: uncheckedWorkReason(input.cwd, status, writes.length, speaksFor, { logTorn: logIncomplete(log) }) })
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
      text: uncheckedCommitsReason(input.cwd, unchecked),
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
        : log?.complete === false
          ? 'this session’s event log could not be read whole — at least one record is torn or unreadable'
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
  let recorded = null
  try { recorded = recordHookEvent(input) } catch (failure) {
    process.stderr.write(`[quality-harness] the event log was not written (${failure?.message ?? failure}).\n`)
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
    const sections = []
    const orientation = sessionOrientation(input.cwd)
    if (orientation) sections.push(orientation)
    if (input.source === 'compact') {
      // The compaction summary is the model's; this is the gates'. Hand back what
      // PreCompact measured, so the next context knows what is unverified and
      // what task was in flight without re-deriving either.
      const note = readSessionNote(input.session_id)
      if (note?.text) sections.push(`What this session was doing before compaction (${note.at}): ${note.text}`)
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
        // The old note goes first, so a PreCompact that fails below cannot leave
        // a stale one behind to be handed back (Codex review, 2026-09-05).
        try { unlinkSync(sessionNotePath(input.session_id)) } catch {}
        const note = sessionStateNote(facts, cwd, root, repositoryRoot !== null)
        try { writeFileSync(sessionNotePath(input.session_id), JSON.stringify(note)) } catch (failure) {
          process.stderr.write(`[quality-harness] PreCompact: could not keep the state note (${failure.code ?? failure.message}).\n`)
        }
      }
      artifactRule(input, recorded)
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
    try {
      mkdirSync(home, { recursive: true })
      appendFileSync(path.join(home, 'sessions.jsonl'), `${JSON.stringify({
        at: note.at,
        session: typeof input.session_id === 'string' ? input.session_id : null,
        cwd,
        location: locationKey(root),
        reason: input.reason ?? null,
        status: note.status,
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
    if (readOnlyRole(input.agent_type) && (input.tool_name === 'Bash' || MUTATION_TOOLS.has(input.tool_name))) {
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
    if (input.tool_name !== 'Bash') return
    if (!containsCommitOrPush(input.tool_input?.command)) return
    publishUnchecked(input, recorded)
    artifactRule(input, recorded)
    return
  }

  if (!['SubagentStop', 'TaskCompleted', 'Stop'].includes(event)) return
  if (input.stop_hook_active === true || (event === 'Stop' && hasBackgroundWork(input))) return
  // A read-only role's end is R3's to report; the completion rules are about the
  // session's own work, and a reviewer authored none of it.
  if (event === 'SubagentStop' && readOnlyRole(input.agent_type)) return
  completionRules(input, recorded)
  artifactRule(input, recorded)
}

async function readStdin() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv[0] === '--first-mention') {
    process.exitCode = firstMentionThisSession(argv[1], argv[2]) ? 0 : 1
    return
  }
  const startedAt = Date.now()
  let input
  try {
    input = JSON.parse(await readStdin())
  } catch {
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
