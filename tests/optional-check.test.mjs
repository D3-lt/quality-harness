import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { offerPublishHook, pluginRootExport, publishHookExports } from './helpers/node-hooks/publish-verdict.mjs'
import { runPublishHook } from '../plugin/scripts/publish-hook.mjs'
import { readEvents } from '../plugin/scripts/event-log.mjs'
import { required } from './helpers/require.mjs'
import { remove } from './helpers/remove.mjs'
import { sourceCore } from './helpers/source-core.mjs'

const plugin = fileURLToPath(new URL('../plugin/', import.meta.url))
const lifecycle = path.join(plugin, 'scripts', 'lifecycle.mjs')
function fixture(t) {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-optional-')))
  t.after(() => remove(top))
  const root = path.join(top, 'repo')
  mkdirSync(root)
  assert.equal(spawnSync('git', ['init', '-q', root], { timeout: 10_000, windowsHide: true }).status, 0)
  writeFileSync(path.join(root, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs' }))
  writeFileSync(path.join(root, 'check.mjs'), "console.log('ran')\n")
  const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_|CLAUDE_|QUALITY_HARNESS_|QH_|NODE_OPTIONS$|NODE_TEST_CONTEXT$)/.test(key)))
  const env = { ...base, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_ENV_FILE: path.join(top, 'env'),
    CLAUDE_PLUGIN_DATA: path.join(top, 'data'), QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: 'inline',
    QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000', QUALITY_HARNESS_LEASE_DIR: path.join(top, 'leases') }
  env.QUALITY_HARNESS_QH_BIN = sourceCore()
  const hook = (hook_event_name, extra = {}) => {
    const ran = spawnSync(env.QH_TEST_BIN ?? process.execPath, env.QH_TEST_BIN ? ['hook', hook_event_name] : [lifecycle], { cwd: root, env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
      input: JSON.stringify({ hook_event_name, cwd: root, session_id: 'optional', ...extra }) })
    assert.equal(ran.status, 0, ran.stderr)
    return { ...ran, output: ran.stdout.trim() ? JSON.parse(ran.stdout) : {} }
  }
  return { top, root, env, hook }
}

function previousSession(f) {
  mkdirSync(f.env.CLAUDE_PLUGIN_DATA, { recursive: true })
  writeFileSync(path.join(f.env.CLAUDE_PLUGIN_DATA, 'sessions.jsonl'), JSON.stringify({
    at: new Date().toISOString(), reason: 'prompt_input_exit', cwd: f.root, status: 'unverified', files: ['changed.txt'], other: 0,
  }) + '\n')
}

test('an unchecked commit and push receive no check refusal or check nag', t => {
  const f = fixture(t)
  f.env.QUALITY_HARNESS_BASELINE_RUNNER = 'off'
  f.hook('SessionStart', { source: 'startup' })
  writeFileSync(path.join(f.root, 'changed.txt'), 'changed\n')
  for (const command of ['git commit -F -', 'git push', "printf '%s' 'git commit'"]) {
    const result = f.hook('PreToolUse', { tool_name: 'Bash', tool_input: { command } })
    assert.notEqual(result.output.hookSpecificOutput?.permissionDecision, 'deny', result.stdout)
    assert.doesNotMatch(result.stdout, /qh-check|full check|unchecked/i)
  }
  const result = f.hook('Stop', { last_assistant_message: 'Done.' })
  assert.doesNotMatch(result.stdout, /qh-check|no check is|unchecked/i)
  assert.notEqual(result.output.decision, 'block')
})

test('SessionStart neither spawns a baseline nor installs a refusing git hook', t => {
  const f = fixture(t)
  const probe = path.join(f.top, 'probe.mjs')
  const marker = path.join(f.top, 'baseline-started')
  // Intercept the launch synchronously in the hook process; the test starts no baseline child and uses no sleep.
  writeFileSync(probe, "import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module'; import { writeFileSync } from 'node:fs'; const original = cp.spawn; cp.spawn = (...args) => { if (args[1]?.includes('--baseline')) { writeFileSync(process.env.QH_BASELINE_MARKER, 'started'); throw new Error('baseline launch intercepted'); } return original(...args); }; syncBuiltinESMExports();\n")
  f.env.NODE_OPTIONS = `--import=${pathToFileURL(probe).href}`
  f.env.QH_BASELINE_MARKER = marker
  delete f.env.QUALITY_HARNESS_BASELINE_RUNNER
  const started = f.hook('SessionStart', { source: 'startup' })
  assert.doesNotMatch(started.stdout, /Run it through|completion and commit advisories/)
  assert.equal(existsSync(marker), false, 'opening a session must not start the project check')
  const exports = readFileSync(f.env.CLAUDE_ENV_FILE, 'utf8')
  assert.doesNotMatch(exports, /prepare-commit-msg|pre-push|qh-publish-(?:commit|push)/)
})

test('optional checks retain the reviewer and evidence-write guards', t => {
  const f = fixture(t)
  const reviewer = f.hook('PreToolUse', { agent_type: 'quality-harness:qh-correctness-reviewer', tool_name: 'Write', tool_input: { file_path: path.join(f.root, 'file.txt') } })
  assert.equal(reviewer.output.hookSpecificOutput?.permissionDecision, 'deny')
  for (const tool_name of ['Bash', 'PowerShell']) {
    assert.equal(f.hook('PreToolUse', { agent_type: 'quality-harness:qh-correctness-reviewer', tool_name, tool_input: { command: 'git push' } }).output.hookSpecificOutput?.permissionDecision, 'deny')
  }
  const ledger = f.hook('PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(f.root, '.git', 'quality-harness', 'checks.jsonl') } })
  assert.equal(ledger.output.hookSpecificOutput?.permissionDecision, 'deny')
})


test('retired git events do not inspect a torn check ledger or record a commit', t => {
  const f = fixture(t)
  f.hook('SessionStart', { source: 'startup' })
  const state = path.join(f.root, '.git', 'quality-harness')
  writeFileSync(path.join(state, 'checks.jsonl'), '{torn')
  for (const event of ['prepare-commit-msg', 'pre-push']) {
    assert.deepEqual(runPublishHook({ event, cwd: f.root, env: { ...f.env, CLAUDE_CODE_SESSION_ID: 'optional' } }), { code: 0 })
  }
  assert.equal(readEvents(f.root, 'optional').some(row => row.event === 'commit.made'), false)
})

test('commit tracking exports preserve existing git configuration and are installed once', t => {
  const f = fixture(t)
  const env = f.env
  writeFileSync(env.CLAUDE_ENV_FILE, pluginRootExport(plugin))
  const offer = () => offerPublishHook({ cwd: f.root, session: 'optional', env, run: () => ({ status: 0, stdout: 'qhprobe\n' }) })
  offer()
  const first = readFileSync(env.CLAUDE_ENV_FILE, 'utf8')
  offer()
  assert.equal(readFileSync(env.CLAUDE_ENV_FILE, 'utf8'), first)
  assert.doesNotMatch(first, /prepare-commit-msg|pre-push/)
  assert.equal((first.match(/hook\.qh-commit-made\.command/g) ?? []).length, 1)
  if (process.platform === 'win32') return
  const run = spawnSync('sh', ['-c', publishHookExports(process.execPath, path.join(plugin, 'scripts', 'publish-hook.mjs')) + '\nprintf "%s\n" "$GIT_CONFIG_COUNT" "$GIT_CONFIG_KEY_0" "$GIT_CONFIG_VALUE_0" "$GIT_CONFIG_KEY_1" "$GIT_CONFIG_KEY_2" "$GIT_CONFIG_KEY_3"'], {
    cwd: f.root, env: { ...env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'x.existing', GIT_CONFIG_VALUE_0: 'keep' }, encoding: 'utf8', timeout: 10_000,
  })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(run.stdout.trim().split('\n'), ['4', 'x.existing', 'keep', 'hook.qh-commit-made.command', 'hook.qh-commit-made.event', 'hook.qh-commit-made.enabled'])
})

test('post-commit tracks actual commits in this session and linked worktrees', t => {
  const f = fixture(t)
  const git = (cwd, ...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd, env: f.env, encoding: 'utf8', timeout: 10_000, windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git(f.root, 'add', '-A')
  git(f.root, 'commit', '-qm', 'base')
  f.hook('SessionStart', { source: 'startup' })
  const worktree = path.join(f.top, 'worktree')
  git(f.root, 'worktree', 'add', '-qb', 'work', worktree)
  git(worktree, 'commit', '--allow-empty', '-qm', 'unchecked work')
  const env = { ...f.env, CLAUDE_CODE_SESSION_ID: 'optional' }
  assert.deepEqual(runPublishHook({ event: 'post-commit', cwd: worktree, env }), { code: 0 })
  assert.equal(readEvents(f.root, 'optional').filter(row => row.event === 'commit.made').at(-1)?.sha, git(worktree, 'rev-parse', 'HEAD'))
  const stranger = path.join(f.top, 'stranger')
  mkdirSync(stranger)
  git(stranger, 'init', '-q')
  git(stranger, 'commit', '--allow-empty', '-qm', 'foreign work')
  assert.deepEqual(runPublishHook({ event: 'post-commit', cwd: stranger, env }), { code: 0 })
  assert.equal(readEvents(stranger, 'optional').some(row => row.event === 'commit.made'), false)
})

test('Go hooks allow unchecked publishing and turn ends while retaining role and ledger guards', t => {
  const version = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  const absent = required('go', version.error || version.status !== 0 ? 'go is not on PATH' : false)
  if (absent) return t.skip(absent)
  const f = fixture(t)
  const bin = path.join(f.top, process.platform === 'win32' ? 'qh.exe' : 'qh')
  const built = spawnSync('go', ['build', '-o', bin, './cmd/qh'], { cwd: fileURLToPath(new URL('../core/', import.meta.url)), encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(built.status, 0, built.stderr)
  f.env.QH_TEST_BIN = bin
  previousSession(f)
  const started = f.hook('SessionStart', { source: 'startup' })
  assert.match(started.stdout, /previous session in this directory ended/)
  assert.doesNotMatch(started.stdout, /Run it through|before building on them|completion and commit advisories/)
  const exports = readFileSync(f.env.CLAUDE_ENV_FILE, 'utf8')
  f.hook('SessionStart', { source: 'resume' })
  assert.equal(readFileSync(f.env.CLAUDE_ENV_FILE, 'utf8'), exports)
  assert.doesNotMatch(exports, /prepare-commit-msg|pre-push/)
  writeFileSync(path.join(f.root, 'changed.txt'), 'changed\n')
  for (const tool_name of ['Bash', 'PowerShell']) for (const command of ['git commit -F -', 'git push', 'echo commit']) {
    const result = f.hook('PreToolUse', { tool_name, tool_input: { command } })
    assert.notEqual(result.output.hookSpecificOutput?.permissionDecision, 'deny', result.stdout)
    assert.doesNotMatch(result.stdout, /qh-check|full check|unchecked/i)
  }
  for (const event of ['Stop', 'TaskCompleted', 'SubagentStop']) {
    const result = f.hook(event, { last_assistant_message: 'Done.', agent_id: 'worker' })
    assert.doesNotMatch(result.stdout, /qh-check|no check is|unchecked/i)
    assert.notEqual(result.output.decision, 'block')
  }
  const delegated = f.hook('SubagentStart', { agent_id: 'delegate', agent_type: 'worker' })
  assert.match(delegated.stdout, /optionally records a run/)
  assert.doesNotMatch(delegated.stdout, /Before returning after edits, run/)
  for (const tool_name of ['Bash', 'PowerShell']) {
    assert.equal(f.hook('PreToolUse', { agent_type: 'quality-harness:qh-correctness-reviewer', tool_name, tool_input: { command: 'git push' } }).output.hookSpecificOutput?.permissionDecision, 'deny')
  }

  assert.equal(f.hook('PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(f.root, '.git', 'quality-harness', 'checks.jsonl') } }).output.hookSpecificOutput?.permissionDecision, 'deny')
})

test('a new session reports previous state without demanding a check', t => {
  const f = fixture(t)
  previousSession(f)
  const started = f.hook('SessionStart', { source: 'startup' })
  assert.match(started.stdout, /previous session in this directory ended/)
  assert.doesNotMatch(started.stdout, /Run it through|before building on them|completion and commit advisories/)
})

test('delegated workers receive an optional check contract', t => {
  const f = fixture(t)
  const delegated = f.hook('SubagentStart', { agent_id: 'delegate', agent_type: 'worker' })
  assert.match(delegated.stdout, /QUALITY CONTRACT/)
  assert.match(delegated.stdout, /optionally records a run/)
  assert.doesNotMatch(delegated.stdout, /Before returning after edits, run/)
})
