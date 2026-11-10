// BACKLOG §438: the core's run() ends the whole tree of the command it started, at the deadline and once the command returns
// (core/hooks/proc_tree_test.go; on Windows proc_tree_windows_test.go, where the tree is a job object, ADR-140). Skipped, with
// the reason, where `go` is not on PATH.
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

test("the core's run() ends the tree it started", { skip: noGo }, () => {
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestRunEnds', './hooks/'], { cwd: coreDir, encoding: 'utf8', timeout: 300_000, windowsHide: true })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, said.split('\n').slice(-40).join('\n'))
  assert.match(said, /^--- PASS: TestRunEndsTheTree \(/m, said)
  assert.match(said, /^--- PASS: TestRunEndsWhatAFinishedCommandLeft \(/m, said)
})
