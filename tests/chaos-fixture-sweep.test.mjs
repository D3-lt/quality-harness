// ADR-064 T5: a confirmed finding from an outside run changes the reader AND lands in
// a fixture corpus's expected.json, or its section says why not. The sweep names the
// sections that did neither. It is advisory: it prints and exits 0 (CLAUDE.md §3).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sweep = path.join(repoRoot, 'scripts', 'chaos-fixture-sweep.mjs')

function run(backlog) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-chaos-sweep-'))
  try {
    const file = path.join(dir, 'BACKLOG.md')
    writeFileSync(file, backlog)
    return spawnSync(process.execPath, [sweep, file], { encoding: 'utf8', timeout: 30_000 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('the chaos fixture sweep names an outside finding with no fixture', () => {
  const result = run([
    '## 290. CLOSED — A false FAIL (2026-10-01, reported from a Rust repository)', '',
    'Fixed, and pinned in `tests/fixtures/corpora/rust-crate/expected.json`.', '',
    '## 291. CLOSED — A wording lead (2026-10-01, reported by a Windows session)', '',
    'Fixed. (fixture-waived: the matrix cannot observe a stderr line)', '',
    '## 292. CLOSED — A bare one from an outside run (2026-10-01)', '',
    'Fixed in the reader only.', '',
  ].join('\n'))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /§292\b/)
  assert.doesNotMatch(result.stdout, /§290\b|§291\b/)
})

test('the chaos fixture sweep leaves history and ordinary sections alone', () => {
  const result = run([
    '## 280. CLOSED — Leads from the 2.108.0 outside runs (2026-09-24)', '',
    'History, before the rule existed.', '',
    '## 293. OPEN — What was reported in review (2026-10-01)', '',
    'Not an outside run: "reported" alone is not the signal.', '',
  ].join('\n'))
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /§280\b|§293\b/)
  assert.match(result.stdout, /0 section/)
})
