// BACKLOG §385: adr-lint passed a tasks README whose index had lost its separator row and listed a task twice (found 2026-10-19,
// when a write meant for a task's row replaced the separator). Both are now said as advice; a well-formed index says neither.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const lint = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'bin', 'adr-lint')
const HEADER = '| ID | Title | Status | Covers | Acceptance |'
const SEPARATOR = '|----|-------|--------|--------|------------|'
const row = status => `| T1 | watch it | ${status} | — | human-observed |`

function said(t, index) {
  const repo = mkdtempSync(path.join(tmpdir(), 'qh-readme-shape-'))
  t.after(() => rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  spawnSync('git', ['init', '-q', repo], { timeout: 30_000, windowsHide: true })
  const tasks = path.join(repo, 'docs', 'adr', 'ADR-003-x', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(path.join(repo, 'docs', 'adr', 'ADR-003-x.md'), '# ADR-003: X\n\n**Status:** Accepted\n')
  writeFileSync(path.join(tasks, 'T1-watch.md'), '# Task ADR-003-T1: watch it\n\n**Depends-on:** none\n\n## Acceptance\n\nAcceptance is human-observed: a person watches it run.\n\n## Verification Log\n')
  writeFileSync(path.join(tasks, 'README.md'), `# Tasks\n\n${index.join('\n')}\n`)
  const run = spawnSync('python3', [lint, path.join(repo, 'docs', 'adr', 'ADR-003-x.md')], { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  return `${run.stdout}${run.stderr}`
}

test('a tasks index with no separator row, or a task listed twice, is said', t => {
  const broken = said(t, [HEADER, row('pending'), row('pending')])
  assert.match(broken, /no separator row/, broken)
  assert.match(broken, /T1 is listed twice in one table/, broken)
  const twice = said(t, [HEADER, SEPARATOR, row('pending'), row('pending')])
  assert.doesNotMatch(twice, /no separator row/, 'a table with its separator')
  assert.match(twice, /T1 is listed twice in one table/)
  const whole = said(t, [HEADER, SEPARATOR, row('pending')])
  assert.doesNotMatch(whole, /no separator row|listed twice/, 'the twin: a well-formed index says neither')
  // The same task in two tables, an order and an index, is one listing in each.
  const both = said(t, ['| Wave | Task | Depends-on |', '|------|------|------------|', '| 1 | T1 | none |', '', HEADER, SEPARATOR, row('pending')])
  assert.doesNotMatch(both, /listed twice/, 'one task in two tables')
  // A contract table lists a producer once per contract: that is not an index, and its repeats are not said.
  const contracts = said(t, [HEADER, SEPARATOR, row('pending'), '', '| Producer | Contract | Consumer(s) | Ordering note |', '|----------|----------|-------------|---------------|', '| T1 | a | none | — |', '| T1 | b | none | — |'])
  assert.doesNotMatch(contracts, /listed twice/, 'a producer named once per contract')
  // The Codex review of f79c600d: GFM reads a table without outer pipes too, and its header with no separator is no row to the
  // shared parser, so a broken index written that way said nothing.
  const bare = said(t, ['ID | Title | Status', 'T1 | one | pending', 'T1 | one | done'])
  assert.match(bare, /no separator row/, bare)
  assert.match(bare, /T1 is listed twice in one table/, bare)
  // The Codex review of aae06d72: tables with no blank line between them are separate tables, as record.py reads them.
  const order = ['| Wave | Task | Depends-on |', '|------|------|------------|', '| 1 | T1 | none |']
  const adjacentTwice = said(t, [...order, HEADER, SEPARATOR, row('pending'), row('done')])
  assert.match(adjacentTwice, /T1 is listed twice in one table/, 'an index right under an order table is still read')
  const adjacentOnce = said(t, [HEADER, SEPARATOR, row('pending'), HEADER, SEPARATOR, row('pending')])
  assert.doesNotMatch(adjacentOnce, /listed twice/, 'two adjacent tables listing T1 once each')
})
