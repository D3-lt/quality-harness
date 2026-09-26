// What `scripts/session-profile.mjs --attribute` says about who put bytes and
// time into a session's context. Roadmap Stage 1 (BACKLOG §301): every later
// stage states its saving against these numbers, so a reader that pools two hooks
// or calls a changed record unchanged would mis-set every target after it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { attribute, hookScript } from '../scripts/session-profile.mjs'

const hook = (hookName, command, content, durationMs) => ({
  type: 'attachment',
  attachment: { type: 'hook_success', hookName, content,
                ...(command === undefined ? {} : { command }),
                ...(durationMs === undefined ? {} : { durationMs }) },
})

test('a hook command is named by the script it runs', () => {
  // The command shapes measured in a real transcript on 2026-09-26.
  assert.equal(hookScript("AGENTSMEMORY_MCP_URL='http://localhost:8080/mcp' bash -- '/x/agentsmemory-task-recall-hook.sh'"),
    'agentsmemory-task-recall-hook.sh')
  assert.equal(hookScript('node ${CLAUDE_PLUGIN_ROOT}/scripts/branch-state.mjs --brief --cached 120'), 'branch-state.mjs')
  assert.equal(hookScript('node "$CLAUDE_PROJECT_DIR/scripts/rules-inject.mjs"'), 'rules-inject.mjs')
  // A dispatcher names nothing alone; its first bare argument is the hook.
  assert.equal(hookScript('"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start'), 'run-hook.cmd session-start')
  assert.equal(hookScript('C:\\hooks\\run-hook.cmd --flag'), 'run-hook.cmd')
  // No script: the first word that is not an environment assignment.
  assert.equal(hookScript('FOO=1 my-hook --x'), 'my-hook')
  assert.equal(hookScript(''), null)
  assert.equal(hookScript(undefined), null)
})

test('two hooks on one event are two rows, and a record with no command says so', () => {
  const by = attribute([
    hook('UserPromptSubmit', 'bash -- /x/recall-hook.sh', 'aaaa'),
    hook('UserPromptSubmit', 'node /p/branch-state.mjs --brief', 'bb'),
    hook('UserPromptSubmit', undefined, 'c'),
  ])
  assert.deepEqual([...by.keys()].sort(), [
    'hook:UserPromptSubmit · (command not recorded)',
    'hook:UserPromptSubmit · branch-state.mjs',
    'hook:UserPromptSubmit · recall-hook.sh',
  ])
  assert.equal(by.get('hook:UserPromptSubmit · recall-hook.sh').bytes, 4)
  assert.equal(by.get('hook:UserPromptSubmit · branch-state.mjs').bytes, 2)
})

test('unchanged counts only a record identical to the same source\'s previous one', () => {
  const by = attribute([
    hook('UserPromptSubmit', 'a.sh', 'same'),
    hook('UserPromptSubmit', 'b.sh', 'other'),   // another source between them
    hook('UserPromptSubmit', 'a.sh', 'same'),    // unchanged: 4 bytes
    hook('UserPromptSubmit', 'a.sh', 'moved'),   // changed
    hook('UserPromptSubmit', 'a.sh', 'same'),    // changed back: not its previous
  ])
  assert.equal(by.get('hook:UserPromptSubmit · a.sh').unchangedBytes, 4)
  assert.equal(by.get('hook:UserPromptSubmit · a.sh').records, 4)
  // DIRTY twin: a source whose every record differs reports nothing unchanged.
  assert.equal(by.get('hook:UserPromptSubmit · b.sh').unchangedBytes, 0)
})

test('latency is the harness\'s durationMs, and a record without one is not timed', () => {
  const by = attribute([
    hook('PreToolUse:Bash', 'lifecycle.mjs', '', '400'),
    hook('PreToolUse:Bash', 'lifecycle.mjs', '', '1200'),
    hook('PreToolUse:Bash', 'lifecycle.mjs', ''),
    hook('PreToolUse:Bash', 'lifecycle.mjs', '', 'not a number'),
  ])
  const seen = by.get('hook:PreToolUse:Bash · lifecycle.mjs')
  assert.equal(seen.records, 4)
  assert.equal(seen.timed, 2)
  assert.equal(seen.ms, 1600)
  assert.equal(seen.maxMs, 1200)
})

test('a command-less record is credited only when its tool call ran exactly one command', () => {
  // The shape measured 2026-09-26: lifecycle.mjs's hook_success carries the
  // command, and its additional context arrives beside it with none.
  const context = (toolUseID, content) => ({ type: 'attachment', attachment:
    { type: 'hook_additional_context', hookName: 'PreToolUse:Bash', toolUseID, content } })
  const run = (toolUseID, command) => ({ type: 'attachment', attachment:
    { type: 'hook_success', hookName: 'PreToolUse:Bash', toolUseID, command, content: '' } })
  const by = attribute([
    context('t1', 'advice'), run('t1', 'node /p/lifecycle.mjs'),
    run('t2', 'node /p/lifecycle.mjs'), run('t2', 'bash /x/other.sh'), context('t2', 'whose?'),
  ])
  assert.equal(by.get('hook:PreToolUse:Bash · lifecycle.mjs').bytes, 6)
  // DIRTY twin: two commands on one tool call leave the writer unrecorded.
  assert.equal(by.get('hook:PreToolUse:Bash · (command not recorded)').bytes, 6)
})
test('a hook that did not name itself is still its own UNATTRIBUTED row', () => {
  const by = attribute([{ type: 'attachment', attachment: { type: 'hook_additional_context', content: 'x' } }])
  assert.deepEqual([...by.keys()], ['hook_additional_context (UNATTRIBUTED — hook did not name itself)'])
})
