import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { required } from './helpers/require.mjs'

const core = fileURLToPath(new URL('../core/', import.meta.url))
const probe = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const skip = required('go', probe.error || probe.status !== 0 ? 'Go is unavailable for native artifact reconciliation' : false)

test('native artifact reconciliation rejects stale arrivals and preserves current and unknown findings', { skip }, () => {
  const result = spawnSync('go', ['test', './hooks', '-run', '^TestArtifactImport', '-count=1', '-v'], {
    cwd: core, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, GOMAXPROCS: '2', GOFLAGS: '-p=2' },
  })
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  for (const name of ['TestArtifactImportArrivalOrder', 'TestArtifactImportKeepsUncertainAndCurrent', 'TestArtifactImportReadsOncePerPath']) {
    assert.match(result.stdout, new RegExp('^--- PASS: ' + name + '\\b', 'm'), result.stdout)
  }
})
