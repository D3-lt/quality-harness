import assert from 'node:assert/strict'
import test from 'node:test'

import { classify, renderLine, summarise, testSets } from '../scripts/mutate.mjs'

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
  const found = classify({ occurrences: 1, baselineOk: false, run: ran(1) })
  assert.equal(found.verdict, 'UNPROVEN')
  // And a passing run against a broken baseline is not GREEN either: "the tests
  // did not notice" is a claim about a working suite.
  assert.equal(classify({ occurrences: 1, baselineOk: false, run: ran(0) }).verdict, 'UNPROVEN')
})

test('an UNPROVEN entry still reports the verdict the tests produced', () => {
  // F-9. Suppressing a verdict to make room for a warning is its own kind of
  // hiding, and this project removed a block for that exact reason.
  assert.equal(classify({ occurrences: 1, baselineOk: false, run: ran(1) }).observed, 'RED')
  assert.equal(classify({ occurrences: 1, baselineOk: false, run: ran(0) }).observed, 'GREEN')
  assert.equal(classify({ occurrences: 1, baselineOk: false, run: killed() }).observed, 'HUNG')
})

test('a passing baseline leaves every existing verdict exactly as it was', () => {
  // The boundary this record is most likely to be misread on. A baseline proves
  // the SUITE was working. It does not prove the mutation was exercised, so a
  // VACUOUS mutation — one whose assertion could never have failed — is still
  // GREEN. Measured 2026-08-28: coverage reports 100% line and branch on exactly
  // that case, before and after, which is why coverage was rejected.
  assert.equal(classify({ occurrences: 1, baselineOk: true, run: ran(1) }).verdict, 'RED')
  assert.equal(classify({ occurrences: 1, baselineOk: true, run: ran(0) }).verdict, 'GREEN')
  assert.equal(classify({ occurrences: 1, baselineOk: true, run: killed() }).verdict, 'HUNG')
})

test('a stale entry is decided before any baseline, because nothing was applied', () => {
  // STALE is read off the tree: the `from` no longer describes the code, so no
  // mutation exists to prove anything about, baseline or not.
  const found = classify({ occurrences: 0, baselineOk: false, run: null })
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
