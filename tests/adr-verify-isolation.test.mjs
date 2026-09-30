// Spec 2026-09-30, "a recorded mutant never touches the checkout" (N4): F-2 to F-8, F-11 and
// F-12, turned on by ADR-076 T2. Each was committed as `todo`, red for its fact's reason.
//
// Every run is over a copy of tests/fixtures/ok in the OS temp directory, never over this
// checkout (§9). The fence appends to $FIXTURE_SIDECAR whether the CHECKOUT's record held
// the mutant while it ran, read through $FIXTURE_CHECKOUT so the fence text names no path.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = path.join(repoRoot, 'plugin', 'bin')
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

test("a mutant run leaves the checkout unchanged but for the task file's logs", () => {
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

test('outside git the mutant runs in place and says why', () => {
  const { dir } = corpus({ git: false })
  const run = verify(dir)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /in place/i, run.stdout)
  assert.match(run.stdout.split('\n')[0], /git/i, run.stdout)
  assert.match(mutationLog(dir), /mutant killed/)
})

test('a fence naming the checkout runs in place and names the path', () => {
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

test("a fence's generated output stays in the worktree", () => {
  const { dir } = corpus()
  const run = verify(dir, [], { FIXTURE_GENERATE: '1' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.equal(existsSync(path.join(dir, 'generated.txt')), false, 'a fence wrote into the checkout')
})

test('an isolated and an in-place run record the same verdict', () => {
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

test('--in-place applies the mutant in the checkout and restores it', () => {
  const { dir, side } = corpus()
  const before = readFileSync(path.join(dir, 'ADR-001-selftest.md'))
  const run = verify(dir, ['--in-place'], { FIXTURE_SIDECAR: side, FIXTURE_CHECKOUT: dir })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.equal(exposed(side), true, '--in-place did not run in the checkout')
  assert.deepEqual(readFileSync(path.join(dir, 'ADR-001-selftest.md')), before, 'the mutant was not restored')
})

test('a stopped mutant run removes its worktree', { skip: process.platform === 'win32' && 'Windows ends the tree at once; the next run sweeps it' }, async () => {
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
test('a generated output left by the clean fence is reset before the mutant fence', () => {
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
test("a sibling path sharing the checkout's prefix does not force the run in place", () => {
  const probe = corpus()
  const fence = FENCE.replace('echo "1 passed in 0.01s"', `ls "${probe.dir}-sibling" >/dev/null 2>&1 || true\necho "1 passed in 0.01s"`)
  const task = path.join(probe.dir, 'tasks', 'T1-fixture.md')
  writeFileSync(task, readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, fence))
  spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qam', 'sibling'], { cwd: probe.dir, timeout: 60_000, windowsHide: true })
  const run = verify(probe.dir)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /isolated in/, run.stdout)
})

// ADR-076 T2 S3: spec F-4's Windows spellings, through the gate's platform seam, so they are
// exercised on every host rather than only on the Windows CI job.
test("the checkout's path is found in its Windows spellings on any host", () => {
  const probe = [
    'import importlib.machinery, importlib.util, json, sys',
    'loader = importlib.machinery.SourceFileLoader("adr_verify_probe", sys.argv[1])',
    'module = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))',
    'loader.exec_module(module)',
    'spellings, cases, platform = json.loads(sys.argv[2]), json.loads(sys.argv[3]), sys.argv[4]',
    'print(json.dumps([module.fence_names_checkout(cmd, spellings, platform=platform) for cmd in cases]))',
  ].join('\n')
  const ask = (spellings, cases, platform) => {
    const run = spawnSync('python3',
      ['-c', probe, path.join(bin, 'adr-verify'), JSON.stringify(spellings), JSON.stringify(cases), platform],
      { encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout)
  }
  const repo = 'C:\\Work\\repo'
  assert.deepEqual(ask([repo], [
    'cat C:\\Work\\repo\\a.md',
    'cat c:/work/REPO/a.md',
    'cat /c/Work/repo/a.md',
    'cd "C:\\Work\\repo"',
    'cd C:\\Work\\repo',
    'cat C:\\Work\\repo-sibling\\a.md',
    'cat C:\\Work\\repository',
  ], 'nt'), [repo, repo, repo, repo, repo, null, null])
  // Case is a parameter, not an assumption: on POSIX a different case is a different path.
  assert.deepEqual(ask(['/work/repo'], ['cat /work/repo/a.md', 'cat /Work/Repo/a.md', 'cat /work/repo2'], 'posix'),
    ['/work/repo', null, null])
})

// ADR-076 T2 S5: a file the fence leaves in the worktree makes the TREE dirty, not the
// checkout, so both rows still name the checkout's clean HEAD. The sha is evidence, and it
// is read from the checkout before the run; read from the tree it would carry `*`.
test("a fence's leftover in the worktree does not mark the checkout's rows dirty", () => {
  const { dir } = corpus()
  const run = verify(dir, [], { FIXTURE_GENERATE: '1' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /isolated in/, run.stdout)
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true }).stdout.trim()
  const task = readFileSync(path.join(dir, 'tasks', 'T1-fixture.md'), 'utf8')
  assert.equal((task.match(new RegExp(`· ${head} ·`, 'g')) ?? []).length, 2, `both rows should name ${head}, clean:\n${task}`)
})

// ADR-076 T2: a SIGTERM that lands while the worktree is still being built. Polled tightly, so
// the signal arrives during the build's tail — the window the 100ms poll above crosses only
// under load, where it failed twice. Before the build held its signals, 10 runs in 10 left
// the tree behind.
test('a SIGTERM during the worktree build still removes the worktree', { skip: process.platform === 'win32' && 'Windows ends the tree at once; the next run sweeps it' }, async () => {
  const { dir } = corpus()
  const argv = [path.join(bin, 'adr-verify'), ...MUTANT]
  const child = spawn(argv[0], argv.slice(1), { cwd: dir, env: { ...process.env, FIXTURE_SLOW: '30' }, stdio: 'ignore', timeout: 90_000, windowsHide: true })
  const exited = new Promise(resolve => child.once('exit', resolve))
  const until = Date.now() + 30_000
  while (worktrees(dir) < 2 && child.exitCode === null && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(worktrees(dir), 2, 'the run built no worktree')
  child.kill('SIGTERM')
  await exited
  assert.equal(worktrees(dir), 1, 'the worktree outlived its run')
})

// The Codex round on ADR-076. Each test below is one finding, red before its fix.
const posixOnly = { skip: process.platform === 'win32' && 'POSIX process groups; Windows uses a job object' }
const aliveOf = pids => pids.filter(pid => { try { process.kill(pid, 0); return true } catch { return false } })

// Finding 1: a fence's shell returning is not its group ending. A process it left running would
// work on in a tree about to be removed, so it is ended first, and only then is the tree removed.
test('a process a fence leaves running is ended before its worktree goes', posixOnly, () => {
  const fence = FENCE.replace('if [ -n "$FIXTURE_GENERATE" ]',
    'if [ -n "$FIXTURE_LEFTOVER" ]; then sleep 30 >/dev/null 2>&1 & echo $! >> "$FIXTURE_LEFTOVER"; fi\nif [ -n "$FIXTURE_GENERATE" ]')
  const { dir } = corpus({ fence })
  const left = path.join(path.dirname(dir), 'left.txt')
  let pids = []
  try {
    const run = verify(dir, [], { FIXTURE_LEFTOVER: left })
    assert.equal(run.status, 0, run.stdout + run.stderr)
    pids = readFileSync(left, 'utf8').split('\n').filter(Boolean).map(Number)
    assert.equal(pids.length, 2, 'each fence should have left one process')
    assert.deepEqual(aliveOf(pids), [], 'a process a fence left is still running')
    assert.equal(worktrees(dir), 1, 'the worktree outlived the run')
  } finally {
    for (const pid of aliveOf(pids)) process.kill(pid, 'SIGKILL')
  }
})

// Finding 2: the fence is recorded in the tree's owner file before it runs, so a sweep never
// removes a tree under a fence whose owner died between spawning and recording it.
test('a fence is recorded in its worktree before it runs', posixOnly, () => {
  // The fence's process group, read with ps: `$$` would not survive corpus()'s String.replace
  // (there `$$` is `$`), and macOS's bash 3.2 has no $BASHPID.
  const fence = FENCE.replace('if [ -n "$FIXTURE_GENERATE" ]',
    'if [ -n "$FIXTURE_OWNED" ]; then { echo "pid $(sh -c \'ps -o pgid= -p $PPID\')"; cat "$(git rev-parse --git-common-dir)"/qh-campaigns/*/owner.json; echo; } >> "$FIXTURE_OWNED"; fi\nif [ -n "$FIXTURE_GENERATE" ]')
  const { dir } = corpus({ fence })
  const owned = path.join(path.dirname(dir), 'owned.txt')
  const run = verify(dir, [], { FIXTURE_OWNED: owned })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const seen = readFileSync(owned, 'utf8').split('pid ').filter(Boolean).map(block => {
    const [pid, ...rest] = block.split('\n')
    return { pid: Number(pid), groups: JSON.parse(rest.join('\n').trim()).groups ?? [] }
  })
  assert.equal(seen.length, 2, 'both fences should have looked')
  for (const { pid, groups } of seen) assert.ok(groups.includes(pid), `fence ${pid} ran before it was recorded: ${JSON.stringify(groups)}`)
})

// Finding 5: a shell command ends a path at a metacharacter as well as at a separator, and a
// path only names the checkout where it starts at a boundary too.
test("the checkout's path is found at a shell boundary, and not inside another path", () => {
  const probe = [
    'import importlib.machinery, importlib.util, json, sys',
    'loader = importlib.machinery.SourceFileLoader("adr_verify_probe", sys.argv[1])',
    'module = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))',
    'loader.exec_module(module)',
    'spellings, cases, platform = json.loads(sys.argv[2]), json.loads(sys.argv[3]), sys.argv[4]',
    'print(json.dumps([module.fence_names_checkout(cmd, spellings, platform=platform) for cmd in cases]))',
  ].join('\n')
  const ask = (spellings, cases, platform) => {
    const run = spawnSync('python3', ['-c', probe, path.join(bin, 'adr-verify'), JSON.stringify(spellings), JSON.stringify(cases), platform],
      { encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout)
  }
  const repo = '/work/repo'
  assert.deepEqual(ask([repo], [
    'cd /work/repo; pwd',
    'cd /work/repo&& pwd',
    'x=$(ls /work/repo)',
    'run --root=/work/repo',
    'PATH=/bin:/work/repo/bin',
    'cat /other/work/repo/file',
    'cat /work/repo-sibling',
  ], 'posix'), [repo, repo, repo, repo, repo, null, null])
  assert.deepEqual(ask(['C:\\Work\\repo'], ['cd C:\\Work\\repo& dir', 'dir X:\\Work\\repo'], 'nt'), ['C:\\Work\\repo', null])
})

// Finding 6: a Ctrl-C reaches the whole foreground group, the worktree builder included. The
// builder runs in a session of its own, so the build finishes and the tree is removed.
test('a Ctrl-C to the whole group during the worktree build still removes the worktree', posixOnly, async () => {
  const { dir } = corpus()
  const argv = [path.join(bin, 'adr-verify'), ...MUTANT]
  const child = spawn(argv[0], argv.slice(1), { cwd: dir, env: { ...process.env, FIXTURE_SLOW: '30' }, stdio: 'ignore', detached: true, timeout: 90_000 })
  const exited = new Promise(resolve => child.once('exit', resolve))
  const until = Date.now() + 30_000
  while (worktrees(dir) < 2 && child.exitCode === null && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(worktrees(dir), 2, 'the run built no worktree')
  process.kill(-child.pid, 'SIGINT')
  await exited
  assert.equal(worktrees(dir), 1, 'the worktree outlived its run')
})

// Finding 6, deterministically: the Ctrl-C test above reaches the build window only when its
// poll lands in it. What makes the window safe is that the builder is in a process group of its
// own, so this asks exactly that: a `node` shim first on PATH writes its group and its parent's.
test('the worktree builder runs outside the process group of the gate that started it', posixOnly, () => {
  const { dir } = corpus()
  const shims = path.join(path.dirname(dir), 'shims')
  const groups = path.join(path.dirname(dir), 'groups.txt')
  mkdirSync(shims)
  const node = path.join(shims, 'node')
  writeFileSync(node, `#!/bin/sh\necho "$(ps -o pgid= -p $$) $(ps -o pgid= -p $PPID)" >> "${groups}"\nexec "${process.execPath}" "$@"\n`)
  chmodSync(node, 0o755)
  const run = verify(dir, [], { PATH: `${shims}${path.delimiter}${process.env.PATH}` })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout.split('\n')[0], /isolated in/, run.stdout)
  const pairs = readFileSync(groups, 'utf8').split('\n').filter(Boolean).map(line => line.trim().split(/\s+/).map(Number))
  assert.ok(pairs.length >= 2, 'the builder was never started through the shim')
  for (const [own, parent] of pairs) assert.notEqual(own, parent, `a worktree call ran in its gate's process group ${parent}`)
})

// The Codex review of the 3.3.0 candidate, finding 6: on Windows a fence is ended only when its
// job was closed, not merely because a job existed. Asked through the seam, on every host.
test('a Windows fence whose job could not be closed is not called ended', () => {
  const probe = [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("fence_probe", sys.argv[1])',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'print(json.dumps([module.settle_group(0, "nt", job_closed=False), module.settle_group(0, "nt", job_closed=True)]))',
  ].join('\n')
  const run = spawnSync('python3', ['-c', probe, path.join(repoRoot, 'plugin', 'lib', 'fence.py')], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), [false, true])
})

// The 3.3.0 candidate's campaign found the test above now signals, most runs, while the worktree is
// still being built — which the build holds — so the fence never starts and the fence's own end is
// never exercised. This one signals only once the fence is running.
test('a mutant run stopped while its fence runs removes its worktree', { skip: process.platform === 'win32' && 'Windows ends the tree at once; the next run sweeps it' }, async () => {
  const fence = FENCE.replace('if [ -n "$FIXTURE_SLOW" ]', 'if [ -n "$FIXTURE_RUNNING" ]; then echo running >> "$FIXTURE_RUNNING"; fi\nif [ -n "$FIXTURE_SLOW" ]')
  const { dir } = corpus({ fence })
  const running = path.join(path.dirname(dir), 'running.txt')
  const argv = [path.join(bin, 'adr-verify'), ...MUTANT]
  const child = spawn(argv[0], argv.slice(1), { cwd: dir, env: { ...process.env, FIXTURE_SLOW: '30', FIXTURE_RUNNING: running }, stdio: 'ignore', timeout: 90_000, windowsHide: true })
  const exited = new Promise(resolve => child.once('exit', resolve))
  const until = Date.now() + 30_000
  while (!existsSync(running) && child.exitCode === null && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(existsSync(running), 'the fence never started')
  assert.equal(worktrees(dir), 2, 'the fence is not running in a worktree')
  child.kill('SIGTERM')
  await exited
  assert.equal(worktrees(dir), 1, 'the worktree outlived its run')
})
