// A backslash in a listed name separates directories only on Windows. On POSIX git lists a root-level file
// named `docs\adr\001-x.md` as that one name, and `hasDecisionCorpus` rewrote it to `docs/adr/…` on every
// platform: a decision corpus that is not there. The sibling of the corpus reader's finding 4 (a gpt-6.1-sol
// review of ADR-092's execution, 2026-10-07), left by that fix and named in its hand-back. Its task-directory
// twin left with SessionStart's ready lines (ADR-099).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { hasDecisionCorpus } from '../plugin/scripts/session-orientation.mjs'
import { adrCorpus, frozenArchiveOf } from '../plugin/scripts/decision-corpus.mjs'
import { observe } from '../plugin/scripts/work-next.mjs'

const onWindows = process.platform === 'win32'
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'qh-listed-backslash-'))
  temps.push(dir)
  return dir
}

test('a backslash in a listed corpus path is one name on POSIX and a separator on Windows', () => {
  const repo = scratch()
  const listing = ['docs\\adr\\001-x.md']
  assert.equal(hasDecisionCorpus(repo, listing, 'win32'), true)
  assert.equal(hasDecisionCorpus(repo, listing, 'linux'), false)
  assert.equal(hasDecisionCorpus(repo, ['docs/adr/001-x.md'], 'linux'), true)
  // The default is the running platform: the SessionStart orientation passes none.
  assert.equal(hasDecisionCorpus(repo, listing), onWindows)
})

test('only a catalog listed in the archive directory can freeze its records and tasks', () => {
  const root = join(import.meta.dirname, 'fixtures', 'corpora', 'dated-archive')
  const record = 'docs/adr-archive/2026-05-01-kv-warden-first-cut.md'
  const catalog = 'docs/adr-archive/README.md'
  const backslashes = catalog.replaceAll('/', '\\')
  for (const [platform, listedCatalog, frozen] of [
    ['linux', backslashes, false],
    ['win32', backslashes, true],
    ['linux', catalog, true],
  ]) {
    const listing = [record, listedCatalog]
    const corpus = adrCorpus(root, { tracked: listing, platform })
    assert.equal(corpus.look, 'ok')
    assert.equal(corpus[0].frozen, frozen, platform)
    assert.deepEqual(corpus.unmarkedArchives, frozen ? [] : ['docs/adr-archive'])
    assert.equal(frozenArchiveOf(root, listing, platform)('docs/adr-archive/tasks/T1.md'), frozen)
  }
})

test('work-next counts tasks and specs only under actual path separators', () => {
  const root = scratch()
  const listing = ['docs\\tasks\\T1-ordinary.md', 'docs\\specs\\one.md', 'docs\\specs\\nested\\two.md']
  for (const rel of listing) {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '# Note\n')
  }
  const state = observe(root, { listing })
  const expected = onWindows ? 1 : 0
  assert.equal(state.tasks, expected)
  assert.equal(state.specs, expected)
  assert.equal(state.nestedSpecs.length, expected)
})
