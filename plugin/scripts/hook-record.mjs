// Translate one hook into its named event, observe, and append both (ADR-060 T1). Moved out of lifecycle.mjs unchanged
// (BACKLOG section 375, stage B4). It decides nothing: what a rule says about the event is the rule's.
import { importCheckRecords, lateBaselineAllowed, recordFileWritten } from './check-ledger.mjs'
import { SHELL_TOOLS, containsCommitOrPush, mentionsCommitOrPush } from './publish-verdict.mjs'
import { appendEvent, readEvents, stateDir } from './event-log.mjs'
import { randomUUID } from 'node:crypto'
import { observe } from './tree-facts.mjs'
import { statSync } from 'node:fs'
import path from 'node:path'

// ---- ADR-060: hooks are named events, each observed and appended to a log.
// The state directory and the log itself are in `event-log.mjs`, imported above.

export const MUTATION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export function hasBackgroundWork(input) {
  return (Array.isArray(input.background_tasks) && input.background_tasks.length > 0)
    || (Array.isArray(input.session_crons) && input.session_crons.length > 0)
}

const OBSERVED_HOOK_EVENTS = {
  TaskCompleted: 'task.completed',
  PreCompact: 'context.compacting',
  SessionEnd: 'session.ending',
  SubagentStart: 'subagent.started',
  SubagentStop: 'subagent.ended',
}

// Translate one hook into its named event, observe, and append both. Reads no
// command text. A payload without a session or a directory records nothing,
// because the log is per session.
export function recordHookEvent(input) {
  const session = input?.session_id
  if (typeof session !== 'string' || !session || typeof input.cwd !== 'string') return null
  const hook = input.hook_event_name
  if (hook === 'PostToolUse') return MUTATION_TOOLS.has(input.tool_name) ? recordFileWritten(input) : null
  let name = null
  const extra = {}
  // A Bash command that INVOKES commit or push is a publish request and is logged
  // as one. A MENTION — the word in a grep, an echo, a file name — is prepared the
  // same way (the check source imported, a late baseline adopted) so its warning
  // reads the evidence a refusal would, and is appended as nothing: it is not a
  // publish request, and every reader of `publish.requested` would otherwise count
  // it (Codex review of f67cede). A read-only role's PreToolUse never reaches
  // this function: the reviewer guard decides it alone (handleHook).
  if (hook === 'PreToolUse') {
    if (!SHELL_TOOLS.has(input.tool_name)) return null
    const command = input.tool_input?.command
    if (containsCommitOrPush(command)) name = 'publish.requested'
    else if (mentionsCommitOrPush(command)) name = 'publish.mentioned'
    else return null
  }
  if (hook === 'SessionStart') {
    // ⚠ ONLY AN EMPTY LOG GETS A BASELINE HERE. A `compact` or `resume` SessionStart
    // arrives in the middle of a session: with no `session.started` on record it
    // was taken as the beginning, and a session whose committed, unchecked write
    // had just been refused a late baseline was handed a fresh, un-`late` one —
    // `neutral`, "nothing has changed", no check ever run (different-lineage
    // review, 2026-09-19). A log with history and no baseline is the late case,
    // and the late rules below decide it.
    // ...nor does a log that could not be read whole: its real baseline may be the line that was lost.
    const existing = readEvents(input.cwd, session)
    if (existing.length > 0 || existing.complete !== true) return null
    name = 'session.started'
  } else if (hook === 'Stop') {
    if (input.stop_hook_active === true || hasBackgroundWork(input)) return null
    name = 'turn.ended'
  } else if (OBSERVED_HOOK_EVENTS[hook]) {
    name = OBSERVED_HOOK_EVENTS[hook]
    // What ties a state note to THIS compaction (see SessionStart's compact arm).
    if (hook === 'PreCompact') extra.compactionId = randomUUID()
    if (hook === 'SubagentStart' || hook === 'SubagentStop') {
      extra.agentId = typeof input.agent_id === 'string' ? input.agent_id : null
      extra.agentType = typeof input.agent_type === 'string' ? input.agent_type : null
    }
  }
  if (!name) return null
  const entry = { event: name, ...extra, observation: observe(input.cwd) }
  // ⚠ A SESSION THIS PLUGIN BEGAN WATCHING LATE HAS NO `session.started`, and every
  // "is this tree unchecked" test then read a missing baseline as "everything is
  // unchecked" — so a Stop on a PRISTINE tree said "work no `qh-check` has passed
  // on. Git reports no changed path", and asked a session that had edited nothing to
  // boot its project's test suite. That is every adopter's first turn after
  // installing or UPGRADING mid-session (peer-reproduced 2026-09-19). The first
  // observation becomes the baseline, marked `late`.
  // ONLY FROM A LOG READ WHOLE: a torn log that lost its real `session.started`
  // must not be handed a new one — a baseline re-found after the work measures that
  // work against itself. There the completeness guard answers instead.
  // AND ONLY OVER A CLEAN TREE. The accusation was false only there. On a dirty
  // tree "these paths changed and nothing has checked them" is simply true, and
  // adopting that tree as the baseline would forgive it: the first version of this
  // did, and a `git commit` over an edited file lost its publish warning.
  let lateBaseline = false
  if (name !== 'session.started') {
    const log = readEvents(input.cwd, session)
    // AND NOT OVER A WRITE ALREADY ON RECORD. PostToolUse can log a `file.written`
    // before any observing hook runs; commit it, and the first Stop sees a clean
    // tree. Adopting that as the baseline would call a session with a known,
    // unchecked write `neutral`. Only a write GIT CAN SEE counts: one outside the
    // repository says nothing about this tree and is not counted (ADR-094 T4), and
    // refusing the baseline over it accused a repository nothing had touched.
    // A `session.started` that could not look is no baseline either (sessionBaseline).
    // Nor after any earlier boundary already saw the tree (lateBaselineAllowed).
    if (lateBaselineAllowed(log, input.cwd, entry.observation)) {
      lateBaseline = appendEvent(input.cwd, session, { event: 'session.started', late: true, observation: entry.observation }) !== false
    }
  }
  // ⚠ A TORN CHECK SOURCE IS RECORDED, not returned and dropped. The readers all
  // consult the session log, so that is where the fact has to live — and it is
  // durable, because the file does not repair itself: the next boundary would
  // otherwise re-discover it and nothing downstream would ever hear. Deduped on
  // the source's size so a growing-but-still-torn file says it once per change
  // rather than once per boundary.
  const source = importCheckRecords(input.cwd, session)
  if (source.complete === false) {
    let size = null
    try { size = statSync(path.join(stateDir(input.cwd), 'checks.jsonl')).size } catch { size = null }
    const key = `checks.jsonl:${size}`
    const log = readEvents(input.cwd, session)
    if (!log.some(event => event.event === 'check.source-unreadable' && event.key === key)) {
      appendEvent(input.cwd, session, { event: 'check.source-unreadable', key })
    }
  }
  if (name === 'publish.mentioned') return lateBaseline ? { ...entry, lateBaseline: true } : entry
  if (!appendEvent(input.cwd, session, entry)) {
    return { ...entry, observation: { ok: false, reason: 'the event log could not be appended' } }
  }
  return lateBaseline ? { ...entry, lateBaseline: true } : entry
}
