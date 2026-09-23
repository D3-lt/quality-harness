// adr-state names a record by what it has, never by `ADR-00?`.
//
// ADR-063 gave a record an id — its `ADR-N`, or a dated stem — and adr-state
// reads that first. A record with neither, found by its content under `adr/`
// with a bare slug for a name, fell through to `ADR-${number ?? '?'}` and was
// printed as `ADR-00?`: a label that looks like a record number and is not one
// (peer report from an infrastructure corpus, 2026-09-23). It is named by its
// file now, and the two records that DO have a number or a stem are the controls.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const adrState = path.join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs')
const scratch = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-state-label-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const RECORD = title => `# ${title}\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\ny\n`

test('a record with neither a number nor a dated stem is named by its file, not ADR-00?', () => {
  const root = path.join(scratch, 'repo')
  mkdirSync(path.join(root, 'docs', 'adr'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'use-postgres.md'), RECORD('Use Postgres'))
  // The controls: a numbered record and a dated stem keep the ids ADR-063 gives them.
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-007-numbered.md'), RECORD('ADR-007: numbered'))
  writeFileSync(path.join(root, 'docs', 'adr', '2026-09-01-dated.md'), RECORD('Dated'))
  const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root, encoding: 'utf8', timeout: 15_000 })
  assert.equal(init.status ?? 0, 0, init.stderr)
  const run = spawnSync(process.execPath, [adrState], { cwd: root, encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /\buse-postgres\b/, `the slug names the record:\n${run.stdout}`)
  assert.doesNotMatch(run.stdout, /ADR-00\?/, `a question mark is not a record number:\n${run.stdout}`)
  assert.match(run.stdout, /ADR-007/, 'the numbered record keeps its number')
  assert.match(run.stdout, /2026-09-01-dated/, 'the dated record keeps its stem')
})
