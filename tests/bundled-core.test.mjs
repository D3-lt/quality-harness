import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'
import { nativeBinaryPath } from '../plugin/scripts/native-cli.mjs'
import { nativeBinaryIdentity } from '../plugin/scripts/native-provenance.mjs'
import { sourceCore } from './helpers/source-core.mjs'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'

const plugin = fileURLToPath(new URL('../plugin/', import.meta.url))
test('bundled hooks and compatibility CLIs run offline on their first event and reject damaged bundles', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh bundled core '))
  t.after(() => remove(top))
  const mini = path.join(top, 'plugin'), data = path.join(top, 'empty-cache')
  cpSync(path.join(plugin, 'scripts'), path.join(mini, 'scripts'), { recursive: true })
  mkdirSync(path.join(mini, '.claude-plugin'), { recursive: true })
  copyFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), path.join(mini, '.claude-plugin', 'plugin.json'))
  const version = JSON.parse(readFileSync(path.join(mini, '.claude-plugin', 'plugin.json'), 'utf8')).version
  writeFileSync(path.join(mini, '.claude-plugin', 'bundle.json'), JSON.stringify({ schema: 'qh-plugin-bundle-v1', version }))
  const asset = coreAsset(process.platform, process.arch)
  const binary = path.join(mini, 'native', asset)
  mkdirSync(path.dirname(binary))
  copyFileSync(sourceCore(), binary); chmodSync(binary, 0o755)
  const sha = createHash('sha256').update(readFileSync(binary)).digest('hex')
  writeFileSync(binary + '.sha256', sha + '\n')
  writeFileSync(path.join(mini, 'native', 'SHA256SUMS.txt'),
    '# qh-core-source-v1 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(64) + ' 123\n' + sha + '  ' + asset + '\n')
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: data, QUALITY_HARNESS_QH_BIN: '', QUALITY_HARNESS_QH_FETCH: 'off',
    QUALITY_HARNESS_SESSION_END_RUNNER: 'inline', QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: 'inline' }
  assert.equal(nativeBinaryPath(version, env, { root: mini }), binary)
  assert.equal(nativeBinaryIdentity(binary).sha256, sha, 'the probe retains the bundled CI identity')
  const input = JSON.stringify({ cwd: top, session_id: 'bundled', hook_event_name: 'PreToolUse',
    agent_type: 'quality-harness:qh-correctness-reviewer', tool_name: 'Write', tool_input: { file_path: path.join(top, 'x') } })
  const hook = event => spawnSync(testBash(), [path.join(mini, 'scripts', 'qh-hook.sh'), 'hook', event],
    { input, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  const legacy = () => spawnSync(process.execPath, [path.join(mini, 'scripts', 'lifecycle.mjs')],
    { input, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  for (const answer of [hook('PreToolUse'), legacy()]) {
    assert.equal(answer.status, 0, answer.stderr)
    assert.doesNotMatch(answer.stderr, /missing|checksum|could not run/i)
    assert.equal(JSON.parse(answer.stdout).hookSpecificOutput.permissionDecision, 'deny')
  }
  assert.equal(existsSync(data), false, 'first use does not provision a cache')
  const cached = path.join(data, 'qh', version, asset)
  mkdirSync(path.dirname(cached), { recursive: true })
  copyFileSync(binary, cached); chmodSync(cached, 0o755)
  writeFileSync(cached + '.sha256', sha + '\n')
  appendFileSync(binary, 'tampered')
  for (const answer of [hook('PreToolUse'), legacy()]) {
    assert.notEqual(answer.status, 0)
    assert.equal(answer.stdout, '')
    assert.match(answer.stderr, /verified|checksum|bundle/i)
  }
  remove(path.dirname(binary))
  // An installed bundle must never fetch or silently switch to a cache, even on SessionStart.
  writeFileSync(path.join(mini, 'scripts', 'qh-fetch.mjs'), "throw new Error('BUNDLE ATTEMPTED NETWORK BOOTSTRAP')\n")
  for (const answer of [hook('SessionStart'), legacy()]) {
    assert.notEqual(answer.status, 0)
    assert.doesNotMatch(answer.stderr, /ATTEMPTED NETWORK/)
    assert.match(answer.stderr, /bundle|verified|missing/i)
  }
})

test('bundled selector maps Windows and both Unix architectures while preserving explicit source overrides', () => {
  for (const [platform, arch, name] of [['win32', 'x64', 'qh-windows-amd64.exe'],
    ['darwin', 'arm64', 'qh-darwin-arm64'], ['linux', 'x64', 'qh-linux-amd64']]) {
    const root = path.join(os.tmpdir(), 'selector')
    const env = { CLAUDE_PLUGIN_DATA: 'unused' }
    assert.equal(nativeBinaryPath('1.2.3', env, { root, platform, arch, bundled: true }), path.join(root, 'native', name))
    assert.equal(nativeBinaryPath('1.2.3', { QUALITY_HARNESS_QH_BIN: 'explicit' }, { root, platform, arch, bundled: true }), 'explicit')
  }
})

test('the cost collector measures the selected bundle with no cache or ambient source override', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh bundled observer '))
  t.after(() => remove(top))
  const mini = path.join(top, 'plugin'), repo = path.join(top, 'corpus')
  for (const directory of ['scripts', '.claude-plugin', 'native', 'hooks']) mkdirSync(path.join(mini, directory), { recursive: true })
  mkdirSync(repo)
  copyFileSync(path.join(plugin, 'scripts', 'qh-hook.sh'), path.join(mini, 'scripts', 'qh-hook.sh'))
  copyFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), path.join(mini, '.claude-plugin', 'plugin.json'))
  const binary = path.join(mini, 'native', coreAsset(process.platform, process.arch))
  copyFileSync(sourceCore(), binary); chmodSync(binary, 0o755)
  writeFileSync(binary + '.sha256', createHash('sha256').update(readFileSync(binary)).digest('hex') + '\n')
  writeFileSync(path.join(mini, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Read', hooks: [
    { type: 'command', command: 'sh', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/qh-hook.sh', 'hook', 'PreToolUse'] },
  ] }] } }))
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/hook-cost.mjs', import.meta.url)),
    'PreToolUse', repo, '--in-place', '--plugin', mini, '--json', '--timeout', '15'],
    { encoding: 'utf8', timeout: 60_000, windowsHide: true,
      env: { ...process.env, QUALITY_HARNESS_QH_BIN: path.join(top, 'missing-ambient-core'), QUALITY_HARNESS_QH_FETCH: 'off' } })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.error, undefined, JSON.stringify(report))
  for (const trial of [report.first, report.second, report.observerOff]) {
    assert.equal(trial.exit, 0, JSON.stringify(trial))
    assert.equal(trial.registrations.length, 1)
  }
})
