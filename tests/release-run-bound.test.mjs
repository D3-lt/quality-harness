// BACKLOG §475.2: release-evidence judges the newest selftest run at a sha (`selectRun`), while release.mjs took the assets
// from the release run it waited for. With two runs at one sha (a dispatch started after that wait, or one on another branch)
// the two were different runs, which ADR-126 Decision 1 ("one run per release") does not allow. The release now reads the
// newest run before and after release-evidence, takes the assets from it when it is the same completed run both times, and
// otherwise stops before anything is published.
import assert from 'node:assert/strict'
import test from 'node:test'
import { SHA, landPush, tagged, world } from './helpers/release-world.mjs'

const assetsFrom = calls => calls.filter(line => line.startsWith('node scripts/release-assets.mjs ')).map(line => line.split(' ')[2])
const tagPushes = calls => calls.filter(line => line.startsWith('git push') && line.includes('refs/tags/'))
// A dispatch on main at the same sha, newer than the landing's run: the run release-evidence judges once it exists.
const laterDispatch = (status = 'completed') => ({ databaseId: 4, event: 'workflow_dispatch', status, headSha: SHA, headBranch: 'main', createdAt: '2026-10-20T00:10:00Z' })
// The listings, in the order release.mjs asks: whether a release run exists, the wait for it, before the evidence, after it.
const listings = (...answers) => world({ runs: answers })

test('the assets come from the run release-evidence judged', () => {
  const one = listings([landPush()])
  assert.equal(one.run(), 0, one.said.join('\n'))
  assert.deepEqual(assetsFrom(one.calls), ['3'], 'one run at the sha: its own')

  // The landing's run was waited for, and a newer dispatch at the sha existed before the evidence was asked: it is judged,
  // and the assets come from it, not from the run waited for.
  const two = listings([landPush()], [landPush()], [laterDispatch(), landPush()])
  assert.equal(two.run(), 0, two.said.join('\n'))
  assert.deepEqual(assetsFrom(two.calls), ['4'])
})

test('a newest run that changed across the evidence, or cannot be read, publishes nothing', () => {
  for (const [what, w] of [
    ['a dispatch started while the evidence was asked', listings([landPush()], [landPush()], [landPush()], [laterDispatch('in_progress'), landPush()])],
    ['a completed one, too', listings([landPush()], [landPush()], [landPush()], [laterDispatch(), landPush()])],
    ['a listing that cannot be read after it', listings([landPush()], [landPush()], [landPush()], [])],
    ['nor before it', listings([landPush()], [landPush()], [], [landPush()])],
    ['a newest run of another sha', listings([landPush()], [landPush()], [{ ...laterDispatch(), headSha: 'b'.repeat(40) }, landPush()])],
    ['the newest still running both times', listings([landPush()], [landPush()], [laterDispatch('in_progress'), landPush()])],
  ]) {
    assert.equal(w.run(), 2, `${what}: ${w.said.join('\n')}`)
    assert.deepEqual(assetsFrom(w.calls), [], `${what}: no assets prepared`)
    assert.deepEqual(tagPushes(w.calls), [], `${what}: no tag`)
    assert.ok(!tagged(w.calls), `${what}: no release`)
    assert.match(w.said.join('\n'), /cannot be told; nothing was published/, what)
  }
})
