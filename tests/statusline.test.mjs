// BACKLOG §134 — the gates' reading of a session, on the status line.
//
// Shown dirty before clean: an unverified transcript renders ✗, a checked one
// ✓, and an unchanged transcript is NOT analysed twice — a status line renders
// constantly, and a "cache" that re-reads on every render is a freeze waiting
// for a large transcript.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, ftruncateSync, mkdtempSync, openSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeTranscript } from '../plugin/scripts/lifecycle.mjs'
import { SIZE_CAP, reading, render } from '../plugin/scripts/statusline.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const script = join(repoRoot, 'plugin', 'scripts', 'statusline.mjs')

const line = (id, name, input, result) => [
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } }),
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: false, content: result ?? '' }] } }),
].join('\n')

test('unverified edits render ✗ with the count; a passed check renders ✓; nothing edited renders · only with a check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    const transcript = join(dir, 'agent.jsonl')
    writeFileSync(transcript, [
      line('e1', 'Write', { file_path: join(dir, 'a.py') }),
      line('e2', 'Write', { file_path: join(dir, 'b.py') }),
    ].join('\n'))
    const session = `sl-${Date.now()}-${process.pid}`
    const input = { session_id: session, transcript_path: transcript, workspace: { current_dir: dir } }
    assert.equal(render(reading(input)), 'QH ✗ 2 unverified')

    writeFileSync(transcript, [
      line('e1', 'Write', { file_path: join(dir, 'a.py') }),
      line('t1', 'Bash', { command: 'npm run test' }, 'tests 1\npass 1'),
    ].join('\n'))
    assert.equal(render(reading({ ...input, session_id: `${session}-2` })), 'QH ✓ checked')

    writeFileSync(transcript, line('r1', 'Read', { file_path: join(dir, 'a.py') }))
    assert.equal(render(reading({ ...input, session_id: `${session}-3` })), 'QH · nothing edited')

    // No check named and nothing edited: nothing worth a segment.
    rmSync(join(dir, 'package.json'))
    assert.equal(render(reading({ ...input, session_id: `${session}-4` })), '')

    // No transcript at all: nothing, not an error.
    assert.equal(render(reading({ session_id: session, workspace: { current_dir: dir } })), '')
    assert.equal(render(reading({ session_id: session, transcript_path: join(dir, 'missing.jsonl'), workspace: { current_dir: dir } })), '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an unchanged transcript is not analysed twice; a changed one is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-cache-'))
  try {
    const transcript = join(dir, 'agent.jsonl')
    writeFileSync(transcript, line('e1', 'Write', { file_path: join(dir, 'a.py') }))
    const session = `sl-cache-${Date.now()}-${process.pid}`
    const input = { session_id: session, transcript_path: transcript, workspace: { current_dir: dir } }
    let calls = 0
    const analyze = (raw, cwd) => { calls += 1; return analyzeTranscript(raw, cwd) }
    assert.equal(reading(input, { analyze }).kind, 'unverified')
    assert.equal(reading(input, { analyze }).kind, 'unverified')
    assert.equal(calls, 1, 'the second render of an unchanged transcript reads the cache')

    // Same size, new mtime: changed, so analysed again.
    const later = new Date(statSync(transcript).mtimeMs + 5_000)
    utimesSync(transcript, later, later)
    reading(input, { analyze })
    assert.equal(calls, 2, 'a changed mtime is a changed transcript')

    // Without a session id there is no cache to key, so every render analyses.
    reading({ ...input, session_id: undefined }, { analyze })
    reading({ ...input, session_id: undefined }, { analyze })
    assert.equal(calls, 4)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a transcript over the cap is said to be, never read into a verdict', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-big-'))
  try {
    const transcript = join(dir, 'agent.jsonl')
    writeFileSync(transcript, line('e1', 'Write', { file_path: join(dir, 'a.py') }))
    // Truncate-extend the file past the cap without writing the bytes.
    const fd = openSync(transcript, 'r+')
    ftruncateSync(fd, SIZE_CAP + 1)
    closeSync(fd)
    let calls = 0
    const value = reading({ session_id: 'big', transcript_path: transcript, workspace: { current_dir: dir } }, { analyze: () => { calls += 1 } })
    assert.equal(value.kind, 'too-large')
    assert.equal(calls, 0, 'not analysed')
    assert.match(render(value), /^QH \? transcript \d+MB$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the CLI reads the statusLine JSON from stdin, prints the segment, and never fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-cli-'))
  try {
    const transcript = join(dir, 'agent.jsonl')
    writeFileSync(transcript, line('e1', 'Write', { file_path: join(dir, 'a.py') }))
    const run = input => spawnSync(process.execPath, [script], { input, encoding: 'utf8', timeout: 30_000 })
    const ok = run(JSON.stringify({ session_id: `cli-${Date.now()}`, transcript_path: transcript, workspace: { current_dir: dir } }))
    assert.equal(ok.status, 0)
    assert.equal(ok.stdout.trim(), 'QH ✗ 1 unverified')
    assert.equal(ok.stderr, '', 'a status line never carries an error string')
    const garbage = run('not json')
    assert.equal(garbage.status, 0)
    assert.equal(garbage.stdout, '')
    assert.equal(garbage.stderr, '')
    const empty = run('')
    assert.equal(empty.status, 0)
    assert.equal(empty.stdout, '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
