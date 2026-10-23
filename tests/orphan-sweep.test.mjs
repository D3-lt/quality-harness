// BACKLOG §99 — a function the plugin defines that nothing shipped calls.
//
// The falsifiability half of this file is not decoration. The first version of
// this sweep counted uses across EVERY tracked file and reported clean at the
// commit that shipped the defect, because the orphan is referenced three times in
// tests/. A sweep that reports 0 at HEAD and 0 where a known defect lives is
// measuring nothing, and it looks exactly like a sweep that works.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { orphanDefinitions, SHIPPED, sweep } from '../scripts/orphan-sweep.mjs'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const git = (...args) => execFileSync('git', args, {
  cwd: repoRoot, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60_000,
})

function shippedAt(rev) {
  // A shallow clone does not have the historical commits this file's
  // falsifiability proof runs over, and `git ls-tree` fails with a bare
  // `fatal: Not a valid object name`. Say which knob fixes it rather than
  // letting the raw git error stand, and FAIL rather than skip — a proof that
  // quietly disappears on the machine that matters is not a proof.
  try {
    git('cat-file', '-e', `${rev}^{commit}`)
  } catch {
    assert.fail(`${rev} is not in this clone — the orphan sweep's proof that it can FAIL runs `
      + 'over real history, so the checkout needs full depth (actions/checkout with '
      + 'fetch-depth: 0, or `git fetch --unshallow` locally)')
  }
  const files = {}
  for (const path of git('ls-tree', '-r', '--name-only', rev).split('\n').filter(Boolean).filter(SHIPPED)) {
    try { files[path] = git('show', `${rev}:${path}`) } catch { /* unreadable blob */ }
  }
  return files
}

// The tree about to be committed: tracked and new files as git lists them (CLAUDE.md
// §8), read from disk. HEAD is the commit BEFORE this work, so a change that removes an
// orphan would fail its own gate until it was committed — and it may not be committed
// on a red gate (2026-09-27, the widened sweep's first run).
function shippedInTree() {
  const files = {}
  const listed = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean).filter(SHIPPED)
  for (const path of listed) {
    try { files[path] = readFileSync(join(repoRoot, path), 'utf8') } catch { /* listed, deleted on disk */ }
  }
  return files
}

test('the shipped tree defines nothing it does not reach', () => {
  // Counted as the CLI counts (`sweep`): over the text with its comments blanked, every file read to its end.
  const swept = sweep(shippedInTree())
  assert.ok(swept, 'the comment lexers could not be run, so this sweep could not look')
  assert.deepEqual(swept.incomplete, [], 'a file a lexer could not finish is a file this sweep did not read')
  assert.deepEqual(swept.orphans, [],
    'these are defined in the plugin and called from nothing a user downloads')
  assert.ok(swept.defined > 300, `expected the plugin to define hundreds of functions, saw ${swept.defined}`)
})

// 2026-10-23: `admitSync` shipped reached only by its own doc comment, and `DURATION_REQUIRED_FROM` only by a comment in
// another file. A comment is not a use; a string, or code a naive comment strip would eat, still is.
test('a name mentioned only in a comment is an orphan, and code a comment strip would misread still counts', () => {
  const defined = {
    'plugin/scripts/a.mjs': '/**\n * onlyInComment is documented here.\n */\nexport function onlyInComment() {}\n',
    'plugin/scripts/b.mjs': '// onlyInComment is named here too\nconst x = 1 // and onlyInComment again\nrun(x)\n',
    'plugin/bin/gate': 'PY_ONLY_COMMENT = 1\n# PY_ONLY_COMMENT is said in a comment\n',
    'plugin/scripts/c.sh': '#!/bin/sh\n# shellOnlyComment\ntrue # shellAfterCommand\necho "$(\n# shellInSubstitution\ntrue\n)"\n',
    // The review of 620c6160..13dfefe1: a backquoted substitution inside double quotes is shell code too, and its verification
    // review: so is a comment at the substitution's very start.
    'plugin/scripts/h.sh': 'echo "`\n# shellInBackquotes\ntrue\n`"\necho "`# shellAtBackquoteStart\ntrue\n`"\n',
    // The verification review of 82717e46: inside backquotes a backslash-newline is removed first, so a comment runs on.
    'plugin/scripts/j.sh': 'printf "<%s>\\n" "`printf %s ok # comment\\\nprintf %s continuedCommentUse\n`"\n',
    // The verification review of 99803be6: a continuation at the start, or after a blank, leaves the # beginning a word.
    'plugin/scripts/l.sh': '\\\n# startContinuedComment\n: \\\n# blankContinuedComment\ntrue\n',
    'plugin/scripts/d.mjs': 'export function shellOnlyComment() {}\nexport function shellAfterCommand() {}\nexport function shellInSubstitution() {}\nexport function shellInBackquotes() {}\nexport function shellAtBackquoteStart() {}\nexport function continuedCommentUse() {}\nexport function startContinuedComment() {}\nexport function blankContinuedComment() {}\n',
  }
  const swept = sweep(defined)
  assert.ok(swept, 'the lexers ran')
  assert.deepEqual(swept.incomplete, [])
  assert.deepEqual(swept.orphans.map(o => o.name).sort(), ['PY_ONLY_COMMENT', 'blankContinuedComment', 'continuedCommentUse', 'onlyInComment', 'shellAfterCommand', 'shellAtBackquoteStart', 'shellInBackquotes', 'shellInSubstitution', 'shellOnlyComment', 'startContinuedComment'])
  // DIRTY twins: without the blanking every one reads as reached.
  assert.deepEqual(orphanDefinitions(defined).orphans, [])
  // A `/*` inside a regex literal opens no comment, a `#` inside a Python string or a quoted or here-document shell line is
  // no comment, and a string still counts.
  const kept = {
    'plugin/scripts/e.mjs': 'const UNDER = /^[\\w./*?-]*$/\nexport function usedAfterRegex() {}\nconst ok = UNDER.test(p) && usedAfterRegex()\nrun(ok)\n',
    'plugin/bin/gate': 'def _arm():\n    return 1\nTABLE = {"x": "_arm", "y": "# not a comment"}\nrun(TABLE)\n',
    'plugin/scripts/f.sh': "node -e '\n#fn = worker.quotedUse\n'\ncat <<EOF\n# hereDocUse\nEOF\necho ${#count} $#\necho '`\n# quotedTickUse\n`'\n",
    // A comment inside a backquoted substitution ends at its closing backquote, and an escaped quote there is a quote.
    'plugin/scripts/i.sh': 'echo "`true # comment`" tickAfterComment\necho "`printf \'%s\' \\"\n# escapedQuoteUse\n\\"`"\n',
    // A backslash-newline joins the lines, so a # after one continues the word before it: in code and in backquotes.
    'plugin/scripts/k.sh': 'printf %s a\\\n#gluedWordUse\necho "`printf %s a\\\n#gluedTickUse\n`"\n',
    // The verification review of e3acb340: an escaped blank is part of a word, before a continuation or directly.
    'plugin/scripts/m.sh': 'printf \'<%s>\\n\' \\ \\\n#escapedBlankUse\nprintf \'<%s>\\n\' \\ #escapedHashUse\n',
    'plugin/scripts/g.mjs': 'export function quotedUse() {}\nexport function hereDocUse() {}\nexport function quotedTickUse() {}\nexport function tickAfterComment() {}\nexport function escapedQuoteUse() {}\nexport function gluedWordUse() {}\nexport function gluedTickUse() {}\nexport function escapedBlankUse() {}\nexport function escapedHashUse() {}\n',
  }
  const keptSwept = sweep(kept)
  assert.deepEqual(keptSwept.incomplete, [])
  assert.deepEqual(keptSwept.orphans, [])
})

// The Codex review of v3.8.53..42a903a8: a commented example is not a definition, and a file a lexer could not finish is named
// rather than read as raw text, where its unread comment counted as a use and the sweep reported clean.
test('a commented example defines nothing, and a file the lexer could not finish is could-not-look', () => {
  const example = {
    'plugin/scripts/h.mjs': '/*\nfunction documentedExample() {}\ndocumentedExample()\n*/\nexport function realOne() {}\nrealOne()\n',
  }
  const swept = sweep(example)
  assert.deepEqual(swept.orphans, [], 'the example in a comment is neither a definition nor a use')
  assert.equal(swept.defined, 1)
  const unfinished = sweep({ 'plugin/scripts/i.mjs': 'export function dormant() {}\n/* dormant', 'plugin/scripts/j.sh': "echo 'open\n" })
  assert.deepEqual(unfinished.incomplete.map(([path]) => path).sort(), ['plugin/scripts/i.mjs', 'plugin/scripts/j.sh'])
})

test('...and it finds the two orphans this repository actually shipped', () => {
  // THE PROOF THE CHECK CAN FAIL, on real content rather than a fixture. Both
  // commits are in this repository's history, so this cannot rot into a tautology
  // the way a hand-built fixture can.
  //
  // 1a6693a (in v2.47.0; 818031c before the 2026-10-12 history rewrite) shipped `implausibly_fast` — BACKLOG §99, GitHub issue #6.
  // It carries `gitBranch` too, which §100 later deleted.
  const shipped = orphanDefinitions(shippedAt('1a6693a')).orphans.map(o => o.name).sort()
  assert.deepEqual(shipped, ['DURATION_REQUIRED_FROM', 'VALIDATION_VERDICTS', '__declaredEnforcementForTest',
    '__pathMatchesDeclarationForTest', 'gitBranch', 'implausibly_fast'],
    'the sweep must catch the defect at the commit that shipped it')

  // 944fa61 (de4a2a7 before the rewrite) is the commit that deleted gitBranch (§100), so its parent still has
  // it and no longer has implausibly_fast — a second, independent data point.
  const before = orphanDefinitions(shippedAt('944fa61^')).orphans.map(o => o.name).sort()
  assert.deepEqual(before, ['DURATION_REQUIRED_FROM', 'VALIDATION_VERDICTS', '__declaredEnforcementForTest',
    '__pathMatchesDeclarationForTest', 'gitBranch'])
})

test('a binding is a definition, and plugin/lib is shipped', () => {
  // v3.0.2 shipped five bindings only tests read and one only repository
  // tooling read. The sweep counted `function` and `def` alone and read no `.py`, so
  // it reported 0 of 726 there (2026-09-27).
  const found = orphanDefinitions(shippedAt('v3.0.2')).orphans.map(o => `${o.path}: ${o.name}`).sort()
  assert.deepEqual(found, [
    'plugin/lib/record.py: _BDD_NAME',
    'plugin/scripts/lifecycle.mjs: SLOW_HOOK_NOTE',
    'plugin/scripts/lifecycle.mjs: __declaredEnforcementForTest',
    'plugin/scripts/lifecycle.mjs: __pathMatchesDeclarationForTest',
    'plugin/scripts/lifecycle.mjs: probedPythonVersion',
    'plugin/scripts/reader-paths.mjs: READER_PATHS',
  ])
  assert.ok(SHIPPED('plugin/lib/record.py'), 'plugin/lib is what a user downloads')
})

test('tests and records do not make a function reachable', () => {
  // The exact mistake that made the first sweep useless, pinned so it cannot come
  // back: `implausibly_fast` was referenced 3x in tests/ and 2x in an ADR, and
  // counting those reported the corpus clean. A mutant proves a test notices a
  // change; it never proves production reaches the subject.
  const defined = { 'plugin/bin/gate': 'def only_a_test_calls_me(x):\n    return x\n' }
  assert.deepEqual(orphanDefinitions(defined).orphans,
    [{ path: 'plugin/bin/gate', name: 'only_a_test_calls_me' }])

  // Adding a test that exercises it changes nothing, because the corpus is the
  // shipped tree and a test file is not in it.
  const withCaller = { ...defined, 'plugin/bin/other': 'x = only_a_test_calls_me(1)\n' }
  assert.deepEqual(orphanDefinitions(withCaller).orphans, [],
    'a call from another SHIPPED file does make it reachable')
})

test('a name reached only through a string literal counts as reached', () => {
  // Why no allowlist is needed. A dispatch table, a config key or a help string
  // carries the bare identifier, so the arms §99 worried about resolve by
  // themselves. This is also why the scan must be bare-identifier and not `name(`.
  const dispatch = {
    'plugin/bin/gate': 'def _go_pass_marker(p):\n    return p\n',
    'plugin/bin/table': 'ARMS = {"go": "_go_pass_marker"}\nrun(ARMS)\n',
  }
  assert.deepEqual(orphanDefinitions(dispatch).orphans, [])

  // ...and the spread-operator call that a `name(` scan misreported as an orphan.
  const spread = {
    'plugin/scripts/a.mjs': 'export function expandExistingGlob(p) { return [p] }\n',
    'plugin/scripts/b.mjs': 'const all = [...expandExistingGlob(x)]\nrun(all)\n',
  }
  assert.deepEqual(orphanDefinitions(spread).orphans, [])
})

test('an empty universe is not a clean one', () => {
  // CLAUDE.md §3. `[].every()`-shaped vacuity, one directory over: with no files
  // the sweep finds no orphans, and that must never read as a pass. The CLI turns
  // this into exit 2 rather than 0; here we pin that it also reports nothing
  // DEFINED, which is the signal the CLI branches on.
  const { orphans, defined } = orphanDefinitions({})
  assert.deepEqual(orphans, [])
  assert.equal(defined, 0, 'zero definitions is "could not look", and the CLI must exit 2')
})
