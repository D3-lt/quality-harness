// BACKLOG §475.2: release-evidence chooses its own run at a sha, while release.mjs took the assets from the run it waited for.
// With two runs at one sha (a dispatch started after that wait, a tie, a run deleted between listings) those were different
// runs, which ADR-126 Decision 1 ("one run per release") does not allow, and a re-run changes a run's attempt under one id
// (the Codex review of 26dbf7dee). release-evidence now names the run and attempt it judged; the release takes its assets
// from exactly that run, and publishes nothing if the run was re-run after it was judged.
import assert from 'node:assert/strict'
import test from 'node:test'
import { main } from '../scripts/release-evidence.mjs'
import { SHA, landPush, tagged, world } from './helpers/release-world.mjs'

const assetsFrom = calls => calls.filter(line => line.startsWith('node scripts/release-assets.mjs ')).map(line => line.split(' ')[2])
const tagPushes = calls => calls.filter(line => line.startsWith('git push') && line.includes('refs/tags/'))
const named = (run, attempt = 1, sha = SHA) => `SUCCESS — evidence\nrelease-evidence judged run ${run} attempt ${attempt} at ${sha}\n`

test('the assets come from the run and attempt release-evidence judged', () => {
  const one = world({ runs: [[landPush()]] })
  assert.equal(one.run(), 0, one.said.join('\n'))
  assert.deepEqual(assetsFrom(one.calls), ['3'], 'one run at the sha: its own')
  const view = one.calls.indexOf(`gh run view 3 --json attempt,headSha`)
  assert.ok(view > one.calls.findIndex(line => line.startsWith('node scripts/release-assets.mjs ')), 'the attempt is read after the download')
  assert.ok(view < one.calls.findIndex(line => line.startsWith('git push') && line.includes('refs/tags/')), 'and before the tag')

  // The landing's run was waited for, and the evidence judged another run at the sha: the assets come from that one.
  const other = world({ runs: [[landPush()]], evidenceText: named(4) })
  assert.equal(other.run(), 0, other.said.join('\n'))
  assert.deepEqual(assetsFrom(other.calls), ['4'])
})

test('a success that names no run, another sha, or a run re-run since, publishes nothing', () => {
  for (const [what, over, prepared] of [
    ['no run named', { evidenceText: 'SUCCESS — evidence\n' }, false],
    ['a run of another sha', { evidenceText: named(3, 1, 'b'.repeat(40)) }, false],
    ['a run re-run after it was judged', { attempt: 2 }, true],
  ]) {
    const w = world({ runs: [[landPush()]], ...over })
    assert.equal(w.run(), 2, `${what}: ${w.said.join('\n')}`)
    assert.equal(assetsFrom(w.calls).length, prepared ? 1 : 0, `${what}: assets prepared`)
    assert.deepEqual(tagPushes(w.calls), [], `${what}: no tag`)
    assert.ok(!tagged(w.calls), `${what}: no release`)
    assert.match(w.said.join('\n'), /nothing was published/, what)
  }
})

test('release-evidence names the run and attempt it cleared, and only when it cleared one', () => {
  const said = []
  const job = { name: 'windows', status: 'completed', conclusion: 'success' }
  const run = { databaseId: 9, attempt: 2, status: 'completed', conclusion: 'success', headSha: SHA, headBranch: `land/${SHA}`, event: 'push', jobs: [job] }
  const seams = fetched => ({ fetch: () => fetched, declared: () => ['windows'], full: () => true, forge: null, log: line => said.push(line),
    outside: () => ({ verdict: 'success', reason: 'attested', tag: 'v1.0.0' }), review: () => ({ verdict: 'success', reason: 'reviewed' }) })
  assert.equal(main([SHA], seams(run)), 0, said.join('\n'))
  assert.ok(said.includes(`release-evidence judged run 9 attempt 2 at ${SHA}`), said.join('\n'))
  said.length = 0
  assert.equal(main([SHA], seams({ ...run, jobs: [{ ...job, conclusion: 'failure' }] })), 1)
  assert.ok(!said.some(line => line.startsWith('release-evidence judged run')), said.join('\n'))
})
