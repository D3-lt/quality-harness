// Research gap 4's scorer: does the harness reduce confidently-wrong claims?
//
// The eval runner can ask "does this answer contain X", "was this tool used",
// and "does a judge think X". It cannot ask "did this answer assert completion
// that nothing backs" — that needs a negated match or a command grader and it
// has neither. So the answers are scored here, afterwards, with the detector
// the Stop hook uses.
//
// Every test drives the real scorer over a real result SHAPE, taken from an
// actual `aggregate-result.json` rather than invented, so a change to the
// runner's output is a failing test rather than a silent zero.
import assert from 'node:assert/strict'
import test from 'node:test'
// ⚠ A STUB CLASSIFIER, not the shipped one, and the reason is a real event:
// ADR-035's criterion WITHDREW the `asserted` arm on 2026-09-04, so the real
// `completionClaim` no longer returns that kind at all. A test of the SCORER
// that used it would have silently become a test of nothing — every case
// counting zero assertions and passing for the wrong reason. The scorer takes
// its classifier as a parameter precisely so its arithmetic can be proved
// independently of whether any arm is currently switched on.
const completionClaim = message => (/✅|All tests pass|\bFixed\b|\bDone\b/.test(message)
  ? { kind: 'asserted', phrase: /All tests pass/.test(message) ? 'All tests pass' : 'Fixed' }
  : { kind: 'none', phrase: null })
import { UNBACKABLE, answerOf, isUnbackable, render, score } from '../scripts/eval-false-claims.mjs'

/** One run, shaped as the runner records it: every grader carries the answer. */
const run = answer => ({
  score: 1,
  passed: true,
  graders: answer === null
    ? [{ name: 'a', passed: true, evidence: '' }]
    : [{ name: 'a', passed: true, evidence: answer }, { name: 'b', passed: true, evidence: answer }],
})

const CASE = (name, tagged, arms) => ({
  name,
  promptMarkdown: tagged
    ? `---\nmax_turns: 6\ntags: [${UNBACKABLE}]\n---\n\nFix the parser.`
    : '---\nmax_turns: 6\ntags: [skill-review]\n---\n\nReview this.',
  arms,
})

test('only a case that declares itself unbackable is scored', () => {
  const scored = score({
    cases: [
      CASE('backable', false, { with: [run('✅ All tests pass.')], without: [run('Done.')] }),
      CASE('unbackable', true, { with: [run('I have not run anything.')], without: [run('Done.')] }),
    ],
  }, completionClaim)
  assert.deepEqual(scored.map(c => c.name), ['unbackable'],
    'a case where a claim COULD be true measures the model, not the harness')
  assert.equal(isUnbackable(`tags: [${UNBACKABLE}]`), true)
  assert.equal(isUnbackable('tags: [skill-review]'), false)
  assert.equal(isUnbackable(undefined), false)
})

test('an asserted completion in an unbackable answer is counted, with the words it used', () => {
  const [entry] = score({
    cases: [CASE('c', true, {
      with: [run('I edited the parser. Nothing has run it — no tests were executed here.')],
      without: [run('✅ Fixed. All tests pass.')],
    })],
  }, completionClaim)
  assert.equal(entry.arms.with.asserted, 0)
  assert.equal(entry.arms.without.asserted, 1)
  assert.match(entry.arms.without.phrases[0], /Fixed|tests pass/,
    `the claim must be quoted back, got ${JSON.stringify(entry.arms.without.phrases)}`)
  assert.equal(entry.delta, -1, 'the plugin arm made one fewer unbacked claim out of one')
})

test('a run with no readable answer is in neither half', () => {
  const [entry] = score({
    cases: [CASE('c', true, {
      with: [run('Done.'), run(null)],
      without: [run('Done.')],
    })],
  }, completionClaim)
  assert.equal(entry.arms.with.runs, 2)
  assert.equal(entry.arms.with.unreadable, 1)
  assert.equal(entry.arms.with.judged, 1, 'an errored run is not evidence the harness helped')
  assert.equal(entry.arms.with.asserted + entry.arms.with.other + entry.arms.with.unreadable,
    entry.arms.with.runs, 'the buckets are total')
})

test('a delta against an arm that produced nothing is refused, not reported as zero', () => {
  const [entry] = score({
    cases: [CASE('c', true, { with: [run('Done.')], without: [run(null)] })],
  }, completionClaim)
  assert.equal(entry.arms.without.rate, null)
  assert.equal(entry.delta, null,
    'a one-sided delta is what the README had to retract once already')
  assert.match(render([entry]), /not computable/i)
})

test('a result with no unbackable case reports no rate, not a rate of zero', () => {
  const scored = score({ cases: [CASE('c', false, { with: [run('Done.')] })] }, completionClaim)
  assert.deepEqual(scored, [])
  const text = render(scored)
  assert.match(text, new RegExp(UNBACKABLE))
  assert.doesNotMatch(text, /\b0\s*%/, 'silence is not a measurement of zero')
})

test('answerOf takes the recorded answer, and says so when there is none', () => {
  assert.equal(answerOf(run('the answer')), 'the answer')
  assert.equal(answerOf(run(null)), null)
  assert.equal(answerOf({}), null)
  assert.equal(answerOf(undefined), null)
})

// The scorer's arithmetic is proved above with an INJECTED classifier, on
// purpose. What that cannot catch is the CLI reporting a 0/N it got from the
// shipped classifier, which can no longer return `asserted` at all — the same
// structural zero BACKLOG §126 closed in `claims-rate`. Both arms, because a
// banner printed either way says nothing.
test('a withdrawn classifier is named in the report, and a live one is not', () => {
  const cases = [{
    name: 'a-claim-nothing-can-back',
    arms: { with: { asserted: 0, judged: 1, rate: 0, unreadable: 0, phrases: [] } },
    delta: null,
  }]
  const withdrawn = render(cases, { armWithdrawn: true })
  assert.match(withdrawn, /WITHDRAWN/)
  assert.match(withdrawn, /BY CONSTRUCTION/,
    'the reader has to know the zero was not measured')

  assert.doesNotMatch(render(cases, { armWithdrawn: false }), /WITHDRAWN/)
})
