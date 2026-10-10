// Starts the project's check as a child process and runs it to its end: its own process group on POSIX, SIGINT and SIGTERM
// forwarded to it, a bound on how long it may run. Moved out of qh-check.mjs unchanged (BACKLOG section 376): this is the
// only part of `qh-check` that starts the check. What it was told to run, and what is recorded of it, are the caller's.
import { spawn, spawnSync } from 'node:child_process'

// A check that never returns would hold the session's Bash call for ever; past
// this bound its process group gets SIGTERM and the record says so.
const CHECK_TIMEOUT_SECONDS = 3_600

export function checkTimeoutMs(env) {
  const seconds = Number(env.QUALITY_HARNESS_CHECK_TIMEOUT)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : CHECK_TIMEOUT_SECONDS) * 1_000
}


// How long a check took, said (also by the lease and the record).
export const inSeconds = ms => `${(ms / 1000).toFixed(1)}s`
// Windows has no process groups. Killing the shell that started the check leaves the check itself running with the pipes open,
// so the run would wait for it to end by itself; `taskkill /T` takes the whole tree. True when it did.
export function killTree(pid, run = spawnSync) {
  const killed = run('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 10_000, windowsHide: true })
  return !killed.error && killed.status === 0
}

// Runs a launched check to its end, forwarding SIGINT/SIGTERM and enforcing the
// timeout. `received` is the signal this process forwarded, if any.
export async function runLaunched({ file, args, shell }, { root, env, platform, timeoutMs, stdout, stderr, keep }) {
  // Its own process group on POSIX, so a forwarded signal reaches the whole check,
  // not only the shell that started it.
  const group = platform !== 'win32'
  // No `timeout` option here: node would end the shell itself at the bound, a moment before the timer below, and on Windows a
  // tree whose root has gone cannot be found to be taken.
  // untimed-spawn: bounded by the timer below, which takes the whole tree at the bound (and is the one bound)
  const child = spawn(file, args, { cwd: root, shell, env, stdio: ['ignore', 'pipe', 'pipe'], detached: group, windowsHide: true })
  let received = null
  const forward = signal => {
    received = signal
    try { if (group) process.kill(-child.pid, signal); else if (!killTree(child.pid)) child.kill(signal) } catch { /* already gone */ }
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
