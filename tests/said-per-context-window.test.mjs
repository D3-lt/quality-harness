// ADR-122 T3: a transcript further behind than one budget is read from its end. A forward catch-up of a long session took
// dozens of firings during which nothing was suppressed (measured 2026-10-22: a 495 MB transcript, 8 MiB per firing, the
// mention said again on every command although the context held it). What the context received last is at the end.
import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { itemMarker } from '../plugin/scripts/said-per-context.mjs'
import { saidInContext } from './helpers/node-hooks/said-per-context.mjs'
import { remove } from './helpers/remove.mjs'

const MAIN = 'repl_main_thread:outputStyle:Concise'
const blob = (hash, role, text) => ({ type: 'api-request-blob', hash, message: { role, content: [{ type: 'text', text }] } })
const request = (id, base, keep, tail) => ({ type: 'api-request', id, base, keep, tail, querySource: MAIN })
const line = r => `${JSON.stringify(r)}\n`
const A = 'quality-harness: this repository is unchecked'
const markA = itemMarker('mention', A)
const BUDGET = 4096

// A session whose first requests lie far before the last window: forty filler requests, each with a 1 KiB message.
function longSession() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-said-window-'))
  const transcript = path.join(dir, 'session.jsonl')
  let text = ''
  for (let i = 0; i < 40; i += 1) {
    text += line(blob(`f${i}`, 'user', 'x'.repeat(1024))) + line(request(`r${i}`, i ? `r${i - 1}` : null, i, [`f${i}`]))
  }
  writeFileSync(transcript, text)
  return { dir, transcript, cacheDir: path.join(dir, 'cache'), input: { session_id: 's1', transcript_path: transcript } }
}
const ask = (t, text) => saidInContext(t.input, 'mention', text, { cacheDir: t.cacheDir, budgetBytes: BUDGET }).verdict

test('a long transcript is read from its end, and a marker the last request carries is said at once', t => {
  const s = longSession()
  t.after(() => remove(s.dir))
  appendFileSync(s.transcript, line(blob('m1', 'system', `${A}\n${markA}`)) + line(request('r40', 'r39', 40, ['m1'])))
  assert.equal(ask(s, A), 'said', 'the first firing, though the session began past the budget')
  appendFileSync(s.transcript, line(blob('u1', 'user', 'next')) + line(request('r41', 'r40', 41, ['u1'])))
  assert.equal(ask(s, A), 'said', 'the next firing reads on from the end, and the marker is still in the context')
  // The budget a firing leaves over reads back toward the start, until the cache is whole and absence can be shown.
  const whole = saidInContext(s.input, 'other', 'absent', { cacheDir: s.cacheDir, budgetBytes: 1 << 20 }).verdict
  assert.equal(whole, 'unsaid', 'a cache read back to the start shows absence')
})

test('from the end, absence is not shown: an item no read message carries is no evidence, never unsaid', t => {
  const s = longSession()
  t.after(() => remove(s.dir))
  appendFileSync(s.transcript, line(blob('m1', 'system', 'other text')) + line(request('r40', 'r39', 40, ['m1'])))
  assert.equal(ask(s, A), 'no-evidence', 'the messages before the window may hold it')
  // Twin: a compaction inside the window starts a chain the window holds whole, so absence is shown there.
  appendFileSync(s.transcript, line(blob('c1', 'user', 'summary')) + line(request('r41', null, 0, ['c1'])))
  assert.equal(ask(s, A), 'unsaid', 'a chain read whole from its start')
})
