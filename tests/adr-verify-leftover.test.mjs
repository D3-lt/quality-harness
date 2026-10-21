// ADR-120 T10, the owner's decision of 2026-10-21: a fence that returns with work it started still running is never recorded as
// passed in the foreground either, nor as the clean fence of a mutant run. Every run is over a copy of tests/fixtures/ok in the OS
// temp directory (CLAUDE.md §9); the twin of each case is the same fence without the backgrounded child.
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
test.after(() => { for (const dir of made) remove(dir) })
const posix = process.platform === 'win32' && 'the fence backgrounds with POSIX shell job control, and Windows reports no group members'

const TASK = 'tasks/T1-fixture.md'
const LEAVES = 'sleep 30 >/dev/null 2>&1 &\necho $! > "$FIXTURE_PID"\n'
function corpus(fence) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-left-')))
  made.push(temp)
  const dir = path.join(temp, 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  writeFileSync(path.join(dir, 'src.sh'), 'X=1\n')
  const task = path.join(dir, TASK)
  // The fixture has no Mutation Log, and a mutant run refuses a task with nowhere to record it.
  writeFileSync(task, `${readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, `\`\`\`bash\n${fence}\n\`\`\``).trimEnd()}\n\n## Mutation Log\n`)
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  return { dir, task, data: path.join(temp, 'data'), state: path.join(temp, 'state'), pid: path.join(temp, 'child.pid') }
}
function verify(c, args) {
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: c.data, QUALITY_HARNESS_STATE_DIR: c.state, FIXTURE_PID: c.pid }
  delete env.QUALITY_HARNESS_FENCE_TIMEOUT
  return spawnSync('python3', [gate, ...args], { cwd: c.dir, env, encoding: 'utf8', timeout: 300_000, windowsHide: true })
}
const log = (task, section) => (readFileSync(task, 'utf8').split(`## ${section}`)[1] ?? '').split('\n## ')[0]
const rows = task => log(task, 'Verification Log').split('\n').filter(line => /^- \d{4}-\d{2}-\d{2} · /.test(line))
const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }
function reap(c) {
  if (!existsSync(c.pid)) return
  const pid = Number(readFileSync(c.pid, 'utf8').trim())
  assert.ok(!alive(pid), 'the descendant the fence left was not ended')
}
const after = c => { if (existsSync(c.pid)) { try { process.kill(Number(readFileSync(c.pid, 'utf8').trim()), 'SIGKILL') } catch { /* already gone */ } } }

test('a foreground fence that leaves work running is never recorded as passed', { skip: posix }, () => {
  const pass = 'echo "1 passed in 0.01s"'
  const twin = corpus(pass)
  assert.equal(verify(twin, [TASK]).status, 0)
  assert.match(rows(twin.task).at(-1), / · exit 0 · /)

  const c = corpus(`${LEAVES}${pass}`)
  try {
    const run = verify(c, [TASK])
    assert.notEqual(run.status, 0, run.stdout + run.stderr)
    assert.doesNotMatch(rows(c.task).at(-1), / · exit 0 · /, 'a fence that left a descendant running was recorded as passed')
    assert.match(run.stdout + run.stderr + readFileSync(c.task, 'utf8'), /UNPROVEN: the fence returned with work it started still running/)
    reap(c)
  } finally { after(c) }
})

test("a mutant run's clean fence that leaves work running records no pass and applies no mutant", { skip: posix }, () => {
  const fence = "grep -q 'X=1' src.sh || exit 1\necho \"1 passed in 0.01s\""
  const mutant = ['--mutant', 'src.sh', '--from', 'X=1', '--to', 'X=2', '--why', 'the fence reads src.sh']
  for (const where of [[], ['--in-place']]) {
    const twin = corpus(fence)
    const killed = verify(twin, [TASK, ...mutant, ...where])
    assert.equal(killed.status, 0, killed.stdout + killed.stderr)
    assert.match(log(twin.task, 'Mutation Log'), /mutant killed/, `the twin ${where.join(' ') || 'isolated'} kills its mutant`)

    const c = corpus(`${LEAVES}${fence}`)
    try {
      const run = verify(c, [TASK, ...mutant, ...where])
      assert.notEqual(run.status, 0, run.stdout + run.stderr)
      assert.doesNotMatch(log(c.task, 'Mutation Log'), /mutant killed/, `${where.join(' ') || 'isolated'}: a mutant ran after a clean fence that left work`)
      assert.ok(rows(c.task).every(row => !/ · exit 0 · /.test(row)), `${where.join(' ') || 'isolated'}: the clean fence was recorded as passed`)
      reap(c)
    } finally { after(c) }
  }
})
