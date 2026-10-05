#!/usr/bin/env node
// What this checkout's own ledgers say, in one report an adopter can paste back (ADR-084): which of
// this plugin's skills its sessions invoked, how often `qh-check` reused a pass on the same tree and
// roughly what that saved (ADR-081), and the checks it ran.
//
// Reads only, exit 0 whatever it finds. Counts, never content: no event's text, no command, and no
// path outside the checkout — a ledger is named by its place under the state directory.
//
// ⚠ A LEDGER NOT READ WHOLE IS UNPROVEN, NEVER ZERO. A torn session log or a skips file that could not
// be opened answered "nothing" before anything said so; it is named in `unproven`, its counts are null
// where they would otherwise read as none, and the look is PARTIAL (ADR-005).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { readEvents, stateDir } from './event-log.mjs'
import { isMainModule } from './main-module.mjs'

// One JSONL ledger: its rows, and whether every line was read. Absent is an empty ledger; any other
// failure, or a line that is not JSON, is a ledger not read whole.
function readLedger(file) {
  let text
  try { text = readFileSync(file, 'utf8') } catch (error) {
    return error?.code === 'ENOENT' ? { rows: [], complete: true } : { rows: [], complete: false }
  }
  const rows = []
  let complete = true
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { complete = false }
  }
  return { rows, complete }
}

/** The report for the checkout at `root`. Pure apart from reading its state directory. */
function ledgerReport(root) {
  const directory = stateDir(root)
  const unproven = []
  const skills = new Map()
  let names = []
  try { names = readdirSync(path.join(directory, 'sessions')).filter(name => name.endsWith('.jsonl')).sort() } catch (error) {
    if (error?.code !== 'ENOENT') unproven.push('sessions/')
  }
  for (const name of names) {
    const events = readEvents(root, name.slice(0, -'.jsonl'.length))
    if (!events.complete) unproven.push(`sessions/${name}`)
    for (const entry of events) {
      if (entry?.event !== 'skill.invoked' || typeof entry.skill !== 'string') continue
      const counted = skills.get(entry.skill) ?? { calls: 0, sessions: new Set() }
      counted.calls += 1
      counted.sessions.add(name)
      skills.set(entry.skill, counted)
    }
  }
  const skipped = readLedger(path.join(directory, 'skips.jsonl'))
  if (!skipped.complete) unproven.push('skips.jsonl')
  const checked = readLedger(path.join(directory, 'checks.jsonl'))
  if (!checked.complete) unproven.push('checks.jsonl')
  const byVerdict = {}
  let totalMs = 0
  for (const row of checked.rows) {
    byVerdict[row.verdict ?? 'unknown'] = (byVerdict[row.verdict ?? 'unknown'] ?? 0) + 1
    const took = Date.parse(row.after?.at) - Date.parse(row.before?.at)
    if (Number.isFinite(took) && took >= 0) totalMs += took
  }
  return {
    look: unproven.length ? 'PARTIAL' : 'ok',
    sessionsRead: names.length,
    skills: [...skills].map(([skill, { calls, sessions }]) => ({ skill, calls, sessions: sessions.size }))
      .sort((a, b) => b.calls - a.calls || a.skill.localeCompare(b.skill)),
    skips: skipped.complete
      ? { count: skipped.rows.length, savedMsEstimate: skipped.rows.reduce((sum, row) => sum + (Number.isFinite(row.savedMs) ? row.savedMs : 0), 0) }
      : null,
    checks: checked.complete ? { count: checked.rows.length, byVerdict, totalMs } : null,
    unproven,
  }
}

/** The paste-ready text. */
function render(answer) {
  const lines = [`quality-harness ledger report · look ${answer.look} · ${answer.sessionsRead} session log(s) read`]
  lines.push('', 'SKILLS INVOKED (this plugin\'s, from the session logs)')
  if (!answer.skills.length) lines.push('  none recorded')
  for (const { skill, calls, sessions } of answer.skills) lines.push(`  ${skill.padEnd(36)} ${calls} call(s) in ${sessions} session(s)`)
  lines.push('', answer.skips
    ? `same-tree skips  ${answer.skips.count}, saving about ${(answer.skips.savedMsEstimate / 1000).toFixed(1)} s (an estimate: each reused pass's own duration)`
    : 'same-tree skips  UNPROVEN — skips.jsonl could not be read whole')
  lines.push(answer.checks
    ? `checks run       ${answer.checks.count} (${Object.entries(answer.checks.byVerdict).map(([verdict, n]) => `${verdict} ${n}`).join(', ') || 'none'}), ${(answer.checks.totalMs / 1000).toFixed(1)} s in all`
    : 'checks run       UNPROVEN — checks.jsonl could not be read whole')
  if (answer.unproven.length) lines.push('', `UNPROVEN — not read whole: ${answer.unproven.join(', ')}. What they hold is not counted, and is not none.`)
  return lines.join('\n')
}

function main(argv, cwd = process.cwd()) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('ledger-report.mjs — what this checkout\'s quality-harness ledgers say, in counts.\n\n'
      + 'Usage: node ledger-report.mjs [--json] [<checkout>]\n\nRead-only; exit 0 whatever it finds.')
    return 0
  }
  const root = path.resolve(cwd, argv.find(arg => !arg.startsWith('--')) ?? '.')
  const answer = ledgerReport(root)
  console.log(argv.includes('--json') ? JSON.stringify(answer, null, 2) : render(answer))
  return 0
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)))
