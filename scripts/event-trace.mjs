// event-trace records explicitly requested hook runs and analyses their observations.
// Nothing imports this module from the installed hook path.
import { appendFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { runWithTimeout } from '../plugin/scripts/run-shell-hook.mjs'

const SCHEMA = 'quality-harness-hook-trace-v1'

/** recordInvocation runs one explicitly named command and records metadata, never payload content. */
export async function recordInvocation({ traceFile, handlerId, command, args, raw, timeoutMs }, run = runWithTimeout) {
  let input
  try { input = JSON.parse(raw) } catch { input = {} }
  const string = value => typeof value === 'string' ? value : null
  const invocation = randomUUID()
  const start = {
    schema: SCHEMA, phase: 'start', invocation, handler: handlerId, at: Date.now(),
    event: string(input?.hook_event_name), session: string(input?.session_id),
    tool: string(input?.tool_name), toolUseId: string(input?.tool_use_id),
    inputHash: createHash('sha256').update(raw).digest('hex'),
  }
  // Refuse before running when recording is unavailable: an unrecorded probe is misleading.
  appendFileSync(traceFile, JSON.stringify(start) + '\n', { mode: 0o600 })
  const began = performance.now()
  const result = await run(command, args, { input: raw, timeoutMs, maxOutputBytes: 4 * 1024 * 1024 })
  const end = {
    schema: SCHEMA, phase: 'end', invocation, handler: handlerId, at: Date.now(),
    // libuv can report a negative close status when no process was launched.
    durationMs: performance.now() - began, status: Number.isInteger(result.status) && result.status >= 0 ? result.status : null,
    timedOut: result.timedOut, outputLimitExceeded: result.outputLimitExceeded,
    cleanupConfirmed: result.cleanupConfirmed, error: result.error?.code ?? null,
  }
  try { appendFileSync(traceFile, JSON.stringify(end) + '\n', { mode: 0o600 }) }
  catch (error) {
    // Preserve the child's output even when the log destination disappears mid-run.
    return { ...result, traceError: error.code ?? 'trace-write-failed' }
  }
  return result
}

/** analyzeTrace counts observed invocations; missing observations never establish disuse. */
export function analyzeTrace(text, registrations = []) {
  const starts = new Map()
  const ends = new Map()
  const problems = []
  let ignoredDuplicates = 0
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    let row
    try { row = JSON.parse(line) } catch {
      problems.push('Line ' + (index + 1) + ': invalid JSON')
      continue
    }
    if (row?.schema !== SCHEMA || !['start', 'end'].includes(row.phase)
        || typeof row.invocation !== 'string' || !row.invocation
        || typeof row.handler !== 'string' || !row.handler
        || !Number.isFinite(row.at)
        || (row.phase === 'start' && (!/^[a-f0-9]{64}$/.test(row.inputHash ?? '')
          || ['event', 'session', 'tool', 'toolUseId'].some(key => row[key] !== null && typeof row[key] !== 'string')))
        || (row.phase === 'end' && (!Number.isFinite(row.durationMs) || row.durationMs < 0
          || (row.status !== null && (!Number.isInteger(row.status) || row.status < 0))
          || typeof row.timedOut !== 'boolean' || typeof row.outputLimitExceeded !== 'boolean'
          || ![null, true, false].includes(row.cleanupConfirmed)
          || (row.error !== null && typeof row.error !== 'string')
          || (row.outcome !== undefined && (typeof row.outcome !== 'string'
            || !/^[a-z][a-z-]{0,47}$/.test(row.outcome)))))) {
      problems.push('Line ' + (index + 1) + ': unsupported or malformed observation')
      continue
    }
    const rows = row.phase === 'start' ? starts : ends
    const previous = rows.get(row.invocation)
    if (previous) {
      if (JSON.stringify(previous) === JSON.stringify(row)) ignoredDuplicates++
      else problems.push('Line ' + (index + 1) + ': conflicting ' + row.phase + ' for ' + row.invocation)
      continue
    }
    rows.set(row.invocation, row)
  }
  const groups = new Map()
  const repeats = new Map()
  const intervals = []
  for (const start of starts.values()) {
    let end = ends.get(start.invocation)
    if (end && (end.handler !== start.handler || end.at < start.at)) {
      problems.push('Mismatched end for ' + start.invocation)
      end = null
    }
    if (!groups.has(start.handler)) groups.set(start.handler, {
      handler: start.handler, invocations: 0, completed: 0, unfinished: 0,
      failures: 0, timeouts: 0, outputLimits: 0, cleanupUnconfirmed: 0, durations: [], intervals: [],
    })
    const group = groups.get(start.handler)
    group.invocations++
    if (end) {
      group.completed++
      if (end.outcome !== undefined) {
        group.outcomes ??= Object.create(null)
        group.outcomes[end.outcome] = (group.outcomes[end.outcome] ?? 0) + 1
      }
      group.durations.push(end.durationMs)
      if (end.status !== 0 || end.error) group.failures++
      if (end.timedOut) group.timeouts++
      if (end.outputLimitExceeded) group.outputLimits++
      if (end.cleanupConfirmed === false) group.cleanupUnconfirmed++
      group.intervals.push([start.at, end.at])
      intervals.push([start.at, end.at])
    } else group.unfinished++
    // A matching session and input digest is evidence of repeat input, not a bug verdict.
    if (typeof start.session === 'string' && start.session && typeof start.inputHash === 'string') {
      const key = JSON.stringify([start.handler, start.session, start.event, start.toolUseId, start.inputHash])
      if (!repeats.has(key)) repeats.set(key, { handler: start.handler, event: start.event, count: 0 })
      repeats.get(key).count++
    }
  }
  for (const invocation of ends.keys()) {
    if (!starts.has(invocation)) problems.push('End without start: ' + invocation)
  }
  const peak = spans => {
    const points = spans.filter(([a, b]) => b > a).flatMap(([a, b]) => [[a, 1], [b, -1]])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let active = 0
    let maximum = 0
    for (const [, change] of points) { active += change; maximum = Math.max(maximum, active) }
    return maximum
  }
  const handlers = [...groups.values()].map(({ durations, intervals: spans, ...group }) => {
    durations.sort((a, b) => a - b)
    return {
      ...group, totalMs: durations.reduce((a, b) => a + b, 0),
      p95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
      maxConcurrent: peak(spans),
    }
  }).sort((a, b) => b.totalMs - a.totalMs || a.handler.localeCompare(b.handler))
  return {
    observed: starts.size, ignoredDuplicates, handlers,
    repeatedInputs: [...repeats.values()].filter(row => row.count > 1),
    maxConcurrent: peak(intervals),
    notObserved: registrations.filter(row => !groups.has(row.id)).map(row => row.id),
    problems,
    limitation: 'Only recorded runs are observed. Incomplete intervals are excluded from timing and concurrency; not observed does not mean unused. Repeat input can be legitimate.',
  }
}
