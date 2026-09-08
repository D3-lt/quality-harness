// Optional in-process timing records. No payloads or child output are persisted.
import { appendFileSync, lstatSync, realpathSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import path from 'node:path'

const LIMIT = 8 * 1024 * 1024
const noop = () => {}
function probe(file) {
  try { return lstatSync(file) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function traceTarget(file, protectedPaths) {
  if (path.extname(file) !== '.jsonl') return null
  const parent = realpathSync(path.dirname(file))
  const target = path.join(parent, path.basename(file))
  const stat = probe(target)
  if (stat && (!stat.isFile() || stat.nlink > 1 || stat.size >= LIMIT)) return null
  for (const protectedPath of protectedPaths.filter(Boolean)) {
    let guarded = path.resolve(protectedPath)
    try { guarded = realpathSync(guarded) } catch {}
    const relative = path.relative(guarded, target)
    if (!relative || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) return null
  }
  // Diagnostics may not dirty a checkout, Git metadata, or the artifact being gated.
  for (let directory = parent; ; directory = path.dirname(directory)) {
    if (probe(path.join(directory, '.git'))
        || (probe(path.join(directory, 'HEAD')) && probe(path.join(directory, 'objects')))) return null
    if (path.dirname(directory) === directory) break
  }
  return target
}


/**
 * startPerformanceTrace returns a one-shot finish function, or a no-op when off.
 * An explicit local file and short expiry are required. Diagnostic failures must
 * never reach stderr: a boundary treats that stream as artifact-gate evidence.
 */
export function startPerformanceTrace(handler, input = '', env = process.env, protectedPaths = []) {
  const file = env.QUALITY_HARNESS_TRACE_FILE
  const until = Number(env.QUALITY_HARNESS_TRACE_UNTIL)
  const now = Date.now()
  if (!file || !path.isAbsolute(file) || !Number.isFinite(until)
      || until <= now || until - now > 15 * 60_000) return noop
  try {
    const base = { schema: 'quality-harness-hook-trace-v1', handler: 'operation/' + handler,
      invocation: randomUUID() }
    const append = row => {
      try {
        if (Date.now() >= until) return false
        const target = traceTarget(file, protectedPaths)
        if (!target) return false
        const line = JSON.stringify({ ...base, ...row }) + '\n'
        if (Buffer.byteLength(line) > 2048) return false
        // A soft cap: simultaneous writers may each append their in-flight line.
        appendFileSync(target, line, { mode: 0o600 })
        return true
      } catch { return false }
    }
    const started = performance.now()
    if (!append({ phase: 'start', at: now,
      inputHash: createHash('sha256').update(input).digest('hex'),
      event: null, session: null, tool: null, toolUseId: null })) return noop
    let finished = false
    return (outcome, result = {}) => {
      if (finished) return
      finished = true
      append({ phase: 'end', at: Date.now(), durationMs: performance.now() - started,
        outcome, status: Number.isInteger(result.status) && result.status >= 0 ? result.status : null,
        timedOut: result.timedOut === true, outputLimitExceeded: result.outputLimitExceeded === true,
        cleanupConfirmed: typeof result.cleanupConfirmed === 'boolean' ? result.cleanupConfirmed : null,
        error: result.error ? 'execution-error' : null })
    }
  } catch { return noop }
}
