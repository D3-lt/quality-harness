// BACKLOG §351 (§295 item 22.1): a human-observed sign-off that took the approval back —
// "revoked", "rolled back", ❌, "done? no" — was read as a pass, so its task counted done and
// what depended on it printed READY. Each is now a stop. The controls are real approvals that
// must stay done, among them the one whose follow-up names "no real rollback" (§287).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

// adr-next's verdict on a human-observed T1 whose one sign-off is `note`.
function verdict(note) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-human-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n')
  writeFileSync(join(tasks, 'T1-watch.md'), '# Task ADR-003-T1: watch it\n\n**Depends-on:** none\n\n## Acceptance\n\n'
    + 'Acceptance is human-observed: a person watches it run.\n\n## Verification Log\n'
    + `- 2026-10-06 · human-observed · ${note}\n`)
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  const answer = JSON.parse(r.stdout)
  return (answer.done ?? []).some(t => t.id === 'T1') ? 'done' : 'not done'
}

test('a sign-off that takes the approval back is a stop, and a real approval stays done', () => {
  for (const note of ['observed, then revoked', 'approved; rolled back after review', '❌ observed',
    'done? no', 'passed? not really', 'signed off, later reverted']) {
    assert.equal(verdict(note), 'not done', note)
  }
  for (const note of ['observed', 'approved, not reverted',
    'observed end to end. NOT done: no real rollback to a tag that has a release — tracked as a follow-up']) {
    assert.equal(verdict(note), 'done', note)
  }
})
