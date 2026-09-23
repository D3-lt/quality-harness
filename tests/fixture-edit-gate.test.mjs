// Editing a record-shaped file under a fixture directory does not run the gates.
//
// The per-edit artifact gate dispatches adr-lint and adr-retire-check over any
// file that looks like a record. While `tests/fixtures/corpora/` was being
// built on 2026-09-23, every edit to a fixture record ran the gates over it and
// reported the fixture's deliberate gaps — an empty Alternatives table, a
// missing catalog row — as failures of THIS repository (BACKLOG §265). The same
// exclusion every corpus reader applies (`uninteresting.mjs`, §263) now applies
// at the hook boundary, and the control below shows the same file, one
// directory over, still reaches the gate.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { relativePathIsUninteresting } from '../plugin/scripts/uninteresting.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(repoRoot, 'plugin', 'scripts', 'run-shell-hook.mjs')
const scratch = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-fixture-edit-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))

const RECORD = '# ADR-001: A record\n\n**Status:** Accepted\n\n## Existing Primitives Audit\n\nNothing.\n\n## Decision\n\nx\n\n## Alternatives Considered\n\n\n## Consequences\n\ny\n'

test('the relative-path form asks the same question as the parts form', () => {
  assert.equal(relativePathIsUninteresting('tests/fixtures/corpora/x/docs/adr/ADR-001.md'), true)
  assert.equal(relativePathIsUninteresting('node_modules/pkg/docs/adr/ADR-001.md'), true)
  assert.equal(relativePathIsUninteresting('docs/adr/ADR-001.md'), false)
  assert.equal(relativePathIsUninteresting('spec/adr/ADR-001.md'), false)
  // A path that leaves the repository is not ours to judge either way.
  assert.equal(relativePathIsUninteresting('../elsewhere/fixtures/ADR-001.md'), false)
})

test('a fixture record is not gated on edit, and the same record under docs/adr still is', () => {
  const root = path.join(scratch, 'repo')
  mkdirSync(path.join(root, 'tests', 'fixtures', 'corpora', 'x', 'docs', 'adr'), { recursive: true })
  mkdirSync(path.join(root, 'docs', 'adr'), { recursive: true })
  const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root, encoding: 'utf8', timeout: 15_000 })
  assert.equal(init.status ?? 0, 0, init.stderr)
  const fixture = path.join(root, 'tests', 'fixtures', 'corpora', 'x', 'docs', 'adr', 'ADR-001-planted.md')
  const real = path.join(root, 'docs', 'adr', 'ADR-001-real.md')
  writeFileSync(fixture, RECORD)
  writeFileSync(real, RECORD)
  const gate = file => spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh'], {
    cwd: root, encoding: 'utf8', timeout: 120_000,
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', session_id: 'fixture-edit', cwd: root, tool_input: { file_path: file } }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(scratch, 'data'), TMPDIR: scratch, TMP: scratch, TEMP: scratch },
  })
  const planted = gate(fixture)
  assert.equal(planted.status, 0, planted.stderr)
  assert.equal(`${planted.stdout}${planted.stderr}`.trim(), '', `a fixture record draws nothing from the gate:\n${planted.stdout}${planted.stderr}`)
  // The control: the identical record where records live is gated, and its
  // empty Alternatives table is a finding.
  const gated = gate(real)
  assert.match(`${gated.stdout}${gated.stderr}`, /Alternatives Considered/, `the real record is still gated:\n${gated.stdout}${gated.stderr}`)
})
