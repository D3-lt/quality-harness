// BACKLOG §381, the leading-pipe class. GFM accepts a table row without its leading pipe (`T1 | x | done`), and a reader
// that looks only at lines starting `|` drops it. Each test here drives one gate's CLI over a corpus the test creates,
// with a piped twin that must behave the same and a pipe-less row that used to be skipped.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const bin = join(root, 'bin')
const fixture = join(testDir, 'fixtures', 'ok')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }
const { NODE_TEST_CONTEXT: _nested, ...envSansTestContext } = process.env
const pyEnv = { ...envSansTestContext, PYTHONPATH: join(root, 'lib'), PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }

const GATE_NAMES = new Set(readdirSync(bin, { withFileTypes: true })
  .filter(e => e.isFile() && !e.name.includes('.')).map(e => e.name))

function run(command, args, cwd, spawnEnv = env) {
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has(command)
    ? ['python3', [join(bin, command), ...args]]
    : [command, args]
  return spawnSync(file, argv, { cwd, env: spawnEnv, encoding: 'utf8', timeout: 120_000 })
}

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }) })
function tempDir(prefix) {
  const dir = mkdtempSync(join(os.tmpdir(), prefix))
  temps.push(dir)
  return dir
}

// The shipped fixture, copied into a repository of its own so adr-verify and adr-lint can ask git.
function corpus() {
  const copy = join(tempDir('quality-harness-pipeless-'), 'ok')
  cpSync(fixture, copy, { recursive: true })
  return copy
}
function gitCorpus() {
  const copy = corpus()
  for (const args of [
    ['init', '-q', '-b', 'main', '.'],
    ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'add', '.'],
    ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qm', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: copy, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`)
  }
  return copy
}
const taskPath = copy => join(copy, 'tasks', 'T1-fixture.md')
const readTask = copy => readFileSync(taskPath(copy), 'utf8')
const writeTask = (copy, text) => writeFileSync(taskPath(copy), text)
const lint = copy => run('adr-lint', ['ADR-001-selftest.md', 'tasks'], copy)
const said = result => `${result.stdout ?? ''}${result.stderr ?? ''}`

// A passing fence and a killed mutant, then the Tests table replaced and the README flipped to done: the state in which
// check_tests_exist reads the table.
function doneWithTests(testsTable) {
  const copy = gitCorpus()
  writeTask(copy, `${readTask(copy).trimEnd()}\n\n## Mutation Log\n`)
  const mutant = run('adr-verify', ['tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'ADR-001-selftest.md',
    '--from', '## Alternatives Considered', '--to', '## Alternatives Considred',
    '--why', 'adr-lint must notice its required alternatives section going missing'], copy)
  assert.equal(mutant.status, 0, said(mutant))
  const verified = run('adr-verify', ['tasks/T1-fixture.md', '--cwd', '.'], copy)
  assert.equal(verified.status, 0, said(verified))
  const before = readTask(copy)
  const after = before.replace(/## Tests\n[\s\S]*?\n## Invariants/, `## Tests\n\n${testsTable}\n\n## Invariants`)
  assert.notEqual(after, before, 'the Tests section must actually be replaced')
  // A Verification Log dated before the lock cutover, as tests/evidence-chain.test.mjs does: these tests are not the lock's.
  const [head, rest] = after.split('## Verification Log')
  const [vlog, ...tail] = rest.split('## Mutation Log')
  writeTask(copy, [head + '## Verification Log' + vlog.replace(/^- \d{4}-\d{2}-\d{2} · /gm, '- 2026-09-12 · '), ...tail].join('## Mutation Log'))
  const readme = join(copy, 'tasks', 'README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('| pending |', '| done |'))
  return copy
}

const HEADER = '| Test name | File | Verifies | Covers |\n|-----------|------|----------|--------|\n'
const POINTS_NOWHERE = /names `(tests\/nope_[ab]\.py)` for `test_[ab]`, and that path names no file/

test('a Tests row without its leading pipe is a row check_tests_exist reads', () => {
  const piped = '| `test_a` | `tests/nope_a.py` | gone | — |'
  const bare = '`test_b` | `tests/nope_b.py` | gone | — |'
  const control = lint(doneWithTests(HEADER + piped))
  assert.equal(control.status, 1, `the control: a piped row naming no file blocks\n${said(control)}`)
  assert.match(said(control), POINTS_NOWHERE)
  const mixed = lint(doneWithTests(HEADER + piped + '\n' + bare))
  const named = [...said(mixed).matchAll(new RegExp(POINTS_NOWHERE, 'g'))].map(m => m[1]).sort()
  assert.deepEqual(named, ['tests/nope_a.py', 'tests/nope_b.py'], `the pipe-less row is a row of the same table\n${said(mixed)}`)
  assert.match(said(mixed), /T1-fixture\.md:\d+: T1 has passing acceptance evidence and its Tests table names `tests\/nope_b\.py`/,
    'and the finding names the pipe-less row\'s line, not only the file')
  const wholly = lint(doneWithTests('Test name | File | Verifies | Covers\n----------|------|----------|-------\n' + bare))
  assert.equal(wholly.status, 1, said(wholly))
  assert.match(said(wholly), /tests\/nope_b\.py/, 'a table written without any edge pipes is read too')
  const prose = lint(doneWithTests(HEADER + piped + '\n\nsee `test_c` | `tests/nope_c.py` in the notes'))
  assert.doesNotMatch(said(prose), /nope_c/, 'a pipe-less line outside a table is prose, not a row')
})

// The first-red lock and the done check read the same Tests table adr-verify wrote it from, so a row the lock writer
// drops is a test nothing holds still.
function recordOp(payload) {
  const src = `
import json, sys
from pathlib import Path
from record import first_red_lock_suffix, lock_blocks_done
req = json.load(sys.stdin)
root = Path(req["root"])
if req["op"] == "suffix":
    print(json.dumps({"suffix": first_red_lock_suffix(req["text"], root)}))
else:
    print(json.dumps({"blocks": lock_blocks_done(req["text"], root)}))
`
  const result = spawnSync('python3', ['-c', src], { cwd: repoRoot, env: pyEnv, input: JSON.stringify(payload), encoding: 'utf8', timeout: 60_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  return JSON.parse(result.stdout)
}

const ROW_PIPED = '| `locked piped` | `tests/subject.test.mjs` | lock | F-1 |'
// The lock hashes every test in a file a row names, so the pipe-less row names a file no piped row does.
const ROW_BARE = '`locked bare` | `tests/other.test.mjs` | lock | F-1 |'
const subject = (name, value) => "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"
  + `test('${name}', () => {\n  assert.equal(${value}, 1)\n})\n`
function lockTask(rows, vlog = []) {
  return ['# Task ADR-050-T1: lock probe', '', '## Tests', '', HEADER.trimEnd(), ...rows, '', '## Verification Log', '', ...vlog, ''].join('\n')
}
const redRow = suffix => `- 2026-09-13 · no-git · exit 2 · \`node --test tests/subject.test.mjs\` · acceptance-sha256:${'0'.repeat(64)} · ms:12${suffix}`

test('a Tests row without its leading pipe is locked at the first red, and an older lock does not newly refuse done', () => {
  const dir = tempDir('quality-harness-pipeless-lock-')
  mkdirSync(join(dir, 'tests'), { recursive: true })
  const file = join(dir, 'tests', 'subject.test.mjs')
  const other = join(dir, 'tests', 'other.test.mjs')
  writeFileSync(file, subject('locked piped', 1))
  writeFileSync(other, subject('locked bare', 1))
  const decoded = suffix => (Buffer.from(/test-lock-b64:([A-Za-z0-9_-]+)/.exec(suffix)[1], 'base64url').toString('utf8'))
  const blocks = (rows, suffix) => recordOp({ op: 'blocks', root: dir, text: lockTask(rows, [redRow(suffix)]) }).blocks

  const both = recordOp({ op: 'suffix', root: dir, text: lockTask([ROW_PIPED, ROW_BARE]) }).suffix
  assert.match(both, /test-lock-sha256:[0-9a-f]{64}/)
  const locked = JSON.stringify(decoded(both))
  assert.match(locked, /locked piped/, 'the control: the piped row is locked')
  assert.match(locked, /locked bare/, 'the pipe-less row is locked too')
  assert.equal(blocks([ROW_PIPED, ROW_BARE], both), false, 'and an untouched lock holds')
  writeFileSync(other, subject('locked bare', 2))
  assert.equal(blocks([ROW_PIPED, ROW_BARE], both), true, 'editing the pipe-less row\'s test refuses done')

  // A lock taken before the row was visible names only the piped test. The newly visible row is not in it, so done is
  // not newly refused on a record that was done before this reader changed.
  writeFileSync(other, subject('locked bare', 1))
  const old = recordOp({ op: 'suffix', root: dir, text: lockTask([ROW_PIPED]) }).suffix
  assert.doesNotMatch(JSON.stringify(decoded(old)), /locked bare/)
  assert.equal(blocks([ROW_PIPED, ROW_BARE], old), false, 'a row the old lock never named does not block done')
  writeFileSync(file, subject('locked piped', 2))
  assert.equal(blocks([ROW_PIPED, ROW_BARE], old), true, 'while the row it did name still does')
})

// Proof map: v1 binds each Ordered Step to a Tests row through its fifth column. A row without its leading pipe was an
// empty row there, so a step it proved read as proved by nothing.
function proofMapLint(table) {
  const copy = corpus()
  let task = readTask(copy)
  task = task.replace('**Consumes:** none', '**Consumes:** none\n**Proof map:** v1')
  task = task.replace('1. Write the failing test', '1. [S1] Write the failing test')
  task = task.replace('2. Fill every required section', '2. [S2] Fill every required section [proof: acceptance]')
  const replaced = task.replace(/## Tests\n[\s\S]*?\n## Invariants/, `## Tests\n\n${table}\n\n## Invariants`)
  assert.notEqual(replaced, task, 'the Tests section must actually be replaced')
  writeTask(copy, replaced)
  return said(lint(copy))
}
const PM_HEADER = '| Test name | File | Verifies | Covers | Steps |\n|-----------|------|----------|--------|-------|\n'
const NOT_REFERENCED = /Ordered Step S1 is not referenced/

test('a Proof map step proved by a Tests row without its leading pipe is referenced', () => {
  assert.doesNotMatch(proofMapLint(PM_HEADER + '| `adr-lint-positive` | `selftest.sh` | the gate | — | S1 |'), NOT_REFERENCED,
    'the control: a piped row references S1')
  assert.doesNotMatch(proofMapLint(PM_HEADER + '`adr-lint-positive` | `selftest.sh` | the gate | — | S1'), NOT_REFERENCED,
    'a pipe-less row under a piped header references S1 as well')
  assert.doesNotMatch(proofMapLint('Test name | File | Verifies | Covers | Steps\n----------|------|----------|--------|------\n'
    + '`adr-lint-positive` | `selftest.sh` | the gate | — | S1'), NOT_REFERENCED, 'so does a table written without any edge pipes')
  assert.match(proofMapLint(PM_HEADER + '| `adr-lint-positive` | `selftest.sh` | the gate | — | — |'), NOT_REFERENCED,
    'and the check can still fail: a row that references no step leaves S1 unreferenced')
  assert.doesNotMatch(proofMapLint(PM_HEADER + '| `adr-lint-positive` | `selftest.sh` | the gate | — | S1 |\nA note straight under the table.'),
    /Tests data row|five cells/, 'a line with no pipe is not a row of the table, as before')
})
