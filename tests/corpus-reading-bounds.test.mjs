// What the JS corpus reader spends, held to what it says it spends. A gpt-6.1-sol review of ADR-092's
// execution (2026-10-07) found the record budget charged to ordinary notes (finding 16, a regression
// against v3.8.10), the content screen's budget taken from a stat size rather than the bytes read
// (finding 12), a long line rescanned on every chunk (finding 13), alias replacement quadratic in the
// paths listed (finding 14), and an archive README read with a blocking open (finding 11).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import * as lifecycle from '../plugin/scripts/lifecycle.mjs'

const lifecycleUrl = new URL('../plugin/scripts/lifecycle.mjs', import.meta.url).href
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

// A fresh repository holding `files` ({path: text}); git runs only in a directory this file made.
function repository(files) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-corpus-bounds-'))
  temps.push(repo)
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  for (const [path, text] of Object.entries(files)) {
    const at = join(repo, ...path.split('/'))
    mkdirSync(dirname(at), { recursive: true })
    writeFileSync(at, text)
  }
  return repo
}
const rel = (repo, file) => relative(repo, file).split('\\').join('/')
const RECORD = '# ADR-001: X\n\n**Status:** Accepted\n\n## Decision\n\nx\n'

test('two hundred ordinary notes before a record read as v3.8.10 read them', () => {
  // The corpus shape the review measured, and v3.8.10's answer, measured 2026-10-07 by running that
  // release's adrCorpus over it: one record, look ok, nothing unread.
  const files = { 'docs/adr/adr-001-x.md': RECORD }
  for (let i = 0; i < 200; i++) files[`docs/adr/aaa-note-${String(i).padStart(3, '0')}.md`] = `# A note ${i}\n\nSome text.\n`
  const repo = repository(files)
  const corpus = lifecycle.adrCorpus(repo)
  assert.deepStrictEqual({
    records: corpus.map(record => rel(repo, record.file)),
    look: corpus.look,
    unreadable: corpus.unreadable.map(entry => ({ file: rel(repo, entry.file), reason: entry.reason })),
  }, { records: ['docs/adr/adr-001-x.md'], look: 'ok', unreadable: [] })
  // The dirty twin: two hundred RECORDS before it still spend the budget, and the next is named.
  const full = { ...files }
  for (let i = 0; i < 200; i++) full[`docs/adr/ADR-${String(i + 2).padStart(4, '0')}-x.md`] = RECORD.replace('ADR-001', `ADR-${String(i + 2).padStart(4, '0')}`)
  const past = repository(full)
  const stopped = lifecycle.adrCorpus(past)
  assert.equal(stopped.look, 'PARTIAL')
  assert.equal(stopped.length, 200)
  const named = stopped.unreadable.filter(entry => /^record budget: 200 records were read/.test(entry.reason ?? ''))
  assert.deepStrictEqual(named.map(entry => rel(past, entry.file)), ['docs/adr/aaa-note-000.md'])
})

test('the content screen stops at the bytes it was given, whatever size it was told', () => {
  const repo = repository({ 'notes/long.md': `${'filler line\n'.repeat(20_000)}**Status:** Accepted\n## Decision\n` })
  const file = join(repo, 'notes', 'long.md')
  const short = { left: 64 * 1024 }
  assert.equal(lifecycle.screenAdmits(file, short), null)
  assert.ok(short.left < 0, 'the screen spent what it read')
  const enough = { left: 1024 * 1024 }
  assert.equal(lifecycle.screenAdmits(file, enough), true)
  assert.equal(lifecycle.screenAdmits(file), true)
  // A whole read is bounded the same way: by the bytes, never by a size asked first.
  assert.throws(() => lifecycle.readRegularText(file, 64 * 1024), error => error.code === 'EFBIG')
  assert.equal(lifecycle.readRegularText(file, 1024 * 1024).length, 240_000 + '**Status:** Accepted\n## Decision\n'.length)
})

test('the content screen scans each character once however long a line runs', () => {
  // Every chunk of one unbroken line was joined to everything before it and split again, so the work
  // grew with the square of the line (finding 13). Counted, not timed.
  const lines = []
  const scanned = { chars: 0 }
  const stream = lifecycle.lineStream(line => lines.push(line), scanned)
  const chunk = 'a'.repeat(64 * 1024)
  for (let i = 0; i < 64; i++) stream.write(chunk)
  stream.write('\n**Status:** x')
  stream.end()
  assert.equal(scanned.chars, 64 * chunk.length + '\n**Status:** x'.length)
  assert.deepStrictEqual(lines.map(line => line.length), [64 * chunk.length, '**Status:** x'.length])
  // It splits exactly as the whole text splits, wherever the chunks fall, a CRLF across two included.
  const text = 'a\r\nb\rc\n\r\n\rd\r'
  for (let size = 1; size <= text.length; size++) {
    const got = []
    const each = lifecycle.lineStream(line => got.push(line))
    for (let at = 0; at < text.length; at += size) each.write(text.slice(at, at + size))
    each.end()
    assert.deepStrictEqual(got, text.split(/\r\n|\r|\n/), `chunks of ${size}`)
  }
})

// The paths of `n` files, each listed first through a two-link spelling and then through a one-link
// one, with real paths and link counts from a table instead of the disk.
function aliasListing(n) {
  const paths = []
  const real = new Map()
  const links = new Map()
  for (let i = 0; i < n; i++) {
    for (const [spelling, count] of [[`/x/f${i}.md`, 2], [`/z/f${i}.md`, 1]]) {
      paths.push(spelling)
      real.set(spelling, `/real/f${i}.md`)
      links.set(spelling, count)
    }
  }
  return { paths: [...paths.filter(p => p.startsWith('/x/')), ...paths.filter(p => p.startsWith('/z/'))], real, links }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
function timeOnce(n) {
  const { paths, real, links } = aliasListing(n)
  const options = { realpath: file => real.get(file), links: file => links.get(file) }
  const samples = []
  for (let run = 0; run < 5; run++) {
    const start = process.hrtime.bigint()
    const once = lifecycle.onceByRealPath(paths, null, options)
    samples.push(Number(process.hrtime.bigint() - start))
    assert.equal(once.kept.length, n)
    assert.equal(once.aliases.length, n)
  }
  return median(samples)
}

test('alias replacement grows with the paths listed, not with their square', () => {
  // Every replacement searched the kept list and rescanned every alias (finding 14). Four times the
  // paths cost about four times the time; the square would be sixteen.
  const small = timeOnce(4000)
  const large = timeOnce(16000)
  assert.ok(large / small < 8, `4x the paths cost ${(large / small).toFixed(1)}x the time`)
  // And the replacement is still right: the one-link spelling is kept, the two-link one is its alias.
  const { paths, real, links } = aliasListing(2)
  const once = lifecycle.onceByRealPath(paths, null, { realpath: file => real.get(file), links: file => links.get(file) })
  assert.deepStrictEqual(once.kept, ['/z/f0.md', '/z/f1.md'])
  assert.deepStrictEqual(once.aliases, [{ file: '/x/f0.md', sameAs: '/z/f0.md' }, { file: '/x/f1.md', sameAs: '/z/f1.md' }])
})

// Git Bash's mkfifo on Windows exits 0 and makes no FIFO (tests/irregular-task-entry.test.mjs).
const fifo = at => spawnSync('mkfifo', [at], { timeout: 10_000, windowsHide: true }).status === 0
  && (() => { try { return lstatSync(at).isFIFO() } catch { return false } })()

test('an archive README that is a FIFO is unknown, and is never opened', t => {
  const repo = repository({ 'docs/adr-archive/tasks/T1-x.md': '# Task T1\n', 'docs/adr-other/tasks/T1-x.md': '# Task T1\n' })
  if (!fifo(join(repo, 'docs', 'adr-archive', 'README.md')) || !fifo(join(repo, 'docs', 'adr-other', 'readme.md'))) {
    t.skip('a FIFO cannot be made here')
    return
  }
  const listing = ['docs/adr-archive/README.md', 'docs/adr-archive/tasks/T1-x.md', 'docs/adr-other/readme.md', 'docs/adr-other/tasks/T1-x.md']
  // In a child, so a blocking open is a timeout this test reports rather than a hung suite.
  const script = `import { frozenArchiveOf } from ${JSON.stringify(lifecycleUrl)}
const frozen = frozenArchiveOf(${JSON.stringify(repo)}, ${JSON.stringify(listing)})
console.log(JSON.stringify([frozen('docs/adr-archive/tasks/T1-x.md'), frozen('docs/adr-other/tasks/T1-x.md')]))`
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(run.signal, null, 'the archive README was opened and the read blocked')
  assert.equal(run.status, 0, run.stderr)
  assert.deepStrictEqual(JSON.parse(run.stdout), ['unknown', 'unknown'])
})
