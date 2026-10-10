import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from '../plugin/scripts/lazily.mjs'

test('once: a read happens when first asked for, once, and every ask gets that answer', () => {
  let reads = 0
  const read = once(() => { reads += 1; return { n: reads } })
  assert.equal(reads, 0, 'nothing is read until it is asked for')
  const first = read()
  assert.equal(read(), first)
  assert.equal(read(), first)
  assert.equal(reads, 1)
})

test('once: an answer that is undefined or falsy is still the answer, not a reason to read again', () => {
  let reads = 0
  const nothing = once(() => { reads += 1 })
  assert.equal(nothing(), undefined)
  assert.equal(nothing(), undefined)
  const zero = once(() => { reads += 1; return 0 })
  assert.equal(zero(), 0)
  assert.equal(zero(), 0)
  assert.equal(reads, 2)
})
