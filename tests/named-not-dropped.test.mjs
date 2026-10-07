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
import { adrCorpus, readyTaskLines, scrubber } from '../plugin/scripts/lifecycle.mjs'
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

test('SessionStart names a task directory git lists and the disk does not hold', () => {
  const root = tree('absent', { 'docs/adr/ADR-001-a.md': ACCEPTED(1) })
  const listing = ['docs/adr/ADR-001-a.md', 'docs/adr/ADR-001-a/tasks/T1-x.md']
  const { lines } = readyTaskLines(root, true, listing, spawn)
  assert.ok(lines.some(line => /`docs\/adr\/ADR-001-a\/tasks`: UNPROVEN — listed by git, not on disk/.test(line)), lines.join('\n'))
  assert.ok(!lines.some(line => /more task director/.test(line)), lines.join('\n'))
  // The control: on disk, it is read.
  writeFileSync(path.join(root, 'README.md'), 'x')
  mkdirSync(path.join(root, 'docs', 'adr', 'ADR-001-a', 'tasks'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'adr', 'ADR-001-a', 'tasks', 'T1-x.md'), '# Task T1\n')
  assert.ok(!readyTaskLines(root, true, listing, spawn).lines.some(line => /not on disk/.test(line)))
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

// BACKLOG §350 C4/F3: SessionStart's could-not-run line folded only `os.homedir()` as spelled, and a
// home path in another spelling (an 8.3 short name, a resolved link) reached the session.
test('SessionStart never repeats an absolute path a gate printed', () => {
  const root = tree('gate-said', { 'docs/adr/ADR-001-a.md': ACCEPTED(1), 'docs/adr/ADR-001-a/tasks/T1-x.md': '# Task T1\n' })
  const listing = ['docs/adr/ADR-001-a.md', 'docs/adr/ADR-001-a/tasks/T1-x.md']
  const failed = () => ({ status: 2, stdout: '', stderr: 'could not run: C:\\Users\\EXAMPL~1\\proj\\T1-x.md — held open\n' })
  const said = readyTaskLines(root, true, listing, failed).lines.join('\n')
  assert.match(said, /UNPROVEN — adr-next could not run \(exit 2\): could not run: ‹path› — held open/, said)
  assert.doesNotMatch(said, /EXAMPL~1/, said)
  // The control: a path under the repository is still said relative to it.
  const inside = () => ({ status: 2, stdout: '', stderr: `could not run: ${path.join(root, 'docs', 'x.md')} — held open\n` })
  assert.match(readyTaskLines(root, true, listing, inside).lines.join('\n'), /could not run: \.[\\/]docs[\\/]x\.md — held open/)
  // A home path outside the repository names nothing under the home directory: `~‹path›`. The `~/…`
  // form named the owner's other repositories in an outside run's report (php-react-app, 3.8.7 RC).
  const home = () => ({ status: 2, stdout: '', stderr: `could not run: ${path.join(os.homedir(), 'elsewhere', 'x.md')} — held open\n` })
  const homeSaid = readyTaskLines(root, true, listing, home).lines.join('\n')
  assert.match(homeSaid, /could not run: ~‹path› — held open/, homeSaid)
  assert.doesNotMatch(homeSaid, /elsewhere/, homeSaid)
})

// An outside run of the 3.8.7 RC (rust-adr-corpus): a record with no Status that FAILs on another rule prints its
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
