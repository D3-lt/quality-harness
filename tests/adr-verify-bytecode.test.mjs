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
import { chmodSync, cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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

function mutant(dir, { file = 'm.py', from = 'return 1', to = 'return 2', extra = [], also = {} } = {}) {
  const argv = [path.join(bin, 'adr-verify'), 'tasks/T1-fixture.md', '--cwd', '.', '--mutant', file,
    '--from', from, '--to', to, '--why', 'the check notices f changing', ...extra]
  const run = spawnSync(process.platform === 'win32' ? 'python3' : argv[0], process.platform === 'win32' ? argv : argv.slice(1),
    { cwd: dir, env: { ...env, ...also }, encoding: 'utf8', timeout: 120_000, windowsHide: true })
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

// The Codex review of 12952d76, three paths the first deletion missed. Each is a cache the fences could load.
const python = (dir, code) => {
  const ran = spawnSync('python3', ['-c', code], { cwd: dir, env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(ran.status, 0, ran.stderr)
}
const commitAll = dir => {
  for (const args of [['add', '-f', '.'], ['commit', '-qm', 'seed']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
}

// A declared output the restore writes again between the fences: its stale timestamp cache passes the clean fence, and
// once the restore gives the source a fresh mtime the mutant fence reads the failing source, a kill an unrelated
// mutation would be credited with. Its cache goes too, so the clean fence reads the failing source and the run stops.
test('a declared output the restore rewrites is not served from a cache to the clean fence', () => {
  const dir = corpus(['import sys', 'import x', 'print("1 passed in 0.01s" if x.ok else "1 failed in 0.01s")',
    'sys.exit(0 if x.ok else 1)', ''].join('\n'))
  python(dir, ['import os, py_compile', 'open("x.py", "w").write("ok = 1==1\\n")', 'py_compile.compile("x.py", doraise=True)',
    'st = os.stat("x.py")', 'open("x.py", "w").write("ok = 1==2\\n")', 'os.utime("x.py", ns=(st.st_atime_ns, st.st_mtime_ns))'].join('\n'))
  commitAll(dir)
  const run = mutant(dir, { extra: ['--in-place', '--also-restore', 'x.py'] })
  assert.notEqual(run.status, 0, run.out)
  assert.doesNotMatch(run.out, /mutant killed/, run.out)
  // Stopped at the clean fence, which read the failing source: a survivor would also be neither exit 0 nor a kill.
  assert.doesNotMatch(run.out, /MUTANT APPLIED/, run.out)
})

// A cache directory that exists and cannot be listed can still be loaded from: the run refuses before anything is mutated.
test('a cache directory that cannot be listed refuses the run', { skip: process.platform === 'win32' || process.getuid?.() === 0
  ? 'POSIX permission bits, and a non-root user, are what make a directory loadable but not listable' : false }, () => {
  const dir = corpus(COMPARES, { seed: true })
  const cache = path.join(dir, '__pycache__')
  chmodSync(cache, 0o300)
  try {
    const run = mutant(dir, { extra: ['--in-place'] })
    assert.notEqual(run.status, 0, run.out)
    assert.match(run.out, /could not be listed/, run.out)
    assert.doesNotMatch(run.out, /MUTANT APPLIED/, run.out)
  } finally { chmodSync(cache, 0o755) }
})

// On a case-insensitive filesystem `M.py` is `m.py`, and its cache is named for the file on disk. No catalogue mutant:
// the campaign runs on ubuntu, where this test has nothing to look at.
test('the mutated file named in another case still has its cache deleted', { skip: process.platform === 'linux'
  ? 'a case-sensitive filesystem has no second spelling of m.py' : false }, () => {
  const run = mutant(corpus(COMPARES, { seed: true }), { file: 'M.py', extra: ['--in-place'] })
  assert.equal(run.status, 0, run.out)
  assert.match(run.out, /mutant killed/, run.out)
})

// The Codex review of bc5e88ea: a prefix that is a file, such as /dev/null, holds no cache, and Python imports past it.
// The run goes on rather than refusing.
test('a cache prefix that is not a directory is not a reason to refuse', { skip: process.platform === 'win32'
  ? 'no /dev/null to point the prefix at' : false }, () => {
  const run = mutant(corpus(COMPARES), { also: { PYTHONPYCACHEPREFIX: '/dev/null' } })
  assert.equal(run.status, 0, run.out)
  assert.match(run.out, /mutant killed/, run.out)
})
