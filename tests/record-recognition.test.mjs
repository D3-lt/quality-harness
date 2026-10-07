// ADR-092: one definition of a record. Every row of tests/fixtures/record-recognition.json is laid
// out in a fresh repository and read by the readers its columns name; each test asserts the columns
// its task made true, by exact equality over every row with a cell there, so a dropped row fails.
// The table holds the approved answers (ADR-092 Decision 6) and is never computed by a copy of the
// rule under test.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(repoRoot, 'plugin', 'lib')
const adrLint = join(repoRoot, 'plugin', 'bin', 'adr-lint')
const TABLE = JSON.parse(readFileSync(join(repoRoot, 'tests', 'fixtures', 'record-recognition.json'), 'utf8'))
const ROWS = TABLE.rows
const LAYOUTS = Object.fromEntries(TABLE.layouts.map(layout => [layout.id, layout]))
const rowById = Object.fromEntries(ROWS.map(row => [row.id, row]))

// Patterns live at module scope, never inside a test body (adr-execute lessons, 2026-09-16).
const NOT_RECOGNISED = /^not-recognised: /m
const MISMATCH = /filename names ADR-\d+ and the title names ADR-\d+/

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

// The text a file spec describes.
function textOf(file) {
  if (file.gen) {
    const { before = '', repeat, bytes, then = '' } = file.gen
    return before + repeat.repeat(Math.ceil(bytes / repeat.length)) + then
  }
  return file.text ?? ''
}

// Lays `files` out in a fresh repository under a fresh scratch directory and returns both. A path
// starting `outside/` goes beside the repository, in its parent directory. Git runs only in a
// directory this file made (CLAUDE.md §9). Returns null when a link cannot be made (Windows EPERM).
function layOut(files, under = 'repo') {
  const scratch = mkdtempSync(join(tmpdir(), 'qh-record-recognition-'))
  temps.push(scratch)
  const repo = join(scratch, ...under.split('/'))
  mkdirSync(repo, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const base = path => (path.startsWith('outside/') ? join(dirname(repo), ...path.split('/')) : join(repo, ...path.split('/')))
  for (const file of files) {
    const at = base(file.path)
    mkdirSync(dirname(at), { recursive: true })
    if (file.link) {
      try { symlinkSync(file.link, at) } catch (error) { if (error.code === 'EPERM') return null; throw error }
    } else if (file.notRegular) {
      mkdirSync(at)
    } else {
      writeFileSync(at, file.nul ? `${textOf(file)}\u0000` : textOf(file))
    }
  }
  return { scratch, repo }
}

// One Python process per question. `recognise` answers recognised_as_record, record_status and
// record_id (with title_line) for absolute paths, each with its git root; `eligible` answers
// corpus_eligible for relative paths.
const PY = [
  'import json, sys',
  'from pathlib import Path',
  'sys.path.insert(0, sys.argv[1])',
  'import record',
  'op, items = json.load(sys.stdin)',
  'out = []',
  'for item in items:',
  '    if op == "eligible":',
  '        out.append(record.corpus_eligible(item))',
  '        continue',
  '    path = Path(item)',
  '    text = path.read_text(encoding="utf-8", errors="replace")',
  '    recognised = record.recognised_as_record(path, text, record.git_root(path.parent))[0]',
  '    out.append({"recognised": recognised, "status": record.record_status(text)[0],',
  '                "identity": record.record_id(path.name, record.title_line(text))})',
  'print(json.dumps(out))',
].join('\n')
function python(op, items) {
  const r = runPython(['-c', PY, lib], { input: JSON.stringify([op, items]), encoding: 'utf8', timeout: 120_000 })
  assert.equal(r.status, 0, `python could not run: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

// adr-lint's verdict on one path: `recognised`, or `not-recognised` (exit 2 and its sentence).
function lint(cwd, path) {
  const r = runPython([adrLint, path], { cwd, encoding: 'utf8', timeout: 120_000 })
  return { verdict: r.status === 2 && NOT_RECOGNISED.test(r.stdout) ? 'not-recognised' : 'recognised', exit: r.status, out: `${r.stdout}\n${r.stderr}` }
}

// Every plain row (no link, no repository of its own) in one repository: row id → absolute path.
function plainRows(ids) {
  const rows = ids.map(id => rowById[id])
  const { repo } = layOut(rows.flatMap(row => row.files))
  return { repo, at: Object.fromEntries(rows.map(row => [row.id, join(repo, ...(row.subject ?? row.files[0].path).split('/'))])) }
}
const plainIds = ROWS.filter(row => row.id !== 'R1').map(row => row.id)
const column = (ids, name) => Object.fromEntries(ids.map(id => [id, rowById[id][name]]))

test('every row of the recognition table reads its approved answer in record.py and adr-lint', () => {
  const { repo, at } = plainRows(plainIds)
  const answers = python('recognise', plainIds.map(id => at[id]))
  const read = name => Object.fromEntries(plainIds.map((id, index) => [id, answers[index][name]]))
  assert.deepStrictEqual(read('recognised'), column(plainIds, 'recognised'))
  assert.deepStrictEqual(read('status'), column(plainIds, 'status'))
  assert.deepStrictEqual(read('identity'), column(plainIds, 'identity'))
  const verdicts = Object.fromEntries(plainIds.map(id => [id, lint(repo, at[id]).verdict]))
  const approved = Object.fromEntries(plainIds.map(id => [id, rowById[id].recognised ? 'recognised' : 'not-recognised']))
  assert.deepStrictEqual(verdicts, approved)
})

test('the link rows read their approved answers in record.py and adr-lint', t => {
  const r1 = rowById.R1
  const laid = layOut(r1.files, r1.repositoryUnder)
  if (!laid) { t.skip('a symbolic link cannot be made here'); return }
  const absolute = join(laid.repo, ...r1.subject.split('/'))
  const [answer] = python('recognise', [absolute])
  assert.deepStrictEqual(answer, { recognised: r1.recognised, status: r1.status, identity: r1.identity })
  assert.equal(lint(laid.repo, r1.subject).verdict, 'recognised')
  assert.equal(lint(laid.repo, absolute).verdict, 'recognised')
  for (const id of ['L7', 'L8', 'L10']) {
    const layout = LAYOUTS[id]
    const { repo } = layOut(layout.files)
    const paths = Object.keys(layout.adrLint)
    const said = Object.fromEntries(paths.map(path => [path, lint(repo, path).verdict]))
    assert.deepStrictEqual(said, layout.adrLint, id)
    const py = python('recognise', paths.map(path => join(repo, ...path.split('/'))))
    assert.deepStrictEqual(Object.fromEntries(paths.map((path, index) => [path, py[index].recognised ? 'recognised' : 'not-recognised'])), layout.adrLint, id)
  }
})

test('a templates directory admits no record by either arm and the same file outside it is judged as any other', () => {
  const { repo, at } = plainRows(['R27', 'R28', 'R29'])
  mkdirSync(join(repo, 'docs', 'adr'), { recursive: true })
  const copy = join(repo, 'docs', 'adr', 'ADR-001-x.md')
  writeFileSync(copy, textOf(rowById.R29.files[0]))
  const py = python('recognise', [at.R27, at.R28, at.R29, copy]).map(answer => answer.recognised)
  assert.deepStrictEqual(py, [false, true, false, true])
  assert.deepStrictEqual([at.R27, at.R28, at.R29, copy].map(path => lint(repo, path).exit), [2, 1, 2, 1])
  assert.deepStrictEqual([at.R27, at.R29].map(path => lint(repo, path).verdict), ['not-recognised', 'not-recognised'])
})

test('corpus eligibility is one rule in record.py', () => {
  const ids = ROWS.map(row => row.id)
  const paths = ids.map(id => rowById[id].subject ?? rowById[id].files[0].path)
  const answers = python('eligible', paths)
  assert.deepStrictEqual(Object.fromEntries(ids.map((id, index) => [id, answers[index]])), column(ids, 'eligible'))
  assert.deepStrictEqual(python('eligible', ['docs\\adr\\ADR-001-x.md', 'docs\\adr\\tasks\\ADR-001-x.md', 'docs/Templates/x.md', 'docs/adr/x.txt']), [true, false, false, false])
})

test('a fenced example is not a discriminator', () => {
  const { repo, at } = plainRows(['R37', 'R38', 'R39'])
  assert.deepStrictEqual(python('recognise', [at.R37, at.R38, at.R39]).map(answer => answer.recognised), [false, false, true])
  assert.deepStrictEqual([at.R37, at.R38, at.R39].map(path => lint(repo, path).verdict), ['not-recognised', 'not-recognised', 'recognised'])
})

test('one title reading decides identity and adr-lint finds no false mismatch', () => {
  const { repo, at } = plainRows(['R40', 'R41'])
  assert.deepStrictEqual(python('recognise', [at.R40, at.R41]).map(answer => answer.identity), ['ADR-040', 'ADR-041'])
  for (const id of ['R40', 'R41']) assert.doesNotMatch(lint(repo, at[id]).out, MISMATCH, id)
  // The same check says dirty: a real title that disagrees with the name is still a mismatch.
  const wrong = join(repo, 'docs', 'adr', 'ADR-042-x.md')
  writeFileSync(wrong, '# ADR-043: X\n\nStatus: Accepted\n\n## Decision\n\nx\n')
  assert.match(lint(repo, wrong).out, MISMATCH)
})
