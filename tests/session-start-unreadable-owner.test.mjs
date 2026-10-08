// BACKLOG §355, a Windows corpus-chaos run of v3.8.9: SessionStart counted a task directory "fully
// evidenced" while adr-next said it could not read the record that owns it, and named no record. Such a
// directory is now UNPROVEN, with adr-next's reason. The control: a readable record keeps the count.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const digest = createHash('sha256').update('true', 'utf8').digest('hex')

function sessionStart(recordText) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-ss-owner-'))
  temps.push(repo)
  const tasks = join(repo, 'docs', 'adr', 'ADR-004-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-004-x.md'), recordText)
  writeFileSync(join(tasks, 'T1-a.md'), '# Task ADR-004-T1: a\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n'
    + `## Verification Log\n- 2026-08-26 · no-git · exit 0 · \`true\` · acceptance-sha256:${digest}\n`)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const payload = JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'x', cwd: repo })
  const run = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs'), 'SessionStart'],
    { input: payload, cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout).hookSpecificOutput.additionalContext
}

const record = tail => `# ADR-004: X\n\n**Status:** Accepted\n\n## Context\n\nWhy.${tail}\n`

test('a task directory whose record could not be read is UNPROVEN, not fully evidenced', () => {
  const said = sessionStart(record('\u0000\u0000'))
  assert.match(said, /docs\/adr\/ADR-004-x\/tasks: UNPROVEN — adr-next could not read the record that owns these tasks/, said)
  assert.match(said, /NUL byte/, said)
  assert.doesNotMatch(said, /fully evidenced/, said)
  // The control: the same directory under a readable record is counted, not named.
  const whole = sessionStart(record(''))
  assert.match(whole, /\(1 task directory read is fully evidenced, not shown\)/, whole)
  assert.doesNotMatch(whole, /could not read the record/, whole)
})
