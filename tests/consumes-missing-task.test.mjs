// BACKLOG §426 (qh-core, 2026-10-27): a T-id in `Consumes:` naming no task in the record made adr-next report the task
// blocked on it, while adr-lint said nothing. The id stays an edge (prose producers are real: "from T1"); adr-lint now says
// so at authoring. Run through the gate in a repository this test creates (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [python, ...prefix] = pythonArgv()

function lint(t, consumes) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-consumes-'))
  t.after(() => remove(dir))
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 10_000 })
  const tasks = join(dir, 'docs', 'adr', 'ADR-001-probe', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(dir, 'docs', 'adr', 'ADR-001-probe.md'), ['# ADR-001: Probe', '', '**Status:** Proposed', '', '## Decision', '', 'x', ''].join('\n'))
  const task = (id, cons) => writeFileSync(join(tasks, `${id}-probe.md`), [`# Task ADR-001-${id}: probe`, '', '**Depends-on:** none',
    '**Covers:** none', '**Produces:** `thing`', `**Consumes:** ${cons}`, '', '## Goal', '', 'x', ''].join('\n'))
  task('T1', 'none')
  task('T2', consumes)
  writeFileSync(join(tasks, 'README.md'), ['# Tasks', '', '| ID | Goal | Status |', '|----|------|--------|', '| T1 | x | pending |', '| T2 | x | pending |', ''].join('\n'))
  const run = spawnSync(python, [...prefix, join(repoRoot, 'plugin', 'bin', 'adr-lint'), join(dir, 'docs', 'adr', 'ADR-001-probe.md')],
    { encoding: 'utf8', timeout: 120_000, env: { ...process.env, PYTHONUTF8: '1' } })
  return run.stdout + run.stderr
}

test('a Consumes id naming no task in the record is said at authoring; one naming a task is not', t => {
  assert.match(lint(t, '`taskproof` T5 selection profile'), /T2-probe\.md: Consumes names `T5`, which is no task in this record/)
  const named = lint(t, '`thing` (T1)')
  assert.doesNotMatch(named, /Consumes names `T1`/, named)
  assert.doesNotMatch(named, /which is no task in this record/, named)
})
