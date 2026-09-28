// BACKLOG §130 — every child a shipped gate spawns carries a timeout.
//
// The rule arrived as an incident: hook children hung in regex backtracking
// for 15.5 hours at 90% of a core, reparented to launchd, found by a hot laptop.
// A gate that shells out to git on a locked index, or runs `bash -n` over a
// user's file, must not be able to do that. Enumerated by AST, not by grep, so
// a multi-line call is one call; shown DIRTY on a fixture before it is trusted
// clean on the tree, because a checker that only ever returns clean has never
// been shown to check anything (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const checker = join(repoRoot, 'scripts', 'untimed-children.py')
const [python, ...prefix] = pythonArgv()
const check = paths => spawnSync(python, [...prefix, checker, ...paths],
  { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 })

test('the checker reports an untimed spawn, and does not report a timed one or run_bounded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-untimed-'))
  try {
    const dirty = join(dir, 'dirty.py')
    writeFileSync(dirty, [
      'import subprocess',
      'def lookup(cwd):',
      '    return subprocess.run(["git", "-C", cwd, "rev-parse", "HEAD"],',
      '                          capture_output=True, text=True)',
      'def run_bounded(argv, *, timeout, **popen):',
      '    proc = subprocess.Popen(argv, **popen)',
      '    return proc.communicate(timeout=timeout)',
      'def fine(cwd):',
      '    return subprocess.run(["git", "status"], capture_output=True, timeout=30)',
      '',
    ].join('\n'))
    const run = check([dirty])
    assert.equal(run.status, 1, `an untimed call must be a finding\n${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /dirty\.py:3: subprocess\.run in lookup\(\) names no timeout/)
    assert.doesNotMatch(run.stdout, /Popen/, 'Popen inside run_bounded is the bound, not a finding')
    assert.doesNotMatch(run.stdout, /fine\(\)/, 'a timed call is not a finding')
    assert.equal(run.stdout.trim().split('\n').length, 1, 'exactly one finding in the fixture')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('every shipped gate names a timeout on every child it spawns', () => {
  const run = check([])
  assert.equal(run.status, 0,
    `these calls can hang a gate for ever (BACKLOG §130):\n${run.stdout}${run.stderr}`)
})

// Windows, 3.1.0 (the owner, 2026-09-28): a gate a hook starts has no console, and
// each child it starts without CREATE_NO_WINDOW gets a console of its own, which
// Windows Terminal opens as a tab that flashes. Dirty and clean first, then the tree.
test('every shipped gate starts its children with no window, and one that does not is named', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-unhidden-'))
  try {
    const dirty = join(dir, 'dirty.py')
    writeFileSync(dirty, [
      'import subprocess',
      'NO_WINDOW = {}',
      'def shown(cwd):',
      '    return subprocess.run(["git", "status"], capture_output=True, timeout=30)',
      'def hidden(cwd):',
      '    return subprocess.run(["git", "status"], capture_output=True, timeout=30, **NO_WINDOW)',
      'def flagged(cwd):',
      '    return subprocess.run(["git", "status"], capture_output=True, timeout=30, creationflags=0x08000000)',
      '',
    ].join('\n'))
    const run = check(['--hidden', dirty])
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`)
    assert.match(run.stdout, /dirty\.py:4: subprocess\.run in shown\(\) passes neither/)
    assert.equal(run.stdout.trim().split('\n').length, 1, 'only the call with neither is a finding')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const tree = check(['--hidden'])
  assert.equal(tree.status, 0, `a gate child would open a window on Windows:\n${tree.stdout}${tree.stderr}`)
})

// The value behind NO_WINDOW, with the platform a parameter (CLAUDE.md §7): on this
// host os.name is never "nt", so only the parameter lets the Windows answer be tested.
test('no_window names CREATE_NO_WINDOW on Windows and nothing elsewhere', () => {
  const run = spawnSync(python, [...prefix, '-c', 'import sys; sys.path.insert(0, "plugin/lib"); import record; print(record.no_window("nt"), record.no_window("posix"))'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout.trim(), "{'creationflags': 134217728} {}")
})
