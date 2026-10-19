// The owning-ADR search of a task file stopped nowhere: with no record beside the task's directory it widened one directory up,
// which for a repository's top-level `docs/` is outside the repository. A record another session left in the shared temp
// directory then owned a fixture's task (found 2026-10-19, when a peer drafted `$TMPDIR/adr163.md` and tests/gates.test.mjs went
// red). The search never leaves the repository; inside it, widening one directory still finds an owner.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin')
const skip = process.platform === 'win32' && 'the dispatcher runs under bash, as tests/gates.test.mjs drives it'
const RECORD = ['# ADR-163: A stray', '**Status:** Proposed', '## Existing Primitives Audit', 'x', '## Decision', 'x',
  '## Alternatives Considered', '- x', '## Consequences', 'x', ''].join('\n\n')
const TASK = '<!--\na note\n-->\n\n# Task ADR-001-T1: parse seconds\n\n**Depends-on:** none\n'

test('the owning-ADR search stops at the repository root', { skip }, t => {
  const outer = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'qh-owner-root-')))
  t.after(() => rmSync(outer, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  // A record outside the repository, where the shared temp directory would hold another session's draft.
  writeFileSync(path.join(outer, 'adr163.md'), RECORD)
  const repo = path.join(outer, 'repo')
  mkdirSync(path.join(repo, 'docs'), { recursive: true })
  spawnSync('git', ['init', '-q', '.'], { cwd: repo, timeout: 60_000, windowsHide: true })
  const said = file => {
    const r = spawnSync('bash', [path.join(plugin, 'scripts', 'facts-gate-dispatch.sh'), file], {
      cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: repo, CLAUDE_PLUGIN_ROOT: plugin },
    })
    return `${r.stdout}${r.stderr}`
  }
  writeFileSync(path.join(repo, 'docs', 'task.md'), TASK)
  const outside = said(path.join(repo, 'docs', 'task.md'))
  assert.doesNotMatch(outside, /adr163/, 'a record outside the repository is not the task\'s owner')
  assert.match(outside, /ADR ownership/, outside)
  // The twin: one directory up from a nested folder, inside the repository, the owner is still found.
  mkdirSync(path.join(repo, 'docs', 'sub'), { recursive: true })
  writeFileSync(path.join(repo, 'docs', 'sub', 'task.md'), TASK)
  writeFileSync(path.join(repo, 'ADR-001-x.md'), RECORD.replace('ADR-163: A stray', 'ADR-001: The owner'))
  assert.doesNotMatch(said(path.join(repo, 'docs', 'sub', 'task.md')), /ADR ownership/, 'the owner one directory up, inside the repository')
})
