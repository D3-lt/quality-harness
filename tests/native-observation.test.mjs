import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'
import { sourceCore } from './helpers/source-core.mjs'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'
import { footprint } from '../scripts/hook-footprint.mjs'

// A mutation fence must compile the modified checkout, never a suite's inherited executable.
if (process.env.QUALITY_HARNESS_MUTATION_IN_FLIGHT === '1') delete process.env.QUALITY_HARNESS_QH_BIN
const plugin = fileURLToPath(new URL('../plugin/', import.meta.url))
const version = JSON.parse(readFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).version
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture(t) {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-native-observation-')))
  t.after(() => remove(top))
  const repo = path.join(top, 'repo'), data = path.join(top, 'data')
  mkdirSync(repo)
  const initialized = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(initialized.status, 0, initialized.stderr)
  writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs' }))
  const marker = path.join(top, 'executions')
  writeFileSync(path.join(repo, 'check.mjs'), "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.QH_EXECUTIONS, 'ran\\n')\n")
  const binary = path.join(data, 'qh', version, coreAsset(process.platform, process.arch))
  mkdirSync(path.dirname(binary), { recursive: true })
  copyFileSync(sourceCore(), binary)
  chmodSync(binary, 0o755)
  writeFileSync(binary + '.sha256', digest(readFileSync(binary)) + '\n')
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_|CLAUDE_|QUALITY_HARNESS_|QH_|NODE_OPTIONS$|NODE_TEST_CONTEXT$)/.test(key)))
  const trace = path.join(top, 'native.jsonl')
  const env = { ...clean, CLAUDE_PLUGIN_DATA: data, CLAUDE_ENV_FILE: path.join(top, 'exports'),
    QH_EXECUTIONS: marker, QUALITY_HARNESS_QH_FETCH: 'off', QUALITY_HARNESS_ARTIFACT_PASS_RUNNER: 'inline',
    QUALITY_HARNESS_TRACE_FILE: trace, QUALITY_HARNESS_TRACE_UNTIL: String(Date.now() + 120_000),
    QUALITY_HARNESS_TRACE_TRIAL: 'native-control', QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000',
    QUALITY_HARNESS_LEASE_DIR: path.join(top, 'leases') }
  const invoke = (args, input, launcher = path.join(plugin, 'scripts', 'qh-hook.sh')) => {
    const result = spawnSync(testBash(), [launcher, ...args], { cwd: repo, env, input: JSON.stringify({ cwd: repo, session_id: 'native-observation', ...input }),
      encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    return result
  }
  const rows = () => existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  return { top, repo, marker, env, invoke, rows }
}

test('native baseline observation sees a real project check', t => {
  const f = fixture(t)
  assert.equal('QUALITY_HARNESS_BASELINE_RUNNER' in f.env, false, 'default behavior is tested without disabling the baseline')
  for (const source of ['startup', 'resume', 'compact']) {
    f.invoke(['hook', 'SessionStart'], { hook_event_name: 'SessionStart', source })
  }
  const checkHash = digest(JSON.stringify(['check.mjs']))
  assert.equal(f.rows().filter(row => row.argsHash === checkHash && ['attempt', 'started'].includes(row.phase)).length, 0,
    'native observation must catch even an automatic check whose marker has not been written yet')
  assert.equal(existsSync(f.marker), false, 'opening, resuming and compacting must never execute the declared check')
  // A real Go→Node exec through the same verified shell launcher is the positive
  // control. The retained CLI loads the harmless project check; no mock observer.
  const mini = path.join(f.top, 'control-plugin')
  mkdirSync(path.join(mini, 'scripts'), { recursive: true })
  mkdirSync(path.join(mini, '.claude-plugin'))
  copyFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), path.join(mini, '.claude-plugin', 'plugin.json'))
  copyFileSync(path.join(plugin, 'scripts', 'qh-hook.sh'), path.join(mini, 'scripts', 'qh-hook.sh'))
  writeFileSync(path.join(mini, 'scripts', 'branch-state.mjs'),
    "import { pathToFileURL } from 'node:url'; import path from 'node:path'; await import(pathToFileURL(path.join(process.cwd(), 'check.mjs')).href)\n")
  f.invoke(['bridge', 'branch-state'], {}, path.join(mini, 'scripts', 'qh-hook.sh'))
  assert.equal(readFileSync(f.marker, 'utf8'), 'ran\n')
  const controlArgs = digest(JSON.stringify([path.join(mini, 'scripts', 'branch-state.mjs')]))
  assert.equal(f.rows().filter(row => row.argsHash === controlArgs && ['exec-attempt', 'started'].includes(row.phase)).length, 1,
    'the same observer sees a real native launch, including POSIX same-PID exec')
  assert.ok(f.rows().every(row => row.schema === 'quality-harness-process-trace-v1'))
})

test('a context attachment contributes once to the exclusive total', t => {
  const top = mkdtempSync(path.join(os.tmpdir(), 'qh-exclusive-'))
  t.after(() => remove(top))
  const file = path.join(top, 'transcript.jsonl')
  const body = 'governance <qh:a@11111111> and <qh:b@22222222>'
  writeFileSync(file, [
    { type: 'attachment', attachment: { type: 'hook_success', hookEvent: 'PreToolUse', toolUseID: 'x',
      command: 'sh', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/qh-hook.sh', 'hook', 'PreToolUse'] } },
    { type: 'attachment', attachment: { type: 'hook_additional_context', hookEvent: 'PreToolUse', toolUseID: 'x', content: [body] } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n')
  assert.equal(footprint(file).totals.observedModel.characters, body.length)
})

test('native observation refuses a different Git checkout as its trace sink', t => {
  const f = fixture(t)
  const other = path.join(f.top, 'other-checkout')
  mkdirSync(other)
  const created = spawnSync('git', ['init', '-q', other], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(created.status, 0, created.stderr)
  const sink = path.join(other, 'trace.jsonl')
  writeFileSync(sink, 'sentinel\n')
  f.env.QUALITY_HARNESS_TRACE_FILE = sink
  f.invoke(['bridge', 'branch-state'], {})
  assert.equal(readFileSync(sink, 'utf8'), 'sentinel\n', 'native tracing cannot append inside another checkout')
})
