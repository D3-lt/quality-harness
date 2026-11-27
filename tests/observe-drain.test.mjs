// BACKLOG §477.2: runs the Go core's tests of the observation's drained runner (core/hooks/observe_drain.go), so the mutation
// campaign, which runs Node test files, can see it. Off Windows: the runner's bounds (output whole, deadline, a finished command's
// holder ended, an unreachable holder bounded, a failed read said and traced) and the observation's own entry, boundedGit, driven
// down the Windows path. On Windows: the held read closed at its deadline, the answer kept where bsRun loses it, a whole payload,
// and the process identity those tests rest on (core/hooks/proc_identity_windows_test.go).
// Skipped, with the reason, where `go` is not on PATH: there is no core to run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { required } from './helpers/require.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const coreDir = path.resolve(here, '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

const expected = process.platform === 'win32'
  ? ['TestObservedPipeTakesADeadline', 'TestObservedRunEndsAHeldReadAtItsDeadline', 'TestObservedRunEndsTheTreeAndKeepsTheAnswer',
    'TestObservedRunKeepsTheAnswerTheRefreshRunnerLoses', 'TestObservedRunReadsAWholePayload', 'TestProcIdentityIsCheckedByCreationTime']
  : ['TestObservedRunReadsAllItsOutput', 'TestObservedRunEndsAtItsDeadline', 'TestObservedRunEndsWhatAFinishedCommandLeft',
    'TestObservedRunIsBoundedWhenTheTreeCannotBeEnded', 'TestObservedRunSaysAReadThatFailed', 'TestObservedRunTracesAReadThatFailed',
    'TestObservationKeepsTheAnswerOfAGitThatLeavesAHolder']

test('the observation reads its git through the drained runner, bounded', { skip: noGo }, () => {
  // -timeout bounds a read that is never ended (the catalogue's close-removed mutant hangs until it): a held read is 0.5 s here.
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-timeout', '120s', '-run', `^(${expected.join('|')})$`, './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true,
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  const tail = said.split('\n').slice(-60).join('\n')
  assert.equal(ran.status, 0, `the drained runner's tests failed (or did not build):\n${tail}`)
  // Exit 0 also covers a test that skipped or matched nothing: every expected PASS line, and no SKIP or FAIL, say it ran whole.
  for (const name of expected) assert.match(said, new RegExp(`^--- PASS: ${name} \\(`, 'm'), tail)
  assert.doesNotMatch(said, /--- SKIP|--- FAIL|no tests to run/, tail)
})
