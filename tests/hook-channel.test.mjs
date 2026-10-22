// ADR-122 T4: one channel per recipient. Measured 2026-10-22 on Claude Code 2.1.307 (T1): `additionalContext` reaches the model
// and `systemMessage` reaches the user alone (0 of 395 systemMessage texts were in any request). So an item the context already
// holds sends neither its text nor its headline, and an item said in full keeps both, each to its own recipient.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { deliver } from '../plugin/scripts/lifecycle.mjs'
import { itemMarker } from '../plugin/scripts/said-per-context.mjs'
import { remove } from './helpers/remove.mjs'

const MAIN = 'repl_main_thread:outputStyle:Concise'
const blob = (hash, role, text) => ({ type: 'api-request-blob', hash, message: { role, content: [{ type: 'text', text }] } })
const request = (id, base, keep, tail) => ({ type: 'api-request', id, base, keep, tail, querySource: MAIN })
const line = r => `${JSON.stringify(r)}\n`

function session(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-channel-'))
  t.after(() => remove(dir))
  const repo = path.join(dir, 'repo')
  spawnSync('git', ['init', '-q', repo], { timeout: 10_000, windowsHide: true })
  const transcript = path.join(dir, 'session.jsonl')
  writeFileSync(transcript, line(blob('h0', 'user', 'hello')) + line(request('r0', null, 0, ['h0'])))
  let n = 0
  return {
    input: (event, extra = {}) => ({ hook_event_name: event, session_id: `s-${path.basename(dir)}`, transcript_path: transcript, cwd: repo, ...extra }),
    received: text => { n += 1; appendFileSync(transcript, line(blob(`m${n}`, 'system', text)) + line(request(`q${n}`, n === 1 ? 'r0' : `q${n - 1}`, n, [`m${n}`]))) },
  }
}
const advice = { rule: 'P', key: 'tree-1:mention', text: 'quality-harness: this repository is unchecked — and the command only mentions commit or push.' }

test('an item reaches each recipient on one channel', t => {
  const s = session(t)
  const first = deliver([advice], s.input('PreToolUse')).output
  assert.ok(first.hookSpecificOutput.additionalContext.includes(advice.text), 'the model reads the text')
  assert.ok(first.hookSpecificOutput.additionalContext.includes(itemMarker('p', advice.text)), 'with its marker')
  assert.doesNotMatch(first.systemMessage, /<qh:/, 'the user reads no marker')
  assert.ok(!first.systemMessage.includes(advice.text), 'and only the headline, not the text the model already reads')
  // A refusal is answered to both on every attempt, with or without request evidence.
  const refusal = { rule: 'P', key: 'tree-1', deny: true, text: 'quality-harness: refused: no check passed on this tree' }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const out = deliver([refusal], s.input('PreToolUse')).output
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
    assert.match(out.systemMessage, /refused the command/)
    s.received(out.hookSpecificOutput.permissionDecisionReason)
  }
  // A Stop finding keeps ADR-096's delivery: the model reads it once, with its marker, and the user is shown the text.
  const stop = { rule: 'R1', key: 'tree-1:0:0', text: 'quality-harness: this turn ends with work no `qh-check` has passed on.' }
  const said = deliver([stop], s.input('Stop', { stop_hook_active: false })).output
  assert.ok(said.hookSpecificOutput.additionalContext.includes(itemMarker('r1', stop.text)))
  assert.equal(said.systemMessage, stop.text, 'the user is shown the finding, no marker')
  // A finding for the user alone reaches the user alone.
  const userOnly = deliver([{ ...stop, key: 'tree-2:0:0', audience: 'user', text: `${stop.text} (user only)` }], s.input('Stop', { stop_hook_active: false })).output
  assert.equal(userOnly.hookSpecificOutput, undefined, 'nothing enters the model')
  assert.match(userOnly.systemMessage, /user only/)
})

test('the first saying keeps its headline and a repeat has none', t => {
  const s = session(t)
  const first = deliver([advice], s.input('PreToolUse')).output
  assert.match(first.systemMessage, /advised the agent/, 'the first saying tells the user it happened')
  // Pending: said after the context's last request, so no request carries it yet, and it is not sent again.
  assert.equal(deliver([advice], s.input('PreToolUse')).output, null, 'a pending item sends neither')
  s.received(first.hookSpecificOutput.additionalContext)
  assert.equal(deliver([advice], s.input('PreToolUse')).output, null, 'a held item sends neither text nor headline')
})
