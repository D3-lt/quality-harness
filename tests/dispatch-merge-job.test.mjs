// BACKLOG §475.1: on a dispatch the `mutation cache` job skips its checkout, and since b504ac077 (2026-10-28) its
// `actions/setup-go` step, which reads `core/go.mod`, ran unconditionally: every dispatched run would fail that job, and
// a dispatch on main is the remedy release-evidence names for a sha whose landing was not a full campaign. Every step of
// that job is skipped on a dispatch, read from the workflow's own text.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = readFileSync(path.join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8').replaceAll('\r\n', '\n')
const SKIPPED = "github.event_name != 'workflow_dispatch'"

/** The steps of the `mutation-cache` job that would run on a dispatch, by their first line. */
function runOnDispatch(workflow) {
  const job = /^ {2}mutation-cache:\n([\s\S]*?)(?=^ {2}[\w-]+:\s*$)/m.exec(workflow)?.[1]
  if (!job) return null
  const steps = job.slice(job.indexOf('    steps:\n')).split(/^(?= {6}- )/m).slice(1)
  return steps.filter(step => !step.split('\n').some(line => /^ {6}(?:- | {2})if: /.test(line) && line.includes(SKIPPED)))
    .map(step => step.split('\n')[0].trim())
}

test('no step of the merge job runs on a dispatch, where nothing was checked out', () => {
  assert.deepEqual(runOnDispatch(WORKFLOW), [])
  // The workflow as it was from b504ac077 until this fix: the setup-go step had no condition.
  const before = WORKFLOW.replace(/( {6}- uses: actions\/setup-go@v\d+\n)(?: {8}#[^\n]*\n)* {8}if: [^\n]*\n/, '$1')
  assert.notEqual(before, WORKFLOW, 'the stand-in changed the workflow')
  assert.deepEqual(runOnDispatch(before), ['- uses: actions/setup-go@v7'])
  assert.equal(runOnDispatch('jobs:\n  other:\n    steps: []\n'), null, 'a workflow without the job is not a clean answer')
})
