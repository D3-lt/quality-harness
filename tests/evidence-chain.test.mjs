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
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
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
    '```bash\necho starting; sleep 30\n```'))
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
  run('adr-verify', ['--cwd', '.', 'tasks/T1-fixture.md',
    '--mutant', 'marker.txt', '--from', 'RUN', '--to', 'SKIP', '--why', 'probe'], broken)
  const log = readTask(broken)
  assert.doesNotMatch(log, /mutant killed/, `a broken fence is not a kill:\n${log}`)
  assert.match(log, /mutant inconclusive/, log)
  assert.match(log, /predates the mutant/, log)
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
    `\`\`\`bash\nsleep ${seconds}; exit 1\n\`\`\``))
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
function runWith(journal, args, copy) {
  const win = process.platform === 'win32'
  return spawnSync(win ? 'python3' : join(bin, 'adr-verify'),
    win ? [join(bin, 'adr-verify'), ...args] : args,
    { cwd: copy, env: { ...env, CLAUDE_PLUGIN_DATA: journal }, encoding: 'utf8', timeout: 60_000 })
}

const mutated = copy => readFileSync(join(copy, 'ADR-001-selftest.md'), 'utf8').includes('## Decisiun')

async function untilMutated(copy) {
  for (let i = 0; i < 200 && !mutated(copy); i += 1) await setTimeout(25)
  return mutated(copy)
}

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
  expectExit(result, 0, 'adr-verify --restore')
  assert.match(result.stdout, /has changed since, so nothing was overwritten/)
  assert.match(readFileSync(record, 'utf8'), /edited after the kill/)
  assert.match(result.stdout, /pre-mutation content is at/,
    'refusing to overwrite must not also lose the original')
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
  expectExit(verify(ok, ['--cwd', '.']), 0, 'fence passes')
  addMutationLog(ok)
  expectExit(mutate(ok), 0, 'and a tool-written mutant is killed')
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
  expectExit(verify(copy, ['--cwd', '.']), 0, 'the fence passes')
  addMutationLog(copy)
  expectExit(mutate(copy), 0, 'and its mutant is killed')
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

  // The must-fail direction: recording the killed mutant clears it. Without this,
  // a check that refused every partial task would satisfy the assertion above.
  expectExit(mutate(copy), 0, 'the mutant is killed')
  expectExit(lint(copy), 0, 'and a partial task that met its obligation passes')
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
