// corpus-probe's pure parts, driven directly: the redaction every emitted string
// passes through, the reader comparison, and the spawn-failure classifier. Each
// was found wrong by a different-lineage review of bdeba73 on inputs the matrix's
// five corpora never produce — a drive-rooted diagnostic, a relative path whose
// component is a root name, a directory one reader did not read.
import assert from 'node:assert/strict'
import test from 'node:test'
import { compareReaders, failedToRun, probe, scrubber } from '../plugin/scripts/corpus-probe.mjs'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { stateDir } from '../plugin/scripts/event-log.mjs'

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
