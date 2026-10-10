// Spec 2026-09-29, "a campaign never touches the checkout": F-10 and UC2 — every result
// says the load it ran under, and a result above the core count says it cannot be
// attributed, without changing its exit or its verdict (CLAUDE.md §3: advice only).
//
// The `loadavg` and `cores` options are `runCheck`'s seams, as `platform` is, and
// `QUALITY_HARNESS_LOADAVG` / `QUALITY_HARNESS_CORES` are the campaign's (ADR-075 T1).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'
import { campaign, campaignFixture } from './campaign-fixture.mjs'

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

test('a check run below the core count is recorded as not contended', async () => {
  const dir = project()
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, loadavg: () => [1.5, 1, 1], cores: 4 }), 0)
  const record = lastRecord(dir)
  assert.equal(record.before.load, 1.5)
  assert.equal(record.after.load, 1.5)
  assert.equal(record.cores, 4)
  assert.equal(record.contended, false)
  assert.doesNotMatch(err.text(), /unattributable/)
  // Both samples are always said, contended or not, and a campaign says them on every run (F-10).
  assert.match(err.text(), /load: 1\.5 at start, 1\.5 at end, on 4 cores/)
  const fixture = campaignFixture()
  const run = campaign(fixture, ['--no-cache', '--case', 'answer'], { QUALITY_HARNESS_LOADAVG: '1.5 1 1', QUALITY_HARNESS_CORES: '4' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout + run.stderr, /load: 1\.5 at start, 1\.5 at end, on 4 cores/)
})

test('a check run above the core count is recorded as contended and said, and its exit is unchanged', async () => {
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

test('a check with no load average records contended null and says the load could not be read', async () => {
  const dir = project()
  const err = sink()
  // What os.loadavg() returns where the platform has none (Windows).
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, loadavg: () => [0, 0, 0], cores: 4 }), 0)
  const record = lastRecord(dir)
  assert.equal(record.contended, null)
  assert.match(err.text(), /could not read the load/)
  // A campaign with no load average says so too.
  const fixture = campaignFixture()
  const run = campaign(fixture, ['--no-cache', '--case', 'answer'], { QUALITY_HARNESS_LOADAVG: '0 0 0', QUALITY_HARNESS_CORES: '4' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout + run.stderr, /could not read the load/)
})

test('a check whose load crosses the core count between its samples is contended, and one at the count is not', async () => {
  const crossing = project()
  const err = sink()
  const samples = [[2, 2, 2], [9, 9, 9]]
  assert.equal(await runCheck({ cwd: crossing, stdout: sink(), stderr: err, loadavg: () => samples.shift() ?? [9, 9, 9], cores: 4 }), 0)
  const record = lastRecord(crossing)
  assert.equal(record.before.load, 2)
  assert.equal(record.after.load, 9)
  assert.equal(record.contended, true)
  assert.match(err.text(), /load: 2 at start, 9 at end, on 4 cores/)
  assert.match(err.text(), /unattributable/)
  const atCount = project()
  const quiet = sink()
  assert.equal(await runCheck({ cwd: atCount, stdout: sink(), stderr: quiet, loadavg: () => [4, 4, 4], cores: 4 }), 0)
  assert.equal(lastRecord(atCount).contended, false)
  assert.doesNotMatch(quiet.text(), /unattributable/)
})

// Codex review of 3.2.0: the load is kept as read, so a sample just above the count is contended.
test('a load just above the core count is contended, and said as read', async () => {
  const dir = project()
  const err = sink()
  assert.equal(await runCheck({ cwd: dir, stdout: sink(), stderr: err, loadavg: () => [4.001, 4, 4], cores: 4 }), 0)
  const record = lastRecord(dir)
  assert.equal(record.before.load, 4.001)
  assert.equal(record.contended, true)
  assert.match(err.text(), /unattributable: load 4\.001 on 4 cores/)
})

// Codex review of 3.2.0: a sampler that throws at either end is a load nobody read. The check
// still runs, its record is still written, and its exit is its own.
test('a load sampler that throws leaves the check, its record and its exit alone', async () => {
  for (const samples of [[], [[1, 1, 1]]]) {
    const dir = project()
    const out = sink()
    const err = sink()
    const loadavg = () => {
      const next = samples.shift()
      if (!next) throw new Error('no load sampler here')
      return next
    }
    assert.equal(await runCheck({ cwd: dir, stdout: out, stderr: err, loadavg, cores: 4 }), 0)
    assert.match(out.text(), /ran-the-declared-check/)
    const record = lastRecord(dir)
    assert.equal(record.verdict, 'passed')
    assert.equal(record.after.load, null)
    assert.equal(record.contended, null)
    assert.match(err.text(), /could not read the load/)
  }
})

// Codex review of 3.2.0: a negative, non-finite or absent value is not a measured quiet machine,
// and a core count passed as 0 is not replaced by the host's.
test('an invalid load or core count is recorded as unread, not as uncontended', async () => {
  const { contention } = await import('../plugin/scripts/load.mjs')
  assert.equal(contention(Number.NaN, 1, 4), null)
  assert.equal(contention(1, 1, Number.POSITIVE_INFINITY), null)
  assert.equal(contention(1, 5, 4), true, 'the clean arm: a valid pair above the count')
  const negative = project()
  assert.equal(await runCheck({ cwd: negative, stdout: sink(), stderr: sink(), loadavg: () => [-1, 1, 1], cores: 4 }), 0)
  assert.equal(lastRecord(negative).before.load, null)
  assert.equal(lastRecord(negative).contended, null)
  const noCores = project()
  const err = sink()
  assert.equal(await runCheck({ cwd: noCores, stdout: sink(), stderr: err, loadavg: () => [1, 1, 1], cores: 0 }), 0)
  assert.equal(lastRecord(noCores).cores, null)
  assert.equal(lastRecord(noCores).contended, null)
  assert.match(err.text(), /could not read the load/)
})
