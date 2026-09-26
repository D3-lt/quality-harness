// The publish classifier behind ADR-061's refusal and ADR-060's reviewer guard,
// driven as a table: every string here is EXECUTED against `publishCommandIn`
// (CLAUDE.md §16 — a classifier over an open input space is an empirical claim,
// and a list typed from memory reads exactly like a measured one).
//
// Three rounds on 2026-09-23 shaped it (BACKLOG §269): the word match refused a
// grep and taught the script-file bypass; an unanchored invocation match let
// `/usr/bin/git push` through while still refusing `git log --grep "git push"`.
// What it matches now is `git commit` / `git push` at an EXECUTABLE POSITION —
// the start of a line or shell segment, after a wrapper that runs its argument,
// or inside the quoted string of a known executor — and nothing that is data.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hookSaid } from './hook-env.mjs'
import { appendEvent, containsCommitOrPush, leavesHookInPlace, mentionsCommitOrPush, publishCommandIn } from '../plugin/scripts/lifecycle.mjs'

// Invocations a session could publish with. Each must be refused on an
// unchecked tree and denied to a read-only role.
const PUBLISHES = [
  'git commit -m x',
  'git push',
  'git push origin main',
  'git commit --amend',
  'git -c user.name=Bot commit -m x',
  "git -c 'user.name=Bot User' commit -m x",
  'git --no-pager push origin main',
  'git -C "/tmp/x y" commit -m x',
  'git --git-dir=.git push',
  'git -C dir1 -C dir2 push',
  "bash -c 'git commit -m x'",
  'bash -o pipefail -c "git commit -m test"',
  "pwsh -Command 'git push'",
  'python3 -c \'import subprocess; subprocess.run(["git","push"])\'',
  'python3 -c "import subprocess; subprocess.run([\'git\', \'push\'])"',
  'node -e "require(\'child_process\').execSync(\'git push\')"',
  'env GIT_AUTHOR_NAME=Bot git commit -m test',
  'GIT_AUTHOR_NAME="Bot User" git commit -m test',
  'env -S "git commit -m test"',
  'exec git commit -m test',
  'command git commit -m test',
  'command -p git push',
  'time -p git commit -m test',
  'sudo git push',
  'nohup git push',
  '(git commit -m test)',
  '{ git commit -m test; }',
  'echo "$(git push)"',
  'gh pr view 1 && git push origin main',
  'true || git push',
  'ls | git commit -F -',
  'echo $((1 << 2))\ngit commit -m test',
  '/usr/bin/git push',
  '/opt/homebrew/bin/git commit -m x',
  'git \\\n push',
  'git\tpush',
  // Codex review of bbade17: a help flag anywhere LATER must not suppress a real publish;
  // control keywords, a quoted executable, `bash -lc`, `sudo -n`/`-u`, executor whitespace.
  'git push && echo --help',
  'git commit -m "fix --help output"',
  'git push origin main # --help',
  '"git" push',
  'if true; then git push; fi',
  'for b in x; do git push origin "$b"; done',
  'bash -lc "git push"',
  "sh -ec 'git commit -m x'",
  '! git push',
  'sudo -n git push',
  'sudo -u deploy git push',
  'python3 -c "import subprocess; subprocess.run( [\'git\', \'push\'])"',
  // Codex review of f67cede: wrappers that were a mention at most.
  'xargs -0 git push',
  'env -i git push',
  'nice git push',
  'doas git push',
  'timeout 5 git push',
  'timeout -k 3 5 git push',
  'if x; then exec git push; fi',
  // §296: every shell executed with `-c` on 2026-09-26, by path, after options and a wrapper.
  "zsh -c 'git commit -m x'",
  '/bin/sh -c "git push"',
  "dash -c 'git push'",
  "ksh -c 'git push'",
  "tcsh -c 'git push'",
  "csh -c 'git push'",
  "pwsh -c 'git push'",
  'pwsh -NoProfile -c "git push"',
  'sudo -u ci bash -c "git push"',
  "docker exec app sh -c 'git push'",
  // Codex review of the first §296 cut: each was a refusal before it and a mention after it.
  '"bash" -c "git push"',
  '"/bin/sh" -c "git push"',
  'sh.exe -c "git push"',
  'bash +e -c "git push"',
  'bash -O extglob -c "git push"',
  'bash --rcfile /dev/null -c "git push"',
  'bash --noprofile --norc -c "git push"',
  'bash -o "pipefail" -c "git push"',
  'bash \\\n-c "git push"',
  "pwsh -ExecutionPolicy Bypass -c 'git push'",
  // §298: a shell that parses without executing does not hide a real invocation after it,
  // and execution turned back on, or a PowerShell word option, is still a publish.
  'bash -n -c "git push"; git push',
  'bash -n +n -c "git push"',
  "bash -o noexec +o noexec -c 'git push'",
  "pwsh -NonInteractive -c 'git push'",
  // Codex review of §298's first cut: a quoted option value is one token, and a real
  // push after a silenced string is still a publish.
  'bash --rcfile "x -n y" -c "git push"',
  'bash -n -c "echo" ; git push',
  'sh -n -c "" && sh -c "git push"',
]

// Commands that mention the words, or even the invocation as DATA, and publish
// nothing. Each was refused by an earlier shape of this classifier.
const NOT_PUBLISHES = [
  'qh-check',
  'git status',
  'git log --oneline',
  'git merge feature',
  'gh pr merge 21',
  'grep -n pre-commit a.md',
  'grep -n containsCommitOrPush plugin/scripts/lifecycle.mjs',
  'cat commit-c2.txt',
  "node -e 'records.push(1)'",
  'echo "the commit message goes here"',
  'git log --grep commit',
  'git log --grep "git push"',
  "echo 'run git push later'",
  'grep -rn "git commit" docs/',
  'cat docs/adr/ADR-061-an-unchecked-publish-is-refused.md',
  'git commit-tree HEAD^{tree}',
  'git push-to-checkout',
  'git commit --help',
  'git help commit',
  'sh do-commit.sh',
  'node -e "/names commit or push \\\\(`git commit`\\\\)/"',
  'python3 -c "print(\'git push\')"',
  // Codex review of f67cede: a keyword or wrapper INSIDE quoted data was a command position.
  'echo "then git push"',
  'echo "do git push"',
  'echo "else git push"',
  'echo "! git push"',
  'echo "sudo git push"',
  'echo "exec git push"',
  'echo "env git push"',
  "printf '%s\\n' \"git push\"",
  "sed -n '/git push/p' f",
  'man git-push',
  // Codex review of f14e4cd, executed under bash with git shadowed: an option's ARGUMENT is
  // not the executable; `!git` is an executable named `!git`; a newline is a new command.
  'env -u git push',
  'xargs -I git push',
  '!git push',
  'git\npush',
  // §296: a `-c` that belongs to no shell. Each was refused while the arm was `-[A-Za-z]*c "`.
  'grep -c "git push" docs/',
  "grep -rc 'git commit' .",
  'wc -c "git push"',
  "head -c 'git push'",
  'refresh -c "git push"',
  "printf '%s\\n' foo@sh -c 'git push'",
  // §298: measured on bash, sh, zsh, dash, ksh, csh and tcsh — none of these runs the string.
  'bash -n -c "git push"',
  "zsh -n -c 'git push'",
  "bash -xn -c 'git push'",
  "sh -nc 'git push'",
  'bash -o noexec -c "git push"',
  'bash --help -c "git push"',
  "sh --version -c 'git push'",
  // ...and nothing inside a silenced string is invoked, wherever the search starts in it.
  'bash -n -c "git push; git push"',
  'bash -n -c "echo \\"x\\"; git push"',
  "bash -c \"bash -n -c 'x; git push'\"",
]

// The precise arm's known limit, pinned as a decision (§269): a `;` or a newline inside
// quoted data or a heredoc body reads as a command position, so these are refused
// although they publish nothing. Rare, named in the refusal's own text, and cheaper
// A Windows chaos round (2.111.0-rc, P2): spellings that reached git on a Windows 11
// host (`git.exe --version`, `cmd //c git --version`, `wsl -e true`) and were not read
// as a publish. Beside them, look-alikes that run no git.
const WINDOWS_PUBLISHES = [
  'git.exe push',
  '"/c/Program Files/Git/cmd/git.exe" push',
  'C:/Git/cmd/git.exe push',
  'cmd /c git push',
  'cmd.exe /c "git push"',
  'cmd //c git push',
  'pwsh -c "git.exe push"',
  'wsl git push',
  'wsl -d Ubuntu -e git push',
]
const WINDOWS_NOT_PUBLISHES = ['cmd /c echo git push', 'wsl ls', 'gitk.exe push']
// A chaos round (2.111.0-rc, playtrix F1): `eval` runs its string.
test('eval runs its string, so a publish in it is invoked', () => {
  for (const command of ['eval "git push origin main"', "eval 'git push'", 'eval git push']) {
    assert.match(publishCommandIn(command) ?? '', /^git push/, command)
  }
  assert.equal(publishCommandIn('echo eval git push'), null, 'the word as data is not an eval')
})
test('Windows spellings of a publish are recognised, and look-alikes are not', () => {
  for (const command of WINDOWS_PUBLISHES) assert.match(publishCommandIn(command) ?? '', /git(?:\.exe)? push$/, command)
  for (const command of WINDOWS_NOT_PUBLISHES) assert.equal(publishCommandIn(command), null, command)
})

// than a shell parser; the docs say so rather than "never refused".
const KNOWN_FALSE_REFUSALS = [
  // Codex review of 2.111.0-rc2: eval joins its arguments, so a quoted string followed by
  // more words is one command this classifier does not rebuild. The same limit as above.
  'eval "git push" "-h"',
  'git log --grep "x; git push"',
  'echo "example; git push"',
  'node -e "console.log(\'a; git push\')"',
  "cat <<'EOF'\ngit push\nEOF",
  // §296, Codex: a shell and its -c inside quoted data. The same limit as above, kept by the
  // owner's decision for 2.111.0 rather than paid for with a quote-aware parser.
  'echo \'bash -c "git push"\'',
  'grep -F \'sh -c "git push"\' docs/example.md',
]

// Mentions: refused by no arm, WARNED about by the advisory one. These are the
// grep, the echo and the file name that taught the bypass (§269) — and the two
// forms the precise arm does not parse, which the warning keeps from being silent.
const MENTIONS = [
  'echo "the commit message goes here"',
  'git log --grep commit',
  'git commit --help',
  "echo 'run git push later'",
  '$(which git) push',
  'GIT=git; $GIT push',
  'grep -c "git push" docs/',
]
const NOT_MENTIONS = ['qh-check', 'git status', 'grep -n pre-commit a.md', "node -e 'records.push(1)'", 'git commit-tree HEAD^{tree}', 'ls',
  'grep -n containsCommitOrPush plugin/scripts/lifecycle.mjs', 'cat commit-c2.txt']

test('every publish form is recognised, with the invocation named', () => {
  const missed = PUBLISHES.filter(command => !containsCommitOrPush(command))
  assert.deepEqual(missed, [], `publishes the classifier did not see:\n${missed.join('\n')}`)
  for (const command of PUBLISHES) {
    assert.match(publishCommandIn(command), /^\S*git(?: \S+)* (?:commit|push)$/, `${command} -> ${publishCommandIn(command)}`)
  }
})

test('nothing that only mentions a publish is refused', () => {
  const refused = NOT_PUBLISHES.filter(command => containsCommitOrPush(command))
  assert.deepEqual(refused, [], `data refused as a publish:\n${refused.join('\n')}`)
  assert.equal(publishCommandIn(undefined), null)
  assert.equal(publishCommandIn(''), null)
  // The known limit is a limit, not a surprise: if a later shape stops refusing these,
  // the comment above is stale and this line says so.
  for (const command of KNOWN_FALSE_REFUSALS) assert.equal(containsCommitOrPush(command), true, `known limit moved: ${command}`)
})

// What is NOT observed, said so it is a decision: a `git` reached through a
// variable, a command substitution or an escape is not seen. The honest refusal
// for those is a git hook (ADR-061 follow-up), not a longer regex.
test('dynamic invocations are not refused, and this test pins that they are a mention at most', () => {
  for (const command of ['$(which git) push', 'GIT=git; $GIT push', 'git p\\u0075sh']) {
    assert.equal(containsCommitOrPush(command), false, command)
  }
})

test('the advisory arm sees the words as words — warned about, never refused', () => {
  const silent = MENTIONS.filter(command => !mentionsCommitOrPush(command))
  assert.deepEqual(silent, [], `a mention the warning arm did not see:\n${silent.join('\n')}`)
  const refused = MENTIONS.filter(command => containsCommitOrPush(command))
  assert.deepEqual(refused, [], `a mention the precise arm refused:\n${refused.join('\n')}`)
  const noisy = NOT_MENTIONS.filter(command => mentionsCommitOrPush(command))
  assert.deepEqual(noisy, [], `warned about nothing:\n${noisy.join('\n')}`)
  // Every proven invocation is also a mention: the warning arm is the superset.
  const unseen = PUBLISHES.filter(command => !mentionsCommitOrPush(command))
  assert.deepEqual(unseen, [], `a publish the warning arm would not even warn about:\n${unseen.join('\n')}`)
})

// ── ADR-066 T3: rule P leaves only a plain invocation to an armed session's git ──
//
// Driven through the real PreToolUse hook over a real repository, because the
// claim is about rule P's decision, and the decision reads the session log.

const hookRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hookLifecycle = path.join(hookRepoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const hookQhCheck = path.join(hookRepoRoot, 'plugin', 'bin', 'qh-check')
const hookTmp = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-armed-')))
after(() => {
  try { rmSync(hookTmp, { recursive: true, force: true }) } catch { /* the assertions already ran */ }
})
const IDENTITY = {
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
}

// A repository with a declared check, a started session, and an unchecked edit.
// `armed` appends what git's hook records when it has run (ADR-066 T1).
function armedSession(prefix, { armed = true, offered = false } = {}) {
  const dir = mkdtempSync(path.join(hookTmp, prefix))
  const git = (...args) => {
    const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...IDENTITY } })
    assert.equal(run.status, 0, run.stderr)
  }
  git('init', '-q')
  writeFileSync(path.join(dir, 'a.md'), 'a\n')
  writeFileSync(path.join(dir, 'check.sh'), 'exit 0\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  const session = `${prefix}${process.pid}`
  const hook = payload => {
    const run = spawnSync(process.execPath, [hookLifecycle], {
      cwd: hookTmp, input: JSON.stringify({ session_id: session, cwd: dir, ...payload }), encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, ...IDENTITY, TMPDIR: hookTmp, TMP: hookTmp, TEMP: hookTmp, CLAUDE_ENV_FILE: '' },
    })
    assert.equal(run.status, 0, run.stderr)
    const text = hookSaid(run.stdout, run.stderr).stdout
    return text.startsWith('{') ? JSON.parse(text).hookSpecificOutput?.permissionDecision ?? null : null
  }
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  if (offered) appendEvent(dir, session, { event: 'publish.offered' })
  if (armed) appendEvent(dir, session, { event: 'publish.hook-ran', hook: 'prepare-commit-msg' })
  writeFileSync(path.join(dir, 'a.md'), 'changed\n')
  const decide = (command, extra = {}) => hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra })
  const check = () => {
    const run = spawnSync('python3', [hookQhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, run.stderr)
  }
  return { decide, check }
}

// Plain invocations and the quoted-data rows the classifier matches: with git's
// hook in place, each is advice. The two quoted `bash -c` / `sh -c` rows of
// KNOWN_FALSE_REFUSALS do not start with git, so they keep the refusal.
const LEFT_TO_GIT = [
  'git commit -m x', 'git push', 'git push origin main', 'git commit --amend',
  'git -c user.name=Bot commit -m x', 'git --no-pager push origin main', 'git -C "/tmp/x y" commit -m x',
  'git log --grep "x; git push"', 'echo "example; git push"', 'node -e "console.log(\'a; git push\')"', "cat <<'EOF'\ngit push\nEOF",
]
// Every form measured 2026-09-26 to leave the hook out, and the wrappers that may
// run git without this session's environment.
const DISABLES_THE_HOOK = [
  'git -c hook.qh-publish-commit.enabled=false commit -m x',
  'git -c hook.qh-publish-commit.command=true commit -m x',
  'git -c core.hooksPath=/dev/null commit -m x',
  'env GIT_CONFIG_COUNT=0 git commit -m x',
  'GIT_CONFIG_COUNT=0 git commit -m x',
  'unset CLAUDE_CODE_SESSION_ID; git commit -m x',
  'git push --no-verif',
  'git commit -anm m',
  'sudo git push',
]

test('an armed session leaves a plain invocation to git', () => {
  const armed = armedSession('armed-')
  for (const command of LEFT_TO_GIT) {
    assert.ok(publishCommandIn(command) !== null, `the classifier matches it: ${command}`)
    assert.notEqual(armed.decide(command), 'deny', command)
  }
  // DIRTY twin: the same commands in a session whose hook never ran are refused.
  const unarmed = armedSession('unarmed-', { armed: false })
  for (const command of LEFT_TO_GIT) assert.equal(unarmed.decide(command), 'deny', command)
})

test('an armed session still refuses every form that can disable the hook', () => {
  const armed = armedSession('escape-')
  for (const command of DISABLES_THE_HOOK) assert.equal(armed.decide(command), 'deny', command)
  // CLEAN twin: on a checked tree the same forms are not refused.
  armed.check()
  for (const command of DISABLES_THE_HOOK) assert.notEqual(armed.decide(command), 'deny', command)
})

test('PowerShell, an offered-only session and the reviewer guard are unchanged', () => {
  const armed = armedSession('pwsh-')
  assert.equal(armed.decide('git commit -m x', { tool_name: 'PowerShell' }), 'deny', 'PowerShell does not source the env file')
  assert.equal(armed.decide('git commit -m x', { agent_type: 'qh-correctness-reviewer', agent_id: 'r1' }), 'deny', 'a read-only role')
  const offered = armedSession('offered-', { armed: false, offered: true })
  assert.equal(offered.decide('git commit -m x'), 'deny', 'an offer is not arming')
})

test('an armed session refuses a wrapped git and a reassigned hook variable', () => {
  // Each row is caught by exactly ONE check of leavesHookInPlace, so each check is
  // shown able to fail on its own (the catalogue found the table above let every
  // row fall to two). Reassigning an exported variable changes what git inherits:
  // GIT_CONFIG_COUNT=0 in the same shell switches the offered hook off.
  const armed = armedSession('reassigned-')
  for (const command of [
    "bash -c 'git commit -m x'",
    'GIT_CONFIG_COUNT=0; git commit -m x',
    'CLAUDE_CODE_SESSION_ID=; git commit -m x',
  ]) assert.equal(armed.decide(command), 'deny', command)
})

test('an armed session refuses a quoted, escaped or substituted hook bypass', () => {
  // Codex review of 3.0.0 (P1): the shell removes quotes and backslashes before git
  // sees its arguments, so `--no""-verify` reaches git as `--no-verify` — and the
  // armed branch had read it as a plain push and advised. Quotes and escapes are
  // stripped before the checks; a `$` or a backtick fails closed.
  const armed = armedSession('quoted-')
  for (const command of [
    'git push --no""-verify',
    'git push --no\\-verify',
    "git push --no-veri'fy'",
    'git push "$FLAG"',
    'git push `echo --no-verify`',
  ]) assert.equal(armed.decide(command), 'deny', command)
})

test('an armed session refuses what the shell expands before git sees it', () => {
  // Codex review of 3.0.0, round 2 (P1): a line continuation and a brace expansion
  // reach git as `--no-verify` or `-c hook.…`, and each read as a plain invocation.
  // What bash hands git is measured first, so the rows are not typed from memory
  // (CLAUDE.md §16).
  const expands = [
    ['git push --no-\\\nverify', '--no-verify'],
    ['git push --no-{verify,verify}', '--no-verify'],
    ['git {-c,hook.qh-publish-push.enabled=false} push', 'hook.qh-publish-push.enabled=false'],
  ]
  for (const [command, argument] of expands) {
    const printed = spawnSync('bash', ['-c', command.replace(/^git/, "printf '%s\\n'")], { encoding: 'utf8', timeout: 10_000 })
    assert.equal(printed.status, 0, `bash ran: ${command}`)
    assert.ok(printed.stdout.split('\n').includes(argument), `bash hands git ${argument}: ${command}`)
  }
  const armed = armedSession('expanded-')
  for (const [command] of expands.slice(0, 2)) assert.equal(armed.decide(command), 'deny', command)
  // The third is never matched as a publish at all — the text classifier does not
  // expand braces either (BACKLOG §303, the lexer of §301 Stage 3) — so only the
  // armed branch's own answer can be shown here.
  assert.equal(leavesHookInPlace(expands[2][0]), false)
  // CLEAN twin: the same characters inside quotes are not expanded, and stay git's.
  assert.notEqual(armed.decide('git commit -m "fix {x} [y] ~z *"'), 'deny')
  assert.notEqual(armed.decide("git commit -m 'a {b,c} d?'"), 'deny')
})

test('an armed session refuses a redirection or an attached value that hides a bypass', () => {
  // Codex review of 3.0.0, round 3: a redirection needs no space around it, and a
  // short option takes its value attached — each row below hands git `-n` or a
  // hook-disabling `-c`, measured under bash, and each read as a plain invocation.
  const hides = [
    ['git commit -n</dev/null', '-n'],
    ['git commit -n>&1', '-n'],
    ['git -c</dev/null core.hooksPath=/dev/null commit', 'core.hooksPath=/dev/null'],
    ['git commit -nm123', '-nm123'],
    ["git commit -nm'fix: bug'", '-nmfix: bug'],
  ]
  for (const [command, argument] of hides) {
    const printed = spawnSync('bash', ['-c', command.replace(/^git/, "printf '%s\\n'")], { encoding: 'utf8', timeout: 10_000 })
    assert.equal(printed.status, 0, `bash ran: ${command}`)
    assert.ok(printed.stdout.split('\n').includes(argument), `bash hands git ${argument}: ${command}`)
    assert.equal(leavesHookInPlace(command), false, command)
  }
  assert.equal(leavesHookInPlace("git -c 'alias.ci=commit' ci -m x && git commit -m y"), false, 'an inline alias')
  // CLEAN twins: a redirection and an attached message that hide nothing stay git's.
  const armed = armedSession('redirected-')
  for (const command of ['git commit -m x 2>&1', 'git commit -am x >/dev/null', 'git commit -m "a > b"']) {
    assert.notEqual(armed.decide(command), 'deny', command)
  }
})

test('the armed check is a grammar of plain forms, not a list of dangerous ones', () => {
  // After three Codex rounds each found a new door, the check was turned around: a
  // form not KNOWN to be plain keeps the refusal. Each row reaches git with its hook
  // off, or runs something other than this session's git, and none was on any list.
  for (const command of [
    'git --work-tree=/tmp commit -m x', 'git --git-dir=/tmp/g commit -m x', 'git --exec-path=/tmp commit -m x',
    'PATH=/tmp/bin; git commit -m x', 'source ./x; git commit -m x', '. ./x; git commit -m x',
    'alias git=true; git commit -m x', 'git config core.hookspath x && git commit -m y',
    'git config hook.qh-publish-commit.enabled false && git commit -m y', 'git commit -m x --no-verify',
    'echo "x; git commit --no-verify" | bash', 'git commit</dev/null -n; git push',
    // Each row below also carries a plain publish, so only the rule it names stands
    // between it and `true` (the catalogue found six rules masked without that).
    'cp /tmp/c .git/config && git commit -m y',
    "bash -c 'git commit --no-verify' && git push",
    'git config include.path /tmp/x && git commit -m y',
    'echo "x; git commit --no-verify" | bash; git push',
    'git com\\\nmit --no-verify; git push',
    'git commi? --no-verify; git push',
  ]) assert.equal(leavesHookInPlace(command), false, command)
  // CLEAN twins: the ordinary forms stay git's, including a quoted value holding the
  // words that a list would have matched.
  for (const command of [
    'git commit -am "fix -n and --no-verify in the docs"', 'git push -u origin HEAD', 'git commit --amend --no-edit',
    'git add -A && git commit -m x && git push', 'git -C repo --no-pager commit -F msg.txt',
    "git commit -am'wip: 1'", 'git commit -m "- a list item"', 'git commit -mfix',
  ]) assert.equal(leavesHookInPlace(command), true, command)
})

test('the armed grammar reads words, quoted code and heredocs as the shell does', () => {
  // Codex review of 3.0.0, round 4, each row measured under bash and zsh: a quoted
  // option hidden as code, a carriage return read as a separator, an environment
  // variable assigned by `printf -v`, a wrapper around quoted code, and a heredoc
  // piped on to a program this cannot see into.
  for (const command of [
    "git commit '-nm;message'",
    'git commit -m\r -n -m x',
    'printf -v GIT_CONFIG_COUNT %s 0; git commit -m x',
    // An exported variable reassigned changes what git inherits, named or not.
    'LD_PRELOAD=/tmp/x.so; git commit -m x',
    // Node's children inherit the environment only until the code empties it.
    'node -e "process.env = {}; require(\'child_process\').execSync(\'git commit -m x; true\')"',
    'bash -c "git commit -m x;"',
    "cat <<'EOF' | docker run -i img sh\ngit commit -m x\nEOF",
    'node -e "require(\'child_process\').execSync(\'git commit -m x;\', {env: {}})"',
  ]) assert.equal(leavesHookInPlace(command), false, JSON.stringify(command))
  // CLEAN twins: a data command's quoted text and heredoc, and a message holding code.
  for (const command of [
    'git commit -m "fix; then push"', "cat <<'EOF'\ngit push\nEOF", 'echo "one; git push"',
  ]) assert.equal(leavesHookInPlace(command), true, JSON.stringify(command))
})
