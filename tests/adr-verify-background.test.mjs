// ADR-120 T10: `adr-verify --background` runs a task's Acceptance fence once, detached, and its child writes the row (and
// the ADR-117 receipt) through the writer a foreground run uses. Every run is over a copy of tests/fixtures/ok in the OS
// temp directory, never over this checkout (CLAUDE.md §9). The twins sit beside the clean runs: a tree that moved, a
// fence past its timeout and an overlapping run are each shown NOT recorded as passed, in the same test that shows a
// clean run recorded as passed.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gate = path.join(repoRoot, 'plugin', 'bin', 'adr-verify')
const made = []
test.after(() => { for (const dir of made) remove(dir) })

const TASK = 'tasks/T1-fixture.md'
/** A copy of the ok fixture with this fence, committed. `data` holds the run's lease and log, `state` its receipts. */
function corpus(fence) {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-bg-')))
  made.push(temp)
  const dir = path.join(temp, 'ok')
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const task = path.join(dir, TASK)
  writeFileSync(task, readFileSync(task, 'utf8').replace(/```bash\n[\s\S]*?```/, `\`\`\`bash\n${fence}\n\`\`\``))
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
    const run = spawnSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', ...args], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  return { dir, task, data: path.join(temp, 'data'), state: path.join(temp, 'state'), done: path.join(temp, 'done.txt') }
}

// Through the interpreter, as Windows needs (CLAUDE.md §7).
function verify(c, args, env = {}) {
  const base = { ...process.env, CLAUDE_PLUGIN_DATA: c.data, QUALITY_HARNESS_STATE_DIR: c.state, FIXTURE_DONE: c.done }
  delete base.QUALITY_HARNESS_FENCE_TIMEOUT
  return spawnSync('python3', [gate, ...args], { cwd: c.dir, env: { ...base, ...env }, encoding: 'utf8', timeout: 120_000, windowsHide: true })
}
const said = run => `${run.stdout}\n${run.stderr}`
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
/** The row with the fields two corpora cannot share: the commit sha and the duration. */
const shape = row => row.replace(/ · [0-9a-f]{4,64}\*? · exit/, ' · SHA · exit').replace(/ · ms:\d+/, '')
const receiptsOf = c => {
  const saved = process.env.QUALITY_HARNESS_STATE_DIR
  process.env.QUALITY_HARNESS_STATE_DIR = c.state
  try {
    const file = path.join(stateDir(c.dir), 'receipts.jsonl')
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).sha256) : []
  } finally { if (saved === undefined) delete process.env.QUALITY_HARNESS_STATE_DIR; else process.env.QUALITY_HARNESS_STATE_DIR = saved }
}
const started = run => said(run).match(/BACKGROUND run ([0-9a-f]{8})\b/)?.[1]

test('a background fence run writes the row a foreground run would', async () => {
  // The fence touches a marker only when it ends, so a return before the marker is a return before the fence ended.
  const fence = 'sleep 5\ntouch "$FIXTURE_DONE"\necho "1 passed in 0.01s"'
  const twin = corpus(fence)
  const foreground = verify(twin, [TASK])
  assert.equal(foreground.status, 0, said(foreground))
  const [expected] = rowsOf(twin.task)

  const c = corpus(fence)
  const run = verify(c, [TASK, '--background'])
  assert.equal(run.status, 0, said(run))
  assert.ok(started(run), `the call does not name the run:\n${said(run)}`)
  assert.equal(existsSync(c.done), false, 'the call returned only after the fence ended')
  assert.equal(rowsOf(c.task).length, 0, 'a row exists before the fence ended')
  const [row] = await until(() => { const found = rowsOf(c.task); return found.length ? found : null }, 'the background row')
  assert.equal(existsSync(c.done), true, 'the row landed before the fence ended')
  assert.match(row, / · exit 0 · /)
  assert.match(row, /acceptance-sha256:[0-9a-f]{64}/)
  assert.equal(shape(row), shape(expected), 'a background row differs from the row a foreground run writes')
  // The row is written, then its receipt: a reader that sees the row first has to wait for the receipt.
  await until(() => receiptsOf(c).includes(createHash('sha256').update(row.trim()).digest('hex')), 'the ADR-117 receipt')

  // The failing twin: the fence's own exit is the row's, not a pass.
  const failing = corpus('sleep 1\necho "1 failed in 0.01s"\nexit 1')
  const second = verify(failing, [TASK, '--background'])
  assert.equal(second.status, 0, said(second))
  const [failed] = await until(() => { const found = rowsOf(failing.task); return found.length ? found : null }, 'the failing background row')
  assert.match(failed, / · exit 1 · /)
  assert.doesNotMatch(failed, / · exit 0 · /)
  await until(() => receiptsOf(failing).includes(createHash('sha256').update(failed.trim()).digest('hex')), 'the failing row\'s receipt')
})

test('a background run whose tree moved, timed out or overlaps is never recorded as passed', async () => {
  // A tracked file changed while the fence ran: the fence exited 0 on a tree it did not start on.
  const moved = corpus('echo moved >> ADR-001-selftest.md\nsleep 1\necho "1 passed in 0.01s"')
  assert.equal(verify(moved, [TASK, '--background']).status, 0)
  const [movedRow] = await until(() => { const found = rowsOf(moved.task); return found.length ? found : null }, 'the moved-tree row')
  assert.doesNotMatch(movedRow, / · exit 0 · /, 'a run whose tree moved was recorded as passed')
  assert.match(readFileSync(moved.task, 'utf8'), /UNPROVEN/)

  // The clean twin: an untracked file the fence made is not a moved tree.
  const clean = corpus('echo x > scratch.txt\nsleep 1\necho "1 passed in 0.01s"')
  assert.equal(verify(clean, [TASK, '--background']).status, 0)
  const [cleanRow] = await until(() => { const found = rowsOf(clean.task); return found.length ? found : null }, 'the clean row')
  assert.match(cleanRow, / · exit 0 · /)

  // A fence past fenceTimeout is killed and written as such, never as passed.
  const slow = corpus('sleep 120\necho "1 passed in 0.01s"')
  assert.equal(verify(slow, [TASK, '--background'], { QUALITY_HARNESS_FENCE_TIMEOUT: '2' }).status, 0)
  const [slowRow] = await until(() => { const found = rowsOf(slow.task); return found.length ? found : null }, 'the timed-out row')
  assert.doesNotMatch(slowRow, / · exit 0 · /, 'a fence past its timeout was recorded as passed')
  assert.match(readFileSync(slow.task, 'utf8'), /TIMED OUT/)

  // A second background run on the same task while one runs is refused with the running id, and the first still records.
  const busy = corpus('sleep 4\necho "1 passed in 0.01s"')
  const first = verify(busy, [TASK, '--background'])
  assert.equal(first.status, 0, said(first))
  const id = started(first)
  assert.ok(id, `the call does not name the run:\n${said(first)}`)
  const again = verify(busy, [TASK, '--background'])
  assert.notEqual(again.status, 0, 'an overlapping run was started')
  assert.ok(said(again).includes(id), `the refusal does not name the running id ${id}:\n${said(again)}`)
  await until(() => rowsOf(busy.task).length === 1, 'the first run\'s row')
  assert.equal(rowsOf(busy.task).length, 1, 'the refused run wrote a row')
  // Released at the end: the same task can be run again once its row has landed.
  await until(() => verify(busy, [TASK, '--background']).status === 0, 'the lease released')
  await until(() => rowsOf(busy.task).length === 2, 'the third run\'s row')
})

test('a background run refuses the modes that write another log or run no fence', () => {
  const c = corpus('echo "1 passed in 0.01s"')
  for (const extra of [['--mutant', 'ADR-001-selftest.md', '--from', 'a', '--to', 'b', '--why', 'w'], ['--human', 'saw it'], ['--relock'], ['--restore'], ['--in-place']]) {
    const run = verify(c, [TASK, '--background', ...extra])
    assert.equal(run.status, 2, `${extra[0]}: ${said(run)}`)
    assert.match(said(run), /--background/)
  }
  assert.equal(rowsOf(c.task).length, 0)
})

// Added after the first red run and the first mutant round, beside the two tests the task names: the mutants showed
// these mechanisms of the detached child unasserted. The first of them edits the task only once the fence is running,
// since the child reads the task file when it starts and an earlier edit is not an edit made during the run.
test('a background row does not write away an edit made to the task while the fence ran', async () => {
  const c = corpus('touch "$FIXTURE_DONE.started"\nsleep 3\necho "1 passed in 0.01s"')
  assert.equal(verify(c, [TASK, '--background']).status, 0)
  await until(() => existsSync(`${c.done}.started`), 'the fence to start')
  writeFileSync(c.task, readFileSync(c.task, 'utf8').replace('## Goal', '## Goal (edited while the fence ran)'))
  await until(() => rowsOf(c.task).length === 1, 'the row')
  assert.match(readFileSync(c.task, 'utf8'), /## Goal \(edited while the fence ran\)/, 'the row wrote away an edit made during the run')
})

test('a finished background run leaves no lease behind', async () => {
  const c = corpus('sleep 1\necho "1 passed in 0.01s"')
  assert.equal(verify(c, [TASK, '--background']).status, 0)
  const leases = () => (existsSync(c.data) ? readdirSync(c.data).filter(name => name.endsWith('.json')) : [])
  assert.equal(leases().length, 1, 'the run took no lease')
  await until(() => rowsOf(c.task).length === 1, 'the row')
  await until(() => leases().length === 0, 'the lease to be released')
})

test('several tasks cannot be combined with --background', () => {
  const c = corpus('echo "1 passed in 0.01s"')
  const run = verify(c, [TASK, TASK, '--background'])
  assert.equal(run.status, 2, said(run))
  assert.match(said(run), /several tasks cannot be combined with --background/)
  assert.equal(rowsOf(c.task).length, 0)
})
