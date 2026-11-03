// A release resumed after its landing took the full check and the dead-code scan again before asking for its outside run:
// v3.8.67 ran the gate four more times after landing, at load 20-35, and a contended retake stopped it twice with nothing
// left to push (the owner, 2026-11-03). A sha whose check passed here and that is on main takes neither again; every other
// sha still does. Against the shared fake world, which never writes this repository (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { checkedPasses } from '../scripts/release.mjs'
import { remove } from './helpers/remove.mjs'
import { landPush, pushed, SHA, tagged, world } from './helpers/release-world.mjs'

const checked = calls => calls.filter(line => line.startsWith('node plugin/scripts/qh-check.mjs')).length
const scanned = calls => calls.includes('bash scripts/dead-code-scan.sh')

test('a landed sha whose check passed here takes no second check or scan, and every other sha still does', () => {
  const resumed = world({ checkedPasses: [SHA], runs: [[landPush()]] })
  assert.equal(resumed.run(), 0, resumed.said.join('\n'))
  assert.equal(checked(resumed.calls), 0, 'no second full check')
  assert.ok(!scanned(resumed.calls), 'no second dead-code scan')
  assert.ok(tagged(resumed.calls) && !pushed(resumed.calls))
  assert.match(resumed.said.join('\n'), /already on main and its full check and dead-code scan passed here/)
  // On main but never checked here (landed by land.mjs alone): the check and the scan are taken.
  const unchecked = world({ runs: [[landPush()]] })
  assert.equal(unchecked.run(), 0, unchecked.said.join('\n'))
  assert.equal(checked(unchecked.calls), 1)
  assert.ok(scanned(unchecked.calls))
  // Checked here but not yet on main: the check is taken right before the push, as before.
  const unlanded = world({ checkedPasses: [SHA], origin: 'b'.repeat(40) })
  assert.equal(unlanded.run(), 0, unlanded.said.join('\n'))
  assert.equal(checked(unlanded.calls), 1)
  assert.ok(pushed(unlanded.calls))
})

test('a sha is recorded only after its check and scan passed uncontended', () => {
  const fresh = world({ origin: 'b'.repeat(40) })
  assert.equal(fresh.run(), 0, fresh.said.join('\n'))
  assert.deepEqual(fresh.state.recorded, [SHA])
  const red = world({ origin: 'b'.repeat(40), check: 1 })
  assert.equal(red.run(), 1)
  assert.equal(red.state.recorded, undefined, 'a red check records nothing')
  const dead = world({ origin: 'b'.repeat(40), deadCode: 1 })
  assert.equal(dead.run(), 1)
  assert.equal(dead.state.recorded, undefined, 'a dead-code finding records nothing')
  const twice = world({ origin: 'b'.repeat(40), loads: [12, 3, 2, 12] })
  assert.equal(twice.run(), 2)
  assert.equal(twice.state.recorded, undefined, 'a pass contended twice records nothing')
})

test('the record lives in the state directory, and an unreadable line in it records nothing', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'qh-release-checks-'))
  try {
    assert.equal(spawnSync('git', ['init', '-q', repo], { timeout: 30_000, windowsHide: true }).status, 0)
    const env = process.env.QUALITY_HARNESS_STATE_DIR
    delete process.env.QUALITY_HARNESS_STATE_DIR
    try {
      const store = checkedPasses(repo)
      assert.equal(store.has(SHA), false)
      store.add(SHA)
      assert.equal(store.has(SHA), true)
      assert.equal(checkedPasses(repo).has('b'.repeat(40)), false)
      writeFileSync(path.join(repo, '.git', 'quality-harness', 'release-checks.jsonl'), `not json\n{"sha":"${'c'.repeat(40)}"}\n`)
      assert.equal(checkedPasses(repo).has('c'.repeat(40)), true)
      assert.equal(checkedPasses(repo).has(SHA), false)
    } finally {
      if (env === undefined) delete process.env.QUALITY_HARNESS_STATE_DIR
      else process.env.QUALITY_HARNESS_STATE_DIR = env
    }
  } finally { remove(repo) }
})
