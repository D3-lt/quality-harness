// ADR-092: one definition of a record. Every row of tests/fixtures/record-recognition.json is laid
// out in a fresh repository and read by the readers its columns name; each test asserts the columns
// its task made true, by exact equality over every row with a cell there, so a dropped row fails.
// The table holds the approved answers (ADR-092 Decision 6) and is never computed by a copy of the
// rule under test.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
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
// The line adr-lint prints when it linted a file: a verdict, never a crash, a timeout or a could-not-run.
const LINTED = /^\[(?:PASS|FAIL|UNPROVEN)\] /m

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
  'op, items = json.loads(sys.stdin.buffer.read().decode("utf-8"))',  // Windows' stdin is cp1252, rows are not ASCII
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

// adr-lint's verdict on one path: `recognised` only when it exited 0 or 1 AND printed its verdict line,
// `not-recognised` for exit 2 and its sentence, and otherwise what went wrong, so a crash, a timeout or a
// could-not-run is never a row's `recognised` (a gpt-6.1-sol review of ADR-092's execution, finding 18).
// `gate` and `timeout` are seams the helper's own test sets.
function lint(cwd, path, { gate = adrLint, timeout = 120_000 } = {}) {
  const r = runPython([gate, path], { cwd, encoding: 'utf8', timeout })
  const verdict = r.error || r.signal ? 'did-not-finish'
    : r.status === 2 ? (NOT_RECOGNISED.test(r.stdout) ? 'not-recognised' : 'could-not-run')
    : (r.status === 0 || r.status === 1) && LINTED.test(r.stdout) ? 'recognised' : 'no-verdict'
  return { verdict, exit: r.status, out: `${r.stdout}\n${r.stderr}` }
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

// ADR-092 T2: every Python reader asks the one definition, and reads only regular text files.
const adrRetireCheck = join(repoRoot, 'plugin', 'bin', 'adr-retire-check')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const unlistable = join(repoRoot, 'tests', 'helpers', 'unlistable.py')
const okFixture = join(repoRoot, 'tests', 'fixtures', 'ok')
const COULD_NOT_RUN = /could not run: /
const NOT_TEXT = /not text/
const DUPLICATE_ONE_FILE = /exists 2 times across active\/archive roots \(([^)]*) are one file on disk\)/
const UNIDENTIFIED_ADVICE = /advice: (\S+): is recognised as a record but carries no ADR number and no dated name/g
const DIRECTORY_USAGE = /expected a record FILE, got a directory/
const NOT_REGULAR = /not a regular file/
const NUL_FINDING = /holds NUL bytes/
const NOT_RECOGNISED_OWNER = /not recognised as a record/
const onWindows = process.platform === 'win32'

// adr-retire-check's module, loaded the way the tests already load it (tests/status-section.test.mjs),
// asked one question; a could-not-run comes back as `exit` with what it said on stderr.
const RETIRE_PY = [
  'import contextlib, importlib.machinery, importlib.util, io, json, pathlib, sys',
  "loader = importlib.machinery.SourceFileLoader('adr_retire_check', sys.argv[1])",
  "module = importlib.util.module_from_spec(importlib.util.spec_from_loader('adr_retire_check', loader))",
  'loader.exec_module(module)',
  'op, args = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
  'err = io.StringIO()',
  'try:',
  '    with contextlib.redirect_stderr(err):',
  '        if op == "files":',
  '            unidentified = []',
  '            found = module.adr_files(pathlib.Path(args), unidentified)',
  '            out = {"records": {k: [p.as_posix() for p in v] for k, v in found.items()},',
  '                   "unidentified": [p.as_posix() for p in unidentified]}',
  '        elif op == "status":',
  '            out = {"status": module.status_of(pathlib.Path(args))}',
  '        elif op == "obligations":',
  '            out = {"obligations": dict(module.meaningful_obligations(pathlib.Path(args)))}',
  '        elif op == "attribution":',
  '            out = {"ids": [module.adr_id_for_file(pathlib.Path(f), pathlib.Path(args[0])) for f in args[1]]}',
  '        else:',
  '            out = {"digest": module.decision_unit_digest(pathlib.Path(args[0]), args[1], pathlib.Path(args[2]))}',
  'except SystemExit as stop:',
  '    out = {"exit": stop.code}',
  'out["stderr"] = err.getvalue()',
  'print(json.dumps(out))',
].join('\n')
function retire(cwd, op, args) {
  const r = runPython(['-c', RETIRE_PY, adrRetireCheck], { cwd, input: JSON.stringify([op, args]), encoding: 'utf8', timeout: 20_000 })
  assert.notEqual(r.signal, 'SIGTERM', `adr-retire-check waited: ${op} ${JSON.stringify(args)}`)
  assert.equal(r.status, 0, `python could not run: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
// The adr-retire-check cell for one path under the answer `adr_files` gave its root.
function cellOf(answer, path) {
  if (answer.exit !== undefined) return { couldNotRun: answer.exit }
  const id = Object.keys(answer.records).find(key => answer.records[key].includes(path))
  if (id) return { counted: id }
  return answer.unidentified.includes(path) ? 'unidentified' : null
}
// The whole gate, as a corpus runs it.
const retireGate = (cwd, args) => runPython([adrRetireCheck, ...args], { cwd, encoding: 'utf8', timeout: 60_000 })

// A task adr-next can read, done or ready, under a record directory.
const taskText = id => `# Task ${id}: do ${id}\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n`
  + `## Acceptance\n\n\`\`\`bash\nprintf ${id}\n\`\`\`\n\n## Verification Log\n`
function owner(cwd, tasks) {
  const r = runPython([adrNext, '--json', tasks], { cwd, encoding: 'utf8', timeout: 20_000 })
  assert.notEqual(r.signal, 'SIGTERM', `adr-next waited on ${tasks}`)
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  const answer = JSON.parse(r.stdout)
  return { status: answer.status, unreadable: answer.owner_unreadable, missing: answer.owner_missing, because: answer.owner_unreadable_because ?? null }
}

// Git Bash's mkfifo on Windows exits 0 and makes no FIFO (tests/irregular-task-entry.test.mjs).
const fifo = path => spawnSync('mkfifo', [path], { timeout: 10_000, windowsHide: true }).status === 0
  && (() => { try { return lstatSync(path).isFIFO() } catch { return false } })()

// Each file a layout lists added to git; an `absent` one then removed from disk, an `unlisted`
// one never added.
function tracked(files, under) {
  const laid = layOut(files, under)
  if (!laid) return null
  for (const file of files) {
    if (file.unlisted || file.path.startsWith('outside/')) continue
    assert.equal(spawnSync('git', ['add', '--', file.path], { cwd: laid.repo, timeout: 30_000, windowsHide: true }).status, 0, file.path)
  }
  for (const file of files) if (file.absent) unlinkSync(join(laid.repo, ...file.path.split('/')))
  return laid
}

test('adr-retire-check counts the identified records and advises on every other recognised one', () => {
  const { repo, at } = plainRows(plainIds)
  const roots = [...new Set(plainIds.map(id => (rowById[id].subject ?? rowById[id].files[0].path).split('/')[0]))]
  const answers = Object.fromEntries(roots.map(root => [root, retire(repo, 'files', root)]))
  const said = Object.fromEntries(plainIds.map(id => {
    const path = rowById[id].subject ?? rowById[id].files[0].path
    return [id, cellOf(answers[path.split('/')[0]], path)]
  }))
  assert.deepStrictEqual(said, column(plainIds, 'adrRetireCheck'))
  assert.ok(at.R6)
  // Layout L6: tracked and absent from disk, so no walk sees them.
  const l6 = tracked(LAYOUTS.L6.files)
  const gone = LAYOUTS.L6.files.map(file => file.path)
  assert.deepStrictEqual(gone.map(path => cellOf(retire(l6.repo, 'files', path.split('/')[0]), path)), gone.map(() => LAYOUTS.L6.adrRetireCheck))
  // The advice names every recognised record without identity, the name arm included.
  const { repo: adopt } = layOut([
    { path: 'docs/adr/README.md', text: '# Decisions\n' },
    { path: 'docs/adr/ADR-12345-x.md', text: '# ADR-12345: X\n' },
    { path: 'docs/adr/spec-01-x.md', text: 'Status: Accepted\n' },
    { path: 'docs/adr/decision.md', text: '**Status:** Accepted\n\n## Decision\n\nx\n' },
    { path: 'docs/adr-archive/README.md', text: '# Archive\n' },
  ])
  const report = retireGate(adopt, ['--adopt', 'docs/adr', 'docs/adr-archive'])
  assert.deepStrictEqual([...report.stdout.matchAll(UNIDENTIFIED_ADVICE)].map(m => m[1]).sort(),
    ['adr/ADR-12345-x.md', 'adr/decision.md', 'adr/spec-01-x.md'], report.stdout)
})

test('adr-retire-check counts a .MD record and its obligations', () => {
  const record = '# ADR-001: X\n\n**Status:** Withdrawn\n\n## Decision\n\nx\n\n## Out of Scope\n\n- a thing (deferred: ../adr/BACKLOG.md)\n'
  for (const name of ['ADR-001-x.MD', 'ADR-001-x.md']) {
    const { repo } = layOut([{ path: `archive/${name}`, text: record }])
    assert.deepStrictEqual(retire(repo, 'obligations', 'archive').obligations, { 'ADR-001': 1 }, name)
    assert.deepStrictEqual(retire(repo, 'files', 'archive').records, { 'ADR-001': [`archive/${name}`] }, name)
  }
})

test('adr-next does not take an unrecognised file for a decided owner', () => {
  const tasks = 'docs/decisions/001-note/tasks'
  const r5 = layOut([...rowById.R5.files.filter(file => !file.path.includes('/tasks/')), { path: `${tasks}/T1-a.md`, text: taskText('T1') }])
  const unrecognised = owner(r5.repo, tasks)
  assert.deepStrictEqual([unrecognised.status, unrecognised.unreadable, unrecognised.missing], [null, true, false])
  assert.match(unrecognised.because, NOT_RECOGNISED_OWNER)
  const twin = layOut([{ path: 'docs/decisions/001-note.md', text: 'Status: Accepted\n\n## Decision\n\nx\n' }, { path: `${tasks}/T1-a.md`, text: taskText('T1') }])
  const decided = owner(twin.repo, tasks)
  assert.deepStrictEqual([decided.status, decided.unreadable, decided.missing], ['Accepted', false, false])
  const directory = layOut([{ path: 'docs/decisions/001-note.md', notRegular: true }, { path: `${tasks}/T1-a.md`, text: taskText('T1') }])
  const found = owner(directory.repo, tasks)
  assert.deepStrictEqual([found.status, found.unreadable, found.missing], [null, true, false])
  assert.match(found.because, NOT_REGULAR)
})

test('no Python reader reads a path that is not a regular file as a record', () => {
  const { repo } = layOut([...LAYOUTS.L5.files, { path: 'docs/adr/ADR-005-x/tasks/T1-a.md', text: taskText('T1') }])
  const answer = retire(repo, 'files', 'docs')
  assert.equal(answer.exit, 2, JSON.stringify(answer))
  assert.match(answer.stderr, COULD_NOT_RUN)
  assert.ok(answer.stderr.includes('docs/adr/ADR-005-x.md'), answer.stderr)
  const next = owner(repo, 'docs/adr/ADR-005-x/tasks')
  assert.deepStrictEqual([next.unreadable, next.missing], [true, false])
  assert.match(next.because, NOT_REGULAR)
  const linted = lint(repo, 'docs/adr/ADR-005-x.md')
  assert.equal(linted.exit, LAYOUTS.L5.adrLint.directory.exit)
  assert.match(linted.out, DIRECTORY_USAGE)
})

test('no Python reader blocks on a FIFO named like a record', t => {
  const { repo } = layOut([{ path: 'docs/adr/ADR-005-x/tasks/T1-a.md', text: taskText('T1') }])
  if (!fifo(join(repo, 'docs', 'adr', 'ADR-005-x.md'))) { t.skip('a FIFO cannot be made here'); return }
  const linted = lint(repo, 'docs/adr/ADR-005-x.md')
  assert.equal(linted.exit, LAYOUTS.L5.adrLint.fifo.exit)
  assert.match(linted.out, NOT_REGULAR)
  const answer = retire(repo, 'files', 'docs')
  assert.equal(answer.exit, 2, JSON.stringify(answer))
  assert.ok(answer.stderr.includes('docs/adr/ADR-005-x.md'), answer.stderr)
  const next = owner(repo, 'docs/adr/ADR-005-x/tasks')
  assert.deepStrictEqual([next.unreadable, next.missing], [true, false])
})

test('no Python reader reads a record holding a NUL byte as text', () => {
  const { repo } = layOut([...LAYOUTS.L9.files, { path: 'docs/adr/ADR-009-x/tasks/T1-a.md', text: taskText('T1') }])
  for (const answer of [retire(repo, 'files', 'docs'), retire(repo, 'status', 'docs/adr/ADR-009-x.md')]) {
    assert.equal(answer.exit, 2, JSON.stringify(answer))
    assert.match(answer.stderr, NOT_TEXT)
    assert.ok(answer.stderr.includes('docs/adr/ADR-009-x.md'), answer.stderr)
  }
  const next = owner(repo, 'docs/adr/ADR-009-x/tasks')
  assert.deepStrictEqual([next.status, next.unreadable], [null, true])
  const linted = lint(repo, 'docs/adr/ADR-009-x.md')
  assert.equal(linted.exit, LAYOUTS.L9.adrLint.exit)
  assert.match(linted.out, NUL_FINDING)
})

test('every adr-retire-check walk names a directory it could not list', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'qh-record-recognition-unlisted-'))
  temps.push(scratch)
  cpSync(okFixture, scratch, { recursive: true })
  for (const dir of ['adr/sub', 'adr-archive/sub', 'adr-archive/ADR-001-notes']) mkdirSync(join(scratch, ...dir.split('/')), { recursive: true })
  const clean = retireGate(scratch, ['adr-archive/README.md'])
  assert.equal(clean.status, 0, clean.stdout + clean.stderr)
  for (const dir of ['adr/sub', 'adr-archive/sub', 'adr-archive/ADR-001-notes']) {
    const r = runPython([unlistable, adrRetireCheck, dir, 'adr-archive/README.md'], { cwd: scratch, encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 2, `${dir}: ${r.stdout}${r.stderr}`)
    assert.match(r.stderr, COULD_NOT_RUN, dir)
    assert.ok(r.stderr.includes(dir), `${dir}: ${r.stderr}`)
  }
})

test('the link rows read their approved answers in adr-retire-check', t => {
  const r1 = rowById.R1
  const laid = layOut(r1.files, r1.repositoryUnder)
  if (!laid) { t.skip('a symbolic link cannot be made here'); return }
  assert.deepStrictEqual(cellOf(retire(laid.repo, 'files', 'adr'), r1.subject), r1.adrRetireCheck)
  for (const id of ['L1', 'L7', 'L8', 'L10']) {
    const layout = LAYOUTS[id]
    const { repo } = layOut(layout.files)
    const said = []
    for (const expected of [layout.adrRetireCheck ?? { root: 'docs', answer: null }].flat()) {
      const answer = retire(repo, 'files', expected.root)
      const cells = layout.files.map(file => file.path).filter(path => path.startsWith(`${expected.root}/`)).map(path => cellOf(answer, path)).filter(Boolean)
      said.push({ root: expected.root, answer: cells.length ? cells[0] : null })
    }
    assert.deepStrictEqual(said, [layout.adrRetireCheck ?? { root: 'docs', answer: null }].flat(), id)
  }
  for (const id of ['L2', 'L3']) {
    const { repo } = layOut([...LAYOUTS[id].files, { path: 'docs/adr/README.md', text: '# Decisions\n' }, { path: 'docs/adr-archive/README.md', text: '# Archive\n' }])
    const report = retireGate(repo, ['--adopt', 'docs/adr', 'docs/adr-archive'])
    const named = report.stdout.match(DUPLICATE_ONE_FILE)
    assert.ok(named, `${id}: ${report.stdout}`)
    assert.ok(report.stdout.includes(`${LAYOUTS[id].adrRetireCheck.answer.duplicate} exists 2 times`), report.stdout)
    for (const path of LAYOUTS[id].adrRetireCheck.answer.oneFile) assert.ok(named[1].includes(path.slice('docs/'.length)), `${id}: ${named[1]}`)
  }
  const l4 = tracked(LAYOUTS.L4.files)
  assert.deepStrictEqual(retire(l4.repo, 'files', '.').records, {})
})

test('adr-retire-check names a chmod 000 directory', t => {
  if (onWindows) { t.skip('chmod 000 does not stop a listing on Windows'); return }
  if (process.getuid?.() === 0) { t.skip('root lists a chmod 000 directory anyway'); return }
  const { repo } = layOut([{ path: 'docs/adr/ADR-001-x.md', text: 'Status: Accepted\n\n## Decision\n\nx\n' }, { path: 'docs/adr/locked/ADR-002-x.md', text: 'Status: Accepted\n' }])
  const locked = join(repo, 'docs', 'adr', 'locked')
  chmodSync(locked, 0o000)
  try {
    const answer = retire(repo, 'files', 'docs')
    assert.equal(answer.exit, 2, JSON.stringify(answer))
    assert.ok(answer.stderr.includes('docs/adr/locked'), answer.stderr)
  } finally {
    chmodSync(locked, 0o755)
  }
})

test('a binary attachment is still attributed and sealed', () => {
  const record = id => `# ${id}: X\n\n**Status:** Withdrawn\n\n## Decision\n\nx\n`
  const binary = 'PNG\u0000image'
  const { repo } = layOut([
    { path: 'docs/adr/README.md', text: '# Decisions\n' },
    { path: 'docs/adr-archive/ADR-001-x.md', text: record('ADR-001') },
    { path: 'docs/adr-archive/notes-ADR-001.png', text: binary },
    { path: 'docs/adr-archive/ADR-002-x/ADR-002-x.md', text: record('ADR-002') },
    { path: 'docs/adr-archive/ADR-002-x/diagram.png', text: binary },
  ])
  const archive = 'docs/adr-archive'
  assert.deepStrictEqual(retire(repo, 'attribution', [archive, [`${archive}/notes-ADR-001.png`, `${archive}/ADR-002-x/diagram.png`]]).ids, ['ADR-001', 'ADR-002'])
  const seal = (id, source) => retire(repo, 'digest', [archive, id, `${archive}/${source}`]).digest
  const before = [seal('ADR-001', 'ADR-001-x.md'), seal('ADR-002', 'ADR-002-x/ADR-002-x.md')]
  const row = (id, link, digest) => `| [${id}](${link}) | X | withdrawn | 2026-10-07 | superseded in practice | none | ${digest} |`
  writeFileSync(join(repo, ...archive.split('/'), 'README.md'), ['# Archive', '', '**Lifecycle:** Frozen historical ADR records', '**Active corpus:** ../adr', '',
    '## Retired Records', '', '| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |', '|-----|-------|-----------------|---------|--------|-------------|---------|',
    row('ADR-001', 'ADR-001-x.md', before[0]), row('ADR-002', 'ADR-002-x/ADR-002-x.md', before[1]), ''].join('\n'))
  const passed = retireGate(repo, [`${archive}/README.md`])
  assert.equal(passed.status, 0, passed.stdout + passed.stderr)
  writeFileSync(join(repo, ...archive.split('/'), 'notes-ADR-001.png'), `${binary}2`)
  writeFileSync(join(repo, ...archive.split('/'), 'ADR-002-x', 'diagram.png'), `${binary}2`)
  const after = [seal('ADR-001', 'ADR-001-x.md'), seal('ADR-002', 'ADR-002-x/ADR-002-x.md')]
  assert.notEqual(after[0], before[0])
  assert.notEqual(after[1], before[1])
})

test('the lint helper calls nothing recognised that did not lint the file', () => {
  // A gpt-6.1-sol review of ADR-092's execution (finding 18): every result but the not-recognised
  // sentence was `recognised`, so a row whose adr-lint run crashed, timed out or could not run passed.
  const { repo, at } = plainRows(['R3'])
  assert.equal(lint(repo, at.R3).verdict, 'recognised')
  const stubs = layOut([
    { path: 'crash.py', text: 'raise RuntimeError("boom")\n' },
    { path: 'could-not-run.py', text: 'import sys\nprint("[adr-lint] could not run: x", file=sys.stderr)\nsys.exit(2)\n' },
    { path: 'silent.py', text: 'pass\n' },
  ], 'stubs').repo
  const said = Object.fromEntries(['crash', 'could-not-run', 'silent'].map(name => [name, lint(repo, at.R3, { gate: join(stubs, `${name}.py`) }).verdict]))
  said.timeout = lint(repo, at.R3, { timeout: 1 }).verdict
  for (const [how, verdict] of Object.entries(said)) assert.notEqual(verdict, 'recognised', how)
})
