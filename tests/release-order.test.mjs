// ADR-126 T5: a release lands its bumped candidate once, waits for every job of that landing's own run (the full campaign,
// T1), asks for the outside runs when release-evidence says they are missing, and tags. It dispatches nothing, and each wait
// has its own deadline: one bound over the landing and the campaign together ran out on 3.8.52 with nothing wrong.
import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatched, landPush, SHA, tagged, world } from './helpers/release-world.mjs'

const protectedForge = { state: 'protected', text: 'forge: main requires 1 status check(s)', required: [{ context: 'windows', integration: 15368 }] }
const check = status => ({ total_count: 1, check_runs: [{ id: 1, name: 'windows', status, conclusion: status === 'completed' ? 'success' : null, started_at: '2026-10-22T00:00:00Z', app: { id: 15368 } }] })
const landing = (status = 'completed') => ({ ...landPush(), status })

test("release waits for every job of the landing's run and dispatches nothing", () => {
  const w = world({ origin: 'b'.repeat(40), protection: protectedForge, runs: [[landing('in_progress')], [landing('in_progress')], [landing()]] })
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.ok(!dispatched(w.calls), 'the landing run is the campaign; nothing is dispatched')
  assert.ok(tagged(w.calls))
  assert.ok(w.calls.filter(line => line.startsWith('gh run list --commit')).length >= 3, 'waited until the landing run completed')
})

test('each wait has its own deadline, and a missing outside run is asked for, not waited out', () => {
  // Seventy minutes of required checks inside land, then seventy more of the landing's run: each under the ninety-minute
  // bound, together past it. One deadline over both ran out on 3.8.52 with nothing wrong.
  const slow = world({
    origin: 'b'.repeat(40), protection: protectedForge,
    checkRunsSeq: [...Array(70).fill(check('in_progress')), check('completed')],
    runs: [...Array(70).fill([landing('in_progress')]), [landing()]],
  })
  assert.equal(slow.run(), 0, slow.said.join('\n'))
  assert.ok(tagged(slow.calls))
  // Missing outside run: the request is printed and the release stops, asked once rather than polled.
  const missing = world({ origin: 'b'.repeat(40), runs: [[landing()]], evidence: [2],
    evidenceText: 'UNPROVEN (aaaaaaa) — 1 reader file(s) changed since the last tag and docs/corpus-reports/ holds no attestation\nDo NOT tag this sha. CI is green and nobody outside has run the readers it ships\n' })
  assert.equal(missing.run(), 2, missing.said.join('\n'))
  assert.match(missing.said.join('\n'), /corpus-probe\.mjs --json/)
  assert.match(missing.said.join('\n'), new RegExp(`land/${SHA}`))
  assert.ok(!tagged(missing.calls))
  assert.equal(missing.calls.filter(line => line.endsWith(`scripts/release-evidence.mjs ${SHA}`)).length, 1, 'asked once, not polled')
})
