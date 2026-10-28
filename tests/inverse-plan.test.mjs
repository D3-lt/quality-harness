// ADR-109 T2: `adr-verify --inverse <plan>` runs each hunk of a landed plan in reverse as a mutant, and
// `--break-invariants <plan>` reverses the hunks a task's invariant names. Through the CLI, over a copy of
// tests/fixtures/ok in the OS temp directory, never over this checkout (CLAUDE.md §9). The plan landed on top of
// the fixture's commit, so HEAD, the default `--before`, holds the original lines.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = path.join(repoRoot, 'plugin', 'bin')
const TASK = path.join('tasks', 'T1-fixture.md')
// The fence sees `ALPHA` and nothing else, so the inverse of the hunk that wrote it is killed and the other survives.
const FENCE = [
  '```bash',
  'if ! grep -qx ALPHA src.txt; then echo "1 failed in 0.01s"; exit 1; fi',
  'echo "1 passed in 0.01s"',
  '```',
].join('\n')
const BOTH = '@@ src.txt 1 replace\nALPHA\n@@ src.txt 3 replace\nGAMMA\n'

/** The ok fixture with src.txt committed as alpha/beta/gamma, then `BOTH` landed on it uncommitted. */
function corpus(t, invariants) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-inverse-')))
  t.after(() => remove(temp))
  const dir = path.join(temp, 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  let text = readFileSync(path.join(dir, TASK), 'utf8').replace(/```bash\n[\s\S]*?```/, FENCE)
  if (invariants) text = text.replace(/## Invariants\n\n[\s\S]*?\n\n## /, `## Invariants\n\n${invariants}\n\n## `)
  writeFileSync(path.join(dir, TASK), `${text.trimEnd()}\n\n## Mutation Log\n`)
  writeFileSync(path.join(dir, 'src.txt'), 'alpha\nbeta\ngamma\n')
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  writeFileSync(path.join(dir, 'src.txt'), 'ALPHA\nbeta\nGAMMA\n')
  const plan = body => { const file = path.join(temp, `plan-${createHash('sha256').update(body).digest('hex').slice(0, 8)}.txt`); writeFileSync(file, body); return file }
  return { dir, plan }
}

function verify(dir, args) {
  const argv = [path.join(bin, 'adr-verify'), TASK, '--cwd', '.', ...args]
  return spawnSync(process.platform === 'win32' ? 'python3' : argv[0], process.platform === 'win32' ? argv : argv.slice(1),
    { cwd: dir, encoding: 'utf8', timeout: 300_000, windowsHide: true })
}

/** Every file under `dir` but `.git` and the task file, by digest. */
function snapshot(dir) {
  const found = {}
  const walk = rel => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (child === '.git' || child === TASK.split(path.sep).join('/')) continue
      if (entry.isDirectory()) walk(child)
      else found[child] = createHash('sha256').update(readFileSync(path.join(dir, child))).digest('hex')
    }
  }
  walk('')
  return found
}

const mutationLog = dir => readFileSync(path.join(dir, TASK), 'utf8').split('## Mutation Log')[1] ?? ''
const rows = (dir, verdict) => mutationLog(dir).split('\n').filter(line => line.includes(`· mutant ${verdict} ·`))
// The rows the children wrote, a bullet's backticks inside a `--why` among them, still read as adr-lint's grammar.
function lint(dir) {
  const argv = [path.join(bin, 'adr-lint'), 'ADR-001-selftest.md', 'tasks']
  const run = spawnSync(process.platform === 'win32' ? 'python3' : argv[0], process.platform === 'win32' ? argv : argv.slice(1),
    { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.equal(run.status, 0, run.stdout + run.stderr)
}

test("a landed plan's inverses are run one at a time, a survivor is named by its address, and the tree is restored", t => {
  const { dir, plan } = corpus(t)
  const before = snapshot(dir)
  const run = verify(dir, ['--inverse', plan(BOTH)])
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.equal(rows(dir, 'killed').length, 1, mutationLog(dir))
  assert.equal(rows(dir, 'survived').length, 1, mutationLog(dir))
  assert.match(run.stdout, /^survived +src\.txt 3 replace\b/m)
  assert.match(run.stdout, /^killed +src\.txt 1 replace\b/m)
  assert.deepEqual(snapshot(dir), before)
  lint(dir)

  // A plan whose body is not at its address has not landed: refused, nothing run, nothing written.
  const task = readFileSync(path.join(dir, TASK), 'utf8')
  const refused = verify(dir, ['--inverse', plan('@@ src.txt 2 replace\nDELTA\n')])
  assert.equal(refused.status, 2, refused.stdout + refused.stderr)
  assert.match(refused.stdout, /not landed/)
  assert.equal(readFileSync(path.join(dir, TASK), 'utf8'), task)
  assert.deepEqual(snapshot(dir), before)

  // A plan whose every hunk the fence sees exits 0. GAMMA stays as it is: it is no hunk of this plan.
  const seen = verify(dir, ['--inverse', plan('@@ src.txt 1 replace\nALPHA\n'), '--before', 'HEAD'])
  assert.equal(seen.status, 0, seen.stdout + seen.stderr)
  assert.equal(rows(dir, 'killed').length, 2, mutationLog(dir))
  assert.deepEqual(snapshot(dir), before)
})

test('a plan landed in a commit is read against the ref --before names, and one whose every hunk is seen exits 0', t => {
  const { dir, plan } = corpus(t)
  const git = args => spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  writeFileSync(path.join(dir, 'src.txt'), 'ALPHA\nbeta\ngamma\n')
  assert.equal(git(['commit', '-qam', 'the plan']).status, 0)
  const run = verify(dir, ['--inverse', plan('@@ src.txt 1 replace\nALPHA\n'), '--before', 'HEAD~1'])
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.equal(rows(dir, 'killed').length, 1, mutationLog(dir))
  assert.equal(rows(dir, 'survived').length, 0, mutationLog(dir))
  // Against HEAD the plan's line is already the original: that hunk changes nothing there, so it has not landed there.
  const head = verify(dir, ['--inverse', plan('@@ src.txt 1 replace\nALPHA\n')])
  assert.equal(head.status, 2, head.stdout + head.stderr)
  assert.match(head.stdout, /not landed/)
})

test("a hunk's place in today's file moves by the lines the hunks above it added or deleted", t => {
  const { dir, plan } = corpus(t)
  writeFileSync(path.join(dir, 'src.txt'), 'ALPHA\nNEW\nGAMMA\n')
  const before = snapshot(dir)
  // Line 1 became two lines and line 2 was deleted, so line 3's hunk now stands at line 3 again only by both shifts.
  const run = verify(dir, ['--inverse', plan('@@ src.txt 1 replace\nALPHA\nNEW\n@@ src.txt 2 delete\n@@ src.txt 3 replace\nGAMMA\n')])
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout, /^killed +src\.txt 1 replace\b/m)
  assert.match(run.stdout, /^survived +src\.txt 2 delete\b/m)
  assert.match(run.stdout, /^survived +src\.txt 3 replace\b/m)
  assert.deepEqual(snapshot(dir), before)
  // Unshifted, the third hunk's body would be looked for at line 3 of a file whose line 3 is GAMMA only after both moves.
  const moved = verify(dir, ['--inverse', plan('@@ src.txt 1 replace\nALPHA\nNEW\n@@ src.txt 3 replace\nGAMMA\n')])
  assert.equal(moved.status, 2, moved.stdout + moved.stderr)
  assert.match(moved.stdout, /not landed: its body is not at line 4/)
})

test('an invariant whose named sites reverse with the fence green is unguarded, one naming nothing the plan touched is unread', t => {
  const invariants = [
    '- `ALPHA` is the first line.',
    '- `GAMMA` is the last line.',
    '- `nothing.txt` is never written.',
  ].join('\n')
  const { dir, plan } = corpus(t, invariants)
  const before = snapshot(dir)
  const run = verify(dir, ['--break-invariants', plan(BOTH)])
  assert.equal(run.status, 1, run.stdout + run.stderr)
  assert.match(run.stdout, /^guarded +`ALPHA` is the first line\./m)
  assert.match(run.stdout, /^unguarded +`GAMMA` is the last line\./m)
  assert.match(run.stdout, /^unread +`nothing\.txt` is never written\./m)
  assert.equal(rows(dir, 'killed').length, 1, mutationLog(dir))
  assert.equal(rows(dir, 'survived').length, 1, mutationLog(dir))
  assert.deepEqual(snapshot(dir), before)
  lint(dir)
})
