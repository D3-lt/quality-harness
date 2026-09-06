import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { recordCount, render, run } from '../plugin/scripts/corpus-report.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The shape `trajectory-metrics.mjs::measure` returns, with every key present. */
const totals = (over = {}) => ({
  tasks: 73, unreadable: 0, unevidenced: 1, evidenced: 72, showsFailing: 71, outcomeOnly: 1,
  entries: 176, unjudgedEntries: 0, redEntries: 8, killed: 151, survived: 10, inconclusive: 2,
  outcomeOnlyFiles: [], rate: 71 / 72, ...over,
})
const report = (over = {}) => ({ root: 'docs/adr', version: '9.9.9', records: 35, unreadableDirs: [], totals: totals(), ...over })

test('the mutant counts are read from the real fields, and a missing one never reads as zero', () => {
  // ⚠ THE DEFECT THIS FILE WAS WRITTEN AFTER. The first version printed
  // `killed 0 · survived 0` over a corpus holding 151 killed mutants, because it
  // wrote `t.killed ?? 0` against guessed key names — a `??` turns a renamed or
  // absent field into a confident number. The report is meant to be pasted
  // somewhere public, so a fabricated zero is the worst output it could produce.
  assert.match(render(report()), /entries 176 · red 8 · killed 151 · survived 10 · inconclusive 2/)

  // DIRTY, in the same test: drop the field and the output must NOT say zero.
  const missing = totals()
  delete missing.killed
  assert.doesNotMatch(render(report({ totals: missing })), /killed 0 /,
    'an absent field must not be rendered as a measurement of none')
})

test('a corpus directory that could not be listed says so, and is not counted as empty', () => {
  // ADR-005 in the one place a reader will paste the answer somewhere.
  assert.match(render(report({ records: null })), /records unreadable/)
  assert.doesNotMatch(render(report({ records: null })), /0 record\(s\)/)
  assert.match(render(report()), /35 record\(s\)/)

  assert.equal(recordCount('nowhere-at-all', () => { throw new Error('ENOENT') }), null,
    'unreadable is null, never 0')
  assert.equal(recordCount('x', () => ['ADR-1-a.md', 'ADR-2-b.md', 'README.md', 'notes.txt']), 2)
})

test('unreadable task files and directories are reported, in neither half of the ratio', () => {
  const out = render(report({ totals: totals({ unreadable: 3 }), unreadableDirs: ['docs/adr/ADR-9/tasks'] }))
  assert.match(out, /3 task file\(s\) could not be read/)
  assert.match(out, /1 directory\(ies\) could not be listed/)
  // CLEAN, in the same test: a corpus with neither says neither.
  assert.doesNotMatch(render(report()), /could not be (read|listed)/)
})

test('the expensive measurement is UNRUN in those words, and names the command that takes it', () => {
  // The report must never let a reader think the re-check happened. A zero in the
  // false half of `adr-verify --sweep` means something only if the sweep ran, and
  // this tool deliberately does not run anyone's fences.
  const out = render(report())
  assert.match(out, /RECORDED CLAIMS RE-CHECKED LATER — UNRUN/)
  assert.match(out, /adr-verify --sweep docs\/adr/)
  assert.match(out, /Nothing here re-ran anything/)
})

test('an absolute corpus path is shown relative, so a pasted report carries no home directory', () => {
  // CLAUDE.md §6: this output exists to be posted in public.
  const said = []
  const deps = {
    read: () => { throw new Error('ENOENT') },
    readdir: () => [],
    log: m => said.push(m),
    cwd: '/home/someone/project',
  }
  run([join('/home/someone/project', 'docs', 'adr')], deps)
  assert.match(said.join('\n'), /corpus: docs[/\\]adr/)
  assert.doesNotMatch(said.join('\n'), /home[/\\]someone/,
    'an absolute path would publish the operator\'s home directory')
})

test('it reports and never blocks, and --json carries the same answer', () => {
  const said = []
  const throws = () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }) }
  const deps = { read: throws, readdir: throws, log: m => said.push(m) }

  assert.equal(run(['docs/adr'], deps), 0, 'an unreadable corpus is still exit 0')
  assert.equal(run(['--help'], deps), 0)
  assert.match(said.join('\n'), /never runs a fence/)

  said.length = 0
  assert.equal(run(['docs/adr', '--json'], deps), 0)
  const parsed = JSON.parse(said.join('\n'))
  assert.equal(parsed.root, 'docs/adr')
  assert.equal(parsed.records, null, 'json carries the same null the text calls unreadable')
  assert.equal(typeof parsed.totals.tasks, 'number')

  // ⚠ AND AN EMPTY READABLE DIRECTORY IS NOT THE SAME ANSWER. This assertion is
  // here because the first version of this test used a readdir that returned []
  // and expected null — conflating "nothing is there" with "I could not look",
  // which is the exact distinction the tool exists to keep (ADR-005).
  said.length = 0
  run(['docs/adr', '--json'], { read: throws, readdir: () => [], log: m => said.push(m) })
  assert.equal(JSON.parse(said.join('\n')).records, 0, 'an empty corpus has zero records, not null')
})

test('it reproduces this repository\'s own published figures, which is the cross-check', () => {
  // The research note reports 71/72 evidenced tasks showing a check could fail,
  // 176 entries, 8 red. If this tool disagrees with the number the project has
  // already published, one of the two is wrong and a reader cannot tell which.
  const said = []
  run([join(repoRoot, 'docs', 'adr'), '--json'], { log: m => said.push(m), cwd: repoRoot })
  const t = JSON.parse(said.join('\n')).totals
  assert.ok(t.evidenced >= 72, `evidenced tasks: ${t.evidenced}`)
  assert.ok(t.showsFailing >= 71, `shown able to fail: ${t.showsFailing}`)
  assert.ok(t.killed > 100, `killed mutants: ${t.killed} — the field is read, not guessed`)
  assert.ok(t.redEntries >= 8, `red entries: ${t.redEntries}`)
})
