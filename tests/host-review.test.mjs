// ADR-062: a host returns the review schema, or unavailable. No second model paraphrases it.
import assert from 'node:assert/strict'
import test from 'node:test'
import { CODEX_MODEL, PI_UNMEASURED, hostReview, reviewFromOutput } from '../plugin/scripts/host-review.mjs'

const finding = {
  file: 'a.js', problem: 'p', impact: 'i', evidence: 'a.js:1', minimal_fix: 'f', severity: 'blocking',
}

test('a host review is the schema or unavailable', () => {
  const schema = JSON.stringify({ status: 'blocking', findings: [finding], model: CODEX_MODEL })
  const parsed = reviewFromOutput(schema, { host: 'codex', effort: 'high' })
  assert.equal(parsed.status, 'blocking')
  assert.equal(parsed.bound, 'reported')
  assert.equal(parsed.model, CODEX_MODEL)
  assert.deepEqual(parsed.findings, [finding])

  const unproven = reviewFromOutput(JSON.stringify({ status: 'clean', findings: [] }), { host: 'cursor' })
  assert.equal(unproven.status, 'clean')
  assert.equal(unproven.bound, 'unproven')

  const prose = hostReview({ host: 'codex', effort: 'high', output: 'VERDICT: APPROVE\n' })
  assert.equal(prose.status, 'unavailable')
  assert.match(prose.reason, /schema/)

  let spawned = false
  const absent = hostReview({
    host: 'codex', effort: 'high', resolve: () => null, run: () => { spawned = true },
  })
  assert.equal(absent.status, 'unavailable')
  assert.match(absent.reason, /absent/)
  assert.equal(spawned, false)

  const badEffort = hostReview({ host: 'codex', effort: 'low', run: () => { spawned = true } })
  assert.equal(badEffort.status, 'unavailable')
  assert.equal(spawned, false)

  const cursor = hostReview({
    host: 'cursor', resolve: () => null, run: () => { spawned = true },
  })
  assert.equal(cursor.status, 'unavailable')
  assert.match(cursor.reason, /absent/)
  assert.equal(spawned, false)

  const cursorSchema = hostReview({
    host: 'cursor',
    output: JSON.stringify({ status: 'clean', findings: [], model: 'composer-2.5-fast' }),
    run: () => { spawned = true },
  })
  assert.equal(cursorSchema.status, 'clean')
  assert.equal(cursorSchema.bound, 'reported')
  assert.equal(cursorSchema.model, 'composer-2.5-fast')
  assert.equal(spawned, false)

  const pi = hostReview({ host: 'pi', resolve: () => '/usr/bin/pi', run: () => { spawned = true } })
  assert.equal(pi.status, 'unavailable')
  assert.equal(pi.reason, PI_UNMEASURED)
  assert.equal(spawned, false)
})
