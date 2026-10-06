// From an outside run over a public corpus (public/swift-adrs, 2026-10-06): 32 of 61 records came
// back "not-recognised" with no reason in the probe's report, and adr-lint's own sentence was the same
// for every file. Half the corpus was hidden behind one word. adr-lint now says what THIS file lacks,
// naming a YAML `status:` it does not read, and the probe carries that reason as it carries a FAIL's.
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

function corpus() {
  const repo = mkdtempSync(join(tmpdir(), 'qh-not-recognised-'))
  temps.push(repo)
  // Git runs only in a directory this file made (CLAUDE.md §9).
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true }).status, 0)
  mkdirSync(join(repo, 'docs', 'decisions'), { recursive: true })
  writeFileSync(join(repo, 'docs', 'decisions', '026-invert-the-prompt.md'),
    '---\nstatus: active\nsupersedes: []\n---\n\n# Invert the prompt\n\nWe invert it, because the model reads the tail.\n')
  spawnSync('git', ['add', '-A'], { cwd: repo, timeout: 30_000, windowsHide: true })
  return repo
}

test('a not-recognised file is told what it lacks, and the probe carries the reason', () => {
  const repo = corpus()
  const lint = spawnSync('python3', [join(repoRoot, 'plugin', 'bin', 'adr-lint'), join('docs', 'decisions', '026-invert-the-prompt.md')],
    { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(lint.status, 2, lint.stdout)
  assert.match(lint.stdout, /This file: .*no `## Context` or `## Decision` heading/, lint.stdout)
  assert.match(lint.stdout, /its Status `active` is not a status any reader acts on/, lint.stdout)
  const probe = spawnSync(process.execPath, [join(repoRoot, 'plugin', 'scripts', 'corpus-probe.mjs'), '--json'],
    { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  const row = (JSON.parse(probe.stdout).adrLint ?? []).find(r => /026-invert/.test(r.file))
  assert.equal(row?.verdict, 'not-recognised', probe.stdout)
  assert.match(row?.reason ?? '', /This file: /, JSON.stringify(row))
})
