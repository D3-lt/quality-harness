import assert from 'node:assert/strict'
import path from 'node:path'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { OUTSIDE, asArgument, collect, publicPath, recordCount, render, run } from '../plugin/scripts/corpus-report.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The shape `trajectory-metrics.mjs::measure` returns, with every key present. */
const totals = (over = {}) => ({
  tasks: 73, unreadable: 0, unevidenced: 1, evidenced: 72, showsFailing: 71, outcomeOnly: 1,
  entries: 176, unjudgedEntries: 0, redEntries: 8, killed: 151, survived: 10, inconclusive: 2,
  outcomeOnlyFiles: [], rate: 71 / 72, ...over,
})
const report = (over = {}) => ({
  root: 'docs/adr', version: '9.9.9', records: 35, rootUnreadable: false,
  unreadableDirs: [], totals: totals(), ...over,
})
const throws = () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }) }

test('nothing path-shaped is published unless it is relative to the corpus', () => {
  // ⚠ §6 IS THE HARD REQUIREMENT HERE, because this output is DESIGNED to be posted
  // in public. A reviewer reproduced `../../home/alice/...` from the first version,
  // which rewrote only the root and shipped absolute paths through `unreadableDirs`
  // and through `outcomeOnlyFiles` in `--json`. A path that escapes must lose the
  // PATH, not the anonymity.
  assert.equal(publicPath('/home/alice/repo/docs/adr/x.md', '/home/alice/repo/docs/adr'), 'x.md')
  assert.equal(publicPath('/home/alice/secret', '/home/alice/repo/docs/adr'), OUTSIDE)
  assert.equal(publicPath('/home/alice/repo/docs/adr', '/home/alice/repo/docs/adr'), '.')
  assert.equal(publicPath('', '/base'), OUTSIDE)
  assert.equal(publicPath(undefined, '/base'), OUTSIDE)

  // Windows, through the platform seam so the arm is reachable from any host
  // (CLAUDE.md §7). A different DRIVE and a different UNC SHARE cannot be
  // relativised at all — `path.win32.relative` hands back the absolute path.
  assert.equal(publicPath('C:\\repo\\docs\\adr\\x.md', 'C:\\repo\\docs\\adr', path.win32), 'x.md')
  assert.equal(publicPath('D:\\elsewhere\\secret', 'C:\\repo\\docs\\adr', path.win32), OUTSIDE)
  assert.equal(publicPath('\\\\server\\share\\x', 'C:\\repo', path.win32), OUTSIDE)
  assert.match(publicPath('C:\\repo\\docs\\adr\\a\\b.md', 'C:\\repo\\docs\\adr', path.win32), /^a\/b\.md$/)
})

test('a corpus outside the working directory is a placeholder, in the text and in the JSON', () => {
  const said = []
  const deps = { read: throws, readdir: throws, log: m => said.push(m), cwd: '/home/someone/project' }

  run(['/home/someone/private-corpus'], deps)
  assert.match(said.join('\n'), /corpus: <outside the corpus>/)
  assert.doesNotMatch(said.join('\n'), /someone/, 'an escaping path would publish a username')

  said.length = 0
  run(['/home/someone/private-corpus', '--json'], deps)
  const blob = said.join('\n')
  assert.doesNotMatch(blob, /someone/)
  assert.equal(JSON.parse(blob).root, OUTSIDE)

  // CLEAN, in the same test: a path INSIDE the working directory keeps its name,
  // so the placeholder is not simply what this always prints.
  said.length = 0
  run([join('/home/someone/project', 'docs', 'adr')], deps)
  assert.match(said.join('\n'), /corpus: docs\/adr/)
})

test('an unreadable ROOT has no totals at all, rather than a set of confident zeros', () => {
  // The first version walked an unlistable directory, found no files, and published
  // zero entries, zero red and zero killed — none of which anyone measured. A
  // reviewer reproduced it. `taskFiles` puts the root in the unreadable sink, which
  // is the signal to say UNRUN (ADR-005).
  const dead = collect('docs/adr', { read: throws, readdir: throws })
  assert.equal(dead.rootUnreadable, true)
  assert.equal(dead.totals, null, 'no totals were measured, so there are none')
  assert.equal(dead.records, null)

  const out = render({ ...report(), ...dead, root: 'docs/adr' })
  assert.match(out, /task files UNRUN/)
  assert.match(out, /UNRUN — the corpus directory could not be listed/)
  assert.doesNotMatch(out, /entries 0/, 'a number nobody measured must not be printed')

  // DIRTY the other way, in the same test: a READABLE but EMPTY corpus is a
  // different answer, and gets real zeros.
  const empty = collect('docs/adr', { read: throws, readdir: () => [] })
  assert.equal(empty.rootUnreadable, false)
  assert.equal(empty.records, 0, 'an empty corpus has zero records, not null')
  assert.equal(empty.totals.tasks, 0)
  assert.match(render({ ...report(), ...empty, root: 'docs/adr' }), /0 task file\(s\)/)
})

test('an entry nobody could judge is never rendered as having passed', () => {
  // `measure` counts an entry-shaped row with an unreadable exit code in the entry
  // total and in NEITHER half, so a task holding only those lands in `outcomeOnly`
  // having passed nothing. The composed renderer dropped that warning and published
  // `outcome only 1 — passed`. This corpus really has one.
  const out = render(report({ totals: totals({ unjudgedEntries: 1 }) }))
  assert.match(out, /entr\(ies\) are entry-shaped and carry no exit code/)
  assert.doesNotMatch(out, /— passed/, 'outcome-only must not be described as passing')

  // CLEAN, in the same test: with nothing unjudged the warning is absent, so it is
  // not simply printed always.
  assert.doesNotMatch(render(report()), /carry no exit code/)
})

test('the mutant counts are read from the real fields, and a missing one never reads as zero', () => {
  // The first version printed `killed 0 · survived 0` over a corpus holding 151
  // killed mutants, because the key names were guessed and `?? 0` turned the misses
  // into confident numbers.
  assert.match(render(report()), /entries 176 · red 8 · killed 151 · survived 10 · inconclusive 2/)

  const missing = totals()
  delete missing.killed
  assert.doesNotMatch(render(report({ totals: missing })), /killed 0 /,
    'an absent field must not be rendered as a measurement of none')
})

test('a record is a FILE, so a directory named like one is not counted', () => {
  const entries = names => names.map(([name, isFile]) => ({ name, isFile: () => isFile }))
  assert.equal(recordCount('x', () => entries([['ADR-1-a.md', true], ['ADR-2-b.md', true],
    ['ADR-3-a-directory.md', false], ['README.md', true]])), 2)
  assert.equal(recordCount('nowhere', throws), null, 'unreadable is null, never 0')
})

test('the command it prints is one you can actually paste', () => {
  // A path with a space or a quote pasted raw splits into two arguments, so the
  // reader measures something other than what the report described.
  assert.equal(asArgument('docs/adr'), 'docs/adr')
  assert.equal(asArgument('my docs/adr'), "'my docs/adr'")
  assert.equal(asArgument("it's/adr"), "'it'\\''s/adr'")
  assert.match(render(report({ root: 'my docs/adr' })), /adr-verify --sweep 'my docs\/adr'/)
  // And a plain path is NOT quoted, so the rule is shown separating the two cases.
  assert.match(render(report()), /adr-verify --sweep docs\/adr\n/)
})

test('unreadable subdirectories are reported as PARTIAL, and named relative to the corpus', () => {
  const out = render(report({ totals: totals({ unreadable: 3 }), unreadableDirs: ['ADR-9/tasks'] }))
  assert.match(out, /3 task file\(s\) could not be read/)
  assert.match(out, /1 directory\(ies\) could not be listed: ADR-9\/tasks — PARTIAL, not clean/)
  assert.doesNotMatch(render(report()), /could not be (read|listed)/)
})

test('the expensive measurement is UNRUN in those words, and names the command that takes it', () => {
  const out = render(report())
  assert.match(out, /RECORDED CLAIMS RE-CHECKED LATER — UNRUN/)
  assert.match(out, /Nothing here re-ran anything/)
})

test('it reports and never blocks', () => {
  const said = []
  const deps = { read: throws, readdir: throws, log: m => said.push(m) }
  assert.equal(run(['docs/adr'], deps), 0, 'an unreadable corpus is still exit 0')
  assert.equal(run(['--help'], deps), 0)
  assert.equal(run(['docs/adr', '--json'], deps), 0)
})

test('a historical floor on this repository\'s own figures — not a reproduction of them', () => {
  // ⚠ NAMED FOR WHAT IT IS. This was called "reproduces this repository's published
  // figures", which it does not do: the bounds are one-sided, so it catches a large
  // undercount and permits any overcount. Kept as a floor because the cheap failure
  // it protects against is the tool reading the wrong fields and reporting near-zero
  // — which happened — and made honest by its name rather than by tightening it into
  // a check that a legitimate corpus edit would break.
  const said = []
  run([join(repoRoot, 'docs', 'adr'), '--json'], { log: m => said.push(m), cwd: repoRoot })
  const parsed = JSON.parse(said.join('\n'))
  const t = parsed.totals
  assert.equal(parsed.root, 'docs/adr')
  assert.ok(t.evidenced >= 72, `evidenced tasks: ${t.evidenced}`)
  assert.ok(t.showsFailing >= 71, `shown able to fail: ${t.showsFailing}`)
  assert.ok(t.killed > 100, `killed mutants: ${t.killed} — the field is read, not guessed`)
  assert.ok(t.redEntries >= 8, `red entries: ${t.redEntries}`)
  // Every published path is corpus-relative: the real corpus is the strongest
  // fixture available for the §6 rule above.
  for (const file of t.outcomeOnlyFiles) {
    assert.doesNotMatch(file, /^([A-Za-z]:|[/\\])/, `an absolute path reached the report: ${file}`)
  }
})
