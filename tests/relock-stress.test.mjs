import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const { NODE_TEST_CONTEXT: _nestedRunner, ...envSansTestContext } = process.env
const pyEnv = {
  ...envSansTestContext,
  PYTHONPATH: join(root, 'lib'),
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
  PYTHONWARNDEFAULTENCODING: '1',
  PYTHONWARNINGS: 'error::EncodingWarning',
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONPYCACHEPREFIX: mkdtempSync(join(os.tmpdir(), 'qh-pyc-')),
  QH_RELOCK_STRESS_MUTANTS: '0',
}

test('ADR-052 --relock stress against the Decision oracle', () => {
  // stress-testing skill: oracle from ADR-052 §Decision, never from the code.
  // Arm 1: trailing lock-kind grammar vs a split parser (not TEST_LOCK_FIELD).
  // Arm 2: random Verification Logs vs a reference model of the done map,
  // later-red conflict, weaker-than-first-red, and is_done.
  // Arm 3: python3 plugin/bin/adr-verify (working-tree path) vs an exit-code
  // oracle. Replay: QH_RELOCK_STRESS_SEED=<n> PYTHONPATH=plugin/lib python3
  // tests/relock-stress.py
  const run = runPython(['-B', join(testDir, 'relock-stress.py')], {
    cwd: repoRoot,
    env: { ...pyEnv, PYTHONPYCACHEPREFIX: mkdtempSync(join(os.tmpdir(), 'qh-pyc-')) },
    encoding: 'utf8',
    timeout: 120_000,
  })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /^arm1 iterations=[1-9]\d* snapshot=[1-9]\d* not_snapshot=[1-9]\d* kind_in_command=[1-9]\d* invalid_kind=[1-9]\d*$/m, run.stdout)
  assert.match(run.stdout, /^arm2 iterations=[1-9]\d* done_false=[1-9]\d* done_true=\d+ weaker=[1-9]\d* conflict=[1-9]\d* recovered=\d+$/m, run.stdout)
  assert.match(run.stdout, /^arm3 iterations=[1-9]\d* refused=[1-9]\d* allowed=[1-9]\d* empty_log=[1-9]\d* moved=[1-9]\d* replaced=[1-9]\d*$/m, run.stdout)
})
