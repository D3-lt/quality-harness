#!/usr/bin/env node
// Git's side of the publish refusal (ADR-066). SessionStart offers this to git as
// a config-based hook through `CLAUDE_ENV_FILE`, so it runs AT the event, in the
// repository being committed, whatever spelling, wrapper or script file launched
// git. Nothing is installed into any repository.
//
//   node publish-hook.mjs prepare-commit-msg <file> [<source> [<sha>]]
//   node publish-hook.mjs pre-push <remote> <url>
//
// `prepare-commit-msg`, not `pre-commit`: measured 2026-09-26 on git 2.55 and
// Apple Git 2.54, `git commit --no-verify` skips `pre-commit` and does not skip
// this one. The verdict is rule P's own (`publishVerdict`), so the two callers
// cannot disagree about what is checked.
//
// Exit 1 refuses the git event; everything else, including a failure of this
// script, exits 0 — a hook that could not look must not refuse (ADR-005).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { appendEvent, readEvents } from './event-log.mjs'
import { importCheckRecords, observe, publishVerdict } from './lifecycle.mjs'
import { isMainModule } from './main-module.mjs'

// What each event stands for, in the words rule P's refusal already uses.
const INVOKED = { 'prepare-commit-msg': 'git commit', 'pre-push': 'git push' }

// A merge, cherry-pick, revert or rebase in progress. Each also fires
// prepare-commit-msg, some with the source `git commit -m` uses, so git's own state
// is what keeps the refusal to `git commit` (ADR-066 Decision 2). The `merge`
// source adds nothing to it: a merge has MERGE_HEAD, and concluding a conflicted
// pick — the other `merge` source — has CHERRY_PICK_HEAD (catalogue, 2026-09-26).
const SEQUENCER = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']

export function sequencerInProgress(cwd) {
  const dir = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, encoding: 'utf8', timeout: 10_000 })
  if (dir.error || dir.status !== 0) return false
  const gitDir = dir.stdout.trim()
  return SEQUENCER.some(name => existsSync(path.join(gitDir, name)))
}

/** Decide one git hook event. Returns `{ code, message? }`; only `code: 1` refuses. */
export function runPublishHook({ event, cwd = process.cwd(), env = process.env }) {
  const invoked = INVOKED[event]
  if (!invoked) return { code: 0 }
  const session = env.CLAUDE_CODE_SESSION_ID
  // No session id: a person's own git, or a shell the harness does not own.
  if (typeof session !== 'string' || !session) return { code: 0 }
  // A repository with no log for this session is not this session's project —
  // the text classifier could not tell, and judged the session's repository
  // instead (a scratch-repository commit refused, 2026-09-26).
  if (readEvents(cwd, session).length === 0) return { code: 0 }
  // What makes a session ARMED (ADR-066 Decision 3): the hook itself, not the offer.
  appendEvent(cwd, session, { event: 'publish.hook-ran', hook: event })
  if (event === 'prepare-commit-msg' && sequencerInProgress(cwd)) return { code: 0 }
  // A `qh-check` that ran just before this, in the same script as the commit, is on
  // record only once imported. PreToolUse imports at its own boundary; git's hook
  // has no such boundary, and refused the tree that check had just passed (ADR-066
  // review, P2). One import per caller: a second one in the verdict hid the first.
  importCheckRecords(cwd, session)
  const verdict = publishVerdict({ cwd, session, observation: observe(cwd), invoked })
  if (!verdict?.deny) return { code: 0 }
  return { code: 1, message: `${verdict.text}\n(refused by git's ${event} hook — ADR-066)` }
}

if (isMainModule(import.meta.url)) {
  const [event] = process.argv.slice(2)
  let result
  try {
    result = runPublishHook({ event })
  } catch (error) {
    process.stderr.write(`quality-harness: the publish hook could not run (${error?.message ?? error}); nothing was refused\n`)
    process.exit(0)
  }
  if (result.message) process.stderr.write(`${result.message}\n`)
  process.exit(result.code)
}
