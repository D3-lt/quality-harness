// Every special or unreadable file or child directory a Python reader meets is NAMED as could-not-look,
// never dropped and never reported missing, and no reader opens one with a blocking read. Found by a
// gpt-6.1-sol review of ADR-092's execution (2026-10-07, findings 1, 6-11 and 17), each asserted here
// through the function or the gate the finding named, in a directory this file made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gate = name => join(repoRoot, 'plugin', 'bin', name)
const recordPy = join(repoRoot, 'plugin', 'lib', 'record.py')
const onWindows = process.platform === 'win32'
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

// A fresh directory holding `files` ({path: text}); `repo` makes it a git repository.
function tree(files, { repo = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-special-files-'))
  temps.push(dir)
  if (repo) assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true }).status, 0)
  for (const [path, text] of Object.entries(files)) {
    const at = join(dir, ...path.split('/'))
    mkdirSync(dirname(at), { recursive: true })
    writeFileSync(at, text)
  }
  return dir
}
// Git Bash's mkfifo on Windows exits 0 and makes no FIFO (tests/irregular-task-entry.test.mjs).
function fifo(dir, path) {
  const at = join(dir, ...path.split('/'))
  mkdirSync(dirname(at), { recursive: true })
  return spawnSync('mkfifo', [at], { timeout: 10_000, windowsHide: true }).status === 0
    && (() => { try { return lstatSync(at).isFIFO() } catch { return false } })()
}

// One expression evaluated against a gate's module (`module`), with `Path` and `json` in scope: its
// value, or the exit it raised, and what it printed. In a child with a timeout, so a blocking read is a
// finding this file reports rather than a hung suite.
const CALL = [
  'import contextlib, importlib.machinery, importlib.util, io, json, sys',
  'from pathlib import Path',
  "loader = importlib.machinery.SourceFileLoader('gate_under_test', sys.argv[1])",
  "module = importlib.util.module_from_spec(importlib.util.spec_from_loader('gate_under_test', loader))",
  'loader.exec_module(module)',
  'expression = sys.stdin.read()',
  'out, err = io.StringIO(), io.StringIO()',
  'result = {}',
  'try:',
  '    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):',
  '        result["value"] = eval(expression, {"module": module, "Path": Path, "json": json})',
  'except SystemExit as stop:',
  '    result["exit"] = stop.code',
  'result["stdout"], result["stderr"] = out.getvalue(), err.getvalue()',
  'print(json.dumps(result, default=str))',
].join('\n')
function call(script, expression, cwd) {
  const r = runPython(['-c', CALL, script], { cwd, input: expression, encoding: 'utf8', timeout: 30_000 })
  assert.equal(r.signal, null, `${expression}: the call did not finish (a blocking read?)`)
  assert.equal(r.status, 0, `python could not run: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const run = (script, args, cwd) => {
  const r = runPython([script, ...args], { cwd, encoding: 'utf8', timeout: 30_000 })
  assert.equal(r.signal, null, `${args.join(' ')}: the gate did not finish (a blocking read?)`)
  return r
}
const py = text => JSON.stringify(text)

test('a walk names a child directory it could not inspect', () => {
  const dir = tree({ 'a/b/x.md': 'x\n', 'c/y.md': 'y\n' })
  const failing = join(dir, 'a')
  const answer = call(recordPy, `(lambda unlisted: ([str(p) for p in module.walk(Path(${py(dir)}), unlisted=unlisted,
      inspect=lambda entry: (_ for _ in ()).throw(PermissionError(13, "denied", str(entry))) if str(entry) == ${py(failing)} else module.os.lstat(entry))],
      [str(p) for p in unlisted]))([])`)
  const [walked, unlisted] = answer.value
  assert.deepStrictEqual(unlisted, [failing])
  assert.ok(!walked.some(path => path.endsWith('x.md')), walked.join('\n'))
  assert.ok(walked.some(path => path.endsWith('y.md')), walked.join('\n'))
})

test('a walk names a child of a directory it may list but not search', t => {
  if (onWindows) { t.skip('a directory mode does not stop a stat on Windows'); return }
  if (process.getuid?.() === 0) { t.skip('root searches any directory'); return }
  const dir = tree({ 'p/q/z.md': 'z\n' })
  chmodSync(join(dir, 'p'), 0o444)
  try {
    const answer = call(recordPy, `(lambda unlisted: ([str(p) for p in module.walk(Path(${py(dir)}), unlisted=unlisted)], [str(p) for p in unlisted]))([])`)
    assert.deepStrictEqual(answer.value[1], [join(dir, 'p', 'q')])
  } finally {
    chmodSync(join(dir, 'p'), 0o755)
  }
})

test('adr-verify --sweep names a task that is not a regular file', t => {
  const dir = tree({ 'tasks/T1-x.md': '# Task T1: x\n' })
  if (!fifo(dir, 'tasks/T2-fifo.md')) { t.skip('a FIFO cannot be made here'); return }
  const answer = call(gate('adr-verify'), `module.sweep_corpus(${py(dir)}, as_json=True)`)
  assert.equal(answer.value, 1)
  const report = JSON.parse(answer.stdout)
  assert.deepStrictEqual(report.unread.map(path => path.split(/[\\/]/).pop()), ['T2-fifo.md'])
  // The twin: no special file, nothing named.
  const clean = tree({ 'tasks/T1-x.md': '# Task T1: x\n' })
  assert.deepStrictEqual(JSON.parse(call(gate('adr-verify'), `module.sweep_corpus(${py(clean)}, as_json=True)`).stdout).unread, [])
})

const withdrawn = id => `# ${id}: X\n\n**Status:** Withdrawn\n\n## Decision\n\nx\n`

test('an archive seal names a special attachment, in a unit directory and in a flat archive', t => {
  const unit = tree({ 'archive/ADR-001-x/ADR-001-x.md': withdrawn('ADR-001') })
  const flat = tree({ 'archive/ADR-002-x.md': withdrawn('ADR-002') })
  if (!fifo(unit, 'archive/ADR-001-x/drawing.png') || !fifo(flat, 'archive/notes-ADR-002.png')) { t.skip('a FIFO cannot be made here'); return }
  for (const [dir, id, source, special] of [[unit, 'ADR-001', 'ADR-001-x/ADR-001-x.md', 'drawing.png'], [flat, 'ADR-002', 'ADR-002-x.md', 'notes-ADR-002.png']]) {
    const answer = call(gate('adr-retire-check'), `module.decision_unit_digest(Path("archive"), ${py(id)}, Path(${py(`archive/${source}`)}))`, dir)
    assert.equal(answer.exit, 2, JSON.stringify(answer))
    assert.ok(answer.stderr.includes(special), answer.stderr)
  }
  // The twin: a regular attachment is sealed.
  const clean = tree({ 'archive/ADR-001-x/ADR-001-x.md': withdrawn('ADR-001'), 'archive/ADR-001-x/drawing.png': 'PNG' })
  assert.match(call(gate('adr-retire-check'), 'module.decision_unit_digest(Path("archive"), "ADR-001", Path("archive/ADR-001-x/ADR-001-x.md"))', clean).value, /^[0-9a-f]{64}$/)
})

test('an archive or active README that exists and is not a regular file is could-not-run, not missing', t => {
  const archive = tree({ 'docs/adr/README.md': '# Decisions\n' })
  const active = tree({ 'docs/adr-archive/README.md': '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n**Active corpus:** ../adr\n' })
  mkdirSync(join(active, 'docs', 'adr'), { recursive: true })
  if (!fifo(archive, 'docs/adr-archive/README.md') || !fifo(active, 'docs/adr/README.md')) { t.skip('a FIFO cannot be made here'); return }
  for (const [cwd, named] of [[archive, 'docs/adr-archive/README.md'], [active, 'docs/adr/README.md']]) {
    const r = run(gate('adr-retire-check'), ['docs/adr-archive/README.md'], cwd)
    assert.equal(r.status, 2, r.stdout + r.stderr)
    assert.match(r.stderr, /could not run: /)
    assert.ok(r.stderr.includes(named), r.stderr)
    assert.doesNotMatch(r.stdout, /not found|needs README\.md/)
  }
})

test('a Cargo binding to a test file that is not a regular file is could-not-check, not missing', t => {
  const dir = tree({ 'Cargo.toml': '[package]\nname = "x"\n', 'src/lib.rs': '#[test]\nfn other() {}\n' })
  if (!fifo(dir, 'tests/check.rs')) { t.skip('a FIFO cannot be made here'); return }
  for (const binding of ['tests/check.rs::test_case', 'test_case']) {
    const answer = call(gate('spec-verify'), `module.test_exists(${py(binding)}, Path(${py(dir)}), "cargo", False)`)
    assert.equal(answer.value[0], null, `${binding}: ${JSON.stringify(answer.value)}`)
    assert.match(answer.value[1], /not a regular file/, binding)
  }
})

test('arch-lint and adr-lint never open a FIFO they were pointed at or walked into', t => {
  const dir = tree({ 'docs/adr/ADR-001-x.md': withdrawn('ADR-001') }, { repo: true })
  if (!fifo(dir, 'docs/architecture.md') || !fifo(dir, 'docs/adr/ADR-002-x.md')) { t.skip('a FIFO cannot be made here'); return }
  const arch = run(gate('arch-lint'), ['docs/architecture.md'], dir)
  assert.equal(arch.status, 2, arch.stdout + arch.stderr)
  assert.match(arch.stderr, /could not run: .*not a regular file/)
  // A corpus enumeration that cannot read one of its files has not looked: could-not-look, never a block.
  const tracked = ['docs/adr/ADR-001-x.md', 'docs/adr/ADR-002-x.md']
  const answer = call(gate('adr-lint'), `module.record_files(Path(${py(dir)}), Path(${py(join(dir, 'docs', 'adr'))}), ${py(tracked)})`)
  assert.equal(answer.value, null, JSON.stringify(answer))
})

test('adr-next reads a task named .MD', () => {
  const dir = tree({
    'docs/adr/ADR-001-x.md': '# ADR-001: X\n\n**Status:** Accepted\n\n## Decision\n\nx\n',
    'docs/adr/ADR-001-x/tasks/T1-a.MD': '# Task T1: do T1\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n## Acceptance\n\n```bash\nprintf T1\n```\n\n## Verification Log\n',
  }, { repo: true })
  const r = run(gate('adr-next'), ['--json', 'docs/adr/ADR-001-x/tasks'], dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /T1/)
})

test('adr-next answers three values for a tasks directory at the filesystem root', () => {
  const answer = call(gate('adr-next'), 'list(module.owning_record(Path(Path.cwd().anchor) / "tasks"))')
  assert.deepStrictEqual(answer.value, [false, null, null])
})

test('adr-lint enumerates a corpus by the one definition', () => {
  const dir = tree({
    'docs/adr/001-note.md': 'Status: Accepted\n',
    'docs/adr/001-note/tasks/T1-x.md': '# Task ADR-001-T1: x\n',
    'docs/adr/foo.md': '# ADR-005: X\n\nStatus: Accepted\n\n## Decision\n\nx\n',
    'docs/adr/foo/tasks/T1-y.md': '# Task ADR-005-T1: y\n',
  }, { repo: true })
  const tracked = ['docs/adr/001-note.md', 'docs/adr/001-note/tasks/T1-x.md', 'docs/adr/foo.md', 'docs/adr/foo/tasks/T1-y.md']
  const corpus = join(dir, 'docs', 'adr')
  const files = call(gate('adr-lint'), `[(Path(path).name, number) for path, number in module.record_files(Path(${py(dir)}), Path(${py(corpus)}), ${py(tracked)})]`)
  assert.deepStrictEqual(files.value, [['foo.md', 5]])
  const resolved = call(gate('adr-lint'), `[module.resolve_qualified_dep(pointer, Path(${py(dir)}), Path(${py(corpus)}), ${py(tracked)}) for pointer in ("ADR-001-T1", "ADR-005-T1")]`)
  assert.deepStrictEqual(resolved.value, [false, true])
})

// The last review round of ADR-092's fixes (gpt-6.1-sol, 2026-10-07): the enumeration above read a record
// through `read_regular`, so a NUL-bearing file the record reader refuses was counted and its dependency
// resolved, where v3.8.10 counted nothing and resolved False (a fail-open these fixes introduced).
test('adr-lint counts no record its record reader refuses as text', () => {
  const dir = tree({
    'docs/adr/foo.md': '# ADR-005: X\n\nStatus: Accepted\n\n## Decision\n\nx\u0000y\n',
    'docs/adr/foo/tasks/T1-y.md': '# Task ADR-005-T1: y\n',
    'docs/adr/bar.md': '# ADR-006: Y\n\nStatus: Accepted\n\n## Decision\n\ny\n',
    'docs/adr/bar/tasks/T1-z.md': '# Task ADR-006-T1: z\n',
  }, { repo: true })
  const tracked = ['docs/adr/bar.md', 'docs/adr/bar/tasks/T1-z.md', 'docs/adr/foo.md', 'docs/adr/foo/tasks/T1-y.md']
  const corpus = join(dir, 'docs', 'adr')
  const resolved = call(gate('adr-lint'), `[module.resolve_qualified_dep(pointer, Path(${py(dir)}), Path(${py(corpus)}), ${py(tracked)}) for pointer in ("ADR-005-T1", "ADR-006-T1")]`)
  assert.deepStrictEqual(resolved.value, [false, true])
})

// The same review: an archive citation resolved by a NAME alone, so a sibling archive's `001-note.md`
// holding only `Status: Accepted`, which the one definition rejects, resolved `ADR-001` (finding 1's
// archive half, in v3.8.10 too); and the archive catalog was opened without asking whether it is a FIFO
// (finding 11's archive half).
test('an archive citation resolves only a file the one definition calls a record', () => {
  const dir = tree({
    'docs/adr/ADR-003-x.md': '# ADR-003: X\n\nStatus: Accepted\n\n## Decision\n\nx\n',
    'docs/adr-archive/README.md': '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n',
    'docs/adr-archive/001-note.md': 'Status: Accepted\n',
    'docs/adr-archive/ADR-002-y.md': '# ADR-002: Y\n\nStatus: Accepted\n\n## Decision\n\ny\n',
  }, { repo: true })
  const tracked = ['docs/adr-archive/001-note.md', 'docs/adr-archive/ADR-002-y.md', 'docs/adr-archive/README.md', 'docs/adr/ADR-003-x.md']
  const corpus = join(dir, 'docs', 'adr')
  const resolved = call(gate('adr-lint'), `[module.resolve_record_number(pointer, Path(${py(dir)}), Path(${py(corpus)}), ${py(tracked)}) for pointer in ("ADR-001", "ADR-002", "ADR-003")]`)
  assert.deepStrictEqual(resolved.value, [false, true, true])
})

test('an archive catalog that is a FIFO contributes nothing and is never opened', t => {
  const dir = tree({ 'docs/adr/ADR-003-x.md': '# ADR-003: X\n\nStatus: Accepted\n\n## Decision\n\nx\n', 'docs/adr-archive/ADR-002-y.md': '# ADR-002: Y\n\nStatus: Accepted\n\n## Decision\n\ny\n' }, { repo: true })
  if (!fifo(dir, 'docs/adr-archive/README.md')) { t.skip('a FIFO cannot be made here'); return }
  const tracked = ['docs/adr-archive/ADR-002-y.md', 'docs/adr-archive/README.md', 'docs/adr/ADR-003-x.md']
  const answer = call(gate('adr-lint'), `sorted(module.archived_record_numbers(Path(${py(dir)}), Path(${py(join(dir, 'docs', 'adr'))}), ${py(tracked)}))`)
  assert.deepStrictEqual(answer.value, [])
})
