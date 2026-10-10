// Waiting for a turn on a machine other heavy runs share, and the lease that names them (ADR-077). Moved out of qh-check.mjs
// unchanged (BACKLOG section 376): the lease is advice about the machine and never a condition of the check, so a step of it
// that fails is said and the run goes on. It takes the lease before the load is sampled and hands back what the run needs.
import { inSeconds } from './check-child.mjs'

// ADR-077: waiting for a turn, taken before the load is sampled. Returns the held lease and what the run needs of it, or the
// exit of a run a signal stopped while it waited.
export async function takeTurn({ lease, env, wait, command, root, stderr }) {
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
