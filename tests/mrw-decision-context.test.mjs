// BACKLOG §444: the decision context the PreToolUse hook gives before an edit read only `tool_input.file_path` or
// `notebook_path`, so a write through mrw, which names its paths in a plan (`@@ <path> <address> <op>`), was told nothing about
// the decisions governing them, through the MCP tool and through a shell `mrw write` alike. Driven through the native hook.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { sourceCore } from './helpers/source-core.mjs'

if (process.env.QUALITY_HARNESS_MUTATION_IN_FLIGHT === '1') delete process.env.QUALITY_HARNESS_QH_BIN
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin')

test('an mrw write is told the decisions governing each path its plan names, through the MCP tool and the shell', t => {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-mrw-context-')))
  t.after(() => remove(top))
  const repo = path.join(top, 'repo')
  const files = {
    'docs/adr/ADR-001-sums.md': '# ADR-001: Sums are cents\n\n**Status:** Accepted\n**Governs:** `src/a.js`, `src/b.js`\n\n## Decision\n\nx\n',
    'src/a.js': 'a\n', 'src/b.js': 'b\n', 'src/c.js': 'c\n',
  }
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
    writeFileSync(path.join(repo, rel), text)
  }
  for (const args of [['init', '-q', '.'], ['add', '-A', '.']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true }).status, 0)
  }
  let session = 0
  const context = (tool_name, tool_input) => {
    session += 1
    const ran = spawnSync(sourceCore(), ['hook', 'PreToolUse'], {
      cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: repo, session_id: `mrw-${session}`, tool_name, tool_input }),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: path.join(top, `data-${session}`) },
    })
    assert.equal(ran.status, 0, ran.stderr)
    return ran.stdout.trim() ? JSON.parse(ran.stdout).hookSpecificOutput?.additionalContext ?? '' : ''
  }
  // The control: an Edit of a governed file is told, and one of an ungoverned file is not.
  assert.match(context('Edit', { file_path: path.join(repo, 'src', 'a.js') }), /ADR-001/)
  assert.equal(context('Edit', { file_path: path.join(repo, 'src', 'c.js') }), '')

  assert.match(context('mcp__mrw__mrw_write', { plan: '@@ src/c.js 1 replace\nx\n@@ src/a.js 1 replace\ny\n' }), /ADR-001/, 'the MCP plan')
  assert.equal(context('mcp__mrw__mrw_write', { plan: '@@ src/c.js 1 replace\nx\n' }), '', 'an MCP plan naming nothing governed')
  assert.match(context('Bash', { command: "mrw write --no-check <<'PLAN'\n@@ src/b.js 1 replace\nz\nPLAN" }), /ADR-001/, 'a shell mrw write')
  // A write into another checkout (`-C DIR` or `--root DIR` before the subcommand) names paths under that root, not this one:
  // nothing is said for them, while a `--root` that only appears in the plan's text is no root.
  assert.equal(context('Bash', { command: "mrw -C ../other write <<'PLAN'\n@@ src/b.js 1 replace\nz\nPLAN" }), '', 'mrw -C names another checkout')
  assert.equal(context('Bash', { command: "mrw --root=../other write <<'PLAN'\n@@ src/b.js 1 replace\nz\nPLAN" }), '', 'mrw --root names another checkout')
  assert.match(context('Bash', { command: "mrw write <<'PLAN'\n@@ src/a.js 1 replace\nrun it with --root\nPLAN" }), /ADR-001/, 'a --root in the plan body')
  // A heredoc that is no mrw write names no edit, whatever its lines look like.
  assert.equal(context('Bash', { command: "cat <<'PLAN'\n@@ src/b.js 1 replace\nz\nPLAN" }), '', 'a heredoc that is no mrw write')
  // Past ten paths the rest are not read, and that is said rather than left as silence.
  const many = Array.from({ length: 11 }, (_, n) => `@@ src/n${n}.js 0 create\nx\n`).join('')
  assert.match(context('mcp__mrw__mrw_write', { plan: many }), /read for the first 10 of the 11 paths this write names; the rest were not looked at/)
})
