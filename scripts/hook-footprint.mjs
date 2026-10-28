#!/usr/bin/env node
// hook-footprint.mjs — how much of this plugin's hook text a recorded session carried, by event, channel and item (ADR-122 T1).
//
// CLAUDE.md §19: what the plugin costs is what an installed copy puts into someone else's session, so the measure is a
// session's transcript, not this repository's tests. It reads one transcript (JSONL), parses every line, and counts the hook
// outputs this plugin wrote. Nothing else is read, and nothing is written but stdout.
//
// ⚠ THE SHAPES ARE MEASURED, NOT ASSUMED: Claude Code 2.1.304 to 2.1.307, one long session on 2026-10-22 (ADR-122's Context).
// Hook output is an `attachment` of one of the types below; a `system` record of subtype `stop_hook_summary` repeats a Stop
// hook's context, which its own `hook_additional_context` attachment already carries, so it is not counted twice. Only
// `hook_success` and `hook_non_blocking_error` name the hook's command; the others are tied to it by `toolUseID` and
// `hookEvent`. A text that merely QUOTES hook output (a tool result, a prompt) is none of these shapes and is not counted:
// a parse over shapes, never a grep (CLAUDE.md §16).
//
// ⚠ ATTRIBUTION SAYS WHEN IT CANNOT TELL. A context attachment does not name its hook. When this plugin's hook was the only
// one on that call it is ours; when another plugin's hook ran on the same call too, it is `ambiguous` and counted apart,
// never guessed into either total.
//
// Usage:
//   node scripts/hook-footprint.mjs <transcript.jsonl> [--json]
//
// Exit codes:
//   0  counted (unreadable lines are counted and said, not fatal)
//   2  could not look (no transcript, or it could not be read)
import { readFileSync } from 'node:fs'
import { isMainModule } from '../plugin/scripts/main-module.mjs'

// The record shapes that carry hook output, and the channel each one is. `stdout` is a hook's plain-text stdout, which
// UserPromptSubmit and SessionStart add to the model's context; a JSON stdout is the envelope the attachments came from.
export const HOOK_SHAPES = {
  hook_success: 'stdout',
  hook_non_blocking_error: 'stderr',
  hook_additional_context: 'additionalContext',
  hook_system_message: 'systemMessage',
}

// This plugin's hook commands: the plugin root variable followed by a script plugin/hooks/hooks.json names, or a path into
// a quality-harness plugin directory. The variable alone is every plugin's (the Codex review of 979585de): another plugin's
// `${CLAUDE_PLUGIN_ROOT}/scripts/other.mjs` was read as ours. A hook another plugin ships under one of these names still
// would be; nothing in the record tells the two apart.
export const HOOK_SCRIPTS = ['lifecycle.mjs', 'branch-state.mjs', 'run-shell-hook.mjs']
const SCRIPT = [...new Set([...HOOK_SCRIPTS,
  ...[...readFileSync(new URL('../plugin/hooks/hooks.json', import.meta.url), 'utf8')
    .matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([\w.-]+)/g)].map(m => m[1])])]
  .map(name => name.replace(/[.]/g, '\\.')).join('|')
const OURS = new RegExp(`\\$\\{?CLAUDE_PLUGIN_ROOT\\}?[\\\\/]scripts[\\\\/](?:${SCRIPT})(?![\\w.-])|quality-harness[\\\\/](?:plugin[\\\\/])?scripts[\\\\/]|\\$\\{?CLAUDE_PLUGIN_ROOT\\}?[\\\\/]bin[\\\\/]qh-hook(?![\\w.-])|quality-harness[\\\\/](?:plugin[\\\\/])?bin[\\\\/]qh-hook(?![\\w.-])`)
const MARKER = /<qh:([A-Za-z0-9_.-]+)@[0-9a-f]{8}>/g

const texts = value => typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(texts)
    : value && typeof value === 'object' ? Object.values(value).flatMap(texts) : []

const isJsonObject = text => {
  const trimmed = String(text ?? '').trim()
  if (!trimmed.startsWith('{')) return false
  try { return typeof JSON.parse(trimmed) === 'object' } catch { return false }
}

const median = values => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}


// Exclusive audience totals precede marker expansion. A repeated delivery on a new
// call is paid twice; a JSON envelope and its canonical attachment are paid once.
// Routing: https://code.claude.com/docs/en/hooks#hook-output (2026-10-28).
const modelStdout = new Set(['SessionStart', 'UserPromptSubmit', 'UserPromptExpansion', 'PostModelSwitch'])
const knownEvents = new Set([...modelStdout, 'Setup', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'SubagentStart', 'SubagentStop', 'TaskCompleted', 'Stop',
  'StopFailure', 'TeammateIdle', 'ConfigChange', 'PreCompact', 'PostCompact', 'SessionEnd'])
const modelContext = new Set([...modelStdout, 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'SubagentStart', 'SubagentStop', 'Stop', 'PermissionRequest'])
const metric = () => ({ deliveries: 0, characters: 0, bytes: 0 })
const countText = (total, text) => {
  total.deliveries += 1
  total.characters += text.length
  total.bytes += Buffer.byteLength(text, 'utf8')
}
const contentText = value => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const parts = value.map(contentText)
    return parts.some(part => part === null) ? null : parts.join('\n')
  }
  return value?.type === 'text' && typeof value.text === 'string' ? value.text : null
}
const hookIdentity = a => {
  const command = [a.command, ...(Array.isArray(a.args) ? a.args : [])].filter(value => typeof value === 'string').join(' ')
  if (OURS.test(command) || /quality-harness[\\/](?:quality-harness[\\/])?(?:\d+\.\d+\.\d+[\\/])?(?:scripts[\\/]qh-hook\.sh|bin[\\/]qh-hook)(?:\s|$)/.test(command)) return 'ours'
  // A bare interpreter in a receipt carries no script identity.
  if (!command || /^(?:sh|bash|node|node\.exe|powershell|pwsh)(?:\.exe)?$/i.test(command.trim())) return 'unknown'
  return 'theirs'
}
const callKey = a => a.toolUseID == null || a.hookEvent == null ? null : String(a.toolUseID) + '\0' + a.hookEvent

export function exclusiveFootprint(records, unreadable = 0) {
  const totals = { observedModel: metric(), userOnly: metric(), diagnosticOnly: metric(), unknownAudience: metric() }
  const uncertain = { ambiguous: metric(), unattributed: metric(), unknownShapes: 0, cappedDeliveries: 0,
    unpairedSummaries: 0, missingCanonical: 0, unreadableLines: unreadable }
  const calls = new Map(), latest = new Map(), canonical = new Map(), stopCalls = new Set()
  for (const r of records) {
    const a = r?.type === 'attachment' ? r.attachment : null
    if (!a || !callKey(a)) continue
    if (typeof a.command === 'string') {
      const seen = calls.get(callKey(a)) ?? new Set()
      seen.add(hookIdentity(a)); calls.set(callKey(a), seen)
    }
  }
  const preceding = new Map()
  for (const r of records) {
    const a = r?.type === 'attachment' ? r.attachment : null
    if (!a || !callKey(a)) continue
    if (a.type === 'hook_success' || a.type === 'hook_non_blocking_error') preceding.set(a.hookEvent, callKey(a))
    if (a.type === 'hook_additional_context' || a.type === 'hook_system_message') {
      const key = a.toolUseID === a.hookEvent && !calls.has(callKey(a)) ? preceding.get(a.hookEvent) : callKey(a)
      const channels = canonical.get(key) ?? new Set()
      if (contentText(a.content) && (typeof a.command !== 'string' || hookIdentity(a) !== 'theirs')) channels.add(a.type)
      canonical.set(key, channels)
      if (a.type === 'hook_additional_context' && contentText(a.content) && String(a.hookEvent).split(':')[0] === 'Stop') stopCalls.add(String(a.toolUseID))
    }
  }
  for (const r of records) {
    if (r?.type === 'system' && r.subtype === 'stop_hook_summary') {
      if (!stopCalls.has(String(r.toolUseID))) uncertain.unpairedSummaries += 1
      continue
    }
    const a = r?.type === 'attachment' ? r.attachment : null
    if (!a) continue
    if (!Object.hasOwn(HOOK_SHAPES, a.type)) {
      if (typeof a.type === 'string' && a.type.startsWith('hook_') || typeof a.command === 'string' && hookIdentity(a) === 'ours') uncertain.unknownShapes += 1
      continue
    }
    const event = String(a.hookEvent ?? '?').split(':')[0]
    const receipt = a.type === 'hook_success' || a.type === 'hook_non_blocking_error'
    if (receipt && callKey(a)) latest.set(a.hookEvent, callKey(a))
    const key = a.toolUseID === a.hookEvent && !calls.has(callKey(a)) ? latest.get(a.hookEvent) : callKey(a)
    const identities = typeof a.command === 'string' ? new Set([hookIdentity(a)]) : calls.get(key)
    const text = receipt ? (a.type === 'hook_success' ? a.stdout : a.stderr) : contentText(a.content)
    if (text == null) { if (!receipt) uncertain.unknownShapes += 1; continue }
    if (typeof text !== 'string') { uncertain.unknownShapes += 1; continue }
    if (!text) continue
    if (identities?.size === 1 && identities.has('theirs')) continue
    if (!identities || identities.size === 1 && identities.has('unknown')) { countText(uncertain.unattributed, text); continue }
    if (identities.size !== 1) { countText(uncertain.ambiguous, text); continue }
    if (receipt && a.type === 'hook_success' && isJsonObject(text)) {
      const envelope = JSON.parse(text)
      const channels = canonical.get(key) ?? new Set()
      const context = envelope.hookSpecificOutput?.additionalContext ?? envelope.reason ?? envelope.hookSpecificOutput?.permissionDecisionReason
      if (typeof context === 'string' && context && !channels.has('hook_additional_context')) {
        uncertain.missingCanonical += 1; countText(totals.unknownAudience, context)
      }
      if (typeof envelope.systemMessage === 'string' && envelope.systemMessage && !channels.has('hook_system_message')) {
        uncertain.missingCanonical += 1; countText(totals.unknownAudience, envelope.systemMessage)
      }
      continue
    }
    // The host may replace oversized output with a file reference and preview.
    // The recorded original is not proof of the model's injected byte count.
    if (text.length > 10_000) { uncertain.cappedDeliveries += 1; continue }
    if (a.type === 'hook_system_message') countText(knownEvents.has(event) ? totals.userOnly : totals.unknownAudience, text)
    else if (a.type === 'hook_non_blocking_error') countText(totals.diagnosticOnly, text)
    else if (a.type === 'hook_additional_context') countText(modelContext.has(event) ? totals.observedModel : totals.unknownAudience, text)
    else countText(modelStdout.has(event) ? totals.observedModel : knownEvents.has(event) ? totals.diagnosticOnly : totals.unknownAudience, text)
  }
  const reasons = []
  if (unreadable) reasons.push('unreadable-lines')
  for (const field of ['unknownShapes', 'cappedDeliveries', 'unpairedSummaries', 'missingCanonical']) if (uncertain[field]) reasons.push(field)
  for (const field of ['ambiguous', 'unattributed']) if (uncertain[field].deliveries) reasons.push(field)
  if (totals.unknownAudience.deliveries) reasons.push('unknown-audience')
  return { totals, uncertain, coverage: { status: reasons.length ? 'partial' : 'complete', reasons }, rowsOverlap: true }
}
export function footprint(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const records = []
  let unreadable = 0
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.type !== 'string') unreadable += 1
      else records.push(record)
    } catch { unreadable += 1 }
  }
  // Which hooks ran on each (call, event): ours, another's, or both.
  const hooksOn = new Map()
  for (const r of records) {
    const a = r.attachment
    if (r.type !== 'attachment' || typeof a?.command !== 'string') continue
    const key = `${a.toolUseID}\u0000${a.hookEvent}`
    const seen = hooksOn.get(key) ?? { ours: false, theirs: false }
    if (OURS.test(a.command)) seen.ours = true; else seen.theirs = true
    hooksOn.set(key, seen)
  }
  const rows = new Map(), durations = {}
  let compactions = 0, ambiguous = 0, unattributed = 0
  // Claude Code 2.1.308 hands SessionStart's merged context back with `toolUseID` set to the event's name, not the call's
  // (measured 2026-10-22 on this repository's own transcript), so it joins no hook by id. It belongs to the latest call of
  // that event before it; with no call before it, or any other context that joins nothing, it is `unattributed`, said apart.
  const latestCall = {}
  const add = (event, channel, text) => {
    const items = [...String(text).matchAll(MARKER)].map(m => m[1])
    for (const item of items.length ? [...new Set(items)] : ['unmarked']) {
      const key = `${event}\u0000${channel}\u0000${item}`
      const row = rows.get(key) ?? { event, channel, item, firings: 0, characters: 0 }
      row.firings += 1
      row.characters += String(text).length
      rows.set(key, row)
    }
  }
  for (const r of records) {
    if (r.type === 'system' && r.subtype === 'compact_boundary') { compactions += 1; continue }
    const a = r.attachment
    if (r.type !== 'attachment' || !Object.hasOwn(HOOK_SHAPES, a?.type)) continue
    const event = String(a.hookEvent ?? '?').split(':')[0]
    if (typeof a.command === 'string') {
      latestCall[a.hookEvent] = `${a.toolUseID}\u0000${a.hookEvent}`
      if (!OURS.test(a.command)) continue
      if (typeof a.durationMs === 'number') (durations[event] ??= []).push(a.durationMs)
      const out = a.type === 'hook_success' ? a.stdout : a.stderr
      if (out && !isJsonObject(out)) add(event, HOOK_SHAPES[a.type], out)
      continue
    }
    const own = `${a.toolUseID}\u0000${a.hookEvent}`
    const seen = hooksOn.get(a.toolUseID === a.hookEvent && !hooksOn.has(own) ? latestCall[a.hookEvent] : own)
    if (!seen) { unattributed += 1; continue }
    if (!seen.ours) continue
    if (seen.theirs) { ambiguous += 1; continue }
    const body = texts(a.content).join('\n')
    if (body) add(event, HOOK_SHAPES[a.type], body)
  }
  const durationMs = Object.fromEntries(Object.entries(durations).map(([event, values]) =>
    [event, { firings: values.length, median: median(values) }]))
  return { rows: [...rows.values()].sort((x, y) => y.characters - x.characters), unreadable, ambiguous, unattributed, compactions,
    contexts: compactions + 1, durationMs, ...exclusiveFootprint(records, unreadable) }
}

function render(result) {
  const lines = [`contexts ${result.contexts} (compactions ${result.compactions}); unreadable lines ${result.unreadable}; `
    + `ambiguous attachments ${result.ambiguous} (another plugin's hook on the same call); `
    + `unattributed attachments ${result.unattributed} (joined to no hook)`]
  lines.push(`exclusive model context: ${result.totals.observedModel.characters} characters, ${result.totals.observedModel.bytes} bytes in ${result.totals.observedModel.deliveries} deliveries; coverage ${result.coverage.status}`)
  if (result.coverage.reasons.length) lines.push(`coverage gaps: ${result.coverage.reasons.join(', ')}`)
  lines.push('item rows overlap; never sum them as delivered context')
  lines.push('event              channel            item                      firings   characters')
  for (const r of result.rows) {
    lines.push(`${r.event.padEnd(19)}${r.channel.padEnd(19)}${r.item.padEnd(26)}${String(r.firings).padStart(7)}`
      + `${String(r.characters).padStart(13)}`)
  }
  for (const [event, d] of Object.entries(result.durationMs)) lines.push(`durationMs ${event}: median ${d.median} over ${d.firings}`)
  return lines.join('\n')
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  if (!file || args.includes('--help')) {
    process.stdout.write('usage: node scripts/hook-footprint.mjs <transcript.jsonl> [--json]\n')
    process.exit(file ? 0 : 2)
  }
  let result
  try { result = footprint(file) } catch (error) {
    process.stderr.write(`hook-footprint: could not read ${file}: ${error?.code ?? error}\n`)
    process.exit(2)
  }
  process.stdout.write(`${args.includes('--json') ? JSON.stringify(result, null, 2) : render(result)}\n`)
}
