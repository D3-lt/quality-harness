// BACKLOG §332: a rename onto a file in use is retried while Windows says it is busy, and the two
// writers whose readers poll — a campaign's owner record and a lease — go through it.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { take } from '../plugin/scripts/lease.mjs'
import { replaceFile } from '../plugin/scripts/replace-file.mjs'
import { addOwned } from '../plugin/scripts/worktree.mjs'

// A rename that answers each code in turn, then renames for real.
const flaky = (codes) => {
  const calls = []
  const rename = (from, to) => {
    calls.push([from, to])
    const code = codes.shift()
    if (code) throw Object.assign(new Error(`${code}: rename`), { code })
    return renameSync(from, to)
  }
  return { rename, calls }
}
const scratch = () => realpathSync(mkdtempSync(path.join(os.tmpdir(), 'qh-replace-')))

test('a rename Windows reports busy is retried, a growing wait apart, until it succeeds', () => {
  const dir = scratch()
  try {
    const from = path.join(dir, 'a.tmp')
    mkdirSync(from)
    const { rename, calls } = flaky(['EPERM', 'EBUSY', 'EACCES'])
    const waits = []
    replaceFile(from, path.join(dir, 'a'), { rename, sleep: ms => waits.push(ms), waitMs: 10 })
    assert.equal(calls.length, 4, 'three busy answers, then the rename that went through')
    assert.deepEqual(waits, [10, 20, 30], 'a wait after each busy answer, longer each time, and none after the success')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('any other failure is thrown at once, and a rename that stays busy is thrown in the end', () => {
  const missing = flaky(['ENOENT'])
  const waits = []
  assert.throws(() => replaceFile('a.tmp', 'a', { rename: missing.rename, sleep: ms => waits.push(ms) }), /ENOENT/)
  assert.equal(missing.calls.length, 1, 'a missing source is not retried')
  const busy = flaky(Array(10).fill('EPERM'))
  assert.throws(() => replaceFile('a.tmp', 'a', { rename: busy.rename, sleep: ms => waits.push(ms), tries: 3, waitMs: 1 }), /EPERM/)
  assert.equal(busy.calls.length, 3, 'it gives up after its tries')
  assert.deepEqual(waits, [1, 2], 'and waits only between tries, never after the last')
})

test("a campaign's owner record and a lease are both written through the retry", () => {
  const dir = scratch()
  try {
    const owner = flaky(['EPERM'])
    addOwned(dir, { child: 4242 }, { rename: owner.rename })
    assert.equal(owner.calls.length, 2, 'the owner record retried its busy rename')
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8')).child, 4242)
    const leases = path.join(dir, 'leases')
    const lease = flaky(['EBUSY'])
    const held = take(leases, { command: 'probe', root: dir, rename: lease.rename })
    assert.equal(held.error, undefined, String(held.error))
    assert.equal(lease.calls.length, 2, 'the lease retried its busy rename')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
