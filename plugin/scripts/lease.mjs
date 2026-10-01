// lease.mjs — a heavy run's lease, and what it can see of the others (ADR-077).
//
// A run that burns the machine publishes a small file naming itself, and reads every other run's
// before and after its work: that is how a check run beside a campaign can say so, and how a run
// asked to wait can take its turn. Every answer about another process is one of three — alive,
// dead, unknown — and an unknown is never read as a dead one (ADR-005): its lease is kept, named,
// and removed only once it is a day old.
import { randomBytes } from 'node:crypto'
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DAY_MS = 24 * 60 * 60 * 1000

/** leaseDir is where leases live: `$QUALITY_HARNESS_LEASE_DIR`, else one under the OS temp directory. */
export const leaseDir = (env = process.env) => env.QUALITY_HARNESS_LEASE_DIR || path.join(os.tmpdir(), 'quality-harness-leases')

// How long a run asked to wait its turn waits before it runs anyway. Unset or invalid is the
// default: a bound nobody can switch off.
const WAIT_MAX_SECONDS = 1_800
/** waitMaxMs is that bound, from `$QUALITY_HARNESS_WAIT_MAX_S`, in milliseconds. */
export function waitMaxMs(env = process.env) {
  // Checked after the conversion: `1e308` seconds is finite, and Infinity milliseconds is no bound
  // (Codex review of the 3.3.0 candidate).
  const ms = Number(env.QUALITY_HARNESS_WAIT_MAX_S) * 1_000
  return Number.isFinite(ms) && ms > 0 ? ms : WAIT_MAX_SECONDS * 1_000
}

/**
 * alive answers for one pid: 'alive', 'dead' or 'unknown'. ESRCH is the only proof of an end;
 * EPERM is a live process this user cannot signal; anything else could not be told.
 */
export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return 'unknown'
  return probe(() => process.kill(pid, 0))
}

/** groupAlive answers for a POSIX process group by the same three answers; Windows has none. */
export function groupAlive(group, platform = process.platform) {
  if (platform === 'win32' || !Number.isInteger(group) || group <= 0) return 'unknown'
  return probe(() => process.kill(-group, 0))
}

function probe(ask) {
  try {
    ask()
    return 'alive'
  } catch (error) {
    if (error.code === 'ESRCH') return 'dead'
    if (error.code === 'EPERM') return 'alive'
    return 'unknown'
  }
}

// Written to a temporary name and renamed, so no reader ever sees half a lease. The temporary
// name does not end in `.json`, so a reader never takes it for one, and it is created exclusively,
// so nothing already at that name is written through.
function publish(file, lease) {
  const temp = `${file}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(temp, JSON.stringify(lease), { flag: 'wx', mode: 0o600 })
  renameSync(temp, file)
}

// The lease directory is trusted only as a directory of this user's that no one else can write:
// on a shared /tmp another user could make the default first — a symlink to a directory the victim
// can write, or a directory of their own — and a run would publish, and delete, there (Codex review
// of the 3.3.0 candidate). Only the leaf is checked; a symlinked parent such as macOS's /var is the
// system's. The answer is a reason to refuse, or null.
function untrusted(dir, platform = process.platform) {
  // `made`: whether this call created the directory, the only case in which its run removes it.
  const made = mkdirSync(dir, { recursive: true, mode: 0o700 }) !== undefined
  const found = lstatSync(dir)
  if (found.isSymbolicLink()) return { refused: `${dir} is a symlink`, made }
  if (!found.isDirectory()) return { refused: `${dir} is not a directory`, made }
  if (platform !== 'win32' && typeof process.getuid === 'function') {
    if (found.uid !== process.getuid()) return { refused: `${dir} belongs to another user`, made }
    if (found.mode & 0o022) return { refused: `${dir} can be written by other users`, made }
  }
  return { refused: null, made }
}

/**
 * take publishes this run's lease in `dir`: `{ file, lease }`, or `{ error }` when the directory
 * cannot be used, which the caller says and then runs without one.
 */
export function take(dir, { command, root, state = 'running' } = {}) {
  // Twice at most: a run releasing the last lease removes an empty directory it made (below), and
  // one taking a lease in that instant finds it gone between its mkdir and its write.
  for (let attempt = 1; ; attempt += 1) {
    try {
      const { refused, made } = untrusted(dir)
      if (refused) return { error: refused }
      const start = new Date()
      const file = path.join(dir, `${process.pid}-${start.getTime()}-${randomBytes(3).toString('hex')}.json`)
      // The root as this platform spells it: git prints `C:/…` on Windows, and a reader compares
      // it with the native path (Windows CI, 3.3.0 candidate).
      const lease = { pid: process.pid, command, root: typeof root === 'string' ? path.resolve(root) : root, start: start.toISOString(), state }
      publish(file, lease)
      return { file, lease, made }
    } catch (error) {
      if (error.code === 'ENOENT' && attempt < 2) continue
      return { error: error.code ? `${error.code} on ${dir}` : error.message }
    }
  }
}

/** mark changes this run's own lease: its state, or the child and group a campaign starts. */
export function mark(held, changes) {
  Object.assign(held.lease, changes)
  publish(held.file, held.lease)
}

/** release removes this run's own lease, and nothing else. */
export function release(held) {
  rmSync(held.file, { force: true })
  // A directory this run made goes with its last lease, so a run leaves nothing in the temp
  // directory (ADR-075's promise, which ADR-077 broke under a test that set TMPDIR). rmdir refuses
  // a directory that is not empty, so another run's lease, or the admission lock, keeps it; and a
  // directory the caller named, or one another run made, is never this run's to remove.
  if (held.made) {
    try { rmdirSync(path.dirname(held.file)) } catch { /* not empty */ }
  }
}

/** Whether a lease's processes live: alive when any does, dead only when every one is proven ended. */
function liveness(lease, platform) {
  const answers = [lease.pid, lease.child].filter(pid => pid !== undefined).map(alive)
  if (lease.group !== undefined) answers.push(groupAlive(lease.group, platform))
  if (!answers.length) return 'unknown'
  if (answers.includes('alive')) return 'alive'
  return answers.includes('unknown') ? 'unknown' : 'dead'
}

/**
 * observe reads every lease in `dir` but `self`'s. A lease whose processes have all ended is
 * removed. One that cannot be read, or whose probe answers unknown, is reported as unknown and
 * kept, unless it is over a day old. Returns `{ live, unknown }`; an unreadable directory throws,
 * for the caller to say.
 */
export function observe(dir, self, { now = Date.now(), platform = process.platform } = {}) {
  const live = []
  const unknown = []
  for (const name of readdirSync(dir).filter(entry => entry.endsWith('.json')).sort()) {
    const file = path.join(dir, name)
    if (self && file === self.file) continue
    let lease = null
    try { lease = JSON.parse(readFileSync(file, 'utf8')) } catch { lease = null }
    const state = lease && typeof lease === 'object' ? liveness(lease, platform) : 'unreadable'
    if (state === 'dead') {
      rmSync(file, { force: true })
      continue
    }
    if (state === 'alive') {
      live.push({ file: name, pid: lease.pid, command: lease.command, root: lease.root, start: lease.start, state: lease.state ?? 'running' })
      continue
    }
    let age = 0
    try { age = now - statSync(file).mtimeMs } catch { age = 0 }
    if (age > DAY_MS) {
      rmSync(file, { force: true })
      continue
    }
    unknown.push({ file: name, pid: lease?.pid ?? null, command: lease?.command ?? null, unknown: true })
  }
  return { live, unknown }
}

/** The line a run prints for each neighbour it observed. */
export function besideLines(seen) {
  return [
    ...seen.live.map(other => `running beside ${other.command} (pid ${other.pid}, since ${other.start}, in ${other.root})`),
    ...seen.unknown.map(other => `running beside a lease it could not read as ended or live: unknown: ${other.file}`),
  ]
}

// A waiter's place in line: its start, then its pid, then its lease's name, a total order.
const ticket = (start, pid, file) => [Date.parse(start) || 0, pid ?? 0, file]
function before(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

/**
 * mayStart answers one observation: a waiting run may start when no other lease is running or
 * unknown, and no waiting one holds an earlier ticket.
 */
export function mayStart(dir, held) {
  const mine = ticket(held.lease.start, held.lease.pid, path.basename(held.file))
  const seen = observe(dir, held)
  const blocked = seen.unknown.length > 0 || seen.live.some(other => other.state !== 'waiting'
      || before(ticket(other.start, other.pid, other.file), mine))
  return !blocked
}

// One admission at a time: deciding that a run may start and saying so are one step, or two
// waiters deciding together each see the other still waiting and both start (Codex review of the
// 3.3.0 candidate). The lock is a directory, made atomically, with its holder's pid inside; a holder
// that died there, or one too old to be still deciding, is broken by the next caller, whose attempt
// then waits for the following poll.
const ADMISSION = '.admission'
const ADMISSION_STALE_MS = 30_000
function holdAdmission(dir) {
  const lock = path.join(dir, ADMISSION)
  try {
    mkdirSync(lock)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    let holder = null
    try { holder = Number(readFileSync(path.join(lock, 'pid'), 'utf8')) } catch { holder = null }
    let age = 0
    try { age = Date.now() - statSync(lock).mtimeMs } catch { age = 0 }
    if ((holder && alive(holder) === 'dead') || age > ADMISSION_STALE_MS) rmSync(lock, { recursive: true, force: true })
    return null
  }
  writeFileSync(path.join(lock, 'pid'), String(process.pid))
  return lock
}

/**
 * tryAdmit is one admission attempt: under the admission lock, when `mayStart` says so, it marks
 * this run's lease running and answers true. `beforeMark` is a test's seam into the one instant
 * where two waiters could otherwise both decide to start.
 */
export function tryAdmit(dir, held, { beforeMark } = {}) {
  const lock = holdAdmission(dir)
  if (!lock) return false
  try {
    if (!mayStart(dir, held)) return false
    beforeMark?.()
    mark(held, { state: 'running' })
    return true
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

/**
 * admit waits this run's turn, trying once a second until `maxMs`, and returns
 * `{ admitted, waitedMs, stopped }`; `stopped()` is asked each time, so a signal ends the wait. An
 * admitted lease is already marked running; one that stopped waiting is not.
 *
 * @public `qh-check.mjs` calls it as `lease.admit`, through a module seam it takes as a
 * parameter, which knip cannot follow (dead-code scan, 2026-10-01).
 */
export async function admit(dir, held, { maxMs, stopped = () => null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const began = Date.now()
  for (;;) {
    const signal = stopped()
    if (signal) return { admitted: false, waitedMs: Date.now() - began, stopped: signal }
    if (tryAdmit(dir, held)) return { admitted: true, waitedMs: Date.now() - began, stopped: null }
    const left = maxMs - (Date.now() - began)
    if (left <= 0) return { admitted: false, waitedMs: Date.now() - began, stopped: null }
    await sleep(Math.min(1000, left))
  }
}

/**
 * admitSync is `admit` for a caller with no event loop to wait on — a mutation campaign, whose run
 * is synchronous end to end. It sleeps with Atomics.wait and cannot notice a signal, so its caller
 * waits before it installs any handler: a signal sent while it waits then ends the process under
 * the default action, nothing has started, and the next observer removes the lease its pid left.
 */
export function admitSync(dir, held, { maxMs }) {
  const began = Date.now()
  const pause = new Int32Array(new SharedArrayBuffer(4))
  for (;;) {
    if (tryAdmit(dir, held)) return { admitted: true, waitedMs: Date.now() - began }
    const left = maxMs - (Date.now() - began)
    if (left <= 0) return { admitted: false, waitedMs: Date.now() - began }
    Atomics.wait(pause, 0, 0, Math.min(1000, left))
  }
}
