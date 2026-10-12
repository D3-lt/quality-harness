// The backlog sweep of 2026-10-12 (CLAUDE.md §10): docs/BACKLOG.md is the index of every numbered section, and a
// closed section's text lives verbatim in docs/backlog-archive/. These hold the two promises that makes: nothing
// archived is lost, and every `BACKLOG §N` cited anywhere still names a heading in the index. Each check is shown
// finding something on a dirty input too (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ARCHIVED, readBacklog, sections } from '../scripts/backlog-record-sweep.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')
const numbered = /^## \d+\. /

// The headings the index points into the archive, with the part each names.
function pointers (index) {
  const lines = index.split('\n')
  return lines.flatMap((line, i) => {
    const m = numbered.test(line) && lines[i + 1] === '' ? ARCHIVED.exec(lines[i + 2] ?? '') : null
    return m ? [{ heading: line, part: m[1] }] : []
  })
}

test('every archived pointer finds its section, and every archived section has its pointer', () => {
  const index = read('docs/BACKLOG.md')
  const pointed = pointers(index)
  assert.ok(pointed.length > 0, 'the index points into the archive')
  const parts = readdirSync(path.join(repoRoot, 'docs', 'backlog-archive')).filter(name => name.endsWith('.md'))
  const archived = parts.flatMap(part => read(`docs/backlog-archive/${part}`).split('\n')
    .filter(line => numbered.test(line)).map(heading => ({ heading, part })))
  const key = entry => `${entry.part} ${entry.heading}`
  assert.deepEqual(pointed.map(key).sort(), archived.map(key).sort(), 'the index and the archive name the same sections')
  // And nothing is said twice: an archived section is not also open in the index.
  const open = index.split('\n').filter(line => numbered.test(line))
  assert.equal(new Set(open).size, open.length, 'each heading appears once in the index')
})

test('readBacklog puts every archived body back, and a pointer to a missing section is an error', () => {
  const files = {
    'docs/BACKLOG.md': '# Backlog\n\n## 1. CLOSED — one\n\nArchived: [backlog-archive/A.md](backlog-archive/A.md)\n\n## 2. OPEN — two\n\nstill open\n',
    'docs/backlog-archive/A.md': '# Archive\n\n## 1. CLOSED — one\n\nthe whole body\nof one\n\n',
  }
  const fake = file => { const rel = path.relative('/r', file).split(path.sep).join('/'); if (!(rel in files)) throw new Error(`no ${rel}`); return files[rel] }
  const whole = readBacklog('/r', fake)
  assert.deepEqual(sections(whole).map(s => [s.number, s.body.trim()]), [[1, 'the whole body\nof one'], [2, 'still open']])
  files['docs/backlog-archive/A.md'] = '# Archive\n\n## 1. CLOSED — renamed\n\nbody\n'
  assert.throws(() => readBacklog('/r', fake), /has no such section/)
  // The real backlog reads whole: every numbered section, its body included.
  const real = sections(readBacklog(repoRoot))
  assert.equal(real.length, read('docs/BACKLOG.md').split('\n').filter(line => numbered.test(line)).length)
  assert.ok(real.every(s => s.body.trim().length > 0 && !ARCHIVED.test(s.body.trim())), 'no section reads as its pointer')
})

// `BACKLOG §N` and `BACKLOG section N`, the two forms the corpus cites.
const CITATION = /BACKLOG(?:\.md)?\s?(?:§|section )\s?(\d+)/g
// A test that cites a section on purpose because it does not exist (tests/gate-regressions.py, adr-lint's pointer check).
const DELIBERATELY_ABSENT = new Set([9999])

function unresolvedCitations (files, headings) {
  return files.flatMap(([file, text]) => [...text.matchAll(CITATION)]
    .map(m => Number(m[1])).filter(n => !headings.has(n) && !DELIBERATELY_ABSENT.has(n)).map(n => `${file}: §${n}`))
}

function textFiles (dir, out = []) {
  for (const name of readdirSync(path.join(repoRoot, dir))) {
    const rel = `${dir}/${name}`
    if (name === 'node_modules' || name === '.git' || rel === 'tests/fixtures' || rel === 'docs/backlog-archive') continue
    if (statSync(path.join(repoRoot, rel)).isDirectory()) textFiles(rel, out)
    else if (/\.(md|mjs|cjs|js|py|sh|json|yml)$|^[a-z-]+$/.test(name)) out.push([rel, read(rel)])
  }
  return out
}

test('every BACKLOG section cited in the repository names a heading in the index', () => {
  const headings = new Set(sections(read('docs/BACKLOG.md')).map(s => s.number))
  const files = ['docs', 'plugin', 'scripts', 'tests', '.claude', '.github'].flatMap(dir => textFiles(dir))
    .filter(([file]) => file !== 'docs/BACKLOG.md').concat([['CLAUDE.md', read('CLAUDE.md')]])
  assert.ok(files.length > 100, `read ${files.length} files`)
  assert.deepEqual(unresolvedCitations(files, headings), [])
  // ...and it can say the other thing.
  // Built from pieces, so this file's own source does not cite a section that does not exist.
  assert.deepEqual(unresolvedCitations([['x.md', `see BACKLOG ${'§'}5000 and BACKLOG section 1`]], new Set([1])), ['x.md: §5000'])
})
