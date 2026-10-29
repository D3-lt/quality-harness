// ADR-122 T1: scripts/hook-footprint.mjs counts this plugin's hook text in a transcript, by event, channel and item. The
// transcripts here are synthetic, built from the record shapes measured on 2026-10-22 (Claude Code 2.1.307): hook output
// is an `attachment` of type hook_success (with the hook's command), hook_additional_context, hook_system_message or
// hook_non_blocking_error, or a `system` record of subtype stop_hook_summary.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { footprint, HOOK_SCRIPTS } from '../scripts/hook-footprint.mjs'
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
test('a routed session carries each item once per context', { skip: 'Go cutover: the Node unit dispatcher is retired; native delivery is covered by the Go goldens and context parity' }, async () => {
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

// Claude Code 2.1.308 (measured 2026-10-22): SessionStart's context attachment carries `toolUseID: "SessionStart"`, not the
// call's id, so it joined nothing and every SessionStart context went uncounted. It is the latest SessionStart call's.
test("a 2.1.308 SessionStart context is the latest SessionStart call's, and one with no call is unattributed", () => {
  const standing = 'Verification: run it through qh-check. <qh:standing@7e94d3c2>'
  const { dir, file } = transcript([
    context('SessionStart', 'SessionStart', 'before any call'),
    success('SessionStart', 'c1', OURS, '{"hookSpecificOutput":{}}'),
    success('SessionStart', 'c1', BRIEF, 'branch-state: main @ abc, clean'),
    context('SessionStart', 'SessionStart', standing),
    success('SessionStart', 'c2', OURS, '{"hookSpecificOutput":{}}'),
    success('SessionStart', 'c2', theirs, '{"hookSpecificOutput":{}}'),
    context('SessionStart', 'SessionStart', standing),
  ])
  try {
    const result = footprint(file)
    assert.equal(row(result, 'SessionStart', 'additionalContext', 'standing')?.firings, 1, 'joined to the call before it')
    assert.equal(result.ambiguous, 1, 'a call another plugin\'s hook shared stays ambiguous')
    assert.equal(result.unattributed, 1, 'a context with no call before it is said, not dropped')
    assert.equal(row(result, 'SessionStart', 'additionalContext', 'unmarked'), undefined)
  } finally { remove(dir) }
})

// The Codex review of 979585de: the plugin root variable names no particular plugin, so another plugin's SessionStart hook
// read as this one's once a 2.1.308 context joined it. Ours is the variable followed by a script hooks.json names.
test("another plugin's hook under the plugin root variable is not ours, alone or beside ours", () => {
  const other = 'node ${CLAUDE_PLUGIN_ROOT}/scripts/other-hook.mjs'
  const { dir, file } = transcript([
    success('SessionStart', 'c1', other, '{"hookSpecificOutput":{}}'),
    context('SessionStart', 'SessionStart', 'another plugin says this <qh:standing@00000000>'),
    success('SessionStart', 'c2', other, '{"hookSpecificOutput":{}}'),
    success('SessionStart', 'c2', OURS, '{"hookSpecificOutput":{}}'),
    context('SessionStart', 'SessionStart', 'whose is this <qh:standing@11111111>'),
  ])
  try {
    const result = footprint(file)
    assert.equal(row(result, 'SessionStart', 'additionalContext', 'standing'), undefined, 'neither context is counted as ours')
    assert.equal(result.ambiguous, 1, 'the call both plugins hooked is ambiguous')
    assert.deepEqual(HOOK_SCRIPTS.sort(), ['branch-state.mjs', 'lifecycle.mjs', 'run-shell-hook.mjs'])
  } finally { remove(dir) }
})

test('native hook output and historical Node output remain attributable after the Go cutover', () => {
  const native = 'sh ${CLAUDE_PLUGIN_ROOT}/scripts/qh-hook.sh hook PreToolUse'
  const { dir, file } = transcript([
    success('PreToolUse', 'native', native, '{"hookSpecificOutput":{}}'),
    context('PreToolUse', 'native', 'native context'),
    success('PreToolUse', 'old', OURS, '{"hookSpecificOutput":{}}'),
    context('PreToolUse', 'old', 'old context'),
  ])
  try {
    const result = footprint(file)
    assert.equal(row(result, 'PreToolUse', 'additionalContext', 'unmarked').firings, 2)
    assert.equal(row(result, 'PreToolUse', 'additionalContext', 'unmarked').characters, 'native contextold context'.length)
    assert.equal(result.unattributed, 0)
  } finally { remove(dir) }
})

test('exclusive context totals count deliveries once while item rows can overlap', t => {
  const body = 'ą😀 <qh:a@11111111> and <qh:b@22222222>'
  const { dir, file } = transcript([
    success('PreToolUse', 'one', OURS, '{"hookSpecificOutput":{}}'),
    context('PreToolUse', 'one', body),
    success('PreToolUse', 'two', OURS, '{"hookSpecificOutput":{}}'),
    context('PreToolUse', 'two', [{ type: 'text', text: body }]),
    headline('PreToolUse', 'two', 'user only'),
    success('Stop', 'stop', OURS, 'debug only'),
    { type: 'attachment', attachment: { type: 'hook_non_blocking_error', hookEvent: 'Stop', toolUseID: 'err', command: OURS, stderr: 'diagnostic' } },
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.deepEqual(result.totals.observedModel, { deliveries: 2, characters: 2 * body.length, bytes: 2 * Buffer.byteLength(body) })
  assert.equal(result.totals.userOnly.characters, 'user only'.length)
  assert.equal(result.totals.diagnosticOnly.deliveries, 2)
  assert.equal(result.rowsOverlap, true)
  assert.equal(result.coverage.status, 'complete')
})

test('exclusive context attribution handles split native commands and keeps uncertainty visible', t => {
  const native = success('PreToolUse', 'native', 'sh')
  native.attachment.args = ['${CLAUDE_PLUGIN_ROOT}/scripts/qh-hook.sh', 'hook', 'PreToolUse']
  const { dir, file } = transcript([
    native, context('PreToolUse', 'native', 'known'),
    success('PreToolUse', 'bare', 'sh'), context('PreToolUse', 'bare', 'unidentified'),
    success('PreToolUse', 'mixed', OURS), success('PreToolUse', 'mixed', theirs),
    context('PreToolUse', 'mixed', 'mixed'),
    context('PreToolUse', 'missing', 'no receipt'),
    success('SessionStart', 'cache', 'sh /cache/quality-harness/quality-harness/3.8.60/scripts/qh-hook.sh hook SessionStart'),
    context('SessionStart', 'cache', 'cache'),
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.equal(result.totals.observedModel.characters, 'knowncache'.length)
  assert.equal(result.uncertain.ambiguous.characters, 'mixed'.length)
  assert.equal(result.uncertain.unattributed.characters, 'unidentifiedno receipt'.length)
  assert.equal(result.coverage.status, 'partial')
})

test('exclusive context rejects unsupported content shapes and reports host caps', t => {
  const { dir, file } = transcript([
    success('PreToolUse', 'typed', OURS), context('PreToolUse', 'typed', [{ type: 'text', text: 'actual' }]),
    success('PreToolUse', 'unknown', OURS), context('PreToolUse', 'unknown', { arbitrary: 'not known text' }),
    success('PreToolUse', 'cap', OURS), context('PreToolUse', 'cap', 'x'.repeat(10_001)),
    success('FutureEvent', 'future', OURS, 'unknown event output'),
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.equal(result.totals.observedModel.characters, 'actual'.length, 'text block metadata is not context')
  assert.equal(result.uncertain.unknownShapes, 1)
  assert.equal(result.uncertain.cappedDeliveries, 1)
  assert.equal(result.totals.unknownAudience.deliveries, 1)
  assert.equal(result.coverage.status, 'partial')
})

test('exclusive totals ignore paired Stop summaries but expose an unpaired summary', t => {
  const { dir, file } = transcript([
    success('Stop', 's', OURS, '{"decision":"block","reason":"continue"}'),
    context('Stop', 's', 'continue'),
    { type: 'system', subtype: 'stop_hook_summary', toolUseID: 's', hookErrors: ['continue'] },
    { type: 'system', subtype: 'stop_hook_summary', toolUseID: 'orphan', hookErrors: ['unobserved'] },
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.equal(result.totals.observedModel.characters, 'continue'.length)
  assert.equal(result.uncertain.unpairedSummaries, 1)
  assert.equal(result.coverage.status, 'partial')
})

test('exclusive totals join canonical SessionStart mirrors and require real Stop context', t => {
  const linked = context('PreToolUse', 'direct', 'direct content')
  linked.attachment.command = OURS
  const { dir, file } = transcript([
    success('SessionStart', 'startup', OURS, '{"hookSpecificOutput":{"additionalContext":"standing"}}'),
    context('SessionStart', 'SessionStart', 'standing'),
    linked,
    success('Stop', 'user-only', OURS),
    headline('Stop', 'user-only', 'headline'),
    { type: 'system', subtype: 'stop_hook_summary', toolUseID: 'user-only', hookErrors: ['continue unseen'] },
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.equal(result.totals.observedModel.characters, 'standingdirect content'.length)
  assert.equal(result.uncertain.missingCanonical, 0, 'the canonical latest-call mirror resolves before envelope accounting')
  assert.equal(result.totals.unknownAudience.deliveries, 0)
  assert.equal(result.uncertain.unpairedSummaries, 1, 'a user-only headline is no model-context mirror')
})

test('unusable canonical output and invalid records cannot report complete zero context', t => {
  const { dir, file } = transcript([
    null,
    success('SessionStart', 's', OURS, '{"hookSpecificOutput":{"additionalContext":"not represented"}}'),
    context('SessionStart', 's', ''),
    success('FutureEvent', 'f', OURS), headline('FutureEvent', 'f', 'future headline'),
    success('UserPromptSubmit', 'ok', BRIEF, 'valid observation'),
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.equal(result.unreadable, 1)
  assert.equal(result.totals.observedModel.characters, 'valid observation'.length)
  assert.equal(result.uncertain.missingCanonical, 1)
  assert.equal(result.totals.unknownAudience.characters, 'not representedfuture headline'.length)
  assert.equal(result.coverage.status, 'partial')
})

test('an unrelated canonical attachment cannot vouch for this hook and prototype names are not channels', t => {
  const other = context('PreToolUse', 'mixed-owned', 'their text')
  other.attachment.command = theirs
  const invalid = context('UserPromptSubmit', 'prototype', 'not a known channel')
  invalid.attachment.type = '__proto__'
  invalid.attachment.command = OURS
  const { dir, file } = transcript([
    success('PreToolUse', 'mixed-owned', OURS, '{"hookSpecificOutput":{"additionalContext":"our missing context"}}'),
    other, invalid,
    success('PreToolUse', 'ours', OURS, '{"hookSpecificOutput":{"additionalContext":"observed"}}'),
    context('PreToolUse', 'ours', 'observed'),
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.equal(result.totals.observedModel.characters, 'observed'.length)
  assert.equal(result.uncertain.missingCanonical, 1)
  assert.equal(result.totals.unknownAudience.characters, 'our missing context'.length)
  assert.equal(result.uncertain.unknownShapes, 1)
  assert.equal(result.coverage.status, 'partial')
})

test('explicitly empty Stop summaries are known zero but missing and contradictory output stays uncertain', t => {
  const empty = { type: 'system', subtype: 'stop_hook_summary', toolUseID: 'empty',
    hasOutput: false, hookErrors: [], hookAdditionalContext: [], preventedContinuation: false, stopReason: '' }
  const { dir, file } = transcript([empty])
  t.after(() => remove(dir))
  assert.equal(footprint(file).coverage.status, 'complete')
  assert.equal(footprint(file).totals.observedModel.characters, 0)
  for (const change of [
    { hasOutput: true }, { hasOutput: undefined }, { hookErrors: ['unseen error'] },
    { hookErrors: undefined }, { hookAdditionalContext: ['unseen context'] },
    { hookAdditionalContext: undefined }, { preventedContinuation: true }, { stopReason: 'unseen reason' },
  ]) {
    writeFileSync(file, JSON.stringify({ ...empty, ...change }) + '\n')
    const result = footprint(file)
    assert.equal(result.coverage.status, 'partial', JSON.stringify(change))
    assert.equal(result.uncertain.unpairedSummaries, 1)
  }
})

test('exclusive totals use recorded delivered text without counting JSON wrappers or trimming legacy receipts', t => {
  const plain = success('SessionStart', 'plain', BRIEF, 'ą\n')
  plain.attachment.content = 'ą'
  const envelope = success('SessionStart', 'json', OURS, '{"hookSpecificOutput":{"additionalContext":"standing"}}')
  envelope.attachment.content = ''
  const { dir, file } = transcript([
    plain, success('UserPromptSubmit', 'legacy', BRIEF, 'keep\n'),
    envelope, context('SessionStart', 'SessionStart', 'standing'),
  ])
  t.after(() => remove(dir))
  const result = footprint(file)
  assert.equal(result.totals.observedModel.characters, 'ąkeep\nstanding'.length)
  assert.equal(result.totals.observedModel.bytes, Buffer.byteLength('ąkeep\nstanding'))
  assert.equal(result.totals.observedModel.deliveries, 3)
  assert.equal(row(result, 'SessionStart', 'stdout', 'unmarked').characters, 1)
  assert.equal(result.totals.userOnly.characters, 0)
  assert.equal(result.uncertain.missingCanonical, 0)
})
