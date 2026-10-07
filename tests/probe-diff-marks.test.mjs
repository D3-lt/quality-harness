// ADR-089 T1: `corpus-probe --diff` prints one marked line per element that came or went, compares
// the work-next, adr-state and adr-next fields it skipped, and compares a PARTIAL pair's adr-lint
// verdicts over the records both runs read. Two outside runs of v3.8.10 misread a removed advice
// line, because several elements were joined on one line with `, ` and advice text carries `, ` and
// ` - ` itself; one reported a fixed defect as a regression for that reason.
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verdictMoves } from '../plugin/scripts/corpus-probe.mjs'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const probeScript = path.join(repoRoot, 'plugin', 'scripts', 'corpus-probe.mjs')
const PARTIAL_LINE = 'counts not compared; adr-lint verdicts compared over the records both runs read'

function diffOf(before, after) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-diff-marks-'))
  try {
    writeFileSync(path.join(dir, 'before.json'), JSON.stringify(before))
    writeFileSync(path.join(dir, 'after.json'), JSON.stringify(after))
    const run = spawnSync(process.execPath, [probeScript, '--diff', path.join(dir, 'before.json'), path.join(dir, 'after.json')],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.split('\n').filter(Boolean)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// A report carrying every field --diff compares, so a field compared wrongly (an object read as a
// scalar) prints a line on two identical reports.
const report = () => ({
  probe: { version: '3.8.10', sha256: 'p'.repeat(64), readers: { sha256: 'a'.repeat(64), git: null, dirty: null } },
  root: '.', look: 'ok', corpora: ['docs/adr'],
  records: [{ file: 'docs/adr/ADR-001-a.md', status: 'Accepted' }], undecided: [],
  workNext: {
    look: 'ok', records: 1, accepted: 1, tasks: 1, ready: [], unbacked: [], readinessUnproven: [], unmarkedArchives: [], readyButClaimedDone: [],
    underUndecided: [], retirable: [], specs: 1, unprovenSpecs: [], uncoveredReadySpecs: [], partialBecause: [],
    next: { id: 'adr-execute', entry: 'x', when: 'y', remedy: 'z' },
  },
  adrState: { look: 'ok', read: 1, governing: 1, governingNothing: [{ id: 'ADR-003', file: 'docs/adr/ADR-003-c.md' }], contested: 0,
    danglingSupersession: [{ id: 'ADR-004', status: 'Superseded by ADR-009' }] },
  adrNext: [{ tasksDir: 'docs/adr/ADR-001-a/tasks', ready: [{ id: 'T1', path: 'docs/adr/ADR-001-a/tasks/T1-a.md', unproven: null }], undecided: false, unreadable: [] }],
  adrLint: [{ file: 'docs/adr/ADR-001-a.md', exit: 0, verdict: 'PASS', advice: ['advice: T1-add-items.md: UNRUN'] },
    { file: 'docs/adr/ADR-002-b.md', exit: 0, verdict: 'PASS', advice: [] }],
  sessionStart: { exit: 0, lines: ['Verification: x', 'Next: y'] },
  couldNotRun: [], disagreements: [], timings: [],
})

test('every element that came or went is its own marked line', () => {
  // The CLEAN twins: identical reports carrying every compared field say nothing changed, and a
  // one-element change prints exactly the line it printed before this record.
  assert.deepEqual(diffOf(report(), report()), ['nothing changed'])
  const one = report()
  one.workNext.unbacked = ['docs/adr/ADR-001-a/tasks/T1-a.md']
  assert.deepEqual(diffOf(report(), one), ['workNext.unbacked: + docs/adr/ADR-001-a/tasks/T1-a.md'])

  const after = report()
  const tricky = 'advice: T2: a new line, with a comma - and a dash'
  after.adrLint[0].advice = [tricky, 'advice: T3: another']
  after.adrLint[1] = { file: 'docs/adr/ADR-005-e.md', exit: 1, verdict: 'FAIL', reason: 'r' }
  after.sessionStart.lines = ['Verification: x']
  const lines = diffOf(report(), after)
  const advice = lines.filter(line => line.startsWith('adrLint docs/adr/ADR-001-a.md advice: '))
  assert.deepEqual(advice, [
    `adrLint docs/adr/ADR-001-a.md advice: + ${tricky}`,
    'adrLint docs/adr/ADR-001-a.md advice: + advice: T3: another',
    'adrLint docs/adr/ADR-001-a.md advice: - advice: T1-add-items.md: UNRUN',
  ], lines.join('\n'))
  for (const line of advice) assert.match(line, /^adrLint \S+ advice: [+-] /)
  assert.ok(lines.includes('adrLint: + docs/adr/ADR-005-e.md (FAIL)'), lines.join('\n'))
  assert.ok(lines.includes('adrLint: - docs/adr/ADR-002-b.md (was PASS)'), lines.join('\n'))
  assert.ok(lines.includes('SessionStart: - Next: y'), lines.join('\n'))
  // Every line names its field and then carries its mark, or is a scalar or verdict move.
  assert.equal(lines.length, 6, lines.join('\n'))
  for (const line of lines) assert.doesNotMatch(line, /, [+-] /, line)
})

test('diff compares the fields it used to skip', () => {
  const changes = {
    'workNext.specs': r => { r.workNext.specs = 2 },
    'workNext.unprovenSpecs': r => { r.workNext.unprovenSpecs = ['docs/specs/a.md'] },
    'workNext.uncoveredReadySpecs': r => { r.workNext.uncoveredReadySpecs = ['docs/specs/b.md'] },
    'workNext.retirable': r => { r.workNext.retirable = ['docs/adr/ADR-001-a.md'] },
    'workNext.underUndecided': r => { r.workNext.underUndecided = ['docs/adr/ADR-006-f/tasks/T1-x.md'] },
    'workNext.next.id': r => { r.workNext.next = { id: 'adr-write' } },
    'adrState.governingNothing': r => { r.adrState.governingNothing = [] },
    'adrState.contested': r => { r.adrState.contested = 2 },
    'adrState.danglingSupersession': r => { r.adrState.danglingSupersession = [] },
    'adrNext docs/adr/ADR-001-a/tasks ready': r => { r.adrNext[0].ready = [] },
    adrNext: r => { r.adrNext = [] },
  }
  for (const [field, change] of Object.entries(changes)) {
    const after = report()
    change(after)
    const lines = diffOf(report(), after)
    assert.equal(lines.length, 1, `${field}: ${lines.join('\n')}`)
    assert.ok(lines[0].startsWith(`${field}: `), `${field}: ${lines.join('\n')}`)
  }
  // A next that became null is a move, not a field the report lacks.
  const none = report()
  none.workNext.next = null
  assert.deepEqual(diffOf(report(), none), ['workNext.next.id: adr-execute → null'])
  // A report from before the field is named as lacking it, never read as empty.
  const older = report()
  delete older.workNext.uncoveredReadySpecs
  assert.deepEqual(diffOf(older, report()), ['before lacks workNext.uncoveredReadySpecs'])
})

// ADR-089 Context, reproduced: a corpus whose ADR-001 is readable and whose ADR-002 holds a NUL byte
// is PARTIAL; ADR-001 then turns PASS → FAIL, and --diff printed only "not compared".
function probeJson(root) {
  const run = spawnSync(process.execPath, [probeScript, '--json'], { cwd: root, encoding: 'utf8', timeout: 300_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('a partial pair compares the verdicts both runs read', () => {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-diff-partial-')))
  try {
    cpSync(path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'go-module'), root, { recursive: true })
    rmSync(path.join(root, 'expected.json'))
    writeFileSync(path.join(root, 'docs', 'adr', 'ADR-002-nul.md'), '# ADR-002: nul\n\n**Status:** Accepted\n\na\0b\n')
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args],
      { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true })
    git('init', '-q'); git('add', '-A')
    const before = probeJson(root)
    assert.equal(before.look, 'PARTIAL', JSON.stringify(before.workNext?.partialBecause))
    const record = path.join(root, 'docs', 'adr', 'ADR-001-cart-totals-are-integer-cents.md')
    const text = readFileSync(record, 'utf8')
    const alternative = '- `float64` with rounding at the edge — rejected, it is how the totals drifted.\n'
    assert.ok(text.includes(alternative))
    writeFileSync(record, text.replace(alternative, ''))
    const after = probeJson(root)
    const file = 'docs/adr/ADR-001-cart-totals-are-integer-cents.md'
    assert.equal(before.adrLint.find(entry => entry.file === file)?.verdict, 'PASS')
    assert.equal(after.adrLint.find(entry => entry.file === file)?.verdict, 'FAIL')

    const lines = diffOf(before, after)
    assert.equal(lines[0], `look: PARTIAL → PARTIAL: ${PARTIAL_LINE}`, lines.join('\n'))
    assert.ok(lines.some(line => line.startsWith(`adrLint ${file}: PASS → FAIL — `)), lines.join('\n'))
    assert.ok(!lines.join('\n').includes(root), 'no absolute path')

    const { compared, notCompared, moves } = verdictMoves(before, after)
    assert.deepEqual({ compared, notCompared, moved: moves.map(move => move.file) }, { compared: 1, notCompared: 1, moved: [file] })
  } finally { rmSync(root, { recursive: true, force: true }) }
  // A record that became unreadable is a move out of PASS, never a record left uncompared.
  const pass = { adrLint: [{ file: 'a.md', verdict: 'PASS' }] }
  const unread = { adrLint: [{ file: 'a.md', verdict: 'unread', reason: 'ENOENT' }] }
  assert.deepEqual(verdictMoves(pass, unread), { compared: 1, notCompared: 0, moves: [{ file: 'a.md', from: 'PASS', to: 'unread', reason: 'ENOENT' }] })
})

test('an unproven side is still one not compared line', () => {
  for (const [b, a] of [['PARTIAL', 'UNPROVEN'], ['UNPROVEN', 'PARTIAL']]) {
    const before = report()
    const after = report()
    before.look = b
    after.look = a
    // A verdict that moved between them is still not compared when either side could not look.
    after.adrLint[0] = { file: 'docs/adr/ADR-001-a.md', exit: 1, verdict: 'FAIL', reason: 'r' }
    assert.deepEqual(diffOf(before, after), [`look: ${b} → ${a}: not compared`])
  }
})

// A review of ADR-089 (P3): an element carrying a line break printed as two lines, so a spec named
// `new\nworkNext.uncoveredReadySpecs: - old.md` forged a removal nobody made. One value is one line.
test('a value carrying a line break is one escaped line', () => {
  const after = report()
  after.workNext.uncoveredReadySpecs = ['docs/specs/new\nworkNext.uncoveredReadySpecs: - old.md']
  assert.deepEqual(diffOf(report(), after), ['workNext.uncoveredReadySpecs: + docs/specs/new\\nworkNext.uncoveredReadySpecs: - old.md'])
  // Every C0 control character is escaped, in an element, a reason and a scalar alike.
  const more = report()
  more.adrLint[0].advice = ['advice: a\rb\tc\u0001d\u007fe']
  more.adrLint[1] = { ...more.adrLint[1], verdict: 'FAIL', reason: 'x\ny' }
  more.workNext.next = { id: 'adr\nwrite' }
  const lines = diffOf(report(), more)
  assert.ok(lines.includes('adrLint docs/adr/ADR-001-a.md advice: + advice: a\\rb\\tc\\x01d\\x7fe'), lines.join('\n'))
  assert.ok(lines.includes('adrLint docs/adr/ADR-002-b.md: PASS → FAIL — x\\ny'), lines.join('\n'))
  assert.ok(lines.includes('workNext.next.id: adr-execute → adr\\nwrite'), lines.join('\n'))
  // The corpora line, which returns before the rest, too.
  const moved = report()
  moved.corpora = ['docs/adr\nlook: ok → ok']
  assert.deepEqual(diffOf(report(), moved), ['corpora differ (docs/adr → docs/adr\\nlook: ok → ok): not compared'])
})
