// ADR-122 T3: every emitter is said once per context. The evidence is the context's last request (said-per-context.mjs, T2);
// with none, an emitter does what it did before. These drive the emitters with synthetic transcripts in the request shapes
// measured on 2026-10-22 (Claude Code 2.1.307).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { deliver } from '../plugin/scripts/lifecycle.mjs'
import { itemMarker } from '../plugin/scripts/said-per-context.mjs'
import { completionJudgement } from '../plugin/scripts/completion-rules.mjs'
import { revisionFor } from '../plugin/scripts/check-ledger.mjs'
import { remove } from './helpers/remove.mjs'

const MAIN = 'repl_main_thread:outputStyle:Concise'
const blob = (hash, role, text) => ({ type: 'api-request-blob', hash, message: { role, content: [{ type: 'text', text }] } })
const request = (id, base, keep, tail) => ({ type: 'api-request', id, base, keep, tail, querySource: MAIN })
const line = r => `${JSON.stringify(r)}\n`

function session() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-routing-'))
  const repo = path.join(dir, 'repo')
  spawnSync('git', ['init', '-q', repo], { timeout: 10_000, windowsHide: true })
  const transcript = path.join(dir, 'session.jsonl')
  writeFileSync(transcript, line(blob('h0', 'user', 'hello')) + line(request('r0', null, 0, ['h0'])))
  let n = 0
  return {
    dir,
    input: event => ({ hook_event_name: event, session_id: `s-${path.basename(dir)}`, transcript_path: transcript, cwd: repo }),
    // The model receives the delivered text: a new request carries it as a system message, keeping what came before.
    received: (text, keep) => { n += 1; appendFileSync(transcript, line(blob(`m${n}`, 'system', text)) + line(request(`q${n}`, `q${n - 1}`.replace('q0', 'r0'), keep, [`m${n}`]))) },
    compacted: () => { n += 1; appendFileSync(transcript, line(blob(`c${n}`, 'user', 'summary')) + line(request(`q${n}`, null, 0, [`c${n}`]))) },
  }
}
const contextOf = result => result.output?.hookSpecificOutput?.additionalContext ?? ''

test('every emitter is said once per context and again after a compaction', t => {
  const s = session()
  t.after(() => remove(s.dir))
  const advice = { rule: 'P', key: 'tree-1:mention', text: 'quality-harness: this repository is unchecked' }
  const first = deliver([advice], s.input('PreToolUse'))
  assert.ok(contextOf(first).includes(advice.text), 'said in full the first time')
  assert.ok(contextOf(first).includes(itemMarker('p', advice.text)), 'with its marker')
  assert.match(first.output.systemMessage, /advised the agent/, 'and the user its headline')
  s.received(contextOf(first), 1)
  const again = deliver([{ ...advice, key: 'tree-2:mention' }], s.input('PreToolUse'))
  assert.equal(again.output, null, 'a context that holds it is told nothing, and the user gets no headline')
  s.compacted()
  const after = deliver([advice], s.input('PreToolUse'))
  assert.ok(contextOf(after).includes(advice.text), 'after a compaction it is said again')
})

test('a refusal is answered on every attempt', t => {
  const s = session()
  t.after(() => remove(s.dir))
  const refusal = { rule: 'P', key: 'tree-1:push', deny: true, text: 'quality-harness: refused: no check passed on this tree' }
  const first = deliver([refusal], s.input('PreToolUse'))
  s.received(first.output.hookSpecificOutput.permissionDecisionReason, 1)
  const again = deliver([refusal], s.input('PreToolUse'))
  assert.equal(again.output?.hookSpecificOutput?.permissionDecision, 'deny', 'a held refusal is still a refusal')
})

test('a changed state is said whatever was said before', t => {
  const s = session()
  t.after(() => remove(s.dir))
  const one = { rule: 'A', key: 'a', text: 'Artifact validation failed: UNRUN — adr-lint could not start' }
  s.received(contextOf(deliver([one], s.input('PreToolUse'))), 1)
  const changed = deliver([{ ...one, text: 'Artifact validation failed: UNPROVEN — adr-lint timed out' }], s.input('PreToolUse'))
  assert.match(contextOf(changed), /UNPROVEN/, 'a changed could-not-look line is a new item')
})

test('the mention is said once per context and a proven commit still gets its advice', t => {
  const s = session()
  t.after(() => remove(s.dir))
  const mention = { rule: 'P', key: 'tree-1:mention', text: 'quality-harness: the command only mentions commit or push' }
  s.received(contextOf(deliver([mention], s.input('PreToolUse'))), 1)
  assert.equal(deliver([{ ...mention, key: 'tree-2:mention' }], s.input('PreToolUse')).output, null, 'a second tree in one context')
  const proven = { rule: 'P', key: 'tree-2', text: 'quality-harness: this commit is on a tree no check has passed on' }
  assert.match(contextOf(deliver([proven], s.input('PreToolUse'))), /no check has passed/, 'a proven commit is its own item')
})

// The turn end's facts with an unchecked tree, and the event log's rows of what was said before.
const T = 'tree-now'
function turnEnd(rows, generation, extra = {}) {
  const log = Object.assign([{ event: 'session.started', observation: { ok: true, tree: 'tree-before', index: 'tree-before', head: 'h0' } }, ...rows], { complete: true })
  const facts = {
    log, observation: { ok: true, tree: T, index: T, head: 'h1' }, check: 'sh check.sh', root: '/repo',
    baseline: { ok: true, tree: 'tree-before' }, writes: [], status: ['a.js'], commits: [], generation,
    sentence: () => 'RUN-SENTENCE', locationKey: () => '/repo', nudge: () => null, ...extra,
  }
  return completionJudgement(facts, { hook_event_name: 'Stop', cwd: '/repo', last_assistant_message: 'Edited the file.' }).actions
}
const rules = actions => actions.map(action => action.rule)

test('a finding said before a compaction is said again after it, and not after a resume', () => {
  const key = `${T}:${revisionFor([], { ok: true, tree: T })}:0`
  const said = { event: 'action.emitted', rule: 'R1', key, channel: 'both', recipient: 'main', generation: 0 }
  assert.deepEqual(rules(turnEnd([said], 0)), [], 'a resume keeps the generation: the context still holds it')
  assert.deepEqual(rules(turnEnd([said], 1)), ['R1'], 'after a compaction the context no longer holds it')
  const older = { event: 'action.emitted', rule: 'R1', key, channel: 'both', recipient: 'main' }
  assert.deepEqual(rules(turnEnd([older], 0)), [], 'a row from before generations counts as generation 0')
  assert.deepEqual(rules(turnEnd([older], 1)), ['R1'], 'and suppresses nothing after a compaction')
})

test('an older guard yields to the request: a Stop after a compaction and two R4 reasons are said', () => {
  const revision = revisionFor([], { ok: true, tree: T })
  const publish = { event: 'action.emitted', rule: 'P', key: 'tree-now', detail: { tree: T, revision }, channel: 'both', recipient: 'main', generation: 0 }
  assert.deepEqual(rules(turnEnd([publish], 0)), [], 'P named this tree in this context')
  assert.deepEqual(rules(turnEnd([publish], 1)), ['R1'], 'a P said before the compaction does not silence the Stop after it')
  const blind = { observation: { ok: false, reason: 'git outran the budget' } }
  const first = turnEnd([], 0, blind).find(action => action.rule === 'R4')
  assert.ok(first, 'a could-not-look is said')
  const row = { event: 'action.emitted', rule: 'R4', key: first.key, channel: 'both', recipient: 'main', generation: 0 }
  assert.equal(turnEnd([row], 0, blind).find(action => action.rule === 'R4'), undefined, 'the same reason is said once')
  const other = turnEnd([row], 0, { observation: { ok: false, reason: 'the index is locked' } }).find(action => action.rule === 'R4')
  assert.match(other?.text ?? '', /the index is locked/, 'another reason at the same place is said')
})
