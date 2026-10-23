// ADR-127 and ADR-128 were each Accepted without a row in the active catalog, and only the full check at release time
// (corpus-lint's adr-retire-check) caught it, both on 2026-10-23. adr-lint now says so where the record is linted, as advice.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gate = path.join(repoRoot, 'plugin', 'bin', 'adr-lint')

test('an Accepted record the catalog beside it does not link is advised, and nothing else is', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-catalog-link-'))
  t.after(() => remove(dir))
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', 'commit', '-qm', 'fixture']]) {
    spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  }
  const record = path.join(dir, 'ADR-001-selftest.md')
  const lint = () => spawnSync('python3', [gate, record], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  const said = run => `${run.stdout}${run.stderr}`
  const advised = /does not link it; add its row/
  const catalog = text => writeFileSync(path.join(dir, 'README.md'), text)

  catalog('| ADR | Title |\n|---|---|\n| [ADR-099](ADR-099-other.md) | another |\n')
  assert.match(said(lint()), advised, 'an Accepted record the catalog leaves out is advised')
  // DIRTY twins, each silent: the catalog links it (both spellings), a README that links no record is no catalog, and a
  // Proposed record is not yet governing.
  catalog('| [ADR-099](ADR-099-other.md) | another |\n| [ADR-001](ADR-001-selftest.md) | this |\n')
  assert.doesNotMatch(said(lint()), advised)
  catalog('| [ADR-001](./ADR-001-selftest.md) | this |\n')
  assert.doesNotMatch(said(lint()), advised)
  catalog('# Notes\n\nNothing here links a record.\n')
  assert.doesNotMatch(said(lint()), advised)
  // The Codex review of d21fa2cc: a link with a fragment, or by a path through the parent, links the record; a record named
  // in prose is a reference, so a README holding only that is no catalog.
  catalog('| [ADR-099](ADR-099-other.md) | another |\n| [ADR-001](ADR-001-selftest.md#decision) | this |\n')
  assert.doesNotMatch(said(lint()), advised)
  catalog(`| [ADR-099](ADR-099-other.md) | another |\n| [ADR-001](../${path.basename(dir)}/ADR-001-selftest.md) | this |\n`)
  assert.doesNotMatch(said(lint()), advised)
  catalog('# Reading notes\n\nFor the earlier design, see [Other](ADR-099-other.md).\n')
  assert.doesNotMatch(said(lint()), advised)
  catalog('| [ADR-099](ADR-099-other.md) | another |\n')
  writeFileSync(record, readFileSync(record, 'utf8').replace('**Status:** Accepted', '**Status:** Proposed'))
  assert.doesNotMatch(said(lint()), advised)
  // It advises, never blocks: the same record exits the same with the finding as without it.
  writeFileSync(record, readFileSync(record, 'utf8').replace('**Status:** Proposed', '**Status:** Accepted'))
  const unlinked = lint()
  catalog('| [ADR-001](ADR-001-selftest.md) | this |\n')
  assert.equal(unlinked.status, lint().status, said(unlinked))
  assert.match(said(unlinked), advised)
})
