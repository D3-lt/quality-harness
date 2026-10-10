// A project's own `.quality-harness.json` that cannot be read is not a project with nothing declared.
// qh-check ran the INFERRED check instead and recorded a pass for it: a trailing comma in the file
// replaced `"check": "<real gate>"` with `npm run test`, exit 0, and the publish refusal read that pass
// (a read of the declaration collapsed "could not read" into "absent", CLAUDE.md §3, ADR-005).
// Absent, valid-without-a-check, and a wrongly typed `check` keep their documented behaviour.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { runCheck } from '../plugin/scripts/qh-check.mjs'

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-config-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

let projects = 0
const WEAK = { scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'inferred-ran.txt\',\'x\')"' } }

// A repository whose manifest offers a weak inferred check and whose config is `config` (text, or null for none).
function project(config) {
  const dir = path.join(scratch, `project-${projects++}`)
  mkdirSync(dir, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).status, 0)
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(WEAK))
  if (config !== null) writeFileSync(path.join(dir, '.quality-harness.json'), config)
  return dir
}

function sink() {
  const chunks = []
  return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') }
}

const run = (dir, options = {}) => {
  const err = sink()
  return runCheck({ cwd: dir, stdout: sink(), stderr: err, loadavg: () => [0, 0, 0], cores: 4, ...options }).then(code => ({ code, err: err.text() }))
}

const ranInferred = dir => existsSync(path.join(dir, 'inferred-ran.txt'))
const recorded = dir => existsSync(path.join(stateDir(dir), 'checks.jsonl'))

test('a config that is not valid JSON runs no replacement check and records no pass', async () => {
  const dir = project('{"check": "exit 1", "fastCheck": "exit 1",}')
  const { code, err } = await run(dir)
  assert.equal(code, 2, err)
  assert.match(err, /\.quality-harness\.json is not valid JSON/, err)
  assert.match(err, /UNRUN/, err)
  assert.equal(ranInferred(dir), false, 'the inferred check must not run in place of the declared one')
  assert.equal(recorded(dir), false, 'and no pass is recorded for it')
})

test('--fast says the config could not be read, not that nothing is declared', async () => {
  const dir = project('{"fastCheck": "exit 1",}')
  const { code, err } = await run(dir, { fast: true })
  assert.equal(code, 2, err)
  assert.match(err, /\.quality-harness\.json is not valid JSON/, err)
  assert.doesNotMatch(err, /nothing to run/, err)
})

test('a config that cannot be read at all, and one that is not an object, are the same refusal', async () => {
  const unreadable = project(null)
  mkdirSync(path.join(unreadable, '.quality-harness.json'))
  const first = await run(unreadable)
  assert.equal(first.code, 2, first.err)
  assert.match(first.err, /\.quality-harness\.json could not be read/, first.err)
  assert.equal(ranInferred(unreadable), false)
  const array = project('[]')
  const second = await run(array)
  assert.equal(second.code, 2, second.err)
  assert.match(second.err, /\.quality-harness\.json is not a JSON object/, second.err)
  assert.equal(ranInferred(array), false)
  const nothing = project('null')
  const third = await run(nothing)
  assert.equal(third.code, 2, third.err)
  assert.equal(ranInferred(nothing), false)
  for (const scalar of ['7', 'true', '"text"']) {
    const dir = project(scalar)
    const answer = await run(dir)
    assert.equal(answer.code, 2, `${scalar}: ${answer.err}`)
    assert.match(answer.err, /is not a JSON object/, answer.err)
    assert.equal(ranInferred(dir), false, scalar)
  }
})

test('a config that starts with a byte-order mark is refused and says so (a Windows run of 3.8.18)', async () => {
  const dir = project('﻿{"check": "exit 0"}')
  const { code, err } = await run(dir)
  assert.equal(code, 2, err)
  assert.match(err, /starts with a byte-order mark/, err)
  assert.equal(ranInferred(dir), false)
})

test('a dangling link where the config should be is unreadable, not absent', async t => {
  const dir = project(null)
  // A junction needs no privilege on Windows and reaches the same "link to nothing" path (a Windows run of 3.8.18).
  const windows = process.platform === 'win32'
  try { symlinkSync(windows ? path.join(dir, 'missing-dir') : 'no-such-target.json', path.join(dir, '.quality-harness.json'), windows ? 'junction' : undefined) } catch (error) {
    t.skip(`this account cannot create a link here (${error.code})`)
    return
  }
  const { code, err } = await run(dir)
  assert.equal(code, 2, err)
  assert.match(err, /\.quality-harness\.json could not be read/, err)
  assert.equal(ranInferred(dir), false)
})

test('twins: no config, a config with no check, and a check of the wrong type still run the inferred check', async () => {
  for (const config of [null, '{}', '{"check": 5}']) {
    const dir = project(config)
    const { code, err } = await run(dir)
    assert.equal(code, 0, `${config}: ${err}`)
    assert.equal(ranInferred(dir), true, `${config}: the inferred check ran`)
    assert.match(err, /\(inferred\)/, err)
  }
})

test('a valid declared check still runs, and a fixed config runs again', async () => {
  const dir = project('{"check": "node -e \\"require(\'fs\').writeFileSync(\'declared-ran.txt\',\'x\')\\""}')
  const { code, err } = await run(dir)
  assert.equal(code, 0, err)
  assert.equal(existsSync(path.join(dir, 'declared-ran.txt')), true)
  assert.equal(ranInferred(dir), false)
})

test('a refused config that is then repaired runs the declared check on the next run', async () => {
  const dir = project('{"check": "exit 1",}')
  assert.equal((await run(dir)).code, 2)
  writeFileSync(path.join(dir, '.quality-harness.json'), '{"check": "node -e \\"require(\'fs\').writeFileSync(\'repaired-ran.txt\',\'x\')\\""}')
  const { code, err } = await run(dir)
  assert.equal(code, 0, err)
  assert.equal(existsSync(path.join(dir, 'repaired-ran.txt')), true)
  assert.equal(ranInferred(dir), false)
})
