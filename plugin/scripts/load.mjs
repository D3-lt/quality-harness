// load.mjs — the machine load a result ran under (ADR-075 T1, spec F-10).
//
// A gate that passed while the machine was saturated is not evidence either way: a timing
// test can fail for the load and a hang guard can pass by luck (the costly-runs skill; on
// 2026-09-29 this repository's gate ran at load 13 to 32 on 10 cores with nothing saying
// so). So every result says its load, sampled at its START and its END. Two samples say
// nothing about the time between them, and the line says it is an endpoint observation.
import os from 'node:os'

const defaultCores = () => (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length)

/**
 * sampleLoad is the 1-minute load average and the core count now. `load` is null where
 * the platform keeps no load average: Node reports `[0, 0, 0]` there (Windows), which is
 * not a quiet machine, and must not read as one (ADR-005). A negative or non-finite value,
 * or a sampler that throws, is null too, and so is a core count that is not a positive number.
 */
export function sampleLoad({ loadavg = os.loadavg, cores = defaultCores() } = {}) {
  let averages = null
  // A sampler that throws is a load nobody read, never a check that does not run or a record
  // that is not written (Codex review of 3.2.0).
  try { averages = loadavg() } catch {}
  const first = Array.isArray(averages) ? averages[0] : undefined
  const known = Number.isFinite(first) && first >= 0 && averages.some(value => value > 0)
  // Kept as read: rounding would put 4.001 on 4 cores at the count, and so not contended.
  return { load: known ? first : null, cores: Number.isFinite(cores) && cores > 0 ? cores : null }
}

// A load average is a finite number no lower than 0; anything else was not read.
const read = value => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** contention is true when either sample exceeds the core count, null when either could not be read, else false. */
export function contention(start, end, cores) {
  if (!read(start) || !read(end) || !(Number.isFinite(cores) && cores > 0)) return null
  return start > cores || end > cores
}

/** loadLine is the one sentence every result prints: both samples always, and what they mean. */
export function loadLine(start, end, cores) {
  // Two decimals, unless that would round a load above the core count down onto it.
  const shown = value => {
    if (!read(value)) return 'unread'
    const rounded = Math.round(value * 100) / 100
    return String(value > cores && rounded <= cores ? value : rounded)
  }
  const said = `load: ${shown(start)} at start, ${shown(end)} at end, on ${cores ?? 'an unread number of'} cores (an endpoint observation)`
  const contended = contention(start, end, cores)
  if (contended === null) return `${said}; could not read the load`
  if (contended) return `${said}; unattributable: load ${shown(Math.max(start, end))} on ${cores} cores`
  return said
}
