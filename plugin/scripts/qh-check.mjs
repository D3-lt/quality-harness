#!/usr/bin/env node
// qh-check — run the project's check and record what it observed (ADR-060 T2).
//
// The only writer of `checks.jsonl`. It resolves the check the way the advisories
// do (`checkCommandOrigin`), observes the tree before and after, keeps the LAST
// 64 KiB of output for the verdict (a test runner prints its summary at the end),
// and exits with the check's own code. SIGINT and SIGTERM are forwarded to the
// check's process group and recorded; a SIGKILL leaves no record, and the finding
// it would have cleared stays open.
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'
import { checkCommandOrigin, checkEventName, fastCheckCommand, observe, stateDir, validationVerdict } from './lifecycle.mjs'
import * as leaseModule from './lease.mjs'
import { contention, loadLine, sampleLoad } from './load.mjs'
import { resolveBashExecutable } from './run-shell-hook.mjs'

const KEEP_BYTES = 64 * 1024
// A check that never returns would hold the session's Bash call for ever; past
// this bound its process group gets SIGTERM and the record says so.
const CHECK_TIMEOUT_SECONDS = 3_600

function checkTimeoutMs(env) {
  const seconds = Number(env.QUALITY_HARNESS_CHECK_TIMEOUT)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : CHECK_TIMEOUT_SECONDS) * 1_000
}

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
 * `observeTree` is the seam a test replaces.
 */
export function passedAlready({ root, git, command, env = process.env, observeTree = observe }) {
  if (git !== true) return null
  const now = observeTree(root)
  if (now?.ok !== true) return null
  let text
  try { text = readFileSync(path.join(stateDir(root), 'checks.jsonl'), 'utf8') } catch { return null }
  let latest = null
  let seq = 0
  let latestSeq = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { return null }
    // A row that is not a record proves nothing, as the importer reads it.
    if (typeof record?.id !== 'string') return null
    seq += 1
    if (record?.command === command && record?.after?.tree === now.tree) latest = record
    if (latest === record) latestSeq = seq
  }
  if (!latest || checkEventName(latest) !== 'check.passed') return null
  const started = Date.parse(latest.before?.at)
  const sessions = path.join(stateDir(root), 'sessions')
  let names = []
  try { names = readdirSync(sessions).filter(name => name.endsWith('.jsonl')) } catch (error) {
    // Absent is no session; a directory that cannot be listed hides what it holds.
    if (error?.code !== 'ENOENT') return null
  }
  for (const name of names) {
    let log
    try { log = readFileSync(path.join(sessions, name), 'utf8') } catch { return null }
    for (const line of log.split('\n')) {
      if (!line.trim()) continue
      let entry
      try { entry = JSON.parse(line) } catch { return null }
      if (entry?.event !== 'file.written' || entry.observable !== false) continue
      // Cleared only when recorded before this pass AND started before it, the rule
      // `unobservableWrites` keeps: a clock that went back cannot hide a write the
      // ledger's count says came after (Codex review of ADR-081).
      const recordedBefore = entry.checksSeen === undefined || (Number.isInteger(entry.checksSeen) && entry.checksSeen < latestSeq)
      if (!(recordedBefore && Date.parse(entry.at) < started)) return null
    }
  }
  const ms = Date.parse(latest.after?.at) - Date.parse(latest.before?.at)
  return { at: latest.after.at, ms: Number.isFinite(ms) ? ms : null }
}
// Runs a launched check to its end, forwarding SIGINT/SIGTERM and enforcing the
// timeout. `received` is the signal this process forwarded, if any.
async function runLaunched({ file, args, shell }, { root, env, platform, timeoutMs, stdout, stderr, keep }) {
  // Its own process group on POSIX, so a forwarded signal reaches the whole check,
  // not only the shell that started it.
  const group = platform !== 'win32'
  const child = spawn(file, args, { cwd: root, shell, env, stdio: ['ignore', 'pipe', 'pipe'], detached: group, timeout: timeoutMs, windowsHide: true })
  let received = null
  const forward = signal => {
    received = signal
    try { if (group) process.kill(-child.pid, signal); else child.kill(signal) } catch { /* already gone */ }
  }
  process.on('SIGINT', forward)
  process.on('SIGTERM', forward)
  const timer = setTimeout(() => forward('SIGTERM'), timeoutMs)
  timer.unref()
  child.stdout.on('data', chunk => { stdout.write(chunk); keep(chunk) })
  child.stderr.on('data', chunk => { stderr.write(chunk); keep(chunk) })
  const ended = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error }))
    child.once('close', (code, signal) => resolve({ code, signal, error: null }))
  })
  process.off('SIGINT', forward)
  process.off('SIGTERM', forward)
  clearTimeout(timer)
  return { ended, received }
}

export async function runCheck({ cwd = process.cwd(), env = process.env, platform = process.platform, stdout = process.stdout, stderr = process.stderr, loadavg, cores, wait = false, again = false, fast = false, lease = leaseModule } = {}) {
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
  const git = repositoryDiscovery(top)
  const root = git === true ? top.stdout.trim() : realpathSync(cwd)
  // ADR-081: `--fast` runs the declared `fastCheck`, records it apart and never skips.
  const fastCommand = fast ? fastCheckCommand(root) : null
  if (fast && !fastCommand) {
    stderr.write('qh-check: no `fastCheck` that can fail is declared in .quality-harness.json, so `--fast` has nothing to run.\n')
    return 2
  }
  if (fast) again = true
  const { command, origin } = fast ? { command: fastCommand, origin: 'fast' } : checkCommandOrigin(root)
  if (origin === 'refused') {
    stderr.write('qh-check: the check declared in .quality-harness.json is a constant success and was refused.\n')
    return 2
  }
  if (origin === 'unproven') {
    stderr.write('qh-check: the repository root could not be read, so no check is named.\n')
    return 2
  }
  if (!command) {
    stderr.write('qh-check: this project has no check to run. Declare one as `check` in .quality-harness.json.\n')
    return 2
  }
  // ADR-081: the ledger answers before the lease is taken, so a skip never waits its
  // turn. A run that misses observes the tree again after its wait, below.
  // QUALITY_HARNESS_CHECK_AGAIN=1 is `--again` for every run: a project, or a test,
  // whose check depends on something outside the tree opts out of the skip.
  const already = again || env.QUALITY_HARNESS_CHECK_AGAIN === '1' ? null : passedAlready({ root, git, command, env })
  if (already) {
    const took = already.ms === null ? '' : `, in ${inSeconds(already.ms)}`
    stderr.write(`qh-check: already passed on this tree at ${already.at}${took} (\`${command}\`) — not run again. `
      + 'A tree hash covers no ignored file, environment or service; `qh-check --again` runs it.\n')
    return 0
  }
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
      return turn.stopped === 'SIGINT' ? 130 : 143
    }
    if (!turn.failed) {
      stderr.write(turn.admitted
        ? `qh-check: waited ${inSeconds(waitedMs)} for its turn.\n`
        : `qh-check: stopped waiting after ${inSeconds(waitedMs)} (QUALITY_HARNESS_WAIT_MAX_S), and runs beside the rest.\n`)
    }
    // An admitted lease is marked running under the admission lock; one that stopped waiting is not.
    if (!turn.admitted) leaseStep('mark', () => lease.mark(held, { state: 'running' }))
  }
  const beside = look()
  for (const line of beside ? lease.besideLines(beside) : []) stderr.write(`qh-check: ${line}\n`)
  const startedAt = new Date().toISOString()
  // The load at both ends of the check (ADR-075 T1): a pass taken on a saturated machine is
  // not attributable, and the record says so without changing the exit or the verdict.
  // An option passed is used as given, so a 0 or a NaN is read as invalid, not replaced by the host's.
  const load = { ...(loadavg !== undefined ? { loadavg } : {}), ...(cores !== undefined ? { cores } : {}) }
  const loadAtStart = sampleLoad(load)
  const before = { ...observe(root), at: startedAt, load: loadAtStart.load }
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
  const after = { ...observe(root), at: new Date().toISOString(), load: sampleLoad(load).load }
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
    beside: recorded(beside), besideAtEnd: recorded(besideAtEnd), waitedMs }
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
