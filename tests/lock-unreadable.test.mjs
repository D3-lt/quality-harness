// A Windows corpus-chaos run of 3.8.5 (BACKLOG §350 C1): 3.8.5 stopped the traceback a UTF-16
// test file named by a lock raised, and in its place adr-lint said "locked test … vanished — done
// is refused" on five records. The file was there; nobody observed it gone. A gate never reports
// an observation it did not make (CLAUDE.md §3), so a file that is there and cannot be read is
// UNPROVEN, and only a file that is gone is "vanished". Tested at adr-lint, the call the report
// came through (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RECORD_PY = join(repoRoot, 'plugin', 'lib', 'record.py')
const RECORD = join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer.md')
const TASK = join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks', 'T1-add-and-remove-items.md')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const said = run => `${run.stdout}\n${run.stderr}`
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const lint = repo => spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join(repo, RECORD)],
  { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
// The js-vitest-spa corpus in a scratch repository this file made (CLAUDE.md §9), its done T1
// carrying the first-red lock record.py itself mints over `src/cart.test.ts`.
const locked = () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-lock-unreadable-'))
  temps.push(repo)
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'js-vitest-spa'), repo, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
  const task = join(repo, TASK)
  const minted = spawnSync('python3', ['-c', [
    'import importlib.util, sys',
    'spec = importlib.util.spec_from_file_location("record_probe", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(record)',
    'print(record.first_red_lock_suffix(open(sys.argv[2], encoding="utf-8").read(), sys.argv[3]))',
  ].join('\n'), RECORD_PY, task, repo], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(minted.status, 0, said(minted))
  const suffix = minted.stdout.trim()
  assert.match(suffix, /^· test-lock-sha256:[0-9a-f]{64} · test-lock-b64:[\w-]+$/)
  const text = readFileSync(task, 'utf8')
  writeFileSync(task, `${text}${text.endsWith('\n') ? '' : '\n'}- 2026-09-20 · no-git · exit 1 · \`grep -q 'adds_an_item' src/cart.test.ts\` · ms:3 ${suffix}\n`)
  return repo
}
const cart = repo => join(repo, 'src', 'cart.test.ts')
const VANISHED = 'locked test `src/cart.test.ts`::adds_an_item vanished'
const UNREAD = 'locked test `src/cart.test.ts`::adds_an_item could not be read'

test('a locked test file that is there and cannot be read is UNPROVEN, not vanished', t => {
  // UTF-16, as the Windows run saved it.
  const utf16 = locked()
  writeFileSync(cart(utf16), Buffer.from(`﻿${readFileSync(cart(utf16), 'utf8')}`, 'utf16le'))
  const read = lint(utf16)
  assert.ok(read.stdout.includes(UNREAD), said(read))
  assert.ok(!said(read).includes(VANISHED), said(read))
  assert.ok(!/Traceback/.test(said(read)), said(read))
  // The dirty twin: a file that is gone is still "vanished".
  const gone = locked()
  rmSync(cart(gone))
  const missing = lint(gone)
  assert.ok(missing.stdout.includes(VANISHED), said(missing))
  assert.ok(!missing.stdout.includes(UNREAD), said(missing))
  // A file this process may not open, where a mode bit can say so. adr-lint's own read of the
  // Tests-row file may stop it first, as could-not-run (BACKLOG §350 F2 is about that line); either
  // way it is never "vanished".
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a read here'); return }
  const denied = locked()
  chmodSync(cart(denied), 0o000)
  try {
    const run = lint(denied)
    assert.ok(run.stdout.includes(UNREAD) || /could not run: .*cart\.test\.ts — Permission denied/.test(run.stderr), said(run))
    assert.ok(!said(run).includes(VANISHED), said(run))
  } finally { chmodSync(cart(denied), 0o644) }
})

// The stand-in review of 3.8.6: `_present` asked `Path.is_file`, which from Python 3.13 swallows
// every OSError, so a directory above the file that this process may not search said "gone".
test('a file behind a directory this process may not search is not gone', t => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a search here'); return }
  const root = mkdtempSync(join(tmpdir(), 'qh-present-'))
  temps.push(root)
  mkdirSync(join(root, 'shut'))
  writeFileSync(join(root, 'shut', 'x.test.mjs'), "test('x', () => {})\n")
  const present = rel => spawnSync('python3', ['-c', [
    'import importlib.util, sys',
    'spec = importlib.util.spec_from_file_location("record_present", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(record)',
    'from pathlib import Path',
    'print(record._present(Path(sys.argv[2])))',
  ].join('\n'), RECORD_PY, join(root, ...rel.split('/'))], { encoding: 'utf8', timeout: 60_000, windowsHide: true }).stdout.trim()
  assert.equal(present('shut/x.test.mjs'), 'True')
  assert.equal(present('shut/gone.test.mjs'), 'False')
  chmodSync(join(root, 'shut'), 0o000)
  try {
    assert.equal(present('shut/x.test.mjs'), 'True', 'could not look is not gone')
  } finally { chmodSync(join(root, 'shut'), 0o755) }
})
