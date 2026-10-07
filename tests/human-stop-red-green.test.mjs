// A human sign-off that AFFIRMS what was observed, and then QUOTES the red run it saw before the
// green one, was read as a stop on the red run's «failed». So was "approved; no tests failed", left
// open in BACKLOG §354. Both are false stops, and the fix for each is a narrow exemption: so every
// row that is now evidence has a twin that must still stop (CLAUDE.md §16). A fail-open is worse
// than a false stop, so the twins are the half that matters. Names, runs and shas are invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const digest = createHash('sha256').update('true', 'utf8').digest('hex')

// adr-next's --json answer for a tasks directory holding the one task `taskText`.
function answer(taskText) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-red-green-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n')
  writeFileSync(join(tasks, 'T1-a.md'), taskText)
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const doneIds = taskText => (answer(taskText).done ?? []).map(t => t.id)
const watched = note => '# Task ADR-003-T1: watch\n\n**Depends-on:** none\n\n## Acceptance\n\n'
  + `Acceptance is human-observed: a person watches it.\n\n## Verification Log\n- 2026-08-27 · human-observed · ${note}\n`

const REPORT = 'observed: S3 on the linux shards — red run 111 (tests alone on main): TestAlphaRefusesFirst failed '
  + '(exit status 2) and TestBetaHoldsLock failed (lock held twice); green run 222 on head abc1234: linux-shard ok '
  + 'for pkg/alpha, normal and race, with all three linux tests unable to skip (TestGammaNeedsTool fails on a missing tool).'

test('an affirmed red-then-green run report is evidence, not a stop', () => {
  for (const note of [REPORT,
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222: ok',
    'approved: red run 111: TestAlphaRefusesFirst failed, then green run 222 passed',
  ]) assert.deepEqual(doneIds(watched(note)), ['T1'], note)
})

test('the run report in the row shape it was found in: same-day fence rows before it, relock rows after', () => {
  const fence = `- 2026-08-27 · no-git · exit 0 · \`true\` · acceptance-sha256:${digest}`
  const relock = `- 2026-08-27 · no-git · exit 0 · \`adr-verify --relock --replace-hashes\` · acceptance-sha256:${digest}`
  const task = '# Task ADR-003-T1: one\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n'
    + `${fence}\n${fence}\n- 2026-08-27 · human-observed · ${REPORT}\n${relock}\n${relock}\n`
  assert.deepEqual(doneIds(task), ['T1'])
  // The control: the same rows with the sign-off's own verdict negative still stop.
  assert.deepEqual(doneIds(task.replace('observed: S3', 'not approved: S3')), [])
})

test('a run report whose own verdict is a failure still stops', () => {
  for (const note of [
    'observed: red run 111: TestAlphaRefusesFirst failed',                                      // no green run
    'observed: it failed',
    'observed: green run 222: ok; red run 333: TestAlphaRefusesFirst failed',                   // red is the last run
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222: TestAlphaRefusesFirst failed',
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222: ok; the deploy failed',
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222: ok, but the deploy failed',
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222 (the deploy failed): ok', // aside before the pass word
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222 on head abc1234',             // green clause has no pass word
    'red run 111: TestAlphaRefusesFirst failed; green run 222: ok',                             // nothing affirmed first
    'not approved: red run 111: TestAlphaRefusesFirst failed; green run 222: ok',
    'observed: red run 111: TestAlphaRefusesFirst failed; the rollout stopped; green run 222: ok', // a clause between them
    'observed: red run 111: TestAlphaRefusesFirst failed; second run 222: ok',                 // a run nobody called green
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222: ok; then the deploy check (it fails on prod)', // a present-tense aside after the green clause
    'observed: red run 111: TestAlphaRefusesFirst failed; green run 222: ok (the deploy failed)', // an aside reporting what happened
    'observed: red run 110: TestBetaHoldsLock failed; red run 111: TestAlphaRefusesFirst failed; green run 222: ok',
  ]) assert.deepEqual(doneIds(watched(note)), [], note)
})

test('a stop after a run report names its own word, not the red run it quoted', () => {
  const t1 = (answer(watched('observed: red run 111: TestAlphaRefusesFirst failed; green run 222: ok; the rollout stopped')).stopped ?? [])
    .find(t => t.id === 'T1')
  assert.match(t1?.stopped_by ?? '', /^a human sign-off says stop on «stopped»/, JSON.stringify(t1))
})

test('a known fail-open: a present-tense aside inside the green run, after its pass word, is read as the run report', () => {
  // Text cannot tell "(TestGammaNeedsTool fails on a missing tool)", which says how a test refuses to
  // skip, from "(the deploy fails)". Pinned so that narrowing it is a decision, not an accident (§361).
  assert.deepEqual(doneIds(watched('observed: red run 111: TestAlphaRefusesFirst failed; green run 222: ok (the deploy fails)')), ['T1'])
})

test('"no tests failed" names an absent failure; anything wider still stops', () => {
  for (const note of ['approved; no tests failed', 'approved; no failed tests', 'observed; no checks failed'])
    assert.deepEqual(doneIds(watched(note)), ['T1'], note)
  for (const note of ['No it failed', 'observed. No, tests failed', 'approved; no tests ran; the build failed', 'approved; no tests failed but the deploy failed',
    'approved; two tests failed', 'approved; no deploys failed', 'approved; no tests stopped'])
    assert.deepEqual(doneIds(watched(note)), [], note)
})
