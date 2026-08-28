import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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
