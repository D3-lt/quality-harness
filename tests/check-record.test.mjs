// BACKLOG section 376: what a run leaves behind, as functions of what they are handed. How a finished child ended is decided
// once (a signal is no verdict; a spawn error is `unstarted`, never `failed`), the row is the same shape whatever wrote it,
// and the row a prose-only reuse stands in as claims no more than the pass it reuses. Each case has its dirty twin.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyRun, proseReuseRow, runRecord } from '../plugin/scripts/check-record.mjs'

const kept = text => Buffer.from(text, 'utf8')
const finished = (code, signal = null) => ({ code, signal, error: null })

test('a run that ended by itself earns the verdict of its exit; one a signal ended earns none', () => {
  assert.deepEqual(classifyRun({ ended: finished(0), received: null, kept: kept('ok'), command: 'make check' }), { signal: null, exit: 0, verdict: 'passed' })
  const failed = classifyRun({ ended: finished(1), received: null, kept: kept('1 failed'), command: 'make check' })
  assert.equal(failed.exit, 1)
  assert.equal(failed.verdict, 'failed')
  // A signal this process forwarded wins over the one the child reports, and either one ends the verdict.
  assert.deepEqual(classifyRun({ ended: finished(null, 'SIGKILL'), received: 'SIGTERM', kept: kept(''), command: 'make check' }),
    { signal: 'SIGTERM', exit: null, verdict: 'interrupted' })
  const killed = classifyRun({ ended: finished(null, 'SIGKILL'), received: null, kept: kept(''), command: 'make check' })
  assert.deepEqual(killed, { signal: 'SIGKILL', exit: null, verdict: 'interrupted' })
  // A signal beside an exit 0 is still no verdict: it did not finish.
  assert.equal(classifyRun({ ended: finished(0), received: 'SIGINT', kept: kept('ok'), command: 'make check' }).verdict, 'interrupted')
})

test('a check that could not start is `unstarted`, never a failure of the project\'s code', () => {
  const error = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
  assert.deepEqual(classifyRun({ ended: { code: null, signal: null, error }, received: null, kept: kept(''), command: 'nope' }),
    { signal: null, exit: null, verdict: 'unstarted' })
  // Even with a signal beside it: the check never ran, so there is nothing a signal interrupted.
  assert.equal(classifyRun({ ended: { code: null, signal: null, error }, received: 'SIGTERM', kept: kept(''), command: 'nope' }).verdict, 'unstarted')
})

test('the row of a run carries what it is handed, the neighbours as they are recorded, and prose only when declared', () => {
  const seen = { live: [{ file: '/a', pid: 1 }], unknown: [{ file: '/b', error: 'EACCES' }] }
  const base = { id: 'r1', git: true, command: 'make check', origin: 'declared', before: { at: 'b' }, after: { at: 'a' },
    run: { exit: 0, signal: null, verdict: 'passed' }, cores: 10, contended: false, beside: seen, besideAtEnd: null, waitedMs: 5, prose: { specs: [] } }
  const row = runRecord(base)
  assert.deepEqual(Object.keys(row), ['id', 'at', 'git', 'command', 'origin', 'before', 'after', 'exit', 'signal', 'verdict', 'cores', 'contended',
    'beside', 'besideAtEnd', 'waitedMs'])
  assert.equal(row.at, 'a')
  assert.deepEqual(row.beside, [{ pid: 1 }, { error: 'EACCES' }], 'a neighbour is kept without the path of its lease file')
  assert.equal(row.besideAtEnd, null)
  assert.equal('prose' in row, false)
  assert.deepEqual(runRecord({ ...base, prose: { specs: ['docs'] } }).prose, ['docs'])
})

test('the row a prose-only reuse stands in as claims no more than the pass it reuses', () => {
  const original = { id: 'p1', origin: 'declared', verdict: 'passed', cores: 8, contended: true, before: { at: 'T0' }, after: { at: 'T1' } }
  const already = { record: original, now: { tree: 't2', head: 'h2' } }
  const row = proseReuseRow({ already, prose: { specs: ['docs'] }, git: true, command: 'make check' }, 'new-id', 'NOW')
  assert.equal(row.id, 'new-id')
  assert.equal(row.at, 'NOW')
  assert.deepEqual([row.before.at, row.after.at], ['T0', 'T1'], 'its times are the original\'s')
  assert.deepEqual([row.before.tree, row.after.tree], ['t2', 't2'], 'its tree is this one')
  assert.deepEqual([row.exit, row.signal, row.verdict, row.cores, row.contended], [0, null, 'passed', 8, true])
  assert.deepEqual([row.beside, row.besideAtEnd, row.waitedMs, row.prose, row.reusedFrom], [null, null, 0, ['docs'], 'p1'])
  // A reuse of a reuse points at the pass that actually ran.
  assert.equal(proseReuseRow({ already: { ...already, record: { ...original, reusedFrom: 'p0' } }, prose: { specs: [] }, git: true, command: 'x' }, 'i', 'n').reusedFrom, 'p0')
})
