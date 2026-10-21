// ADR-120 T13 (Decision 13): the brief reads the worktree the session's payload names, and a repository no GitHub host names
// is said once per session. Both are driven through the hook's own stdin, as the host starts it.
import assert from 'node:assert/strict'
import test from 'node:test'

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'
import { snapshotKey } from '../plugin/scripts/branch-state.mjs'

const script = fileURLToPath(new URL('../plugin/scripts/branch-state.mjs', import.meta.url))
const NO_GITHUB = 'no remote names a GitHub host, so `gh` was not asked'
const GREEN = { looked: true, branch: 'main', head: 'abc1234', dirty: 0, ahead: 0, behind: 0,
  ci: { looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] },
  tag: null, shippedSinceTag: null, releaseBlocked: null }
const RUNNING = { ...GREEN.ci, status: 'in_progress', conclusion: null }

const git = (cwd, ...args) => {
  const run = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
    { cwd, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return run.stdout.trim()
}

// The hook payload goes in on stdin; `PATH: ''` keeps git and gh out of reach, so what is printed came from a snapshot.
const hook = (cwd, payload, { argv = ['--brief', '--cached', '120'], env = { PATH: '' } } = {}) => {
  const environment = { ...process.env, ...env }
  delete environment.QUALITY_HARNESS_STATE_DIR
  return spawnSync(process.execPath, [script, ...argv], {
    cwd, env: environment, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    input: payload === undefined ? '' : JSON.stringify(payload),
  })
}
const waitFor = (file, wanted) => {
  for (let i = 0; i < 100; i++) {
    try { if (wanted(JSON.parse(readFileSync(file, 'utf8')))) return true } catch { /* not written yet */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  return false
}

test('branch-state reports the session\'s worktree and says a permanent unknown once', t => {
  const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'qh-t13-')))
  t.after(() => remove(scratch))
  const project = path.join(scratch, 'project')
  const linked = path.join(scratch, 'linked')
  const elsewhere = path.join(scratch, 'elsewhere')
  mkdirSync(elsewhere)
  git(scratch, 'init', '-q', '-b', 'main', project)
  writeFileSync(path.join(project, 'a.txt'), 'a\n')
  git(project, 'add', '.')
  git(project, 'commit', '-qm', 'one')
  const reviewed = git(project, 'rev-parse', 'HEAD')
  writeFileSync(path.join(project, 'a.txt'), 'b\n')
  git(project, 'commit', '-qam', 'two')
  git(project, 'worktree', 'add', '-q', '-b', 'linked-t13', linked)
  const mainDir = path.join(project, '.git')
  const linkedDir = git(linked, 'rev-parse', '--absolute-git-dir')
  const cache = dir => path.join(dir, 'qh-branch-state.json')
  const snapshot = (dir, state) => writeFileSync(cache(dir), JSON.stringify({ at: Date.now() - 1000, key: snapshotKey(dir), state }))

  // The session's directory is the payload's, not the process's: a hook host starts the script wherever it likes.
  snapshot(mainDir, GREEN)
  snapshot(linkedDir, { ...GREEN, branch: 'linked-t13' })
  const named = hook(elsewhere, { cwd: linked, session_id: 'one' })
  assert.equal(named.status, 0, named.stderr)
  assert.match(named.stdout, /linked-t13 @ abc1234/, `the payload's worktree is the one reported:\n${named.stdout}`)
  // DIRTY twin: no payload, an unusable one and a cwd that is not a directory all fall back to where the process stands.
  for (const [what, payload] of [['no payload', undefined], ['a payload without a cwd', { session_id: 'two' }],
    ['a cwd that is no directory', { cwd: path.join(scratch, 'missing'), session_id: 'three' }], ['a cwd that is no string', { cwd: 7 }]]) {
    snapshot(mainDir, GREEN)
    const fell = hook(project, payload)
    assert.match(fell.stdout, /main @ abc1234/, `${what} falls back to process.cwd():\n${fell.stdout}`)
  }

  // The detached refresher starts in the session's directory too: it finds its snapshot from there.
  writeFileSync(cache(linkedDir), JSON.stringify({ at: Date.now() - 121_000, state: { ...GREEN, branch: 'linked-t13' } }))
  const stale = hook(elsewhere, { cwd: linked, session_id: 'one' })
  assert.match(stale.stdout, /linked-t13 @ abc1234.*refreshing/, stale.stdout)
  assert.ok(waitFor(cache(linkedDir), saved => saved.state?.looked === false), 'the refresher wrote the session\'s snapshot, not the process directory\'s')

  // git is asked in the session's directory, the snapshot lands in its git directory (a relative `.git` among them),
  // and the review ledger is the session repository's.
  const state = path.join(mainDir, 'quality-harness')
  mkdirSync(state, { recursive: true })
  writeFileSync(path.join(state, 'reviews.jsonl'), `${JSON.stringify({ status: 'clean', head: reviewed })}\n`)
  writeFileSync(cache(mainDir), '{}')
  const real = hook(elsewhere, { cwd: project, session_id: 'one' }, { argv: ['--cached', '120'], env: {} })
  assert.equal(real.status, 0, real.stderr)
  const written = JSON.parse(readFileSync(cache(mainDir), 'utf8'))
  assert.equal(written.state?.branch, 'main', JSON.stringify(written))
  assert.equal(written.state?.unreviewed, 1, `the ledger of the session's repository was read: ${JSON.stringify(written.state)}`)
  assert.deepEqual(readdirSync(elsewhere), [], 'and nothing was written where the process stood')

  // A permanent unknown (no remote names a GitHub host) is said at the first prompt of a session, and not again as the head moves.
  const bitbucket = head => ({ ...GREEN, head, ci: { looked: false, note: NO_GITHUB } })
  const prompt = (state, session = 'one') => {
    const stored = (() => { try { return JSON.parse(readFileSync(cache(mainDir), 'utf8')) } catch { return {} } })()
    writeFileSync(cache(mainDir), JSON.stringify({ ...stored, at: Date.now() - 1000, key: snapshotKey(mainDir), state }))
    return hook(project, session === null ? undefined : { cwd: project, session_id: session }).stdout
  }
  writeFileSync(cache(mainDir), '{}')
  const first = prompt(bitbucket('abc1234'))
  assert.match(first, /no remote names a GitHub host, so `gh` was not asked/, first)
  assert.match(first, /NOT a green branch; an unknown one/, first)
  assert.equal(prompt(bitbucket('def5678')), '', 'a later prompt whose head moved says nothing')
  assert.equal(prompt({ ...bitbucket('0123abc'), dirty: 3 }), '', 'nor does an edit')
  assert.match(prompt(bitbucket('def5678'), 'another'), /no remote names a GitHub host/, 'a new session hears it once more')
  assert.equal(prompt(bitbucket('9999999'), 'another'), '', 'and then not again')
  // DIRTY twin: a host that names no session cannot key one, so the earlier rule stands (the unknown is shortened, never dropped).
  assert.match(prompt(bitbucket('1111111'), null), /CI COULD NOT LOOK, unchanged/)

  // Another unknown is not the permanent one: said once per change, as before.
  const unknown = note => ({ ...GREEN, ci: { looked: false, note } })
  assert.match(prompt(unknown('gh: command not found'), 'one'), /COULD NOT LOOK — gh: command not found/)
  assert.match(prompt({ ...unknown('gh: command not found'), head: 'aaaaaaa' }, 'one'), /CI COULD NOT LOOK, unchanged/,
    'an unknown that can change keeps its shortened line when the head moves')
  // A GitHub run that is still running is said once per change, with a session named.
  const running = head => ({ ...GREEN, head, ci: RUNNING })
  assert.match(prompt(running('abc1234'), 'one'), /still running/)
  assert.match(prompt(running('abc1235'), 'one'), /still running/, 'a head that moved is a change, and is said')
  assert.equal(prompt(running('abc1235'), 'one'), '', 'an unchanged line is not')
  // A repository that gains a GitHub remote mid-session says its state, and loses it again: the unknown is said again.
  prompt(bitbucket('abc1234'), 'gain')
  assert.equal(prompt(bitbucket('abc1235'), 'gain'), '')
  assert.match(prompt(GREEN, 'gain'), /every job concluded success/, 'a state that changed is said')
  assert.match(prompt(bitbucket('abc1236'), 'gain'), /no remote names a GitHub host/, 'and the permanent unknown, back, is said again')
})

// Written after the first test, beside it: a second session hears the same unknown at the same head, and a refresh of the
// snapshot keeps what the first session heard.
test('a permanent unknown is heard once by each session and survives a refresh of its snapshot', t => {
  const project = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'qh-t13-once-')))
  t.after(() => remove(project))
  git(project, 'init', '-q', '-b', 'main')
  git(project, 'commit', '--allow-empty', '-qm', 'one')
  const cache = path.join(project, '.git', 'qh-branch-state.json')
  const prompt = session => hook(project, { cwd: project, session_id: session }, { env: {} })
  const first = prompt('one')
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /no remote names a GitHub host, so `gh` was not asked/, first.stdout)
  assert.equal(prompt('one').stdout, '', 'the same session is told once')
  const second = prompt('two').stdout
  assert.match(second, /no remote names a GitHub host, so `gh` was not asked/, `a new session, same head, same line:\n${second}`)
  assert.doesNotMatch(second, /unchanged/, second)
  const stored = JSON.parse(readFileSync(cache, 'utf8'))
  const old = Date.now() - 121_000
  writeFileSync(cache, JSON.stringify({ ...stored, at: old }))
  assert.equal(prompt('two').stdout, '', 'a due snapshot is served to a session that has heard it')
  assert.ok(waitFor(cache, saved => saved.at > old && saved.state?.looked === true), 'the refresher rewrote the snapshot')
  assert.equal(prompt('two').stdout, '', 'and what the session heard is kept across the refresh')
})
