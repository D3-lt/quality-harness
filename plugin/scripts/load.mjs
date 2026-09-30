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
 * not a quiet machine, and must not read as one (ADR-005).
 */
export function sampleLoad({ loadavg = os.loadavg, cores = defaultCores() } = {}) {
  const averages = loadavg()
  const known = Array.isArray(averages) && Number.isFinite(averages[0]) && averages.some(value => value > 0)
  return { load: known ? Math.round(averages[0] * 100) / 100 : null, cores }
}

/** contention is true when either sample exceeds the core count, null when either could not be read, else false. */
export function contention(start, end, cores) {
  if (start == null || end == null || !(cores > 0)) return null
  return start > cores || end > cores
}

/** loadLine is the one sentence every result prints: both samples always, and what they mean. */
export function loadLine(start, end, cores) {
  const shown = value => (value == null ? 'unread' : String(value))
  const said = `load: ${shown(start)} at start, ${shown(end)} at end, on ${cores} cores (an endpoint observation)`
  const contended = contention(start, end, cores)
  if (contended === null) return `${said}; could not read the load`
  if (contended) return `${said}; unattributable: load ${Math.max(start, end)} on ${cores} cores`
  return said
}
