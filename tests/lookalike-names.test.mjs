// BACKLOG §351 item 11 (§295 20.Q6): a record named with a Cyrillic `А`, or with fullwidth digits, and a
// task named `T６`, were counted with no remark, while every reader that compares a name to an id as
// ASCII sees no match. adr-lint now names such a file, as advice, with the ASCII name it reads as. The
// control: an ASCII name says nothing, and the advice never changes the verdict.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })

const record = title => `# ${title}\n\n**Status:** Accepted\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n`
const task = id => `# ${id}: do it\n\n**Depends-on:** none\n\n## Goal\n\nGo.\n\n## Acceptance\n\n\`\`\`bash\ntrue\n\`\`\`\n`

function lint(name, title, taskName = null) {
  const repo = mkdtempSync(join(tmpdir(), 'qh-lookalike-'))
  temps.push(repo)
  const adr = join(repo, 'docs', 'adr')
  mkdirSync(adr, { recursive: true })
  writeFileSync(join(adr, name), record(title))
  if (taskName) {
    const tasks = join(adr, name.replace(/\.md$/, ''), 'tasks')
    mkdirSync(tasks, { recursive: true })
    writeFileSync(join(tasks, taskName), task('T6'))
  }
  // Git runs only in a directory this file made (CLAUDE.md §9).
  for (const args of [['init', '-q'], ['add', '-A']]) {
    assert.equal(spawnSync('git', args, { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  }
  const kept = readdirSync(adr).includes(name)
  const run = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'adr', name)],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  return { kept, status: run.status, out: `${run.stdout}${run.stderr}` }
}

test('a record or task named with look-alike characters is named, as advice, with the name it reads as', t => {
  const cyrillic = lint('АDR-002-b.md', 'ADR-002: B')
  const fullwidth = lint('ADR-００3-c.md', 'ADR-003: C')
  const ascii = lint('ADR-004-d.md', 'ADR-004: D', 'T６-six.md')
  if (!cyrillic.kept || !fullwidth.kept) { t.skip('this filesystem rewrites the name'); return }
  assert.match(cyrillic.out, /advice: АDR-002-b\.md: its name reads as ADR-002-b\.md but holds look-alike characters \(U\+0410\)/, cyrillic.out)
  assert.match(fullwidth.out, /advice: ADR-００3-c\.md: its name reads as ADR-003-c\.md but holds look-alike characters \(U\+FF10\)/, fullwidth.out)
  assert.match(ascii.out, /advice: T６-six\.md: its name reads as T6-six\.md but holds look-alike characters \(U\+FF16\)/, ascii.out)
  // The control: an ASCII record name says nothing, and the advice never changes the verdict.
  const control = lint('ADR-004-d.md', 'ADR-004: D')
  assert.doesNotMatch(ascii.out, /ADR-004-d\.md: its name reads as/, ascii.out)
  assert.doesNotMatch(control.out, /look-alike/, control.out)
  assert.equal(cyrillic.status, control.status, `${cyrillic.out}\n---\n${control.out}`)
})
