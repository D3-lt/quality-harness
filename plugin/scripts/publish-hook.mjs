#!/usr/bin/env node
// Record commits made by this session for branch-state suppression (ADR-128).
// Retired publish events return success without inspecting check evidence (ADR-130).
import { spawnSync } from 'node:child_process'
import { commonDirectory } from './publish-verdict.mjs'

import { appendEvent, readEvents } from './event-log.mjs'
import { isMainModule } from './main-module.mjs'



// The repository `cwd` belongs to — its common git directory, which a linked worktree
// shares with the main checkout — when it holds this session's log, else null. The
// answer is resolved against `cwd`, since some gits print the common directory
// relative to it.
function sessionOwnsRepository(cwd, session) {
  const repository = commonDirectory(cwd, cwd)
  if (repository === null) return null
  // A log that cannot be read whole is owned: judging costs a warning, while passing
  // unjudged would be the flattering answer (tests/evidence-flip.test.mjs READERS).
  const events = readEvents(repository, session)
  return events.length > 0 || events.complete === false ? repository : null
}


/** Decide one git hook event. Returns `{ code, message? }`; only `code: 1` refuses. */
export function runPublishHook({ event, cwd = process.cwd(), env = process.env }) {
  // Older sessions may still invoke the retired prepare-commit-msg/pre-push exports after an update.
  if (event !== 'post-commit') return { code: 0 }
  const session = env.CLAUDE_CODE_SESSION_ID
  // No session id: a person's own git, or a shell the harness does not own.
  if (typeof session !== 'string' || !session) return { code: 0 }
  // A repository with no log for this session is not this session's project —
  // the text classifier could not tell, and judged the session's repository
  // instead (a scratch-repository commit refused, 2026-09-26). A linked worktree
  // keeps its own state, so it holds no log either; it is the session's project
  // when the repository it belongs to holds one (ADR-068: it passed every commit).
  const owner = sessionOwnsRepository(cwd, session)
  if (owner === null && readEvents(cwd, session).length === 0) return { code: 0 }
  // ADR-128 T2: the commit this session made, by its sha, written once git has made it, so the branch-state brief can tell the
  // session's own commit from one that arrived. post-commit refuses nothing (the reviews of c0d3d412 and e7475968: a hook run
  // and a let-through attempt each credited someone else's commit).
  if (event === 'post-commit') {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', timeout: 10_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
    const sha = head.stdout?.trim() ?? ''
    if (!head.error && head.status === 0 && /^[0-9a-f]{40,64}$/.test(sha)) appendEvent(owner ?? cwd, session, { event: 'commit.made', sha })
    return { code: 0 }
  }
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
