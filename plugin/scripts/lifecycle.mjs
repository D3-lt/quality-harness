#!/usr/bin/env node

import { isMainModule } from './main-module.mjs'
import { appendEvent } from './event-log.mjs'
import { emitJson, peekOutput, pendingActions, queueAction, takeOutput } from './hook-queue.mjs'
import { projectCheckCommand } from './check-command.mjs'
import { importPassVerdicts, runArtifactPass } from './artifact-pass.mjs'
import { readOnlyRole, reviewChangedState } from './publish-verdict.mjs'
import { advisoryHeadline } from './ready-lines.mjs'
import { firstMentionThisSession } from './session-notes.mjs'
import { recordHookEvent } from './hook-record.mjs'
import { onSessionStart } from './on-session-start.mjs'
import { onSessionEnd } from './on-session-end.mjs'
import { onSubagentStart } from './on-subagent-start.mjs'
import { onPreToolUse } from './on-pre-tool-use.mjs'
import { onTurnEnd } from './on-turn-end.mjs'

// ADR-060's event log is shared with run-shell-hook.mjs's per-edit gate, so it
// lives in a leaf module both can import (T6).
export { readEvents, sessionLogFile, stateDir } from './event-log.mjs'

// ONE JSON object per run is what Claude Code parses from a hook's stdout, so
// output is held in hook-queue.mjs and written once by main() — which is also where the
// hook's own wall-clock is known. A hook that is slow used to be a pause with
// no name (the §15 SessionStart hook hung new sessions for seconds and said
// nothing, 2026-09-05); above SLOW_HOOK_MS the run names itself on both
// channels, as one more line, never instead of the finding.
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
  let out = takeOutput()
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
  emitJson(output)
  for (const action of delivered) {
    if (action.rule) {
      appendEvent(input.cwd, input.session_id, {
        event: 'action.emitted', rule: action.rule, key: action.key ?? null, ...(action.detail ? { detail: action.detail } : {}),
      })
    }
  }
  return { output, delivered }
}

// One file per family of events: what a rule says about an event is the rule's, and this file only decides which rule an event
// belongs to (BACKLOG section 375, stage D). An event not in the table has no rule.
const HANDLERS = new Map([
  ['SessionStart', onSessionStart],
  ['PreCompact', onSessionEnd],
  ['SessionEnd', onSessionEnd],
  ['SubagentStart', onSubagentStart],
  ['PreToolUse', onPreToolUse],
  ['Stop', onTurnEnd],
  ['SubagentStop', onTurnEnd],
  ['TaskCompleted', onTurnEnd],
])

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

  const handler = HANDLERS.get(event)
  if (handler) await handler(input, recorded)
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
    deliver(pendingActions.splice(0), input ?? {}, { legacy: peekOutput() })
    flushOutput(startedAt, input)
  }
}

if (isMainModule(import.meta.url)) {
  await main()
}
