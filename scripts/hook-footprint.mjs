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

// This plugin's hook commands: the plugin root variable, or a path into a quality-harness plugin directory.
const OURS = /\$\{?CLAUDE_PLUGIN_ROOT\}?|quality-harness[\\/](?:plugin[\\/])?scripts[\\/]/
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

export function footprint(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const records = []
  let unreadable = 0
  for (const line of lines) {
    if (!line.trim()) continue
    try { records.push(JSON.parse(line)) } catch { unreadable += 1 }
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
  let compactions = 0, ambiguous = 0
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
    if (r.type !== 'attachment' || !(a?.type in HOOK_SHAPES)) continue
    const event = String(a.hookEvent ?? '?').split(':')[0]
    if (typeof a.command === 'string') {
      if (!OURS.test(a.command)) continue
      if (typeof a.durationMs === 'number') (durations[event] ??= []).push(a.durationMs)
      const out = a.type === 'hook_success' ? a.stdout : a.stderr
      if (out && !isJsonObject(out)) add(event, HOOK_SHAPES[a.type], out)
      continue
    }
    const seen = hooksOn.get(`${a.toolUseID}\u0000${a.hookEvent}`)
    if (!seen?.ours) continue
    if (seen.theirs) { ambiguous += 1; continue }
    const body = texts(a.content).join('\n')
    if (body) add(event, HOOK_SHAPES[a.type], body)
  }
  const durationMs = Object.fromEntries(Object.entries(durations).map(([event, values]) =>
    [event, { firings: values.length, median: median(values) }]))
  return { rows: [...rows.values()].sort((x, y) => y.characters - x.characters), unreadable, ambiguous, compactions,
    contexts: compactions + 1, durationMs }
}

function render(result) {
  const lines = [`contexts ${result.contexts} (compactions ${result.compactions}); unreadable lines ${result.unreadable}; `
    + `ambiguous attachments ${result.ambiguous} (another plugin's hook on the same call)`]
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
