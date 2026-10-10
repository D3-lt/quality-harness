// ADR-092 T3: lifecycle mirrors the one definition, discovers by it, and dedups by it. Every row of
// tests/fixtures/record-recognition.json is laid out in a fresh repository and read by `adrCorpus`;
// the expected answers are the table's approved ones (ADR-092 Decision 6), never computed here.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { adrCorpus, linksIn, onceByRealPath, screenAdmits, taskDirectories } from '../plugin/scripts/decision-corpus.mjs'
import { observe } from '../plugin/scripts/work-next.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrState = join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs')
const TABLE = JSON.parse(readFileSync(join(repoRoot, 'tests', 'fixtures', 'record-recognition.json'), 'utf8'))
const ROWS = TABLE.rows
const LAYOUTS = Object.fromEntries(TABLE.layouts.map(layout => [layout.id, layout]))
const rowById = Object.fromEntries(ROWS.map(row => [row.id, row]))
const plainIds = ROWS.filter(row => row.id !== 'R1').map(row => row.id)
const KIB = 1024
const SCREEN_BUDGET_REASON = /screen budget/
const NAMED = /^ADR-[0-9]+(?![A-Za-z0-9_])/i

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function textOf(file) {
  if (file.gen) {
    const { before = '', repeat, bytes, then = '' } = file.gen
    return before + repeat.repeat(Math.ceil(bytes / repeat.length)) + then
  }
  return file.text ?? ''
}

// A fresh repository under a fresh scratch directory, by its REAL path: a macOS temp directory sits
// under the `/var` link, which every path would count alike. A path starting `outside/` goes beside
// the repository. Returns null when a link cannot be made (Windows EPERM). Git runs only here.
function layOut(files, under = 'repo') {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'qh-record-discovery-')))
  temps.push(scratch)
  const repo = join(scratch, ...under.split('/'))
  mkdirSync(repo, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const base = rel => (rel.startsWith('outside/') ? join(dirname(repo), ...rel.split('/')) : join(repo, ...rel.split('/')))
  for (const file of files) {
    const at = base(file.path)
    mkdirSync(dirname(at), { recursive: true })
    if (file.link) {
      try { symlinkSync(file.link, at) } catch (error) { if (error.code === 'EPERM') return null; throw error }
    } else if (file.notRegular) {
      mkdirSync(at)
    } else if (!file.absent) {
      writeFileSync(at, file.nul ? `${textOf(file)}\u0000` : textOf(file))
    }
  }
  return { scratch, repo }
}
// The listing git would give: every file but one outside the repository or never added.
const listingOf = files => files.filter(file => !file.unlisted && !file.path.startsWith('outside/')).map(file => file.path)
const rel = (repo, file) => path.relative(repo, file).split(path.sep).join('/')

// adrCorpus's answer for one path: record (with its status), undecided, unreadable, notRecognised,
// or null for no list.
function answerOf(repo, corpus) {
  const answers = new Map()
  for (const record of corpus) answers.set(rel(repo, record.file), 'record')
  for (const entry of corpus.unreadable) answers.set(rel(repo, entry.file), entry.alias ? 'alias' : entry.reason ? 'unreadable' : 'undecided')
  for (const file of corpus.notRecognised) answers.set(rel(repo, file), 'notRecognised')
  return at => answers.get(at) ?? null
}
const subjectOf = row => row.subject ?? row.files[0].path

test('every row of the recognition table reads its approved answer in lifecycle', () => {
  const files = plainIds.flatMap(id => rowById[id].files)
  const { repo } = layOut(files)
  const corpus = adrCorpus(repo, { tracked: listingOf(files) })
  const answer = answerOf(repo, corpus)
  assert.deepStrictEqual(Object.fromEntries(plainIds.map(id => [id, answer(subjectOf(rowById[id]))])),
    Object.fromEntries(plainIds.map(id => [id, rowById[id].adrCorpus])))
  const statuses = Object.fromEntries(corpus.map(record => [rel(repo, record.file), record.status]))
  const ids = Object.fromEntries(corpus.map(record => [rel(repo, record.file), record.id]))
  for (const id of plainIds.filter(id => rowById[id].adrCorpus === 'record')) {
    assert.equal(statuses[subjectOf(rowById[id])], rowById[id].status, id)
    assert.equal(ids[subjectOf(rowById[id])], rowById[id].identity, `${id} identity`)
  }
})

test('the content screen reads outside fences and past a frontmatter fence', () => {
  const ids = ['R8', 'R19', 'R34', 'R37', 'R38', 'R39']
  const files = [...ids.flatMap(id => rowById[id].files),
    { path: 'notes/fm.md', text: '---\nnotes: |\n  ```\ntitle: x\n---\n**Status:** Accepted\n\n## Decision\n\nx\n' },
    { path: 'notes/open.md', text: '---\n```\n**Status:** Accepted\n\n## Decision\n' }]
  const { repo } = layOut(files)
  const admitted = files.map(file => [file.path, screenAdmits(join(repo, ...file.path.split('/')))])
  assert.deepStrictEqual(Object.fromEntries(admitted), {
    'notes/decision.md': true, 'notes/report.md': true, 'notes/decision-2.md': false,
    'notes/report-3.md': false, 'notes/report-4.md': false, 'notes/report-5.md': true,
    'notes/fm.md': true, 'notes/open.md': false,
  })
})

test('the link rows read their approved answers in lifecycle', t => {
  const r1 = rowById.R1
  const laid = layOut(r1.files, r1.repositoryUnder)
  if (!laid) { t.skip('a symbolic link cannot be made here'); return }
  const corpus = adrCorpus(laid.repo, { tracked: listingOf(r1.files) })
  assert.deepStrictEqual(corpus.map(record => [rel(laid.repo, record.file), record.status]), [[r1.subject, r1.status]])
  const l7 = LAYOUTS.L7
  const seven = layOut(l7.files)
  const corpus7 = adrCorpus(seven.repo, { tracked: listingOf(l7.files) })
  const answer7 = answerOf(seven.repo, corpus7)
  assert.deepStrictEqual(corpus7.map(record => ({ file: rel(seven.repo, record.file), status: record.status })), l7.adrCorpus.records)
  assert.deepStrictEqual(l7.adrCorpus.inNoList.map(answer7), [null])
  const l8 = LAYOUTS.L8
  const eight = layOut(l8.files)
  const corpus8 = adrCorpus(eight.repo, { tracked: listingOf(l8.files) })
  assert.deepStrictEqual(corpus8.notRecognised.map(file => rel(eight.repo, file)), l8.adrCorpus.notRecognised)
  assert.deepStrictEqual(corpus8.length, 0)
})

test('a recognised spelling wins the dedup over fewer links', t => {
  for (const id of ['L1', 'L2', 'L3']) {
    const layout = LAYOUTS[id]
    const laid = layOut(layout.files)
    if (!laid) { t.skip('a symbolic link cannot be made here'); return }
    const corpus = adrCorpus(laid.repo, { tracked: listingOf(layout.files) })
    assert.deepStrictEqual({
      records: corpus.map(record => ({ file: rel(laid.repo, record.file), status: record.status })),
      aliases: corpus.unreadable.filter(entry => entry.alias).map(entry => ({ file: rel(laid.repo, entry.file), sameAs: rel(laid.repo, entry.sameAs) })),
    }, layout.adrCorpus, id)
  }
  // The name preference is decided first: a name-arm spelling through three links, unbounded at a
  // limit of two, still wins over a one-link spelling no name arm recognises.
  const { repo } = layOut([
    { path: 'real/note.md', text: 'x\n' },
    { path: 'one', link: 'real' },
    { path: 'h1', link: 'h2' }, { path: 'h2', link: 'h3' }, { path: 'h3', link: 'real/note.md' },
  ])
  symlinkSync('h1', join(repo, 'ADR-009-named.md'))
  const named = join(repo, 'ADR-009-named.md')
  const plain = join(repo, 'one', 'note.md')
  assert.equal(linksIn(named, 2), Infinity)
  const once = onceByRealPath([plain, named], file => NAMED.test(path.basename(file)), { linkLimit: 2 })
  assert.deepStrictEqual(once.kept, [named])
  assert.deepStrictEqual(once.aliases, [{ file: plain, sameAs: named }])
})

test('links are counted by resolving each hop with one precedence at the limit', t => {
  const l4 = LAYOUTS.L4
  const laid = layOut(l4.files)
  if (!laid) { t.skip('a symbolic link cannot be made here'); return }
  const corpus = adrCorpus(laid.repo, { tracked: l4.tracked })
  assert.deepStrictEqual({
    records: corpus.map(record => ({ file: rel(laid.repo, record.file), status: record.status })),
    aliases: corpus.unreadable.filter(entry => entry.alias).map(entry => ({ file: rel(laid.repo, entry.file), sameAs: rel(laid.repo, entry.sameAs) })),
    linksIn: Object.fromEntries(l4.tracked.map(file => [file, linksIn(join(laid.repo, file))])),
  }, l4.adrCorpus)
  const { repo } = layOut([
    { path: 'real/f.md', text: 'x\n' },
    { path: 'one', link: 'real' },
    { path: 'two', link: 'one' },
    { path: 'three', link: 'two' },
    { path: 'self/f.md', text: 'x\n' },
    { path: 'self/a', link: '.' },
    { path: 'loop', link: 'loop' },
  ])
  assert.deepStrictEqual([linksIn(join(repo, 'one', 'f.md'), 2), linksIn(join(repo, 'two', 'f.md'), 2), linksIn(join(repo, 'three', 'f.md'), 2)], [1, Infinity, Infinity])
  assert.equal(linksIn(join(repo, 'self', 'a', 'a', 'f.md')), 2)
  symlinkSync('self', join(repo, 'b'))
  const twice = join(repo, 'self', 'a', 'a', 'f.md')
  const once = join(repo, 'b', 'f.md')
  assert.deepStrictEqual(onceByRealPath([twice, once]).kept, [once])
  const unbounded = onceByRealPath([join(repo, 'three', 'f.md'), join(repo, 'two', 'f.md')], null, { linkLimit: 1 })
  assert.deepStrictEqual(unbounded.kept, [join(repo, 'three', 'f.md')])
  const cycle = join(repo, 'loop', 'x.md')
  assert.deepStrictEqual(onceByRealPath([cycle, cycle]), { kept: [cycle, cycle], aliases: [] })
})

test('task directories take the per-hop count and no name preference', t => {
  const task = '# Task ADR-001-T1: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n## Acceptance\n\n```bash\nprintf T1\n```\n\n## Verification Log\n'
  const laid = layOut([
    { path: 'docs/adr/ADR-001-x.md', text: '# ADR-001: X\n\n**Status:** Accepted\n\n## Decision\n\nx\n' },
    { path: 'docs/adr/ADR-001-x/tasks/T1-a.md', text: task },
    { path: 'q', link: 'docs/adr/ADR-001-x' },
    { path: 'p', link: 'q' },
    { path: 'r', link: 'docs/adr/ADR-001-x' },
    { path: 's', link: 'docs/adr/ADR-001-x' },
  ])
  if (!laid) { t.skip('a symbolic link cannot be made here'); return }
  const { repo } = laid
  const listing = ['p/tasks/T1-a.md', 'r/tasks/T1-a.md']
  assert.deepStrictEqual(taskDirectories(repo, listing).read.map(entry => rel(repo, entry.directory)), ['r/tasks'])
  const state = observe(repo, { listing: ['docs/adr/ADR-001-x.md', ...listing] })
  assert.deepStrictEqual(state.partialBecause.map(entry => rel(repo, entry.file)), ['p/tasks/T1-a.md'])
  assert.deepStrictEqual(taskDirectories(repo, ['s/tasks/T1-a.md', 'r/tasks/T1-a.md']).read.map(entry => rel(repo, entry.directory)), ['s/tasks'])
})

test('a failed read is never dropped by discovery', () => {
  for (const id of ['L5', 'L9']) {
    const layout = LAYOUTS[id]
    const { repo } = layOut(layout.files)
    const corpus = adrCorpus(repo, { tracked: listingOf(layout.files) })
    assert.equal(answerOf(repo, corpus)(layout.files[0].path), layout.adrCorpus, id)
    assert.equal(corpus.look, 'PARTIAL', id)
  }
  const l6 = LAYOUTS.L6
  const six = layOut(l6.files)
  const corpus6 = adrCorpus(six.repo, { tracked: listingOf(l6.files) })
  assert.deepStrictEqual(Object.fromEntries(l6.files.map(file => [file.path, answerOf(six.repo, corpus6)(file.path)])), l6.adrCorpus)
  const { repo } = layOut([{ path: 'notes/x.md', notRegular: true }])
  const corpus = adrCorpus(repo, { tracked: ['notes/x.md'] })
  assert.equal(answerOf(repo, corpus)('notes/x.md'), 'unreadable')
  assert.equal(corpus.look, 'PARTIAL')
})

test('the content screen stops at its budget and names the first path it did not screen', () => {
  const note = 'filler line\n'.repeat(Math.ceil(800 / 12)).slice(0, 800)
  const files = [
    { path: 'notes/a.md', text: note }, { path: 'notes/b.md', text: note }, { path: 'notes/c.md', text: note },
    ...rowById.R8.files,
  ]
  const { repo } = layOut(files)
  const bounded = adrCorpus(repo, { tracked: listingOf(files), screenBudget: KIB })
  assert.equal(bounded.look, 'PARTIAL')
  const unexamined = bounded.unreadable.filter(entry => SCREEN_BUDGET_REASON.test(entry.reason ?? ''))
  assert.deepStrictEqual(unexamined.map(entry => rel(repo, entry.file)), ['notes/b.md'])
  assert.deepStrictEqual(bounded.map(record => rel(repo, record.file)), [])
  const whole = adrCorpus(repo, { tracked: listingOf(files) })
  assert.equal(whole.look, 'ok')
  assert.deepStrictEqual(whole.map(record => rel(repo, record.file)), ['notes/decision.md'])
})

test('discovery follows placement through a listed link', t => {
  const l10 = LAYOUTS.L10
  const laid = layOut([...l10.files, { path: '.gitignore', text: 'docs/adr/rule.md\n' }])
  if (!laid) { t.skip('a symbolic link cannot be made here'); return }
  const { repo } = laid
  const corpus = adrCorpus(repo, { tracked: listingOf(l10.files) })
  assert.deepStrictEqual(corpus.map(record => ({ file: rel(repo, record.file), status: record.status })), l10.adrCorpus.records)
  assert.equal(corpus.look, 'ok')
  assert.equal(spawnSync('git', ['add', '.gitignore', 'notes/rule.md'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const state = observe(repo)
  assert.equal(state.records, 1)
})

test('a duplicate id among undecided records is named', () => {
  for (const status of ['✅ ACCEPTED & IMPLEMENTED', 'Accepted']) {
    const files = [
      { path: 'docs/adr/ADR-006-real.md', text: '# ADR-006: Real\n\n**Status:** Accepted\n\n## Decision\n\nx\n' },
      { path: 'app/docs/decisions/cache-removal.md', text: `# ADR 006: Cache removal\n\n**Status:** ${status}\n\n## Decision\n\nx\n` },
    ]
    const { repo } = layOut(files)
    assert.equal(spawnSync('git', ['add', '-A'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
    const r = spawnSync(process.execPath, [adrState, '--json', repo], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(r.status, 0, r.stderr)
    const state = JSON.parse(r.stdout)
    assert.deepStrictEqual(state.duplicateIds.map(entry => ({ id: entry.id, files: [...entry.files].sort() })),
      [{ id: 'ADR-006', files: ['app/docs/decisions/cache-removal.md', 'docs/adr/ADR-006-real.md'] }], status)
  }
})
