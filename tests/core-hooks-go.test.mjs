// The Go core's own tests that no parity comparison runs: each is run here by name, so a test file nothing runs cannot sit
// in core/hooks (scripts/suite-accounting.mjs). Skipped, with the reason, where `go` is not on PATH.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { required } from './helpers/require.mjs'

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

test('the Go core reads a long transcript from its end, and records marks only after a written output', { skip: noGo }, () => {
  const names = ['TestSaidWindow', 'TestFlushSaysWhetherItWrote']
  const run = spawnSync('go', ['test', '-count=1', '-v', '-run', `^(${names.join('|')})$`, './hooks/'],
    { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  const said = `${run.stdout}\n${run.stderr}`
  assert.equal(run.status, 0, said.split('\n').slice(-40).join('\n'))
  // A filter that selects nothing exits 0 too: each test is seen passing by name.
  for (const name of names) assert.match(said, new RegExp(`^--- PASS: ${name} `, 'm'), `${name} ran`)
})

test('the native process observer exercises execution, privacy, completion and resource boundaries', { skip: noGo }, () => {
  const names = ['TestNativeProcessTraceHelper', 'TestNativeProcessTraceBoundary', 'TestNativeProcessTraceStartErrorAndTimeout',
    'TestNativeProcessTraceUnsafeSinkDoesNotChangeChild', 'TestNativeProcessTraceDisabledBeforeInspection',
    'TestNativeProcessTraceReleasedIsNotCompleted', 'TestNativeProcessTraceResourceUnits',
    'TestNativeProcessTraceArtifactReturnIsSelfReported', 'TestNativeProcessTraceSeparators']
  const run = spawnSync('go', ['test', '-count=1', '-v', '-run', `^(${names.join('|')})$`, './hooks/'],
    { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  const said = `${run.stdout}\n${run.stderr}`
  assert.equal(run.status, 0, said)
  for (const name of names) assert.match(said, new RegExp(`^--- PASS: ${name} `, 'm'), `${name} ran`)
})
