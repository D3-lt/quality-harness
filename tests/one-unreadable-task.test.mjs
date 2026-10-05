// BACKLOG §350 C3 (four Windows reports of 3.8.3): one task file held open by another process
// turned adr-lint into "could not run … Permission denied" for 57–76 of 64–83 records, because the
// lint of EVERY record reads every other record's tasks for cross-record dependency cycles. A file
// the linted record does not own is a cycle check that is UNPROVEN, never a whole lint that could
// not run; a sharing violation is said as one, not as "Permission denied", which points at ACLs; and
// no absolute path leaves in the reason. corpus-probe now counts an adr-lint that could not run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { probe } from '../plugin/scripts/corpus-probe.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
after(() => { for (const dir of temps) { try { chmodSync(dir, 0o755) } catch {} rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } })
const ADR1 = path.join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer.md')
const TASK1 = path.join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks', 'T1-add-and-remove-items.md')
const TASK2 = path.join('docs', 'adr', 'ADR-002-prices-are-integer-cents', 'tasks', 'T1-format-cents.md')
const corpus = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-one-unreadable-'))
  temps.push(dir)
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'js-vitest-spa'), dir, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  return dir
}
const lint = (dir, record = ADR1) => spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-lint'), record],
  { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
// A mode bit stands in for a Windows lock off Windows; it cannot deny root, and Windows has none.
const denies = file => {
  chmodSync(file, 0o000)
  try { readFileSync(file); chmodSync(file, 0o644); return false } catch { return true }
}

test('one unreadable task another record owns leaves this record linted, its cycle check UNPROVEN', t => {
  const dir = corpus()
  const before = lint(dir)
  if (!denies(path.join(dir, TASK2))) { t.skip('no mode bit denies this process a read here'); return }
  const run = lint(dir)
  chmodSync(path.join(dir, TASK2), 0o644)
  assert.notEqual(run.status, 2, `${run.stdout}\n${run.stderr}`)
  assert.equal(run.status, before.status, 'the same verdict as with the file readable')
  assert.doesNotMatch(run.stderr, /could not run/, run.stderr)
  assert.match(run.stdout, /cross-record dependency cycles were checked without 1 task file\(s\) that could not be read \(`docs\/adr\/ADR-002-prices-are-integer-cents\/tasks\/T1-format-cents\.md`: Permission denied\)/, run.stdout)
})

test('a sharing violation is named as one, and no reason carries the path it failed on', () => {
  const run = spawnSync('python3', ['-c', [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("record_reason", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(record)',
    'locked = PermissionError(13, "Permission denied", "/Users/someone/repo/tasks/T1.md")',
    'locked.winerror = 32',
    'denied = PermissionError(13, "Permission denied", "/Users/someone/repo/tasks/T1.md")',
    'print(json.dumps([record.os_reason(locked), record.os_reason(denied), record.os_reason(OSError("odd"))]))',
  ].join('\n'), path.join(repoRoot, 'plugin', 'lib', 'record.py')], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  const [locked, denied, odd] = JSON.parse(run.stdout)
  assert.equal(locked, 'held open by another process (a Windows sharing violation)')
  assert.equal(denied, 'Permission denied')
  assert.equal(odd, 'odd')
})

test('corpus-probe counts an adr-lint that could not run, by record', t => {
  const dir = corpus()
  // A review note named like a record, which adr-lint reads and calls not-recognised (exit 2).
  writeFileSync(path.join(dir, 'docs', 'adr', 'adr009_review_notes.md'), '# Review notes\n\nProse, not a decision.\n')
  if (!denies(path.join(dir, TASK1))) { t.skip('no mode bit denies this process a read here'); return }
  const report = probe(dir)
  chmodSync(path.join(dir, TASK1), 0o644)
  const failed = report.adrLint.filter(entry => entry.exit === 2 && entry.verdict !== 'not-recognised').map(entry => entry.file)
  for (const file of failed) {
    assert.ok(report.couldNotRun.some(entry => entry.reader === `adr-lint ${file}`), JSON.stringify(report.couldNotRun))
  }
  assert.ok(failed.length > 0 || report.adrLint.every(entry => entry.exit !== 2), JSON.stringify(report.adrLint))
  // The twin: a file adr-lint calls not-recognised also exits 2, and it is a verdict, not a reader
  // that could not run (an outside run of the 3.8.7 RC counted two notes as could-not-run).
  assert.ok(report.adrLint.some(item => item.verdict === 'not-recognised'), JSON.stringify(report.adrLint.map(item => [item.file, item.verdict])))
  for (const entry of report.adrLint.filter(item => item.verdict === 'not-recognised')) {
    assert.ok(!report.couldNotRun.some(item => item.reader === `adr-lint ${entry.file}`), JSON.stringify(report.couldNotRun))
  }
})
