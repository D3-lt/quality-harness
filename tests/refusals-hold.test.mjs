// ADR-113 T2. Two fail-opens in the sanctioned refusals, found mapping this plugin's side doors (2026-10-19): a
// .quality-harness.json that could not be read was read as "no check declared", and where nothing could be inferred the
// publish verdict returned nothing, so ADR-061's refusal went quiet; and a write through mrw's MCP tool was not a write to
// any hook, so ADR-060's read-only reviewer guard let it through. Driven through the hook, so QUALITY_HARNESS_HOOK_IMPL=go
// holds the Go core to the same answers.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fixtureRepo, ledgers, pluginDir, runHook, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'the fixtures run sh checks, as the goldens do (BACKLOG section 375)'
const said = run => run.stdout?.hookSpecificOutput ?? {}
const commit = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } }

test('a broken config and an mrw write are seen by both refusals', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const box = sandbox(t)
  // A declared check in a file JSON cannot parse (a trailing comma), and nothing a manifest could infer.
  const broken = fixtureRepo(box, 'broken', { '.quality-harness.json': '{"check": "sh check.sh",}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, broken, 'b1', { hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(broken, 'src', 'a.js'), 'y\n')
  const refused = said(runHook(box, broken, 'b1', commit))
  assert.equal(refused.permissionDecision, 'deny', 'an unchecked commit beside an unreadable declaration is still refused')
  assert.match(refused.permissionDecisionReason, /\.quality-harness\.json is not valid JSON/, 'the refusal names why no check can pass')
  // The turn end reads it the same way, in a session with no publish advice to stand for it (ADR-060): the work is
  // unchecked, and why no check can pass is said, not the no-check line.
  const quiet = fixtureRepo(box, 'quiet', { '.quality-harness.json': '{"check": "sh check.sh",}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, quiet, 'q1', { hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(quiet, 'src', 'a.js'), 'y\n')
  const ended = said(runHook(box, quiet, 'q1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })).additionalContext ?? ''
  assert.match(ended, /no `qh-check` has passed on/)
  assert.match(ended, /\.quality-harness\.json is not valid JSON/)
  // The twin: a project with no config and nothing to infer named no check, and the opt-in leaves its commit alone.
  const bare = fixtureRepo(box, 'bare', { 'src/a.js': 'x\n' })
  runHook(box, bare, 'b2', { hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(bare, 'src', 'a.js'), 'y\n')
  assert.notEqual(said(runHook(box, bare, 'b2', commit)).permissionDecision, 'deny', 'a project that declared nothing is not refused')

  // A read-only reviewer writing through mrw's MCP tool is refused, as an Edit is.
  const repo = fixtureRepo(box, 'mrw', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 'm1', { hook_event_name: 'SessionStart', source: 'startup' })
  const mrwWrite = { tool_name: 'mcp__mrw__mrw_write', tool_input: { plan: '@@ src/a.js 1 replace\ny\n' } }
  const guarded = said(runHook(box, repo, 'm1', { hook_event_name: 'PreToolUse', agent_type: 'quality-harness:qh-correctness-reviewer', ...mrwWrite }))
  assert.equal(guarded.permissionDecision, 'deny', 'the read-only guard refuses an mrw write')
  assert.match(guarded.permissionDecisionReason, /reviewer guard/)
  assert.notEqual(said(runHook(box, repo, 'm1', { hook_event_name: 'PreToolUse', ...mrwWrite })).permissionDecision, 'deny', 'the main agent may write through mrw')
  // And the write is recorded, with the plan's path, as an Edit's would be.
  writeFileSync(path.join(repo, 'src', 'a.js'), 'y\n')
  runHook(box, repo, 'm1', { hook_event_name: 'PostToolUse', ...mrwWrite, tool_response: { ok: true } })
  const written = Object.entries(ledgers(repo)).filter(([name]) => name.startsWith('sessions/')).flatMap(([, rows]) => rows)
    .filter(row => row.event === 'file.written').map(row => path.basename(row.path))
  assert.deepEqual(written, ['a.js'], 'an mrw write is recorded with the path its plan names')
  // The host only calls the hook for a tool a matcher names: the guard and the record are worth nothing unrouted.
  const hooks = JSON.parse(readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf8')).hooks
  const routes = (event, script) => (hooks[event] ?? []).some(group => typeof group.matcher === 'string'
    && new RegExp(`^(?:${group.matcher})$`).test('mcp__mrw__mrw_write') && group.hooks.some(hook => hook.args?.some(arg => arg.endsWith(script))))
  assert.ok(routes('PreToolUse', 'lifecycle.mjs'), 'PreToolUse routes an mrw write to the lifecycle hook')
  assert.ok(routes('PostToolUse', 'lifecycle.mjs'), 'PostToolUse routes an mrw write to the lifecycle hook')
})

// The Codex review of 6641c951..4db47214: only a native plan's headers were read, so a write in mrw's other forms was no write
// at all to the record, and a check that passed before it could stand for the tree after it. Each form is a write now, and one
// whose files the input does not name is recorded with no path, which counts as unseen until a check passes after it.
test('an mrw write in any of its forms is recorded, and one whose files cannot be named counts as unseen', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const box = sandbox(t)
  const written = (name, toolInput) => {
    const repo = fixtureRepo(box, name, { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
    runHook(box, repo, name, { hook_event_name: 'SessionStart', source: 'startup' })
    runHook(box, repo, name, { hook_event_name: 'PostToolUse', tool_name: 'mcp__mrw__mrw_write', tool_input: toolInput, tool_response: { ok: true } })
    return Object.entries(ledgers(repo)).filter(([file]) => file.startsWith('sessions/')).flatMap(([, rows]) => rows)
      .filter(row => row.event === 'file.written').map(row => (row.path === null ? null : path.basename(row.path)))
  }
  assert.deepEqual(written('patch', { format: 'apply_patch', plan: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-x\n+y\n*** Add File: src/c.js\n+z\n*** End Patch\n' }), ['a.js', 'c.js'])
  assert.deepEqual(written('renamed', { plan: '@@ src/a.js - rename\nsrc/b.js\n' }), ['a.js', 'b.js'], 'a rename writes its destination too')
  assert.deepEqual(written('sub', { grep: '\\bx\\b', sub: 'y' }), [null], 'a grep/sub write names no file, and is recorded as unseen')
  assert.deepEqual(written('aider', { format: 'search_replace', plan: 'src/a.js\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE\n' }), [null])
  // The twin: a native plan names its file, as T2 recorded it.
  assert.deepEqual(written('native', { plan: '@@ src/a.js 1 replace\ny\n' }), ['a.js'])
  // And an unseen write is outstanding at the turn end, where a named one in the tree is not.
  const repo = fixtureRepo(box, 'outstanding', { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'x\n' })
  runHook(box, repo, 'o1', { hook_event_name: 'SessionStart', source: 'startup' })
  runHook(box, repo, 'o1', { hook_event_name: 'PostToolUse', tool_name: 'mcp__mrw__mrw_write', tool_input: { grep: 'x', sub: 'y' }, tool_response: { ok: true } })
  const ended = said(runHook(box, repo, 'o1', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })).additionalContext ?? ''
  assert.match(ended, /no `qh-check` has passed on/, 'a write the record cannot place is unchecked work')
})
