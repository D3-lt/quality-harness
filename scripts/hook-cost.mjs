#!/usr/bin/env node
// Counts what one hook event does (ADR-095 T1): the children it starts (program, arguments, directory, time inside each), the
// ones it starts more than once with the same arguments in the same directory, and the files it reads. It runs the real hook
// program in a hermetic home against a throwaway clone of the repository, so nothing is left in the repository it was pointed at.
//
//   node scripts/hook-cost.mjs <event> <repository> [--json] [--timeout <seconds>] [--in-place] [--plugin <dir>] [--program <file>]
//
// <event> is SessionStart, PreToolUse (a Read), Edit (a PreToolUse Edit) or Stop. Exits 0 whatever it measured; a hook that failed,
// timed out or could not be started is said in the report, and a program that could not be started has no child count at all
// (null), because "could not look" is not "started none" (ADR-005).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD = path.join(here, 'hook-cost-preload.cjs')

const PAYLOADS = {
  SessionStart: () => ({ hook_event_name: 'SessionStart', source: 'startup' }),
  PreToolUse: repo => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: path.join(repo, 'README.md') } }),
  Edit: repo => ({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(repo, 'README.md'), old_string: 'a', new_string: 'b' } }),
  Stop: () => ({ hook_event_name: 'Stop' }),
}

export function summarise(lines) {
  const rows = lines.map(line => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
  const reads = rows.filter(row => row.kind === 'read')
  const children = rows.filter(row => row.kind !== 'read').map(({ cmd, cwd, ms, kind }) => ({ cmd, cwd, ms: Math.round(ms * 10) / 10, kind }))
  const groups = new Map()
  for (const child of children) {
    const key = `${child.cwd}\0${child.cmd}`
    const group = groups.get(key) ?? { cmd: child.cmd, cwd: child.cwd, count: 0, ms: 0 }
    group.count++
    group.ms += child.ms
    groups.set(key, group)
  }
  const repeats = [...groups.values()].filter(group => group.count > 1).map(group => ({ ...group, ms: Math.round(group.ms * 10) / 10 }))
  return { children, repeats, reads: { count: reads.length, bytes: reads.reduce((sum, row) => sum + row.bytes, 0) } }
}

export function measure({ event, repository, timeoutSeconds = 60, inPlace = false, plugin, program }) {
  const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'hook-cost-')))
  try {
    if (!PAYLOADS[event]) return { event, error: `unknown event ${event}: one of ${Object.keys(PAYLOADS).join(', ')}`, children: null }
    const pluginDir = plugin ?? path.resolve(here, '..', 'plugin')
    const hook = program ?? path.join(pluginDir, 'scripts', 'lifecycle.mjs')
    if (!existsSync(hook)) return { event, error: `could not start: ${hook} is not there`, exit: null, children: null }
    let repo = path.resolve(repository)
    if (!inPlace) {
      const copy = path.join(scratch, 'repo')
      const cloned = spawnSync('git', ['clone', '--quiet', '--no-local', repo, copy], { encoding: 'utf8', timeout: 300_000, windowsHide: true })
      if (cloned.error || cloned.status !== 0) return { event, error: `could not clone ${repository}: ${cloned.error?.code ?? cloned.stderr.trim()}`, children: null }
      repo = copy
    }
    const home = path.join(scratch, 'home')
    const log = path.join(scratch, 'children.jsonl')
    writeFileSync(log, '')
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: scratch, TMP: scratch, TEMP: scratch, CLAUDE_PLUGIN_DATA: path.join(home, 'data'),
      CLAUDE_PROJECT_DIR: repo, CLAUDE_PLUGIN_ROOT: pluginDir, HOOK_COST_OUT: log }
    const input = JSON.stringify({ ...PAYLOADS[event](repo), session_id: 'hook-cost', cwd: repo })
    const run = withPreload => {
      writeFileSync(log, '')
      const options = { input, cwd: repo, encoding: 'utf8', timeout: timeoutSeconds * 1000, windowsHide: true,
        env: withPreload ? { ...env, NODE_OPTIONS: `--require ${JSON.stringify(PRELOAD)}` } : env }
      const start = process.hrtime.bigint()
      const result = spawnSync(process.execPath, [hook], options)
      return { result, wallMs: Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10 }
    }
    // The first event of a session pays for things the next one does not (a once-per-session marker, a cold state directory), so
    // the traced run that is reported comes FIRST. A second traced run and an untraced one, both warm, say what the next event
    // costs and what the preload itself adds.
    const readLog = () => summarise(readFileSync(log, 'utf8').split('\n').filter(Boolean))
    const first = run(true)
    const summary = readLog()
    const bareWarm = run(false)
    const second = run(true)
    const secondSummary = readLog()
    const scrub = text => String(text).split(repo).join('<repo>').split(scratch).join('<scratch>').split(pluginDir).join('<plugin>')
    const timedOut = first.result.error?.code === 'ETIMEDOUT'
    return { event, program: scrub(hook), exit: timedOut ? null : first.result.status, timedOut, wallMs: first.wallMs,
      children: summary.children.map(child => ({ ...child, cmd: scrub(child.cmd), cwd: scrub(child.cwd) })),
      repeats: summary.repeats.map(repeat => ({ ...repeat, cmd: scrub(repeat.cmd), cwd: scrub(repeat.cwd) })), reads: summary.reads,
      second: { wallMs: second.wallMs, wallWithoutPreloadMs: bareWarm.wallMs, children: secondSummary.children.length, repeats: secondSummary.repeats.length } }
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}

export function render(report) {
  if (report.error) return `${report.event}: ${report.error}\n`
  const lines = [`${report.event}: first event ${report.timedOut ? 'TIMED OUT' : `exit ${report.exit}`}, ${report.wallMs} ms, ${report.children.length} children, ${report.reads.count} reads, ${(report.reads.bytes / 1024).toFixed(0)} KiB; second event ${report.second.wallMs} ms, ${report.second.children} children (${report.second.wallWithoutPreloadMs} ms without the preload)`]
  for (const child of report.children) lines.push(`  ${String(child.ms).padStart(7)} ms  ${child.cmd}`)
  for (const repeat of report.repeats) lines.push(`  REPEAT x${repeat.count} (${repeat.ms} ms)  ${repeat.cmd}`)
  return `${lines.join('\n')}\n`
}

function main(argv) {
  const flags = { json: false, inPlace: false }
  const positional = []
  let timeoutSeconds = 60
  let plugin
  let program
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]
    if (word === '--json') flags.json = true
    else if (word === '--in-place') flags.inPlace = true
    else if (word === '--timeout') timeoutSeconds = Number(argv[++i])
    else if (word === '--plugin') plugin = path.resolve(argv[++i])
    else if (word === '--program') program = path.resolve(argv[++i])
    else positional.push(word)
  }
  if (positional.length !== 2 || !(timeoutSeconds > 0)) {
    process.stderr.write('usage: hook-cost.mjs <SessionStart|PreToolUse|Edit|Stop> <repository> [--json] [--timeout <seconds>] [--in-place] [--plugin <dir>] [--program <file>]\n')
    return 2
  }
  const report = measure({ event: positional[0], repository: positional[1], timeoutSeconds, inPlace: flags.inPlace, plugin, program })
  process.stdout.write(flags.json ? `${JSON.stringify(report, null, 2)}\n` : render(report))
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
