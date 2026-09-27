// The corpus readers stop at a record budget so a hook stays fast. A Windows chaos
// round of 916b515 (C-1) found the stop was silent: 10,000 records, 200 read, and
// `look ok` with nothing counted or named past the budget. Driven through adr-state,
// the reader the round measured, in a repository this test created (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const adrState = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'scripts', 'adr-state.mjs')

function corpusOf(count) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-record-budget-'))
  mkdirSync(join(dir, 'docs', 'adr'), { recursive: true })
  for (let i = 1; i <= count; i++) {
    const id = String(i).padStart(4, '0')
    writeFileSync(join(dir, 'docs', 'adr', `ADR-${id}-x.md`), `# ADR-${id}: x\n\n**Status:** Accepted\n\n## Context\n\nc\n`)
  }
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 })
  assert.equal(git.status, 0, git.stderr)
  return dir
}

const stateOf = dir => {
  const run = spawnSync(process.execPath, [adrState, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120_000 })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('a corpus past the record budget is PARTIAL, and the first file not examined is named', () => {
  const past = corpusOf(201)
  const exact = corpusOf(200)
  try {
    const state = stateOf(past)
    assert.equal(state.read, 200)
    assert.equal(state.look, 'PARTIAL')
    assert.equal(state.unread.length, 1)
    assert.match(state.unread[0].file, /ADR-0201-x\.md$/)
    assert.match(state.unread[0].reason, /^record budget: 200 records were read/)
    // Clean twin: exactly the budget is read whole, and says so.
    const whole = stateOf(exact)
    assert.equal(whole.read, 200)
    assert.equal(whole.look, 'ok')
    assert.deepEqual(whole.unread, [])
  } finally {
    rmSync(past, { recursive: true, force: true })
    rmSync(exact, { recursive: true, force: true })
  }
})
