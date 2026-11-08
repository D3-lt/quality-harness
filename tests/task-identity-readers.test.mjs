// BACKLOG §462: §458 gave adr-lint one rule for a task's id, and its class sweep found three more readers taking the id from the
// file name alone: work-next's README `done` claim (work-next.mjs), adr-lint's cross-record dependency graph and adr-next's
// lookup of another record's task. A titled task file whose name carries no id (`notes.md`, titled `# Task ADR-001-T1: …`) was
// therefore no task to any of them. Each now reads the id its own record's reader keys the file by, and sorts names by code point.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'duplicate-ids', 'docs', 'adr')
const task = (title, dependsOn = 'none') =>
  `${title}\n\n**Depends-on:** ${dependsOn}\n\n## Goal\n\nx\n\n## Acceptance\n\n\`\`\`bash\ntest -f go.mod\n\`\`\`\n`

// A committed scratch repository holding the fixture's two records, with the task files given by record, then the result of `fn`.
function corpus(t, files) {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'qh-task-readers-'))
  t.after(() => remove(repo))
  const adr = path.join(repo, 'docs', 'adr')
  for (const record of ['ADR-001-totals', 'ADR-002-copy']) {
    mkdirSync(path.join(adr, record, 'tasks'), { recursive: true })
    copyFileSync(path.join(fixture, `${record}.md`), path.join(adr, `${record}.md`))
  }
  writeFileSync(path.join(repo, 'go.mod'), 'module example.com/totals\n')
  for (const [relative, text] of Object.entries(files)) writeFileSync(path.join(adr, relative), text)
  const git = args => {
    const ran = spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(ran.status, 0, ran.stderr)
  }
  git(['init', '-q'])
  git(['add', '-A'])
  git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'fixture'])
  return repo
}

test('work-next names a README done claim on a task whose title, not its name, gives the id', t => {
  const run = name => {
    const repo = corpus(t, {
      [`ADR-001-totals/tasks/${name}`]: task('# Task ADR-001-T1: add items'),
      'ADR-001-totals/tasks/README.md': '# Tasks\n\n| ID | Title | Status |\n|----|-------|--------|\n| T1 | add items | done |\n',
    })
    const ran = spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), '--json'], { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    return { said: ran.stdout + ran.stderr, unbacked: JSON.parse(ran.stdout).unbackedDoneClaims }
  }
  const named = run('notes.md')
  assert.deepEqual(named.unbacked, ['docs/adr/ADR-001-totals/tasks/notes.md'], named.said)
  // The control: the same task under a name carrying the id was named before the fix as well.
  const control = run('T1-add.md')
  assert.deepEqual(control.unbacked, ['docs/adr/ADR-001-totals/tasks/T1-add.md'], control.said)
})

test("adr-next finds another record's task by its title, and cannot evaluate an id two files declare", t => {
  const run = extra => {
    const repo = corpus(t, {
      'ADR-001-totals/tasks/notes.md': task('# Task ADR-001-T1: add items'),
      ...extra,
      'ADR-002-copy/tasks/T1-use.md': task('# Task ADR-002-T1: use the totals', 'ADR-001-T1'),
    })
    const ran = spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-next'), path.join(repo, 'docs', 'adr', 'ADR-002-copy', 'tasks'), '--json'],
      { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    const said = ran.stdout + ran.stderr
    return { said, blockedBy: JSON.parse(ran.stdout).blocked.find(entry => entry.id === 'T1')?.blocked_by }
  }
  const found = run({})
  assert.deepEqual(found.blockedBy, ['ADR-001-T1'], `the foreign task is found and pending:\n${found.said}`)
  const twice = run({ 'ADR-001-totals/tasks/other.md': task('# Task ADR-001-T1: add items again') })
  assert.deepEqual(twice.blockedBy, ['ADR-001-T1 (cannot evaluate)'], `two files declare T1, so neither is read as it:\n${twice.said}`)
  // The Codex review of 1f788548..b7c58181: an approved task whose title names another record (a copy) is stopped where its
  // own record reads it, so it meets no dependency either. The control: the same approval under its own record's title does.
  const watched = title => `# ${title}\n\n**Depends-on:** none\n\n## Acceptance\n\nAcceptance is human-observed: a person watches it.\n\n## Verification Log\n- 2026-10-01 · human-observed · approved\n`
  const copied = run({ 'ADR-001-totals/tasks/notes.md': watched('Task ADR-999-T1: add items') })
  assert.deepEqual(copied.blockedBy, ['ADR-001-T1'], `a task titled for another record is not done here:\n${copied.said}`)
  const own = run({ 'ADR-001-totals/tasks/notes.md': watched('Task ADR-001-T1: add items') })
  assert.equal(own.blockedBy, undefined, `the same approval under its own title meets the dependency:\n${own.said}`)
})

test('adr-lint sees a cross-record cycle through a task whose title, not its name, gives the id', t => {
  const repo = corpus(t, {
    'ADR-001-totals/tasks/notes.md': task('# Task ADR-001-T1: add items', 'ADR-002-T1'),
    'ADR-002-copy/tasks/T1-use.md': task('# Task ADR-002-T1: use the totals', 'ADR-001-T1'),
  })
  const ran = spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-lint'), path.join(repo, 'docs', 'adr', 'ADR-002-copy.md')],
    { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  const said = ran.stdout + ran.stderr
  assert.match(said, /cross-record dependency cycle: ADR-\d{3}-T1 → ADR-\d{3}-T1 → ADR-\d{3}-T1/, said)
  // The dependency resolves to that task, which the resolver also found by name alone.
  assert.doesNotMatch(said, /Depends-on 'ADR-001-T1' names no record in this corpus/, said)
})

test("adr-lint's index and a sibling's Depends-on know a task whose title, not its name, gives the id", t => {
  const lint = dependsOn => {
    const repo = corpus(t, {
      'ADR-001-totals/tasks/notes.md': task('# Task ADR-001-T1: add items'),
      'ADR-001-totals/tasks/T2-next.md': task('# Task ADR-001-T2: then this', dependsOn),
      'ADR-001-totals/tasks/README.md': '# Tasks\n\n| ID | Title | Status |\n|----|-------|--------|\n| T1 | add items | pending |\n| T2 | then this | pending |\n',
    })
    const ran = spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-lint'), path.join(repo, 'docs', 'adr', 'ADR-001-totals.md')],
      { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    return ran.stdout + ran.stderr
  }
  const said = lint('T1')
  assert.doesNotMatch(said, /Depends-on 'T1' matches no sibling task file/, said)
  assert.doesNotMatch(said, /README[^\n]*\bT1\b/, said)
  // The control: the same check still refuses a Depends-on naming no task.
  assert.match(lint('T7'), /Depends-on 'T7' matches no sibling task file/)
})

// The Codex review of 1f788548..b7c58181: a title-only task depending on itself was found as a sibling and lost the refusal.
test('adr-lint refuses a self-dependency of a task whose title, not its name, gives the id', t => {
  const repo = corpus(t, { 'ADR-001-totals/tasks/notes.md': task('# Task ADR-001-T1: add items', 'T1') })
  const ran = spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-lint'), path.join(repo, 'docs', 'adr', 'ADR-001-totals.md')],
    { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  assert.match(ran.stdout + ran.stderr, /notes\.md: Depends-on 'T1' names this task itself/, ran.stdout + ran.stderr)
})

// The Codex review of 1f788548..b7c58181: the qualified-dependency resolver opened another record's task to read its title,
// and a FIFO in its place blocked the lint. It is never opened, and the dependency is could-not-look.
test("adr-lint does not open another record's task that is not a regular file", { skip: process.platform === 'win32' && 'no FIFO on Windows' }, t => {
  const repo = corpus(t, {
    'ADR-001-totals/tasks/notes.md': task('# Task ADR-001-T1: add items'),
    'ADR-002-copy/tasks/T1-use.md': task('# Task ADR-002-T1: use the totals', 'ADR-001-T1'),
  })
  const notes = path.join(repo, 'docs', 'adr', 'ADR-001-totals', 'tasks', 'notes.md')
  remove(notes)
  assert.equal(spawnSync('mkfifo', [notes], { timeout: 30_000 }).status, 0)
  const ran = spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-lint'), path.join(repo, 'docs', 'adr', 'ADR-002-copy.md')],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const said = ran.stdout + ran.stderr
  assert.notEqual(ran.status, null, `adr-lint did not finish within 60 s (signal ${ran.signal})`)
  assert.match(said, /Depends-on 'ADR-001-T1' was NOT resolved/, said)
})
