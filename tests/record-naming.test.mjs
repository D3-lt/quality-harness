// ADR-092 T4: every numbered candidate is counted, held undecided or named, and a candidate whose read
// failed makes the look PARTIAL. Rows and layouts come from tests/fixtures/record-recognition.json and
// are read through work-next's own `observe`; the expected answers are the table's approved ones.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { adrCorpus } from '../plugin/scripts/lifecycle.mjs'
import { observe } from '../plugin/scripts/work-next.mjs'
import { verdictMoves } from '../plugin/scripts/corpus-probe.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workNext = join(repoRoot, 'plugin', 'scripts', 'work-next.mjs')
const corpusProbe = join(repoRoot, 'plugin', 'scripts', 'corpus-probe.mjs')
const TABLE = JSON.parse(readFileSync(join(repoRoot, 'tests', 'fixtures', 'record-recognition.json'), 'utf8'))
const ROWS = TABLE.rows
const LAYOUTS = Object.fromEntries(TABLE.layouts.map(layout => [layout.id, layout]))
const rowById = Object.fromEntries(ROWS.map(row => [row.id, row]))
const plainIds = ROWS.filter(row => row.id !== 'R1').map(row => row.id)
// Patterns live at module scope, never inside a test body (adr-execute lessons, 2026-09-16).
const UNSUPPORTED_REASON = /format/
const BUDGET_REASON = /512 KiB/

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function textOf(file) {
  if (file.gen) {
    const { before = '', repeat, bytes, then = '' } = file.gen
    return before + repeat.repeat(Math.ceil(bytes / repeat.length)) + then
  }
  return file.text ?? ''
}
// A fresh repository by its real path; `outside/` goes beside it; null when a link cannot be made.
function layOut(files, under = 'repo') {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'qh-record-naming-')))
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
const listingOf = files => files.filter(file => !file.unlisted && !file.path.startsWith('outside/')).map(file => file.path)
const rel = (repo, file) => path.relative(repo, file).split(path.sep).join('/')
const subjectOf = row => row.subject ?? row.files[0].path

// work-next's answer for each path: counted (a record of the corpus it counts), undecided,
// partialBecause (or unsupported, when the reason is a format), notRead, or null.
function workNextSays(repo, listing) {
  const state = observe(repo, { listing })
  const corpus = adrCorpus(repo, { tracked: listing })
  assert.equal(state.records, corpus.length)
  const partial = new Map(state.partialBecause.map(entry => [rel(repo, entry.file), entry.reason]))
  const undecided = new Set(state.undecidedNamed.map(entry => rel(repo, entry.file)))
  const notRead = new Set(state.notRead.map(file => rel(repo, file)))
  const counted = new Set(corpus.map(record => rel(repo, record.file)))
  for (const at of notRead) assert.ok(!partial.has(at), `${at} is both in notRead and in partialBecause`)
  const answer = at => (partial.has(at) ? (UNSUPPORTED_REASON.test(partial.get(at)) ? 'unsupported' : 'partialBecause')
    : undecided.has(at) ? 'undecided' : notRead.has(at) ? 'notRead' : counted.has(at) ? 'counted' : null)
  return { state, answer, partial }
}

test('every row of the recognition table reads its approved answer in work-next', () => {
  const files = plainIds.flatMap(id => rowById[id].files)
  const { repo } = layOut(files)
  const { answer } = workNextSays(repo, listingOf(files))
  assert.deepStrictEqual(Object.fromEntries(plainIds.map(id => [id, answer(subjectOf(rowById[id]))])),
    Object.fromEntries(plainIds.map(id => [id, rowById[id].workNext])))
})

test('the link rows read their approved answers in work-next', t => {
  const r1 = rowById.R1
  const one = layOut(r1.files, r1.repositoryUnder)
  if (!one) { t.skip('a symbolic link cannot be made here'); return }
  assert.equal(workNextSays(one.repo, listingOf(r1.files)).answer(r1.subject), r1.workNext)
  for (const id of ['L1', 'L2', 'L3', 'L7', 'L8', 'L10']) {
    const layout = LAYOUTS[id]
    const { repo } = layOut(layout.files)
    const { answer } = workNextSays(repo, listingOf(layout.files))
    const expected = typeof layout.workNext === 'string'
      ? { [layout.files.find(file => !file.unlisted).path]: layout.workNext }
      : Object.fromEntries(Object.entries(layout.workNext).flatMap(([kind, paths]) => paths.map(at => [at, kind === 'inNoList' ? null : kind])))
    assert.deepStrictEqual(Object.fromEntries(Object.keys(expected).map(at => [at, answer(at)])), expected, id)
  }
  // L4: git lists the links `a`, `b` and `c`, never a path under them, so work-next names nothing.
  const l4 = layOut(LAYOUTS.L4.files)
  assert.equal(spawnSync('git', ['add', 'a', 'b', 'c'], { cwd: l4.repo, timeout: 30_000, windowsHide: true }).status, 0)
  const state = observe(l4.repo)
  assert.deepStrictEqual([state.records, state.notRead, state.partialBecause], [0, [], []])
})

test('a numbered file that is no candidate is neither counted nor named', () => {
  const files = [
    { path: 'notes/01-rule.md', text: '# A rule\n\nNo status here.\n' },
    { path: 'docs/specs/2026-10-07-x.md', text: '# A spec\n\nNo status here either.\n' },
    { path: 'docs/specs/2026-09-11-big.md', gen: { before: '# A long spec\n\n', repeat: 'line of prose\n', bytes: 67 * 1024 } },
  ]
  const { repo } = layOut(files)
  const { state, answer } = workNextSays(repo, listingOf(files))
  assert.deepStrictEqual(files.map(file => answer(file.path)), [null, null, null])
  assert.equal(state.look, 'ok')
})

test('a numbered candidate that cannot be read makes the look PARTIAL and is named', () => {
  for (const id of ['L5', 'L6', 'L9']) {
    const layout = LAYOUTS[id]
    const { repo } = layOut(layout.files)
    const { state, answer } = workNextSays(repo, listingOf(layout.files))
    const expected = typeof layout.workNext === 'string' ? { [layout.files[0].path]: layout.workNext } : layout.workNext
    assert.deepStrictEqual(Object.fromEntries(Object.keys(expected).map(at => [at, answer(at)])), expected, id)
    assert.equal(state.look, 'PARTIAL', id)
  }
})

test('a candidate past the read budget is PARTIAL and named', () => {
  const ids = ['R13', 'R14', 'R15', 'R16']
  const files = ids.flatMap(id => rowById[id].files)
  const { repo } = layOut(files)
  const { answer, partial } = workNextSays(repo, listingOf(files))
  assert.deepStrictEqual(ids.map(id => answer(subjectOf(rowById[id]))), ['notRead', 'notRead', 'partialBecause', 'partialBecause'])
  for (const id of ['R15', 'R16']) assert.match(partial.get(subjectOf(rowById[id])), BUDGET_REASON, id)
})

test('a FIFO candidate is named and never opened', t => {
  const { repo } = layOut([{ path: 'Final/RFC0008-x.md', text: '# A note\n' }])
  assert.equal(spawnSync('git', ['add', 'Final/RFC0008-x.md'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const fifo = join(repo, 'Final', 'RFC0008-x.md')
  unlinkSync(fifo)
  const made = spawnSync('mkfifo', [fifo], { timeout: 10_000, windowsHide: true }).status === 0
    && (() => { try { return lstatSync(fifo).isFIFO() } catch { return false } })()
  if (!made) { t.skip('a FIFO cannot be made here'); return }
  // A 20s bound: a reader that opens the FIFO waits forever, and the kill is the red.
  const r = spawnSync(process.execPath, [workNext, '--json'], { cwd: repo, encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.notEqual(r.signal, 'SIGTERM', 'work-next opened the FIFO')
  const state = JSON.parse(r.stdout)
  // work-next's JSON gives each path relative to the repository already.
  assert.deepStrictEqual(state.partialBecause.map(entry => entry.file.split('\\').join('/')), ['Final/RFC0008-x.md'])
})

test('a numbered file in a format no reader parses is named, and an attachment of a counted record is not', () => {
  const files = [
    { path: 'docs/decisions/0001-use-x.rst', text: 'Use X\n=====\n\nStatus\n------\n\nAccepted\n' },
    { path: 'app/docs/decisions/0002-use-y.adoc', text: '= Use Y\n\n== Status\n\nAccepted\n' },
    { path: 'docs/adr/ADR-003-z.md', text: '# ADR-003: Z\n\n**Status:** Accepted\n\n## Decision\n\nx\n' },
    { path: 'docs/adr/ADR-003-attachment.txt', text: 'notes\n' },
    { path: 'notes/0004-elsewhere.rst', text: 'Status\n------\n\nAccepted\n' },
  ]
  const { repo } = layOut(files)
  const { state, answer } = workNextSays(repo, listingOf(files))
  assert.deepStrictEqual(files.map(file => answer(file.path)), ['unsupported', 'unsupported', 'counted', null, null])
  assert.equal(state.look, 'PARTIAL')
  // The probe lists each as unread, so an attestation counts it among the records it did not compare.
  assert.equal(spawnSync('git', ['add', '-A'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const probe = spawnSync(process.execPath, [corpusProbe, repo, '--json'], { cwd: repo, encoding: 'utf8', timeout: 300_000, windowsHide: true })
  assert.equal(probe.status, 0, probe.stderr)
  const report = JSON.parse(probe.stdout)
  const unread = report.adrLint.filter(entry => entry.verdict === 'unread' && UNSUPPORTED_REASON.test(entry.reason ?? '')).map(entry => entry.file).sort()
  assert.deepStrictEqual(unread, ['app/docs/decisions/0002-use-y.adoc', 'docs/decisions/0001-use-x.rst'])
  assert.equal(verdictMoves(report, report).notCompared, 2)
})

test('a numbered file in a record directory is named at any width', () => {
  const names = ['ADR-7-a.md', 'ADR-12-b.md', 'adr_3-c.md', '1-intro.md']
  const files = names.map(name => ({ path: `docs/adr/${name}`, text: `# ${name}\n\n**Status:** Accepted\n${name === 'adr_3-c.md' ? '\n## Decision\n\nd\n' : ''}` }))
  const { repo } = layOut(files)
  const { state, answer } = workNextSays(repo, listingOf(files))
  assert.equal(state.records, 3)
  assert.deepStrictEqual(names.map(name => answer(`docs/adr/${name}`)), ['counted', 'counted', 'counted', 'notRead'])
})
