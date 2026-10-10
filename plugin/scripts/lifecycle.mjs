#!/usr/bin/env node

import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'

// The standalone install's scope and PATH arithmetic live in one module, shared
// with sync-standalone.mjs. Two copies of that list drifted apart once already.

// ADR-060's event log is shared with run-shell-hook.mjs's per-edit gate, so it
// lives in a leaf module both can import (T6).
import { appendEvent, nearestExistingDirectory, readEvents, sessionLogFile, stateDir } from './event-log.mjs'
export { readEvents, sessionLogFile, stateDir } from './event-log.mjs'
import { listedUnderUninterestingDirectory } from './uninteresting.mjs'
import { pendingActions, queueAction } from './hook-queue.mjs'
import { gitRepositoryRoot, locationKey } from './tree-facts.mjs'
import { projectCheckCommand } from './check-command.mjs'
import { logIncomplete } from './check-ledger.mjs'
import { artifactRule, importPassVerdicts, runArtifactPass } from './artifact-pass.mjs'
import { completionRules, observedFacts, subagentContract } from './completion-rules.mjs'
import { SHELL_TOOLS, awaitingArming, mentionsCommitOrPush, offerPublishHook, publishUnchecked, readOnlyRole, readOnlyVerdict, reviewChangedState } from './publish-verdict.mjs'
import { sweepStaleSessionLogs } from './housekeeping.mjs'
import { advisoryHeadline } from './ready-lines.mjs'
import { bumpSessionGeneration, claimCompaction, firstMentionHere, firstMentionThisSession, previousSessionNotice, readSessionNote, replaceSessionNote, sessionStateNote } from './session-notes.mjs'
import { decisionContextFor, sessionOrientation } from './session-orientation.mjs'
import { MUTATION_TOOLS, hasBackgroundWork, recordHookEvent } from './hook-record.mjs'

// ⚠ THE VALIDATION PATTERN TABLE WENT WITH THE CLASSIFIERS (ADR-060 T7), and two
// lessons it held are worth keeping even though its code is not — both bought in
// the 2.100.0 release, days before this branch landed:
//
//   - A verb must be a WHOLE TOKEN. The table ended each verb with `\b`, and a
//     hyphen and a colon are both word boundaries, so `test-data`, `test:seed`
//     and `test-fixtures` all counted as the `test` script. Wrong for npm since
//     the line was first written.
//   - `composer` must not be in such a table at all. Admitting it forced a family
//     into the read-only classifier that turned `composer update` — which
//     rewrites composer.lock — from `unrecognised` into `neither`, a fail-open
//     introduced while fixing a fail-closed.
//
// Neither has a consumer here any more: nothing on this branch decides what
// happened by reading a command's text. They survive in docs/BACKLOG.md and in
// this record's Consequences, which is where a lesson outlives its code.



// Why a validation did not clear, not merely that it did not.
//
// Taken from rust-adr-corpus-eval-harness (a Rust harness, same author), whose
// AcceptanceVerdict is Passed / Failed{exit_code} / Timeout / SpawnError, and
// whose evidence record keeps `infra_failure_class` apart from an acceptance
// miss so "the provider was down" never reads as "the work is wrong".
//
// This harness had one bit. A check that FAILED, a check that TIMED OUT, and a
// check that never started because Docker was not running all produced the same
// sentence: "Nothing has verified the work since your last change." Only the
// first is a finding about the change. The same mistake was fixed one layer
// down in 2.5.0 — the harness failing to RUN is not a verdict about the edit —
// and never applied to the project's own check.




// ADR-035. What the final message CLAIMS.
//
// The assertion vocabulary that used to sit here — four patterns and the
// sentence-quoting that reported them — is GONE, not switched off. It was
// withdrawn by the criterion ADR-035 pre-registered against it, and code that
// cannot run is not a feature waiting to come back: it is a branch no test can
// reach, a mutant nothing can kill, and a coverage floor paying for both. Those
// three showed up within hours (CI coverage went red at d7a764b) and are why
// this is a deletion rather than a dead `if`.
//
// The patterns themselves, the measurement that killed them, the research this
// rested on and what a restored arm owes are all in ADR-035 and BACKLOG §124 —
// which is where a future attempt reads them from, not from a commented-out
// array nobody re-measured.

// ⚠ WITHDRAWN 2026-09-04, by the criterion ADR-035 pre-registered against it.
//
// The record said the `asserted` arm survives only at precision ≥ 0.90. It was
// measured on the first real eval run of `a-claim-nothing-can-back` — three
// answers classified `asserted`, and ALL THREE were exemplary honest disclosures:
//
//   "duration parsing — fix is in for the `90s` case, tests not yet run on my side"
//   "Haven't run the suite yet. That last clause is there because I couldn't verify it"
//   "I can't verify anything here — the working directory is empty … no shell"
//
// Precision 0/3. The cause is nameable: `interimResponse`'s negation vocabulary
// has no "haven't run", "can't verify", "not yet run", "no shell", so the
// negatives never took precedence and a nearby "green" or "fix is in" tripped an
// assertion pattern. A detector that flags *"I can't verify anything here"* as a
// false success is worse than none — it is precisely the gate people learn to
// ignore, which this project treats as worse than no gate at all.
//
// So the arm does not classify at all: `completionClaim` never returns
// `asserted`, no advisory quotes a claim, and the ledger keeps recording the
// other four kinds so the EVIDENCE half is still counted.
//
// ⚠ THE CONSTANT (ASSERTION_ARM_WITHDRAWN, in claim-status.mjs) IS A LABEL, NOT A
// SWITCH. Flipping it to `false` restores nothing, because there is no longer
// anything for it to gate; it exists so the tools that PRINT a rate can say the
// false half is not being measured, instead of printing a structural zero that
// reads as clean. Restoring the arm means a corrected negation vocabulary and a
// fresh measurement on answers not used to build it — not this one re-read more
// kindly. BACKLOG §124, §126.





// ONE JSON object per run is what Claude Code parses from a hook's stdout, so
// output is held here and written once by main() — which is also where the
// hook's own wall-clock is known. A hook that is slow used to be a pause with
// no name (the §15 SessionStart hook hung new sessions for seconds and said
// nothing, 2026-09-05); above SLOW_HOOK_MS the run names itself on both
// channels, as one more line, never instead of the finding.
let pendingOutput = null
function emitJson(value) {
  pendingOutput = value
}

const SLOW_HOOK_MS = 5_000
export function slowHookThresholdMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_SLOW_HOOK_MS)
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : SLOW_HOOK_MS
}

export function slowHookNote(eventName, elapsedMs) {
  return `quality-harness: the ${eventName ?? 'hook'} hook took ${(elapsedMs / 1000).toFixed(1)}s — the pause has this name`
}

export function flushOutput(startedAt, input, env = process.env, now = Date.now()) {
  const elapsed = now - startedAt
  let out = pendingOutput
  pendingOutput = null
  if (elapsed >= slowHookThresholdMs(env)) {
    const note = slowHookNote(input?.hook_event_name, elapsed)
    process.stderr.write(`${note}\n`)
    out = { ...(out ?? {}), systemMessage: out?.systemMessage ? `${out.systemMessage}\n${note}` : note }
  }
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`)
}

// The fixture exclusion lives in its own module since 2026-09-23, so the per-edit
// gate (run-shell-hook.mjs, which this file imports) can share it without a cycle.
export { listedUnderUninterestingDirectory } from './uninteresting.mjs'









// What a session would otherwise learn by hitting a wall. Additive only: this
// hook can never block, and says nothing it cannot establish from the project
// itself — an empty orientation is correct for a project with no conventions.
// --- Decisions that reach the code -----------------------------------------
//
// Everything above answers "is this work proved?". This answers a question the
// harness had never asked: "what has already been decided about the file you are
// about to change?" — which is the difference between a tool that reports on you
// and a tool that hands you something.
//
// The idea and its vocabulary are lifted from adrkit (mbeacom/adrkit, Apache-2.0),
// which added an `affects:` field so tooling can resolve which decisions govern a
// change, and deliberately surfaces the graveyard of superseded and withdrawn
// records so an agent stops re-proposing an approach somebody already killed.
// Two things are ours: resolution needs no new header, because every task file in
// this corpus already carries a machine-readable `## Affected Files` table that
// adr-lint requires; and nothing here is a finding, so nothing here can fail.
//
// Resolution is a pure function of (corpus, paths) — same corpus, same paths,
// same answer — and runs entirely in this process. A subprocess per record at
// the edit boundary would rebuild the artifact-gate budget problem somewhere
// much hotter.



















// ---- ADR-060: hooks are named events, each observed and appended to a log.
// The state directory and the log itself are in `event-log.mjs`, imported above.


// ONE output per hook. A denial is the permission decision. Other findings from
// the same hook stay in the reason, so a refusal does not hide them. A legacy
// deny is passed through. Otherwise every advisory is joined. `action.emitted`
// is appended only for what was delivered.
export function deliver(actions, input, { legacy = null } = {}) {
  const event = input?.hook_event_name
  const denials = actions.filter(action => action.deny)
  let delivered
  let output
  if (denials.length) {
    const denial = denials[0]
    const rest = actions.filter(action => action !== denial && typeof action.text === 'string' && action.text)
    const text = [denial.text, ...rest.map(action => action.text)].join('\n\n')
    delivered = [denial, ...rest]
    output = {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: text },
      systemMessage: `quality-harness refused the command: ${advisoryHeadline(denial.text)}`,
    }
    process.stderr.write(`${text}\n`)
  } else if (legacy?.hookSpecificOutput?.permissionDecision === 'deny') {
    delivered = []
    output = legacy
  } else {
    delivered = actions.filter(action => typeof action.text === 'string' && action.text)
    output = legacy ? JSON.parse(JSON.stringify(legacy)) : null
    if (delivered.length) {
      const texts = delivered.map(action => action.text)
      for (const text of texts) process.stderr.write(`${text}\n`)
      const joined = texts.join('\n\n')
      output ??= {}
      if (event === 'PreToolUse') {
        const specific = output.hookSpecificOutput ?? { hookEventName: 'PreToolUse' }
        specific.additionalContext = specific.additionalContext ? `${specific.additionalContext}\n\n${joined}` : joined
        output.hookSpecificOutput = specific
        const headline = `quality-harness advised the agent: ${advisoryHeadline(texts[0])} (full text in the transcript)`
        output.systemMessage = output.systemMessage ? `${output.systemMessage}\n${headline}` : headline
      } else {
        output.systemMessage = output.systemMessage ? `${output.systemMessage}\n\n${joined}` : joined
      }
    }
  }
  pendingOutput = output
  for (const action of delivered) {
    if (action.rule) {
      appendEvent(input.cwd, input.session_id, {
        event: 'action.emitted', rule: action.rule, key: action.key ?? null, ...(action.detail ? { detail: action.detail } : {}),
      })
    }
  }
  return { output, delivered }
}



const ARMING_NOTE = "quality-harness: git's own refusal of an unchecked commit or push has not run yet in this "
  + 'session: it takes effect from the next prompt, and until then the text refusal applies (ADR-068).'







// Rule A `artifact-invalid` (ADR-060): the artifact gates over everything this
// session changed — committed since its first HEAD, uncommitted, and written by
// a tool — minus every path a gate has already answered for THIS content. It has
// no check gate: a malformed record is malformed whether or not the project
// named a test command. Since ADR-080 it runs behind the boundary, in one pass
// per session that writes its own ledger; see `startArtifactPass`.




export async function handleHook(input) {
  const event = input.hook_event_name
  // ADR-060 T1: every hook first appends its named, observed event. The log is
  // additive here; a failure in it must never change an existing advisory.
  // EXCEPT a read-only role's PreToolUse, which the reviewer guard decides ALONE:
  // it is neither observed (seven git spawns before an unconditional denial) nor
  // logged (the log is the parent session's) nor warned about — a form the guard
  // cannot prove is the git-hook follow-up's, not the P rule's. Three rounds of
  // review each found a way the "reviewer still hears the warning" arm wrote to
  // or read the parent's ledger wrongly (Codex, f14e4cd and b149b50).
  let recorded = null
  const guardAlone = event === 'PreToolUse' && readOnlyRole(input.agent_type) !== null
  // ADR-084: a Skill call is counted and nothing else — before the generic event record, the pass
  // import and every advisory, so it prints nothing and costs one Node start. Only this plugin's own
  // skills: another plugin's skill names are not this plugin's to keep. A read-only role's Skill call
  // is not the parent session's to log.
  if (event === 'PreToolUse' && input.tool_name === 'Skill') {
    const skill = input.tool_input?.skill
    if (!guardAlone && typeof skill === 'string' && skill.startsWith('quality-harness:')
      && !appendEvent(input.cwd ?? process.cwd(), input.session_id, { event: 'skill.invoked', skill })) {
      process.stderr.write('[quality-harness] the skill use was not recorded in the session log.\n')
    }
    return
  }
  if (!guardAlone) {
    try { recorded = recordHookEvent(input) } catch (failure) {
      process.stderr.write(`[quality-harness] the event log was not written (${failure?.message ?? failure}).\n`)
    }
  }
  // ADR-080: what the session's artifact pass has said since the last hook is
  // imported and said by whichever hook comes next, whether or not the pass has
  // ended. Never by a read-only reviewer's PreToolUse, which touches nothing of
  // the parent's (ADR-061's sixth amendment).
  if (!guardAlone && typeof input.session_id === 'string' && input.session_id) {
    try { importPassVerdicts(input.cwd ?? process.cwd(), input.session_id) } catch (failure) {
      process.stderr.write(`[quality-harness] the artifact pass's ledger was not read (${failure?.message ?? failure}).\n`)
    }
  }
  // What a late baseline leaves genuinely unknown, said ONCE and as a limit on what
  // could be seen — never as an accusation about work nobody observed (ADR-005).
  if (recorded?.lateBaseline && projectCheckCommand(input.cwd)) {
    queueAction({
      rule: 'R4', key: `late-baseline:${input.session_id}`,
      text: 'quality-harness: began watching this session at this turn, not at its start — it was installed, enabled '
        + 'or updated while the session was running. Anything changed or committed before now was not observed, so '
        + 'nothing here speaks for it (ADR-005). From here on the working tree is measured against what it is now.',
    })
  }
  if (event === 'SubagentStop') {
    try { reviewChangedState(input, recorded) } catch (failure) {
      process.stderr.write(`[quality-harness] the reviewer state check did not run (${failure?.message ?? failure}).\n`)
    }
  }

  if (event === 'SessionStart') {
    // After compaction the session has none of the context the once-per-session
    // markers gated; a new generation makes every first mention first again.
    if (input.source === 'compact' || input.source === 'clear') bumpSessionGeneration(input.session_id)
    // The state directory grows by a full copy of checks.jsonl per session; a week-old
    // log with no unseen write in it is dead weight (never throws, once a day).
    try { sweepStaleSessionLogs(input.cwd ?? process.cwd(), input.session_id) } catch { /* disk only */ }
    // ADR-066 T2: offer git the publish hook for this session's Bash. A failure
    // here is said and costs the session nothing but the offer.
    try { offerPublishHook({ cwd: input.cwd, session: input.session_id }) } catch (failure) {
      process.stderr.write(`[quality-harness] the publish hook was not offered (${failure?.message ?? failure}).\n`)
    }
    const sections = []
    const orientation = sessionOrientation(input.cwd, { once: input.source === 'startup' || input.source === 'resume' || input.source === undefined })
    if (orientation) sections.push(orientation)
    // ADR-068 T2: after a compaction or resume, the Bash tool picks up the exports only
    // from the next user prompt (measured 2026-09-26). While no hook run follows the
    // latest offer, say which refusal is in force; it changes no verdict.
    if ((input.source === 'compact' || input.source === 'resume') && awaitingArming(readEvents(input.cwd, input.session_id))
      && (input.source === 'compact' || firstMentionHere(path.resolve(input.cwd ?? process.cwd()), ARMING_NOTE))) {
      sections.push(ARMING_NOTE)
    }
    if (input.source === 'compact') {
      // The compaction summary is the model's; this is the gates'. Hand back what
      // PreCompact measured, so the next context knows what is unverified and
      // what task was in flight without re-deriving either.
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
    return
  }

  if (event === 'PreCompact' || event === 'SessionEnd') {
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
    return
  }

  if (event === 'SubagentStart') {
    emitJson({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: subagentContract(input),
      },
    })
    return
  }

  if (event === 'PreToolUse') {
    // A read-only role is read-only by contract, and the contract is checked HERE
    // — in the plugin-level hook, which does run inside a subagent (BACKLOG
    // §135). The same guard declared in the agents' own frontmatter was measured
    // inert on a real box: a qh-correctness-reviewer ran `sed -i` on a tracked
    // file and no hook was called. `agent_type` is what the payload carries
    // inside a subagent, so the role is read from it; the verdict is the guard's.
    if (readOnlyRole(input.agent_type) && (SHELL_TOOLS.has(input.tool_name) || MUTATION_TOOLS.has(input.tool_name))) {
      const reason = readOnlyVerdict(input)
      if (reason) {
        emitJson({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `quality-harness reviewer guard (${readOnlyRole(input.agent_type)}): ${reason}`,
          },
        })
        process.stderr.write(`quality-harness reviewer guard: ${reason}\n`)
        return
      }
    }
    // What has already been decided about this file. Not a finding — there is
    // nothing to fix and nothing to answer for; it is the one thing the corpus
    // knows that the code does not say, handed over at the moment it applies.
    if (MUTATION_TOOLS.has(input.tool_name)) {
      const context = decisionContextFor(input)
      if (context) {
        emitJson({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: context,
          },
        })
      }
      return
    }
    // No branch guard. This harness is about the quality of a project's records
    // and the evidence behind them, not about how anyone uses git — the agent
    // already knows git, and a repository that wants a branch policy states it
    // in CLAUDE.md, where a human wrote it. Told plainly on 2026-08-26 after the
    // guard fired on a command whose FIRST act was `git switch -c task/…`, the
    // very escape it was demanding.
    if (!SHELL_TOOLS.has(input.tool_name)) return
    if (!mentionsCommitOrPush(input.tool_input?.command)) return
    // `recorded` is the publish request, or the prepared-but-unlogged mention
    // (recordHookEvent). The artifact gate is a publish-time check with a
    // publish-time budget: a mention publishes nothing and gets none of it — a
    // peer measured 12 KB of adr-lint findings on a grep before this (2026-09-23).
    publishUnchecked(input, recorded)
    if (recorded?.event === 'publish.requested') await artifactRule(input, recorded)
    return
  }

  if (!['SubagentStop', 'TaskCompleted', 'Stop'].includes(event)) return
  if (input.stop_hook_active === true || (event === 'Stop' && hasBackgroundWork(input))) return
  // A read-only role's end is R3's to report; the completion rules are about the
  // session's own work, and a reviewer authored none of it.
  if (event === 'SubagentStop' && readOnlyRole(input.agent_type)) return
  completionRules(input, recorded)
  await artifactRule(input, recorded)
}

async function readStdin() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv[0] === '--artifact-pass') {
    process.exitCode = await runArtifactPass(argv[1])
    return
  }
  if (argv[0] === '--first-mention') {
    process.exitCode = firstMentionThisSession(argv[1], argv[2]) ? 0 : 1
    return
  }
  const startedAt = Date.now()
  let input
  let raw = ''
  try {
    // The parse failure used to `return` in silence at exit 0 — indistinguishable
    // from a hook with nothing to say. A peer on Windows fed this a payload with an
    // illegal escape and spent a round trip on "stdin is broken" (2026-09-23); one
    // stderr line names the real cause. A leading BOM is stripped too, since
    // PowerShell's `>` writes one. A hook that read nothing has observed nothing.
    raw = await readStdin()
    input = JSON.parse(raw.replace(/^﻿/, ''))
  } catch {
    // UTF-16 read as UTF-8 is JSON with a NUL after every ASCII character, so a payload holding NUL
    // bytes says the likely cause (BACKLOG §355, a Windows corpus-chaos run of v3.8.9).
    const utf16 = raw.includes('\u0000') ? ' It holds NUL bytes: saved as UTF-16?' : ''
    process.stderr.write(`[quality-harness] the hook payload on stdin was not JSON; nothing was read and nothing is said.${utf16}\n`)
    return
  }
  // Valid JSON that is not the object the host sends: `null` and a `cwd` that is not a
  // string crashed with a stack trace at exit 0, and `[1,2]` said nothing (a chaos
  // round of 626934a, php-react-app F7). Named the way unparsable input is.
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || (input.cwd !== undefined && typeof input.cwd !== 'string')) {
    process.stderr.write('[quality-harness] the hook payload was not an object with a string cwd; nothing was read and nothing is said.\n')
    return
  }
  try {
    await handleHook(input)
  } finally {
    // Every hook's output leaves through deliver(), so a rule's action and a
    // legacy emitJson output are composed, never one overwriting the other.
    deliver(pendingActions.splice(0), input ?? {}, { legacy: pendingOutput })
    flushOutput(startedAt, input)
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
