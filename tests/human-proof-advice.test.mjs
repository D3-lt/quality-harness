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

// Corpus-chaos at 559827d (the React SPA corpus 4a/4b, the Laravel/React corpus, the PHP/Laravel corpus, the Go kernel corpus F5): the
// advice named README.md, not the task file the step is in; a corpus whose steps carry no `[S<n>]`
// id got nothing at all; and two steps read "names".
test('the human-proof advice names the task file, reads a step without an id, and agrees in number', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-human-proof-shape-'))
  try {
    const tasks = join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks')
    mkdirSync(tasks, { recursive: true })
    const record = join(repo, 'docs', 'adr', 'ADR-001-x.md')
    writeFileSync(record, '# ADR-001: X\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\nx\n')
    const body = (id, steps) => `# Task ADR-001-${id}: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n`
      + `## Ordered Steps\n\n${steps}\n\n## Acceptance\n\n${FENCE}bash\ntest -f built-${id}\n${FENCE}\n\n## Verification Log\n\n## Mutation Log\n`
    writeFileSync(join(tasks, 'T1-idless.md'), body('T1', '1. See it fail first.\n2. Look at the page. [proof: human: the page renders]'))
    writeFileSync(join(tasks, 'T2-two.md'), body('T2', '1. [S1] See it fail first. [proof: human: the page renders]\n2. [S2] Look again. [proof: human: the menu opens]'))
    writeFileSync(join(tasks, 'README.md'), '# ADR-001 Tasks\n\n| Task | File | Status |\n|------|------|--------|\n'
      + '| T1 | [T1-idless.md](T1-idless.md) | done |\n| T2 | [T2-two.md](T2-two.md) | done |\n')
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'fixture']]) assert.equal(run('git', args, repo).status, 0)
    for (const [id, file] of [['T1', 'T1-idless.md'], ['T2', 'T2-two.md']]) {
      assert.equal(run('python3', [join(bin, 'adr-verify'), join(tasks, file)], repo).status, 1)
      writeFileSync(join(repo, `built-${id}`), '')
      assert.equal(run('python3', [join(bin, 'adr-verify'), join(tasks, file)], repo).status, 0)
    }
    const lint = run('python3', [join(bin, 'adr-lint'), record, tasks], repo)
    const about = lint.stdout.split('\n').filter(line => line.includes('[proof: human'))
    assert.equal(about.length, 2, lint.stdout)
    assert.ok(about.some(line => line.startsWith('  advice: T1-idless.md: T1 is done') && /\bstep 2 names\b/.test(line)), lint.stdout)
    assert.ok(about.some(line => line.startsWith('  advice: T2-two.md: T2 is done') && /\bS1, S2 name\b/.test(line)), lint.stdout)
    const json = run('python3', [join(bin, 'adr-next'), tasks, '--json'], repo)
    const done = Object.fromEntries(JSON.parse(json.stdout).done.map(inf => [inf.id, inf.unsigned_human_proof]))
    assert.deepEqual(done, { T1: ['step 2'], T2: ['S1', 'S2'] }, json.stdout)
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})

// The /code-review of the ADR-074 batch (high, 2026-09-29): an indented numbered sub-item was read
// as a new step and a `1)` list as none; and a task whose Acceptance is human-observed, done with
// no sign-off, was told twice — the blocking error and this advice — about one missing sign-off.
test('a sub-item is not a step, a `1)` list is, and a human-observed task is told once', () => {
  const steps = spawnSync('python3', ['-c', [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(join(repoRoot, 'plugin', 'lib'))})`,
    'from record import unsigned_human_proof_steps as steps',
    "a = '## Ordered Steps\\n\\n1. [S1] do\\n   1. sub [proof: human: look]\\n\\n## Verification Log\\n'",
    "b = '## Ordered Steps\\n\\n1) first [proof: human: look]\\n\\n## Verification Log\\n'",
    'print(json.dumps([steps(a), steps(b)]))',
  ].join('\n')], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(steps.status, 0, steps.stderr)
  assert.deepEqual(JSON.parse(steps.stdout), [['S1'], ['step 1']])
  const repo = mkdtempSync(join(tmpdir(), 'qh-human-proof-once-'))
  try {
    const tasks = join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks')
    mkdirSync(tasks, { recursive: true })
    const record = join(repo, 'docs', 'adr', 'ADR-001-x.md')
    writeFileSync(record, '# ADR-001: X\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\nx\n')
    writeFileSync(join(tasks, 'T1-look.md'), '# Task ADR-001-T1: look\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n'
      + '## Ordered Steps\n\n1. [S1] See it fail, then look. [proof: human: the page renders]\n\n'
      + '## Acceptance\n\nAcceptance is human-observed: the owner opens the page.\n\n## Verification Log\n\n## Mutation Log\n')
    writeFileSync(join(tasks, 'README.md'), '# ADR-001 Tasks\n\n| Task | File | Status |\n|------|------|--------|\n| T1 | [T1-look.md](T1-look.md) | done |\n')
    run('git', ['init', '-q'], repo)
    const lint = run('python3', [join(bin, 'adr-lint'), record, tasks], repo)
    assert.match(lint.stdout, /T1 marked done but its Verification Log has no '· human-observed ·' sign-off entry/, lint.stdout)
    assert.deepEqual(lint.stdout.split('\n').filter(line => line.includes('[proof: human')), [], lint.stdout)
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
