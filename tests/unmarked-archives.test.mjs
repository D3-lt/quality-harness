// ADR-092 T6 (Decision 11): an archive-named directory with no Lifecycle marker is named, through the
// corpus reader, exactly when it holds a record that reader counted or held undecided, or a task file;
// at SessionStart, which opens no record content, by a name test widened to the name arms. Neither
// path names a directory for a template, and a listed marker freezes the directory in both.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { adrCorpus, unmarkedArchives } from '../plugin/scripts/decision-corpus.mjs'
import { observe } from '../plugin/scripts/work-next.mjs'

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const P = 'Status: Accepted\n'
const B = '**Status:** Accepted\n\n## Decision\n\nx\n'
const TASK = '# Task ADR-001-T1: do\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n## Verification Log\n'
const MARKER = '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n'
// One tree per entry: the files under `archive/`, and whether the corpus reader names `archive`.
const TREES = [
  { files: { 'archive/spec-01-x.md': P }, named: true },
  { files: { 'archive/ADR-12345-x.md': '# ADR-12345: X\n' }, named: true },
  { files: { 'archive/decision.md': B }, named: true },
  { files: { 'archive/x/tasks/T1-a.md': TASK }, named: true },
  { files: { 'archive/001-note.md': 'A note.\n' }, named: false },
  { files: { 'archive/notes.md': 'A note.\n' }, named: false },
  { files: { 'archive/templates/ADR-001-x.md': B }, named: false },
]

function layOut(files) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'qh-unmarked-archives-')))
  temps.push(repo)
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, ...path.split('/'))), { recursive: true })
    if (text === null) mkdirSync(join(repo, ...path.split('/')))
    else writeFileSync(join(repo, ...path.split('/')), text)
  }
  return repo
}

test('the corpus reader names an archive by the records it holds and by nothing else', () => {
  for (const { files, named } of TREES) {
    const repo = layOut(files)
    const listing = Object.keys(files)
    const expected = named ? ['archive'] : []
    assert.deepStrictEqual(adrCorpus(repo, { tracked: listing }).unmarkedArchives, expected, Object.keys(files)[0])
    assert.deepStrictEqual(observe(repo, { listing }).unmarkedArchives, expected, `work-next ${Object.keys(files)[0]}`)
  }
})

test('the SessionStart archive test reads no record content and takes the name arms', () => {
  // Nothing under `archive/` exists on disk, so the answer can come from the names alone: a reader that
  // opened a record would find none of them.
  const repo = layOut({})
  const names = {
    'archive/spec-01-x.md': true, 'archive/ADR-12345-x.md': true, 'archive/001-note.md': true,
    'archive/decision.md': false, 'archive/templates/ADR-001-x.md': false,
  }
  const said = Object.fromEntries(Object.keys(names).map(path => [path, unmarkedArchives(repo, [path]).includes('archive')]))
  assert.deepStrictEqual(said, names)
})

test('a listed Lifecycle marker freezes the archive in both paths', () => {
  for (const { files } of TREES) {
    const repo = layOut({ ...files, 'archive/README.md': MARKER })
    const listing = [...Object.keys(files), 'archive/README.md']
    assert.deepStrictEqual(adrCorpus(repo, { tracked: listing }).unmarkedArchives, [], Object.keys(files)[0])
    assert.deepStrictEqual(unmarkedArchives(repo, listing), [], Object.keys(files)[0])
  }
  // A listed README that cannot be read: the directory is not named, and the look is PARTIAL.
  const repo = layOut({ 'archive/spec-01-x.md': P, 'archive/README.md': null })
  const listing = ['archive/spec-01-x.md', 'archive/README.md']
  const corpus = adrCorpus(repo, { tracked: listing })
  assert.deepStrictEqual([corpus.unmarkedArchives, unmarkedArchives(repo, listing), corpus.look], [[], [], 'PARTIAL'])
})
