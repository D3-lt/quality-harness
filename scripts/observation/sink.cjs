// Repository-only process diagnostics. A failed observation never becomes program output.
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash, randomUUID } = require('node:crypto')
const LIMIT = 8 * 1024 * 1024
const normal = value => String(value).replaceAll('\\', '/')
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9._-]{0,128}$/.test(value)
const hash = value => createHash('sha256').update(value).digest('hex')
function config(env) {
  const file = normal(env.QUALITY_HARNESS_TRACE_FILE || '')
  const until = Number(env.QUALITY_HARNESS_TRACE_UNTIL)
  const now = Date.now()
  if (!file || !path.isAbsolute(file) || path.extname(file) !== '.jsonl' || !Number.isFinite(until)
    || until <= now || until - now > 15 * 60_000 || !opaque(env.QUALITY_HARNESS_TRACE_TRIAL || '')
    || !opaque(env.QUALITY_HARNESS_TRACE_PARENT || '')) return null
  return { file, until }
}
function probe(file) {
  try { return fs.lstatSync(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
function resolveGuard(file) {
  let absolute = path.resolve(normal(file))
  const missing = []
  for (;;) {
    try { return path.join(fs.realpathSync.native(absolute), ...missing) } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
      const parent = path.dirname(absolute)
      if (parent === absolute) throw error
      missing.unshift(path.basename(absolute))
      absolute = parent
    }
  }
}
function target(env, protectedPaths = []) {
  const selected = config(env)
  if (!selected) return null
  try {
    const parent = fs.realpathSync.native(path.dirname(selected.file))
    const file = path.join(parent, path.basename(selected.file))
    const stat = probe(file)
    if (stat && (!stat.isFile() || stat.nlink !== 1 || stat.size >= LIMIT)) return null
    for (const guard of [...protectedPaths, env.QUALITY_HARNESS_OBSERVATION_ROOT, env.CLAUDE_PLUGIN_ROOT, env.CLAUDE_PLUGIN_DATA].filter(Boolean)) {
      const relative = path.relative(resolveGuard(guard), file)
      if (!relative || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) return null
    }
    for (let directory = parent; ; directory = path.dirname(directory)) {
      if (probe(path.join(directory, '.git')) || probe(path.join(directory, 'HEAD')) && probe(path.join(directory, 'objects'))) return null
      if (path.dirname(directory) === directory) break
    }
    return file
  } catch { return null }
}
function append(row, env, protectedPaths = []) {
  const file = target(env, protectedPaths)
  if (!file) return false
  let fd
  try {
    const line = JSON.stringify(row) + '\n'
    if (Buffer.byteLength(line) > 2048) return false
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600)
    const actual = fs.fstatSync(fd), current = fs.lstatSync(file)
    if (!actual.isFile() || actual.nlink !== 1 || actual.size >= LIMIT || !current.isFile() || actual.dev !== current.dev || actual.ino !== current.ino) return false
    fs.writeSync(fd, line)
    return true
  } catch { return false } finally { if (fd !== undefined) { try { fs.closeSync(fd) } catch { /* observer only */ } } }
}
function protectedCwd(cwd, env) {
  const root = env.QUALITY_HARNESS_OBSERVATION_ROOT || cwd
  return [root, ...(path.resolve(cwd) === path.resolve(os.tmpdir()) ? [] : [cwd])]
}
function row(file, args, cwd, env, invocation = randomUUID()) {
  return {
    schema: 'quality-harness-process-trace-v1', phase: 'attempt', at: Date.now(),
    trial: env.QUALITY_HARNESS_TRACE_TRIAL || '', invocation, parent: env.QUALITY_HARNESS_TRACE_PARENT || null,
    pid: process.pid, ppid: process.ppid, childPid: null, program: path.basename(normal(file)),
    argsHash: hash(JSON.stringify(args)), cwdHash: hash(fs.realpathSync.native(path.resolve(normal(cwd)))) ,
    status: null, timedOut: false, outcome: 'attempted', userCpuNs: null, systemCpuNs: null,
    cpuScope: 'unknown', peakMemoryBytes: null, platform: process.platform,
  }
}
module.exports = { append, config, normal, opaque, protectedCwd, row, target }
