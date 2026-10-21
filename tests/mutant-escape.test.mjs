// ADR-120 T14: a survivor whose fence never sees the mutated copy is inconclusive, and a clean fence that fails in the
// worktree for a missing module is could-not-run. Every run is over a copy of tests/fixtures/ok in the OS temp
// directory, never over this checkout (CLAUDE.md §9). Each refusal sits beside the runs that must NOT be refused: the
// same fence in place, a directory inside the copy, a path that is not there, an assertion failure.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gate = path.join(repoRoot, 'plugin', 'bin', 'adr-verify')
const made = []
test.after(() => { for (const dir of made) remove(dir) })

const TASK = 'tasks/T1-fixture.md'
const MUTANT = [TASK, '--cwd', '.', '--mutant', 'ADR-001-selftest.md', '--from', '## Decision', '--to', '## Decisiun', '--why', 'the fence notices a broken Decision']
// A fence that notices the mutant wherever it reads the record from.
const NOTICES = ['if grep -q "## Decisiun" ADR-001-selftest.md; then echo "1 failed in 0.01s"; exit 1; fi', 'echo "1 passed in 0.01s"']

/** A copy of the ok fixture in git, with `sub/` in it and an unmutated copy of the record in `other/` beside it. */
function corpus(lines) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-escape-')))
  made.push(temp)
  const dir = path.join(temp, 'ok')
  const other = path.join(temp, 'other')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  mkdirSync(other)
  cpSync(path.join(dir, 'ADR-001-selftest.md'), path.join(other, 'ADR-001-selftest.md'))
  mkdirSync(path.join(dir, 'sub'))
  writeFileSync(path.join(dir, 'sub', 'keep.txt'), 'x\n')
  // The fence runs in bash, where an unquoted backslash is an escape: a Windows path is written with forward slashes, as Git
  // Bash takes it (CI on Windows, 2026-10-21: `cd C:\Users\…` became `cd C:Users…`, failed, and the fence read the mutated copy).
  const fence = ['```bash', ...lines, '```'].join('\n').replaceAll('__OTHER__', other.replaceAll('\\', '/'))
  const task = path.join(dir, TASK)
  writeFileSync(task, `${readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, fence).trimEnd()}\n\n## Mutation Log\n`)
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  return { dir, task }
}

// Through the interpreter, as Windows needs (CLAUDE.md §7).
const verify = (c, extra = []) => spawnSync('python3', [gate, ...MUTANT, ...extra], { cwd: c.dir, encoding: 'utf8', timeout: 180_000, windowsHide: true })
const said = run => `${run.stdout}\n${run.stderr}`
const section = (c, name) => (readFileSync(c.task, 'utf8').split(`## ${name}`)[1] ?? '').split('\n## ')[0]

test('a fence that leaves the copy makes a survivor inconclusive', () => {
  // The fence reads an unmutated copy of the record outside the worktree, so the mutant is invisible to it.
  const leaving = corpus(['cd __OTHER__', ...NOTICES])
  const run = verify(leaving)
  assert.equal(run.status, 4, said(run))
  assert.match(run.stdout, /this fence never sees the mutated copy/)
  assert.match(section(leaving, 'Mutation Log'), /mutant inconclusive/)
  assert.doesNotMatch(section(leaving, 'Mutation Log'), /mutant survived/)

  // The same fence in place is the remedy, and is unaffected: it is judged as it always was.
  const placed = corpus(['cd __OTHER__', ...NOTICES])
  const inPlace = verify(placed, ['--in-place'])
  assert.equal(inPlace.status, 1, said(inPlace))
  assert.doesNotMatch(inPlace.stdout, /never sees the mutated copy/)
  assert.match(section(placed, 'Mutation Log'), /mutant survived/)

  // A directory inside the copy is read from the copy: the fence notices the mutant, and is killed.
  const inside = corpus(['cd sub', 'if grep -q "## Decisiun" ../ADR-001-selftest.md; then echo "1 failed in 0.01s"; exit 1; fi', 'echo "1 passed in 0.01s"'])
  const killed = verify(inside)
  assert.equal(killed.status, 0, said(killed))
  assert.match(section(inside, 'Mutation Log'), /mutant killed/)

  // A path that names no directory leaves nothing to leave to: a survivor stays survived.
  const missing = corpus(['echo "1 passed in 0.01s" # /qh-no-such-directory-for-escape-test'])
  const survived = verify(missing)
  assert.equal(survived.status, 1, said(survived))
  assert.match(section(missing, 'Mutation Log'), /mutant survived/)
  assert.doesNotMatch(survived.stdout, /never sees the mutated copy/)
})

test('a missing dependency in the worktree is could-not-run, an assertion failure is not', () => {
  const absent = ['node -e "require(\'qh-no-such-module-for-escape-test\')"']
  const missing = corpus(absent)
  const run = verify(missing)
  assert.equal(run.status, 4, said(run))
  assert.match(run.stdout, /holds no ignored file/)
  assert.doesNotMatch(section(missing, 'Mutation Log'), /mutant/)

  // The same failure in place is not a worktree's missing file: it stays a failure of the fence.
  const inPlace = verify(corpus(absent), ['--in-place'])
  assert.equal(inPlace.status, 1, said(inPlace))

  // An assertion that fails is a finding about the code, in the worktree as anywhere.
  const failing = verify(corpus(['echo "1 failed in 0.01s"', 'exit 1']))
  assert.equal(failing.status, 1, said(failing))
})
