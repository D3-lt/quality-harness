// ADR-104 T2: three readers of git's options before the verb answered `-c user.<key>=<value>`
// three ways — commitOnlyCommand not at all, freshRepositoryCommit for name and email only,
// leavesHookInPlace for any user key. A `user.` key names an identity and runs nothing, so
// all three now read the same constant. The twins are keys that can run a program or switch
// a hook off, and the chained form that stays not-one-commit (ADR-081).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
// ADR-130: namespace bindings keep locked, retired test bodies loadable after their policy APIs were removed.
import * as retiredPolicy from './helpers/node-hooks/publish-command.mjs'
const { commitOnlyCommand, freshRepositoryCommit, leavesHookInPlace } = retiredPolicy
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const { NODE_TEST_CONTEXT: _nested, CLAUDE_CODE_SESSION_ID: _session, QUALITY_HARNESS_CHECK_AGAIN: _again, ...baseEnv } = process.env

const IDENTITIES = ['-c user.name=x', '-c user.email=x@e.invalid', '-c user.signingkey=x']
const NOT_IDENTITIES = ['-c core.hooksPath=x', '-c alias.ci=x', '-c user.name']

// What a fast pass decides through the real PreToolUse hook.
function fastPassDecision(command) {
  const top = realpathSync(mkdtempSync(join(os.tmpdir(), 'qh-identity-')))
  try {
    const dir = join(top, 'repo')
    spawnSync('git', ['init', '-q', dir], { timeout: 10_000, windowsHide: true })
    writeFileSync(join(dir, '.quality-harness.json'), `${JSON.stringify({ check: 'test -f notes.txt', fastCheck: 'test -f notes.txt' })}\n`)
    writeFileSync(join(dir, 'notes.txt'), 'changed\n')
    const env = { ...baseEnv, CLAUDE_PLUGIN_ROOT: plugin, QUALITY_HARNESS_LEASE_DIR: join(top, 'leases') }
    const fast = spawnSync(process.execPath, [join(plugin, 'scripts', 'qh-check.mjs'), '--fast'], { cwd: dir, env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(fast.status, 0, fast.stderr)
    const run = spawnSync(process.execPath, [join(plugin, 'scripts', 'lifecycle.mjs')], {
      cwd: dir, env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, session_id: 'identity', cwd: dir }),
    })
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.trim().startsWith('{') ? JSON.parse(run.stdout).hookSpecificOutput?.permissionDecision ?? null : null
  } finally { remove(top) }
}

test('a commit with a user identity reads the same at all three readers, and other -c keys do not', { skip: 'ADR-130: compulsory check policy retired' }, () => {
  const fresh = option => `R=$(mktemp -d) && cd "$R" && git init -q && git ${option} commit -q --allow-empty -m f`
  for (const option of IDENTITIES) {
    assert.equal(commitOnlyCommand(`git ${option} commit -m y`), true, option)
    assert.equal(commitOnlyCommand(`git ${option} -C d commit -m y`), true, option)
    assert.equal(freshRepositoryCommit(fresh(option), {}), true, option)
    assert.equal(leavesHookInPlace(`git ${option} commit -m y`), true, option)
  }
  for (const option of NOT_IDENTITIES) {
    assert.equal(commitOnlyCommand(`git ${option} commit -m y`), false, option)
    assert.equal(freshRepositoryCommit(fresh(option), {}), false, option)
    assert.equal(leavesHookInPlace(`git ${option} commit -m y`), false, option)
  }
  // ADR-081 admits one commit and nothing else: the chain stays not one commit.
  assert.equal(commitOnlyCommand('git -c user.name=x commit -m y; echo done'), false)
  // Through the hook: on a fast pass the identity form goes through, the hooks-path form does not.
  assert.notEqual(fastPassDecision('git -c user.name=x commit -m y'), 'deny')
  assert.equal(fastPassDecision('git -c core.hooksPath=x commit -m y'), 'deny')
  // A commit's fast pass runs this file.
  assert.match(JSON.parse(readFileSync(join(repoRoot, '.quality-harness.json'), 'utf8')).fastCheck, /tests\/commit-identity\.test\.mjs/)
})
