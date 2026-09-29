// ADR-074 T2: a record that keeps its Status in a `## Status` section is read by every reader,
// the same way. lifecycle read the section (any heading level, fences ignored) while adr-next
// and adr-lint read only an inline line, so a record from a corpus that writes
// `## Status\n\nAccepted` governed in one reader and had no Status in the others
// (the PHP/Laravel corpus, BACKLOG §320). The section is level 2 and outside a code fence, as
// record.py's `sections_of` finds one; its first non-empty line is the value, with T1's markup
// and kind rules; and an inline line wins over it, with advice when the two disagree.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { adrCorpus } from '../plugin/scripts/lifecycle.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
// 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
const run = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
const FENCE = '```'

// Each row: the record's Status part, whether it governs, and what adr-lint says about it.
const ROWS = [
  { name: 'a section only', body: '## Status\n\n_Accepted_\n', governs: true, lint: 'quiet' },
  { name: 'a line and a section that agree', body: '**Status:** Accepted\n\n## Status\n\nAccepted\n', governs: true, lint: 'quiet' },
  { name: 'a line and a section that disagree', body: '**Status:** Accepted\n\n## Status\n\nProposed\n', governs: true, lint: 'conflict' },
  { name: 'a section inside a code fence', body: `${FENCE}markdown\n## Status\n\nAccepted\n${FENCE}\n`, governs: false, lint: 'missing' },
  { name: 'a level-3 heading', body: '### Status\n\nAccepted\n', governs: false, lint: 'missing' },
  { name: 'neither', body: '', governs: false, lint: 'missing' },
]

const corpus = () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-status-section-'))
  spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
  const cases = ROWS.map((row, i) => {
    const number = String(i + 1).padStart(3, '0')
    const stem = `ADR-${number}-section`
    const dir = join(repo, 'docs', 'adr')
    const tasks = join(dir, stem, 'tasks')
    mkdirSync(tasks, { recursive: true })
    writeFileSync(join(dir, `${stem}.md`), `# ADR-${number}: section\n\n${row.body}\n## Context\n\nx\n\n## Decision\n\nx\n`)
    writeFileSync(join(tasks, 'README.md'), `# ADR-${number} Tasks\n\n| Task | File | Status |\n|------|------|--------|\n| T1 | [T1-t.md](T1-t.md) | pending |\n`)
    writeFileSync(join(tasks, 'T1-t.md'), `# Task ADR-${number}-T1: do\n\n**Depends-on:** none\n**Consumes:** none\n**Produces:** none\n\n## Acceptance\n\n${FENCE}bash\nprintf T1\n${FENCE}\n\n## Verification Log\n`)
    return { row, id: `ADR-${number}`, record: join(dir, `${stem}.md`), tasks }
  })
  return { repo, cases }
}

test('a Status section is read, and an inline Status wins with advice when they disagree', () => {
  const { repo, cases } = corpus()
  try {
    const disagreements = []
    const differ = (c, reader, got, want) => {
      if (got !== want) disagreements.push(`${reader} on ${c.row.name} (${c.id}): ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
    }
    const records = adrCorpus(repo)
    for (const c of cases) {
      const entry = records.find(record => record.file === c.record)
      differ(c, 'lifecycle adrCorpus', entry?.kind === 'governing', c.row.governs)
    }
    for (const c of cases) {
      const next = run('python3', [join(bin, 'adr-next'), c.tasks, '--json'], repo)
      assert.ok(next.status === 0 || next.status === 3, `adr-next could not run: ${next.stdout}\n${next.stderr}`)
      differ(c, 'adr-next --json', JSON.parse(next.stdout).undecided === false, c.row.governs)
    }
    for (const c of cases) {
      const lint = run('python3', [join(bin, 'adr-lint'), c.record], repo)
      assert.ok(lint.status === 0 || lint.status === 1, `adr-lint could not run: ${lint.stdout}\n${lint.stderr}`)
      const out = lint.stdout
      const said = /its ## Status section says/.test(out) ? 'conflict'
        : /no \*\*Status:\*\* line|line is empty|starts with no status adr-lint recognises/.test(out) ? 'missing' : 'quiet'
      differ(c, 'adr-lint', said, c.row.lint)
    }
    assert.deepEqual(disagreements, [])
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
