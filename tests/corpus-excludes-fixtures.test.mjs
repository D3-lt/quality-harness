// A test fixture is not a record of this repository.
//
// Two corpus readers disagreed. SessionStart's `taskDirectories` skipped
// `tests/`, `fixtures/` and their kin, so orientation never mentioned them;
// `recordFilesFromListing` (behind `adrCorpus`) and work-next's `taskFiles` did
// not, so on this repository `work-next` named three fixture tasks as the next
// thing to do and `adr-state` counted five fixture records as governing
// (measured 2026-09-23, BACKLOG §263). One exported predicate now serves all of
// them, and this proves each reader through its own entry point, with a real
// record beside the fixture as the control — a reader that returns nothing at
// all would otherwise pass.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { adrCorpus, listedUnderUninterestingDirectory, readyTaskLines } from '../plugin/scripts/lifecycle.mjs'
import { observe } from '../plugin/scripts/work-next.mjs'

const scratch = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-corpus-fixtures-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const RECORD = (n, title) => `# ADR-${n}: ${title}\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\ny\n`
const TASK = '# Task\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n\n'

// The real record and a fixture that is its exact double, one directory over.
const REAL = 'docs/adr/ADR-001-real.md'
const REAL_TASK = 'docs/adr/ADR-001-real/tasks/T1-live.md'
const FIXTURE = 'tests/fixtures/foreign/adr/ADR-002-fixture.md'
const FIXTURE_TASK = 'tests/fixtures/foreign/adr/ADR-002-fixture/tasks/T1-planted.md'
const LISTING = [REAL, REAL_TASK, FIXTURE, FIXTURE_TASK]

function repository() {
  const root = mkdtempSync(path.join(scratch, 'repo-'))
  const write = (relative, text) => {
    mkdirSync(path.join(root, ...relative.split('/').slice(0, -1)), { recursive: true })
    writeFileSync(path.join(root, ...relative.split('/')), text)
  }
  write(REAL, RECORD('001', 'real'))
  write(REAL_TASK, TASK)
  write(FIXTURE, RECORD('002', 'fixture'))
  write(FIXTURE_TASK, TASK)
  const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root, encoding: 'utf8', timeout: 15_000 })
  assert.equal(init.status ?? 0, 0, init.stderr)
  return root
}

const relative = (root, file) => path.relative(root, file).split(path.sep).join('/')

test('the predicate names the fixture directories and nothing a record lives in', () => {
  assert.equal(listedUnderUninterestingDirectory(['tests', 'fixtures', 'foreign', 'adr']), true)
  assert.equal(listedUnderUninterestingDirectory(['Fixture', 'adr']), true)
  assert.equal(listedUnderUninterestingDirectory(['node_modules', 'x', 'docs', 'adr']), true)
  assert.equal(listedUnderUninterestingDirectory(['testdata', 'adr']), true)
  // The control: the directories records actually live in are not matched —
  // and that includes `spec/`, `examples/` and `test/`, which a probe on
  // 2026-09-23 showed being dropped as `records=0, look=ok` when they were.
  assert.equal(listedUnderUninterestingDirectory(['docs', 'adr']), false)
  assert.equal(listedUnderUninterestingDirectory(['docs', 'adr-archive', 'ADR-001-x']), false)
  assert.equal(listedUnderUninterestingDirectory(['docs', 'specs']), false)
  assert.equal(listedUnderUninterestingDirectory(['spec', 'adr']), false)
  assert.equal(listedUnderUninterestingDirectory(['examples', 'adr']), false)
  assert.equal(listedUnderUninterestingDirectory(['test', 'adr']), false)
  assert.equal(listedUnderUninterestingDirectory(['tests', 'adr']), false)
  assert.equal(listedUnderUninterestingDirectory([]), false)
})

test('adrCorpus lists the real record and not its fixture double', () => {
  const root = repository()
  const corpus = adrCorpus(root, { tracked: LISTING })
  const found = corpus.map(record => relative(root, record.file))
  assert.ok(found.includes(REAL), `the control record is read: ${found}`)
  assert.deepEqual(found.filter(file => file.startsWith('tests/')), [], `a fixture is not a record: ${found}`)
})

test('work-next offers the real task and never a fixture task', () => {
  const root = repository()
  const state = observe(root)
  const ready = state.ready.map(file => relative(root, file))
  assert.deepEqual(ready, [REAL_TASK], `only the real record's task is ready:\n${ready.join('\n')}`)
  assert.equal(state.records, 1, 'the fixture record is not counted either')
  assert.equal(state.tasks, 1, 'nor its task')
})

test('session orientation asks adr-next about the real task set and never a fixture', () => {
  const root = repository()
  const asked = []
  const spawn = (tool, args) => {
    asked.push(relative(root, args[0]))
    return { status: 0, stdout: JSON.stringify({ ready: [{ id: 'T1', goal: 'a task', path: path.join(args[0], 'T1.md') }] }), stderr: '' }
  }
  const { look, lines } = readyTaskLines(root, true, LISTING, spawn)
  assert.equal(look, 'ok')
  assert.deepEqual(asked, ['docs/adr/ADR-001-real/tasks'], `asked: ${asked}`)
  assert.deepEqual(lines.filter(line => line.includes('fixtures')), [], lines.join(' | '))
})
