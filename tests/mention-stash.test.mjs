// ADR-120 T13 (Decision 13): `git stash push` is a stash, and the advisory arm no longer mentions a push for it. A real push,
// with or without options before the subcommand, still is one. The Go core answers the same rows (qh-core-parity reads them).
import assert from 'node:assert/strict'
import test from 'node:test'

import { mentionsCommitOrPush } from '../plugin/scripts/publish-verdict.mjs'

test('git stash push is no push, and a real push is still mentioned', () => {
  for (const command of ['git stash push', 'git stash push -m wip', 'git -C sub stash push', 'git -c x=y stash push -u',
    'git --no-pager stash push', 'git stash push && git stash push', 'echo ok; git stash push -m "wip"']) {
    assert.equal(mentionsCommitOrPush(command), false, command)
  }
  // DIRTY twins: the same words where a push is real, or where the stash rule must not reach.
  for (const command of ['git push', 'git -c x=y push', 'git stash push && git push', 'git push; git stash push',
    'git stash push; git commit -m x', 'git stash',
    'echo stash push', 'git stash push-x; git stash push && echo push', 'ngit stash push']) {
    assert.equal(mentionsCommitOrPush(command), command !== 'git stash', command)
  }
  assert.equal(mentionsCommitOrPush('git stash push'.replace('git', 'git\t')), false, 'a tab between the words is the same command')
})

test('git stash push repeated without a separator is still no push', () => {
  for (const command of ['git stash push git stash push', 'git stash push git stash push git stash push']) {
    assert.equal(mentionsCommitOrPush(command), false, command)
  }
  assert.equal(mentionsCommitOrPush('git stash push git stash push git push'), true)
})
