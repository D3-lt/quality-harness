// scripts/test-locks.py — "is this test locked?" in one command (BACKLOG §314).
//
// A lock stores its test names base64-encoded, so grepping the corpus for a test's
// name finds nothing; a locked test was edited three times before this existed. The
// incident itself is the fixture: ADR-068 T2's task file, copied into a repository
// this test creates (CLAUDE.md §9), must name the test it locked.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [python, ...prefix] = pythonArgv()

test('test-locks names the task that locks a test, and nothing for a file no lock names', () => {
  const adr = readdirSync(join(repoRoot, 'docs', 'adr')).find(name => /^ADR-068-/.test(name) && !name.endsWith('.md'))
  const task = join('docs', 'adr', adr, 'tasks', 'T2-sessionstart-says-git-not-armed.md')
  const dir = mkdtempSync(join(tmpdir(), 'qh-test-locks-'))
  try {
    mkdirSync(join(dir, dirname(task)), { recursive: true })
    copyFileSync(join(repoRoot, task), join(dir, task))
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
    const run = (...args) => spawnSync(python, [...prefix, join(repoRoot, 'scripts', 'test-locks.py'), ...args, '--root', dir],
      { encoding: 'utf8', timeout: 60_000 })
    const locked = run('tests/lifecycle.test.mjs', 'the nag says what changed')
    assert.equal(locked.status, 0, locked.stderr)
    assert.match(locked.stdout, /T2-sessionstart-says-git-not-armed\.md: reported: the nag says what changed in a form a person can read/)
    assert.match(locked.stdout, /^1 lock\(s\) on tests\/lifecycle\.test\.mjs$/m)
    const free = run('tests/no-such.test.mjs')
    assert.equal(free.status, 0, free.stderr)
    assert.match(free.stdout, /^0 lock\(s\) on tests\/no-such\.test\.mjs$/m)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
