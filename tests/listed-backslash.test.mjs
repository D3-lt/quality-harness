// A backslash in a listed name separates directories only on Windows. On POSIX git lists a root-level file
// named `docs\adr\001-x.md` as that one name, and `hasDecisionCorpus` rewrote it to `docs/adr/…` on every
// platform: a decision corpus that is not there. The sibling of the corpus reader's finding 4 (a gpt-6.1-sol
// review of ADR-092's execution, 2026-10-07), left by that fix and named in its hand-back. Its task-directory
// twin left with SessionStart's ready lines (ADR-099).
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { hasDecisionCorpus } from '../plugin/scripts/session-orientation.mjs'

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
