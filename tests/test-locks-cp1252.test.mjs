// scripts/test-locks.py prints its grouped lines with `←`. On a console whose encoding is cp1252, Windows' default with
// PYTHONUTF8 unset, the print raised UnicodeEncodeError and the run exited 1 (a Windows peer's selftest at ba0b93e6).
// Forced here on any platform with PYTHONIOENCODING, in a repository this test creates (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [python, ...prefix] = pythonArgv()

test('test-locks prints its grouped lines on a cp1252 console', t => {
  const adr = readdirSync(join(repoRoot, 'docs', 'adr')).find(name => /^ADR-068-/.test(name) && !name.endsWith('.md'))
  const task = join('docs', 'adr', adr, 'tasks', 'T2-sessionstart-says-git-not-armed.md')
  const dir = mkdtempSync(join(tmpdir(), 'qh-test-locks-cp1252-'))
  t.after(() => remove(dir))
  mkdirSync(join(dir, dirname(task)), { recursive: true })
  copyFileSync(join(repoRoot, task), join(dir, task))
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000, windowsHide: true }).status, 0)
  const { PYTHONUTF8: _utf8, ...rest } = process.env
  const run = spawnSync(python, [...prefix, join(repoRoot, 'scripts', 'test-locks.py'), 'tests/lifecycle.test.mjs', 'the nag says what changed', '--root', dir],
    { encoding: 'utf8', timeout: 60_000, env: { ...rest, PYTHONIOENCODING: 'cp1252' }, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /^reported: the nag says what changed in a form a person can read ← ADR-068 T2$/m)
})
