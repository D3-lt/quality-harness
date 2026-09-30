// Spec 2026-09-30, "a recorded mutant never touches the checkout" (N4): F-9 and F-10, for
// scripts/unasserted.mjs. Bound as `todo` while the spec waits for its ADR; each is red today
// for its fact's reason.
//
// unasserted.mjs finds its root from its own location, so each run is a fixture repository in
// the OS temp directory carrying a copy of the script, scripts/neuter.py and a small
// python-interpreter shim, never this checkout (§9). The fixture's suite appends to
// $FIXTURE_SIDECAR whether the CHECKOUT's gate was neutered while it ran.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TODO = { todo: 'spec 2026-09-30 (N4): red until its ADR' }
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

function fixture({ commit = true } = {}) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-n4-unasserted-')))
  made.push(temp)
  const dir = path.join(temp, 'repo')
  mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  mkdirSync(path.join(dir, 'tests'), { recursive: true })
  copyFileSync(path.join(repoRoot, 'scripts', 'unasserted.mjs'), path.join(dir, 'scripts', 'unasserted.mjs'))
  copyFileSync(path.join(repoRoot, 'scripts', 'neuter.py'), path.join(dir, 'scripts', 'neuter.py'))
  writeFileSync(path.join(dir, 'scripts', 'python-interpreter.mjs'), SHIM)
  writeFileSync(path.join(dir, 'gate.py'), GATE)
  writeFileSync(path.join(dir, 'tests', 'gate.test.mjs'), SUITE)
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

test('an unasserted run leaves the checkout byte-identical', TODO, () => {
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

test('an unasserted run that cannot isolate neuters nothing and names --in-place', TODO, () => {
  const { dir, side } = fixture({ commit: false })
  const gate = readFileSync(path.join(dir, 'gate.py'))
  const run = unasserted(dir, [], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /--in-place/)
  assert.deepEqual(readFileSync(path.join(dir, 'gate.py')), gate)
  assert.equal(existsSync(side), false, 'the suite ran, so something was neutered or measured in place')
})
