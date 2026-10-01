// Spec 2026-09-30, "a recorded mutant never touches the checkout" (N4): F-9, F-10 and F-13, for
// scripts/unasserted.mjs, turned on by ADR-076 T3. Each was committed as `todo`, red for its
// fact's reason.
//
// unasserted.mjs finds its root from its own location, so each run is a fixture repository in
// the OS temp directory carrying a copy of the script, scripts/neuter.py and a small
// python-interpreter shim, never this checkout (§9). The fixture's suite appends to
// $FIXTURE_SIDECAR whether the CHECKOUT's gate was neutered while it ran.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const made = []
test.after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) })

const GATE = 'def check(value):\n    errors = []\n    if value < 0:\n        errors.append("negative")\n    return errors\n'
const SUITE = [
  "import assert from 'node:assert/strict'",
  "import { spawnSync } from 'node:child_process'",
  "import { appendFileSync, readFileSync } from 'node:fs'",
  "import path from 'node:path'",
  "import test from 'node:test'",
  "test('a negative value is a finding', () => {",
  "  if (process.env.FIXTURE_SIDECAR) appendFileSync(process.env.FIXTURE_SIDECAR, (readFileSync(path.join(process.env.FIXTURE_CHECKOUT, 'gate.py'), 'utf8').includes('pass') ? 1 : 0) + '\\n')",
  "  const run = spawnSync('python3', ['-c', 'import gate; print(gate.check(-1))'], { encoding: 'utf8', timeout: 30000 })",
  "  assert.match(run.stdout, /negative/)",
  '})',
  '',
].join('\n')
const SHIM = "import { spawnSync } from 'node:child_process'\nexport const runPython = (args, options = {}) => spawnSync('python3', args, { timeout: 60000, ...options })\n"

function fixture({ commit = true, suite = SUITE } = {}) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-n4-unasserted-')))
  made.push(temp)
  const dir = path.join(temp, 'repo')
  mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  mkdirSync(path.join(dir, 'tests'), { recursive: true })
  copyFileSync(path.join(repoRoot, 'scripts', 'unasserted.mjs'), path.join(dir, 'scripts', 'unasserted.mjs'))
  copyFileSync(path.join(repoRoot, 'scripts', 'neuter.py'), path.join(dir, 'scripts', 'neuter.py'))
  // unasserted.mjs builds its worktree through the plugin's module (ADR-076 T1), which asks the
  // lease module whether a process lives (ADR-077 T2).
  mkdirSync(path.join(dir, 'plugin', 'scripts'), { recursive: true })
  for (const name of ['worktree.mjs', 'main-module.mjs', 'lease.mjs', 'replace-file.mjs']) {
    copyFileSync(path.join(repoRoot, 'plugin', 'scripts', name), path.join(dir, 'plugin', 'scripts', name))
  }
  writeFileSync(path.join(dir, 'scripts', 'python-interpreter.mjs'), SHIM)
  writeFileSync(path.join(dir, 'gate.py'), GATE)
  writeFileSync(path.join(dir, 'tests', 'gate.test.mjs'), suite)
  spawnSync('git', ['init', '-q', '-b', 'main', '.'], { cwd: dir, timeout: 60_000, windowsHide: true })
  if (commit) {
    for (const args of [['add', '.'], ['commit', '-qm', 'fixture']]) {
      const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
      assert.equal(run.status, 0, run.stderr)
    }
  }
  return { dir, side: path.join(temp, 'seen.txt') }
}

/** Every file under `dir` but `.git` and bytecode, by digest. */
const digest = dir => Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => path.relative(dir, path.join(entry.parentPath ?? entry.path, entry.name)))
  .filter(rel => !rel.split(path.sep).some(part => part === '.git' || part === '__pycache__'))
  .map(rel => [rel, createHash('sha256').update(readFileSync(path.join(dir, rel))).digest('hex')]))

// NODE_TEST_CONTEXT is this runner's: inherited, the inner `node --test` reports as a child and
// its exit no longer says whether the suite failed (the class mutate.mjs's childEnv closes).
const { NODE_TEST_CONTEXT: _context, ...outside } = process.env
const unasserted = (dir, args = [], env = {}) => spawnSync(process.execPath, [path.join(dir, 'scripts', 'unasserted.mjs'), 'gate.py', 'tests/gate.test.mjs', ...args],
  { cwd: dir, env: { ...outside, PYTHONDONTWRITEBYTECODE: '1', ...env }, encoding: 'utf8', timeout: 180_000, windowsHide: true })

test('an unasserted run leaves the checkout byte-identical', () => {
  const { dir, side } = fixture()
  const before = digest(dir)
  const run = unasserted(dir, [], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /0 of 1 assert nothing/)
  const seen = readFileSync(side, 'utf8').split('\n').filter(Boolean)
  assert.ok(seen.length > 0, 'the suite never ran')
  assert.ok(seen.every(line => line === '0'), 'the checkout held a neutered gate while the suite ran')
  assert.deepEqual(digest(dir), before)
})

test('an unasserted run that cannot isolate neuters nothing and names --in-place', () => {
  const { dir, side } = fixture({ commit: false })
  const gate = readFileSync(path.join(dir, 'gate.py'))
  const run = unasserted(dir, [], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /--in-place/)
  assert.deepEqual(readFileSync(path.join(dir, 'gate.py')), gate)
  assert.equal(existsSync(side), false, 'the suite ran, so something was neutered or measured in place')
})

// Codex's cold review of ADR-076: the stubs above strip NODE_TEST_CONTEXT themselves, so they
// cannot show the tool strips it. This one hands the tool this runner's own environment.
test('an unasserted run started inside a test runner still reads its suite\'s failures', () => {
  const { dir } = fixture()
  assert.ok(process.env.NODE_TEST_CONTEXT, 'this file is not running under node --test')
  const run = spawnSync(process.execPath, [path.join(dir, 'scripts', 'unasserted.mjs'), 'gate.py', 'tests/gate.test.mjs'],
    { cwd: dir, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8', timeout: 180_000, windowsHide: true })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /killed/, 'the inner suite\'s failure was not read')
})

const worktrees = dir => spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  .stdout.split('\n').filter(line => line.startsWith('worktree ')).length

// ADR-076 T3 S3: every early exit after the build returns through one cleanup boundary, so the
// tree goes on each of them, not only on a finished run.
test('a failing baseline removes the worktree', () => {
  const { dir } = fixture({ suite: "import test from 'node:test'\ntest('always fails', () => { throw new Error('red') })\n" })
  const run = unasserted(dir)
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /already fails/)
  assert.equal(worktrees(dir), 1, 'the worktree outlived the run')
})

test('an unreachable suite removes the worktree', () => {
  const { dir } = fixture({ suite: "import test from 'node:test'\ntest('asserts nothing about the gate', () => {})\n" })
  const run = unasserted(dir)
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /do not exercise its findings/)
  assert.equal(worktrees(dir), 1, 'the worktree outlived the run')
})

// The Codex round on ADR-076. Each test below is one finding, red before its fix.
const posixOnly = { skip: process.platform === 'win32' && 'POSIX process groups and symlinks' }
const commitAll = dir => {
  for (const args of [['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
}

// Finding 3: the suites run in this tool's process group, so the group is recorded in the tree's
// owner file before any suite starts; a killed owner then leaves a tree no sweep removes under a
// suite still running in it.
test('an unasserted run records its process group before its suites run', posixOnly, () => {
  const suite = SUITE
    .replace("import { appendFileSync, readFileSync } from 'node:fs'", "import { appendFileSync, readdirSync, readFileSync } from 'node:fs'")
    .replace("test('a negative value is a finding', () => {", [
      "test('a negative value is a finding', () => {",
      "  if (process.env.FIXTURE_OWNED) {",
      "    const home = path.join(spawnSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim(), 'qh-campaigns')",
      "    for (const id of readdirSync(home)) appendFileSync(process.env.FIXTURE_OWNED, readFileSync(path.join(home, id, 'owner.json'), 'utf8') + '\\n')",
      '  }',
    ].join('\n'))
  const { dir } = fixture({ suite })
  const owned = path.join(path.dirname(dir), 'owned.txt')
  const run = unasserted(dir, [], { FIXTURE_OWNED: owned })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const records = readFileSync(owned, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
  assert.ok(records.length > 0, 'the suite never looked')
  assert.ok(records.every(record => (record.groups ?? []).length > 0), `no process group was recorded: ${JSON.stringify(records)}`)
})

// Finding 4: a tracked symlink carried into the worktree can still point into the checkout, and
// neutering through it would neuter the checkout's gate. Such a target is not neutered there.
test('a target that resolves outside the worktree is not neutered there', posixOnly, () => {
  const { dir } = fixture({ commit: false })
  mkdirSync(path.join(dir, 'real'))
  const real = path.join(dir, 'real', 'gate.py')
  renameSync(path.join(dir, 'gate.py'), real)
  symlinkSync(real, path.join(dir, 'gate.py'))
  commitAll(dir)
  const before = readFileSync(real)
  const run = unasserted(dir)
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /--in-place/)
  assert.deepEqual(readFileSync(real), before)
  assert.equal(worktrees(dir), 1, 'the worktree outlived the run')
})
