// ADR-138 T1: two corpus-probe reports are the same output only when every field the probe records is equal, after
// removing a closed list of run fields. diffReports explains a difference but compares a chosen subset (it skips
// corpusReport and reduces ready tasks to ids: the cold review of ADR-138, 2026-11-03), so it is never the test.
// The report is a real one, of a fixture corpus staged in its own repository (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { RUN_FIELDS, sameOutput } from '../scripts/same-output.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const probe = path.join(repoRoot, 'plugin', 'scripts', 'corpus-probe.mjs')

function report(t) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-same-output-'))
  t.after(() => remove(scratch))
  const corpus = path.join(scratch, 'corpus')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'go-module'), corpus, { recursive: true })
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    assert.equal(spawnSync('git', args, { cwd: corpus, env, timeout: 60_000, windowsHide: true }).status, 0, args.join(' '))
  }
  const run = spawnSync(process.execPath, [probe, '--json'], { cwd: corpus, encoding: 'utf8', timeout: 300_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}
const copy = value => JSON.parse(JSON.stringify(value))

test('two reports are the same output only when every recorded field but the run fields is equal', t => {
  const before = report(t)
  // The run fields, named: what differs between two runs of one corpus (timings, load, slowest; measured 2026-11-03 on
  // go-module) and between two versions or machines (probe: version, digests, native identity, date, platform).
  assert.deepEqual([...RUN_FIELDS].sort(), ['load', 'probe', 'slowest', 'timings'])
  const runOnly = copy(before)
  runOnly.probe = { version: '0.0.0', readers: { sha256: 'x' } }
  runOnly.timings = []
  runOnly.load = { start: 99, end: 99 }
  runOnly.slowest = []
  assert.equal(sameOutput(before, runOnly), true, 'run fields alone are not output')
  assert.equal(sameOutput(before, copy(before)), true)
  // Fields diffReports does not compare, or compares reduced, are output here.
  const report2 = copy(before)
  report2.corpusReport = [...(report2.corpusReport ?? []), { root: 'x', totals: { unreadable: 1 } }]
  assert.equal(sameOutput(before, report2), false, 'corpusReport is output')
  const unproven = copy(before)
  assert.ok(unproven.adrNext?.[0]?.ready?.length, 'the fixture has a ready task')
  unproven.adrNext[0].ready[0].unproven = 'a changed note'
  assert.equal(sameOutput(before, unproven), false, "a ready task's note is output")
  const finding = copy(before)
  finding.adrLint[0].reason = 'another finding'
  assert.equal(sameOutput(before, finding), false, 'a finding is output')
  const added = copy(before)
  added.aFieldAddedLater = ['anything']
  assert.equal(sameOutput(before, added), false, 'a field the probe adds later counts as output until it is named a run field')
  // Key order is not output.
  const reordered = Object.fromEntries(Object.entries(before).reverse())
  assert.equal(sameOutput(before, reordered), true)
})
