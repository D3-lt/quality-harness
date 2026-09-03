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

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.log('usage: node scripts/session-profile.mjs <session.jsonl>')
    console.log('')
    console.log('Claude Code keeps transcripts under its projects directory in your home;')
    console.log('the path is not hardcoded here because it names a person and this')
    console.log('repository publishes its own corpus.')
    process.exitCode = 2
    return
  }

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

main()
