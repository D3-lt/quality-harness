#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'

// The standalone install's scope and PATH arithmetic live in one module, shared
// with sync-standalone.mjs. Two copies of that list drifted apart once already.
import { FORWARDER_MARK, SHADOW_SCOPE, barePathWinner, citeOrphan, orphans, wiredInSettings } from './standalone-link.mjs'

// ADR-060's event log is shared with run-shell-hook.mjs's per-edit gate, so it
// lives in a leaf module both can import (T6).
import { appendEvent, canonical, nearestExistingDirectory, readEvents, sessionLogFile, stateDir } from './event-log.mjs'
export { readEvents, sessionLogFile, stateDir } from './event-log.mjs'
import { listedUnderUninterestingDirectory } from './uninteresting.mjs'
import { checkInCode, codeSpan, commandInCode, corpusText, pathInCode, quotedCorpusText, scrubber, shownPath } from './corpus-text.mjs'
import { TASK_DIRECTORY_READ_CAP, decisionContext, inside, listedPath, posixListed, taskDirectories, trackedPaths, unmarkedArchives } from './decision-corpus.mjs'
import { PLUGIN_ROOT } from './plugin-root.mjs'
import { pendingActions, queueAction } from './hook-queue.mjs'
import { gitRepositoryLookup, gitRepositoryRoot, locationKey, observe } from './tree-facts.mjs'
import { checkCommandOrigin, projectCheckCommand } from './check-command.mjs'
import { importCheckRecords, lateBaselineAllowed, logIncomplete, passedAlready, recordFileWritten } from './check-ledger.mjs'
import { artifactRule, importPassVerdicts, runArtifactPass } from './artifact-pass.mjs'
import { completionRules, observedFacts, subagentContract } from './completion-rules.mjs'
import { SHELL_TOOLS, awaitingArming, containsCommitOrPush, mentionsCommitOrPush, offerPublishHook, publishUnchecked, readOnlyRole, readOnlyVerdict, reviewChangedState } from './publish-verdict.mjs'

const MUTATION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
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

function hasBackgroundWork(input) {
  return (Array.isArray(input.background_tasks) && input.background_tasks.length > 0)
    || (Array.isArray(input.session_crons) && input.session_crons.length > 0)
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



// ONE JSON object per run is what Claude Code parses from a hook's stdout, so
// output is held here and written once by main() — which is also where the
// hook's own wall-clock is known. A hook that is slow used to be a pause with
// no name (the §15 SessionStart hook hung new sessions for seconds and said
// nothing, 2026-09-05); above SLOW_HOOK_MS the run names itself on both
// channels, as one more line, never instead of the finding.
let pendingOutput = null
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




// ---- ADR-060: hooks are named events, each observed and appended to a log.
// The state directory and the log itself are in `event-log.mjs`, imported above.


const OBSERVED_HOOK_EVENTS = {
  TaskCompleted: 'task.completed',
  PreCompact: 'context.compacting',
  SessionEnd: 'session.ending',
  SubagentStart: 'subagent.started',
  SubagentStop: 'subagent.ended',
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



const ARMING_NOTE = "quality-harness: git's own refusal of an unchecked commit or push has not run yet in this "
  + 'session: it takes effect from the next prompt, and until then the text refusal applies (ADR-068).'







// Rule A `artifact-invalid` (ADR-060): the artifact gates over everything this
// session changed — committed since its first HEAD, uncommitted, and written by
// a tool — minus every path a gate has already answered for THIS content. It has
// no check gate: a malformed record is malformed whether or not the project
// named a test command. Since ADR-080 it runs behind the boundary, in one pass
// per session that writes its own ledger; see `startArtifactPass`.




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
