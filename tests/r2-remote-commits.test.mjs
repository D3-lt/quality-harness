// The owner, 2026-10-23: a fast-forward over landed commits made 277 of them newly reachable, and R2 named every one as
// unchecked with HEAD's tree freshly checked. A commit the branch's upstream already reaches is published, and CI's to answer
// for, so R2 leaves it out; a commit the upstream does not hold is still named (ADR-060's step 14 holds), and so is one only a
// fork's remote or another ref holds (the Codex review of v3.8.53..42a903a8: those carry no CI evidence).
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fixtureRepo, git, runHook, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'the fixtures are the goldens\' and are recorded on POSIX (BACKLOG section 375)'
const DECLARED = { '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n' }
const said = run => `${run.stdout?.hookSpecificOutput?.additionalContext ?? ''}\n${run.stdout?.systemMessage ?? ''}`

test('a commit the upstream reaches is not named by R2, and a local one or a fork\'s is', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'remote-commits', DECLARED)
  const hook = payload => runHook(box, repo, 'remote-commits-1', payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  const commit = (file, subject) => {
    writeFileSync(path.join(repo, file), `export const x = '${subject}'\n`)
    git(repo, box, 'add', '-A')
    git(repo, box, 'commit', '-q', '-m', subject, '--no-gpg-sign')
  }
  const branch = git(repo, box, 'symbolic-ref', '--short', 'HEAD')
  git(repo, box, 'remote', 'add', 'origin', 'https://example.invalid/remote-commits.git')
  git(repo, box, 'config', `branch.${branch}.remote`, 'origin')
  git(repo, box, 'config', `branch.${branch}.merge`, `refs/heads/${branch}`)
  // Landed elsewhere and fetched: the upstream reaches both.
  commit('src/b.js', 'landed one')
  commit('src/c.js', 'landed two')
  git(repo, box, 'update-ref', `refs/remotes/origin/${branch}`, 'HEAD')
  const landed = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.doesNotMatch(landed, /newly reachable commit/, landed)
  // DIRTY twins: a commit the upstream does not hold is named, even when a fork's remote ref holds it. HEAD's own tree is R1's
  // to speak for, so the ones named are below it.
  commit('src/d.js', 'local only')
  commit('src/f.js', 'a fork holds this')
  git(repo, box, 'update-ref', 'refs/remotes/fork/topic', 'HEAD')
  commit('src/e.js', 'local tip')
  const local = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.match(local, /newly reachable commit/, local)
  assert.match(local, /local only/, local)
  assert.match(local, /a fork holds this/, local)
  assert.doesNotMatch(local, /landed (one|two)/, local)
})

// The verification review of the fix round: a branch with no upstream named the landed commits again. Without an upstream the
// default branch origin names (refs/remotes/origin/HEAD) stands for it; with neither, nothing is left out.
test('without an upstream, what origin\'s default branch holds is not named, and with neither everything is', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'default-branch', DECLARED)
  const hook = payload => runHook(box, repo, 'default-branch-1', payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  const commit = (file, subject) => {
    writeFileSync(path.join(repo, file), `export const x = '${subject}'\n`)
    git(repo, box, 'add', '-A')
    git(repo, box, 'commit', '-q', '-m', subject, '--no-gpg-sign')
  }
  commit('src/b.js', 'landed one')
  commit('src/c.js', 'landed two')
  // DIRTY first: no upstream and no default branch, so the landed commits are named.
  const unknown = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.match(unknown, /landed one/, unknown)
  git(repo, box, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(repo, box, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  commit('src/d.js', 'local only')
  commit('src/e.js', 'local tip')
  const local = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.match(local, /local only/, local)
  assert.doesNotMatch(local, /landed (one|two)/, local)
})

// The second verification review: an origin/HEAD that is not symbolic, one aliased to a local branch, and an upstream that is a
// local branch (remote ".") each held commits nothing published, and hid them. Only a remote-tracking branch leaves anything out.
test('an origin/HEAD that is not a remote-tracking branch, or a local upstream, hides nothing', { skip }, t => {
  // One repository and session per shape: R2 names a commit once per context, so a shared session would hide the second.
  const shapes = {
    'a direct, non-symbolic origin/HEAD': (repo, box) => git(repo, box, 'update-ref', 'refs/remotes/origin/HEAD', 'HEAD'),
    'an origin/HEAD aliased to a local branch': (repo, box) => {
      git(repo, box, 'branch', 'topic', 'HEAD')
      git(repo, box, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/heads/topic')
    },
    'an upstream that is a local branch': (repo, box) => {
      git(repo, box, 'branch', 'topic', 'HEAD')
      const branch = git(repo, box, 'symbolic-ref', '--short', 'HEAD')
      git(repo, box, 'config', `branch.${branch}.remote`, '.')
      git(repo, box, 'config', `branch.${branch}.merge`, 'refs/heads/topic')
    },
  }
  for (const [n, [shape, point]] of Object.entries(shapes).entries()) {
    const box = sandbox(t)
    const repo = fixtureRepo(box, `local-refs-${n}`, DECLARED)
    const hook = payload => runHook(box, repo, `local-refs-${n}`, payload)
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    const commit = (file, subject) => {
      writeFileSync(path.join(repo, file), `export const x = '${subject}'\n`)
      git(repo, box, 'add', '-A')
      git(repo, box, 'commit', '-q', '-m', subject, '--no-gpg-sign')
    }
    commit('src/b.js', 'unpublished one')
    point(repo, box)
    commit('src/c.js', 'unpublished tip')
    const named = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
    assert.match(named, /unpublished one/, `${shape} hides nothing: ${named}`)
  }
})
