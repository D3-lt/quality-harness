// BACKLOG §350 C5: what five Windows corpus-chaos runs of 3.8.3 found counted and named nowhere, or
// dropped in silence. Each test asserts the name a reader now says, beside a control that says none.
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { diffReports, probe } from '../plugin/scripts/corpus-probe.mjs'
import { recordCount } from '../plugin/scripts/corpus-report.mjs'
import { fileURLToPath } from 'node:url'
import { adrCorpus } from '../plugin/scripts/decision-corpus.mjs'
import { scrubber } from '../plugin/scripts/corpus-text.mjs'
import { main, observe } from '../plugin/scripts/work-next.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-named-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const spawn = () => ({ status: 3, stderr: '', stdout: JSON.stringify({ ready: [], done: [], blocked: [], stopped: [] }) })
const tree = (name, files) => {
  const root = path.join(scratch, name)
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), body)
  }
  return root
}
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/')
const printed = (root, listing) => {
  const out = []
  const write = process.stdout.write
  process.stdout.write = chunk => { out.push(String(chunk)); return true }
  try { main([root], { spawn, listing }) } finally { process.stdout.write = write }
  return out.join('')
}
const ACCEPTED = n => `# ADR-00${n}: x\n\n**Status:** Accepted\n\n## Context\n\nx\n`

test('work-next names a record whose Status no reader can read, and keeps a plan a count', () => {
  const files = {
    'docs/adr/ADR-001-a.md': ACCEPTED(1),
    'docs/adr/ADR-002-b.md': '# ADR-002: b\n\n**Status：** Accepted\n\n## Context\n\nx\n',
    'docs/adr/ADR-003-c.md': '# ADR-003: c\n\n**Status:** Proposed\n\n## Context\n\nx\n',
  }
  const root = tree('fullwidth', files)
  const state = observe(root, { spawn, listing: Object.keys(files) })
  assert.deepEqual(state.undecidedNamed.map(entry => [rel(root, entry.file), entry.reason]), [
    ['docs/adr/ADR-002-b.md', 'no status line this reader can read'],
    ['docs/adr/ADR-003-c.md', 'a plan, not yet decided'],
  ])
  const text = printed(root, Object.keys(files))
  assert.match(text, /not acted on: `docs\/adr\/ADR-002-b\.md`: no status line this reader can read/, text)
  assert.match(text, /2 further record\(s\) are not acted on: not yet Accepted, or with a Status this reader cannot read/, text)
  assert.doesNotMatch(text, /not acted on: `docs\/adr\/ADR-003-c\.md`/, text)
})

test('a readable task under a record nobody could read is attributed to it, not dropped', t => {
  const attributed = (name, record, deny = false) => {
    const files = {
      'docs/adr/ADR-001-a.md': record,
      'docs/adr/ADR-001-a/tasks/T1-x.md': '# Task T1\n\n## Acceptance\n\n```bash\ntrue\n```\n',
    }
    const root = tree(name, files)
    const file = path.join(root, 'docs', 'adr', 'ADR-001-a.md')
    if (deny) chmodSync(file, 0o000)
    try {
      const corpus = adrCorpus(root, { tracked: Object.keys(files) })
      assert.deepEqual(corpus.unreadable.map(entry => entry.taskFiles.map(task => rel(root, task))), [['docs/adr/ADR-001-a/tasks/T1-x.md']])
      const state = observe(root, { spawn, listing: Object.keys(files) })
      assert.deepEqual(state.ownerless, [], 'owned by the record that could not be read, not by nobody')
      assert.deepEqual(state.notYetDecided.map(task => rel(root, task)), ['docs/adr/ADR-001-a/tasks/T1-x.md'])
    } finally { if (deny) chmodSync(file, 0o644) }
  }
  // A record that is not text, and one this process may not open: two branches of one reader.
  attributed('nul-owner', 'a\0b')
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a read here'); return }
  attributed('denied-owner', ACCEPTED(1), true)
})

test('a CR-only task file loses none of its Affected Files', () => {
  const task = '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n| `src/a.js` | edit | x |\n| `src/b.js` | edit | y |\n'
  const governs = (name, body) => {
    const files = { 'docs/adr/ADR-001-a.md': ACCEPTED(1), 'docs/adr/ADR-001-a/tasks/T1-x.md': body }
    const root = tree(name, files)
    return [...adrCorpus(root, { tracked: Object.keys(files) })[0].governs].sort()
  }
  const lf = governs('lf', task)
  assert.deepEqual(lf, ['src/a.js', 'src/b.js'])
  assert.deepEqual(governs('cr', task.replaceAll('\n', '\r')), lf)
  assert.deepEqual(governs('crlf', task.replaceAll('\n', '\r\n')), lf)
})

// The task file above no longer proves the reader's CR rule: since 3.8.40 the Affected Files section is cut by the fence
// walk, which ends a line at a lone CR itself, and the campaign showed the mutant surviving. The archive README is still
// split on LF alone, so a CR-only one turned a withdrawn record back into a governing one.
test('a CR-only archive README still freezes the records it retires', () => {
  const readme = ['# ADR Archive', '', '**Lifecycle:** Frozen historical ADR records', '',
    '| ADR | Title | Decision effect | Retired | Reason | Obligations | SHA-256 |',
    '|-----|-------|-----------------|---------|--------|-------------|---------|',
    '| [ADR-012](ADR-012-old.md) | old | withdrawn | 2026-08-29 | history | none | - |', '']
  const status = (name, eol) => {
    const files = { 'docs/adr-archive/ADR-012-old.md': ACCEPTED(12), 'docs/adr-archive/README.md': readme.join(eol) }
    const [record] = adrCorpus(tree(name, files), { tracked: Object.keys(files) })
    return [record.status, record.kind]
  }
  assert.deepEqual(status('archive-lf', '\n'), ['withdrawn', 'graveyard'])
  assert.deepEqual(status('archive-cr', '\r'), ['withdrawn', 'graveyard'])
})

// BACKLOG §381 item 14, from the cold review of ADR-098 (2026-10-14): every Affected Files row counted, whatever its Change
// column said, so ADR-098 governed four files its tasks only read. A row the column marks as read or unchanged — the words this
// corpus writes for one: `read`, `none`, `unchanged`, `no change` — governs nothing; a table with no Change column keeps all.
test('a file a task only reads is not one its record governs', () => {
  const row = (file, change) => `| \`${file}\` | ${change} | x |\n`
  const task = '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n'
    + row('src/a.js', 'edit') + row('src/b.js', 'read') + row('src/c.js', '**none**') + row('src/d.js', 'none — already correct')
    + row('src/e.js', 'no change — discovered from the tree') + row('src/f.js', 'Read (unchanged)') + row('src/g.js', 'add')
    + row('src/h.js', 'new read-only entry point')
  const governs = (name, body) => {
    const files = { 'docs/adr/ADR-001-a.md': ACCEPTED(1), 'docs/adr/ADR-001-a/tasks/T1-x.md': body }
    return [...adrCorpus(tree(name, files), { tracked: Object.keys(files) })[0].governs].sort()
  }
  assert.deepEqual(governs('change-column', task), ['src/a.js', 'src/g.js', 'src/h.js'])
  // CLEAN twin: with no Change column there is nothing to read the row by, and every path stays.
  assert.deepEqual(governs('no-change-column', '# Task T1\n\n## Affected Files\n\n| File | Why |\n|---|---|\n| `src/a.js` | x |\n| `src/b.js` | read |\n'),
    ['src/a.js', 'src/b.js'])
})

// The recorded review of v3.8.36..1721d2e6 (two advisories, fixed as fail-opens): a Change cell that begins with one of the
// words and goes on to describe an edit was dropped (`\b` matches before `-`, `/` and a space), and a second table in the
// same section was read by the first table's Change column.
test('a Change cell that goes on to describe an edit still governs, and each table has its own Change column', () => {
  const governs = (name, body) => {
    const files = { 'docs/adr/ADR-001-a.md': ACCEPTED(1), 'docs/adr/ADR-001-a/tasks/T1-x.md': body }
    return [...adrCorpus(tree(name, files), { tracked: Object.keys(files) })[0].governs].sort()
  }
  const row = (file, change) => `| \`${file}\` | ${change} | x |\n`
  assert.deepEqual(governs('words-then-edit', '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n'
    + row('src/a.js', 'read-only guard added') + row('src/b.js', 'read/write split') + row('src/c.js', 'unchanged except the import')
    + row('src/d.js', 'read') + row('src/e.js', 'none.')), ['src/a.js', 'src/b.js', 'src/c.js'])
  // A second table, its Change column elsewhere: read by its own header.
  assert.deepEqual(governs('two-tables', '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n' + row('src/a.js', 'edit')
    + '\n| Path | Why | Change |\n|---|---|---|\n| `src/f.js` | edit | read |\n| `src/g.js` | read | edit |\n'), ['src/a.js', 'src/g.js'])
  // A table ends at its first non-table line: rows after it, with no header of their own, have no Change column.
  assert.deepEqual(governs('table-ends', '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n' + row('src/a.js', 'edit')
    + '\n' + row('src/h.js', 'read')), ['src/a.js', 'src/h.js'])
  // The verification of 271a698b: an escaped pipe moves every later cell, so the Change lookup read the wrong one. A row
  // whose cell count is not its header's keeps its path.
  assert.deepEqual(governs('escaped-pipe', '# Task T1\n\n## Affected Files\n\n| File | Why | Change |\n|---|---|---|\n| `src/a.js` | x \\| none | edit |\n'),
    ['src/a.js'])
})

// The Codex review of v3.8.36..v3.8.38 (two fail-opens): cells were counted by raw `|`, so an escaped pipe plus a row that
// leaves off its optional trailing pipe matched the header's count and the wrong cell was read as Change; and a read-only
// word followed by any punctuation (`unchanged (except the import)`, `read; then add the guard`) was read as read-only.
test('a row is split the way GFM splits it, and only a reason after a dash keeps a read-only word read-only', () => {
  const governs = (name, body) => {
    const files = { 'docs/adr/ADR-001-a.md': ACCEPTED(1), 'docs/adr/ADR-001-a/tasks/T1-x.md': body }
    return [...adrCorpus(tree(name, files), { tracked: Object.keys(files) })[0].governs].sort()
  }
  const header = '# Task T1\n\n## Affected Files\n\n| File | Why | Change |\n|---|---|---|\n'
  // DIRTY: the escaped pipe and the missing trailing pipe cancel in a raw count. CLEAN twin: the same shape whose Change
  // is `read` is still read-only, so the row is read by its real cells rather than kept whatever it says.
  assert.deepEqual(governs('escaped-no-trailing', header + '| `src/a.js` | x \\| none | edit\n| `src/b.js` | x \\| y | read\n'), ['src/a.js'])
  // GFM splits at a pipe inside a code span too, so this row has one cell more than its header and its cell 2 reads
  // `none`: a row whose count is not its header's cannot say which cell is its Change, and keeps its path.
  assert.deepEqual(governs('code-span-pipe', header + '| `src/c.js` | `x|none` | edit |\n'), ['src/c.js'])
  const row = (file, change) => `| \`${file}\` | ${change} | x |\n`
  assert.deepEqual(governs('word-then-punctuation', '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n'
    + row('src/a.js', 'unchanged (except the import)') + row('src/b.js', 'read; then add the guard') + row('src/c.js', 'none: adds a flag')
    + row('src/d.js', 'Read (unchanged)') + row('src/e.js', 'none — already correct') + row('src/f.js', 'read.')),
    ['src/a.js', 'src/b.js', 'src/c.js'])
})

// The paths one Accepted record's single task governs, from that task's whole text.
const AFFECTED = '# Task T1\n\n## Affected Files\n\n'
const governedBy = (name, task) => {
  const files = { 'docs/adr/ADR-001-a.md': ACCEPTED(1), 'docs/adr/ADR-001-a/tasks/T1-x.md': task }
  return [...adrCorpus(tree(name, files), { tracked: Object.keys(files) })[0].governs].sort()
}

test('a table is one header, the delimiter under it and its rows to a blank line or block, and a row needs no leading pipe', () => {
  const piped = AFFECTED + '| File | Change | Why |\n|---|---|---|\n'
  // A row GFM reads without its leading pipe is a row: an edit governs, and its read twin does not.
  assert.deepEqual(governedBy('pipeless-row', piped + '`src/a.js` | edit | x |\n`src/b.js` | read | x |\n'), ['src/a.js'])
  // A table with no edge pipes anywhere has its Change column too.
  assert.deepEqual(governedBy('pipeless-table', AFFECTED + 'File | Change | Why\n--- | --- | ---\n`src/a.js` | read | x\n`src/b.js` | edit | x\n'), ['src/b.js'])
  // Only the delimiter under a header opens a table: a body row shaped like a header and a delimiter is data, so the
  // Change column stays the first header's, and `src/a.js`'s Change is `edit`.
  assert.deepEqual(governedBy('body-delimiter', AFFECTED + '| File | Why | Change |\n| --- | --- | --- |\nnote | Change | Why\n--- | --- | ---\n| `src/a.js` | read | edit |\n'), ['src/a.js'])
  // A delimiter whose cell count is not its header's opens no table, so no cell is Change and the row keeps its path.
  assert.deepEqual(governedBy('count-mismatch', AFFECTED + '| File | Change |\n|---|---|---|\n| `src/a.js` | read |\n'), ['src/a.js'])
  // Inside a table a line with no pipe is a one-cell row (GFM example 202) and keeps its path; after a blank line the
  // same line is a paragraph and governs nothing.
  assert.deepEqual(governedBy('one-cell-row', piped + '| `src/a.js` | read | x |\n`src/b.js`\n\n`src/c.js`\n'), ['src/b.js'])
  // A blank line ends the table, so a read row after it has no Change column and keeps its path; above it, its twin is dropped.
  assert.deepEqual(governedBy('blank-ends', piped + '| `src/a.js` | read | x |\n\n| `src/b.js` | read | x |\n'), ['src/b.js'])
  // Another block ends the table too: a list item under it is not a row of it.
  assert.deepEqual(governedBy('block-ends', piped + '| `src/a.js` | read | x |\n- `src/b.js` | read | x\n'), ['src/b.js'])
  // So does an HTML block: the second table's Change is its own third column, not the first table's second (the Codex
  // review of v3.8.39..1d991b64).
  assert.deepEqual(governedBy('html-ends', piped + '| `src/a.js` | read | x |\n<!-- between tables -->\nFile | Why | Change\n--- | --- | ---\n| `src/new.js` | read | edit |\n'), ['src/new.js'])
  // Only an HTML block that can interrupt a table ends one (GFM types 1 to 6): an autolink and inline HTML are rows of
  // the table, so the header-shaped rows under them are data and the one-cell path under them keeps its path (the Codex
  // verification of c54110cb).
  assert.deepEqual(governedBy('autolink-stays', piped + '| `src/a.js` | edit | x |\n<https://example.com>\nFile | Why | Change\n--- | --- | ---\n`src/new.js` | edit | read\n'), ['src/a.js', 'src/new.js'])
  assert.deepEqual(governedBy('inline-html-stays', piped + '| `src/a.js` | read | x |\n<span>note</span>\n`src/b.js`\n'), ['src/b.js'])
  assert.deepEqual(governedBy('div-ends', piped + '| `src/a.js` | read | x |\n<div>\nFile | Why | Change\n--- | --- | ---\n| `src/new.js` | read | edit |\n'), ['src/new.js'])
  // After the tag name GFM takes a space, a tab, `>`, `/>` or the line's end, and no other space: `<div` and a no-break
  // space is inline, and the table goes on, as adr-lint reads it (the Claude review of 54fd1e8e).
  assert.deepEqual(governedBy('nbsp-stays', piped + '| `src/a.js` | edit | x |\n<div x>\nFile | Why | Change\n--- | --- | ---\n`src/new.js` | edit | read\n'), ['src/a.js', 'src/new.js'])
})

test('a fence in Affected Files is an example: its heading neither starts nor ends the section, and its table governs nothing', () => {
  const table = '| File | Change |\n|---|---|\n| `src/a.js` | edit |\n'
  assert.deepEqual(governedBy('fence-heading', AFFECTED + '```md\n# Example\n| `src/x.js` | edit |\n```\n\n' + table), ['src/a.js'])
  assert.deepEqual(governedBy('fence-start', '# Task T1\n\n```md\n## Affected Files\n\n| `src/x.js` | edit |\n```\n\n## Affected Files\n\n' + table), ['src/a.js'])
})

test('a backticked first cell with no space is a path, an extension or not; an unticked one must still look like a path', () => {
  // A backticked cell with a space stays prose: a real corpus wrote an acceptance command there (lifecycle.test.mjs).
  const cells = ['`src/a b.js`', '`Dockerfile`', '`(data).json`', '`(src)/a.js`', '`<path>`', '(compile)', 'run the tests', 'Makefile', 'src/c.js']
  assert.deepEqual(governedBy('spellings', AFFECTED + '| File | Change |\n|---|---|\n' + cells.map(cell => `| ${cell} | edit |\n`).join('')),
    ['(data).json', '(src)/a.js', 'Dockerfile', 'src/c.js'])
})

test('corpus-report counts a record named in lower case', () => {
  const entry = name => ({ name, isFile: () => true })
  assert.equal(recordCount('x', () => [entry('ADR-001-a.md'), entry('adr-002-b.md'), entry('notes.md')]), 2)
})

test('a PARTIAL diff names what made it partial and what dropped out', () => {
  const side = (because, undecided, readers) => ({ look: 'PARTIAL', workNext: { partialBecause: because.map(file => ({ file, reason: 'r' })) },
    undecided: undecided.map(file => ({ file })), couldNotRun: readers.map(reader => ({ reader, why: 'w' })) })
  assert.deepEqual(diffReports(side(['a.md'], ['u.md'], ['adr-next']), side(['b.md'], [], ['adr-next', 'adr-lint'])), [
    'look: PARTIAL → PARTIAL: counts not compared; adr-lint verdicts compared over the records both runs read',
    'partialBecause: + b.md (r)',
    'partialBecause: - a.md (r)',
    'undecided: - u.md',
    'couldNotRun: + adr-lint',
  ])
  // The control: two identical PARTIAL reports say only how they were compared.
  assert.deepEqual(diffReports(side(['a.md'], [], []), side(['a.md'], [], [])), ['look: PARTIAL → PARTIAL: counts not compared; adr-lint verdicts compared over the records both runs read'])
})

test('a case twin in the listing is one task, named, where the file system folds case', t => {
  const files = { 'docs/adr/ADR-001-a.md': ACCEPTED(1), 'docs/adr/ADR-001-a/tasks/T1-x.md': '# Task T1\n' }
  const root = tree('twin', files)
  if (!existsSync(path.join(root, 'docs', 'adr', 'ADR-001-a', 'tasks', 't1-x.md'))) { t.skip('this file system tells case apart'); return }
  const listing = [...Object.keys(files), 'docs/adr/ADR-001-a/tasks/t1-x.md']
  const state = observe(root, { spawn, listing })
  assert.equal(state.tasks, 1, JSON.stringify(state))
  assert.ok(state.partialBecause.some(entry => /t1-x\.md$/.test(entry.file) && /a spelling the file system folds together/.test(entry.reason)), JSON.stringify(state.partialBecause))
})

test('adr-state names an unread task under a record that governs other paths', t => {
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('no mode bit denies this process a read here'); return }
  const files = {
    'docs/adr/ADR-001-a.md': ACCEPTED(1),
    'docs/adr/ADR-001-a/tasks/T1-x.md': '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n| `src/a.js` | edit | x |\n',
    'docs/adr/ADR-001-a/tasks/T2-y.md': '# Task T2\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n| `src/b.js` | edit | y |\n',
  }
  const root = tree('scope', files)
  const t2 = path.join(root, 'docs', 'adr', 'ADR-001-a', 'tasks', 'T2-y.md')
  chmodSync(t2, 0o000)
  try {
    const [record] = adrCorpus(root, { tracked: Object.keys(files) })
    assert.deepEqual([...record.governs], ['src/a.js'])
    // Through adr-state, which named an unread task only under a record that governed nothing.
    spawnSync('git', ['init', '-q'], { cwd: root, timeout: 30_000, windowsHide: true })
    spawnSync('git', ['add', '-A'], { cwd: root, timeout: 30_000, windowsHide: true })
    const run = spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs'), '--json', root],
      { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    const json = JSON.parse(run.stdout)
    assert.deepEqual(json.governsUnproven.map(entry => entry.unreadTasks), [['docs/adr/ADR-001-a/tasks/T2-y.md']], run.stdout)
  } finally { chmodSync(t2, 0o644) }
})

// BACKLOG §350 C9: on Windows, adr-next, work-next and adr-state wrote `docs\\adr\\…` where every other
// field wrote `/`. Red only where the platform separator is `\`, which the Windows CI leg runs.
test('every path a reader emits in JSON is written with /', () => {
  const files = {
    'docs/adr/ADR-001-a.md': ACCEPTED(1),
    // A record with no tasks governs nothing, so adr-state names its path.
    'docs/adr/ADR-002-b.md': ACCEPTED(2),
    'docs/adr/ADR-001-a/tasks/T1-x.md': '# Task T1\n\n## Affected Files\n\n| File | Change | Why |\n|---|---|---|\n| `src/a.js` | edit | x |\n\n## Acceptance\n\n```bash\ntrue\n```\n',
  }
  const root = tree('separators', files)
  spawnSync('git', ['init', '-q'], { cwd: root, timeout: 30_000, windowsHide: true })
  spawnSync('git', ['add', '-A'], { cwd: root, timeout: 30_000, windowsHide: true })
  const tasks = path.join(root, 'docs', 'adr', 'ADR-001-a', 'tasks')
  const next = spawnSync('python3', [path.join(repoRoot, 'plugin', 'bin', 'adr-next'), tasks, '--json'],
    { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const answer = JSON.parse(next.stdout)
  const paths = [answer.tasks_dir, ...['ready', 'done', 'blocked', 'stopped'].flatMap(key => answer[key].map(task => task.path))]
  assert.ok(paths.length > 1, next.stdout)
  for (const shown of paths) assert.ok(!shown.includes('\\'), shown)
  const out = []
  const write = process.stdout.write
  process.stdout.write = chunk => { out.push(String(chunk)); return true }
  try { main([root, '--json'], { spawn, listing: Object.keys(files) }) } finally { process.stdout.write = write }
  assert.ok(!/\\\\/.test(out.join('')), out.join(''))
  const state = spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'adr-state.mjs'), '--json', root],
    { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.ok(state.stdout.includes('docs/adr/ADR-002-b.md'), state.stdout)
  assert.ok(!/\\\\/.test(state.stdout), state.stdout)
  // adr-context, found by the class audit: its `file` fields had the same native separators.
  const context = spawnSync(process.execPath, [path.join(repoRoot, 'plugin', 'scripts', 'adr-context.mjs'), '--json', 'src/a.js'],
    { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.deepEqual(JSON.parse(context.stdout).governing.map(record => record.file), ['docs/adr/ADR-001-a.md'], context.stdout)
})

// An outside run of the 3.8.7 RC (rust-records-corpus): a record with no Status that FAILs on another rule prints its
// `unproven:` line under the FAIL, and the probe kept only the FAIL's first finding and the advice, so
// the record's one Status signal was in no report. It rides with the verdict now, and --diff compares it.
test('the probe keeps what adr-lint could not decide, under whatever verdict it reached', () => {
  const root = path.join(scratch, 'probe-unproven')
  mkdirSync(path.join(root, 'docs', 'adr'), { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: root, timeout: 30_000, windowsHide: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n## Context\n\nx\n\n## Decision\n\nx\n\n## Alternatives Considered\n\n')
  const entry = probe(root).adrLint.find(item => item.file === 'docs/adr/ADR-001-x.md')
  assert.equal(entry?.verdict, 'FAIL', JSON.stringify(entry))
  assert.ok(entry.unproven?.some(line => /^unproven: ADR-001-x\.md: no \*\*Status:\*\* line/.test(line)), JSON.stringify(entry))
  const was = { look: 'ok', corpora: ['docs/adr'], adrLint: [{ file: 'a.md', verdict: 'FAIL', advice: [] }] }
  const now = { look: 'ok', corpora: ['docs/adr'], adrLint: [{ file: 'a.md', verdict: 'FAIL', advice: [], unproven: ['unproven: a.md: no Status'] }] }
  assert.ok(diffReports(was, now).includes('adrLint a.md unproven: + unproven: a.md: no Status'), diffReports(was, now).join('\n'))
})

// The Windows CI job of the 3.8.7 RC: `~\elsewhere\x.md` met no absolute-path head and printed whole,
// naming the owner's other work as `~/…` did on POSIX. Both separators are a placeholder.
test('a path under the home directory is a placeholder in either separator', () => {
  const scrub = scrubber({ root: null, pluginRoot: null, tmp: null, home: null })
  assert.equal(scrub('cites `~/Ansible/x.md`, which'), 'cites `~<path>`, which')
  assert.equal(scrub('cites `~\\Ansible\\x.md`, which'), 'cites `~<path>`, which')
  assert.equal(scrub('a ~ tilde and docs/~x stay'), 'a ~ tilde and docs/~x stay')
})

// An outside run of the 3.8.7 RC (php-react-app): records[].status copied a record's own Status line into the
// full report unscrubbed, so "recorded in ~/<other repository>/…" printed whole there.
test('the probe scrubs a Status line it copies into the report', () => {
  const root = path.join(scratch, 'probe-status')
  mkdirSync(path.join(root, 'docs', 'adr'), { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: root, timeout: 30_000, windowsHide: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted (recorded in ~/secret-repo/docs/x.md)\n\n## Context\n\nx\n')
  const report = probe(root)
  const status = report.records.find(record => record.file === 'docs/adr/ADR-001-x.md')?.status
  assert.match(status ?? '', /^Accepted \(recorded in ~<path>\)$/, JSON.stringify(report.records))
  assert.doesNotMatch(JSON.stringify(report), /secret-repo/)
})

// An outside run of the 3.8.7 RC (php-react-app): a record's Status changed between two reports and --diff
// compared no field of records[] at all.
test('--diff names a record whose Status changed, and a record that came or went', () => {
  const side = records => ({ look: 'ok', corpora: ['docs/adr'], records })
  const lines = diffReports(side([{ file: 'a.md', status: 'Proposed' }, { file: 'b.md', status: 'Accepted' }]),
    side([{ file: 'a.md', status: 'Accepted' }, { file: 'c.md', status: 'Accepted' }]))
  assert.ok(lines.includes('records: + c.md'), lines.join('\n'))
  assert.ok(lines.includes('records: - b.md'), lines.join('\n'))
  assert.ok(lines.includes('records a.md status: Proposed → Accepted'), lines.join('\n'))
  // The control: identical records say nothing.
  assert.deepEqual(diffReports(side([{ file: 'a.md', status: 'Accepted' }]), side([{ file: 'a.md', status: 'Accepted' }])), ['nothing changed'])
})

// An outside run of ca3d61d (php-react-app): a Status the older report held raw and the newer one scrubbed
// printed "X → X" — a change that was only redaction, shown as a change of nothing.
test('--diff does not report a Status whose only change is redaction', () => {
  const scrub = scrubber({ root: null, pluginRoot: null, tmp: null, home: null })
  const side = status => ({ look: 'ok', corpora: ['docs/adr'], records: [{ file: 'a.md', status }] })
  assert.deepEqual(diffReports(side('Accepted (see ~/secret/x.md)'), side('Accepted (see ~<path>)'), scrub), ['nothing changed'])
  // The control: a Status that really moved is still named.
  assert.ok(diffReports(side('Proposed'), side('Accepted'), scrub).includes('records a.md status: Proposed → Accepted'))
})
