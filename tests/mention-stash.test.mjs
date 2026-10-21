// ADR-120 T13 (Decision 13): `git stash push` is a stash, and the advisory arm no longer mentions a push for it. A real push,
// with or without options before the subcommand, still is one. The Go core answers the same rows (qh-core-parity reads them).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { mentionsCommitOrPush } from '../plugin/scripts/publish-verdict.mjs'
import { required } from './helpers/require.mjs'

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be tested here` : false)

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

// The Go twin's own test (core/hooks/publish_stash_test.go), run from here so the suite reaches it.
test("the Go core's stash rows answer as the Node ones do", { skip: noGo }, () => {
  const run = spawnSync('go', ['test', '-count=1', '-run', '^TestStashPushIsNoMention$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true,
  })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /^ok\s/m, 'the Go test ran')
})
