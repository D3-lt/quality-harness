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
const hasCoverage = spawnSync('python3', ['-c', 'import coverage'], { timeout: 60_000, windowsHide: true }).status === 0
const partial = 'create table context (id integer primary key, context text); create table coverage_schema (version integer); create table file (id integer primary key, path text); create table meta (key text, value text);'

test('every coverage data file is read before the combine: an empty one is left out, anything else unreadable fails', { skip: hasCoverage ? false : 'coverage.py is not importable by python3 (the coverage jobs install it)' }, t => {
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
