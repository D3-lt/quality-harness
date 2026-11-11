// BACKLOG §461: the Python floor read its data with `coverage combine … || true`, so one file a killed process left (tables, no
// row; run 41872532283) crashed the combine and the report then called it a low figure. scripts/coverage-data-check.py reads every
// file first: a file that recorded nothing is left out and said; a foreign or corrupt one fails, named. The cases are the ones the
// ADR-139 reviews found: a garbage file, an empty coverage_schema, an unrelated table, a table name that rewrites a count, a row.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// The checker reads with `read_only`, which coverage.py has from 7.17.1; an older one is UNRUN (the stub test below), not a failure.
const hasCoverage = spawnSync('python3', ['-c', 'import inspect, coverage; assert "read_only" in inspect.signature(coverage.CoverageData.__init__).parameters'], { timeout: 60_000, windowsHide: true }).status === 0
const partial = 'create table context (id integer primary key, context text); create table coverage_schema (version integer); create table file (id integer primary key, path text); create table meta (key text, value text);'

test('every coverage data file is read before the combine: an empty one is left out, anything else unreadable fails', { skip: hasCoverage ? false : 'coverage.py 7.17.1 or later is not importable by python3 (the coverage jobs install it)' }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-coverage-data-'))
  t.after(() => remove(scratch))
  const gate = path.join(scratch, 'gate.py')
  writeFileSync(gate, 'print("a")\n')
  const good = path.join(scratch, 'good')
  mkdirSync(good)
  const cfg = path.join(scratch, 'run.cfg')
  writeFileSync(cfg, `[run]\nparallel = True\ndata_file = ${path.join(good, '.coverage')}\n`)
  assert.equal(spawnSync('python3', ['-m', 'coverage', 'run', `--rcfile=${cfg}`, gate], { encoding: 'utf8', timeout: 60_000, windowsHide: true }).status, 0)
  const goodFile = path.join(good, spawnSync('python3', ['-c', 'import glob, os, sys; print(os.path.basename(glob.glob(os.path.join(sys.argv[1], ".coverage.*"))[0]))', good], { encoding: 'utf8', timeout: 60_000, windowsHide: true }).stdout.trim())
  const make = (name, sql) => {
    const file = path.join(scratch, name)
    if (sql === null) writeFileSync(file, 'not a database')
    else assert.equal(spawnSync('python3', ['-c', 'import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); c.executescript(sys.argv[2]); c.commit()', file, sql], { encoding: 'utf8', timeout: 60_000, windowsHide: true }).status, 0)
    return file
  }
  const check = (...files) => spawnSync('python3', [path.join(repoRoot, 'scripts', 'coverage-data-check.py'), ...files], { encoding: 'utf8', timeout: 60_000, windowsHide: true })

  const empty = make('.coverage.killed.1.x', partial)
  const left = check(goodFile, empty)
  assert.equal(left.status, 0, left.stdout + left.stderr)
  assert.match(left.stdout, /advice: \.coverage\.killed\.1\.x .*recorded nothing/, 'said, not silently dropped')
  assert.equal(existsSync(empty), false, 'and out of the combine')
  assert.equal(existsSync(goodFile), true, 'a readable file is untouched')

  // BACKLOG §464 (run 42775416426): a process killed before coverage.py wrote even its schema leaves a SQLite file with no table
  // at all, or an empty file; combine says "no such table: coverage_schema". It recorded nothing, so it is left out and said too.
  for (const [label, build] of [
    ['an empty file', file => writeFileSync(file, '')],
    ['a database with no table', file => assert.equal(spawnSync('python3', ['-c', 'import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); c.executescript("create table t (x integer); drop table t;"); c.commit()', file], { encoding: 'utf8', timeout: 60_000, windowsHide: true }).status, 0)],
  ]) {
    const file = path.join(scratch, `.coverage.killed.${label.length}.y`)
    build(file)
    const out = check(goodFile, file)
    assert.equal(out.status, 0, `${label}: ${out.stdout}${out.stderr}`)
    assert.match(out.stdout, new RegExp(`advice: \\.coverage\\.killed\\.${label.length}\\.y .*recorded nothing`), `${label}: said`)
    assert.equal(existsSync(file), false, `${label}: out of the combine`)
  }
  // DIRTY twin: a schema with no table is not an empty file. A view holds a queryable row, so the file is foreign and fails.
  const viewOnly = make('.coverage.bad.view.x', 'create view foreign_measurement as select 123 as hits')
  const viewed = check(goodFile, viewOnly)
  assert.equal(viewed.status, 1, `a view-only database: ${viewed.stdout}`)
  assert.equal(existsSync(viewOnly), true, 'a view-only database is never removed')

  for (const [label, sql] of [
    ['garbage', null],
    ['an empty coverage_schema table', 'create table coverage_schema (version integer)'],
    ['an unrelated table only', 'create table unrelated (x integer)'],
    ['a table name that rewrites the count', `${partial} create table "file"" where 0 --" (x integer); insert into "file"" where 0 --" values (1);`],
    ['one row in file', `${partial} insert into file (path) values ('gate.py');`],
  ]) {
    const bad = make(`.coverage.bad.${label.length}.x`, sql)
    const refused = check(goodFile, bad)
    assert.equal(refused.status, 1, `${label}: ${refused.stdout}`)
    assert.match(refused.stdout, new RegExp(`FAIL — unreadable coverage data: \\.coverage\\.bad\\.${label.length}\\.x`), `${label}: named`)
    assert.equal(existsSync(bad), true, `${label}: never removed`)
  }
  assert.equal(check().status, 2, 'nothing to check is a usage error')
})

// A Windows peer's coverage.py 7.13.4 has no `read_only`, and every file was then said as unreadable data, FAIL. A coverage.py too
// old to read read-only is UNRUN, exit 3, and no file is touched. A stub module stands in for the old version, so this runs anywhere.
test('a coverage.py too old to read read-only is UNRUN, not a finding about the data', t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-coverage-old-'))
  t.after(() => remove(scratch))
  const stub = path.join(scratch, 'stub', 'coverage')
  mkdirSync(stub, { recursive: true })
  writeFileSync(path.join(stub, '__init__.py'), '__version__ = "7.13.4"\nclass CoverageData:\n    def __init__(self, basename=None):\n        pass\n    def read(self):\n        raise AssertionError("must not be read")\n')
  const data = path.join(scratch, '.coverage.old.1.x')
  writeFileSync(data, 'not a database')
  const run = spawnSync('python3', [path.join(repoRoot, 'scripts', 'coverage-data-check.py'), data], { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONPATH: path.join(scratch, 'stub') } })
  assert.equal(run.status, 3, run.stdout + run.stderr)
  assert.match(run.stdout, /^UNRUN — coverage\.py 7\.13\.4 cannot read a data file read-only; it needs 7\.17\.1 or later/)
  assert.doesNotMatch(run.stdout, /FAIL/)
  assert.equal(existsSync(data), true, 'nothing is removed')
  // DIRTY twin: the same stub with `read_only` reads the file, so the version check is what made the run above UNRUN.
  writeFileSync(path.join(stub, '__init__.py'), '__version__ = "7.17.1"\nclass CoverageData:\n    def __init__(self, basename=None, read_only=False):\n        self.basename = basename\n    def read(self):\n        raise RuntimeError("file is not a database")\n')
  const read = spawnSync('python3', [path.join(repoRoot, 'scripts', 'coverage-data-check.py'), data], { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONPATH: path.join(scratch, 'stub') } })
  assert.equal(read.status, 1, read.stdout + read.stderr)
  assert.match(read.stdout, /FAIL — unreadable coverage data: \.coverage\.old\.1\.x: file is not a database/)
})
