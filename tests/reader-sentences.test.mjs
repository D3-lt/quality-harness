// BACKLOG §350 C8, untrue sentences five Windows corpus-chaos runs of 3.8.3 found, and §350 C5's
// fixture specs. Each test asserts the sentence a reader now says and the absence of the old one.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { observe } from '../plugin/scripts/work-next.mjs'
import { gate } from './load-gate.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-reader-sentences-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const utf16 = text => Buffer.from(`﻿${text}`, 'utf16le')
const repo = name => {
  const dir = path.join(scratch, name)
  mkdirSync(path.join(dir, 'docs', 'adr'), { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  return dir
}
const lint = (cwd, ...args) => spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-lint'), ...args],
  { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
// The selftest's conforming record, with its Spec pointer cut, so nothing else can be said about it.
const conforming = readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'ok', 'ADR-001-selftest.md'), 'utf8')
  .replace(/^\*\*Spec:\*\*.*$/m, '**Spec:** None — no spec stage')

test('adr-state says a superseding record could not be read, not that it is absent', () => {
  const root = repo('superseder')
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Superseded by ADR-002\n\n## Context\n\nx\n')
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-002-y.md'), 'a\0b')
  const state = (...flags) => spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs'), ...flags, root],
    { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const text = state().stdout
  assert.match(text, /Superseded by a record that could not be read:\n {2}ADR-001 .* → ADR-002 \(/, text)
  assert.doesNotMatch(text, /not in this corpus/, text)
  const json = JSON.parse(state('--json').stdout)
  assert.deepEqual(json.danglingSupersession, [])
  assert.equal(json.supersededByUnreadable[0]?.target, 'ADR-002')
})

test('the long-path advice never prints a negative length', () => {
  const said = rel => gate('lint = load("adr-lint")\nerrs = lint.Findings()\nroot = Path(sys.argv[2])\n'
    + 'lint.check_task_path_length(root / sys.argv[3], root, errs)\nprint(json.dumps(errs.advice))', scratch, rel)
  const long = said(`docs/adr/${'a'.repeat(120)}/${'b'.repeat(120)}/tasks/T1-x.md`)
  assert.equal(long.length, 1, long.join('\n'))
  assert.match(long[0], /past MAX_PATH 260 on its own, so no checkout root can clone it without core\.longpaths/)
  assert.doesNotMatch(long[0], /longer than -\d/)
  const short = said(`docs/adr/${'a'.repeat(80)}/${'b'.repeat(60)}/tasks/T1-x.md`)
  assert.match(short[0], /a checkout root longer than \d+ characters cannot clone/)
})

test('adr-lint says nothing about the content of a record or task it called not UTF-8 text', () => {
  const root = repo('nul')
  const record = path.join(root, 'docs', 'adr', 'ADR-001-x.md')
  writeFileSync(record, utf16(conforming))
  const run = lint(root, record)
  assert.match(run.stdout, /ADR-001-x\.md: holds NUL bytes/, run.stdout)
  assert.doesNotMatch(run.stdout, /unproven:|missing section|Alternatives Considered|no \*\*Spec:\*\*/, run.stdout)
  // A task saved as UTF-16 under a readable record: the task's line is the NUL finding only.
  writeFileSync(record, conforming)
  const tasks = path.join(root, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(tasks, 'T1-x.md'), utf16(readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'ok', 'tasks', 'T1-fixture.md'), 'utf8')))
  writeFileSync(path.join(tasks, 'README.md'), '| Task | Status | Goal |\n|---|---|---|\n| T1 | pending | x |\n')
  const task = lint(root, record, tasks)
  const lines = task.stdout.split('\n').filter(line => /T1-x\.md/.test(line))
  assert.ok(lines.some(line => /holds NUL bytes/.test(line)), task.stdout)
  assert.ok(lines.every(line => /holds NUL bytes/.test(line)), lines.join('\n'))
})

test('a lowercase readme.md is the tasks README, never linted as a task', () => {
  const root = repo('readme')
  const record = path.join(root, 'docs', 'adr', 'ADR-001-x.md')
  writeFileSync(record, conforming)
  const tasks = path.join(root, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(tasks, 'T1-x.md'), readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'ok', 'tasks', 'T1-fixture.md'), 'utf8'))
  writeFileSync(path.join(tasks, 'readme.md'), '| Task | Status | Goal |\n|---|---|---|\n| T1 | pending | x |\n')
  const run = lint(root, record, tasks)
  assert.doesNotMatch(run.stdout, /^ {2}(?:advice: )?readme\.md: /m, run.stdout)
  assert.doesNotMatch(run.stdout, /no README\.md/i, run.stdout)
})

test("work-next does not count fixture or golden specs as the corpus's own", () => {
  const root = repo('specs')
  for (const rel of ['tests/fixtures/x/docs/specs/a.md', 'tests/golden-y/docs/specs/b.md', 'docs/specs/c.md']) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), '# Spec\n\nno status\n')
  }
  const listing = ['tests/fixtures/x/docs/specs/a.md', 'tests/golden-y/docs/specs/b.md', 'docs/specs/c.md']
  const state = observe(root, { spawn: () => ({ status: 3, stdout: '{}', stderr: '' }), listing })
  assert.equal(state.specs, 1, JSON.stringify(state))
  assert.deepEqual(state.unprovenSpecs.map(file => path.relative(root, file).split(path.sep).join('/')), ['docs/specs/c.md'])
})
