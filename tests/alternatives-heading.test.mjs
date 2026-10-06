// From an outside run over a public corpus (public/swift-adrs, 2026-10-06): every FAIL said
// "Alternatives Considered has no entries" over a record whose `## Rejected Alternatives` held two.
// The heading was named differently, not empty. The finding now says which: a section that is absent
// is named as absent, with the nearest heading it found; an empty one keeps the old sentence.
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

function lint(alternatives) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-alternatives-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  mkdirSync(join(repo, 'docs', 'adr'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-x.md'), `# ADR-001: X\n\n**Status:** Accepted\n\n## Context\n\nx\n\n${alternatives}\n`)
  const r = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', 'ADR-001-x.md')], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  return `${r.stdout}${r.stderr}`
}

test('an Alternatives section under another name is named as absent, with the heading found', () => {
  const said = lint('## Rejected Alternatives\n\n- keep the flag\n- split the service\n')
  assert.match(said, /Alternatives Considered has no entries: the record has no `## Alternatives Considered` section; it has `## Rejected Alternatives`/, said)
  // The control: an empty section keeps the plain sentence, with no clause about a missing one.
  const empty = lint('## Alternatives Considered\n\n')
  assert.match(empty, /Alternatives Considered has no entries$/m, empty)
})
