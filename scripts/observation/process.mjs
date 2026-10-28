// Repository-only cost observation. Root wait usage and nested process rows are separate evidence.
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sink from './sink.cjs'

const preload = fileURLToPath(new URL('./node-preload.cjs', import.meta.url))
const waiter = fileURLToPath(new URL('./wait.py', import.meta.url))
const preloadOption = `--require=${JSON.stringify(preload)}`
const unknownResources = () => ({ userCpuMs: null, systemCpuMs: null, peakMemoryBytes: null, cpuScope: 'unknown', coverage: 'unknown' })
function disabledEnvironment(env) {
  const copy = { ...env }
  for (const key of ['QUALITY_HARNESS_TRACE_FILE', 'QUALITY_HARNESS_TRACE_UNTIL', 'QUALITY_HARNESS_TRACE_TRIAL', 'QUALITY_HARNESS_TRACE_PARENT', 'QUALITY_HARNESS_OBSERVATION_ROOT']) delete copy[key]
  if (copy.NODE_OPTIONS?.includes(preloadOption)) copy.NODE_OPTIONS = copy.NODE_OPTIONS.replaceAll(preloadOption, '').trim()
  return copy
}

export function observationEnvironment({ env = process.env, cwd = process.cwd(), traceFile, trial = 'trial', until = Date.now() + 15 * 60_000 }) {
  const copy = { ...env, QUALITY_HARNESS_TRACE_FILE: traceFile, QUALITY_HARNESS_TRACE_UNTIL: String(until),
    QUALITY_HARNESS_TRACE_TRIAL: trial, QUALITY_HARNESS_OBSERVATION_ROOT: path.resolve(sink.normal(cwd)) }
  if (!sink.target(copy, sink.protectedCwd(cwd, copy))) return disabledEnvironment(env)
  copy.NODE_OPTIONS = [copy.NODE_OPTIONS, preloadOption].filter(Boolean).join(' ')
  return copy
}

export function summariseProcesses(rows) {
  const spans = new Map()
  for (const row of rows) {
    if (!row || !['quality-harness-process-trace-v1', 'quality-harness-node-process-trace-v1'].includes(row.schema) || typeof row.invocation !== 'string') continue
    if (!spans.has(row.invocation)) spans.set(row.invocation, [])
    spans.get(row.invocation).push(row)
  }
  // A shell passes the environment to a different PID. Only merge a self-image
  // receipt with its launcher when PID/PPID proves that image actually belongs to it.
  for (const [id, group] of [...spans]) {
    if (!group.every(row => row.phase === 'self-start' || row.phase === 'self-end')) continue
    const image = group[0]
    const parent = spans.get(image.parent)
    if (!parent) continue
    const sameImage = parent.some(row => row.phase === 'exec-attempt' && row.pid === image.pid)
    const directChild = parent.some(row => row.childPid === image.pid
      || row.phase === 'started' && row.childPid === null && row.pid === image.ppid && row.program === image.program)
    if (sameImage || directChild) { parent.push(...group); spans.delete(id) }
  }
  let attempts = 0, starts = 0, completed = 0, incomplete = 0, execReplacements = 0
  const reasons = new Set()
  for (const group of spans.values()) {
    const has = phase => group.some(row => row.phase === phase)
    if (has('exec-attempt')) {
      if (has('self-start') || has('self-end')) execReplacements++
      else if (!has('exec-error')) reasons.add('exec-image-transition-has-no-terminal-observation')
      continue
    }
    const started = has('started') || has('self-start') || has('self-end')
    if (has('attempt') || started) attempts++
    if (started) {
      starts++
      if (has('ended') || has('self-end')) completed++
      else { incomplete++; reasons.add('started-process-has-no-terminal-observation') }
    } else if (has('attempt') && !has('ended')) { incomplete++; reasons.add('attempt-has-no-result-observation') }
  }
  if (spans.size) reasons.add('shell-and-uninstrumented-descendants-are-outside-process-coverage')
  else reasons.add('no-process-observations')
  return { attempts, starts, completed, incomplete, execReplacements, coverage: spans.size ? 'partial' : 'unknown', reasons: [...reasons] }
}

function protectedInput(input, args) {
  const paths = args.filter(arg => typeof arg === 'string' && path.isAbsolute(sink.normal(arg)))
  try {
    const pending = [JSON.parse(input)]
    for (let i = 0; i < pending.length && i < 1000; i++) {
      const value = pending[i]
      if (typeof value === 'string' && path.isAbsolute(sink.normal(value))) paths.push(value)
      else if (value && typeof value === 'object') pending.push(...Object.values(value))
    }
  } catch { /* stdin may be ordinary text */ }
  return paths
}

export function runMeasured({ file, args = [], cwd = process.cwd(), env = process.env, input = '', timeoutMs = 30_000, traceFile, trial = 'trial', observe = true }) {
  const protectedPaths = [...sink.protectedCwd(cwd, env), ...protectedInput(input, args)]
  let childEnv = observe ? observationEnvironment({ env, cwd, traceFile, trial }) : disabledEnvironment(env)
  if (!sink.target(childEnv, protectedPaths)) childEnv = disabledEnvironment(childEnv)
  let root = null
  let offset = 0
  if (sink.config(childEnv)) { try { offset = lstatSync(traceFile).size } catch { /* new sink */ } }
  if (observe && sink.config(childEnv)) {
    try {
      root = sink.row(file, args, cwd, childEnv)
      if (!sink.append(root, childEnv, protectedPaths)) root = null
      else childEnv.QUALITY_HARNESS_TRACE_PARENT = root.invocation
    } catch { root = null; childEnv = disabledEnvironment(childEnv) }
  }
  const start = performance.now()
  let result = null
  if (process.platform !== 'win32') {
    const measured = spawnSync('python3', [waiter], { encoding: 'utf8', input: JSON.stringify({ file, args, cwd, env: childEnv, input, timeoutMs }),
      timeout: timeoutMs + 5000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
    if (measured.error?.code !== 'ENOENT') {
      try { if (!measured.error && measured.status === 0) result = JSON.parse(measured.stdout) } catch { /* invalid IPC is unknown */ }
      if (!result) result = { status: null, signal: measured.signal ?? null, timedOut: measured.error?.code === 'ETIMEDOUT',
        error: measured.error?.code ?? 'OBSERVER_ERROR', stdout: '', stderr: '', resources: unknownResources() }
    }
  }
  if (!result) {
    const bare = spawnSync(file, args, { cwd, env: childEnv, input, encoding: 'utf8', timeout: timeoutMs,
      killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
    result = { status: bare.status, signal: bare.signal, timedOut: bare.error?.code === 'ETIMEDOUT', error: bare.error?.code ?? null,
      stdout: bare.stdout ?? '', stderr: bare.stderr ?? '', pid: bare.pid, resources: unknownResources() }
  }
  const wallMs = performance.now() - start
  if (root) {
    if (result.pid > 0) sink.append({ ...root, phase: 'started', at: result.startedAt ?? Date.now(), childPid: result.pid, outcome: 'started' }, childEnv, protectedPaths)
    sink.append({ ...root, phase: 'ended', at: result.endedAt ?? Date.now(), childPid: result.pid > 0 ? result.pid : null,
      status: result.status, timedOut: result.timedOut, outcome: result.timedOut ? 'timeout' : result.error ? 'start-error' : 'completed' }, childEnv, protectedPaths)
  }
  let rows = []
  if (root) {
    try {
      rows = readFileSync(traceFile).subarray(offset).toString('utf8').split('\n').filter(Boolean).flatMap(line => {
        try { const row = JSON.parse(line); return (row.trial === trial || row.schema === 'quality-harness-hook-trace-v1') ? [row] : [] } catch { return [] }
      })
    } catch { /* sink unavailable */ }
  }
  return { status: result.status ?? null, signal: result.signal ?? null, timedOut: result.timedOut === true, error: result.error ?? null,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '', wallMs, resources: result.resources ?? unknownResources(), processes: summariseProcesses(rows), rows }
}
