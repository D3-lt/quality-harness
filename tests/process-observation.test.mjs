import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, ftruncateSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { observationEnvironment, runMeasured, summariseProcesses } from '../scripts/observation/process.mjs'
import { remove } from './helpers/remove.mjs'

const python = process.platform !== 'win32' && spawnSync('python3', ['--version'], { timeout: 2000, windowsHide: true }).status === 0
function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-observation-'))
  t.after(() => remove(directory))
  return { directory, traceFile: path.join(directory, 'trace.jsonl') }
}

test('measured process observes actual root and ESM child without changing streams or exit', t => {
  const { traceFile } = fixture(t)
  const result = runMeasured({ file: process.execPath, args: ['--input-type=module', '-e', `
    import { spawnSync } from 'node:child_process'
    const child = spawnSync(process.execPath, ['-e', 'process.stdout.write("nested");process.exit(4)'], { encoding:'utf8', env:{ PATH:process.env.PATH } })
    process.stdout.write('root:' + child.stdout);process.stderr.write('original-error');process.exit(3)
  `], cwd: process.cwd(), traceFile, trial: 'positive' })
  assert.equal(result.status, 3)
  assert.equal(result.stdout, 'root:nested')
  assert.equal(result.stderr, 'original-error')
  assert.equal(result.error, null)
  assert.equal(result.timedOut, false)
  assert.equal(result.processes.attempts, 2)
  assert.equal(result.processes.starts, 2)
  assert.equal(result.processes.completed, 2)
  assert.equal(result.processes.incomplete, 0)
  assert.equal(result.processes.coverage, 'partial')
  if (python) {
    assert.ok(result.resources.userCpuMs > 0)
    assert.equal(result.resources.cpuScope, 'waited-subtree')
    assert.equal(result.resources.coverage, 'partial')
  }
  const trace = readFileSync(traceFile, 'utf8')
  assert.ok(!trace.includes('original-error'))
  assert.ok(!trace.includes('process.stdout'))
  assert.ok(!trace.includes(os.tmpdir()))
})

test('measured controls keep root resources and disable observation', t => {
  const { traceFile } = fixture(t)
  const result = runMeasured({ file: process.execPath, args: ['-e', 'process.stdout.write("unchanged")'], traceFile, observe: false })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, 'unchanged')
  assert.deepEqual(result.rows, [])
  assert.equal(result.processes.coverage, 'unknown')
  if (python) assert.ok(result.resources.userCpuMs > 0)
})

test('measured missing executable and deadline have separate observations', t => {
  const { directory, traceFile } = fixture(t)
  const missing = runMeasured({ file: path.join(directory, 'missing'), traceFile })
  assert.equal(missing.status, null)
  assert.equal(missing.error, 'ENOENT')
  assert.equal(missing.processes.starts, 0)
  assert.equal(missing.processes.attempts, 1)
  const timeout = runMeasured({ file: process.execPath, args: ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], timeoutMs: 2000, traceFile, trial: 'timeout' })
  assert.equal(timeout.timedOut, true)
  assert.equal(timeout.stdout, 'ready')
  assert.equal(timeout.status, null)
  assert.equal(timeout.processes.incomplete, 0)
})

test('process summary merges launch/self/wait rows and counts exec as one image transition', () => {
  const schema = 'quality-harness-process-trace-v1'
  const row = (invocation, phase, more = {}) => ({ schema, invocation, phase, pid: 1, childPid: 2, ...more })
  const answer = summariseProcesses([
    row('a', 'attempt'), row('a', 'started'), row('a', 'self-start'), row('a', 'self-end'), row('a', 'ended'),
    row('b', 'exec-attempt', { pid: 2, childPid: null }), row('b', 'self-start', { pid: 2, childPid: 2 }), row('b', 'self-end', { pid: 2, childPid: 2 }),
    row('c', 'attempt'), row('c', 'started'), row('c', 'released'),
  ])
  assert.deepEqual([answer.attempts, answer.starts, answer.completed, answer.incomplete, answer.execReplacements], [2, 2, 1, 1, 1])
  assert.equal(answer.coverage, 'partial')
})


test('unsafe sinks keep the program behavior and protected input unchanged', t => {
  for (const kind of ['full', 'symlink', 'hardlink', 'checkout', 'payload', 'directory', 'missing-parent', 'cwd']) {
    const { directory, traceFile: initial } = fixture(t)
    let traceFile = initial, input = '', cwd = process.cwd(), victim = null
    if (kind === 'full') { const fd = openSync(traceFile, 'w'); ftruncateSync(fd, 8 * 1024 * 1024); closeSync(fd) }
    if (kind === 'directory') mkdirSync(traceFile)
    if (kind === 'missing-parent') traceFile = path.join(directory, 'missing', 'trace.jsonl')
    if (kind === 'checkout') mkdirSync(path.join(directory, '.git'))
    if (kind === 'cwd') cwd = directory
    if (kind === 'payload') { victim = traceFile; writeFileSync(victim, 'untouched'); input = JSON.stringify({ tool_input: { file_path: victim } }) }
    if (kind === 'symlink' || kind === 'hardlink') {
      victim = path.join(directory, 'victim.jsonl'); writeFileSync(victim, 'untouched')
      try { if (kind === 'symlink') symlinkSync(victim, traceFile); else linkSync(victim, traceFile) } catch (error) {
        t.diagnostic(`${kind} fixture unavailable: ${error.code}`); continue
      }
    }
    const result = runMeasured({ file: process.execPath, args: ['-e', 'process.stdout.write("out");process.stderr.write("err")'], cwd, input, traceFile })
    assert.equal(result.status, 0, kind)
    assert.equal(result.stdout, 'out', kind)
    assert.equal(result.stderr, 'err', kind)
    assert.deepEqual(result.rows, [], kind)
    if (victim) assert.equal(readFileSync(victim, 'utf8'), 'untouched', kind)
    if (kind === 'full') assert.equal(statSync(traceFile).size, 8 * 1024 * 1024)
  }
})

test('observation requires short expiry and an external absolute sink', t => {
  const { traceFile } = fixture(t)
  for (const until of [1, Date.now() + 60 * 60_000]) {
    const env = observationEnvironment({ env: {}, traceFile, until })
    assert.equal(env.QUALITY_HARNESS_TRACE_FILE, undefined)
    assert.equal(env.NODE_OPTIONS, undefined)
  }
})

test('sequential calls in one trial return separate rows and a cold protected data path is safe', t => {
  const { directory, traceFile } = fixture(t)
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: path.join(directory, 'new-home', 'data') }
  const invoke = () => runMeasured({ file: process.execPath, args: ['-e', ''], env, traceFile, trial: 'shared' })
  const first = invoke(), second = invoke()
  assert.equal(first.processes.attempts, 1)
  assert.equal(second.processes.attempts, 1)
  assert.ok(!second.rows.some(row => row.invocation === first.rows[0].invocation))
})

test('preload preserves async unhandled errors and observes async launches', t => {
  const { traceFile } = fixture(t)
  const result = runMeasured({ file: process.execPath, args: ['-e', `
    require('node:child_process').spawn(${JSON.stringify(path.join(os.tmpdir(), 'qh-observation-missing-program'))})
  `], traceFile })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unhandled 'error' event/)
  assert.match(result.stderr, /ENOENT/)
  assert.equal(result.processes.attempts, 2)
  assert.equal(result.processes.starts, 1)
  assert.equal(result.processes.completed, 1)
  assert.equal(result.processes.incomplete, 0)
})

test('sync shell launches retain the distinct Node image and direct execFileSync merges its image', t => {
  const { traceFile } = fixture(t)
  const direct = runMeasured({ file: process.execPath, args: ['-e', `
    const { execFileSync } = require('node:child_process')
    process.stdout.write(execFileSync(process.execPath, ['-e', 'process.stdout.write("direct")']))
  `], traceFile, trial: 'direct' })
  assert.equal(direct.stdout, 'direct')
  assert.equal(direct.processes.starts, 2)
  const command = JSON.stringify(process.execPath) + ' -e ' + JSON.stringify('process.stdout.write("shell")')
  const shell = runMeasured({ file: process.execPath, args: ['-e', `process.stdout.write(require('node:child_process').execSync(${JSON.stringify(command)}))`], traceFile, trial: 'shell' })
  assert.equal(shell.stdout, 'shell')
  assert.equal(shell.processes.starts, 3)
  assert.equal(shell.processes.completed, 3)
})

test('async spawn, execFile and fork keep their returned ChildProcess and output', t => {
  const { directory, traceFile } = fixture(t)
  const module = path.join(directory, 'child.cjs')
  writeFileSync(module, 'process.stdout.write("fork")')
  const result = runMeasured({ file: process.execPath, args: ['--input-type=module', '-e', `
    import { spawn, execFile, fork } from 'node:child_process'
    import { once } from 'node:events'
    const a=spawn(process.execPath,['-e','process.stdout.write("spawn")'])
    a.stdout.pipe(process.stdout);await once(a,'close')
    await new Promise((resolve,reject)=>execFile(process.execPath,['-e','process.stdout.write("execFile")'],(error,out)=>{if(error)reject(error);else{process.stdout.write(out);resolve()}}))
    const b=fork(${JSON.stringify(module)},[],{stdio:['ignore','pipe','pipe','ipc']})
    b.stdout.pipe(process.stdout);await once(b,'close')
  `], traceFile })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'spawnexecFilefork')
  assert.equal(result.processes.starts, 4)
  assert.equal(result.processes.completed, 4)
})

test('POSIX Node exec replacement changes image without adding a process', { skip: typeof process.execve !== 'function' || process.platform === 'win32' ? 'POSIX execve requires a supporting Node build' : false }, t => {
  const { traceFile } = fixture(t)
  const result = runMeasured({ file: process.execPath, args: ['--no-warnings', '-e', `
    process.execve(process.execPath,[process.execPath,'-e','process.stdout.write("replacement")'],process.env)
  `], traceFile })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'replacement')
  assert.equal(result.processes.starts, 1)
  assert.equal(result.processes.completed, 1)
  assert.equal(result.processes.execReplacements, 1)
})
