import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, appendFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { installCore } from '../plugin/scripts/qh-fetch.mjs'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'
import { readEvents } from '../plugin/scripts/event-log.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const plugin = path.join(root, 'plugin')
const version = JSON.parse(readFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).version
test('the hook registry selects Go, whose verified launcher preserves reviewer refusal and rejects tampering', async t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh-launcher-'))
  t.after(() => remove(top))
  const asset = coreAsset(process.platform, process.arch)
  const binary = path.join(top, 'qh', version, asset)
  mkdirSync(path.dirname(binary), { recursive: true })
  const built = path.join(top, process.platform === 'win32' ? 'candidate.exe' : 'candidate')
  const build = spawnSync('go', ['build', '-ldflags', `-X main.version=${version}`, '-o', built, './cmd/qh'], { cwd: path.join(root, 'core'), encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.equal(build.status, 0, build.stderr)
  const bytes = readFileSync(built)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const installed = await installCore({ version, platform: process.platform, arch: process.arch, dataHome: top,
    request: async url => new Response(url.endsWith('SHA256SUMS.txt') ? `${digest}  ${asset}\n` : bytes) })
  assert.equal(installed.binary, binary)
  const hooks = JSON.parse(readFileSync(path.join(plugin, 'hooks', 'hooks.json'), 'utf8')).hooks
  for (const groups of Object.values(hooks)) for (const group of groups) for (const hook of group.hooks) {
    assert.equal(hook.command, 'sh')
    assert.equal(hook.args[0], '${CLAUDE_PLUGIN_ROOT}/scripts/qh-hook.sh')
  }
  const input = JSON.stringify({ cwd: top, session_id: 'go-cutover', hook_event_name: 'PreToolUse', agent_type: 'qh-correctness-reviewer', tool_name: 'Write', tool_input: { file_path: path.join(top, 'x') } })
  const invoke = () => spawnSync(testBash(), [path.join(plugin, 'scripts', 'qh-hook.sh'), 'hook', 'PreToolUse'], {
    input, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: top, QUALITY_HARNESS_QH_FETCH: 'off' },
  })
  const guarded = invoke()
  assert.equal(guarded.status, 0, guarded.stderr)
  assert.equal(JSON.parse(guarded.stdout).hookSpecificOutput.permissionDecision, 'deny')
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: top, QUALITY_HARNESS_QH_BIN: '' }
  const standalone = spawnSync(testBash(), [path.join(plugin, 'scripts', 'qh-hook.sh'), 'reviewer-guard'], { input, encoding: 'utf8', timeout: 30_000, windowsHide: true, env })
  assert.equal(standalone.status, 2, standalone.stderr)
  assert.match(standalone.stderr, /read-only/)
  const compatibilityGuard = spawnSync(process.execPath, [path.join(plugin, 'scripts', 'reviewer-guard.mjs')], { input, encoding: 'utf8', timeout: 30_000, windowsHide: true, env })
  assert.equal(compatibilityGuard.status, 2, compatibilityGuard.stderr)
  assert.match(compatibilityGuard.stderr, /read-only/)
  const scripts = path.join(top, 'scripts')
  mkdirSync(scripts)
  writeFileSync(path.join(scripts, 'branch-state.mjs'), "import fs from 'node:fs'; process.stdout.write(fs.readFileSync(0)); process.stderr.write('bridge stderr'); process.exitCode = 7")
  const bridge = spawnSync(binary, ['bridge', 'branch-state'], { input: 'bridge input', encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...env, CLAUDE_PLUGIN_ROOT: top } })
  assert.equal(bridge.status, 7, bridge.stderr)
  assert.equal(bridge.stdout, 'bridge input')
  assert.equal(bridge.stderr, 'bridge stderr')
  const unknown = spawnSync(binary, ['bridge', 'unknown'], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env })
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /unknown hook CLI/)
  const legacy = () => spawnSync(process.execPath, [path.join(plugin, 'scripts', 'lifecycle.mjs')], { input, encoding: 'utf8', timeout: 30_000, windowsHide: true, env })
  const transported = legacy()
  assert.equal(transported.status, 0, transported.stderr)
  assert.equal(JSON.parse(transported.stdout).hookSpecificOutput.permissionDecision, 'deny')
  const mini = path.join(top, 'cold-plugin')
  mkdirSync(path.join(mini, 'scripts'), { recursive: true })
  mkdirSync(path.join(mini, '.claude-plugin'))
  writeFileSync(path.join(mini, '.claude-plugin', 'plugin.json'), JSON.stringify({ version }, null, 2) + '\n')
  writeFileSync(path.join(mini, 'scripts', 'qh-hook.sh'), readFileSync(path.join(plugin, 'scripts', 'qh-hook.sh')))
  const marker = path.join(top, 'bootstrap-called')
  writeFileSync(path.join(mini, 'scripts', 'qh-fetch.mjs'), [
    "import { readFileSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs'",
    "import { createHash } from 'node:crypto'",
    "import path from 'node:path'",
    "if (readFileSync(0, 'utf8') !== '') throw new Error('bootstrap consumed the hook payload')",
    "const env = process.env",
    "const dir = path.join(process.argv[2], 'qh', env.QH_COLD_VERSION)",
    "mkdirSync(dir, { recursive: true })",
    "const binary = path.join(dir, env.QH_COLD_ASSET)",
    "copyFileSync(env.QH_COLD_BINARY, binary)",
    "chmodSync(binary, 0o755)",
    "writeFileSync(binary + '.sha256', createHash('sha256').update(readFileSync(binary)).digest('hex') + '\\n')",
    "writeFileSync(env.QH_COLD_MARKER, 'installed')",
  ].join('\n'))
  const initialized = spawnSync('git', ['init', '-q', top], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(initialized.status, 0, initialized.stderr)
  const cold = event => spawnSync(testBash(), [path.join(mini, 'scripts', 'qh-hook.sh'), 'hook', event], {
    input: JSON.stringify({ cwd: top, session_id: 'cold', hook_event_name: event, source: 'startup' }),
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(top, 'cold-data'), CLAUDE_ENV_FILE: '',
      QUALITY_HARNESS_QH_FETCH: '', QH_COLD_BINARY: built, QH_COLD_ASSET: asset,
      QH_COLD_VERSION: version, QH_COLD_MARKER: marker },
  })
  assert.notEqual(cold('PreToolUse').status, 0, 'an event after SessionStart cannot fetch')
  assert.equal(existsSync(marker), false)
  const startup = cold('SessionStart')
  assert.equal(startup.status, 0, startup.stderr)
  assert.equal(readFileSync(marker, 'utf8'), 'installed')
  assert.ok([...readEvents(top, 'cold')].some(row => row.event === 'session.started'), 'bootstrap leaves the payload for Go')
  appendFileSync(binary, 'tampered')
  const corrupt = invoke()
  assert.notEqual(corrupt.status, 0)
  assert.equal(corrupt.stdout, '')
  assert.match(corrupt.stderr, /checksum|verified/i)
  const unverified = legacy()
  assert.notEqual(unverified.status, 0)
  assert.match(unverified.stderr, /verified/i)
  rmSync(binary)
  const absent = invoke()
  assert.notEqual(absent.status, 0)
  assert.match(absent.stderr, /could.not.run|missing|verified/i)
  assert.equal(existsSync(path.join(plugin, 'scripts', 'on-pre-tool-use.mjs')), false, 'the redundant Node handler does not ship')
})
