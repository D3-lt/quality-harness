// ADR-101 T1: the session log has one verdict reader. `treeChecked` was `checkStanding === 'passed'` spelled a second way;
// this proves the two agree on every generated log shape, keeping the removed body here so the proof outlives it, and holds
// that the second spelling cannot come back.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as ledger from './helpers/node-hooks/check-ledger.mjs'

const { checkStanding, latestCheckFor } = ledger
// The body `treeChecked` had (check-ledger.mjs, before ADR-101 T1).
const removedTreeChecked = (log, tree) => latestCheckFor(log, tree)?.event === 'check.passed'

const TREE = 't'.repeat(40)
const whole = events => Object.assign([...events], { complete: true })
const torn = events => Object.assign([...events], { complete: false })

// Every log of up to three check events on the tree (plus one on another tree), each a pass or a failure, stamped by
// `seq`, by `startedAt`, or not at all, with ties and a re-import of the same record among them; whole and torn.
function* logs() {
  const kinds = ['check.passed', 'check.failed', 'check.timeout']
  const stamps = [{ seq: 1 }, { seq: 2 }, { seq: 2 }, { startedAt: '2026-10-13T00:00:01Z' }, { startedAt: '2026-10-13T00:00:01Z' }, {}]
  const event = (kind, stamp, record) => ({ event: kind, after: { tree: TREE }, ...stamp, ...(record ? { record } : {}) })
  const singles = []
  for (const kind of kinds) for (const stamp of stamps) for (const record of [null, 'r1', 'r2']) singles.push(event(kind, stamp, record))
  const other = { event: 'check.passed', after: { tree: 'o'.repeat(40) }, seq: 9 }
  yield whole([])
  for (const a of singles) {
    yield whole([a]); yield torn([a]); yield whole([a, other])
    for (const b of singles) {
      yield whole([a, b]); yield torn([a, b])
    }
  }
  for (const a of singles.slice(0, 18)) for (const b of singles.slice(0, 18)) for (const c of singles.slice(0, 18)) yield whole([a, b, c])
  yield Object.assign([event('check.passed', { seq: 1 })], { complete: true }).concat([{ event: 'check.source-unreadable' }])
}

test('the session log verdict is checkStanding passed on every generated log', () => {
  let count = 0
  for (const log of logs()) {
    count += 1
    assert.equal(checkStanding(log, TREE) === 'passed', removedTreeChecked(log, TREE), JSON.stringify(log))
  }
  assert.ok(count > 5000, `the generator must cover the shapes it names, made ${count}`)
  // The two spellings are shown able to say both answers, or agreement proves nothing.
  assert.equal(checkStanding(whole([{ event: 'check.passed', after: { tree: TREE }, seq: 1 }]), TREE), 'passed')
  assert.notEqual(checkStanding(torn([{ event: 'check.passed', after: { tree: TREE }, seq: 1 }]), TREE), 'passed')
})

test('check-ledger exports no treeChecked', () => {
  assert.equal('treeChecked' in ledger, false)
})
