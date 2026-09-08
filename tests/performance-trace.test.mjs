import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { startPerformanceTrace } from '../plugin/scripts/performance-trace.mjs'
import { analyzeTrace } from '../scripts/event-trace.mjs'

function capture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh-perf-'))
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  return { root, env: { QUALITY_HARNESS_TRACE_FILE: path.join(root, 'trace.jsonl'),
    QUALITY_HARNESS_TRACE_UNTIL: String(Date.now() + 60_000) } }
}

test('operation records redact payloads and preserve timeout and outcome evidence', t => {
  const { env } = capture(t)
  const finish = startPerformanceTrace('synthetic', 'private prompt and file path', env)
  finish('timeout', { status: null, timedOut: true, cleanupConfirmed: true, error: new Error('secret path') })
  finish('completed', { status: 0 })
  const raw = readFileSync(env.QUALITY_HARNESS_TRACE_FILE, 'utf8')
  assert.doesNotMatch(raw, /private prompt|secret path/)
  const report = analyzeTrace(raw)
  assert.deepEqual(report.problems, [])
  assert.equal(report.observed, 1, 'finish is one-shot')
  assert.equal(report.handlers[0].timeouts, 1)
  assert.equal(report.handlers[0].outcomes.timeout, 1)
  assert.equal(report.handlers[0].failures, 1)
  for (const outcome of [null, false, {}, 'bad value']) {
    const rows = raw.trim().split('\n').map(JSON.parse)
    rows[1].outcome = outcome
    assert.ok(analyzeTrace(rows.map(JSON.stringify).join('\n')).problems.length > 0)
  }
})

test('disabled, expired, full and unavailable trace targets never change execution', t => {
  const { env, root } = capture(t)
  for (const setting of [{}, { ...env, QUALITY_HARNESS_TRACE_UNTIL: '0' },
    { ...env, QUALITY_HARNESS_TRACE_UNTIL: String(Date.now() + 16 * 60_000) },
    { ...env, QUALITY_HARNESS_TRACE_FILE: 'relative.jsonl' },
    { ...env, QUALITY_HARNESS_TRACE_FILE: root }]) {
    assert.doesNotThrow(() => startPerformanceTrace('synthetic', '', setting)('completed', { status: 0 }))
    assert.equal(existsSync(env.QUALITY_HARNESS_TRACE_FILE), false)
  }
  const fill = Buffer.alloc(8 * 1024 * 1024, 32)
  writeFileSync(env.QUALITY_HARNESS_TRACE_FILE, fill)
  startPerformanceTrace('synthetic', '', env)('completed', { status: 0 })
  // A failing Buffer diff can exhaust the mutation runner while formatting megabytes.
  assert.equal(readFileSync(env.QUALITY_HARNESS_TRACE_FILE).equals(fill), true,
    'full trace stays byte-for-byte unchanged')
})

test('an exhausted real artifact batch records unchecked work without a clean verdict', t => {
  const { env, root } = capture(t)
  const script = fileURLToPath(new URL('../plugin/scripts/run-shell-hook.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script, 'facts-gate-dispatch.sh', '--batch'], {
    input: JSON.stringify({ paths: [path.join(root, 'record.md')], deadline: Date.now() - 1,
      windowMs: 1000, timeoutMs: 100 }), env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10_000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /All remaining artifacts were not checked/)
  const report = analyzeTrace(readFileSync(env.QUALITY_HARNESS_TRACE_FILE, 'utf8'))
  assert.deepEqual(report.problems, [])
  assert.equal(report.handlers[0].outcomes['budget-exhausted'], 1)
  assert.equal(report.handlers[0].outcomes.processed, undefined)
})

test('trace destinations cannot modify a checkout, a gated file or its aliases', t => {
  const { env, root } = capture(t)
  const gated = path.join(root, 'artifact.jsonl')
  const original = '{"artifact":"unchanged"}\n'
  writeFileSync(gated, original)
  const run = file => startPerformanceTrace('synthetic', '', { ...env, QUALITY_HARNESS_TRACE_FILE: file },
    [realpathSync.native(gated)])('completed', { status: 0 })
  run(gated)
  assert.equal(readFileSync(gated, 'utf8'), original)
  const hardlink = path.join(root, 'alias.jsonl')
  linkSync(gated, hardlink)
  run(hardlink)
  assert.equal(readFileSync(gated, 'utf8'), original)
  rmSync(hardlink)
  const checkout = path.join(root, 'checkout')
  mkdirSync(checkout)
  mkdirSync(path.join(checkout, '.git'))
  const inside = path.join(checkout, 'diagnostic.jsonl')
  run(inside)
  assert.equal(existsSync(inside), false, 'even an otherwise unrelated checkout stays untouched')
  const alias = path.join(root, 'checkout-alias')
  symlinkSync(checkout, alias, process.platform === 'win32' ? 'junction' : 'dir')
  run(path.join(alias, 'diagnostic.jsonl'))
  assert.equal(existsSync(inside), false, 'a symlinked parent cannot conceal a checkout')
  const script = fileURLToPath(new URL('../plugin/scripts/run-shell-hook.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script, 'facts-gate-dispatch.sh', '--batch'], {
    input: JSON.stringify({ paths: [gated], deadline: Date.now() - 1, windowMs: 1000, timeoutMs: 100 }),
    env: { ...process.env, ...env, QUALITY_HARNESS_TRACE_FILE: gated }, encoding: 'utf8', timeout: 10_000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /All remaining artifacts were not checked/)
  assert.equal(readFileSync(gated, 'utf8'), original, 'the real batch passes its gated paths to the recorder')
  const inputAlias = path.join(root, 'input-alias')
  symlinkSync(root, inputAlias, process.platform === 'win32' ? 'junction' : 'dir')
  const deleted = path.join(root, 'deleted.jsonl')
  startPerformanceTrace('synthetic', '', { ...env, QUALITY_HARNESS_TRACE_FILE: deleted },
    [path.join(inputAlias, 'deleted.jsonl')])('completed', { status: 0 })
  assert.equal(existsSync(deleted), false, 'a trace must not recreate a deleted artifact through an alias')
})
