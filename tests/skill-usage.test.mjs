// ADR-084 T1: which of this plugin's skills an adopter's session invokes is counted, by one silent
// PreToolUse branch that writes `skill.invoked` to the session log and returns before anything else.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readEvents } from '../plugin/scripts/event-log.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-skill-usage-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
spawnSync('git', ['init', '-q'], { cwd: scratch, timeout: 30_000, windowsHide: true })
const skillCall = (session, skill) => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')], {
  cwd: scratch, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill }, session_id: session, cwd: scratch }),
})

test('a Skill call is recorded in the session log and prints nothing', () => {
  const run = skillCall('skill-1', 'quality-harness:review')
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, '', 'a Skill call printed into the session')
  const log = readEvents(scratch, 'skill-1')
  assert.equal(log.complete, true)
  // Only the one event: the branch returns before the generic event record and the pass import.
  assert.deepEqual(log.map(({ event, skill }) => ({ event, skill })), [{ event: 'skill.invoked', skill: 'quality-harness:review' }])
})

test("the Skill hook is registered and records only this plugin's skills", () => {
  const hooks = JSON.parse(readFileSync(path.join(repoRoot, 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks
  const routed = (hooks.PreToolUse ?? []).filter(entry => new RegExp(`^(?:${entry.matcher})$`).test('Skill'))
  assert.equal(routed.length, 1, 'no PreToolUse registration routes Skill')
  assert.ok(routed[0].hooks.some(hook => (hook.args ?? []).some(arg => arg.endsWith('/scripts/lifecycle.mjs'))))
  const run = skillCall('skill-2', 'other-plugin:thing')
  assert.equal(run.stdout, '')
  assert.deepEqual([...readEvents(scratch, 'skill-2')], [], "another plugin's skill was recorded")
})
