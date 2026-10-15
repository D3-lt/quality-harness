// Stage 2 of the plan to make the check fast (BACKLOG §378): one long test file run as several processes. publish-command.test.mjs
// is 51 tests and 125 s (measured 2026-10-14), it bounds the per-commit fast check, and 296 locks under 9 ADR tasks name its
// tests by file, so its bodies cannot move. Sharded, it registers only every Nth top-level test, and a shard file runs another
// slice of the same module; unsharded (QH_TEST_SHARDED unset) it registers every test, as every acceptance fence expects.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { sharded } from './helpers/shard.mjs'

const testsDir = path.dirname(fileURLToPath(import.meta.url))

const registry = () => {
  const names = []
  const fake = (name) => { names.push(name) }
  fake.marker = 'kept'
  return { names, fake }
}

test('sharded, every top-level test is registered by exactly one shard', () => {
  const names = Array.from({ length: 10 }, (_, index) => `t${index}`)
  const seen = []
  for (let shard = 0; shard < 3; shard += 1) {
    const { names: got, fake } = registry()
    const wrapped = sharded(fake, { of: 3, env: { QH_TEST_SHARDED: '1' }, shard })
    for (const name of names) wrapped(name)
    assert.equal(wrapped.marker, 'kept', 'the properties of test (test.skip, test.after, ...) are kept')
    seen.push(...got)
  }
  assert.deepEqual([...seen].sort(), [...names].sort(), 'no test lost, none twice')
})

test('unsharded, the file registers every test, whichever shard asks', () => {
  for (const env of [{}, { QH_TEST_SHARDED: '' }, { QH_TEST_SHARDED: '0' }]) {
    const { names, fake } = registry()
    const wrapped = sharded(fake, { of: 3, env, shard: 0 })
    for (const name of ['a', 'b', 'c', 'd']) wrapped(name)
    assert.deepEqual(names, ['a', 'b', 'c', 'd'], JSON.stringify(env))
  }
})

test('every sharded file has a shard file for each slice it is cut into', () => {
  // A slice with no file to run it is tests nobody runs, the failure this whole plan exists to prevent.
  const source = readFileSync(path.join(testsDir, 'publish-command.test.mjs'), 'utf8')
  const of = Number(source.match(/sharded\(nodeTest, \{ of: (\d+) \}\)/)?.[1])
  assert.ok(of >= 2, 'publish-command.test.mjs is sharded')
  for (let shard = 1; shard < of; shard += 1) {
    const file = path.join(testsDir, `publish-command.shard-${shard}.test.mjs`)
    assert.ok(existsSync(file), `${path.basename(file)} runs slice ${shard}`)
    assert.match(readFileSync(file, 'utf8'), new RegExp(`QH_TEST_SHARD = ${shard}\\b`), `${path.basename(file)} names slice ${shard}`)
  }
  assert.equal(existsSync(path.join(testsDir, `publish-command.shard-${of}.test.mjs`)), false, 'no file for a slice that does not exist')
})

test('every command that turns sharding on runs every shard file', () => {
  // QH_TEST_SHARDED=1 with the file but not its shard files runs one slice and drops the rest, silently.
  const repoRoot = path.resolve(testsDir, '..')
  const config = JSON.parse(readFileSync(path.join(repoRoot, '.quality-harness.json'), 'utf8'))
  for (const [where, command] of Object.entries(config)) {
    if (typeof command !== 'string' || !/QH_TEST_SHARDED=1/.test(command) || !/publish-command\.test\.mjs/.test(command)) continue
    for (const shard of [1, 2]) assert.match(command, new RegExp(`publish-command\\.shard-${shard}\\.test\\.mjs`), `${where} runs slice ${shard}`)
  }
  assert.match(config.fastCheck, /QH_TEST_SHARDED=1/, 'the fast check, which publish-command bounded, is sharded')
  // The gate runs tests/*.test.mjs, which holds every shard file, with sharding on.
  assert.match(readFileSync(path.join(repoRoot, 'scripts', 'selftest.sh'), 'utf8'), /^QH_TEST_SHARDED=1 .*\\$/m)
})
