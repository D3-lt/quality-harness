// The corpus readers stop at a record budget so a hook stays fast. A Windows chaos
// round of 916b515 (C-1) found the stop was silent: 10,000 records, 200 read, and
// `look ok` with nothing counted or named past the budget. Driven through adr-state,
// the reader the round measured, in a repository this test created (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { adrCorpus } from '../plugin/scripts/lifecycle.mjs'

const adrState = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'scripts', 'adr-state.mjs')

function corpusOf(count) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-record-budget-'))
  mkdirSync(join(dir, 'docs', 'adr'), { recursive: true })
  for (let i = 1; i <= count; i++) {
    const id = String(i).padStart(4, '0')
    writeFileSync(join(dir, 'docs', 'adr', `ADR-${id}-x.md`), `# ADR-${id}: x\n\n**Status:** Accepted\n\n## Context\n\nc\n`)
  }
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 })
  assert.equal(git.status, 0, git.stderr)
  return dir
}

const stateOf = dir => {
  const run = spawnSync(process.execPath, [adrState, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120_000 })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('a corpus past the record budget is PARTIAL, and the first file not examined is named', () => {
  const past = corpusOf(201)
  const exact = corpusOf(200)
  try {
    const state = stateOf(past)
    assert.equal(state.read, 200)
    assert.equal(state.look, 'PARTIAL')
    assert.equal(state.unread.length, 1)
    assert.match(state.unread[0].file, /ADR-0201-x\.md$/)
    assert.match(state.unread[0].reason, /^record budget: 200 records were read/)
    // Clean twin: exactly the budget is read whole, and says so.
    const whole = stateOf(exact)
    assert.equal(whole.read, 200)
    assert.equal(whole.look, 'ok')
    assert.deepEqual(whole.unread, [])
  } finally {
    rmSync(past, { recursive: true, force: true })
    rmSync(exact, { recursive: true, force: true })
  }
})

// A Windows chaos round of 916b515 (scalable-badger C-5): a task file that could not be
// opened was dropped from its record, so its directory was never asked about and the
// record read as "governing nothing". A directory named like a task stands in for the
// lock: it is unreadable on every platform.
test('a task file nobody could read leaves its record\'s scope unknown, not empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-unread-task-'))
  try {
    const tasks = join(dir, 'docs', 'adr', 'ADR-002-a', 'tasks')
    mkdirSync(join(tasks, 'T1-locked.md'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'adr', 'ADR-002-a.md'), '# ADR-002: a\n\n**Status:** Accepted\n\n## Context\n\nc\n')
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
    const state = stateOf(dir)
    assert.deepEqual(state.governingNothing, [], 'a scope nobody could read is not an empty one')
    assert.deepEqual(state.governsUnproven.map(entry => entry.id), ['ADR-002'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// The same lead, as a lock is: a TRACKED file that cannot be opened. Readers that list
// tasks through git never see an empty directory, so the stand-in above cannot reach
// them. chmod cannot deny a read on Windows or to root, so those skip, saying so.
const cannotDenyRead = process.platform === 'win32' ? 'chmod does not deny a read on Windows'
  : process.getuid?.() === 0 ? 'root reads a file whatever its mode' : false
test('a tracked task file nobody could read makes its directory UNPROVEN in work-next', { skip: cannotDenyRead }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-locked-task-'))
  const locked = join(dir, 'docs', 'adr', 'ADR-002-a', 'tasks', 'T1-locked.md')
  try {
    mkdirSync(dirname(locked), { recursive: true })
    writeFileSync(locked, '# Task ADR-002-T1: a\n\n## Acceptance\n\n```bash\ntrue\n```\n')
    writeFileSync(join(dir, 'docs', 'adr', 'ADR-002-a.md'), '# ADR-002: a\n\n**Status:** Accepted\n\n## Context\n\nc\n')
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
    chmodSync(locked, 0o000)
    const workNext = spawnSync(process.execPath, [join(dirname(adrState), 'work-next.mjs'), '--json'], { cwd: dir, encoding: 'utf8', timeout: 120_000 })
    assert.deepEqual(JSON.parse(workNext.stdout).readinessUnproven, ['docs/adr/ADR-002-a/tasks'], workNext.stdout)
    assert.deepEqual(stateOf(dir).governsUnproven.map(entry => entry.id), ['ADR-002'])
    // The attribution itself, not only what readiness does with it: readiness also
    // asks about unread files, so it could not see this line go (a GREEN mutant, CI at
    // 2b036de).
    const record = adrCorpus(dir).find(entry => entry.id === 'ADR-002')
    assert.deepEqual(record.taskFiles.map(file => basename(file)), ['T1-locked.md'])
  } finally {
    try { chmodSync(locked, 0o644) } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true })
  }
})

// A Windows chaos round of 916b515 (tender-reef C1, scalable-badger C6): two records
// named ADR-002. Ownership by number alone gave the second the first's tasks, so it was
// linted against them, and nothing said the id was taken twice.
test('two records with one id are named, and neither takes the other\'s tasks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-dup-id-'))
  try {
    const record = title => `# ADR-002: ${title}\n\n**Status:** Accepted\n\n## Context\n\nc\n`
    mkdirSync(join(dir, 'docs', 'adr', 'ADR-002-a', 'tasks'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'adr', 'ADR-002-a.md'), record('integer cents'))
    writeFileSync(join(dir, 'docs', 'adr', 'ADR-002-b.md'), record('floats'))
    writeFileSync(join(dir, 'docs', 'adr', 'ADR-002-a', 'tasks', 'T1-a.md'),
      '# Task ADR-002-T1: a\n\n## Affected Files\n\n| File | Change |\n|---|---|\n| `src/price.ts` | add |\n')
    writeFileSync(join(dir, 'src.txt'), '')
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
    const state = stateOf(dir)
    const posix = file => file.replaceAll('\\', '/')
    assert.deepEqual(state.duplicateIds.map(entry => ({ id: entry.id, files: entry.files.map(posix) })),
      [{ id: 'ADR-002', files: ['docs/adr/ADR-002-a.md', 'docs/adr/ADR-002-b.md'] }])
    assert.deepEqual(state.governingNothing.map(entry => posix(entry.file)), ['docs/adr/ADR-002-b.md'], 'b owns no tasks')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// A Windows chaos round of 916b515 (scalable-badger C-2): `ADR-7-x.md` was not a record
// to the corpus readers, which wanted three digits, while adr-lint read it as one, and it
// was named nowhere. work-next's own text says `ADR-12-thing.md` is found by filename.
test('a record named with the ADR prefix is found at any width, and a bare short number is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-short-id-'))
  try {
    mkdirSync(join(dir, 'docs', 'adr'), { recursive: true })
    for (const name of ['ADR-7-a.md', 'ADR-12-b.md', 'adr_3-c.md', '1-intro.md']) {
      writeFileSync(join(dir, 'docs', 'adr', name), `# ${name}\n\n**Status:** Accepted\n`)
    }
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
    const state = stateOf(dir)
    assert.equal(state.read, 3, JSON.stringify(state))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// Codex review of 3.1.0..e0ef6d4, F6: an unread file in a SHARED tasks/ beside one record
// was attributed to nobody, so work-next never asked about the directory.
test('an unread task in a shared tasks directory leaves that directory UNPROVEN', { skip: cannotDenyRead }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-shared-unread-'))
  const locked = join(dir, 'docs', 'adr', 'tasks', 'T1-locked.md')
  try {
    mkdirSync(dirname(locked), { recursive: true })
    writeFileSync(locked, '# Task ADR-002-T1: a\n\n## Acceptance\n\n```bash\ntrue\n```\n')
    writeFileSync(join(dir, 'docs', 'adr', 'ADR-002-a.md'), '# ADR-002: a\n\n**Status:** Accepted\n\n## Context\n\nc\n')
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
    chmodSync(locked, 0o000)
    const workNext = spawnSync(process.execPath, [join(dirname(adrState), 'work-next.mjs'), '--json'], { cwd: dir, encoding: 'utf8', timeout: 120_000 })
    assert.deepEqual(JSON.parse(workNext.stdout).readinessUnproven, ['docs/adr/tasks'], workNext.stdout)
  } finally {
    try { chmodSync(locked, 0o644) } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true })
  }
})

// Codex round 2, F5: an unread file in a shared tasks/ is nobody's. With ADR-001 the
// only record beside it, T2 (which names ADR-002) was handed to ADR-001 once it could
// not be read. Its directory is still asked about, so readiness stays UNPROVEN.
test('an unread task in a shared tasks directory is nobody\'s, and its directory is still asked about', { skip: cannotDenyRead }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-shared-owner-'))
  const tasks = join(dir, 'docs', 'adr', 'tasks')
  const locked = join(tasks, 'T2-other.md')
  try {
    mkdirSync(tasks, { recursive: true })
    writeFileSync(join(tasks, 'T1-mine.md'), '# Task ADR-001-T1: mine\n\n## Acceptance\n\n```bash\ntrue\n```\n')
    writeFileSync(locked, '# Task ADR-002-T2: other\n\n## Acceptance\n\n```bash\ntrue\n```\n')
    writeFileSync(join(dir, 'docs', 'adr', 'ADR-001-a.md'), '# ADR-001: a\n\n**Status:** Accepted\n\n## Context\n\nc\n')
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 30_000 }).status, 0)
    chmodSync(locked, 0o000)
    const record = adrCorpus(dir).find(entry => entry.id === 'ADR-001')
    assert.deepEqual(record.taskFiles.map(file => basename(file)), ['T1-mine.md'])
    const workNext = spawnSync(process.execPath, [join(dirname(adrState), 'work-next.mjs'), '--json'], { cwd: dir, encoding: 'utf8', timeout: 120_000 })
    assert.deepEqual(JSON.parse(workNext.stdout).readinessUnproven, ['docs/adr/tasks'], workNext.stdout)
  } finally {
    try { chmodSync(locked, 0o644) } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true })
  }
})
