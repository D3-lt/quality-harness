// ADR-095 T4: the repository's own gate says how many test files it runs at once and the load it found, before anything heavy,
// takes an override, and says a load it cannot read is unknown. Driven through the script itself in its dry mode, which prints the
// line and exits without running a test.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { testBash } from './helpers/bash.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(repoRoot, 'scripts', 'selftest.sh')
const bash = testBash()
const dry = (env = {}) => spawnSync(bash, [script], { encoding: 'utf8', timeout: 60_000, windowsHide: true,
  env: { ...process.env, QH_SELFTEST_DRY: '1', QH_SELFTEST_CONCURRENCY: '', QH_SELFTEST_LOAD: '', ...env } })

test('the gate says what it ran with and the load it found', () => {
  const run = dry()
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /^selftest: concurrency default \(cores (\d+|unknown), load (\d+\.\d\d|unknown)\)$/m, run.stdout)
  assert.doesNotMatch(run.stdout, /passed|✔|tests \d+/, 'dry mode runs no test')
})

test('an override is honoured and said', () => {
  const two = dry({ QH_SELFTEST_CONCURRENCY: '2' })
  assert.equal(two.status, 0, two.stdout + two.stderr)
  assert.match(two.stdout, /^selftest: concurrency 2 \(cores (\d+|unknown), load (\d+\.\d\d|unknown); set by QH_SELFTEST_CONCURRENCY\)$/m, two.stdout)
  // The dirty twin: a value that is not a positive whole number is said and ignored, never passed on to node.
  for (const bad of ['abc', '0', '-1', '2.5', '1e3']) {
    const run = dry({ QH_SELFTEST_CONCURRENCY: bad })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    assert.match(run.stdout, /QH_SELFTEST_CONCURRENCY=.* is not a positive whole number; ignored/, bad)
    assert.match(run.stdout, /^selftest: concurrency default /m, bad)
  }
})

test('a load that cannot be read is said as unknown', () => {
  const run = dry({ QH_SELFTEST_LOAD: 'unreadable' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /load unknown\)/, run.stdout)
  assert.doesNotMatch(run.stdout, /load 0(\.00)?[,)]/, 'unknown is not a quiet machine')
})
