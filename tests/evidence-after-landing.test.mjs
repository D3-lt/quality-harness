// ADR-126 T4: an outside run is asked for once the landing's run is green, so its attestation arrives after the landing.
// Before anything lands only the review question stops a release; once the sha is on main an uncommitted attestation is the
// release's evidence, since nothing is pushed after the landing for git's pre-push hook to see.
import assert from 'node:assert/strict'
import test from 'node:test'
import { main } from '../scripts/release-evidence.mjs'
import { LANDING, pushed, SHA, world } from './helpers/release-world.mjs'

const ATTESTATION = '?? docs/corpus-reports/2026-10-22-win-wcag-3.8.53-aaaaaaa.json'

test('before the landing only the review question stops a release', () => {
  const said = []
  const fetch = () => { throw new Error('--review fetched a run') }
  const missing = { verdict: 'unproven', kind: 'missing', reason: 'no outside run', tag: 'v1.0.0' }
  const reviewed = { verdict: 'success', reason: 'covered' }
  const unreviewed = { verdict: 'unproven', kind: 'unreviewed', reason: '1 commit no review covers' }
  assert.equal(main(['--review', SHA], { fetch, outside: () => missing, review: () => reviewed, log: line => said.push(line) }), 0,
    'a missing outside run is not asked before the landing')
  assert.equal(main(['--review', SHA], { fetch, outside: () => missing, review: () => unreviewed, log: line => said.push(line) }), 2)
  assert.match(said.join('\n'), /no recorded review/)
  // Through the release: a missing review stops it before anything is checked or pushed.
  const stopped = world({ origin: 'b'.repeat(40), review: 2 })
  assert.equal(stopped.run(), 2, stopped.said.join('\n'))
  assert.ok(stopped.calls.includes(`node scripts/release-evidence.mjs --review ${SHA}`))
  assert.ok(!stopped.calls.some(line => line.startsWith('node plugin/scripts/qh-check.mjs')) && !stopped.calls.includes(LANDING))
})

test("a landed sha's release takes an uncommitted attestation, and an unlanded one does not", () => {
  const landed = world({ porcelain: ATTESTATION })
  assert.equal(landed.run(), 0, landed.said.join('\n'))
  assert.ok(!pushed(landed.calls), 'already on main: nothing is pushed')
  // DIRTY twins: not yet landed, and an attestation beside any other change.
  const early = world({ porcelain: ATTESTATION, origin: 'b'.repeat(40) })
  assert.equal(early.run(), 2)
  assert.match(early.said.join('\n'), /uncommitted attestation/)
  const mixed = world({ porcelain: `${ATTESTATION}\n M scripts/land.mjs` })
  assert.equal(mixed.run(), 2)
  assert.match(mixed.said.join('\n'), /not clean/)
})
