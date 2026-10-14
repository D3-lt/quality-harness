// Stage 1 of the plan to make the check fast (BACKLOG §378): the runner the gate starts its test files through. Measured
// 2026-10-14 on node 24: `node --test` sorts the files it is given (c, b, a ran as a, b, c), so the order stage 1 computed never
// reached the runner, and an A/B of three pairs showed no gain. node:test's run() keeps the order given. This holds the runner to
// the order, and to the CLI's verdict: it exits 1 exactly when node --test would.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { exitCodeFor } from '../scripts/run-tests.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'scripts', 'run-tests.mjs')

const fixture = files => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-run-tests-'))
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body)
  return dir
}
const run = (dir, args, extra = {}) => {
  const env = { ...process.env, ...extra }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [runner, ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true, env })
}
const stamp = name => "import test from 'node:test'\nimport { appendFileSync } from 'node:fs'\n"
  + `test('${name}', async () => { appendFileSync('order.log', '${name}\\n'); await new Promise(r => setTimeout(r, 50)) })\n`

test('the runner starts the files in the order it is given them', () => {
  const dir = fixture({ 'a.test.mjs': stamp('a'), 'b.test.mjs': stamp('b'), 'c.test.mjs': stamp('c') })
  try {
    const got = run(dir, ['--concurrency', '1', '--', 'c.test.mjs', 'a.test.mjs', 'b.test.mjs'])
    assert.equal(got.status, 0, got.stdout + got.stderr)
    assert.deepEqual(readFileSync(path.join(dir, 'order.log'), 'utf8').trim().split('\n'), ['c', 'a', 'b'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a run with no summary did not pass', () => {
  assert.equal(exitCodeFor(true), 0)
  assert.equal(exitCodeFor(false), 1)
  assert.equal(exitCodeFor(null), 1, 'a run that could not say how it went')
  assert.equal(exitCodeFor(undefined), 1)
})

test('the runner exits 1 exactly when node --test would', () => {
  const dir = fixture({
    'green.test.mjs': "import test from 'node:test'\ntest('g', () => {})\n",
    'red.test.mjs': "import test from 'node:test'\nimport assert from 'node:assert'\ntest('r', () => assert.equal(1, 2))\n",
    'todo.test.mjs': "import test from 'node:test'\nimport assert from 'node:assert'\ntest('t', { todo: true }, () => assert.equal(1, 2))\n",
    'broken.test.mjs': "throw new Error('does not load')\n",
  })
  try {
    for (const [files, cli] of [[['green.test.mjs'], 0], [['todo.test.mjs'], 0], [['red.test.mjs'], 1], [['broken.test.mjs'], 1], [['green.test.mjs', 'red.test.mjs'], 1]]) {
      const env = { ...process.env }
      delete env.NODE_TEST_CONTEXT
      const reference = spawnSync(process.execPath, ['--test', ...files], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true, env })
      assert.equal(reference.status, cli, `node --test ${files.join(' ')}`)
      assert.equal(run(dir, ['--', ...files]).status, cli, `run-tests ${files.join(' ')}`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the runner keeps the spec output, the per-file times and a TAP transcript where it is told to', () => {
  const dir = fixture({ 'one.test.mjs': "import test from 'node:test'\ntest('the only test', () => {})\n" })
  try {
    const times = path.join(dir, 'times.jsonl')
    const tap = path.join(dir, 'run.tap')
    const got = run(dir, ['--times', times, '--tap', tap, '--', 'one.test.mjs'], { QH_SELFTEST_ROOT: dir })
    assert.equal(got.status, 0, got.stdout + got.stderr)
    assert.match(got.stdout, /✔ the only test/)
    assert.equal(JSON.parse(readFileSync(times, 'utf8')).files[0].file, 'one.test.mjs')
    assert.match(readFileSync(tap, 'utf8'), /^ok 1 - the only test$/m)
    // CLEAN twin: with neither asked for, neither is written.
    rmSync(times); rmSync(tap)
    assert.equal(run(dir, ['--', 'one.test.mjs']).status, 0)
    assert.equal(existsSync(times) || existsSync(tap), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a usage error is refused before anything runs', () => {
  for (const args of [['--concurrency', '0', '--', 'x.test.mjs'], ['--nope', '--', 'x.test.mjs'], ['--']]) {
    const got = run(repoRoot, args)
    assert.equal(got.status, 2, `${args.join(' ')}: ${got.stderr}`)
    assert.match(got.stderr, /usage: run-tests\.mjs/)
  }
})
