// ADR-120 T12: `git -C <relative> commit` is told, not refused, when git — asked with the operand as written,
// from the payload `cwd` — places it in another repository, as `git -C <absolute>` already is (ADR-104).
// `cd <relative> && git commit` stays unproven: `cd` follows the shell's logical PWD and git the physical path,
// so through a symlinked cwd they name different directories (measured 2026-10-21 under bash, zsh and sh: from a
// symlinked cwd `cd ../b` lands beside the link, `git -C ../b` beside its target).
// Every fixture path is built at runtime in a temporary directory (CLAUDE.md §6).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { foreignCommitPath } from '../plugin/scripts/publish-command.mjs'
import { remove } from './helpers/remove.mjs'
import { IMPL, QH_BIN } from './hook-golden.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = join(repoRoot, 'plugin')
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:GIT_|CLAUDE_|QUALITY_HARNESS_)/.test(name) && name !== 'NODE_TEST_CONTEXT'))
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid', GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
const env = { ...baseEnv, ...IDENTITY, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_ENV_FILE: '' }
const top = realpathSync.native(mkdtempSync(join(os.tmpdir(), 'qh-relative-')))
after(() => { try { remove(top) } catch { /* the assertions already ran */ } })
const git = (dir, ...args) => {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env })
  assert.equal(run.status, 0, run.stderr)
}
const ADVICE = /ADR-104/
const hookCommand = event => (IMPL === 'go' ? [QH_BIN, ['hook', String(event)]] : [process.execPath, [join(plugin, 'scripts', 'lifecycle.mjs')]])
const link = (target, at) => symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir')

// The foreign repository `b` sits in `top`, beside every session's repository `a-N`; `elsewhere/b` is another one,
// reached only through a symlink.
git(top, 'init', '-q', 'b')
mkdirSync(join(top, 'elsewhere', 'deep'), { recursive: true })
git(top, 'init', '-q', join(top, 'elsewhere', 'b'))

let sessions = 0
// A session repository with a declared check and an unchecked edit, so its commit is refused unless something
// proves it is told instead. `sub` and `inner` (a repository of its own) are made in it, and so are `b` (a plain
// directory, which belongs to the session) and `lnk`, a symlink out to `elsewhere/deep`.
function session() {
  const dir = join(top, `a-${sessions}`)
  const id = `relative-${sessions++}`
  git(top, 'init', '-q', dir)
  writeFileSync(join(dir, '.quality-harness.json'), `${JSON.stringify({ check: 'test -f notes.txt', fastCheck: 'test -f notes.txt' })}\n`)
  writeFileSync(join(dir, 'notes.txt'), 'a\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  mkdirSync(join(dir, 'sub'), { recursive: true })
  mkdirSync(join(dir, 'b'), { recursive: true })
  git(top, 'init', '-q', join(dir, 'inner'))
  // An embedded repository with no commit makes the observer's `git add -A` exit 128, and the commit is then advised, not refused.
  git(join(dir, 'inner'), 'commit', '-q', '--allow-empty', '-m', 'inner')
  link(join(top, 'elsewhere', 'deep'), join(dir, 'lnk'))
  const hookEnv = { ...env, QUALITY_HARNESS_LEASE_DIR: join(top, 'leases'), QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' }
  const said = (payload, cwd) => {
    const [file, args] = hookCommand(payload.hook_event_name)
    const run = spawnSync(file, args, { cwd: dir, env: hookEnv, encoding: 'utf8', timeout: 120_000, windowsHide: true, input: JSON.stringify({ session_id: id, cwd, ...payload }) })
    if (run.error) throw new Error(`the hook did not run (${file}): ${run.error.message}`)
    assert.equal(run.status, 0, run.stderr)
    return run.stdout.trim()
  }
  said({ hook_event_name: 'SessionStart', source: 'startup' }, dir)
  writeFileSync(join(dir, 'notes.txt'), 'changed\n')
  const tell = (command, cwd = dir) => {
    const text = said({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, cwd)
    const decision = text.startsWith('{') ? JSON.parse(text).hookSpecificOutput?.permissionDecision ?? null : null
    return { decision, text }
  }
  return { dir, tell }
}

test('a commit into another repository by a relative path is judged there', () => {
  // The recogniser returns the operand as written.
  for (const [command, want] of [
    ['git -C ../b commit -m x', '../b'],
    ['git -C ../../b commit -m x', '../../b'],
    ['git -C ../b/sub commit -m x', '../b/sub'],
    ['git -C inner commit -m x', 'inner'],
    ["git -C '../b' -c user.name=q -c user.email=q@x commit -qm x; echo \"commit exit $?\"", '../b'],
    ["git -C ../b commit -F - <<'EOF'\nm\nEOF", '../b'],
  ]) assert.equal(foreignCommitPath(command, {}, 'linux'), want, command)
  // The hook asks git with the operand as written from the payload cwd. One session per row: advice is said once per tree.
  for (const [command, from] of [
    ['git -C ../b commit -m x', ''],
    ['git -C ../../b commit -m x', 'sub'],
    ['git -C inner commit -m x', ''],
    ["git -C ../b -c user.name=q -c user.email=q@x commit -qm x; echo \"commit exit $?\"", ''],
  ]) {
    const s = session()
    const said = s.tell(command, from ? join(s.dir, from) : s.dir)
    assert.notEqual(said.decision, 'deny', `${command}\n${said.text}`)
    assert.match(said.text, ADVICE, command)
  }
})

test('a path that resolves home, or is not a literal, is not proven foreign', () => {
  const unarmed = session()
  const home = unarmed.dir
  const name = home.slice(top.length + 1)
  // `b/via-<name>` points into the session repository, so `..` after it leaves b for the session's own directory (physical).
  link(join(home, 'sub'), join(top, 'b', `via-${name}`))

  // Not a literal, or not one commit: the recogniser says nothing, and the refusal stands at the session's cwd.
  for (const command of [
    `git -C ../b/via-${name}/.. commit -m x`,
    'git -C ../$X commit -m x',
    'git -C ../b/*/ commit -m x',
    'git -C ~/b commit -m x',
    'git -C ../b/./c commit -m x',
    'git -C ./b commit -m x',
    'git -C . commit -m x',
    "git -C '' commit -m x",
    'git -C ../b commit -m x && git push',
    'git -C ../b push',
    'git -C ../b push origin HEAD',
    'cd ../b && git commit -m x',
    'cd ../b; git commit -m x',
  ]) {
    assert.equal(foreignCommitPath(command, {}, 'linux'), null, command)
    const said = unarmed.tell(command)
    assert.equal(said.decision, 'deny', `${command}\n${said.text}`)
    assert.doesNotMatch(said.text, ADVICE, command)
  }
  // A literal that git places in this checkout: recognised, probed, and refused as home.
  for (const command of [`git -C ../${name} commit -m x`, 'git -C sub commit -m x', 'git -C b commit -m x']) {
    assert.notEqual(foreignCommitPath(command, {}, 'linux'), null, command)
    const said = unarmed.tell(command)
    assert.equal(said.decision, 'deny', `${command}\n${said.text}`)
    assert.doesNotMatch(said.text, ADVICE, command)
  }
  // The logical/physical twin: from the payload cwd `lnk` (a symlink out to elsewhere/deep), `cd ../b` lands in the
  // session's own `b` (logical) while `git -C ../b` lands in elsewhere/b (physical). The cd form is never read as -C.
  for (const command of ['cd ../b && git commit -m x', 'cd ../b; git commit -m x']) {
    assert.equal(foreignCommitPath(command, {}, 'linux'), null, command)
    const s = session()
    const said = s.tell(command, join(s.dir, 'lnk'))
    assert.doesNotMatch(said.text, ADVICE, command)
  }
  // The operands whose spelling is the reason: a drive, a backslash on POSIX, a leading dash, dots, a space.
  for (const operand of ['C:b', '..\\b', '-x', '../b/..', '../.', '.../b', '../b c']) {
    assert.equal(foreignCommitPath(`git -C '${operand}' commit -m x`, {}, 'linux'), null, operand)
  }
  // The clean twin (CLAUDE.md §4): the same check does answer foreign for a relative operand elsewhere.
  assert.equal(foreignCommitPath('git -C ../b commit -m x', {}, 'linux'), '../b')
})

// The operand is dots and then names: dots alone name no directory this rule reads.
test('an operand with no name after the dots is not proven foreign', () => {
  for (const operand of ['..', '../..', '../']) {
    assert.equal(foreignCommitPath(`git -C ${operand} commit -m x`, {}, 'linux'), null, operand)
  }
  assert.equal(foreignCommitPath('git -C ../b/ commit -m x', {}, 'linux'), null, 'a trailing separator leaves an empty name')
  assert.equal(foreignCommitPath('git -C ../b commit -m x', {}, 'linux'), '../b')
})

// A single-quoted `$`, glob or `~` is a literal name to the shell, but this rule reads none of them (a hook cannot
// tell a directory named so from one the shell would expand were the quotes dropped by a wrapper).
test('a quoted operand holding an expansion, a glob or a tilde is not proven foreign', () => {
  for (const operand of ['../$X', '../b*', '../~b', '../b?', '../{b}', '../b[1]']) {
    assert.equal(foreignCommitPath(`git -C '${operand}' commit -m x`, {}, 'linux'), null, operand)
  }
  assert.equal(foreignCommitPath("git -C '../b' commit -m x", {}, 'linux'), '../b')
})
