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
import test from 'node:test'
import { containsCommitOrPush, publishCommandIn } from '../plugin/scripts/lifecycle.mjs'

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
]

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
})

// What is NOT observed, said so it is a decision: a `git` reached through a
// variable, a command substitution or an escape is not seen. The honest refusal
// for those is a git hook (ADR-061 follow-up), not a longer regex.
test('dynamic invocations are unobserved by design, and this test pins that they are', () => {
  for (const command of ['$(which git) push', 'GIT=git; $GIT push', 'git p\\u0075sh']) {
    assert.equal(containsCommitOrPush(command), false, command)
  }
})
