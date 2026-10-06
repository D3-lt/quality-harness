// BACKLOG §351 item 23.4, reproduced again on Windows (a corpus-chaos run of v3.8.9): a Verification Log row
// dated 2026-02-30, 2026-02-31 or 2099-01-01 linted PASS, and adr-next counted its task done. The grammar
// checked the shape YYYY-MM-DD and never that it was a calendar date, or not in the future. adr-verify
// writes today's date, so such a row was not written by it. The control: a real past date is evidence.
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

function corpus(date) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-row-date-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  const tasks = join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: X\n\n**Status:** Accepted\n')
  writeFileSync(join(tasks, 'T1-a.md'), '# Task ADR-001-T1: a\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n'
    + `## Verification Log\n- ${date} · no-git · exit 0 · \`true\` · acceptance-sha256:${digest}\n`)
  spawnSync('git', ['add', '-A'], { cwd: repo, timeout: 30_000, windowsHide: true })
  const next = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-next'), '--all', '--json', tasks], { cwd: tasks, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const lint = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', 'ADR-001-x.md')], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  return { done: (JSON.parse(next.stdout).done ?? []).map(t => t.id), lint: `${lint.stdout}${lint.stderr}` }
}

test('a Verification Log row dated on a day that does not exist, or in the future, is not evidence', () => {
  for (const date of ['2026-02-30', '2026-02-31', '2099-01-01']) {
    const { done, lint } = corpus(date)
    assert.deepEqual(done, [], date)
    assert.match(lint, new RegExp(`Verification Log entry .*${date}`), lint)
  }
  // The control: a real past date is evidence, and nothing names it.
  const ok = corpus('2026-08-26')
  assert.deepEqual(ok.done, ['T1'])
  assert.doesNotMatch(ok.lint, /does not exist|after today/, ok.lint)
})
