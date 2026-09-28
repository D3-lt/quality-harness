import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve, sep } from 'node:path'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { addedLineNumbers, addedLines, baselineOf, cacheKey, campaignPaths, changedDiffArgs, childEnv, classify, killedBy, leafTestsRun, renderLine, repointEntry, reusable, setKeyOf, shardByCost, staleEntries, summarise, testArgs, testSets, touchedBy } from '../scripts/mutate.mjs'
import * as mutateModule from '../scripts/mutate.mjs'

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
  // ⚠ THE *WHY*, NOT ONLY THE STATE. Since 2026-09-06 a second branch also
  // answers 'unrun' — output carrying no spec reporter lines — so asserting the
  // state alone let a mutant that deleted this line survive: a killed run has no
  // stdout either, and fell through to the other branch with the same verdict
  // and a different reason. The CI campaign caught it (mutations 6/12, GREEN).
  const timedOut = baselineOf({ status: null, signal: 'SIGTERM' })
  assert.equal(timedOut.state, 'unrun')
  assert.equal(timedOut.why, 'SIGTERM', 'a killed run is named by its signal, not by its silence')
  // A run the reporter narrated: the leaf lines are what say tests executed.
  const reallyFailed = baselineOf({ status: 1, signal: null, stdout: '✖ one (1ms)\nℹ tests 1\nℹ fail 1\n' })
  assert.equal(reallyFailed.state, 'fail')
  assert.equal(baselineOf({ status: 0, signal: null, stdout: '✔ one (1ms)\nℹ tests 1\nℹ pass 1\n' }).state, 'pass')

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
// was free to stop doing. Raised 2026-08-29 by the team-memory session, whose
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

// A STALE mutation was SILENT, and the campaign then blamed the tests for it.
// Found 2026-09-03 while executing ADR-028: a `from` string over-escaped in
// tests/mutations.json matched zero times, so nothing was ever applied — and the
// run printed no line for it, then closed with "A test that stays green with its
// mechanism broken is asserting something else." Exit 1 was right; the sentence
// was a verdict about a test that had never been challenged. CLAUDE.md §3: a gate
// must never report an observation it did not make.
test('a stale mutation is reported as stale, not as a test that failed to notice', () => {
  const stale = summarise([{ verdict: 'STALE', detail: 'matches 0 times' }])
  assert.equal(stale.failing, true, 'a stale mutation still fails the run')
  assert.equal(stale.staleOnly, true,
    'and the run can tell that NOTHING was measured, so it does not accuse the tests')

  // The other direction, or the flag would pass by always being true.
  assert.equal(summarise([{ verdict: 'GREEN' }]).staleOnly, false,
    'a GREEN verdict IS a finding about the tests')
  assert.equal(summarise([{ verdict: 'STALE' }, { verdict: 'GREEN' }]).staleOnly, false,
    'a mixed run has a real green to answer for')
})

test('a stale mutation renders a line rather than a blank', () => {
  // It rendered nothing at all: the result was pushed and the loop continued
  // without printing, so the only blank line in the output came from the
  // summary's own leading newline.
  const line = renderLine({ verdict: 'STALE', label: 'x: y', detail: 'matches 0 times' }, 10)
  assert.match(line, /^STALE/, 'the verdict leads the line')
  assert.match(line, /matches 0 times/, 'and the line says why it could not run')
})

// A mutant killed by one test in a 149-entry file paid for the whole file. `only`
// is a Node --test-name-pattern the runner passes for that entry — and passes
// IDENTICALLY for its baseline, or the baseline licenses a different run.
test('`only` becomes a --test-name-pattern for the mutant and its baseline alike, and nothing without it', () => {
  const root = '/r'
  const plain = { tests: ['tests/b.test.mjs', 'tests/a.test.mjs'] }
  const narrowed = { ...plain, only: 'kills the tree' }
  const owned = ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout']
  assert.deepEqual(testArgs(root, plain).slice(0, 3), owned, 'the reporter is named, never inherited')
  assert.ok(!testArgs(root, plain).includes('--test-name-pattern'), 'no pattern without only')
  assert.deepEqual(testArgs(root, narrowed).slice(0, 5), [...owned, '--test-name-pattern', 'kills the tree'])
  // Sorted files, so two entries naming the same files in a different order run the same argv.
  assert.deepEqual(testArgs(root, plain).slice(1), testArgs(root, { tests: [...plain.tests].reverse() }).slice(1))
  // An empty `only` is no `only`.
  assert.ok(!testArgs(root, { ...plain, only: '' }).includes('--test-name-pattern'))
})

test('a baseline taken under one pattern licenses nothing about another', () => {
  const a = { label: 'a', tests: ['tests/x.test.mjs'], only: 'one' }
  const b = { label: 'b', tests: ['tests/x.test.mjs'], only: 'two' }
  const c = { label: 'c', tests: ['tests/x.test.mjs'] }
  const d = { label: 'd', tests: ['tests/x.test.mjs'] }
  const sets = testSets([a, b, c, d])
  assert.equal(sets.length, 3, 'same files, different patterns: different sets; no pattern: one set')
  assert.notEqual(setKeyOf(a), setKeyOf(b))
  assert.equal(setKeyOf(c), setKeyOf(d))
  assert.equal(sets.find(s => s.only === 'one').mutations.length, 1)
  assert.equal(sets.find(s => s.only === null).mutations.length, 2)
  // And the cache: a verdict measured under one pattern must not be reused under another.
  const read = () => 'same bytes'
  assert.notEqual(cacheKey({ ...a, file: 'f', from: 'x', to: 'y' }, read), cacheKey({ ...b, file: 'f', from: 'x', to: 'y' }, read))
  assert.equal(cacheKey({ ...c, file: 'f', from: 'x', to: 'y' }, read), cacheKey({ ...d, file: 'f', from: 'x', to: 'y' }, read))
})

// THE TRAP, and the review that found the first guard did not close it. A
// pattern that matches no test makes `node --test` exit 0 — and Node reports the
// test FILE as one passing test, `✔ tests/x.test.mjs` with `ℹ tests 1`, so a
// guard reading the summary count never fired. And an inherited
// `--test-reporter=dot` removed every line the runner reads. Both are driven
// here against REAL node output, not fabricated stdout, because fabricated
// stdout is exactly what let the first version pass (Codex review, 2026-09-06).
test('a run in which no test executed is an unrun baseline, never a passing one', () => {
  // Synthetic shapes first, for the arithmetic.
  const wrapperOnly = { status: 0, signal: null, stdout: '✔ tests/x.test.mjs (5.1ms)\nℹ tests 1\nℹ pass 1\n' }
  const some = { status: 0, signal: null, stdout: '✔ one (1ms)\n✔ two (1ms)\nℹ tests 2\nℹ pass 2\n' }
  const silent = { status: 0, signal: null, stdout: '.\n' }
  assert.equal(leafTestsRun(wrapperOnly.stdout), 0, 'the file wrapper is not a test that ran')
  assert.equal(leafTestsRun(some.stdout), 2)
  assert.equal(leafTestsRun(silent.stdout), null, 'no spec lines at all is unknown')
  assert.equal(baselineOf(wrapperOnly).state, 'unrun')
  assert.match(baselineOf(wrapperOnly).why, /no test ran/)
  assert.equal(baselineOf(some).state, 'pass')
  assert.equal(baselineOf(silent).state, 'unrun', 'output the runner cannot read is not a pass')
  assert.equal(classify({ occurrences: 1, baseline: baselineOf(wrapperOnly), run: wrapperOnly }).verdict, 'UNPROVEN')
})

test('end to end: a nonsense pattern under an inherited dot reporter is unrun, and a matching one passes', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  // A file of its own, never this one: with the name filter dropped (a catalogue
  // mutant), a child running THIS file ran this test again, which spawned it again
  // — the recursion that took a CI runner down on 1827ac0.
  const probe = mkdtempSync(join(tmpdir(), 'qh-e2e-'))
  const file = 'probe.test.mjs'
  writeFileSync(join(probe, file),
    "import test from 'node:test'\ntest('probe one', () => {})\ntest('probe two', () => {})\n")
  // The environment a shell might leave: a reporter that prints one dot. The
  // runner must neither inherit it nor crash by stacking its own on top.
  const env = childEnv({ ...process.env, NODE_OPTIONS: '--test-reporter=dot' })
  assert.doesNotMatch(env.NODE_OPTIONS, /test-reporter/, 'the inherited reporter is stripped')
  assert.ok(!('NODE_TEST_CONTEXT' in childEnv({ ...process.env, NODE_TEST_CONTEXT: 'child-v8' })),
    'the test runner\'s own child marker is dropped, or an inner node --test prints nothing to stdout')
  // A Python mutant the same SIZE as the line it replaces (`if other:` →
  // `if False:`) left `__pycache__` looking valid, because this runner rewrites
  // the file in the same second it measured the last one — so the child
  // imported the UNMUTATED module and the campaign called a live defect
  // unnoticed. Measured 2026-09-13; the same mutant is RED with the cache
  // cleared, so the verdict turned on the cache rather than on the code.
  assert.equal(env.PYTHONDONTWRITEBYTECODE, '1', 'a mutated gate must not leave bytecode behind')
  assert.ok(env.PYTHONPYCACHEPREFIX, 'each child needs its own bytecode cache')
  assert.notEqual(env.PYTHONPYCACHEPREFIX,
    childEnv({ ...process.env }).PYTHONPYCACHEPREFIX,
    'a shared prefix is the same trap one directory over')
  assert.ok(!env.PYTHONPYCACHEPREFIX.startsWith(repoRoot),
    'the cache belongs outside the tree the runner is rewriting')
  // NOT named `spawn`: scripts/untimed-spawns.mjs matches callee NAMES, so a
  // helper called `spawn` reads as an untimed child at every call site while the
  // real spawnSync inside it carries a timeout (BACKLOG §130).
  const runNode = only => spawnSync(process.execPath, testArgs(probe, { tests: [file], only }),
    { cwd: probe, encoding: 'utf8', env, timeout: 60_000 })
  try {
    const nothing = runNode('zzz-no-such-test-zzz')
    assert.equal(nothing.status, 0, `node must start and exit 0 with no match\n${nothing.stderr}`)
    assert.equal(baselineOf(nothing).state, 'unrun', `a no-match run is not a passing baseline: ${nothing.stdout.slice(0, 200)}`)
    assert.match(baselineOf(nothing).why, /selected nothing/)
    const one = runNode('^probe one$')
    assert.equal(one.status, 0, one.stderr)
    assert.equal(leafTestsRun(one.stdout), 1, `exactly the matching test ran: ${one.stdout.slice(0, 300)}`)
    assert.equal(baselineOf(one).state, 'pass')
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
})

// ⚠ A CHECKOUT PATH WITH A SPACE TURNED "NO TEST RAN" INTO A PASSING BASELINE.
// Reported by a Windows session running this suite from `Y:\qh with spaces`,
// 2026-09-18, and CONFIRMED HERE ON macOS the same day from a directory with a
// space in its name — so it was never a Windows defect. `leafTestsRun`
// discounted node's file-level reporter line by ABSENCE OF WHITESPACE, and a
// path with a space stopped looking like a path, survived the filter, and was
// counted as a leaf test that passed. classify() then never reaches UNPROVEN:
// every mutant is graded GREEN or RED against a baseline in which nothing ran,
// which is the exact failure ADR-005 exists to prevent, in the tool whose whole
// job is catching green-for-the-wrong-reason.
//
// Real node output, from a real spaced directory. Hand-written stdout would
// only prove the regex, and the peer's first synthetic probes were mangled by
// their own quoting — the numbers that mattered came from captured output.
test('a checkout path with a space is still an unrun baseline when nothing matched', () => {
  const spaced = mkdtempSync(join(tmpdir(), 'qh mutate spaces-'))
  try {
    const file = join(spaced, 'probe.test.mjs')
    writeFileSync(file, "import test from 'node:test'\ntest('a real leaf test', () => {})\n")
    const run = only => spawnSync(process.execPath,
      testArgs(spaced, { tests: ['probe.test.mjs'], only }),
      { cwd: spaced, encoding: 'utf8', env: childEnv(), timeout: 120_000 })
    assert.match(join(spaced, 'probe.test.mjs'), / /, 'the fixture path must contain a space')

    const nothing = run('zzz-no-such-test-zzz')
    assert.equal(nothing.status, 0, nothing.stderr)
    const files = [join(spaced, 'probe.test.mjs')]
    assert.equal(leafTestsRun(nothing.stdout, files), 0,
      `the file-level line is not a leaf test: ${nothing.stdout.slice(0, 300)}`)
    // ⚠ AND WITHOUT THE FILE LIST TOO. Two Windows sessions measured this from a
    // spaced CHECKOUT on 2026-09-18: the unit case above passed while the
    // end-to-end one — which calls baselineOf with no files, from the real
    // repository root — still graded a run where nothing executed as `pass`.
    // A fix that only covers callers who pass files leaves the defect reachable
    // one level further out.
    assert.equal(baselineOf(nothing).state, 'unrun',
      `no file list is no excuse from a spaced path: ${nothing.stdout.slice(0, 300)}`)
    assert.equal(baselineOf(nothing, files).state, 'unrun',
      `a no-match run from a spaced path is not a passing baseline: ${nothing.stdout.slice(0, 300)}`)

    // And the real test still counts, or the discount would have eaten it.
    const one = run('^a real leaf test$')
    assert.equal(one.status, 0, one.stderr)
    assert.equal(leafTestsRun(one.stdout, files), 1, one.stdout.slice(0, 300))
    assert.equal(baselineOf(one, files).state, 'pass')
  } finally {
    rmSync(spaced, { recursive: true, force: true })
  }
})

// BACKLOG §256: a shell that exports FORCE_COLOR made the spec reporter prefix
// every leaf line with an escape code, so a baseline in which tests really ran
// read as `unrun` and the whole campaign measured nothing.
//
// ⚠ THE CHILD RUNS A FILE OF ITS OWN, NEVER THIS ONE. The first version spawned
// tests/mutate-runner.test.mjs filtered to one test, and the catalogue mutant
// that drops the filter made the child run this whole file — this test included,
// which spawned it again. The recursion took a CI runner down on 1827ac0, the
// same mutant in two runs.
test('an inherited FORCE_COLOR is dropped, so a real run still counts its tests', () => {
  const env = childEnv({ ...process.env, FORCE_COLOR: '3' })
  assert.ok(!('FORCE_COLOR' in env), 'the colour switch must not reach the child')
  const probe = mkdtempSync(join(tmpdir(), 'qh-colour-'))
  try {
    writeFileSync(join(probe, 'probe.test.mjs'),
      "import test from 'node:test'\ntest('probe one', () => {})\ntest('probe two', () => {})\n")
    const one = spawnSync(process.execPath,
      testArgs(probe, { tests: ['probe.test.mjs'], only: '^probe one$' }),
      { cwd: probe, encoding: 'utf8', env, timeout: 60_000 })
    assert.equal(one.status, 0, one.stderr)
    assert.equal(leafTestsRun(one.stdout), 1, `a colour-forcing parent must not blind the count: ${one.stdout.slice(0, 300)}`)
    assert.equal(baselineOf(one).state, 'pass')
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
})

// BACKLOG §280, the tooling half: a fix that moves a line a mutant names leaves the
// entry matching nothing, and until now only the full suite said so. `--stale` says
// which entries, and where their line most likely went.
test('staleEntries names each entry that no longer matches once, with where its line went', () => {
  const files = {
    'a.mjs': 'const one = 1\nif (readiness.listed.has(file)) return true\n',
    'b.mjs': 'x()\nx()\n',
  }
  const read = file => files[file] ?? null
  const entries = [
    { label: 'fine', file: 'a.mjs', from: 'const one = 1', tests: [] },
    { label: 'moved', file: 'a.mjs', from: '    if (readiness.answeredDirs.has(file)) return true', tests: [] },
    { label: 'twice', file: 'b.mjs', from: 'x()', tests: [] },
    { label: 'gone', file: 'missing.mjs', from: 'y', tests: [] },
  ]
  const stale = staleEntries(entries, read)
  assert.deepEqual(stale.map(entry => [entry.label, entry.count]), [['moved', 0], ['twice', 2], ['gone', null]])
  assert.deepEqual(stale[0].hint, { line: 2, text: 'if (readiness.listed.has(file)) return true' })
  // An entry with nothing like it left gets no hint rather than a wild guess.
  assert.equal(staleEntries([{ label: 'z', file: 'a.mjs', from: 'zzz_unrelated_token_qq', tests: [] }], read)[0].hint, null)
})

test('touchedBy keeps an entry whose mutated line was added by the change, and only those', () => {
  const diff = [
    'diff --git a/plugin/x.mjs b/plugin/x.mjs', '--- a/plugin/x.mjs', '+++ b/plugin/x.mjs',
    '@@ -3 +3,2 @@', '-  old()', '+  if (named) return', '+  keep()',
  ].join('\n')
  const added = addedLines(diff)
  assert.deepEqual([...added.get('plugin/x.mjs')], ['if (named) return', 'keep()'])
  const entries = [
    { label: 'edited', file: 'plugin/x.mjs', from: '  if (named) return', tests: [] },
    { label: 'same file, untouched', file: 'plugin/x.mjs', from: '  otherCallThatThisChangeNeverTouched()', tests: [] },
    { label: 'other file', file: 'plugin/y.mjs', from: '  if (named) return', tests: [] },
  ]
  assert.deepEqual(touchedBy(entries, added).map(entry => entry.label), ['edited'])
  // Part of an added line counts; a short common line alone does not.
  const partial = addedLines(['+++ b/plugin/x.mjs', '+  return lines !== undefined && lines.has(key)', '+  return 1'].join('\n'))
  assert.deepEqual(touchedBy([
    { label: 'inline', file: 'plugin/x.mjs', from: 'lines.has(key)', tests: [] },
    { label: 'short', file: 'plugin/x.mjs', from: '  return 1', tests: [] },
  ], partial).map(entry => entry.label), ['inline'])
  assert.deepEqual(touchedBy(entries, new Map()), [])
})

// Codex review of 833ea52: the twelve-character floor skipped a SHORT mutant the
// change itself added — `if frozen:` — so --changed never ran it. Where the source
// can be read, an entry is selected by WHERE its `from` sits: inside an added hunk,
// however short; outside, not, however common its text.
test('--changed selects a short mutant by where the change added it', () => {
  const source = ['def f():', '    if frozen:', '        pass', '    return 1', ''].join('\n')
  const diff = ['+++ b/bin/x', '@@ -1,0 +2,2 @@', '+    if frozen:', '+        pass'].join('\n')
  assert.deepEqual([...addedLineNumbers(diff).get('bin/x')], [2, 3])
  const entries = [
    { label: 'short and added', file: 'bin/x', from: '    if frozen:', tests: [] },
    { label: 'short, not added', file: 'bin/x', from: '    return 1', tests: [] },
  ]
  const where = { numbers: addedLineNumbers(diff), readSource: () => source }
  assert.deepEqual(touchedBy(entries, addedLines(diff), where).map(entry => entry.label), ['short and added'])
})

test('mutate --stale over the real catalogue exits 0 and says every entry matches', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const run = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'mutate.mjs'), '--stale'], { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /every entry matches its source exactly once/)
})

// Cold review of 833ea52: `--changed` parsed `+++ b/<file>`, and a user's own
// `diff.noprefix` or `diff.mnemonicPrefix` changes that header, so every entry
// missed and the run reported "no mutation matches". The diff is asked for in one
// fixed shape, whatever the user's git config says.
test('--changed reads its diff in one shape whatever the user configured', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-changed-prefix-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    git('init', '-q')
    writeFileSync(join(repo, 'x.mjs'), 'export const a = 1\n')
    git('add', '.'); git('commit', '-qm', 'one')
    writeFileSync(join(repo, 'x.mjs'), 'export const a = 1\nexport const changedLine = 2\n')
    for (const [key, value] of [['diff.noprefix', 'true'], ['diff.mnemonicPrefix', 'true'], ['color.diff', 'always']]) git('config', key, value)
    const diff = spawnSync('git', changedDiffArgs(repo, 'HEAD'), { encoding: 'utf8', timeout: 30_000 })
    assert.deepEqual([...addedLines(diff.stdout).keys()], ['x.mjs'], diff.stdout)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-069 T1. The fixture is the 3.1.0 batch's own history: every entry rewritten by
// hand while it matched nothing, a window of its source at that commit, and the lines
// that commit added there. Six were mechanical and six were rewrites.
const HERE = dirname(fileURLToPath(import.meta.url))
const REPLAY = JSON.parse(readFileSync(join(HERE, 'fixtures', 'mutate-repoint', 'replay.json'), 'utf8')).rows
const MECHANICAL = 6
// ADR-071 T1: the 3.1.1 batch's hand repoints, taken the same way. A row the hand moved
// to another file has `hand: null`: no proposal is right for it.
const REPLAY_311 = JSON.parse(readFileSync(join(HERE, 'fixtures', 'mutate-repoint', 'replay-3.1.1.json'), 'utf8')).rows

test('repointEntry reproduces the mechanical repoints of the 3.1.0 batch and refuses the rest', () => {
  let reproduced = 0
  for (const row of REPLAY) {
    const answer = repointEntry({ label: row.label, file: 'x', from: row.from, to: row.to }, row.source, new Set(row.added))
    if (answer.verdict === 'repointed') {
      assert.deepEqual({ from: answer.from, to: answer.to }, row.hand, row.label)
      reproduced += 1
    } else assert.equal(answer.verdict, 'refused', row.label)
  }
  assert.equal(reproduced, MECHANICAL)
  assert.equal(REPLAY.length - reproduced, 6)

  // One clean case and a dirty twin for each of the record's conditions.
  const oldLine = "  if (word === 'a' || word === 'b') return 1"
  const newLine = "  if (word === 'a' || word === 'b' || word === 'c') return 1"
  const entry = { label: 'e', file: 'x', from: oldLine, to: "  if (word === 'b') return 1" }
  const source = `const before = 1\n${newLine}\nconst after = 2\n`
  const added = new Set([newLine.trim()])
  assert.deepEqual(repointEntry(entry, source, added),
    { verdict: 'repointed', from: newLine, to: "  if (word === 'b' || word === 'c') return 1" })
  const why = (...args) => repointEntry(...args).why ?? ''
  // 5: a sibling the change never touched, and a diff that could not be read.
  assert.ok(why(entry, source, new Set()).startsWith('5:'), why(entry, source, new Set()))
  assert.ok(why(entry, source, null).startsWith('5:'))
  // 4: the nearest line again, more indented, so it is not unique as a substring.
  assert.ok(why(entry, `${source}  ${newLine}\n`, added).startsWith('4:'))
  // 3: an edit that only inserts has no text to find on the new line.
  const insertOnly = { label: 'i', file: 'x', from: '  foo(alpha, beta)', to: '  foo(alpha, beta) && gate()' }
  assert.ok(why(insertOnly, 'const x = 1\n  foo(alpha, beta, gamma)\n', new Set(['foo(alpha, beta, gamma)'])).startsWith('3:'))
  // 2: nothing left resembles the entry.
  assert.ok(why({ label: 'n', file: 'x', from: '  zzz_unrelated_token_qq()', to: '  noop()' }, source, added).startsWith('2:'))
  // 1: a multi-line entry.
  assert.ok(why({ label: 'm', file: 'x', from: `${oldLine}\n  return 0`, to: '  return 0' }, source, added).startsWith('1:'))
  // An entry that matches twice is ambiguous, and one that matches once is current.
  assert.ok(why({ label: 't', file: 'x', from: 'const', to: 'let' }, source, added).startsWith('ambiguous'))
  assert.equal(repointEntry({ label: 'c', file: 'x', from: 'const before = 1', to: 'const before = 2' }, source, added).verdict, 'current')
})

// ADR-071 T1. Over both batches' fixtures, reanchorEntry keeps repointEntry's verdict
// where it repoints, re-anchors the rows the text around their edit still names, and
// refuses the rest; no proposal may differ from the hand. In its window the ADR-067
// help-flag row has one fitting line, where the whole file has two (ADR-071 Context).
test('reanchorEntry reproduces the hand repoints repointEntry refused, and proposes no line the hand did not choose', () => {
  const reanchorEntry = mutateModule.reanchorEntry
  assert.equal(typeof reanchorEntry, 'function', 'reanchorEntry is exported')
  const counts = { repointed: 0, reanchored: 0, refused: 0 }
  for (const row of [...REPLAY, ...REPLAY_311]) {
    const entry = { label: row.label, file: 'x', from: row.from, to: row.to }
    const answer = reanchorEntry(entry, row.source, new Set(row.added))
    counts[answer.verdict] += 1
    if (answer.verdict === 'refused') continue
    assert.ok(row.hand, `${row.label}: proposed, but the hand moved it to another file`)
    assert.deepEqual({ from: answer.from, to: answer.to }, row.hand, row.label)
    if (answer.verdict === 'repointed') assert.deepEqual(answer, repointEntry(entry, row.source, new Set(row.added)), row.label)
  }
  assert.deepEqual(counts, { repointed: 10, reanchored: 6, refused: 10 })

  // Hand-built cases, one per rule, as ADR-069's own test does.
  const newLine = '  if (isReady(alpha, beta)) return launch(gamma)'
  const entry = { label: 'e', file: 'x', from: '  if (ready(alpha) && armed(beta)) return launch(gamma)', to: '  if (false) return launch(gamma)' }
  const source = `const before = 1\n${newLine}\nconst after = 2\n`
  const added = new Set([newLine.trim()])
  assert.deepEqual(reanchorEntry(entry, source, added), { verdict: 'reanchored', from: newLine, to: '  if (false) return launch(gamma)' })
  const why = (...args) => reanchorEntry(...args).why ?? ''
  // The diff: none could be read.
  assert.match(why(entry, source, null), /^the diff/)
  // One added line: a sibling the change did not add; S before P; P twice on the line.
  assert.match(why(entry, source, new Set()), /^one added line/)
  const backwards = ') return launch(gamma);  if (isReady(alpha, beta)'
  assert.match(why(entry, `const before = 1\n${backwards}\n`, new Set([backwards.trim()])), /^one added line/)
  const twice = '  if (isReady(alpha) ||  if (beta)) return launch(gamma)'
  assert.match(why(entry, `const before = 1\n${twice}\n`, new Set([twice.trim()])), /^one added line/)
  // One added line, the tie-break: two fit, and the nearest of them is chosen.
  const other = '  if (other(x)) return launch(gamma)'
  assert.deepEqual(reanchorEntry(entry, `${other}\n${newLine}\n`, new Set([other.trim(), newLine.trim()])),
    { verdict: 'reanchored', from: newLine, to: '  if (false) return launch(gamma)' })
  // One in the file: the chosen line occurs twice.
  assert.match(why(entry, `${source}${newLine}\n`, added), /^one in the file/)
  // The anchors: an empty S anchors at the end of the line.
  const verdictLine = '  const verdict = computeWith(alpha, beta, gamma)'
  assert.deepEqual(reanchorEntry({ label: 's', file: 'x', from: '  const verdict = compute(alpha, beta)', to: '  const verdict = null' },
    `${verdictLine}\n`, new Set([verdictLine.trim()])), { verdict: 'reanchored', from: verdictLine, to: '  const verdict = null' })
  // A refusal at ADR-069's condition 5 passes through unchanged.
  const sibling = { label: 'p', file: 'x', from: "  if (word === 'a' || word === 'b') return 1", to: "  if (word === 'b') return 1" }
  const siblingSource = "const before = 1\n  if (word === 'a' || word === 'b' || word === 'c') return 1\n"
  assert.deepEqual(reanchorEntry(sibling, siblingSource, new Set()), repointEntry(sibling, siblingSource, new Set()))
  assert.match(repointEntry(sibling, siblingSource, new Set()).why, /^5:/)
})

test('campaignPaths keeps every campaign file inside the root it is given', () => {
  const scratch = join(tmpdir(), 'qh-campaign-root')
  const paths = campaignPaths(scratch, {})
  assert.deepEqual(Object.keys(paths).sort(), ['cache', 'catalogue', 'journal', 'lock'])
  for (const file of Object.values(paths)) assert.ok(file.startsWith(scratch + sep), file)
  // With no root given, they are where a campaign has always kept them.
  const here = resolve(HERE, '..')
  assert.deepEqual(campaignPaths(here, {}), {
    catalogue: join(here, 'tests', 'mutations.json'), lock: join(here, '.mutate-lock'),
    journal: join(here, '.mutate-inflight.json'), cache: join(here, '.mutation-cache.json'),
  })
  // The suite's own lock override moves the journal with it.
  const moved = campaignPaths(scratch, { QUALITY_HARNESS_MUTATE_LOCK: join(scratch, 'other.lock') })
  assert.equal(moved.journal, `${moved.lock}.inflight.json`)
})

test('mutate --repoint reads a scratch repository, writes nothing, and exits 1 while an entry is stale', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-repoint-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const before = "export function f(word) {\n  if (word === 'a' || word === 'b') return 1\n  return 0\n}\nexport const g = () => 'kept'\n"
    const catalogue = `${JSON.stringify({ mutations: [
      { label: 'mechanical', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: "  if (word === 'a' || word === 'b') return 1", to: "  if (word === 'b') return 1" },
      { label: 'rewrite', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: '  return 0', to: '  return 9' },
      { label: 'current', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: "export const g = () => 'kept'", to: "export const g = () => 'lost'" },
    ] }, null, 2)}\n`
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), before)
    writeFileSync(join(repo, 'tests', 'mutations.json'), catalogue)
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base')
    const repoint = () => spawnSync(process.execPath, [runner, '--root', repo, '--repoint'], { cwd: repo, encoding: 'utf8', timeout: 60_000 })
    const clean = repoint()
    assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`)
    // The refactor, left uncommitted: the line gains a case, and the return is rewritten.
    const after = before.replace("word === 'b') return 1", "word === 'b' || word === 'c') return 1").replace('  return 0', '  return word.length')
    writeFileSync(join(repo, 'a.mjs'), after)
    const stale = repoint()
    assert.equal(stale.status, 1, `${stale.stdout}\n${stale.stderr}`)
    assert.ok(stale.stdout.includes('REPOINT  mechanical'), stale.stdout)
    assert.ok(stale.stdout.includes("+   if (word === 'a' || word === 'b' || word === 'c') return 1"), stale.stdout)
    assert.ok(stale.stdout.includes("to   if (word === 'b' || word === 'c') return 1"), stale.stdout)
    assert.ok(stale.stdout.includes('REFUSED  rewrite'), stale.stdout)
    assert.ok(!stale.stdout.includes('current'), 'a current entry is not mentioned')
    assert.equal(readFileSync(join(repo, 'tests', 'mutations.json'), 'utf8'), catalogue, 'the catalogue is untouched')
    assert.equal(readFileSync(join(repo, 'a.mjs'), 'utf8'), after, 'the source is untouched')
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-069 T2. The whole write path in a scratch repository whose refactor is left
// uncommitted, as it is after a real one: consent first, then only the proposals
// rewritten, then each measured, and exit 0 only when all are RED and nothing is stale.
test('mutate --repoint --write rewrites only what it proposed, measures it, and names what stayed refused', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-repoint-write-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '' }
    const write = (...extra) => spawnSync(process.execPath, [runner, '--root', repo, '--repoint', '--write', ...extra], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    const oldLine = "  if (word === 'a' || word === 'b') return 1"
    const newLine = "  if (word === 'a' || word === 'b' || word === 'c') return 1"
    const mechanical = { label: 'mechanical', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: oldLine, to: "  if (word === 'b') return 1" }
    const rewrite = { label: 'rewrite', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: '  return 0', to: '  return 9' }
    const untouched = { label: 'untouched', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: "export const g = () => 'kept'", to: "export const g = () => 'lost'" }
    const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
    const catalogueFile = join(repo, 'tests', 'mutations.json')
    const strongTest = "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { f, g } from '../a.mjs'\n"
      + "test('f and g', () => { assert.equal(f('a'), 1); assert.equal(f('zz'), 12); assert.equal(g(), 'kept') })\n"
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), `export function f(word) {\n${oldLine}\n  return 0\n}\nexport const g = () => 'kept'\n`)
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), strongTest.replace("assert.equal(f('zz'), 12); ", ''))
    writeFileSync(catalogueFile, serialize([mechanical, rewrite, untouched]))
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base')
    // The refactor, uncommitted: the line gains a case, and the return is rewritten.
    writeFileSync(join(repo, 'a.mjs'), `export function f(word) {\n${newLine}\n  return word.length + 10\n}\nexport const g = () => 'kept'\n`)
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), strongTest)

    // No consent: nothing is written.
    const refused = write()
    assert.equal(refused.status, 2, `${refused.stdout}\n${refused.stderr}`)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([mechanical, rewrite, untouched]))

    // Consent: only the proposal is rewritten and it is measured; the refused entry keeps
    // the exit at 1, and every other byte of the catalogue is as it was.
    const repointedMechanical = { ...mechanical, from: newLine, to: "  if (word === 'b' || word === 'c') return 1" }
    const forced = write('--force')
    assert.equal(forced.status, 1, `${forced.stdout}\n${forced.stderr}`)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([repointedMechanical, rewrite, untouched]))
    assert.ok(forced.stdout.includes('REFUSED  rewrite'), forced.stdout)
    assert.ok(forced.stdout.includes('1/1 mutations were noticed.'), forced.stdout)
    assert.ok(forced.stdout.includes('still stale'), forced.stdout)

    // With nothing left refused, the same write exits 0.
    writeFileSync(catalogueFile, serialize([mechanical, untouched]))
    const clean = write('--force')
    assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([repointedMechanical, untouched]))

    // A test that cannot notice the repointed mutant: GREEN, named, and exit 1.
    writeFileSync(catalogueFile, serialize([mechanical, untouched]))
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { f } from '../a.mjs'\ntest('f exists', () => { assert.equal(typeof f, 'function') })\n")
    const weak = write('--force')
    assert.equal(weak.status, 1, `${weak.stdout}\n${weak.stderr}`)
    assert.ok(weak.stdout.includes('GREEN'), weak.stdout)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-071 T2. --reanchor answers only where it is asked. --repoint alone prints what it
// always printed; with the flag, a rewritten line is proposed as REANCHOR and the write
// measures it; and --reanchor without --repoint is a usage error the usage line names.
test('mutate --repoint --reanchor proposes what repointEntry refused, and --repoint alone is unchanged', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-reanchor-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '' }
    const run = (...extra) => spawnSync(process.execPath, [runner, '--root', repo, ...extra], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    const oldLine = '  if (alpha > 0 && beta > 0) return launch(beta)'
    const newLine = '  if (Math.min(alpha, beta) > -1) return launch(beta)'
    const anchored = { label: 'anchored', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: oldLine, to: '  if (false) return launch(beta)' }
    const thin = { label: 'thin', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: '  return 0', to: '  return 9' }
    const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
    const catalogueFile = join(repo, 'tests', 'mutations.json')
    const source = line => `export const launch = x => x * 2\nexport function g(alpha, beta) {\n${line}\n  return ${line === oldLine ? '0' : '-1'}\n}\n`
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), source(oldLine))
    writeFileSync(join(repo, 'tests', 'a.test.mjs'),
      "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { g } from '../a.mjs'\ntest('g', () => { assert.equal(g(1, 3), 6) })\n")
    writeFileSync(catalogueFile, serialize([anchored, thin]))
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base')
    writeFileSync(join(repo, 'a.mjs'), source(newLine))

    // --repoint alone: ADR-069's output, both refused, nothing re-anchored.
    const plain = run('--repoint')
    assert.equal(plain.status, 1, `${plain.stdout}\n${plain.stderr}`)
    assert.ok(plain.stdout.includes('REFUSED  anchored — 3:'), plain.stdout)
    assert.ok(plain.stdout.includes('REFUSED  thin — 3:'), plain.stdout)
    assert.ok(!plain.stdout.includes('REANCHOR'), plain.stdout)
    assert.ok(plain.stdout.includes('2 stale: 0 repointable, 2 refused. Nothing was written.'), plain.stdout)

    // With --reanchor: the rewritten line is proposed; the thin anchor is refused by its rule.
    const flagged = run('--repoint', '--reanchor')
    assert.equal(flagged.status, 1, `${flagged.stdout}\n${flagged.stderr}`)
    assert.ok(flagged.stdout.includes('REANCHOR  anchored'), flagged.stdout)
    assert.ok(flagged.stdout.includes(`+ ${newLine}`), flagged.stdout)
    assert.ok(flagged.stdout.includes('to   if (false) return launch(beta)'), flagged.stdout)
    assert.ok(flagged.stdout.includes('REFUSED  thin — the anchor floor:'), flagged.stdout)
    assert.ok(flagged.stdout.includes('2 stale: 0 repointable, 1 re-anchored, 1 refused. Nothing was written.'), flagged.stdout)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([anchored, thin]))

    // --write: only the re-anchored entry changes, and it is measured.
    const written = run('--repoint', '--reanchor', '--write', '--force')
    assert.equal(written.status, 1, `${written.stdout}\n${written.stderr}`)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([{ ...anchored, from: newLine, to: '  if (false) return launch(beta)' }, thin]))
    assert.ok(written.stdout.includes('1/1 mutations were noticed.'), written.stdout)

    // The flag is discoverable, and means nothing without --repoint.
    const usage = run('--bogus')
    assert.equal(usage.status, 2)
    assert.match(usage.stderr, /--reanchor/)
    const alone = run('--reanchor')
    assert.equal(alone.status, 2, `${alone.stdout}\n${alone.stderr}`)
    assert.match(alone.stderr, /--reanchor.*--repoint/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// BACKLOG §310: a campaign re-runs suites once per mutant, and what a test forgot to
// remove stayed once per mutant, 15,885 directories from one test file on one Mac. Each
// child writes under a scratch temp directory the campaign removes when the child ends.
test('a campaign leaves nothing in the temp directory, whatever its tests forget', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-mutate-tmp-'))
  const probe = mkdtempSync(join(tmpdir(), 'qh-mutate-probe-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), 'export const f = () => 1\n')
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport { mkdtempSync } from 'node:fs'\n"
      + "import { tmpdir } from 'node:os'\nimport { join } from 'node:path'\nimport test from 'node:test'\nimport { f } from '../a.mjs'\n"
      + "test('f', () => { mkdtempSync(join(tmpdir(), 'forgotten-')); assert.equal(f(), 1) })\n")
    writeFileSync(join(repo, 'tests', 'mutations.json'), `${JSON.stringify({ mutations: [
      { label: 'm', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' },
    ] }, null, 2)}\n`)
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base', '--no-verify')
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const run = spawnSync(process.execPath, [runner, '--root', repo, '--force', '--no-cache'], {
      cwd: repo, encoding: 'utf8', timeout: 180_000,
      env: { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '', TMPDIR: probe, TMP: probe, TEMP: probe },
    })
    assert.match(run.stdout, /1\/1 mutations were noticed/, `${run.stdout}\n${run.stderr}`)
    assert.deepEqual(readdirSync(probe), [], 'what the child forgot went with its scratch directory')
  } finally {
    rmSync(repo, { recursive: true, force: true })
    rmSync(probe, { recursive: true, force: true })
  }
})

// ADR-072 T1. The campaign's cache is the only record of which tests killed a mutant,
// and a narrowing is built from it. A RED record carries its killers, a GREEN entry is
// not stored, and a RED record without killers, as every record before ADR-072 is, is
// measured again rather than reused, so no old record reaches a narrowing.
test('the campaign cache records the tests that killed each RED entry', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-killers-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '' }
    const campaign = () => spawnSync(process.execPath, [runner, '--root', repo], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    const cacheFile = join(repo, '.mutation-cache.json')
    const records = () => Object.values(JSON.parse(readFileSync(cacheFile, 'utf8')).entries).map(record => [record.label, record.killers])
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), "export const f = () => 1\nexport const g = () => 'kept'\n")
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { f, g } from '../a.mjs'\n"
      + "test('f is one', () => { assert.equal(f(), 1) })\ntest('g exists', () => { assert.equal(typeof g, 'function') })\n")
    writeFileSync(join(repo, 'tests', 'mutations.json'), `${JSON.stringify({ mutations: [
      { label: 'red', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' },
      { label: 'green', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: "export const g = () => 'kept'", to: "export const g = () => 'lost'" },
    ] }, null, 2)}\n`)
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base', '--no-verify')

    // Measured: the RED record names its killer, and the GREEN entry is not stored.
    const first = campaign()
    assert.ok(first.stdout.includes('1/2 mutations were noticed.'), `${first.stdout}\n${first.stderr}`)
    assert.deepEqual(records(), [['red', ['f is one']]])

    // Reused while the record carries its killers: the control for the step below.
    const second = campaign()
    assert.ok(second.stdout.includes('REUSED   red'), `${second.stdout}\n${second.stderr}`)

    // The same record without its killers is measured again, and stored with them.
    const cache = JSON.parse(readFileSync(cacheFile, 'utf8'))
    for (const record of Object.values(cache.entries)) delete record.killers
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`)
    const third = campaign()
    assert.ok(!third.stdout.includes('REUSED'), `${third.stdout}\n${third.stderr}`)
    assert.ok(third.stdout.includes('1/2 mutations were noticed.'), third.stdout)
    assert.deepEqual(records(), [['red', ['f is one']]])
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-072 T2. A narrowing names exactly the tests the cache saw kill the entry, each
// escaped and the alternation anchored, and it refuses what it cannot prove.
test('narrowEntry proposes exactly the recorded killers, escaped and anchored, and refuses what it cannot prove', () => {
  const { narrowEntry } = mutateModule
  assert.equal(typeof narrowEntry, 'function', 'mutate.mjs exports narrowEntry')
  const entry = { label: 'e', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'x', to: 'y' }
  const source = "test('a', () => {})\ntest('b.c(x)', () => {})\nfor (const name of names) test(`corpus ${name}: reads`, () => {})\n"
  const sources = file => (file === 'tests/a.test.mjs' ? source : null)
  const red = killers => ({ verdict: 'RED', sha: 'abc1234', killers })
  const narrowed = narrowEntry(entry, red(['a', 'b.c(x)', 'a']), sources)
  assert.deepEqual(narrowed, { verdict: 'narrowed', only: '^(?:a|b\\.c\\(x\\))$' })
  // The pattern selects each killer and nothing that merely resembles one.
  const pattern = new RegExp(narrowed.only)
  for (const name of ['a', 'b.c(x)']) assert.ok(pattern.test(name), name)
  for (const name of ['ab', 'a b', 'b.c(x) again', 'bxc(x)', 'b.cx']) assert.ok(!pattern.test(name), name)
  // Each refusal names the condition that failed.
  const refused = (answer, why) => {
    assert.equal(answer.verdict, 'refused', JSON.stringify(answer))
    assert.ok(answer.why.includes(why), answer.why)
  }
  refused(narrowEntry(entry, red(['corpus alpha: reads']), sources), '"corpus alpha: reads"')
  refused(narrowEntry(entry, red(['a', 'defined nowhere']), sources), '"defined nowhere"')
  refused(narrowEntry({ ...entry, tests: ['tests/other.test.mjs'] }, red(['a']), sources), 'not a string literal in a file it names')
  refused(narrowEntry(entry, red([]), sources), 'no killers were recorded')
  refused(narrowEntry(entry, { verdict: 'RED', sha: 'abc1234' }, sources), 'no killers were recorded')
  refused(narrowEntry({ ...entry, only: 'kept' }, red(['a']), sources), 'it already has an only')
  refused(narrowEntry(entry, { verdict: 'GREEN', killers: ['a'] }, sources), 'no RED verdict at its current key')
  refused(narrowEntry(entry, null, sources), 'no RED verdict at its current key')
})

// ADR-072 T2. --narrow reads the catalogue and the cache and writes nothing. With
// --write it narrows under the campaign lock, measures each narrowed entry, and takes
// the pattern back from one that is not RED under it. Never over an uncommitted
// subject, and never with --force.
test('mutate --narrow proposes, writes only with --write, and undoes a narrowing that is not RED', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-narrow-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '' }
    const run = (...extra) => spawnSync(process.execPath, [runner, '--root', repo, ...extra], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    const catalogueFile = join(repo, 'tests', 'mutations.json')
    const cacheFile = join(repo, '.mutation-cache.json')
    const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
    const subject = 'export const f = () => 1\nexport const g = () => 2\nexport const h = () => 3\n'
    const fe = { label: 'fe', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' }
    const ge = { label: 'ge', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const g = () => 2', to: 'export const g = () => 3' }
    const kept = { label: 'kept', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const h = () => 3', to: 'export const h = () => 4', only: 'h is three' }
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), subject)
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { f, g, h } from '../a.mjs'\n"
      + "test('f is one', () => { assert.equal(f(), 1) })\ntest('g is two', () => { assert.equal(g(), 2) })\n"
      + "test('h is three', () => { assert.equal(h(), 3) })\ntest('all exist', () => { assert.equal(typeof f + typeof g + typeof h, 'functionfunctionfunction') })\n")
    writeFileSync(catalogueFile, serialize([fe, ge, kept]))
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base', '--no-verify')

    // A campaign records the killers (T1). Then ge's record is made to name a test that
    // does not kill it, which is what a wrong or stale record looks like.
    const measured = run()
    assert.ok(measured.stdout.includes('3/3 mutations were noticed.'), `${measured.stdout}\n${measured.stderr}`)
    const cache = JSON.parse(readFileSync(cacheFile, 'utf8'))
    for (const record of Object.values(cache.entries)) if (record.label === 'ge') record.killers = ['all exist']
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`)

    // Read-only by default: each proposal and each refusal is printed, and nothing is written.
    const proposed = run('--narrow')
    assert.equal(proposed.status, 0, `${proposed.stdout}\n${proposed.stderr}`)
    assert.ok(proposed.stdout.includes('NARROW   fe\n  only ^(?:f is one)$'), proposed.stdout)
    assert.ok(proposed.stdout.includes('NARROW   ge\n  only ^(?:all exist)$'), proposed.stdout)
    assert.ok(proposed.stdout.includes('REFUSED  kept — it already has an only'), proposed.stdout)
    assert.ok(proposed.stdout.includes('Nothing was written.'), proposed.stdout)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([fe, ge, kept]))

    // Not over an uncommitted subject, even one whose killers were recorded, and never with --force.
    writeFileSync(join(repo, 'a.mjs'), `${subject}// uncommitted\n`)
    assert.ok(run('--force').stdout.includes('3/3 mutations were noticed.'))
    const dirty = run('--narrow', '--write')
    assert.equal(dirty.status, 2, `${dirty.stdout}\n${dirty.stderr}`)
    writeFileSync(join(repo, 'a.mjs'), subject)
    assert.equal(run('--narrow', '--write', '--force').status, 2)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([fe, ge, kept]))

    // --write narrows both, measures each, and undoes the one that is not RED under its pattern.
    const written = run('--narrow', '--write')
    assert.equal(written.status, 1, `${written.stdout}\n${written.stderr}`)
    assert.ok(written.stdout.includes('UNDONE   ge'), written.stdout)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([{ ...fe, only: '^(?:f is one)$' }, ge, kept]))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-072 T2. A narrowed entry whose killer is renamed selects nothing, and an entry
// that selects nothing is UNPROVEN, which fails no campaign. --stale names it.
test('mutate --stale names a narrowed entry whose killer is no longer defined', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-narrow-stale-'))
  try {
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const stale = () => spawnSync(process.execPath, [runner, '--root', repo, '--stale'], { cwd: repo, encoding: 'utf8', timeout: 60_000 })
    const testFile = join(repo, 'tests', 'a.test.mjs')
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), 'export const f = () => 1\n')
    writeFileSync(join(repo, 'tests', 'mutations.json'), `${JSON.stringify({ mutations: [
      { label: 'narrowed-f', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2', only: '^(?:f is one|f\\.call\\(\\) works)$' },
    ] }, null, 2)}\n`)
    const defining = "test('f is one', () => {})\ntest('f.call() works', () => {})\n"
    writeFileSync(testFile, defining)
    const clean = stale()
    assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`)
    assert.ok(clean.stdout.includes('every entry matches its source exactly once'), clean.stdout)
    // The killer renamed: its pattern would select nothing, so --stale names the entry and the name.
    writeFileSync(testFile, defining.replace("'f is one'", "'f is 1'"))
    const renamed = stale()
    assert.equal(renamed.status, 1, `${renamed.stdout}\n${renamed.stderr}`)
    assert.ok(renamed.stdout.includes('narrowed-f'), renamed.stdout)
    assert.ok(renamed.stdout.includes('"f is one"'), renamed.stdout)
    assert.ok(!renamed.stdout.includes('"f.call() works"'), renamed.stdout)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-072 T4 (Codex review of T1 and T2). A killer's name is defined only by a string
// literal token of its file: not in a comment, inside a fixture string or a regular
// expression, or bare in code. The literals after a regular expression, a division and
// a template are still found, so the reading does not lose its place.
test('narrowEntry reads a killer only from a string literal its file holds', () => {
  const { narrowEntry } = mutateModule
  const source = [
    "// test('in a line comment', () => {})",
    "/* test('in a block comment', () => {}) */",
    "const fixture = \"test('in a fixture string', () => {})\"",
    "for (const names of lists) test(`corpus ${names}: reads`, () => {})",
    "assert.match(text, /it's in a regex/)",
    "test('after a regex', () => {})",
    "const half = total / 2; test('after a division', () => {}) // 2 / 1",
    "test(`a plain template`, () => {})",
    "test(\"double quoted\", () => {})",
  ].join('\n')
  const entry = { label: 'e', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'x', to: 'y' }
  const sources = file => (file === 'tests/a.test.mjs' ? source : null)
  const red = killers => ({ verdict: 'RED', sha: 'abc1234', killers })
  for (const name of ['in a line comment', 'in a block comment', 'in a fixture string', "it's in a regex", 'names', 'corpus alpha: reads']) {
    const answer = narrowEntry(entry, red([name]), sources)
    assert.equal(answer.verdict, 'refused', name)
    assert.ok(answer.why.includes(JSON.stringify(name)), answer.why)
  }
  for (const name of ['after a regex', 'after a division', 'a plain template', 'double quoted']) {
    assert.equal(narrowEntry(entry, red([name]), sources).verdict, 'narrowed', name)
  }
})

// ADR-072 T4. A mutant two tests kill records both, so a narrowing keeps both.
test('the campaign cache records every test that killed an entry', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-killers-two-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '' }
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), 'export const f = () => 1\n')
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { f } from '../a.mjs'\n"
      + "test('f is one', () => { assert.equal(f(), 1) })\ntest('f is odd', () => { assert.equal(f() % 2, 1) })\n")
    writeFileSync(join(repo, 'tests', 'mutations.json'), `${JSON.stringify({ mutations: [
      { label: 'both', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' },
    ] }, null, 2)}\n`)
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base', '--no-verify')
    const run = spawnSync(process.execPath, [runner, '--root', repo], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    assert.ok(run.stdout.includes('1/1 mutations were noticed.'), `${run.stdout}\n${run.stderr}`)
    const records = Object.values(JSON.parse(readFileSync(join(repo, '.mutation-cache.json'), 'utf8')).entries)
    assert.deepEqual(records.map(record => [record.label, [...record.killers].sort()]), [['both', ['f is odd', 'f is one']]])
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-072 T4. --narrow refuses an option it does not take, and a repeated label, before
// any branch does work. --write measures exactly the entries it narrowed, each afresh: a
// RED verdict cached at a narrowed key is not reused, and only what is RED is written.
test('mutate --narrow --write measures only what it narrowed, fresh, and refuses before any work', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-narrow-fresh-'))
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '' }
    const run = (...extra) => spawnSync(process.execPath, [runner, '--root', repo, ...extra], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    const catalogueFile = join(repo, 'tests', 'mutations.json')
    const cacheFile = join(repo, '.mutation-cache.json')
    const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
    const fe = { label: 'fe', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' }
    const ge = { label: 'ge', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const g = () => 2', to: 'export const g = () => 3' }
    const kept = { label: 'kept', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const h = () => 3', to: 'export const h = () => 4', only: 'h is three' }
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), 'export const f = () => 1\nexport const g = () => 2\nexport const h = () => 3\n')
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { f, g, h } from '../a.mjs'\n"
      + "test('f is one', () => { assert.equal(f(), 1) })\ntest('g is two', () => { assert.equal(g(), 2) })\n"
      + "test('h is three', () => { assert.equal(h(), 3) })\ntest('all exist', () => { assert.equal(typeof f + typeof g + typeof h, 'functionfunctionfunction') })\n")
    writeFileSync(catalogueFile, serialize([fe, ge, kept]))
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base', '--no-verify')
    const measured = run()
    assert.ok(measured.stdout.includes('3/3 mutations were noticed.'), `${measured.stdout}\n${measured.stderr}`)

    // ge's record names a test that does not kill it, and a RED verdict waits in the cache
    // at the key ge has once narrowed: the narrowing has to measure it, not reuse that.
    const cache = JSON.parse(readFileSync(cacheFile, 'utf8'))
    for (const record of Object.values(cache.entries)) if (record.label === 'ge') record.killers = ['all exist']
    const read = file => { try { return readFileSync(join(repo, file), 'utf8') } catch { return null } }
    cache.entries[cacheKey({ ...ge, only: '^(?:all exist)$' }, read)] = { verdict: 'RED', sha: 'abc1234', label: 'ge', ms: 1, killers: ['all exist'] }
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`)

    // Refused before any branch works: an option --narrow does not take, and a repeated label.
    for (const flag of ['--repoint', '--stale']) {
      const refused = run('--narrow', flag)
      assert.equal(refused.status, 2, `${flag}\n${refused.stdout}\n${refused.stderr}`)
    }
    const twice = [fe, ge, kept, { ...fe, from: 'export const h = () => 3', to: 'export const h = () => 5' }]
    writeFileSync(catalogueFile, serialize(twice))
    const repeated = run('--narrow', '--write')
    assert.equal(repeated.status, 2, `${repeated.stdout}\n${repeated.stderr}`)
    assert.ok(repeated.stderr.includes('fe'), repeated.stderr)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize(twice))
    writeFileSync(catalogueFile, serialize([fe, ge, kept]))

    // Exactly the two narrowed entries are measured, both afresh, and only the RED one is written.
    const written = run('--narrow', '--write')
    assert.equal(written.status, 1, `${written.stdout}\n${written.stderr}`)
    assert.ok(!written.stdout.includes('REUSED'), written.stdout)
    assert.ok(written.stdout.includes('1/2 mutations were noticed.'), written.stdout)
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([{ ...fe, only: '^(?:f is one)$' }, ge, kept]))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-072 T4. A narrowing is written only after it is measured, so a run killed while it
// measures leaves the catalogue as it was. SIGKILL, because the runner is synchronous: a
// SIGTERM waits for the run to end, and a kill is what a crash or a host timeout is. The
// killer marks when it runs, then takes long enough to be killed.
test('mutate --narrow --write leaves nothing narrowed when it is stopped mid-measurement', async () => {
  const { spawn } = await import('node:child_process')
  const { existsSync } = await import('node:fs')
  const repo = mkdtempSync(join(tmpdir(), 'qh-narrow-stop-'))
  const mark = join(repo, 'measuring')
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '', QH_NARROW_MARK: mark }
    const catalogueFile = join(repo, 'tests', 'mutations.json')
    const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
    const fe = { label: 'fe', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' }
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), 'export const f = () => 1\n')
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport { writeFileSync } from 'node:fs'\nimport test from 'node:test'\nimport { f } from '../a.mjs'\n"
      + "test('f is one, slowly', async () => { writeFileSync(process.env.QH_NARROW_MARK, 'x'); await new Promise(done => setTimeout(done, 3000)); assert.equal(f(), 1) })\n")
    writeFileSync(catalogueFile, serialize([fe]))
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base', '--no-verify')
    const measured = spawnSync(process.execPath, [runner, '--root', repo], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    assert.ok(measured.stdout.includes('1/1 mutations were noticed.'), `${measured.stdout}\n${measured.stderr}`)
    rmSync(mark, { force: true })

    const narrowing = spawn(process.execPath, [runner, '--root', repo, '--narrow', '--write'], { cwd: repo, env, stdio: 'ignore', windowsHide: true, timeout: 180_000 })
    const exited = new Promise(done => narrowing.on('exit', done))
    const deadline = Date.now() + 120_000
    while (!existsSync(mark) && Date.now() < deadline) await new Promise(done => setTimeout(done, 50))
    assert.ok(existsSync(mark), 'the narrowed measurement never started')
    narrowing.kill('SIGKILL')
    await exited
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([fe]), 'a stopped narrowing wrote the catalogue')
  } finally { rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }) }
})

// ADR-072 T4. --stale names every alternative of a narrowed pattern that is gone: a later
// one renamed, and one left only in a comment, and not the one still defined.
test('mutate --stale names every narrowed killer that is gone', () => {
  const repo = mkdtempSync(join(tmpdir(), 'qh-narrow-gone-'))
  try {
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const stale = () => spawnSync(process.execPath, [runner, '--root', repo, '--stale'], { cwd: repo, encoding: 'utf8', timeout: 60_000 })
    const testFile = join(repo, 'tests', 'a.test.mjs')
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), 'export const f = () => 1\n')
    writeFileSync(join(repo, 'tests', 'mutations.json'), `${JSON.stringify({ mutations: [
      { label: 'narrowed-f', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2', only: '^(?:first|second|third)$' },
    ] }, null, 2)}\n`)
    writeFileSync(testFile, "test('first', () => {})\ntest('second', () => {})\ntest('third', () => {})\n")
    const defined = stale()
    assert.equal(defined.status, 0, `${defined.stdout}\n${defined.stderr}`)
    writeFileSync(testFile, "test('first', () => {})\ntest('second, renamed', () => {})\n// test('third', () => {})\n")
    const gone = stale()
    assert.equal(gone.status, 1, `${gone.stdout}\n${gone.stderr}`)
    assert.ok(gone.stdout.includes('"second", "third"'), gone.stdout)
    assert.ok(!gone.stdout.includes('"first"'), gone.stdout)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// ADR-072 T5 (the second Codex review). A `/` after a control statement's condition, or
// after a postfix operator, is read as JavaScript reads it, so a quoted name inside a
// regular expression there defines nothing and the literals after it are still found.
test('literalsOf keeps its place after a control statement and a postfix operator', () => {
  const { narrowEntry } = mutateModule
  const source = [
    "if (ready) /'ghost in an if'/.test(x)",
    "while (more) /'ghost in a while'/.test(x)",
    "let n = 2; n++ / 2; const r = /'ghost after a postfix'/",
    "if (check(a, b)) /'ghost after nested parens'/.test(x)",
    "test('after them all', () => {})",
    "const q = (total) / 2; test('after a parenthesised division', () => {})",
  ].join('\n')
  const entry = { label: 'e', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'x', to: 'y' }
  const sources = file => (file === 'tests/a.test.mjs' ? source : null)
  const red = killers => ({ verdict: 'RED', sha: 'abc1234', killers })
  for (const name of ['ghost in an if', 'ghost in a while', 'ghost after a postfix', 'ghost after nested parens']) {
    assert.equal(narrowEntry(entry, red([name]), sources).verdict, 'refused', name)
  }
  for (const name of ['after them all', 'after a parenthesised division']) {
    assert.equal(narrowEntry(entry, red([name]), sources).verdict, 'narrowed', name)
  }
})

// ADR-072 T5. The catalogue is written after the mutants run, not after the baselines: a
// run killed while a mutant runs leaves it as it was. The killer marks only when it sees
// the mutated value, so the kill lands in the mutant measurement.
test('mutate --narrow --write leaves nothing narrowed when it is killed while a mutant runs', async () => {
  const { spawn } = await import('node:child_process')
  const { existsSync } = await import('node:fs')
  const repo = mkdtempSync(join(tmpdir(), 'qh-narrow-kill-'))
  const mark = join(repo, 'mutant-running')
  try {
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    const runner = join(HERE, '..', 'scripts', 'mutate.mjs')
    const env = { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '', QH_NARROW_MARK: mark }
    const catalogueFile = join(repo, 'tests', 'mutations.json')
    const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
    const fe = { label: 'fe', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: 'export const f = () => 1', to: 'export const f = () => 2' }
    mkdirSync(join(repo, 'tests'))
    writeFileSync(join(repo, 'a.mjs'), 'export const f = () => 1\n')
    writeFileSync(join(repo, 'tests', 'a.test.mjs'), "import assert from 'node:assert/strict'\nimport { writeFileSync } from 'node:fs'\nimport test from 'node:test'\nimport { f } from '../a.mjs'\n"
      + "test('f is one, slowly when it is not', async () => { if (f() !== 1) { writeFileSync(process.env.QH_NARROW_MARK, 'x'); await new Promise(done => setTimeout(done, 3000)) } assert.equal(f(), 1) })\n")
    writeFileSync(catalogueFile, serialize([fe]))
    git('init', '-q'); git('add', '.'); git('commit', '-qm', 'base', '--no-verify')
    const measured = spawnSync(process.execPath, [runner, '--root', repo], { cwd: repo, encoding: 'utf8', timeout: 180_000, env })
    assert.ok(measured.stdout.includes('1/1 mutations were noticed.'), `${measured.stdout}\n${measured.stderr}`)
    rmSync(mark, { force: true })

    const narrowing = spawn(process.execPath, [runner, '--root', repo, '--narrow', '--write'], { cwd: repo, env, stdio: 'ignore', windowsHide: true, timeout: 180_000 })
    const exited = new Promise(done => narrowing.on('exit', done))
    const deadline = Date.now() + 120_000
    while (!existsSync(mark) && Date.now() < deadline) await new Promise(done => setTimeout(done, 50))
    assert.ok(existsSync(mark), 'the mutant measurement never started')
    narrowing.kill('SIGKILL')
    await exited
    assert.equal(readFileSync(catalogueFile, 'utf8'), serialize([fe]), 'a killed narrowing wrote the catalogue')
  } finally { rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }) }
})
