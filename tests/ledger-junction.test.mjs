// BACKLOG §445: the ADR-117 ledger guard decides containment on canonicalFile, which must follow a directory link the way
// event-log.mjs's canonical (realpathSync.native) does. On Windows a junction is that link, and filepath.EvalSymlinks has not
// followed one since Go 1.23, so a write through a junction into the state directory read as a write elsewhere. The other
// guard tests skip on Windows (BACKLOG §375: their fixtures run sh checks); this one calls the built core directly, so it runs
// there. symlinkSync's 'junction' type is a plain directory link off Windows, so every platform runs the same rows. Beside the
// write that must be refused stands its twin through a junction to an ordinary directory, which must not be (CLAUDE.md §16).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'
import { sourceCore } from './helpers/source-core.mjs'

// A mutation run keeps a suite binary in QUALITY_HARNESS_QH_BIN; build from this tree instead, as the replay test does.
if (process.env.QUALITY_HARNESS_MUTATION_IN_FLIGHT === '1') delete process.env.QUALITY_HARNESS_QH_BIN

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

test('a write through a junction into the state directory is refused, and one through a junction elsewhere is not', { skip: noGo, timeout: 900_000 }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-ledgerjunction-'))
  t.after(() => remove(scratch))
  const repo = path.join(scratch, 'repo')
  mkdirSync(path.join(repo, 'notes'), { recursive: true })
  const git = spawnSync('git', ['init', '-q', '.'], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(git.status, 0, `git init: ${git.error?.code ?? ''} ${git.stderr}`)
  const state = path.join(repo, '.git', 'quality-harness')
  mkdirSync(state, { recursive: true })
  writeFileSync(path.join(state, 'checks.jsonl'), '')
  symlinkSync(state, path.join(repo, 'into-state'), 'junction')
  symlinkSync(path.join(repo, 'notes'), path.join(repo, 'into-notes'), 'junction')
  const qh = sourceCore()
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: path.join(repoRoot, 'plugin'), CLAUDE_PLUGIN_DATA: path.join(scratch, 'data') }
  delete env.QUALITY_HARNESS_STATE_DIR
  const pre = (tool_name, tool_input, n) => {
    const ran = spawnSync(qh, ['hook', 'PreToolUse'], {
      cwd: repo, env, encoding: 'utf8', timeout: 60_000, windowsHide: true,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input, cwd: repo, session_id: `junction-${n}` }),
    })
    assert.equal(ran.status, 0, `qh hook PreToolUse: ${ran.error?.code ?? ''} ${ran.stderr}`)
    return ran.stdout.trim() ? JSON.parse(ran.stdout).hookSpecificOutput ?? {} : {}
  }
  const refused = [
    ['Write', { file_path: path.join(repo, 'into-state', 'checks.jsonl'), content: '{}\n' }],
    ['Edit', { file_path: path.join(repo, 'into-state', 'checks.jsonl'), old_string: '', new_string: '{}' }],
    ['Write', { file_path: path.join(repo, 'into-state', 'receipts.jsonl'), content: '{}\n' }],
  ]
  for (const [n, [tool, input]] of refused.entries()) {
    const answer = pre(tool, input, n)
    assert.equal(answer.permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} is refused: ${JSON.stringify(answer)}`)
    assert.match(answer.permissionDecisionReason, /ledger guard/)
  }
  const passed = [
    ['Write', { file_path: path.join(repo, 'into-notes', 'checks.jsonl'), content: '{}\n' }],
    ['Write', { file_path: path.join(repo, 'notes', 'a.md'), content: 'x\n' }],
  ]
  for (const [n, [tool, input]] of passed.entries()) {
    assert.notEqual(pre(tool, input, `pass-${n}`).permissionDecision, 'deny', `${tool} ${JSON.stringify(input)} passes`)
  }
})
