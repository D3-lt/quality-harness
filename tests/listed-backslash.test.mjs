// A backslash in a listed name separates directories only on Windows. On POSIX git lists a root-level file
// named `docs\tasks\T1-x.md` as that one name, and `taskDirectories` and `hasDecisionCorpus` rewrote it to
// `docs/tasks/T1-x.md` and `docs/adr/…` on every platform: a task directory and a decision corpus that are
// not there. The sibling of the corpus reader's finding 4 (a gpt-6.1-sol review of ADR-092's execution,
// 2026-10-07), left by that fix and named in its hand-back.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'

import { hasDecisionCorpus } from '../plugin/scripts/lifecycle.mjs'
import { taskDirectories } from '../plugin/scripts/decision-corpus.mjs'

const onWindows = process.platform === 'win32'
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'qh-listed-backslash-'))
  temps.push(dir)
  return dir
}

const listedDirectories = (repo, answer) => answer.read.map(entry => relative(repo, entry.directory).split('\\').join('/'))

test('a backslash in a listed task path is one name on POSIX and a separator on Windows', { skip: onWindows && 'a file name cannot hold a backslash on Windows' }, () => {
  const repo = scratch()
  writeFileSync(join(repo, 'docs\\tasks\\T1-x.md'), '# T1\n')
  mkdirSync(join(repo, 'docs', 'tasks'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'tasks', 'T1-x.md'), '# T1\n')
  const listing = ['docs\\tasks\\T1-x.md']
  assert.deepStrictEqual(listedDirectories(repo, taskDirectories(repo, listing)), [])
  assert.deepStrictEqual(listedDirectories(repo, taskDirectories(repo, listing, undefined, 'win32')), ['docs/tasks'])
})

test('a backslash in a listed corpus path is one name on POSIX and a separator on Windows', () => {
  const repo = scratch()
  const listing = ['docs\\adr\\001-x.md']
  assert.equal(hasDecisionCorpus(repo, listing, 'win32'), true)
  assert.equal(hasDecisionCorpus(repo, listing, 'linux'), false)
  assert.equal(hasDecisionCorpus(repo, ['docs/adr/001-x.md'], 'linux'), true)
  // The default is the running platform: the SessionStart orientation passes none.
  assert.equal(hasDecisionCorpus(repo, listing), onWindows)
})
