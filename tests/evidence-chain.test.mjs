// Wave 1 of docs/TEST-PLAN.md — the writer/reader contract.
//
// `bin/adr-verify` WRITES the Verification Log; `bin/adr-lint`, `bin/adr-next`
// and `bin/adr-retire-check` READ it. Both halves were tested alone. What was
// never tested is the serialized line as `append_entry` actually emits it — the
// `·` separators, the ` …` truncation marker, the `*` dirty-tree suffix, the
// placeholder strippers, the indented failure fence. `tests/gate-regressions.py`
// proves the two DIGEST FUNCTIONS agree and feeds `check_verification` a
// hand-built string; that is a different claim.
//
// So every test here reads the file adr-verify wrote. None reconstructs it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(testDir, '..')
const bin = join(root, 'bin')
const fixture = join(testDir, 'fixtures', 'ok')

const env = {
  ...process.env,
  PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
}

// Windows cannot exec a `#!` script; the gates reach it through Git Bash in real
// use. Same reasoning as tests/gates.test.mjs.
function run(command, args, cwd, input = undefined) {
  const [file, argv] = process.platform === 'win32'
    ? ['python3', [join(bin, command), ...args]]
    : [command, args]
  return spawnSync(file, argv, { cwd, env, input, encoding: 'utf8', timeout: 60_000 })
}

function expectExit(result, status, label) {
  assert.equal(result.status, status,
    `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
}

const temps = []
function corpus() {
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-chain-'))
  temps.push(temp)
  const copy = join(temp, 'ok')
  cpSync(fixture, copy, { recursive: true })
  return copy
}

test.after(() => {
  for (const temp of temps) rmSync(temp, { recursive: true, force: true })
})

const taskPath = copy => join(copy, 'tasks', 'T1-fixture.md')
const readTask = copy => readFileSync(taskPath(copy), 'utf8')
const writeTask = (copy, text) => writeFileSync(taskPath(copy), text)

// The README is a derived index, and adr-lint will not accept a `done` row
// without tool-written evidence for it. Flipping it AFTER the verify run is what
// makes the reader judge what the writer actually wrote.
function markDone(copy) {
  const readme = join(copy, 'tasks', 'README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('| pending |', '| done |'))
}

const lint = copy => run('adr-lint', ['ADR-001-selftest.md', 'tasks'], copy)
const verify = (copy, args = []) => run('adr-verify', ['tasks/T1-fixture.md', ...args], copy)

// Passing evidence obliges the task to also carry a killed mutant — "a fence that
// passes is not a fence that can fail". The fixture has no such section because
// until done_task_ids was fixed the rule was unreachable, so the tests that need
// a complete chain add it.
function addMutationLog(copy) {
  writeTask(copy, `${readTask(copy).trimEnd()}\n\n## Mutation Log\n`)
}

// A mutant that breaks a section adr-lint requires, so the acceptance command
// (which lints this very corpus) goes red and the mutant is killed.
const mutate = copy => verify(copy, [
  '--cwd', '.', '--mutant', 'ADR-001-selftest.md',
  '--from', '## Decision', '--to', '## Decisiun',
  '--why', 'adr-lint must notice a required section going missing',
])

test('adr-lint accepts the entry adr-verify wrote, as it wrote it', () => {
  const copy = corpus()
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')

  const entry = readTask(copy).split('## Verification Log')[1].trim()
  // The shape the readers parse, asserted on the real line rather than on a
  // reconstruction: date · sha · exit · command · digest.
  assert.match(entry, /^- \d{4}-\d{2}-\d{2} · (?:[0-9a-f]{7,40}\*?|no-git) · exit 0 · `[^`]+` · acceptance-sha256:[0-9a-f]{64}$/)

  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'the mutant must be killed')
  const mutation = readTask(copy).split('## Mutation Log')[1].trim()
  assert.match(mutation, /^- \d{4}-\d{2}-\d{2} · (?:[0-9a-f]{7,40}\*?|no-git) · mutant killed · exit \d+ · `[^`]+` · [^·]+ · acceptance-sha256:[0-9a-f]{64}$/)

  markDone(copy)
  expectExit(lint(copy), 0, 'adr-lint must accept its own writer output')
})

test('editing the Acceptance fence invalidates the evidence already written', () => {
  const copy = corpus()
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'the mutant must be killed')
  markDone(copy)
  expectExit(lint(copy), 0, 'baseline')

  // One character inside the fence. The digest binds evidence to the exact text
  // that produced it, so this must strand the entry rather than carry it over.
  writeTask(copy, readTask(copy).replace(
    "python3 -c 'print(\"acceptance fence complete\")'",
    "python3 -c 'print(\"acceptance fence complete \")'"))
  const stale = lint(copy)
  expectExit(stale, 1, 'a changed Acceptance must strand its evidence')
  assert.match(stale.stdout + stale.stderr, /acceptance|evidence|verif/i)
})

test('a failing acceptance is recorded as failing, with the output that failed', () => {
  const copy = corpus()
  writeTask(copy, readTask(copy).replace(
    "python3 -c 'print(\"acceptance fence complete\")'",
    "python3 -c 'import sys; print(\"boom-marker-line\"); sys.exit(3)'"))

  const failed = verify(copy, ['--cwd', '.'])
  expectExit(failed, 3, 'the gate exits with the acceptance command exit code')

  const log = readTask(copy).split('## Verification Log')[1]
  assert.match(log, /· exit 3 ·/)
  // The last ten output lines are fenced and indented so the reader sees WHY
  // without opening the terminal that ran it.
  assert.match(log, /\n {2}```\n(?: {2}.*\n)*? {2}boom-marker-line\n/)

  markDone(copy)
  const rejected = lint(copy)
  expectExit(rejected, 1, 'a failing entry is not evidence of done')
})

test('a done row is the row\'s own task, not the tasks it depends on', () => {
  // done_task_ids has been defeated twice by table shape: it once anchored on
  // `| T4 | … | done |` and missed link-style ids, and then on cell 0 and missed
  // `| Order | Task | … | Status |` — the shape this project's own fixture uses,
  // which is why check_verification had never run under test at all.
  //
  // Scanning every cell would fix that and break something worse: a Depends-on
  // cell names OTHER tasks, so a done dependent would silently mark its
  // dependencies done. The id is the LEFTMOST cell that names a task.
  const readme = [
    '| Order | Task | Scope | Depends-on | Status |',
    '|-------|------|-------|------------|--------|',
    '| 1 | [T1](T1.md) | S | none | done |',
    '| 2 | [T2](T2.md) | M | T1 | pending |',
    '| 3 | T3 | S | T1, T2 | done |',
  ].join('\n')

  const probe = `import sys, importlib.machinery, importlib.util
# Loading a gate as a module writes bin/__pycache__ next to it, which the package
# test reads as a stray file in the shipped plugin. tests/gate-regressions.py sets
# this for the same reason.
sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader('adr_lint_probe', sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)
print(','.join(module.done_task_ids(sys.argv[2])))`
  const result = run('python3', ['-c', probe, join(bin, 'adr-lint'), readme], root)
  expectExit(result, 0, 'probe')
  // T1 and T3 carry `done` themselves. T2 does not, and must not inherit it from
  // T3's Depends-on cell.
  assert.equal(result.stdout.trim(), 'T1,T3')
})
