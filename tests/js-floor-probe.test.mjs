// ADR-139 T3: the JavaScript floor runs serially (--test-concurrency=1, for a deterministic figure: scripts/coverage.sh) unless
// QUALITY_HARNESS_JS_CONCURRENCY=default asks for node's default concurrency, which a non-required probe job measures beside the
// serial floor on five landings before the floor may switch. QH_COVERAGE_DRY=1 prints the JS command and runs nothing.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { testBash } from './helpers/bash.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the JavaScript floor is serial unless told default, and refuses anything else', () => {
  const run = concurrency => {
    const env = { ...process.env, QH_COVERAGE_DRY: '1' }
    delete env.QUALITY_HARNESS_JS_CONCURRENCY
    if (concurrency !== undefined) env.QUALITY_HARNESS_JS_CONCURRENCY = concurrency
    return spawnSync(testBash(), [path.join(repoRoot, 'scripts', 'coverage.sh'), '--js'], { cwd: repoRoot, env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  }
  const serial = run(undefined)
  assert.equal(serial.status, 0, serial.stderr)
  assert.match(serial.stdout, /^js command: node --test --test-concurrency=1 --experimental-test-coverage /m, 'unset: serial, as before')
  const parallel = run('default')
  assert.equal(parallel.status, 0, parallel.stderr)
  assert.match(parallel.stdout, /^js command: node --test --experimental-test-coverage /m, 'default: node decides')
  for (const bad of ['4', 'x', '']) {
    const refused = run(bad)
    assert.equal(refused.status, 2, `"${bad}" is refused`)
    assert.match(refused.stderr, new RegExp(`QUALITY_HARNESS_JS_CONCURRENCY="${bad}"`), 'naming the value')
  }
})
