// BACKLOG §355, from a Windows corpus-chaos run of v3.8.9: a record with two Status lines (Superseded,
// then Accepted) was read as the first by every reader, and nothing said the second was there. adr-lint
// now advises when two label lines give different kinds, and says which one counts. The controls: two
// lines that agree say nothing, and the reading itself is unchanged (still the first).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

function lint(statusLines) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-two-status-'))
  temps.push(repo)
  const adr = join(repo, 'docs', 'adr')
  mkdirSync(adr, { recursive: true })
  writeFileSync(join(adr, 'ADR-007-x.md'),
    `# ADR-007: X\n\n${statusLines.map(value => `**Status:** ${value}`).join('\n\n')}\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n`)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const run = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', 'ADR-007-x.md')],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  return `${run.stdout}${run.stderr}`
}

test('two Status lines that disagree are named, and the first is said to be the one read', () => {
  const out = lint(['Superseded by ADR-009', 'Accepted'])
  assert.match(out, /advice: ADR-007-x\.md: it has 2 \*\*Status:\*\* lines that disagree \(`Superseded by ADR-009`, `Accepted`\); every reader reads the first, `Superseded by ADR-009`/, out)
  // The controls: lines that agree, and a single line, say nothing.
  assert.doesNotMatch(lint(['Accepted', 'Accepted (2026-10-08)']), /lines that disagree/)
  assert.doesNotMatch(lint(['Accepted']), /lines that disagree/)
})

test('status_labels lists every label and record_status still reads the first', () => {
  const probe = 'import json, sys; sys.path.insert(0, sys.argv[1]); from record import record_status, status_labels; '
    + 't = "# X\\n\\n- Status: Draft\\n\\n**Status:** Superseded\\n\\n```\\n**Status:** Proposed\\n```\\n\\nStatus: Accepted\\n"; '
    + 'print(json.dumps([record_status(t), status_labels(t)]))'
  const run = spawnSync('python3', ['-c', probe, join(repoRoot, 'plugin', 'lib')], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  // The fenced example is not a label; the bullet is not a label line; the first label wins.
  assert.deepEqual(JSON.parse(run.stdout), [['Superseded', 'inline'], ['Superseded', 'Accepted']])
})
