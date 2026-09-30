// lease.mjs — a heavy run's lease, and what it can see of the others (ADR-077).
//
// A run that burns the machine publishes a small file naming itself, and reads every other run's
// before and after its work: that is how a check run beside a campaign can say so, and how a run
// asked to wait can take its turn. Every answer about another process is one of three — alive,
// dead, unknown — and an unknown is never read as a dead one (ADR-005): its lease is kept, named,
// and removed only once it is a day old.
import { randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
  const seconds = Number(env.QUALITY_HARNESS_WAIT_MAX_S)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : WAIT_MAX_SECONDS) * 1_000
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
// name does not end in `.json`, so a reader never takes it for one.
function publish(file, lease) {
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(lease))
  renameSync(temp, file)
}

/**
 * take publishes this run's lease in `dir`: `{ file, lease }`, or `{ error }` when the directory
 * cannot be used, which the caller says and then runs without one.
 */
export function take(dir, { command, root, state = 'running' } = {}) {
  try {
    mkdirSync(dir, { recursive: true })
    const start = new Date()
    const file = path.join(dir, `${process.pid}-${start.getTime()}-${randomBytes(3).toString('hex')}.json`)
    const lease = { pid: process.pid, command, root, start: start.toISOString(), state }
    publish(file, lease)
    return { file, lease }
  } catch (error) {
    return { error: error.code ? `${error.code} on ${dir}` : error.message }
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
 * admit waits this run's turn: it may start when no other lease is running or unknown, and no
 * waiting one holds an earlier ticket. It observes once a second, until `maxMs`, and returns
 * `{ admitted, waitedMs, stopped }`; `stopped()` is asked each time, so a signal ends the wait.
 */
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

/**
 * admit waits this run's turn, observing once a second until `maxMs`, and returns
 * `{ admitted, waitedMs, stopped }`; `stopped()` is asked each time, so a signal ends the wait.
 */
export async function admit(dir, held, { maxMs, stopped = () => null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const began = Date.now()
  for (;;) {
    const signal = stopped()
    if (signal) return { admitted: false, waitedMs: Date.now() - began, stopped: signal }
    if (mayStart(dir, held)) return { admitted: true, waitedMs: Date.now() - began, stopped: null }
    const left = maxMs - (Date.now() - began)
    if (left <= 0) return { admitted: false, waitedMs: Date.now() - began, stopped: null }
    await sleep(Math.min(1000, left))
  }
}

/**
 * admitSync is `admit` for a caller with no event loop to wait on — a mutation campaign, whose run
 * is synchronous end to end. It sleeps with Atomics.wait, so it cannot notice a signal: one sent
 * while it waits ends the process, and the next observer removes the lease its pid left.
 */
export function admitSync(dir, held, { maxMs }) {
  const began = Date.now()
  const pause = new Int32Array(new SharedArrayBuffer(4))
  for (;;) {
    if (mayStart(dir, held)) return { admitted: true, waitedMs: Date.now() - began }
    const left = maxMs - (Date.now() - began)
    if (left <= 0) return { admitted: false, waitedMs: Date.now() - began }
    Atomics.wait(pause, 0, 0, Math.min(1000, left))
  }
}
