// The Go core's daily sweep removes what the Node one does (ultrareview of v3.8.53..main): both claim one guard, so a day the
// Go core claims it must not leave the statusline caches behind. The Go test runs here so the gate runs it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { required } from './helpers/require.mjs'

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be checked here` : false)

test('the Go core sweeps a week-old statusline cache as the Node one does', { skip: noGo }, () => {
  const run = spawnSync('go', ['test', '-count=1', '-run', '^TestSweepStatusCache$', '-v', './hooks/'],
    { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /--- PASS: TestSweepStatusCache/, 'the test ran, not a filter that selected nothing')
})
