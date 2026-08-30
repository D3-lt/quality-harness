// arch-lint carried two mutations across 403 lines, and a measurement showed why
// that number mattered: SIX of its nine finding sites survived being disabled
// entirely. Nothing in the suite asserted that they fire at all, so the gate could
// have silently stopped checking a document's Status, its Gate command, its
// missing sections, an empty Module Map, a section with no rows, or a check cell
// with no command — and every test stayed green.
//
// Each test below drives the real binary on a document that differs from a
// conforming one in exactly one way, and each carries the must-fail direction:
// the conforming document must NOT draw the same finding, or an assertion that a
// message appears is satisfied by a gate that always prints it.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const gate = join(repoRoot, 'plugin', 'bin', 'arch-lint')
const conforming = readFileSync(join(testDir, 'fixtures', 'ok', 'architecture.md'), 'utf8')

const temps = []
test.after(() => { for (const t of temps) rmSync(t, { recursive: true, force: true }) })

// Spawned through the interpreter: the gates are `#!/usr/bin/env python3` and
// Windows cannot exec them (CLAUDE.md §7).
function lint(doc) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-arch-')); temps.push(dir)
  const file = join(dir, 'architecture.md')
  writeFileSync(file, doc)
  const r = spawnSync('python3', [gate, file], { encoding: 'utf8', cwd: dir })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}

// The positive control, asserted ONCE rather than per-test: if the conforming
// fixture drew findings, every "the broken one is reported" assertion below would
// be satisfied by a gate that reports everything.
test('the conforming fixture draws none of the findings under test', () => {
  const clean = lint(conforming)
  for (const pattern of [/no \*\*Status:\*\*/, /no \*\*Gate command:\*\*/, /missing section/,
    /Module Map has no data rows/, /no data rows and no/, /no backticked command/]) {
    assert.doesNotMatch(clean, pattern, `the fixture must be clean: ${clean}`)
  }
})

test('arch-lint reports a document with no Status line', () => {
  assert.match(lint(conforming.replace(/^\*\*Status:\*\*.*$/m, '')), /no \*\*Status:\*\*/)
})

test('arch-lint reports a document with no Gate command', () => {
  assert.match(lint(conforming.replace(/^\*\*Gate command:\*\*.*$/m, '')),
    /no \*\*Gate command:\*\*/)
})

test('arch-lint reports a missing section by name', () => {
  const without = conforming.replace(/## Composition Root\n\nNone — fixture constructs nothing\.\n/, '')
  assert.notEqual(without, conforming, 'the section must actually be removed')
  assert.match(lint(without), /missing section ## Composition Root/)
})

test('arch-lint reports a Module Map with no data rows', () => {
  // The heading stays; only the backticked rows go. A Module Map that is present
  // and empty is the case — an ABSENT one is the missing-section finding above.
  const emptied = conforming.replace(/\| `ADR-001-selftest\.md`[^\n]*\n\| `tasks`[^\n]*\n/, '')
  assert.notEqual(emptied, conforming, 'the rows must actually be removed')
  assert.match(lint(emptied), /Module Map has no data rows/)
})

test('arch-lint reports a rule section with neither rows nor a None escape', () => {
  // Prose that is not `None — <reason>` and not a table: the escape hatch must be
  // the documented one, or "we thought about it" passes as an answer.
  const prose = conforming.replace('None — fixture has no import graph.',
    'We have not written these down yet.')
  assert.notEqual(prose, conforming)
  assert.match(lint(prose), /Dependency Contracts: no data rows and no/)
})

test('arch-lint reports a check cell naming no command', () => {
  const table = ['## Dependency Contracts', '',
    '| Rule | Check |', '|------|-------|',
    '| the domain layer imports no adapter | someone looks at it during review |', ''].join('\n')
  const withTable = conforming.replace(
    '## Dependency Contracts\n\nNone — fixture has no import graph.\n', table)
  assert.notEqual(withTable, conforming)
  const out = lint(withTable)
  // Either finding is correct for this row and both are the same defect — a rule
  // whose "check" is a person remembering. Asserting the disjunction rather than
  // one spelling keeps the test about the behaviour, not the wording.
  assert.match(out, /no backticked command|sync-prose/,
    `a check cell naming no runnable check must be reported: ${out}`)
})
