// ADR-113 T4: a `--human` sign-off is bound to the Acceptance it was taken on. It wrote no digest, and adr-lint and adr-next
// looked only for the words `human-observed`, so a sign-off covered every later edit of the Acceptance it approved. Now the
// row carries the acceptance digest, a sign-off whose digest is not the current one counts for nothing, and a digest-less
// sign-off is legacy, which means already committed, as a digest-less exit row is. And `strictFrom` takes an ADR id or a
// number: any digits in it used to be read as the cutoff, so `after 2026` demoted every record below ADR-2026.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = name => join(repoRoot, 'plugin', 'bin', name)
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', ...args], { cwd, encoding: 'utf8', timeout: 30_000, windowsHide: true })
const ACCEPTANCE = 'Acceptance is human-observed: a person watches it run.'

// A corpus of one Accepted record whose one task is human-observed, in a repository this test made (CLAUDE.md §9).
function corpus(t, { config } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-signoff-'))
  t.after(() => rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  assert.equal(git(repo, 'init', '-q').status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n')
  const task = join(tasks, 'T1-watch.md')
  writeFileSync(task, `# Task ADR-003-T1: watch it\n\n**Depends-on:** none\n\n## Acceptance\n\n${ACCEPTANCE}\n\n## Verification Log\n`)
  if (config) writeFileSync(join(repo, '.quality-harness.json'), `${JSON.stringify(config)}\n`)
  return { repo, tasks, task, adr: join(repo, 'docs', 'adr', 'ADR-003-x.md') }
}
const run = (cwd, name, ...args) => spawnSync('python3', [bin(name), ...args], { cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true })
const done = ({ tasks }) => {
  const r = run(tasks, 'adr-next', '--all', '--json', tasks)
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  return (JSON.parse(r.stdout).done ?? []).some(task => task.id === 'T1')
}
const signOff = (c, note = 'observed: it runs') => {
  const r = run(c.tasks, 'adr-verify', c.task, '--human', note)
  assert.equal(r.status, 0, r.stderr)
  return readFileSync(c.task, 'utf8').split('\n').find(line => line.includes('· human-observed ·'))
}

test('a sign-off is bound to the fence it was taken on', t => {
  // The row carries the digest of the Acceptance it approved, and counts while that Acceptance stands.
  const bound = corpus(t)
  const row = signOff(bound)
  assert.match(row, / · acceptance-sha256:[0-9a-f]{64}$/, 'the sign-off names what it signed')
  assert.ok(done(bound), 'a sign-off on the current Acceptance makes the task done')
  // The Acceptance changes: the sign-off was for the old one.
  writeFileSync(bound.task, readFileSync(bound.task, 'utf8').replace(ACCEPTANCE, 'Acceptance is human-observed: a person watches it run on a phone.'))
  assert.ok(!done(bound), 'a sign-off on another Acceptance does not')
  // A row typed with this Acceptance's digest counts, and one with any other digest does not.
  const typed = corpus(t)
  const text = readFileSync(typed.task, 'utf8')
  const digest = signOff(typed).match(/acceptance-sha256:([0-9a-f]{64})/)[1]
  writeFileSync(typed.task, text + `- 2026-10-19 · human-observed · observed: it runs · acceptance-sha256:${digest}\n`)
  assert.ok(done(typed), 'the twin: a bound sign-off is done')
  writeFileSync(typed.task, text + `- 2026-10-19 · human-observed · observed: it runs · acceptance-sha256:${'f'.repeat(64)}\n`)
  assert.ok(!done(typed), 'a digest that is not this Acceptance\'s is not')
  // A stop is said in the person's words: the digest is the tool's, and is not quoted back.
  const stopped = corpus(t)
  signOff(stopped, 'NOT approved: it fails on a phone')
  const r = run(stopped.tasks, 'adr-next', '--all', '--json', stopped.tasks)
  const why = (JSON.parse(r.stdout).stopped ?? []).find(task => task.id === 'T1')?.stopped_by ?? ''
  assert.match(why, /^a human sign-off says stop/, r.stdout)
  assert.doesNotMatch(why, /acceptance-sha256/, 'the stop quotes the note, not the digest')

  // A digest-less sign-off is legacy: counted where the committed file holds it, refused by adr-lint where it is new.
  const legacy = corpus(t)
  // Committed first: a file never committed is one adr-lint could not look at, which accuses nothing (ADR-005).
  assert.equal(git(legacy.repo, 'add', '-A').status, 0)
  assert.equal(git(legacy.repo, 'commit', '-qm', 'corpus').status, 0)
  writeFileSync(join(legacy.tasks, 'README.md'), '# Tasks\n\n| ID | Title | Status | Covers | Acceptance |\n|----|-------|--------|--------|------------|\n| T1 | watch it | done | — | human-observed |\n')
  writeFileSync(legacy.task, `${readFileSync(legacy.task, 'utf8')}- 2026-10-01 · human-observed · observed: it runs\n`)
  const newRow = run(legacy.repo, 'adr-lint', legacy.adr)
  assert.match(newRow.stdout + newRow.stderr, /sign-off .*carr(?:ies|ying) no acceptance-sha256/, 'an uncommitted digest-less sign-off is refused')
  assert.equal(git(legacy.repo, 'add', '-A').status, 0)
  assert.equal(git(legacy.repo, 'commit', '-qm', 'legacy').status, 0)
  const committed = run(legacy.repo, 'adr-lint', legacy.adr)
  assert.doesNotMatch(committed.stdout + committed.stderr, /sign-off .*carr(?:ies|ying) no acceptance-sha256/, 'a committed one is legacy')
  assert.ok(done(legacy), 'and adr-next counts it')
  // A stale sign-off is named by adr-lint, as a stale exit row is.
  writeFileSync(legacy.task, readFileSync(legacy.task, 'utf8').replace('- 2026-10-01 · human-observed · observed: it runs\n',
    `- 2026-10-01 · human-observed · observed: it runs · acceptance-sha256:${'f'.repeat(64)}\n`))
  const stale = run(legacy.repo, 'adr-lint', legacy.adr)
  assert.match(stale.stdout + stale.stderr, /sign-off was taken on another Acceptance/, 'a sign-off for another Acceptance is not evidence for this one')

  // strictFrom takes an ADR id or a number; anything else is said, and every record is checked in full.
  const loose = corpus(t, { config: { strictFrom: 'after 2026' } })
  const said = run(loose.repo, 'adr-lint', loose.adr)
  assert.match(said.stdout + said.stderr, /strictFrom='after 2026' names no ADR number/)
  assert.doesNotMatch(said.stdout, /\[strictFrom\]/, 'nothing is demoted')
  const cut = corpus(t, { config: { strictFrom: 'ADR-0010' } })
  assert.match(run(cut.repo, 'adr-lint', cut.adr).stdout, /\[strictFrom\] ADR-0003 predates strictFrom ADR-0010/, 'the twin: an ADR id is a cutoff')
})
