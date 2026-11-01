// ADR-135 T1: the Go core's branch-state functions (core/hooks/branchstate.go) answer every row as the Node functions in
// plugin/scripts/branch-state.mjs do. The rows are built here, from the Node exports, over the state shapes the locked tests
// in tests/branch-state.test.mjs use; the Go test answers each one and says how many it compared. Nothing is stored: both
// implementations are run live, so a change to either one that the other does not make is a disagreement.
// Skipped, with the reason, where `go` is not on PATH: there is no core to compare.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'
import {
  briefUnchanged, ciRed, freshSnapshot, headRuns, movedSince, pastCapLine, pastShowCap, redKey, render, snapshotKey,
  unchangedButOwnCommits, unknownKey, usableCache,
} from '../plugin/scripts/branch-state.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const coreDir = path.resolve(here, '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

const SHA = 'a'.repeat(40)
const TIP = 'b'.repeat(40)
const OTHER = 'c'.repeat(40)

// The CI answers collect() produces, one of each arm render reads.
const cis = [
  { looked: true, sha: 'aaaaaaa', status: 'completed', conclusion: 'success', failed: [], runs: [11, 12] },
  { looked: true, sha: 'aaaaaaa', status: 'completed', conclusion: 'success', failed: [], runs: [11], skipped: ['lint', 'docs', 'e2e', 'perf'] },
  { looked: true, sha: 'aaaaaaa', status: 'completed', conclusion: 'success', failed: [], runs: [11], skipped: ['lint'] },
  { looked: true, sha: 'aaaaaaa', status: 'completed', conclusion: 'failure', failed: ['z job: failure', 'a job: failure', 'm: cancelled', 'b: timed_out'], runs: [13] },
  { looked: true, sha: 'aaaaaaa', status: 'completed', conclusion: 'failure', failed: ['ci (push) / build: failure'], runs: [13, 14] },
  { looked: true, sha: 'aaaaaaa', status: 'completed', conclusion: 'cancelled', failed: [], runs: [] },
  { looked: true, sha: 'aaaaaaa', status: 'in_progress', conclusion: null, failed: [], runs: [15] },
  { looked: true, sha: 'bbbbbbb', status: 'completed', conclusion: 'success', failed: [], runs: [16], anchor: 'tip' },
  { looked: true, sha: 'bbbbbbb', status: 'completed', conclusion: 'failure', failed: ['x: failure'], runs: [16], anchor: 'tip' },
  { looked: false, note: 'no run recorded for this branch' },
  { looked: false, note: 'this answer was stored before the CI half was gathered' },
]
const gits = [
  { looked: true, branch: 'main', head: 'aaaaaaa', dirty: 0, ahead: 0, behind: 0 },
  { looked: true, branch: 'main', head: 'aaaaaaa', dirty: 3, ahead: 2, behind: null },
  { looked: true, branch: 'feature/x', head: 'aaaaaaa', dirty: null, ahead: 0, behind: 4 },
  { looked: true, branch: 'main', head: 'aaaaaaa', dirty: 1, ahead: 5, behind: 2 },
  { looked: true, branch: 'HEAD', head: '(unknown)', dirty: 0, ahead: null, behind: null, unreviewed: 3 },
]
const releases = [
  { tag: 'v1.2.3', shippedSinceTag: 0, releaseBlocked: null },
  { tag: 'v1.2.3', shippedSinceTag: 7, releaseBlocked: null },
  { tag: null, shippedSinceTag: null, releaseBlocked: 'the newest tag could not be read (fatal: bad object)' },
  { tag: 'v1.2.3', shippedSinceTag: null, releaseBlocked: 'the diff from v1.2.3 could not be read' },
]
const states = [
  { looked: false, note: 'fatal: not a git repository' },
  ...gits.flatMap(git => cis.flatMap(ci => releases.map(release => ({ ...git, ci, ...release })))),
]

function run(fn, f, ...args) { return { fn, args, want: f(...args) } }

function rowsFor(scratch) {
  const rows = []
  for (const state of states) {
    rows.push(run('render', s => render(s), state))
    rows.push(run('renderBrief', s => render(s, { brief: true }), state))
    rows.push(run('ciRed', ciRed, state))
    rows.push(run('redKey', redKey, state))
    rows.push(run('unknownKey', unknownKey, state))
  }
  // A session's own commits: HEAD moved and ahead rose by at most the commits, else something else changed.
  const said = { ...gits[1], ci: cis[0], ...releases[1] }
  for (const [now, commits] of [
    [{ ...said, head: 'ddddddd', ahead: 3 }, 1], [{ ...said, head: 'ddddddd', ahead: 4 }, 1], [{ ...said, head: 'ddddddd', ahead: 1 }, 1],
    [{ ...said, head: 'ddddddd', ahead: 3, dirty: 9 }, 2], [{ ...said, ci: cis[3] }, 1], [{ ...said, ci: { ...cis[0], anchor: 'tip' } }, 1],
    [{ ...said, head: '(unknown)' }, 1], [{ ...said, ahead: null }, 1], [{ ...said, dirty: null }, 1], [{ ...said, shippedSinceTag: 0 }, 1],
    [{ ...said, head: 'eeeeeee' }, 0], [{ ...said, head: 'eeeeeee' }, 1.5], [{ ...said, branch: 'other' }, 3], [said, 1],
  ]) rows.push(run('unchangedButOwnCommits', unchangedButOwnCommits, said, now, commits))
  rows.push(run('unchangedButOwnCommits', unchangedButOwnCommits, null, said, 1))
  // The brief said before against this one: only the dirty count may differ.
  const briefs = states.slice(1, 40).map(s => render(s, { brief: true }))
  for (const [i, text] of briefs.entries()) {
    rows.push(run('briefUnchanged', briefUnchanged, text, briefs[(i + 1) % briefs.length]))
    rows.push(run('briefUnchanged', briefUnchanged, text.replace(/, (?:\d+ uncommitted path\(s\)|clean)/, ', 42 uncommitted path(s)'), text))
  }
  rows.push(run('briefUnchanged', briefUnchanged, null, briefs[0]))
  rows.push(run('briefUnchanged', briefUnchanged, 'branch-state: main @ a, clean', 'branch-state: main @ a, 2 uncommitted path(s)'))
  rows.push(run('briefUnchanged', briefUnchanged, 'branch-state: main @ a, cleanx', 'branch-state: main @ a, 2 uncommitted path(s)x'))
  rows.push(run('briefUnchanged', briefUnchanged, 'x, clean, 3 uncommitted path(s)', 'x, 1 uncommitted path(s), clean'))
  // movedSince over keys, live and stored.
  const key = sha => JSON.stringify(['ref: refs/heads/main', sha, TIP])
  for (const [stored, live] of [[key(SHA), key(OTHER)], [key(SHA), key(SHA)], ['not json', key(OTHER)], [key(SHA), 'not json'],
    [key(SHA), '["x"]'], [key(SHA), '["x",""]'], [key(SHA), '["x",7]'], [key(SHA), '"abcdefghij"'], [null, key(OTHER)], [key(SHA), null]]) {
    rows.push(run('movedSince', movedSince, stored, live))
  }
  for (const age of [0, 599_999, 600_000, 600_000.4, 600_001, -1]) rows.push(run('pastShowCap', pastShowCap, age))
  const capLine = pastCapLine(false, null)
  for (const [refreshing, previous] of [[false, null], [true, null], [false, { said: capLine }], [false, { said: 'other' }], [false, 'text']]) {
    rows.push(run('pastCapLine', pastCapLine, refreshing, previous))
  }
  // Snapshots on disk, trusted or not.
  const now = 1_800_000_000_000
  const good = { at: now - 30_000, key: key(SHA), state: states[1] }
  const previouses = [
    good, { ...good, at: now + 1 }, { ...good, at: 'x' }, { ...good, at: null }, { ...good, state: null }, { ...good, state: { looked: 'yes' } },
    { ...good, state: { looked: true } }, { ...good, state: { looked: true, ci: null } }, { ...good, state: { looked: false } },
    { ...good, state: { looked: true, ci: [] } }, { ...good, partial: true }, { ...good, at: now - 200_000 }, [], null, 'text', 7,
  ]
  for (const previous of previouses) {
    rows.push(run('usableCache', usableCache, previous, now))
    for (const k of [key(SHA), key(OTHER), null]) rows.push(run('freshSnapshot', freshSnapshot, previous, now, 120, k))
  }
  // CI listings: workflows, events, ties, cancellations, short heads and a full window.
  const r = (id, sha, extra = {}) => ({ headSha: sha, status: 'completed', conclusion: 'success', databaseId: id,
    startedAt: `2026-10-0${1 + (id % 9)}T10:00:00Z`, event: 'push', workflowDatabaseId: 100, workflowName: 'selftest', ...extra })
  const listings = [
    [], null, [r(1, SHA)], [r(1, OTHER)], [r(1, SHA), r(2, SHA, { conclusion: 'failure' })],
    [r(1, SHA, { event: 'push', conclusion: 'cancelled' }), r(2, SHA, { event: 'workflow_dispatch' })],
    [r(1, SHA, { conclusion: 'cancelled' })],
    [r(5, SHA, { startedAt: '2026-10-01T10:00:00Z' }), r(6, SHA, { startedAt: '2026-10-01T10:00:00Z', conclusion: 'failure' })],
    [r(5, SHA, { startedAt: '' }), r(6, SHA, { startedAt: null, conclusion: 'failure' })],
    [r(1, SHA, { workflowDatabaseId: null, workflowName: 'a' }), r(2, SHA, { workflowDatabaseId: null, workflowName: 'b', conclusion: 'failure' })],
    [r(1, TIP), r(2, OTHER)], [r(1, 'aaaaaaa'), r(2, 'aaaaaaab')], [r(1, 'zzzz'), r(2, SHA)],
    [r(1, SHA, { databaseId: 1.5 }), r(2, SHA, { headSha: '' }), null, r(3, SHA, { status: 'in_progress', conclusion: null })],
    Array.from({ length: 20 }, (_, i) => r(i + 1, SHA)),
    [...Array.from({ length: 19 }, (_, i) => r(i + 10, SHA)), r(1, OTHER)],
    [...Array.from({ length: 19 }, (_, i) => r(i + 10, SHA)), r(99, OTHER)],
  ]
  for (const rowsListed of listings) {
    for (const [head, upstream] of [[SHA, null], [SHA, TIP], ['aaaaaaa', null], [OTHER, TIP], ['', TIP], ['not-hex', null], [null, null]]) {
      rows.push(run('headRuns', headRuns, rowsListed, head, upstream))
    }
  }
  // snapshotKey over git directories made of files: no process is started by either implementation.
  for (const [name, files] of Object.entries(gitDirs())) {
    const dir = path.join(scratch, name, '.git')
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      writeFileSync(path.join(dir, rel), text)
    }
    rows.push(run('snapshotKey', snapshotKey, dir))
  }
  rows.push(run('snapshotKey', snapshotKey, ''))
  return rows
}

function gitDirs() {
  const head = 'ref: refs/heads/main\n'
  return {
    detached: { HEAD: `${SHA}\n` },
    loose: { HEAD: head, 'refs/heads/main': `${SHA}\n` },
    looseTracked: { HEAD: head, 'refs/heads/main': `${SHA}\n`, 'refs/remotes/origin/main': `${TIP}\n` },
    packed: { HEAD: head, 'packed-refs': `# pack-refs with: peeled\n${SHA} refs/heads/main\n${TIP} refs/remotes/origin/main\n` },
    configured: { HEAD: head, 'refs/heads/main': SHA, 'refs/remotes/up/trunk': TIP, config: '[branch "main"]\n\tremote = up\n\tmerge = refs/heads/trunk\n' },
    quoted: { HEAD: head, 'refs/heads/main': SHA, 'refs/remotes/up/trunk': TIP, config: '[Branch "main"]\n\tRemote = "up" ; comment\n\tmerge = refs/heads/trunk # x\n' },
    local: { HEAD: head, 'refs/heads/main': SHA, 'refs/heads/base': TIP, config: '[branch "main"]\n\tremote = .\n\tmerge = refs/heads/base\n' },
    unfetched: { HEAD: head, 'refs/heads/main': SHA },
    otherSection: { HEAD: head, 'refs/heads/main': SHA, config: '[branch "other"]\n\tremote = up\n\tmerge = refs/heads/trunk\n[core]\n\tbare = false\n' },
    include: { HEAD: head, 'refs/heads/main': SHA, config: '[include]\n\tpath = x\n' },
    continued: { HEAD: head, 'refs/heads/main': SHA, config: '[branch "main"]\n\tremote = up \\\n\tmerge = refs/heads/trunk\n' },
    badHeader: { HEAD: head, 'refs/heads/main': SHA, config: '[branch.main]\n\tremote = up\n' },
    noBranchSha: { HEAD: head },
    notARef: { HEAD: 'garbage\n' },
    emptyHead: { HEAD: '\n' },
    tag: { HEAD: 'ref: refs/tags/v1\n', 'refs/tags/v1': SHA },
    crlf: { HEAD: head, 'packed-refs': `${SHA} refs/heads/main\r\n${TIP} refs/remotes/origin/main\r\n` },
  }
}

test('the core answers every branch-state row as the Node functions do', { skip: noGo }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-bsparity-'))
  t.after(() => remove(scratch))
  const rows = rowsFor(scratch)
  assert.ok(rows.length > 1000, `only ${rows.length} rows were built, so the comparison would prove little`)
  const corpus = path.join(scratch, 'corpus.json')
  writeFileSync(corpus, JSON.stringify(rows))
  const ran = spawnSync('go', ['test', '-count=1', '-v', '-run', '^TestBranchStateParity$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_BRANCH_STATE_CORPUS: corpus },
  })
  const said = `${ran.stdout}\n${ran.stderr}`
  assert.equal(ran.status, 0, `the Go branch state disagrees with the Node one (or did not run):\n${said.split('\n').slice(-60).join('\n')}`)
  // A Go test that skipped exits 0 too: the count it compared is what says it ran, over every row written.
  assert.match(said, new RegExp(`${rows.length} rows compared, 0 disagreements`))
})
