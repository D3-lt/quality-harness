// corpus-probe's pure parts, driven directly: the redaction every emitted string
// passes through, the reader comparison, and the spawn-failure classifier. Each
// was found wrong by a different-lineage review of bdeba73 on inputs the matrix's
// five corpora never produce — a drive-rooted diagnostic, a relative path whose
// component is a root name, a directory one reader did not read.
import assert from 'node:assert/strict'
import test from 'node:test'
import { compareReaders, failedToRun, scrubber } from '../plugin/scripts/corpus-probe.mjs'

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
