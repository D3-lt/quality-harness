// BACKLOG §355, the Windows twin of §321: a task file named "T1-a.md." — a dot after the extension —
// was matched by no `.md` test and named nowhere, so adr-next printed an all-clear over a record with a
// task nobody read. It is now stopped and named, as "T1-a.md " is. Windows strips a trailing dot, so
// the shape cannot be built there and the test says so instead of passing (CLAUDE.md §7).
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
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const digestOf = fence => createHash('sha256').update(fence, 'utf8').digest('hex')
const task = id => `# Task ${id}: do ${id}\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n`
  + `## Acceptance\n\n\`\`\`bash\nprintf ${id}\n\`\`\`\n\n## Verification Log\n`
  + `- 2026-08-26 · no-git · exit 0 · \`printf ${id}\` · acceptance-sha256:${digestOf(`printf ${id}`)}\n`

// Git runs only in a directory this file made (CLAUDE.md §9); staging is enough for `git ls-files`.
function record(files) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-trailing-dot-'))
  temps.push(repo)
  const tasks = join(repo, 'docs', 'adr', 'ADR-007-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-007-x.md'), '# ADR-007: X\n\n**Status:** Accepted\n')
  for (const [name, text] of Object.entries(files)) writeFileSync(join(tasks, name), text)
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  return tasks
}
const json = tasks => {
  const r = spawnSync('python3', [adrNext, '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.ok(r.status === 0 || r.status === 3, `adr-next exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

test('a task file whose name ends in a dot after .md is named and stopped, never lost', t => {
  const tasks = record({ 'T1-a.md.': task('T1'), 'T2-b.md': task('T2') })
  if (!readdirSync(tasks).includes('T1-a.md.')) { t.skip('this filesystem does not keep a trailing dot'); return }
  const t1 = (json(tasks).stopped ?? []).find(x => x.id === 'T1')
  assert.equal(t1?.unreadable, true, JSON.stringify(t1))
  assert.match(t1.stopped_by, /the file name T1-a\.md ends in a dot after \.md/, t1.stopped_by)
  // The control: the same file named T1-a.md is read and done.
  renameSync(join(tasks, 'T1-a.md.'), join(tasks, 'T1-a.md'))
  assert.deepEqual((json(tasks).done ?? []).map(x => x.id).sort(), ['T1', 'T2'])
})

test('a tracked "T1-a.md." the disk does not hold is named as absent, not lost', t => {
  const tasks = record({ 'T1-a.md.': task('T1'), 'T2-b.md': task('T2') })
  if (!readdirSync(tasks).includes('T1-a.md.')) { t.skip('this filesystem does not keep a trailing dot'); return }
  rmSync(join(tasks, 'T1-a.md.'))
  const t1 = (json(tasks).stopped ?? []).find(x => x.id === 'T1')
  assert.equal(t1?.unreadable, true, JSON.stringify(t1))
  assert.match(t1.stopped_by, /git lists T1-a\.md\. here but the disk does not hold it/, t1.stopped_by)
})

// The record twin: `ADR-001-a.md.` and `ADR-002-b.md ` were counted nowhere and named nowhere by
// work-next, with look ok. Each is now named in partialBecause, and the look is PARTIAL.
test('a record file whose name ends in a dot or whitespace after .md is named, and the look is PARTIAL', t => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-trailing-dot-record-'))
  temps.push(repo)
  const adr = join(repo, 'docs', 'adr')
  mkdirSync(adr, { recursive: true })
  const text = id => `# ADR-${id}: X\n\n**Status:** Accepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n`
  writeFileSync(join(adr, 'ADR-001-a.md.'), text('001'))
  writeFileSync(join(adr, 'ADR-002-b.md '), text('002'))
  writeFileSync(join(adr, 'ADR-003-c.md'), text('003'))
  if (!readdirSync(adr).includes('ADR-001-a.md.') || !readdirSync(adr).includes('ADR-002-b.md ')) {
    t.skip('this filesystem does not keep a trailing dot or space'); return
  }
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const workNext = () => {
    const r = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), '--json'],
      { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(r.status, 0, r.stderr)
    return JSON.parse(r.stdout)
  }
  const answer = workNext()
  assert.equal(answer.look, 'PARTIAL', JSON.stringify(answer))
  const named = Object.fromEntries((answer.partialBecause ?? []).map(entry => [entry.file.replaceAll('\\', '/'), entry.reason]))
  assert.match(named['docs/adr/ADR-001-a.md.'] ?? '', /ends in a dot after \.md/, JSON.stringify(named))
  assert.match(named['docs/adr/ADR-002-b.md '] ?? '', /ends in whitespace after \.md/, JSON.stringify(named))
  // The control: renamed, both are records and nothing is partial.
  renameSync(join(adr, 'ADR-001-a.md.'), join(adr, 'ADR-001-a.md'))
  renameSync(join(adr, 'ADR-002-b.md '), join(adr, 'ADR-002-b.md'))
  assert.equal(spawnSync('git', ['add', '-A'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const whole = workNext()
  assert.equal(whole.records, 3, JSON.stringify(whole))
  assert.equal(whole.look, 'ok', JSON.stringify(whole))
})

// adr-lint's own enumeration dropped `ADR-001-a.md.` too, and a dependency on ADR-001-T1 was then a
// record that "does not exist". It is could-not-look now, said as advice. The control: the record
// named plainly resolves, and neither sentence is said.
test('a dependency on a record whose name ends in a dot is not resolved, and not called missing', t => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-trailing-dot-dep-'))
  temps.push(repo)
  const adr = join(repo, 'docs', 'adr')
  mkdirSync(join(adr, 'ADR-001-a', 'tasks'), { recursive: true })
  mkdirSync(join(adr, 'ADR-003-c', 'tasks'), { recursive: true })
  const text = id => `# ADR-${id}: X\n\n**Status:** Accepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n`
  writeFileSync(join(adr, 'ADR-001-a.md.'), text('001'))
  writeFileSync(join(adr, 'ADR-001-a', 'tasks', 'T1-a.md'), task('T1'))
  writeFileSync(join(adr, 'ADR-003-c.md'), text('003'))
  writeFileSync(join(adr, 'ADR-003-c', 'tasks', 'T1-a.md'), task('T1').replace('**Depends-on:** none', '**Depends-on:** ADR-001-T1, ADR-009-T1'))
  writeFileSync(join(adr, 'ADR-003-c', 'tasks', 'README.md'), '| Task | Status |\n|---|---|\n| [T1](T1-a.md) | pending |\n')
  if (!readdirSync(adr).includes('ADR-001-a.md.')) { t.skip('this filesystem does not keep a trailing dot'); return }
  const lint = () => {
    assert.equal(spawnSync('git', ['add', '-A'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
    const r = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', 'ADR-003-c.md')],
      { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    return `${r.stdout}${r.stderr}`
  }
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const out = lint()
  assert.match(out, /advice: T1-a\.md: Depends-on 'ADR-001-T1' was NOT resolved — the corpus could not be listed from git, or a record in it could not be read/, out)
  assert.doesNotMatch(out, /'ADR-001-T1' names no record in this corpus/, out)
  // The twin: a dependency on a record that is genuinely missing is still a FAIL in the same corpus.
  // A corpus-wide could-not-look made it advice, so one stray name demoted a real refusal elsewhere.
  assert.match(out, /^ {2}T1-a\.md: Depends-on 'ADR-009-T1' names no record in this corpus/m, out)
  // The control: named plainly, the record resolves and nothing is said about it.
  renameSync(join(adr, 'ADR-001-a.md.'), join(adr, 'ADR-001-a.md'))
  assert.doesNotMatch(lint(), /ADR-001-T1/)
})

// BACKLOG §355: work-next's PARTIAL headline said "a listed record could not be read" whatever made the
// look PARTIAL. Here every record is read; a name no reader reads made it PARTIAL, and the headline says
// what is true of every cause.
test('a PARTIAL headline says part of the corpus could not be read, not that a record was unread', t => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-partial-headline-'))
  temps.push(repo)
  const adr = join(repo, 'docs', 'adr')
  mkdirSync(adr, { recursive: true })
  writeFileSync(join(adr, 'ADR-001-a.md.'), '# ADR-001: A\n\n**Status:** Accepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n')
  if (!readdirSync(adr).includes('ADR-001-a.md.')) { t.skip('this filesystem does not keep a trailing dot'); return }
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const r = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.match(r.stdout, /^could-not-look: part of the corpus could not be read \(PARTIAL\)/m, r.stdout)
  assert.doesNotMatch(r.stdout, /a listed record could not be read/, r.stdout)
})
