// Spec 2026-09-29, "a campaign never touches the checkout": F-10 and UC2 — every result
// says the load it ran under, and a result above the core count says it cannot be
// attributed, without changing its exit or its verdict (CLAUDE.md §3: advice only).
//
// ⚠ `todo` UNTIL THE ADR IS EXECUTED; see tests/mutate-isolation.test.mjs for why. The
// `loadavg` and `cores` options are the seams the ADR adds to `runCheck`, as `platform`
// already is, and `QUALITY_HARNESS_LOADAVG` / `QUALITY_HARNESS_CORES` are mutate's; today
// nothing reads any of them.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { stateDir } from '../plugin/scripts/lifecycle.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'
import { campaign, campaignFixture } from './campaign-fixture.mjs'

const RED = 'spec 2026-09-29 (a campaign never touches the checkout): red until its ADR is executed'
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-check-load-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

let projects = 0
// A fresh repository whose declared check is a script that passes.
function project() {
  const dir = path.join(scratch, `project-${projects++}`)
  mkdirSync(path.join(dir, 'sub'), { recursive: true })
  const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(init.status, 0, init.stderr)
  writeFileSync(path.join(dir, 'sub', 'check.mjs'), "console.log('ran-the-declared-check')\n")
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'node sub/check.mjs' }))
  return dir
}

function sink() {
  const chunks = []
  return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') }
}

function lastRecord(dir) {
  const file = path.join(stateDir(dir), 'checks.jsonl')
  assert.ok(existsSync(file), 'qh-check wrote no record')
  return JSON.parse(readFileSync(file, 'utf8').trim().split('\n').pop())
}

test('a check run below the core count is recorded as not contended', { todo: RED }, async () => {
  const dir = project()
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, loadavg: () => [1.5, 1, 1], cores: 4 }), 0)
  const record = lastRecord(dir)
  assert.equal(record.before.load, 1.5)
  assert.equal(record.after.load, 1.5)
  assert.equal(record.cores, 4)
  assert.equal(record.contended, false)
  assert.doesNotMatch(err.text(), /unattributable/)
})

test('a check run above the core count is recorded as contended and said, and its exit is unchanged', { todo: RED }, async () => {
  const dir = project()
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, loadavg: () => [12, 11, 10], cores: 4 }), 0)
  const record = lastRecord(dir)
  assert.equal(record.contended, true)
  assert.equal(record.before.load, 12)
  assert.equal(record.cores, 4)
  assert.equal(record.verdict, 'passed')
  assert.match(err.text(), /unattributable: load 12 on 4 cores/)
  // A campaign says the same, over a fixture repository and never this checkout.
  const fixture = campaignFixture()
  const run = campaign(fixture, ['--no-cache', '--case', 'answer'], { QUALITY_HARNESS_LOADAVG: '12 11 10', QUALITY_HARNESS_CORES: '4' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout + run.stderr, /unattributable: load 12 on 4 cores/)
})

test('a check with no load average records contended null and says the load could not be read', { todo: RED }, async () => {
  const dir = project()
  const err = sink()
  // What os.loadavg() returns where the platform has none (Windows).
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, loadavg: () => [0, 0, 0], cores: 4 }), 0)
  const record = lastRecord(dir)
  assert.equal(record.contended, null)
  assert.match(err.text(), /could not read the load/)
})
