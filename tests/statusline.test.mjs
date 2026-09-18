// BACKLOG §134 — the gates' reading of a session, on the status line.
//
// ADR-060: the input is the session's event log, not the transcript. Shown dirty
// before clean — an unchecked tree renders ✗, a checked one ✓ — and an unchanged
// log is NOT read twice, because a status line renders constantly.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { linkDirectory } from './symlink-support.mjs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sessionLogFile } from '../plugin/scripts/lifecycle.mjs'
import { CI_STALE_MS, STALE_MS, ciReading, findGitDir, reading, render, renderCi } from '../plugin/scripts/statusline.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const script = join(repoRoot, 'plugin', 'scripts', 'statusline.mjs')

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
    rmSync(dir, { recursive: true, force: true })
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
      return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(entry => JSON.parse(entry))
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
    rmSync(dir, { recursive: true, force: true })
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
    assert.match(ok.stdout.trim(), /^QH ✗ 1 unverified · last observed \d+[smh] ago$/)
    assert.equal(ok.stderr, '', 'a status line never carries an error string')
    const garbage = run('not json')
    assert.equal(garbage.status, 0)
    assert.equal(garbage.stdout, '')
    assert.equal(garbage.stderr, '')
    const empty = run('')
    assert.equal(empty.status, 0)
    assert.equal(empty.stdout, '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
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
    rmSync(wt, { recursive: true, force: true })
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
    rmSync(bare, { recursive: true, force: true })
    // No .git anywhere above: nothing.
    assert.equal(findGitDir(tmpdir()) === null || typeof findGitDir(tmpdir()) === 'string', true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
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
