import assert from 'node:assert/strict'
import test from 'node:test'

import { baselineOf, cacheKey, classify, killedBy, renderLine, reusable, shardByCost, summarise, testSets } from '../scripts/mutate.mjs'

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

// ── ADR-023 T2: reuse a verdict only when nothing it rests on has changed ──────
//
// The key is CONTENT, never a timestamp, a run id or a commit range. ADR-010's
// failure — a claim outliving its subject — is unrepresentable here rather than
// merely unlikely: a changed subject is a different key, and a different key is
// a miss. These tests are what hold that property.

const reader = files => p => (p in files ? files[p] : null)
const ENTRY = { label: 'x', file: 'plugin/bin/g', from: 'a', to: 'b', tests: ['tests/t.test.mjs'] }
const FILES = { 'plugin/bin/g': 'def a(): pass\n', 'tests/t.test.mjs': 'assert(1)\n' }

test('an exact content match reuses a RED verdict', () => {
  const key = cacheKey(ENTRY, reader(FILES))
  assert.ok(key, 'every input was readable, so the entry has a key')
  const cache = { [key]: { verdict: 'RED', sha: 'abc1234' } }
  assert.deepEqual(reusable(ENTRY, cache, key), { verdict: 'RED', sha: 'abc1234' })
})

test('a changed subject, test or edit is a different mutant', () => {
  const key = cacheKey(ENTRY, reader(FILES))
  // Each of the three inputs INDEPENDENTLY, because a key covering only the
  // subject would reuse a stale verdict after a test changed — and this session
  // produced two live examples of a test change flipping a verdict with the
  // subject untouched.
  const subject = cacheKey(ENTRY, reader({ ...FILES, 'plugin/bin/g': 'def a(): return 1\n' }))
  const tests = cacheKey(ENTRY, reader({ ...FILES, 'tests/t.test.mjs': 'assert(2)\n' }))
  const edit = cacheKey({ ...ENTRY, to: 'c' }, reader(FILES))
  for (const [name, other] of [['subject', subject], ['tests', tests], ['edit', edit]]) {
    assert.notEqual(other, key, `a changed ${name} must not reuse the old verdict`)
    assert.equal(reusable(ENTRY, { [key]: { verdict: 'RED' } }, other), null, name)
  }
})

test('only RED is reusable', () => {
  // A GREEN mutant is an open finding about a test and must be re-run every time
  // until it is fixed; caching it hides live work. UNPROVEN likewise — ADR-006
  // already says a verdict against a failing baseline is evidence of nothing.
  const key = cacheKey(ENTRY, reader(FILES))
  for (const verdict of ['GREEN', 'UNPROVEN', 'STALE', 'HUNG', undefined]) {
    assert.equal(reusable(ENTRY, { [key]: { verdict } }, key), null, String(verdict))
  }
})

test('an unreadable input has no key, so it is measured', () => {
  // "I could not look" is not "nothing changed" (ADR-005). A missing file must
  // not hash to something stable, or a deleted test would freeze its verdict.
  assert.equal(cacheKey(ENTRY, reader({ 'plugin/bin/g': 'x' })), null, 'test file absent')
  assert.equal(cacheKey(ENTRY, reader({ 'tests/t.test.mjs': 'x' })), null, 'subject absent')
  assert.equal(reusable(ENTRY, { anything: { verdict: 'RED' } }, null), null)
})

test('an absent or unreadable cache measures everything', () => {
  const key = cacheKey(ENTRY, reader(FILES))
  for (const cache of [null, undefined, {}, 'not-an-object', 42]) {
    assert.equal(reusable(ENTRY, cache, key), null, JSON.stringify(cache) ?? 'undefined')
  }
})

test('the summary distinguishes measured from reused', () => {
  // A campaign printing 430/430 noticed while running six claims more than
  // happened — the defect this repository exists to demonstrate the absence of.
  const red = v => ({ verdict: v, tests: ['t'] })
  const counts = summarise([red('RED'), { ...red('RED'), reused: true }, red('GREEN')])
  assert.equal(counts.total, 3)
  assert.equal(counts.noticed, 2)
  assert.equal(counts.reused, 1, 'a reused entry is counted apart from one just measured')
  assert.equal(counts.measured, 2, 'measured excludes the reused entry')
})

test('a forced run reuses nothing', () => {
  // ADR-023 T3. `--no-cache` must MEASURE everything even against a cache that
  // would have matched every entry. A flag accepted and ignored is
  // indistinguishable from one that works, and on a release that difference is
  // the whole guarantee — a tag partly evidenced by verdicts taken elsewhere.
  const key = cacheKey(ENTRY, reader(FILES))
  const full = { [key]: { verdict: 'RED', sha: 'abc1234' } }
  assert.notEqual(reusable(ENTRY, full, key), null, 'the cache would match, so the test is real')
  // The forced path is the empty cache the runner substitutes for --no-cache.
  assert.equal(reusable(ENTRY, {}, key), null, 'a forced run must consult nothing')
})

// ── BACKLOG §106: slice shards by measured cost, not by index ─────────────────
//
// Index slicing gave 24.6 / 16.1 / 18.1 / 21.3 minutes over four shards — even
// counts, uneven cost, because three suites are 86% of the campaign. The
// campaign waits for the slowest.
//
// ⚠ THE TIMINGS ARE MEASURED, NEVER TABULATED. §106 was deferred precisely
// because the obvious fix is a hardcoded per-suite cost table, which is a list
// kept beside the artifact: right the day it is written, silently wrong after
// any suite changes, with nothing to report the drift. These come from the
// campaign's own previous run, sharing ADR-023's store rather than adding one.

test('shards are balanced by measured cost when timings exist', () => {
  // Six entries whose costs are lopsided. Index slicing into two would put
  // 30+20+10 against 5+3+2 — the classic imbalance. Cost slicing evens them.
  const entries = [
    { label: 'a', ms: 30000 }, { label: 'b', ms: 20000 }, { label: 'c', ms: 10000 },
    { label: 'd', ms: 5000 }, { label: 'e', ms: 3000 }, { label: 'f', ms: 2000 },
  ]
  const cost = m => m.ms
  const shards = [1, 2].map(i => shardByCost(entries, i, 2, cost))
  const totals = shards.map(s => s.reduce((n, m) => n + m.ms, 0))
  assert.deepEqual(shards.flat().map(m => m.label).sort(), ['a', 'b', 'c', 'd', 'e', 'f'],
    'every entry lands in exactly one shard')
  assert.ok(Math.max(...totals) - Math.min(...totals) <= 5000,
    `expected balanced shards, got ${totals}`)
})

test('a partition stays a partition however the costs fall', () => {
  // The property that matters more than balance: an overlap double-counts a
  // verdict and a gap drops one silently, which is T1's Stop Condition.
  const entries = Array.from({ length: 37 }, (_, i) => ({ label: `m${i}`, ms: (i * 7) % 11 }))
  for (const n of [1, 2, 3, 8, 37, 40]) {
    const all = Array.from({ length: n }, (_, i) => shardByCost(entries, i + 1, n, m => m.ms)).flat()
    assert.equal(all.length, entries.length, `n=${n}: count`)
    assert.equal(new Set(all.map(m => m.label)).size, entries.length, `n=${n}: unique`)
  }
})

test('with no timings at all it still partitions, and says nothing about balance', () => {
  // The first run on a fresh checkout has no cache. Falling back must not drop
  // entries, and must not pretend the slices are balanced — an unmeasured
  // campaign is "could not look", and the slicing simply degrades to even counts.
  const entries = Array.from({ length: 443 }, (_, i) => ({ label: `m${i}` }))
  const shards = Array.from({ length: 8 }, (_, i) => shardByCost(entries, i + 1, 8, () => undefined))
  const all = shards.flat()
  assert.equal(all.length, 443)
  assert.equal(new Set(all.map(m => m.label)).size, 443)

  // ⚠ AND NO SHARD IS EMPTY, which the partition assertions above CANNOT see:
  // putting all 443 entries in bin 1 and leaving seven empty still sums to 443
  // and is still unique. That is exactly what shipped — an unknown cost counted
  // as 0, so every load stayed 0, `lightest` was always bin 0, and CI reported
  // `shard 4/8: 0 of 443 mutations` on every shard but the first while this test
  // passed. It passed locally too, because a cache with timings happened to
  // exist (CLAUDE.md §8).
  const sizes = shards.map(s => s.length)
  assert.ok(Math.min(...sizes) > 0, `no shard may be empty when nothing is timed: ${sizes}`)
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1,
    `untimed slicing must be even, not merely non-empty: ${sizes}`)
})
