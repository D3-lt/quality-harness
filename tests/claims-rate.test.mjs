// ADR-035 T3. The false-success rate, in ADR-010's four-bucket discipline.
//
// A rate is only honest when its denominator is stated and the rows it excluded
// are named. `adr-verify --sweep` settled this shape already: `superseded` and
// `unrunnable` sit in NEITHER half, because a claim that could not be re-checked
// is not a claim that held. The same rule here — `no-check`, `could-not-look`
// and `unavailable` are excluded and printed, never quietly counted as clean.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { render, tally } from '../plugin/scripts/claims-rate.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const reader = join(repoRoot, 'plugin', 'scripts', 'claims-rate.mjs')

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }) })

/** A ledger file with the given rows, one JSON line each. Raw strings pass through. */
function ledger(rows) {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-claims-rate-'))
  temps.push(dir)
  const file = join(dir, 'claims.jsonl')
  writeFileSync(file, rows.map(row => typeof row === 'string' ? row : JSON.stringify(row)).join('\n') + '\n', 'utf8')
  return file
}

const row = (claim, evidence) => ({
  at: '2026-09-04T10:00:00.000Z', event: 'Stop', cwd: '/repo', session: 's1',
  claim, phrase: claim === 'asserted' ? 'All tests pass' : null, evidence, mutations: 2,
})

const run = (...args) => spawnSync(process.execPath, [reader, ...args], { encoding: 'utf8', timeout: 60_000 })

test('the four buckets are disjoint, total, and the excluded ones are in neither half', () => {
  const file = ledger([
    row('asserted', 'unverified'), row('asserted', 'unverified'),   // false: 2
    row('asserted', 'verified'), row('asserted', 'verified'), row('asserted', 'verified'),
    row('none', 'unverified'),                                      // held: 4 with the three above
    row('hedged', 'no-check'),                                      // excluded
    row('none', 'could-not-look'),                                  // excluded
    row('unavailable', 'unverified'),                               // excluded: no claim to judge
  ])
  const out = run('--ledger', file)
  assert.equal(out.status, 0, out.stderr)

  const json = JSON.parse(run('--ledger', file, '--json').stdout)
  assert.equal(json.false, 2)
  assert.equal(json.held, 4)
  assert.equal(json.denominator, 6, 'false + held, and nothing else')
  assert.equal(json.excluded, 3)
  assert.equal(json.rows, 9)
  assert.equal(json.false + json.held + json.excluded, json.rows,
    'the buckets are total: every row lands in exactly one')
  // The rate is never printed without the denominator beside it.
  assert.match(out.stdout, /2\s*\/\s*6/, out.stdout)
  assert.match(out.stdout, /excluded/i, out.stdout)
  // And the exclusions are named, not merely counted.
  assert.match(out.stdout, /no-check/, out.stdout)
  assert.match(out.stdout, /could-not-look/, out.stdout)
})

test('zero observations prints no rate', () => {
  const out = run('--ledger', ledger([]))
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /no observations/i, out.stdout)
  // ADR-005: "I could not look" is not a number. A 0% here would read as a
  // corpus with no false successes, which is the opposite of what it means.
  assert.doesNotMatch(out.stdout, /\b0(\.0+)?\s*%/, `a rate over nothing is not a rate\n${out.stdout}`)
  const json = JSON.parse(run('--ledger', ledger([]), '--json').stdout)
  assert.equal(json.denominator, 0)
  assert.equal(json.rate, null, 'no denominator, no rate')
})

test('a malformed row is counted and named, never dropped', () => {
  const file = ledger([row('asserted', 'unverified'), '{not json', row('none', 'verified')])
  const out = run('--ledger', file)
  assert.equal(out.status, 0, out.stderr)
  assert.match(out.stdout, /line 2/, `the unreadable row must be located\n${out.stdout}`)
  const json = JSON.parse(run('--ledger', file, '--json').stdout)
  assert.equal(json.rows, 3)
  assert.equal(json.unreadable, 1)
  assert.equal(json.false + json.held + json.excluded, json.rows,
    'an unreadable row is excluded, not dropped: the buckets still total')
})

test('a ledger that is not there is said, not counted as clean', () => {
  const out = run('--ledger', join(os.tmpdir(), 'qh-claims-rate-absent', 'claims.jsonl'))
  assert.equal(out.status, 0, 'reading is not judging: the reader never fails')
  assert.match(out.stdout, /no ledger|not been recorded|no observations/i, out.stdout)
  assert.doesNotMatch(out.stdout, /\b0(\.0+)?\s*%/, 'an absent ledger is not a zero rate')
})

test('--json carries the same buckets as the text', () => {
  const file = ledger([row('asserted', 'unverified'), row('asserted', 'verified'), row('none', 'no-check')])
  const text = run('--ledger', file).stdout
  const json = JSON.parse(run('--ledger', file, '--json').stdout)
  assert.equal(json.false, 1)
  assert.equal(json.held, 1)
  assert.equal(json.excluded, 1)
  assert.match(text, new RegExp(`${json.false}\\s*/\\s*${json.denominator}`),
    `the two outputs must agree\ntext: ${text}\njson: ${JSON.stringify(json)}`)
  // A `rate` key with no `denominator` beside it is how a number gets quoted
  // without its sample size.
  assert.ok('denominator' in json, 'the rate never travels without its denominator')
})

// BACKLOG §124 warned in PROSE that a zero in the false half means the arm is
// off. The tool that prints the number said nothing, so a reader saw "0 / 4
// completion claims were false successes (0.0%)" — a clean rate from a detector
// that cannot fire. Both arms are asserted here because a label that is always
// printed carries no information either.
test('a withdrawn arm is named in the rate, and a live one is not', () => {
  const counts = {
    rows: 4, false: 0, held: 4, excluded: 0, unreadable: 0, by: {},
    unreadableLines: [], denominator: 4, rate: 0,
  }
  const withdrawn = render(counts, 'ledger.jsonl', { armWithdrawn: true })
  assert.match(withdrawn, /0 \/ 4 completion claims were false successes/,
    'the arithmetic is unchanged — historical rows still count')
  assert.match(withdrawn, /WITHDRAWN/,
    'a zero the arm cannot move must say so, or it reads as a measurement')

  const live = render(counts, 'ledger.jsonl', { armWithdrawn: false })
  assert.doesNotMatch(live, /WITHDRAWN/,
    'a label printed unconditionally tells a reader nothing')
})

// The tie the Codex review of 0a18d04 asked for, and it is the one thing that
// keeps `ASSERTION_ARM_WITHDRAWN` from going stale: it is a LABEL every reporter
// prints, and nothing stopped a one-line edit setting it to `false` while no
// classifier existed to make that true. Then the warnings vanish, the JSON says
// `assertionArm: "live"`, and the structural zero is back with nothing saying so.
test('the withdrawn label matches the classifier that actually exists', async () => {
  const { ASSERTION_ARM_WITHDRAWN } = await import('../plugin/scripts/claim-status.mjs')
  const { completionClaim } = await import('../plugin/scripts/lifecycle.mjs')

  const confident = [
    '✅ All tests pass. Task complete.',
    'Done — everything works now.',
    'Fixed and verified; the suite is green.',
    'Implemented. All checks passing.',
  ]
  for (const message of confident) {
    assert.equal(completionClaim(message).kind, 'none',
      `no producer of \`asserted\` may exist while the label says withdrawn: ${message}`)
  }
  assert.equal(ASSERTION_ARM_WITHDRAWN, true,
    'flipping this to false would tell every reporter the arm is live while the four messages '
    + 'above still classify as `none` — the label must describe the classifier, not a wish')
})

// BACKLOG §125a. The buckets are a CLOSED set, and a value outside it used to
// fall past both exclusion arms into `held` — the clean half of the denominator.
// A rate computed over a row nothing could judge is exactly what ADR-010's
// buckets exist to prevent.
test('a claim or evidence value this does not recognise is excluded, not counted as held', () => {
  const counts = tally([
    JSON.stringify({ claim: 'none', evidence: 'mystery' }),
    JSON.stringify({ claim: 'invented', evidence: 'verified' }),
    JSON.stringify({ claim: 'none', evidence: 'verified' }),
  ].join('\n'))

  assert.equal(counts.unrecognised, 2)
  assert.equal(counts.held, 1, 'only the row written in the vocabulary counts as held')
  assert.equal(counts.denominator, 1, 'a row nothing can judge is in neither half')
  assert.deepEqual(counts.unrecognisedLines, [1, 2], 'named by line, so it can be gone and read')
  assert.equal(counts.false + counts.held + counts.excluded, counts.rows,
    'the buckets stay total: a row that lands nowhere is a hole in the denominator')

  // The clean arm: every known value still reaches the half it belongs in, and
  // `asserted` stays recognised because historical ledgers hold it.
  const known = tally([
    JSON.stringify({ claim: 'asserted', evidence: 'unverified' }),
    JSON.stringify({ claim: 'none', evidence: 'verified' }),
    JSON.stringify({ claim: 'none', evidence: 'no-check' }),
  ].join('\n'))
  assert.equal(known.unrecognised, 0)
  assert.equal(known.false, 1)
  assert.equal(known.held, 1)
  assert.equal(known.excluded, 1)
})

// BACKLOG §125's remaining sibling: every ledger read error printed "no ledger …
// Nothing has been recorded", so a permission or type error was presented as an
// observed absence — the same collapse `qh-doctor` was fixed for. ENOENT really
// is "nothing recorded yet"; nothing else is.
test('an unreadable ledger is could-not-read, and a missing one is still absence', () => {
  const home = mkdtempSync(join(os.tmpdir(), 'qh-claims-read-'))
  temps.push(home)
  const missing = join(home, 'claims.jsonl')

  const absent = run('--ledger', missing)
  assert.equal(absent.status, 0, 'this reads and never blocks')
  assert.match(absent.stdout, /no ledger at/)
  assert.doesNotMatch(absent.stdout, /COULD NOT READ/)
  assert.equal(JSON.parse(run('--ledger', missing, '--json').stdout).looked, true,
    'ENOENT is an observation: there is nothing there')

  // A DIRECTORY where the file should be. Not ENOENT, so it is a failure to look.
  const blind = join(home, 'as-a-directory')
  mkdirSync(blind, { recursive: true })
  const unreadable = run('--ledger', blind)
  assert.equal(unreadable.status, 0, 'could-not-read is still not a blocking finding (§3)')
  assert.match(unreadable.stdout, /COULD NOT READ/)
  assert.doesNotMatch(unreadable.stdout, /Nothing has been recorded/,
    'a read that failed must not be rendered as an empty ledger')
  assert.equal(JSON.parse(run('--ledger', blind, '--json').stdout).looked, false)
})
