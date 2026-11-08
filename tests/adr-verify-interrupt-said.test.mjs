// BACKLOG §455: tests/adr-verify-isolation.test.mjs "a Ctrl-C to the whole group during the worktree build still removes the
// worktree" failed on a macOS runner (run 41669373182) with "the run built no worktree" at 952 ms: the run exited before its poll
// saw a second worktree, though its fence sleeps 30 s. That test runs adr-verify with `stdio: 'ignore'` and is locked (ADR-076 T2),
// so what the run said and how it ended were lost. This sibling starts the same run with its output kept and, when it ends before
// a worktree exists, says its exit, its signal and everything it printed, so the next occurrence names its cause.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FENCE = ['```bash', 'if [ -n "$FIXTURE_SLOW" ]; then sleep "$FIXTURE_SLOW"; fi',
  'if grep -q "## Decisiun" ADR-001-selftest.md; then echo "1 failed in 0.01s"; exit 1; fi', 'echo "1 passed in 0.01s"', '```'].join('\n')
const worktrees = dir => spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  .stdout.split('\n').filter(line => line.startsWith('worktree ')).length

test('a mutant run whose fence sleeps is still running once its worktree exists, and says why when it is not', { skip: process.platform === 'win32' && 'POSIX process groups; Windows uses a job object' }, async t => {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-n4-said-')))
  t.after(() => remove(temp))
  const dir = path.join(temp, 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const task = path.join(dir, 'tasks', 'T1-fixture.md')
  writeFileSync(task, `${readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, FENCE).trimEnd()}\n\n## Mutation Log\n`)
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  const argv = [path.join(repoRoot, 'plugin', 'bin', 'adr-verify'), 'tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'ADR-001-selftest.md',
    '--from', '## Decision', '--to', '## Decisiun', '--why', 'the fence notices a broken Decision']
  const child = spawn(argv[0], argv.slice(1), { cwd: dir, env: { ...process.env, FIXTURE_SLOW: '30' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true, timeout: 90_000 })
  let said = ''
  child.stdout.on('data', chunk => { said += chunk })
  child.stderr.on('data', chunk => { said += chunk })
  const ended = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })))
  const started = Date.now()
  const until = started + 30_000
  while (worktrees(dir) < 2 && child.exitCode === null && child.signalCode === null && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5))
  if (worktrees(dir) < 2) {
    const early = child.exitCode !== null || child.signalCode !== null ? await ended : null
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    assert.fail(`no worktree after ${Date.now() - started} ms; the run ${early ? `ended with exit ${early.code}, signal ${early.signal}` : 'was still running'}, and said:\n${said || '(nothing)'}`)
  }
  process.kill(-child.pid, 'SIGINT')
  const end = await ended
  assert.equal(worktrees(dir), 1, `the worktree outlived its run (exit ${end.code}, signal ${end.signal}):\n${said}`)
})
