// A publish refused after a fast check passed said "no `qh-check` has passed on its current tree": untrue,
// a fast check had. ADR-081 lets a fast pass through only a command proven to be one commit, and a
// compound form (`git commit -F m && echo`) is not one, so the refusal stands; its sentence now says
// which of the two it is (an agent's commit in a worktree, 2026-10-08). The twin: with no pass at all,
// the sentence is unchanged.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const qhCheck = join(plugin, 'scripts', 'qh-check.mjs')
const lifecycle = join(plugin, 'scripts', 'lifecycle.mjs')
const { NODE_TEST_CONTEXT: _nested, CLAUDE_CODE_SESSION_ID: _session, QUALITY_HARNESS_CHECK_AGAIN: _again, ...baseEnv } = process.env

function repository() {
  const top = realpathSync(mkdtempSync(join(os.tmpdir(), 'qh-fast-wording-')))
  const dir = join(top, 'repo')
  spawnSync('git', ['init', '-q', dir], { timeout: 10_000, windowsHide: true })
  writeFileSync(join(dir, '.quality-harness.json'), `${JSON.stringify({ check: 'test -f notes.txt', fastCheck: 'test -f notes.txt' })}\n`)
  writeFileSync(join(dir, 'notes.txt'), 'the session changed something\n')
  return { top, dir, env: { ...baseEnv, CLAUDE_PLUGIN_ROOT: plugin, QUALITY_HARNESS_LEASE_DIR: join(top, 'leases') } }
}
const reason = (fixture, command) => {
  const run = spawnSync(process.execPath, [lifecycle], {
    cwd: fixture.dir, env: fixture.env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, session_id: 'fast-wording', cwd: fixture.dir }),
  })
  const out = JSON.parse(run.stdout).hookSpecificOutput
  return { decision: out?.permissionDecision ?? null, text: out?.permissionDecisionReason ?? '' }
}

test('a refusal after a fast pass says the fast check passed and why it does not count here', () => {
  const fixture = repository()
  try {
    const fast = spawnSync(process.execPath, [qhCheck, '--fast'], { cwd: fixture.dir, env: fixture.env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(fast.status, 0, fast.stderr)
    assert.ok(existsSync(join(fixture.dir, '.git', 'quality-harness', 'fast-checks.jsonl')))
    const refused = reason(fixture, 'git commit -m x && echo done')
    assert.equal(refused.decision, 'deny', refused.text)
    assert.match(refused.text, /a fast check \(`test -f notes\.txt`\) passed on its current tree/)
    assert.match(refused.text, /not proven to be one commit/)
    assert.doesNotMatch(refused.text, /no `qh-check` has passed/)
  } finally { rmSync(fixture.top, { recursive: true, force: true }) }
})

test('a refusal with no pass at all keeps saying no qh-check has passed', () => {
  const fixture = repository()
  try {
    const refused = reason(fixture, 'git commit -m x && echo done')
    assert.equal(refused.decision, 'deny', refused.text)
    assert.match(refused.text, /no `qh-check` has passed on its current tree/)
  } finally { rmSync(fixture.top, { recursive: true, force: true }) }
})
