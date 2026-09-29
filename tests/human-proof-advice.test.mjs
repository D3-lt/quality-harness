// ADR-074 T4: a step whose proof is `[proof: human: …]` is a promise that a human looks, and a
// task could be `done` — an exit-0 run and a killed mutant — with nobody having signed off, while
// no reader mentioned it (BACKLOG §319's addendum). adr-lint advises and adr-next notes it on the
// done task, naming the step. It is advice, never a refusal: `done` keeps its rule (the owner,
// 2026-09-29; CLAUDE.md §3). The evidence here is written by adr-verify itself, as a task's is.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid', GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, ...IDENTITY } })
const FENCE = '```'
// Step 1 opens by establishing red, as adr-lint asks of every task, so its only advice about
// these steps is the one under test and not the TDD-red advice that quotes the step's text.
// The fence fails until the task is "built", so each task gets a red run and then a green one:
// `done` needs a first-red lock (from 2026-09-13), and an exit-0 row alone is not done.
const task = (id, step) => `# Task ADR-001-${id}: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n`
  + `## Ordered Steps\n\n1. [S1] See it fail first, then: ${step}\n\n## Acceptance\n\n${FENCE}bash\ntest -f built-${id}\n${FENCE}\n\n## Verification Log\n\n## Mutation Log\n`

test('a human-proof step with no sign-off is advised on, and done is unchanged', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-human-proof-'))
  try {
    const tasks = join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks')
    mkdirSync(tasks, { recursive: true })
    const record = join(repo, 'docs', 'adr', 'ADR-001-x.md')
    writeFileSync(record, '# ADR-001: X\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\nx\n')
    // T1 promises a human look and has no sign-off; T2 promises one and has it; T3 promises none.
    writeFileSync(join(tasks, 'T1-unsigned.md'), task('T1', 'Look at the page. [proof: human: the page renders]'))
    writeFileSync(join(tasks, 'T2-signed.md'), task('T2', 'Look at the page. [proof: human: the page renders]'))
    writeFileSync(join(tasks, 'T3-none.md'), task('T3', 'Run it. [proof: acceptance]'))
    writeFileSync(join(tasks, 'README.md'), '# ADR-001 Tasks\n\n| Task | File | Status |\n|------|------|--------|\n'
      + '| T1 | [T1-unsigned.md](T1-unsigned.md) | done |\n| T2 | [T2-signed.md](T2-signed.md) | done |\n| T3 | [T3-none.md](T3-none.md) | done |\n')
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'fixture']]) assert.equal(run('git', args, repo).status, 0)
    for (const [id, file] of [['T1', 'T1-unsigned.md'], ['T2', 'T2-signed.md'], ['T3', 'T3-none.md']]) {
      const red = run('python3', [join(bin, 'adr-verify'), join(tasks, file)], repo)
      assert.equal(red.status, 1, `${file}: ${red.stdout}\n${red.stderr}`)
      writeFileSync(join(repo, `built-${id}`), '')
      const verified = run('python3', [join(bin, 'adr-verify'), join(tasks, file)], repo)
      assert.equal(verified.status, 0, `${file}: ${verified.stdout}\n${verified.stderr}`)
    }
    const signed = run('python3', [join(bin, 'adr-verify'), join(tasks, 'T2-signed.md'), '--human', 'Zy observed the page render'], repo)
    assert.equal(signed.status, 0, `${signed.stdout}\n${signed.stderr}`)

    // adr-lint: one advice line, about T1's S1, and nothing about human proof that is not advice.
    const lint = run('python3', [join(bin, 'adr-lint'), record, tasks], repo)
    assert.ok(lint.status === 0 || lint.status === 1, `adr-lint could not run: ${lint.stdout}\n${lint.stderr}`)
    const about = lint.stdout.split('\n').filter(line => line.includes('[proof: human'))
    assert.equal(about.length, 1, lint.stdout)
    assert.match(about[0], /^ {2}advice: .*\bT1\b.*\bS1\b/, lint.stdout)
    assert.doesNotMatch(about[0], /\bT2\b|\bT3\b/)

    // adr-next: all three are done, as before; only T1 carries the note.
    const json = run('python3', [join(bin, 'adr-next'), tasks, '--json'], repo)
    assert.ok(json.status === 0 || json.status === 3, `adr-next could not run: ${json.stdout}\n${json.stderr}`)
    const done = Object.fromEntries(JSON.parse(json.stdout).done.map(inf => [inf.id, inf.unsigned_human_proof]))
    assert.deepEqual(done, { T1: ['S1'], T2: [], T3: [] }, json.stdout)
    const text = run('python3', [join(bin, 'adr-next'), tasks, '--all'], repo)
    const line = id => text.stdout.split('\n').find(each => each.startsWith(`done     ${id} `)) ?? ''
    assert.match(line('T1'), /S1 names \[proof: human: …\] and no human-observed sign-off is recorded/, text.stdout)
    for (const id of ['T2', 'T3']) assert.doesNotMatch(line(id), /proof: human/, text.stdout)
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
