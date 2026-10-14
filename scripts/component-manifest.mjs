// component-manifest.mjs — every shipped component declares who consumes it (phase 1 of the redesign, owner's yes 2026-10-14).
//
// The redesign's diagnostic (2026-10-11) found components whose only consumer was "the agent reads text", and that the
// agent mostly did not: a per-prompt brief unread in 14 of 15 adopter sessions, ready lines ignored in 10 of 15. Deleting
// them was phase 1; this keeps them from growing back. `scripts/components.json` declares, for every file under `plugin/`
// and every entry of `plugin/hooks/hooks.json`, what consumes it, and `checkComponents` holds the declaration to the tree.
//
// What it can and cannot check, said plainly:
// - A file entry is a glob, first match wins; every tracked file must be won by one, and an entry that wins none is stale.
//   `reached` is checked: another shipped file names the file. `command`, `host`, `on-demand` and `opt-in` are declared,
//   not checked. `tombstone` (a file kept for a reason, with no consumer) needs its reason.
// - A hook consumer names the file that consumes it and a token in that file (a reader's event name, a refusal's
//   `permissionDecision`); the check is that the file is tracked and holds the token. It binds the channel, not that
//   every event the hook writes is read. `agent-context` and `user-message` name where the text is written: whether a
//   reader acts on it cannot be checked here, which is why a hook whose consumers are only those two needs a reason.
//
// The reason is an allow-list entry, beside the component it excuses. This repository's dead-code rule says dead code is
// "deleted or wired, never allow-listed" (CLAUDE.md §13); that is about code nothing reaches. An advisory here is reached
// by the host on every event: the reason says why its text is worth that cost (CLAUDE.md §19), and it is read in review.
import path from 'node:path'
import { globToRegExp } from './rules-inject.mjs'

export const FILE_KINDS = new Set(['host', 'command', 'on-demand', 'opt-in', 'reached', 'tombstone'])
export const HOOK_KINDS = new Set(['refusal', 'tool', 'agent-context', 'user-message'])
const ADVISORY = new Set(['agent-context', 'user-message'])

/**
 * One hooks.json entry as the manifest names it: the event, the matcher (or `*`), and the command with every argument as
 * written, the plugin-root placeholder included. The whole command, because a hook whose interpreter became `echo` or
 * whose script moved runs something else under the same file name (Codex review of v3.8.25..fcd58d21).
 */
export function hookKey(event, matcher, hook) {
  return [event, matcher ?? '*', [hook.command, ...(hook.args ?? [])].join(' ')].join(' · ')
}

/** Every hook entry of a parsed hooks.json, by its manifest key. */
export function hookKeys(hooksJson) {
  const keys = []
  for (const [event, groups] of Object.entries(hooksJson?.hooks ?? {})) {
    for (const group of groups) for (const hook of group.hooks ?? []) keys.push(hookKey(event, group.matcher, hook))
  }
  return keys
}

// Whether another shipped file names this one: its file name, or for a Python module an import of its stem.
function named(file, tracked, read) {
  const base = path.posix.basename(file)
  const stem = base.replace(/\.[^.]+$/, '')
  const pythonImport = new RegExp(`\\b(?:import|from)\\b[^\\n]*\\b${stem.replace(/[-\\^$.*+?()[\]{}|]/g, '\\$&')}\\b`)
  return tracked.some(other => other !== file && other.startsWith('plugin/') && (() => {
    const text = read(other)
    return typeof text === 'string' && (text.includes(base) || (file.endsWith('.py') && pythonImport.test(text)))
  })())
}

/**
 * The findings, one sentence each; none means the manifest and the tree agree. Pure over its inputs: `tracked` is the
 * repository's tracked paths (POSIX), `read` returns a tracked file's text (or null), `hooks` is the parsed hooks.json.
 */
export function checkComponents({ tracked, read, hooks, manifest }) {
  const findings = []
  const entries = (manifest?.files ?? []).map(entry => ({ ...entry, pattern: globToRegExp(entry.path), won: [] }))
  for (const file of tracked.filter(name => name.startsWith('plugin/'))) {
    const entry = entries.find(candidate => candidate.pattern.test(file))
    if (entry) entry.won.push(file)
    else findings.push(`${file} ships and no entry in the manifest declares what consumes it`)
  }
  for (const entry of entries) {
    if (!FILE_KINDS.has(entry.consumer)) findings.push(`${entry.path}: "${entry.consumer}" is not a file consumer (${[...FILE_KINDS].join(', ')})`)
    if (entry.won.length === 0) findings.push(`${entry.path} declares no shipped file: every file it matches is gone or declared above it`)
    if (entry.consumer === 'tombstone' && !entry.reason) findings.push(`${entry.path} is kept with no consumer and gives no reason`)
    if (entry.consumer === 'reached') {
      for (const file of entry.won) if (!named(file, tracked, read)) findings.push(`${file} is declared reached, and no other shipped file names it`)
    }
  }
  const declared = manifest?.hooks ?? {}
  const keys = hookKeys(hooks)
  for (const key of keys) if (!declared[key]) findings.push(`hook ${key} runs and the manifest does not declare what consumes it`)
  for (const [key, hook] of Object.entries(declared)) {
    if (!keys.includes(key)) { findings.push(`hook ${key} is declared and hooks.json runs no such entry`); continue }
    const consumers = hook.consumers ?? []
    if (consumers.length === 0) findings.push(`hook ${key} declares no consumer`)
    for (const consumer of consumers) {
      if (!HOOK_KINDS.has(consumer.kind)) { findings.push(`hook ${key}: "${consumer.kind}" is not a hook consumer (${[...HOOK_KINDS].join(', ')})`); continue }
      const text = tracked.includes(consumer.by) ? read(consumer.by) : null
      if (typeof text !== 'string') findings.push(`hook ${key}: ${consumer.by} is not a tracked file`)
      else if (!text.includes(consumer.token)) findings.push(`hook ${key}: ${consumer.by} does not hold ${JSON.stringify(consumer.token)}, so it is not shown to consume this hook`)
    }
    if (consumers.length > 0 && consumers.every(consumer => ADVISORY.has(consumer.kind)) && !hook.reason) {
      findings.push(`hook ${key} only puts text in front of a reader, and gives no reason for that cost`)
    }
  }
  return findings
}
