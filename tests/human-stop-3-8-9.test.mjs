// Reported from an outside run of 3.8.8 (a Laravel/React corpus, 278 tasks): two tasks went done → stopped.
// One was a FALSE stop: an approval saying "no visible blocking" (a codec check that passed) read "blocking"
// as a verdict. The last-sign-off rule of 3.8.8 surfaced a reading that was wrong before it. The other
// stop was right, but its printed reason quoted the passing half and was cut before the clause that
// stopped it. Each test has its control (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

// adr-next's answer for a human-observed T1 whose one sign-off is `note`.
function answer(note) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-stop-389-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n')
  writeFileSync(join(tasks, 'T1-watch.md'), '# Task ADR-003-T1: watch it\n\n**Depends-on:** none\n\n## Acceptance\n\n'
    + 'Acceptance is human-observed: a person watches it run.\n\n## Verification Log\n'
    + `- 2026-10-06 · human-observed · ${note}\n`)
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const isDone = a => (a.done ?? []).some(t => t.id === 'T1')

test('"no visible blocking" in an approval is a finding, not a stop', () => {
  for (const note of ['inspected at 1440 px: not playing; encode 12.0 MB, no visible blocking on a busy mid-clip frame.',
    'approved; no blocking issues']) assert.ok(isDone(answer(note)), note)
  // The controls: a blocking verb that is the note's own verdict still stops.
  for (const note of ['observed, but blocking on legal', 'no, it failed on Safari']) assert.ok(!isDone(answer(note)), note)
})

test('a stop names the words that stopped it before the note it quotes', () => {
  const long = 'observed 2026-09-28 by Claude: the page-text loading, edited and failure state test passed in the same '
    + '25-pass Playwright run; routes.visual failures identical to main (pre-existing, not ours, unchanged by this work). '
    + 'The post-deploy demo eye check (S6) is NOT done'
  const t1 = (answer(long).stopped ?? []).find(t => t.id === 'T1')
  assert.match(t1?.stopped_by ?? '', /^a human sign-off says stop on «NOT done»/, JSON.stringify(t1))
})

// The "no + two words" neutraliser above also absorbs "no server-level block", the phrase that pinned
// the verb-only reading of "block" (campaign at e3e34ff: that mutant went GREEN). A noun with no "no"
// before it pins it again.
test('"block" as a noun with no "no" before it is not a verdict, and "blocked" still is', () => {
  assert.ok(isDone(answer('observed: the hero block renders at 375 px')), 'a noun')
  assert.ok(!isDone(answer('observed; the deploy is blocked on legal')), 'the verb')
})
