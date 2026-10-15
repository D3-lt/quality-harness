// ADR-104 T1: a Bash `git -C <absolute literal> commit`, the only git command in its text and
// followed only by `echo` or `true`, is told rather than refused when git places that path's
// repository somewhere other than this checkout's. Observed 2026-10-15: a commit into a scratch
// fixture repository was refused on this tree.
//
// Every same-repository row is a twin (CLAUDE.md §16): `.`, the toplevel, a subdirectory, a
// symlink, a linked worktree and a gitfile all lead git back to this checkout's git directory
// (measured, git 2.56.0), so each must stay refused unarmed and never carry the foreign advice.
// Driven through the real PreToolUse hook, because the claim is about rule P's decision.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { appendEvent } from '../plugin/scripts/event-log.mjs'
import { foreignCommitPath } from '../plugin/scripts/publish-command.mjs'
import { commonDirectory } from '../plugin/scripts/publish-verdict.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
// No git or session variable reaches a fixture: an armed session's GIT_CONFIG_* would inject
// its hook into the fixtures' own git (CLAUDE.md §9).
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:GIT_|CLAUDE_|QUALITY_HARNESS_)/.test(name) && name !== 'NODE_TEST_CONTEXT'))
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid', GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
const env = { ...baseEnv, ...IDENTITY, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_ENV_FILE: '' }
const top = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-foreign-')))
after(() => { try { rmSync(top, { recursive: true, force: true }) } catch { /* the assertions already ran */ } })
const slashed = file => file.replace(/\\/g, '/')
const git = (dir, ...args) => {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env })
  assert.equal(run.status, 0, run.stderr)
}
const ADVICE = /ADR-104/

// A foreign repository the commit is meant for: it is never committed into, only probed.
const foreign = join(top, 'foreign')
git(top, 'init', '-q', 'foreign')

let sessions = 0
// A session repository with a declared check and fast check, an unchecked edit, and a started
// session; `armed` appends what git's hook records when it has run (ADR-066 T1).
function session({ armed = false, fast = false } = {}) {
  const dir = join(top, `repo-${sessions}`)
  const id = `foreign-${sessions++}`
  git(top, 'init', '-q', dir)
  writeFileSync(join(dir, '.quality-harness.json'), `${JSON.stringify({ check: 'test -f notes.txt', fastCheck: 'test -f notes.txt' })}\n`)
  writeFileSync(join(dir, 'notes.txt'), 'a\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  const hookEnv = { ...env, QUALITY_HARNESS_LEASE_DIR: join(top, 'leases') }
  const said = payload => {
    const run = spawnSync(process.execPath, [join(plugin, 'scripts', 'lifecycle.mjs')], {
      cwd: dir, env: hookEnv, encoding: 'utf8', timeout: 120_000, windowsHide: true,
      input: JSON.stringify({ session_id: id, cwd: dir, ...payload }),
    })
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.trim()
  }
  said({ hook_event_name: 'SessionStart', source: 'startup' })
  // After the session starts, so its baseline does not already hold the change.
  writeFileSync(join(dir, 'notes.txt'), 'changed\n')
  if (armed) appendEvent(dir, id, { event: 'publish.hook-ran', hook: 'prepare-commit-msg' })
  if (fast) {
    const run = spawnSync(process.execPath, [join(plugin, 'scripts', 'qh-check.mjs'), '--fast'], { cwd: dir, env: hookEnv, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  const tell = command => {
    const text = said({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })
    const decision = text.startsWith('{') ? JSON.parse(text).hookSpecificOutput?.permissionDecision ?? null : null
    return { decision, text }
  }
  return { dir, tell }
}

const OBSERVED = target => `git -C ${target} -c user.email=q@x -c user.name=q commit -qm base; echo "commit exit $?"`

test('a literal -C commit into another repository is advised, armed or not, unchecked or fast-pass', () => {
  const rows = [OBSERVED(slashed(foreign)), `git -C ${slashed(foreign)} commit -m x`, `git -C ${slashed(foreign)} commit -F - <<'EOF'\nm\nEOF`]
  // The same repository by its other spellings, where this machine has them (measured on macOS).
  if (slashed(foreign).startsWith('/private/tmp/')) rows.push(`git -C ${slashed(foreign).slice('/private'.length)} commit -m x`)
  const folded = join(top, 'FOREIGN')
  if (existsSync(folded)) rows.push(`git -C ${slashed(folded)} commit -m x`)
  for (const [k, command] of rows.entries()) {
    // One session per row: the advice is said once per tree.
    const said = session().tell(command)
    assert.notEqual(said.decision, 'deny', `${k}: ${command}\n${said.text}`)
    assert.match(said.text, ADVICE, command)
  }
  for (const state of [{ armed: true }, { fast: true }, { armed: true, fast: true }]) {
    const said = session(state).tell(OBSERVED(slashed(foreign)))
    assert.notEqual(said.decision, 'deny', JSON.stringify(state))
    assert.match(said.text, ADVICE, JSON.stringify(state))
  }
  // An untracked repository nested in the checkout is another repository too.
  const nested = session()
  git(nested.dir, 'init', '-q', 'nested')
  // A nested repository with no commit makes the session tree unobservable (`git add` exits 128).
  git(join(nested.dir, 'nested'), 'commit', '-q', '--allow-empty', '-m', 'n')
  const said = nested.tell(`git -C ${slashed(join(nested.dir, 'nested'))} commit -m x`)
  assert.notEqual(said.decision, 'deny', said.text)
  assert.match(said.text, ADVICE)
})

test("a -C path that reaches this repository's git directory is never foreign", () => {
  const unarmed = session()
  const armed = session({ armed: true })
  const rows = []
  for (const { dir } of [unarmed, armed]) {
    const base = top
    mkdirSync(join(dir, 'sub'), { recursive: true })
    const name = dir.slice(base.length + 1)
    const link = join(base, `${name}-link`)
    symlinkSync(dir, link, process.platform === 'win32' ? 'junction' : 'dir')
    git(dir, 'worktree', 'add', '-q', join(base, `${name}-wt`))
    mkdirSync(join(base, `${name}-gitfile`))
    writeFileSync(join(base, `${name}-gitfile`, '.git'), `gitdir: ${slashed(join(dir, '.git'))}\n`)
    const same = [
      '.', slashed(dir), slashed(join(dir, 'sub')), slashed(link), slashed(join(base, `${name}-wt`)),
      slashed(join(base, `${name}-gitfile`)), slashed(join(base, `${name}-none`)), name,
      `${slashed(foreign)}/../${name}`,
    ]
    rows.push(same.map(target => `git -C ${target} commit -m x`))
  }
  // On POSIX these spellings are relative: made here as real foreign repositories in the
  // session's directory, so only the platform rule keeps them refused.
  if (process.platform !== 'win32') {
    for (const { dir } of [unarmed, armed]) {
      for (const name of ['C:/B', '\\B']) {
        git(dir, 'init', '-q', name)
        git(join(dir, name), 'commit', '-q', '--allow-empty', '-m', 'b')
      }
    }
    for (const list of rows) list.push('git -C C:/B commit -m x', "git -C '\\B' commit -m x")
  }
  for (const command of rows[0]) {
    const said = unarmed.tell(command)
    assert.equal(said.decision, 'deny', command)
    assert.doesNotMatch(said.text, ADVICE, command)
  }
  for (const command of rows[1]) assert.doesNotMatch(armed.tell(command).text, ADVICE, command)
})

test('what runs beside the commit, or redirects it, keeps the refusal', () => {
  const unarmed = session()
  const F = slashed(foreign)
  const rows = [
    `touch x && git -C ${F} commit -m x`,
    `git init -q ${F} && git -C ${F} commit -m x`,
    `git -C ${F} add . && git -C ${F} commit -m x`,
    `git -C ${F} --git-dir=${slashed(unarmed.dir)}/.git commit -m x`,
    `git -C ${F} --work-tree=${slashed(unarmed.dir)} commit -m x`,
    `GIT_DIR=${slashed(unarmed.dir)}/.git git -C ${F} commit -m x`,
    `X=${F}; git -C "$X" commit -m x`,
    'git -C ~/x commit -m x',
    `git -C ${F} commit -m x && git push`,
    `git -C ${F} commit -m x; g=git; $g push`,
    `git -C ${F} commit -m x; printf -v x y`,
    `git -C ${F} commit -m x; echo $(git push)`,
    `git -C ${F} commit -m x & echo`,
    `git -C ${F} commit -m x || git commit -m y`,
    `git -C ${F} commit -m x 2>&1`,
    `git -C ${F} -c core.hooksPath=x commit -m x`,
  ]
  for (const command of rows) {
    const said = unarmed.tell(command)
    assert.equal(said.decision, 'deny', command)
    assert.doesNotMatch(said.text, ADVICE, command)
  }
  // An inherited redirect moves the commit whatever the text says (ADR-086's rule).
  assert.equal(foreignCommitPath(`git -C ${F} commit -m x`, { GIT_DIR: '/x' }, 'linux'), null)
  // CLEAN twin: the same reader proves the plain row.
  assert.equal(foreignCommitPath(`git -C ${F} commit -m x`, {}, process.platform), F)
})

test('a probe that fails proves nothing, and the probe is bounded and hidden', () => {
  const seen = []
  const run = result => (program, args, options) => { seen.push({ program, args, options }); return result }
  for (const failed of [{ error: new Error('spawn git ENOENT'), status: null }, { status: 128, stdout: '' }, { status: null, signal: 'SIGTERM', error: new Error('ETIMEDOUT') }, { status: 0, stdout: '' }]) {
    assert.equal(commonDirectory('/x', '/', run(failed)), null, JSON.stringify(failed))
  }
  for (const { options } of seen) {
    assert.ok(Number.isFinite(options.timeout) && options.timeout > 0, 'the probe carries a timeout')
    assert.equal(options.windowsHide, true, 'the probe carries windowsHide')
  }
  // CLEAN twin: a probe that prints a directory names it.
  assert.equal(commonDirectory(foreign, top), realpathSync.native(join(foreign, '.git')))
})

test('tests/foreign-commit.test.mjs is in the declared fast check', () => {
  assert.match(JSON.parse(readFileSync(join(repoRoot, '.quality-harness.json'), 'utf8')).fastCheck, /tests\/foreign-commit\.test\.mjs/)
})

// Codex review of 99a574c1: each row was accepted by the reader there and advised as foreign,
// while bash ran the hidden call. A new test, so T1's locked tests stay as they were.
test('arithmetic, a here-string and a command before the commit keep the refusal', () => {
  const unarmed = session()
  const F = slashed(foreign)
  const rows = [
    `((a['$(git -C ${slashed(unarmed.dir)} push)']=0)); git -C ${F} commit -m x`,
    `git -C ${F} commit -m x; echo $((a['$(git -C ${slashed(unarmed.dir)} push)']))`,
    `git -C ${F} commit -F - <<< 'message'`,
    `echo before; git -C ${F} commit -m x`,
  ]
  for (const command of rows) {
    const said = unarmed.tell(command)
    assert.equal(said.decision, 'deny', command)
    assert.doesNotMatch(said.text, ADVICE, command)
  }
  // CLEAN twin: a real quoted here-document is still a message.
  assert.equal(foreignCommitPath(`git -C ${F} commit -F - <<'EOF'\nm\nEOF`, {}, process.platform), F)
})

// BACKLOG §381, item 4(a) (Codex scoped review of 99a574c1..12cbbadb): the arithmetic guard read
// literal data as arithmetic, so a message line `((1))` in a quoted here-document, or an `echo`
// of `'let x=1'`, kept a commit into another repository refused. Data, as the shell reads it, is
// left out of that scan; anything the shell expands is still read. A new test beside the locked ones.
test('literal data is not arithmetic, and an expansion of it still is', () => {
  const unarmed = session()
  const F = slashed(foreign)
  const here = slashed(unarmed.dir)
  for (const command of [
    `git -C ${F} commit -F - <<'EOF'\nDocument ((1)) as literal text\nEOF`,
    `git -C ${F} commit -m x; echo 'let x=1'`,
    `git -C ${F} commit -m x; echo "let x=1"`,
  ]) {
    assert.equal(foreignCommitPath(command, {}, process.platform), F, command)
    // One session per row: the advice is said once per tree.
    const said = session().tell(command)
    assert.notEqual(said.decision, 'deny', `${command}\n${said.text}`)
    assert.match(said.text, ADVICE, command)
  }
  // DIRTY twins: what the shell evaluates keeps the refusal (CLAUDE.md §16).
  for (const command of [
    `git -C ${F} commit -m x; echo "$((a['$(git -C ${here} push)']))"`,
    `git -C ${F} commit -m x; echo $((a['$(git -C ${here} push)']))`,
    `((a['$(git -C ${here} push)']=0)); git -C ${F} commit -m x`,
    `git -C ${F} commit -F - <<EOF\n$((a['$(git -C ${here} push)']))\nEOF`,
    `git -C ${F} commit -m x; echo 'a' "$((1))"`,
    // Codex review of 921330b9..976aa281, P1: an arithmetic COMMAND after the here-document, spelled as its body.
    // shellWords lists no command for it, so only the scan sees it, and removing every copy of the body hid it.
    `git -C ${F} commit -F - <<'EOF'\n((a['$(git -C ${here} push)']=1))\nEOF\n((a['$(git -C ${here} push)']=1))\n`,
    `git -C ${F} commit -m x; echo '((a[1]=1))'\n((a[1]=1))\n`,
    // The verification of that fix (Codex, 976aa281..18879680, P1): a spelling that occurs once can still be code.
    // An ANSI-C echo whose decoded value is spelled across a closing quote and an arithmetic command:
    `git -C ${F} commit -m x\necho x''\n((\na['$(git -C ${here} push)']=1\n))\necho $'\\n\\x28\\x28\\na['\n`,
    // A tab-stripped `<<-` body that occurs, untabbed, only inside the arithmetic command after it:
    `git -C ${F} commit -F - <<-'EOF'\n\t(\n\ta['$(git -C ${here} push)']=1\nEOF\n((\na['$(git -C ${here} push)']=1\n))\n`,
  ]) {
    assert.equal(foreignCommitPath(command, {}, process.platform), null, command)
    assert.equal(unarmed.tell(command).decision, 'deny', command)
  }
})
