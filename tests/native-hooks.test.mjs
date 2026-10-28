import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { itemMarker } from '../plugin/scripts/said-per-context.mjs'
import { readEvents } from '../plugin/scripts/event-log.mjs'
import { TASKKILL_TIMEOUT_MS, CLEANUP_GRACE_MS, shellHookTimeoutMs } from '../plugin/scripts/run-shell-hook.mjs'
import { sourceCore } from './helpers/source-core.mjs'
import { remove } from './helpers/remove.mjs'
import { testBash } from './helpers/bash.mjs'

const plugin = fileURLToPath(new URL('../plugin/', import.meta.url))
test('native hooks keep skill routing, context markers, and post-commit recording', t => {
  assert.equal(itemMarker('policy', 'retain the contract'), '<qh:policy@9269bf32>')
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh-native-'))
  t.after(() => remove(top))
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: path.join(top, 'data'),
    CLAUDE_ENV_FILE: path.join(top, 'env'), CLAUDE_CODE_SESSION_ID: 'native', QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: 'inline',
    GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
    GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_/.test(key)) delete env[key]
  const git = (...args) => spawnSync('git', ['-C', top, ...args], { env, encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(git('init', '-q').status, 0)
  const hook = (hook_event_name, extra = {}) => spawnSync(sourceCore(), ['hook', hook_event_name], {
    cwd: top, env, input: JSON.stringify({ cwd: top, session_id: 'native', hook_event_name, ...extra }),
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
  })
  assert.equal(hook('SessionStart', { source: 'startup' }).status, 0)
  const hooks = JSON.parse(readFileSync(path.join(plugin, 'hooks', 'hooks.json'), 'utf8')).hooks
  const skill = hooks.PreToolUse.filter(row => new RegExp(`^(?:${row.matcher})$`).test('Skill'))
  assert.equal(skill.length, 1)
  assert.ok(skill[0].hooks.some(row => row.args[0].endsWith('/scripts/qh-hook.sh')))
  assert.equal(hook('PreToolUse', { tool_name: 'Skill', tool_input: { skill: 'quality-harness:review' } }).stdout, '')
  assert.equal(hook('PreToolUse', { tool_name: 'Skill', tool_input: { skill: 'another:review' } }).stdout, '')
  assert.deepEqual([...readEvents(top, 'native')].filter(row => row.event === 'skill.invoked').map(row => row.skill), ['quality-harness:review'])
  const probe = git('-c', 'hook.qhprobe.command=true', '-c', 'hook.qhprobe.event=pre-commit', 'hook', 'list', 'pre-commit')
  if (/\bqhprobe\b/.test(probe.stdout)) {
    assert.ok(existsSync(env.CLAUDE_ENV_FILE), 'a supported Git receives the post-commit exports')
    assert.match(readFileSync(env.CLAUDE_ENV_FILE, 'utf8'), /hook\.qh-commit-made/)
    writeFileSync(path.join(top, 'a.txt'), 'record the commit\n')
    const made = spawnSync(testBash(), ['-c', '. "$CLAUDE_ENV_FILE" && git add -A && git commit -qm native'], {
      cwd: top, env, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    })
    assert.equal(made.status, 0, made.stdout + made.stderr)
    const sha = git('rev-parse', 'HEAD').stdout.trim()
    assert.ok([...readEvents(top, 'native')].some(row => row.event === 'commit.made' && row.sha === sha))
  assert.equal(hook('SessionEnd', { reason: 'prompt_input_exit' }).status, 0)
  const ended = JSON.parse(readFileSync(path.join(env.CLAUDE_PLUGIN_DATA, 'sessions.jsonl'), 'utf8').trim().split('\n').at(-1))
  const real = realpathSync(top)
  assert.equal(ended.location, ['darwin', 'win32'].includes(process.platform) ? real.toLowerCase() : real)
  } else t.diagnostic('post-commit recording cannot run: this Git has no config-based hooks')
})

test('native bridge deadlines leave room for CLI cleanup inside the host timeout', () => {
  const registry = JSON.parse(readFileSync(path.join(plugin, 'hooks', 'hooks.json'), 'utf8')).hooks
  const source = readFileSync(new URL('../core/hooks/bridge.go', import.meta.url), 'utf8')
  const shellMs = Number(source.match(/budget = (\d+) \* time\.Second/)[1]) * 1000
  const branchMs = Number(source.match(/budget := (\d+) \* time\.Second/)[1]) * 1000
  const cleanupMs = TASKKILL_TIMEOUT_MS + CLEANUP_GRACE_MS
  assert.ok(shellHookTimeoutMs({}) + cleanupMs < shellMs)
  const windows = readFileSync(new URL('../core/hooks/bridge_exec_windows.go', import.meta.url), 'utf8')
  const outerCleanupMs = (Number(windows.match(/context.WithTimeout\(context.Background\(\), (\d+)\*time.Second/)[1]) + 1) * 1000
  const bridges = Object.values(registry).flat().flatMap(group => group.hooks).filter(hook => hook.args[1] === 'bridge')
  assert.ok(bridges.some(hook => hook.args[2] === 'shell-hook'))
  assert.ok(bridges.some(hook => hook.args[2] === 'branch-state'))
  for (const hook of bridges) assert.ok((hook.args[2] === 'shell-hook' ? shellMs : branchMs) + outerCleanupMs < hook.timeout * 1000)
})

test('the native artifact pass never credits bytes changed while the runner was gating them', t => {
  const top = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'qh-native-artifact-')))
  t.after(() => remove(top))
  const repo = path.join(top, 'repo')
  const mini = path.join(top, 'plugin')
  mkdirSync(path.join(repo, 'docs', 'adr'), { recursive: true })
  mkdirSync(path.join(mini, 'scripts'), { recursive: true })
  const record = path.join(repo, 'docs', 'adr', 'ADR-001-fixture.md')
  writeFileSync(record, '# ADR-001: initial\n')
  writeFileSync(path.join(mini, 'scripts', 'facts-gate-dispatch.sh'), '# fixture dispatcher\n')
  writeFileSync(path.join(mini, 'scripts', 'run-shell-hook.mjs'), [
    "import { readFileSync, writeFileSync } from 'node:fs'",
    "const request = JSON.parse(readFileSync(0, 'utf8'))",
    'writeFileSync(' + JSON.stringify(record) + ', "# ADR-001: changed during the gate\\n")',
    "for (const gated of request.paths) console.log(JSON.stringify({ gated, complete: true }))",
  ].join('\n'))
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: mini, CLAUDE_PLUGIN_DATA: path.join(top, 'data'), CLAUDE_ENV_FILE: '',
    QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: 'inline', QUALITY_HARNESS_LEASE_DIR: path.join(top, 'leases'),
    GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
    GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_/.test(key)) delete env[key]
  const git = (...args) => {
    const ran = spawnSync('git', ['-C', repo, ...args], { env, encoding: 'utf8', timeout: 10_000, windowsHide: true })
    assert.equal(ran.status, 0, ran.stderr)
  }
  git('init', '-q')
  git('add', '-A')
  git('commit', '-qm', 'fixture')
  const hook = (hook_event_name, extra = {}) => {
    const ran = spawnSync(sourceCore(), ['hook', hook_event_name], {
      cwd: repo, env, input: JSON.stringify({ cwd: repo, session_id: 'identity', hook_event_name, ...extra }),
      encoding: 'utf8', timeout: 30_000, windowsHide: true,
    })
    assert.equal(ran.status, 0, ran.stderr)
  }
  hook('SessionStart', { source: 'startup' })
  writeFileSync(record, '# ADR-001: bytes submitted to the gate\n')
  const before = createHash('sha256').update(readFileSync(record)).digest('hex')
  hook('PostToolUse', { tool_name: 'Write', tool_input: { file_path: record } })
  hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'git push' } })
  const gated = [...readEvents(repo, 'identity')].filter(row => row.event === 'artifact.gated' && path.resolve(row.path) === record).at(-1)
  assert.ok(gated, 'the native pass recorded the runner result')
  assert.equal(gated.blob, before)
  assert.equal(gated.complete, false, 'the changed content has not been checked')
  assert.notEqual(createHash('sha256').update(readFileSync(record)).digest('hex'), before)
})
