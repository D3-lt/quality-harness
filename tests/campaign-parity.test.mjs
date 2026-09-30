// ADR-075 T4: an isolated campaign grades what an in-place one grades. `compareRuns` must be able
// to say "dirty" as well as "clean" (CLAUDE.md §4), and the script is run end to end over the
// spec's fixture repository, never over this checkout (tests/campaign-fixture.mjs).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { compareRuns } from '../scripts/campaign-parity.mjs'
import { campaignEnv, campaignFixture } from './campaign-fixture.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parity = path.join(repoRoot, 'scripts', 'campaign-parity.mjs')

test('compareRuns finds a mismatch in a verdict, a baseline or the entries, and none in equal runs', () => {
  const run = { answer: 'RED', other: 'RED' }
  assert.deepEqual(compareRuns(run, { ...run }), [])
  assert.deepEqual(compareRuns(run, { answer: 'GREEN', other: 'RED' }), [{ label: 'answer', inPlace: 'RED', isolated: 'GREEN' }])
  // A baseline that did not pass is its own verdict, so a difference there is a mismatch too.
  assert.deepEqual(compareRuns(run, { answer: 'UNPROVEN', other: 'RED' }), [{ label: 'answer', inPlace: 'RED', isolated: 'UNPROVEN' }])
  assert.deepEqual(compareRuns(run, { answer: 'RED' }), [{ label: 'other', inPlace: 'RED', isolated: 'not selected' }])
})

test('the parity script finds no mismatch over the fixture repository, and builds each worktree in under 2 s', () => {
  const dir = campaignFixture()
  const run = spawnSync(process.execPath, [parity, '--root', dir],
    { cwd: dir, env: campaignEnv(), encoding: 'utf8', timeout: 240_000, windowsHide: true })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const summary = run.stdout.match(/^parity: (\d+) entries, (\d+) mismatches; worktree built in (\d+) ms$/m)
  assert.ok(summary, `no summary line:\n${run.stdout}`)
  assert.equal(Number(summary[1]), 3, 'the fixture holds three entries')
  assert.equal(Number(summary[2]), 0)
  assert.ok(Number(summary[3]) < 2000, `the worktree took ${summary[3]} ms`)
})

test('a worktree slower than its budget fails the parity run', () => {
  const dir = campaignFixture()
  const run = spawnSync(process.execPath, [parity, '--root', dir, '--case', 'answer'],
    { cwd: dir, env: campaignEnv({ QUALITY_HARNESS_PARITY_BUDGET_MS: '-1' }), encoding: 'utf8', timeout: 240_000, windowsHide: true })
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout, /^parity: 1 entries, 0 mismatches; worktree built in \d+ ms$/m)
})

// Codex review of ADR-075: two campaigns ended by their timeout after the same first row agree on
// every row they printed. A run is compared only when it finished and graded its whole selection.
test('a campaign that did not finish, or left a selected entry out, cannot be compared', async () => {
  const { incomplete, verdictsOf } = await import('../scripts/campaign-parity.mjs')
  const whole = { status: 0, signal: null, stdout: 'RED      answer  <- killed by:\n       answer is 42\nRED      other\n\n2/2 mutations were noticed.\n' }
  assert.deepEqual(verdictsOf(whole.stdout), { answer: 'RED', other: 'RED' }, 'a RED that names no killer was not read')
  assert.equal(incomplete(whole, ['answer', 'other']), null)
  const cut = { status: null, signal: 'SIGTERM', error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }), stdout: 'RED      answer  <- killed by:\n       answer is 42\n' }
  assert.match(incomplete(cut, ['answer', 'other']), /did not finish \(ETIMEDOUT\)/)
  assert.match(incomplete({ ...whole, stdout: 'RED      answer\n\n1/1 mutations were noticed.\n' }, ['answer', 'other']), /no verdict for 1 of the 2 selected entries, other first/)
  assert.match(incomplete({ status: 0, signal: null, stdout: 'RED      answer\nRED      other\n' }, ['answer', 'other']), /no summary/)
})
