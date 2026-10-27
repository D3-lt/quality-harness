// ADR-128 T2: a commit this session made does not re-send the branch-state brief; anything else that changed still does.
// Driven through the CLI the hook runs, with an empty PATH so nothing can spawn git or gh, and a young refresher lock held so
// no refresher is started (the harness of branch-state-moved.test.mjs). "Own" is read from the session log: git's commit hook
// ran (ADR-066), and HEAD's loose commit object has one parent, the HEAD the session last heard.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { snapshotKey, unchangedButOwnCommits } from '../plugin/scripts/branch-state.mjs'
import { readEvents, sessionLogFile } from '../plugin/scripts/event-log.mjs'
import { runPublishHook } from '../plugin/scripts/publish-hook.mjs'

const script = fileURLToPath(new URL('../plugin/scripts/branch-state.mjs', import.meta.url))
const green = { looked: true, branch: 'main', head: 'abc1234', dirty: 0, ahead: 0, behind: 0,
  ci: { looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] },
  tag: null, shippedSinceTag: null, releaseBlocked: null }
const DUE = 200_000

function repository(t, name) {
  const project = mkdtempSync(path.join(os.tmpdir(), `qh-own-${name}-`))
  t.after(() => rmSync(project, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }))
  const git = (...args) => {
    const run = spawnSync('git', ['-C', project, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
      { encoding: 'utf8', timeout: 10_000 })
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  git('commit', '--allow-empty', '-qm', 'one')
  const gitDir = path.join(project, '.git')
  writeFileSync(path.join(gitDir, 'qh-branch-state.lock'), String(process.pid))
  const cache = path.join(gitDir, 'qh-branch-state.json')
  const session = `own-${name}`
  const log = sessionLogFile(project, session, { spawn: false })
  mkdirSync(path.dirname(log), { recursive: true })
  const short = () => git('rev-parse', '--short=7', 'HEAD')
  // The snapshot a refresher would write, keeping what the brief stamped.
  const snapshot = (state, at = Date.now()) => {
    let kept = {}
    try { kept = JSON.parse(readFileSync(cache, 'utf8')) } catch { /* first write */ }
    writeFileSync(cache, JSON.stringify({ ...kept, at, key: snapshotKey(gitDir), state }))
  }
  const record = (id, entry) => appendFileSync(sessionLogFile(project, id, { spawn: false }), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  // What git's prepare-commit-msg hook writes: a run, and a commit it let through (publish-hook.mjs).
  const hookRan = (id = session) => record(id, { event: 'publish.hook-ran', hook: 'prepare-commit-msg' })
  const allowed = (id = session) => record(id, { event: 'publish.commit-allowed' })
  const commit = subject => { hookRan(); allowed(); git('commit', '--allow-empty', '-qm', subject) }
  // A commit someone else made earlier, with its own committer date.
  const commitAt = (date, subject) => {
    const run = spawnSync('git', ['-C', project, '-c', 'user.name=Other', '-c', 'user.email=other@example.invalid', 'commit', '--allow-empty', '-qm', subject],
      { encoding: 'utf8', timeout: 10_000, env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } })
    assert.equal(run.status, 0, run.stderr)
  }
  const brief = (id = session) => spawnSync(process.execPath, [script, '--brief', '--cached', '120'],
    { cwd: project, env: { ...process.env, PATH: '' }, input: JSON.stringify({ session_id: id, cwd: project }), encoding: 'utf8', timeout: 10_000 }).stdout
  // The line is said once, on HEAD as it stands.
  snapshot({ ...green, head: short() }, Date.now() - DUE)
  const first = brief()
  assert.match(first, /^branch-state: main @ [0-9a-f]{7}, clean · CI abc1234: every job concluded success\./, first)
  const tear = () => appendFileSync(log, '{"event":"publish.hook-ran","ho')
  return { git, short, snapshot, commit, commitAt, brief, hookRan, allowed, tear, stored: () => readFileSync(cache, 'utf8') }
}

test("a session's own commit does not re-send the line", t => {
  const r = repository(t, 'quiet')
  r.commit('two')
  assert.equal(r.brief(), '', `the snapshot read before the commit, served with HEAD moved: ${r.stored()}`)
  r.snapshot({ ...green, head: r.short(), ahead: 1 })
  assert.equal(r.brief(), '', 'the refreshed answer, one ahead')
  r.commit('three')
  r.snapshot({ ...green, head: r.short(), ahead: 2 })
  assert.equal(r.brief(), '', 'a second commit')
})

test('CI, a fetch, a branch switch or an unrecorded commit re-sends it', t => {
  const ci = repository(t, 'ci')
  ci.commit('two')
  ci.snapshot({ ...green, head: ci.short(), ahead: 1, ci: { ...green.ci, sha: 'def5678' } })
  assert.match(ci.brief(), /CI def5678: every job concluded success/, 'a CI answer that changed')

  const fetched = repository(t, 'fetch')
  fetched.commit('two')
  fetched.snapshot({ ...green, head: fetched.short(), ahead: 1, behind: 1 })
  assert.match(fetched.brief(), /1 ahead and 1 behind origin/, 'a fetch that moved the upstream')

  const switched = repository(t, 'switch')
  switched.commit('two')
  switched.git('checkout', '-q', '-b', 'other')
  switched.snapshot({ ...green, branch: 'other', head: switched.short(), ahead: 1 })
  assert.match(switched.brief(), /^branch-state: other @ /, 'a branch switch')

  const unrecorded = repository(t, 'unrecorded')
  unrecorded.git('commit', '--allow-empty', '-qm', 'no hook ran')
  unrecorded.snapshot({ ...green, head: unrecorded.short(), ahead: 1 })
  assert.match(unrecorded.brief(), /^branch-state: main @ /, 'a commit the session log does not record')

  const ahead = repository(t, 'ahead')
  ahead.commit('two')
  ahead.snapshot({ ...green, head: ahead.short(), ahead: 3 })
  assert.match(ahead.brief(), /3 ahead of origin/, 'an ahead count that rose by more than the commits')

  const merged = repository(t, 'merge')
  merged.git('branch', 'side')
  merged.git('checkout', '-q', 'side')
  merged.git('commit', '--allow-empty', '-qm', 'side work')
  merged.git('checkout', '-q', 'main')
  merged.hookRan()
  merged.allowed()
  merged.git('merge', '--no-ff', '-q', '-m', 'merge side', 'side')
  merged.snapshot({ ...green, head: merged.short(), ahead: 1 })
  assert.match(merged.brief(), /^branch-state: main @ /, 'a merge commit, which has two parents')

  // A log that cannot be read whole cannot show the hook ran: the line is said (ADR-005).
  const torn = repository(t, 'torn')
  torn.commit('two')
  torn.tear()
  torn.snapshot({ ...green, head: torn.short(), ahead: 1 })
  assert.match(torn.brief(), /^branch-state: main @ /, 'a session log with a torn line')

  const other = repository(t, 'session')
  // Both sessions' logs record a hook run: only the session that heard the line may skip it.
  other.hookRan('another-session')
  other.allowed('another-session')
  other.commit('two')
  other.snapshot({ ...green, head: other.short(), ahead: 1 })
  assert.match(other.brief('another-session'), /^branch-state: main @ /, 'a session that did not hear the line')

  // The review of c0d3d412. A refused attempt writes the hook's run and nothing else.
  const refused = repository(t, 'refused')
  refused.hookRan()
  refused.git('commit', '--allow-empty', '-qm', 'refused, then made outside the hook')
  refused.snapshot({ ...green, head: refused.short(), ahead: 1 })
  assert.match(refused.brief(), /^branch-state: main @ /, 'a commit the hook did not let through')

  // A let-through attempt, then a reset to someone else's older child of the heard HEAD.
  const reset = repository(t, 'reset')
  reset.git('checkout', '-q', '-b', 'side')
  reset.commitAt('2020-01-01T00:00:00Z', 'someone else')
  const theirs = reset.git('rev-parse', 'HEAD')
  reset.git('checkout', '-q', 'main')
  reset.allowed()
  reset.git('reset', '-q', '--hard', theirs)
  reset.snapshot({ ...green, head: reset.short(), ahead: 1 })
  assert.match(reset.brief(), /^branch-state: main @ /, 'a commit older than the hook run that let one through')

  // The line was heard on another branch; the session then switched and committed. The stale snapshot still names that branch.
  const stale = repository(t, 'stale-ref')
  stale.git('checkout', '-q', '-b', 'other')
  stale.snapshot({ ...green, branch: 'other', head: stale.short() }, Date.now() - 200_000)
  assert.match(stale.brief(), /^branch-state: other @ /, 'heard on other')
  stale.git('checkout', '-q', 'main')
  stale.commit('two')
  assert.match(stale.brief(), /HEAD now /, 'a ref that moved under a stale snapshot')

  // Only the head segment and the release count are normalised: a CI job name is compared as it is.
  const line = (sha, job) => `branch-state: main @ ${sha}, clean · CI abc1234: succeeded; 1 job(s) skipped — ${job}.`
  assert.equal(unchangedButOwnCommits(line('aaaaaaa', 'x'), line('bbbbbbb', 'x'), 1), true, 'the control: only the sha moved')
  assert.equal(unchangedButOwnCommits(line('aaaaaaa', 'plugin/ changed in 1 file(s)'), line('bbbbbbb', 'plugin/ changed in 2 file(s)'), 1), false, 'a job name like a count')
  assert.equal(unchangedButOwnCommits(line('aaaaaaa', 'a'), line('bbbbbbb', 'a, 1 ahead of origin'), 1), false, 'a job name like an ahead count')

  // What the evidence rests on, from git's own hook: a refused commit writes its run and no `publish.commit-allowed`; one the
  // hook lets through writes both (publish-hook.mjs).
  const outer = mkdtempSync(path.join(os.tmpdir(), 'qh-own-hook-'))
  t.after(() => rmSync(outer, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }))
  const top = path.join(outer, 'repo')
  const { NODE_TEST_CONTEXT: _nested, CLAUDE_CODE_SESSION_ID: _id, QUALITY_HARNESS_CHECK_AGAIN: _again, ...base } = process.env
  const plugin = fileURLToPath(new URL('../plugin', import.meta.url))
  // The check appends outside the repository, so a run does not change the tree it checked (qh-check-reads-the-ledger).
  const env = { ...base, CLAUDE_PLUGIN_ROOT: plugin, QUALITY_HARNESS_LEASE_DIR: path.join(outer, 'leases'), QH_RUNS: path.join(outer, 'runs.txt'),
    CLAUDE_CODE_SESSION_ID: 'own-hook' }
  spawnSync('git', ['init', '-q', top], { timeout: 10_000 })
  writeFileSync(path.join(top, '.quality-harness.json'), `${JSON.stringify({ check: 'echo run >> "$QH_RUNS"' })}\n`)
  spawnSync(process.execPath, [path.join(plugin, 'scripts', 'lifecycle.mjs')], { cwd: top, env, encoding: 'utf8', timeout: 60_000,
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'own-hook', cwd: top }) })
  writeFileSync(path.join(top, 'notes.txt'), 'unchecked\n')
  const rows = () => readEvents(top, 'own-hook').map(entry => entry.event)
  assert.equal(runPublishHook({ event: 'prepare-commit-msg', cwd: top, env }).code, 1, 'an unchecked commit is refused')
  assert.deepEqual(rows().filter(name => name.startsWith('publish.hook') || name === 'publish.commit-allowed'), ['publish.hook-ran'], 'and records no let-through')
  const checked = spawnSync(process.execPath, [path.join(plugin, 'scripts', 'qh-check.mjs')], { cwd: top, env, encoding: 'utf8', timeout: 60_000 })
  assert.equal(checked.status, 0, checked.stderr)
  assert.equal(runPublishHook({ event: 'prepare-commit-msg', cwd: top, env }).code, 0, 'a checked commit is let through')
  assert.equal(rows().filter(name => name === 'publish.commit-allowed').length, 1, 'and recorded as let through')
})
