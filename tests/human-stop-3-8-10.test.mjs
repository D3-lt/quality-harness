// From an outside run of 3.8.9 (python-adr-corpus, 209 tasks): 076/T11, whose tool-written exit-0 rows
// prove it, still read as unbacked. Its last human sign-off pasted a pytest summary, "2374 passed /
// 1 failed", and «failed» read as a verdict. And that row was dated a day BEFORE the exit-0 rows, so it
// could not have taken back evidence recorded after it. Both are fixed; each test has its control.
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
const EXIT0 = `- 2026-08-26 · no-git · exit 0 · \`true\` · acceptance-sha256:${digest}`

function doneIds(taskText) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-stop-3810-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n')
  writeFileSync(join(tasks, 'T1-a.md'), taskText)
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  return (JSON.parse(r.stdout).done ?? []).map(t => t.id)
}
const watched = note => '# Task ADR-003-T1: watch\n\n**Depends-on:** none\n\n## Acceptance\n\n'
  + `Acceptance is human-observed: a person watches it.\n\n## Verification Log\n- 2026-08-27 · human-observed · ${note}\n`
const fenced = rows => '# Task ADR-003-T1: one\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n' + rows

test('a number never turns a failure word into a count', () => {
  // A count rule was tried and twice reviewed wider than its case: text cannot tell "2374 passed /
  // 1 failed" from "Safari 17 passed; 18 failed the manual check" (Codex reviews of 73f930f and
  // ee82e08). Every one of these stops; T11's summary is cleared by the older-stop rule below instead.
  for (const note of ['make lint exit 0 · pytest exit 1, 2374 passed / 1 failed — the same unrelated test',
    'observed; Safari 17 passed; 18 failed the manual check', 'observed; Safari 18 failed, 17 passed',
    'observed; step 1 passed; 2 cannot proceed', 'observed; step 2 failed on Safari']) assert.deepEqual(doneIds(watched(note)), [], note)
  // The control: an approval is still done.
  assert.deepEqual(doneIds(watched('observed end to end')), ['T1'])
})

test('a human stop older than later exit-0 evidence does not take that evidence back', () => {
  assert.deepEqual(doneIds(fenced(`- 2026-08-25 · human-observed · not approved, it froze\n${EXIT0}\n`)), ['T1'])
  // The control: the same stop recorded AFTER the evidence still takes it back.
  assert.deepEqual(doneIds(fenced(`${EXIT0}\n- 2026-08-27 · human-observed · not approved, it froze\n`)), [])
})

// The Codex review of ee82e08: an exit-0 row dated BEFORE a stop cleared it by sitting below it.
test('an exit-0 row dated before a stop does not clear it, wherever it sits', () => {
  assert.deepEqual(doneIds(fenced(`- 2026-08-27 · human-observed · not approved, it froze\n${EXIT0}\n`)), [])
  // The control: the same row dated after the stop does clear it.
  assert.deepEqual(doneIds(fenced(`- 2026-08-27 · human-observed · not approved, it froze\n${EXIT0.replace('2026-08-26', '2026-08-28')}\n`)), ['T1'])
})

test('"no" names one absent thing and never spans into another clause', () => {
  for (const note of ['observed no progress and stopped the rollout', 'No we must stop', 'observed no change yet blocking the release']) assert.deepEqual(doneIds(watched(note)), [], note)
  for (const note of ['observed; no visible blocking', 'approved; no blocking issues']) assert.deepEqual(doneIds(watched(note)), ['T1'], note)
})

test('only later evidence for the CURRENT Acceptance outranks an older stop', () => {
  const other = createHash('sha256').update('echo old', 'utf8').digest('hex')
  const rows = `${EXIT0}\n- 2026-08-27 · human-observed · not approved, it froze\n- 2026-08-28 · no-git · exit 0 · \`echo old\` · acceptance-sha256:${other}\n`
  assert.deepEqual(doneIds(fenced(rows)), [])
  // And a human-only Acceptance has no evidence to outrank its own stop.
  assert.deepEqual(doneIds(watched('not approved, it froze') + `${EXIT0}\n`), [])
})
