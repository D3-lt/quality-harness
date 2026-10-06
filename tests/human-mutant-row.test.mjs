// From an outside run of 3.8.8 (a Python corpus, 209 tasks): a task with tool-written exit-0 evidence
// newly read as unbacked. Its log ends with a `--human-mutant` row, `· human-observed · mutant killed ·
// test exit 1 · …`, which the sign-off pattern also matches. 3.8.8's last-sign-off rule read that row's
// `--why` as a stop, and withheld done. The same row was also counted as a human-observed task's
// sign-off, so a task nobody signed off counted done. A human-mutant row is mutation evidence, never a
// sign-off, in both directions. Each test has its control (CLAUDE.md §4).
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
const HUMAN_MUTANT = '- 2026-08-26 · human-observed · mutant killed · test exit 1 · `app/guard.py` · line 12 · the request fails without the pin'

function doneIds(taskText) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-human-mutant-'))
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

test('a human-mutant row after exit-0 evidence does not take the task back', () => {
  const fenced = rows => '# Task ADR-003-T1: one\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n'
    + `- 2026-08-26 · no-git · exit 0 · \`true\` · acceptance-sha256:${digest}\n` + rows
  assert.deepEqual(doneIds(fenced(`${HUMAN_MUTANT}\n`)), ['T1'])
  // The control: a real sign-off saying stop, in the same place, still withholds done.
  assert.deepEqual(doneIds(fenced('- 2026-08-27 · human-observed · approval revoked\n')), [])
})

test("a human-mutant row is not a human-observed task's sign-off", () => {
  const watched = rows => '# Task ADR-003-T1: watch\n\n**Depends-on:** none\n\n## Acceptance\n\n'
    + 'Acceptance is human-observed: a person watches it.\n\n## Verification Log\n' + rows
  assert.deepEqual(doneIds(watched(`${HUMAN_MUTANT.replace('the request fails without the pin', 'the guard is gone')}\n`)), [])
  // The control: a real sign-off makes it done.
  assert.deepEqual(doneIds(watched('- 2026-08-27 · human-observed · observed end to end\n')), ['T1'])
})

test("adr-lint does not take a human-mutant row for a done human-observed task's sign-off", () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-human-mutant-lint-'))
  temps.push(repo)
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n\n## Context\n\nx\n')
  writeFileSync(join(tasks, 'README.md'), '# Tasks\n\n| Task | Status |\n|---|---|\n| T1 | done |\n')
  const lint = rows => {
    writeFileSync(join(tasks, 'T1-watch.md'), '# Task ADR-003-T1: watch\n\n**Depends-on:** none\n\n## Acceptance\n\n'
      + 'Acceptance is human-observed: a person watches it.\n\n## Verification Log\n' + rows)
    const r = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', 'ADR-003-x.md')], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    return `${r.stdout}${r.stderr}`
  }
  assert.match(lint(`${HUMAN_MUTANT}\n`), /marked done but its Verification Log has no '· human-observed ·' sign-off/)
  // The control: a real sign-off satisfies the check.
  assert.doesNotMatch(lint('- 2026-08-27 · human-observed · observed end to end\n'), /has no '· human-observed ·' sign-off/)
})
