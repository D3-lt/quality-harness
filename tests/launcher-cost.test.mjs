import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'
import { sourceCore } from './helpers/source-core.mjs'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'

const plugin = fileURLToPath(new URL('../plugin/', import.meta.url))
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
test('verified launcher avoids redundant utilities while preserving native paths, payload and checksums', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh launcher work '))
  t.after(() => remove(top))
  const mini = path.join(top, 'plugin'), data = path.join(top, 'data'), wrappers = path.join(top, 'wrappers')
  for (const dir of [path.join(mini, 'scripts'), path.join(mini, '.claude-plugin'), wrappers]) mkdirSync(dir, { recursive: true })
  copyFileSync(path.join(plugin, 'scripts', 'qh-hook.sh'), path.join(mini, 'scripts', 'qh-hook.sh'))
  const version = JSON.parse(readFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).version
  const metadata = path.join(mini, '.claude-plugin', 'plugin.json')
  writeFileSync(metadata, '{\r\n  "version": "' + version + '"\r\n}\r\n')
  const binary = path.join(data, 'qh', version, coreAsset(process.platform, process.arch))
  mkdirSync(path.dirname(binary), { recursive: true })
  copyFileSync(sourceCore(), binary); chmodSync(binary, 0o755)
  writeFileSync(binary + '.sha256', createHash('sha256').update(readFileSync(binary)).digest('hex') + '\n')
  for (const name of ['uname', 'dirname', 'tr']) {
    const located = spawnSync(testBash(), ['-c', 'command -v "$1"', 'resolve', name], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    assert.equal(located.status, 0, located.stderr)
    const wrapper = path.join(wrappers, name)
    writeFileSync(wrapper, '#!/bin/sh\nprintf ' + quote(name + ' %s\\n') + ' "$*" >> "$QH_LAUNCH_TRACE"\nexec ' + quote(located.stdout.trim()) + ' "$@"\n')
    chmodSync(wrapper, 0o755)
  }
  const log = path.join(top, 'utilities')
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: data, QUALITY_HARNESS_QH_FETCH: 'off',
    QH_WRAPPERS: wrappers, QH_LAUNCHER: path.join(mini, 'scripts', 'qh-hook.sh'), QH_LAUNCH_TRACE: log }
  const input = JSON.stringify({ cwd: top, session_id: 'launcher-cost', hook_event_name: 'PreToolUse',
    agent_type: 'quality-harness:qh-correctness-reviewer', tool_name: 'Write', tool_input: { file_path: path.join(top, 'x') } })
  const run = () => spawnSync(testBash(), ['-c',
    'if command -v cygpath >/dev/null 2>&1; then QH_WRAPPERS=$(cygpath -u "$QH_WRAPPERS"); fi\nPATH="$QH_WRAPPERS:$PATH"; export PATH\nexec "$QH_LAUNCHER" hook PreToolUse'],
  { cwd: top, env, input, encoding: 'utf8', timeout: 20_000, windowsHide: true })
  const passed = run()
  assert.equal(passed.status, 0, passed.stderr)
  assert.equal(JSON.parse(passed.stdout).hookSpecificOutput.permissionDecision, 'deny', 'the original input and hook arguments reach Go')
  const calls = readFileSync(log, 'utf8').trim().split('\n')
  const counts = Object.fromEntries(['uname', 'dirname', 'tr'].map(name => [name, calls.filter(line => line.startsWith(name + ' ')).length]))
  assert.equal(counts.uname, 1, JSON.stringify(counts))
  assert.equal(counts.dirname, 0, JSON.stringify(counts))
  assert.ok(counts.tr <= (process.platform === 'win32' ? 1 : 0), JSON.stringify(counts))
  assert.ok(calls.includes('uname -sm'), calls.join('\n'))
  appendFileSync(binary, 'tampered')
  const rejected = run()
  assert.notEqual(rejected.status, 0)
  assert.equal(rejected.stdout, '')
  assert.match(rejected.stderr, /verified|checksum/)
  writeFileSync(metadata, '{\n  "version": "' + version + '\n}\n')
  const unclosed = run()
  assert.notEqual(unclosed.status, 0)
  assert.match(unclosed.stderr, /version is unreadable/)
})
