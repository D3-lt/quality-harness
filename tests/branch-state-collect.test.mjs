// ADR-135 T2: runs the Go core's TestBranchStateCollect, which replays the stubbed command answers of
// tests/branch-state.test.mjs against collectBranchState and compares each state, checkpoint and command order with what the
// Node collect produced. It exists so the mutation campaign, which runs Node test files, can see core/hooks/branchstate_collect.go.
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

test('the core collects branch state as the Node collect does', { skip: noGo }, () => {
  // TestBranchStateCollectEndsTheTree too: a deadline that ends the command's whole process group (ADR-135 Decision 2). It is
  // built only off Windows, where a process group exists. And the serving half's file readers (T3): a commit's parents from its
  // loose object, the own-commit walk, and the snapshot's replace-then-fallback write.
  const serving = ['TestBranchStateCommitParents', 'TestBranchStateOwnCommitWalk', 'TestBranchStateReplaceFile',
    'TestBranchStateWriterKeepsANewerSnapshot', 'TestBranchStateRefreshPublishable', 'TestBranchStateCachedAnswersWithTheKeptSnapshot']
  const pattern = `^(TestBranchStateCollect(EndsTheTree(AfterAnEarlyExit)?)?|${serving.join('|')})$`
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', pattern, './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true,
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  const tail = said.split('\n').slice(-60).join('\n')
  assert.equal(ran.status, 0, `collectBranchState disagrees with the Node collect (or did not build):\n${tail}`)
  // Exit 0 also covers a test that skipped or matched nothing: the PASS line, and no SKIP or FAIL, say it ran whole.
  assert.match(said, /^--- PASS: TestBranchStateCollect \(/m, tail)
  if (process.platform !== 'win32') assert.match(said, /^--- PASS: TestBranchStateCollectEndsTheTree \(/m, tail)
  if (process.platform !== 'win32') assert.match(said, /^--- PASS: TestBranchStateCollectEndsTheTreeAfterAnEarlyExit \(/m, tail)
  for (const name of serving) assert.match(said, new RegExp(`^--- PASS: ${name} \\(`, 'm'), tail)
  assert.doesNotMatch(said, /--- SKIP|--- FAIL|no tests to run/, tail)
})
