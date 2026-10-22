// The release review of 3.8.52 (B1, B2): two trees warned in one text are two findings, and a pending mark is written only for
// output that has left the process.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { deliver, recordDelivered } from '../plugin/scripts/lifecycle.mjs'
import { remove } from './helpers/remove.mjs'

const MAIN = 'repl_main_thread:outputStyle:Concise'
const line = r => `${JSON.stringify(r)}\n`
function session(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-said-delivery-'))
  t.after(() => remove(dir))
  const repo = path.join(dir, 'repo')
  spawnSync('git', ['init', '-q', repo], { timeout: 10_000, windowsHide: true })
  const transcript = path.join(dir, 'session.jsonl')
  writeFileSync(transcript, line({ type: 'api-request-blob', hash: 'h0', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } })
    + line({ type: 'api-request', id: 'r0', base: null, keep: 0, tail: ['h0'], querySource: MAIN }))
  return { hook_event_name: 'PreToolUse', session_id: `s-${path.basename(dir)}`, transcript_path: transcript, cwd: repo }
}

test('two trees warned in one text are each said, and the mention is said once', t => {
  const input = session(t)
  const text = 'quality-harness: this commit is on a tree no `qh-check` has passed on.'
  assert.ok(deliver([{ rule: 'P', key: 'tree-1:1', text }], input).output, 'the first tree')
  assert.ok(deliver([{ rule: 'P', key: 'tree-2:1', text }], input).output, 'a second tree in the same words is its own finding')
  const mention = 'quality-harness: the command only mentions commit or push.'
  assert.ok(deliver([{ rule: 'P', key: 'tree-1:mention', text: mention }], input).output)
  assert.equal(deliver([{ rule: 'P', key: 'tree-2:mention', text: mention }], input).output, null, 'the mention stays context-wide')
})

test('a pending mark is written only for output that left the process', t => {
  const input = session(t)
  const advice = { rule: 'P', key: 'tree-1:mention', text: 'quality-harness: the command only mentions commit or push.' }
  const first = deliver([advice], input, { recordMarks: false })
  assert.ok(first.output, 'said')
  assert.ok(deliver([advice], input, { recordMarks: false }).output, 'unflushed, so not pending: said again')
  recordDelivered(first.delivered, input)
  assert.equal(deliver([advice], input).output, null, 'recorded after its flush: pending')
})
