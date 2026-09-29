// BACKLOG §319's addendum, B9: a tasks README row with one cell fewer than its table's
// header — the Execution Order row whose Depends-on cell was dropped — linted PASS and said
// nothing. The README is a derived index (CLAUDE.md §10), so the finding is advice, and the
// verdict staying PASS is asserted beside it: that is what holds advice-not-block in place.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
// A copy of a fixture corpus that lints PASS, in a repository this file made (CLAUDE.md §9).
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-chaos-315-b9-'))
  temps.push(dir)
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  cpSync(join(repoRoot, 'tests', 'fixtures', 'corpora', 'rust-crate'), dir, { recursive: true })
  return dir
}
const RECORD = join('docs', 'adr', 'ADR-001-quotes-are-classified-once.md')
const README = join('docs', 'adr', 'ADR-001-quotes-are-classified-once', 'tasks', 'README.md')
const GOAL = 'classify a quote character'
const INDEX = ['| Task | Status | Goal |', '|---|---|---|', `| T1 | done | ${GOAL} |`]
// Writes the README from its lines, lints the record, and returns the verdict and the
// advice lines that speak about a README row's cells.
const lintWith = (repo, lines) => {
  writeFileSync(join(repo, README), `# Tasks for ADR-001\n\n${lines.join('\n')}\n`)
  // 60s: a Windows runner's first Python spawn can take 30 (tests/adr-next.test.mjs:29).
  const run = spawnSync('python3', [join(bin, 'adr-lint'), join(repo, RECORD)], { cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const rows = run.stdout.split('\n').filter(line => line.trim().startsWith('advice: README.md:') && line.includes('cell'))
  return { status: run.status, pass: run.stdout.includes('[PASS]'), rows, said: `${run.stdout}\n${run.stderr}` }
}
const order = row => ['## Execution Order', '', '| Order | Task | Depends-on |', '|---|---|---|', row, '', '## Task Index', '', ...INDEX]

test('an Execution Order row with its Depends-on cell dropped is advised on, and the verdict stays PASS', () => {
  const repo = scratch()
  const dropped = lintWith(repo, order('| 1 | T1 |'))
  assert.equal(dropped.status, 0, dropped.said)
  assert.ok(dropped.pass, dropped.said)
  assert.equal(dropped.rows.length, 1, dropped.said)
  assert.ok(dropped.rows[0].includes('`| 1 | T1 |`'), dropped.rows[0])
  assert.ok(dropped.rows[0].includes('Depends-on'), dropped.rows[0])
  // The controls, each of which must say nothing about cells: the whole row; an empty cell
  // written with a space and without one, which Markdown reads as a cell; and a row LONGER
  // than its header, as a pipe inside a code span makes it.
  for (const row of ['| 1 | T1 | none |', '| 1 | T1 | |', '| 1 | T1 ||', '| 1 | T1 | `none | ever` |']) {
    const control = lintWith(repo, order(row))
    assert.equal(control.status, 0, `${row}\n${control.said}`)
    assert.ok(control.pass, `${row}\n${control.said}`)
    assert.deepEqual(control.rows, [], `${row}\n${control.said}`)
  }
  // A lone pipe line after a blank line starts no table, so no header measures it.
  const lone = lintWith(repo, [...order('| 1 | T1 | none |'), '', '| a pipe line that starts no table |'])
  assert.equal(lone.status, 0, lone.said)
  assert.deepEqual(lone.rows, [], lone.said)
})

test('a short row is advised on in any README table, whether or not it names a task', () => {
  const repo = scratch()
  // The status table's sibling: Status is the last column and its cell is gone.
  const status = lintWith(repo, ['| Task | Goal | Status |', '|---|---|---|', `| T1 | ${GOAL} |`])
  assert.equal(status.rows.length, 1, status.said)
  assert.ok(status.rows[0].includes('Status'), status.rows[0])
  // The Task cell dropped: the row names no task, and that is not a reason to be quiet (§16).
  const noTask = lintWith(repo, order('| 1 | none |'))
  assert.equal(noTask.rows.length, 1, noTask.said)
  assert.ok(noTask.rows[0].includes('`| 1 | none |`'), noTask.rows[0])
  // The control: the same status table, whole.
  const whole = lintWith(repo, ['| Task | Goal | Status |', '|---|---|---|', `| T1 | ${GOAL} | done |`])
  assert.deepEqual(whole.rows, [], whole.said)
})

// A table inside a fenced block or an HTML comment is an example (a template's, a doc's), and
// CommonMark renders neither as a table: measured with markdown-it-py 4.2.0, `gfm-like`. Each
// masked example has a twin that must still speak, placed where a wrong model of a fence or a
// comment would silence it. The cells are neutral on purpose: no T-id, no Status or Order
// column, so the README's other readers, which do not mask fences, stay out of the verdict.
test('a short row in a fenced or commented example is not advised on, and its twins still are', () => {
  const repo = scratch()
  const table = row => ['| Col A | Col B | Col C |', '|---|---|---|', row]
  const run = lintWith(repo, [
    // Masked: each of these must say nothing.
    '```md', ...table('| fenced-backtick | a |'), '```', '',
    '~~~', ...table('| fenced-tilde | a |'), '~~~', '',
    '````', ...table('| fenced-four | a |'), '```', '````', '',
    '<!--', ...table('| comment-block | a |'), '-->', '',
    '   <!-- three spaces of indent still open a comment', ...table('| comment-indented | a |'), '-->', '',
    // A comment block runs through the line holding `-->`, not only the line after its opener
    // (a review of this check): the table here starts two lines in and ends before the closer.
    '<!--', 'a template example follows', '', ...table('| comment-later | a |'), 'more prose', '-->', '',
    // Twins: each of these must speak.
    ...table('| after-fence | a |'), '',
    // A comment block ends on the line holding `-->`, whatever follows it on that line.
    '<!-- one --> <!-- two', ...table('| after-closed-comment | a |'), '',
    // A `<!--` inside a row is a cell's text: it opens no comment and hides no row below it.
    ...table('| whole | a | b | <!-- start'), '| after-row-comment | a |', '',
    // Four spaces of indent make code, not a comment.
    '    <!-- four spaces of indent', '', ...table('| after-indented-code | a |'), '',
    // A backtick run followed by a backtick is inline code, not a fence (CommonMark 4.5).
    '```x``` is inline code', ...table('| after-inline-code | a |'), '',
    // Cells split before inline HTML is read: three cells here, so nothing to say.
    ...table('| inline-comment | a <!-- x | y --> |'), '',
    '## Task Index', '', ...INDEX, '',
    // A fence nobody closed runs to the end of the file.
    '```', ...table('| unclosed | a |'),
  ])
  assert.equal(run.status, 0, run.said)
  assert.ok(run.pass, run.said)
  const named = run.rows.map(row => (row.match(/row `\| ([\w-]+) \|/) || [])[1])
  assert.deepEqual(named, ['after-fence', 'after-closed-comment', 'after-row-comment', 'after-indented-code', 'after-inline-code'], run.said)
})
