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
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
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
const GATE_NAMES = new Set(readdirSync(bin, { withFileTypes: true })
  .filter(e => e.isFile() && !e.name.includes('.')).map(e => e.name))

function run(command, args, cwd, input = undefined, extraEnv = undefined) {
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has(command)
    ? ['python3', [join(bin, command), ...args]]
    : [command, args]
  return spawnSync(file, argv, {
    cwd, env: extraEnv ? { ...env, ...extraEnv } : env, input, encoding: 'utf8', timeout: 60_000,
  })
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
  '--from', '## Alternatives Considered', '--to', '## Alternatives Considred',
  '--why', 'adr-lint must notice its required alternatives section going missing',
])

test('adr-lint accepts the entry adr-verify wrote, as it wrote it', () => {
  const copy = corpus()
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'the mutant must be killed')
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')

  const entry = readTask(copy).split('## Verification Log')[1]
    .split('## Mutation Log')[0].trim()
  // The shape the readers parse, asserted on the real line rather than on a
  // reconstruction: date · sha · exit · command · digest.
  // ADR-020 appends ` · ms:<integer>`, and the field is asserted rather than
  // made optional here: this test is about what adr-verify ACTUALLY WROTE, so a
  // pattern that tolerated its absence would stop noticing if the writer dropped
  // it. The optional-before-a-cutover spelling belongs in the readers.
  //
  // This was the FIFTH place the entry grammar is written down — two patterns in
  // adr-lint, one in adr-next, the writer's own refusal check, and here. The
  // parent record predicted a fourth. That count is the real cost of the field.
  // EVERY line, not the section as one blob. Since ADR-025 the `--mutant` run
  // records the clean fence it takes, so this task now carries two entries — two
  // runs really happened — and a whole-section match would only ever assert the
  // single-entry case. Asserting each line is the stronger form anyway.
  const written = entry.split('\n').filter(l => l.startsWith('- '))
  assert.equal(written.length, 2, `expected the mutant's entry and the plain one:\n${entry}`)
  for (const line of written) {
    assert.match(line, /^- \d{4}-\d{2}-\d{2} · (?:[0-9a-f]{7,40}\*?|no-git) · exit 0 · `[^`]+` · acceptance-sha256:[0-9a-f]{64} · ms:\d+$/)
  }

  const mutation = readTask(copy).split('## Mutation Log')[1].trim()
  assert.match(mutation, /^- \d{4}-\d{2}-\d{2} · (?:[0-9a-f]{7,40}\*?|no-git) · mutant killed · exit \d+ · `[^`]+` · [^·]+ · acceptance-sha256:[0-9a-f]{64}$/)

  markDone(copy)
  expectExit(lint(copy), 0, 'adr-lint must accept its own writer output')
})

test('editing the Acceptance fence invalidates the evidence already written', () => {
  const copy = corpus()
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'the mutant must be killed')
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')
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
  // Mutation evidence comes first in the execution protocol. Commit that row in
  // this disposable repository so the first Verification entry can still prove
  // the clean-tree SHA behavior this test owns.
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'mutant')
  for (const args of [
    ['add', '.'],
    ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qm', 'mutation evidence'],
  ]) {
    const result = spawnSync('git', args, { cwd: copy, env, encoding: 'utf8' })
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`)
  }
  // Clean tree: a bare short sha, no marker.
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify on a clean tree')
  const clean = readTask(copy).split('## Verification Log')[1]
  // The LAST entry is the one the run above wrote. Since ADR-025 the mutation
  // pass records its own clean run too, and that earlier entry is legitimately
  // marked dirty: addMutationLog() edited the task file before it ran, so the
  // tree really was uncommitted. Reading `[0]` here would assert the dirty
  // marker against an entry that is correct to carry it.
    .split('## Mutation Log')[0].trim().split('\n').filter(l => l.startsWith('- ')).at(-1)
  const sha = /· ([0-9a-f]{7,40})(\*?) ·/.exec(clean)
  assert.ok(sha, `no sha field in: ${clean}`)
  assert.equal(sha[2], '', 'a clean tree must not carry the dirty marker')

  // The run above wrote the task file, so the tree is dirty now — and evidence
  // produced against uncommitted code has to say so, or it points at a commit
  // that never contained what was tested.
  //
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify on a dirty tree')
  const dirty = readTask(copy).split('## Verification Log')[1]
    .split('## Mutation Log')[0].trim().split('\n').at(-1)
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
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'mutant')
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')

  const log = readTask(copy).split('## Verification Log')[1]
  assert.doesNotMatch(log, /<Filled during execution/)
  assert.doesNotMatch(log, /<Tool-written by/)
  assert.match(log.trim(), /^- \d{4}-\d{2}-\d{2} · /)

  // And the reader accepts what is left: a placeholder surviving here would sit
  // in the log as an unparseable line forever.
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

test('adr-verify requires a clean fence before it mutates', () => {
  const mutationArgs = [
    'tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'unused.py',
    '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = 99',
    '--why', 'nothing reads this, so nothing can go red',
  ]
  const execute = (label, fence, extraEnv = undefined, blockJournal = false) => {
    const copy = corpus()
    addMutationLog(copy)
    const target = addBlindSpot(copy)
    const before = readFileSync(target)
    writeTask(copy, readTask(copy).replace(
      /## Acceptance\n\n```bash\n[\s\S]*?```/,
      `## Acceptance\n\n\`\`\`bash\n${fence}\n\`\`\``))

    const journalRoot = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
    temps.push(journalRoot)
    const journal = blockJournal ? join(journalRoot, 'not-a-directory') : journalRoot
    if (blockJournal) writeFileSync(journal, 'this path prevents the journal directory being armed\n')
    const result = runWith(journal, mutationArgs, copy, extraEnv)
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    return {
      label,
      status: result.status,
      output,
      mutationLog: readTask(copy).split('## Mutation Log')[1].trim(),
      mutantApplied: /MUTANT APPLIED/.test(output),
      targetRestored: readFileSync(target).equals(before),
      journalEmpty: blockJournal ? null : readdirSync(journal).length === 0,
      baselineRan: existsSync(join(copy, 'baseline-ran.txt')),
    }
  }

  // Execute every control before asserting, so the RED report names the whole
  // current contract gap instead of stopping after the first donated failure.
  const preRed = execute('pre-red',
    `python3 -c 'print("1 failed in 0.01s"); raise SystemExit(1)'`)
  const noTests = execute('no-tests',
    `python3 -c 'print("no tests ran in 0.01s")'`)
  const missingRunner = execute('environment', 'nosuchrunner --run-everything')
  const cleanTimeout = execute('clean-timeout', 'echo starting; sleep 30',
    { QUALITY_HARNESS_FENCE_TIMEOUT: '1' })
  const journalFailure = execute('journal-arm-failure',
    [
      `python3 -c 'from pathlib import Path; Path("baseline-ran.txt").write_text("ran")'`,
      `python3 -c 'print("1 passed in 0.01s")'`,
    ].join('\n'), undefined, true)
  const survivor = execute('clean-pass',
    `python3 -c 'print("1 passed in 0.01s")'`)
  const mutantTimeout = execute('mutant-timeout', [
    "if grep -q 'THRESHOLD = 99' unused.py; then",
    '  echo mutant-started; sleep 30',
    'else',
    "  echo '1 passed in 0.01s'",
    'fi',
  ].join('\n'), { QUALITY_HARNESS_FENCE_TIMEOUT: '1' })
  const mutantBuild = execute('mutant-build', [
    "if grep -q 'THRESHOLD = 99' unused.py; then",
    "  echo '[build failed]'; exit 1",
    'else',
    "  echo '1 passed in 0.01s'",
    'fi',
  ].join('\n'))
  const mutantEnvironment = execute('mutant-environment', [
    "if grep -q 'THRESHOLD = 99' unused.py; then",
    "  echo 'Cannot connect to the Docker daemon'; exit 1",
    'else',
    "  echo '1 passed in 0.01s'",
    'fi',
  ].join('\n'))
  const mutantCrash = execute('mutant-crash', [
    "if grep -q 'THRESHOLD = 99' unused.py; then",
    "  echo 'Segmentation fault (core dumped)' >&2; exit 139",
    'else',
    "  echo '1 passed in 0.01s'",
    'fi',
  ].join('\n'))

  const baselineRefusal = run => ({
    label: run.label,
    status: run.status,
    unproven: /UNPROVEN/.test(run.output),
    mutantApplied: run.mutantApplied,
    targetRestored: run.targetRestored,
    mutationLogEmpty: run.mutationLog === '',
    journalEmpty: run.journalEmpty,
  })
  const survivorText = `${survivor.output}\n${survivor.mutationLog}`
  assert.deepEqual({
    baselineRefusals: [preRed, noTests, missingRunner, cleanTimeout].map(baselineRefusal),
    journalFailure: {
      refused: journalFailure.status !== 0,
      namesJournal: /journal/i.test(journalFailure.output),
      mutantApplied: journalFailure.mutantApplied,
      targetRestored: journalFailure.targetRestored,
      mutationLogEmpty: journalFailure.mutationLog === '',
      baselineRan: journalFailure.baselineRan,
    },
    survivor: {
      status: survivor.status,
      mutantApplied: survivor.mutantApplied,
      targetRestored: survivor.targetRestored,
      journalEmpty: survivor.journalEmpty,
      rowWritten: /mutant survived/.test(survivor.mutationLog),
      namesReachabilitySeam: /may not materialize, compile, load, or assert on the changed path/.test(survivorText),
    },
    mutantTimeout: {
      status: mutantTimeout.status,
      unrun: /UNRUN/.test(mutantTimeout.output),
      mutantApplied: mutantTimeout.mutantApplied,
      targetRestored: mutantTimeout.targetRestored,
      mutationLogEmpty: mutantTimeout.mutationLog === '',
      journalEmpty: mutantTimeout.journalEmpty,
    },
    mutantBuild: {
      status: mutantBuild.status,
      inconclusive: /mutant inconclusive/.test(mutantBuild.mutationLog),
      targetRestored: mutantBuild.targetRestored,
      journalEmpty: mutantBuild.journalEmpty,
    },
    mutantEnvironment: {
      status: mutantEnvironment.status,
      inconclusive: /mutant inconclusive/.test(mutantEnvironment.mutationLog),
      targetRestored: mutantEnvironment.targetRestored,
      journalEmpty: mutantEnvironment.journalEmpty,
    },
    mutantCrash: {
      status: mutantCrash.status,
      inconclusive: /mutant inconclusive/.test(mutantCrash.mutationLog),
      killed: /mutant killed/.test(mutantCrash.mutationLog),
      targetRestored: mutantCrash.targetRestored,
      journalEmpty: mutantCrash.journalEmpty,
    },
  }, {
    baselineRefusals: [
      { label: 'pre-red', status: 1, unproven: true, mutantApplied: false, targetRestored: true, mutationLogEmpty: true, journalEmpty: true },
      { label: 'no-tests', status: 1, unproven: true, mutantApplied: false, targetRestored: true, mutationLogEmpty: true, journalEmpty: true },
      { label: 'environment', status: 1, unproven: true, mutantApplied: false, targetRestored: true, mutationLogEmpty: true, journalEmpty: true },
      { label: 'clean-timeout', status: 1, unproven: true, mutantApplied: false, targetRestored: true, mutationLogEmpty: true, journalEmpty: true },
    ],
    journalFailure: {
      refused: true,
      namesJournal: true,
      mutantApplied: false,
      targetRestored: true,
      mutationLogEmpty: true,
      baselineRan: false,
    },
    survivor: {
      status: 1,
      mutantApplied: true,
      targetRestored: true,
      journalEmpty: true,
      rowWritten: true,
      namesReachabilitySeam: true,
    },
    mutantTimeout: {
      status: 2,
      unrun: true,
      mutantApplied: true,
      targetRestored: true,
      mutationLogEmpty: true,
      journalEmpty: true,
    },
    mutantBuild: {
      status: 1,
      inconclusive: true,
      targetRestored: true,
      journalEmpty: true,
    },
    mutantEnvironment: {
      status: 1,
      inconclusive: true,
      targetRestored: true,
      journalEmpty: true,
    },
    mutantCrash: {
      status: 1,
      inconclusive: true,
      killed: false,
      targetRestored: true,
      journalEmpty: true,
    },
  })
})

test('adr-verify restores declared generated outputs with their source', async () => {
  const sourceEntry = Buffer.from('STATE = "clean"\n')
  const generatedEntry = Buffer.from([0x00, 0xff, 0x45, 0x4e, 0x54, 0x52, 0x59, 0x0a])
  const safeEntry = Buffer.from([0x53, 0x41, 0x46, 0x45, 0x00, 0xfe, 0x0a])
  const mutationArgs = restores => [
    'tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'view.templ',
    '--from', 'STATE = "clean"', '--to', 'STATE = "broken"',
    '--why', 'the generated consumer must reflect the deliberately broken source',
    ...restores.flatMap(path => ['--also-restore', path]),
  ]
  const setFence = (copy, command) => writeTask(copy, readTask(copy).replace(
    /## Acceptance\n\n```bash\n[\s\S]*?```/,
    `## Acceptance\n\n\`\`\`bash\n${command}\n\`\`\``))
  const newJournalHome = () => {
    const home = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
    temps.push(home)
    return home
  }
  const journalPath = (home, copy) => {
    // A legacy journal was named by Python's resolved cwd. Node and Python can
    // spell the same Windows temp path differently, so seed the fixture with
    // the writer's runtime instead of reproducing its path semantics in Node.
    const keyed = run('python3', ['-c', [
      'import hashlib',
      'from pathlib import Path',
      'print(hashlib.sha256(str(Path.cwd().resolve()).encode("utf-8")).hexdigest()[:16])',
    ].join('; ')], copy)
    expectExit(keyed, 0, 'Python must resolve the cwd used to name the legacy journal')
    const key = keyed.stdout.trim()
    assert.match(key, /^[0-9a-f]{16}$/, 'legacy journal key must be one complete digest prefix')
    return join(home, `adr-verify-mutant-${key}.json`)
  }
  const mutationLog = copy => readTask(copy).split('## Mutation Log')[1]?.trim() ?? ''
  const eventually = async predicate => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (predicate()) return true
      await setTimeout(25)
    }
    return predicate()
  }
  const spawnWithJournal = (copy, journal, args) => {
    const win = process.platform === 'win32'
    const child = spawn(win ? 'python3' : join(bin, 'adr-verify'),
      win ? [join(bin, 'adr-verify'), ...args] : args,
      { cwd: copy, env: { ...env, CLAUDE_PLUGIN_DATA: journal } })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    return { child, exited: once(child, 'exit'), output: () => output }
  }

  // The clean and mutant phases both run the real generator. Its trace records
  // what it found BEFORE writing: the second pair proves the clean phase was
  // rolled back before the mutant phase, not merely repaired at final cleanup.
  const generated = corpus()
  addMutationLog(generated)
  writeFileSync(join(generated, 'view.templ'), sourceEntry)
  writeFileSync(join(generated, 'view_templ.go'), generatedEntry)
  writeFileSync(join(generated, 'generate.py'), `from pathlib import Path
import sys

source = Path("view.templ").read_bytes()
existing = Path("view_templ.go")
absent = Path("view_templ.map")
entry = bytes([0, 255, 69, 78, 84, 82, 89, 10])
with Path("phase-trace.txt").open("a", encoding="utf-8") as trace:
    trace.write(("existing-entry" if existing.exists() and existing.read_bytes() == entry else "existing-dirty") + "\\n")
    trace.write(("absent-entry" if not absent.exists() else "absent-dirty") + "\\n")
existing.write_bytes(b"generated:" + source)
absent.write_bytes(b"map:" + source)
if b'"broken"' in existing.read_bytes():
    print("test_generated_consumer FAILED")
    print("1 failed in 0.01s")
    sys.exit(1)
print("test_generated_consumer PASSED")
print("1 passed in 0.01s")
`)
  setFence(generated, 'python3 generate.py')
  const generatedJournal = newJournalHome()
  const generatedRun = runWith(generatedJournal,
    mutationArgs(['view_templ.go', 'view_templ.map']), generated)
  expectExit(generatedRun, 0, 'a generated consumer going red kills the source mutant')
  assert.match(mutationLog(generated), /mutant killed/, 'the generated failure must be the verdict')
  assert.deepEqual(readFileSync(join(generated, 'view.templ')), sourceEntry,
    'the source must regain its exact entry bytes')
  assert.deepEqual(readFileSync(join(generated, 'view_templ.go')), generatedEntry,
    'an existing generated output must regain its exact entry bytes')
  assert.equal(existsSync(join(generated, 'view_templ.map')), false,
    'an output absent at entry must be absent after cleanup')
  assert.deepEqual(readFileSync(join(generated, 'phase-trace.txt'), 'utf8').trim().split(/\r?\n/), [
    'existing-entry', 'absent-entry', 'existing-entry', 'absent-entry',
  ], 'the clean phase outputs must be reset before the mutant fence starts')
  assert.deepEqual(readdirSync(generatedJournal), [], 'complete cleanup must remove its journal')

  // An absent leaf may sit below parents that do not exist yet. The generator,
  // not the restore transaction, owns creating those directories; cleanup owns
  // only returning the explicitly declared leaf to absent.
  {
    const copy = corpus()
    addMutationLog(copy)
    writeFileSync(join(copy, 'view.templ'), sourceEntry)
    writeFileSync(join(copy, 'generate_nested.py'), `from pathlib import Path
import sys

source = Path("view.templ").read_bytes()
output = Path("generated/deep/view.go")
with Path("nested-trace.txt").open("a", encoding="utf-8") as trace:
    trace.write(("absent-entry" if not output.exists() else "dirty-entry") + "\\n")
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(b"generated:" + source)
if b'"broken"' in output.read_bytes():
    print("test_nested_generated_consumer FAILED")
    print("1 failed in 0.01s")
    sys.exit(1)
print("test_nested_generated_consumer PASSED")
print("1 passed in 0.01s")
`)
    setFence(copy, 'python3 generate_nested.py')
    const journal = newJournalHome()
    const result = runWith(journal, mutationArgs(['generated/deep/view.go']), copy)
    expectExit(result, 0,
      'a safe nearest ancestor permits a generated leaf below missing intermediate directories')
    assert.match(mutationLog(copy), /mutant killed/,
      'the nested generated consumer must kill the source mutant')
    assert.deepEqual(readFileSync(join(copy, 'view.templ')), sourceEntry,
      'nested generation did not restore the source')
    assert.equal(existsSync(join(copy, 'generated', 'deep', 'view.go')), false,
      'the absent-at-entry nested leaf survived cleanup')
    assert.deepEqual(readFileSync(join(copy, 'nested-trace.txt'), 'utf8').trim().split(/\r?\n/), [
      'absent-entry', 'absent-entry',
    ], 'the clean-phase nested leaf was not removed before the mutant phase')
    assert.deepEqual(readdirSync(journal), [], 'nested leaf cleanup left a journal')
  }

  // Catchable interruption is still an in-process transaction. Both signals
  // arrive only after the mutant fence has changed both secondary members.
  if (process.platform !== 'win32') {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const copy = corpus()
      addMutationLog(copy)
      writeFileSync(join(copy, 'view.templ'), sourceEntry)
      writeFileSync(join(copy, 'view_templ.go'), generatedEntry)
      writeFileSync(join(copy, 'interrupt.py'), `from pathlib import Path
import sys
import time

source = Path("view.templ").read_bytes()
Path("view_templ.go").write_bytes(b"generated:" + source)
Path("view_templ.map").write_bytes(b"map:" + source)
if b'"broken"' in source:
    Path("mutant-ready").write_text("ready", encoding="utf-8")
    time.sleep(60)
    sys.exit(1)
print("1 passed in 0.01s")
`)
      setFence(copy, 'python3 interrupt.py')
      const journal = newJournalHome()
      const running = spawnWithJournal(copy, journal,
        mutationArgs(['view_templ.go', 'view_templ.map']))
      const ready = await eventually(() => existsSync(join(copy, 'mutant-ready')))
      if (!ready) running.child.kill('SIGKILL')
      assert.ok(ready, `${signal}: the mutant fence never reached the interrupt point\n${running.output()}`)
      running.child.kill(signal)
      await running.exited
      assert.deepEqual(readFileSync(join(copy, 'view.templ')), sourceEntry,
        `${signal}: source bytes were not restored`)
      assert.deepEqual(readFileSync(join(copy, 'view_templ.go')), generatedEntry,
        `${signal}: existing generated bytes were not restored`)
      assert.equal(existsSync(join(copy, 'view_templ.map')), false,
        `${signal}: absent-at-entry output was not removed`)
      assert.equal(mutationLog(copy), '', `${signal}: an interrupted mutant has no verdict`)
      assert.deepEqual(readdirSync(journal), [], `${signal}: complete cleanup left a journal`)
    }
  }

  // Compatibility is behavioral: seed the exact flat journal written by the
  // prior release, then ask the shipped CLI to recover it.
  {
    const copy = corpus()
    const journal = newJournalHome()
    const target = join(copy, 'legacy.py')
    const original = Buffer.from('VALUE = 1\n')
    const mutant = Buffer.from('VALUE = 99\n')
    writeFileSync(target, mutant)
    const record = journalPath(journal, copy)
    writeFileSync(record, JSON.stringify({
      file: target,
      original: original.toString('base64'),
      mutated: mutant.toString('base64'),
      from: 'VALUE = 1',
      to: 'VALUE = 99',
      why: 'legacy recovery control',
      cmd: 'python3 legacy_test.py',
    }))
    const restored = runWith(journal, ['--restore', '--cwd', '.'], copy)
    expectExit(restored, 0, 'a pre-version one-file journal remains recoverable')
    assert.deepEqual(readFileSync(target), original, 'legacy recovery changed the original bytes')
    assert.equal(existsSync(record), false, 'a completely recovered legacy journal must be removed')
  }

  const seedLegacyJournal = (journal, copy, file, original, mutant) => {
    const record = journalPath(journal, copy)
    writeFileSync(record, JSON.stringify({
      file,
      original: original.toString('base64'),
      mutated: mutant.toString('base64'),
      from: 'VALUE = 1',
      to: 'VALUE = 99',
      why: 'legacy relative-path recovery control',
      cmd: 'python3 legacy_test.py',
    }))
    return record
  }
  const recoverLegacyFromElsewhere = (copy, journal) =>
    runWith(journal, ['--restore', '--cwd', copy], repoRoot)
  const ordinaryFromElsewhere = (copy, journal) =>
    runWith(journal, [taskPath(copy), '--cwd', copy], repoRoot)

  // Old journals could store a repository-relative target. Recovery authority
  // comes from their declared --cwd, never from the launcher's working directory.
  {
    const copy = corpus()
    const journal = newJournalHome()
    const relative = 'legacy-relative.py'
    const target = join(copy, relative)
    const original = Buffer.from('VALUE = 1\n')
    const mutant = Buffer.from('VALUE = 99\n')
    writeFileSync(target, mutant)
    const record = seedLegacyJournal(journal, copy, relative, original, mutant)
    const restored = recoverLegacyFromElsewhere(copy, journal)
    expectExit(restored, 0, 'a relative legacy target is anchored to its declared --cwd')
    assert.deepEqual(readFileSync(target), original,
      'relative legacy recovery looked in the launcher cwd instead of --cwd')
    assert.equal(existsSync(record), false, 'resolved relative legacy recovery retained its journal')
  }

  // The prior release could persist a cwd-prefixed relative expression. Both
  // root/file.py (historical launch-relative meaning) and root/root/file.py
  // (repository-relative meaning) stay inside the declared cwd. Presence and
  // known bytes cannot prove which identity the old process meant, so every
  // shape remains blocked rather than guessed.
  const cwdPrefixedShapes = [
    { label: 'historical mutant and nested missing', historical: 'mutant', nested: 'missing' },
    { label: 'historical moved-on and nested mutant', historical: 'moved', nested: 'mutant' },
    { label: 'historical missing and nested original', historical: 'missing', nested: 'original' },
  ]
  for (const [index, shape] of cwdPrefixedShapes.entries()) {
    const copy = corpus()
    const launcher = dirname(copy)
    const relativeCwd = basename(copy)
    const journal = newJournalHome()
    const leaf = `legacy-prefixed-${index}.py`
    const relative = join(relativeCwd, leaf)
    const historicalTarget = join(copy, leaf)
    const rootRelativeTarget = join(copy, relativeCwd, leaf)
    const original = Buffer.from('VALUE = 1\n')
    const mutant = Buffer.from('VALUE = 99\n')
    const moved = Buffer.from('VALUE = 7  # concurrent edit\n')
    const bytes = { original, mutant, moved, missing: null }
    const place = (path, state) => {
      const value = bytes[state]
      if (value === null) return
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, value)
    }
    const unchanged = (path, state, identity) => {
      const value = bytes[state]
      if (value === null) {
        assert.equal(existsSync(path), false, `${shape.label}: ${identity} was created`)
      } else {
        assert.deepEqual(readFileSync(path), value, `${shape.label}: ${identity} was overwritten`)
      }
    }
    place(historicalTarget, shape.historical)
    place(rootRelativeTarget, shape.nested)
    setFence(copy,
      `python3 -c 'from pathlib import Path; Path("measured.txt").write_text("ran"); print("1 passed in 0.01s")'`)
    const record = seedLegacyJournal(journal, copy, relative, original, mutant)

    const explicit = runWith(journal, ['--restore', '--cwd', relativeCwd], launcher)
    assert.notEqual(explicit.status, 0, `${shape.label}: ambiguous legacy identity was guessed`)
    assert.match(`${explicit.stdout}${explicit.stderr}`, /ambig|multiple|candidate|reconcil/i,
      `${shape.label}: recovery did not explain why it retained the journal`)
    unchanged(historicalTarget, shape.historical, 'historical interpretation')
    unchanged(rootRelativeTarget, shape.nested, 'nested interpretation')
    assert.ok(existsSync(record), `${shape.label}: recovery discarded its journal`)

    const ordinary = runWith(journal,
      [taskPath(copy), '--cwd', relativeCwd], launcher)
    assert.notEqual(ordinary.status, 0, `${shape.label}: ordinary verification ignored ambiguity`)
    assert.equal(existsSync(join(copy, 'measured.txt')), false,
      `${shape.label}: Acceptance ran before the journal was reconciled`)
    unchanged(historicalTarget, shape.historical, 'historical interpretation')
    unchanged(rootRelativeTarget, shape.nested, 'nested interpretation')
    assert.ok(existsSync(record), `${shape.label}: ordinary recovery discarded the journal`)
  }

  // A cwd-prefixed traversal has one historical reading outside the declared
  // repository and another normalized reading inside it. Neither containment
  // nor known bytes grants authority to choose: legacy `..` is always refused.
  {
    const copy = corpus()
    const launcher = dirname(copy)
    const relativeCwd = basename(copy)
    const journal = newJournalHome()
    const relative = `${relativeCwd}/../outside.py`
    const historicalOutside = join(launcher, 'outside.py')
    const rootRelativeInside = join(copy, 'outside.py')
    const original = Buffer.from('VALUE = 1\n')
    const mutant = Buffer.from('VALUE = 99\n')
    writeFileSync(historicalOutside, mutant)
    writeFileSync(rootRelativeInside, original)
    setFence(copy,
      `python3 -c 'from pathlib import Path; Path("measured.txt").write_text("ran"); print("1 passed in 0.01s")'`)
    const record = seedLegacyJournal(journal, copy, relative, original, mutant)

    const explicit = runWith(journal, ['--restore', '--cwd', relativeCwd], launcher)
    assert.notEqual(explicit.status, 0, 'legacy traversal was resolved by guessing a candidate')
    assert.match(`${explicit.stdout}${explicit.stderr}`, /travers|outside|unsafe|reconcil|\.\./i,
      'legacy traversal refusal did not explain the unsafe spelling')
    assert.deepEqual(readFileSync(historicalOutside), mutant,
      'legacy traversal recovery changed the outside historical candidate')
    assert.deepEqual(readFileSync(rootRelativeInside), original,
      'legacy traversal recovery changed the in-root candidate')
    assert.ok(existsSync(record), 'legacy traversal recovery discarded its journal')

    const ordinary = runWith(journal,
      [taskPath(copy), '--cwd', relativeCwd], launcher)
    assert.notEqual(ordinary.status, 0, 'ordinary verification ignored a legacy traversal journal')
    assert.equal(existsSync(join(copy, 'measured.txt')), false,
      'Acceptance ran before the legacy traversal was reconciled')
    assert.deepEqual(readFileSync(historicalOutside), mutant,
      'blocked ordinary recovery changed the outside historical candidate')
    assert.deepEqual(readFileSync(rootRelativeInside), original,
      'blocked ordinary recovery changed the in-root candidate')
    assert.ok(existsSync(record), 'ordinary recovery discarded the legacy traversal journal')
  }

  const assertLegacyBlocks = ({ label, copy, journal, record, relative, preserved }) => {
    setFence(copy,
      `python3 -c 'from pathlib import Path; Path("measured.txt").write_text("ran"); print("1 passed in 0.01s")'`)
    const explicit = recoverLegacyFromElsewhere(copy, journal)
    assert.notEqual(explicit.status, 0, `${label}: --restore claimed an ambiguous legacy target was resolved`)
    assert.match(`${explicit.stdout}${explicit.stderr}`,
      new RegExp(`${relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|legacy`, 'i'),
    `${label}: recovery did not name the legacy target`)
    assert.match(`${explicit.stdout}${explicit.stderr}`, /unresolved|reconcil|missing|changed|symlink|junction/i,
      `${label}: recovery did not explain why it refused`)
    assert.ok(existsSync(record), `${label}: recovery discarded the unresolved journal`)
    preserved()

    const ordinary = ordinaryFromElsewhere(copy, journal)
    assert.notEqual(ordinary.status, 0, `${label}: an ordinary run ignored unresolved legacy state`)
    assert.equal(existsSync(join(copy, 'measured.txt')), false,
      `${label}: the ordinary Acceptance fence ran before legacy reconciliation`)
    assert.ok(existsSync(record), `${label}: the ordinary run discarded the unresolved journal`)
    preserved()
  }

  for (const state of ['missing', 'moved-on']) {
    const copy = corpus()
    const journal = newJournalHome()
    const relative = `legacy-${state}.py`
    const target = join(copy, relative)
    const original = Buffer.from('VALUE = 1\n')
    const mutant = Buffer.from('VALUE = 99\n')
    const moved = Buffer.from('VALUE = 7  # concurrent edit\n')
    if (state === 'moved-on') writeFileSync(target, moved)
    const record = seedLegacyJournal(journal, copy, relative, original, mutant)
    assertLegacyBlocks({
      label: `${state} legacy mutant target`, copy, journal, record, relative,
      preserved: () => state === 'missing'
        ? assert.equal(existsSync(target), false, 'missing legacy target was recreated')
        : assert.deepEqual(readFileSync(target), moved, 'moved-on legacy bytes were overwritten'),
    })
  }

  if (process.platform !== 'win32') {
    const legacySymlinkCase = (label, relative, swap, inspect) => {
      const copy = corpus()
      const journal = newJournalHome()
      const target = join(copy, ...relative.split('/'))
      const original = Buffer.from('VALUE = 1\n')
      const mutant = Buffer.from('VALUE = 99\n')
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, mutant)
      const record = seedLegacyJournal(journal, copy, relative, original, mutant)
      swap(copy, target, mutant)
      assertLegacyBlocks({
        label, copy, journal, record, relative,
        preserved: () => inspect(copy, mutant),
      })
    }

    legacySymlinkCase('legacy target swapped to a direct symlink', 'legacy-direct.py',
      (copy, target, mutant) => {
        const outside = join(dirname(copy), 'legacy-direct-outside.py')
        writeFileSync(outside, mutant)
        rmSync(target)
        symlinkSync(outside, target)
      }, (copy, mutant) => {
        const target = join(copy, 'legacy-direct.py')
        const outside = join(dirname(copy), 'legacy-direct-outside.py')
        assert.ok(lstatSync(target).isSymbolicLink(), 'direct legacy symlink was replaced')
        assert.deepEqual(readFileSync(outside), mutant, 'legacy recovery followed a direct symlink')
      })

    legacySymlinkCase('legacy target swapped below a symlink ancestor', 'legacy-dir/legacy.py',
      (copy, target, mutant) => {
        const outside = mkdtempSync(join(os.tmpdir(), 'quality-harness-outside-'))
        temps.push(outside)
        writeFileSync(join(outside, 'legacy.py'), mutant)
        rmSync(dirname(target), { recursive: true })
        symlinkSync(outside, join(copy, 'legacy-dir'))
      }, (copy, mutant) => {
        const ancestor = join(copy, 'legacy-dir')
        assert.ok(lstatSync(ancestor).isSymbolicLink(), 'legacy ancestor symlink was replaced')
        assert.deepEqual(readFileSync(join(ancestor, 'legacy.py')), mutant,
          'legacy recovery followed a symlink ancestor')
      })
  }

  // pathlib.Path.is_junction() arrived after Python 3.11. The transaction must
  // therefore classify the lstat result itself: every Windows reparse point is
  // unsafe, even when an older Path object cannot name it as a junction.
  {
    const probe = `import importlib.machinery
import importlib.util
import stat
import sys

sys.dont_write_bytecode = True
loader = importlib.machinery.SourceFileLoader("adr_verify_junction_probe", sys.argv[1])
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)

class Info:
    def __init__(self, mode, attributes=None, tag=None):
        self.st_mode = mode
        if attributes is not None:
            self.st_file_attributes = attributes
        if tag is not None:
            self.st_reparse_tag = tag

cases = [
    Info(stat.S_IFREG | 0o644),
    Info(stat.S_IFLNK | 0o777),
    Info(stat.S_IFDIR | 0o755, 0x0400, 0xA0000003),
    Info(stat.S_IFREG | 0o644, 0x0400, 0xDEADBEEF),
]
print(",".join("1" if module._is_linklike(info) else "0" for info in cases))
`
    const junctions = run('python3', ['-c', probe, join(bin, 'adr-verify')], root)
    expectExit(junctions, 0, 'junction classification must be injectable on every host')
    assert.equal(junctions.stdout.trim(), '0,1,1,1',
      'regular, symlink, junction, and unknown-reparse lstat results were misclassified')
  }

  // SIGKILL cannot unwind. The source has a known mutant value and may be put
  // back; generated bytes do not, so recovery must preserve and name them and
  // keep blocking every later measurement until a human reconciles the file.
  let versionedJournal
  {
    const copy = corpus()
    addMutationLog(copy)
    writeFileSync(join(copy, 'view.templ'), sourceEntry)
    writeFileSync(join(copy, 'view_templ.go'), generatedEntry)
    writeFileSync(join(copy, 'killed.py'), `from pathlib import Path
import sys
import time

source = Path("view.templ").read_bytes()
if b'"broken"' in source:
    Path("view_templ.go").write_bytes(b"unknown bytes written by killed generator")
    Path("mutant-ready").write_text("ready", encoding="utf-8")
    time.sleep(60)
    sys.exit(1)
Path("view_templ.go").write_bytes(b"clean generated bytes")
print("1 passed in 0.01s")
`)
    setFence(copy, 'python3 killed.py')
    const journal = newJournalHome()
    const running = spawnWithJournal(copy, journal, mutationArgs(['view_templ.go']))
    const ready = await eventually(() => existsSync(join(copy, 'mutant-ready')))
    if (!ready) running.child.kill('SIGKILL')
    assert.ok(ready, `the SIGKILL fixture never materialized its mutant output\n${running.output()}`)
    running.child.kill('SIGKILL')
    await running.exited

    const record = journalPath(journal, copy)
    assert.ok(existsSync(record), 'SIGKILL left no durable versioned transaction')
    versionedJournal = JSON.parse(readFileSync(record, 'utf8'))
    const versionKey = ['version', 'schema_version', 'journal_version']
      .find(key => Object.hasOwn(versionedJournal, key))
    assert.ok(versionKey, 'the multi-file journal does not identify its schema version')
    versionedJournal.__versionKey = versionKey

    const unknownBytes = readFileSync(join(copy, 'view_templ.go'))
    const explicit = runWith(journal, ['--restore', '--cwd', '.'], copy)
    assert.notEqual(explicit.status, 0, 'unknown generated bytes made --restore claim success')
    assert.match(`${explicit.stdout}${explicit.stderr}`, /view_templ\.go/, 'recovery did not name the unresolved member')
    assert.match(`${explicit.stdout}${explicit.stderr}`, /unresolved|reconcil/i,
      'recovery did not say why the member was preserved')
    assert.deepEqual(readFileSync(join(copy, 'view.templ')), sourceEntry,
      'the known source mutant should still be safely restored')
    assert.deepEqual(readFileSync(join(copy, 'view_templ.go')), unknownBytes,
      'killed-run recovery overwrote generated bytes it does not own')
    assert.ok(existsSync(record), 'unresolved recovery discarded its journal')

    setFence(copy,
      `python3 -c 'from pathlib import Path; Path("measured.txt").write_text("ran"); print("1 passed in 0.01s")'`)
    const ordinary = runWith(journal, ['tasks/T1-fixture.md', '--cwd', '.'], copy)
    assert.notEqual(ordinary.status, 0, 'an ordinary run measured a tree with unresolved recovery')
    assert.equal(existsSync(join(copy, 'measured.txt')), false,
      'the ordinary Acceptance fence ran despite unresolved recovery')
    assert.deepEqual(readFileSync(join(copy, 'view_templ.go')), unknownBytes,
      'the blocked ordinary run overwrote the unresolved member')
    assert.ok(existsSync(record), 'the blocked ordinary run discarded the unresolved journal')
  }

  const blocksOnJournal = (label, contents, messagePattern) => {
    const copy = corpus()
    const journal = newJournalHome()
    const record = journalPath(journal, copy)
    setFence(copy,
      `python3 -c 'from pathlib import Path; Path("measured.txt").write_text("ran"); print("1 passed in 0.01s")'`)
    writeFileSync(record, contents)
    const explicit = runWith(journal, ['--restore', '--cwd', '.'], copy)
    assert.notEqual(explicit.status, 0, `${label}: --restore claimed success`)
    assert.match(`${explicit.stdout}${explicit.stderr}`, messagePattern,
      `${label}: --restore did not explain the retained journal`)
    assert.ok(existsSync(record), `${label}: --restore discarded unresolved evidence`)
    const ordinary = runWith(journal, ['tasks/T1-fixture.md', '--cwd', '.'], copy)
    assert.notEqual(ordinary.status, 0, `${label}: an ordinary run ignored unresolved evidence`)
    assert.equal(existsSync(join(copy, 'measured.txt')), false,
      `${label}: the ordinary Acceptance fence ran`)
    assert.ok(existsSync(record), `${label}: the ordinary run discarded unresolved evidence`)
  }
  const versionKey = versionedJournal.__versionKey
  delete versionedJournal.__versionKey
  blocksOnJournal('unknown version', JSON.stringify({
    ...versionedJournal,
    [versionKey]: 'unknown-t2-test-version',
  }), /version|journal/i)
  blocksOnJournal('corrupt versioned journal', '{"version":', /corrupt|invalid|journal|read/i)

  const unsafeCleanup = (label, member, setup, mutate, inspect) => {
    const copy = corpus()
    addMutationLog(copy)
    writeFileSync(join(copy, 'view.templ'), sourceEntry)
    writeFileSync(join(copy, 'safe.go'), safeEntry)
    setup(copy)
    writeFileSync(join(copy, 'unsafe_cleanup.py'), `from pathlib import Path
import os
import sys

source = Path("view.templ").read_bytes()
if b'"broken"' in source:
    Path("safe.go").write_bytes(b"changed safe output")
${mutate.split('\n').map(line => `    ${line}`).join('\n')}
    print("1 failed in 0.01s")
    sys.exit(1)
print("1 passed in 0.01s")
`)
    setFence(copy, 'python3 unsafe_cleanup.py')
    const journal = newJournalHome()
    const result = runWith(journal, mutationArgs(['safe.go', member]), copy)
    expectExit(result, 2, `${label}: incomplete cleanup must refuse a verdict`)
    const output = `${result.stdout}${result.stderr}`
    assert.match(output, new RegExp(member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${label}: the unsafe member was not named`)
    assert.match(output, /unsafe|unresolved|restore|symlink|directory/i,
      `${label}: the cleanup failure was not explained`)
    assert.deepEqual(readFileSync(join(copy, 'view.templ')), sourceEntry,
      `${label}: safe source restoration did not finish`)
    assert.deepEqual(readFileSync(join(copy, 'safe.go')), safeEntry,
      `${label}: safe secondary restoration did not finish`)
    inspect(copy)
    assert.equal(mutationLog(copy), '', `${label}: an incomplete transaction wrote a verdict`)
    assert.ok(existsSync(journalPath(journal, copy)),
      `${label}: incomplete cleanup discarded its journal`)
  }

  unsafeCleanup('secondary became a directory', 'unsafe.go', copy => {
    writeFileSync(join(copy, 'unsafe.go'), Buffer.from('unsafe entry\n'))
  }, [
    'path = Path("unsafe.go")',
    'path.unlink()',
    'path.mkdir()',
  ].join('\n'), copy => {
    assert.ok(lstatSync(join(copy, 'unsafe.go')).isDirectory(),
      'cleanup replaced the unsafe directory')
  })

  if (process.platform !== 'win32') {
    const outsideFileRoot = mkdtempSync(join(os.tmpdir(), 'quality-harness-outside-'))
    temps.push(outsideFileRoot)
    const outsideFile = join(outsideFileRoot, 'outside.go')
    const outsideFileBytes = Buffer.from('outside must remain untouched\n')
    writeFileSync(outsideFile, outsideFileBytes)
    unsafeCleanup('secondary became a symlink', 'unsafe.go', copy => {
      writeFileSync(join(copy, 'unsafe.go'), Buffer.from('unsafe entry\n'))
    }, [
      'path = Path("unsafe.go")',
      'path.unlink()',
      `os.symlink(${JSON.stringify(outsideFile)}, path)`,
    ].join('\n'), copy => {
      assert.ok(lstatSync(join(copy, 'unsafe.go')).isSymbolicLink(),
        'cleanup replaced the unsafe symlink')
      assert.deepEqual(readFileSync(outsideFile), outsideFileBytes,
        'cleanup followed the symlink outside cwd')
    })

    const outsideDir = mkdtempSync(join(os.tmpdir(), 'quality-harness-outside-'))
    temps.push(outsideDir)
    const outsideMember = join(outsideDir, 'generated.go')
    const outsideMemberBytes = Buffer.from('outside ancestor target\n')
    writeFileSync(outsideMember, outsideMemberBytes)
    unsafeCleanup('secondary ancestor became a symlink', 'nested/generated.go', copy => {
      mkdirSync(join(copy, 'nested'))
      writeFileSync(join(copy, 'nested', 'generated.go'), Buffer.from('nested entry\n'))
    }, [
      'path = Path("nested/generated.go")',
      'path.unlink()',
      'Path("nested").rmdir()',
      `os.symlink(${JSON.stringify(outsideDir)}, "nested", target_is_directory=True)`,
    ].join('\n'), copy => {
      assert.ok(lstatSync(join(copy, 'nested')).isSymbolicLink(),
        'cleanup replaced the unsafe ancestor symlink')
      assert.deepEqual(readFileSync(outsideMember), outsideMemberBytes,
        'cleanup followed the ancestor symlink outside cwd')
    })
  }

  const invalidManifest = (label, setup) => {
    const copy = corpus()
    addMutationLog(copy)
    writeFileSync(join(copy, 'view.templ'), sourceEntry)
    setFence(copy,
      `python3 -c 'from pathlib import Path; Path("fence-ran.txt").write_text("ran"); print("1 passed in 0.01s")'`)
    const journal = newJournalHome()
    const { restores, unchanged } = setup(copy)
    const targetBefore = readFileSync(join(copy, 'view.templ'))
    const taskBefore = readTask(copy)
    const result = runWith(journal, mutationArgs(restores), copy)
    expectExit(result, 2, `${label}: invalid restore manifest must be a usage refusal`)
    assert.match(`${result.stdout}${result.stderr}`, /also-restore|manifest|secondary|restore path/i,
      `${label}: the refusal did not identify the restore manifest`)
    assert.deepEqual(readFileSync(join(copy, 'view.templ')), targetBefore,
      `${label}: refusal changed the mutation target`)
    assert.equal(readTask(copy), taskBefore, `${label}: refusal wrote a log row`)
    assert.equal(existsSync(join(copy, 'fence-ran.txt')), false,
      `${label}: refusal ran an Acceptance fence`)
    assert.deepEqual(readdirSync(journal), [], `${label}: refusal left a journal`)
    unchanged()
  }
  const fileControl = (path, bytes) => {
    writeFileSync(path, bytes)
    return () => assert.deepEqual(readFileSync(path), bytes, `${path} changed during refusal`)
  }

  invalidManifest('absolute path', copy => {
    const output = join(copy, 'absolute.go')
    const unchanged = fileControl(output, Buffer.from('absolute entry\n'))
    return { restores: [output], unchanged }
  })
  invalidManifest('forward-slash traversal', copy => {
    const output = join(dirname(copy), 'escape.go')
    const unchanged = fileControl(output, Buffer.from('traversal entry\n'))
    return { restores: ['../escape.go'], unchanged }
  })
  invalidManifest('backslash traversal', copy => {
    const output = join(dirname(copy), 'escape-backslash.go')
    const unchanged = fileControl(output, Buffer.from('backslash traversal entry\n'))
    return { restores: ['..\\escape-backslash.go'], unchanged }
  })
  invalidManifest('directory member', copy => {
    const output = join(copy, 'generated-dir')
    mkdirSync(output)
    return {
      restores: ['generated-dir'],
      unchanged: () => assert.ok(lstatSync(output).isDirectory(), 'directory member was replaced'),
    }
  })
  invalidManifest('duplicate member', copy => {
    const output = join(copy, 'duplicate.go')
    const unchanged = fileControl(output, Buffer.from('duplicate entry\n'))
    return { restores: ['duplicate.go', 'duplicate.go'], unchanged }
  })
  invalidManifest('target repeated as secondary', () => ({
    restores: ['view.templ'], unchanged: () => {},
  }))

  if (process.platform !== 'win32') {
    invalidManifest('direct symlink member', copy => {
      const outside = join(dirname(copy), 'direct-symlink-outside.go')
      const bytes = Buffer.from('direct symlink outside\n')
      writeFileSync(outside, bytes)
      symlinkSync(outside, join(copy, 'linked.go'))
      return {
        restores: ['linked.go'],
        unchanged: () => {
          assert.ok(lstatSync(join(copy, 'linked.go')).isSymbolicLink(), 'direct symlink was replaced')
          assert.deepEqual(readFileSync(outside), bytes, 'direct symlink target changed')
        },
      }
    })
    invalidManifest('existing member below symlink ancestor', copy => {
      const outside = mkdtempSync(join(os.tmpdir(), 'quality-harness-outside-'))
      temps.push(outside)
      const member = join(outside, 'existing.go')
      const bytes = Buffer.from('existing ancestor escape\n')
      writeFileSync(member, bytes)
      symlinkSync(outside, join(copy, 'linked-dir'))
      return {
        restores: ['linked-dir/existing.go'],
        unchanged: () => {
          assert.ok(lstatSync(join(copy, 'linked-dir')).isSymbolicLink(), 'ancestor symlink was replaced')
          assert.deepEqual(readFileSync(member), bytes, 'existing escaped member changed')
        },
      }
    })
    invalidManifest('absent member below symlink ancestor', copy => {
      const outside = mkdtempSync(join(os.tmpdir(), 'quality-harness-outside-'))
      temps.push(outside)
      symlinkSync(outside, join(copy, 'linked-dir'))
      const absent = join(outside, 'absent.go')
      return {
        restores: ['linked-dir/absent.go'],
        unchanged: () => {
          assert.ok(lstatSync(join(copy, 'linked-dir')).isSymbolicLink(), 'ancestor symlink was replaced')
          assert.equal(existsSync(absent), false, 'refusal created the escaped absent member')
        },
      }
    })
  }
})

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
  assert.match(log, /\r?\n {2}```\r?\n {2}the fence passed with the mechanism broken; it may not materialize, compile, load, or assert on the changed path\r?\n {2}```/)
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

test('a fence that never returns is UNRUN, and writes nothing', () => {
  // docs/BACKLOG.md §54. Only `sweep_corpus` had a timeout; the recording runs
  // did not, so three call sites carried two contracts — and because the run is
  // captured, a hang produced NO output at all rather than a slow failure.
  //
  // The timeout is a PARAMETER for this test's sake: a branch reachable only
  // after thirty minutes is a branch with no test (CLAUDE.md §7, written about
  // platforms and equally true of clocks). The campaign caught the first version
  // of this work with no such seam — the mutation removing the timeout came back
  // GREEN, because nothing could reach the path.
  const copy = corpus()
  const before = readTask(copy)
  writeTask(copy, before.replace(/```bash\n[\s\S]*?\n```/,
    '```bash\necho starting; sleep 30\n```'))
  const hung = run('adr-verify', ['--cwd', '.', 'tasks/T1-fixture.md'], copy, undefined,
    { QUALITY_HARNESS_FENCE_TIMEOUT: '2' })
  expectExit(hung, 2, 'a run that did not finish is not a verdict either way')
  assert.match(hung.stdout, /UNRUN/)
  assert.match(hung.stdout, /NOTHING has been written/)
  // What it managed to print before it was killed is shown, because a hang with
  // no output is the case this exists to stop being.
  assert.match(hung.stdout, /starting/)
  // And the file is untouched: an entry claiming a run that did not finish is
  // worse than no entry.
  assert.equal(readTask(copy).split('## Verification Log')[1].trim(), '',
    'a killed run must record nothing')

  // The must-fail direction: with a timeout that the fence fits inside, the same
  // fence records normally — so this asserts the TIMEOUT, not that adr-verify
  // refuses everything.
  writeTask(copy, before.replace(/```bash\n[\s\S]*?\n```/, '```bash\necho quick; exit 1\n```'))
  const quick = run('adr-verify', ['--cwd', '.', 'tasks/T1-fixture.md'], copy, undefined,
    { QUALITY_HARNESS_FENCE_TIMEOUT: '60' })
  expectExit(quick, 1, 'a fence that finishes is judged normally')
  assert.match(readTask(copy), /· exit 1 · /)

  // THE MUTANT PATH IS THE DANGEROUS ONE, because a hang there leaves the file
  // deliberately broken. UNRUN, and the mutant must be put back — a timeout that
  // left the tree mutated would be worse than no timeout at all.
  const mutantHang = corpus()
  addMutationLog(mutantHang)
  const target = addBlindSpot(mutantHang)
  const pristine = readFileSync(target, 'utf8')
  writeTask(mutantHang, readTask(mutantHang).replace(/```bash\n[\s\S]*?\n```/,
    "```bash\nif grep -q 'THRESHOLD = 99' unused.py; then echo starting; sleep 30; "
    + "else echo '1 passed in 0.01s'; fi\n```"))
  const hungMutant = run('adr-verify', [
    '--cwd', '.', 'tasks/T1-fixture.md',
    '--mutant', 'unused.py', '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = 99', '--why', 'probe',
  ], mutantHang, undefined, { QUALITY_HARNESS_FENCE_TIMEOUT: '2' })
  assert.match(hungMutant.stdout + hungMutant.stderr, /UNRUN/,
    `${hungMutant.stdout}\n${hungMutant.stderr}`)
  assert.equal(readFileSync(target, 'utf8'), pristine,
    'a killed mutant run must still put the file back')
})

test('an Acceptance fence may be spelled sh or shell', () => {
  // docs/BACKLOG.md §70. `sh` is a reasonable thing to type and the fence runs
  // through bash either way; refusing it bought nothing. Asserted THROUGH the
  // gate, because the campaign caught the first version of this work with the
  // mutation GREEN — the pattern was widened and nothing exercised a file that
  // used the new spelling.
  for (const language of ['sh', 'shell', 'bash']) {
    const copy = corpus()
    writeTask(copy, readTask(copy).replace(/```bash\n[\s\S]*?\n```/,
      '```' + language + '\nexit 3\n```'))
    const ran = run('adr-verify', ['--cwd', '.', 'tasks/T1-fixture.md'], copy)
    expectExit(ran, 3, `a \`\`\`${language} fence must be read and run`)
    assert.match(readTask(copy), /· exit 3 · /, `${language}: the run is recorded`)
  }

  // The must-fail direction: a fence in a language this gate does not run is
  // still refused, or "read every fence" satisfies the loop above.
  const other = corpus()
  writeTask(other, readTask(other).replace(/```bash\n[\s\S]*?\n```/,
    '```python\nprint("no")\n```'))
  const refused = run('adr-verify', ['--cwd', '.', 'tasks/T1-fixture.md'], other)
  expectExit(refused, 2, 'a python fence is not an acceptance command this gate runs')
  assert.match(refused.stdout, /no non-empty/, refused.stdout)
})

test('a mutant that removes tests is killed, and a fence broken before it is not', () => {
  // docs/BACKLOG.md §71. A mutant whose whole effect is to REMOVE tests from a
  // lane — a restored `//go:build` tag, an inserted `t.Skip`, a renamed
  // `_test.go` — makes the fence fail BECAUSE it detected that nothing ran. That
  // was reported `inconclusive`, telling the author their strongest mutant proved
  // nothing. Reported by the session whose task's entire deliverable was removing
  // such a tag.
  //
  // "The fence failed and scored no tests" is two runs wearing one verdict, and
  // the fence's TEXT cannot tell them apart — inferring intent from it is the
  // loose heuristic this project refused for the comment-only guard. A BASELINE
  // answers it by measurement, and it runs only in the ambiguous case.
  const build = (fence, marker) => {
    const copy = corpus()
    addMutationLog(copy)
    writeFileSync(join(copy, 'marker.txt'), 'RUN\n')
    writeFileSync(join(copy, 'suite.sh'),
      // The skip path emits the RUNNER'S OWN "nothing ran" marker — Go's
      // `ok pkg 0.01s [no tests to run]` — because that is what `scored_nothing`
      // recognises, and it is the exact output the reporting corpus produced.
      // Two earlier fixtures missed the branch: one printed a bare "no tests to
      // run" (not a recognised marker) and one printed nothing at all (absence of
      // output is not evidence of an empty result set). Both reached the ordinary
      // kill branch, so the test passed while asserting a behaviour that already
      // existed — and the campaign said so, twice, by leaving the baseline
      // mutation GREEN.
      '#!/usr/bin/env bash\n'
      + 'if grep -q SKIP marker.txt; then echo "ok  example.com/pkg  0.01s [no tests to run]";'
      + ' exit 1; fi\n'
      + 'echo "ok 1 - a real test"; echo "1 test passed"; exit 0\n')
    writeTask(copy, readTask(copy).replace(/```bash\n[\s\S]*?\n```/, '```bash\n' + fence + '\n```'))
    return copy
  }

  const removed = build("bash suite.sh | tee /dev/stderr | grep -q 'test passed'")
  const killed = run('adr-verify', ['--cwd', '.', 'tasks/T1-fixture.md',
    '--mutant', 'marker.txt', '--from', 'RUN', '--to', 'SKIP',
    '--why', 'removing the tests from the lane'], removed)
  assert.match(readTask(removed), /mutant killed/,
    `a mutant that removes the tests is a kill:\n${killed.stdout}`)

  // THE MUST-FAIL DIRECTION, and it is the one that matters: a fence broken
  // BEFORE anything was mutated must never be credited as a kill. Crediting an
  // unearned kill is the worst outcome this tool has — the whole point of a
  // mutation is to find out whether anything NOTICED. This case recorded
  // `mutant killed` before §71.
  const broken = build('nosuchrunner --run-everything')
  const before = readFileSync(join(broken, 'marker.txt'))
  const unproven = run('adr-verify', ['--cwd', '.', 'tasks/T1-fixture.md',
    '--mutant', 'marker.txt', '--from', 'RUN', '--to', 'SKIP', '--why', 'probe'], broken)
  expectExit(unproven, 1, 'a broken clean fence earns no mutant verdict')
  assert.match(unproven.stdout + unproven.stderr, /UNPROVEN/)
  assert.doesNotMatch(unproven.stdout + unproven.stderr, /MUTANT APPLIED/)
  assert.deepEqual(readFileSync(join(broken, 'marker.txt')), before,
    'the target must never change when the clean fence is unusable')
  assert.equal(readTask(broken).split('## Mutation Log')[1].trim(), '',
    'no mutant ran, so no Mutation Log row may be written')
})

test('a toolchain directive is not a comment-only mutant', () => {
  // BACKLOG §67, asserted THROUGH THE GUARD rather than against the pattern it
  // uses. `# type: ignore` is lexically a comment and semantically an
  // instruction to a type checker; `//go:build` removes whole functions from
  // compilation, and a session hand-verified `go test -run …` exiting 0 over a
  // suite that executed nothing.
  //
  // The first version of this assertion tested the DIRECTIVE_COMMENT regex
  // directly, and the mutation campaign caught it: breaking the guard to
  // `if False:` left the suite GREEN, because nothing exercised the path the
  // mutation broke. That is §57's defect one day later — the mechanism asserted,
  // the caller not — and it is why this test drives the gate.
  const copy = corpus()
  addMutationLog(copy)
  addBlindSpot(copy)
  const directive = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', '# a helper nothing under test imports',
    '--to', '# type: ignore',
    '--why', 'a type-checker directive is not prose',
  ])
  assert.doesNotMatch(directive.stdout, /COMMENT-ONLY MUTANT/,
    `a toolchain directive must reach the fence:\n${directive.stdout}`)

  // The must-fail direction, in the same test: ordinary prose is STILL refused,
  // without which "exempt everything" would satisfy the assertion above.
  const fresh = corpus()
  addMutationLog(fresh)
  addBlindSpot(fresh)
  const prose = verify(fresh, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', '# a helper nothing under test imports',
    '--to', '# a helper that nothing under test imports',
    '--why', 'probe',
  ])
  expectExit(prose, 2, 'a comment edit changes nothing the program does')
  assert.match(prose.stdout, /COMMENT-ONLY MUTANT/)
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

  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')
  const written = readFileSync(taskPath(copy), 'utf8')
  assert.ok(written.includes('\r\n'), 'a CRLF file must stay CRLF')
  assert.doesNotMatch(written, /[^\r]\n/, 'and must not acquire bare LF lines')
  assert.match(written, /· exit 0 · .*\r\n/, 'the appended entry uses the file\'s own ending')

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

// ---------------------------------------------------------------------------
// The mutant a killed run leaves behind.
//
// `run_mutant` restores in a `finally`. Measured 2026-08-27 by sending each
// signal to a real run mid-fence: SIGINT restored the file, SIGTERM and SIGKILL
// both left the mutant on disk. Reported the same day from a Windows session
// whose fence takes about eleven minutes against a ten-minute agent cap — twice
// — and noticed only because those files had just become tracked. Untracked, a
// deliberate defect sits in the working tree and nothing says so.

/** A task whose fence outlives the test, so the mutant is on disk when we kill. */
function slowFence(copy, seconds = 60) {
  writeTask(copy, `${readTask(copy)}`.replace(/```bash\n[\s\S]*?```/,
    `\`\`\`bash\nif grep -q '## Decisiun' ADR-001-selftest.md; then\n`
    + `  sleep ${seconds}; exit 1\n`
    + `fi\necho '1 passed in 0.01s'\n\`\`\``))
  addMutationLog(copy)
}

function spawnMutant(copy, journalHome) {
  const args = ['tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'ADR-001-selftest.md',
    '--from', '## Decision', '--to', '## Decisiun', '--why', 'kill probe']
  const child = spawn(process.platform === 'win32' ? 'python3' : join(bin, 'adr-verify'),
    process.platform === 'win32' ? [join(bin, 'adr-verify'), ...args] : args,
    { cwd: copy, env: { ...env, CLAUDE_PLUGIN_DATA: journalHome } })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  return { child, said: () => output }
}

/** adr-verify with a journal directory of this test's own, so runs cannot see
 *  each other's records — and so a restore is measured against the journal the
 *  killed run actually wrote, not whatever the ambient temp directory holds. */
function runWith(journal, args, copy, extraEnv = undefined) {
  const win = process.platform === 'win32'
  return spawnSync(win ? 'python3' : join(bin, 'adr-verify'),
    win ? [join(bin, 'adr-verify'), ...args] : args,
    {
      cwd: copy,
      env: { ...env, ...(extraEnv ?? {}), CLAUDE_PLUGIN_DATA: journal },
      encoding: 'utf8',
      timeout: 60_000,
    })
}

const mutated = copy => readFileSync(join(copy, 'ADR-001-selftest.md'), 'utf8').includes('## Decisiun')

async function untilMutated(copy) {
  for (let i = 0; i < 200 && !mutated(copy); i += 1) await setTimeout(25)
  return mutated(copy)
}

test('an interrupted clean baseline cannot silently lend its changed tree to a later run', async () => {
  const probe = async ({ label, sideEffect, expected }) => {
    const copy = corpus()
    const journal = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
    temps.push(journal)
    addMutationLog(copy)
    const target = addBlindSpot(copy)
    writeTask(copy, readTask(copy).replace(/```bash\n[\s\S]*?```/,
      `\`\`\`bash\n${sideEffect}\nsleep 60\necho '1 passed in 0.01s'\n\`\`\``))

    const args = ['tasks/T1-fixture.md', '--cwd', '.', '--mutant', 'unused.py',
      '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = 99', '--why', `baseline ${label} probe`]
    const child = spawn(process.platform === 'win32' ? 'python3' : join(bin, 'adr-verify'),
      process.platform === 'win32' ? [join(bin, 'adr-verify'), ...args] : args,
      { cwd: copy, env: { ...env, CLAUDE_PLUGIN_DATA: journal } })
    const sideEffectLanded = () => expected === null
      ? !existsSync(target)
      : existsSync(target) && readFileSync(target).equals(expected)
    for (let i = 0; i < 200 && !sideEffectLanded(); i += 1) await setTimeout(25)
    assert.ok(sideEffectLanded(), `the clean fence never ${label} the target, so the kill proves nothing`)
    child.kill('SIGKILL')
    await once(child, 'exit')

    const before = readdirSync(journal)
    assert.equal(before.length, 1, 'the interrupted baseline left no durable recovery record')
    const refused = runWith(journal, ['--restore', '--cwd', '.'], copy)
    expectExit(refused, 2, `a baseline that ${label} the target is not safe to restore automatically`)
    assert.match(`${refused.stdout}${refused.stderr}`, /unresolved baseline journal/i)
    assert.ok(sideEffectLanded(), 'recovery overwrote a baseline change it did not own')
    assert.deepEqual(readdirSync(journal), before, 'recovery discarded the unresolved warning')
  }

  const baselineBytes = Buffer.from('# written by the clean fence before it was killed\nTHRESHOLD = 7\n')
  await probe({
    label: 'rewrote',
    sideEffect: `python3 -c 'from pathlib import Path; Path("unused.py").write_bytes(b"# written by the clean fence before it was killed\\nTHRESHOLD = 7\\n")'`,
    expected: baselineBytes,
  })
  await probe({
    label: 'removed',
    sideEffect: `python3 -c 'from pathlib import Path; Path("unused.py").unlink()'`,
    expected: null,
  })
})

test('a SIGKILLed mutant run is restored by the next run, not left in the tree', async () => {
  const copy = corpus()
  const journal = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
  temps.push(journal)
  slowFence(copy)
  const { child } = spawnMutant(copy, journal)
  assert.ok(await untilMutated(copy), 'the mutant never landed, so nothing was probed')

  child.kill('SIGKILL')
  await once(child, 'exit')
  await setTimeout(100)
  // SIGKILL unwinds nothing, so the in-process restore cannot have run. This is
  // the state the Windows session found, and the state that must not persist.
  assert.ok(mutated(copy), 'a SIGKILL that unwound is not the case being tested')

  const recovered = runWith(journal, ['--restore', '--cwd', '.'], copy)
  expectExit(recovered, 0, 'adr-verify --restore')
  assert.match(recovered.stdout, /RESTORED/)
  assert.ok(!mutated(copy), 'the mutant survived a restore that reported success')
})

test('the warning that names the broken file survives the kill that hides it', async () => {
  // The announcement is the only recovery a SIGKILL cannot take away — but only
  // if it is flushed. Measured 2026-08-27: redirected stdout is block-buffered,
  // and both kill probes produced a COMPLETELY EMPTY log while the mutant sat in
  // the tree. A warning that arrives only when nothing goes wrong is not one.
  const copy = corpus()
  const journal = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
  temps.push(journal)
  slowFence(copy)
  const { child, said } = spawnMutant(copy, journal)
  // Wait for the WARNING, not for the mutated file. The warning is printed after
  // `write_source`, so waiting on the file leaves a window where the mutant
  // exists and the announcement has not been emitted — kill inside that window
  // and the assertion fails for a reason that has nothing to do with flushing.
  // CI on ubuntu-latest found it on 2026-08-27; the same test had passed on
  // macOS repeatedly, which is what a timing race looks like from one machine.
  // Wait for the line the assertions actually READ, not for a proxy. Waiting on
  // `MUTANT APPLIED` alone and then killing leaves the `--restore` line — emitted
  // immediately after it — unflushed, so the assertion below fails on timing
  // rather than on behaviour. It surfaced first in the coverage job, whose
  // instrumentation is slow enough to open the window; that is the same shape as
  // the race this loop was written for, one line further on.
  const untilAnnounced = async () => {
    const ready = () => /MUTANT APPLIED/.test(said()) && /--restore/.test(said())
    for (let i = 0; i < 400 && !ready(); i += 1) await setTimeout(25)
    return ready()
  }
  assert.ok(await untilAnnounced(), 'the warning never arrived, so the kill proves nothing')
  assert.ok(mutated(copy), 'the warning must be emitted while the mutant is on disk')
  child.kill('SIGKILL')
  await once(child, 'exit')

  assert.match(said(), /MUTANT APPLIED to ADR-001-selftest\.md/)
  assert.match(said(), /--restore/, 'the warning must say how to undo it')
  runWith(journal, ['--restore', '--cwd', '.'], copy)
})

test('a SIGTERM mid-fence is restored in-process, without waiting for the next run', {
  // Windows has no POSIX signals: Node emulates `SIGTERM` with TerminateProcess,
  // which runs no handler, so the guarantee there is the journal alone. Skipped
  // with a reason rather than silently, because a skip nobody can see reads as
  // coverage.
  skip: process.platform === 'win32' ? 'Node emulates SIGTERM with TerminateProcess; no handler runs' : false,
}, async () => {
  // The measurement this exists for: SIGINT unwound and restored, SIGTERM did
  // not, because Python's default disposition terminates without unwinding and
  // `finally` never ran. A handler turns it into a SystemExit so the restore
  // gets its chance. Every other kill test here uses SIGKILL, which cannot be
  // caught — so before this test the handler had no coverage at all and deleting
  // it left the suite green.
  const copy = corpus()
  const journal = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
  temps.push(journal)
  slowFence(copy)
  const { child } = spawnMutant(copy, journal)
  assert.ok(await untilMutated(copy), 'the mutant never landed, so nothing was probed')

  child.kill('SIGTERM')
  await once(child, 'exit')
  await setTimeout(200)

  assert.ok(!mutated(copy), 'SIGTERM left the mutant in the tree: the handler did not unwind')
  // The discriminator between this and the SIGKILL path: an in-process restore
  // also clears the journal on its way out. A file that came back because some
  // later run recovered it would leave one behind, and would pass a weaker
  // assertion that only looked at the file.
  assert.deepEqual(readdirSync(journal), [],
    'the file came back but a journal remains — that is recovery, not an in-process restore')
})

test('a restore never overwrites a file that moved on since the mutant', async () => {
  // Restoring on top of later work would discard an edit that is not ours to
  // discard — a worse bug than the one being fixed.
  const copy = corpus()
  const journal = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
  temps.push(journal)
  slowFence(copy)
  const { child } = spawnMutant(copy, journal)
  assert.ok(await untilMutated(copy))
  child.kill('SIGKILL')
  await once(child, 'exit')
  await setTimeout(100)

  const record = join(copy, 'ADR-001-selftest.md')
  writeFileSync(record, `${readFileSync(record, 'utf8')}\n<!-- edited after the kill -->\n`)
  const result = runWith(journal, ['--restore', '--cwd', '.'], copy)
  expectExit(result, 2, 'adr-verify --restore')
  assert.match(result.stdout, /unresolved mutant journal recovery/i)
  assert.match(readFileSync(record, 'utf8'), /edited after the kill/)
  assert.equal(readdirSync(journal).length, 1,
    'refusing to overwrite must retain the journal that holds the original')
})

test('--restore with nothing recorded says so rather than implying it repaired something', () => {
  const copy = corpus()
  const journal = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
  temps.push(journal)
  const result = runWith(journal, ['--restore', '--cwd', '.'], copy)
  expectExit(result, 0, 'adr-verify --restore')
  assert.match(result.stdout, /no mutant is recorded/)
})

test('an ordinary run recovers a mutant a killed run left, before it measures anything', async () => {
  // Otherwise the leftover defect IS the code under test, and every verdict
  // after it is about the mutation rather than about the change.
  const copy = corpus()
  const journal = mkdtempSync(join(os.tmpdir(), 'quality-harness-journal-'))
  temps.push(journal)
  slowFence(copy)
  const { child } = spawnMutant(copy, journal)
  assert.ok(await untilMutated(copy))
  child.kill('SIGKILL')
  await once(child, 'exit')
  await setTimeout(100)

  // Put a fence back that returns promptly, so this is an ordinary verify run.
  writeTask(copy, readTask(copy).replace(/```bash\n[\s\S]*?```/, '```bash\nadr-lint ADR-001-selftest.md tasks\n```'))
  const result = runWith(journal, ['tasks/T1-fixture.md', '--cwd', '.'], copy)
  assert.match(result.stdout, /RESTORED/)
  assert.ok(!mutated(copy), 'the run measured a tree that still held the mutant')
})

// ADR-013 T1. The human-observed mutation arm, driven through the REAL adr-lint
// binary on a real corpus rather than against the compiled pattern. The pattern
// assertions live in tests/gate-regressions.py; this is the mutation catalogue's
// killer, because scripts/mutate.mjs runs node suites and cannot execute a .py
// one — a mutation that names a suite this runner cannot start is reported as a
// failing baseline, never as evidence.
const humanRow = (over = {}) => {
  const f = {
    exit: 'test exit 1',
    file: '`src/scorer.py`',
    line: 'line 187',
    from: 'from `if match_reason(node) == "right_reason":`',
    to: 'to `if True:`',
    test: 'test `test_reason_matching_counts_right_and_wrong`',
    why: 'the fence’s integration clause cannot run',
    ...over,
  }
  return `- 2026-08-30 · human-observed · mutant killed · ${f.exit} · ${f.file}`
    + ` · ${f.line} · ${f.from} · ${f.to} · ${f.test} · ${f.why}`
}

function lintWithMutationRow(row) {
  const copy = corpus()
  addMutationLog(copy)
  writeTask(copy, `${readTask(copy).trimEnd()}\n${row}\n`)
  return lint(copy)
}

test('a mutation a human performed is accepted where the tool could not run it', () => {
  expectExit(lintWithMutationRow(humanRow()), 0,
    'adr-lint must accept a complete human-observed mutation row')

  // A body holding a backtick is the case the first draft of this arm could not
  // express: 26 of this repository's tool mutations contain one, and Go raw
  // strings, JS template literals and shell make it routine in what we ship to.
  expectExit(lintWithMutationRow(humanRow({
    file: '`x.go`',
    from: 'from ``s := `raw` + x``',
    to: 'to ``y := `q` ``',
    test: 'test `TestRaw`',
  })), 0, 'a Markdown code span must carry a body containing backticks')
})

test('a human-observed row that cannot be reproduced is refused, not advised', () => {
  // Each of these parses as prose and would read as evidence. An incomplete claim
  // is not a weaker claim, it is an unreproducible one.
  for (const [why, row] of [
    ['a kill claimed on a passing test', humanRow({ exit: 'test exit 0' })],
    ['no line number', humanRow({ line: null })],
    ['no test named', humanRow({ test: null })],
    ['no diff', humanRow({ from: null, to: null })],
  ]) {
    const built = row.replace(/ · null/g, '')
    const got = lintWithMutationRow(built)
    assert.notEqual(got.status, 0,
      `adr-lint must refuse a human-observed row with ${why}: ${built}`)
    // Non-zero is not enough: a crash or an unrelated lint failure is also
    // non-zero, and would keep this green while the refusal path was broken.
    const said = `${got.stdout ?? ''}${got.stderr ?? ''}`
    assert.ok(said.includes('Mutation Log entry'),
      `must be refused BY THE MUTATION LOG CHECK, not merely non-zero (${why}): ${said.trim().slice(0, 300)}`)
  }
})

// ADR-013 T2. `--human-mutant` records a mutation a person performed, for a task
// whose Acceptance contains a clause that cannot run. It executes NOTHING: that
// is the premise, not a limitation.
const humanMutant = (copy, over = {}) => verify(copy, [
  '--human-mutant', over.file ?? 'ADR-001-selftest.md',
  '--from', over.from ?? '## Decision',
  '--to', over.to ?? '## Decisiun',
  '--test', over.test ?? 'adr-lint ADR-001-selftest.md tasks',
  '--test-exit', over.exit ?? '1',
  '--why', over.why ?? 'the fence needs a live database this checkout has no access to',
  ...(over.extra ?? []),
])

test('--human-mutant records a mutation the tool could not have run', () => {
  const copy = corpus()
  addMutationLog(copy)
  expectExit(humanMutant(copy), 0, '--human-mutant must record the row')
  const row = readTask(copy).split('## Mutation Log')[1].trim()
  assert.match(row, /· human-observed · mutant killed · test exit 1 · /,
    `the row must carry the human arm: ${row}`)
  assert.match(row, /· line \d+ · /,
    `the writer must derive the line number rather than trust a typed one: ${row}`)
  // The row it wrote must be the row the reader accepts — the writer is held to
  // the readers' grammar, or a `done` row points at evidence nothing can parse.
  expectExit(lint(copy), 0, 'adr-lint must accept what --human-mutant wrote')
})

// A must-fail assertion here cannot settle for a non-zero exit. Before the flag
// existed every one of these returned 2 (unknown option) and "passed" — the
// vacuity CLAUDE.md §4 names. Each asserts the refusal it is named for.
const refusedBecause = (result, needle, label) => {
  assert.notEqual(result.status, 0, `${label}: must be refused`)
  const said = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.ok(said.includes(needle),
    `${label}: must be refused FOR THAT REASON, not merely non-zero — wanted ${JSON.stringify(needle)} in: ${said.trim().slice(0, 400)}`)
}

test('--human-mutant refuses a diff that does not locate one place in the file', () => {
  const copy = corpus()
  addMutationLog(copy)
  // Zero occurrences: the row would name a change that is not there.
  refusedBecause(humanMutant(copy, { from: 'text that is absent from the record' }),
    'matches nothing', 'a from-text matching no line')
  // Many occurrences: the row parses and still identifies nothing, which is the
  // property the refusals exist to prevent (`return nil` in a 400-line file).
  const copy2 = corpus()
  addMutationLog(copy2)
  refusedBecause(humanMutant(copy2, { from: 'e' }),
    'places', 'a from-text matching many lines')
})

test('--human-mutant refuses a kill claimed on a passing test', () => {
  const copy = corpus()
  addMutationLog(copy)
  refusedBecause(humanMutant(copy, { exit: '0' }),
    '--test-exit', 'test exit 0 is not a kill, however it is spelled')
})

test('--human-mutant will not combine with the modes that actually run something', () => {
  const copy = corpus()
  addMutationLog(copy)
  for (const [flag, extra] of [
    ['--mutant', ['--mutant', 'ADR-001-selftest.md']],
    ['--sweep', ['--sweep', '.']],
  ]) {
    refusedBecause(humanMutant(copy, { extra }),
      'cannot be combined', `--human-mutant with ${flag}`)
  }
})

test('a Mutation Log row of backticks is rejected fast, not backtracked over', () => {
  // The backreferenced code span this arm first shipped with was catastrophically
  // slow on input it REJECTS: `where_it_stopped` re-matches growing prefixes, and
  // 600 backticks cost 2.07s, growing faster than the square. A Mutation Log
  // bullet is author-controlled and adr-lint reads one per bullet across a whole
  // corpus, so the gate hung on a long line instead of reporting it. Asserted
  // through the real binary because that is where a user meets the hang.
  const copy = corpus()
  addMutationLog(copy)
  const row = `- 2026-08-30 · human-observed · mutant killed · test exit 1 · \`x.py\``
    + ` · line 1 · from ${'`'.repeat(4000)}x`
  writeTask(copy, `${readTask(copy).trimEnd()}\n${row}\n`)
  const started = Date.now()
  const result = lint(copy)
  const elapsed = Date.now() - started
  assert.notEqual(result.status, 0, 'the row is malformed and must be refused')
  assert.ok(elapsed < 10_000,
    `adr-lint must reject a row of backticks without backtracking: took ${elapsed}ms`)
})

test('the human lane is advised against where a fence could have run', () => {
  // ADR-013 T2 step 4. The fixture's Acceptance IS a runnable bash fence, so a
  // human-observed row in it is exactly the case worth a word.
  //
  // The wording matters more than the detection, and wcag-43 -- who holds the
  // only real instance -- said why: their T11 fence is genuinely runnable and
  // starts fine; it is the fourth clause that cannot complete. So an advisory
  // reading "this fence looks runnable, use --mutant instead" would be WRONG on
  // the one real case, and would be ignored, which is how advisories die. It
  // asks the author to confirm instead, and points at the field that records it.
  const copy = corpus()
  addMutationLog(copy)
  expectExit(humanMutant(copy), 0, 'the row must still be written')
  const said = `${lint(copy).stdout ?? ''}${lint(copy).stderr ?? ''}`
  assert.ok(/advice: /.test(said) && /cannot run to completion/.test(said),
    `a runnable fence carrying a human row must be advised, not blocked: ${said.slice(0, 600)}`)
  // ADVICE, never a block: the fence may be runnable in CI and not here, which is
  // a real shape, and refusing it would teach people to route around the gate.
  expectExit(lint(copy), 0, 'the advisory must not block')

  // The must-fail direction: a task whose Acceptance is human-observed carries no
  // runnable fence, so the same row must draw NO advice. Without this, an
  // advisory that fired unconditionally would satisfy the assertion above.
  const quiet = corpus()
  addMutationLog(quiet)
  writeTask(quiet, readTask(quiet).replace(/```bash\n[\s\S]*?```/, 'Human-observed: read end to end.'))
  expectExit(humanMutant(quiet), 0, 'the row must be written for a human-observed task too')
  const quietSaid = `${lint(quiet).stdout ?? ''}${lint(quiet).stderr ?? ''}`
  assert.ok(!/cannot run to completion/.test(quietSaid),
    `a task with no runnable fence must draw no such advice: ${quietSaid.slice(0, 600)}`)
})

test('a human-reported kill records the mutation and does not unlock done', () => {
  // ADR-013 T3's decision, asserted rather than asserted-about. The lane raises
  // the floor, never the ceiling: the `done` gate wants a killed mutant carrying
  // the acceptance digest of the fence it proved, and a hand-reported row has no
  // digest because no fence ran.
  //
  // The reason it stops there is an incentive, not a technicality. If a typed row
  // unlocked `done`, declaring a fence unrunnable would become the cheap path to
  // the strongest claim in the system — and "the fence could not run" is the one
  // half of the row nothing can check. The mutation half IS checkable against the
  // file; the excuse is prose. Do not build `done` on the unverifiable half.
  const copy = corpus()
  expectExit(verify(copy, ['--cwd', '.']), 0, 'the fence itself passes')
  addMutationLog(copy)
  expectExit(humanMutant(copy), 0, 'and the hand-performed kill is recorded')
  markDone(copy)

  const got = lint(copy)
  assert.notEqual(got.status, 0, 'a human row must not satisfy the done gate')
  const said = `${got.stdout ?? ''}${got.stderr ?? ''}`
  assert.match(said, /mutant/i,
    `and the refusal must be the MUTATION requirement, not something else: ${said.slice(0, 400)}`)

  // The must-fail direction: a tool-written kill on the same task DOES satisfy it.
  // Without this, a done gate that refused everything would satisfy the assertion
  // above (CLAUDE.md §4).
  const ok = corpus()
  addMutationLog(ok)
  expectExit(mutate(ok), 0, 'and a tool-written mutant is killed')
  expectExit(verify(ok, ['--cwd', '.']), 0, 'fence passes')
  markDone(ok)
  expectExit(lint(ok), 0, 'a tool-written kill must still unlock done')
})

// ADR-014 T1. `partial` end to end, through the real adr-lint binary. The
// pattern-level assertions live in tests/gate-regressions.py; these exist because
// scripts/mutate.mjs runs node suites and cannot start a .py one, so a catalogue
// entry naming that file reports a failing baseline rather than a verdict.
const markPartial = copy => {
  const readme = join(copy, 'tasks', 'README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('| pending |', '| partial |'))
}

test('a partial task is a status the reader acts on, not an unknown word', () => {
  const copy = corpus()
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'and its mutant is killed')
  expectExit(verify(copy, ['--cwd', '.']), 0, 'the fence passes')
  markPartial(copy)

  const said = `${lint(copy).stdout ?? ''}${lint(copy).stderr ?? ''}`
  assert.ok(!/does not act on/.test(said),
    `partial must not be reported as a status the checks skipped: ${said.slice(0, 400)}`)

  // The must-fail direction (CLAUDE.md §4): a word genuinely outside the
  // vocabulary is STILL reported, or §73 was undone rather than completed.
  const unknown = corpus()
  const readme = join(unknown, 'tasks', 'README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('| pending |', '| running |'))
  const unknownSaid = `${lint(unknown).stdout ?? ''}${lint(unknown).stderr ?? ''}`
  assert.match(unknownSaid, /does not act on/,
    `a word outside the vocabulary must still say the checks did not run: ${unknownSaid.slice(0, 400)}`)
})

test('a partial task with a passing fence still owes a killed mutant', () => {
  // The half that makes `partial` a status with obligations rather than a softer
  // word for pending. Reported by klientams-front-v2-01 as the shape that bites:
  // nine tasks read `done` for a week, then the mutation obligation arrived and
  // four of nine fences turned out unable to fail. Nobody KNEW they were
  // part-done — so the obligation must follow the EVIDENCE, not the author's
  // knowledge, and a partial task carrying a green fence is carrying evidence.
  const copy = corpus()
  expectExit(verify(copy, ['--cwd', '.']), 0, 'the fence passes')
  addMutationLog(copy)          // present and empty: the fence ran, nothing proved it can fail
  markPartial(copy)

  const got = lint(copy)
  assert.notEqual(got.status, 0, 'a partial task with a green fence and no killed mutant must be reported')
  const said = `${got.stdout ?? ''}${got.stderr ?? ''}`
  assert.match(said, /mutant/i, `and the finding must be the mutation obligation: ${said.slice(0, 400)}`)

  // The must-fail direction: a fresh task that records the killed mutant before
  // its final green fence clears the obligation. Without this, a check that
  // refused every partial task would satisfy the assertion above.
  const satisfied = corpus()
  addMutationLog(satisfied)
  expectExit(mutate(satisfied), 0, 'the mutant is killed')
  expectExit(verify(satisfied, ['--cwd', '.']), 0, 'the fence passes after its mutation')
  markPartial(satisfied)
  expectExit(lint(satisfied), 0, 'and a partial task that met its obligation passes')
})

// ADR-014 T2, end to end through the real binary, so the catalogue has a suite
// scripts/mutate.mjs can start.
test('Blocked-on is refused on a task that can run its own acceptance', () => {
  const copy = corpus()
  const withHeader = readTask(copy).replace('**Depends-on:**',
    '**Blocked-on:** commit 3f97d0ba is an ancestor of master'
    + ' (git merge-base --is-ancestor 3f97d0ba master)\n**Depends-on:**')
  writeTask(copy, withHeader)

  const got = lint(copy)
  assert.notEqual(got.status, 0, 'the fixture has a runnable fence, so the header must be refused')
  const said = `${got.stdout ?? ''}${got.stderr ?? ''}`
  assert.match(said, /Blocked-on/, `and the finding must name the header: ${said.slice(0, 300)}`)
  assert.match(said, /human-observed/, 'and say what would make it legitimate')

  // The must-fail direction: without the header the same corpus is clean, so the
  // refusal is caused by what this task added and not by the fixture.
  expectExit(lint(corpus()), 0, 'a task without Blocked-on must be untouched')
})

test('--human-mutant refuses a diff a reader could not tell had been applied', () => {
  // Reported by wcag-43 after verifying their own founding case against the
  // shipped rule. `--from` uniqueness makes the row LOCATABLE; `--to` absence
  // makes it REVERSIBLE. If the to-text is already in the file, a reader who
  // applies the row cannot afterwards tell whether it was applied or reverted,
  // and a second reader re-applying it double-mutates. Same read of the same
  // file, so it costs nothing.
  const copy = corpus()
  addMutationLog(copy)
  refusedBecause(
    humanMutant(copy, { from: '## Decision', to: '## Context' }),
    'already', 'a to-text already present in the file')

  // The must-fail direction: a to-text absent from the file is accepted, or the
  // check would refuse every mutation and the assertion above would be vacuous.
  expectExit(humanMutant(copy, { from: '## Decision', to: '## Decisiun' }), 0,
    'a to-text absent from the file must still be accepted')
})

test('Blocked-on naming a sibling task is refused, and an external event is not', () => {
  // End to end, so the catalogue has a suite the runner can start. The fixture
  // corpus has a T1, so naming it is naming work this team owns.
  const owned = corpus()
  writeTask(owned, readTask(owned).replace(/```bash\n[\s\S]*?```/,
    'Acceptance is human-observed: a person watches it.')
    .replace('**Depends-on:**', '**Blocked-on:** T1 landing the registry\n**Depends-on:**'))
  const got = lint(owned)
  assert.notEqual(got.status, 0, 'a Blocked-on naming a sibling must be refused')
  const said = `${got.stdout ?? ''}${got.stderr ?? ''}`
  assert.match(said, /Depends-on/, `and must name the header that is for it: ${said.slice(0, 300)}`)

  // The must-fail direction: a genuinely external event on the same task is
  // accepted, or the rule refuses every Blocked-on and proves nothing.
  const external = corpus()
  writeTask(external, readTask(external).replace(/```bash\n[\s\S]*?```/,
    'Acceptance is human-observed: a person watches it.')
    .replace('**Depends-on:**',
      '**Blocked-on:** the vendor enabling the account (curl -sf https://vendor.invalid/status)\n'
      + '**Depends-on:**'))
  expectExit(lint(external), 0, 'an external event must be accepted')
})

test('a Tests row pointing outside the repository is unproven, not failed', () => {
  // depozitas-laravel-22: their task's code lives in a sibling repository, so the
  // Tests table names a `../` path. adr-lint reported "the row describes a test
  // nothing can run" and BLOCKED — while the test existed in the repo the path
  // names. A permanently-red gate is one people stop running.
  const copy = gitCorpus()
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'and its mutant is killed')
  expectExit(verify(copy, ['--cwd', '.']), 0, 'the fence passes')

  // Two rows naming ONE outside file, so the once-per-path dedupe is exercised.
  const outside = '../sibling_repo/tests/Unit/GuardTest.php'
  const before = readTask(copy)
  const after = before.replace(
    '| adr-lint-positive | selftest.sh | conforming ADR + task pass the gate | — |',
    '| `test_the_sentinel_is_refused` | `' + outside + '` | the guard refuses it | — |\n'
    + '| `test_a_second_row_same_file` | `' + outside + '` | and admits the other | — |')
  assert.notEqual(after, before, 'the fixture Tests row must actually be replaced')
  writeTask(copy, after)
  markDone(copy)

  const got = lint(copy)
  const said = `${got.stdout ?? ''}${got.stderr ?? ''}`
  // Unconditional. Guarding these behind `if (said includes the path)` is what made
  // the first version of this test vacuous: the mutation that removed the whole
  // branch survived, because nothing here had to be true.
  assert.match(said, new RegExp(`advice: [^\n]*${outside.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    `a path outside the repo must be ADVISED: ${said.slice(0, 500)}`)
  assert.match(said, /did NOT run|unproven/i,
    `and say what it could not do rather than what is absent: ${said.slice(0, 500)}`)
  assert.doesNotMatch(said, /describes a test nothing can run/,
    `it must not claim absence it did not establish: ${said.slice(0, 500)}`)
  // Once per path, not once per row: two rows named one file.
  const mentions = said.split('\n').filter(l => l.includes(outside) && l.includes('advice:')).length
  assert.equal(mentions, 1, `one file is one finding, not one per row: ${mentions}`)
  expectExit(got, 0,
    `a task whose code lives elsewhere must not be permanently red: ${said.slice(0, 500)}`)
})

test('a Blocked-on with an unpaired backtick is still asked for a way to check', () => {
  // A Codex soundness finding: ANY backtick suppressed the advice, so a value with
  // a stray one — a typo, not a code span — silently passed as though it named a
  // command. The advisory then said nothing about a Blocked-on that names nothing.
  const copy = corpus()
  writeTask(copy, readTask(copy)
    .replace(/```bash\n[\s\S]*?```/, 'Acceptance is human-observed: a person watches it.')
    .replace('**Depends-on:**', '**Blocked-on:** wait until someone cares `\n**Depends-on:**'))
  const said = `${lint(copy).stdout ?? ''}${lint(copy).stderr ?? ''}`
  assert.match(said, /Blocked-on/, `an unpaired backtick must not suppress the advice: ${said.slice(0, 400)}`)
  assert.match(said, /could not find a way to check/,
    `and the wording must say what it did not find, not that none exists: ${said.slice(0, 400)}`)

  // The must-fail direction: a PAIRED, non-empty span does suppress it, or the
  // advice fires on every Blocked-on and the assertion above proves nothing.
  const ok = corpus()
  writeTask(ok, readTask(ok)
    .replace(/```bash\n[\s\S]*?```/, 'Acceptance is human-observed: a person watches it.')
    .replace('**Depends-on:**',
      '**Blocked-on:** the branch merges (`git merge-base --is-ancestor abc master`)\n**Depends-on:**'))
  const quiet = `${lint(ok).stdout ?? ''}${lint(ok).stderr ?? ''}`
  assert.doesNotMatch(quiet, /could not find a way to check/,
    `a real command must silence it: ${quiet.slice(0, 400)}`)
})

// ADR-025. `--mutant` already runs the acceptance fence CLEAN before it applies
// the mutant (ADR-016: a failure that already exists cannot be donated), and
// then throws the result away — while adr-execute step 4 has the agent run the
// identical fence on identical bytes seconds earlier. Measured 2026-09-02 across
// this corpus: 94 of 281 fence executions, a third, are that duplicate.
// Nothing here reuses, caches or skips a run. The run happened; it is recorded.
const ENTRY_RE =
  // `no-git` is what git_sha() returns in a temp corpus that is not a repository,
  // and the entry grammar accepts it — a regex that only allowed hex made this
  // suite blind to every entry it was about to assert on.
  /^- \d{4}-\d\d-\d\d · (?:[0-9a-f]{7,40}|no-git)\*? · exit \d+ · `[^`]+` · acceptance-sha256:[0-9a-f]{64} · ms:\d+$/m
const sectionOf = (text, heading) => {
  const body = text.split(`## ${heading}`)[1] ?? ''
  return body.split(/^## /m)[0]
}
const entriesIn = text => sectionOf(text, 'Verification Log')
  .split('\n').filter(l => ENTRY_RE.test(l))

test('a mutant run records the verification entry its clean fence earned', () => {
  const copy = corpus()
  addMutationLog(copy)
  assert.equal(entriesIn(readTask(copy)).length, 0, 'fixture starts with no entry')

  const result = mutate(copy)
  expectExit(result, 0, 'the mutant is killed as before')
  const after = readTask(copy)

  // Exactly one, and in the plain path's grammar — one writer, not a second
  // spelling. A drifted row is the pre-registered failure of this record.
  assert.equal(entriesIn(after).length, 1, `expected one entry:\n${entriesIn(after).join('\n')}`)
  assert.match(sectionOf(after, 'Mutation Log'), /mutant killed/, 'the mutation row is still written')
})

// The ordering this asserts was WRONG in the first draft of ADR-025, and the
// existing suite is what caught it: the entry was written before the mutant, so
// the mutant's fence read a tree that differed from the clean baseline in two
// things — the mutation AND our own bookkeeping — and a survivor came back
// credited as a kill. ADR-016's premise is that they differ only in the
// mutation, so the entry is now written after the verdict. This test exists to
// keep it there.
test('recording the run does not change the verdict the mutant earned', () => {
  const copy = corpus()
  addMutationLog(copy)
  addBlindSpot(copy)
  // A mutant nothing reads: it MUST survive, and a survivor is exit 1. If the
  // entry write leaked into the tree the mutant fence reads, this comes back 0.
  const survived = verify(copy, [
    '--cwd', '.', '--mutant', 'unused.py',
    '--from', 'THRESHOLD = 1', '--to', 'THRESHOLD = 99',
    '--why', 'nothing reads this, so nothing can go red',
  ])
  expectExit(survived, 1, `a survivor must not be credited as a kill:\n${survived.stdout}`)
  // And the run was still recorded — the point of the record, not just its safety.
  assert.equal(entriesIn(readTask(copy)).length, 1, 'the clean run is recorded anyway')
})

test('the verification entry outlives the restore', () => {
  const copy = corpus()
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'mutant killed')
  assert.equal(entriesIn(readTask(copy)).length, 1, 'the entry outlived the restore')
  assert.match(readFileSync(join(copy, 'ADR-001-selftest.md'), 'utf8'),
    /## Alternatives Considered/, 'the mutated file was restored')
})

test('a failing clean fence is recorded before it is refused', () => {
  const copy = corpus()
  addMutationLog(copy)
  // Break the fence itself. The clean run now fails, so no mutant may be judged
  // — but the run is a real observation and today it is discarded in silence.
  writeTask(copy, readTask(copy).replace(/```bash\n[\s\S]*?\n```/,
    '```bash\nexit 3\n```'))
  const result = mutate(copy)
  assert.notEqual(result.status, 0, `the refusal is unchanged:\n${result.stdout}`)
  assert.match(result.stdout, /UNPROVEN/, result.stdout)
  const after = readTask(copy)
  assert.equal(entriesIn(after).length, 1, 'the observation the run made is kept')
  assert.match(entriesIn(after)[0], /exit 3/, entriesIn(after)[0])
  assert.doesNotMatch(sectionOf(after, 'Mutation Log'), /mutant/, 'no mutation row for a refused run')
})

test('a plain run still writes no mutation row', () => {
  const copy = corpus()
  addMutationLog(copy)
  expectExit(verify(copy, ['--cwd', '.']), 0, 'the plain path is unchanged')
  const after = readTask(copy)
  assert.equal(entriesIn(after).length, 1, 'one entry, as always')
  assert.doesNotMatch(sectionOf(after, 'Mutation Log'), /mutant/,
    'the two paths did not collapse into one command')
})

// ADR-025, and the defect this test exists for shipped in v2.56.0. `record_run`
// took a START time and subtracted at write time, which was correct while the
// only caller wrote immediately after its fence. The `--mutant` caller writes
// AFTER the mutant has run and been restored, so the subtraction quietly totalled
// both runs: T1's own entry recorded ms:39701 for a fence measured at 28,742ms.
//
// Bounded on BOTH sides on purpose. An upper bound alone is passed by a broken
// implementation that records zero, and `ms:` is read back as evidence of what
// the lifecycle costs (docs/BACKLOG.md §111) — a field that names one run and
// totals two corrupts the measurement that justified the record.
test('the recorded duration is the clean fence, not the clean fence plus the mutant', () => {
  // The fence sleeps a second so it DOMINATES process startup. A ratio against
  // the whole invocation was the first attempt and it was vacuous: the fixture's
  // fence is ~100ms, startup is the same order, so the buggy total and the
  // correct one did not separate and the test passed with the defect put back.
  const SLEEP_MS = 1000
  const fence = '```bash\nset -e\npython3 -c "import time; time.sleep(1)"\n'
    + 'adr-lint ADR-001-selftest.md tasks\n```'

  // ⚠ THE CEILING USED TO BE A CONSTANT (SLEEP_MS * 1.8), AND A CONSTANT IS A
  // CLOCK. Measured 2026-09-04 on one tree: this passed at 2.21s alone and
  // FAILED at 4.77s with a review running beside it — the fence still slept
  // once, the machine was just busy, and the test could not tell those apart
  // (BACKLOG §127b). So the ceiling is now a MEASUREMENT taken on the same
  // machine moments earlier: one run of the same fence. Both invocations pay the
  // same startup and the same load, so the ratio separates one sleep from two
  // however slow the runner is. The FLOOR stays absolute on purpose — load only
  // ever makes `ms` bigger, so a floor cannot false-fail, and it is what catches
  // an implementation that records zero.
  const baseline = corpus()
  writeTask(baseline, readTask(baseline).replace(/```bash\n[\s\S]*?\n```/, fence))
  // Its EXIT is not the point and is not asserted: outside the mutant flow this
  // fence's lint fails, and an entry is written either way. What the baseline is
  // for is one honest measurement of one run of this fence on this machine.
  verify(baseline, ['--cwd', '.'])
  const single = Number(/ms:(\d+)/.exec(entriesIn(readTask(baseline)).at(-1))[1])
  assert.ok(single >= SLEEP_MS * 0.8,
    `the baseline recorded ms:${single}, below the second it provably sleeps — it is not a usable yardstick`)

  const copy = corpus()
  addMutationLog(copy)
  writeTask(copy, readTask(copy).replace(/```bash\n[\s\S]*?\n```/, fence))
  expectExit(mutate(copy), 0, 'mutant killed')

  const entry = entriesIn(readTask(copy)).at(-1)
  const ms = Number(/ms:(\d+)/.exec(entry)[1])
  assert.ok(ms >= SLEEP_MS * 0.8,
    `ms:${ms} is below the one second the clean fence provably sleeps:\n${entry}`)
  // The fence runs TWICE in this invocation — clean, then mutated. One sleep is
  // the clean run; two means the mutant leaked into the number.
  assert.ok(ms < single * 1.6,
    `ms:${ms} against a single measured run of ${single}ms — that spans both `
    + `sleeps, so it timed the mutant run too:\n${entry}`)
})

// Measured 2026-09-03 by feeding each runner's real empty-run output to the
// detector: Go and pytest were caught, and Rust, .NET, Java and Python's own
// unittest were NOT — an empty run was taken as evidence that something ran.
// That is the product's central promise failing quietly for four ecosystems,
// and the plugin's own tutorial used `python3 -m unittest`, so the documented
// first-run path was on an undetected runner.
//
// Driven through adr-verify rather than the helper, because the promise is
// about what the GATE does with an empty run, and asserting the pattern list
// would pass even if nothing consulted it.
for (const [runner, output] of [
  ['python unittest', 'Ran 0 tests in 0.000s\\n\\nOK'],
  ['python unittest 3.12', 'Ran 0 tests in 0.000s\\n\\nNO TESTS RAN'],
  ['cargo', 'running 0 tests\\ntest result: ok. 0 passed; 0 failed; 0 ignored'],
  ['dotnet', 'Passed!  - Failed: 0, Passed: 0, Skipped: 0, Total: 0'],
  ['maven surefire', 'Tests run: 0, Failures: 0, Errors: 0, Skipped: 0'],
]) {
  test(`an empty ${runner} run is not evidence`, () => {
    const copy = corpus()
    writeTask(copy, readTask(copy).replace(
      "python3 -c 'print(\"acceptance fence complete\")'",
      `python3 -c 'print("${output}")'`))
    const empty = verify(copy, ['--cwd', '.'])
    expectExit(empty, 1, `${runner}: exit 0 with nothing scored is not a pass`)
    assert.match(readTask(copy), /scored NO tests/, 'the entry says why it failed')
  })
}

// The other answer, or the patterns above would flag every run of those runners
// and the gate would be one people route around.
for (const [runner, output] of [
  ['python unittest', 'test_a (t.T) ... ok\\nRan 3 tests in 0.001s\\nOK'],
  ['cargo', 'running 5 tests\\ntest result: ok. 5 passed; 0 failed; 0 ignored'],
  ['dotnet', 'Passed!  - Failed: 0, Passed: 12, Skipped: 0, Total: 12'],
  ['maven surefire', 'Tests run: 9, Failures: 0, Errors: 0, Skipped: 0'],
]) {
  test(`a real ${runner} run is still evidence`, () => {
    const copy = corpus()
    writeTask(copy, readTask(copy).replace(
      "python3 -c 'print(\"acceptance fence complete\")'",
      `python3 -c 'print("${output}")'`))
    expectExit(verify(copy, ['--cwd', '.']), 0, `${runner}: a real run must still pass`)
  })
}

// ADR-028 T1. `--steps` records WHICH ordered steps a run exercised, as a trailing
// field on the entry the tool already writes.
//
// The risk that shapes these tests is not the writer, it is the READERS. The entry
// grammar is spelled out in six places across adr-lint, adr-next and adr-verify —
// the file's own comment at the `ms:` field says four and was already an undercount
// — and ADR-021 makes a row that stops parsing a change to the evidence. So the
// assertions below drive the REAL gates over a REAL entry rather than testing a
// regex against itself.

// The shared fixture is deliberately pre-ADR-018: it carries no `**Proof map:**`
// header and no `[S<n>]` identities, because other tests here exercise the legacy
// allowance through it. So a step-aware test brings its own identities rather than
// changing what every other test is standing on.
function addStepIdentities(copy) {
  writeTask(copy, readTask(copy).replace(
    /^1\. Write the failing test/m, '1. [S1] Write the failing test')
    .replace(/^2\. Fill every required section/m, '2. [S2] Fill every required section'))
}

test('an entry written without --steps is unchanged, and every reader still parses it', () => {
  const copy = corpus()
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'the mutant must be killed')
  expectExit(verify(copy, ['--cwd', '.']), 0, 'adr-verify')

  const entry = readTask(copy).split('## Verification Log')[1].split('## Mutation Log')[0]
  assert.doesNotMatch(entry, /steps:/, 'no field appears unless it was asked for')

  // The readers, driven for real. `done` is the strictest path: it requires an
  // exit-0 entry whose digest matches, so a row adr-lint could not parse fails here.
  markDone(copy)
  expectExit(lint(copy), 0, 'adr-lint must accept an entry written without --steps')
  // adr-next exits non-zero once nothing is READY, so its VERDICT is the claim:
  // `done` means it read the row as evidence. Asserting the exit code here would
  // test the wrong thing and pass for the wrong reason.
  assert.match(run('adr-next', ['ADR-001-selftest.md', '--all'], copy).stdout, /done\s+T1/,
    'adr-next must still read the row as evidence')
})

test('--steps records the steps a run exercised, and every reader still parses it', () => {
  // ONE entry, and it carries the field. Deliberately no mutation pass first: it
  // would write a SECOND row, and a reader too narrow to parse the steps row could
  // pass by reading the other one instead — measured 2026-09-03, when the mutant on
  // adr-next's pattern survived for exactly that reason.
  //
  // That second row USED to be written without `steps:` at all, and this comment
  // used to say so as though it were the design. It was the defect (BACKLOG §116),
  // fixed in ADR-028 T3; both rows now carry the field. The one-row rule stays
  // because the reason for it was never the missing field — it is that two rows
  // give a narrow reader something else to succeed on.
  const copy = corpus()
  addStepIdentities(copy)
  expectExit(verify(copy, ['--cwd', '.', '--steps', 'S1']), 0, 'adr-verify --steps')

  const entry = readTask(copy).split('## Verification Log')[1].split('## Mutation Log')[0]
  assert.match(entry, / · steps:S1$/m,
    'the field is trailing, so every reader that stops at the old end still matches')
  assert.equal((entry.match(/^- \d{4}-/gm) ?? []).length, 1,
    'exactly one row, or a reader could pass on a different one')

  // A reader whose pattern ends before the field stops seeing this row as
  // evidence — a lost row, which ADR-021 calls a change to the evidence, and
  // which adr-next's own comment says makes it "call a verified task unverified
  // and hand a session work that is already finished". Verified 2026-09-03: with
  // the reader narrowed, this same corpus reports READY instead of done.
  markDone(copy)
  assert.match(run('adr-next', ['ADR-001-selftest.md', '--all'], copy).stdout, /done\s+T1/,
    'adr-next must still read a row carrying the new field as evidence')
})

test('--steps refuses a step id the task never declared', () => {
  const copy = corpus()
  addStepIdentities(copy)
  addMutationLog(copy)
  // S1 and S2 are now declared; S9 is not. A field naming a step that does not
  // exist is a pointer to nothing, and the refusal must land BEFORE the fence runs
  // — the same preflight ordering `--covers` uses (ADR-016).
  const refused = verify(copy, ['--cwd', '.', '--steps', 'S9'])
  assert.notEqual(refused.status, 0, 'an undeclared step id must be refused')
  const said = `${refused.stdout}${refused.stderr}`
  assert.match(said, /S9/, 'the refusal names the id it refused')
  // Refused for the RIGHT reason. Without this the test passed against a fixture
  // declaring no identities at all, where every id is refused and the check under
  // test never ran.
  assert.match(said, /declare[sd]? S1, S2/,
    'the refusal must be about S9 being undeclared, not about there being no declarations')

  const after = readTask(copy)
  assert.doesNotMatch(after.split('## Verification Log')[1] ?? '', /steps:/,
    'a refused run writes nothing')
})

// ADR-028 T3. The clean entry a `--mutant` run writes is the SAME observation the
// plain path writes — `adr-verify`'s own comment at that call site says so — so it
// must carry `--steps` for the same reason the plain path's does. It did not: the
// flag was parsed, validated against the task's declared identities, and then
// dropped, because `record_run`'s `steps` parameter defaults to None and only the
// plain call site passed it.
//
// The gap was KNOWN before it was fixed. The comment on the test above says
// ADR-025's second row is written "WITHOUT steps" and routes around it by skipping
// the mutation pass — a workaround in a test is how a silent drop survives, because
// the suite then documents the defect instead of failing on it.
test("a mutation run's own clean entry carries the steps it was given", () => {
  const copy = corpus()
  addStepIdentities(copy)
  addMutationLog(copy)
  expectExit(verify(copy, [
    '--cwd', '.', '--steps', 'S1',
    '--mutant', 'ADR-001-selftest.md',
    '--from', '## Alternatives Considered', '--to', '## Alternatives Considred',
    '--why', 'adr-lint must notice its required alternatives section going missing',
  ]), 0, 'the mutant must be killed and the run recorded')

  const entries = readTask(copy).split('## Verification Log')[1].split('## Mutation Log')[0]
  const rows = entries.match(/^- \d{4}-.*$/gm) ?? []
  assert.equal(rows.length, 1,
    `a --mutant run writes exactly one Verification Log row: ${JSON.stringify(rows)}`)
  assert.match(rows[0], / · steps:S1$/,
    `the mutation path's clean entry must carry the field the plain path carries: ${rows[0]}`)

  // Shown capable of the other answer, in the same test: without --steps the same
  // path writes the same row WITHOUT the field. An assertion that only ever sees
  // one side cannot tell "the field is written" from "the field is always there".
  const bare = corpus()
  addStepIdentities(bare)
  addMutationLog(bare)
  expectExit(mutate(bare), 0, 'the mutant must be killed')
  assert.doesNotMatch(
    bare && readTask(bare).split('## Verification Log')[1].split('## Mutation Log')[0],
    /steps:/, 'no field appears on the mutation path either unless it was asked for')

  // And the readers still accept it. `done` is the strictest path, so a row
  // adr-lint could not parse fails here rather than silently ceasing to be evidence.
  markDone(copy)
  expectExit(lint(copy), 0, 'adr-lint must accept the mutation path row carrying steps')
})

// The same defect's other half, and the worse one. BACKLOG §116 reported the field
// being dropped; the cause is that `main()` calls `run_mutant()` — which always
// exits — BEFORE the `--steps` validation block runs at all. So on the `--mutant`
// path an undeclared step id was not merely unrecorded, it was unchecked: the
// preflight the plain path performs was unreachable. Measured 2026-09-04 by running
// `--steps S9 --mutant` and watching it complete.
test('--steps refuses an undeclared id on the --mutant path too', () => {
  const copy = corpus()
  addStepIdentities(copy)
  addMutationLog(copy)
  const refused = verify(copy, [
    '--cwd', '.', '--steps', 'S9',
    '--mutant', 'ADR-001-selftest.md',
    '--from', '## Alternatives Considered', '--to', '## Alternatives Considred',
    '--why', 'adr-lint must notice its required alternatives section going missing',
  ])
  assert.notEqual(refused.status, 0, 'an undeclared step id must be refused here as well')
  const said = `${refused.stdout}${refused.stderr}`
  assert.match(said, /declare[sd]? S1, S2/,
    `refused for being undeclared, not for some other reason: ${said}`)
  // The refusal must land BEFORE the mutant is applied. A refusal that arrives after
  // the source has been edited leaves a tree this process broke on purpose, and the
  // whole point of preflight ordering (ADR-016) is that it cannot.
  assert.doesNotMatch(said, /MUTANT APPLIED/,
    'the refusal must precede the mutant, not follow it')
  assert.doesNotMatch(readTask(copy).split('## Verification Log')[1] ?? '', /^- \d{4}-/m,
    'a refused run writes no entry')
})

// ADR-028 T3, the class audit — and the record of it being INCOMPLETE twice.
// §116 reported one path. A grep over three named branches found `--human` and
// `--human-mutant`, and the task claimed the set enumerated. An independent Codex
// review on 2026-09-04 then found two more, `--sweep` and `--restore`, which the
// grep had never looked at because it searched for branch names instead of for
// every exit out of `main()`. All four are here now, and the lesson is in the
// count, not in the list: a sweep is only as complete as the command that ran it,
// and this one was written twice before it was.
//
// None of the four runs a fence: `--human` records a run a PERSON took,
// `--human-mutant` executes nothing at all, `--restore` repairs a tree, and
// `--sweep` runs other tasks' fences rather than this task's. So each refuses the
// flag rather than carrying it.
test('--steps is refused on the paths where this tool runs no fence', () => {
  // Each path is paired with the phrase it must produce. A shared "must be
  // non-zero" check would pass on any refusal at all — including the `unknown
  // option` these once produced — which is the vacuity CLAUDE.md §4 names.
  for (const { args, needle } of [
    { args: ['--human', '0', '--why', 'a run taken by hand'],
      needle: '--steps records the ordered steps a run exercised' },
    { args: ['--human-mutant', 'ADR-001-selftest.md', '--from', '## Decision', '--to', '## Decisiun',
             '--test', 'adr-lint ADR-001-selftest.md tasks', '--test-exit', '1',
             '--why', 'the fence needs a database this checkout has no access to'],
      needle: '--steps records the ordered steps a run exercised' },
    { args: ['--restore'], needle: '--steps cannot be combined with --restore' },
    { args: ['--sweep', '.'], needle: '--steps cannot be combined with --sweep' },
  ]) {
    const copy = corpus()
    addStepIdentities(copy)
    addMutationLog(copy)
    const refused = verify(copy, ['--steps', 'S1', ...args])
    assert.notEqual(refused.status, 0, `--steps ${args[0]}: must be refused`)
    const said = `${refused.stdout}${refused.stderr}`
    assert.ok(said.includes(needle),
      `--steps ${args[0]}: refused for naming steps with no run, not for something else.\n` +
      `wanted: ${needle}\ngot: ${said}`)
  }

  // Shown capable of the other answer: --human WITHOUT --steps still works, so the
  // guard refuses the combination rather than the flag it was added beside.
  const ok = corpus()
  addMutationLog(ok)
  expectExit(verify(ok, ['--human', '0', '--why', 'a run taken by hand']), 0,
    '--human alone must still record its row')
})

// ADR-028 T3. `run_mutant` has TWO `record_run` call sites and the tests above
// reach only one — found by an independent Codex review on 2026-09-04, which
// observed that deleting `steps` from the UNPROVEN early return alone would leave
// every assertion green. That is a mutation this catalogue would have reported as
// GREEN, which is a finding about the suite rather than about the tool.
//
// The UNPROVEN path fires when the CLEAN fence fails, before any mutant is
// applied: no verdict is earned, but a run did happen and it recorded one, so the
// steps it named belong on that row for the same reason they belong on any other.
test("the UNPROVEN early return records the steps its run named", () => {
  const copy = corpus()
  addStepIdentities(copy)
  addMutationLog(copy)
  // A fence that cannot run at all. `nosuchrunner` is the same unusable-fence
  // shape the §71 regression above uses, so this reaches UNPROVEN rather than a
  // surviving mutant.
  writeTask(copy, readTask(copy).replace(/```bash\n[\s\S]*?```/,
    '```bash\nnosuchrunner --run-everything\n```'))
  const out = verify(copy, ['--cwd', '.', '--steps', 'S1',
    '--mutant', 'ADR-001-selftest.md',
    '--from', '## Alternatives Considered', '--to', '## Alternatives Considred',
    '--why', 'probe'])
  assert.notEqual(out.status, 0, 'a broken clean fence earns no verdict')
  const said = `${out.stdout}${out.stderr}`
  assert.match(said, /UNPROVEN/, `this must reach the UNPROVEN path: ${said}`)
  assert.doesNotMatch(said, /MUTANT APPLIED/, 'and no mutant may have been applied')

  const entries = readTask(copy).split('## Verification Log')[1].split('## Mutation Log')[0]
  const rows = entries.match(/^- \d{4}-.*$/gm) ?? []
  assert.equal(rows.length, 1, `one row, from the run that happened: ${JSON.stringify(rows)}`)
  assert.match(rows[0], / · steps:S1$/,
    `the UNPROVEN row must carry the steps its run named: ${rows[0]}`)

  // Shown capable of the other answer, so this cannot pass by the field always
  // being present: the same unusable fence without --steps writes no such field.
  const bare = corpus()
  addStepIdentities(bare)
  addMutationLog(bare)
  writeTask(bare, readTask(bare).replace(/```bash\n[\s\S]*?```/,
    '```bash\nnosuchrunner --run-everything\n```'))
  verify(bare, ['--cwd', '.', '--mutant', 'ADR-001-selftest.md',
    '--from', '## Alternatives Considered', '--to', '## Alternatives Considred',
    '--why', 'probe'])
  assert.doesNotMatch(
    readTask(bare).split('## Verification Log')[1].split('## Mutation Log')[0],
    /steps:/, 'no field on the UNPROVEN path either unless it was asked for')
})
