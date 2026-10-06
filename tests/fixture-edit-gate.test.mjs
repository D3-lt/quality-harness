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

// BACKLOG §291 (an inbox from ts-generator): rendered golden output kept under `tests/golden-*`
// carried `docs/specs/*.md`, and every commit touching it ran `spec-verify --draft` over them as the
// repository's own specs. `golden`, `golden-*` and `golden_*` are excluded since 3.8.7, and the skip is
// judged from the PAYLOAD's cwd — here the hook process runs from another directory, which the report
// suspected might decide it.
test('a spec under a golden fixture tree is not gated, judged from the payload cwd, and a real spec still is', () => {
  const root = path.join(scratch, 'golden')
  mkdirSync(path.join(root, 'tests', 'golden-founder', 'docs', 'specs'), { recursive: true })
  mkdirSync(path.join(root, 'docs', 'specs'), { recursive: true })
  const init = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root, encoding: 'utf8', timeout: 15_000 })
  assert.equal(init.status ?? 0, 0, init.stderr)
  const SPEC = '# Spec: rendered\n\n**Status:** Draft\n'
  const golden = path.join(root, 'tests', 'golden-founder', 'docs', 'specs', '2026-09-24-rendered.md')
  const real = path.join(root, 'docs', 'specs', '2026-09-24-rendered.md')
  writeFileSync(golden, SPEC)
  writeFileSync(real, SPEC)
  const elsewhere = path.join(scratch, 'elsewhere')
  mkdirSync(elsewhere, { recursive: true })
  const gate = file => spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh'], {
    cwd: elsewhere, encoding: 'utf8', timeout: 120_000,
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', session_id: 'golden-edit', cwd: root, tool_input: { file_path: file } }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: path.join(scratch, 'data'), TMPDIR: scratch, TMP: scratch, TEMP: scratch },
  })
  const skipped = gate(golden)
  assert.equal(skipped.status, 0, skipped.stderr)
  assert.equal(`${skipped.stdout}${skipped.stderr}`.trim(), '', `a golden spec draws nothing from the gate:\n${skipped.stdout}${skipped.stderr}`)
  const gated = gate(real)
  assert.match(`${gated.stdout}${gated.stderr}`, /spec-verify/, `the real spec is still gated:\n${gated.stdout}${gated.stderr}`)
})
