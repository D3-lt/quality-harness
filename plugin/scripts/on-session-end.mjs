// PreCompact and SessionEnd (ADR-060 T6): the note about the tree as it is now, and the row the next session reads. Neither
// event has a decision to make, so neither blocks. Moved out of lifecycle.mjs unchanged (BACKLOG section 375, stage D).
import { nearestExistingDirectory, readEvents } from './event-log.mjs'
import path from 'node:path'
import { gitRepositoryRoot, locationKey } from './tree-facts.mjs'
import { observedFacts } from './completion-rules.mjs'
import { replaceSessionNote, sessionStateNote } from './session-notes.mjs'
import { artifactRule } from './artifact-pass.mjs'
import { appendFileSync, mkdirSync } from 'node:fs'

export async function onSessionEnd(input, recorded) {
  const event = input.hook_event_name
  // ADR-060 T6: both observed above, before anything here writes, so the note
  // is about the tree as it is NOW — not about the last turn end, which in a
  // long turn may never have happened. Neither event has a decision to make,
  // so neither blocks.
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const repositoryRoot = directory ? gitRepositoryRoot(directory) : null
  const root = repositoryRoot ?? directory ?? cwd
  const facts = observedFacts(readEvents(cwd, input.session_id), repositoryRoot, recorded?.observation)
  if (event === 'PreCompact') {
    if (typeof input.session_id === 'string' && input.session_id) {
      replaceSessionNote(input.session_id, { ...sessionStateNote(facts, cwd, root, repositoryRoot !== null), compaction: recorded?.compactionId ?? null })
    }
    await artifactRule(input, recorded)
    return
  }
  // SessionEnd runs under the host's own short budget, so nothing here spawns
  // a gate: the row is the log's reading and the location key, no more.
  const home = process.env.CLAUDE_PLUGIN_DATA
  if (!home) {
    process.stderr.write('[quality-harness] CLAUDE_PLUGIN_DATA is not set, so this session\'s end was NOT recorded.\n')
    return
  }
  const note = sessionStateNote(facts, cwd, root, false, new Date(), { tasks: false })
  // Why the row says `unverified` when it is not about unchecked edits: the next
  // session reads this field INSTEAD of the sentence about edits.
  const unknown = facts.observed === false ? (facts.why ?? 'the working tree could not be observed')
    : facts.late === true && note.files.length === 0 && !note.other && facts.pending !== true
      ? 'it was watched only from partway through, and nothing changed after that; what happened before is not known'
      : null
  try {
    mkdirSync(home, { recursive: true })
    appendFileSync(path.join(home, 'sessions.jsonl'), `${JSON.stringify({
      at: note.at,
      session: typeof input.session_id === 'string' ? input.session_id : null,
      cwd,
      location: locationKey(root),
      reason: input.reason ?? null,
      status: note.status,
      unknown,
      files: note.files,
      other: note.other,
      lastVerdict: facts.lastCheck?.verdict ?? null,
    })}\n`, 'utf8')
  } catch (failure) {
    process.stderr.write(`[quality-harness] could not append to the sessions ledger (${failure.code ?? failure.message}).\n`)
  }
}
