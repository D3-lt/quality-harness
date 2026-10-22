#!/usr/bin/env node

import { isMainModule } from './main-module.mjs'
import path from 'node:path'
import { existsSync } from 'node:fs'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { appendEvent, nearestExistingDirectory } from './event-log.mjs'
import { gitRepositoryRoot, rememberStatus } from './tree-facts.mjs'
import { emitJson, peekOutput, pendingActions, queueAction, takeOutput } from './hook-queue.mjs'
import { projectCheckCommand } from './check-command.mjs'
import { channelOf, deliveredTo } from './check-ledger.mjs'
import { turnEndSetting } from './project-config.mjs'
import { importPassVerdicts, runArtifactPass } from './artifact-pass.mjs'
import { readOnlyRole, reviewChangedState } from './publish-verdict.mjs'
import { advisoryHeadline } from './ready-lines.mjs'
import { firstMentionThisSession, sessionGeneration } from './session-notes.mjs'
import { recordHookEvent } from './hook-record.mjs'
import { recordSaid, saidInContext } from './said-per-context.mjs'
import { onSessionStart } from './on-session-start.mjs'
import { onSessionEnd } from './on-session-end.mjs'
import { onSubagentStart } from './on-subagent-start.mjs'
import { onPreToolUse } from './on-pre-tool-use.mjs'
import { onTurnEnd } from './on-turn-end.mjs'

// What the project says a turn-end finding is for (ADR-096 T3), read from the repository the session is in; only Stop asks. A
// working directory that has been deleted is read from its nearest existing parent, as the turn-end rules read it.
function turnEndFor(input) {
  if (input?.hook_event_name !== 'Stop') return 'agent'
  const directory = nearestExistingDirectory(path.resolve(input.cwd ?? process.cwd()))
  if (!directory) return 'agent'
  return turnEndSetting(gitRepositoryRoot(directory) ?? directory)
}
// Whether this delivery reaches the main agent's context: a Stop that has not already continued its turn, in a project that has
// not kept turn-end findings user-only. A Stop that has continued once is user-only, so nothing continues the turn again (ADR-096).
function stopReachesAgent(input) {
  return input?.hook_event_name === 'Stop' && input.stop_hook_active !== true && turnEndFor(input) !== 'notify'
}
// Who a delivery reached (recorded on its row), and who a finding is checked against before it is said.
const reachedBy = input => input?.hook_event_name === 'Stop' ? (stopReachesAgent(input) ? 'both' : 'user') : deliveredTo(input?.hook_event_name)
const audienceOf = input => input?.hook_event_name === 'Stop' ? (stopReachesAgent(input) ? 'agent' : 'user') : channelOf(input?.hook_event_name)
const recipientOf = input => input?.agent_id ? 'subagent' : 'main'

// ADR-060's event log is shared with run-shell-hook.mjs's per-edit gate, so it
// lives in a leaf module both can import (T6).
export { readEvents, sessionLogFile } from './event-log.mjs'

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

// ADR-122: an item said into the agent's context carries its marker, and is not said again while the context's last request
// holds it, or since that request. A refusal is never asked about, and nor is a finding only the user is shown: a
// systemMessage never reaches the model (0 of 395, measured 2026-10-22 on Claude Code 2.1.307), so no request can hold it.
// With no request evidence the item is said, as it was before.
function unsaid(actions, input) {
  const toAgent = action => input?.hook_event_name === 'PreToolUse' || (stopReachesAgent(input) && action.audience !== 'user')
  return actions.flatMap(action => {
    if (!action.rule || !toAgent(action)) return [action]
    const { verdict, marker } = saidInContext(input, action.rule.toLowerCase(), action.text)
    return verdict === 'said' || verdict === 'pending' ? [] : [{ ...action, marker }]
  })
}
const marked = action => action.marker ? `${action.text}\n${action.marker}` : action.text

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
    delivered = unsaid(actions.filter(action => typeof action.text === 'string' && action.text), input)
    output = legacy ? JSON.parse(JSON.stringify(legacy)) : null
    if (delivered.length) {
      const texts = delivered.map(action => action.text)
      for (const text of texts) process.stderr.write(`${text}\n`)
      const joined = texts.join('\n\n')
      output ??= {}
      if (event === 'PreToolUse') {
        const forContext = delivered.map(marked).join('\n\n')
        const specific = output.hookSpecificOutput ?? { hookEventName: 'PreToolUse' }
        specific.additionalContext = specific.additionalContext ? `${specific.additionalContext}\n\n${forContext}` : forContext
        output.hookSpecificOutput = specific
        const headline = `quality-harness advised the agent: ${advisoryHeadline(texts[0])} (full text in the transcript)`
        output.systemMessage = output.systemMessage ? `${output.systemMessage}\n${headline}` : headline
      } else if (stopReachesAgent(input)) {
        // ADR-096: a turn-end finding is the main agent's to act on. additionalContext reaches it and continues its turn once
        // (the next Stop carries stop_hook_active, and onTurnEnd says nothing then); the user is shown the same text as before.
        // ADR-120 T6: a finding marked for the user alone (R1 and R2 on an inferred check) is shown, and does not continue the turn.
        const forAgent = delivered.filter(action => action.audience !== 'user').map(marked).join('\n\n')
        if (forAgent) {
          const specific = output.hookSpecificOutput ?? { hookEventName: 'Stop' }
          specific.additionalContext = specific.additionalContext ? `${specific.additionalContext}\n\n${forAgent}` : forAgent
          output.hookSpecificOutput = specific
        }
        output.systemMessage = output.systemMessage ? `${output.systemMessage}\n\n${joined}` : joined
      } else {
        output.systemMessage = output.systemMessage ? `${output.systemMessage}\n\n${joined}` : joined
      }
    }
  }
  emitJson(output)
  for (const action of delivered) if (action.marker) recordSaid(input, action.marker)
  for (const action of delivered) {
    if (action.rule) {
      appendEvent(input.cwd, input.session_id, {
        event: 'action.emitted', rule: action.rule, key: action.key ?? null, ...(action.detail ? { detail: action.detail } : {}),
        channel: action.audience === 'user' ? 'user' : reachedBy(input), recipient: recipientOf(input), generation: sessionGeneration(input.session_id),
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
  // the parent's (ADR-061's sixth amendment). A finding said where only the user
  // sees it is said again at the next hook that reaches the agent (ADR-096).
  if (!guardAlone && typeof input.session_id === 'string' && input.session_id) {
    try { importPassVerdicts(input.cwd ?? process.cwd(), input.session_id, audienceOf(input), recipientOf(input)) } catch (failure) {
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

// SessionEnd runs under one budget the host gives every SessionEnd hook together, 1.5 s by default, and a plugin's own
// `timeout` does not raise it (Claude Code's hooks reference). The tree observation this hook makes (ADR-060 T6) is git over
// the whole tree, which on a loaded machine took longer: the host cancelled the hook and no row was written (reproduced
// 2026-10-15 on Claude Code 2.1.300, a pty session exited with Ctrl+C and a slowed git; the owner's sessions.jsonl held no row
// for a day). So the hook hands its input to a detached copy of itself and returns, and the copy observes the tree and writes
// the row; a detached child outlived the host's exit in the same reproduction. With no data home the hook runs here, so the
// missing home is said where it can be read. `QUALITY_HARNESS_SESSION_END_RUNNER` is `inline`, or another runner to start.
function endsBehind(input) {
  const setting = process.env.QUALITY_HARNESS_SESSION_END_RUNNER
  if (setting === 'inline' || !process.env.CLAUDE_PLUGIN_DATA) return false
  const runner = setting || fileURLToPath(import.meta.url)
  // node returns a pid for a script that does not exist, and the copy then dies unheard (Codex review of 6b1879c7).
  if (!existsSync(runner)) {
    process.stderr.write(`[quality-harness] the SessionEnd runner ${path.basename(runner)} does not exist; the session's end is recorded here.\n`)
    return false
  }
  try {
    // untimed-spawn: detached on purpose — the host has exited; every git call the copy makes carries its own timeout
    const child = spawn(process.execPath, [runner, '--session-end'], {
      // The temp directory, not the session's: on Windows a live process's working directory cannot be deleted.
      cwd: os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, QUALITY_HARNESS_HOOK_INPUT: JSON.stringify({ ...input, cwd: input.cwd ?? process.cwd() }) },
    })
    child.on('error', () => {})
    if (!child.pid) return false
    child.unref()
    return true
  } catch {
    return false
  }
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
  // ADR-095 T5: one hook process is one event, and its rules ask for the working tree's status up to three times within a second.
  rememberStatus()
  const startedAt = Date.now()
  let input
  let raw = ''
  try {
    // The parse failure used to `return` in silence at exit 0 — indistinguishable
    // from a hook with nothing to say. A peer on Windows fed this a payload with an
    // illegal escape and spent a round trip on "stdin is broken" (2026-09-23); one
    // stderr line names the real cause. A leading BOM is stripped too, since
    // PowerShell's `>` writes one. A hook that read nothing has observed nothing.
    raw = argv[0] === '--session-end' ? String(process.env.QUALITY_HARNESS_HOOK_INPUT ?? '') : await readStdin()
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
  if (input.hook_event_name === 'SessionEnd' && argv[0] !== '--session-end' && endsBehind(input)) return
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
