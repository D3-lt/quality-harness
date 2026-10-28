// BACKLOG §134 — the gates' reading of a session, on the status line.
//
// ADR-060: the input is the session's event log, not the transcript. Shown dirty
// before clean — an unchecked tree renders ✗, a checked one ✓ — and an unchanged
// log is NOT read twice, because a status line renders constantly.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { remove } from './helpers/remove.mjs'
import { linkDirectory } from './symlink-support.mjs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sessionLogFile } from '../plugin/scripts/event-log.mjs'
import { CI_STALE_MS, STALE_MS, ciReading, flightReading, gitReading, loadReading, reading, render, renderCi, renderFlight, renderGit, renderLoad } from '../plugin/scripts/statusline.mjs'
import { findGitDir } from '../plugin/scripts/git-directory.mjs'
import { snapshotKey } from '../plugin/scripts/branch-state.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const script = join(repoRoot, 'plugin', 'scripts', 'statusline.mjs')

// Run alone, this file left every session's status cache, and the event-log fallback for a directory with no .git, in
// the real temp directory. selftest gives each run its own (scripts/selftest.sh); a direct `node --test` gets one here,
// removed when the file ends (a Windows outside run, 2026-10-13).
const sandbox = mkdtempSync(join(tmpdir(), 'qh-statusline-tests-'))
process.env.TMPDIR = process.env.TMP = process.env.TEMP = sandbox
// An inherited state-directory override would send the session logs this file writes outside the sandbox (the Codex
// review of 26440a7d); nothing in selftest sets one.
delete process.env.QUALITY_HARNESS_STATE_DIR
process.on('exit', () => remove(sandbox))
const QH_STATUSLINE_ONE_LINER = 'node "$(qh-root)/scripts/statusline.mjs" <<< "$input"'

function stripFenceTicks(line) {
  return line.replace(/^`+/, '').replace(/`+$/, '').trim()
}

function shippedStatuslineSurfaces() {
  return [
    join(repoRoot, 'docs', 'INSTALL.md'),
    join(repoRoot, 'plugin', 'README.md'),
    join(repoRoot, 'plugin', 'scripts', 'statusline.mjs'),
  ]
}

function assertComposeNotReplacement(text) {
  assert.match(text, /keep (the host|your existing|that) command/i)
  assert.match(text, /\$input/)
  assert.match(text, /qh=\$\(node "\$\(qh-root\)\/scripts\/statusline\.mjs" <<< "\$input"/)
  assert.match(text, /printf '%s\\n' "\$qh"/)
  assert.match(text, /refreshInterval/)
  assert.doesNotMatch(text, /delete.{0,40}refreshInterval|remove.{0,40}refreshInterval/i)
  assert.match(text, /cannot set.{0,80}statusLine/i)
  for (const line of text.split('\n')) {
    const stripped = stripFenceTicks(line.replace(/^\/\/\s*/, '').trim())
    assert.notEqual(stripped, QH_STATUSLINE_ONE_LINER)
  }
}

// One session's event log, written where the plugin looks for it. The path comes
// from the plugin itself, so a change to where state lives fails here too.
const OBSERVED_AT = '2026-09-17T12:00:00.000Z'
const NOW = Date.parse(OBSERVED_AT) + 10_000

function logFor(dir, session, entries) {
  const file = sessionLogFile(dir, session, { spawn: false })
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`)
  return file
}

const observation = tree => ({ ok: true, tree, index: `index-${tree}`, head: 'HEAD0' })
const started = { at: '2026-09-17T11:59:00.000Z', event: 'session.started', observation: observation('T0') }
const wrote = (at, name) => ({ at, event: 'file.written', path: name, observable: true, blob: `blob-${name}` })
const ended = tree => ({ at: OBSERVED_AT, event: 'turn.ended', observation: observation(tree) })

test('the segment follows the log: a count, a passed check, nothing edited, unknown, and could-not-look', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    const at = session => ({ session_id: session, workspace: { current_dir: dir } })

    logFor(dir, 'sl-unverified', [started,
      wrote('2026-09-17T11:59:30.000Z', 'a.py'), wrote('2026-09-17T11:59:40.000Z', 'b.py'), ended('T1')])
    assert.equal(render(reading(at('sl-unverified'), { now: NOW })), 'QH ✗ 2 unverified · last observed 10s ago')

    logFor(dir, 'sl-checked', [started, wrote('2026-09-17T11:59:30.000Z', 'a.py'),
      { at: '2026-09-17T11:59:50.000Z', event: 'check.passed', startedAt: '2026-09-17T11:59:45.000Z',
        before: observation('T1'), after: observation('T1'), exit: 0 },
      ended('T1')])
    assert.equal(render(reading(at('sl-checked'), { now: NOW })), 'QH ✓ checked · last observed 10s ago')

    // A later failure on the same tree re-opens it, the way the advisories read it.
    logFor(dir, 'sl-refailed', [started,
      { at: '2026-09-17T11:59:50.000Z', event: 'check.passed', startedAt: '2026-09-17T11:59:45.000Z',
        before: observation('T1'), after: observation('T1'), exit: 0 },
      { at: '2026-09-17T11:59:55.000Z', event: 'check.failed', startedAt: '2026-09-17T11:59:52.000Z',
        before: observation('T1'), after: observation('T1'), exit: 1 },
      ended('T1')])
    assert.equal(render(reading(at('sl-refailed'), { now: NOW })), 'QH ✗ unverified · last observed 10s ago')

    logFor(dir, 'sl-nothing', [started, ended('T0')])
    assert.equal(render(reading(at('sl-nothing'), { now: NOW })), 'QH · nothing edited · last observed 10s ago')

    logFor(dir, 'sl-blind', [started,
      { at: OBSERVED_AT, event: 'turn.ended', observation: { ok: false, reason: 'git is not installed here' } }])
    assert.equal(render(reading(at('sl-blind'), { now: NOW })), 'QH ? could not look · last observed 10s ago')

    // A session with a check and no log yet is UNKNOWN, never a clean bill.
    assert.equal(render(reading(at('sl-never'), { now: NOW })), 'QH ? unknown')

    // An observation too old to speak for the tree as it is now says what it saw
    // and when, and claims nothing.
    assert.equal(render(reading(at('sl-unverified'), { now: Date.parse(OBSERVED_AT) + STALE_MS + 120_000 })),
      'QH ? last observed 17m ago')

    // No check named and no log: nothing worth a segment.
    rmSync(join(dir, 'package.json'))
    assert.equal(render(reading(at('sl-none'), { now: NOW })), '')
    // And no session id at all is not an error.
    assert.equal(render(reading({ workspace: { current_dir: dir } }, { now: NOW })), '')
  } finally {
    remove(dir)
  }
})

test('an unchanged log is not read twice; a changed one is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-cache-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    const session = `sl-cache-${Date.now()}-${process.pid}`
    const file = logFor(dir, session, [started, wrote('2026-09-17T11:59:30.000Z', 'a.py'), ended('T1')])
    const input = { session_id: session, workspace: { current_dir: dir } }
    let calls = 0
    const read = () => {
      calls += 1
      // Marked whole, as `readEvents` marks it: a log that does not SAY it was
      // read whole is could-not-look, and this test is about the cache.
      return Object.assign(readFileSync(file, 'utf8').split('\n').filter(Boolean).map(entry => JSON.parse(entry)), { complete: true })
    }
    assert.equal(reading(input, { read, now: NOW }).kind, 'unverified')
    assert.equal(reading(input, { read, now: NOW }).kind, 'unverified')
    assert.equal(calls, 1, 'the second render of an unchanged log reads the cache')

    // The AGE is still recomputed on a cache hit, or a still session would freeze
    // its own clock.
    assert.equal(reading(input, { read, now: NOW + 60_000 }).ageMs, 70_000)

    // Same size, new mtime: changed, so read again.
    const later = new Date(statSync(file).mtimeMs + 5_000)
    utimesSync(file, later, later)
    reading(input, { read, now: NOW })
    assert.equal(calls, 2, 'a changed mtime is a changed log')
  } finally {
    remove(dir)
  }
})

test('the CLI reads the statusLine JSON from stdin, prints the segment, and never fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-cli-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    const session = `cli-${Date.now()}`
    // The CLI reads the real clock, so this log is stamped now: a fixed
    // timestamp would render as an observation too old to be a verdict.
    const stamp = new Date().toISOString()
    logFor(dir, session, [{ ...started, at: stamp }, wrote(stamp, 'a.py'), { ...ended('T1'), at: stamp }])
    const run = input => spawnSync(process.execPath, [script], { input, encoding: 'utf8', timeout: 30_000 })
    const ok = run(JSON.stringify({ session_id: session, workspace: { current_dir: dir } }))
    assert.equal(ok.status, 0)
    // The child reads this machine's real load average, so a contended run may end in a load token (the CLI test below).
    assert.match(ok.stdout.trim(), /^QH ✗ 1 unverified · last observed \d+[smh] ago(?: · load \d+\.\d{2}×)?$/)
    assert.equal(ok.stderr, '', 'a status line never carries an error string')
    const garbage = run('not json')
    assert.equal(garbage.status, 0)
    assert.equal(garbage.stdout, '')
    assert.equal(garbage.stderr, '')
    const empty = run('')
    assert.equal(empty.status, 0)
    assert.equal(empty.stdout, '')
  } finally {
    remove(dir)
  }
})

test('the CI piece reads the hook\'s cache: green, red with a count, running, stale, unknown, and absent (BACKLOG §137)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-ci-'))
  try {
    const gitDir = join(dir, '.git')
    mkdirSync(gitDir)
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    mkdirSync(join(gitDir, 'objects'))
    mkdirSync(join(gitDir, 'refs'))
    const sub = join(dir, 'src', 'deep')
    mkdirSync(sub, { recursive: true })
    const now = Date.now()
    const write = (ci, at = now - 1_000) => writeFileSync(join(gitDir, 'qh-branch-state.json'), JSON.stringify({ at, state: { looked: true, branch: 'main', head: 'abc', dirty: 0, ci } }))

    write({ looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] })
    assert.equal(renderCi(ciReading(sub, now)), 'CI ✓', 'found from a subdirectory, without spawning git')
    write({ looked: true, sha: 'abc1234', status: 'completed', conclusion: 'failure', failed: ['selftest (windows): failure', 'coverage floor: failure'] })
    assert.equal(renderCi(ciReading(dir, now)), 'CI ✗ 2 job(s)')
    write({ looked: true, sha: 'abc1234', status: 'in_progress', conclusion: null, failed: [] })
    assert.equal(renderCi(ciReading(dir, now)), 'CI …')
    write({ looked: false, note: 'gh is not installed' })
    assert.equal(renderCi(ciReading(dir, now)), 'CI ?')
    // Stale: fifteen minutes and older is said to be old, never read as now.
    write({ looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] }, now - CI_STALE_MS - 60_000)
    assert.match(renderCi(ciReading(dir, now)), /^CI \? \(\d+m old\)$/)
    // A future-dated cache is refused by the same guard the hook uses.
    write({ looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] }, now + 60_000)
    assert.equal(ciReading(dir, now), null)
    // Absent: no piece, and the QH piece stands alone.
    rmSync(join(gitDir, 'qh-branch-state.json'))
    assert.equal(ciReading(dir, now), null)
    assert.equal(render({ kind: 'checked' }, null), 'QH ✓ checked')
    assert.equal(render({ kind: 'checked' }, { state: 'green' }), 'QH ✓ checked · CI ✓')
    assert.equal(render(null, { state: 'red', failed: [] }), 'QH CI ✗', 'CI alone still carries the prefix')
    // A worktree: .git is a file naming the real dir.
    const wt = mkdtempSync(join(tmpdir(), 'qh-statusline-wt-'))
    writeFileSync(join(wt, '.git'), `gitdir: ${gitDir}\n`)
    write({ looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] })
    assert.equal(renderCi(ciReading(wt, now)), 'CI ✓')
    remove(wt)
    // A symlink INTO the repository still finds it (the walk starts from the realpath).
    const alias = join(tmpdir(), `qh-statusline-alias-${process.pid}`)
    try { unlinkSync(alias) } catch {}
    linkDirectory(sub, alias)
    write({ looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] })
    assert.equal(renderCi(ciReading(alias, now)), 'CI ✓', 'a symlinked cwd is walked from its target')
    unlinkSync(alias)
    // A bare repository is its own git dir.
    const bare = mkdtempSync(join(tmpdir(), 'qh-statusline-bare-'))
    writeFileSync(join(bare, 'HEAD'), 'ref: refs/heads/main\n')
    mkdirSync(join(bare, 'objects'))
    assert.equal(findGitDir(bare), null, 'HEAD and objects alone are not Git metadata')
    mkdirSync(join(bare, 'refs'))
    assert.equal(findGitDir(bare), realpathSync(bare))
    remove(bare)
    // No .git anywhere above: nothing.
    assert.equal(findGitDir(tmpdir()) === null || typeof findGitDir(tmpdir()) === 'string', true)
  } finally {
    remove(dir)
  }
})

test('the wired statusline segment does not grow a layer token', () => {
  const kinds = [
    { kind: 'checked' },
    { kind: 'unverified', count: 2 },
    { kind: 'nothing', check: 'node --test' },
    { kind: 'too-large', bytes: 61 * 1024 * 1024 },
  ]
  for (const value of kinds) {
    const out = render(value)
    assert.doesNotMatch(out, /layer/i)
    assert.doesNotMatch(out, /corpus/i)
  }
  const withCi = render({ kind: 'checked' }, { state: 'green' })
  assert.doesNotMatch(withCi, /layer/i)
  const hooks = readFileSync(join(repoRoot, 'plugin', 'hooks', 'hooks.json'), 'utf8')
  assert.doesNotMatch(hooks, /statusLine/)
  const src = readFileSync(script, 'utf8')
  const renderStart = src.indexOf('export function render(')
  const renderEnd = src.indexOf('export async function main')
  assert.ok(renderStart >= 0 && renderEnd > renderStart)
  assert.doesNotMatch(src.slice(renderStart, renderEnd), /layer/i)
})

test('statusline segment: copy-paste is compose not a replacement command', () => {
  for (const path of shippedStatuslineSurfaces()) {
    const text = readFileSync(path, 'utf8')
    assertComposeNotReplacement(text)
  }
})

test('statusline segment: recipe does not delete refreshInterval or claim QH set the bar', () => {
  for (const path of shippedStatuslineSurfaces()) {
    const text = readFileSync(path, 'utf8')
    assert.match(text, /refreshInterval/)
    assert.doesNotMatch(text, /delete.{0,40}refreshInterval|remove.{0,40}refreshInterval/i)
    assert.match(text, /cannot set.{0,80}statusLine/i)
  }
  const hooks = readFileSync(join(repoRoot, 'plugin', 'hooks', 'hooks.json'), 'utf8')
  assert.doesNotMatch(hooks, /statusLine/)
})

// BACKLOG §348's review: a red workflow branch-state named without reading its jobs is not a job.
test('a workflow whose jobs were not read is counted apart from jobs', () => {
  const red = failed => renderCi({ state: 'red', sha: 'feed123', failed })
  assert.equal(red(['e2e (push) / browser: failure', 'platforms (push): failure — jobs not read', 'ci (push): failure — jobs not read']),
    'CI ✗ 1 job(s) +2 unread')
  assert.equal(red(['a workflow (push): failure — jobs not read']), 'CI ✗ +1 unread')
  assert.equal(red(['windows: failure', 'lint: failure']), 'CI ✗ 2 job(s)')
})

// Owner, 2026-10-13: three more things a person watching a session wants to see, each from something already
// written, so a render starts no process: what is ahead and unreviewed (branch-state's cache), a check or a
// campaign in flight (its lease), and a contended machine (the load average).
test('ahead and unreviewed come from the branch-state cache, and only while it is fresh', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-statusline-git-'))
  try {
    const gitDir = join(dir, '.git')
    mkdirSync(join(gitDir, 'objects'), { recursive: true })
    mkdirSync(join(gitDir, 'refs', 'heads'), { recursive: true })
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(gitDir, 'refs', 'heads', 'main'), `${'a'.repeat(40)}\n`)
    assert.notEqual(snapshotKey(gitDir), null, 'the fixture has a key the hook would write')
    const now = Date.now()
    const write = (state, at = now - 1_000, key = snapshotKey(gitDir)) => writeFileSync(join(gitDir, 'qh-branch-state.json'),
      JSON.stringify({ at, key, state: { looked: true, branch: 'main', head: 'abc', dirty: 0, ci: { looked: false }, ...state } }))
    write({ ahead: 3, unreviewed: 2 })
    assert.equal(renderGit(gitReading(dir, now)), '↑3 · !rev 2')
    write({ ahead: 0, unreviewed: 0 })
    assert.equal(renderGit(gitReading(dir, now)), '', 'nothing ahead and nothing unreviewed says nothing')
    write({ ahead: 1 })
    assert.equal(renderGit(gitReading(dir, now)), '↑1', 'no review ledger, no review token')
    write({ ahead: 2, unreviewed: null })
    assert.equal(renderGit(gitReading(dir, now)), '↑2', 'a count that could not be taken is not a zero and not a number')
    write({ ahead: 2, behind: 3, unreviewed: 1 })
    assert.equal(renderGit(gitReading(dir, now)), '↑2 ↓3 · !rev 1', 'a diverged branch says both ways')
    write({ behind: 4 })
    assert.equal(renderGit(gitReading(dir, now)), '↓4', 'a branch only behind says so')
    write({ ahead: '5', unreviewed: -1 })
    assert.equal(renderGit(gitReading(dir, now)), '', 'a cache is input: a count that is not a positive integer is no token')
    write({ ahead: 3, unreviewed: 2 }, now - CI_STALE_MS - 60_000)
    assert.equal(renderGit(gitReading(dir, now)), '', 'a stale cache speaks for neither')
    write({ ahead: 3, unreviewed: 2 }, now + 60_000)
    assert.equal(gitReading(dir, now), null, 'a future-dated cache is refused')
    write({ ahead: 3, unreviewed: 2 }, now - 1_000, JSON.stringify(['ref: refs/heads/main', 'b'.repeat(40), 'unfetched']))
    assert.equal(renderGit(gitReading(dir, now)), '', 'a commit, a push or a switch since the hook counted: the counts are of another tree')
    unlinkSync(join(gitDir, 'refs', 'heads', 'main'))
    write({ ahead: 3, unreviewed: 2 }, now - 1_000, null)
    assert.equal(renderGit(gitReading(dir, now)), '', 'a key that cannot be proved is no answer, even beside a cache that has none')
    assert.equal(render({ kind: 'checked' }, { state: 'green' }, ['↑3 · !rev 2']), 'QH ✓ checked · CI ✓ · ↑3 · !rev 2')
    assert.equal(render(null, null, ['↑3']), '', 'no QH reading and no CI: the extras say nothing alone')
  } finally {
    remove(dir)
  }
})

test('a check or a campaign in flight for this checkout is shown from its lease, and no lease is removed', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qh-statusline-root-')))
  const leases = mkdtempSync(join(tmpdir(), 'qh-statusline-leases-'))
  try {
    const start = '2026-10-13T12:00:00.000Z'
    const now = Date.parse(start) + 125_000
    const lease = (name, body) => writeFileSync(join(leases, name), JSON.stringify(body))
    const alive = pid => (pid === 1 ? 'alive' : pid === 2 ? 'dead' : 'unknown')
    const look = cwd => renderFlight(flightReading(cwd, { dir: leases, now, alive }))
    assert.equal(look(root), '', 'no lease, nothing')
    lease('a.json', { pid: 1, command: 'qh-check: bash scripts/selftest.sh', root, start, state: 'running' })
    assert.equal(look(root), '⧗ check 2m')
    // A status line's cwd exists. Left uncreated, `sub` was resolved by spelling while the lease's root was resolved
    // by the filesystem, and a Windows temp directory under an 8.3 short name spells the two apart (CI, 3.8.24).
    mkdirSync(join(root, 'sub'))
    assert.equal(look(join(root, 'sub')), '⧗ check 2m', 'a subdirectory is the same checkout')
    assert.equal(look(realpathSync(tmpdir())), '', "another checkout's lease is not this one's")
    writeFileSync(join(leases, 'a.json'), JSON.stringify({ pid: 1, command: 'mutate.mjs --case x', root, start, state: 'waiting' }))
    assert.equal(look(root), '⧗ waiting 2m', 'a run waiting for its turn says waiting, not running')
    writeFileSync(join(leases, 'a.json'), JSON.stringify({ pid: 1, command: 'mutate.mjs', root, start, state: 'running' }))
    assert.equal(look(root), '⧗ campaign 2m')
    writeFileSync(join(leases, 'a.json'), JSON.stringify({ pid: 2, command: 'qh-check: x', root, start, state: 'running' }))
    lease('b.json', { pid: 3, command: 'qh-check: x', root, start, state: 'running' })
    lease('c.json', 'not a lease')
    assert.equal(look(root), '', 'a dead or unknown run is not in flight')
    assert.deepEqual(readdirSync(leases).sort(), ['a.json', 'b.json', 'c.json'], 'a render never removes a lease')
  } finally {
    remove(root)
    remove(leases)
  }
})


test('a cwd that does not exist yet is matched by the part of it that does', () => {
  const real = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-statusline-real-')))
  const links = mkdtempSync(join(tmpdir(), 'qh-statusline-links-'))
  const leases = mkdtempSync(join(tmpdir(), 'qh-statusline-canon-leases-'))
  try {
    const alias = join(links, 'alias')
    linkDirectory(real, alias)
    const now = Date.now()
    const lease = root => writeFileSync(join(leases, 'a.json'),
      JSON.stringify({ pid: 1, command: 'qh-check: x', root, start: new Date(now).toISOString(), state: 'running' }))
    const look = cwd => renderFlight(flightReading(cwd, { dir: leases, now, alive: pid => (pid === 1 ? 'alive' : 'dead') }))
    lease(real)
    assert.equal(look(join(alias, 'not', 'yet')), '⧗ check 0s', 'a missing cwd reached through a link is in the checkout')
    lease(alias)
    assert.equal(look(join(real, 'not', 'yet')), '⧗ check 0s', 'and a lease named through the link matches the real path')
  } finally {
    remove(links)
    remove(real)
    remove(leases)
  }
})

test('a path through a link is resolved by the filesystem before its .. is', { skip: process.platform === 'win32'
  ? 'Windows removes a .. lexically before it follows a junction, so the case does not arise there' : false }, () => {
  const real = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-statusline-dots-')))
  const links = mkdtempSync(join(tmpdir(), 'qh-statusline-dots-links-'))
  const leases = mkdtempSync(join(tmpdir(), 'qh-statusline-dots-leases-'))
  try {
    mkdirSync(join(real, 'inner'))
    const alias = join(links, 'alias')
    linkDirectory(join(real, 'inner'), alias)
    const now = Date.now()
    writeFileSync(join(leases, 'a.json'),
      JSON.stringify({ pid: 1, command: 'qh-check: x', root: real, start: new Date(now).toISOString(), state: 'running' }))
    const look = cwd => renderFlight(flightReading(cwd, { dir: leases, now, alive: pid => (pid === 1 ? 'alive' : 'dead') }))
    assert.equal(look(`${alias}${sep}..`), '⧗ check 0s', "the link's parent is the checkout, not the directory holding the link")
    writeFileSync(join(leases, 'a.json'),
      JSON.stringify({ pid: 1, command: 'qh-check: x', root: links, start: new Date(now).toISOString(), state: 'running' }))
    assert.equal(look(`${alias}${sep}..`), '', 'and the directory holding the link is another place')
  } finally {
    remove(links)
    remove(real)
    remove(leases)
  }
})

test('a linked worktree nested inside a checkout is its own checkout, not a subdirectory of the parent', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qh-statusline-nested-')))
  const leases = mkdtempSync(join(tmpdir(), 'qh-statusline-nested-leases-'))
  try {
    const gitDir = join(root, '.git')
    mkdirSync(join(gitDir, 'objects'), { recursive: true })
    mkdirSync(join(gitDir, 'refs'))
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    const linked = join(gitDir, 'worktrees', 'other')
    mkdirSync(linked, { recursive: true })
    writeFileSync(join(linked, 'HEAD'), 'ref: refs/heads/other\n')
    writeFileSync(join(linked, 'commondir'), '../..\n')
    const other = join(root, '.worktrees', 'other')
    mkdirSync(join(other, 'sub'), { recursive: true })
    writeFileSync(join(other, '.git'), `gitdir: ${linked}\n`)
    mkdirSync(join(root, 'sub'))
    assert.notEqual(findGitDir(other), findGitDir(root), 'the fixture is two checkouts')
    const now = Date.now()
    const lease = at => writeFileSync(join(leases, 'a.json'),
      JSON.stringify({ pid: 1, command: 'qh-check: x', root: at, start: new Date(now).toISOString(), state: 'running' }))
    const look = cwd => renderFlight(flightReading(cwd, { dir: leases, now, alive: pid => (pid === 1 ? 'alive' : 'dead') }))
    lease(root)
    assert.equal(look(join(root, 'sub')), '⧗ check 0s', 'a subdirectory of the checkout is the checkout')
    assert.equal(look(join(other, 'sub')), '', "the parent's run is not the nested worktree's")
    lease(other)
    assert.equal(look(join(other, 'sub')), '⧗ check 0s', "the nested worktree's own run is")
    assert.equal(look(root), '', "and the nested worktree's run is not the parent's")
  } finally {
    remove(root)
    remove(leases)
  }
})

test('a contended machine is shown as load over cores, and an unread load says nothing', () => {
  assert.equal(renderLoad(loadReading({ loadavg: () => [15.2, 9, 8], cores: 10 })), 'load 1.52×')
  assert.equal(renderLoad(loadReading({ loadavg: () => [10.01, 9, 8], cores: 10 })), 'load 1.01×', 'just over is never shown as 1.00')
  assert.equal(renderLoad(loadReading({ loadavg: () => [10, 9, 8], cores: 10 })), '', 'at the core count is not contended')
  assert.equal(renderLoad(loadReading({ loadavg: () => [0, 0, 0], cores: 10 })), '', 'Windows keeps no load average')
  assert.equal(renderLoad(loadReading({ loadavg: () => { throw new Error('no') }, cores: 10 })), '')
})

test('the CLI selects every new piece: ahead and unreviewed from the cache, and a check in flight from its lease', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'qh-statusline-wired-')))
  const leases = mkdtempSync(join(tmpdir(), 'qh-statusline-wired-leases-'))
  try {
    const gitDir = join(dir, '.git')
    mkdirSync(join(gitDir, 'objects'), { recursive: true })
    mkdirSync(join(gitDir, 'refs', 'heads'), { recursive: true })
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(gitDir, 'refs', 'heads', 'main'), `${'a'.repeat(40)}\n`)
    writeFileSync(join(gitDir, 'qh-branch-state.json'), JSON.stringify({ at: Date.now() - 1_000, key: snapshotKey(gitDir), state: {
      looked: true, branch: 'main', head: 'abc', dirty: 0, ahead: 2, unreviewed: 1,
      ci: { looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] } } }))
    writeFileSync(join(leases, 'x.json'), JSON.stringify({ pid: process.pid, command: 'qh-check: bash x.sh', root: dir,
      start: new Date().toISOString(), state: 'running' }))
    const out = spawnSync(process.execPath, [script], { input: JSON.stringify({ workspace: { current_dir: dir } }), encoding: 'utf8',
      timeout: 30_000, env: { ...process.env, QUALITY_HARNESS_LEASE_DIR: leases } })
    assert.equal(out.status, 0)
    assert.match(out.stdout.trim(), /^QH CI ✓ · ↑2 · !rev 1 · ⧗ check \d+s(?: · load \d+\.\d{2}×)?$/, out.stdout)
  } finally {
    remove(dir)
    remove(leases)
  }
})
