// What a turn that ends says about itself, judged against what the ledgers and the tree show (ADR-060, ADR-035): a claim of
// completion, work nobody checked, writes git could not see, and the contract a subagent is handed. Moved out of
// lifecycle.mjs unchanged (BACKLOG section 375, stage B3). These judges queue what they decide; the dispatcher delivers it.
import { walk } from './decision-corpus.mjs'
import path from 'node:path'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { canonical, nearestExistingDirectory, readEvents } from './event-log.mjs'
import { checkCommandOrigin, runTheCheckSentence } from './check-command.mjs'
import { checkRevision, checkStanding, emittedFor, latestCheckFor, latestOf, logIncomplete, namedByPublish, namedByReview, revisionFor, tornRecord, treeChecked, unobservableWrites } from './check-ledger.mjs'
import { gitRepositoryLookup, mark, sessionBaseline, sessionCommits, statusPaths } from './tree-facts.mjs'
import { queueAction } from './hook-queue.mjs'

// ---- Notes that sat above these functions in lifecycle.mjs; stage B of BACKLOG section 375 moved the code and they stayed behind.
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

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt'])

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

export function completionClaim(message) {
  if (typeof message !== 'string') return { kind: 'unavailable', phrase: null }
  if (evidenceLimited(message)) return { kind: 'limited', phrase: null }
  if (interimResponse(message) || unverifiedDisclosure(message)) return { kind: 'hedged', phrase: null }
  return { kind: 'none', phrase: null }
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

export function subagentContract(input) {
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
function uncheckedWorkReason(sentence, paths, outside, commits = [], { logTorn = false, tornWords = null, orderUnknown = false, couldNotLook = false } = {}) {
  const shown = paths.slice(0, 8)
  const held = commits.slice(0, 3).map(commit => `\`${commit.sha.slice(0, 8)}\` ${commit.subject}`).join(', ')
  const listed = paths.length
    ? `Changed paths: ${shown.join(', ')}${paths.length > shown.length ? `, and ${paths.length - shown.length} more` : ''}.`
    : held
      ? (logTorn
        ? `Nothing is uncommitted: whether a \`qh-check\` passed on the tree at HEAD cannot be shown; it was committed as ${held}.`
        : orderUnknown
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
    + `${unseenPathNote(outside)} ${sentence}`
}

// ONE finding per boundary, however many commits it names. A fetch, a merge or a
// branch switch makes dozens newly reachable at once, and a message per commit
// would be dozens of joined advisories in a single hook — each of them asking
// git for the check command again. Dedupe stays per commit and evidence revision
// (ADR-060's key), carried in the action's detail.
const NAMED_COMMIT_LIMIT = 5

// Exported so its wording is tested without building newly reachable commits. The first argument is the sentence that names
// the project's check (the facts carry it); the wording the tests look at is everything before it.
export function uncheckedCommitsReason(sentence, commits, { logTorn = false, tornWords = null, orderUnknown = false, couldNotLook = false } = {}) {
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
    + `${logTorn || orderUnknown || couldNotLook ? 'not known to be checked' : 'unchecked'}, not that this session authored them. ${sentence}`
}

function couldNotLookReason(sentence, reason) {
  return `quality-harness: this repository could not be observed (${reason}), so its tree, index `
    + 'and HEAD are unknown to this hook. That is a statement about what could be looked at, not '
    + 'about your work (ADR-005). Edit and Write paths are still tracked, and `qh-check` still '
    + `records what it observed. ${sentence}`
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

export function completionRules(input, ended) {
  const facts = completionFacts(input, ended)
  if (!facts) return
  const { claim, actions } = completionJudgement(facts, input)
  recordClaim(input, claim.claim, claim.evidence, claim.mutations)
  for (const action of actions) queueAction(action)
}

/**
 * What the turn-end rules read from the world (BACKLOG section 375, stage C): the session log, the project's check, the
 * repository root, the writes git could not see, the paths git lists, the commits made since the session began. The reads
 * that depend on a verdict (the sentence that names the check, the key of the could-not-look finding, the task-file nudge)
 * are functions the judgement calls only if it gets that far. Returns null for a turn the rules do not judge.
 */
export function completionFacts(input, ended) {
  if (!ended || typeof input.session_id !== 'string' || !input.session_id) return null
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
  return {
    log, observation, check, root, baseline, writes, status, commits,
    sentence: () => runTheCheckSentence(input.cwd),
    locationKey: () => canonical(root ?? path.resolve(input.cwd ?? process.cwd())),
    nudge: changed => evidenceNudge(input.cwd, changed),
  }
}

/**
 * The turn-end rules as a function of their facts and of the turn's own payload (its message and its event): the completion
 * claim and the evidence it is set against, and the findings R1, R2 and R4 say, in the order they are said. It reaches no file,
 * process, clock or environment (tests/pure-judges.test.mjs), so a finding is a table over facts and
 * tests/completion-judgement.test.mjs walks it. Returns `{ claim, actions }`; the caller records the claim and queues the actions.
 */
export function completionJudgement(facts, input) {
  const { log, observation, check, root, baseline, writes, status, commits } = facts
  const claim = {
    claim: completionClaim(input.last_assistant_message),
    evidence: ledgerEvidence(log, observation, baseline, commits, writes, check, status),
    mutations: status.length + writes.length,
  }
  const actions = []
  // The opt-in today's advice already requires: a project that named no check
  // cannot be asked to run one (reported from redash-api, 2026-08-26). A refused
  // declaration is a check that does not count, not a project that named none.
  if (!check) return { claim, actions }

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
      actions.push({ rule: 'R1', key, text: uncheckedWorkReason(facts.sentence(), status, writes.length, speaksFor, { logTorn: logIncomplete(log), tornWords: tornRecord(log), orderUnknown: observation?.ok === true && checkStanding(log, observation.tree) === 'unresolved', couldNotLook: observation?.ok === true && checkStanding(log, observation.tree) === 'could-not-look' }) })
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
    actions.push({
      rule: 'R2', key: keys.join(' '), detail: { commits: keys },
      text: uncheckedCommitsReason(facts.sentence(), unchecked, { logTorn: logIncomplete(log), tornWords: tornRecord(log), orderUnknown: unchecked.some(commit => checkStanding(log, commit.tree) === 'unresolved'), couldNotLook: unchecked.some(commit => checkStanding(log, commit.tree) === 'could-not-look') }),
    })
  }
  if (observation?.ok !== true || status?.ok === false || commits?.ok === false
    || logIncomplete(log)) {
    // Once per session and cwd, read from the log rather than from a marker file
    // under os.tmpdir() (ADR-060 replaces sessionGenerationPath here).
    const key = facts.locationKey()
    if (!emittedFor(log, 'R4', key)) {
      // NAME what could not be looked at. A failed enumeration has a reason of its
      // own — the observation may have succeeded and the follow-up query failed —
      // and "no reason was recorded" would report the wrong could-not-look.
      const why = observation?.ok !== true
        ? (observation?.reason ?? 'no reason was recorded')
        : logIncomplete(log)
          ? `${tornRecord(log, 'this session’s event log')} could not be read whole — at least one record is torn or unreadable`
          : (status?.why || commits?.why || 'a git query failed without saying why')
      actions.push({ rule: 'R4', key, text: couldNotLookReason(facts.sentence(), why) })
    }
  }
  // The check passed and a task file changed: the corpus wants that recorded,
  // not asserted. Not a rule — it repeats while the state it is about holds.
  if (observation?.ok === true && treeChecked(log, observation.tree)) {
    const nudge = facts.nudge(changed)
    if (nudge) actions.push({ text: nudge })
  }
  return { claim, actions }
}
