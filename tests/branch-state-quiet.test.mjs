// ADR-122 T3: the per-prompt brief is said again only when what it reports about the branch changes. The working tree's path
// count moves with every edit the agent makes and already knows of; measured 2026-10-22, the brief was about 151k characters
// of the 368k this plugin put into one session's contexts, mostly reprints whose only change was that count.
import assert from 'node:assert/strict'
import test from 'node:test'
import { briefUnchanged } from '../plugin/scripts/branch-state.mjs'

const line = (dirty, rest = ', 10 ahead of origin · CI 4312e5d: every job concluded success.') =>
  `branch-state: main @ f62fd960, ${dirty}${rest}`

test('the brief is not said again when only the uncommitted count changed', () => {
  assert.equal(briefUnchanged(line('5 uncommitted path(s)'), line('9 uncommitted path(s)')), true, 'a count that moved')
  assert.equal(briefUnchanged(line('clean'), line('3 uncommitted path(s)')), true, 'clean to dirty')
  // DIRTY twins: what the brief reports about the branch is said when it changes.
  assert.equal(briefUnchanged(line('clean'), line('clean', ', 11 ahead of origin · CI 4312e5d: every job concluded success.')), false, 'ahead moved')
  assert.equal(briefUnchanged(line('clean'), line('clean', ', 10 ahead of origin · CI 4312e5d: a job failed.')), false, 'CI changed')
  assert.equal(briefUnchanged(line('clean'), 'branch-state: main @ abc1234, clean, 10 ahead of origin · CI 4312e5d: every job concluded success.'), false, 'HEAD moved')
  assert.equal(briefUnchanged(line('clean'), line('cleanliness COULD NOT LOOK')), false, 'a could-not-look is said')
  assert.equal(briefUnchanged(undefined, line('clean')), false, 'nothing said before')
})
