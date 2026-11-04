// ADR-139 T1: a shard runs the i-th of n slices of the test files. Every file must be in exactly one slice, and the slices must
// not depend on the platform's separator or on the order the files were listed in (the class BACKLOG §449 closed in adr-next:
// "the one read first" followed the platform's sort).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sliceFiles } from '../scripts/test-slice.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(repoRoot, 'scripts', 'test-slice.mjs')
const files = readdirSync(path.join(repoRoot, 'tests')).filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`)

test('every test file is in exactly one slice, whatever the platform or the order given', () => {
  assert.ok(files.length > 10, 'the real list')
  for (const n of [1, 2, 3, 4]) {
    const slices = Array.from({ length: n }, (_, k) => sliceFiles(files, k + 1, n))
    const all = slices.flat()
    assert.equal(all.length, files.length, `n=${n}: no file twice, none lost`)
    assert.deepEqual([...all].sort(), [...files].sort(), `n=${n}: the union is the list`)
    for (const slice of slices) assert.ok(slice.length >= Math.floor(files.length / n), `n=${n}: no slice short by more than one`)
    const shuffled = [...files].reverse().map(name => name.replaceAll('/', '\\'))
    for (let k = 1; k <= n; k++) {
      assert.deepEqual(sliceFiles(shuffled, k, n).map(name => name.replaceAll('\\', '/')), slices[k - 1], `n=${n} k=${k}: order and separator do not matter`)
    }
  }
  assert.deepEqual(sliceFiles(['b', 'a', 'c', 'd'], 1, 2), ['a', 'c'])
  assert.deepEqual(sliceFiles(['b', 'a', 'c', 'd'], 2, 2), ['b', 'd'])
  assert.deepEqual(sliceFiles(['B', 'a'], 1, 2), ['B'], 'code-unit order, not the locale: the same on every platform')

  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const ok = run('2/2', 'b', 'a', 'c', 'd')
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(ok.stdout, 'b\nd\n')
  for (const bad of ['0/3', '4/3', 'a/3', '1/0', '1', '1/3/2', '-1/3', '1.5/3']) {
    const refused = run(bad, 'a')
    assert.equal(refused.status, 2, `${bad} is refused`)
    assert.match(refused.stderr, /test-slice: /, `${bad} says why`)
  }
})
