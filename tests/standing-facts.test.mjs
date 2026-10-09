// ADR-094 T2. Ten of fifteen surveyed sessions ignored SessionStart because it said the same standing
// paragraphs on every start, and its previous-session notice named work the ledger already proved.
// Everything runs through the real SessionStart hook, in a sandbox that holds the temp directory (the
// markers), the plugin data (the sessions ledger) and every repository (CLAUDE.md §9).
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { locationKey } from '../plugin/scripts/lifecycle.mjs'

const lifecycleScript = fileURLToPath(new URL('../plugin/scripts/lifecycle.mjs', import.meta.url))
const qhCheckScript = fileURLToPath(new URL('../plugin/scripts/qh-check.mjs', import.meta.url))
const VERIFICATION = /Verification: this project's own check is/
const PREVIOUS = /The previous session in this directory ended/
let counter = 0

function sandbox(t) {
  const top = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-standing-')))
  t.after(() => rmSync(top, { recursive: true, force: true }))
  return top
}
const environment = top => ({ ...process.env, CLAUDE_PLUGIN_DATA: path.join(top, 'data'), CLAUDE_ENV_FILE: '',
  TMPDIR: top, TMP: top, TEMP: top, QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' })
const git = (repo, ...args) => {
  const run = spawnSync('git', ['-C', repo, '-c', 'user.name=qh', '-c', 'user.email=qh@example.invalid', ...args], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(run.status, 0, run.stderr)
}
function repository(top, name, check = 'node check.mjs') {
  const repo = path.join(top, name)
  mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q')
  writeFileSync(path.join(repo, 'check.mjs'), 'if (process.argv.includes("--fail")) process.exit(1)\n')
  if (check) writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check }))
  return repo
}
function start(top, repo, source = 'startup', extraEnv = {}) {
  counter += 1
  const run = spawnSync(process.execPath, [lifecycleScript], {
    cwd: top, encoding: 'utf8', timeout: 120_000, windowsHide: true, env: { ...environment(top), ...extraEnv },
    input: JSON.stringify({ hook_event_name: 'SessionStart', source, cwd: repo, session_id: `standing-${process.pid}-${counter}` }),
  })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout || '{}').hookSpecificOutput?.additionalContext ?? ''
}
const previousRow = (top, repo) => {
  mkdirSync(path.join(top, 'data'), { recursive: true })
  writeFileSync(path.join(top, 'data', 'sessions.jsonl'), `${JSON.stringify({ location: locationKey(repo), status: 'unverified',
    reason: 'other', at: '2026-09-29T00:00:00.000Z', other: 0, files: [path.join(repo, 'a.md')] })}\n`)
}
const qhCheck = (top, repo) => {
  const run = spawnSync(process.execPath, [qhCheckScript], { cwd: repo, encoding: 'utf8', timeout: 120_000, windowsHide: true, env: environment(top) })
  assert.equal(run.status, 0, run.stderr)
}

test('a standing paragraph is said once per repository for three days and again when its text changes', t => {
  const top = sandbox(t)
  const repo = repository(top, 'repo-a')
  assert.match(start(top, repo), VERIFICATION, 'the first start says it')
  assert.doesNotMatch(start(top, repo), /Verification:/, 'the second start in the same repository does not')
  assert.doesNotMatch(start(top, repo, 'resume'), /Verification:/, 'nor does a resume')
  // A changed text is a new fact.
  writeFileSync(path.join(repo, '.quality-harness.json'), JSON.stringify({ check: 'node check.mjs --strict' }))
  assert.match(start(top, repo), /--strict/, 'a changed check is said')
  // Another repository is independent.
  assert.match(start(top, repository(top, 'repo-b')), VERIFICATION)
  // Older than three days is said again.
  const markers = path.join(top, 'quality-harness-said')
  const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
  for (const name of readdirSync(markers)) utimesSync(path.join(markers, name), old, old)
  assert.match(start(top, repo), /--strict/, 'a marker four days old says it again')
  // DIRTY twin: an unknown is said every time (ADR-005). With no git on PATH the repository root cannot be read.
  const blind = { PATH: '' }
  assert.match(start(top, repo, 'startup', blind), /could-not-look/)
  assert.match(start(top, repo, 'startup', blind), /could-not-look/, 'could-not-look is never gated')
})

test('compaction and clear say every paragraph again', t => {
  const top = sandbox(t)
  const repo = repository(top, 'repo-c')
  assert.match(start(top, repo), VERIFICATION)
  assert.doesNotMatch(start(top, repo), /Verification:/)
  assert.match(start(top, repo, 'compact'), VERIFICATION, 'the context lost it at compaction')
  assert.match(start(top, repo, 'clear'), VERIFICATION, 'and at clear')
  assert.doesNotMatch(start(top, repo), /Verification:/, 'neither one refreshed the marker')
})

test('the previous-session notice is silent when a pass is recorded for the current tree', t => {
  const top = sandbox(t)
  const repo = repository(top, 'repo-d')
  previousRow(top, repo)
  assert.match(start(top, repo), PREVIOUS, 'no pass yet: the notice stands')
  qhCheck(top, repo)
  assert.doesNotMatch(start(top, repo), PREVIOUS, 'a pass for the tree as it is now silences it')
  // A clean tree after a commit is silent too once the pass covers it.
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'work', '--no-gpg-sign')
  qhCheck(top, repo)
  assert.doesNotMatch(start(top, repo), PREVIOUS, 'clean, with a pass')
})

test('a tree with no pass keeps the previous-session notice, clean or dirty', t => {
  const top = sandbox(t)
  const repo = repository(top, 'repo-e')
  previousRow(top, repo)
  const dirty = start(top, repo)
  assert.match(dirty, PREVIOUS, 'dirty, no pass')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'work', '--no-gpg-sign')
  assert.match(start(top, repo), PREVIOUS, 'clean, no pass: a session under publish:warn or an unarmed git ends here')
  // A pass, then the tree moves: the pass no longer covers it.
  qhCheck(top, repo)
  assert.doesNotMatch(start(top, repo), PREVIOUS)
  writeFileSync(path.join(repo, 'later.js'), 'export {}\n')
  assert.match(start(top, repo), PREVIOUS, 'a pass for another tree proves nothing about this one')
  // No declared check: nothing can have passed, so the notice stands and says nothing has checked them.
  const bare = repository(top, 'repo-f', null)
  previousRow(top, bare)
  assert.match(start(top, bare), /Nothing has checked them since/)
})
