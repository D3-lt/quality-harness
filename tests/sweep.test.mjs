import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const verify = join(repoRoot, 'plugin', 'bin', 'adr-verify')

/**
 * The digest adr-verify computes for a fence: SHA-256 of the fence with CRLF
 * folded to LF and fence-adjacent blank lines removed. Reimplemented here rather
 * than shelled out to, so a test asserting "this digest matches" is not asking
 * the subject under test whether it agrees with itself.
 */
function digestOf(fence) {
  const lines = fence.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start += 1
  while (end > start && !lines[end - 1].trim()) end -= 1
  return createHash('sha256').update(lines.slice(start, end).join('\n'), 'utf8').digest('hex')
}

/** A minimal corpus in a temp directory. Never the live one — see F-17. */
function corpus() {
  return mkdtempSync(join(os.tmpdir(), 'qh-sweep-'))
}

/**
 * One task file. `entries` are Verification Log lines; `digest` defaults to the
 * fence's own, which is what makes a claim re-checkable — pass a different one
 * to make it superseded.
 */
function task(dir, name, { fence, entries = ['exit-0'], digest, section = true } = {}) {
  const path = join(dir, `${name}.md`)
  mkdirSync(dirname(path), { recursive: true })
  const bound = digest ?? (fence === undefined ? '0'.repeat(64) : digestOf(fence))
  const log = entries.map(kind => kind === 'exit-0'
    ? `- 2026-08-28 · abc1234 · exit 0 · \`${(fence ?? '').split('\n')[0]}\` · acceptance-sha256:${bound}`
    : kind === 'exit-1'
      ? `- 2026-08-28 · abc1234 · exit 1 · \`x\` · acceptance-sha256:${bound}`
      : `- 2026-08-28 · human-observed · someone watched it happen`)
  writeFileSync(path, [
    `# Task ${name}`,
    '',
    ...(section && fence !== undefined ? ['## Acceptance', '', '```bash', fence, '```', ''] : []),
    '## Verification Log',
    ...log,
    '',
  ].join('\n'), 'utf8')
  return path
}

/** A task file with RAW Verification Log lines — for shapes `task()` will not build. */
function rawTask(dir, name, { fence, lines }) {
  const path = join(dir, `${name}.md`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, [
    `# Task ${name}`, '',
    ...(fence === undefined ? [] : ['## Acceptance', '', '```bash', fence, '```', '']),
    '## Verification Log', ...lines, '',
  ].join('\n'), 'utf8')
  return path
}

function sweep(dir, extra = []) {
  return spawnSync('python3', [verify, '--sweep', dir, ...extra],
    { encoding: 'utf8', timeout: 120_000 })
}

/** Every file under a directory, with its bytes — for the writes-nothing check. */
function snapshot(dir) {
  const out = new Map()
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) out.set(relative(dir, path), readFileSync(path, 'utf8'))
    }
  }
  walk(dir)
  return out
}

test('a claim whose fence still passes is counted as held', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  const run = sweep(dir)
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /0\s*\/\s*1/, run.stdout)
})

test('a claim whose fence no longer passes is named and fails the sweep', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  task(dir, 'T2-broken', { fence: 'exit 3' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'a false success must fail the sweep')
  assert.match(run.stdout, /T2-broken/, 'the failing claim must be named')
  assert.match(run.stdout, /1\s*\/\s*2/, run.stdout)
})

test('an entry whose digest no longer matches its fence is superseded', () => {
  const dir = corpus()
  // A held claim beside it, so the corpus HAS a rate. With only the superseded
  // claim there is nothing re-checkable, and F-12 rightly refuses to report one
  // — which would pass this test for the wrong reason.
  task(dir, 'T0-held', { fence: 'exit 0' })
  // The fence would FAIL if it ran. It must not run: the digest says this entry
  // proved a different command, so there is nothing here to re-check.
  task(dir, 'T1', { fence: 'exit 7', digest: 'b'.repeat(64) })
  const run = sweep(dir)
  assert.equal(run.status, 0, 'a superseded claim is not a false success')
  assert.match(run.stdout, /superseded/i)
  assert.match(run.stdout, /0\s*\/\s*1/, 'the superseded claim is in neither half')
})

test('a task with an exit-0 entry and no Acceptance fence is superseded', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  // The realistic shape: the fence was RECORDED and later deleted, so the entry
  // names a real command and there is no longer one to compare it against. An
  // entry with an empty command is not a shape adr-verify can write, and a
  // fixture that invents one tests the parser rather than the bucket.
  task(dir, 'T1', { fence: 'exit 0', section: false })
  const run = sweep(dir)
  assert.equal(run.status, 0, 'nothing to re-check is not a false success')
  assert.match(run.stdout, /superseded/i)
  assert.match(run.stdout, /no Acceptance fence/i, 'the reason must say which kind of superseded')
})

test('a fence the machine could not run is not a false success', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: 'qh-no-such-tool-anywhere --run' })
  const run = sweep(dir)
  assert.equal(run.status, 0, 'an absent tool is a machine problem, not a verdict')
  assert.match(run.stdout, /unrunnable/i)
  assert.match(run.stdout, /0\s*\/\s*1/, 'it is in neither half')
})

test('an assertion failure that merely mentions an environment string is still false', () => {
  const dir = corpus()
  // Both halves have to be true or this proves nothing, and the first version of
  // it proved nothing: its fence started with `echo`, so environment_failure()
  // never produced a diagnosis and the guard was never reached. A mutation
  // removing the guard came back GREEN and said so.
  //
  // So: output that DOES match a signature (Docker unreachable), from a run that
  // DID score tests. The suite ran and failed; the Docker line is incidental
  // text. environment_failure() documents that it never downgrades a real
  // failure, and this is the case where reusing it could launder one.
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', {
    fence: 'echo "Cannot connect to the Docker daemon"; echo "3 failed"; exit 1',
  })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'a real failure must not escape into unrunnable')
  assert.match(run.stdout, /FALSE.*T1/, 'it is false, not unrunnable')
  assert.match(run.stdout, /1\s*\/\s*2/, run.stdout)
})

test('a fence that invokes the sweep is reported unrunnable and never executed', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  // Without the guard this does not terminate: the sweep runs a fence that is a
  // sweep, forever. The test's own timeout is the backstop, not the assertion.
  task(dir, 'T1', { fence: `python3 ${JSON.stringify(verify)} --sweep ${JSON.stringify(dir)}` })
  const run = sweep(dir)
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /unrunnable/i)
  assert.match(run.stdout, /recurse/i, 'the reason must name why it was refused')
})

test('a fence that does not finish is unrunnable, not a verdict', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: 'sleep 30' })
  const run = sweep(dir, ['--timeout', '2'])
  assert.equal(run.status, 0, 'a fence that did not finish was not checked')
  assert.match(run.stdout, /did not finish/i)
})

test('a corpus with no claim reports no rate rather than a clean one', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0', entries: ['exit-1'] })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'nothing to check must not report success')
  assert.match(run.stdout + run.stderr, /no claim/i)
})

test('a human-observed entry is not a claim', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 9', entries: ['human'] })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'it carries no digest, so there is no claim to check')
  assert.match(run.stdout + run.stderr, /no claim/i)
})

test('two entries proving the same fence are one claim', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0', entries: ['exit-0', 'exit-0'] })
  const run = sweep(dir)
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /0\s*\/\s*1/, 'two entries, one fence, one claim')
})

test('a multi-line fence is re-checked whole, not by its first line', () => {
  const dir = corpus()
  // Line one passes; the fence as a whole does not. Re-checking only the shown
  // first line would call this held.
  task(dir, 'T1', { fence: 'echo first line\nexit 4' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'the whole fence is the command')
  assert.match(run.stdout, /1\s*\/\s*1/, run.stdout)
})

test('every claim lands in exactly one bucket and the four sum to the total', () => {
  const dir = corpus()
  task(dir, 'A-held', { fence: 'exit 0' })
  task(dir, 'B-false', { fence: 'exit 1' })
  task(dir, 'C-superseded', { fence: 'exit 0', digest: 'c'.repeat(64) })
  task(dir, 'D-unrunnable', { fence: 'qh-no-such-tool-anywhere' })
  const run = sweep(dir, ['--json'])
  const report = JSON.parse(run.stdout)
  assert.deepEqual(
    { held: report.held, false: report.false, superseded: report.superseded, unrunnable: report.unrunnable },
    { held: 1, false: 1, superseded: 1, unrunnable: 1 })
  assert.equal(report.held + report.false + report.superseded + report.unrunnable, report.claims,
    'the buckets must sum to the claim count — a claim in none of them is invisible')
})

test('superseded and unrunnable are printed even when zero', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  const run = sweep(dir)
  assert.match(run.stdout, /superseded/i, 'a bucket that vanishes when empty reads as absent')
  assert.match(run.stdout, /unrunnable/i)
})

test('a sweep leaves the corpus byte-identical', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  task(dir, 'T2', { fence: 'exit 1' })
  const before = snapshot(dir)
  sweep(dir)
  assert.deepEqual([...snapshot(dir).entries()], [...before.entries()],
    'the sweep reads and runs; it must never write into the corpus it is judging')
})

test('--sweep is named in the usage text', () => {
  const run = spawnSync('python3', [verify], { encoding: 'utf8' })
  assert.match(run.stdout + run.stderr, /--sweep/,
    'a mode the parser honours and the usage never advertises is discoverable only by reading source')
})

// ---------------------------------------------------------------------------
// Adversarial cases. Each one exists because a WRONG implementation passes every
// test above it — the method SWE-ABS (arXiv 2603.00520) uses to show that a
// green suite is a statement about the suite. Written by asking, of each test:
// what could be broken and still pass this?
// ---------------------------------------------------------------------------

test('a fence runs from the git root, not from the task directory', () => {
  // The bug this caught, measured 2026-08-28: the sweep ran each fence from the
  // task's own directory while adr-verify RECORDS them from the git root, so
  // `bash scripts/selftest.sh` gave exit 127 and was filed as a false success.
  // Two of the live corpus's claims were wrong for that reason alone.
  const dir = corpus()
  spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' })
  writeFileSync(join(dir, 'marker-at-the-root.txt'), 'here\n', 'utf8')
  const nested = join(dir, 'docs', 'adr', 'REC', 'tasks')
  mkdirSync(nested, { recursive: true })
  task(nested, 'T1', { fence: 'test -f marker-at-the-root.txt' })
  const run = sweep(dir)
  assert.equal(run.status, 0, `the fence must run where it was recorded:\n${run.stdout}`)
  assert.match(run.stdout, /0\s*\/\s*1/, run.stdout)
})

test('a Mutation Log line is not a claim', () => {
  // `mutant survived · exit 0 · \`file\` · why · acceptance-sha256:…` contains
  // both "exit 0" and a digest. A looser reader counts it, and then a SURVIVED
  // mutant — evidence that a test is decoration — is re-checked as if it were a
  // passing claim.
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  const d = digestOf('exit 0')
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2026-08-28 · abc1234 · mutant survived · exit 0 · \`x.mjs\` · why · acceptance-sha256:${d}`,
    `- 2026-08-28 · abc1234 · mutant killed · exit 1 · \`x.mjs\` · why · acceptance-sha256:${d}`,
  ] })
  const run = sweep(dir, ['--json'])
  assert.equal(JSON.parse(run.stdout).claims, 1, 'only the held task carries a claim')
})

test('a pre-digest entry is not a claim', () => {
  // Legacy evidence with no acceptance-sha256 cannot say WHICH command it
  // proved, so there is nothing to compare against the current fence. Counting
  // it would re-check a command the entry never named.
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  rawTask(dir, 'T1', { fence: 'exit 5', lines: [
    '- 2026-08-27 · abc1234 · exit 0 · `exit 5`',
  ] })
  const run = sweep(dir, ['--json'])
  assert.equal(JSON.parse(run.stdout).claims, 1)
})

test('a malformed digest is not a claim', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  rawTask(dir, 'T1', { fence: 'exit 5', lines: [
    `- 2026-08-27 · abc1234 · exit 0 · \`exit 5\` · acceptance-sha256:${'a'.repeat(63)}`,
    `- 2026-08-27 · abc1234 · exit 0 · \`exit 5\` · acceptance-sha256:${'z'.repeat(64)}`,
  ] })
  const run = sweep(dir, ['--json'])
  assert.equal(JSON.parse(run.stdout).claims, 1, 'neither a short digest nor a non-hex one is one')
})

test('one task with two different digests is two claims', () => {
  // This is what kills "count the first entry per task", which passes every
  // other test here. The task was verified, its fence changed, and it was
  // verified again: one claim is current, one is superseded.
  const dir = corpus()
  const d = digestOf('exit 0')
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2026-08-27 · aaa1111 · exit 0 · \`old command\` · acceptance-sha256:${'e'.repeat(64)}`,
    `- 2026-08-28 · bbb2222 · exit 0 · \`exit 0\` · acceptance-sha256:${d}`,
  ] })
  const run = sweep(dir, ['--json'])
  const report = JSON.parse(run.stdout)
  assert.deepEqual({ claims: report.claims, held: report.held, superseded: report.superseded },
    { claims: 2, held: 1, superseded: 1 })
})

test('a fence that exits 0 having scored nothing is false, not held', () => {
  // The vacuous case, and the reason adr-verify already records such a run as a
  // failure: delete the tests a claim was about and its fence still exits 0. An
  // implementation that trusts the exit code alone reports it held forever.
  const dir = corpus()
  // 'collected 0 items' is pytest's real wording. The first version of this
  // fixture echoed 'no tests to run' without the brackets go actually prints,
  // and matched no signature — a fixture that cannot produce the condition
  // proves nothing however it is worded.
  task(dir, 'T1', { fence: 'echo "collected 0 items"; exit 0' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'a filter that matches nothing is not a passing claim')
  assert.match(run.stdout, /scored no tests/i)
})

test('an empty corpus reports no claim rather than a clean sweep', () => {
  const dir = corpus()
  const run = sweep(dir)
  assert.notEqual(run.status, 0, '0/0 is not a clean bill of health')
  assert.match(run.stdout + run.stderr, /no claim/i)
})

test('a corpus path that is not a directory is refused, not swept', () => {
  const dir = corpus()
  const file = task(dir, 'T1', { fence: 'exit 0' })
  const run = sweep(file)
  assert.notEqual(run.status, 0)
  assert.match(run.stdout + run.stderr, /not a directory/i)
})

test('a nonsensical timeout is refused rather than silently meaning forever', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  for (const bad of ['0', '-5', 'soon']) {
    const run = sweep(dir, ['--timeout', bad])
    assert.notEqual(run.status, 0, `--timeout ${bad} must be refused`)
    assert.match(run.stdout + run.stderr, /timeout/i, `--timeout ${bad} must say why`)
  }
})

test('no-git and dirty-tree shas are both still claims', () => {
  // The recording path writes `no-git` outside a repository and appends `*` on a
  // dirty tree. A reader accepting only clean hex silently drops real claims —
  // and dropping claims makes the rate look better, which is the direction that
  // matters.
  const dir = corpus()
  const d = digestOf('exit 0')
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2026-08-28 · no-git · exit 0 · \`exit 0\` · acceptance-sha256:${d}`,
  ] })
  rawTask(dir, 'T2', { fence: 'exit 0', lines: [
    `- 2026-08-28 · abc1234* · exit 0 · \`exit 0\` · acceptance-sha256:${d}`,
  ] })
  const run = sweep(dir, ['--json'])
  assert.equal(JSON.parse(run.stdout).claims, 2)
})

test('a CRLF fence still matches the digest recorded for it', () => {
  // The digest normalizes line endings, so a checkout that converted them must
  // not turn every claim in the corpus superseded at once.
  const dir = corpus()
  const path = join(dir, 'T1.md')
  writeFileSync(path, [
    '# Task T1', '', '## Acceptance', '', '```bash', 'echo one', 'exit 0', '```', '',
    '## Verification Log',
    `- 2026-08-28 · abc1234 · exit 0 · \`echo one …\` · acceptance-sha256:${digestOf('echo one\nexit 0')}`,
    '',
  ].join('\r\n'), 'utf8')
  const run = sweep(dir, ['--json'])
  const report = JSON.parse(run.stdout)
  assert.deepEqual({ claims: report.claims, held: report.held, superseded: report.superseded },
    { claims: 1, held: 1, superseded: 0 })
})

test('a Verification Log with no entries is not a claim', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  rawTask(dir, 'T1', { fence: 'exit 5', lines: [] })
  const run = sweep(dir, ['--json'])
  assert.equal(JSON.parse(run.stdout).claims, 1)
})

// ---------------------------------------------------------------------------
// T2 — strictFrom demotes a finding without changing the count.
// ---------------------------------------------------------------------------

/** A corpus laid out the way a real one is, so a record number can be derived. */
function record(dir, adr, taskName, opts) {
  const tasks = join(dir, 'docs', 'adr', adr, 'tasks')
  mkdirSync(tasks, { recursive: true })
  return task(tasks, taskName, opts)
}

function configured(dir, body) {
  spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' })
  if (body !== undefined) writeFileSync(join(dir, '.quality-harness.json'), body, 'utf8')
  return dir
}

test('a false success below the strictFrom cutoff is advice, not a failure', () => {
  const dir = configured(corpus(), '{"strictFrom": "ADR-005"}')
  record(dir, 'ADR-002-old', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.equal(run.status, 0, `a record below the cutoff must not fail the sweep:\n${run.stdout}`)
  assert.match(run.stdout, /ADR-002-old/, 'and it is still reported')
})

test('a false success at or above the cutoff still fails', () => {
  const dir = configured(corpus(), '{"strictFrom": "ADR-005"}')
  record(dir, 'ADR-007-new', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'the cutoff is a floor, not an amnesty')
})

test('the verdict line names strictFrom whenever it is in effect', () => {
  const dir = configured(corpus(), '{"strictFrom": "ADR-005"}')
  record(dir, 'ADR-002-old', 'T1', { fence: 'exit 1' })
  assert.match(sweep(dir).stdout, /strictFrom/,
    'a demoted run must never be mistaken for a clean one')
})

test('strictFrom changes the exit code and nothing else', () => {
  const withCutoff = configured(corpus(), '{"strictFrom": "ADR-005"}')
  record(withCutoff, 'ADR-002-old', 'T1', { fence: 'exit 1' })
  record(withCutoff, 'ADR-007-new', 'T1', { fence: 'exit 0' })
  const without = configured(corpus())
  record(without, 'ADR-002-old', 'T1', { fence: 'exit 1' })
  record(without, 'ADR-007-new', 'T1', { fence: 'exit 0' })

  const a = JSON.parse(sweep(withCutoff, ['--json']).stdout)
  const b = JSON.parse(sweep(without, ['--json']).stdout)
  delete a.false_claims
  delete b.false_claims
  assert.deepEqual(a, b, 'the counts must be identical — the cutoff is not a way to hide one')
})

test('a malformed config advises and does not silently demote', () => {
  const dir = configured(corpus(), '{ not json at all')
  record(dir, 'ADR-002-old', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'an unreadable config must not quietly become an amnesty')
  assert.match(run.stdout + run.stderr, /could not be read|checked in full/i)
})

test('a strictFrom naming no number is refused, not guessed at', () => {
  const dir = configured(corpus(), '{"strictFrom": "the newest one"}')
  record(dir, 'ADR-002-old', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0)
  assert.match(run.stdout + run.stderr, /names no ADR number|checked in full/i)
})

test('a record whose number cannot be parsed is never treated as below the cutoff', () => {
  // A record named outside the ADR-NNN convention has no number to compare. It
  // must be checked in full: demoting it would be silent and permanent.
  const dir = configured(corpus(), '{"strictFrom": "ADR-005"}')
  record(dir, 'a-record-with-no-number', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'no number means no demotion')
})

test('an absent config leaves every finding at full strength', () => {
  const dir = configured(corpus())
  record(dir, 'ADR-002-old', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'strict is the default; opting out is explicit')
  assert.doesNotMatch(run.stdout, /strictFrom/, 'and it says nothing about a cutoff there is none of')
})

// ---------------------------------------------------------------------------
// A population, not a happy path.
//
// The shapes below were taken from a real ADR corpus of 174 records and 424 task
// files (surveyed 2026-08-28, read-only). It carries forms this repository does
// not have a single instance of, and every one of them reaches the sweep:
//
//   * record numbers with a letter suffix — ADR-111a, ADR-111b, ADR-111c (3 of 174)
//   * README.md files inside tasks/ directories (99 of 424)
//   * acceptance that is human-observed prose with no bash fence (59 of 400 sampled)
//   * Verification Log evidence written BY HAND before this tool existed, in a
//     grammar of its own — `- 2026-06-30 \`cargo nextest run …\` → exit 0, 251 passed`
//     — which is most of that corpus
//
// A gate that is only ever pointed at the corpus that grew up with it has been
// tested against one population of one. These are the others.
// ---------------------------------------------------------------------------

/** A whole corpus in one call: [name, options] pairs laid out under docs/adr. */
function population(dir, records) {
  spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' })
  for (const [adr, name, opts] of records) {
    const tasks = join(dir, 'docs', 'adr', adr, 'tasks')
    mkdirSync(tasks, { recursive: true })
    if (opts.raw !== undefined) rawTask(tasks, name, opts.raw)
    else task(tasks, name, opts)
  }
  return dir
}

test('a population of real corpus shapes is classified without crashing or lying', () => {
  const dir = corpus()
  const d = digestOf('exit 0')
  population(dir, [
    // --- claims that hold -------------------------------------------------
    ['ADR-001-first', 'T1', { fence: 'exit 0' }],
    ['ADR-002-second', 'T1', { fence: 'exit 0' }],
    ['ADR-002-second', 'T2', { fence: 'echo one\nexit 0' }],
    // --- claims that no longer hold ---------------------------------------
    ['ADR-003-broken', 'T1', { fence: 'exit 1' }],
    ['ADR-003-broken', 'T2', { fence: 'exit 42' }],
    // --- superseded: the fence moved on ------------------------------------
    ['ADR-004-changed', 'T1', { fence: 'exit 0', digest: 'a'.repeat(64) }],
    // --- superseded: human-observed acceptance, no bash fence at all --------
    ['ADR-005-human', 'T1', { fence: 'exit 0', section: false }],
    // --- unrunnable: the tool is not on this machine ------------------------
    ['ADR-006-infra', 'T1', { fence: 'qh-no-such-tool-anywhere --daemon' }],
    // --- not claims at all --------------------------------------------------
    // hand-written evidence predating the tool: a real grammar, and not ours
    ['ADR-007-legacy', 'T1', { raw: { fence: 'exit 1', lines: [
      '- 2026-06-30 `cargo nextest run -p zeus-contracts` → exit 0, 251 passed',
      '- 2026-07-15 (coordinator-verified, independent of the executing subagent):',
    ] } }],
    // a human-observed sign-off carries no digest, so there is nothing to check
    ['ADR-008-signoff', 'T1', { fence: 'exit 1', entries: ['human'] }],
    // TDD-red evidence is evidence, and it is not a claim
    ['ADR-009-red', 'T1', { fence: 'exit 1', entries: ['exit-1'] }],
    // a mutation log line carries exit 0 AND a digest, and is not a claim
    ['ADR-010-mutants', 'T1', { raw: { fence: 'exit 1', lines: [
      `- 2026-08-28 · abc1234 · mutant survived · exit 0 · \`x.mjs\` · why · acceptance-sha256:${d}`,
    ] } }],
    // a letter-suffixed record number, which our parser cannot read
    ['ADR-011a-suffixed', 'T1', { fence: 'exit 0' }],
    ['ADR-011b-suffixed', 'T1', { fence: 'exit 1' }],
  ])
  // 99 of 424 files in the real corpus are READMEs sitting beside the tasks.
  writeFileSync(join(dir, 'docs', 'adr', 'ADR-001-first', 'tasks', 'README.md'),
    '# Tasks\n\n| ID | Status |\n|----|--------|\n| T1 | done |\n', 'utf8')

  const run = sweep(dir, ['--json'])
  assert.equal(typeof run.status, 'number', 'the sweep must terminate on every shape')
  assert.doesNotMatch(run.stderr, /Traceback/, `no shape may crash it:\n${run.stderr}`)

  const r = JSON.parse(run.stdout)
  assert.deepEqual(
    { claims: r.claims, held: r.held, false: r.false, superseded: r.superseded, unrunnable: r.unrunnable },
    // Counted from the fixture, and the first version of this line was wrong in a
    // way worth keeping visible: it said 9 claims while its own buckets summed to
    // 11. The sum assertion below is what makes that kind of arithmetic a failure
    // rather than a plausible-looking number.
    { claims: 10, held: 4, false: 3, superseded: 2, unrunnable: 1 },
    `the population must classify exactly:\n${run.stdout}`)
  assert.equal(r.held + r.false + r.superseded + r.unrunnable, r.claims,
    'a claim in no bucket is a claim nobody can see')
})

test('the same unchanged corpus gives the same answer twice', () => {
  // Not pedantry. Two sweeps of this repository's corpus disagreed on 2026-08-28
  // — 7 false against 6 — because a mutation campaign was rewriting source files
  // between them. The sweep has no idea it is standing on a moving tree, and a
  // number that changes without the corpus changing is worse than no number.
  const dir = corpus()
  population(dir, [
    ['ADR-001-a', 'T1', { fence: 'exit 0' }],
    ['ADR-002-b', 'T1', { fence: 'exit 1' }],
    ['ADR-003-c', 'T1', { fence: 'qh-no-such-tool-anywhere' }],
  ])
  const first = sweep(dir, ['--json']).stdout
  const second = sweep(dir, ['--json']).stdout
  assert.equal(first, second, 'an unchanged corpus must classify identically')
})

test('a corpus whose evidence predates the tool reports no claim, not a clean bill', () => {
  // The single most likely first contact: a real corpus with years of hand-written
  // evidence in a grammar of its own. None of it is a claim this tool can
  // re-check, and the honest answer is to say so — reporting 0 false over 0
  // checked as success would tell an adopting team their corpus is verified when
  // nothing in it was read.
  const dir = corpus()
  population(dir, [
    ['ADR-001-legacy', 'T1', { raw: { fence: 'cargo test', lines: [
      '- 2026-06-29 `cargo nextest run -p zeus-orchestrator -E \'test(abort)\'` → 2 abort',
      '- 2026-07-15 (coordinator): T7 acceptance GREEN',
    ] } }],
    ['ADR-002-legacy', 'T1', { raw: { fence: 'cargo test', lines: [
      '- 2026-06-30 `cargo nextest run -p zeus-eval-harness` → exit 0',
    ] } }],
  ])
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'nothing was checked, so nothing is verified')
  assert.match(run.stdout, /no claim/i)
})

test('a record number our parser cannot read is never demoted', () => {
  // ADR-111a/b/c exist in the wild. `record_number_of` returns None for them, and
  // None must mean "checked in full" rather than "below the cutoff" — the second
  // reading demotes a record silently and forever.
  const dir = configured(corpus(), '{"strictFrom": "ADR-900"}')
  record(dir, 'ADR-011a-suffixed', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0,
    'a cutoff above every record must still not demote one whose number cannot be read')
})

test('a README beside the tasks is read and carries nothing', () => {
  const dir = corpus()
  const tasks = join(dir, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  task(tasks, 'T1', { fence: 'exit 0' })
  writeFileSync(join(tasks, 'README.md'), '# Tasks\n\n| T1 | done |\n', 'utf8')
  const run = sweep(dir, ['--json'])
  assert.equal(JSON.parse(run.stdout).claims, 1, 'an index is not a claim')
})

test('an empty Acceptance fence is not a claim that held', () => {
  // An empty fence exits 0, so a naive reader calls it held — a claim proved by a
  // command that does nothing, which is the vacuity this whole record exists to
  // refuse. adr-verify will not RECORD an empty fence, so this can only arrive by
  // hand, which is exactly when it should not be believed.
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: '' })
  task(dir, 'T2', { fence: '   ' })
  const run = sweep(dir, ['--json'])
  const r = JSON.parse(run.stdout)
  assert.equal(r.held, 1, `only the real claim held:\n${run.stdout}`)
})

// ---------------------------------------------------------------------------
// Stress. Six axes, and the point of each is a shape somebody will hand this
// tool that nobody wrote it for. Where a case asserts a REFUSAL rather than an
// answer, that is deliberate: a gate that guesses is worse than one that stops.
// ---------------------------------------------------------------------------

// --- A. invocation ----------------------------------------------------------

test('--sweep with no directory after it is refused', () => {
  const run = spawnSync('python3', [verify, '--sweep'], { encoding: 'utf8' })
  assert.notEqual(run.status, 0)
  assert.doesNotMatch(run.stderr, /Traceback/, 'a missing operand is a usage error, not a crash')
})

test('a corpus path that does not exist is refused, not swept as empty', () => {
  const run = sweep(join(corpus(), 'no-such-directory'))
  assert.notEqual(run.status, 0)
  assert.match(run.stdout + run.stderr, /not a directory/i,
    'an absent corpus must not read as a corpus with nothing wrong in it')
})

test('an unknown flag beside --sweep is refused', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  const run = sweep(dir, ['--not-a-flag'])
  assert.notEqual(run.status, 0)
  assert.match(run.stdout + run.stderr, /unknown option/i)
})

test('the json report and the printed report agree on every count', () => {
  const dir = corpus()
  task(dir, 'A', { fence: 'exit 0' })
  task(dir, 'B', { fence: 'exit 1' })
  task(dir, 'C', { fence: 'exit 0', digest: 'f'.repeat(64) })
  task(dir, 'D', { fence: 'qh-no-such-tool-anywhere' })
  const r = JSON.parse(sweep(dir, ['--json']).stdout)
  const text = sweep(dir).stdout
  assert.match(text, new RegExp(`${r.false}\\s*/\\s*${r.held + r.false}`),
    `the printed rate must equal the json one:\n${text}`)
  assert.match(text, new RegExp(`${r.superseded} superseded`))
  assert.match(text, new RegExp(`${r.unrunnable} unrunnable`))
})

test('a corpus reached through a symlink is swept', () => {
  const real = corpus()
  task(real, 'T1', { fence: 'exit 0' })
  const link = join(mkdtempSync(join(os.tmpdir(), 'qh-link-')), 'corpus')
  symlinkSync(real, link, 'dir')
  assert.equal(JSON.parse(sweep(link, ['--json']).stdout).claims, 1)
})

// --- B. corpus structure ----------------------------------------------------

test('a task ten directories down is still found', () => {
  const dir = corpus()
  const deep = join(dir, ...Array.from({ length: 10 }, (_, i) => `level${i}`))
  mkdirSync(deep, { recursive: true })
  task(deep, 'T1', { fence: 'exit 0' })
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1)
})

test('a byte-order mark does not hide a claim', () => {
  const dir = corpus()
  const path = task(dir, 'T1', { fence: 'exit 0' })
  writeFileSync(path, '﻿' + readFileSync(path, 'utf8'), 'utf8')
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1,
    'a BOM is invisible to a reader and must be invisible here')
})

test('bytes that are not valid UTF-8 do not crash the sweep', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  writeFileSync(join(dir, 'T2.md'), Buffer.from([0xff, 0xfe, 0x00, 0x41, 0x0a]))
  const run = sweep(dir, ['--json'])
  assert.doesNotMatch(run.stderr, /Traceback|UnicodeDecodeError/, run.stderr)
  assert.equal(JSON.parse(run.stdout).claims, 1)
})

test('an entry after the Verification Log section belongs to no claim', () => {
  // A line that LOOKS like an entry but sits under a later heading is not in the
  // log. Reading to end-of-file instead of end-of-section would count it.
  const dir = corpus()
  const d = digestOf('exit 1')
  rawTask(dir, 'T1', { fence: 'exit 1', lines: [] })
  const path = join(dir, 'T1.md')
  writeFileSync(path, readFileSync(path, 'utf8')
    + `\n## Notes\n\n- 2026-08-28 · abc1234 · exit 0 · \`exit 1\` · acceptance-sha256:${d}\n`, 'utf8')
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'nothing in the log means no claim')
  assert.match(run.stdout + run.stderr, /no claim/i)
})

test('a hundred tasks terminate and count correctly', () => {
  const dir = corpus()
  for (let i = 0; i < 100; i += 1) {
    task(dir, `T${i}`, { fence: i % 10 === 0 ? 'exit 1' : 'exit 0' })
  }
  const r = JSON.parse(sweep(dir, ['--json']).stdout)
  assert.deepEqual({ claims: r.claims, held: r.held, false: r.false }, { claims: 100, held: 90, false: 10 })
})

// --- C. entry grammar -------------------------------------------------------

test('a forty-character sha is a claim and a six-character one is not', () => {
  // The recording path writes a short sha; a repository configured for longer
  // ones writes forty. Six is below anything git produces, and a reader that
  // accepts it is accepting text rather than a sha.
  const dir = corpus()
  const d = digestOf('exit 0')
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2026-08-28 · ${'a'.repeat(40)} · exit 0 · \`exit 0\` · acceptance-sha256:${d}`,
  ] })
  rawTask(dir, 'T2', { fence: 'exit 0', lines: [
    `- 2026-08-28 · abcdef · exit 0 · \`exit 0\` · acceptance-sha256:${d}`,
  ] })
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1)
})

test('an uppercase digest is not a claim', () => {
  // The writer emits lowercase hex. Accepting either spelling means the same
  // fence can be recorded under two digests that never compare equal.
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2026-08-28 · abc1234 · exit 0 · \`exit 0\` · acceptance-sha256:${digestOf('exit 0').toUpperCase()}`,
  ] })
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1)
})

test('exit 00 is not exit 0', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2026-08-28 · abc1234 · exit 00 · \`exit 0\` · acceptance-sha256:${digestOf('exit 0')}`,
  ] })
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1,
    'the grammar is exact, and a near-miss is not a claim')
})

test('trailing whitespace after a digest does not lose the claim', () => {
  const dir = corpus()
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2026-08-28 · abc1234 · exit 0 · \`exit 0\` · acceptance-sha256:${digestOf('exit 0')}   `,
  ] })
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1,
    'an editor stripping or adding a space must not change the verdict')
})

test('two identical entries are one claim', () => {
  const dir = corpus()
  const line = `- 2026-08-28 · abc1234 · exit 0 · \`exit 0\` · acceptance-sha256:${digestOf('exit 0')}`
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [line, line] })
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1)
})

test('a date in the future is still a claim', () => {
  // The sweep judges commands, not calendars. Refusing a dated entry would be a
  // finding about the clock dressed up as one about the code.
  const dir = corpus()
  rawTask(dir, 'T1', { fence: 'exit 0', lines: [
    `- 2099-01-01 · abc1234 · exit 0 · \`exit 0\` · acceptance-sha256:${digestOf('exit 0')}`,
  ] })
  assert.equal(JSON.parse(sweep(dir, ['--json']).stdout).claims, 1)
})

// --- D. fence semantics -----------------------------------------------------

test('a fence whose middle command fails under set -e is false', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: 'set -e\nfalse\necho never printed' })
  // Exact buckets, not merely a non-zero exit: a crash, a wrong bucket and a
  // correct classification all exit non-zero, and only one of them is right.
  const r = JSON.parse(sweep(dir, ['--json']).stdout)
  assert.deepEqual({ held: r.held, false: r.false, unrunnable: r.unrunnable },
    { held: 1, false: 1, unrunnable: 0 })
})

test('a runner reporting zero examples is false, whatever its exit code', () => {
  // rspec's wording, not go's. The scored-nothing rule has to cover the runners
  // a corpus actually uses, and a table with one entry in it is a table that
  // works for one project.
  const dir = corpus()
  task(dir, 'T1', { fence: 'echo "0 examples, 0 failures"; exit 0' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0, 'nothing ran, so nothing was proved')
})

test('a fence that spawns a background process does not hang the sweep', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: '(sleep 60 &) ; exit 0' })
  const started = Date.now()
  const run = sweep(dir, ['--timeout', '20', '--json'])
  const r = JSON.parse(run.stdout)
  assert.deepEqual({ held: r.held, unrunnable: r.unrunnable }, { held: 2, unrunnable: 0 },
    'the fence exited 0, so it held — a timeout would have made it unrunnable')
  assert.ok(Date.now() - started < 15_000,
    'a detached child inherits the output pipes, so capturing through them holds '
    + 'the sweep open until the timeout even though the fence itself exited')
})

test('a fence that reads stdin fails rather than waiting for input nobody will type', () => {
  // The first version of this asserted only an exit code and a stopwatch, and it
  // passed with stdin=DEVNULL removed — the runner already hands its children a
  // closed stdin, so `cat` ended either way. A child that holds its OWN stdin
  // open is the shape that actually distinguishes them.
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: 'read -r line < /dev/stdin; echo "$line"' })
  const started = Date.now()
  const run = sweep(dir, ['--timeout', '20', '--json'])
  const r = JSON.parse(run.stdout)
  assert.equal(r.unrunnable, 0, 'stdin is closed, so the read ends rather than waiting')
  assert.ok(Date.now() - started < 15_000, 'and it ends at once, not at the timeout')
})

test('a fence mentioning --sweep inside a string is still refused', () => {
  // An over-refusal, and the direction is chosen: refusing a fence that only
  // TALKS about the sweep costs one honest claim, while running one that invokes
  // it costs the machine. Asserted so the trade is visible rather than accidental.
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: 'echo "this mentions --sweep in prose"; exit 0' })
  const run = sweep(dir)
  assert.match(run.stdout, /unrunnable/i)
})

test('a fence using $PWD sees the git root', () => {
  const dir = corpus()
  spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' })
  writeFileSync(join(dir, 'marker.txt'), 'x\n', 'utf8')
  const nested = join(dir, 'docs', 'adr', 'REC', 'tasks')
  mkdirSync(nested, { recursive: true })
  task(nested, 'T1', { fence: 'test -f "$PWD/marker.txt"' })
  assert.equal(sweep(dir).status, 0)
})

test('an exit code above 128 is a failure like any other', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 130' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0)
  assert.match(run.stdout, /exit 130/)
})

test('a very long single-line fence is handled', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: `echo ${'x'.repeat(20000)} > /dev/null; exit 0` })
  assert.equal(sweep(dir).status, 0)
})

// --- E. the strictFrom cutoff ----------------------------------------------

test('a record exactly at the cutoff is not demoted', () => {
  // "from" means inclusive. Off by one here silently exempts a whole record.
  const dir = configured(corpus(), '{"strictFrom": "ADR-005"}')
  record(dir, 'ADR-005-exactly', 'T1', { fence: 'exit 1' })
  assert.notEqual(sweep(dir).status, 0, 'the cutoff record itself is in scope')
})

test('a bare number is a valid cutoff', () => {
  const dir = configured(corpus(), '{"strictFrom": 12}')
  record(dir, 'ADR-003-below', 'T1', { fence: 'exit 1' })
  assert.equal(sweep(dir).status, 0, 'ADR-0012 and 12 name the same record')
})

test('strictFrom set to null is no cutoff at all', () => {
  const dir = configured(corpus(), '{"strictFrom": null}')
  record(dir, 'ADR-001-below', 'T1', { fence: 'exit 1' })
  assert.notEqual(sweep(dir).status, 0, 'null is absence, not zero')
})

test('a config that is valid JSON but not an object does not demote', () => {
  const dir = configured(corpus(), '["strictFrom", 5]')
  record(dir, 'ADR-001-below', 'T1', { fence: 'exit 1' })
  const run = sweep(dir)
  assert.notEqual(run.status, 0)
  assert.doesNotMatch(run.stderr, /Traceback/, run.stderr)
})

test('a cutoff above every record demotes every finding and still counts them', () => {
  const dir = configured(corpus(), '{"strictFrom": "ADR-900"}')
  record(dir, 'ADR-001-a', 'T1', { fence: 'exit 1' })
  record(dir, 'ADR-002-b', 'T1', { fence: 'exit 1' })
  const run = sweep(dir, ['--json'])
  assert.equal(JSON.parse(run.stdout).false, 2, 'demotion never changes the count')
  assert.equal(sweep(dir).status, 0, 'and it does change the exit code')
})

test('a corpus outside any git repository ignores strictFrom entirely', () => {
  // The cutoff is read from the repository root. With no repository there is no
  // root, and the honest answer is to check everything rather than to search
  // upward into whatever directory happens to contain the temp folder.
  const dir = corpus()
  record(dir, 'ADR-001-below', 'T1', { fence: 'exit 1' })
  assert.notEqual(sweep(dir).status, 0)
})

// --- what a cold review found, and the fixtures that hold it closed ---------

test('a fence that spells --sweep around the guard still cannot recurse', () => {
  // Bash turns --swee''p into --sweep, so the fence text contains no literal
  // --sweep and the substring check does not fire. Measured 2026-08-28: the run
  // recursed and only the timeout ended it. The environment sentinel is what
  // closes this, because the nested process refuses itself.
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: `python3 ${JSON.stringify(verify)} --swee''p ${JSON.stringify(dir)}` })
  const started = Date.now()
  const run = sweep(dir, ['--json'])          // the DEFAULT timeout, deliberately
  assert.equal(JSON.parse(run.stdout).unrunnable, 1)
  assert.ok(Date.now() - started < 30_000, 'it must refuse, not recurse until a timeout')
})

test('a fence running a suite that itself sweeps elsewhere is not recursion', () => {
  // Found by running the sweep on this repository's own corpus after a repair.
  // The sentinel was a boolean, inherited by the whole process tree, so a fence
  // running a test suite that legitimately exercises --sweep over its own temp
  // fixtures was refused as recursive — three real claims left the denominator
  // that way, and a claim leaving the denominator flatters the rate.
  //
  // Recursion is a sweep of a corpus an ancestor is ALREADY sweeping. A sweep of
  // somewhere else is a nested tool call, and those are ordinary.
  const outer = corpus()
  const inner = corpus()
  task(inner, 'X', { fence: 'exit 0' })
  task(outer, 'T1', {
    fence: `python3 ${JSON.stringify(verify)} --sweep ${JSON.stringify(inner)}`,
  })
  const r = JSON.parse(sweep(outer, ['--json']).stdout)
  assert.deepEqual({ held: r.held, unrunnable: r.unrunnable }, { held: 1, unrunnable: 0 },
    'sweeping a DIFFERENT corpus from inside a fence is legitimate')
})

test('a fence sweeping the corpus being swept is still refused', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: `python3 ${JSON.stringify(verify)} --sweep ${JSON.stringify(dir)}` })
  const r = JSON.parse(sweep(dir, ['--json']).stdout)
  assert.equal(r.unrunnable, 1, 'the same corpus is recursion whatever the spelling')
})

test('a claim this tool can write is a claim it can read back', () => {
  // The sweep demanded the fence immediately after the heading; the recording
  // path takes the whole section and finds the fence inside it. So a task with a
  // sentence of prose before its fence could be RECORDED and then read back as
  // having no fence — superseded, and gone from the denominator, which makes the
  // rate look better.
  const dir = corpus()
  const fence = 'exit 0'
  const path = join(dir, 'T1.md')
  writeFileSync(path, [
    '# Task T1', '', '## Acceptance', '',
    'Some prose the author wrote before the fence.', '',
    '```bash  ', fence, '```', '',
    '## Verification Log',
    `- 2026-08-28 · abc1234 · exit 0 · \`${fence}\` · acceptance-sha256:${digestOf(fence)}`,
    '',
  ].join('\n'), 'utf8')
  const r = JSON.parse(sweep(dir, ['--json']).stdout)
  assert.deepEqual({ claims: r.claims, held: r.held, superseded: r.superseded },
    { claims: 1, held: 1, superseded: 0 })
})

test('a fence of only comments proves nothing and is not held', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: '# nothing here\n  # nor here' })
  const r = JSON.parse(sweep(dir, ['--json']).stdout)
  assert.equal(r.held, 1, 'a fence that runs nothing exits 0 and proves nothing')
})

test('a real node failure mentioning an environment string is still false', () => {
  // The laundering path a review found: environment_failure() matched while
  // nothing in SOMETHING_RAN recognised node:test, so a genuine failing suite
  // was reclassified as a machine problem. Every fence in this repository is
  // node --test, which is how the gap survived.
  // ONE node shape per fixture. The first version printed both TAP and the
  // summary line, so removing either pattern left the other matching and the
  // mutation came back GREEN — the test asserted the right outcome through a
  // path that did not depend on the line under test.
  for (const [name, shape] of [['tap', 'not ok 1 - a real assertion'], ['summary', '\u2139 fail 1']]) {
    const dir = corpus()
    task(dir, 'T0-held', { fence: 'exit 0' })
    task(dir, 'T1', { fence: `echo "Cannot connect to the Docker daemon"; echo "${shape}"; exit 1` })
    const r = JSON.parse(sweep(dir, ['--json']).stdout)
    assert.deepEqual({ false: r.false, unrunnable: r.unrunnable }, { false: 1, unrunnable: 0 },
      `node's ${name} output alone must show the tests ran`)
  }
})

test('a fence that cannot be launched is unrunnable, not a traceback', () => {
  const dir = corpus()
  task(dir, 'T0-held', { fence: 'exit 0' })
  task(dir, 'T1', { fence: 'exit 0' })
  // python must stay findable while bash does not — a PATH of '/nonexistent'
  // takes the interpreter with it and tests nothing. resolve_bash() returns a
  // bare 'bash' on POSIX without checking it exists, so this is the real path to
  // a FileNotFoundError from launching.
  const python = spawnSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).stdout.trim()
  const run = spawnSync(python, [verify, '--sweep', dir, '--json'],
    { encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' }, timeout: 60_000 })
  assert.doesNotMatch(run.stderr ?? '', /Traceback/,
    `an OSError from launching must not end the whole sweep:\n${run.stderr}`)
  const r = JSON.parse(run.stdout)
  assert.equal(r.unrunnable, 2, 'no shell means every claim is unchecked, not failed')
  assert.equal(r.false, 0, 'and none of them is a verdict about the code')
})

test('sweep-only flags are refused in the recording modes rather than ignored', () => {
  // Both were unknown options before --sweep existed, so a command carrying one
  // was refused. Accepting and ignoring them is worse than either: a recording
  // run with --timeout 1 would have had no timeout and looked like it did.
  const dir = corpus()
  const path = task(dir, 'T1', { fence: 'exit 0' })
  for (const flag of [['--timeout', '1'], ['--json']]) {
    const run = spawnSync('python3', [verify, path, ...flag], { encoding: 'utf8' })
    assert.notEqual(run.status, 0, `${flag[0]} must not be silently ignored`)
  }
})

test('--sweep refuses to be combined with a recording mode', () => {
  const dir = corpus()
  task(dir, 'T1', { fence: 'exit 0' })
  for (const extra of [['--human', 'someone watched'], ['--restore']]) {
    const run = sweep(dir, extra)
    assert.notEqual(run.status, 0, `--sweep with ${extra[0]} must be refused`)
    assert.match(run.stdout + run.stderr, /cannot be combined/i)
  }
})
