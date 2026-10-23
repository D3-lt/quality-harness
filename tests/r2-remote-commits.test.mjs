// The owner, 2026-10-23: a fast-forward over landed commits made 277 of them newly reachable, and R2 named every one as
// unchecked with HEAD's tree freshly checked. A commit a remote ref already reaches is published, and CI's to answer for, so
// R2 leaves it out; a local commit no remote has is still named (ADR-060's step 14 holds).
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fixtureRepo, git, runHook, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'the fixtures are the goldens\' and are recorded on POSIX (BACKLOG section 375)'
const DECLARED = { '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n' }
const said = run => `${run.stdout?.hookSpecificOutput?.additionalContext ?? ''}\n${run.stdout?.systemMessage ?? ''}`

test('a commit a remote ref reaches is not named by R2, and a local one is', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'remote-commits', DECLARED)
  const hook = payload => runHook(box, repo, 'remote-commits-1', payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  const commit = (file, subject) => {
    writeFileSync(path.join(repo, file), `export const x = '${subject}'\n`)
    git(repo, box, 'add', '-A')
    git(repo, box, 'commit', '-q', '-m', subject, '--no-gpg-sign')
  }
  // Landed elsewhere and fetched: the remote ref reaches both.
  commit('src/b.js', 'landed one')
  commit('src/c.js', 'landed two')
  git(repo, box, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  const landed = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.doesNotMatch(landed, /newly reachable commit/, landed)
  // DIRTY twin: a commit no remote has is named. HEAD's own tree is R1's to speak for, so the one named is below it.
  commit('src/d.js', 'local only')
  commit('src/e.js', 'local tip')
  const local = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.match(local, /newly reachable commit/, local)
  assert.match(local, /local only/, local)
  assert.doesNotMatch(local, /landed (one|two)/, local)
})
