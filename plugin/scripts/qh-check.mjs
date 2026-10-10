#!/usr/bin/env node
// qh-check — run the project's check and record what it observed (ADR-060 T2).
//
// The only writer of `checks.jsonl`. It resolves the check the way the advisories
// do (`checkCommandOrigin`), observes the tree before and after, keeps the LAST
// 64 KiB of output for the verdict (a test runner prints its summary at the end),
// and exits with the check's own code. SIGINT and SIGTERM are forwarded to the
// check's process group and recorded; a SIGKILL leaves no record, and the finding
// it would have cleared stays open.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'
import { stateDir } from './event-log.mjs'
import { firstMentionHere } from './session-notes.mjs'
import { projectConfigProblem, proseSpecs } from './project-config.mjs'
import { checkCommandOrigin, fastCheckCommand } from './check-command.mjs'
import { checkEventName, passedAlready } from './check-ledger.mjs'
import { observe, observeBudgetMs } from './tree-facts.mjs'
import { validationVerdict } from './completion-rules.mjs'
import * as leaseModule from './lease.mjs'
import { contention, loadLine, sampleLoad } from './load.mjs'
import { resolveBashExecutable } from './run-shell-hook.mjs'
import { PROSE_HINT, onlyTextChangedSince, previousPassHead, proseHintMs } from './prose-hint.mjs'
import { checkTimeoutMs, runLaunched } from './check-child.mjs'
import { once } from './lazily.mjs'

const KEEP_BYTES = 64 * 1024

const inSeconds = ms => `${(ms / 1000).toFixed(1)}s`
// A neighbour as the record keeps it: what its lease says, or that it could not be read.
const recorded = seen => (seen ? [...seen.live, ...seen.unknown].map(({ file: _file, ...entry }) => entry) : null)

// A spawn error or a missing status is not "this directory is not a repository".
// That reading is the non-git exemption, and a pass then skips the tree comparison.
export function repositoryDiscovery(spawnResult) {
  if (!spawnResult || spawnResult.error || spawnResult.status == null) return null
  return spawnResult.status === 0 && String(spawnResult.stdout ?? '').trim() !== ''
}

// What the check could not start on, said in the words that fix it.
const NO_BASH = 'no bash was found; install Git for Windows or set CLAUDE_CODE_GIT_BASH_PATH, because cmd.exe cannot run a POSIX check'

/**
 * checkLaunch says how the project's check is started: the executable, its
 * arguments, and whether Node wraps them in the platform shell.
 *
 * POSIX keeps `shell: true`, which is `/bin/sh` and has always run the check.
 * On Windows `shell: true` is cmd.exe, and cmd.exe cannot run a POSIX check: it
 * reads `./.venv/Scripts/python.exe` as the command `.` followed by a `/` switch
 * and answers "'.' is not recognized". Reported 2026-09-23 against 2.103.0, where
 * it kept a downstream commit hook blocked on a suite that passed when run
 * directly (BACKLOG §261). So Windows runs the check through Git Bash, resolved
 * exactly as the hook runner resolves it, and `-c` as the fence runner passes it.
 *
 * Null means no bash was found. The caller then records the check as not started
 * rather than falling back to cmd.exe, which would turn could-not-look into a
 * failure the project's code did not cause (ADR-005; spec-verify's `Cmd` override
 * made the same choice, BACKLOG §171). `platform`, `env` and `resolveBash` are the
 * seams that make the Windows arm reachable from a POSIX host (CLAUDE.md §7).
 */
export function checkLaunch(command, platform = process.platform, env = process.env, resolveBash = resolveBashExecutable) {
  if (platform !== 'win32') return { file: command, args: [], shell: true }
  const bash = resolveBash(platform, env)
  return bash ? { file: bash, args: ['-c', command], shell: false } : null
}


// What the plan reads, each read lazily and once and in the order the plan asks for it, so a refusal reads no more than it
// did before (BACKLOG section 376): the repository and its declared config, the command and how it came to be named, the
// prose the project declared, and what the ledger says of this tree.
function checkFacts({ cwd, env, fast }) {
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
  const git = repositoryDiscovery(top)
  const root = git === true ? top.stdout.trim() : realpathSync(cwd)
  const facts = {
    root, git,
    configProblem: once(() => projectConfigProblem(root)),
    fastCommand: once(() => (fast ? fastCheckCommand(root) : null)),
    named: once(() => (fast ? { command: facts.fastCommand(), origin: 'fast' } : checkCommandOrigin(root))),
    prose: once(() => (git === true && !fast ? proseSpecs(root) : { specs: [], problem: null })),
    passed: once(() => passedAlready({ root, git, command: facts.named().command, env, prose: facts.prose().specs })),
  }
  return facts
}

// The decision, as a function of the facts it is handed (BACKLOG section 376): refuse with a reason and an exit, or name the
// command, how it came to be named, the prose that may stand in for a run, and the pass that already covers this tree.
// `scripts/effect-classes.mjs` holds it to reading nothing but them.
export function checkPlan(facts, { fast, again, env }) {
  const configProblem = facts.configProblem()
  if (configProblem) {
    return { code: 2, said: `qh-check: UNRUN — ${configProblem}, so the declared check, fastCheck and prose are UNKNOWN. A replacement would certify something the project did not name; fix the file and run again.\n` }
  }
  // ADR-081: `--fast` runs the declared `fastCheck`, records it apart and never skips.
  if (fast && !facts.fastCommand()) {
    return { code: 2, said: 'qh-check: no `fastCheck` that can fail is declared in .quality-harness.json, so `--fast` has nothing to run.\n' }
  }
  const { command, origin } = facts.named()
  if (origin === 'refused') return { code: 2, said: 'qh-check: the check declared in .quality-harness.json is a constant success and was refused.\n' }
  if (origin === 'unproven') return { code: 2, said: 'qh-check: the repository root could not be read, so no check is named.\n' }
  if (!command) return { code: 2, said: 'qh-check: this project has no check to run. Declare one as `check` in .quality-harness.json.\n' }
  // ADR-094 T3: the paths the project declared as prose, validated; a declaration that could hide code is said and ignored.
  const prose = facts.prose()
  // ADR-081: the ledger answers before the lease is taken, so a skip never waits its turn. A run that misses observes the
  // tree again after its wait. QUALITY_HARNESS_CHECK_AGAIN=1 is `--again` for every run: a project, or a test, whose check
  // depends on something outside the tree opts out of the skip.
  const rerun = fast || again || env.QUALITY_HARNESS_CHECK_AGAIN === '1'
  return { command, origin, prose, notes: prose.problem ? [`qh-check: ${prose.problem}\n`] : [], already: rerun ? null : facts.passed() }
}

// A prose reuse is a pass row for THIS tree (see below); the record it appends can veto the reuse, which is why this is a
// step of the run and not a part of the plan. Returns the pass that stands for this tree, or null when the check must run.
function reuseByProse({ already, prose, git, command, root, stderr, beforeReuse }) {
  // A prose reuse is a pass row for THIS tree, so the publish verdict reads it as it reads any pass: its times are the
  // original's (it claims no more), its marker is `reusedFrom`, and one that cannot be written runs the check instead.
  if (already?.viaProse) {
    const original = already.record
    const row = { id: randomUUID(), at: new Date().toISOString(), git, command, origin: original.origin,
      before: { ...already.now, at: original.before.at }, after: { ...already.now, at: original.after.at },
      exit: 0, signal: null, verdict: original.verdict, cores: original.cores, contended: original.contended,
      beside: null, besideAtEnd: null, waitedMs: 0, prose: prose.specs, reusedFrom: original.reusedFrom ?? original.id }
    // The reuse row must land where the decision left the ledger: a record appended in between (a concurrent `--again`
    // that failed, say) would be followed by this pass and read as superseded (Codex reviews of ADR-094). The append is
    // atomic and a count read before it is not, so the position is checked AFTER: ours must be the next row. If it is
    // not, the check runs, and its own row follows ours and decides. `beforeReuse` is the seam a test uses to be that
    // concurrent writer.
    beforeReuse()
    const ledgerFile = path.join(stateDir(root), 'checks.jsonl')
    let appended = false
    try {
      mkdirSync(stateDir(root), { recursive: true })
      appendFileSync(ledgerFile, `${JSON.stringify(row)}\n`, 'utf8')
      appended = true
      const ids = readFileSync(ledgerFile, 'utf8').split('\n').filter(line => line.trim()).map(line => { try { return JSON.parse(line).id } catch { return null } })
      if (ids.indexOf(row.id) !== already.rows) throw Object.assign(new Error('the ledger gained a record between the decision and the append'), { code: 'ELEDGER' })
    } catch (failure) {
      // An append cannot be undone, and a reuse row left as the tree's latest would pass a tree nobody checked if the
      // run that follows is interrupted: it is retracted by a row that grades as unproven (a Codex review of ADR-094).
      if (appended) {
        try {
          appendFileSync(ledgerFile, `${JSON.stringify({ ...row, id: randomUUID(), at: new Date().toISOString(), exit: null, verdict: 'unproven', reusedFrom: undefined, retracts: row.id })}\n`, 'utf8')
        } catch (retraction) {
          stderr.write(`qh-check: the prose reuse could not be retracted either (${retraction.code ?? retraction.message}); \`qh-check --again\` writes the row that decides.\n`)
        }
      }
      stderr.write(`qh-check: the prose reuse could not be relied on (${failure.code ?? failure.message}), so the check runs.\n`)
      already = null
    }
    if (already) already.reuse = row
  }
  return already
}

// The owner, 2026-10-02: a skip left no trace, so how often it saves a run could not be counted (ADR-081's follow-up).
function recordSkip({ already, command, prose, root, stderr }) {
  const took = already.ms === null ? '' : `, in ${inSeconds(already.ms)}`
  stderr.write(already.viaProse
    ? `qh-check: only prose changed (${prose.specs.join(', ')}), so the pass at ${already.at}${took} (\`${command}\`) stands for this tree — not run again; `
      + `recorded as a reuse of ${already.reuse.reusedFrom}. The tree without the prose covers no ignored file, environment or service; \`qh-check --again\` runs it.\n`
    : `qh-check: already passed on this tree at ${already.at}${took} (\`${command}\`) — not run again. `
      + 'A tree hash covers no ignored file, environment or service; `qh-check --again` runs it.\n')
  // The owner, 2026-10-02: a skip left no trace, so how often it saves a run could not be
  // counted (ADR-081's follow-up). It goes to `skips.jsonl`, where no reader of a pass looks —
  // a row in checks.jsonl would become the tree's latest record and undo the next skip. A
  // ledger that cannot be written is said; the skip and its exit stand (CLAUDE.md §3).
  try {
    mkdirSync(stateDir(root), { recursive: true })
    appendFileSync(path.join(stateDir(root), 'skips.jsonl'), `${JSON.stringify({ id: randomUUID(), at: new Date().toISOString(),
      command, tree: already.tree, passId: already.passOf ?? already.id, passedAt: already.at, savedMs: already.ms,
      ...(already.viaProse ? { viaProse: true } : {}) })}\n`, 'utf8')
  } catch (failure) {
    stderr.write(`qh-check: the skip could not be recorded (${failure.code ?? failure.message}).\n`)
  }
}

// ADR-077: waiting for a turn, taken before the load is sampled. Returns the held lease and what the run needs of it, or the
// exit of a run a signal stopped while it waited.
async function takeTurn({ lease, env, wait, command, root, stderr }) {
  // ADR-077: a lease for the whole run, taken before the load is sampled, so the check's own
  // numbers are taken after any wait. It names the heavy runs beside it and never changes the
  // check's exit or verdict (CLAUDE.md §3); a directory it cannot use is said, and it runs unleased.
  // `lease` is the module, and a test's seam.
  const waiting = wait || env.QUALITY_HARNESS_WAIT === '1'
  const leases = lease.leaseDir(env)
  // A lease step that fails is said, and the check's own run and record stand (Codex review of the
  // 3.3.0 candidate): the lease is advice about the machine, never a condition of the check.
  const leaseStep = (what, step) => {
    try {
      return step()
    } catch (failure) {
      stderr.write(`qh-check: could not ${what} the lease (${failure.code ?? failure.message}); the check's own result stands.\n`)
      return undefined
    }
  }
  let held = lease.take(leases, { command: `qh-check: ${command}`, root, state: waiting ? 'waiting' : 'running' })
  if (held.error) {
    stderr.write(`qh-check: could not use the lease: ${held.error}; running without one.\n`)
    held = null
  }
  const look = () => {
    if (!held) return null
    try {
      return lease.observe(leases, held)
    } catch (failure) {
      stderr.write(`qh-check: could not read the leases (${failure.code ?? failure.message}), so no neighbour is named.\n`)
      return null
    }
  }
  let waitedMs = 0
  if (held && waiting) {
    // A signal while waiting ends the wait, releases the lease and runs nothing.
    let stopped = null
    const stop = signal => { stopped = signal }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    let turn
    try {
      turn = await lease.admit(leases, held, { maxMs: lease.waitMaxMs(env), stopped: () => stopped })
    } catch (failure) {
      stderr.write(`qh-check: could not wait for its turn (${failure.code ?? failure.message}), so it runs now.\n`)
      turn = { admitted: false, waitedMs: 0, stopped: null, failed: true }
    } finally {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
    }
    waitedMs = turn.waitedMs
    if (turn.stopped) {
      leaseStep('release', () => lease.release(held))
      stderr.write(`qh-check: stopped by ${turn.stopped} while waiting its turn; the check did not run.\n`)
      return { code: turn.stopped === 'SIGINT' ? 130 : 143 }
    }
    if (!turn.failed) {
      stderr.write(turn.admitted
        ? `qh-check: waited ${inSeconds(waitedMs)} for its turn.\n`
        : `qh-check: stopped waiting after ${inSeconds(waitedMs)} (QUALITY_HARNESS_WAIT_MAX_S), and runs beside the rest.\n`)
    }
    // An admitted lease is marked running under the admission lock; one that stopped waiting is not.
    if (!turn.admitted) leaseStep('mark', () => lease.mark(held, { state: 'running' }))
  }
  return { held, look, leaseStep, waitedMs }
}

// Said on STDERR, once, after the record exists; the record is the check's and the sentence is for whoever ran it.
function recordRun({ record, fast, root, startedAt, after, signal, verdict, command, origin, stderr }) {
  try {
    const directory = stateDir(root)
    mkdirSync(directory, { recursive: true })
    // A fast record goes where no reader of a full pass looks, in any version (ADR-081).
    const file = path.join(directory, fast ? 'fast-checks.jsonl' : 'checks.jsonl')
    appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
    // Said on STDERR, once, after the record exists: a check run by hand showed only
    // its own output, so nobody could tell what ran, whether it was declared or
    // inferred, or that a record was written (BACKLOG §280 item 1). Stdout stays
    // the check's own.
    const shown = path.relative(root, file)
    const took = inSeconds(Date.parse(after.at) - Date.parse(startedAt))
    const said = signal ? `interrupted by ${signal} before it finished, so there is no verdict` : `${verdict} in ${took}`
    stderr.write(`qh-check: ran \`${command}\` (${origin}) — ${said}; recorded in ${shown.startsWith('..') || path.isAbsolute(shown) ? file : shown}\n`)
  } catch (failure) {
    stderr.write(`qh-check: the check ran, but its record could not be written (${failure.code ?? failure.message}).\n`)
  }
}

export async function runCheck({ cwd = process.cwd(), env = process.env, platform = process.platform, stdout = process.stdout, stderr = process.stderr, loadavg, cores, wait = false, again = false, fast = false, lease = leaseModule, beforeReuse = () => {} } = {}) {
  const facts = checkFacts({ cwd, env, fast })
  const plan = checkPlan(facts, { fast, again, env })
  if (plan.code !== undefined) {
    stderr.write(plan.said)
    return plan.code
  }
  const { root, git } = facts
  const { command, origin, prose } = plan
  for (const note of plan.notes) stderr.write(note)
  const observeNow = () => (prose.specs.length ? observe(root, observeBudgetMs(env), { without: prose.specs }) : observe(root))
  const already = reuseByProse({ already: plan.already, prose, git, command, root, stderr, beforeReuse })
  if (already) {
    recordSkip({ already, command, prose, root, stderr })
    return 0
  }
  const admission = await takeTurn({ lease, env, wait, command, root, stderr })
  if (admission.code !== undefined) return admission.code
  const { held, look, leaseStep, waitedMs } = admission
  const beside = look()
  for (const line of beside ? lease.besideLines(beside) : []) stderr.write(`qh-check: ${line}\n`)
  const startedAt = new Date().toISOString()
  // The load at both ends of the check (ADR-075 T1): a pass taken on a saturated machine is
  // not attributable, and the record says so without changing the exit or the verdict.
  // An option passed is used as given, so a 0 or a NaN is read as invalid, not replaced by the host's.
  const load = { ...(loadavg !== undefined ? { loadavg } : {}), ...(cores !== undefined ? { cores } : {}) }
  const loadAtStart = sampleLoad(load)
  // The previous full pass's HEAD, read before this run's own row exists: the hint compares against it.
  const previousHead = !fast && git === true && prose.specs.length === 0 ? previousPassHead(root, command) : null
  const before = { ...observeNow(), at: startedAt, load: loadAtStart.load }
  let kept = Buffer.alloc(0)
  const keep = chunk => {
    kept = Buffer.concat([kept, chunk])
    if (kept.length > KEEP_BYTES) kept = kept.subarray(kept.length - KEEP_BYTES)
  }
  const launch = checkLaunch(command, platform, env)
  // Released after runLaunched returns, not on the signal: a check still closing keeps its lease.
  let ran
  let besideAtEnd = null
  try {
    ran = launch
      ? await runLaunched(launch, { root, env, platform, timeoutMs: checkTimeoutMs(env), stdout, stderr, keep })
      : { ended: { code: null, signal: null, error: new Error(NO_BASH) }, received: null }
    besideAtEnd = look()
  } finally {
    if (held) leaseStep('release', () => lease.release(held))
  }
  const { ended, received } = ran
  for (const line of besideAtEnd ? lease.besideLines(besideAtEnd) : []) stderr.write(`qh-check: at its end, ${line}\n`)
  const after = { ...observeNow(), at: new Date().toISOString(), load: sampleLoad(load).load }
  const signal = received ?? ended.signal ?? null
  const exit = ended.error ? null : ended.code
  // A check a signal ended did not finish, so it has no verdict: "failed" said it had
  // one, five times over a run that was SIGKILLed (BACKLOG §295 item 24, ADR-005).
  const verdict = ended.error
    ? 'unstarted'
    : signal
      ? 'interrupted'
      : validationVerdict({ exit_code: exit ?? 1, stdout: kept.toString('utf8') }, command, { anyCommand: true })
  const contended = contention(before.load, after.load, loadAtStart.cores)
  const record = { id: randomUUID(), at: after.at, git, command, origin, before, after, exit, signal, verdict, cores: loadAtStart.cores, contended,
    beside: recorded(beside), besideAtEnd: recorded(besideAtEnd), waitedMs, ...(prose.specs.length ? { prose: prose.specs } : {}) }
  recordRun({ record, fast, root, startedAt, after, signal, verdict, command, origin, stderr })
  if (previousHead && checkEventName(record) === 'check.passed' && Date.parse(after.at) - Date.parse(startedAt) >= proseHintMs(env)
    && onlyTextChangedSince(root, previousHead) && firstMentionHere(root, PROSE_HINT)) {
    stderr.write(`qh-check: ${PROSE_HINT}\n`)
  }
  stderr.write(`qh-check: ${loadLine(before.load, after.load, loadAtStart.cores)}\n`)
  if (ended.error) {
    stderr.write(`qh-check: the check could not start (${ended.error.code ?? ended.error.message}).\n`)
    return 127
  }
  return exit ?? 1
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const unknown = argv.filter(word => !['--wait', '--again', '--fast'].includes(word))
  if (unknown.length) {
    process.stderr.write(`qh-check: unknown option: ${unknown[0]}\nusage: qh-check [--wait] [--again] [--fast]\n`)
    process.exitCode = 2
  } else {
    process.exitCode = await runCheck({ wait: argv.includes('--wait'), again: argv.includes('--again'), fast: argv.includes('--fast') })
  }
}
