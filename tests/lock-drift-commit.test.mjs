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
import { resolveBashExecutable } from '../plugin/scripts/run-shell-hook.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dispatcher = join(repoRoot, 'plugin', 'scripts', 'facts-gate-dispatch.sh')
const { NODE_TEST_CONTEXT: _nested, ...cleanEnv } = process.env
const pyEnv = { ...cleanEnv, PYTHONPATH: join(repoRoot, 'plugin', 'lib'), PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }

const LOCKED_BODY = "test('locked dirty', () => {\n  assert.equal(2, 2)\n})\n"
const HEAD = "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"
const ROW = '| `locked dirty` | `tests/lock-subject.test.mjs` | lock | F-1 |'

const taskText = vlog => ['# Task ADR-001-T1: lock', '', '## Tests', '', '| Test name | File | Verifies | Covers |',
  '|-----------|------|----------|--------|', ROW, '', '## Verification Log', '', ...vlog, ''].join('\n')

// A repository with one ADR whose T1 is done and locks `locked dirty`, plus a test file no task names.
function fixture({ status = 'done' } = {}) {
  const dir = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-lockdrift-')))
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(init.status, 0, init.stderr)
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'tests', 'lock-subject.test.mjs'), HEAD + LOCKED_BODY)
  writeFileSync(join(dir, 'tests', 'unlocked.test.mjs'), HEAD + "test('free', () => {\n  assert.equal(1, 1)\n})\n")
  const tasks = join(dir, 'docs', 'adr', 'ADR-001-probe', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(dir, 'docs', 'adr', 'ADR-001-probe.md'), [
    '# ADR-001: Probe', '', '**Status:** Accepted', '**Spec:** None — no spec stage',
    '**Served-path change:** None — this decision changes no served path.', '',
    '## Existing Primitives Audit', '', 'Nothing existing covers it.', '', '## Decision', '', 'Lock.', '',
    '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '', '## Consequences', '', 'Locked.', '',
    '## Wiring & Contract Changes', '', 'None.', '', '## Out of Scope', '', '- The other thing (deferred: ADR-002)', ''].join('\n'))
  writeFileSync(join(tasks, 'README.md'), ['# Tasks', '', '| ID | Goal | Status | Depends-on | Notes |',
    '|----|------|--------|------------|-------|', `| T1 | lock | ${status} | | |`, ''].join('\n'))
  const suffix = spawnSync('python3', ['-c', 'import sys; from pathlib import Path; from record import first_red_lock_suffix; '
    + 'sys.stdout.write(first_red_lock_suffix(sys.stdin.read(), Path(sys.argv[1])))', dir],
  { input: taskText([]), env: pyEnv, encoding: 'utf8', timeout: 30_000 })
  assert.equal(suffix.status, 0, suffix.stderr)
  assert.match(suffix.stdout, /test-lock-sha256:[0-9a-f]{64}/, 'the first-red lock must carry a hash')
  writeFileSync(join(tasks, 'T1-lock.md'), taskText([
    `- 2026-09-13 · no-git · exit 2 · \`node --test tests/lock-subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix.stdout}`]))
  return dir
}

const driftLines = said => String(said ?? '').split('\n').filter(line => /hash moved/.test(line))

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
