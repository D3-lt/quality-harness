// BACKLOG §222, reopened 2026-10-22 on its second occurrence (CI, macOS, at 7805be9f): the tutorial's
// Python mutant survived because the mutant fence imported the clean fence's bytecode. CPython trusts a
// `__pycache__` entry whose source kept its mtime second and size; a mutant written in that second is
// often both. Which second the write lands in is not something a test can hold, so these assert the
// mechanism through the CLI: both `--mutant` fences run with no bytecode cache they could trust, and in
// the same environment.
//
// Every run is over a copy of tests/fixtures/ok in the OS temp directory, never over this checkout (§9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = path.join(repoRoot, 'plugin', 'bin')
const made = []
// Without the guard inherited: a mutation campaign gives every child both variables (scripts/mutate.mjs). A fence that
// inherits them shows the guard whatever adr-verify does, and a seed compiled under the prefix lands outside the corpus.
const { PYTHONDONTWRITEBYTECODE: _write, PYTHONPYCACHEPREFIX: _prefix, ...env } = process.env
test.after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) })

/** The ok fixture with `check.py` as its fence and `m.py` for the mutant to break, in git. */
function corpus(check, { seed = false } = {}) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-pyc-')))
  made.push(temp)
  const dir = path.join(temp, 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const task = path.join(dir, 'tasks', 'T1-fixture.md')
  writeFileSync(task, `${readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, '```bash\npython3 check.py\n```').trimEnd()}\n\n## Mutation Log\n`)
  writeFileSync(path.join(dir, 'm.py'), 'def f():\n    return 1\n')
  writeFileSync(path.join(dir, 'check.py'), check)
  // An unchecked-hash .pyc is trusted whatever the source says, so it stands in, deterministically, for a cache a
  // same-second, same-size mutant would be served. Committed, so the isolated worktree carries it too.
  if (seed) {
    const compiled = spawnSync('python3', ['-c', 'import py_compile; py_compile.compile("m.py", invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH, doraise=True)'],
      { cwd: dir, env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(compiled.status, 0, compiled.stderr)
  }
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '-f', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  return dir
}

function mutant(dir) {
  const argv = [path.join(bin, 'adr-verify'), 'tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'm.py',
    '--from', 'return 1', '--to', 'return 2', '--why', 'the check notices f changing']
  const run = spawnSync(process.platform === 'win32' ? 'python3' : argv[0], process.platform === 'win32' ? argv : argv.slice(1),
    { cwd: dir, env, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

// A fence that would trust a cache passes whatever m.py says, so the mutant survives; only a fence
// run with no cache to trust reaches the comparison that kills it.
const TRUSTS = [
  'import sys',
  'if not sys.flags.dont_write_bytecode:',
  '    print("1 passed in 0.01s")',
  '    sys.exit(0)',
  'import m',
  'ok = m.f() == 1',
  'print("1 passed in 0.01s" if ok else "1 failed in 0.01s")',
  'sys.exit(0 if ok else 1)',
  '',
].join('\n')

test('a mutant fence runs with no bytecode cache it could trust', () => {
  const run = mutant(corpus(TRUSTS))
  assert.equal(run.status, 0, run.out)
  assert.match(run.out, /mutant killed/, run.out)
})

// A fence that fails only under the guard: the clean run must see it fail, or a failure the mutant
// did not cause would be credited to it.
const FAILS_GUARDED = [
  'import sys',
  'guarded = sys.flags.dont_write_bytecode',
  'print("1 failed in 0.01s" if guarded else "1 passed in 0.01s")',
  'sys.exit(1 if guarded else 0)',
  '',
].join('\n')

test('a fence that fails only without a bytecode cache fails clean, and is never a kill', () => {
  const run = mutant(corpus(FAILS_GUARDED))
  assert.notEqual(run.status, 0, run.out)
  assert.doesNotMatch(run.out, /mutant killed/, run.out)
  assert.doesNotMatch(run.out, /MUTANT APPLIED/, run.out)
})

// The Codex review of e54bbad3: a cache already there for the mutated file is loaded unless it is deleted. The fence
// compares the source's answer; served the seeded clean bytecode, the mutant fence would pass and the mutant survive.
const COMPARES = [
  'import sys',
  'import m',
  'ok = m.f() == 1',
  'print("1 passed in 0.01s" if ok else "1 failed in 0.01s")',
  'sys.exit(0 if ok else 1)',
  '',
].join('\n')

test("a cache already there for the mutated file is not what either fence loads", () => {
  const run = mutant(corpus(COMPARES, { seed: true }))
  assert.equal(run.status, 0, run.out)
  assert.match(run.out, /mutant killed/, run.out)
})
