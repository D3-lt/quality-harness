// ADR-066: git itself refuses an unchecked publish. Every case here runs REAL git
// with the hook injected the way SessionStart offers it — through GIT_CONFIG_* —
// because the claim is about what git does at the event, and a test that called
// the module directly would prove the function and not the hook (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const hookScript = path.join(repoRoot, 'plugin', 'scripts', 'publish-hook.mjs')
const qhCheck = path.join(repoRoot, 'plugin', 'bin', 'qh-check')
const testTmp = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-publish-hook-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true }) } catch { /* the assertions already ran */ }
})

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
}
const quoted = file => `"${file.replace(/\\/g, '/')}"`
// The config a session's Bash inherits once the hook is offered (T2 writes these).
const OFFERED = {
  GIT_CONFIG_COUNT: '4',
  GIT_CONFIG_KEY_0: 'hook.qh-publish-commit.command',
  GIT_CONFIG_VALUE_0: `${quoted(process.execPath)} ${quoted(hookScript)} prepare-commit-msg`,
  GIT_CONFIG_KEY_1: 'hook.qh-publish-commit.event',
  GIT_CONFIG_VALUE_1: 'prepare-commit-msg',
  GIT_CONFIG_KEY_2: 'hook.qh-publish-push.command',
  GIT_CONFIG_VALUE_2: `${quoted(process.execPath)} ${quoted(hookScript)} pre-push`,
  GIT_CONFIG_KEY_3: 'hook.qh-publish-push.event',
  GIT_CONFIG_VALUE_3: 'pre-push',
}

function git(dir, ...args) {
  const run = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...GIT_IDENTITY },
  })
  assert.equal(run.status, 0, args.join(' ') + ': ' + run.stderr)
  return run.stdout.trim()
}

// A repository with a declared check that can pass, and one committed file.
function repository(prefix) {
  const dir = mkdtempSync(path.join(testTmp, prefix))
  git(dir, 'init', '-q')
  writeFileSync(path.join(dir, 'a.md'), 'a\n')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  return dir
}

function startSession(dir, session) {
  const run = spawnSync(process.execPath, [lifecycleScript], {
    cwd: testTmp, encoding: 'utf8', timeout: 120_000,
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: session, cwd: dir }),
    env: { ...process.env, ...GIT_IDENTITY, TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp },
  })
  assert.equal(run.status, 0, run.stderr)
}

// Run a shell script the way a session's Bash would: with the session id and the
// offered hook config in its environment.
function shell(cwd, script, session, extra = {}) {
  const file = path.join(testTmp, `script-${process.hrtime.bigint()}.sh`)
  writeFileSync(file, script)
  const env = { ...process.env, ...GIT_IDENTITY, ...OFFERED, ...extra }
  if (session === null) delete env.CLAUDE_CODE_SESSION_ID
  else env.CLAUDE_CODE_SESSION_ID = session
  return spawnSync('sh', [file], { cwd, encoding: 'utf8', timeout: 120_000, env })
}

function events(dir, session) {
  const sessions = path.join(git(dir, 'rev-parse', '--absolute-git-dir'), 'quality-harness', 'sessions')
  const file = readdirSync(sessions).find(name => name.startsWith(session))
  return readFileSync(path.join(sessions, file), 'utf8').trim().split('\n').map(line => JSON.parse(line).event)
}

test('an unchecked commit is refused by git in the repository it runs in', () => {
  const dir = repository('refused-')
  const session = `hook-refused-${process.pid}`
  startSession(dir, session)
  writeFileSync(path.join(dir, 'a.md'), 'changed\n')
  for (const [name, script, cwd] of [
    ['plain', 'git commit -qam changed\n', dir],
    ['no-verify', 'git commit -qam changed --no-verify\n', dir],
    ['from elsewhere', `git -C ${quoted(dir)} commit -qam changed\n`, testTmp],
    ['through another script', `printf 'git commit -qam changed\\n' > inner.sh && sh inner.sh; s=$?; rm -f inner.sh; exit $s\n`, dir],
  ]) {
    const run = shell(cwd, script, session)
    assert.notEqual(run.status, 0, `${name}: the commit went through\n${run.stderr}`)
    assert.match(run.stderr, /unchecked/, `${name}: ${run.stderr}`)
    assert.match(run.stderr, /prepare-commit-msg hook/, `${name}: ${run.stderr}`)
  }
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD'), '1', 'no refused commit reached the branch')
  assert.ok(events(dir, session).includes('publish.hook-ran'), 'the hook recorded that it ran')
})

test("a checked commit, a person's commit and a merge pass the hook", () => {
  const dir = repository('passed-')
  const session = `hook-passed-${process.pid}`
  startSession(dir, session)
  writeFileSync(path.join(dir, 'a.md'), 'checked\n')
  // DIRTY half first, so the clean half below is shown to be the check's doing.
  assert.notEqual(shell(dir, 'git commit -qam checked\n', session).status, 0, 'unchecked is refused')
  const checked = shell(dir, `python3 ${quoted(qhCheck)} >/dev/null && git commit -qam checked\n`, session)
  assert.equal(checked.status, 0, `a qh-check in the same script is seen: ${checked.stderr}`)

  writeFileSync(path.join(dir, 'a.md'), 'by a person\n')
  const person = shell(dir, 'git commit -qam person\n', null)
  assert.equal(person.status, 0, `no session id is never refused: ${person.stderr}`)

  const foreign = repository('foreign-')
  writeFileSync(path.join(foreign, 'a.md'), 'elsewhere\n')
  const elsewhere = shell(foreign, 'git commit -qam elsewhere\n', session)
  assert.equal(elsewhere.status, 0, `a repository with no log for the session passes: ${elsewhere.stderr}`)

  git(dir, 'checkout', '-q', '-b', 'side')
  writeFileSync(path.join(dir, 'side.md'), 'side\n')
  git(dir, 'add', 'side.md')
  git(dir, 'commit', '-q', '-m', 'side')
  git(dir, 'checkout', '-q', '-')
  writeFileSync(path.join(dir, 'main.md'), 'main\n')
  git(dir, 'add', 'main.md')
  git(dir, 'commit', '-q', '-m', 'main')
  writeFileSync(path.join(dir, 'a.md'), 'unchecked again\n')
  git(dir, 'stash', '-q')
  const merged = shell(dir, 'git merge -q --no-edit side\n', session)
  assert.equal(merged.status, 0, `a merge is not a commit this refuses: ${merged.stderr}`)
})

test('a cherry-pick in progress is concluded without the hook refusing it', () => {
  // A conflicted pick leaves CHERRY_PICK_HEAD, and concluding it runs
  // prepare-commit-msg with the same source `git commit -m` uses; only git's own
  // sequencer state keeps the refusal to a plain commit (ADR-066 Decision 2).
  const dir = repository('pick-')
  const session = `hook-pick-${process.pid}`
  startSession(dir, session)
  git(dir, 'checkout', '-q', '-b', 'side')
  writeFileSync(path.join(dir, 'a.md'), 'side\n')
  git(dir, 'commit', '-qam', 'side')
  git(dir, 'checkout', '-q', '-')
  writeFileSync(path.join(dir, 'a.md'), 'main\n')
  git(dir, 'commit', '-qam', 'main')
  const pick = spawnSync('git', ['-C', dir, 'cherry-pick', 'side'], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...GIT_IDENTITY } })
  assert.notEqual(pick.status, 0, 'the pick conflicts, so it is left in progress')
  writeFileSync(path.join(dir, 'a.md'), 'resolved\n')
  git(dir, 'add', 'a.md')
  const concluded = shell(dir, 'git commit -q --no-edit\n', session)
  assert.equal(concluded.status, 0, `concluding a pick is not refused: ${concluded.stderr}`)
  // DIRTY twin: the same unchecked tree, with nothing in progress, is refused.
  writeFileSync(path.join(dir, 'a.md'), 'again\n')
  assert.notEqual(shell(dir, 'git commit -qam again\n', session).status, 0, 'a plain commit is still refused')
})
