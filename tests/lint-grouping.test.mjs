// The owner, 2026-10-27: adr-lint printed one lock line per task that locks a test, seven copies of each for ADR-060's
// seven tasks. A finding several tasks raise is now printed once, naming them (record.grouped_task_findings); the findings
// themselves stay one per task for every other reader.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [python, ...prefix] = pythonArgv()
const UTF8 = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }

test('a finding several tasks raise is printed once, naming them; one task or no task prints as it was', () => {
  const messages = [
    'T1-a.md: T1: locked test `t.mjs`::x vanished — done is refused',
    'ADR-009.md: Alternatives Considered has no entries',
    'T2-b.md: T2: locked test `t.mjs`::x vanished — done is refused',
    'T3-c.md: T3: locked test `t.mjs`::y vanished — done is refused',
    'T3-c.md: T3: locked test `t.mjs`::x vanished — done is refused',
  ]
  const run = spawnSync(python, [...prefix, '-c', [
    'import importlib.util, json, sys',
    'spec = importlib.util.spec_from_file_location("record_probe", sys.argv[1])',
    'record = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(record)',
    'print(json.dumps(record.grouped_task_findings(json.loads(sys.argv[2]))))',
  ].join('\n'), join(repoRoot, 'plugin', 'lib', 'record.py'), JSON.stringify(messages)], { encoding: 'utf8', timeout: 60_000, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), [
    'T1, T2, T3: locked test `t.mjs`::x vanished — done is refused',
    'ADR-009.md: Alternatives Considered has no entries',
    'T3-c.md: T3: locked test `t.mjs`::y vanished — done is refused',
  ])
})

test('adr-lint prints a lock finding its tasks share once, through the gate itself', (t) => {
  // ADR-060's tasks lock tests in tests/observed-events.test.mjs. Copied into a repository this test creates (CLAUDE.md §9)
  // without that file, every lock vanishes, in every task that holds it.
  const record = readdirSync(join(repoRoot, 'docs', 'adr')).find(name => /^ADR-060-/.test(name) && !name.endsWith('.md'))
  const dir = mkdtempSync(join(tmpdir(), 'qh-lint-grouping-'))
  t.after(() => remove(dir))
  mkdirSync(join(dir, 'docs', 'adr'), { recursive: true })
  cpSync(join(repoRoot, 'docs', 'adr', record), join(dir, 'docs', 'adr', record), { recursive: true })
  copyFileSync(join(repoRoot, 'docs', 'adr', `${record}.md`), join(dir, 'docs', 'adr', `${record}.md`))
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
  const run = spawnSync(python, [...prefix, join(repoRoot, 'plugin', 'bin', 'adr-lint'), join(dir, 'docs', 'adr', `${record}.md`)],
    { cwd: dir, encoding: 'utf8', timeout: 180_000, env: UTF8 })
  const vanished = run.stdout.split('\n').filter(line => /locked test `tests\/observed-events\.test\.mjs`::.* vanished — done is refused/.test(line))
  assert.ok(vanished.length > 0, run.stdout.slice(0, 2000))
  const names = vanished.map(line => line.match(/::(.*) vanished/)[1])
  assert.equal(new Set(names).size, names.length, 'each vanished test is printed once')
  assert.ok(vanished.some(line => /^ {2}T\d+(?:, T\d+)+: locked test /.test(line)), `a shared lock names its tasks: ${vanished[0]}`)
})
