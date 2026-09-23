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
import { appendFileSync, mkdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'
import { checkCommandOrigin, observe, stateDir, validationVerdict } from './lifecycle.mjs'
import { resolveBashExecutable } from './run-shell-hook.mjs'

const KEEP_BYTES = 64 * 1024
// A check that never returns would hold the session's Bash call for ever; past
// this bound its process group gets SIGTERM and the record says so.
const CHECK_TIMEOUT_SECONDS = 3_600

function checkTimeoutMs(env) {
  const seconds = Number(env.QUALITY_HARNESS_CHECK_TIMEOUT)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : CHECK_TIMEOUT_SECONDS) * 1_000
}
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

// Runs a launched check to its end, forwarding SIGINT/SIGTERM and enforcing the
// timeout. `received` is the signal this process forwarded, if any.
async function runLaunched({ file, args, shell }, { root, env, platform, timeoutMs, stdout, stderr, keep }) {
  // Its own process group on POSIX, so a forwarded signal reaches the whole check,
  // not only the shell that started it.
  const group = platform !== 'win32'
  const child = spawn(file, args, { cwd: root, shell, env, stdio: ['ignore', 'pipe', 'pipe'], detached: group, timeout: timeoutMs })
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

export async function runCheck({ cwd = process.cwd(), env = process.env, platform = process.platform, stdout = process.stdout, stderr = process.stderr } = {}) {
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5_000 })
  const git = repositoryDiscovery(top)
  const root = git === true ? top.stdout.trim() : realpathSync(cwd)
  const { command, origin } = checkCommandOrigin(root)
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
  const startedAt = new Date().toISOString()
  const before = { ...observe(root), at: startedAt }
  let kept = Buffer.alloc(0)
  const keep = chunk => {
    kept = Buffer.concat([kept, chunk])
    if (kept.length > KEEP_BYTES) kept = kept.subarray(kept.length - KEEP_BYTES)
  }
  const launch = checkLaunch(command, platform, env)
  const { ended, received } = launch
    ? await runLaunched(launch, { root, env, platform, timeoutMs: checkTimeoutMs(env), stdout, stderr, keep })
    : { ended: { code: null, signal: null, error: new Error(NO_BASH) }, received: null }
  const after = { ...observe(root), at: new Date().toISOString() }
  const signal = received ?? ended.signal ?? null
  const exit = ended.error ? null : ended.code
  const verdict = ended.error
    ? 'unstarted'
    : validationVerdict({ exit_code: exit ?? 1, stdout: kept.toString('utf8') }, command, { anyCommand: true })
  const record = { id: randomUUID(), at: after.at, git, command, origin, before, after, exit, signal, verdict }
  try {
    const directory = stateDir(root)
    mkdirSync(directory, { recursive: true })
    appendFileSync(path.join(directory, 'checks.jsonl'), `${JSON.stringify(record)}\n`, 'utf8')
  } catch (failure) {
    stderr.write(`qh-check: the check ran, but its record could not be written (${failure.code ?? failure.message}).\n`)
  }
  if (ended.error) {
    stderr.write(`qh-check: the check could not start (${ended.error.code ?? ended.error.message}).\n`)
    return 127
  }
  return exit ?? 1
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv.length) {
    process.stderr.write(`qh-check: unknown option: ${argv[0]}\nusage: qh-check\n`)
    process.exitCode = 2
  } else {
    process.exitCode = await runCheck()
  }
}
