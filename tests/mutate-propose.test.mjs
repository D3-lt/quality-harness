import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  catalogueEntries, coverageOf, descriptionClauses, documentedFlags, main, proposals, report,
  scalar,
} from '../scripts/mutate-propose.mjs'

/** A small tree shaped like a plugin, so the proposer is measured on structure. */
function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'propose-'))
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(root, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return root
}

const SKILL = (description, body = 'Body.\n') =>
  `---\nname: demo\ndescription: ${description}\n---\n\n# Demo\n\n${body}`

test('a description splits into independently checkable routing claims', () => {
  const clauses = descriptionClauses(
    'Do the thing. Use when the user asks to mark a task done, tick off a task, '
    + 'or wants a second opinion; do not use for implementation work',
  )
  assert.ok(clauses.includes('tick off a task'), JSON.stringify(clauses))
  assert.ok(clauses.includes('wants a second opinion'))
  assert.ok(clauses.includes('do not use for implementation work'))
  // A leading conjunction is the author's punctuation, not part of the claim —
  // keeping it would produce a string that never matches the file it came from.
  assert.ok(!clauses.some(clause => /^(or|and|then)\b/i.test(clause)), JSON.stringify(clauses))
})

test('a clause too short or too long to identify one place is not proposed', () => {
  const clauses = descriptionClauses(`Use it, now, ${'x'.repeat(200)}, when asked to do a thing`)
  assert.ok(!clauses.includes('now'), 'a three-character clause matches everything')
  assert.ok(!clauses.some(clause => clause.length > 140), 'a whole paragraph is not a claim')
  assert.ok(clauses.includes('when asked to do a thing'))
})

test('a path or command fragment is not read as a routing claim', () => {
  // Those are contracts, but the tool and flag detectors own them; proposing the
  // same string twice would put two entries on one line of one file.
  const clauses = descriptionClauses('`/quality-harness:demo` runs it, /usr/bin/env node demo')
  assert.ok(!clauses.some(clause => /^[`/.]/.test(clause)), JSON.stringify(clauses))
})

test('documented long flags are found and shell noise is not', () => {
  const flags = documentedFlags('Run with --apply and --dry-run. Not -x, not --, not a--b.')
  assert.deepEqual(flags.sort(), ['apply', 'dry-run'])
})

test('a folded YAML description is read as one string', () => {
  const description = scalar('name: demo\ndescription: >-\n  first part,\n  second part\n', 'description')
  assert.equal(description, 'first part, second part')
})

test('the catalogue is not counted as coverage', () => {
  // The distinction this whole tool rests on. A catalogue entry records that a
  // mutation EXISTS; whether anything notices it is what the runner answers.
  // Counting it as coverage makes every catalogued string look asserted by
  // itself, which is exactly how mutation 135 stayed invisible.
  assert.equal(coverageOf('tick off a task', ['assert(x)'], '"from": "tick off a task"'), 'catalogued')
  assert.equal(coverageOf('tick off a task', ['names tick off a task'], ''), 'asserted')
  assert.equal(coverageOf('tick off a task', ['assert(x)'], ''), 'unasserted')
})

test('a contract named only by the catalogue is reported, and one a test names is not', () => {
  const root = fixture({
    'bin/demo-gate': '#!/bin/sh\n',
    'skills/demo/SKILL.md': SKILL('Use when the user asks to mark it done, tick off a task, or to audit a run'),
    // The whole clause, because coverage is a substring test on the clause the
    // runner would replace — a test naming half of it asserts a different string.
    'tests/demo.test.mjs': "assert.match(description, /to audit a run/)\n",
    'tests/mutations.json': JSON.stringify({ mutations: [{ from: 'tick off a task' }] }),
  })
  try {
    const found = proposals(root)
    const byString = Object.fromEntries(found.map(entry => [entry.from, entry]))
    assert.equal(byString['tick off a task']?.coverage, 'catalogued')
    assert.equal(byString['to audit a run']?.coverage, 'asserted')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a tool a document names is proposed, and an unshipped word is not', () => {
  const root = fixture({
    'bin/demo-gate': '#!/bin/sh\n',
    'docs/guide.md': 'Run demo-gate over the corpus. Then run notashippedtool.\n',
    'skills/demo/SKILL.md': SKILL('Use when the user wants the demonstration gate run'),
  })
  try {
    const tools = proposals(root).filter(entry => entry.kind === 'named-tool').map(e => e.from)
    assert.deepEqual(tools, ['demo-gate'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a flag no script declares belongs to some other command, not this tree', () => {
  const root = fixture({
    'docs/guide.md': 'Pass --apply to write. Pass --pager to git.\n',
    'scripts/tool.mjs': "if (argv.includes('--apply')) write()\n",
    'skills/demo/SKILL.md': SKILL('Use when the user wants the demonstration gate run'),
  })
  try {
    const flags = proposals(root).filter(entry => entry.kind === 'documented-flag').map(e => e.from)
    assert.deepEqual(flags, ['--apply'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a string the runner could not target uniquely is never proposed', () => {
  // The runner replaces the FIRST match and needs the string to identify one
  // place. A clause repeated in the body would mutate a sentence nobody meant.
  const root = fixture({
    'skills/demo/SKILL.md': SKILL(
      'Use when the user asks to mark it done, tick off a task, or to audit a run',
      'Remember to tick off a task afterwards.\n',
    ),
  })
  try {
    const found = proposals(root).map(entry => entry.from)
    assert.ok(!found.includes('tick off a task'), JSON.stringify(found))
    assert.ok(found.includes('to audit a run'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the tests are scanned for coverage and never proposed against themselves', () => {
  const root = fixture({
    'skills/demo/SKILL.md': SKILL('Use when the user wants a demonstration of the thing'),
    'tests/demo.test.mjs': 'const description = "Use when the user wants something else here"\n',
  })
  try {
    assert.ok(proposals(root).every(entry => !entry.file.startsWith('tests/')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('catalogue output carries the runner schema and none of this tool notes', () => {
  const entries = catalogueEntries([{
    label: 'l', file: 'f', from: 'a', to: 'b', tests: [],
    kind: 'routing-clause', coverage: 'unasserted', absolute: '/tmp/f',
  }])
  assert.deepEqual(Object.keys(entries[0]).sort(), ['file', 'from', 'label', 'tests', 'to'])
})

test('a root given without --tests is the root that gets scanned', () => {
  // `--tests` absent put its value index at 0, so the filter dropped the root
  // argument and the tool scanned the current directory instead. It returned a
  // plausible answer to a question nobody asked, which is the worst failure a
  // read-only tool has available to it.
  const root = fixture({
    'skills/demo/SKILL.md': SKILL('Use when the user wants the uniquely named fixture claim'),
  })
  const written = []
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = chunk => { written.push(String(chunk)); return true }
  try {
    main([root, '--json'])
  } finally {
    process.stdout.write = write
    rmSync(root, { recursive: true, force: true })
  }
  const emitted = JSON.parse(written.join(''))
  assert.ok(emitted.mutations.some(entry => entry.from === 'Use when the user wants the uniquely named fixture claim'),
    written.join(''))
})

test('the report names the three states and stays advisory', () => {
  const text = report([
    { file: 'a.md', from: 'x', kind: 'routing-clause', coverage: 'unasserted' },
    { file: 'b.md', from: 'y', kind: 'named-tool', coverage: 'asserted' },
    { file: 'c.md', from: 'z', kind: 'named-tool', coverage: 'catalogued' },
  ])
  assert.match(text, /1 asserted by a test, 1 catalogued for the runner, 1 neither/)
  // Only the unasserted one is listed by default; the point is the gap.
  assert.match(text, /UNASSERTED\s+a\.md/)
  assert.doesNotMatch(text, /ASSERTED\s+b\.md/)
})

test('this tool reports and never refuses', () => {
  // It reads a repository it does not own. An exit code here would make a
  // project's own gate fail on prose, which is the block this harness removed.
  assert.equal(main(['--json']), 0)
})
