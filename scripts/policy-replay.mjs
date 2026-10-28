#!/usr/bin/env node
// ADR-131 protocol-v1 replay. Generated corpus only; raw receipts stay in an
// explicitly named private output directory. No checks run in an adopter repo.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'
import { sampleLoad, contention } from '../plugin/scripts/load.mjs'
import { readerFingerprint } from '../plugin/scripts/corpus-probe.mjs'
import { nativeSourceIdentity } from './native-source.mjs'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'
import { footprint } from './hook-footprint.mjs'
import { runMeasured, summariseProcesses } from './observation/process.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
export function registeredHooks(registry, event, tool = '') {
  return (registry.hooks[event] ?? []).filter(group => !group.matcher || new RegExp('^(?:' + group.matcher + ')$').test(tool))
    .flatMap(group => group.hooks)
}
export function registeredProgram(command, { platform = process.platform, env = process.env, exists } = {}) {
  if (command === 'node') return process.execPath
  if (command === 'sh' && platform === 'win32') return resolveBashExecutable(platform, env, exists) ?? command
  return command
}
const readRows = file => {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
}
function command(file, args, cwd, env) {
  const run = spawnSync(file, args, { cwd, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return run
}
const adr = [
  '# ADR-001: Export integers', '', '**Status:** Accepted', '**Date:** 2026-10-28', '**Owner:** fixture',
  '**Spec:** None', '**Governs:** src/**', '**Enforced-by:** @BT@check.mjs::export remains integer@BT@',
  '**Served-path change:** Consumers always receive an integer.', '',
  '## Context', '', 'The exported value is consumed as an integer.', '',
  '## Existing Primitives Audit', '', 'The project already uses a CJS value and Node assertions.', '',
  '## Decision', '', 'Keep the exported value an integer.', '',
  '## Alternatives Considered', '', '- String values require an unnecessary conversion.', '',
  '## Component / Boundary Impact', '', 'The source module exports the value.', '',
  '## Wiring & Contract Changes', '', 'None.', '',
  '## Consequences', '', 'Consumers can use the value without conversion.', '',
  '## Out of Scope', '', '- String conversion (permanent: boundary: callers consume integers).', '',
].join('\n').replaceAll('@BT@', String.fromCharCode(96))
const task = [
  '# Task ADR-001-T1: Keep the exported integer', '', '**Status:** pending', '**Depends-on:** none',
  '**Covers:** none — no spec', '**Produces:** integer value', '**Consumes:** none', '**Proof map:** v1', '',
  '## Goal', '', 'Keep an integer export.', '', '## Affected Files', '',
  '| File | Change | Why |', '|---|---|---|', '| @BT@src/value.cjs@BT@ | edit | exported value |', '',
  '## Ordered Steps', '', '1. [S1] Write a failing test for a non-integer value. [proof: acceptance]',
  '2. [S2] Keep the integer export. [proof: acceptance]', '',
  '## Acceptance', '', '@FENCE@bash', 'node check.mjs', '@FENCE@', '', '## Tests', '',
  '| Test name | File | Verifies | Covers | Steps |', '|---|---|---|---|---|',
  '| @BT@export remains integer@BT@ | @BT@check.mjs@BT@ | integer export | none | S1, S2 |', '',
  '## Invariants', '', '- The exported value is an integer.', '',
  '## Risks', '', 'A non-integer value breaks consumers.', '',
  '## Stop Condition', '', 'The integer assertion passes.', '',
  '## Out of Scope', '', '- Additional modules (permanent: boundary: one exported value).', '',
  '## Verification Log', '',
].join('\n').replaceAll('@FENCE@', '@BT@@BT@@BT@').replaceAll('@BT@', String.fromCharCode(96))

export function createReplayCorpus(directory, { governed, env }) {
  const repo = path.join(directory, 'repo')
  mkdirSync(path.join(repo, 'src'), { recursive: true })
  writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs' }) + '\n')
  writeFileSync(path.join(repo, 'src', 'value.cjs'), 'module.exports = 1\n')
  writeFileSync(path.join(repo, 'check.mjs'), [
    "import { appendFileSync } from 'node:fs'",
    "import { createRequire } from 'node:module'",
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "const note = phase => appendFileSync(process.env.QH_CHECK_RECEIPTS, JSON.stringify({phase,pid:process.pid}) + '\\n')",
    "note('start')",
    "process.on('exit', () => note('end'))",
    "test('export remains integer', () => assert.equal(Number.isInteger(createRequire(import.meta.url)('./src/value.cjs')), true))",
    '',
  ].join('\n'))
  if (governed) {
    const records = path.join(repo, 'docs', 'adr')
    const tasks = path.join(records, 'ADR-001-export-integers', 'tasks')
    mkdirSync(tasks, { recursive: true })
    writeFileSync(path.join(records, 'ADR-001-export-integers.md'), adr)
    writeFileSync(path.join(tasks, 'T1-keep-integer.md'), task)
    writeFileSync(path.join(tasks, 'README.md'), [
      '# Tasks', '', '| ID | Title | Status | Acceptance |', '|---|---|---|---|',
      '| T1 | Keep integer | pending | @BT@node check.mjs@BT@ |', '',
    ].join('\n').replaceAll('@BT@', String.fromCharCode(96)))
  }
  command('git', ['init', '-q', repo], directory, env)
  command('git', ['add', '-A'], repo, env)
  command('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=', 'commit', '-qm', 'fixture'], repo, env)
  return repo
}

export async function replay({ plugin, binary = null, directory, governed = true, label = 'D', observe = true }) {
  plugin = path.resolve(plugin); directory = path.resolve(directory)
  mkdirSync(directory, { recursive: true })
  assert.equal(existsSync(path.join(directory, 'repo')), false, 'each replay owns a fresh directory')
  const home = path.join(directory, 'home'), temp = path.join(directory, 'tmp'), data = path.join(directory, 'data')
  for (const item of [home, temp, data]) mkdirSync(item)
  const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_|CLAUDE_|QUALITY_HARNESS_|QH_|NODE_OPTIONS$|NODE_TEST_CONTEXT$|HOOK_COST_OUT$)/.test(key)))
  const checkReceipts = path.join(directory, 'checks.jsonl')
  const env = { ...base, HOME: home, USERPROFILE: home, TMPDIR: temp, TMP: temp, TEMP: temp,
    CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, CLAUDE_ENV_FILE: path.join(directory, 'exports'),
    QH_CHECK_RECEIPTS: checkReceipts, QUALITY_HARNESS_QH_FETCH: 'off',
    QUALITY_HARNESS_LEASE_DIR: path.join(directory, 'leases'), QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' }
  const repo = createReplayCorpus(directory, { governed, env })
  const registry = JSON.parse(readFileSync(path.join(plugin, 'hooks', 'hooks.json'), 'utf8'))
  const version = JSON.parse(readFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).version
  const readersBefore = readerFingerprint(plugin)
  const nativeBefore = binary ? nativeSourceIdentity(path.dirname(plugin)) : null
  const fixtureFiles = ['.quality-harness.json', 'check.mjs', 'src/value.cjs',
    ...(governed ? ['docs/adr/ADR-001-export-integers.md', 'docs/adr/ADR-001-export-integers/tasks/T1-keep-integer.md',
      'docs/adr/ADR-001-export-integers/tasks/README.md'] : [])]
  const fixtureSha256 = hash(Buffer.concat(fixtureFiles.flatMap(file => [Buffer.from(file + '\0'), readFileSync(path.join(repo, file)), Buffer.from('\0')])))
  if (binary) {
    const target = path.join(data, 'qh', version, coreAsset(process.platform, process.arch))
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(binary, target); chmodSync(target, 0o755)
    writeFileSync(target + '.sha256', hash(readFileSync(target)) + '\n')
    env.QUALITY_HARNESS_QH_BIN = target
  }
  const transcript = path.join(directory, 'transcript.jsonl'), trace = path.join(directory, 'processes.jsonl')
  writeFileSync(transcript, '')
  const append = row => appendFileSync(transcript, JSON.stringify(row) + '\n')
  const session = 'policy-replay', events = []
  let sequence = 0, request = null, held = 0, call = 0
  const receive = text => {
    const blob = 'body-' + (++sequence), id = 'request-' + sequence
    append({ type: 'api-request-blob', hash: blob, message: { role: 'system', content: [{ type: 'text', text }] } })
    append({ type: 'api-request', id, base: request, keep: request ? held : 0, tail: [blob], querySource: 'repl_main_thread:outputStyle:Concise' })
    held = (request ? held : 0) + 1; request = id
  }
  const fire = (event, extra = {}) => {
    const payload = { hook_event_name: event, cwd: repo, session_id: session, transcript_path: transcript, ...extra }
    const id = 'call-' + (++call), outputs = []
    for (const hook of registeredHooks(registry, event, extra.tool_name)) {
      const args = (hook.args ?? []).map(arg => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', plugin))
      const file = registeredProgram(hook.command, { env })
      const trial = label + '-' + call + '-' + outputs.length
      const ran = runMeasured({ file, args, cwd: repo, env, input: JSON.stringify(payload),
        timeoutMs: Math.min(60_000, hook.timeout * 1000), traceFile: trace, trial, observe })
      assert.equal(ran.status, 0, event + ': ' + ran.stderr)
      assert.equal(ran.timedOut, false, event)
      append({ type: 'attachment', attachment: { type: 'hook_success', hookEvent: event, toolUseID: id,
        command: hook.command, args: hook.args, stdout: ran.stdout, durationMs: ran.wallMs } })
      let envelope = null
      try { envelope = JSON.parse(ran.stdout) } catch { /* ordinary stdout has its own route */ }
      const context = envelope?.hookSpecificOutput?.additionalContext
        ?? (envelope?.decision === 'block' && ['Stop', 'SubagentStop'].includes(event) ? envelope.reason : null)
        ?? (envelope?.hookSpecificOutput?.permissionDecision === 'deny' ? envelope.hookSpecificOutput.permissionDecisionReason : null)
      if (typeof context === 'string' && context) {
        append({ type: 'attachment', attachment: { type: 'hook_additional_context', hookEvent: event, toolUseID: id, content: [context] } })
        receive(context)
      } else if (!envelope && ['SessionStart', 'UserPromptSubmit'].includes(event) && ran.stdout) receive(ran.stdout)
      if (envelope?.systemMessage) append({ type: 'attachment', attachment: { type: 'hook_system_message', hookEvent: event, toolUseID: id, content: envelope.systemMessage } })
      if (ran.stderr) append({ type: 'attachment', attachment: { type: 'hook_non_blocking_error', hookEvent: event, toolUseID: id, command: hook.command, args: hook.args, stderr: ran.stderr } })
      outputs.push({ stdout: ran.stdout, stderr: ran.stderr, envelope, wallMs: ran.wallMs, resources: ran.resources })
    }
    events.push({ event, tool: extra.tool_name ?? null, outputs })
    return outputs
  }
  const combined = outputs => outputs.map(out => out.stdout + '\n' + out.stderr).join('\n')
  const awaitReceipt = async (predicate, name) => {
    const start = performance.now(), deadline = Date.now() + 10_000
    while (!predicate()) {
      assert.ok(Date.now() < deadline, name + ' did not complete within 10 seconds')
      await delay(20)
    }
    return performance.now() - start
  }
  const loadStart = sampleLoad()
  const started = performance.now()
  fire('SessionStart', { source: 'startup' })
  let waitMs = 0
  if (label === 'A') waitMs += await awaitReceipt(() => readRows(checkReceipts).some(row => row.phase === 'end')
    && readRows(path.join(repo, '.git', 'quality-harness', 'baseline.jsonl')).length > 0, 'automatic baseline')
  fire('UserPromptSubmit', { prompt: 'Keep the exported value an integer.' })
  fire('PreToolUse', { tool_name: 'Skill', tool_input: { skill: 'quality-harness:work-next' } })
  const target = path.join(repo, 'src', 'value.cjs')
  const writing = { tool_name: 'Write', tool_input: { file_path: target, content: 'module.exports = ;\n' } }
  const first = fire('PreToolUse', writing)
  if (governed) assert.match(combined(first), /ADR-001/, 'first governed edit must receive its decision')
  writeFileSync(target, 'module.exports = ;\n')
  const invalid = fire('PostToolUse', writing)
  assert.match(combined(invalid), /SyntaxError|syntax error/i, 'registered syntax checker must catch malformed CJS')
  const editing = { tool_name: 'Edit', tool_input: { file_path: target, old_string: ';', new_string: '2' } }
  const repeat = fire('PreToolUse', editing)
  assert.doesNotMatch(combined(repeat), /rules governing the files this call touched/, 'unchanged governance is not repeated')
  writeFileSync(target, 'module.exports = 2\n')
  fire('PostToolUse', editing)
  const stopped = fire('Stop', { last_assistant_message: 'Done.' })
  if (label !== 'A') assert.doesNotMatch(combined(stopped), /no check is|unchecked|run it through.*qh-check/i)
  for (const [tool_name, text] of [['Bash', 'git commit -F -'], ['PowerShell', 'git push'], ['Bash', "printf '%s' 'git commit'"]]) {
    const output = fire('PreToolUse', { tool_name, tool_input: { command: text } })
    if (label !== 'A') assert.ok(output.every(row => row.envelope?.hookSpecificOutput?.permissionDecision !== 'deny'), 'optional publishing remains allowed')
  }
  for (let n = 0; n < 4; n++) fire('UserPromptSubmit', { prompt: 'Continue.' })
  const role = { agent_type: 'quality-harness:qh-correctness-reviewer', agent_id: 'reviewer' }
  fire('SubagentStart', role)
  const guarded = fire('PreToolUse', { ...role, ...writing })
  assert.ok(guarded.some(row => row.envelope?.hookSpecificOutput?.permissionDecision === 'deny'), 'reviewer guard remains')
  fire('SubagentStop', role)
  const ledger = fire('PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(repo, '.git', 'quality-harness', 'checks.jsonl') } })
  assert.ok(ledger.some(row => row.envelope?.hookSpecificOutput?.permissionDecision === 'deny'), 'evidence-write guard remains')
  writeFileSync(target, 'module.exports = 3\n')
  fire('PostToolUse', { tool_name: 'mcp__mrw__mrw_write', tool_input: { plan: 'update exported integer' },
    tool_response: { files: [{ path: target }] } })
  fire('TaskCompleted', { task_id: 'fixture', task_subject: 'Keep integer' })
  fire('PreCompact', { trigger: 'manual' })
  append({ type: 'system', subtype: 'compact_boundary' }); request = null; held = 0
  fire('SessionStart', { source: 'compact' })
  const resumed = fire('SessionStart', { source: 'resume' })
  assert.doesNotMatch(combined(resumed), /<qh:standing@/, 'retained standing context is not repeated on resume')
  fire('SessionEnd', { reason: 'prompt_input_exit' })
  waitMs += await awaitReceipt(() => readRows(path.join(data, 'sessions.jsonl')).some(row => row.session === session), 'session-end row')
  if (observe) waitMs += await awaitReceipt(() => summariseProcesses(readRows(trace)).incomplete === 0, 'observed process completions')
  const loadEnd = sampleLoad()
  assert.equal(readerFingerprint(plugin).sha256, readersBefore.sha256, 'reader files moved during the replay')
  if (nativeBefore) assert.equal(nativeSourceIdentity(path.dirname(plugin)).sources, nativeBefore.sources, 'native source inputs moved during replay')
  const processRows = readRows(trace)
  const costs = events.flatMap(item => item.outputs)
  const metric = footprint(transcript)
  const report = { schema: 'quality-harness-policy-replay-v1', label, corpus: governed ? 'governed' : 'empty',
    observe, pluginVersion: version, binarySha256: binary ? hash(readFileSync(binary)) : null,
    fixtureSha256, readersSha256: readersBefore.sha256, nativeSources: nativeBefore?.sources ?? null,
    load: { start: loadStart.load, end: loadEnd.load, cores: loadStart.cores,
      contended: contention(loadStart.load, loadEnd.load, loadStart.cores) },
    wallMs: performance.now() - started, hookWallMs: costs.reduce((sum, item) => sum + item.wallMs, 0), waitMs,
    resources: { userCpuMs: costs.every(item => item.resources.userCpuMs !== null) ? costs.reduce((sum, item) => sum + item.resources.userCpuMs, 0) : null,
      systemCpuMs: costs.every(item => item.resources.systemCpuMs !== null) ? costs.reduce((sum, item) => sum + item.resources.systemCpuMs, 0) : null,
      cpuScope: 'waited-subtree', coverage: 'partial', reason: 'detached work and full OS child tree are not included' },
    checkExecutions: readRows(checkReceipts).filter(row => row.phase === 'start').length,
    context: { totals: metric.totals, uncertain: metric.uncertain, coverage: metric.coverage },
    processes: summariseProcesses(processRows),
    events: events.map(item => ({ event: item.event, tool: item.tool, registrations: item.outputs.length,
      wallMs: item.outputs.reduce((sum, out) => sum + out.wallMs, 0),
      stdoutCharacters: item.outputs.reduce((sum, out) => sum + out.stdout.length, 0),
      stderrCharacters: item.outputs.reduce((sum, out) => sum + out.stderr.length, 0) })),
  }
  writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  return report
}

if (isMainModule(import.meta.url)) {
  const [plugin, binary, corpus, directory, label = 'D'] = process.argv.slice(2)
  if (!plugin || !directory || !['empty', 'governed'].includes(corpus)) {
    process.stderr.write('usage: policy-replay.mjs <plugin> <binary-or-dash> <empty|governed> <private-output-directory> [A|B|C|D]\n')
    process.exitCode = 2
  } else {
    const result = await replay({ plugin, binary: binary === '-' ? null : binary, governed: corpus === 'governed', directory, label })
    process.stdout.write(JSON.stringify(result) + '\n')
  }
}
