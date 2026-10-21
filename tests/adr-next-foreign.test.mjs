// ADR-120 T7: adr-next reads another corpus's records, and a sign-off by its last verdict word.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const bin = join(root, 'bin')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }

const temps = []
test.after(() => {
  for (const dir of temps) remove(dir)
})

function next(args, cwd) {
  const [file, argv] = process.platform === 'win32'
    ? ['python3', [join(bin, 'adr-next'), ...args]]
    : ['adr-next', args]
  return spawnSync(file, argv, { cwd, env, encoding: 'utf8', timeout: 60_000 })
}

const digestOf = fence => createHash('sha256').update(fence, 'utf8').digest('hex')

// One task file; `done` writes the tool-written exit-0 row that proves its fence.
function taskFile(id, { dependsOn = 'none', done = false } = {}) {
  const fence = `printf ${id}`
  const log = done
    ? `- 2026-08-26 · no-git · exit 0 · \`${fence}\` · acceptance-sha256:${digestOf(fence)}\n`
    : ''
  return `# Task ${id}: probe\n\n**Depends-on:** ${dependsOn}\n**Consumes:** none\n**Produces:** none\n\n`
    + `## Acceptance\n\n\`\`\`bash\n${fence}\n\`\`\`\n\n## Verification Log\n${log}`
}

function record(dir, name, tasks) {
  writeFileSync(join(dir, `${name}.md`), `# ${name}: probe\n\n**Status:** Accepted\n`)
  const tasksDir = join(dir, name, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  for (const [id, spec] of Object.entries(tasks)) writeFileSync(join(tasksDir, `${id}-t.md`), taskFile(id, spec))
  return tasksDir
}

function foreign(targetName, targetT4Done, pointer) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-foreign-'))
  temps.push(dir)
  record(dir, targetName, { T4: { done: targetT4Done } })
  return record(dir, '033-z', { T5: { dependsOn: pointer } })
}

const ready = out => /READY\s+T5/.test(out)

test('a foreign record named NNN-slug is found, and a dated file is no record', () => {
  const finished = next([foreign('032-x', true, 'ADR-032-T4'), '--all'], root).stdout
  assert.ok(ready(finished), `a done T4 in 032-x frees T5:\n${finished}`)
  const open = next([foreign('032-x', false, 'ADR-032-T4'), '--all'], root).stdout
  assert.ok(!ready(open), `a not-done T4 blocks T5:\n${open}`)
  assert.match(open, /ADR-032-T4/)
  // The twin: a dated file with a done T4 is no ADR-2026.
  const dated = next([foreign('2026-07-12-x', true, 'ADR-2026-T4'), '--all'], root).stdout
  assert.ok(!ready(dated), `a dated file lent its year as a record number:\n${dated}`)
  // And the long form keeps working.
  const long = next([foreign('ADR-032-x', true, 'ADR-032-T4'), '--all'], root).stdout
  assert.ok(ready(long), `ADR-NNN-slug is still found:\n${long}`)
})

function verdict(note) {
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-harness-verdict-'))
  temps.push(dir)
  const tasksDir = join(dir, 'tasks')
  mkdirSync(tasksDir)
  writeFileSync(join(tasksDir, 'T1-t.md'),
    '# Task T1: probe\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n'
    + `## Acceptance\n\nAcceptance is human-observed: a person confirms it.\n\n## Verification Log\n- 2026-08-26 · human-observed · ${note}\n`)
  const out = next([tasksDir, '--all'], root).stdout
  return /^done\s+T1/m.test(out) ? 'pass' : 'stop'
}

test("a sign-off's last verdict word decides", () => {
  for (const note of [
    "observed: an empty selection made 'no tests to run' trip the FAIL guard; approved",
    'observed: reranker stopped: fused order in 0.4 s; approved',
    'observed: the run printed [build failed]; approved',
  ]) assert.equal(verdict(note), 'pass', note)
  for (const note of [
    'approved, but the run failed',
    'passed, but stop',
    'confirmed BLOCKED',
  ]) assert.equal(verdict(note), 'stop', note)
})

test('a negator, a question, a taken-back verdict and a cross still stop wherever they sit', () => {
  for (const note of [
    'not approved: it failed',
    'approved? it failed',
    'not approved, later observed and approved',
    'approved? no, then observed and approved',
    'approved, reverted, observed',
    '❌ observed',
    'observed approved ❌',
  ]) assert.equal(verdict(note), 'stop', note)
})

test('a verdict word inside quotes is not the closing verdict', () => {
  assert.equal(verdict('the run failed "he wrote; approved" later'), 'stop')
  assert.equal(verdict('the run failed; approved'), 'pass')
})

// ADR-120 T7, the Codex review of ee802e5d..8d021b2a (2026-10-21): an affirmative overrides an earlier negative only as the
// note's CLOSING verdict, the opening of its final clause, and a short one.
test("an affirmative that is not the note's closing verdict does not override a failure", () => {
  for (const note of [
    'observed: step 2 failed; pass rate 0/10, unresolved',
    'the run failed; approved by the owner after a long careful read',
    'the run failed; approved, then it failed again',
    'observed: red run 111: TestAlpha failed, deployment remains blocked; green run 222: ok',
    'observed: red run 111: TestAlpha failed; second run 222: ok',
  ]) assert.equal(verdict(note), 'stop', note)
  for (const note of [
    'observed: an empty selection made the run trip the FAIL guard, which now exits 1; approved',
    'observed: reranker stopped: fused order in 0.4 s; approved',
    'the run failed; approved',
    'the run failed; approved by the owner',
    'the run failed; signed off',
    'the run failed; approved.',
  ]) assert.equal(verdict(note), 'pass', note)
})

// ADR-120 T7, the Codex review of 692a869c: the closing clause is a verdict, not a measurement. An affirmative followed in its
// clause by a noun it counts (rate, count, ratio, percent, total, "of N") reports a tally.
test('a measurement after an affirmative is no closing verdict', () => {
  for (const note of [
    'the run failed; pass rate zero',
    'the run failed; pass count 0',
    'the run failed; passed 3 of 10',
    'the run failed; pass ratio low',
    'the run failed; passes of 10',
    'the run failed; ok percent 40',
  ]) assert.equal(verdict(note), 'stop', note)
  // DIRTY twins: the same words as a verdict. "passed" and "ok" are no closing approval after a failure (the owner, 2026-10-21).
  for (const note of [
    'the run failed; verified by hand',
  ]) assert.equal(verdict(note), 'pass', note)
  for (const note of [
    'the run failed; passed',
    'the run failed; passed after a rerun',
    'the run failed; ok',
  ]) assert.equal(verdict(note), 'stop', note)
})

// The clause break is its own mechanism: "pass rate 0/10, unresolved" is also a measurement, so a row without one pins it.
test('an affirmative that opens a clause before the last is not the closing verdict', () => {
  assert.equal(verdict('the run failed; approved, see notes'), 'stop')
  assert.equal(verdict('the run failed; approved'), 'pass')
})

// A peer corpus, 2026-10-21: an owner's sign-off that described what it observed and closed on "Verdict approved" was read as
// a stop three times, on "refused", "rejected" and "failed" inside the data it described. The label opens the closing clause.
test('a closing verdict may carry the label "verdict"', () => {
  for (const note of [
    'zy signed off the counts: the table shows 1 refused connection. Verdict approved',
    'zy signed off the reasons: input-rejected is counted once per call. Verdict approved',
    'zy signed off the log: the rerank_failed field is set on each failure. Verdict approved',
    'the run failed. Verdict: approved',
  ]) assert.equal(verdict(note), 'pass', note)
  for (const note of [
    'approved. Verdict failed',
    'the run failed; verdict rejected',
    'the run failed; verdict',
    'the run failed; the verdict approved, see notes',
    'the run failed; verdict approved by the owner later on',
  ]) assert.equal(verdict(note), 'stop', note)
})

// After a failure only a closing approval passes (the owner, 2026-10-21): an approval word, optionally "by <who>" and a date.
// Each row below was read wrongly by one of the five patched readers before it (the verifications of d4f51888..0723a888).
test('a count after the closing affirmative is a tally, not a verdict', () => {
  for (const note of [
    'the run failed; verdict passed 0 tests',
    'the run failed; passed 0 tests',
    'the run failed; passed 3/10',
    'the run failed; ok 40%',
    'the run failed; passed 3/10.',
    'the run failed; ok 0.0%',
    'the run failed; passed 0 jobs',
    'the run failed; passed 12',
    'the run failed; passed only 0 tests',
    'the run failed; passed 0tests',
    'the run failed; ok 0ms',
    'the run failed; approved 2FA rollout',
    'the run failed; approved only rate limiting',
    'the run failed; approved by the owner after a rerun',
    'observed: red run 111: TestAlpha failed; second run 222: approved',
    'observed: red run 111: TestAlpha failed, deployment remains blocked; green run 222: verified',
    'observed: red run 111: TestAlpha failed; rerun 222: approved',
    'observed: red run 111: TestAlpha failed; second run 222 (unit tests; Safari): approved',
    'observed: red run 111: TestAlpha failed; second run 222 (then retried): approved',
    'the run failed, approved',
    'red run 111 failed; run 222: verdict: approved',
    'the run failed; approved failed-total: 3',
  ]) assert.equal(verdict(note), 'stop', note)
  for (const note of [
    'the run failed; approved 2026-10-21',
    'the run failed; approved 21 October 2026',
    'the run failed; approved 21/10/2026',
    'the run failed; approved 21.10.2026',
    'the run failed; approved 21st Oct.',
    'the run failed; signed off by zy on 2026-10-21',
    'the run failed; approved by the owner',
    'the run failed; confirmed',
    'observed: red run 111: TestAlpha failed; second run 222: approved; approved',
    'observed: red run 111: TestAlpha failed; rerun 222: ok; approved',
    'observed: red run 111: TestAlpha failed; second run 222 (unit tests; Safari): ok; approved',
    'the run failed. Verdict: approved',
    'red run 111 failed; run 222: ok; verdict: approved',
    'the run failed; failed-total: 3; approved',
  ]) assert.equal(verdict(note), 'pass', note)
})
