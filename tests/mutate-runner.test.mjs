import assert from 'node:assert/strict'
import test from 'node:test'

import { baselineOf, classify, killedBy, renderLine, summarise, testSets } from '../scripts/mutate.mjs'

// The runner had no test file of its own until ADR-006. It was exercised only by
// lifecycle.test.mjs spawning a whole campaign, which is why its verdict logic —
// three words chosen from an exit status — was never asserted directly.

const ran = status => ({ status, signal: null })
const killed = () => ({ status: null, signal: 'SIGKILL' })

test('a verdict taken against a failing baseline is UNPROVEN, not RED', () => {
  // The defect ADR-006 exists for. The runner reads exit status alone, so a suite
  // already failing for an unrelated reason yields RED on every entry that names
  // it — and RED counts as noticed. The mutation proved nothing; the suite was
  // broken before it was applied.
  const found = classify({ occurrences: 1, baseline: { state: 'fail' }, run: ran(1) })
  assert.equal(found.verdict, 'UNPROVEN')
  // And a passing run against a broken baseline is not GREEN either: "the tests
  // did not notice" is a claim about a working suite.
  assert.equal(classify({ occurrences: 1, baseline: { state: 'fail' }, run: ran(0) }).verdict, 'UNPROVEN')
})

test('an UNPROVEN entry still reports the verdict the tests produced', () => {
  // F-9. Suppressing a verdict to make room for a warning is its own kind of
  // hiding, and this project removed a block for that exact reason.
  assert.equal(classify({ occurrences: 1, baseline: { state: 'fail' }, run: ran(1) }).observed, 'RED')
  assert.equal(classify({ occurrences: 1, baseline: { state: 'fail' }, run: ran(0) }).observed, 'GREEN')
  assert.equal(classify({ occurrences: 1, baseline: { state: 'fail' }, run: killed() }).observed, 'HUNG')
})

test('a passing baseline leaves every existing verdict exactly as it was', () => {
  // The boundary this record is most likely to be misread on. A baseline proves
  // the SUITE was working. It does not prove the mutation was exercised, so a
  // VACUOUS mutation — one whose assertion could never have failed — is still
  // GREEN. Measured 2026-08-28: coverage reports 100% line and branch on exactly
  // that case, before and after, which is why coverage was rejected.
  assert.equal(classify({ occurrences: 1, baseline: { state: 'pass' }, run: ran(1) }).verdict, 'RED')
  assert.equal(classify({ occurrences: 1, baseline: { state: 'pass' }, run: ran(0) }).verdict, 'GREEN')
  assert.equal(classify({ occurrences: 1, baseline: { state: 'pass' }, run: killed() }).verdict, 'HUNG')
})

test('a stale entry is decided before any baseline, because nothing was applied', () => {
  // STALE is read off the tree: the `from` no longer describes the code, so no
  // mutation exists to prove anything about, baseline or not.
  const found = classify({ occurrences: 0, baseline: { state: 'fail' }, run: null })
  assert.equal(found.verdict, 'STALE')
  assert.match(found.detail, /matches 0 times/)
})

test('an UNPROVEN entry names its test-set and the next action', () => {
  // F-6 and F-8. "no stack detected" told an author what was missing and never
  // what to do; ADR-005 fixed that one tool over, and this is the same rule.
  const line = renderLine({
    verdict: 'UNPROVEN',
    observed: 'RED',
    label: 'demo: a thing',
    tests: ['tests/demo.test.mjs'],
  }, 20)
  assert.match(line, /UNPROVEN/)
  assert.match(line, /tests\/demo\.test\.mjs/, 'name the set whose baseline failed')
  assert.match(line, /RED/, 'the verdict the tests produced stays visible')
  assert.match(line, /repair/i, 'say what to do next, not only what is wrong')
})

test('UNPROVEN entries are in neither half of the noticed ratio', () => {
  // A claim about a suite that was already failing belongs in neither the
  // numerator nor the denominator. Counting it in the denominator would make a
  // broken suite look like a campaign with poor coverage.
  const found = summarise([
    { verdict: 'RED' }, { verdict: 'GREEN' }, { verdict: 'UNPROVEN' }, { verdict: 'UNPROVEN' },
  ])
  assert.equal(found.total, 2, 'two entries had a working baseline')
  assert.equal(found.noticed, 1)
  assert.equal(found.unproven, 2)
  // The exit rule is unchanged: GREEN and STALE fail, UNPROVEN alone does not.
  assert.equal(found.failing, true, 'a GREEN is still a failure')
  assert.equal(summarise([{ verdict: 'UNPROVEN' }]).failing, false,
    'an unproven entry instructs; it does not block')
})

test('a baseline is taken once per distinct test-set, not once per mutation', () => {
  // The cost argument the decision rests on. Measured 2026-08-28: 204 mutations
  // over 13 distinct sets, so this is 13 spawns rather than 204 — about 6% of a
  // campaign instead of a doubling.
  const sets = testSets([
    { tests: ['a.test.mjs'] },
    { tests: ['a.test.mjs'] },
    { tests: ['b.test.mjs', 'a.test.mjs'] },
    { tests: ['a.test.mjs', 'b.test.mjs'] },
  ])
  assert.equal(sets.length, 2, 'order within a set does not make it a different set')
  assert.deepEqual(sets.map(s => s.tests), [['a.test.mjs'], ['a.test.mjs', 'b.test.mjs']])
})

test('a baseline that never ran is not reported as an already-failing suite', () => {
  // Found 2026-08-28 by an independent review, in the code written that morning
  // to fix this exact class. A baseline `spawnSync` that times out returns
  // {status: null, signal: 'SIGTERM'} — no test verdict at all — and storing it
  // as a plain `false` made every entry using that set print "already failed
  // before this mutation was applied; repair that suite". Nothing failed. The
  // suite was never executed, and "repair that suite" sends the reader to fix
  // code that may be perfectly fine.
  const timedOut = baselineOf({ status: null, signal: 'SIGTERM' })
  assert.equal(timedOut.state, 'unrun')
  const reallyFailed = baselineOf({ status: 1, signal: null })
  assert.equal(reallyFailed.state, 'fail')
  assert.equal(baselineOf({ status: 0, signal: null }).state, 'pass')

  // Both still make the verdict UNPROVEN — neither is evidence — but they must
  // not say the same thing about the suite.
  for (const baseline of [timedOut, reallyFailed]) {
    assert.equal(classify({ occurrences: 1, baseline, run: { status: 1, signal: null } }).verdict,
      'UNPROVEN')
  }
  const unranLine = renderLine({
    verdict: 'UNPROVEN', observed: 'RED', baseline: timedOut,
    label: 'demo', tests: ['tests/demo.test.mjs'],
  }, 8)
  const failedLine = renderLine({
    verdict: 'UNPROVEN', observed: 'RED', baseline: reallyFailed,
    label: 'demo', tests: ['tests/demo.test.mjs'],
  }, 8)
  assert.doesNotMatch(unranLine, /already failed/,
    'nothing failed — the baseline never produced a verdict')
  assert.match(unranLine, /never (finished|ran)|did not (finish|run)/i)
  assert.match(failedLine, /already failed/)
})

test('a run killed by signal is HUNG rather than GREEN', () => {
  // Spec F-2. A mutation can make an upward walk never terminate — removing
  // path_stack's relative_to guard did exactly that, because Path("/").parent is
  // Path("/"). A hang is not a pass and not an ordinary failure, and reading the
  // status alone would call a null status GREEN.
  assert.equal(classify({ occurrences: 1, baseline: { state: 'pass' }, run: killed() }).verdict, 'HUNG')
  assert.equal(classify({ occurrences: 1, baseline: { state: 'pass' }, run: { status: null, signal: null } })
    .verdict, 'HUNG', 'a null status with no signal is still not a pass')
})

test('GREEN and STALE both count as missed and exit 1', () => {
  // Spec F-3, existing behaviour asserted directly for the first time. Both mean
  // the mutation proved nothing about the suite, for different reasons: GREEN
  // because nothing noticed, STALE because nothing was applied.
  assert.equal(summarise([{ verdict: 'GREEN' }]).failing, true)
  assert.equal(summarise([{ verdict: 'STALE' }]).failing, true)
  assert.equal(summarise([{ verdict: 'RED' }, { verdict: 'HUNG' }]).failing, false,
    'a mutation the tests noticed, by either route, is not a failure of the campaign')
})

// BACKLOG §53. A RED verdict says the suite noticed; it does not say WHAT
// noticed. The campaign reads an exit status and throws the rest away, so a
// mutant killed by an unrelated assertion in the same file — or by a second
// guard in a caller, which happened here once and is recorded in CLAUDE.md §4 —
// is indistinguishable from one killed by the assertion it claims to prove.
// The failing test names are already in the captured stdout; discarding them
// was free to stop doing. Raised 2026-08-29 by the agentsmemory session, whose
// campaigns have the same blind spot.
//
// This REPORTS, it does not judge: deciding whether the name that fired is the
// right one is a maintainer's read, and a gate that guessed would be asserting
// a mapping nobody wrote down.
test('a kill names which tests failed, so the wrong killer is visible', () => {
  const failed = `
✖ failing tests:

test at tests/gates.test.mjs:12:1
✖ a traversal pointer is refused (3.1ms)
  AssertionError [ERR_ASSERTION]: nope
test at tests/gates.test.mjs:40:1
✖ an absolute path is refused (1.2ms)
✖ tests/gates.test.mjs (26.0ms)
`
  // The file-level line is dropped: a suite that died without reaching a subtest
  // reports the FILE as the failure (BACKLOG §49's shape), and repeating a path
  // back as "the assertion that fired" would name a killer that does not exist.
  assert.deepEqual(killedBy(failed), ['a traversal pointer is refused', 'an absolute path is refused'])

  // The must-fail direction (CLAUDE.md §4): a function returning [] for
  // everything would satisfy an "it is empty when nothing failed" assertion on
  // its own, so the clean case is only meaningful beside the dirty one above.
  assert.deepEqual(killedBy('✔ everything passed (1ms)\n# pass 3\n# fail 0\n'), [])
  assert.deepEqual(killedBy(''), [])
  assert.deepEqual(killedBy(undefined), [])
})

// Reported by BACKLOG §53's own measurement, 2026-09-01, over the full 416-mutation
// campaign: the first filter dropped anything containing `/`, so a test whose NAME
// mentions a directory was discarded and four mutants were reported killed by
// nobody while a correctly-named assertion had killed them. Each was verified by
// applying the mutant and reading the raw reporter output.
//
// The discriminator is "looks like a path" — no whitespace AND a source extension
// — not "contains a separator".
test('a test name that mentions a directory is a name, not a file path', () => {
  const failed = `
✖ failing tests:

test at tests/standalone-link.test.mjs:676:1
✖ a directory in bin/ is not a gate, whatever it is named (0.78ms)
✖ a docs/adr that yields nothing says so (4.9ms)
✖ tests/lifecycle.test.mjs (3266.79ms)
✖ D:\\a\\quality-harness\\tests\\gates.test.mjs (12.0ms)
`
  assert.deepEqual(killedBy(failed), [
    'a directory in bin/ is not a gate, whatever it is named',
    'a docs/adr that yields nothing says so',
  ], 'a slash inside an assertion name must not delete the name')

  // §49's row is still dropped, on BOTH separators — the Windows job is where
  // that path shape actually appears, and it is the reason this is not simply
  // "drop anything ending in .mjs".
  assert.deepEqual(
    killedBy('✖ failing tests:\n✖ tests/lifecycle.test.mjs (1ms)\n'), [],
    'a file-level row names no assertion and must stay dropped')
})

// 138 of this suite's 462 top-level test names contain `, ` themselves, so a
// comma-joined killer list cannot be separated back into names. Two figures were
// computed from one before anybody checked (BACKLOG §53, withdrawn there).
test('killers are rendered one per line, because names contain commas', () => {
  const line = renderLine({
    verdict: 'RED',
    label: 'evidence: the entry names its commit',
    killers: ['the entry names the commit it was produced at, and says when the tree was dirty',
              'a done row is the row'],
  }, 40)
  const rendered = line.split('killed by:')[1]
  assert.equal(rendered.split('\n').filter(l => l.trim()).length, 2,
    'two killers must render as two lines, whatever punctuation their names hold')
  assert.match(line, /the commit it was produced at, and says when the tree was dirty/)
})

test('the report names the killer beside a RED verdict', () => {
  const line = renderLine(
    { verdict: 'RED', label: 'lint: a guard refuses traversal', killers: ['a traversal pointer is refused'] },
    34)
  assert.match(line, /a traversal pointer is refused/)
  // A RED with no names recoverable must not invent one, and must still render.
  assert.doesNotMatch(renderLine({ verdict: 'RED', label: 'x', killers: [] }, 4), /killed by/)
})
