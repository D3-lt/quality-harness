// From a Windows corpus-chaos run of v3.8.9 over public/go-sdk-adr (2026-10-06): a pending record with no
// tasks directory and no paths in its ## Implementation had its listing of git-tracked files reassigned to
// None. Then it was told "cross-record dependency cycles were NOT checked: this corpus could not be listed
// from git", though git was never asked; and its Enforced-by pointer resolved to a git-IGNORED file on disk
// (CLAUDE.md §8). The Accepted twin of the same record was read correctly; it is the control.
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

const record = (n, status) => `# ADR-00${n}: X\n\n## Status\n\n${status}\n\n**Enforced-by:** \`test_guard.py::test_x\`\n\n`
  + '## Context\n\nx\n\n## Decision\n\nx\n\n## Alternatives Considered\n\n- none other\n\n## Consequences\n\nx\n'

function lint(n) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-pending-tracked-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  const git = (...a) => assert.equal(spawnSync('git', a, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0, a.join(' '))
  git('init', '-q')
  writeFileSync(join(repo, '.gitignore'), 'ignored/\n')
  mkdirSync(join(repo, 'ignored', 'deep'), { recursive: true })
  writeFileSync(join(repo, 'ignored', 'deep', 'test_guard.py'), 'def test_x():\n    assert True\n')
  mkdirSync(join(repo, 'docs', 'adr'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-x.md'), record(1, 'Proposed'))
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-002-x.md'), record(2, 'Accepted'))
  git('add', '-A')
  const r = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', `ADR-00${n}-x.md`)], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  return `${r.stdout}${r.stderr}`
}

test('a pending record is read against git like an accepted one', () => {
  const pending = lint(1)
  assert.doesNotMatch(pending, /could not be listed from git/, pending)
  assert.match(pending, /Enforced-by names `test_guard\.py::test_x`, which is not/, pending)
  // The control: the Accepted twin already said so.
  assert.match(lint(2), /Enforced-by names `test_guard\.py::test_x`, which is not/)
})
