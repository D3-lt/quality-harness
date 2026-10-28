// SessionStart: what a session is told when it begins, resumes or is compacted or cleared (ADR-060, ADR-068 T2): the
// standing orientation, git's arming note, the compaction note served once, and the last session that ended here. Moved out of
// lifecycle.mjs unchanged (BACKLOG section 375, stage D). It never blocks.
import { bumpSessionGeneration, claimCompaction, firstMentionHere, previousSessionNotice, readSessionNote } from './session-notes.mjs'
import { sweepStaleSessionLogs } from './housekeeping.mjs'
import { offerPluginRoot, offerPublishHook } from './publish-verdict.mjs'
import { sessionOrientation } from './session-orientation.mjs'
import { appendEvent, readEvents } from '../../../plugin/scripts/event-log.mjs'
import { logIncomplete } from './check-ledger.mjs'
import { emitJson } from './hook-queue.mjs'

import { saidInContext } from './said-per-context.mjs'

export function onSessionStart(input, recorded) {
  // After compaction the session has none of the context the once-per-session
  // markers gated; a new generation makes every first mention first again.
  if (input.source === 'compact' || input.source === 'clear') bumpSessionGeneration(input.session_id)
  // The state directory grows by a full copy of checks.jsonl per session; a week-old
  // log with no unseen write in it is dead weight (never throws, once a day).
  try { sweepStaleSessionLogs(input.cwd ?? process.cwd(), input.session_id) } catch { /* disk only */ }
  // ADR-120 T4: name this session's plugin copy to the shell's forwarders, whatever git's hook finds below.
  try { offerPluginRoot({ cwd: input.cwd, session: input.session_id }) } catch (failure) {
    process.stderr.write(`[quality-harness] the plugin root was not named (${failure?.message ?? failure}).\n`)
  }
  // ADR-066 T2: offer git the publish hook for this session's Bash. A failure
  // here is said and costs the session nothing but the offer.
  try { offerPublishHook({ cwd: input.cwd, session: input.session_id }) } catch (failure) {
    process.stderr.write(`[quality-harness] the publish hook was not offered (${failure?.message ?? failure}).\n`)
  }
  const sections = []
  // ADR-122 Decision 8: a standing paragraph is said once per context. Startup, clear and compact begin a context, which holds
  // none of them, so each is said there. A resume continues one: a paragraph its last request holds is not said again, one it
  // is shown not to hold is, and with no request evidence the three-day mark decides, as before. Startup keeps that mark fresh.
  const keepsMark = input.source === 'startup' || input.source === 'resume' || input.source === undefined
  const sayStanding = (text, place) => {
    const remembered = keepsMark ? !firstMentionHere(place, text) : false
    if (input.source !== 'resume') return true
    const { verdict } = saidInContext(input, 'standing', text)
    if (verdict === 'said' || verdict === 'pending') return false
    return verdict === 'unsaid' || !remembered
  }
  const orientation = sessionOrientation(input.cwd, { say: sayStanding, mark: true })
  if (orientation) sections.push(orientation)
  if (input.source === 'compact') {
    // The compaction summary is the model's; this is the gates'. Hand back what
    // PreCompact measured, so the next context knows what is unverified without
    // re-deriving it.
    const note = readSessionNote(input.session_id)
    // ⚠ A NOTE IS SERVED ONLY WHEN IT CAN BE TIED TO THIS COMPACTION. A replace that
    // fails twice leaves an earlier note behind. Ownership was first a comparison
    // of wall clocks (a clock stepping backwards refused a correct note), then a
    // COUNT of compactions — which a torn compacting line, a note with no count,
    // and two overlapping PreCompacts each defeated (third review). It is now the
    // id PreCompact put on its own event, and it has to be the LAST compacting
    // event in a log that was read whole. Anything else is unknown, not "older".
    // ⚠ AND IT IS SERVED ONCE. The last recorded compaction stays the last one until
    // another PreCompact runs — and when one does not (a disabled hook, a host
    // crash), the NEXT compact SessionStart matched the same id and handed back a
    // note about work long since moved on (fourth review). Serving is recorded in
    // the log, and a serve that cannot be recorded is not made.
    const events = readEvents(input.cwd, input.session_id)
    const owner = events.filter(entry => entry.event === 'context.compacting').at(-1)?.compactionId
    const tied = !logIncomplete(events) && typeof owner === 'string' && note?.compaction === owner
      && !events.some(entry => entry.event === 'note.served' && entry.compactionId === owner)
    const claim = tied ? claimCompaction(input.session_id, owner) : { claimed: false, reason: 'untied' }
    const served = tied && claim.claimed
      && appendEvent(input.cwd, input.session_id, { event: 'note.served', compactionId: owner }) !== false
    if (served && note?.text) sections.push(`What this session was doing before compaction (${note.at}): ${note.text}`)
    else if (tied && claim.reason !== 'claimed') sections.push('quality-harness: the state note for this compaction could not be claimed, so it is not served here.')
    else if (!tied && note) sections.push('quality-harness: the state note kept for this session could not be tied to this compaction, '
      + 'so what was unverified before it is unknown here (ADR-005).')
  } else if (input.source === 'startup' || input.source === undefined) {
    const previous = previousSessionNotice(input.cwd)
    if (previous) sections.push(previous)
  }
  if (sections.length) {
    emitJson({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: sections.join('\n\n'),
      },
    })
  }
}
