// ADR-092's definition and its JS mirror, held to one answer BY CONSTRUCTION where a review of the
// executed record (gpt-6.1-sol, 2026-10-07) found them apart: the decimal digits a name arm reads, the
// Status the definition returns, a `templates` directory reached through a directory link, and a path
// component holding a line feed or a backslash. Rows and layouts come from
// tests/fixtures/record-recognition.json, whose answers the record approves (Decision 6).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import * as lifecycle from '../plugin/scripts/lifecycle.mjs'
import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(repoRoot, 'plugin', 'lib')
const TABLE = JSON.parse(readFileSync(join(repoRoot, 'tests', 'fixtures', 'record-recognition.json'), 'utf8'))
const rowById = Object.fromEntries(TABLE.rows.map(row => [row.id, row]))
const LAYOUTS = Object.fromEntries(TABLE.layouts.map(layout => [layout.id, layout]))
const onWindows = process.platform === 'win32'

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const textOf = file => (file.gen
  ? (file.gen.before ?? '') + file.gen.repeat.repeat(Math.ceil(file.gen.bytes / file.gen.repeat.length)) + (file.gen.then ?? '')
  : file.text ?? '')

// `files` laid out in a fresh repository; null when a link cannot be made here (Windows EPERM). Git runs
// only in a directory this file made (CLAUDE.md §9).
function repository(files) {
  const scratch = mkdtempSync(join(tmpdir(), 'qh-definition-parity-'))
  temps.push(scratch)
  const repo = join(scratch, 'repo')
  mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  for (const file of files) {
    const at = join(repo, ...file.path.split('/'))
    mkdirSync(dirname(at), { recursive: true })
    if (file.link) {
      try { symlinkSync(file.link, at) } catch (error) { if (error.code === 'EPERM') return null; throw error }
    } else {
      writeFileSync(at, textOf(file))
    }
  }
  return repo
}

// record.py asked directly: its digit table, or `recognised_as_record` for [path, root] pairs.
const PY = [
  'import json, sys',
  'from pathlib import Path',
  'sys.path.insert(0, sys.argv[1])',
  'import record',
  'op, items = json.load(sys.stdin)',
  'if op == "digits":',
  '    print(json.dumps([list(pair) for pair in record.DECIMAL_DIGIT_RANGES]))',
  'else:',
  '    out = []',
  '    for path, root in items:',
  '        text = Path(path).read_text(encoding="utf-8", errors="replace")',
  '        recognised, status, _kept, arm = record.recognised_as_record(Path(path), text, root)',
  '        out.append({"recognised": recognised, "status": status, "arm": arm})',
  '    print(json.dumps(out))',
].join('\n')
function python(op, items) {
  const r = runPython(['-c', PY, lib], { input: JSON.stringify([op, items]), encoding: 'utf8', timeout: 120_000 })
  assert.equal(r.status, 0, `python could not run: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const js = (repo, file, platform) => {
  const answer = lifecycle.recognisedAsRecord(repo, file, readFileSync(file, 'utf8'), platform ? { platform } : undefined)
  return { recognised: answer.recognised, status: answer.status, arm: answer.arm }
}

test('the name arms read one frozen table of decimal digits in both languages', () => {
  // One table, not each runtime's Unicode: Python 3.14's `\d` is Unicode 16 and a newer Node's `\p{Nd}`
  // Unicode 17, so U+11DE0 was a digit to one and not the other (the review's finding 3).
  assert.deepStrictEqual(python('digits', []), lifecycle.DECIMAL_DIGIT_RANGES)
  assert.deepStrictEqual(lifecycle.DECIMAL_DIGIT_RANGES[0], [0x30, 0x39])
  const name = digit => `notes/spec-${String.fromCodePoint(digit)}${String.fromCodePoint(digit)}-x.md`
  const digits = { arabicIndic: 0x660, lastMathematical: 0x1d7ff, outsideTheTable: 0x11de0, beforeARange: 0x1e5f0 }
  const repo = repository(Object.values(digits).map(digit => ({ path: name(digit), text: 'Status: Accepted\n' })))
  const at = Object.fromEntries(Object.entries(digits).map(([key, digit]) => [key, join(repo, ...name(digit).split('/'))]))
  const expected = { arabicIndic: true, lastMathematical: true, outsideTheTable: false, beforeARange: false }
  const py = python('recognise', Object.values(at).map(file => [file, repo]))
  assert.deepStrictEqual(Object.fromEntries(Object.keys(at).map((key, index) => [key, py[index].recognised])), expected)
  assert.deepStrictEqual(Object.fromEntries(Object.entries(at).map(([key, file]) => [key, js(repo, file).recognised])), expected)
})

test('the definition returns the normalised Status in both languages for every plain row', () => {
  const ids = TABLE.rows.filter(row => row.id !== 'R1').map(row => row.id)
  const repo = repository(ids.flatMap(id => rowById[id].files))
  const at = Object.fromEntries(ids.map(id => [id, join(repo, ...(rowById[id].subject ?? rowById[id].files[0].path).split('/'))]))
  const approved = Object.fromEntries(ids.map(id => [id, rowById[id].status]))
  const py = python('recognise', ids.map(id => [at[id], repo]))
  assert.deepStrictEqual(Object.fromEntries(ids.map((id, index) => [id, py[index].status])), approved)
  assert.deepStrictEqual(Object.fromEntries(ids.map(id => [id, js(repo, at[id]).status])), approved)
})

test('a templates directory reached through a directory link admits no record in either language', t => {
  const layout = LAYOUTS.L11
  const repo = repository(layout.files)
  if (!repo) { t.skip('a symbolic link cannot be made here'); return }
  const paths = Object.keys(layout.definition)
  const py = python('recognise', paths.map(path => [join(repo, ...path.split('/')), repo]))
  const said = answers => Object.fromEntries(paths.map((path, index) => [path, { recognised: answers[index].recognised, arm: answers[index].arm }]))
  assert.deepStrictEqual(said(py), layout.definition)
  assert.deepStrictEqual(said(paths.map(path => js(repo, join(repo, ...path.split('/'))))), layout.definition)
})

test('a path component holding a line feed or a backslash reads alike in both languages', t => {
  if (onWindows) { t.skip('Windows cannot name a directory holding a line feed, and a backslash there is a separator'); return }
  const repo = repository(TABLE.spellings.map(row => ({ path: row.path, text: row.text })))
  const at = Object.fromEntries(TABLE.spellings.map(row => [row.id, join(repo, ...row.path.split('/'))]))
  const approved = Object.fromEntries(TABLE.spellings.map(row => [row.id, row.recognised.posix]))
  const py = python('recognise', TABLE.spellings.map(row => [at[row.id], repo]))
  assert.deepStrictEqual(Object.fromEntries(TABLE.spellings.map((row, index) => [row.id, py[index].recognised])), approved)
  assert.deepStrictEqual(Object.fromEntries(TABLE.spellings.map(row => [row.id, js(repo, at[row.id]).recognised])), approved)
  // The platform is a parameter (CLAUDE.md §7): where it is Windows, a backslash separates.
  const windows = TABLE.spellings.filter(row => row.recognised.win32 !== null)
  assert.deepStrictEqual(Object.fromEntries(windows.map(row => [row.id, js(repo, at[row.id], 'win32').recognised])),
    Object.fromEntries(windows.map(row => [row.id, row.recognised.win32])))
})
