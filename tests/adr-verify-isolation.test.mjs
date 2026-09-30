// Spec 2026-09-30, "a recorded mutant never touches the checkout" (N4): F-2 to F-8. Bound
// as `todo` while the spec waits for its ADR; each is red today for its fact's reason, and
// the ADR's first task removes `todo` before it records the red run.
//
// Every run is over a copy of tests/fixtures/ok in the OS temp directory, never over this
// checkout (§9). The fence appends to $FIXTURE_SIDECAR whether the CHECKOUT's record held
// the mutant while it ran, read through $FIXTURE_CHECKOUT so the fence text names no path.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = path.join(repoRoot, 'plugin', 'bin')
const TODO = { todo: 'spec 2026-09-30 (N4): red until its ADR' }
const made = []
test.after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) })

const FENCE = [
  '```bash',
  'if [ -n "$FIXTURE_SIDECAR" ]; then grep -c "## Decisiun" "$FIXTURE_CHECKOUT/ADR-001-selftest.md" >> "$FIXTURE_SIDECAR" || true; fi',
  'if [ -n "$FIXTURE_GENERATE" ]; then echo generated > generated.txt; fi',
  'if [ -n "$FIXTURE_SLOW" ]; then sleep "$FIXTURE_SLOW"; fi',
  'if grep -q "## Decisiun" ADR-001-selftest.md; then echo "1 failed in 0.01s"; exit 1; fi',
  'echo "1 passed in 0.01s"',
  '```',
].join('\n')

/** A copy of the ok fixture with this file's fence and a Mutation Log, in git unless `git: false`. */
function corpus({ git = true, fence = FENCE } = {}) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-n4-')))
  made.push(temp)
  const dir = path.join(temp, 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const task = path.join(dir, 'tasks', 'T1-fixture.md')
  writeFileSync(task, `${readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, fence).trimEnd()}\n\n## Mutation Log\n`)
  if (git) {
    for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
      const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
      assert.equal(run.status, 0, run.stderr)
    }
  }
  return { dir, side: path.join(temp, 'seen.txt') }
}

const MUTANT = ['tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'ADR-001-selftest.md',
  '--from', '## Decision', '--to', '## Decisiun', '--why', 'the fence notices a broken Decision']

function verify(dir, extra = [], env = {}) {
  const argv = [path.join(bin, 'adr-verify'), ...MUTANT, ...extra]
  return spawnSync(process.platform === 'win32' ? 'python3' : argv[0], process.platform === 'win32' ? argv : argv.slice(1),
    { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120_000, windowsHide: true })
}

/** Every file under `dir` but `.git`, by digest. */
function snapshot(dir, skip = new Set()) {
  const found = {}
  const walk = rel => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (child === '.git' || skip.has(child)) continue
      if (entry.isDirectory()) walk(child)
      else found[child] = createHash('sha256').update(readFileSync(path.join(dir, child))).digest('hex')
    }
  }
  walk('')
  return found
}

const worktrees = dir => spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  .stdout.split('\n').filter(line => line.startsWith('worktree ')).length
const exposed = side => (existsSync(side) ? readFileSync(side, 'utf8').split('\n').filter(Boolean).some(count => Number(count) > 0) : false)
const mutationLog = dir => readFileSync(path.join(dir, 'tasks', 'T1-fixture.md'), 'utf8').split('## Mutation Log')[1] ?? ''

test("a mutant run leaves the checkout unchanged but for the task file's logs", TODO, () => {
  const { dir, side } = corpus()
  const git = args => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true }).stdout
  // The index, the staged diff and the stash list as git reports them (ADR-075's comparison).
  const gitState = () => ['ls-files -s', 'diff --cached', 'stash list'].map(args => git(args.split(' '))).join('\n---\n')
  const task = path.join(dir, 'tasks', 'T1-fixture.md')
  const outsideLogs = () => readFileSync(task, 'utf8').split('## Verification Log')[0]
  const before = snapshot(dir, new Set(['tasks/T1-fixture.md']))
  const state = gitState()
  const head = outsideLogs()
  const run = verify(dir, [], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /isolated in/, run.stdout)
  assert.match(mutationLog(dir), /mutant killed/)
  assert.ok(existsSync(side), 'the fence never ran')
  assert.equal(exposed(side), false, 'the checkout held the mutant while the fence ran')
  assert.deepEqual(snapshot(dir, new Set(['tasks/T1-fixture.md'])), before)
  assert.equal(gitState(), state, 'the run wrote the index or the stash list')
  assert.equal(outsideLogs(), head, 'the task file changed outside its logs')
  assert.equal(worktrees(dir), 1, 'a worktree outlived the run')
})

test('outside git the mutant runs in place and says why', TODO, () => {
  const { dir } = corpus({ git: false })
  const run = verify(dir)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /in place/i, run.stdout)
  assert.match(run.stdout.split('\n')[0], /git/i, run.stdout)
  assert.match(mutationLog(dir), /mutant killed/)
})

test('a fence naming the checkout runs in place and names the path', TODO, () => {
  // The fence reads the record through the checkout's own absolute path, which no worktree
  // can redirect: run in the worktree, it would judge the unmutated checkout.
  const self = corpus({ fence: FENCE.replace('grep -q "## Decisiun" ADR-001-selftest.md', 'grep -q "## Decisiun" "__SELF__/ADR-001-selftest.md"') })
  const task = path.join(self.dir, 'tasks', 'T1-fixture.md')
  writeFileSync(task, readFileSync(task, 'utf8').replace('__SELF__', self.dir))
  spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qam', 'self'], { cwd: self.dir, timeout: 60_000, windowsHide: true })
  const run = verify(self.dir)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /in place/i, run.stdout)
  assert.ok(run.stdout.split('\n')[0].includes(self.dir), `the first line does not name the path:\n${run.stdout}`)
  assert.match(mutationLog(self.dir), /mutant killed/)
})

test("a fence's generated output stays in the worktree", TODO, () => {
  const { dir } = corpus()
  const run = verify(dir, [], { FIXTURE_GENERATE: '1' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.equal(existsSync(path.join(dir, 'generated.txt')), false, 'a fence wrote into the checkout')
})

test('an isolated and an in-place run record the same verdict', TODO, () => {
  const isolated = corpus()
  const inPlace = corpus()
  assert.equal(verify(isolated.dir).status, 0)
  const run = verify(inPlace.dir, ['--in-place'])
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const verdict = dir => mutationLog(dir).match(/mutant (killed|survived|inconclusive)/)?.[1]
  assert.equal(verdict(isolated.dir), 'killed')
  assert.equal(verdict(inPlace.dir), verdict(isolated.dir))
  // Both rows name the checkout's HEAD, taken before the run: clean here, and `*` once the
  // checkout holds an uncommitted file.
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: isolated.dir, encoding: 'utf8', timeout: 60_000, windowsHide: true }).stdout.trim()
  const rows = readFileSync(path.join(isolated.dir, 'tasks', 'T1-fixture.md'), 'utf8').split('## Verification Log')[1]
  assert.equal((rows.match(new RegExp(`· ${head} ·`, 'g')) ?? []).length, 2, `both rows should name ${head}:\n${rows}`)
  const dirty = corpus()
  writeFileSync(path.join(dirty.dir, 'untracked.txt'), 'x\n')
  assert.equal(verify(dirty.dir).status, 0)
  const dirtyHead = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dirty.dir, encoding: 'utf8', timeout: 60_000, windowsHide: true }).stdout.trim()
  const dirtyRows = readFileSync(path.join(dirty.dir, 'tasks', 'T1-fixture.md'), 'utf8').split('## Verification Log')[1]
  assert.equal((dirtyRows.match(new RegExp(`· ${dirtyHead}\\* ·`, 'g')) ?? []).length, 2, `both rows should mark ${dirtyHead} dirty:\n${dirtyRows}`)
})

test('--in-place applies the mutant in the checkout and restores it', TODO, () => {
  const { dir, side } = corpus()
  const before = readFileSync(path.join(dir, 'ADR-001-selftest.md'))
  const run = verify(dir, ['--in-place'], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.equal(exposed(side), true, '--in-place did not run in the checkout')
  assert.deepEqual(readFileSync(path.join(dir, 'ADR-001-selftest.md')), before, 'the mutant was not restored')
})

test('a stopped mutant run removes its worktree', { ...TODO, skip: process.platform === 'win32' && 'Windows ends the tree at once; the next run sweeps it' }, async () => {
  const { dir } = corpus()
  const argv = [path.join(bin, 'adr-verify'), ...MUTANT]
  const child = spawn(argv[0], argv.slice(1), { cwd: dir, env: { ...process.env, FIXTURE_SLOW: '30' }, stdio: 'ignore', timeout: 90_000, windowsHide: true })
  const exited = new Promise(resolve => child.once('exit', resolve))
  const until = Date.now() + 30_000
  while (worktrees(dir) < 2 && child.exitCode === null && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(worktrees(dir), 2, 'the run built no worktree')
  child.kill('SIGTERM')
  await exited
  assert.equal(worktrees(dir), 1, 'the worktree outlived its run')
})

// Codex's cold review of ADR-076: a build-if-missing output of the clean fence must be reset
// before the mutant fence, inside the worktree, or the mutant fence reads the clean build.
test('a generated output left by the clean fence is reset before the mutant fence', TODO, () => {
  const fence = FENCE.replace('if grep -q "## Decisiun" ADR-001-selftest.md;',
    'if [ ! -f built.txt ]; then cp ADR-001-selftest.md built.txt; fi\nif grep -q "## Decisiun" built.txt;')
  const { dir } = corpus({ fence })
  const run = verify(dir, ['--also-restore', 'built.txt'])
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /isolated in/, run.stdout)
  assert.match(mutationLog(dir), /mutant killed/, 'the mutant fence read the clean build')
  assert.equal(existsSync(path.join(dir, 'built.txt')), false, 'the build reached the checkout')
})

// Codex's cold review of ADR-076: a path that only shares the checkout's prefix is not the
// checkout, so it must not force the run in place.
test("a sibling path sharing the checkout's prefix does not force the run in place", TODO, () => {
  const probe = corpus()
  const fence = FENCE.replace('echo "1 passed in 0.01s"', `ls "${probe.dir}-sibling" >/dev/null 2>&1 || true\necho "1 passed in 0.01s"`)
  const task = path.join(probe.dir, 'tasks', 'T1-fixture.md')
  writeFileSync(task, readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, fence))
  spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qam', 'sibling'], { cwd: probe.dir, timeout: 60_000, windowsHide: true })
  const run = verify(probe.dir)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /isolated in/, run.stdout)
})
