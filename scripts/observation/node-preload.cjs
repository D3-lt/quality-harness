// Opt-in repository measurement preload; never installed in a user's hook registry.
'use strict'
const cp = require('node:child_process')
const { errorMonitor } = require('node:events')
const { syncBuiltinESMExports } = require('node:module')
const { randomUUID } = require('node:crypto')
const path = require('node:path')
const sink = require('./sink.cjs')
const NODE_SCHEMA = 'quality-harness-node-process-trace-v1'
const preloadOption = `--require=${JSON.stringify(__filename)}`

if (sink.config(process.env)) {
  const cwd = () => process.cwd()
  const protections = (directory, args = []) => [...sink.protectedCwd(directory, process.env),
    ...args.filter(arg => typeof arg === 'string' && path.isAbsolute(sink.normal(arg)))]
  let self = null
  try {
    self = sink.row(process.execPath, process.argv.slice(1), cwd(), process.env, randomUUID())
    self.schema = NODE_SCHEMA
    self.childPid = process.pid
    if (!sink.append({ ...self, phase: 'self-start', outcome: 'image-started' }, process.env, protections(cwd(), process.argv.slice(1)))) self = null
  } catch { /* unavailable self observation */ }
  if (self) process.once('exit', status => {
    try {
      const cpu = process.cpuUsage(), usage = process.resourceUsage()
      sink.append({ ...self, phase: 'self-end', at: Date.now(), status, outcome: 'image-exited',
        userCpuNs: cpu.user * 1000, systemCpuNs: cpu.system * 1000, cpuScope: 'process', peakMemoryBytes: usage.maxRSS * 1024 }, process.env, protections(cwd(), process.argv.slice(1)))
    } catch { /* exiting program owns its streams and status */ }
  })

  function childEnvironment(options, invocation) {
    if (options.env && typeof options.env !== 'object') return null
    const env = { ...(options.env ?? process.env) }
    // An explicit empty/invalid trace setting is a child's opt-out. An omitted
    // setting inherits only observer metadata, preserving its otherwise exact env.
    if (Object.hasOwn(env, 'QUALITY_HARNESS_TRACE_FILE') && !env.QUALITY_HARNESS_TRACE_FILE) return env
    for (const key of ['QUALITY_HARNESS_TRACE_FILE', 'QUALITY_HARNESS_TRACE_UNTIL', 'QUALITY_HARNESS_TRACE_TRIAL', 'QUALITY_HARNESS_OBSERVATION_ROOT']) {
      if (!Object.hasOwn(env, key) && process.env[key] !== undefined) env[key] = process.env[key]
    }
    if (!sink.config(env)) return env
    env.QUALITY_HARNESS_TRACE_PARENT = invocation
    if (!env.NODE_OPTIONS?.includes(preloadOption)) env.NODE_OPTIONS = [env.NODE_OPTIONS, preloadOption].filter(Boolean).join(' ')
    return env
  }
  function prepare(name, file, rest) {
    const array = Array.isArray(rest[0]) ? rest[0] : []
    let index = rest.findIndex(value => value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value))
    if (index < 0) index = Array.isArray(rest[0]) ? 1 : 0
    const existing = rest[index]
    if (existing !== undefined && typeof existing !== 'function' && (!existing || typeof existing !== 'object' || Array.isArray(existing))) return null
    const options = existing && typeof existing === 'object' ? existing : {}
    const directory = options.cwd instanceof URL ? require('node:url').fileURLToPath(options.cwd) : options.cwd || cwd()
    let program = file, args = array
    if (name === 'exec' || name === 'execSync') { program = options.shell || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'); args = [file] }
    if (name === 'fork') { program = options.execPath || process.execPath; args = [file, ...array] }
    const row = sink.row(program, args, directory, process.env)
    row.schema = NODE_SCHEMA
    row.parent = self?.invocation ?? row.parent
    const protectedPaths = protections(directory, args)
    if (!sink.append(row, process.env, protectedPaths)) return null
    const env = childEnvironment(options, row.invocation)
    if (env === null) return null
    const changed = [...rest]
    if (typeof existing === 'function') changed.splice(index, 0, { ...options, env })
    else changed[index] = { ...options, env }
    return { row, rest: changed, protectedPaths }
  }
  let depth = 0
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']) {
    const original = cp[name]
    cp[name] = function (file, ...rest) {
      if (depth || !sink.config(process.env)) return original.call(this, file, ...rest)
      let span
      try { span = prepare(name, file, rest) } catch { /* invalid call remains the original API's responsibility */ }
      if (!span) return original.call(this, file, ...rest)
      let started = false, ended = false
      const note = extra => sink.append({ ...span.row, at: Date.now(), ...extra }, process.env, span.protectedPaths)
      const start = pid => {
        if (started) return
        started = true
        if (Number.isInteger(pid) && pid > 0) span.row.childPid = pid
        note({ phase: 'started', outcome: 'started' })
      }
      const end = (status, signal, error) => {
        if (ended) return
        ended = true
        note({ phase: 'ended', status: Number.isInteger(status) && status >= 0 ? status : null,
          timedOut: error?.code === 'ETIMEDOUT', outcome: error ? started ? 'execution-error' : 'start-error' : signal ? 'signalled' : 'completed' })
      }
      let result
      depth++
      try { result = original.call(this, file, ...span.rest) } catch (error) {
        if (Number.isInteger(error.status) && error.status >= 0 || error.signal) start(error.pid)
        end(error.status, error.signal, error)
        throw error
      } finally { depth-- }
      if (name.endsWith('Sync')) {
        if (name === 'spawnSync') {
          if (result.pid > 0) start(result.pid)
          end(result.status, result.signal, result.error)
        } else { start(null); end(0, null, null) }
      } else {
        result.once('spawn', () => start(result.pid))
        result.once(errorMonitor, error => end(null, null, error))
        result.once('close', (status, signal) => end(status, signal, null))
        const unref = result.unref
        result.unref = function (...args) {
          const value = unref.apply(this, args)
          note({ phase: 'released', childPid: this.pid ?? null, outcome: 'unref-unobserved' })
          return value
        }
      }
      return result
    }
  }
  if (typeof process.execve === 'function') {
    const original = process.execve
    process.execve = function (file, args, env) {
      let row, next = env
      try {
        row = sink.row(file, Array.isArray(args) ? args.slice(1) : [], cwd(), process.env)
        row.schema = NODE_SCHEMA
        row.parent = self?.invocation ?? row.parent
        if (!sink.append({ ...row, phase: 'exec-attempt' }, process.env, protections(cwd(), args))) row = null
        if (row) next = childEnvironment({ env }, row.invocation)
      } catch { row = null }
      try { return original.call(this, file, args, next) } catch (error) {
        if (row) sink.append({ ...row, phase: 'exec-error', at: Date.now(), outcome: 'exec-error' }, process.env, protections(cwd(), args))
        throw error
      }
    }
  }
  // ESM named imports otherwise retain the original built-in functions.
  syncBuiltinESMExports()
}
