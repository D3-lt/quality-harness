import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { analyzeRepository, inspectDispatch, formatReport, main } from '../scripts/event-analyser.mjs'
import { analyzeTrace, recordInvocation } from '../scripts/event-trace.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(repo, 'scripts', 'event-analyser.mjs')
const pluginVariable = '$' + '{CLAUDE_PLUGIN_ROOT}'
const trees = new Map()

// Only the parser runs in a child with exposed internals. The analyser runs here
// so selftest's parent-process coverage still measures its actual decisions.
function parse(source) {
  if (!trees.has(source)) {
    const code = 'const fs=require("node:fs"), a=require("internal/deps/acorn/acorn/dist/acorn"); process.stdout.write(JSON.stringify(a.parse(fs.readFileSync(0,"utf8"),{ecmaVersion:"latest",sourceType:"module",locations:true,allowHashBang:true})))'
    const result = spawnSync(process.execPath, ['--expose-internals', '-e', code], { input: source, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
    if (result.status !== 0) throw new Error('parser rejected source')
    trees.set(source, JSON.parse(result.stdout))
  }
  return trees.get(source)
}

function fixture(t, files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-event-analyser-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), source)
  }
  const git = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 10_000 })
  assert.equal(git.status, 0, git.stderr)
  return dir
}

const handlerSource = [
  'function readShared() { readFileSync("record") }',
  'function checkArtifacts() { spawnSync("checker") }',
  'export async function handleHook(input) {',
  ' const event = input.hook_event_name',
  ' if (event === "SessionStart") { readShared(); return }',
  ' if (event === "Forgotten") return',
  ' if (event === "PreToolUse") { if (input.tool_name !== "Bash") return; checkArtifacts(); return }',
  ' if (!["Stop", "TaskCompleted"].includes(event)) return',
  ' if (event !== "Stop") checkArtifacts()',
  ' if (event === "Stop" && input.stop_hook_active) return',
  ' readShared()',
  '}',
].join('\n')

function manifest(extra = []) {
  const hook = { type: 'command', command: 'node', args: [pluginVariable + '/scripts/lifecycle.mjs'], timeout: 30 }
  return JSON.stringify({ hooks: {
    SessionStart: [{ hooks: [hook] }], PreToolUse: [{ matcher: 'Bash|Edit', hooks: [hook] }, ...extra],
    Stop: [{ hooks: [hook] }], TaskCompleted: [{ hooks: [hook] }],
  } }, null, 2)
}

const agent = [
  '---', 'name: reader', 'hooks:', '  PreToolUse:', '    - matcher: "Bash|Edit"',
  '      hooks:', '        - type: command',
  '          command: node "' + pluginVariable + '/scripts/reviewer.mjs"',
  '          timeout: 15', '---', 'Body is not configuration.', 'hooks: ignored',
].join('\n')
const flow = [
  'name: checks', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:',
  'jobs:', '  check:', '    strategy:', '      matrix:', '        os: [ubuntu-latest, windows-latest]',
  '    steps:', '      - name: test', '        if: github.event_name == "push"',
  '        run: |', '          node scripts/check.mjs', '          echo done',
  '      - run: node scripts/other.mjs',
].join('\n')

test('event analyser maps declarations, dispatch guards, shared work and Git/CI', t => {
  const dir = fixture(t, {
    'plugin/hooks/hooks.json': manifest(), 'plugin/scripts/lifecycle.mjs': handlerSource,
    'plugin/scripts/reviewer.mjs': 'export const present = true',
    'plugin/agents/reader.md': agent, 'plugin/skills/a/SKILL.md': agent,
    '.githooks/pre-commit': '#!/bin/bash\nnode scripts/check.mjs\n', '.github/workflows/check.yml': flow,
  })
  assert.equal(spawnSync('git', ['-C', dir, 'config', 'core.hooksPath', '.githooks'], { timeout: 5000 }).status, 0)
  const report = analyzeRepository(dir, { parse })
  assert.deepEqual(report.problems, [])
  assert.equal(report.registrations.length, 6)
  assert.ok(report.registrations.some(row => row.scope.startsWith('skill:')))
  const module = report.dispatch[0]
  assert.ok(module.events.find(row => row.event === 'TaskCompleted').reachable.includes('checkArtifacts'))
  assert.ok(!module.events.find(row => row.event === 'Stop').reachable.includes('checkArtifacts'))
  assert.deepEqual(report.sharedWork.find(row => row.name === 'checkArtifacts').events, ['PreToolUse', 'TaskCompleted'])
  assert.deepEqual(report.unwiredHandlers.map(row => row.event), ['Forgotten'])
  assert.equal(report.gitHooks[0].activation, 'configured')
  assert.deepEqual(report.workflows[0].events, ['push', 'workflow_dispatch'])
  const job = report.workflows[0].jobs[0]
  assert.equal(job.runs.length, 2)
  assert.equal(job.runs[0].source.line, 14)
  assert.match(job.runs[0].command, /echo done/)
  assert.match(job.fanout[0], /windows-latest/)
  assert.equal(job.conditions.length, 1)
  assert.match(formatReport(report), /UNOBSERVED/)
  assert.match(formatReport(report), /Unregistered handler: Forgotten/)
  writeFileSync(path.join(dir, 'plugin/scripts/lifecycle.mjs'), handlerSource.replace('if (event !== "Stop") checkArtifacts()', 'checkArtifacts()'))
  assert.ok(analyzeRepository(dir, { parse }).dispatch[0].events.find(row => row.event === 'Stop').reachable.includes('checkArtifacts'),
    'the next report must follow edited source, not a fixed event table')
})

test('event analyser finds duplicate declarations and missing targets without executing source', t => {
  const extra = { matcher: 'Edit', hooks: [{ type: 'command', command: 'node', args: [pluginVariable + '/scripts/lifecycle.mjs'] }] }
  const dir = fixture(t, { 'plugin/hooks/hooks.json': manifest([extra]),
    'plugin/scripts/lifecycle.mjs': handlerSource + '\nthrow new Error("must never execute")', 'plugin/agents/reader.md': agent })
  const calls = []
  const run = (command, args, options) => {
    calls.push(command)
    assert.equal(command, 'git', 'analysis may only ask Git for inventory/configuration')
    assert.ok(options.timeout > 0)
    return spawnSync(command, args, options)
  }
  const report = analyzeRepository(dir, { parse, run })
  assert.equal(calls.length, 2)
  assert.equal(report.diagnostics.filter(row => row.kind === 'duplicate-registration').length, 1)
  assert.match(report.diagnostics.find(row => row.kind === 'missing-target').detail, /reviewer.mjs/)
  assert.deepEqual(report.problems, [])
  const clean = fixture(t, { 'plugin/hooks/hooks.json': manifest(), 'plugin/scripts/lifecycle.mjs': handlerSource })
  assert.equal(analyzeRepository(clean, { parse }).diagnostics.length, 0)
})

test('event analyser treats unsupported inputs and unavailable parsing as incomplete', t => {
  const dir = fixture(t, { 'plugin/hooks/hooks.json': '{"hooks":{"Stop":"bad"}}',
    'plugin/agents/reader.md': '---\nhooks: &dynamic\n---', '.github/workflows/a.yml': 'on: dynamic()\njobs: []' })
  const report = analyzeRepository(dir)
  assert.ok(report.problems.length >= 4)
  assert.match(formatReport(report), /PARTIAL/)
  assert.throws(() => analyzeRepository(dir, { run: () => ({ status: 1 }) }), /scope is unknown/)
  assert.throws(() => inspectDispatch('export function handleHook(i) {}', 'x.mjs', parse), /discriminator/)
  assert.equal(inspectDispatch('export const x = true', 'x.mjs', parse), null)
  assert.throws(() => inspectDispatch('broken {', 'x.mjs', parse), /parser rejected/)
  const broken = fixture(t, { 'plugin/hooks/hooks.json': manifest(), 'plugin/scripts/lifecycle.mjs': 'broken {' })
  assert.match(analyzeRepository(broken, { parse }).problems.join('\n'), /parser rejected/)
})

test('event analyser normalizes Windows paths and does not guess regex overlap', t => {
  const document = JSON.parse(manifest())
  document.hooks.SessionStart[0].hooks[0].args = [pluginVariable + '\\scripts\\lifecycle.mjs']
  document.hooks.PreToolUse.push({ matcher: 'E.*', hooks: [document.hooks.PreToolUse[0].hooks[0]] })
  const dir = fixture(t, { 'plugin/hooks/hooks.json': JSON.stringify(document), 'plugin/scripts/lifecycle.mjs': handlerSource })
  const report = analyzeRepository(dir, { parse })
  assert.deepEqual(report.registrations[0].targets, ['plugin/scripts/lifecycle.mjs'])
  assert.equal(report.diagnostics.filter(row => row.kind === 'duplicate-registration').length, 0)
})

const schema = 'quality-harness-hook-trace-v1'
function observation(invocation, phase, at, extra = {}) {
  return { schema, invocation, phase, at, handler: 'Stop:0', session: 's', event: 'Stop', tool: null,
    toolUseId: 'u', inputHash: 'a'.repeat(64), ...(phase === 'end' ? { durationMs: 100, status: 0, timedOut: false, outputLimitExceeded: false, cleanupConfirmed: null, error: null } : {}), ...extra }

}
const jsonl = rows => rows.map(row => JSON.stringify(row)).join('\n')

test('event trace measures runs, repeats, duration and overlap without counting copied logs twice', () => {
  const a = observation('a', 'start', 0)
  const rows = [a, a, observation('b', 'start', 50), observation('a', 'end', 100),
    observation('b', 'end', 150), observation('c', 'start', 150), observation('c', 'end', 200, { durationMs: 50, status: 2, timedOut: true, cleanupConfirmed: false })]
  const report = analyzeTrace(jsonl(rows), [{ id: 'Stop:0' }, { id: 'PreToolUse:0' }])
  assert.equal(report.observed, 3)
  assert.equal(report.ignoredDuplicates, 1)
  assert.equal(report.maxConcurrent, 2, 'touching endpoints are not concurrent')
  assert.equal(report.handlers[0].totalMs, 250)
  assert.equal(report.handlers[0].p95Ms, 100)
  assert.equal(report.handlers[0].failures, 1)
  assert.equal(report.handlers[0].cleanupUnconfirmed, 1)
  assert.equal(report.repeatedInputs[0].count, 3)
  assert.deepEqual(report.notObserved, ['PreToolUse:0'])
  assert.deepEqual(report.problems, [])
})

test('event trace reports malformed, conflicting and incomplete observations', () => {
  const report = analyzeTrace(jsonl([observation('a', 'start', 1), observation('a', 'start', 2),
    observation('a', 'end', 0), observation('orphan', 'end', 3), { schema: 'other' }]) + '\nnot-json')
  assert.equal(report.handlers[0].unfinished, 1)
  assert.equal(report.handlers[0].p95Ms, null)
  assert.equal(report.maxConcurrent, 0)
  assert.equal(report.problems.length, 5)
  assert.equal(analyzeTrace('').observed, 0)
  assert.match(analyzeTrace('').limitation, /does not mean unused/)
})

test('event recording omits payload contents and preserves command input/output', async t => {
  const dir = fixture(t, {})
  const traceFile = path.join(dir, 'trace.jsonl')
  const raw = JSON.stringify({ hook_event_name: 'Stop', session_id: 'session', tool_input: { secret: 'never-store-this-content' } })
  const expected = { stdout: 'out', stderr: 'err', status: 7, timedOut: false, outputLimitExceeded: false, cleanupConfirmed: null }
  const result = await recordInvocation({ traceFile, handlerId: 'Stop:0', command: 'checker', args: ['arg'], raw, timeoutMs: 500 }, async (command, args, options) => {
    assert.equal(command, 'checker')
    assert.deepEqual(args, ['arg'])
    assert.equal(options.input, raw)
    assert.equal(options.timeoutMs, 500)
    assert.equal(options.maxOutputBytes, 4 * 1024 * 1024)
    return expected
  })
  assert.equal(result, expected)
  const text = readFileSync(traceFile, 'utf8')
  assert.doesNotMatch(text, /never-store-this-content|tool_input/)
  assert.equal(analyzeTrace(text).handlers[0].failures, 1)
  await assert.rejects(recordInvocation({ traceFile: path.join(dir, 'missing', 'trace'), handlerId: 'id', raw: '{}', timeoutMs: 100 },
    () => { assert.fail('must not run without recording') }), /ENOENT/)
})

test('event analyser CLI validates arguments and records a real bounded command', async t => {
  let stdout = ''
  const io = { stdout: { write: value => { stdout += value } }, stderr: { write: () => {} } }
  assert.equal(await main(['--help'], io), 0)
  assert.match(stdout, /Analysis never executes hooks/)
  assert.equal(await main(['--unknown'], io), 2)
  assert.equal(await main(['record', '--trace', 'x', '--id', 'id', '--timeout-ms', 'NaN', '--', 'node'], io), 2)
  const dir = fixture(t, { 'plugin/hooks/hooks.json': manifest(), 'plugin/scripts/lifecycle.mjs': handlerSource })
  assert.equal(await main(['--root', dir, '--json'], { ...io, acorn: { unavailable: 'test' } }), 2)
  assert.equal(await main(['--root', dir, '--json'], { ...io, acorn: { parse } }), 0)
  const trace = path.join(dir, 'observed.jsonl')
  const raw = '{"hook_event_name":"Stop","session_id":"s"}'
  const result = spawnSync(process.execPath, [cli, 'record', '--trace', trace, '--id', 'Stop:0', '--', process.execPath, '-e',
    'process.stdin.resume(); process.stdout.write("kept"); process.stderr.write("also-kept"); process.exitCode=7'], { input: raw, encoding: 'utf8', timeout: 10_000 })
  assert.equal(result.status, 7, result.stderr)
  assert.equal(result.stdout, 'kept')
  assert.equal(result.stderr, 'also-kept')
  assert.equal(analyzeTrace(readFileSync(trace, 'utf8')).observed, 1)
  const timed = spawnSync(process.execPath, [cli, 'record', '--trace', trace, '--id', 'Stop:0', '--timeout-ms', '100', '--',
    process.execPath, '-e', 'setTimeout(() => {}, 30000)'], { input: raw, encoding: 'utf8', timeout: 10_000 })
  assert.equal(timed.status, 2)
  assert.match(timed.stderr, /PARTIAL/)
  assert.equal(analyzeTrace(readFileSync(trace, 'utf8')).handlers[0].timeouts, 1)
  const report = analyzeRepository(dir, { parse })
  report.runtime = analyzeTrace(readFileSync(trace, 'utf8'), report.registrations)
  assert.match(formatReport(report), /Peak overlap/)
  assert.equal(await main(['--root', dir, '--trace', trace], { ...io, acorn: { parse } }), 0)
  assert.equal(await main(['--root', dir, '--trace', path.join(dir, 'absent')], { ...io, acorn: { parse } }), 2)
})

test('event analyser rejects false entrypoints and malformed declarations while retaining CI filters', t => {
  const document = JSON.parse(manifest())
  document.hooks.Stop[0].hooks[0] = { type: 'command', command: 'echo "scripts/fake.mjs"' }
  const dir = fixture(t, { 'plugin/hooks/hooks.json': JSON.stringify(document), 'plugin/scripts/lifecycle.mjs': handlerSource,
    '.github/workflows/check.yml': flow })
  const report = analyzeRepository(dir, { parse })
  assert.equal(report.registrations.find(row => row.event === 'Stop').targetState, 'unresolved')
  const markdown = formatReport(report)
  assert.match(markdown, /branches:/)
  assert.match(markdown, /Condition at line/)
  const source = handlerSource.replace('readFileSync("record")', 'executed(); executableName(); readFileSync("record")')
  assert.deepEqual(inspectDispatch(source, 'x.mjs', parse).functions.find(fn => fn.name === 'readShared').effects, ['readFileSync'])
  document.hooks.PreToolUse[0].matcher = 123
  writeFileSync(path.join(dir, 'plugin/hooks/hooks.json'), JSON.stringify(document))
  assert.match(analyzeRepository(dir, { parse }).problems.join('\n'), /matcher must be a string/)
  document.hooks.PreToolUse[0].matcher = 'Bash'
  document.hooks.Stop[0].hooks[0] = { type: 'command', command: '', timeout: -1 }
  writeFileSync(path.join(dir, 'plugin/hooks/hooks.json'), JSON.stringify(document))
  assert.match(analyzeRepository(dir, { parse }).problems.join('\n'), /invalid timeout/)
  const hostile = analyzeRepository(dir, { parse })
  hostile.registrations[0].command = '<img src=x onerror=alert(1)> [click](javascript:x)'
  hostile.registrations[0].targets = []
  assert.doesNotMatch(formatReport(hostile), /<img|\[click\]\(javascript:/)
})

test('event analyser contains reads even when a listed module resolves outside the repository', async t => {
  const { symlinkSync } = await import('node:fs')
  const outside = fixture(t, { 'lifecycle.mjs': handlerSource })
  const dir = fixture(t, { 'plugin/hooks/hooks.json': manifest() })
  // A directory junction is available to unprivileged Windows users as well as
  // acting as a directory symlink on POSIX; no host-specific skip is inferred.
  symlinkSync(outside, path.join(dir, 'plugin/scripts'), 'junction')
  const listing = ['plugin/hooks/hooks.json', 'plugin/scripts/lifecycle.mjs'].join('\0') + '\0'
  const report = analyzeRepository(dir, { parse, run: (command, args) =>
    args.includes('ls-files') ? { status: 0, stdout: listing } : { status: 1 } })
  assert.match(report.problems.join('\n'), /outside the repository/)
  assert.equal(report.dispatch.length, 0)
  assert.equal(report.registrations[0].targetState, 'listed', 'Git membership is not proof the target was readable')
})

test('event trace refuses malformed result types instead of treating them as successful runs', () => {
  for (const extra of [{ status: '0' }, { timedOut: 'false' }, { cleanupConfirmed: 'yes' }, { durationMs: -1 }]) {
    const report = analyzeTrace(jsonl([observation('a', 'start', 0), observation('a', 'end', 100, extra)]))
    assert.equal(report.handlers[0].completed, 0)
    assert.equal(report.handlers[0].unfinished, 1)
    assert.match(report.problems[0], /malformed/)
  }
  assert.equal(analyzeTrace(jsonl([observation('a', 'start', 0, { inputHash: '' })])).observed, 0)
  assert.equal(analyzeTrace(jsonl([observation('a', 'start', 0), observation('a', 'end', 100)])).handlers[0].completed, 1)
})

test('event recorder forwards child help and split UTF-8 input, preserving output if the trace write fails', async t => {
  const dir = fixture(t, {})
  const trace = path.join(dir, 'trace.jsonl')
  let stdout = ''
  let stderr = ''
  const raw = Buffer.from('{"hook_event_name":"Stop","text":"ž"}')
  const split = raw.indexOf(Buffer.from('ž')) + 1
  const io = { stdin: [raw.subarray(0, split), raw.subarray(split)],
    stdout: { write: value => { stdout += value } }, stderr: { write: value => { stderr += value } } }
  const code = 'process.stdin.on("data", b=>process.stdout.write(b)); process.stderr.write(process.argv[1])'
  assert.equal(await main(['record', '--trace', trace, '--id', 'id', '--', process.execPath, '-e', code, '--', '--help'], io), 0)
  assert.equal(stdout, raw.toString())
  assert.equal(stderr, '--help')
  const traceDir = path.join(dir, 'vanishing')
  mkdirSync(traceDir)
  stdout = ''; stderr = ''
  const remove = 'require("node:fs").rmSync(process.argv[1],{recursive:true,force:true}); process.stdout.write("keep-output")'
  assert.equal(await main(['record', '--trace', path.join(traceDir, 'trace'), '--id', 'id', '--', process.execPath, '-e', remove, traceDir],
    { ...io, stdin: [] }), 2)
  assert.equal(stdout, 'keep-output')
  assert.match(stderr, /PARTIAL/)
})


test('event analyser distinguishes workflow shell defaults from executable run steps', t => {
  const source = flow.replace('    steps:', '    defaults:\n      run:\n        shell: bash\n    steps:')
  const dir = fixture(t, { '.github/workflows/check.yml': source })
  const report = analyzeRepository(dir, { parse })
  assert.deepEqual(report.problems, [])
  assert.equal(report.workflows[0].jobs[0].runs.length, 2)
  assert.ok(report.workflows[0].jobs[0].runs.every(row => row.command.includes('node scripts/')))
  writeFileSync(path.join(dir, '.github/workflows/check.yml'), source.replace('      - run: node scripts/other.mjs', '      - run: |\n          node scripts/third.mjs'))
  const changed = analyzeRepository(dir, { parse }).workflows[0].jobs[0]
  assert.equal(changed.runs.length, 2)
  assert.equal(changed.runs[1].command, 'node scripts/third.mjs')
})

test('event recorder and analyser agree about a command that cannot spawn', async t => {
  const dir = fixture(t, {})
  const trace = path.join(dir, 'failed-spawn.jsonl')
  const io = { stdin: [], stdout: { write() {} }, stderr: { write() {} } }
  assert.equal(await main(['record', '--trace', trace, '--id', 'missing', '--', path.join(dir, 'no-such-executable')], io), 2)
  const report = analyzeTrace(readFileSync(trace, 'utf8'))
  assert.deepEqual(report.problems, [])
  assert.equal(report.handlers[0].completed, 1)
  assert.equal(report.handlers[0].failures, 1)
  assert.equal(report.handlers[0].unfinished, 0)
})

test('event analyser names conditional cross-scope overlap without declaring duplicate execution', t => {
  const document = JSON.parse(manifest())
  const command = 'node "' + pluginVariable + '/scripts/reviewer.mjs"'
  document.hooks.PreToolUse[0].hooks = [{ type: 'command', command }]
  const dir = fixture(t, { 'plugin/hooks/hooks.json': JSON.stringify(document), 'plugin/agents/reader.md': agent,
    'plugin/scripts/lifecycle.mjs': handlerSource, 'plugin/scripts/reviewer.mjs': 'export const x = true' })
  const report = analyzeRepository(dir, { parse })
  const candidate = report.diagnostics.find(row => row.kind === 'cross-scope-candidate')
  assert.ok(candidate)
  assert.equal(candidate.registrations.length, 2)
  assert.match(candidate.detail, /activation/)
  assert.equal(report.diagnostics.filter(row => row.kind === 'duplicate-registration').length, 0)
  document.hooks.PreToolUse[0].hooks[0].command = 'node "scripts/different.mjs"'
  writeFileSync(path.join(dir, 'plugin/hooks/hooks.json'), JSON.stringify(document))
  assert.equal(analyzeRepository(dir, { parse }).diagnostics.filter(row => row.kind === 'cross-scope-candidate').length, 0)
})
