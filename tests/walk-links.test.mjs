// A Windows corpus-chaos run of 3.8.5 (BACKLOG §350 C7's Python half): `adr-debt docs/adr` hung
// over a junction under docs/adr that pointed back at it, killed at 300 s with no output, where
// the same tree without the junction finished in 12 s. Every Python gate walked with
// `Path.rglob`, which enters a Windows junction (it is not a symlink to pathlib). `record.walk`
// is the one walk now: it never enters a symlink or a junction, and yields what rglob yields
// otherwise.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { linkDirectory } from './symlink-support.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RECORD_PY = join(repoRoot, 'plugin', 'lib', 'record.py')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const scratch = prefix => { const dir = realpathSync.native(mkdtempSync(join(tmpdir(), prefix))); temps.push(dir); return dir }
const said = run => `${run.stdout}\n${run.stderr}`
// Lists what record.walk yields under argv[2] for pattern argv[3], relative and posix, one per
// line. argv[4], when given, names directories the injected predicate calls a link.
const walked = (root, pattern, links = null) => {
  const run = spawnSync('python3', ['-c', [
    'import importlib.util, sys',
    'spec = importlib.util.spec_from_file_location("record_walk", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(record)',
    'from pathlib import Path',
    'root = Path(sys.argv[2])',
    'names = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None',
    'kwargs = {} if names is None else {"is_link": lambda p: p.name in names}',
    'print("\\n".join(sorted(p.relative_to(root).as_posix() for p in record.walk(root, sys.argv[3], **kwargs))))',
  ].join('\n'), RECORD_PY, root, pattern, ...(links ? [links.join(',')] : [])],
  { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } })
  assert.equal(run.signal, null, `record.walk did not finish: ${said(run)}`)
  assert.equal(run.status, 0, said(run))
  return run.stdout.split('\n').filter(Boolean)
}

test('record.walk yields what rglob yields, and never enters a directory it is told is a link', () => {
  const root = scratch('qh-walk-')
  mkdirSync(join(root, 'a', 'b'), { recursive: true })
  mkdirSync(join(root, 'loop', 'deep'), { recursive: true })
  for (const file of ['top.md', 'a/one.md', 'a/b/two.md', 'a/b/x.txt', 'loop/three.md', 'loop/deep/four.md']) writeFileSync(join(root, file), '# x\n')
  // With nothing called a link, the walk is rglob's answer.
  assert.deepEqual(walked(root, '*.md'), ['a/b/two.md', 'a/one.md', 'loop/deep/four.md', 'loop/three.md', 'top.md'])
  assert.deepEqual(walked(root, '*'), ['a', 'a/b', 'a/b/two.md', 'a/b/x.txt', 'a/one.md', 'loop', 'loop/deep', 'loop/deep/four.md', 'loop/three.md', 'top.md'])
  // A directory the predicate calls a link is yielded, as rglob yields a link, and never entered.
  assert.deepEqual(walked(root, '*', ['loop']), ['a', 'a/b', 'a/b/two.md', 'a/b/x.txt', 'a/one.md', 'loop', 'top.md'])
})

test('record.walk and adr-debt finish over a link that loops back to the corpus', () => {
  const root = scratch('qh-walk-loop-')
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
  writeFileSync(join(root, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n')
  // A junction on Windows, a symlink elsewhere: the shape the Windows run built.
  linkDirectory(join(root, 'docs', 'adr'), join(root, 'docs', 'adr', 'loop'))
  assert.deepEqual(walked(join(root, 'docs', 'adr'), '*.md'), ['ADR-001-x.md'])
  spawnSync('git', ['init', '-q'], { cwd: root, timeout: 30_000, windowsHide: true })
  const debt = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-debt'), join('docs', 'adr')],
    { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(debt.signal, null, `adr-debt did not finish over a loop: ${said(debt)}`)
  assert.match(debt.stdout, /^\[DEBT\] /m, `adr-debt answered over the loop: ${said(debt)}`)
  assert.ok(!/loop[\\/]/.test(said(debt)), said(debt))
})
