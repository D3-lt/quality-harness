// Research gap 2's aggregation: five per-record advisories become one corpus
// number about the SEQUENCE rather than the outcome.
//
// Every fixture is a temp corpus this test created (CLAUDE.md §9), and every
// "clean" answer is shown able to come back dirty in the same test — a check
// that can only report one answer is the vacuity coverage cannot see (§4).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { measure, readTask, render, taskFiles } from '../plugin/scripts/trajectory-metrics.mjs'

const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }) })

function corpus(tasks) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-trajectory-'))
  temps.push(dir)
  for (const [name, body] of Object.entries(tasks)) {
    const file = path.join(dir, 'ADR-001-x', 'tasks', `${name}.md`)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body, 'utf8')
  }
  return dir
}

const task = ({ log = [], mlog = [] } = {}) => [
  '# Task', '', '## Verification Log', ...log, '', '## Mutation Log', ...mlog, '',
].join('\n')

const green = '- 2026-09-04 · abc1234 · exit 0 · `pytest -q` · acceptance-sha256:aa'
const red = '- 2026-09-04 · abc1234 · exit 1 · `pytest -q` · acceptance-sha256:aa'
const killed = '- 2026-09-04 · abc1234 · mutant killed · exit 1 · `x.py` · why · acceptance-sha256:aa'
const survived = '- 2026-09-04 · abc1234 · mutant survived · exit 0 · `x.py` · why · acceptance-sha256:aa'

test('a task proves its trajectory with a red entry OR a killed mutant, and neither is silent', () => {
  const dir = corpus({
    'T1-red': task({ log: [red, green] }),
    'T2-killed': task({ log: [green], mlog: [killed] }),
    'T3-outcome-only': task({ log: [green, green] }),
    'T4-survived-only': task({ log: [green], mlog: [survived] }),
  })
  const totals = measure(taskFiles(dir))
  assert.equal(totals.evidenced, 4)
  assert.equal(totals.showsFailing, 2, 'red and killed each count; green-only and survived-only do not')
  assert.equal(totals.outcomeOnly, 2)
  assert.equal(totals.showsFailing + totals.outcomeOnly, totals.evidenced, 'the buckets are total')
  assert.equal(totals.rate, 0.5)
  assert.equal(totals.survived, 1, 'a survivor is counted and is not proof the fence can fail')

  // Shown able to answer the other way, or it passes for any corpus at all.
  const clean = measure(taskFiles(corpus({ 'T1-red': task({ log: [red] }) })))
  assert.equal(clean.rate, 1)
  assert.equal(clean.outcomeOnly, 0)
})

test('a task with no evidence is outside the ratio, not counted against it', () => {
  const dir = corpus({ 'T1-empty': task(), 'T2-green': task({ log: [green] }) })
  const totals = measure(taskFiles(dir))
  assert.equal(totals.tasks, 2)
  assert.equal(totals.unevidenced, 1, 'a task that claimed nothing has no trajectory to judge')
  assert.equal(totals.evidenced, 1)
  assert.equal(totals.unevidenced + totals.evidenced + totals.unreadable, totals.tasks)
})

test('a task that could not be read is in neither half', () => {
  const dir = corpus({ 'T1-green': task({ log: [green] }) })
  const files = [...taskFiles(dir), path.join(dir, 'ADR-001-x', 'tasks', 'gone.md')]
  const totals = measure(files)
  assert.equal(totals.unreadable, 1)
  assert.equal(totals.evidenced, 1, 'ADR-005: could-not-look is not could-not-prove')
  assert.equal(readTask(path.join(dir, 'nope.md')).unreadable, true)
})

test('a corpus with nothing evidenced reports no rate rather than a clean one', () => {
  const totals = measure(taskFiles(corpus({ 'T1-empty': task() })))
  assert.equal(totals.rate, null)
  const text = render(totals, 'x')
  assert.match(text, /not a rate of zero/i)
  assert.doesNotMatch(text, /\b0\s*%/, 'silence is not a measurement of zero')
})

test('the README index is not a task, and files outside a tasks/ directory are not either', () => {
  const dir = corpus({ 'T1-green': task({ log: [green] }) })
  writeFileSync(path.join(dir, 'ADR-001-x', 'tasks', 'README.md'), task({ log: [green] }), 'utf8')
  writeFileSync(path.join(dir, 'ADR-001-x', 'notes.md'), task({ log: [green] }), 'utf8')
  const files = taskFiles(dir)
  assert.deepEqual(files.map(f => path.basename(f)), ['T1-green.md'],
    `the derived index and a stray note are not tasks: ${files.join(', ')}`)
})

test('this repository can answer the question about itself', () => {
  // Rung 4, and the only assertion here about the real corpus: it must be
  // measurable at all. The VALUE is a compliance figure that changes with the
  // work, so nothing here pins it.
  const totals = measure(taskFiles('docs/adr'))
  assert.ok(totals.evidenced > 0, 'this corpus carries evidenced tasks')
  assert.ok(totals.rate !== null && totals.rate >= 0 && totals.rate <= 1,
    `the rate must be a real proportion, got ${totals.rate}`)
})

// BACKLOG §125b. `entries` counted every ENTRY-SHAPED line while `red`/`green`
// counted only those whose exit code parsed, so a malformed entry raised the
// total, reached neither half, and the render then said of that task that
// "every entry passed". Nothing observed that it passed.
test('an entry with no readable exit code is named, not counted as one that passed', () => {
  const malformed = '- 2026-09-04 · abc1234 · exit ??? · `pytest -q` · acceptance-sha256:aa'
  const one = readTask(path.join(corpus({ 'T1': task({ log: [malformed] }) }), 'ADR-001-x', 'tasks', 'T1.md'))
  assert.equal(one.entries, 1, 'it is still an entry — dropping it would shrink the total silently')
  assert.equal(one.unjudged, 1)
  assert.equal(one.red, 0)
  assert.equal(one.green, 0, 'nothing observed that it passed')

  const totals = measure(taskFiles(corpus({ 'T1': task({ log: [malformed] }) })))
  assert.equal(totals.unjudgedEntries, 1)
  const text = render(totals, 'x')
  assert.match(text, /carry no exit code this could read/)
  assert.doesNotMatch(text, /every entry passed/,
    'the sentence that stated more than was observed must not come back')

  // The clean arm: a real green entry is judged, and nothing is flagged.
  const judged = measure(taskFiles(corpus({ 'T1': task({ log: [green] }) })))
  assert.equal(judged.unjudgedEntries, 0)
  assert.doesNotMatch(render(judged, 'x'), /carry no exit code/)
})

// A directory the walk could not read shrank the denominator and rendered
// identically to a corpus that simply has none. PARTIAL is its own answer.
test('a directory that could not be read is reported as PARTIAL, not as absence', () => {
  const dir = corpus({ 'T1': task({ log: [red] }) })
  const unreadableDirs = []
  // The root itself unreadable is the honest shape of this: nothing under it can
  // be enumerated, and an empty list is exactly what a corpus with no tasks
  // returns — which is the confusion the sink exists to end.
  const files = taskFiles(dir, unreadableDirs, () => { throw new Error('EACCES') })
  assert.deepEqual(files, [], 'nothing was readable here')
  assert.ok(unreadableDirs.length > 0, 'and that has to be reported, not inferred from emptiness')
  // ⚠ MEASURE THE INJECTED LIST, not a second successful walk. The first version
  // of this test computed totals from `taskFiles(dir)` — which reads the real
  // directory and finds the task — so `totals.tasks` was 1 and render never took
  // the early-return path. That is the ONE path an unreadable root actually
  // produces, and it was dropping PARTIAL entirely: the test asserted the line
  // appears while exercising the branch where it already did.
  const totals = measure(files)
  assert.equal(totals.tasks, 0, 'an unreadable root yields no files — this is the early-return path')
  const partial = render(totals, dir, { unreadableDirs })
  assert.match(partial, /PARTIAL/, 'the case PARTIAL exists for is the case that must say it')
  assert.match(partial, /no task files/, 'and it says so beside the emptiness, not instead of it')

  // The evidenced-but-empty early return takes it too.
  assert.match(render(measure(taskFiles(corpus({ T1: task() }))), dir, { unreadableDirs }), /PARTIAL/)

  // A corpus that WAS fully read must not claim it was partial.
  assert.doesNotMatch(render(measure(taskFiles(dir)), dir), /PARTIAL/)
})
