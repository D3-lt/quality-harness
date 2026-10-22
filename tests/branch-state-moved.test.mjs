// ADR-065 accepts one stale prompt: a due snapshot is served while a refresh runs. What it must not do is serve a moved
// HEAD as if it were current. The brief printed the old snapshot's HEAD, dirty count and ahead count with only an age,
// and the unknown-CI shortcut printed them with no mark at all (BACKLOG §381). The live HEAD is already in the snapshot
// key, which is read from files, so saying it costs no process.
//
// Driven through the CLI the hook runs, with an empty PATH so nothing can spawn git or gh, and a young refresher lock
// held so no refresher is started (a refresher with no git would overwrite the snapshot under the test).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { movedSince, snapshotKey } from '../plugin/scripts/branch-state.mjs'

const script = fileURLToPath(new URL('../plugin/scripts/branch-state.mjs', import.meta.url))
const green = { looked: true, branch: 'main', head: 'abc1234', dirty: 0, ahead: 0, behind: 0,
  ci: { looked: true, sha: 'abc1234', status: 'completed', conclusion: 'success', failed: [] },
  tag: null, shippedSinceTag: null, releaseBlocked: null }
const unknown = dirty => ({ ...green, dirty, ci: { looked: false, note: 'gh: command not found' } })
const DUE = 200_000

function repository(t) {
  const project = mkdtempSync(path.join(os.tmpdir(), 'qh-moved-'))
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
  const write = body => writeFileSync(cache, JSON.stringify(body))
  const brief = () => spawnSync(process.execPath, [script, '--brief', '--cached', '120'],
    { cwd: project, env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 10_000 }).stdout
  return { git, gitDir, write, brief }
}

test('a due snapshot whose HEAD moved says so, with the live HEAD, and says it once', t => {
  const { git, gitDir, write, brief } = repository(t)
  const before = snapshotKey(gitDir)
  git('commit', '--allow-empty', '-qm', 'two')
  const now = git('rev-parse', '--short=7', 'HEAD')
  write({ at: Date.now() - DUE, key: before, state: green })
  const first = brief()
  assert.match(first, new RegExp(`^branch-state: main @ abc1234, clean \\(moved since this was read: HEAD now ${now}; uncommitted and ahead not re-read\\) · CI `), first)
  assert.match(first, /every job concluded success\. \(read \d+s ago; refreshing\)/, first)
  assert.equal(brief(), '', 'the same moved snapshot is not said again, and the age is not what is compared')
})

test('a due snapshot whose key did not move carries the age and no moved clause', t => {
  const { gitDir, write, brief } = repository(t)
  write({ at: Date.now() - DUE, key: snapshotKey(gitDir), state: green })
  const out = brief()
  assert.match(out, /every job concluded success\. \(read \d+s ago; refreshing\)/, out)
  assert.doesNotMatch(out, /moved since/, out)
})

test('an unknown-CI shortcut on a due snapshot carries the age, and the moved clause when HEAD moved', t => {
  const { git, gitDir, write, brief } = repository(t)
  const key = snapshotKey(gitDir)
  write({ at: Date.now() - DUE, key, state: unknown(0) })
  assert.match(brief(), /COULD NOT LOOK — gh: command not found/)
  const stored = JSON.parse(readFileSync(path.join(gitDir, 'qh-branch-state.json'), 'utf8'))
  // Unmoved: the shortcut names its age and that a refresh is running. A dirty count alone is not news (ADR-122 T3), so the
  // branch moves ahead.
  write({ ...stored, at: Date.now() - DUE, key, state: { ...unknown(2), ahead: 1 } })
  const unmoved = brief()
  assert.match(unmoved, /^branch-state: main @ abc1234, 2 uncommitted path\(s\), 1 ahead of origin · ⚠ CI COULD NOT LOOK, unchanged \(read \d+s ago; refreshing\)\n$/, unmoved)
  // Moved: it also says the HEAD it printed is not the live one.
  git('commit', '--allow-empty', '-qm', 'two')
  const now = git('rev-parse', '--short=7', 'HEAD')
  const again = JSON.parse(readFileSync(path.join(gitDir, 'qh-branch-state.json'), 'utf8'))
  write({ ...again, at: Date.now() - DUE, key, state: unknown(3) })
  const moved = brief()
  assert.match(moved, new RegExp(`3 uncommitted path\\(s\\) \\(moved since this was read: HEAD now ${now}; uncommitted and ahead not re-read\\) · ⚠ CI COULD NOT LOOK, unchanged \\(read \\d+s ago; refreshing\\)`), moved)
})

test('movedSince names the live HEAD when any part of the key moved, and nothing when it did not or cannot be proved', () => {
  const key = (head, sha, upstream = '-') => JSON.stringify([head, sha, upstream])
  const a = 'a'.repeat(40)
  const b = 'b'.repeat(40)
  assert.equal(movedSince(key('ref: refs/heads/main', a), key('ref: refs/heads/main', b)), 'bbbbbbb')
  assert.equal(movedSince(key('ref: refs/heads/main', a), key('ref: refs/heads/other', a)), 'aaaaaaa', 'a switch at the same sha')
  assert.equal(movedSince(key('ref: refs/heads/main', a, a), key('ref: refs/heads/main', a, b)), 'aaaaaaa', 'a push')
  assert.equal(movedSince(key('ref: refs/heads/main', a), key('ref: refs/heads/main', a)), null)
  assert.equal(movedSince(null, key('ref: refs/heads/main', b)), null)
  assert.equal(movedSince(key('ref: refs/heads/main', a), null), null)
  assert.equal(movedSince('not json', key('ref: refs/heads/main', b)), null)
})
