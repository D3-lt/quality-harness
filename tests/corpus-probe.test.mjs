// corpus-probe's pure parts, driven directly: the redaction every emitted string
// passes through, the reader comparison, and the spawn-failure classifier. Each
// was found wrong by a different-lineage review of bdeba73 on inputs the matrix's
// five corpora never produce — a drive-rooted diagnostic, a relative path whose
// component is a root name, a directory one reader did not read.
import assert from 'node:assert/strict'
import test from 'node:test'
import { attestation, compareReaders, failedToRun, probe, readerFingerprint, readersOfRun, scrubber } from '../plugin/scripts/corpus-probe.mjs'
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stateDir } from '../plugin/scripts/event-log.mjs'
import { outsideRun } from '../scripts/release-evidence.mjs'

test('scrubber: every absolute path is a placeholder, and a repository-relative one is untouched', () => {
  const scrub = scrubber({ root: '/Users/alice/proj', pluginRoot: '/Users/alice/.claude/plugins/qh', tmp: '/var/folders/xy/T', home: '/Users/alice' })
  assert.equal(scrub('read /Users/alice/proj/docs/adr/x.md'), 'read ./docs/adr/x.md')
  assert.equal(scrub('at /Users/alice/.claude/plugins/qh/scripts/a.mjs:1'), 'at <plugin>/scripts/a.mjs:1')
  assert.equal(scrub('in /var/folders/xy/T/qh-1/x'), 'in <tmp>/qh-1/x')
  assert.equal(scrub('see /Users/bob/other/file.md'), 'see <path>')
  // A drive-rooted or UNC path went out whole before (P1): only five root names were known.
  assert.equal(scrub('hook: D:\\Projects\\Acme\\private-repo\\task.md failed'), 'hook: <path> failed')
  assert.equal(scrub('hook: D:/Projects/Acme/private-repo/task.md failed'), 'hook: <path> failed')
  assert.equal(scrub('share \\\\srv\\share\\repo\\x.md'), 'share <path>')
  // The other direction (P2): a relative path whose component happens to be a root name.
  assert.equal(scrub('docs/var/cache/tasks/T1.md'), 'docs/var/cache/tasks/T1.md')
  assert.equal(scrub('docs/tmp/cache/tasks/T2.md'), 'docs/tmp/cache/tasks/T2.md')
  assert.equal(scrub('./var/x'), './var/x')
  // Both separator spellings of a known prefix are the prefix.
  const win = scrubber({ root: 'C:\\repo', pluginRoot: 'C:\\plug', tmp: 'C:\\Temp', home: 'C:\\Users\\me' })
  assert.equal(win('C:/repo/docs/a.md and C:\\repo\\docs\\b.md'), './docs/a.md and .\\docs\\b.md')
  assert.equal(win('C:\\Users\\me\\x and E:\\else\\y'), '<home>\\x and <path>')
  // Codex review of 1032720: a colon before the path, a file: URL, a quoted path
  // holding a space, a POSIX root that is none of five names, a path in
  // parentheses — and `/tmp` as the host's real temp directory.
  assert.equal(scrub('error:/Users/example/x'), 'error:<path>')
  assert.equal(scrub('file:///Users/example/x'), '<path>')
  assert.equal(scrub('"D:\\Projects\\Example Person\\private-repo\\task.md"'), '"<path>"')
  assert.equal(scrub('"/Users/Example Person/private-repo/task.md"'), '"<path>"')
  assert.equal(scrub('at /opt/private-repo/task.md'), 'at <path>')
  assert.equal(scrub('(/Users/dev/y)'), '(<path>)')
  const prose = 'https://host/Users/x and T1.md:12 and E: drive and a / b'
  assert.equal(scrub(prose), prose, 'a URL, a line number, a bare drive letter and a slash between words are not paths')
  const linux = scrubber({ root: '/srv/repo', pluginRoot: '/srv/plug', tmp: '/tmp', home: '/home/me' })
  assert.equal(linux('docs/tmp/x ./tmp/x /tmp/qh-1/x /home/me/y'), 'docs/tmp/x ./tmp/x <tmp>/qh-1/x <home>/y')
  // Codex review of abd5a13: an apostrophe inside a quoted path, a quoted file:
  // URL, an UNQUOTED path with a space, a forward-slash UNC share, a `->` before
  // the path — and the over-scrub the design accepts, pinned so it is a decision
  // and not a surprise.
  assert.equal(scrub("\"/opt/Example's secret/private/task.md\""), '"<path>"')
  assert.equal(scrub('"file:///opt/Example Person/private/task.md"'), '"<path>"')
  assert.equal(scrub('D:\\Projects\\Example Person\\private\\task.md failed'), '<path> failed')
  assert.equal(scrub('/Users/Example Person/private/task.md was read'), '<path> was read')
  assert.equal(scrub('//server/share/private/task.md'), '<path>')
  assert.equal(scrub('at ->/opt/private/task.md'), 'at -><path>')
  assert.equal(scrub('Invalid regular expression: /foo\\/bar/i'), 'Invalid regular expression: <path>',
    'over-scrubbed on purpose: a slash-rooted token in free text is a path until proven otherwise (§6)')
  assert.equal(scrub('https://example.invalid/?q=/api/v1'), 'https://example.invalid/?q=<path>', 'same decision')
})

test('compareReaders: a directory work-next could not read is not a disagreement, and a crashed reader compares nothing', () => {
  const adrNext = [
    { tasksDir: 'docs/adr/A/tasks', ready: [{ id: 'T1', path: 'docs/adr/A/tasks/T1.md', unproven: null }] },
    { tasksDir: 'docs/adr/B/tasks', ready: [{ id: 'T2', path: 'docs/adr/B/tasks/T2.md', unproven: 'stale' }] },
    { tasksDir: 'docs/adr/C/tasks', ready: null },
  ]
  // B is unread by work-next: adr-next's T2 is not "not offered", it is unobserved.
  assert.deepEqual(compareReaders(adrNext, { ready: [], readinessUnproven: ['docs/adr/B/tasks'] }),
    [{ task: 'docs/adr/A/tasks/T1.md', adrNext: 'ready', workNext: 'not offered', adrNextSays: null }])
  // DIRTY: with B read, T2 IS a disagreement.
  assert.deepEqual(compareReaders(adrNext, { ready: [], readinessUnproven: [] }).map(d => d.task),
    ['docs/adr/A/tasks/T1.md', 'docs/adr/B/tasks/T2.md'])
  // work-next ready where adr-next answered otherwise; C answered nothing, so its task is not compared.
  const other = compareReaders(adrNext, { ready: ['docs/adr/A/tasks/T9.md', 'docs/adr/C/tasks/T3.md'], readinessUnproven: [] })
  assert.deepEqual(other.filter(d => d.workNext === 'ready').map(d => d.task), ['docs/adr/A/tasks/T9.md'])
  assert.deepEqual(compareReaders(adrNext, null), [], 'a crashed work-next made no observation')
})

test('failedToRun: a child killed at the deadline is said to have been killed, with the budget', () => {
  assert.match(failedToRun({ code: 'ETIMEDOUT' }, 120_000), /killed at the probe's 120s budget/)
  assert.match(failedToRun({ code: 'ETIMEDOUT' }), /killed at the probe's budget/)
  assert.equal(failedToRun({ code: 'ENOENT' }), 'did not start: ENOENT')
  assert.equal(failedToRun({ message: 'boom' }), 'did not start: boom')
})

// BACKLOG §270: five "disagreements" on an outside corpus were every one a task of
// a Superseded record. adr-next answers for a plan and says it is one; work-next
// offers only work orders. That is two readers answering different questions.
test('compareReaders: a task of a record that is not Accepted is not a disagreement', () => {
  const adrNext = [
    { tasksDir: 'docs/adr/S/tasks', undecided: true, ready: [{ id: 'T1', path: 'docs/adr/S/tasks/T1.md', unproven: null }] },
    { tasksDir: 'docs/adr/A/tasks', undecided: false, ready: [{ id: 'T2', path: 'docs/adr/A/tasks/T2.md', unproven: null }] },
    { tasksDir: 'docs/adr/U/tasks', undecided: null, ready: [{ id: 'T3', path: 'docs/adr/U/tasks/T3.md', unproven: null }] },
  ]
  // S is a plan; A and U are compared — U because "could not tell" is not "undecided".
  assert.deepEqual(compareReaders(adrNext, { ready: [], readinessUnproven: [] }).map(d => d.task),
    ['docs/adr/A/tasks/T2.md', 'docs/adr/U/tasks/T3.md'])
})

// Reported from a static-site repository's 2.107.0 run: the working tree was
// byte-identical before and after, but the SessionStart call appended
// `.git/quality-harness/sessions/corpus-probe-<pid>.jsonl`. The probe pointed its
// plugin data and temp directories at scratch and said nothing was written beside
// the corpus; the session log is resolved from the repository's git dir, which
// neither variable controls. A read-only probe leaves nothing in the corpus.
test('probe: a run leaves nothing in the probed repository, its git dir included', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'qh-probe-readonly-'))
  try {
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8', timeout: 10_000 }).status, 0)
    const report = probe(repo)
    assert.deepEqual(report.couldNotRun, [], JSON.stringify(report.couldNotRun))
    // ADR-064 T1: every report says which readers answered.
    assert.match(report.probe.readers?.sha256 ?? '', /^[0-9a-f]{64}$/, JSON.stringify(report.probe))
    assert.ok(!existsSync(path.join(repo, '.git', 'quality-harness')),
      'the probe must not write quality-harness state into the probed repository')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

// Codex review of 2.108.0: an override that is the SAME directory for every
// repository merged two worktrees' check records, so one read the other's pass as
// its own. The override is a root; each repository keeps its own place under it.
test('stateDir: an override keeps each repository apart', () => {
  const a = mkdtempSync(path.join(os.tmpdir(), 'qh-state-a-'))
  const b = mkdtempSync(path.join(os.tmpdir(), 'qh-state-b-'))
  const root = mkdtempSync(path.join(os.tmpdir(), 'qh-state-root-'))
  const saved = process.env.QUALITY_HARNESS_STATE_DIR
  try {
    for (const dir of [a, b]) assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8', timeout: 10_000 }).status, 0)
    process.env.QUALITY_HARNESS_STATE_DIR = root
    const one = stateDir(a)
    const two = stateDir(b)
    assert.notEqual(one, two, 'two repositories under one override must not share state')
    assert.ok(one.startsWith(path.resolve(root)) && two.startsWith(path.resolve(root)), `${one} ${two}`)
  } finally {
    if (saved === undefined) delete process.env.QUALITY_HARNESS_STATE_DIR
    else process.env.QUALITY_HARNESS_STATE_DIR = saved
    for (const dir of [a, b, root]) rmSync(dir, { recursive: true, force: true })
  }
})

// ADR-064 T1. `probe.sha256` covers corpus-probe.mjs alone, so attestations at four
// different shas carried one hash while the readers changed. The fingerprint covers
// every reader file, and is built in a scratch plugin of its own (CLAUDE.md §9).
function scratchPlugin(prefix, nest = []) {
  const top = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), prefix)))
  const plugin = path.join(top, ...nest, 'plugin')
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(plugin, rel)), { recursive: true })
    writeFileSync(path.join(plugin, rel), text)
  }
  put('bin/adr-lint', '#!/usr/bin/env python3\nprint(1)\n')
  put('hooks/hooks.json', '{}\n')
  put('lib/record.py', 'X = 1\n')
  put('scripts/a.mjs', 'export const a = 1\n')
  put('scripts/z.mjs', 'export const z = 1\n')
  writeFileSync(path.join(top, '.gitignore'), '__pycache__/\n')
  return { top, plugin, put }
}
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8', timeout: 30_000 })

test('the probe fingerprints the readers it ran', () => {
  const { top, plugin, put } = scratchPlugin('qh-fp-')
  try {
    const first = readerFingerprint(plugin).sha256
    assert.match(first, /^[0-9a-f]{64}$/)
    put('scripts/z.mjs', 'export const z = 2\n')
    const changed = readerFingerprint(plugin).sha256
    assert.notEqual(changed, first, 'a change to the LAST reader file in sort order moves the fingerprint')
    put('scripts/z.mjs', 'export const z = 2\r\n')
    assert.equal(readerFingerprint(plugin).sha256, changed, 'a CRLF copy hashes as its LF twin')
    put('lib/__pycache__/record.cpython-314.pyc', 'bytecode')
    put('scripts/.DS_Store', 'finder')
    assert.equal(readerFingerprint(plugin).sha256, changed, '__pycache__ and dotfiles are not readers')
    // The commit is never hashed in: the same files in a checkout hash the same.
    assert.equal(git(top, 'init', '-q').status, 0)
    assert.equal(git(top, 'add', '.').status, 0)
    assert.equal(git(top, 'commit', '-qm', 'x').status, 0)
    assert.equal(readerFingerprint(plugin).sha256, changed)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('uncommitted reader edits mark the fingerprint dirty', () => {
  const { top, plugin, put } = scratchPlugin('qh-fp-dirty-')
  const nested = scratchPlugin('qh-fp-nested-', ['vendor'])
  try {
    for (const dir of [top, nested.top]) {
      assert.equal(git(dir, 'init', '-q').status, 0)
      assert.equal(git(dir, 'add', '.').status, 0)
      assert.equal(git(dir, 'commit', '-qm', 'x').status, 0)
    }
    const head = git(top, 'rev-parse', 'HEAD').stdout.trim()
    assert.deepEqual({ git: readerFingerprint(plugin).git, dirty: readerFingerprint(plugin).dirty }, { git: head, dirty: false })
    put('bin/adr-lint', '#!/usr/bin/env python3\nprint(2)\n')
    assert.equal(readerFingerprint(plugin).dirty, true, 'an uncommitted reader edit is dirty')
    const vendored = readerFingerprint(nested.plugin)
    assert.deepEqual({ git: vendored.git, dirty: vendored.dirty }, { git: null, dirty: null },
      'a plugin inside another repository is not that repository\'s checkout')
  } finally {
    rmSync(top, { recursive: true, force: true })
    rmSync(nested.top, { recursive: true, force: true })
  }
})

// ADR-064 T4. A disk walk that took minutes per record, and an adr-next run past
// work-next's 60 s budget, were found only because a peer noticed: the report had
// no timing. Every spawn is timed, including one that failed.
test('every reader spawn in the probe report is timed', () => {
  const repo = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-probe-timed-')))
  try {
    mkdirSync(path.join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks'), { recursive: true })
    writeFileSync(path.join(repo, 'docs', 'adr', 'ADR-001-x.md'), '# ADR-001: x\n\n**Status:** Accepted\n\n## Context\n\nx\n\n## Decision\n\ny\n')
    writeFileSync(path.join(repo, 'docs', 'adr', 'ADR-001-x', 'tasks', 'T1-a.md'), '# Task ADR-001-T1: a\n\n## Verification Log\n\n')
    assert.equal(git(repo, 'init', '-q').status, 0)
    const report = probe(repo)
    assert.ok(report.adrLint.length >= 1, 'the scratch corpus has a record, so adr-lint ran')
    const readers = new Set(report.timings.map(entry => entry.reader))
    for (const name of ['adr-lint', 'adr-next', 'work-next', 'adr-state', 'SessionStart', 'corpus-report']) {
      assert.ok(readers.has(name), `${name} is timed: ${JSON.stringify(report.timings)}`)
    }
    assert.ok(report.timings.every(entry => Number.isInteger(entry.ms) && entry.ms >= 0), JSON.stringify(report.timings))
    assert.ok(report.slowest.length <= 5 && report.slowest.every((entry, i, all) => i === 0 || all[i - 1].ms >= entry.ms), JSON.stringify(report.slowest))
    // A reader killed at its budget is timed too: a null reader still has its time.
    const starved = probe(repo, { timeoutMs: 1 })
    assert.ok(starved.couldNotRun.length > 0, 'a 1 ms budget kills the readers')
    assert.ok(starved.timings.some(entry => entry.reader === 'work-next'), JSON.stringify(starved.timings))
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

// The fingerprint reads every reader directory, not only `scripts/`: a `record.py`
// change changes what adr-lint and adr-next decide, and `hooks` wires which reader
// runs when (plugin/scripts/reader-paths.mjs).
test('the reader fingerprint covers lib and hooks', () => {
  const { top, plugin, put } = scratchPlugin('qh-fp-dirs-')
  try {
    const before = readerFingerprint(plugin).sha256
    put('lib/record.py', 'X = 2\n')
    const afterLib = readerFingerprint(plugin).sha256
    assert.notEqual(afterLib, before, 'a lib/ change moves the fingerprint')
    put('hooks/hooks.json', '{"x": 1}\n')
    assert.notEqual(readerFingerprint(plugin).sha256, afterLib, 'a hooks/ change moves the fingerprint')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// ADR-064 T2. Every comparison between two runs of one corpus was done by a peer by
// hand: unbacked 15 → 47, readinessUnproven 3 → 2, an adrLint total 67/92 → 68/91.
// `--diff <before> <after>` reads two saved reports, runs nothing, and prints only
// what changed — scrubbed again, because an older probe's scrubber leaked paths.
const probeScript = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'scripts', 'corpus-probe.mjs')
const baseReport = () => ({
  probe: { version: '2.109.0', sha256: 'p'.repeat(64), readers: { sha256: 'a'.repeat(64), git: null, dirty: null } },
  root: '.', look: 'ok', corpora: ['docs/adr'],
  workNext: { records: 1, accepted: 1, tasks: 1, ready: [], unbacked: [], readinessUnproven: [] },
  adrState: { read: 1, governing: 1 },
  adrLint: [{ file: 'docs/adr/ADR-001-a.md', exit: 0, verdict: 'PASS' }],
  sessionStart: { exit: 0, lines: ['Verification: x'] },
  couldNotRun: [], disagreements: [],
  timings: [{ reader: 'adr-next', target: 'docs/adr/ADR-001-a/tasks', ms: 1000 }, { reader: 'work-next', target: null, ms: 100 }],
})
function diffOf(before, after) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-probe-diff-'))
  try {
    writeFileSync(path.join(dir, 'before.json'), JSON.stringify(before))
    writeFileSync(path.join(dir, 'after.json'), JSON.stringify(after))
    const run = spawnSync(process.execPath, [probeScript, '--diff', path.join(dir, 'before.json'), path.join(dir, 'after.json')], { encoding: 'utf8', timeout: 30_000 })
    return { status: run.status, lines: run.stdout.split('\n').filter(Boolean), stderr: run.stderr }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('corpus-probe --diff names what changed between two runs of one corpus', () => {
  const before = baseReport()
  const after = baseReport()
  after.probe.readers.sha256 = 'b'.repeat(64)
  after.adrLint[0] = { file: 'docs/adr/ADR-001-a.md', exit: 1, verdict: 'FAIL', reason: 'T1-a.md:12: a row' }
  after.workNext.unbacked = ['docs/adr/ADR-001-a/tasks/T1-a.md']
  after.timings = [{ reader: 'adr-next', target: 'docs/adr/ADR-001-a/tasks', ms: 3000 }, { reader: 'work-next', target: null, ms: 900 }]
  const { status, lines, stderr } = diffOf(before, after)
  assert.equal(status, 0, stderr)
  assert.deepEqual(lines, [
    `readers: ${'a'.repeat(12)}… → ${'b'.repeat(12)}…`,
    'workNext.unbacked: + docs/adr/ADR-001-a/tasks/T1-a.md',
    'adrLint docs/adr/ADR-001-a.md: PASS → FAIL — T1-a.md:12: a row',
    'slower: adr-next docs/adr/ADR-001-a/tasks 1000 → 3000 ms',
  ], 'work-next went 100 → 900 ms, doubled by under a second: no line')
})

test('corpus-probe --diff over two identical reports says nothing changed', () => {
  assert.deepEqual(diffOf(baseReport(), baseReport()).lines, ['nothing changed'])
  const older = baseReport()
  delete older.workNext.unbacked
  delete older.timings
  const { lines } = diffOf(older, baseReport())
  assert.deepEqual(lines, ['before lacks workNext.unbacked', 'before lacks timings'])
})

test('corpus-probe --diff re-scrubs its inputs and never compares an unreadable run', () => {
  const before = baseReport()
  const after = baseReport()
  after.adrLint[0] = { file: 'docs/adr/ADR-001-a.md', exit: 1, verdict: 'FAIL', reason: 'C:\\Users\\Someone\\repo\\x.md and /home/someone/repo/y.md' }
  const leaked = diffOf(before, after).lines.join('\n')
  assert.match(leaked, /PASS → FAIL/)
  assert.doesNotMatch(leaked, /Someone|someone/, leaked)
  const moved = baseReport()
  moved.corpora = ['docs/decisions']
  assert.deepEqual(diffOf(baseReport(), moved).lines, ['corpora differ (docs/adr → docs/decisions): not compared'])
  const blind = baseReport()
  blind.look = 'UNPROVEN'
  assert.deepEqual(diffOf(baseReport(), blind).lines, ['look: ok → UNPROVEN: not compared'])
  const broken = diffOf(baseReport(), baseReport())
  assert.equal(broken.status, 0)
})

// ADR-064 T3. Eight attestations were transcribed by hand, and seven of the eleven
// written on 2026-09-24 carry null counts because the report had no scalar to copy.
// `--attest <label> <report>` writes it from the saved report. Its `at` is a commit
// only when the reader files match that commit: release-evidence compares commits
// and cannot see a runner's working tree.
function attestOf(report, label = 'macos-rust') {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-probe-attest-'))
  try {
    writeFileSync(path.join(dir, 'new.json'), JSON.stringify(report))
    const run = spawnSync(process.execPath, [probeScript, '--attest', label, path.join(dir, 'new.json')], { encoding: 'utf8', timeout: 30_000 })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const attestable = () => {
  const report = baseReport()
  report.probe = { ...report.probe, date: '2026-09-25', platform: 'Darwin 27.0.0', node: '24.11.1', python: '3.14.7',
    readers: { sha256: 'a'.repeat(64), git: 'c'.repeat(40), dirty: false } }
  report.adrNext = [{ tasksDir: 'docs/adr/ADR-001-a/tasks', ready: [{ id: 'T1', path: 'docs/adr/ADR-001-a/tasks/T1-a.md' }] }]
  report.frozenTaskDirs = ['docs/adr-archive/ADR-000-old/tasks']
  report.workNext.readinessUnproven = ['docs/adr/ADR-002-b/tasks']
  report.couldNotRun = [{ reader: 'adr-state', why: 'x' }]
  return report
}

test('corpus-probe --attest writes an attestation release-evidence accepts', () => {
  const attestation = attestOf(attestable())
  assert.equal(attestation.at, 'c'.repeat(40))
  assert.equal(outsideRun(['plugin/scripts/lifecycle.mjs'], [{ file: 'x.json', ...attestation }], () => true).verdict, 'attested')
  assert.deepEqual({ date: attestation.date, plugin: attestation.plugin, kind: attestation.kind, probeSha256: attestation.probeSha256,
    readers: attestation.readers, platform: attestation.platform, node: attestation.node, python: attestation.python,
    corpus: attestation.corpus, couldNotRun: attestation.couldNotRun, disagreements: attestation.disagreements,
    readinessUnproven: attestation.readinessUnproven, runner: attestation.runner, found: attestation.found }, {
    date: '2026-09-25', plugin: '2.109.0', kind: 'probe', probeSha256: 'p'.repeat(64), readers: 'a'.repeat(64),
    platform: 'Darwin 27.0.0', node: '24.11.1', python: '3.14.7', corpus: { records: 1, tasks: 1, taskDirectories: 2 },
    couldNotRun: 1, disagreements: 0, readinessUnproven: 1, runner: 'macos-rust', found: '',
  })
  const text = JSON.stringify(attestation)
  assert.doesNotMatch(text, /docs\/|ADR-001|T1-a/, `counts only, nothing from the corpus: ${text}`)
})

test('corpus-probe --attest leaves at null over uncommitted readers', () => {
  const dirty = attestable()
  dirty.probe.readers.dirty = true
  const edited = attestOf(dirty)
  assert.equal(edited.at, null)
  assert.match(edited.atReason, /reader files modified at HEAD/)
  const cached = attestable()
  cached.probe.readers = { sha256: 'a'.repeat(64), git: null, dirty: null }
  const installed = attestOf(cached)
  assert.equal(installed.at, null)
  assert.match(installed.atReason, /not a git checkout/)
  for (const attestation of [edited, installed]) {
    assert.notEqual(outsideRun(['plugin/scripts/lifecycle.mjs'], [{ file: 'x.json', ...attestation }], () => true).verdict, 'attested')
  }
  const unread = attestable()
  unread.workNext = null
  assert.deepEqual(attestOf(unread).corpus, { records: null, tasks: null, taskDirectories: 2 }, 'a reader that did not answer is null, never 0')
})

// Cold review of 833ea52. The fingerprint was taken once, after every reader ran, so a
// run whose readers moved under it — a commit mid-run, a mutation campaign restoring
// files — reported the commit it ENDED at, which release-evidence would accept. And a
// dirty check that could not run was worded as an observation of modified files.
test('an attestation has no commit when the readers moved during the run, and says why it has none', () => {
  const same = { sha256: 'a'.repeat(64), git: 'c'.repeat(40), dirty: false }
  assert.deepEqual(readersOfRun(same, { ...same }), same)
  const moved = readersOfRun(same, { ...same, sha256: 'b'.repeat(64) })
  assert.equal(moved.moved, true)
  const committed = readersOfRun(same, { ...same, git: 'd'.repeat(40) })
  assert.equal(committed.moved, true, 'a commit during the run moves the readers too')
  const reason = readers => {
    const attested = attestation({ probe: { readers } }, 'x')
    assert.equal(attested.at, null)
    return attested.atReason
  }
  assert.match(reason(moved), /readers changed while the probe ran/)
  assert.match(reason({ ...same, dirty: null }), /could not be checked/)
  assert.match(reason({ ...same, dirty: true }), /reader files modified at HEAD/)
  assert.match(reason({ sha256: 'a'.repeat(64), git: null, dirty: null }), /not a git checkout/)
})

// Codex review of 833ea52. A FAIL that stays a FAIL for a DIFFERENT reason — one defect
// fixed, another exposed — printed "nothing changed". And a saved file that is not a
// report was echoed into the error (a JSON parse message quotes the input) or, as
// `null`, crashed with a stack full of absolute paths.
test('corpus-probe --diff names a changed FAIL reason, and a file that is not a report is refused cleanly', () => {
  const before = baseReport()
  before.adrLint[0] = { file: 'docs/adr/ADR-001-a.md', exit: 1, verdict: 'FAIL', reason: 'T1-a.md:12: first defect' }
  const after = baseReport()
  after.adrLint[0] = { file: 'docs/adr/ADR-001-a.md', exit: 1, verdict: 'FAIL', reason: 'T1-a.md:30: second defect' }
  assert.deepEqual(diffOf(before, after).lines, ['adrLint docs/adr/ADR-001-a.md: FAIL, reason changed — T1-a.md:30: second defect'])
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-probe-notreport-'))
  try {
    // An invalid token, which V8's parse error quotes back ("…" is not valid JSON).
    writeFileSync(path.join(dir, 'secret.json'), 'SECRET-VALUE-123 is not json')
    writeFileSync(path.join(dir, 'null.json'), 'null')
    writeFileSync(path.join(dir, 'ok.json'), JSON.stringify(baseReport()))
    for (const bad of ['secret.json', 'null.json']) {
      for (const args of [['--diff', path.join(dir, bad), path.join(dir, 'ok.json')], ['--attest', 'x', path.join(dir, bad)]]) {
        const run = spawnSync(process.execPath, [probeScript, ...args], { encoding: 'utf8', timeout: 30_000 })
        assert.equal(run.status, 2, `${args.join(' ')}: ${run.stderr}`)
        assert.match(run.stderr, bad === 'null.json' ? /is not a report \(not a JSON object\)/ : /is not a report \(not valid JSON\)/)
        // /SECRET/, not the whole value: V8 truncates the excerpt it quotes ("SECRET-VAL"...).
        assert.doesNotMatch(run.stderr, /SECRET|at .*\.mjs:\d+|TypeError/, run.stderr)
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// BACKLOG §289 item 6. Standalone rather than added to the diff tests above, which
// ADR-064 T2/T3 lock: a reader that did not answer on one side is ONE line, not one
// per field (the locked twin shows a missing single FIELD is still named).
test('corpus-probe --diff names a reader absent on one side once', () => {
  const unanswered = baseReport()
  unanswered.workNext = null
  const missing = diffOf(baseReport(), unanswered).lines
  assert.deepEqual(missing.filter(line => /workNext/.test(line)),
    ['workNext: after has no answer from this reader (see couldNotRun), so its fields are not compared'], missing.join('\n'))
})

// BACKLOG §289 item 5: when work-next did not answer and corpus-report DID count,
// those counts are used and say where from, rather than null beside a report that
// holds both. Null stays null when neither answered (the locked test above).
test('an attestation falls back to corpus-report counts when work-next did not answer', () => {
  const unread = attestable()
  unread.workNext = null
  // The real reader's shape: `records` is a count (corpus-report.mjs recordCount).
  unread.corpusReport = [{ root: 'docs/adr', totals: { tasks: 3 }, records: 2 }, { root: 'x', totals: null, records: null }]
  assert.deepEqual(attestOf(unread).corpus, { records: 2, tasks: 3, taskDirectories: 2, countsFrom: 'corpusReport' })
})
