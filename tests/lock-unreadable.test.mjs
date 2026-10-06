// A Windows corpus-chaos run of 3.8.5 (BACKLOG §350 C1): 3.8.5 stopped the traceback a UTF-16
// test file named by a lock raised, and in its place adr-lint said "locked test … vanished — done
// is refused" on five records. The file was there; nobody observed it gone. A gate never reports
// an observation it did not make (CLAUDE.md §3), so a file that is there and cannot be read is
// UNPROVEN, and only a file that is gone is "vanished". Tested at adr-lint, the call the report
// came through (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RECORD_PY = join(repoRoot, 'plugin', 'lib', 'record.py')
const RECORD = join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer.md')
const TASK = join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks', 'T1-add-and-remove-items.md')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const said = run => `${run.stdout}\n${run.stderr}`
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const lint = repo => spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join(repo, RECORD)],
  { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
// The js-vitest-spa corpus in a scratch repository this file made (CLAUDE.md §9), its done T1
// carrying the first-red lock record.py itself mints over `src/cart.test.ts`.
// `oneTest` drops the fixture's second Tests row, `removes_an_item`, which names no test in the file
// and is therefore unproven from the first red: a lock whose every name resolves, so the only thing
// that can withhold done is the file this test breaks.
// `check` declares the project's check in .quality-harness.json before the lock is minted, so the lock
// records it and a reader that cannot find the project root says the check could not be read.
const locked = ({ oneTest = false, check = null } = {}) => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-lock-unreadable-'))
  temps.push(repo)
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'js-vitest-spa'), repo, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
  const task = join(repo, TASK)
  if (oneTest) writeFileSync(task, readFileSync(task, 'utf8').replace(/^\| `removes_an_item` .*\n/m, ''))
  if (check) writeFileSync(join(repo, '.quality-harness.json'), JSON.stringify({ check }))
  const minted = spawnSync('python3', ['-c', [
    'import importlib.util, sys',
    'spec = importlib.util.spec_from_file_location("record_probe", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(record)',
    'print(record.first_red_lock_suffix(open(sys.argv[2], encoding="utf-8").read(), sys.argv[3]))',
  ].join('\n'), RECORD_PY, task, repo], { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } })
  assert.equal(minted.status, 0, said(minted))
  const suffix = minted.stdout.trim()
  assert.match(suffix, /^· test-lock-sha256:[0-9a-f]{64} · test-lock-b64:[\w-]+$/)
  const text = readFileSync(task, 'utf8')
  writeFileSync(task, `${text}${text.endsWith('\n') ? '' : '\n'}- 2026-09-20 · no-git · exit 1 · \`grep -q 'adds_an_item' src/cart.test.ts\` · ms:3 ${suffix}\n`)
  return repo
}
const cart = repo => join(repo, 'src', 'cart.test.ts')
const VANISHED = 'locked test `src/cart.test.ts`::adds_an_item vanished'
const UNREAD = 'locked test `src/cart.test.ts`::adds_an_item could not be read'

test('a locked test file that is there and cannot be read is UNPROVEN, not vanished', t => {
  // UTF-16, as the Windows run saved it.
  const utf16 = locked()
  writeFileSync(cart(utf16), Buffer.from(`﻿${readFileSync(cart(utf16), 'utf8')}`, 'utf16le'))
  const read = lint(utf16)
  assert.ok(read.stdout.includes(UNREAD), said(read))
  assert.ok(!said(read).includes(VANISHED), said(read))
  assert.ok(!/Traceback/.test(said(read)), said(read))
  // The dirty twin: a file that is gone is still "vanished".
  const gone = locked()
  rmSync(cart(gone))
  const missing = lint(gone)
  assert.ok(missing.stdout.includes(VANISHED), said(missing))
  assert.ok(!missing.stdout.includes(UNREAD), said(missing))
  // A file this process may not open, where a mode bit can say so. adr-lint's own read of the
  // Tests-row file may stop it first, as could-not-run (BACKLOG §350 F2 is about that line); either
  // way it is never "vanished".
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a read here'); return }
  const denied = locked()
  chmodSync(cart(denied), 0o000)
  try {
    const run = lint(denied)
    assert.ok(run.stdout.includes(UNREAD) || /could not run: .*cart\.test\.ts — Permission denied/.test(run.stderr), said(run))
    assert.ok(!said(run).includes(VANISHED), said(run))
  } finally { chmodSync(cart(denied), 0o644) }
})

// The stand-in review of 3.8.6: `_present` asked `Path.is_file`, which from Python 3.13 swallows
// every OSError, so a directory above the file that this process may not search said "gone".
test('a file behind a directory this process may not search is not gone', t => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a search here'); return }
  const root = mkdtempSync(join(tmpdir(), 'qh-present-'))
  temps.push(root)
  mkdirSync(join(root, 'shut'))
  writeFileSync(join(root, 'shut', 'x.test.mjs'), "test('x', () => {})\n")
  const present = rel => spawnSync('python3', ['-c', [
    'import importlib.util, sys',
    'spec = importlib.util.spec_from_file_location("record_present", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(record)',
    'from pathlib import Path',
    'print(record._present(Path(sys.argv[2])))',
  ].join('\n'), RECORD_PY, join(root, ...rel.split('/'))], { encoding: 'utf8', timeout: 60_000, windowsHide: true }).stdout.trim()
  assert.equal(present('shut/x.test.mjs'), 'True')
  assert.equal(present('shut/gone.test.mjs'), 'False')
  chmodSync(join(root, 'shut'), 0o000)
  try {
    assert.equal(present('shut/x.test.mjs'), 'True', 'could not look is not gone')
  } finally { chmodSync(join(root, 'shut'), 0o755) }
})

// BACKLOG §350 C8: a locked test whose Tests row now spells its file another way — an 8.3 name on
// Windows, a link, a case variant — was "vanished". The same file is compared by its digest.
test('a locked test reached through another spelling of the same file is not vanished', t => {
  const respell = (repo, dir) => {
    const task = join(repo, TASK)
    writeFileSync(task, readFileSync(task, 'utf8').replace('| `adds_an_item` | `src/cart.test.ts` |', `| \`adds_an_item\` | \`${dir}/cart.test.ts\` |`))
  }
  const aliased = locked({ oneTest: true })
  try { symlinkSync(join(aliased, 'src'), join(aliased, 'lib'), 'junction') } catch (error) { t.skip(`no link here: ${error.code}`); return }
  respell(aliased, 'lib')
  const same = lint(aliased)
  assert.ok(!said(same).includes(VANISHED), said(same))
  assert.ok(!said(same).includes(UNREAD), said(same))
  // And nothing else moved: the gate ran (no traceback, not could-not-run) and exits as the same
  // corpus does with the row spelled the way it was locked.
  assert.ok(!/Traceback/.test(said(same)), said(same))
  assert.equal(same.status, lint(locked({ oneTest: true })).status, said(same))
  // And --relock reads it as `lock_findings` does: not a moved body (a stand-in review of f8d1eaf).
  assert.doesNotMatch(said(relock(aliased)), /hashed body moved/)
  // The dirty twin: a real copy is another file, so the locked spelling is still gone.
  const copied = locked({ oneTest: true })
  cpSync(join(copied, 'src'), join(copied, 'lib'), { recursive: true })
  rmSync(cart(copied))
  respell(copied, 'lib')
  const other = lint(copied)
  assert.ok(other.stdout.includes(VANISHED), said(other))
})

// A stand-in review of 3.8.6, then BACKLOG §350 item 1: `moved_lock_bodies` called an unreadable
// test file a MOVED body, so `adr-verify --relock` said "pass --replace-hashes". That replace hashed
// nothing for the file's tests, and a lock that hashed no bodies reads later edits as advice
// (record.py's `tool_blind`) — a test left unlocked by the gate's own instruction. A relock over a
// file it cannot read is refused in either mode, and names the file, never "moved".
const relock = (repo, ...flags) => spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-verify'),
  join(repo, TASK), '--relock', ...flags, '--cwd', repo], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
test('a relock over a locked test file it cannot read is refused, in either mode, and says why', () => {
  for (const flags of [[], ['--replace-hashes']]) {
    const repo = locked()
    const before = readFileSync(join(repo, TASK), 'utf8')
    writeFileSync(cart(repo), Buffer.from(`﻿${readFileSync(cart(repo), 'utf8')}`, 'utf16le'))
    const run = relock(repo, ...flags)
    assert.notEqual(run.status, 0, `${flags}: ${said(run)}`)
    assert.match(said(run), /could not read `src\/cart\.test\.ts` — UNPROVEN/, said(run))
    assert.doesNotMatch(said(run), /hashed body moved/, said(run))
    assert.equal(readFileSync(join(repo, TASK), 'utf8'), before, `${flags}: no lock row was written`)
  }
  // The dirty twin: a body that really moved is still "moved", and --replace-hashes still replaces it.
  const moved = locked()
  writeFileSync(cart(moved), readFileSync(cart(moved), 'utf8').replace("'sku-1').items", "'sku-2').items"))
  const edited = relock(moved)
  assert.notEqual(edited.status, 0, said(edited))
  assert.match(said(edited), /hashed body moved \(`src\/cart\.test\.ts`::adds_an_item\)/, said(edited))
  assert.equal(relock(moved, '--replace-hashes').status, 0, 'a readable moved body is still replaceable')
})

// BACKLOG §350 item 6 (js-spa-windows, 3.8.6): with a locked test file saved as UTF-16, work-next said
// "5 tasks are both READY and claimed done without evidence — `adr-verify` them first". The tasks
// carry exit-0 evidence; what withholds done is a file that cannot be read, and re-running
// adr-verify cannot change that. They are named as withheld by an unreadable lock, as UNPROVEN.
const workNext = (repo, ...flags) => spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), ...flags, repo],
  { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
test('work-next names a task withheld by an unreadable test lock, and never tells it to adr-verify', () => {
  const repo = locked({ oneTest: true })
  writeFileSync(cart(repo), Buffer.from(`\ufeff${readFileSync(cart(repo), 'utf8')}`, 'utf16le'))
  const state = JSON.parse(workNext(repo, '--json').stdout)
  const task = 'docs/adr/ADR-001-the-cart-is-a-pure-reducer/tasks/T1-add-and-remove-items.md'
  assert.deepEqual(state.lockUnreadable.map(file => file.split('\\').join('/')), [task], JSON.stringify(state))
  assert.ok(!state.unbackedDoneClaims.some(file => file.split('\\').join('/') === task), 'not an unbacked claim: it carries exit-0 evidence')
  assert.ok(!state.readyButClaimedDone.some(file => file.split('\\').join('/') === task), JSON.stringify(state.readyButClaimedDone))
  assert.ok(state.readinessUnproven.some(dir => dir.split('\\').join('/') === task.slice(0, task.lastIndexOf('/'))), JSON.stringify(state.readinessUnproven))
  const text = workNext(repo).stdout
  assert.match(text, /withheld by a test lock over a file that could not be read/, text)
  // The fixture's own ADR-002 task is ready and claimed done; this task is not among those told to adr-verify.
  assert.doesNotMatch(text.split(/`adr-verify` (?:it|them) first/)[1] ?? '', /T1-add-and-remove-items/, text)
  // The control: the readable twin names nothing of the kind.
  const clean = JSON.parse(workNext(locked({ oneTest: true }), '--json').stdout)
  assert.deepEqual(clean.lockUnreadable, [])
})

// BACKLOG §350 C2 (Windows runs of 3.8.3): a task directory that is a junction leaving the tree made
// done tasks READY with ".quality-harness.json check could not be read", because the project root was
// asked of git from inside the junction, which answers for the junction's target. The root is the
// repository the LISTED path is in.
test('a done task reached through a link that leaves the tree is done, its project check read', t => {
  const repo = locked({ oneTest: true, check: 'npx vitest run' })
  const tasks = join(repo, 'docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks')
  const outside = mkdtempSync(join(tmpdir(), 'qh-tasks-outside-'))
  temps.push(outside)
  renameSync(tasks, join(outside, 'tasks'))
  try { symlinkSync(join(outside, 'tasks'), tasks, process.platform === 'win32' ? 'junction' : 'dir') } catch (error) { t.skip(`no link can be made here: ${error.code}`); return }
  const next = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-next'), tasks, '--json'], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const answer = JSON.parse(next.stdout)
  assert.deepEqual(answer.done.map(task => task.id), ['T1'], next.stdout)
  assert.doesNotMatch(next.stdout, /check could not be read/, next.stdout)
})

// BACKLOG §350 C2: a task file adr-next could not read was listed as an "unbacked done claim" (its
// README row claims done), with "adr-verify it first". Nobody read it; its readiness is UNPROVEN.
test('a task file nobody could read is not an unbacked done claim, and its directory is UNPROVEN', t => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a read here'); return }
  const repo = locked({ oneTest: true })
  const task = join(repo, TASK)
  chmodSync(task, 0o000)
  try {
    const state = JSON.parse(workNext(repo, '--json').stdout)
    const rel = TASK.split('\\').join('/')
    assert.ok(!state.unbackedDoneClaims.some(file => file.split('\\').join('/') === rel), JSON.stringify(state.unbackedDoneClaims))
    assert.ok(state.readinessUnproven.some(dir => dir.split('\\').join('/') === rel.slice(0, rel.lastIndexOf('/'))), JSON.stringify(state.readinessUnproven))
  } finally { chmodSync(task, 0o644) }
})

// BACKLOG §349 item 2 (the first Windows outside run): a task with exit-0 evidence whose locked test later
// moved was listed as "READY and claimed done without evidence — `adr-verify` them first". It has the
// evidence, and bare adr-verify is refused again; the line says so and names the relock.
test('work-next says a ready task held back by a moved lock carries its evidence, and names the relock', () => {
  const repo = locked({ oneTest: true })
  const verified = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-verify'), join(repo, TASK), '--cwd', repo],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(verified.status, 0, said(verified))
  writeFileSync(cart(repo), readFileSync(cart(repo), 'utf8').replace("'sku-1').items", "'sku-2').items"))
  const run = workNext(repo)
  assert.equal(run.status, 0, said(run))
  assert.match(run.stdout, /carr(?:y|ies) exit-0 evidence, held back only by a moved test lock[\s\S]*adr-verify --relock --replace-hashes/, run.stdout)
  assert.doesNotMatch(run.stdout, /both READY and claimed done without evidence[^\n]*\n {2}docs\/adr\/ADR-001-the-cart/, run.stdout)
})
