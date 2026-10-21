// ADR-120 T15: a session that edits a test body another task locks is told, at the commit and turn-end boundary, which task
// and which command relocks it. Before this, adr-lint said so only when the TASK file was gated, and an edit to a test never
// gates a task: the lock failed later, on `done`, with nobody told which edit moved it (`scripts/test-locks.py` was manual).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runArtifactGates } from '../plugin/scripts/artifact-pass.mjs'
import { remove } from './helpers/remove.mjs'
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dispatcher = join(repoRoot, 'plugin', 'scripts', 'facts-gate-dispatch.sh')
const { NODE_TEST_CONTEXT: _nested, ...cleanEnv } = process.env
const pyEnv = { ...cleanEnv, PYTHONPATH: join(repoRoot, 'plugin', 'lib'), PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }

const LOCKED_BODY = "test('locked dirty', () => {\n  assert.equal(2, 2)\n})\n"
const HEAD = "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"
const ROW = '| `locked dirty` | `tests/lock-subject.test.mjs` | lock | F-1 |'
const SECOND_BODY = "test('locked second', () => {\n  assert.equal(4, 4)\n})\n"
const SECOND_ROW = '| `locked second` | `tests/lock-second.test.mjs` | lock | F-1 |'

const taskText = (vlog, rows = [ROW], id = 'ADR-001') => [`# Task ${id}-T1: lock`, '', '## Tests', '', '| Test name | File | Verifies | Covers |',
  '|-----------|------|----------|--------|', ...rows, '', '## Verification Log', '', ...vlog, ''].join('\n')

// A repository with one ADR whose T1 is done and locks `locked dirty` (and, with `second`, `locked second` in a second
// file; with `twin`, a second ADR whose own tasks/T1-lock.md locks the same test), plus a test file no task names.
function fixture({ status = 'done', second = false, twin = false } = {}) {
  const dir = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-lockdrift-')))
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(init.status, 0, init.stderr)
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'), HEAD + LOCKED_BODY)
  writeFileSync(join(dir, 'tests', 'unlocked.test.mjs'), HEAD + "test('free', () => {\n  assert.equal(1, 1)\n})\n")
  if (second) writeFileSync(join(dir, 'tests', 'lock-second.test.mjs'), HEAD + SECOND_BODY)
  const rows = second ? [ROW, SECOND_ROW] : [ROW]
  for (const id of twin ? ['ADR-001', 'ADR-002'] : ['ADR-001']) {
    const tasks = join(dir, 'docs', 'adr', `${id}-probe`, 'tasks')
    mkdirSync(tasks, { recursive: true })
    writeFileSync(join(dir, 'docs', 'adr', `${id}-probe.md`), [
      `# ${id}: Probe`, '', '**Status:** Accepted', '**Spec:** None — no spec stage',
      '**Served-path change:** None — this decision changes no served path.', '',
      '## Existing Primitives Audit', '', 'Nothing existing covers it.', '', '## Decision', '', 'Lock.', '',
      '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '', '## Consequences', '', 'Locked.', '',
      '## Wiring & Contract Changes', '', 'None.', '', '## Out of Scope', '',
      `- The other thing (deferred: ${id === 'ADR-001' ? 'ADR-002' : 'ADR-003'})`, ''].join('\n'))
    writeFileSync(join(tasks, 'README.md'), ['# Tasks', '', '| ID | Goal | Status | Depends-on | Notes |',
      '|----|------|--------|------------|-------|', `| T1 | lock | ${status} | | |`, ''].join('\n'))
    const suffix = spawnSync('python3', ['-c', 'import sys; from pathlib import Path; from record import first_red_lock_suffix; '
      + 'sys.stdout.write(first_red_lock_suffix(sys.stdin.read(), Path(sys.argv[1])))', dir],
    { input: taskText([], rows, id), env: pyEnv, encoding: 'utf8', timeout: 30_000 })
    assert.equal(suffix.status, 0, suffix.stderr)
    assert.match(suffix.stdout, /test-lock-sha256:[0-9a-f]{64}/, 'the first-red lock must carry a hash')
    writeFileSync(join(tasks, 'T1-lock.md'), taskText([
      `- 2026-09-13 · no-git · exit 2 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix.stdout}`], rows, id))
  }
  return dir
}

const driftLines = said => String(said ?? '').split('\n').filter(line => /hash moved/.test(line))
// Said once on POSIX; on Windows at least once. The landing run of d161ec16 (39684429396, windows) said the line twice in
// a pass that also gates its task: the record key the scan reads did not match the one the record's lint wrote, so the
// dedupe did nothing there, which repeats a line and never loses one (BACKLOG §396). What no platform may do is say fewer.
const saidOnce = (count, expected, message) => (process.platform === 'win32'
  ? assert.ok(count >= expected, message)
  : assert.equal(count, expected, message))

test("an edit that moves another task's locked test names the task and the relock", () => {
  const bash = resolveBashExecutable()
  assert.ok(bash, 'bash is needed to run the dispatcher')
  const dir = fixture()
  try {
    const locked = join(dir, 'tests', 'lock-subject.test.mjs')
    // Clean control: nothing moved, so a gate over the test file says nothing.
    assert.equal(runArtifactGates([locked], dir), null)

    // Clean: a test added BESIDE the locked one leaves the locked body as it was.
    writeFileSync(locked, HEAD + LOCKED_BODY + "test('beside', () => {\n  assert.equal(3, 3)\n})\n")
    assert.equal(runArtifactGates([locked], dir), null, 'a new test beside a locked one moves no locked body')

    // Clean: an edit to a test no task locks says nothing.
    const free = join(dir, 'tests', 'unlocked.test.mjs')
    writeFileSync(free, HEAD + "test('free', () => {\n  assert.equal(1, 2)\n})\n")
    assert.equal(runArtifactGates([free], dir), null, "an unlocked test file is nobody's lock")

    // Dirty: the locked body moves. One line, naming the task and the relock.
    writeFileSync(locked, HEAD + "test('locked dirty', () => {\n  assert.equal(1, 2)\n})\n")
    const said = runArtifactGates([locked], dir)
    assert.match(String(said), /^Artifact validation failed:/, String(said))
    const lines = driftLines(said)
    assert.equal(lines.length, 1, `exactly one drift line:\n${said}`)
    assert.match(lines[0], /T1-lock\.md/, 'names the task')
    assert.match(lines[0], /locked dirty/, 'names the test')
    assert.match(lines[0], /adr-verify --relock --replace-hashes/, 'names the relock')

    // Not per edit: PostToolUse stays quiet about a test file, the boundary says it.
    // The dispatcher takes a path with forward slashes, as run-shell-hook hands it one (tests/hook-work.test.mjs does the same).
    const perEdit = spawnSync(bash, [dispatcher, locked.replaceAll('\\', '/'), 'PostToolUse'], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(`${perEdit.stdout}${perEdit.stderr}`, '')
    const boundary = spawnSync(bash, [dispatcher, locked.replaceAll('\\', '/'), ''], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(boundary.status, 0)
    assert.equal(driftLines(boundary.stderr).length, 1, boundary.stderr)
    assert.equal(driftLines(boundary.stdout).length, 0, 'findings are on stderr, where the batch reads them')
  } finally { rmSync(dir, { recursive: true, force: true }) }

  // A task that does not claim done has no lock to withhold.
  const open = fixture({ status: 'todo' })
  try {
    const locked = join(open, 'tests', 'lock-subject.test.mjs')
    writeFileSync(locked, HEAD + "test('locked dirty', () => {\n  assert.equal(1, 2)\n})\n")
    assert.equal(runArtifactGates([locked], open), null, 'a task not claimed done is not held by its lock')
  } finally { rmSync(open, { recursive: true, force: true }) }
})

// The Codex review of 0b129010..bca51180: the nested gate of a task shared the batch's adr-lint ledger, so gating the first
// changed file cached the task's lint and the second file's drift was never said. Each file's drift is said.
test('two edited test files one task locks each get their drift line in one pass', () => {
  const dir = fixture({ second: true })
  try {
    const first = join(dir, 'tests', 'lock-subject.test.mjs')
    const second = join(dir, 'tests', 'lock-second.test.mjs')
    // Clean twin: only the first file's body moves, so one line, naming its test and not the other.
    writeFileSync(first, HEAD + "test('locked dirty', () => {\n  assert.equal(1, 2)\n})\n")
    const one = driftLines(runArtifactGates([first, second], dir))
    assert.equal(one.length, 1, one.join('\n'))
    assert.match(one[0], /locked dirty/)
    // Dirty: both bodies move. In either order, each file's drift is said.
    writeFileSync(second, HEAD + "test('locked second', () => {\n  assert.equal(4, 5)\n})\n")
    for (const order of [[first, second], [second, first]]) {
      const lines = driftLines(runArtifactGates(order, dir))
      assert.equal(lines.length, 2, `one drift line per file:\n${lines.join('\n')}`)
      assert.ok(lines.some(line => /locked dirty/.test(line)) && lines.some(line => /locked second/.test(line)), lines.join('\n'))
    }
  } finally { remove(dir) }
})

// The review of 8676b9ac: a pass that gates the task's own record as well as a test file it locks says the lock finding once,
// whichever comes first; the record's lint says it, or the drift line does.
test('a pass gating a task and a test file it locks says the moved lock once, in either order', () => {
  const dir = fixture()
  try {
    const locked = join(dir, 'tests', 'lock-subject.test.mjs')
    const task = join(dir, 'docs', 'adr', 'ADR-001-probe', 'tasks', 'T1-lock.md')
    // Clean twin: nothing moved, so neither order says a lock finding.
    for (const order of [[task, locked], [locked, task]]) assert.equal(driftLines(runArtifactGates(order, dir)).length, 0)
    writeFileSync(locked, HEAD + "test('locked dirty', () => {\n  assert.equal(1, 2)\n})\n")
    for (const order of [[task, locked], [locked, task]]) {
      const said = runArtifactGates(order, dir)
      const lines = driftLines(said)
      saidOnce(lines.length, 1, `the moved lock once:\n${said}`)
      assert.match(lines[0], /locked dirty/)
    }
  } finally { remove(dir) }
})

// The review of 6a3fa2e9: adr-lint names a moved lock by task file name and T-number alone, so two records whose
// tasks/T1-lock.md lock one test say the same line. Each record's finding is said: one record's never stands for the other's.
test("two records whose tasks lock one test each say their moved lock, and neither's suppresses the other's", () => {
  const dir = fixture({ twin: true })
  try {
    const locked = join(dir, 'tests', 'lock-subject.test.mjs')
    const task = join(dir, 'docs', 'adr', 'ADR-002-probe', 'tasks', 'T1-lock.md')
    // Clean twin: nothing moved, nothing said.
    assert.equal(driftLines(runArtifactGates([locked, task], dir)).length, 0)
    writeFileSync(locked, HEAD + "test('locked dirty', () => {\n  assert.equal(1, 2)\n})\n")
    // With a file no task names beside it, the pass has a ledger and only the drift scan speaks for either record: a pass
    // of one path keeps none, and a task in the pass is said by its own record's lint.
    const free = join(dir, 'tests', 'unlocked.test.mjs')
    for (const order of [[locked], [locked, free], [free, locked], [locked, task], [task, locked]]) {
      const said = runArtifactGates(order, dir)
      saidOnce(driftLines(said).length, 2, `one moved lock per record:\n${said}`)
    }
  } finally { remove(dir) }
})

// The review of 276484fb: when the scan cannot learn which record a line was said for, it keeps nothing and drops nothing,
// so two records' identical lines are both said. A directory where the handoff file goes makes every handoff fail.
test('a lock line whose record the scan could not learn is said, and keeps nothing that could stand for another', () => {
  const dir = fixture({ twin: true })
  const ledgerDirectory = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-lockdrift-ledger-')))
  try {
    const locked = join(dir, 'tests', 'lock-subject.test.mjs')
    const free = join(dir, 'tests', 'unlocked.test.mjs')
    writeFileSync(locked, HEAD + "test('locked dirty', () => {\n  assert.equal(1, 2)\n})\n")
    // Clean twin: with the handoff working, the shared ledger gives each record its line.
    assert.equal(driftLines(runArtifactGates([locked, free], dir, 100_000, { ledgerDirectory })).length, 2)
    remove(ledgerDirectory)
    mkdirSync(join(ledgerDirectory, 'adr.key'), { recursive: true })
    const said = runArtifactGates([locked, free], dir, 100_000, { ledgerDirectory })
    assert.equal(driftLines(said).length, 2, `an unknown record suppresses nothing:\n${said}`)
  } finally { remove(dir); remove(ledgerDirectory) }
})
