// Preloaded (`node --require`) into a hook program by scripts/hook-cost.mjs (ADR-095 T1). It appends one JSON line to the file
// named by HOOK_COST_OUT for every child process the program starts and every file it reads, and changes nothing else about the
// program: the calls are forwarded as they were made. A line is written when the call returns, so a program that is killed keeps
// every line up to the one it died in.
'use strict'
const childProcess = require('node:child_process')
const fs = require('node:fs')

const out = process.env.HOOK_COST_OUT
if (out) {
  const append = fs.appendFileSync.bind(fs)
  const note = row => { try { append(out, `${JSON.stringify(row)}\n`) } catch { /* the program is measured, never failed, by its measurement */ } }
  const text = (file, args) => [file, ...(Array.isArray(args) ? args : [])].join(' ').slice(0, 600)
  const where = (args, fallback) => {
    const options = args.find(arg => arg && typeof arg === 'object' && !Array.isArray(arg))
    return String(options?.cwd ?? fallback)
  }
  const ms = start => Number(process.hrtime.bigint() - start) / 1e6

  for (const name of ['spawnSync', 'execFileSync']) {
    const original = childProcess[name]
    childProcess[name] = function (file, ...rest) {
      const start = process.hrtime.bigint()
      try { return original.call(this, file, ...rest) } finally { note({ kind: name, cmd: text(file, rest[0]), cwd: where(rest, process.cwd()), ms: ms(start) }) }
    }
  }
  const execSync = childProcess.execSync
  childProcess.execSync = function (command, ...rest) {
    const start = process.hrtime.bigint()
    try { return execSync.call(this, command, ...rest) } finally { note({ kind: 'execSync', cmd: String(command).slice(0, 600), cwd: where(rest, process.cwd()), ms: ms(start) }) }
  }
  const spawn = childProcess.spawn
  childProcess.spawn = function (file, ...rest) {
    const start = process.hrtime.bigint()
    const child = spawn.call(this, file, ...rest)
    child.once('close', () => note({ kind: 'spawn', cmd: text(file, rest[0]), cwd: where(rest, process.cwd()), ms: ms(start) }))
    return child
  }
  const readFileSync = fs.readFileSync
  fs.readFileSync = function (...args) {
    const data = readFileSync.apply(this, args)
    note({ kind: 'read', bytes: data.length })
    return data
  }
}
