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
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
// use. Same reasoning as tests/gates.test.mjs — and the GATE_NAMES guard matters:
// without it `run('python3', …)` rewrites itself into `python3 bin/python3 …`.
// The gates are the extensionless executables; the .cmd files beside them
// are Windows shims that invoke these.
const GATE_NAMES = new Set(readdirSync(bin).filter(name => !name.includes('.')))

function run(command, args, cwd, input = undefined) {
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has(command)
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
  assert.match(log, /\r?\n {2}```\r?\n(?: {2}.*\r?\n)*? {2}boom-marker-line\r?\n/)

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

// A committed git repository, so the entry's sha field is a real sha rather than
// `no-git` — and so adr-verify has a toplevel to resolve when --cwd is omitted.
function gitCorpus() {
  const copy = corpus()
  for (const args of [
    ['init', '-q', '-b', 'main', '.'],
    ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'add', '.'],
    ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qm', 'fixture'],
  ]) {
    const result = spawnSync('git', args, { cwd: copy, env, encoding: 'utf8' })
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`)
  }
  return copy
}

test('the entry names the commit it was produced at, and says when the tree was dirty', () => {
  const copy = gitCorpus()
  // Clean tree: a bare short sha, no marker.
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify on a clean tree')
  const clean = readTask(copy).split('## Verification Log')[1].trim().split('\n')[0]
  const sha = /· ([0-9a-f]{7,40})(\*?) ·/.exec(clean)
  assert.ok(sha, `no sha field in: ${clean}`)
  assert.equal(sha[2], '', 'a clean tree must not carry the dirty marker')

  // The run above wrote the task file, so the tree is dirty now — and evidence
  // produced against uncommitted code has to say so, or it points at a commit
  // that never contained what was tested.
  //
  // The fence lints this very corpus, and passing evidence now obliges a killed
  // mutant, so satisfy that before asking for a second verdict.
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'mutant')
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify on a dirty tree')
  const dirty = readTask(copy).split('## Verification Log')[1].trim().split('\n').at(-1)
  assert.match(dirty, /· [0-9a-f]{7,40}\* ·/)
  assert.equal(sha[1], /· ([0-9a-f]{7,40})\*? ·/.exec(dirty)[1], 'same commit either way')
})

test('without --cwd the acceptance runs at the repository root, not beside the task', () => {
  const copy = gitCorpus()
  // The fence is `adr-lint ADR-001-selftest.md tasks`, which only resolves from
  // the toplevel. Invoked from inside tasks/ with no --cwd, exit 0 is the proof
  // that adr-verify resolved the root rather than defaulting to task.parent.
  const fromSubdir = run('adr-verify', ['T1-fixture.md'], join(copy, 'tasks'))
  expectExit(fromSubdir, 0, 'the toplevel must be resolved from a subdirectory')
  assert.match(readTask(copy), /· exit 0 · `set -e …`/)
})

test('an acceptance that exits 0 having scored nothing is recorded as a failure', () => {
  const copy = corpus()
  // The filter matches no test. pytest says so and exits 0, and a gate that takes
  // that at face value certifies a task whose tests do not exist.
  writeTask(copy, readTask(copy).replace(
    "python3 -c 'print(\"acceptance fence complete\")'",
    "python3 -c 'print(\"no tests ran in 0.01s\")'"))

  const empty = verify(copy, ['--cwd', '.'])
  expectExit(empty, 1, 'exit 0 with nothing scored is not a pass')
  const log = readTask(copy).split('## Verification Log')[1]
  assert.match(log, /· exit 1 ·/)
  assert.match(log, /scored NO tests/)

  markDone(copy)
  expectExit(lint(copy), 1, 'and the reader must not accept it as done')
})

test('an acceptance that scored something is taken at its word, empty package or not', () => {
  const copy = corpus()
  // A multi-package run where one package is empty and another is not really did
  // exercise something. Failing it would be a false alarm, and a gate with false
  // alarms gets ignored — after which it protects nothing.
  writeTask(copy, readTask(copy).replace(
    "python3 -c 'print(\"acceptance fence complete\")'",
    "python3 -c 'print(\"no tests ran in 0.01s\"); print(\"7 passed in 0.42s\")'"))

  expectExit(verify(copy, ['--cwd', '.']), 0, 'evidence of a real result outranks an empty one')
  const log = readTask(copy).split('## Verification Log')[1]
  assert.match(log, /· exit 0 ·/)
  assert.doesNotMatch(log, /scored NO tests/)
})

test('the template placeholders are removed rather than left above the evidence', () => {
  const copy = corpus()
  writeTask(copy, `${readTask(copy).trimEnd()}
<Filled during execution: one line per run>
<Tool-written by adr-verify: date, sha,
 exit code and acceptance digest>
`)
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')

  const log = readTask(copy).split('## Verification Log')[1]
  assert.doesNotMatch(log, /<Filled during execution/)
  assert.doesNotMatch(log, /<Tool-written by/)
  assert.match(log.trim(), /^- \d{4}-\d{2}-\d{2} · /)

  // And the reader accepts what is left: a placeholder surviving here would sit
  // in the log as an unparseable line forever.
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'mutant')
  markDone(copy)
  expectExit(lint(copy), 0, 'adr-lint')
})

test('a human-observed task is signed off, and only a sign-off satisfies its reader', () => {
  const copy = corpus()
  writeTask(copy, readTask(copy).replace(
    /## Acceptance\n\n```bash\n[\s\S]*?```/,
    '## Acceptance\n\nAcceptance is human-observed: a person confirms the fixture reads correctly.'))

  markDone(copy)
  const unsigned = lint(copy)
  expectExit(unsigned, 1, 'a human-observed task marked done needs a sign-off')
  assert.match(unsigned.stdout + unsigned.stderr, /human-observed/)

  expectExit(verify(copy, ['--human', 'Zy read the fixture end to end']), 0, 'adr-verify --human')
  assert.match(readTask(copy), /· human-observed · .*Zy read the fixture end to end/)
  expectExit(lint(copy), 0, 'a signed-off human-observed task is done')
})

// A file the acceptance fence never reads, so a mutation to it cannot be noticed.
function addBlindSpot(copy) {
  const path = join(copy, 'unused.py')
  writeFileSync(path, '# a helper nothing under test imports\nTHRESHOLD = 1\nSECOND = 1\n')
  return path
}

test('a mutant the fence cannot notice is recorded as survived, and does not count', () => {
  const copy = corpus()
  addMutationLog(copy)
  addBlindSpot(copy)

  const survived = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = 99',
    '--why', 'nothing reads this, so nothing can go red',
  ])
  // Non-zero: a survived mutant is a finding about the tests, not a pass.
  expectExit(survived, 1, 'survived must not exit 0')
  assert.match(survived.stdout, /NOT evidence/)

  const log = readTask(copy).split('## Mutation Log')[1]
  assert.match(log, /· mutant survived · exit 0 ·/)
  // The explanation is fenced under the entry so a reader sees why it did not count.
  assert.match(log, /\r?\n {2}```\r?\n {2}the fence passed with the mechanism broken\r?\n {2}```/)
})

test('a mutant that did not land, or landed twice, is refused instead of scored', () => {
  const copy = corpus()
  addMutationLog(copy)
  const target = addBlindSpot(copy)
  const before = readFileSync(target, 'utf8')

  const missing = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', 'NOT_IN_THE_FILE', '--to', 'x', '--why', 'probe',
  ])
  expectExit(missing, 2, 'a mutation that does not land proves nothing')
  assert.match(missing.stdout, /MUTANT DID NOT APPLY/)

  const ambiguous = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', '= 1', '--to', '= 2', '--why', 'probe',
  ])
  expectExit(ambiguous, 2, 'an edit that selects two sites is a different mutant')
  assert.match(ambiguous.stdout, /MUTANT NOT UNIQUE/)

  const cosmetic = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', '# a helper nothing under test imports',
    '--to', '# a helper that nothing under test imports',
    '--why', 'probe',
  ])
  expectExit(cosmetic, 2, 'a comment edit changes nothing the program does')
  assert.match(cosmetic.stdout, /COMMENT-ONLY MUTANT/)

  // A refusal is not a verdict: nothing may be written to the log, and the file
  // must be untouched.
  assert.equal(readFileSync(target, 'utf8'), before, 'the target must be untouched')
  assert.equal(readTask(copy).split('## Mutation Log')[1].trim(), '')
})

test('a mutant that does not parse is skipped, and the file is put back', () => {
  const copy = corpus()
  addMutationLog(copy)
  const target = addBlindSpot(copy)
  const before = readFileSync(target, 'utf8')

  const broken = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = = ',
    '--why', 'probe',
  ])
  expectExit(broken, 2, 'a mutant that does not build has been skipped, not tested')
  assert.match(broken.stdout, /does not parse/)

  // The restore lives in a `finally`, and this is the path that proves it: the
  // exit happens with the file already mutated.
  assert.equal(readFileSync(target, 'utf8'), before, 'the target must be restored')
  assert.equal(readTask(copy).split('## Mutation Log')[1].trim(), '')
})

test('writing evidence keeps the line endings the file already had', () => {
  // Path.write_text translates "\n" to os.linesep, so on Windows every append
  // silently converted the task file and the mutant `finally` restore rewrote the
  // file it was meant to put back — a refused mutant left the target changed.
  // Reproduced here by giving the gate CRLF input, which is what a Windows
  // checkout hands it.
  const copy = corpus()
  const crlf = text => text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
  writeTask(copy, crlf(readTask(copy)))
  addMutationLog(copy)

  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')
  const written = readFileSync(taskPath(copy), 'utf8')
  assert.ok(written.includes('\r\n'), 'a CRLF file must stay CRLF')
  assert.doesNotMatch(written, /[^\r]\n/, 'and must not acquire bare LF lines')
  assert.match(written, /· exit 0 · .*\r\n/, 'the appended entry uses the file\'s own ending')

  // A refused mutant must leave the target byte-identical — the restore is the
  // only thing standing between a rejected mutation and a corrupted working tree.
  const target = addBlindSpot(copy)
  writeFileSync(target, crlf(readFileSync(target, 'utf8')))
  const before = readFileSync(target)
  expectExit(verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = = ', '--why', 'probe',
  ]), 2, 'the mutant does not parse')
  assert.deepEqual(readFileSync(target), before, 'byte-identical restore')

  // An LF file must not be converted the other way either.
  const lf = corpus()
  expectExit(verify(lf, ['--cwd', '.']), 0, 'adr-verify on an LF file')
  assert.doesNotMatch(readFileSync(taskPath(lf), 'utf8'), /\r/, 'an LF file must stay LF')
})

test('the mutated file the fence sees keeps its line endings too', () => {
  // The mutant write is the one rewrite whose result is invisible afterwards —
  // the restore puts the file back either way, so nothing downstream can tell it
  // converted. What CAN tell is the acceptance command, which runs while the
  // mutant is in place. So the fence here reports on the target's own bytes.
  const copy = corpus()
  addMutationLog(copy)
  const target = addBlindSpot(copy)
  writeFileSync(target, readFileSync(target, 'utf8').replace(/\n/g, '\r\n'))

  // A checker rather than a one-liner in the fence: the assertion is about bytes,
  // and burying it in three layers of quoting is how it stops asserting.
  writeFileSync(join(copy, 'check_crlf.py'),
    "import sys\nsys.exit(0 if b'\\r\\n' in open('unused.py','rb').read() else 1)\n")
  writeTask(copy, readTask(copy).replace(
    /## Acceptance\n\n```bash\n[\s\S]*?```/,
    '## Acceptance\n\n```bash\npython3 check_crlf.py\n```'))

  const mutated = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = 99',
    '--why', 'the fence must still see CRLF while the mutant is in place',
  ])
  // survived, not killed: the fence passes because the endings were preserved.
  // A translating write would blank the CRLF and the fence would go red, which
  // adr-verify would score as `killed` — a verdict about the writer, not the test.
  expectExit(mutated, 1, 'the fence must not go red merely because the file was rewritten')
  assert.match(readTask(copy), /· mutant survived ·/)
})
