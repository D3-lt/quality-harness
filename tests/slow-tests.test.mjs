import assert from 'node:assert/strict'
import test from 'node:test'

import { median, outliers, parseTap, run } from '../scripts/slow-tests.mjs'

/** A TAP fragment in the shape `node --test --test-reporter=tap` emits. */
const tap = entries => ['TAP version 13', ...entries.flatMap(([name, ms, indent = '']) =>
  [`${indent}ok 1 - ${name}`, `${indent}  ---`, `${indent}  duration_ms: ${ms}`, `${indent}  ...`])].join('\n')

test('a duration belongs to the assertion line above it, not the one after', () => {
  // TAP puts the YAML block AFTER its `ok` line, so a parser that pairs a
  // duration with the NEXT name attributes every time to the wrong test — and
  // the report then names an innocent test as the slow one, which is worse than
  // no report.
  const parsed = parseTap(tap([['first', 10], ['second', 900], ['third', 20]]))
  assert.deepEqual(parsed.map(t => [t.name, t.ms]), [['first', 10], ['second', 900], ['third', 20]])
})

test('a not-ok test is timed too, because a failure that took four minutes is the finding', () => {
  const parsed = parseTap('TAP version 13\nnot ok 1 - it broke\n  ---\n  duration_ms: 240000\n  ...')
  assert.deepEqual(parsed, [{ name: 'it broke', depth: 0, ok: false, ms: 240000 }])
})

test('an assertion with no duration is not paired with a later test\'s time', () => {
  // A test killed mid-run emits its `ok` line and no YAML block. Carrying the
  // pending name forward would hand it the NEXT test's duration.
  const parsed = parseTap('TAP version 13\nok 1 - killed\nok 2 - fine\n  ---\n  duration_ms: 5\n  ...')
  assert.deepEqual(parsed, [{ name: 'fine', depth: 0, ok: true, ms: 5 }])
})

test('the median is the run\'s own yardstick, so no table has to be kept anywhere', () => {
  assert.equal(median([1, 2, 3]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([]), null, 'an empty run has no yardstick, and 0 would divide badly')
})

test('a test far slower than its peers is named, and its peers are not', () => {
  const parsed = parseTap(tap([
    ['fast a', 10], ['fast b', 12], ['fast c', 11], ['fast d', 9],
    ['the slow one', 2400],
  ]))
  const result = outliers(parsed, { ratio: 20 })

  assert.equal(result.unusable, false)
  assert.deepEqual(result.found.map(t => t.name), ['the slow one'])
  assert.ok(result.found[0].ratio > 200, `ratio was ${result.found[0].ratio}`)

  // CLEAN, in the same test: raise the bar above the outlier and it is no longer
  // reported — so the check is shown separating the cases rather than naming the
  // slowest test whatever it costs.
  assert.deepEqual(outliers(parsed, { ratio: 1000 }).found, [])
})

test('a LOADED run reports nothing new, which is the property that makes this portable', () => {
  // The whole design: the yardstick moves WITH the machine. Ten times slower
  // across the board is a slow afternoon, not a finding — and on 2026-09-06 a
  // session nearly diagnosed exactly that as its own change breaking arch-lint.
  const idle = parseTap(tap([['a', 10], ['b', 12], ['c', 11], ['slow', 2400]]))
  const loaded = parseTap(tap([['a', 100], ['b', 120], ['c', 110], ['slow', 24000]]))

  assert.deepEqual(outliers(idle).found.map(t => t.name), outliers(loaded).found.map(t => t.name),
    'a uniformly slower run must produce the same answer, or the tool measures the machine')

  // DIRTY, in the same test: one test degrading RELATIVE to its peers does change
  // the answer, so the invariance above is not the tool simply ignoring durations.
  const degraded = parseTap(tap([['a', 100], ['b', 120], ['c', 110], ['slow', 24000], ['newly slow', 9000]]))
  assert.deepEqual(outliers(degraded).found.map(t => t.name), ['slow', 'newly slow'])
})

test('a suite line is not counted, because it carries the sum of its children', () => {
  // A parent's duration is its subtests added up, so counting parents pulls the
  // median up by the branching factor and hides the outliers this exists for.
  const nested = parseTap(tap([['child a', 10, '    '], ['child b', 10, '    '], ['a suite', 20]]))
  const result = outliers(nested, { ratio: 1.5 })
  assert.equal(result.counted, 1, 'only top-level tests form the yardstick')
  assert.deepEqual(parseTap(tap([['child', 10, '    ']]))[0].depth, 1, 'indentation is read as depth')
})

test('could-not-look is said in those words, and never as a clean run', () => {
  // ADR-005. An absent transcript, an empty one, and a genuinely fast suite must
  // not look alike — this is the arm a CI caller hits when an upload it expected
  // never happened.
  const said = []
  const log = m => said.push(m)

  assert.equal(run(['missing.tap'], { read: () => { const e = new Error('no'); e.code = 'ENOENT'; throw e }, log }), 0)
  assert.match(said.join('\n'), /UNRUN — could not read missing\.tap: ENOENT/)

  said.length = 0
  assert.equal(run(['empty.tap'], { read: () => 'TAP version 13\n', log }), 0)
  assert.match(said.join('\n'), /UNRUN — .* carries no timed tests/)

  // A run whose tests are all too fast to time cannot be judged by ratio either.
  said.length = 0
  run(['zero.tap'], { read: () => tap([['a', 0], ['b', 0], ['c', 0]]), log })
  assert.match(said.join('\n'), /UNRUN — the median of 3 test\(s\) is 0ms/)

  // CLEAN, in the same test: a readable run says a MEDIAN and a verdict about
  // outliers, and never the word UNRUN.
  said.length = 0
  run(['ok.tap'], { read: () => tap([['a', 10], ['b', 12], ['c', 11]]), log })
  assert.match(said.join('\n'), /median 11\.0ms over 3 top-level test\(s\)/)
  assert.match(said.join('\n'), /No test was far slower than its peers/)
  assert.doesNotMatch(said.join('\n'), /UNRUN/)
})

test('it reports and never blocks, whatever it finds', () => {
  // CLAUDE.md §3. A slow test is a place to look; a tool that exits non-zero on
  // one would make every loaded afternoon a red build.
  const log = () => {}
  assert.equal(run([], { read: () => '', log }), 0, 'no argument')
  assert.equal(run(['x.tap'], { read: () => tap([['a', 10], ['b', 10], ['huge', 99999]]), log }), 0,
    'an outlier found')
  assert.equal(run(['x.tap', '--json'], { read: () => tap([['a', 10], ['b', 10], ['huge', 99999]]), log }), 0)
})

test('--json carries the same answer the text does', () => {
  const said = []
  run(['x.tap', '--json'], { read: () => tap([['a', 10], ['b', 12], ['c', 11], ['huge', 5000]]), log: m => said.push(m) })
  const parsed = JSON.parse(said.join('\n'))
  assert.equal(parsed.counted, 4)
  assert.equal(parsed.median_ms, 11.5)
  assert.deepEqual(parsed.outliers.map(o => o.name), ['huge'])
})
