#!/usr/bin/env node
// What a real session actually spends, read out of a Claude Code transcript.
//
//   node scripts/session-profile.mjs <path-to-session.jsonl>
//
// It exists because of a question the eval harness answers WRONGLY for long work.
//
// The ablation run (scripts/eval-compare.mjs) reports the plugin taking 2.33x the
// turns, and its cost rose 2.35x — near-identical, so "turns" read like a direct
// price. That conclusion does not transfer, and the reason is in this script's
// output: eval cases are SHORT, FRESH sessions of 1-50 turns, which is precisely
// the regime where a prompt cache cannot help. Measured in one real session on
// 2026-09-03, 1,938 assistant turns:
//
//     fresh input      3,890 tokens    0.0%
//     cache creation   8.1M            0.8%
//     cache READ       982M           99.2%
//
// Nearly every input token was a cache read, which is billed far below fresh
// input. So an extra turn in a long session is not an extra turn's worth of
// prompt — it is a re-read of one already paid for. The eval's cost ratio is the
// worst case, not the typical one.
//
// ⚠ TURNS BELONG TO THE AGENT, NOT TO THE TOOLING. A gate run is a subprocess
// inside a Bash call inside one assistant turn; no gate ever gets a turn of its
// own. This script prints the tool histogram beside the turn count so that stays
// visible — "the plugin doubles the turns" means the MODEL takes more rounds, and
// asking whether the tooling is to blame confuses a subprocess with a round trip.
//
// ⚠ ONE SESSION IS NOT A STUDY. This reports the session you hand it. It has no
// control arm — there is no without-plugin twin of the same work — so it can say
// what a session cost and what shape that cost had, and it cannot say what the
// plugin caused. Compare two sessions yourself if you want a delta, and say so.

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

import { pathToFileURL } from 'node:url'
const n = x => x.toLocaleString('en-US')

function add(usage, totals) {
  totals.input += usage.input_tokens ?? 0
  totals.output += usage.output_tokens ?? 0
  totals.cacheRead += usage.cache_read_input_tokens ?? 0
  totals.cacheWrite += usage.cache_creation_input_tokens ?? 0
}

/** Percentage of the input side, or '—' when nothing was spent. */
export function share(part, whole) {
  return whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`
}

// ── attribution ──────────────────────────────────────────────────────────────
//
// THE MARKER THIS WAS SUPPOSED TO NEED DOES NOT EXIST, AND THAT IS THE FINDING.
// The question that produced this ("put markers around injected blocks so we
// can find them") assumed the transcript loses the source. Measured 2026-09-05
// against a real transcript of this repository, 222 injected records:
//
//     hook_success             88   every one carries `hookName`
//     hook_additional_context   9   every one carries `hookName` TOO
//     records with no source label  0
//
// The first reading of that file said the 9 were the unlabelled shape. They are
// not; the sample that suggested it was truncated at 420 characters and cut the
// field off. So no marker is emitted anywhere, and none is needed — the harness
// already attributes every byte it injects. What was missing was a READER.
//
// The UNATTRIBUTED bucket below stays, and is deliberately not dead code: it is
// the arm that fires if a future hook injects without naming itself. Reporting
// that as a named bucket rather than folding it into a total is CLAUDE.md §3 —
// a check never reports an observation it did not make, and "everything is
// attributed" must not be what an unlabelled record looks like.

/** What one attachment record is, and how many bytes of context it cost.
 *
 * ⚠ BYTES, NOT TOKENS. The transcript records no per-attachment token count, so
 * a token figure here would be a number nobody measured (CLAUDE.md §4). Bytes
 * are what the file actually holds; divide by ~4 yourself if you want a feel,
 * and say that you did. */
export function classify(row) {
  if (row?.type !== 'attachment') return null
  const a = row.attachment
  if (!a || typeof a !== 'object') return null
  const text = typeof a.content === 'string'
    ? a.content
    : Array.isArray(a.content) ? a.content.filter(x => typeof x === 'string').join('\n')
      : JSON.stringify(a)
  // A hook that names itself is attributed by the harness, for free. One that
  // does not is named as such — never guessed at, and never silently pooled.
  const source = a.hookName
    ? `hook:${a.hookName}`
    : a.type === 'hook_additional_context' || a.type === 'hook_success'
      ? `${a.type} (UNATTRIBUTED — hook did not name itself)`
      : a.type ?? 'unknown'
  return { source, bytes: Buffer.byteLength(text, 'utf8') }
}

/** Sum the context every injected attachment cost, grouped by who wrote it. */
export function attribute(rows) {
  const by = new Map()
  for (const row of rows) {
    const hit = classify(row)
    if (!hit) continue
    const seen = by.get(hit.source) ?? { records: 0, bytes: 0, max: 0 }
    seen.records += 1
    seen.bytes += hit.bytes
    if (hit.bytes > seen.max) seen.max = hit.bytes
    by.set(hit.source, seen)
  }
  return by
}

async function reportAttribution(file) {
  const rows = []
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* counted by the main profile */ }
  }
  const by = attribute(rows)
  const total = [...by.values()].reduce((a, b) => a + b.bytes, 0)
  console.log(`session-attribution · ${[...by.values()].reduce((a, b) => a + b.records, 0)} injected record(s)`)
  console.log('')
  console.log('WHO PUT BYTES INTO THIS CONTEXT')
  for (const [source, seen] of [...by].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${source.padEnd(44)} ${n(seen.bytes).padStart(9)} B  ${String(seen.records).padStart(4)}×  ${share(seen.bytes, total)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(44)} ${n(total).padStart(9)} B`)
  console.log('')
  // A one-shot injection and a per-turn one are the same row in the table above
  // and completely different problems. The first is paid once and then read from
  // cache; the second is what "the instructions keep accumulating" actually is,
  // and it is the only half worth shortening at the source.
  const repeats = [...by].filter(([, s]) => s.records > 1 && s.bytes > 0)
  if (repeats.length) {
    console.log('WHAT REPEATS — the accumulating half')
    for (const [source, seen] of repeats.sort((a, b) => b[1].bytes - a[1].bytes)) {
      const avg = Math.round(seen.bytes / seen.records)
      console.log(`  ${source.padEnd(38)} ${String(seen.records).padStart(3)}×  avg ${n(avg).padStart(6)} B  max ${n(seen.max).padStart(6)} B  = ${n(seen.bytes).padStart(8)} B`)
    }
    console.log('')
    console.log('  Shorten by AVERAGE × COUNT, not by total: a 30KB one-shot costs less')
    console.log('  over a long session than a 250-byte line delivered on every prompt.')
  }
  console.log('')
  console.log('  BYTES, never tokens: the transcript records no per-attachment token')
  console.log('  count, so a token column here would be a number nobody measured.')
  console.log('')
  console.log('  An UNATTRIBUTED row is a hook that injected without naming itself.')
  console.log('  Measured 2026-09-05 on the session that motivated this: there were')
  console.log('  none — every injected record already carried its own hookName, which')
  console.log('  is why no marker is emitted anywhere and none is needed.')
  console.log('')
  console.log('  ⚠ THIS IS NOT A BILL. Injected bytes are append-only, so after their')
  console.log('  first turn they are re-read at the cache rate, not re-bought. A big')
  console.log('  row here is worth cutting at the SOURCE; deleting it from the middle')
  console.log('  of a context costs more than it saves (prefix caching re-writes')
  console.log('  everything after the cut).')
}

async function main() {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  if (!file) {
    console.log('usage: node scripts/session-profile.mjs <session.jsonl> [--attribute]')
    console.log('')
    console.log('Claude Code keeps transcripts under its projects directory in your home;')
    console.log('the path is not hardcoded here because it names a person and this')
    console.log('repository publishes its own corpus.')
    console.log('')
    console.log('  --attribute   who put bytes into the context, grouped by writer')
    process.exitCode = 2
    return
  }
  if (args.includes('--attribute')) return reportAttribution(file)

  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const tools = new Map()
  let turns = 0
  let toolTurns = 0
  let unparsable = 0

  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      unparsable += 1
      continue
    }
    const message = row?.message
    if (typeof message !== 'object' || message === null) continue
    if (message.usage) add(message.usage, totals)
    if (message.role !== 'assistant') continue
    turns += 1
    const used = (message.content ?? [])
      .filter(b => b && b.type === 'tool_use')
      .map(b => b.name)
    if (used.length) toolTurns += 1
    for (const name of used) tools.set(name, (tools.get(name) ?? 0) + 1)
  }

  const inputSide = totals.input + totals.cacheRead + totals.cacheWrite
  const calls = [...tools.values()].reduce((a, b) => a + b, 0)

  console.log(`session-profile · ${turns} assistant turns · ${calls} tool calls`)
  console.log('')
  console.log('WHERE THE INPUT WENT')
  console.log(`  fresh input      ${n(totals.input).padStart(14)}   ${share(totals.input, inputSide)}`)
  console.log(`  cache creation   ${n(totals.cacheWrite).padStart(14)}   ${share(totals.cacheWrite, inputSide)}`)
  console.log(`  cache READ       ${n(totals.cacheRead).padStart(14)}   ${share(totals.cacheRead, inputSide)}`)
  console.log(`  output           ${n(totals.output).padStart(14)}`)
  console.log('')
  console.log('  A cache read is billed far below fresh input. When this line dominates,')
  console.log('  an extra turn costs a re-read of a prompt already paid for — which is why')
  console.log('  a turn COUNT is not a bill, and why the short-session eval ratio is the')
  console.log('  worst case rather than the typical one.')
  console.log('')
  console.log('WHO TOOK THE TURNS')
  console.log(`  turns ending in a tool call   ${toolTurns}`)
  console.log(`  turns ending in prose         ${turns - toolTurns}`)
  for (const [name, count] of [...tools].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`    ${name.padEnd(26)} ${count}`)
  }
  console.log('')
  console.log('  Every gate this project ships runs as a subprocess inside one of those')
  console.log('  tool calls. The tooling takes no turns of its own, so a turn count is a')
  console.log('  measurement of the MODEL\'s rounds and never of the harness.')
  if (unparsable) console.log(`\n  (${unparsable} line(s) did not parse and were skipped — not counted as anything)`)
  console.log('')
  console.log('NO CONTROL ARM. One session, no without-plugin twin of the same work.')
  console.log('This says what a session cost and what shape the cost had. It cannot say')
  console.log('what the plugin caused; only scripts/eval-compare.mjs has a baseline.')
}

// Guarded so the exports above can be imported by a hook that wants `markLine`
// without running the profile as a side effect.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
