#!/usr/bin/env node
// Observes every matching registered hook in a hermetic home and disposable clone.
// Native/Node process rows are lower bounds; CPU is the separately waited root
// subtree. --program retains the historical, explicitly Node-only API observer.
//
//   node scripts/hook-cost.mjs <event> <repository> [--json] [--timeout <seconds>] [--in-place] [--plugin <dir>] [--program <file>]
//
// <event> is SessionStart, PreToolUse (a Read), Edit (a PreToolUse Edit) or Stop. Exits 0 whatever it measured; a hook that failed,
// timed out or could not be started is said in the report, and a program that could not be started has no child count at all
// (null), because "could not look" is not "started none" (ADR-005).
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { coreAsset } from '../plugin/scripts/core-assets.mjs'
import { nativeBinaryPath } from '../plugin/scripts/native-cli.mjs'
import { runMeasured, summariseProcesses } from './observation/process.mjs'
import { registeredHooks, registeredProgram } from './policy-replay.mjs'

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

function measureRegistered({ event, repository, timeoutSeconds, inPlace, plugin }) {
  const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'hook-cost-chain-')))
  try {
    if (!PAYLOADS[event]) return { event, error: 'unknown event ' + event, children: null }
    const pluginDir = path.resolve(plugin ?? path.join(here, '..', 'plugin'))
    let repo = path.resolve(repository)
    if (!inPlace) {
      const cloned = spawnSync('git', ['clone', '--quiet', '--no-local', repo, path.join(scratch, 'repo')],
        { encoding: 'utf8', timeout: 300_000, windowsHide: true })
      if (cloned.error || cloned.status !== 0) return { event, error: 'could not clone the corpus', children: null }
      repo = path.join(scratch, 'repo')
    }
    const home = path.join(scratch, 'home'), data = path.join(home, 'data')
    mkdirSync(data, { recursive: true })
    const version = JSON.parse(readFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8')).version
    const selected = path.resolve(nativeBinaryPath(version))
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: scratch, TMP: scratch, TEMP: scratch,
      CLAUDE_PLUGIN_ROOT: pluginDir, CLAUDE_PLUGIN_DATA: data, CLAUDE_PROJECT_DIR: repo,
      QUALITY_HARNESS_QH_FETCH: 'off', CLAUDE_ENV_FILE: path.join(scratch, 'exports') }
    const registry = JSON.parse(readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf8'))
    const payload = { ...PAYLOADS[event](repo), session_id: 'hook-cost', cwd: repo }
    const hooks = registeredHooks(registry, payload.hook_event_name, payload.tool_name)
    if (hooks.some(hook => hook.command === 'sh')) {
      if (!existsSync(selected)) return { event, error: 'could not look: selected native executable is missing', children: null }
      const binary = path.join(data, 'qh', version, coreAsset(process.platform, process.arch))
      mkdirSync(path.dirname(binary), { recursive: true }); copyFileSync(selected, binary); chmodSync(binary, 0o755)
      writeFileSync(binary + '.sha256', createHash('sha256').update(readFileSync(binary)).digest('hex') + '\n')
      env.QUALITY_HARNESS_QH_BIN = binary
    }
    const take = (name, observe) => {
      const rows = [], registrations = [], resources = []
      const start = performance.now(), traceFile = path.join(scratch, name + '.jsonl')
      for (const [i, hook] of hooks.entries()) {
        const result = runMeasured({ file: registeredProgram(hook.command, { env }),
          args: (hook.args ?? []).map(arg => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginDir)),
          cwd: repo, env, input: JSON.stringify(payload), timeoutMs: timeoutSeconds * 1000,
          traceFile, trial: name + '-' + i, observe })
        rows.push(...result.rows); resources.push(result.resources)
        registrations.push({ command: hook.command, argumentsSha256: createHash('sha256').update(JSON.stringify(hook.args)).digest('hex'),
          exit: result.status, timedOut: result.timedOut, error: result.error, wallMs: result.wallMs })
      }
      return { wallMs: performance.now() - start, registrations, processes: summariseProcesses(rows), resources,
        exit: registrations.every(row => row.exit === 0) ? 0 : registrations.find(row => row.exit !== 0)?.exit ?? null,
        timedOut: registrations.some(row => row.timedOut) }
    }
    return { schema: 'quality-harness-hook-cost-v2', event, scope: 'registered-chain', children: null,
      first: take('first', true), second: take('second', true), observerOff: take('observer-off', false),
      coverage: { status: 'partial', reasons: ['process rows omit shell-internal descendants; waited-root CPU omits detached work',
        'cold provisioning excluded; warm observer-on/off runs have separate state histories'] } }
  } catch (error) {
    return { event, error: 'could not look: ' + (error.code ?? error.message), children: null }
  } finally { rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
}

export function measure({ event, repository, timeoutSeconds = 60, inPlace = false, plugin, program }) {
  if (!program) return measureRegistered({ event, repository, timeoutSeconds, inPlace, plugin })
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
    // The second traced event comes right after the first, so it is the very next start (a cache the first one filled is what it
    // reads); the untraced one is only there to say what the preload adds.
    const second = run(true)
    const secondSummary = readLog()
    const bareWarm = run(false)
    const scrub = text => String(text).split(repo).join('<repo>').split(scratch).join('<scratch>').split(pluginDir).join('<plugin>')
    const timedOut = first.result.error?.code === 'ETIMEDOUT'
    return { event, scope: 'node-api-only', coverage: { status: 'partial', reasons: ['explicit Node program; native and shell child visibility unavailable'] },
      program: scrub(hook), exit: timedOut ? null : first.result.status, timedOut, wallMs: first.wallMs,
      children: summary.children.map(child => ({ ...child, cmd: scrub(child.cmd), cwd: scrub(child.cwd) })),
      repeats: summary.repeats.map(repeat => ({ ...repeat, cmd: scrub(repeat.cmd), cwd: scrub(repeat.cwd) })), reads: summary.reads,
      second: { wallMs: second.wallMs, wallWithoutPreloadMs: bareWarm.wallMs, children: secondSummary.children.length, repeats: secondSummary.repeats.length,
        childList: secondSummary.children.map(child => ({ cmd: scrub(child.cmd), ms: child.ms })) } }
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}

export function render(report) {
  if (report.error) return `${report.event}: ${report.error}\n`
  if (report.scope === 'registered-chain') {
    const lines = [report.event + ': complete matching registry chain; process coverage ' + report.coverage.status]
    for (const name of ['first', 'second', 'observerOff']) {
      const sample = report[name]
      lines.push(name + ': ' + sample.wallMs.toFixed(1) + ' ms, ' + sample.registrations.length + ' registrations, '
        + sample.processes.starts + ' observed starts (' + sample.processes.coverage + '), exit ' + sample.exit)
    }
    lines.push(...report.coverage.reasons)
    return lines.join('\n') + '\n'
  }
  const lines = [`${report.event}: first event ${report.timedOut ? 'TIMED OUT' : `exit ${report.exit}`}, ${report.wallMs} ms, ${report.children.length} children, ${report.reads.count} reads, ${(report.reads.bytes / 1024).toFixed(0)} KiB; second event ${report.second.wallMs} ms, ${report.second.children} children (${report.second.wallWithoutPreloadMs} ms without the preload)`]
  for (const child of report.children) lines.push(`  ${String(child.ms).padStart(7)} ms  ${child.cmd}`)
  for (const repeat of report.repeats) lines.push(`  REPEAT x${repeat.count} (${repeat.ms} ms)  ${repeat.cmd}`)
  if (report.second.childList.length) lines.push('  second event:')
  for (const child of report.second.childList) lines.push(`  ${String(child.ms).padStart(7)} ms  ${child.cmd}`)
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
