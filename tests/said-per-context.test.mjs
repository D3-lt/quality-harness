// ADR-122 T2: an item is said in a context only when its marker is in that context's last request, rebuilt from the
// transcript's api-request records (base, keep, tail) and their api-request-blob messages; hook text reaches the model as
// role `system` messages there (measured 2026-10-22 on Claude Code 2.1.307). No request evidence suppresses nothing.
import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { itemMarker } from '../plugin/scripts/said-per-context.mjs'
import { recordSaid, saidInContext } from './helpers/node-hooks/said-per-context.mjs'
import { remove } from './helpers/remove.mjs'

const MAIN = 'repl_main_thread:outputStyle:Concise'
const blob = (hash, role, text) => ({ type: 'api-request-blob', hash, message: { role, content: [{ type: 'text', text }] } })
const request = (id, base, keep, tail, querySource = MAIN) => ({ type: 'api-request', id, base, keep, tail, querySource })
const line = r => `${JSON.stringify(r)}\n`

function place(records, extra = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-said-'))
  const transcript = path.join(dir, 'session.jsonl')
  writeFileSync(transcript, records.map(line).join(''))
  const cacheDir = path.join(dir, 'cache')
  return { dir, transcript, cacheDir, input: { session_id: 's1', transcript_path: transcript, ...extra } }
}
const ask = (t, item, text, opts = {}) => saidInContext(t.input, item, text, { cacheDir: t.cacheDir, ...opts }).verdict

const A = 'quality-harness: this repository is unchecked'
const markA = itemMarker('mention', A)

test('an item in the last request is said, and one only in an earlier request is not', () => {
  const t = place([blob('h1', 'system', `${A} ${markA}`), blob('h2', 'user', 'hello'), request('r1', null, 0, ['h1', 'h2'])])
  try {
    assert.equal(ask(t, 'mention', A), 'said')
    // A compaction's next request keeps none of the old messages: the marker is gone, so it is said again.
    appendFileSync(t.transcript, line(blob('h3', 'user', 'summary')) + line(request('r2', 'r1', 0, ['h3'])))
    assert.equal(ask(t, 'mention', A), 'unsaid')
    // A later request built on r1 that keeps its messages (a resume, a normal turn) still carries it.
    appendFileSync(t.transcript, line(request('r3', 'r1', 2, ['h3'])))
    assert.equal(ask(t, 'mention', A), 'said')
    // Two base links deep is read whole.
    appendFileSync(t.transcript, line(blob('h4', 'user', 'more')) + line(request('r4', 'r3', 3, ['h4'])))
    assert.equal(ask(t, 'mention', A), 'said')
  } finally { remove(t.dir) }
})

test('a marker in a tool result or in a side query is not a saying', () => {
  const t = place([
    blob('h1', 'user', `quoted by a tool: ${markA}`),
    request('r1', null, 0, ['h1']),
    blob('h2', 'system', `${A} ${markA}`),
    request('r2', null, 0, ['h2'], 'compact'),
  ])
  try {
    assert.equal(ask(t, 'mention', A), 'unsaid', "a user message quoting the marker, and a side query's request, are not the context")
    appendFileSync(t.transcript, line(request('r3', 'r1', 1, ['h2'])))
    assert.equal(ask(t, 'mention', A), 'said', 'twin: the main loop carrying it as a system message is a saying')
  } finally { remove(t.dir) }
})

test('a hook record no request carries is not a saying', () => {
  const t = place([
    { type: 'attachment', attachment: { type: 'hook_additional_context', hookEvent: 'PreToolUse', toolUseID: 't1', content: [`${A} ${markA}`] } },
    blob('h1', 'user', 'hello'),
    request('r1', null, 0, ['h1']),
  ])
  try { assert.equal(ask(t, 'mention', A), 'unsaid') } finally { remove(t.dir) }
})

test('an item said after the last request is pending until a newer request', () => {
  const t = place([blob('h1', 'user', 'hello'), request('r1', null, 0, ['h1'])])
  try {
    assert.equal(ask(t, 'mention', A), 'unsaid')
    recordSaid(t.input, markA, { cacheDir: t.cacheDir })
    assert.equal(ask(t, 'mention', A), 'pending', 'said this turn, not yet in any request')
    appendFileSync(t.transcript, line(blob('h2', 'user', 'next')) + line(request('r2', 'r1', 1, ['h2'])))
    assert.equal(ask(t, 'mention', A), 'unsaid', 'a newer request that does not carry it decides')
  } finally { remove(t.dir) }
})

test("a subagent's item is judged on its own transcript", () => {
  const parent = place([blob('h1', 'system', `${A} ${markA}`), request('r1', null, 0, ['h1'])])
  const child = path.join(parent.dir, 'agent.jsonl')
  writeFileSync(child, [blob('c1', 'user', 'task'), request('a1', null, 0, ['c1'], 'agent:task')].map(line).join(''))
  try {
    assert.equal(ask(parent, 'mention', A), 'said', 'the parent holds it')
    const sub = { ...parent, input: { ...parent.input, agent_id: 'x', agent_transcript_path: child } }
    assert.equal(ask(sub, 'mention', A), 'unsaid', "the parent's saying does not stand for the child's context")
    appendFileSync(child, line(blob('c2', 'system', `${A} ${markA}`)) + line(request('a2', 'a1', 1, ['c2'], 'agent:task')))
    assert.equal(ask(sub, 'mention', A), 'said', "twin: the child's own request carrying it")
    const lost = { ...parent, input: { ...parent.input, agent_id: 'x' } }
    assert.equal(ask(lost, 'mention', A), 'no-evidence', 'a subagent whose transcript cannot be located has no evidence')
  } finally { remove(parent.dir) }
})

test('a replaced transcript drops its cache and an appended one keeps it', () => {
  const t = place([{ type: 'user', uuid: 'first-1' }, blob('h1', 'system', `${A} ${markA}`), request('r1', null, 0, ['h1'])])
  try {
    assert.equal(ask(t, 'mention', A), 'said')
    // Replaced at the same path, longer, with another first record: the old markers must not survive.
    writeFileSync(t.transcript, [{ type: 'user', uuid: 'first-2' }, blob('h9', 'user', 'x'.repeat(400)), request('r9', null, 0, ['h9'])].map(line).join(''))
    assert.equal(ask(t, 'mention', A), 'unsaid')
  } finally { remove(t.dir) }
})

test('an incomplete last line is read when it completes, and no cached blob is read twice', () => {
  const t = place([blob('h1', 'user', 'hello'), request('r1', null, 0, ['h1'])])
  try {
    const first = saidInContext(t.input, 'mention', A, { cacheDir: t.cacheDir })
    assert.equal(first.verdict, 'unsaid')
    const tail = line(blob('h2', 'system', `${A} ${markA}`)) + line(request('r2', 'r1', 1, ['h2']))
    appendFileSync(t.transcript, tail.slice(0, -10))
    assert.equal(ask(t, 'mention', A), 'unsaid', 'the half-written request is not read')
    appendFileSync(t.transcript, tail.slice(-10))
    const done = saidInContext(t.input, 'mention', A, { cacheDir: t.cacheDir })
    assert.equal(done.verdict, 'said', 'the completed line is read next time')
    assert.ok(done.bytesRead < tail.length + 1, `only the new bytes are read, not the whole file (${done.bytesRead})`)
  } finally { remove(t.dir) }
})

test('no request evidence suppresses nothing', () => {
  const none = place([blob('h1', 'system', `${A} ${markA}`)])
  const missing = place([blob('h1', 'user', 'hello'), blob('h2', 'system', `${A} ${markA}`),
    request('r1', null, 0, ['h1', 'hX']), request('r2', 'r1', 2, ['h2'])])
  const noBase = place([blob('h1', 'system', `${A} ${markA}`), request('r1', 'r0', 1, ['h1'])])
  const big = place([blob('h1', 'system', `${A} ${markA} ${'y'.repeat(4096)}`), request('r1', null, 0, ['h1'])])
  try {
    assert.equal(ask(none, 'mention', A), 'no-evidence', 'no api-request records')
    assert.equal(ask(missing, 'mention', A), 'said', 'a marker in a present blob is evidence, whatever else is missing')
    appendFileSync(missing.transcript, line(blob('h3', 'user', 'later')) + line(request('r3', 'r1', 2, ['h3'])))
    assert.equal(ask(missing, 'mention', A), 'no-evidence', 'absent from every present blob, with one missing: absence is not shown')
    assert.equal(ask(noBase, 'mention', A), 'no-evidence', 'a base the request names is missing')
    assert.equal(ask(big, 'mention', A, { budgetBytes: 1024 }), 'no-evidence', 'past the byte budget')
    const noTranscript = { input: { session_id: 's1' }, cacheDir: none.cacheDir }
    assert.equal(ask(noTranscript, 'mention', A), 'no-evidence', 'no transcript at all')
    // Twin: the same transcript within the budget is evidence.
    assert.equal(ask(big, 'mention', A), 'said')
  } finally { for (const t of [none, missing, noBase, big]) remove(t.dir) }
})

test('a changed item and a changed could-not-look line are said', () => {
  assert.equal(itemMarker('brief', 'CI red: selftest'), itemMarker('brief', 'CI red: selftest'))
  assert.notEqual(itemMarker('brief', 'CI red: selftest'), itemMarker('brief', 'CI red: coverage'))
  assert.notEqual(itemMarker('brief', 'UNRUN: gh absent'), itemMarker('brief', 'UNPROVEN: gh absent'))
  assert.match(itemMarker('brief', 'x'), /^<qh:brief@[0-9a-f]{8}>$/)
  const t = place([blob('h1', 'system', `CI red: selftest ${itemMarker('brief', 'CI red: selftest')}`), request('r1', null, 0, ['h1'])])
  try {
    assert.equal(ask(t, 'brief', 'CI red: selftest'), 'said')
    assert.equal(ask(t, 'brief', 'CI red: coverage'), 'unsaid', 'a changed state is a new digest, and is said')
  } finally { remove(t.dir) }
})
