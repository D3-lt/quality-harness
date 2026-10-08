// BACKLOG §355, a Windows corpus-chaos run of v3.8.9: a record's own content findings print before a
// task's "holds NUL bytes", and the probe took the first finding as the row's reason, so it hid that
// the task was never read. A FAIL's reason now prefers that finding; the control keeps the first one.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function reason(task) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-probe-nul-'))
  temps.push(repo)
  const tasks = join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  // No Alternatives section: a content finding the record prints before any task finding.
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n')
  writeFileSync(join(tasks, 'T1-a.md'), task)
  writeFileSync(join(tasks, 'README.md'), '| Task | Status |\n|---|---|\n| [T1](T1-a.md) | pending |\n')
  // Git runs only in a directory this file made (CLAUDE.md §9).
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const run = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'corpus-probe.mjs'), repo, '--json'],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  const [row] = JSON.parse(run.stdout).adrLint
  assert.equal(row.verdict, 'FAIL', JSON.stringify(row))
  return row.reason
}

const task = '# Task ADR-003-T1: a\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n'

test('a FAIL row names a task nobody could read before the record\'s own findings', () => {
  assert.match(reason(`${task}\u0000\u0000`), /^T1-a\.md: holds NUL bytes/)
  // The control: with every file readable, the reason is still the first finding.
  assert.match(reason(task), /^ADR-003-x\.md: Alternatives Considered has no entries/)
})
