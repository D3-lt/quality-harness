// ADR-122 T1: scripts/hook-footprint.mjs counts this plugin's hook text in a transcript, by event, channel and item. The
// transcripts here are synthetic, built from the record shapes measured on 2026-10-22 (Claude Code 2.1.307): hook output
// is an `attachment` of type hook_success (with the hook's command), hook_additional_context, hook_system_message or
// hook_non_blocking_error, or a `system` record of subtype stop_hook_summary.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { footprint } from '../scripts/hook-footprint.mjs'
import { remove } from './helpers/remove.mjs'

const OURS = 'node ${CLAUDE_PLUGIN_ROOT}/scripts/lifecycle.mjs'
const BRIEF = 'node ${CLAUDE_PLUGIN_ROOT}/scripts/branch-state.mjs --brief --cached 120'
const theirs = 'node /elsewhere/other-plugin/hook.mjs'
const success = (event, toolUseID, command, stdout = '') =>
  ({ type: 'attachment', attachment: { type: 'hook_success', hookEvent: event, toolUseID, command, stdout, durationMs: 40 } })
const context = (event, toolUseID, text) =>
  ({ type: 'attachment', attachment: { type: 'hook_additional_context', hookEvent: event, toolUseID, content: [text] } })
const headline = (event, toolUseID, text) =>
  ({ type: 'attachment', attachment: { type: 'hook_system_message', hookEvent: event, toolUseID, content: text } })
const toolResult = text => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: text }] } })

function transcript(records, tail = '') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-footprint-'))
  const file = path.join(dir, 'session.jsonl')
  writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n' + tail)
  return { dir, file }
}

const row = (result, event, channel, item) =>
  result.rows.find(r => r.event === event && r.channel === channel && r.item === item)

test("hook-footprint counts this plugin's hook text by item and channel", () => {
  const advice = 'quality-harness: this repository is unchecked <qh:mention@1a2b3c4d>'
  const { dir, file } = transcript([
    success('PreToolUse', 't1', OURS, '{"hookSpecificOutput":{}}'),
    context('PreToolUse', 't1', advice),
    headline('PreToolUse', 't1', 'quality-harness: unchecked'),
    success('PreToolUse', 't2', OURS, '{"hookSpecificOutput":{}}'),
    context('PreToolUse', 't2', advice),
    success('UserPromptSubmit', 'u1', BRIEF, 'branch-state: main @ abc, clean'),
    { type: 'system', subtype: 'compact_boundary' },
    success('UserPromptSubmit', 'u2', BRIEF, 'branch-state: main @ abc, clean'),
  ])
  try {
    const result = footprint(file)
    assert.deepEqual(
      { firings: row(result, 'PreToolUse', 'additionalContext', 'mention').firings,
        characters: row(result, 'PreToolUse', 'additionalContext', 'mention').characters },
      { firings: 2, characters: 2 * advice.length })
    assert.equal(row(result, 'PreToolUse', 'systemMessage', 'unmarked').firings, 1)
    assert.equal(row(result, 'UserPromptSubmit', 'stdout', 'unmarked').firings, 2)
    // A JSON stdout is the envelope the attachments were taken from, not a second channel.
    assert.equal(row(result, 'PreToolUse', 'stdout', 'unmarked'), undefined)
    assert.equal(result.compactions, 1)
    assert.equal(result.contexts, 2)
    assert.equal(result.durationMs.PreToolUse.median, 40)
  } finally { remove(dir) }
})

test('a tool result quoting hook text is not hook output', () => {
  const quoted = 'quality-harness: this repository is unchecked <qh:mention@1a2b3c4d>'
  const { dir, file } = transcript([
    toolResult(quoted),
    { type: 'user', message: { role: 'user', content: 'compact_boundary is a word in this prompt' } },
    // Another plugin's hook on the same call: its context cannot be told from ours, so it is not counted as ours.
    success('PreToolUse', 't3', OURS, ''),
    success('PreToolUse', 't3', theirs, ''),
    context('PreToolUse', 't3', 'some context'),
    // A call with only another plugin's hook is not ours at all.
    success('PreToolUse', 't4', theirs, ''),
    context('PreToolUse', 't4', 'their context'),
  ])
  try {
    const result = footprint(file)
    assert.equal(result.rows.filter(r => r.item === 'mention').length, 0, 'the quoted marker is not a firing')
    assert.equal(result.compactions, 0, 'a word in a prompt is not a boundary')
    assert.equal(result.ambiguous, 1)
    assert.equal(result.rows.reduce((n, r) => n + r.firings, 0), 0)
    // Twin: the same context with our hook alone on its call is ours.
    const { dir: dir2, file: file2 } = transcript([success('PreToolUse', 't5', OURS, ''), context('PreToolUse', 't5', 'ours')])
    try { assert.equal(row(footprint(file2), 'PreToolUse', 'additionalContext', 'unmarked').firings, 1) } finally { remove(dir2) }
  } finally { remove(dir) }
})

test('an unparseable transcript line is counted as unreadable', () => {
  const { dir, file } = transcript([success('UserPromptSubmit', 'u1', BRIEF, 'branch-state: ok')], '{"type": "attachm')
  try {
    const result = footprint(file)
    assert.equal(result.unreadable, 1)
    assert.equal(row(result, 'UserPromptSubmit', 'stdout', 'unmarked').firings, 1, 'the readable lines are still counted')
    // Twin: a transcript with no broken line says 0.
    const { dir: dir2, file: file2 } = transcript([success('UserPromptSubmit', 'u1', BRIEF, 'x')])
    try { assert.equal(footprint(file2).unreadable, 0) } finally { remove(dir2) }
  } finally { remove(dir) }
})

// ADR-122 T5: the routed hooks over a synthetic session, counted by T1's method. One transcript holds both what the host records
// of each hook (the attachments T1 counts) and the requests the model received (what said-per-context reads), as a real one does.
test('a routed session carries each item once per context', async () => {
  const { appendFileSync } = await import('node:fs')
  const { deliver } = await import('../plugin/scripts/lifecycle.mjs')
  const { briefUnchanged } = await import('../plugin/scripts/branch-state.mjs')
  const { spawnSync } = await import('node:child_process')
  const { dir, file } = transcript([])
  const repo = path.join(dir, 'repo')
  spawnSync('git', ['init', '-q', repo], { timeout: 10_000, windowsHide: true })
  const append = r => appendFileSync(file, `${JSON.stringify(r)}\n`)
  const MAIN = 'repl_main_thread:outputStyle:Concise'
  let n = 0
  let base = null
  let held = 0 // messages the context's last request carries: what the next one keeps
  const received = (hash, text) => {
    append({ type: 'api-request-blob', hash, message: { role: 'system', content: [{ type: 'text', text }] } })
    n += 1
    append({ type: 'api-request', id: `q${n}`, base, keep: base ? held : 0, tail: [hash], querySource: MAIN })
    held = (base ? held : 0) + 1
    base = `q${n}`
  }
  const input = { hook_event_name: 'PreToolUse', session_id: `s-${path.basename(dir)}`, transcript_path: file, cwd: repo }
  const mention = 'quality-harness: this repository is unchecked — and the command only mentions commit or push.'
  const fire = (tree, call) => {
    const out = deliver([{ rule: 'P', key: `${tree}:mention`, text: mention }], input).output
    append(success('PreToolUse', call, OURS, out ? JSON.stringify(out) : ''))
    if (out) {
      append(context('PreToolUse', call, out.hookSpecificOutput.additionalContext))
      append(headline('PreToolUse', call, out.systemMessage))
      received(`m-${call}`, out.hookSpecificOutput.additionalContext)
    } else received(`u-${call}`, 'tool result')
  }
  try {
    for (const tree of ['a', 'b', 'c']) fire(tree, `t-${tree}1`)
    // A compaction: the next request starts a chain of its own, and the boundary is recorded.
    append({ type: 'system', subtype: 'compact_boundary' })
    base = null
    received('c1', 'summary')
    for (const tree of ['a', 'b', 'c']) fire(tree, `t-${tree}2`)
    // The brief on five prompts whose only change is the working tree's count.
    let said = null
    for (let prompt = 1; prompt <= 5; prompt += 1) {
      const text = `branch-state: main @ abc1234, ${prompt} uncommitted path(s) · CI abc1234: every job concluded success.`
      if (briefUnchanged(said, text)) continue
      append(success('UserPromptSubmit', `u${prompt}`, BRIEF, text))
      said = text
    }
    const result = footprint(file)
    assert.equal(result.contexts, 2)
    assert.equal(row(result, 'PreToolUse', 'additionalContext', 'p').firings, 2, 'the mention once in each context, not on six trees')
    assert.equal(row(result, 'PreToolUse', 'systemMessage', 'unmarked').firings, 2, 'and its headline only with it')
    assert.equal(row(result, 'UserPromptSubmit', 'stdout', 'unmarked').firings, 1, 'the brief once, not on five prompts')
  } finally { remove(dir) }
})
