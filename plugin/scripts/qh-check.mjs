#!/usr/bin/env node
// qh-check — run the project's check and record what it observed (ADR-060 T2).
//
// The only writer of `checks.jsonl`. It resolves the check the way the advisories
// do (`checkCommandOrigin`), observes the tree before and after, keeps the LAST
// 64 KiB of output for the verdict (a test runner prints its summary at the end),
// and exits with the check's own code. SIGINT and SIGTERM are forwarded to the
// check's process group and recorded; a SIGKILL leaves no record, and the finding
// it would have cleared stays open. The decision is checkPlan; the rows and the sentences are check-record.mjs;
// the lease and the child are check-lease.mjs and check-child.mjs (BACKLOG section 376).
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isMainModule } from './main-module.mjs'
import { firstMentionHere } from './session-notes.mjs'
import { projectConfigProblem, proseSpecs } from './project-config.mjs'
import { checkCommandOrigin, fastCheckCommand } from './check-command.mjs'
import { checkEventName, passedAlready } from './check-ledger.mjs'
import { observe, observeBudgetMs } from './tree-facts.mjs'
import * as leaseModule from './lease.mjs'
import { contention, loadLine, sampleLoad } from './load.mjs'
import { resolveBashExecutable } from './run-shell-hook.mjs'
import { PROSE_HINT, onlyTextChangedSince, previousPassHead, proseHintMs } from './prose-hint.mjs'
import { checkTimeoutMs, runLaunched } from './check-child.mjs'
import { takeTurn } from './check-lease.mjs'
import { classifyRun, recordRun, recordSkip, reuseByProse, runRecord } from './check-record.mjs'
import { once } from './lazily.mjs'

const KEEP_BYTES = 64 * 1024

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
  const { signal, exit, verdict } = classifyRun({ ended, received, kept, command })
  const contended = contention(before.load, after.load, loadAtStart.cores)
  const record = runRecord({ id: randomUUID(), git, command, origin, before, after, run: { exit, signal, verdict }, cores: loadAtStart.cores,
    contended, beside, besideAtEnd, waitedMs, prose })
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
