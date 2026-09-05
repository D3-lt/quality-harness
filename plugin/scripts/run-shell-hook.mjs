#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const HOOK_SCRIPTS = new Set(['facts-gate-dispatch.sh', 'post-edit-check.sh'])
const PATH_KEYS = new Set(['cwd', 'file_path', 'notebook_path', 'filePath'])
const DEFAULT_TIMEOUT_MS = 110_000

function windowsPathForBash(value) {
  if (/^[A-Za-z]:\\/.test(value)) return value.replaceAll('\\', '/')
  if (/^\\\\/.test(value)) return `//${value.slice(2).replaceAll('\\', '/')}`
  return value
}

function normalizePathValues(value, platform, key = '') {
  if (typeof value === 'string') {
    return platform === 'win32' && PATH_KEYS.has(key) ? windowsPathForBash(value) : value
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizePathValues(item, platform))
  }
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
    childKey,
    normalizePathValues(child, platform, childKey),
  ]))
}

export function normalizeHookPayload(raw, platform = process.platform) {
  if (platform !== 'win32') return raw
  try {
    return JSON.stringify(normalizePathValues(JSON.parse(raw), platform))
  } catch {
    return raw
  }
}

function parsedHookPayload(raw, platform) {
  try {
    return normalizePathValues(JSON.parse(raw), platform)
  } catch {
    return null
  }
}

export function hookFilePathFromPayload(raw, platform = process.platform) {
  const payload = parsedHookPayload(raw, platform)
  const candidate = payload?.tool_input?.file_path
    ?? payload?.tool_input?.notebook_path
    ?? payload?.tool_response?.filePath
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

export function hookArguments(scriptName, raw, platform) {
  const payload = parsedHookPayload(raw, platform)
  const filePath = hookFilePathFromPayload(raw, platform) ?? ''
  if (scriptName === 'facts-gate-dispatch.sh') {
    // The dispatcher relaxes set-level gates at the per-edit boundary only, so it
    // has to be told which boundary asked. Absence means a completion boundary.
    const event = typeof payload?.hook_event_name === 'string' ? payload.hook_event_name : ''
    return [filePath, event]
  }
  if (scriptName === 'post-edit-check.sh') {
    const toolName = typeof payload?.tool_name === 'string' ? payload.tool_name : ''
    return [toolName, filePath]
  }
  // Unreachable today — runShellHook rejects anything outside HOOK_SCRIPTS before
  // calling this. It is a guard against the NEXT hook script, not this one:
  // returning [] there would run a gate with no arguments, and a gate handed no
  // file exits 0. A gate that cannot fail is the failure mode this project keeps
  // fixing, so an unwired script has to say so instead of passing quietly.
  throw new Error(`quality-harness: ${scriptName} is in HOOK_SCRIPTS but hookArguments does not build its arguments`)
}

export function resolveBashExecutable(
  platform = process.platform,
  env = process.env,
  fileExists = existsSync,
) {
  if (platform !== 'win32') return 'bash'
  if (env.CLAUDE_CODE_GIT_BASH_PATH) return env.CLAUDE_CODE_GIT_BASH_PATH

  const candidateExists = candidate => {
    try {
      return fileExists(candidate)
    } catch {
      return false
    }
  }
  const searchPath = env.PATH ?? env.Path ?? ''
  for (const rawDirectory of searchPath.split(path.win32.delimiter)) {
    const directory = rawDirectory.trim().replace(/^"|"$/g, '')
    // Both stubs, for the reason spelled out in adr-verify's resolve_bash: the
    // WindowsApps entry is a 0-byte Store alias that existsSync() accepts.
    if (!directory || /[\\/](?:system32|windowsapps)[\\/]?$/i.test(directory)) continue
    const candidate = path.win32.join(directory, 'bash.exe')
    if (candidateExists(candidate)) return candidate
  }

  const drive = env.SystemDrive || 'C:'
  const roots = [
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs', 'Git'),
    path.win32.join(env.ProgramFiles || `${drive}\\Program Files`, 'Git'),
    path.win32.join(env['ProgramFiles(x86)'] || `${drive}\\Program Files (x86)`, 'Git'),
  ].filter(Boolean)
  for (const root of roots) {
    const candidate = path.win32.join(root, 'bin', 'bash.exe')
    if (candidateExists(candidate)) return candidate
  }
  return null
}

export function shellHookTimeoutMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_SHELL_TIMEOUT_MS)
  return Number.isSafeInteger(configured) && configured >= 100 && configured <= DEFAULT_TIMEOUT_MS
    ? configured
    : DEFAULT_TIMEOUT_MS
}

// The cleanup a timeout runs is itself a child, and a cleanup nobody bounded is
// how a hung taskkill wore the timeout's name for a full 60s in the Python gates
// (BACKLOG §127, §128). These two bounds are SYNCHRONOUS on the timer path, so
// their sum is what the outer caller pays after its own timeout before the
// runner settles — and the smallest outer margin is lifecycle's
// ARTIFACT_GATE_KILL_MARGIN_MS (5s). Both are tested against it. taskkill
// answers in milliseconds; one that has not answered in 2s is hung.
export const TASKKILL_TIMEOUT_MS = 2_000
// After the kill, how long to wait for the child's `close` before settling
// anyway. Without this a cleanup that failed left the promise pending until the
// child exited on its own or the host killed the whole hook at its deadline —
// a timeout that had fired and was then never reported (Codex review, 2026-09-05).
export const CLEANUP_GRACE_MS = 1_000

// Returns true only when the kill was CONFIRMED issued: taskkill exited 0, the
// POSIX group kill did not throw, or the direct kill reported the signal sent.
// `spawnSyncImpl` and `groupKill` are the seams a test drives, because taskkill
// exists on one platform and a group that cannot be signalled is not something
// a test should have to manufacture.
export function terminateProcessTree(child, platform, spawnSyncImpl = spawnSync, groupKill = pid => process.kill(-pid, 'SIGKILL')) {
  if (!child.pid) return false
  if (platform === 'win32') {
    const run = spawnSyncImpl('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: TASKKILL_TIMEOUT_MS,
    })
    return !run.error && run.status === 0
  }
  try {
    groupKill(child.pid)
    return true
  } catch {
    // ChildProcess.kill answers false when the signal could not be sent; that
    // answer is the evidence, not the absence of a throw (Codex review, 2026-09-05).
    try { return child.kill('SIGKILL') === true } catch { return false }
  }
}

export function runWithTimeout(executable, args, options = {}) {
  const {
    input = '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    platform = process.platform,
    env = process.env,
    terminate = terminateProcessTree,
    cleanupGraceMs = CLEANUP_GRACE_MS,
  } = options

  return new Promise(resolve => {
    const child = spawn(executable, args, {
      detached: platform !== 'win32',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let spawnError = null
    let timedOut = false
    let killConfirmed = null
    let grace = null

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', chunk => { stdout += chunk })
    child.stderr?.on('data', chunk => { stderr += chunk })
    child.on('error', error => { spawnError = error })

    const settle = (status, closed) => {
      clearTimeout(timer)
      clearTimeout(grace)
      resolve({
        error: spawnError, status, stderr, stdout, timedOut, pid: child.pid,
        // `closed` is the only observation that the tree is gone; a kill that
        // was issued is not one that landed (ADR-005).
        cleanupConfirmed: timedOut ? closed : null,
        killIssued: timedOut ? killConfirmed : null,
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      killConfirmed = terminate(child, platform)
      // Whatever the kill said, do not wait on the child forever: settle after
      // the grace with the truth (cleanupConfirmed: false), and let go of the
      // pipes so the runner can exit without it.
      grace = setTimeout(() => {
        for (const stream of [child.stdout, child.stderr, child.stdin]) stream?.destroy()
        child.unref?.()
        settle(null, false)
      }, cleanupGraceMs)
    }, timeoutMs)

    child.on('close', status => settle(status, true))
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  })
}

// The MSYS/Cygwin runtime aborts with `[main] bash (1234) …: *** fatal error - …`
// and still exits 0. Measured 2026-08-25 on Windows 11: four PostToolUse:Edit
// hooks died in `add_item` and every one was recorded as a clean pass, so ADR
// files were edited with the facts gate never having run. A gate that cannot
// fail is evidence of nothing — the crash has to outrank the exit code.
//
// Deliberately narrow: this matches the C runtime's own abort banner, not gate
// output. A gate is free to print the words "fatal error" in a finding.
// The banner is prefixed by a serial number and elapsed time before `[main]`,
// e.g. `      2 [main] bash (46688) …`, so the line does not start at `[`.
const SHELL_ABORT = /^[^\n]{0,80}\[[a-z]+\][^\n]*\*\*\* fatal error[ -]/mi

export function shellRuntimeCrashed(stderr) {
  return typeof stderr === 'string' && SHELL_ABORT.test(stderr)
}

async function readStdin() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

export async function runShellHook(scriptName) {
  if (!HOOK_SCRIPTS.has(scriptName)) {
    process.stderr.write(`quality-harness: unsupported shell hook: ${scriptName || '<missing>'}\n`)
    return 2
  }

  const scriptPath = process.platform === 'win32'
    ? windowsPathForBash(path.join(SCRIPT_DIR, scriptName))
    : path.join(SCRIPT_DIR, scriptName)
  const timeoutMs = shellHookTimeoutMs()
  const executable = resolveBashExecutable()
  if (!executable) {
    process.stderr.write('quality-harness: Git Bash was not found, so the artifact gates did not '
      + 'run. Set CLAUDE_CODE_GIT_BASH_PATH to Git for Windows bin/bash.exe. Your edit is '
      + 'untouched — this is the harness reporting its own absence.\n')
    return 0
  }
  const raw = await readStdin()
  const run = await runWithTimeout(executable, [scriptPath, ...hookArguments(
    scriptName,
    raw,
    process.platform,
  )], {
    input: normalizeHookPayload(raw),
    timeoutMs,
  })
  // A deferral notice printed on exit-0 stdout reaches nobody at PostToolUse —
  // Claude Code surfaces exit-0 stdout in transcript view only. Wrapping it as
  // additionalContext is what actually puts the finding in front of the model
  // at the moment of the edit, which is the 'report' half of "reports at the
  // edit and blocks at the boundary".
  const payload = parsedHookPayload(raw, process.platform)
  if (scriptName === 'facts-gate-dispatch.sh'
      && payload?.hook_event_name === 'PostToolUse'
      && run.status === 0 && !run.timedOut && !run.error && run.stdout.trim()) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: run.stdout.trim(),
      },
    }))
  } else if (run.stdout) {
    process.stdout.write(run.stdout)
  }
  if (run.stderr) process.stderr.write(run.stderr)
  // Everything below is the harness failing to run, not a finding about the
  // edit. It used to exit 2, which BLOCKS the tool call: a Windows machine with
  // no Git Bash, a slow gate, a crashed shell — each one refused an edit it had
  // never even read. That is the failure the advisory rule exists to prevent,
  // and it is worse here than anywhere else, because the user is being stopped
  // by the harness's own breakage.
  if (run.timedOut) {
    process.stderr.write(`quality-harness: ${scriptName} timed out after ${timeoutMs}ms, so the `
      + 'gates have no verdict on this edit. Nothing is blocked.\n')
    return 0
  }
  if (run.error) {
    process.stderr.write(`quality-harness: could not run ${scriptName}: ${run.error.message}. `
      + 'The gates did not report; nothing is blocked.\n')
    return 0
  }
  if (shellRuntimeCrashed(run.stderr)) {
    process.stderr.write(`quality-harness: the shell running ${scriptName} aborted before the gate `
      + 'could report, so treat this edit as unchecked rather than clean. Nothing is blocked.\n')
    return 0
  }
  // The hook scripts are advisory by construction and exit 0 even when they have
  // findings. A non-zero here is one of them breaking, which is still not a
  // reason to refuse the user's edit.
  if (Number.isInteger(run.status) && run.status !== 0) {
    process.stderr.write(`quality-harness: ${scriptName} exited ${run.status}, which it should `
      + 'never do — the gates report, they do not refuse. Nothing is blocked; please report this.\n')
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runShellHook(process.argv[2])
}
