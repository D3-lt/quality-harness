// The release review of 3.8.52 (A3): a subagent's context is its own loop's last request, and a side query in its transcript
// (a compaction summary, a classifier) is not it. Measured 2026-10-22 over 79 subagent transcripts on Claude Code 2.1.307:
// every one of 4847 requests carried a querySource beginning `agent:`.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { itemMarker } from '../plugin/scripts/said-per-context.mjs'
import { saidInContext } from './helpers/node-hooks/said-per-context.mjs'
import { remove } from './helpers/remove.mjs'

const blob = (hash, role, text) => ({ type: 'api-request-blob', hash, message: { role, content: [{ type: 'text', text }] } })
const request = (id, base, keep, tail, querySource) => ({ type: 'api-request', id, base, keep, tail, querySource })
const line = r => `${JSON.stringify(r)}\n`
const A = 'quality-harness: this repository is unchecked'
const markA = itemMarker('mention', A)

test("a subagent's side request is not its context", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-said-sources-'))
  try {
    const child = path.join(dir, 'agent.jsonl')
    writeFileSync(child, [blob('c1', 'user', 'task'), request('a1', null, 0, ['c1'], 'agent:task'),
      blob('k1', 'system', `${A} ${markA}`), request('k1r', null, 0, ['k1'], 'compact')].map(line).join(''))
    const input = { session_id: 's1', agent_id: 'x', agent_transcript_path: child }
    assert.equal(saidInContext(input, 'mention', A, { cacheDir: path.join(dir, 'cache') }).verdict, 'unsaid',
      "the agent loop's last request lacks it; the side request that holds it is not the agent's context")
    // Twin: the agent's own request carrying it is evidence.
    writeFileSync(child, [blob('c1', 'user', 'task'), blob('c2', 'system', `${A} ${markA}`), request('a2', null, 0, ['c1', 'c2'], 'agent:task')].map(line).join(''))
    assert.equal(saidInContext(input, 'mention', A, { cacheDir: path.join(dir, 'cache2') }).verdict, 'said')
  } finally { remove(dir) }
})
