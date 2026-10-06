// BACKLOG §313, lead 2, from an outside run over a Laravel corpus: a shared `tasks/` directory
// that holds only a per-record subdirectory (`tasks/007_ledger_rollup/T1-x.md`) drew
// "no task files", a sentence about a directory adr-lint never looked into. The verdict stays;
// the sentence names what it did not enter and how to point the gate at it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrLint = join(repoRoot, 'plugin', 'bin', 'adr-lint')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function corpus(nested) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-nested-tasks-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'decisions', 'tasks')
  const holder = nested ? join(tasks, '007_ledger_rollup') : tasks
  mkdirSync(holder, { recursive: true })
  writeFileSync(join(repo, 'docs', 'decisions', '007_ledger_rollup.md'), '# ADR-007: Ledger rollup\n\n**Status:** Accepted\n\n## Context\n\nx\n')
  writeFileSync(join(holder, 'README.md'), '# Tasks\n')
  writeFileSync(join(holder, 'T1-x.md'), '# Task T1: x\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n')
  return repo
}

const lint = repo => spawnSync('python3', [adrLint, join('docs', 'decisions', '007_ledger_rollup.md')],
  { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })

test('a tasks directory holding only a subdirectory of tasks names it, not "no task files"', () => {
  const r = lint(corpus(true))
  const said = `${r.stdout}${r.stderr}`
  assert.match(said, /no task files directly in it.*007_ledger_rollup\/ holds? task files.*not entered/, said)
  assert.doesNotMatch(said, /tasks: no task files$/m, said)
  // The control: the same task one level up is read, and nothing says "no task files".
  const flat = lint(corpus(false))
  assert.doesNotMatch(`${flat.stdout}${flat.stderr}`, /no task files/, flat.stdout)
})
