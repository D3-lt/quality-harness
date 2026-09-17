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
import { pathToFileURL } from 'node:url'
import { checkCommandOrigin, observe, stateDir, validationVerdict } from './lifecycle.mjs'

const KEEP_BYTES = 64 * 1024
// A check that never returns would hold the session's Bash call for ever; past
// this bound its process group gets SIGTERM and the record says so.
const CHECK_TIMEOUT_SECONDS = 3_600

function checkTimeoutMs(env) {
  const seconds = Number(env.QUALITY_HARNESS_CHECK_TIMEOUT)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : CHECK_TIMEOUT_SECONDS) * 1_000
}

export async function runCheck({ cwd = process.cwd(), env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const top = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5_000 })
  const git = !top.error && top.status === 0 && top.stdout.trim() !== ''
  const root = git ? top.stdout.trim() : realpathSync(cwd)
  const { command, origin } = checkCommandOrigin(root)
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
  // Its own process group on POSIX, so a forwarded signal reaches the whole check,
  // not only the shell that started it.
  const group = process.platform !== 'win32'
  const timeoutMs = checkTimeoutMs(env)
  const child = spawn(command, { cwd: root, shell: true, env, stdio: ['ignore', 'pipe', 'pipe'], detached: group, timeout: timeoutMs })
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  if (argv.length) {
    process.stderr.write(`qh-check: unknown option: ${argv[0]}\nusage: qh-check\n`)
    process.exitCode = 2
  } else {
    process.exitCode = await runCheck()
  }
}
