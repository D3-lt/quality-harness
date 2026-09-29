// BACKLOG §321, from the corpus-chaos round of v3.1.5 (klientams A1 and playtrix A1): a task
// file renamed to "T1-a.md " — whitespace AFTER the extension — is matched by no `*.md`
// glob. Committed, adr-next read the record without it and printed an all-clear over it;
// renamed without a commit, git's listing stopped it as "a sparse or partial checkout?",
// a cause nobody observed. Each test has a control beside it (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrNext = join(repoRoot, 'plugin', 'bin', 'adr-next')
const workNext = join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const digestOf = fence => createHash('sha256').update(fence, 'utf8').digest('hex')
// A task, done the only way that counts when `evidence`: an exit-0 row whose digest
// matches its fence.
const task = (id, { dependsOn = 'none', evidence = true } = {}) => `# Task ${id}: do ${id}\n\n`
  + `**Depends-on:** ${dependsOn}\n**Consumes:** none\n**Produces:** none\n\n`
  + `## Acceptance\n\n\`\`\`bash\nprintf ${id}\n\`\`\`\n\n## Verification Log\n`
  + (evidence ? `- 2026-08-26 · no-git · exit 0 · \`printf ${id}\` · acceptance-sha256:${digestOf(`printf ${id}`)}\n` : '')

// Git runs only in a directory this file made (CLAUDE.md §9). Staging is enough: adr-next
// asks `git ls-files`, which reads the index, so no identity or commit is needed.
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
}
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const next = (tasks, ...args) => spawnSync('python3', [adrNext, ...args, tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const json = tasks => {
  const r = next(tasks, '--all', '--json')
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const stoppedOf = (answer, id) => (answer.stopped ?? []).find(t => t.id === id)
const readinessUnproven = repo => {
  const r = spawnSync(process.execPath, [workNext, '--json'], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(r.status, 0, r.stderr)
  // Both separators, so the comparison holds on Windows too (CLAUDE.md §7).
  return JSON.parse(r.stdout).readinessUnproven.map(dir => dir.replaceAll('\\', '/'))
}

// An Accepted record whose tasks are named by `files` (name -> text), staged.
function record(files) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-chaos-315-ts-'))
  temps.push(repo)
  git(repo, 'init', '-q')
  const tasks = join(repo, 'docs', 'adr', 'ADR-007-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-007-x.md'), '# ADR-007: X\n\n**Status:** Accepted\n')
  // A name this filesystem refuses (a tab, on Windows) is left out; `holds` then skips.
  for (const [name, text] of Object.entries(files)) {
    try { writeFileSync(join(tasks, name), text) } catch {}
  }
  git(repo, 'add', '-A')
  return { repo, tasks }
}
// Windows strips a trailing space or dot from a file name and refuses a tab in one, so
// there the shape cannot be built: the test says so instead of passing.
const holds = (t, dir, name) => {
  if (readdirSync(dir).includes(name)) return true
  t.skip(`this filesystem does not keep the name ${JSON.stringify(name)}`)
  return false
}

for (const [label, ws] of [['a space', ' '], ['a tab', '\t'], ['a no-break space', String.fromCharCode(0xa0)]]) {
  test(`a committed task file whose name ends in ${label} after .md is named and stopped, never lost`, t => {
    const name = `T1-a.md${ws}`
    const { repo, tasks } = record({ [name]: task('T1'), 'T2-b.md': task('T2') })
    if (!holds(t, tasks, name)) return
    const answer = json(tasks)
    const t1 = stoppedOf(answer, 'T1')
    assert.ok(t1, `T1 is in no bucket: ${JSON.stringify(answer)}`)
    assert.equal(t1.unreadable, true, JSON.stringify(t1))
    assert.ok(t1.path.endsWith(name), JSON.stringify(t1))
    assert.match(t1.stopped_by, /ends in whitespace after \.md/, JSON.stringify(t1))
    assert.ok(!(answer.ready ?? []).some(x => x.id === 'T1'), JSON.stringify(answer))
    const human = next(tasks)
    assert.doesNotMatch(human.stdout, /carry exit-0 evidence/, `no all-clear over a task nobody read: ${human.stdout}`)
    assert.match(human.stderr, /T1 was stopped/, human.stderr)
    assert.deepEqual(readinessUnproven(repo), ['docs/adr/ADR-007-x/tasks'])
    // What depends on it waits on it, rather than on a task "not in this record".
    writeFileSync(join(tasks, 'T3-c.md'), task('T3', { dependsOn: 'T1', evidence: false }))
    assert.deepEqual((json(tasks).blocked ?? []).find(x => x.id === 'T3')?.blocked_by, ['T1'])
    rmSync(join(tasks, 'T3-c.md'))

    // The control: the same file named T1-a.md is read, done, and nothing is unproven.
    renameSync(join(tasks, name), join(tasks, 'T1-a.md'))
    git(repo, 'add', '-A')
    const whole = json(tasks)
    assert.deepEqual((whole.done ?? []).map(x => x.id).sort(), ['T1', 'T2'], JSON.stringify(whole))
    assert.deepEqual(whole.stopped, [], JSON.stringify(whole))
    assert.match(next(tasks).stdout, /All 2 task\(s\) carry exit-0 evidence/)
    assert.deepEqual(readinessUnproven(repo), [])
  })
}

test('a space BEFORE the extension is still a task file, read as one', () => {
  // memory-runtime's shape, `T1 chunk size .md`: it ends in `.md`, so it is read.
  const { tasks } = record({ 'T1 chunk size .md': task('T1'), 'T2-b.md': task('T2') })
  const answer = json(tasks)
  assert.deepEqual((answer.done ?? []).map(x => x.id).sort(), ['T1', 'T2'], JSON.stringify(answer))
  assert.deepEqual(answer.stopped, [], JSON.stringify(answer))
})

test('a record whose only task ends in whitespace after .md is stopped, not "no task files"', t => {
  const { tasks } = record({ 'T1-a.md ': task('T1') })
  if (!holds(t, tasks, 'T1-a.md ')) return
  const r = next(tasks, '--all', '--json')
  assert.equal(r.status, 3, r.stderr)
  assert.match(stoppedOf(JSON.parse(r.stdout), 'T1')?.stopped_by ?? '', /ends in whitespace after \.md/, r.stdout)
  // The control: the same name without the space is read and done.
  renameSync(join(tasks, 'T1-a.md '), join(tasks, 'T1-a.md'))
  assert.deepEqual((json(tasks).done ?? []).map(x => x.id), ['T1'])
})

test('an uncommitted rename to "T1-a.md " names the whitespace, not a sparse checkout', t => {
  const { tasks } = record({ 'T1-a.md': task('T1'), 'T2-b.md': task('T2') })
  try { renameSync(join(tasks, 'T1-a.md'), join(tasks, 'T1-a.md ')) } catch {}
  if (!holds(t, tasks, 'T1-a.md ')) return
  const t1 = stoppedOf(json(tasks), 'T1')
  assert.equal(t1?.unreadable, true, JSON.stringify(t1))
  assert.match(t1.stopped_by, /ends in whitespace after \.md/, t1.stopped_by)
  assert.doesNotMatch(t1.stopped_by, /sparse|partial/, t1.stopped_by)
  // The control: a task deleted outright is still named as git-listed and absent, and
  // that reason guesses no cause either. The match first, so an empty reason cannot pass.
  rmSync(join(tasks, 'T1-a.md '))
  const gone = stoppedOf(json(tasks), 'T1')
  assert.match(gone?.stopped_by ?? '', /git lists T1-a\.md here but the disk does not hold it/, JSON.stringify(gone))
  assert.doesNotMatch(gone.stopped_by, /sparse|partial/, gone.stopped_by)
})

test('a tracked "T1-a.md " the disk does not hold is named as absent, not lost', t => {
  const { tasks } = record({ 'T1-a.md ': task('T1'), 'T2-b.md': task('T2') })
  if (!holds(t, tasks, 'T1-a.md ')) return
  rmSync(join(tasks, 'T1-a.md '))
  const answer = json(tasks)
  const t1 = stoppedOf(answer, 'T1')
  assert.equal(t1?.unreadable, true, JSON.stringify(answer))
  assert.match(t1.stopped_by, /git lists T1-a\.md  ?here but the disk does not hold it/, t1.stopped_by)
  assert.doesNotMatch(next(tasks).stdout, /carry exit-0 evidence/)
  // The control: a tracked task that is not task-shaped (no `.md`) names nothing.
  const other = record({ 'T1-a.txt': 'x\n', 'T2-b.md': task('T2') })
  rmSync(join(other.tasks, 'T1-a.txt'))
  assert.deepEqual(json(other.tasks).stopped, [])
})

test('"T1-a.md " beside T1-a.md stops T1 and names both files', t => {
  const { tasks } = record({ 'T1-a.md': task('T1'), 'T1-a.md ': task('T1'), 'T2-b.md': task('T2') })
  if (!holds(t, tasks, 'T1-a.md ')) return
  const answer = json(tasks)
  const t1 = stoppedOf(answer, 'T1')
  assert.equal(t1?.unreadable, true, JSON.stringify(answer))
  assert.match(t1.stopped_by, /ends in whitespace after \.md/, t1.stopped_by)
  assert.match(t1.stopped_by, /T1-a\.md names T1 too/, t1.stopped_by)
  assert.ok(!(answer.done ?? []).some(x => x.id === 'T1'), JSON.stringify(answer))
  // The control: without the twin, T1-a.md is T1 and done.
  rmSync(join(tasks, 'T1-a.md '))
  assert.ok((json(tasks).done ?? []).some(x => x.id === 'T1'))
})
