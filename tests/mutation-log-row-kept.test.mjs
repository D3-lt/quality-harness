// From a Windows corpus-chaos run of v3.8.9 (a 209-task corpus): on a CLEAN tree adr-lint advised "T11 had
// an acceptance entry that the committed file still holds and this file no longer has … re-run adr-verify",
// twice, in an order that flipped between runs. The rows were `· human-observed · mutant killed · …` rows
// in the Mutation Log: still in the file, but compared only against the Verification Log. Following that
// advice would be wrong. The control: a Verification Log row that WAS removed is still named.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const digest = createHash('sha256').update('true', 'utf8').digest('hex')
const EXIT0 = `- 2026-08-26 · no-git · exit 0 · \`true\` · acceptance-sha256:${digest}`
const HUMAN_MUTANT = '- 2026-08-26 · human-observed · mutant killed · test exit 1 · `a.py` · line 3 · from `x` · to `y` · test `test_guard` · the guard is gone'

function corpus() {
  const repo = mkdtempSync(join(tmpdir(), 'qh-mlog-kept-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  const git = (...a) => assert.equal(spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e.invalid', ...a], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0, a.join(' '))
  git('init', '-q')
  const tasks = join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: X\n\n**Status:** Accepted\n\n## Context\n\nx\n')
  writeFileSync(join(tasks, 'README.md'), '# Tasks\n\n| Task | Status |\n|---|---|\n| T1 | done |\n')
  const task = join(tasks, 'T1-a.md')
  writeFileSync(task, '# Task ADR-001-T1: a\n\n**Depends-on:** none\n\n## Acceptance\n\n```bash\ntrue\n```\n\n'
    + `## Verification Log\n${EXIT0}\n\n## Mutation Log\n${HUMAN_MUTANT}\n`)
  git('add', '-A'); git('commit', '-qm', 'x')
  const lint = () => {
    const r = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', 'ADR-001-x.md')], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    return `${r.stdout}${r.stderr}`
  }
  return { task, lint }
}

test('a Mutation Log row still in the file is not reported as removed, and a removed row still is', () => {
  const { task, lint } = corpus()
  const clean = lint()
  assert.doesNotMatch(clean, /no longer has/, clean)
  // The control: take the exit-0 row out of the Verification Log, and the removal is named.
  writeFileSync(task, readFileSync(task, 'utf8').replace(`${EXIT0}\n`, ''))
  assert.match(lint(), /no longer has — `- 2026-08-26 · no-git · exit 0/)
})
