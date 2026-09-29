// ADR-074 T3: what adr-lint treats as a record. Its guard admitted any `(?:adr|spec)[-_]?\d`
// name, so two corpora's reports about records — `docs/evaluations/adr018-chaos.md`,
// `adr002_codex_review_round1_20260707.md` — were linted as records and failed on sections a
// report never has (BACKLOG §320.1). A record is now a file named with the canonical `ADR-<n>`
// token, or one whose content reads as a record: a Status by ADR-074 Decision 1 and a
// `## Context` or `## Decision` heading, lifecycle's content test. The `spec` arm is unchanged.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adrLint = join(repoRoot, 'plugin', 'bin', 'adr-lint')

// Each file, and whether adr-lint lints it as a record.
const FILES = [
  { path: 'docs/evaluations/adr018-chaos.md', text: '# ADR-018 chaos run\n\nWhat the run found.\n\n## Findings\n\n- one\n', record: false },
  { path: '.cursor/docs/adr002_codex_review_round1_20260707.md', text: '# Codex review of ADR-002, round 1\n\n## Findings\n\n- one\n', record: false },
  { path: 'docs/adr/ADR-018-x.md', text: '# ADR-018: X\n\n## Context\n\nx\n', record: true },
  { path: 'docs/adr/adr012-x.md', text: '# ADR-012: X\n\nStatus: Accepted\n\n## Context\n\nx\n', record: true },
  { path: 'docs/adr/BACKLOG.md', text: '# Backlog\n\n## Status\n\nOpen\n\n## Items\n\n- one\n', record: false },
  { path: 'docs/specs/spec-3.md', text: '# Spec 3\n\nWhat it does.\n', record: true },
]

test('a file named adr<digit> without record content is not a record, and a canonical ADR-<n> name still is', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-record-by-name-'))
  try {
    spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
    const wrong = []
    for (const file of FILES) {
      const full = join(repo, file.path)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, file.text)
      // 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
      const run = spawnSync('python3', [adrLint, full], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
      assert.ok([0, 1, 2].includes(run.status), `adr-lint could not run on ${file.path}: ${run.stdout}\n${run.stderr}`)
      const notRecognised = run.status === 2 && /^not-recognised: /m.test(run.stdout)
      // A file adr-lint does read gets a verdict line; one it does not gets only the not-recognised line.
      const linted = /^\[(PASS|FAIL)\] /m.test(run.stdout)
      if (notRecognised === file.record || linted !== file.record) wrong.push(`${file.path}: exit ${run.status}, ${notRecognised ? 'not-recognised' : linted ? 'linted' : 'neither'}, expected ${file.record ? 'linted' : 'not-recognised'}`)
    }
    assert.deepEqual(wrong, [])
  } finally {
    rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
