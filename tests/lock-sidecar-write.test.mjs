// ADR-129 T2: adr-verify writes a lock's payload to `<corpus>/locks/<sha256>.lock` before the row, and the row carries
// `test-lock-file:` and no `test-lock-b64:`, for a first red, a recovery lock, `--relock` and `--replace-hashes`. Driven
// through the real adr-verify in a repository this test creates (CLAUDE.md §9), and read back through record.py.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [python, ...prefix] = pythonArgv()
const { NODE_TEST_CONTEXT: _nested, ...cleanEnv } = process.env
const env = { ...cleanEnv, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
const HEAD = "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"

function corpus(t, { passing = false, vlog = [], records = ['docs', 'adr'] } = {}) {
  const dir = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-lock-write-')))
  t.after(() => { try { chmodSync(join(dir, 'docs', 'adr', 'locks'), 0o755) } catch { /* none */ } remove(dir) })
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 10_000 }).status, 0)
  mkdirSync(join(dir, 'tests'))
  writeFileSync(join(dir, 'tests', 'a.test.mjs'), `${HEAD}test('locked', () => {\n  assert.equal(1, ${passing ? 1 : 2})\n})\n`)
  const task = (id, name) => {
    const tasks = join(dir, ...records, `${id}-probe`, 'tasks')
    mkdirSync(tasks, { recursive: true })
    const file = join(tasks, name)
    writeFileSync(file, [`# Task ${id}-T1: lock`, '', '## Acceptance', '', '```bash', 'node --test tests/a.test.mjs', '```', '',
      '## Tests', '', '| Test name | File | Verifies | Covers |', '|-----------|------|----------|--------|',
      '| `locked` | `tests/a.test.mjs` | lock | — |', '', '## Mutation Log', '', '## Verification Log', '', ...vlog, ''].join('\n'))
    return file
  }
  return { dir, task }
}
const verify = (dir, task, ...args) => spawnSync(python, [...prefix, join(repoRoot, 'plugin', 'bin', 'adr-verify'), task, ...args],
  { cwd: dir, encoding: 'utf8', timeout: 120_000, env })
const rows = file => readFileSync(file, 'utf8').split('\n').filter(line => /^- \d{4}-\d{2}-\d{2} · .*test-lock-sha256:/.test(line))
const readBack = (dir, file) => {
  const run = spawnSync(python, [...prefix, '-c', [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("record_probe", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec); spec.loader.exec_module(record)',
    'text = open(sys.argv[3], encoding="utf-8").read()',
    '_d, lock = record._recorded_lock(record.sections_of(text).get("Verification Log", []), record.object_format(sys.argv[2]), root=sys.argv[2])',
    'print(json.dumps({"read": bool(lock and lock.get("map")), "untracked": bool(lock and lock.get("untracked"))}))',
  ].join('\n'), join(repoRoot, 'plugin', 'lib', 'record.py'), dir, file], { encoding: 'utf8', timeout: 60_000, env })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}
const locks = dir => (existsSync(join(dir, 'docs', 'adr', 'locks')) ? readdirSync(join(dir, 'docs', 'adr', 'locks')).filter(name => name.endsWith('.lock')) : [])

test("adr-verify writes a first red's lock to a sidecar, and adr-lint reads it", t => {
  const { dir, task } = corpus(t)
  const file = task('ADR-001', 'T1-lock.md')
  const red = verify(dir, file)
  assert.notEqual(red.status, 0, 'the fence is red')
  const [row] = rows(file)
  assert.ok(row, readFileSync(file, 'utf8'))
  assert.match(row, / · test-lock-file:docs\/adr\/locks\/[0-9a-f]{64}\.lock$/, row)
  assert.doesNotMatch(row, /test-lock-b64:/, row)
  assert.equal(locks(dir).length, 1)
  assert.deepEqual(readBack(dir, file), { read: true, untracked: true }, 'read before its commit, and advised')
  spawnSync('git', ['add', '-A'], { cwd: dir, timeout: 10_000 })
  assert.deepEqual(readBack(dir, file), { read: true, untracked: false }, 'and read as the repository\'s own once added')
})

test('a recovery lock and a relock write the same form, a shared payload is one file, and an unwritable directory leaves no row', t => {
  const { dir, task } = corpus(t, { passing: true, vlog: [`- 2026-09-20 · no-git · exit 1 · \`node --test tests/a.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:1`] })
  const file = task('ADR-001', 'T1-lock.md')
  assert.equal(verify(dir, file).status, 0, 'a green after a lockless red')
  assert.match(rows(file).at(-1), / · test-lock-file:docs\/adr\/locks\/[0-9a-f]{64}\.lock$/, 'the recovery lock is a sidecar')
  const relock = verify(dir, file, '--relock')
  assert.equal(relock.status, 0, relock.stdout + relock.stderr)
  assert.match(rows(file).at(-1), / · test-lock-file:docs\/adr\/locks\/[0-9a-f]{64}\.lock · test-lock-kind:relock$/)
  assert.equal(locks(dir).length, 1, 'the same payload is one file')
  if (process.platform !== 'win32') {
    const other = task('ADR-002', 'T1-lock.md')
    writeFileSync(join(dir, 'tests', 'a.test.mjs'), `${HEAD}test('locked', () => {\n  assert.equal(1, 2)\n})\n`)
    chmodSync(join(dir, 'docs', 'adr', 'locks'), 0o555)
    const refused = verify(dir, other)
    assert.notEqual(refused.status, 0)
    assert.equal(rows(other).length, 0, 'no row names a file that was not written')
  }
})

test('the locks directory is held at LF in any corpus', t => {
  const { dir, task } = corpus(t)
  verify(dir, task('ADR-001', 'T1-lock.md'))
  const [lock] = locks(dir)
  const attr = spawnSync('git', ['check-attr', 'eol', '--', `docs/adr/locks/${lock}`], { cwd: dir, encoding: 'utf8', timeout: 10_000 })
  assert.match(attr.stdout, /eol: lf/, attr.stdout + attr.stderr)
})

// The review of c0c7eaeb: a corpus whose path holds a space put that space into the row's field, which no reader's grammar
// takes, and adr-verify then refused its own row. The path is percent-encoded in the row and decoded by the reader.
test('a corpus whose path holds a space gets a row its readers can read', t => {
  const { dir, task } = corpus(t, { records: ['design records'] })
  const file = task('ADR-001', 'T1-lock.md')
  assert.notEqual(verify(dir, file).status, 0, 'the fence is red')
  const [row] = rows(file)
  assert.match(row ?? '', / · test-lock-file:design%20records\/locks\/[0-9a-f]{64}\.lock$/, readFileSync(file, 'utf8'))
  assert.equal(readBack(dir, file).read, true)
})
