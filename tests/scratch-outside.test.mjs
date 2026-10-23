// The Codex review of v3.8.53..42a903a8 found two fail-opens in scratchOutside (tree-facts.mjs; core/hooks/treefacts.go is its
// mirror): a case alias of a project under the temp root exempted its own records where the file system folds case, and a
// repository lookup that failed narrowed ownership to the session's subdirectory. Each is shown here with its twin.
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { scratchOutside } from '../plugin/scripts/tree-facts.mjs'
import { remove } from './helpers/remove.mjs'

test('a case alias of the project is the project where the file system folds case, and not where it does not', () => {
  const tmp = realpathSync(os.tmpdir())
  const stamp = Math.random().toString(36).slice(2)
  const project = path.join(tmp, `qh-CaseProj-${stamp}`)
  const record = path.join(tmp, `qh-caseproj-${stamp}`, 'docs', 'adr', 'ADR-001-x.md')
  const lookup = () => ({ ok: true, root: project })
  assert.equal(scratchOutside(record, project, { platform: 'darwin', lookup }), false, 'macOS folds case: the record is the project\'s')
  assert.equal(scratchOutside(record, project, { platform: 'win32', lookup }), false, 'so does Windows')
  // A win32 host cannot answer for Linux: Node's path.relative there folds case by itself (the Windows check of cec6203c).
  if (process.platform !== 'win32') {
    assert.equal(scratchOutside(record, project, { platform: 'linux', lookup }), true, 'Linux does not: another directory, so scratch')
  }
})

test('a repository git could not answer about is gated, never narrowed to the session directory', () => {
  const project = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'qh-lookup-')))
  try {
    const record = path.join(project, 'docs', 'adr', 'ADR-001-x.md')
    const beside = path.join(path.dirname(project), `${path.basename(project)}-beside`, 'ADR-001-x.md')
    const cwd = path.join(project, 'sub')
    assert.equal(scratchOutside(record, cwd, { lookup: () => ({ ok: false, root: null, reason: 'git timed out' }) }), false)
    // A git that exited non-zero for any reason (dubious ownership, a corrupt index) answers "not a repository" too.
    assert.equal(scratchOutside(beside, cwd, { lookup: () => ({ ok: true, root: null, reason: 'not a repository' }) }), false,
      'no root named: everything is gated, a corpus beside included')
    assert.equal(scratchOutside(record, cwd, { lookup: () => ({ ok: true, root: project }) }), false, 'the repository owns it')
    assert.equal(scratchOutside(beside, cwd, { lookup: () => ({ ok: true, root: project }) }), true, 'a corpus beside it is scratch')
  } finally { remove(project) }
})
