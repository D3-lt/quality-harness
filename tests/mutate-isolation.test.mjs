// Spec 2026-09-29, "a campaign never touches the checkout": F-8, F-9, F-11 to F-14, and ADR-075's own tests.
//
// ⚠ EVERY TEST HERE IS `todo` UNTIL ITS ADR IS EXECUTED. Each is red today, for the
// reason its fact names, and a todo failure does not fail the suite, so the gate stays
// green on the spec branch. The ADR's first task removes `todo` before it records the
// red run: a todo test passes the suite whatever it asserts, so it can never be a red.
//
// Every campaign runs over a fixture repository in the OS temp directory, never over
// this checkout (tests/campaign-fixture.mjs).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  campaign, campaignEnv, campaignFixture, mutateScript, sidecar, sidecarLines, snapshot, verdicts, worktrees,
} from './campaign-fixture.mjs'
import { readReport } from '../scripts/mutation-cache-merge.mjs'

const RED = 'spec 2026-09-29 (a campaign never touches the checkout): red until its ADR is executed'

test('a campaign leaves the working tree byte-identical and its mutants never appear there', { todo: RED }, () => {
  const dir = campaignFixture()
  writeFileSync(path.join(dir, 'notes.md'), '# Notes\n\nAn uncommitted edit to a file no entry mutates.\n')
  const side = sidecar()
  const before = snapshot(dir)
  // --no-cache: the verdict cache comes back to the checkout by design (F-12), so it is
  // left out of the byte comparison by not writing one.
  const run = campaign(dir, ['--no-cache'], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.deepEqual(verdicts(run.stdout), { answer: 'RED', other: 'RED' })
  const seen = sidecarLines(side)
  assert.ok(seen.length > 0, 'the fixture suite never ran, so nothing was observed')
  // The whole point: a peer reading the checkout mid-run never meets a mutant. Today it
  // does — the mutant is written into the checkout and restored from a journal.
  assert.ok(seen.every(entry => !entry.checkout.includes('() => 43') && !entry.checkout.includes("() => 'y'")),
    'a mutant was in the checkout while the campaign ran')
  assert.deepEqual(snapshot(dir), before)
})

test('a campaign that cannot isolate stops and names --in-place, writing nothing', { todo: RED }, () => {
  const dir = campaignFixture({ commit: false })
  const before = snapshot(dir)
  const run = campaign(dir, ['--no-cache'])
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /could not isolate/)
  assert.match(run.stderr, /--in-place/)
  assert.deepEqual(snapshot(dir), before, 'a campaign that could not isolate wrote into the checkout')
})

test("a killed campaign's worktree is removed by the next run, and said", { todo: RED }, async () => {
  const dir = campaignFixture()
  const side = sidecar()
  // Its temp directory is the sidecar's, which the fixture module removes: SIGKILL runs no
  // cleanup, so what the killed campaign made there would otherwise outlive the suite.
  const scratch = path.dirname(side)
  const child = spawn(process.execPath, [mutateScript, '--root', dir, '--no-cache'], {
    cwd: dir,
    env: campaignEnv({ FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir, FIXTURE_SLOW_MS: '2000', TMPDIR: scratch, TMP: scratch, TEMP: scratch }),
    stdio: 'ignore', timeout: 60_000, windowsHide: true,
  })
  const exited = new Promise(resolve => child.once('exit', resolve))
  // Wait until the fixture suite is running: an isolated campaign has its worktree by
  // then. Bounded, and it stops at once if the campaign ends first.
  const until = Date.now() + 30_000
  while (sidecarLines(side).length === 0 && child.exitCode === null && child.signalCode === null && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const leftover = worktrees(dir).find(tree => tree !== dir) ?? null
  child.kill('SIGKILL')
  await exited
  assert.ok(leftover, 'the campaign ran its suite with no worktree, so there was nothing to leave behind')
  assert.ok(existsSync(leftover), 'SIGKILL left the worktree on disk')
  const next = campaign(dir, ['--no-cache'])
  assert.equal(next.status, 0, next.stdout + next.stderr)
  assert.match(next.stderr, /removed .*worktree.* left by an earlier run/i)
  assert.ok(!existsSync(leftover), 'the leftover worktree is still on disk')
  assert.deepEqual(worktrees(dir), [dir], 'git still lists the leftover worktree')
})

test("an isolated campaign reuses and returns the checkout's verdict cache", { todo: RED }, () => {
  const dir = campaignFixture()
  const side = sidecar()
  const env = { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir }
  const first = campaign(dir, ['--case', 'answer'], env)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const seen = sidecarLines(side)
  assert.ok(seen.length > 0, 'the fixture suite never ran, so nothing was observed')
  assert.ok(seen.every(entry => entry.cwd !== dir), 'the campaign ran its suite in the checkout, not in a worktree')
  assert.ok(existsSync(path.join(dir, '.mutation-cache.json')), 'the verdict did not come back to the checkout')
  const second = campaign(dir, ['--case', 'answer'], env)
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.match(second.stdout, /\b0 measured this run; 1 reused\b/)
})

// ADR-075: the cache written back is the shape CI's merge job reads. That job exits 0 when it
// refuses a report, so a wrong shape would be silent everywhere else. An in-place run passes this
// today; it guards that isolation keeps the shape.
test("an isolated campaign's written-back cache is one CI's merge job can read", () => {
  const dir = campaignFixture()
  const run = campaign(dir, ['--case', 'answer'])
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const report = readReport(path.join(dir, '.mutation-cache.json'))
  assert.equal(report.error, undefined, `the merge job refuses it: ${report.error}`)
  assert.ok(Object.keys(report.entries).length > 0, 'no verdict came back')
})

// ADR-075 (F-9's signal clause): a campaign stopped by SIGTERM removes its own worktree. Windows
// has no catchable SIGTERM — `kill` there ends the process at once — so on win32 the leftover is
// the next run's to sweep, which is what this asserts there.
test('a campaign stopped with SIGTERM removes its worktree', { todo: RED }, async () => {
  const dir = campaignFixture()
  const side = sidecar()
  const scratch = path.dirname(side)
  const child = spawn(process.execPath, [mutateScript, '--root', dir, '--no-cache'], {
    cwd: dir,
    env: campaignEnv({ FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir, FIXTURE_SLOW_MS: '2000', TMPDIR: scratch, TMP: scratch, TEMP: scratch }),
    stdio: 'ignore', timeout: 60_000, windowsHide: true,
  })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  const until = Date.now() + 30_000
  while (sidecarLines(side).length === 0 && child.exitCode === null && child.signalCode === null && Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const tree = worktrees(dir).find(entry => entry !== dir) ?? null
  assert.ok(tree, 'the campaign ran its suite with no worktree')
  child.kill('SIGTERM')
  const { code } = await exited
  if (process.platform === 'win32') {
    const next = campaign(dir, ['--no-cache'])
    assert.equal(next.status, 0, next.stdout + next.stderr)
  } else {
    assert.equal(code, 143, 'a campaign stopped by SIGTERM exits 143')
  }
  assert.ok(!existsSync(tree), 'the worktree outlived its campaign')
  assert.deepEqual(worktrees(dir), [dir])
})

test('an isolated run and an in-place run of the same entries give the same verdicts', { todo: RED }, () => {
  const dir = campaignFixture()
  const inPlace = campaign(dir, ['--no-cache', '--in-place'])
  assert.equal(inPlace.status, 0, inPlace.stdout + inPlace.stderr)
  const isolated = campaign(dir, ['--no-cache'])
  assert.equal(isolated.status, 0, isolated.stdout + isolated.stderr)
  const expected = verdicts(inPlace.stdout)
  assert.deepEqual(Object.keys(expected).sort(), ['answer', 'other'])
  assert.deepEqual(verdicts(isolated.stdout), expected)
})

// `QUALITY_HARNESS_PROCESS_LIST` is the seam the ADR adds for "the process list cannot
// be read"; today nothing reads it. Windows lists processes differently, and the ADR
// says which arm it takes there.
test('an in-place campaign names the processes running this checkout, and says when it could not look', { todo: RED }, async () => {
  if (process.platform === 'win32') {
    // No `ps` on Windows (ADR-075 Out of Scope): the run says it could not look, and runs.
    const dir = campaignFixture()
    const blind = campaign(dir, ['--no-cache', '--in-place'])
    assert.equal(blind.status, 0, blind.stdout + blind.stderr)
    assert.match(blind.stderr, /could not look/)
    return
  }
  const dir = campaignFixture()
  const quiet = campaign(dir, ['--no-cache', '--in-place'])
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr)
  assert.doesNotMatch(quiet.stderr, /live for/, 'an exposure line with nobody exposed')
  const sleepers = [1, 2].map(() => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', path.join(dir, 'lib.mjs')],
    { stdio: 'ignore', timeout: 60_000, windowsHide: true }))
  try {
    const exposed = campaign(dir, ['--no-cache', '--in-place'])
    assert.equal(exposed.status, 0, exposed.stdout + exposed.stderr)
    assert.match(exposed.stderr, /live for/)
    for (const sleeper of sleepers) assert.match(exposed.stderr, new RegExp(`\\b${sleeper.pid}\\b`))
  } finally {
    for (const sleeper of sleepers) sleeper.kill('SIGKILL')
  }
  const blind = campaign(dir, ['--no-cache', '--in-place'], { QUALITY_HARNESS_PROCESS_LIST: path.join(dir, 'no-such-lister') })
  assert.equal(blind.status, 0, blind.stdout + blind.stderr)
  assert.match(blind.stderr, /could not look/)
})
