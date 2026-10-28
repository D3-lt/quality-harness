// SessionEnd hands its work to a detached copy of the hook (plugin/scripts/lifecycle.mjs `endsBehind`): the host gives every
// SessionEnd hook together 1.5 s and cancelled this one on a loaded machine, so no row was written (2026-10-15).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const lifecycle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'node-hooks', 'lifecycle.mjs')
const { QUALITY_HARNESS_SESSION_END_RUNNER: _inline, NODE_TEST_CONTEXT: _nested, ...baseEnv } = process.env

function box(label) {
  const top = mkdtempSync(path.join(os.tmpdir(), `qh-end-behind-${label}-`))
  const tmp = path.join(top, 'tmp')
  const place = path.join(top, 'place')
  mkdirSync(tmp)
  mkdirSync(place)
  const env = { ...baseEnv, CLAUDE_PLUGIN_DATA: path.join(top, 'data'), TMPDIR: tmp, TMP: tmp, TEMP: tmp }
  const end = (session, extra = {}) => spawnSync(process.execPath, [lifecycle], {
    cwd: top, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...env, ...extra },
    input: JSON.stringify({ hook_event_name: 'SessionEnd', reason: 'prompt_input_exit', session_id: session, cwd: place }),
  })
  const rows = () => {
    const file = path.join(top, 'data', 'sessions.jsonl')
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  }
  // A detached copy may still hold the temp directory as its working directory for a moment on Windows.
  const clean = () => rmSync(top, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  return { top, place, end, rows, clean }
}

async function until(probe, what) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const found = probe()
    if (found) return found
    await sleep(100)
  }
  assert.fail(`${what} within 60 s`)
}

test('SessionEnd returns before its work, and hands its input to a detached copy of the hook', async () => {
  const { top, place, end, clean } = box('runner')
  try {
    // A stand-in runner that waits for the test's word, so the hook's return is seen while the work has not started.
    const runner = path.join(top, 'runner.mjs')
    writeFileSync(runner, [
      "import { existsSync, writeFileSync } from 'node:fs'",
      'const dir = process.env.FAKE_END_DIR',
      'const deadline = Date.now() + 60_000',
      "while (!existsSync(`${dir}/go`) && Date.now() < deadline) await new Promise(done => setTimeout(done, 50))",
      "writeFileSync(`${dir}/ran.json`, JSON.stringify({ argv: process.argv.slice(2), input: JSON.parse(process.env.QUALITY_HARNESS_HOOK_INPUT ?? 'null') }))",
    ].join('\n'))
    const run = end('behind-runner', { QUALITY_HARNESS_SESSION_END_RUNNER: runner, FAKE_END_DIR: top })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(existsSync(path.join(top, 'ran.json')), false, 'the hook returned while its copy was still waiting')
    writeFileSync(path.join(top, 'go'), '')
    const ran = await until(() => existsSync(path.join(top, 'ran.json')) && JSON.parse(readFileSync(path.join(top, 'ran.json'), 'utf8')), 'the copy ran')
    assert.deepEqual(ran.argv, ['--session-end'])
    assert.equal(ran.input.hook_event_name, 'SessionEnd')
    assert.equal(ran.input.session_id, 'behind-runner')
    assert.equal(ran.input.cwd, place)
  } finally { clean() }
})

test('the detached copy writes the session row, and inline or with no data home the hook writes it itself', async () => {
  const { top, end, rows, clean } = box('real')
  try {
    const run = end('behind-real')
    assert.equal(run.status, 0, run.stderr)
    const row = await until(() => rows().find(entry => entry.session === 'behind-real'), 'the row the detached copy writes')
    assert.equal(row.reason, 'prompt_input_exit')
    // DIRTY twins: inline, the hook's own stderr is where a failure is said (a data home that is a file cannot be written,
    // and only a hook that did the work itself can say so); with no data home it is said here, not in a copy nobody reads.
    const blocked = path.join(top, 'data-is-a-file')
    writeFileSync(blocked, '')
    const inline = end('behind-inline', { QUALITY_HARNESS_SESSION_END_RUNNER: 'inline', CLAUDE_PLUGIN_DATA: blocked })
    assert.equal(inline.status, 0, inline.stderr)
    assert.match(inline.stderr, /could not append to the sessions ledger/)
    assert.doesNotMatch(inline.stderr, /does not exist/, 'inline is a setting, not a runner that is missing')
    const homeless = end('behind-homeless', { CLAUDE_PLUGIN_DATA: '' })
    assert.equal(homeless.status, 0)
    assert.match(homeless.stderr, /CLAUDE_PLUGIN_DATA is not set/)
  } finally { clean() }
})

test('a runner that does not exist is said, and the hook records the end itself', () => {
  // Codex review of 6b1879c7: node returns a pid for a script that does not exist, so the hook gave its work to a copy that
  // died at once, and no row and no word were left.
  const { top, end, rows, clean } = box('missing')
  try {
    const run = end('behind-missing', { QUALITY_HARNESS_SESSION_END_RUNNER: path.join(top, 'no-such-runner.mjs') })
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stderr, /no-such-runner\.mjs does not exist/)
    assert.ok(rows().some(entry => entry.session === 'behind-missing'), 'the row is written by the hook when it returns')
  } finally { clean() }
})
