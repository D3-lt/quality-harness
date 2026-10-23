// ADR-120 T10, review findings: a background run records a pass only for a tree it observed at both ends and a fence that
// ended its whole process group. Beside tests/adr-verify-background.test.mjs, whose tests are locked. Every run is over a
// copy of tests/fixtures/ok in the OS temp directory (CLAUDE.md §9); the twin of each case is the same run, clean.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gate = path.join(repoRoot, 'plugin', 'bin', 'adr-verify')
const made = []
// The background child is waited for before its directory goes: the tests below wait for the row it writes, which it writes
// before it releases its lease and exits with its log still open, and on Windows that exit outlived remove()'s retries (the
// 3.8.54 landing check, BACKLOG §407). The parent prints the child's pid; a pid that cannot be read is not waited for.
const children = []
const gone = pid => { try { process.kill(pid, 0); return false } catch (error) { return error.code !== 'EPERM' } }
test.after(async () => {
  const limit = Date.now() + 15_000
  for (const pid of children) while (!gone(pid) && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 100))
  for (const dir of made) remove(dir)
})

const TASK = 'tasks/T1-fixture.md'
function corpus(fence) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-bgu-')))
  made.push(temp)
  const dir = path.join(temp, 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const task = path.join(dir, TASK)
  writeFileSync(task, readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, `\`\`\`bash\n${fence}\n\`\`\``))
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  return { dir, task, data: path.join(temp, 'data'), state: path.join(temp, 'state'), pid: path.join(temp, 'child.pid') }
}
function verify(c, args) {
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: c.data, QUALITY_HARNESS_STATE_DIR: c.state, FIXTURE_PID: c.pid }
  delete env.QUALITY_HARNESS_FENCE_TIMEOUT
  const run = spawnSync('python3', [gate, ...args], { cwd: c.dir, env, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  const started = /BACKGROUND run \w+ started \(pid (\d+)\)/.exec(run.stdout ?? '')
  if (started) children.push(Number(started[1]))
  return run
}
const rowsOf = task => (readFileSync(task, 'utf8').split('## Verification Log')[1] ?? '').split('\n').filter(line => /^- \d{4}-\d{2}-\d{2} · /.test(line))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, what, ms = 90_000) {
  const limit = Date.now() + ms
  while (Date.now() < limit) {
    const found = check()
    if (found) return found
    await sleep(200)
  }
  assert.fail(`${what} did not happen within ${ms}ms`)
}
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }
const rowOf = c => until(() => { const found = rowsOf(c.task); return found.length ? found[0] : null }, 'the background row')

test('a background run whose tree git could not read is never recorded as passed', async () => {
  const fence = 'echo "1 passed in 0.01s"'
  // The twin: git reads the tree at both ends, and the same fence is recorded as passed.
  const twin = corpus(fence)
  assert.equal(verify(twin, [TASK, '--background']).status, 0)
  assert.match(await rowOf(twin), / · exit 0 · /)

  // HEAD resolves, `git diff HEAD` fails on an unreadable index: both ends are unobserved, and two failures
  // must not compare equal as "the same tree".
  const c = corpus(fence)
  writeFileSync(path.join(c.dir, '.git', 'index'), 'not an index\n')
  assert.notEqual(spawnSync('git', ['diff', 'HEAD', '--binary'], { cwd: c.dir, encoding: 'utf8', timeout: 60_000, windowsHide: true }).status, 0, 'the fixture does not make git diff fail')
  assert.equal(verify(c, [TASK, '--background']).status, 0)
  const row = await rowOf(c)
  assert.doesNotMatch(row, / · exit 0 · /, 'a tree git could not read was recorded as passed')
  assert.match(readFileSync(c.task, 'utf8'), /UNPROVEN/)
})

test('a background fence that leaves work running is never recorded as passed', { skip: process.platform === 'win32' && 'the fence backgrounds with POSIX shell job control' }, async () => {
  // The twin: a fence that ends everything it started is recorded as passed.
  const twin = corpus('true')
  assert.equal(verify(twin, [TASK, '--background']).status, 0)
  assert.match(await rowOf(twin), / · exit 0 · /)

  const c = corpus('sleep 30 >/dev/null 2>&1 &\necho $! > "$FIXTURE_PID"\nexit 0')
  try {
    assert.equal(verify(c, [TASK, '--background']).status, 0)
    const row = await rowOf(c)
    assert.doesNotMatch(row, / · exit 0 · /, 'a fence that left a descendant running was recorded as passed')
    assert.match(readFileSync(c.task, 'utf8'), /UNPROVEN/)
    assert.ok(existsSync(c.pid), 'the fence did not record its descendant')
    const pid = Number(readFileSync(c.pid, 'utf8').trim())
    await until(() => !alive(pid), 'the descendant to be gone', 15_000)
  } finally {
    if (existsSync(c.pid)) { try { process.kill(Number(readFileSync(c.pid, 'utf8').trim()), 'SIGKILL') } catch { /* already gone */ } }
  }
})
