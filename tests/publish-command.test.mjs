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
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hookSaid } from './hook-env.mjs'
import { containsCommitOrPush, freshRepositoryCommit, leavesHookInPlace, mentionsCommitOrPush, publishCommandIn } from '../plugin/scripts/lifecycle.mjs'
import { appendEvent } from '../plugin/scripts/event-log.mjs'

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
  // ADR-067: the shell expands braces before git sees them; bash and zsh run a backtick
  // inside double quotes (measured 2026-09-27 with a stand-in git: this row sat in
  // NOT_PUBLISHES, a publish the regex missed); and text piped into a shell is its script.
  'git {-c,x=y} push',
  'git {commit,-m,x}',
  'node -e "/names commit or push \\\\(`git commit`\\\\)/"',
  'echo "x; git commit --no-verify" | bash',
  "printf 'git push\\n' | sh",
  "cat <<'X' | bash\ngit push\nX",
  "bash <<'EOF'\ngit push\nEOF",
  'bash <<<"git push"',
  // Codex review of 341c49c, each run under bash and zsh with a stand-in git: a
  // substitution inside a parameter or arithmetic expression, a continued heredoc
  // delimiter, a pipeline through `cat`, `printf` and `echo -n` into a shell, a shell
  // option's value that reads like `-n`, a redirection-only command, a `-c` inside a
  // cluster, and ANSI-C spellings of the executable and the verb.
  'echo ${QH_MISSING:-$(git push --no-verify)}',
  ': $(( $(git push --no-verify) + 1 ))',
  '(( $(git push --no-verify) + 1 ))',
  'false && : <<\\\nEOF\nunused\nEOF\ngit push --no-verify',
  "echo 'echo ok; git push --no-verify' | /bin/cat | /bin/bash",
  "printf '%s' 'git push' | /bin/bash",
  "echo -n 'git push' | /bin/bash",
  '/bin/bash --rcfile "-n" -c "git push --no-verify"',
  '<$(git push --no-verify)',
  'bash -cx "git push"',
  "$'git' push",
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
  // ADR-067: the regex's known false refusals, data to a reader that splits as the shell does.
  'eval "git push" "-h"',
  'git log --grep "x; git push"',
  'echo "example; git push"',
  'node -e "console.log(\'a; git push\')"',
  "cat <<'EOF'\ngit push\nEOF",
  'echo \'bash -c "git push"\'',
  'grep -F \'sh -c "git push"\' docs/example.md',
  // Codex review of 341c49c: `echo` runs none of its arguments, a shell's name among them included.
  'echo "bash" "-c" "git push"',
  'echo bash -c "git push"',
]

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
// A chaos round (2.111.0-rc, php-react-app F1): `eval` runs its string.
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

// The known false refusals, pinned so a new one is a decision (§269). ADR-067 emptied
// it: each row was data to a reader that splits the command as the shell does, and
// moved to NOT_PUBLISHES. A limit found later goes here, with the evidence.
const KNOWN_FALSE_REFUSALS = []

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
  // What the hook said, whole: ADR-086 T2 reads the advisory text as well as the decision.
  const said = payload => {
    const run = spawnSync(process.execPath, [hookLifecycle], {
      cwd: hookTmp, input: JSON.stringify({ session_id: session, cwd: dir, ...payload }), encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, ...IDENTITY, TMPDIR: hookTmp, TMP: hookTmp, TEMP: hookTmp, CLAUDE_ENV_FILE: '' },
    })
    assert.equal(run.status, 0, run.stderr)
    return hookSaid(run.stdout, run.stderr).stdout
  }
  const hook = payload => decisionIn(said(payload))
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  if (offered) appendEvent(dir, session, { event: 'publish.offered' })
  if (armed) appendEvent(dir, session, { event: 'publish.hook-ran', hook: 'prepare-commit-msg' })
  writeFileSync(path.join(dir, 'a.md'), 'changed\n')
  const decide = (command, extra = {}) => hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra })
  const tell = (command, extra = {}) => said({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra })
  const check = () => {
    const run = spawnSync('python3', [hookQhCheck], { cwd: dir, encoding: 'utf8', timeout: 60_000 })
    assert.equal(run.status, 0, run.stderr)
  }
  return { decide, check, dir, tell }
}
const decisionIn = text => (text.startsWith('{') ? JSON.parse(text).hookSpecificOutput?.permissionDecision ?? null : null)

// Plain invocations: with git's hook in place, each is advice. The quoted-data rows
// that were here are no longer matched at all (ADR-067).
const LEFT_TO_GIT = [
  'git commit -m x', 'git push', 'git push origin main', 'git commit --amend',
  'git -c user.name=Bot commit -m x', 'git --no-pager push origin main', 'git -C "/tmp/x y" commit -m x',
  // A quoted literal inside data code counts under the command around it (ADR-066 round 4).
  'node -e "console.log(\'a; git push\')"; git push',
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
  // Codex review of 341c49c: a process substitution between the verb and its options.
  'git push</dev/null 2> >( /bin/cat ) --no-verify',
  // ...and a command hidden inside one, which the armed grammar can only see as code.
  'git push >(git config hook.qh-publish-push.enabled false)',
  // Round 2 and round 3 of the 3.0.0 review, after ADR-067 T3 moved splitting to the lexer:
  // a continued `.git/` write, and a rebase whose --exec runs a no-verify commit as plain text.
  'cp x .g\\\nit/config; git commit -m x',
  'git rebase --exec git\\ commit\\ -n HEAD && git push',
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

// ADR-067 T2. What the regex classifier returned at 826ec94 for every row that publishes;
// the walk over the lexer must return the same invocation.
const INVOKED_AT_826EC94 = {
  "git commit -m x": "git commit",
  "git push": "git push",
  "git push origin main": "git push",
  "git commit --amend": "git commit",
  "git -c user.name=Bot commit -m x": "git -c user.name=Bot commit",
  "git -c 'user.name=Bot User' commit -m x": "git -c user.name=Bot User commit",
  "git --no-pager push origin main": "git --no-pager push",
  "git -C \"/tmp/x y\" commit -m x": "git -C /tmp/x y commit",
  "git --git-dir=.git push": "git --git-dir=.git push",
  "git -C dir1 -C dir2 push": "git -C dir1 -C dir2 push",
  "bash -c 'git commit -m x'": "git commit",
  "bash -o pipefail -c \"git commit -m test\"": "git commit",
  "pwsh -Command 'git push'": "git push",
  "python3 -c 'import subprocess; subprocess.run([\"git\",\"push\"])'": "git push",
  "python3 -c \"import subprocess; subprocess.run(['git', 'push'])\"": "git push",
  "node -e \"require('child_process').execSync('git push')\"": "git push",
  "env GIT_AUTHOR_NAME=Bot git commit -m test": "git commit",
  "GIT_AUTHOR_NAME=\"Bot User\" git commit -m test": "git commit",
  "env -S \"git commit -m test\"": "git commit",
  "exec git commit -m test": "git commit",
  "command git commit -m test": "git commit",
  "command -p git push": "git push",
  "time -p git commit -m test": "git commit",
  "sudo git push": "git push",
  "nohup git push": "git push",
  "(git commit -m test)": "git commit",
  "{ git commit -m test; }": "git commit",
  "echo \"$(git push)\"": "git push",
  "gh pr view 1 && git push origin main": "git push",
  "true || git push": "git push",
  "ls | git commit -F -": "git commit",
  "echo $((1 << 2))\ngit commit -m test": "git commit",
  "/usr/bin/git push": "/usr/bin/git push",
  "/opt/homebrew/bin/git commit -m x": "/opt/homebrew/bin/git commit",
  "git \\\n push": "git push",
  "git\tpush": "git push",
  "git push && echo --help": "git push",
  "git commit -m \"fix --help output\"": "git commit",
  "git push origin main # --help": "git push",
  "\"git\" push": "git push",
  "if true; then git push; fi": "git push",
  "for b in x; do git push origin \"$b\"; done": "git push",
  "bash -lc \"git push\"": "git push",
  "sh -ec 'git commit -m x'": "git commit",
  "! git push": "git push",
  "sudo -n git push": "git push",
  "sudo -u deploy git push": "git push",
  "python3 -c \"import subprocess; subprocess.run( ['git', 'push'])\"": "git push",
  "xargs -0 git push": "git push",
  "env -i git push": "git push",
  "nice git push": "git push",
  "doas git push": "git push",
  "timeout 5 git push": "git push",
  "timeout -k 3 5 git push": "git push",
  "if x; then exec git push; fi": "git push",
  "zsh -c 'git commit -m x'": "git commit",
  "/bin/sh -c \"git push\"": "git push",
  "dash -c 'git push'": "git push",
  "ksh -c 'git push'": "git push",
  "tcsh -c 'git push'": "git push",
  "csh -c 'git push'": "git push",
  "pwsh -c 'git push'": "git push",
  "pwsh -NoProfile -c \"git push\"": "git push",
  "sudo -u ci bash -c \"git push\"": "git push",
  "docker exec app sh -c 'git push'": "git push",
  "\"bash\" -c \"git push\"": "git push",
  "\"/bin/sh\" -c \"git push\"": "git push",
  "sh.exe -c \"git push\"": "git push",
  "bash +e -c \"git push\"": "git push",
  "bash -O extglob -c \"git push\"": "git push",
  "bash --rcfile /dev/null -c \"git push\"": "git push",
  "bash --noprofile --norc -c \"git push\"": "git push",
  "bash -o \"pipefail\" -c \"git push\"": "git push",
  "bash \\\n-c \"git push\"": "git push",
  "pwsh -ExecutionPolicy Bypass -c 'git push'": "git push",
  "bash -n -c \"git push\"; git push": "git push",
  "bash -n +n -c \"git push\"": "git push",
  "bash -o noexec +o noexec -c 'git push'": "git push",
  "pwsh -NonInteractive -c 'git push'": "git push",
  "bash --rcfile \"x -n y\" -c \"git push\"": "git push",
  "bash -n -c \"echo\" ; git push": "git push",
  "sh -n -c \"\" && sh -c \"git push\"": "git push",
  "git.exe push": "git.exe push",
  "\"/c/Program Files/Git/cmd/git.exe\" push": "/c/Program Files/Git/cmd/git.exe push",
  "C:/Git/cmd/git.exe push": "C:/Git/cmd/git.exe push",
  "cmd /c git push": "git push",
  "cmd.exe /c \"git push\"": "git push",
  "cmd //c git push": "git push",
  "pwsh -c \"git.exe push\"": "git.exe push",
  "wsl git push": "git push",
  "wsl -d Ubuntu -e git push": "git push"
}
// The rows ADR-067 added to PUBLISHES, with what each invokes.
const ADDED_BY_ADR_067 = {
  'git {-c,x=y} push': 'git -c x=y push',
  'git {commit,-m,x}': 'git commit',
  'node -e "/names commit or push \\\\(`git commit`\\\\)/"': 'git commit',
  'echo "x; git commit --no-verify" | bash': 'git commit',
  "printf 'git push\\n' | sh": 'git push',
  "cat <<'X' | bash\ngit push\nX": 'git push',
  "bash <<'EOF'\ngit push\nEOF": 'git push',
  'bash <<<"git push"': 'git push',
  'echo ${QH_MISSING:-$(git push --no-verify)}': 'git push',
  ': $(( $(git push --no-verify) + 1 ))': 'git push',
  '(( $(git push --no-verify) + 1 ))': 'git push',
  'false && : <<\\\nEOF\nunused\nEOF\ngit push --no-verify': 'git push',
  "echo 'echo ok; git push --no-verify' | /bin/cat | /bin/bash": 'git push',
  "printf '%s' 'git push' | /bin/bash": 'git push',
  "echo -n 'git push' | /bin/bash": 'git push',
  '/bin/bash --rcfile "-n" -c "git push --no-verify"': 'git push',
  '<$(git push --no-verify)': 'git push',
  'bash -cx "git push"': 'git push',
  "$'git' push": 'git push',
  "git $'\\x70ush'": 'git push',
}
const FORMER_FALSE_REFUSALS = [
  ['eval "git push" "-h"', 'eval "git push"'],
  ['git log --grep "x; git push"', 'git log --grep x; git push'],
  ['echo "example; git push"', 'echo example; git push'],
  ['node -e "console.log(\'a; git push\')"', 'node -e x; git push'],
  ["cat <<'EOF'\ngit push\nEOF", 'cat\ngit push'],
  ['echo \'bash -c "git push"\'', 'echo x; bash -c "git push"'],
  ['grep -F \'sh -c "git push"\' docs/example.md', 'grep -F x; sh -c "git push"'],
]
// Every quoted literal in this file, for the cost bound.
const LITERAL = /'((?:[^'\\\n]|\\.)*)'/g
// Measured 2026-09-27: 4.6 µs per call uninstrumented on the owner's machine, 57 µs in
// CI's coverage floor job. Coverage instrumentation is a tax this bound is not about,
// and the twenty-fold mutant still lands above the wider bound (about 1,100 µs).
// ⚠ A BOUND IN µs IS A CLAIM ABOUT ONE MACHINE. The coverage floor's Python-gates phase
// runs this suite in parallel under coverage.py without NODE_V8_COVERAGE, and a loaded
// runner measured 45.3 and 46.8 µs there against 25 while the same commit passed in
// another run (BACKLOG §316). So the bound also scales with a reference workload timed
// here, in this process, under the same load: locally it is about 0.09 µs an iteration,
// which puts 25 µs at about 275 of them. Contention slows both; a slower classifier
// slows only one, so the twenty-fold mutant still lands far above the bound.
const REFERENCE_US = (() => {
  const once = () => {
    const started = process.hrtime.bigint()
    let n = 0
    for (let i = 0; i < 20000; i++) n += /(["'])(.*?)\1/.exec(`echo "x${i}" | grep y`)[2].length + 'a b c d'.split(' ').length
    return n > 0 ? Number(process.hrtime.bigint() - started) / 1000 / 20000 : 0
  }
  const runs = Array.from({ length: 5 }, once).sort((a, b) => a - b)
  return runs[2]
})()
const COST_BOUND_US = Math.max(process.env.NODE_V8_COVERAGE ? 400 : 25, 275 * REFERENCE_US)

test('a publish is found by argv, as the shell runs it', () => {
  for (const [command, expected] of Object.entries({ ...INVOKED_AT_826EC94, ...ADDED_BY_ADR_067 })) {
    assert.equal(publishCommandIn(command), expected, JSON.stringify(command))
  }
  for (const command of [...PUBLISHES, ...WINDOWS_PUBLISHES]) {
    assert.ok(command in INVOKED_AT_826EC94 || command in ADDED_BY_ADR_067, `no expected invocation: ${command}`)
  }
})

test('data that names a publish is not refused, and the known false refusals are gone', () => {
  assert.deepEqual(KNOWN_FALSE_REFUSALS, [])
  const armed = armedSession('data-armed-')
  const unarmed = armedSession('data-unarmed-', { armed: false })
  for (const [data, commands] of FORMER_FALSE_REFUSALS) {
    assert.equal(publishCommandIn(data), null, data)
    assert.notEqual(unarmed.decide(data), 'deny', data)
    assert.notEqual(armed.decide(data), 'deny', data)
    // DIRTY twin: the same words run as commands are a publish, refused unarmed.
    assert.ok(publishCommandIn(commands) !== null, commands)
    assert.equal(unarmed.decide(commands), 'deny', commands)
  }
})

test('a brace-built publish is refused', () => {
  assert.equal(publishCommandIn('git {-c,x=y} push'), 'git -c x=y push')
  assert.equal(publishCommandIn('git {commit,-m,x}'), 'git commit')
  assert.equal(publishCommandIn('echo {git,push}'), null)
  assert.equal(publishCommandIn("git '{-c,x=y}' push"), null, 'a quoted brace is not expanded: git reads it as an option')
  const unarmed = armedSession('brace-', { armed: false })
  assert.equal(unarmed.decide('git {-c,hook.qh-publish-commit.enabled=false} commit -m x'), 'deny')
})

test('text piped into a shell is read as the shell reads it', () => {
  const unarmed = armedSession('pipe-unarmed-', { armed: false })
  const armed = armedSession('pipe-armed-')
  for (const command of ['echo "x; git commit --no-verify" | bash', "printf 'git push\\n' | sh", "cat <<'X' | bash\ngit push\nX"]) {
    assert.ok(publishCommandIn(command) !== null, command)
    assert.equal(unarmed.decide(command), 'deny', command)
  }
  // --no-verify skips git's pre-push hook, so the armed session refuses it on its text.
  assert.equal(armed.decide('echo "x; git commit --no-verify" | bash'), 'deny')
  // CLEAN twin: the same text piped into a program that is not a shell.
  assert.equal(publishCommandIn('echo "x; git push" | cat'), null)
  assert.equal(publishCommandIn("cat <<'X' | cat\ngit push\nX"), null)
})

test('the classifier stays under its cost bound', t => {
  const literals = [...readFileSync(fileURLToPath(import.meta.url), 'utf8').matchAll(LITERAL)].map(m => m[1])
  const started = process.hrtime.bigint()
  for (let pass = 0; pass < 20; pass++) for (const literal of literals) publishCommandIn(literal)
  const mean = Number(process.hrtime.bigint() - started) / 1000 / (20 * literals.length)
  t.diagnostic(`mean ${mean.toFixed(2)} µs per call over ${literals.length} literals`)
  assert.ok(mean < COST_BOUND_US, `mean ${mean} µs`)
})

// BACKLOG §315: the literal check rescanned an interpreter script from its start for
// every call it tested, so a long script was quadratic: 4,000 calls in 125 KB took 6.4s
// inside the PreToolUse hook, where 3.1.0 took 42ms. The suite's literals are short and
// never showed it; this one is long, and a call inside a string still reads as data.
test('the classifier stays linear on a long interpreter script', () => {
  const body = Array.from({ length: 4000 }, (_, i) => `x${i} = os.system("echo ${i}")`).join('; ')
  const started = process.hrtime.bigint()
  assert.equal(publishCommandIn(`python3 -c 'import os; print("os.system(\\"git push\\")"); ${body}'`), null)
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(ms < (process.env.NODE_V8_COVERAGE ? 5000 : 1000), `${ms.toFixed(0)} ms for 4,000 calls`)
  assert.equal(publishCommandIn(`python3 -c 'import os; ${body}; os.system("git push")'`), 'git push')
})

// ADR-067 T3: the armed grammar reads the same lexer the publish classifier does.
const LIFECYCLE_SOURCE = new URL('../plugin/scripts/lifecycle.mjs', import.meta.url)
const BRACE_BYPASS = 'git {-c,hook.qh-publish-commit.enabled=false} commit -m x'

test('one lexer reads shell text for rule P', () => {
  // A quoted operator inside a git argument hides a bypass: `-nm;x` hands git `-n`.
  assert.equal(leavesHookInPlace("git commit '-nm;x'"), false)
  // The shell expands the braces before git sees them; both readers must too.
  assert.equal(publishCommandIn(BRACE_BYPASS), 'git -c hook.qh-publish-commit.enabled=false commit')
  assert.equal(leavesHookInPlace(BRACE_BYPASS), false)
  assert.equal(armedSession('one-lexer-').decide(BRACE_BYPASS), 'deny')
  const source = readFileSync(fileURLToPath(LIFECYCLE_SOURCE), 'utf8')
  assert.equal(source.includes('function hookSegments'), false, 'the armed grammar splits with shellWords, not with a copy of it')
  assert.ok(source.includes("import { shellWords } from './shell-words.mjs'"))
})

// A chaos round of 626934a. A macOS vitest SPA session ran each row under bash with a
// stand-in git; a Windows 11 session ran its rows under Git Bash, pwsh 7.6.6 and
// PowerShell 5.1 with a stand-in `git.cmd` and GIT_TRACE. Each ran a publish that was
// read as none, or ran none and was read as one. Rows after the marked line were not
// run by a shell: they are further spellings of the same mechanism.
const CHAOS_626934A_PUBLISHES = {
  'echo push | xargs git': 'git push',
  'xargs -I{} git {} <<< push': 'git push',
  "git submodule foreach 'git push'": 'git push',
  "git rebase -x 'git push' main": 'git push',
  'git bisect run git push': 'git push',
  'cmd //c call git push': 'git push',
  'cmd //c "g^it push"': 'git push',
  'pwsh -NoProfile -EncodedCommand ZwBpAHQAIABwAHUAcwBoAA==': 'git push',
  'powershell -NoProfile -c "iex \'git push\'"': 'git push',
  'Start-Process git -ArgumentList push -Wait -NoNewWindow': 'git push',
  // Not run by a shell.
  "git submodule foreach --recursive 'git commit -am x'": 'git commit',
  'git rebase --exec="git push" main': 'git push',
  "git --no-pager submodule foreach 'git push'": 'git push',
  'powershell -e ZwBpAHQAIABjAG8AbQBtAGkAdAAgAC0AbQAgAHgA': 'git commit',
  "Start-Process -FilePath git -ArgumentList 'push','origin'": 'git push',
  'start "" git push': 'git push',
  'cmd /c start git push': 'git push',
  // Codex review of this batch: `--dry-run` as an option's value, after `--`, or turned
  // off again is no dry run. Each ran the publish under bash and zsh with a recording git.
  'git commit -m --dry-run': 'git commit',
  'git commit -am --dry-run': 'git commit',
  'git push -o --dry-run origin main': 'git push',
  'git push --dry-run --no-dry-run': 'git push',
  'git commit -- --dry-run': 'git commit',
  // The Windows re-run of 9cc9a35: cmd's `if <condition> <command>` pushed under cmd,
  // pwsh and PowerShell 5.1. The first row was measured; the rest are its other shapes.
  'cmd /c if 1==1 git push': 'git push',
  'cmd //c if 1==1 git push': 'git push',
  'cmd /c if exist x git push': 'git push',
  'cmd /c IF /I NOT errorlevel 1 git push': 'git push',
  'cmd /c if a EQU a git push': 'git push',
  'cmd /c if a == a git push': 'git push',
  'cmd /c if defined PATH git commit -m x': 'git commit',
}
const CHAOS_626934A_NOT_PUBLISHES = [
  'git commit --dry-run -m x', 'git push --dry-run', 'git push -n origin main',
  'git --no-pager stash push -m wip', 'git -P stash push', 'git --version push', 'git --exec-path push',
  "git submodule foreach 'echo push'", 'echo push | xargs echo',
  'pwsh -e ZwBpAHQAIABzAHQAYQB0AHUAcwA=', 'cmd /c "echo g^it push"', 'start "" notepad push', 'iex "git status"',
  // Codex review of this batch: xargs forms whose real run launched no git.
  'echo push | xargs -E push git', "printf '' push | xargs git", 'echo push | xargs -0 git',
]
test('the chaos round of 626934a: what the shell ran is what the classifier reads', () => {
  const unarmed = armedSession('chaos-626934a-', { armed: false })
  for (const [command, expected] of Object.entries(CHAOS_626934A_PUBLISHES)) {
    assert.equal(publishCommandIn(command), expected, command)
    assert.equal(unarmed.decide(command), 'deny', command)
  }
  for (const command of CHAOS_626934A_NOT_PUBLISHES) {
    assert.equal(publishCommandIn(command), null, command)
    assert.notEqual(unarmed.decide(command), 'deny', command)
  }
  // `commit -n` is `--no-verify`, not a dry run.
  assert.equal(publishCommandIn('git commit -n -m x'), 'git commit')
  // The advisory arm reads what PowerShell hides: a backtick escape and an encoded script.
  for (const command of ['git comm`it -m x', 'pwsh -e ZwBpAHQAIABwAHUAcwBoAA==']) assert.equal(mentionsCommitOrPush(command), true, command)
  assert.equal(mentionsCommitOrPush('echo QUJDREVGR0g='), false, 'a base64 word that names neither')
})

// A Windows chaos round of 916b515, F7: a 10 MB command made the advisory arm's
// base64 scan overflow V8's regex stack, so the hook exited 1 before Rule P was read
// and the `git push` at its end went unrefused. Driven through the hook itself.
test('an oversized command is still read: the publish at its end is refused, not crashed past', () => {
  const unarmed = armedSession('chaos-916b515-', { armed: false })
  const command = `echo ${'a'.repeat(10 * 1024 * 1024)} && git push`
  assert.equal(mentionsCommitOrPush(command), true)
  assert.equal(unarmed.decide(command), 'deny')
})

// The same round: a program is looked up case-insensitively on Windows and on macOS
// (`GIT --version` runs git there), and a `.cmd` shim runs as its name. The first four
// published under the round's stand-in on Windows 11; the subprocess row ran git 2.55.0
// on macOS through Python's `subprocess.run(['GIT', '--version'])` (2026-09-27).
const CASE_FOLDED_PUBLISHES = {
  'GIT push': 'GIT push', 'Git commit -m x': 'Git commit', 'Git.Exe push': 'Git.Exe push', 'git.cmd push': 'git.cmd push',
  'python3 -c "import subprocess; subprocess.run([\'GIT\', \'push\'])"': 'GIT push',
}
test('git is recognised in any case and through a .cmd shim', () => {
  const unarmed = armedSession('case-916b515-', { armed: false })
  for (const [command, expected] of Object.entries(CASE_FOLDED_PUBLISHES)) {
    assert.equal(publishCommandIn(command), expected, command)
    assert.equal(unarmed.decide(command), 'deny', command)
  }
  for (const command of ['echo GIT push', 'gitk push', 'GIT status', 'git.bat.txt push']) assert.equal(publishCommandIn(command), null, command)
})

// The same round (tender-reef): `os.system` and `os.popen` hand their string to a shell.
// Both ran git 2.55.0 from `python3 -c` on macOS before these rows were written.
const OS_SHELL_PUBLISHES = {
  'python3 -c "import os; os.system(\'git push\')"': 'git push',
  'python3 -c "import os; os.popen(\'git commit -m x\')"': 'git commit',
}
test('a string handed to a shell by os.system or os.popen is read as that shell reads it', () => {
  const unarmed = armedSession('os-shell-916b515-', { armed: false })
  for (const [command, expected] of Object.entries(OS_SHELL_PUBLISHES)) {
    assert.equal(publishCommandIn(command), expected, command)
    assert.equal(unarmed.decide(command), 'deny', command)
  }
  assert.equal(publishCommandIn('python3 -c "import os; os.system(\'git status\')"'), null)
})

// The same round (ts-generator, macOS): an argv list handed to node's
// child_process or perl's system, and an alias defined on git's own command line.
// Each ran git 2.55.0 here before these rows were written.
const ARGV_AND_ALIAS_PUBLISHES = {
  "node -e \"require('child_process').spawnSync('git', ['push'])\"": 'git push',
  "node -e \"require('child_process').execFileSync('git', ['commit', '-m', 'x'])\"": 'git commit',
  "perl -e 'system(\"git\", \"push\")'": 'git push',
  'git -c alias.p=push p': 'git -c alias.p=push p',
  // git's own commit and push run over an alias of the same name, so these still publish.
  'git -c alias.commit=status commit -m x': 'git -c alias.commit=status commit',
  "git -c 'alias.push=!true' push": 'git -c alias.push=!true push',
  "git -c 'alias.x=!git push' x": 'git push',
}
const ARGV_AND_ALIAS_CONTROLS = [
  "node -e \"require('child_process').spawnSync('git', ['status'])\"",
  "perl -e 'system(\"git\", \"status\")'",
  'git -c alias.p=status p', 'git -c alias.p=push status', "git -c 'alias.x=!git status' x",
]
test('an argv list in node or perl, and an alias set with -c, are read as the publish they run', () => {
  const unarmed = armedSession('argv-alias-916b515-', { armed: false })
  for (const [command, expected] of Object.entries(ARGV_AND_ALIAS_PUBLISHES)) {
    assert.equal(publishCommandIn(command), expected, command)
    assert.equal(unarmed.decide(command), 'deny', command)
  }
  for (const command of ARGV_AND_ALIAS_CONTROLS) assert.equal(publishCommandIn(command), null, command)
})

// Codex review of 3.1.0..e0ef6d4. An alias is expanded as git expands it, its words
// before the command line's (F2); git's own commands win over an alias (F4, measured on
// 2.55.0: `alias.mergetool=version mergetool` ran mergetool); a `!` alias's arguments
// are data (F5, measured: `echo` printed `ok; git status`); and a call spelled inside a
// string literal is printed, not run (F3).
const REVIEWED_PUBLISHES = {
  "git -c 'alias.c=commit -m' c --dry-run": 'git -c alias.c=commit -m c',
  "git -c 'alias.x=!git' x push": 'git push',
  "git -c 'alias.x=!git push' x": 'git push',
  "perl -e 'print qq{x}; system(\"git\", \"push\")'": 'git push',
  'python3 -c "print(\'x\'); import os; os.system(\'git push\')"': 'git push',
  // Codex round 2: an interpolation hole is code (F2), an external command's alias is
  // read, since git runs the alias when the program is missing (F3).
  "node -e 'console.log(`${spawnSync(\"git\", [\"push\"])}`)'": 'git push',
  'python3 -c "import os; print(f\'{os.system(\\"git push\\")}\')"': 'git push',
  "perl -e 'print qq{@{[system(\"git\", \"push\")]}}'": 'git push',
  "python3 -c 's = \"\"\"a \" b\"\"\"; import os; os.system(\"git push\")'": 'git push',
  'git -c alias.mergetool=push mergetool': 'git -c alias.mergetool=push mergetool',
}
const REVIEWED_CONTROLS = [
  "git -c 'alias.p=push --dry-run' p",
  'git -c alias.version=push version', 'git -c alias.status=push status',
  // Codex round 2: git splits an alias on whitespace only and refuses `push;true` and a
  // leading space (F1); perl's q{} nests its braces (F2).
  "git -c 'alias.x=push;true' x", "git -c 'alias.x= push' x",
  "perl -e 'print q{a {b} system(\"git\", \"push\")}'",
  "git -c 'alias.x=!echo' x 'ok; git push'",
  // A python f-string's `{{` is a literal brace, not a hole (round 2, F2).
  'python3 -c "print(f\'{{os.system(\\"git push\\")}}\')"',
  'node -e "console.log(\\"spawnSync(\'git\', [\'push\'])\\")"',
  'python3 -c "print(\\"os.system(\'git push\')\\")"',
  'python3 -c "print(\\"run: os.system(\'git push\') now\\")"',
  "perl -e 'print qq{system(\"git\", \"push\")}'",
  'node -e "console.log(\\"a\\\\\\" spawnSync(\'git\', [\'push\'])\\")"',
]
test('an alias is read as git expands it, and a call inside a string is data', () => {
  const unarmed = armedSession('reviewed-e0ef6d4-', { armed: false })
  for (const [command, expected] of Object.entries(REVIEWED_PUBLISHES)) {
    assert.equal(publishCommandIn(command), expected, command)
    assert.equal(unarmed.decide(command), 'deny', command)
  }
  for (const command of REVIEWED_CONTROLS) assert.equal(publishCommandIn(command), null, command)
})

// ── ADR-086 T1: an armed session leaves a commit into a mktemp directory to git ──
//
// A `$NAME` assigned from `mktemp -d` and used only as a directory operand cannot
// switch git's injected hook off, so the commit is left to git, which judges the
// repository it lands in. Every other `$` keeps the refusal (CLAUDE.md §16 twins).
// Forward slashes on every platform: a Windows path's backslashes, unquoted, are shell escapes, so
// the classifier rightly refuses that template (dispatched campaign at e39ace5; CLAUDE.md §7).
const freshTemplate = () => path.join(hookTmp, 'x.XXXX').replaceAll('\\', '/')
const FRESH_DIRECTORY_COMMITS = () => [
  `R=$(mktemp -d ${freshTemplate()}); cd $R && git init -q && git add . && git commit -qm f`,
  `R=$(mktemp -d ${freshTemplate()}) && cd "$R" && git init -q && git add . && git commit -qm f`,
  `R=$(mktemp -d ${freshTemplate()}) && git init -q "$R" && git -C "$R" add -A && git -C "$R" commit -qm f`,
]
const DOLLARS_NOT_A_DIRECTORY = session => [
  'cd "$R" && git init -q && git commit -qm f',
  'git -C $R commit -qm f',
  'R=$(git rev-parse --show-toplevel) && cd "$R" && git commit -qm f',
  'R=$(mktemp -d "$T") && cd "$R" && git init -q && git commit -qm f',
  'R=$(mktemp -d) && R=$(pwd) && cd "$R" && git commit -qm f',
  'export R=$(mktemp -d) && cd "$R" && git commit -qm f',
  'R=$(mktemp -d) && git -c core.hooksPath="$R" commit -qm f',
  'R=$(mktemp -d) && cd "$R/.." && git commit -qm f',
  'R=$(mktemp -d) && cd "${R}" && git commit -qm f',
  'R=$(mktemp -d) && git commit -qm "$R"',
  'GIT_DIR=$(mktemp -d) && git commit -qm f',
  'R=$(mktemp -d; git config hook.qh-publish-commit.enabled false) && cd "$R" && git commit -qm f',
  `R=$(mktemp -d) && cd "$R" && git init -q && git remote add o ${session} && git push o HEAD:x`,
]

test('an armed session leaves a commit into a mktemp directory to git', () => {
  const armed = armedSession('fresh-armed-')
  const rows = FRESH_DIRECTORY_COMMITS()
  for (const command of rows) assert.notEqual(armed.decide(command), 'deny', command)
  // DIRTY twin: in a session whose hook never ran, the `;` row and the `-C` row are refused.
  const unarmed = armedSession('fresh-unarmed-', { armed: false })
  for (const command of [rows[0], rows[2]]) assert.equal(unarmed.decide(command), 'deny', command)
})

test('an armed session still refuses a dollar it cannot place as a directory', () => {
  const armed = armedSession('fresh-dollar-')
  const rows = DOLLARS_NOT_A_DIRECTORY(armed.dir)
  for (const command of rows) assert.equal(armed.decide(command), 'deny', command)
  // CLEAN twin: on a checked tree the same rows are not refused.
  armed.check()
  for (const command of rows) assert.notEqual(armed.decide(command), 'deny', command)
})

// ADR-086 Context, re-measured on every run: the armed arm rests on a target
// repository's own config being unable to remove a hook injected through
// GIT_CONFIG_COUNT. Skipped where git runs no config hooks at all.
const configHookProbe = (() => {
  const dir = mkdtempSync(path.join(hookTmp, 'config-probe-'))
  spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 10_000 })
  const run = spawnSync('git', ['-c', 'hook.qhprobe.command=true', '-c', 'hook.qhprobe.event=pre-commit', 'hook', 'list', 'pre-commit'],
    { cwd: dir, encoding: 'utf8', timeout: 10_000 })
  return /\bqhprobe\b/.test(run.stdout ?? '') ? false : 'this git does not run config-based hooks (git 2.54 or later does)'
})()
test('a target repository config does not switch off the injected hook', { skip: configHookProbe }, () => {
  const dir = mkdtempSync(path.join(hookTmp, 'config-target-'))
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_CONFIG')))
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', timeout: 30_000,
    env: {
      ...clean, GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'hook.qhprobe.command', GIT_CONFIG_VALUE_0: 'echo qhprobe-ran',
      GIT_CONFIG_KEY_1: 'hook.qhprobe.event', GIT_CONFIG_VALUE_1: 'prepare-commit-msg',
      GIT_CONFIG_KEY_2: 'hook.qhprobe.enabled', GIT_CONFIG_VALUE_2: 'true',
    },
  })
  assert.equal(git('init', '-q').status, 0)
  for (const [key, value] of [['hook.qhprobe.command', 'true'], ['hook.qhprobe.event', ''], ['hook.qhprobe.enabled', 'false'], ['core.hooksPath', '/dev/null']]) {
    assert.equal(spawnSync('git', ['-C', dir, 'config', key, value], { encoding: 'utf8', timeout: 10_000 }).status, 0, key)
    const run = git('hook', 'run', 'prepare-commit-msg', '--', 'x')
    assert.match(`${run.stdout}${run.stderr}`, /qhprobe-ran/, `a local ${key} switched the injected hook off`)
    assert.equal(spawnSync('git', ['-C', dir, 'config', '--unset', key], { encoding: 'utf8', timeout: 10_000 }).status, 0, key)
  }
})

// ── ADR-093 T1: an armed session leaves a commit into a literal-variable directory to git ──
//
// A `$NAME` the text assigns once as a plain literal and uses only as a directory operand
// cannot split, glob or inject (the text names no `IFS`), and cannot switch git's injected
// hook off, so the commit is left to git. Every other `$` keeps the refusal (§16 twins).
const litSlash = file => file.replace(/\\/g, '/')
const literalParent = () => litSlash(mkdtempSync(path.join(hookTmp, 'lit-parent-')))
const LITERAL_DIRECTORY_COMMITS = p => [
  `S=${p}; mkdir $S/y && cd $S/y && git init -q && git commit -qm f`,
  `S=${p}; mkdir "$S/y" && cd "$S/y" && git init -q && git commit -qm f`,
  `S=${p}; cd $S && git init -q && git add . && git commit -qm f`,
  `S=${p} && git init -q $S && git -C $S commit -qm f`,
  `S=${p} && cd $S && git init -q && git commit -qm f`,
]
const LITERAL_DOLLARS_REFUSED = (p, session) => [
  'cd $S && git commit -qm f',
  'S=$(pwd); cd $S && git commit -qm f',
  `S=${p} S2=x; cd $S && git commit -qm f`,
  `export S=${p}; cd $S && git commit -qm f`,
  `S=${p}; S=/other; cd $S && git commit -qm f`,
  `S=${p}; read S; cd $S && git commit -qm f`,
  `S=${p}; cd \${S} && git commit -qm f`,
  `S=${p}; cd $S/.. && git commit -qm f`,
  `S=${p}/..; cd $S && git commit -qm f`,
  'S=..; cd $S && git commit -qm f',
  `S="${p}"; cd $S && git commit -qm f`,
  `S=${p}/\\x; cd $S && git commit -qm f`,
  `S='${p} x'; cd $S && git commit -qm f`,
  'S=-C; git -C $S commit -qm f',
  `IFS=,; S=${p}; cd $S && git commit -qm f`,
  `IFS=/; S=${p}; cd $S && git commit -qm f`,
  `CDPATH=${p}; S=${p}; cd $S && git commit -qm f`,
  `S=${p}; mkdir -p $S/y && cd $S/y && git commit -qm f`,
  `S=${p}; rm -rf $S/y && git commit -qm f`,
  `S=${p}; git -c core.hooksPath=$S commit -qm f`,
  `S=${p}; git commit -qm $S`,
  `GIT_DIR=${p}; cd $GIT_DIR && git commit -qm f`,
  `S=${p}; cd $S && git init -q && git remote add o ${session} && git push o HEAD:x`,
  // Codex review of 3772a178: each of these reached git as `-C . -c hook…enabled=false commit`.
  `_=${p}; : '. -c hook.qh-publish-commit.enabled=false'; git -C $_ commit -qm f`,
  `REPLY=${p}; git -C $REPLY commit -qm f`,
  `S=${p}; read 'S[0]'; git -C $S commit -qm f`,
  `S=${p}; S+=x; git -C $S commit -qm f`,
  `S=${p}; declare -n r=S; git -C $S commit -qm f`,
  `(S=${p}); git -C $S commit -qm f`,
  `false && S=${p}; git -C $S commit -qm f`,
  `true || S=${p}; git -C $S commit -qm f`,
  `S=${p} & git -C $S commit -qm f`,
  `S=${p} | cat; git -C $S commit -qm f`,
  // Codex verification review: zsh's implicit reply array, and path (tied to PATH).
  `reply=${p}; read -A; git -C $reply commit -qm f`,
  `path=${p}; cd $path && git commit -qm f`,
  `S=${p}; printf -v IFS %s ,; git -C $S commit -qm f`,
  `if true; then S=${p}; fi; git -C $S commit -qm f`,
]
// A fresh-directory variable keeps exactly ADR-086's operand forms.
const FRESH_KEEPS_ADR_086 = () => [
  `R=$(mktemp -d ${freshTemplate()}); mkdir $R && cd $R && git init -q && git commit -qm f`,
  `R=$(mktemp -d ${freshTemplate()}); cd $R/y && git init -q && git commit -qm f`,
  // The same gaps, closed for ADR-086's variable by the same review.
  `R=$(mktemp -d ${freshTemplate()}); R+=x; cd $R && git init -q && git commit -qm f`,
  `(R=$(mktemp -d ${freshTemplate()})); cd $R && git init -q && git commit -qm f`,
  `false && R=$(mktemp -d ${freshTemplate()}); cd $R && git init -q && git commit -qm f`,
  // The shell-updated names and IFS, for ADR-086's variable in the armed arm too.
  `_=$(mktemp -d ${freshTemplate()}); : '. -c hook.qh-publish-commit.enabled=false'; git -C $_ commit -qm f`,
  `REPLY=$(mktemp -d ${freshTemplate()}); read; git -C $REPLY commit -qm f`,
  `OPTARG=$(mktemp -d ${freshTemplate()}); getopts a b; git -C $OPTARG commit -qm f`,
  `reply=$(mktemp -d ${freshTemplate()}); read -A; git -C $reply commit -qm f`,
  `IFS=,; R=$(mktemp -d ${freshTemplate()}); cd $R && git init -q && git commit -qm f`,
  `R=$(mktemp -d ${freshTemplate()}); printf -v IFS %s ,; git -C $R commit -qm f`,
]

test('an armed session leaves a literal-variable directory commit to git', () => {
  const armed = armedSession('lit-armed-')
  const p = literalParent()
  for (const command of LITERAL_DIRECTORY_COMMITS(p)) assert.notEqual(armed.decide(command), 'deny', command)
  // DIRTY twins: unarmed there is no git hook to judge, so the same rows are refused, and the
  // unarmed proof (freshRepositoryCommit) never reads a literal variable; a fresh variable
  // keeps ADR-086's forms only.
  const unarmed = armedSession('lit-unarmed-', { armed: false })
  for (const command of LITERAL_DIRECTORY_COMMITS(p)) {
    assert.equal(unarmed.decide(command), 'deny', command)
    assert.equal(freshRepositoryCommit(command), false, command)
  }
  for (const command of FRESH_KEEPS_ADR_086()) assert.equal(armed.decide(command), 'deny', command)
})

test('an armed session still refuses a dollar it cannot place as a literal directory', () => {
  const armed = armedSession('lit-dollar-')
  const rows = LITERAL_DOLLARS_REFUSED(literalParent(), armed.dir)
  for (const command of rows) assert.equal(armed.decide(command), 'deny', command)
  // CLEAN twin: on a checked tree the same rows are not refused.
  armed.check()
  for (const command of rows) assert.notEqual(armed.decide(command), 'deny', command)
})

// Supplementary, outside the Acceptance fence: it executes the admitted rows.
test('an admitted row run under bash commits only into the repository it created', { skip: process.platform === 'win32' && 'the rows are POSIX shell' }, () => {
  const armed = armedSession('lit-run-')
  const head = dir => spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10_000 })
  const before = head(armed.dir).stdout.trim()
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  for (const template of LITERAL_DIRECTORY_COMMITS('@@P@@')) {
    const p = literalParent()
    const row = template.replaceAll('@@P@@', p).replace(' commit -qm f', ' commit -q --allow-empty -m f')
    const run = spawnSync('bash', ['-c', row], { cwd: armed.dir, encoding: 'utf8', timeout: 60_000, env: { ...clean, ...IDENTITY, HOME: hookTmp } })
    assert.equal(run.status, 0, `${row}: ${run.stderr}`)
    assert.equal(head(armed.dir).stdout.trim(), before, `${row} moved the outer repository`)
    const made = [p, `${p}/y`].filter(dir => existsSync(`${dir}/.git`) && head(dir).status === 0)
    assert.equal(made.length, 1, `${row} committed in ${made.length} created repositories`)
  }
})

// ── ADR-086 T2: an unarmed commit into a repository the command creates is advised ──
//
// With no git hook to judge at the event, only the text can prove where the commit
// lands: an `&&`-chain from `V=$(mktemp -d …)` through `cd "$V"` and a bare `git init`,
// then only `git add` and `git commit`. Every row is executed under bash below.
const slashed = file => file.replace(/\\/g, '/')
const freshParent = () => slashed(mkdtempSync(path.join(hookTmp, 'fresh-parent-')))
const FRESH_REPOSITORY_ROWS = (parent, session) => [
  `R=$(mktemp -d ${parent}/fresh.XXXX) && cd "$R" && git init -q && git add -A && git commit -q --allow-empty -m f`,
  `R=$(mktemp -d ${parent}/fresh.XXXX) && cd $R && git init -q && git add -A && git commit -q --allow-empty -m f`,
  `R=$(mktemp -d ${session}/fresh.XXXX) && cd "$R" && git init -q && git add -A && git commit -q --allow-empty -m f`,
  `R=$(mktemp -d ${parent}/fresh.XXXX) && cd "$R" && git init -q && git add -A && git -c user.name=q -c user.email=q@e.invalid commit -q --allow-empty -m f`,
]
const FRESH_REPOSITORY_TWINS = (parent, session) => [
  `R=$(mktemp -d ${parent}/fresh.XXXX); cd "$R" && git init -q && git commit -qm f`,
  `R=$(mktemp -d ${parent}/fresh.XXXX); cd $R && git init -q && git add . && git commit -qm f`,
  `cd ${session} && git commit -qm f`,
  'git -C . commit -qm f',
  'cd "$R"; cd -; git commit -qm f',
  'git init -q x && git commit -qm f',
  ...[
    '(cd "$R" && git init -q) && git commit -qm f',
    'cd "$R" && git init -q && cd - && git commit -qm f',
    'cd "$R" && git commit -qm f',
    'cd "$R" && git init -q && git commit -qm f && git push',
    'cd "$R" && git init -q || git commit -qm f',
    'cd "$R" && git init -q | cat && git commit -qm f',
    `cd "$R" && git init -q && GIT_DIR=${session}/.git git commit -qm f`,
    `cd "$R" && git init -q --separate-git-dir=${session}/.git && git commit -qm f`,
    `cd "$R" && printf 'gitdir: ${session}/.git\\n' > .git && git init -q && git commit -qm f`,
    `cd "$R" && git init -q && git -C ${session} commit -qm f`,
    `cd "$R" && git init -q && git --git-dir=${session}/.git commit -qm f`,
    'git init -q "$R" && git -C "$R" commit -qm f',
  ].map(rest => `R=$(mktemp -d) && ${rest}`),
  'R=$(mktemp -d) && R=. && cd "$R" && git init -q && git commit -qm f',
  'R=$(mktemp -d; echo .) && cd "$R" && git init -q && git commit -qm f',
]

test('an unarmed commit into a repository the command creates is advised, not refused', () => {
  const parent = freshParent()
  for (let k = 0; k < FRESH_REPOSITORY_ROWS('', '').length; k++) {
    // One session per row: an advisory is said once per tree, so a second row on the
    // same tree would be silent and could not show that it names ADR-086.
    const unarmed = armedSession(`fresh-advised-${k}-`, { armed: false })
    const command = FRESH_REPOSITORY_ROWS(parent, slashed(unarmed.dir))[k]
    const text = unarmed.tell(command)
    assert.notEqual(decisionIn(text), 'deny', command)
    assert.match(text, /ADR-086/, command)
    // The fresh advice carries its own key, so a later mention on this tree is still told.
    if (k === 0) assert.match(unarmed.tell('grep -n commit a.md'), /only mentions commit or push/, 'a later mention keeps its own advisory')
  }
})

test('an unarmed chain the text cannot place in a fresh repository is still refused', () => {
  const unarmed = armedSession('fresh-twin-', { armed: false })
  const rows = FRESH_REPOSITORY_TWINS(freshParent(), slashed(unarmed.dir))
  for (const command of rows) assert.equal(unarmed.decide(command), 'deny', command)
  // CLEAN twin: on a checked tree the same rows are not refused.
  unarmed.check()
  for (const command of rows) assert.notEqual(unarmed.decide(command), 'deny', command)
})

// Executed, because the grammar is a claim about where bash puts the commit
// (CLAUDE.md §16). The environment carries no git or session variable, so no row can
// reach the repository running this suite (CLAUDE.md §9). Bash is found as
// tests/shell-words.test.mjs finds it.
const FRESH_BASH = ['/bin/bash'].find(shell => process.platform !== 'win32' && existsSync(shell))
test('the fresh-repository rows commit where the classifier says they do', { skip: FRESH_BASH ? false : 'no /bin/bash on this platform' }, () => {
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:GIT_|CLAUDE_)/.test(name) && name !== 'XDG_CONFIG_HOME')),
    ...IDENTITY, HOME: mkdtempSync(path.join(hookTmp, 'fresh-home-')),
  }
  const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, env })
  const repository = () => {
    const dir = mkdtempSync(path.join(hookTmp, 'fresh-session-'))
    assert.equal(git(dir, 'init', '-q').status, 0)
    writeFileSync(path.join(dir, 'a.md'), 'a\n')
    assert.equal(git(dir, 'add', '-A').status, 0)
    assert.equal(git(dir, 'commit', '-q', '-m', 'base').status, 0)
    return dir
  }
  const head = dir => git(dir, 'rev-parse', 'HEAD').stdout.trim()
  const bash = (dir, command) => spawnSync(FRESH_BASH, ['-c', command], { cwd: dir, encoding: 'utf8', timeout: 30_000, env })
  for (let k = 0; k < FRESH_REPOSITORY_ROWS('', '').length; k++) {
    const session = repository()
    const parent = freshParent()
    const command = FRESH_REPOSITORY_ROWS(parent, slashed(session))[k]
    assert.equal(freshRepositoryCommit(command), true, command)
    const before = head(session)
    const run = bash(session, command)
    assert.equal(run.status, 0, `${command}\n${run.stderr}`)
    assert.equal(head(session), before, `the session repository moved: ${command}`)
    const where = k === 2 ? session : parent
    const made = readdirSync(where).filter(name => name.startsWith('fresh.'))
    assert.equal(made.length, 1, command)
    assert.match(head(path.join(where, made[0])), /^[0-9a-f]{40,64}$/, `no commit in the directory mktemp made: ${command}`)
  }
  // The measured fail-open, replayed: where mktemp fails, `;` carries on, `cd "$R"`
  // stays here, and the commit lands in the session repository.
  const session = repository()
  writeFileSync(path.join(session, 'a.md'), 'changed\n')
  const replay = `R=$(mktemp -d ${slashed(path.join(hookTmp, 'fresh-missing'))}/x.XXXX); cd "$R" && git init -q && git add -A && git commit -qm f`
  assert.equal(freshRepositoryCommit(replay), false)
  const before = head(session)
  bash(session, replay)
  assert.notEqual(head(session), before, 'the replay row did not commit into the session repository')
})

// ── Codex re-review of a14a751, 2026-10-06: F is freshRepositoryCommit, the unarmed
// exemption; H is leavesHookInPlace, the armed one. Each review input is a row, and
// each test carries the control twin that must still be accepted. Nothing here is run.
const FRESH_CONTROL = 'R=$(mktemp -d /dev/null/x.XXXX) && cd "$R" && git init -q && git commit --allow-empty -m f'

test('an unarmed fresh substitution is one foreground mktemp and nothing after it', () => {
  for (const command of [
    'R=$(mktemp -d /dev/null/x.XXXX &) && cd "$R" && git init -q && git commit --allow-empty -m f',
    'R=$(mktemp -d /dev/null/x.XXXX | cat) && cd "$R" && git init -q && git commit --allow-empty -m f',
    'R=$( (mktemp -d /dev/null/x.XXXX) ) && cd "$R" && git init -q && git commit --allow-empty -m f',
  ]) {
    assert.equal(freshRepositoryCommit(command, {}), false, command)
    assert.equal(leavesHookInPlace(command), false, command)
  }
  assert.equal(freshRepositoryCommit(FRESH_CONTROL, {}), true)
  assert.equal(leavesHookInPlace(FRESH_CONTROL), true)
})

test('an unarmed fresh commit is refused when arithmetic can reassign its directory', () => {
  for (const command of [
    'R=$(mktemp -d) && ((R=1)) && cd "$R" && git init -q && git commit --allow-empty -m f',
    'R=$(mktemp -d /dev/null/x.XXXX; ((1))) && cd "$R" && git init -q && git commit --allow-empty -m f',
    'R=$(mktemp -d) && cd "$R" && git init -q && git commit --allow-empty -m "$[1]"',
    // `let` as a command after the cd; quoted as a message it is data (ADR-090 T1's data test).
    'R=$(mktemp -d) && cd "$R" && let R=1 && git init -q && git commit --allow-empty -m f',
  ]) assert.equal(freshRepositoryCommit(command, {}), false, command)
  assert.equal(freshRepositoryCommit('R=$(mktemp -d) && cd "$R" && git init -q && git commit --allow-empty -m f', {}), true)
})

// Bash evaluates a variable's VALUE as an arithmetic expression, so `((X))` with X
// inherited as `GIT_CONFIG_COUNT=0` assigns the hook's variable while the text names
// none (measured: `x=y=5; ((x)); echo "$y"` prints 5 under bash 3.2).
test('an armed session refuses arithmetic, which can assign a variable named only in a value', () => {
  for (const command of [
    'R=$(mktemp -d) && ((R=1)) && cd "$R" && git init -q && git commit --allow-empty -m f',
    '((X)) && git commit -m f',
    'let X && git commit -m f',
  ]) assert.equal(leavesHookInPlace(command), false, command)
  // Control: the same characters inside quotes are a message, not arithmetic.
  for (const command of ['git commit -m f', "git commit -m 'x ((1)) let y'"]) assert.equal(leavesHookInPlace(command), true, command)
})

test('an inherited git or bash environment keeps an unarmed fresh commit refused', () => {
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'BASH_FUNC_cd%%', 'BASH_FUNC_git%%', 'BASH_ENV', 'ENV', 'git_dir']) {
    assert.equal(freshRepositoryCommit(FRESH_CONTROL, { [name]: '' }), false, name)
  }
  // Control: an environment that redirects nothing leaves the proof standing.
  assert.equal(freshRepositoryCommit(FRESH_CONTROL, { GIT_AUTHOR_NAME: 'q', ENVIRONMENT: 'x', LANG: 'C' }), true)
})

test('a single terminal newline ends an unarmed fresh commit like the end of the text', () => {
  assert.equal(freshRepositoryCommit(`${FRESH_CONTROL}\n`, {}), true)
  // Twin: a newline then another command runs it even where mktemp failed.
  for (const command of [`${FRESH_CONTROL}\ngit commit --allow-empty -m g`, `${FRESH_CONTROL}\n\n`]) {
    assert.equal(freshRepositoryCommit(command, {}), false, JSON.stringify(command))
  }
})

// ── ADR-090 T1: a quoted commit message is data to the two downgrades ──
//
// A value of commit's `-m`, `--message`, `-F` or `--file`, written as one quoted
// literal, is one word to the shell and to git, so the raw rules of ADR-066's armed
// grammar and ADR-086's fresh repository no longer read it as code. Every value that
// can run code keeps the refusal beside it (CLAUDE.md §16). Each row is the value
// and the message git records for it.
const QUOTED_MESSAGES = [
  ['-m "push the fix"', 'push the fix'],
  ['-m "a;b"', 'a;b'],
  ['-m "use ((x)) here"', 'use ((x)) here'],
  ['-m "let it be"', 'let it be'],
  ['--message="push the fix"', 'push the fix'],
  ["-m 'push; then {braces} and !bang'", 'push; then {braces} and !bang'],
  ['-m "fix PATH handling"', 'fix PATH handling'],
  ['-m "a|b"', 'a|b'],
  ["-m '$(git push)'", '$(git push)'],
  // ADR-086's arithmetic row, quoted: bash never evaluates a message.
  ['-m "let R=1"', 'let R=1'],
]
const ARMED_QUOTED_MESSAGES = ['-m "fix PATH handling"', '-m "see .git/config"', "-m 'costs $5'", '-m "env cleanup"']
const CODE_MESSAGES = [
  '-m "$(git push)"', '-m "`git push`"', '--message="$(git push)"', '-m "$GIT_DIR"', '-m x; git push',
  '-F <(git push)', '-m "${x:-$(git push)}"', '-m x && git push', '-m "push" && git push', '-- -m "push"',
  '-Fm "push"', '-m push',
]
const ARMED_CODE_MESSAGES = session => [
  `-m "$(git -C ${session} commit -qm y)"`, '-nm "push"', '-m {x,--no-verify}',
  '-m x; GIT_CONFIG_COUNT=0 git commit -qm y', "-m '.git/hooks' && cp x '.git/hooks'",
]
const quotedFresh = (parent, value) => `R=$(mktemp -d ${parent}/fresh.XXXX) && cd "$R" && git init -q && git commit -q --allow-empty ${value}`
const quotedArmed = value => `cd ${slashed(hookTmp)}/scratch && git commit ${value}`

test('a quoted commit message is data to the armed and fresh-repository downgrades', () => {
  const parent = freshParent()
  const unarmed = armedSession('quoted-unarmed-', { armed: false })
  for (const [value] of QUOTED_MESSAGES) {
    const command = quotedFresh(parent, value)
    assert.equal(freshRepositoryCommit(command, {}), true, command)
    assert.notEqual(unarmed.decide(command), 'deny', command)
  }
  const armed = armedSession('quoted-armed-')
  for (const value of ARMED_QUOTED_MESSAGES) {
    const command = quotedArmed(value)
    assert.equal(leavesHookInPlace(command), true, command)
    assert.notEqual(armed.decide(command), 'deny', command)
  }
})

test('a message value that can run code keeps the refusal', () => {
  const parent = freshParent()
  const unarmed = armedSession('code-unarmed-', { armed: false })
  const fresh = CODE_MESSAGES.map(value => quotedFresh(parent, value))
  for (const command of fresh) {
    assert.equal(freshRepositoryCommit(command, {}), false, command)
    assert.equal(unarmed.decide(command), 'deny', command)
  }
  const armed = armedSession('code-armed-')
  const rows = ARMED_CODE_MESSAGES(slashed(armed.dir)).map(quotedArmed)
  for (const command of rows) {
    assert.equal(leavesHookInPlace(command), false, command)
    assert.equal(armed.decide(command), 'deny', command)
  }
  // CLEAN twin: on a checked tree the same rows are not refused.
  unarmed.check()
  armed.check()
  for (const command of fresh) assert.notEqual(unarmed.decide(command), 'deny', command)
  for (const command of rows) assert.notEqual(armed.decide(command), 'deny', command)
})

// Executed, as ADR-086 T2's rows are: each data row commits in the directory mktemp
// made, with the message as written, and never in the session repository.
test('the masked fresh-repository rows commit where the classifier says they do', { skip: FRESH_BASH ? false : 'no /bin/bash on this platform' }, () => {
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:GIT_|CLAUDE_)/.test(name) && name !== 'XDG_CONFIG_HOME')),
    ...IDENTITY, HOME: mkdtempSync(path.join(hookTmp, 'masked-home-')),
  }
  const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, env })
  const head = dir => git(dir, 'rev-parse', 'HEAD').stdout.trim()
  for (const [value, message] of QUOTED_MESSAGES) {
    const session = mkdtempSync(path.join(hookTmp, 'masked-session-'))
    assert.equal(git(session, 'init', '-q').status, 0)
    assert.equal(git(session, 'commit', '-q', '--allow-empty', '-m', 'base').status, 0)
    const parent = freshParent()
    const command = quotedFresh(parent, value)
    assert.equal(freshRepositoryCommit(command, {}), true, command)
    const before = head(session)
    const run = spawnSync(FRESH_BASH, ['-c', command], { cwd: session, encoding: 'utf8', timeout: 30_000, env })
    assert.equal(run.status, 0, `${command}\n${run.stderr}`)
    assert.equal(head(session), before, `the session repository moved: ${command}`)
    const made = readdirSync(parent).filter(name => name.startsWith('fresh.'))
    assert.equal(made.length, 1, command)
    assert.equal(git(path.join(parent, made[0]), 'log', '-1', '--format=%B').stdout.replace(/\n+$/, ''), message, command)
  }
})

// ── ADR-090 T2: what the shell runs from a heredoc body, `"$x$(…)"` or a `function`
// body is a publish; the same words as data stay a mention. Measured under bash and
// zsh in tests/shell-words.test.mjs.
const RUN_FROM_A_BODY = [
  'cat <<EOF\n$(git push)\nEOF', 'cat <<EOF\n`git push`\nEOF', 'cat <<-EOF\n\t$(git push)\n\tEOF',
  'echo "$x$(git push)"', 'echo "${x}$(git push)"', 'function g { git push; }\ng', 'function g () { git push; }; g',
]
const HELD_AS_DATA = [
  "cat <<'EOF'\n$(git push)\nEOF", 'cat <<"EOF"\n$(git push)\nEOF', 'cat <<EOF\n\\$(git push)\nEOF',
  'echo "$x"', "echo '$x$(git push)'", 'echo function g { git push; }',
]

test('a publish run from a heredoc body, a quoted substitution or a function body is refused', () => {
  const unarmed = armedSession('body-unarmed-', { armed: false })
  for (const command of RUN_FROM_A_BODY) assert.equal(unarmed.decide(command), 'deny', command)
  // CLEAN twin: on a checked tree the same rows are not refused.
  unarmed.check()
  for (const command of RUN_FROM_A_BODY) assert.notEqual(unarmed.decide(command), 'deny', command)
})

test('a heredoc body, a parameter and a function name that only hold a publish stay data', () => {
  HELD_AS_DATA.forEach((command, k) => {
    // One session per row: a mention is said once per tree.
    const unarmed = armedSession(`body-data-${k}-`, { armed: false })
    const text = unarmed.tell(command)
    assert.equal(publishCommandIn(command), null, command)
    assert.notEqual(decisionIn(text), 'deny', command)
    // `echo "$x"` names no publish at all, so it has nothing to be told.
    if (mentionsCommitOrPush(command)) assert.match(text, /only mentions commit or push/, command)
  })
})

// ── ADR-090 T3: a wrapper named by its absolute path is that wrapper ──
const PATH_WRAPPED = [
  '/usr/bin/env git push', '/usr/bin/env -- git push', '/usr/bin/env -S "git push"', '/bin/env git push',
  '/usr/bin/sudo git push', '/usr/bin/time git push', '/usr/bin/nice git push', '/usr/bin/nohup git push',
]
// Run under bash with a stand-in git, where the wrapper exists; `sudo` is lexed only (ADR-067 Decision 2).
const PATH_WRAPPED_RUN = ['/usr/bin/env git push', '/usr/bin/env -- git push', '/bin/env git push', '/usr/bin/time git push', '/usr/bin/nice git push']

test('a wrapper named by its absolute path runs the publish it wraps', () => {
  for (const command of PATH_WRAPPED) assert.equal(publishCommandIn(command), 'git push', command)
  // A Windows drive path is absolute too (CLAUDE.md §7); lexed only.
  assert.equal(publishCommandIn('C:/tools/env.exe git push'), 'git push')
  const unarmed = armedSession('wrapped-unarmed-', { armed: false })
  for (const command of PATH_WRAPPED) assert.equal(unarmed.decide(command), 'deny', command)
  // CLEAN twin: on a checked tree the same rows are not refused.
  unarmed.check()
  for (const command of PATH_WRAPPED) assert.notEqual(unarmed.decide(command), 'deny', command)
  if (!FRESH_BASH) return
  const scratch = mkdtempSync(path.join(hookTmp, 'wrapped-run-'))
  const record = path.join(scratch, 'argv.log')
  writeFileSync(path.join(scratch, 'git'), '#!/bin/sh\nprintf \'%s \' git "$@" >> "$QH_ARGV"\nprintf \'\\n\' >> "$QH_ARGV"\n', { mode: 0o755 })
  for (const command of PATH_WRAPPED_RUN) {
    // A wrapper this host does not have is a row it cannot measure, not a pass.
    if (!existsSync(command.split(' ')[0])) continue
    writeFileSync(record, '')
    const run = spawnSync(FRESH_BASH, ['-c', command], { cwd: scratch, encoding: 'utf8', timeout: 10_000, env: { PATH: scratch, QH_ARGV: record, HOME: scratch } })
    assert.equal(run.status, 0, `${command}\n${run.stderr}`)
    assert.equal(readFileSync(record, 'utf8'), 'git push \n', command)
  }
})

test('a relative path or a look-alike wrapper name stays a mention', () => {
  const unarmed = armedSession('wrapped-mention-', { armed: false })
  for (const command of ['./env git push', '/usr/bin/envsubst git push', 'echo /usr/bin/env git push']) {
    assert.equal(publishCommandIn(command), null, command)
    assert.notEqual(unarmed.decide(command), 'deny', command)
  }
})
