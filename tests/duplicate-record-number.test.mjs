// BACKLOG §355, from two Windows corpus-chaos runs of v3.8.9: two records sharing a number were
// counted twice and named by no reader. adr-state now names the pair over the corpus (§309); adr-lint
// says it to the person linting either record, as advice. The control: distinct numbers say nothing.
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

const record = title => `# ${title}\n\n**Status:** Accepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n`

function lint(names) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-dup-number-'))
  temps.push(repo)
  const adr = join(repo, 'docs', 'adr')
  mkdirSync(adr, { recursive: true })
  for (const [name, title] of names) writeFileSync(join(adr, name), record(title))
  // Git runs only in a directory this file made (CLAUDE.md §9).
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  return names.map(([name]) => {
    const run = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', name)],
      { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    return { status: run.status, out: `${run.stdout}${run.stderr}` }
  })
}

test('a record whose number another record carries is named, as advice, from either side', () => {
  const [a, b] = lint([['ADR-005-alpha.md', 'ADR-005: Alpha'], ['ADR-005-beta.md', 'ADR-005: Beta']])
  assert.match(a.out, /advice: ADR-005-alpha\.md: another record in this corpus carries number 5: ADR-005-beta\.md/, a.out)
  assert.match(b.out, /advice: ADR-005-beta\.md: another record in this corpus carries number 5: ADR-005-alpha\.md/, b.out)
  // The control: distinct numbers say nothing, and the advice never changes the verdict.
  const [c] = lint([['ADR-005-alpha.md', 'ADR-005: Alpha'], ['ADR-006-gamma.md', 'ADR-006: Gamma']])
  assert.doesNotMatch(c.out, /carries number/, c.out)
  assert.equal(a.status, c.status, `${a.out}\n---\n${c.out}`)
})
