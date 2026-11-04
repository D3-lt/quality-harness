// BACKLOG §458: adr-lint took a task's id from its file stem and kept whichever file sorted first, so (a Windows chaos run of
// 3.8.68) a titled byte copy named `copy.md` was no task at all and passed, and on Windows, where paths sort without case,
// `t1-Again.md` became the file read as T1 and took T1's findings. A task's id is now its title's, as adr-next reads it, and task
// files sort by name by code point on every platform. The fixture corpus holds T1-add.md, T2-again.md (titled T1), copy.md (a
// titled copy) and t1-case.md (a case variant).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lint = path.join(repoRoot, 'plugin', 'bin', 'adr-lint')
const record = path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'duplicate-ids', 'docs', 'adr', 'ADR-001-totals.md')

test('a task is the id its title declares, and every file declaring one id is named, in the same order on every platform', () => {
  const run = spawnSync('python3', [lint, record], { encoding: 'utf8', timeout: 120_000, windowsHide: true })
  const said = run.stdout + run.stderr
  assert.equal(run.status, 1, said)
  for (const other of ['T2-again.md', 'copy.md', 't1-case.md']) {
    assert.match(said, new RegExp(`could not tell which file is T1: T1-add\\.md and ${other.replace('.', '\\.')} both declare it`), `${other} is named`)
  }
  assert.doesNotMatch(said, /could not tell which file is T2/, 'T2-again.md is titled T1, so it is no T2')

  // The order, on Windows paths from any host (CLAUDE.md §7): sorted() over PureWindowsPath ignores case.
  const probe = [
    'import importlib.machinery, importlib.util, json, sys',
    'from pathlib import PurePosixPath, PureWindowsPath',
    'loader = importlib.machinery.SourceFileLoader("adr_lint_probe", sys.argv[1])',
    'module = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))',
    'loader.exec_module(module)',
    'names = ["t1-Again.md", "T1-state-dir.md", "copy.md"]',
    'print(json.dumps([[p.name for p in module.task_order(kind(n) for n in names)] for kind in (PureWindowsPath, PurePosixPath)]))',
    'print(json.dumps([module.task_id(PurePosixPath(n), t) for n, t in [("copy.md", "# Task ADR-004-T1: x"), ("T3-x.md", "no title"), ("notes.md", "plain")]]))',
  ].join('\n')
  const asked = spawnSync('python3', ['-c', probe, lint], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(asked.status, 0, asked.stderr)
  const [orders, ids] = asked.stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(orders[0], ['T1-state-dir.md', 'copy.md', 't1-Again.md'], 'Windows paths sort by code point too')
  assert.deepEqual(orders[1], orders[0], 'the same order on POSIX')
  assert.deepEqual(ids, ['T1', 'T3', null], 'the title first, the stem only without one, nothing without either')
})
