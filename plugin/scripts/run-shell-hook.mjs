#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startPerformanceTrace } from './performance-trace.mjs'

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
// ARTIFACT_OUTPUT_LIMIT preserves the former boundary runner's per-file allowance.
export const ARTIFACT_OUTPUT_LIMIT = 1024 * 1024

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
    maxOutputBytes = Infinity,
    platform = process.platform,
    env = process.env,
    terminate = terminateProcessTree,
    cleanupGraceMs = CLEANUP_GRACE_MS,
  } = options

  return new Promise(resolve => {
    // untimed-spawn: bounded by the timer below, which terminates the tree and settles after CLEANUP_GRACE_MS
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
    let outputLimitExceeded = false
    let outputBytes = 0
    let killConfirmed = null
    let grace = null

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    const capture = (stream, chunk) => {
      if (outputLimitExceeded) return
      const bytes = Buffer.byteLength(chunk)
      const available = maxOutputBytes - outputBytes
      if (bytes > available) {
        chunk = Buffer.from(chunk).subarray(0, available).toString('utf8')
        outputLimitExceeded = true
      }
      outputBytes += Math.min(bytes, available)
      if (stream === 'stdout') stdout += chunk
      else stderr += chunk
      // A noisy artifact must not consume the shared runner's output allowance
      // and prevent later artifacts from being checked.
      if (outputLimitExceeded) stop()
    }
    child.stdout?.on('data', chunk => capture('stdout', chunk))
    child.stderr?.on('data', chunk => capture('stderr', chunk))
    child.on('error', error => { spawnError = error })

    const settle = (status, closed) => {
      clearTimeout(timer)
      clearTimeout(grace)
      resolve({
        error: spawnError, status, stderr, stdout, timedOut, outputLimitExceeded, pid: child.pid,
        // `closed` is the only observation that the tree is gone; a kill that
        // was issued is not one that landed (ADR-005).
        cleanupConfirmed: timedOut || outputLimitExceeded ? closed : null,
        killIssued: timedOut || outputLimitExceeded ? killConfirmed : null,
      })
    }

    const stop = () => {
      if (grace !== null) return
      clearTimeout(timer)
      killConfirmed = terminate(child, platform)
      // Whatever the kill said, do not wait on the child forever: settle after
      // the grace with the truth (cleanupConfirmed: false), and let go of the
      // pipes so the runner can exit without it.
      grace = setTimeout(() => {
        for (const stream of [child.stdout, child.stderr, child.stdin]) stream?.destroy()
        child.unref?.()
        settle(null, false)
      }, cleanupGraceMs)
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
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

// runShellHook runs one supported hook with bounded shell lifetime and advisory output.
export async function runShellHook(scriptName, raw, options = {}) {
  if (!HOOK_SCRIPTS.has(scriptName)) {
    process.stderr.write(`quality-harness: unsupported shell hook: ${scriptName || '<missing>'}\n`)
    return 2
  }

  const { timeoutMs = shellHookTimeoutMs(), maxOutputBytes, windowMs } = options
  const scriptPath = process.platform === 'win32'
    ? windowsPathForBash(path.join(SCRIPT_DIR, scriptName))
    : path.join(SCRIPT_DIR, scriptName)
  const executable = resolveBashExecutable()
  if (!executable) {
    process.stderr.write('quality-harness: Git Bash was not found, so the artifact gates did not '
      + 'run. Set CLAUDE_CODE_GIT_BASH_PATH to Git for Windows bin/bash.exe. Your edit is '
      + 'untouched — this is the harness reporting its own absence.\n')
    startPerformanceTrace('shell/' + scriptName, raw ?? '', process.env,
      [hookFilePathFromPayload(raw ?? '')])('unavailable', { error: true })
    return 0
  }
  if (raw === undefined) raw = await readStdin()
  const finish = startPerformanceTrace('shell/' + scriptName, raw, process.env, [hookFilePathFromPayload(raw)])

  const args = hookArguments(scriptName, raw, process.platform)
  // Only a completed batch history read supplies this argument. Undefined keeps
  // the dispatcher's ordinary lookup; an empty string is an observed absence.
  if (scriptName === 'facts-gate-dispatch.sh' && options.archiveCatalog !== undefined) {
    args.push(process.platform === 'win32' ? windowsPathForBash(options.archiveCatalog) : options.archiveCatalog)
  }
  const run = await runWithTimeout(executable, [scriptPath, ...args], {
    input: normalizeHookPayload(raw),
    timeoutMs,
    maxOutputBytes,
  })
  finish(run.cleanupConfirmed === false ? 'cleanup-unconfirmed'
    : run.outputLimitExceeded ? 'output-limit' : run.timedOut ? 'timeout'
    : run.error || run.status !== 0 || shellRuntimeCrashed(run.stderr) ? 'failed' : 'completed', run)
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
  // Direct hooks stay advisory. A batch must stop if the prior shell may still
  // be running, especially because its completed-command ledger is shared.
  const batchStatus = run.cleanupConfirmed === false && windowMs !== undefined ? 1 : 0
  if (run.cleanupConfirmed === false) {
    process.stderr.write(`\nquality-harness: process cleanup could not be confirmed for `
      + `${hookFilePathFromPayload(raw) || 'this edit'}; its checker may still be running.\n`)
  }
  // Everything below is the harness failing to run, not a finding about the
  // edit. It used to exit 2, which BLOCKS the tool call: a Windows machine with
  // no Git Bash, a slow gate, a crashed shell — each one refused an edit it had
  // never even read. That is the failure the advisory rule exists to prevent,
  // and it is worse here than anywhere else, because the user is being stopped
  // by the harness's own breakage.
  if (run.outputLimitExceeded) {
    process.stderr.write(`\nquality-harness: ${scriptName} exceeded its ${maxOutputBytes}-byte output limit `
      + `for ${hookFilePathFromPayload(raw)}. Its output is incomplete; this artifact is unchecked. Nothing is blocked.\n`)
    return batchStatus
  }
  if (run.timedOut) {
    process.stderr.write(`quality-harness: ${scriptName} timed out after ${timeoutMs}ms, so the `
      + `gates have no verdict on ${hookFilePathFromPayload(raw) || 'this edit'}. Nothing is blocked.\n`)
    if (windowMs !== undefined) {
      process.stderr.write(`This timeout is a budget, not a finding about ${hookFilePathFromPayload(raw)}: `
        + `raise QUALITY_HARNESS_SHELL_TIMEOUT_MS (currently ${timeoutMs}ms, max 110000) `
        + `if needed. The boundary still caps the whole pass at ${Math.round(windowMs / 1000)}s.\n`)
    }
    return batchStatus
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

/**
 * archiveHistory reads only the historical README candidates needed by this pass.
 * Missing map entries mean unknown: the dispatcher performs its ordinary lookup.
 */
export function archiveHistory(paths, deadline, run = spawnSync) {
  const answers = new Map()
  if (paths.length < 2) return answers
  const roots = new Map()
  const groups = new Map()
  const git = (cwd, args, input) => {
    const remaining = deadline - Date.now()
    if (remaining < 1000) return null
    const result = run('git', ['-C', cwd, '--literal-pathspecs', ...args], {
      input, timeout: Math.min(remaining, 3000), maxBuffer: 4 * 1024 * 1024,
    })
    return !result.error && result.status === 0 ? result.stdout : null
  }
  for (const file of paths) {
    try {
      let directory = path.dirname(file)
      const suffix = [path.basename(file)]
      while (!statSyncDirectory(directory)) {
        const parent = path.dirname(directory)
        if (parent === directory) break
        suffix.unshift(path.basename(directory))
        directory = parent
      }
      // Native resolution aligns Windows short names with Git's long-path spelling.
      directory = realpathSync.native(directory)
      if (!roots.has(directory)) {
        const found = git(directory, ['rev-parse', '--show-toplevel'])
        roots.set(directory, found ? realpathSync.native(found.toString('utf8').trim()) : null)
      }
      const root = roots.get(directory)
      if (!root) continue
      const relative = path.relative(root, path.join(directory, ...suffix))
      if (!relative || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') continue
      const candidates = [relative.split(path.sep).join('/') + '/README.md']
      let parent = path.posix.dirname(relative.split(path.sep).join('/'))
      while (parent !== '.' && parent !== '/') {
        candidates.push(parent + '/README.md')
        parent = path.posix.dirname(parent)
      }
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root).push({ file, candidates })
    } catch { /* An unreadable path keeps the existing per-file discovery. */ }
  }
  for (const [root, files] of groups) {
    const candidates = [...new Set(files.flatMap(file => file.candidates))]
    // Keep the optimization within Windows argv limits; large sets keep the
    // original scoped lookup rather than widening to a repository-wide scan.
    if (candidates.join(' ').length > 16_000) continue
    const tree = git(root, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD', '--', ...candidates])
    if (tree === null || (tree.length && tree.at(-1) !== 0)) continue
    const blobs = new Map()
    let valid = true
    for (const row of tree.toString('utf8').split('\0').filter(Boolean)) {
      const entry = /^(\d{6}) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row)
      if (!entry) { valid = false; break }
      if (entry[2] === 'blob' && /^100/.test(entry[1])) blobs.set(entry[4], entry[3])
    }
    if (!valid) continue
    const ids = [...new Set(blobs.values())]
    const catalogs = new Set()
    if (ids.length) {
      // ls-tree and cat-file both exit zero for a completed empty answer. Unlike
      // grep's exit 1, that cannot be mistaken for a forcibly killed Windows Git.
      const data = git(root, ['cat-file', '--batch'], ids.join('\n') + '\n')
      if (data === null) continue
      let offset = 0
      for (const id of ids) {
        const newline = data.indexOf(10, offset)
        if (newline < 0) { valid = false; break }
        const header = /^([a-f0-9]+) blob (\d+)$/.exec(data.subarray(offset, newline).toString('utf8'))
        const size = Number(header?.[2])
        if (header?.[1] !== id || !Number.isSafeInteger(size) || size < 0
            || newline + 1 + size >= data.length || data[newline + 1 + size] !== 10) { valid = false; break }
        const lines = data.subarray(newline + 1, newline + 1 + size).toString('utf8').split('\n')
        if (lines.includes('**Lifecycle:** Frozen historical ADR records')) catalogs.add(id)
        offset = newline + size + 2
      }
      if (!valid || offset !== data.length) continue
    }
    for (const { file, candidates: nearestFirst } of files) {
      const catalog = nearestFirst.find(candidate => catalogs.has(blobs.get(candidate)))
      answers.set(file, catalog ? path.join(root, catalog) : '')
    }
  }
  return answers
}

function statSyncDirectory(directory) {
  try { return statSync(directory).isDirectory() } catch { return false }
}

// runArtifactBatch keeps one Node runner per boundary while each shell keeps its
// own timeout and process-tree cleanup. The deadline includes caller startup work.
export async function runArtifactBatch(raw) {
  let batch
  try { batch = JSON.parse(raw) } catch {}
  if (!Array.isArray(batch?.paths) || batch.paths.length === 0
      || !batch.paths.every(file => typeof file === 'string' && path.isAbsolute(file) && !file.includes('\0'))
      || !Number.isFinite(batch.deadline) || !Number.isFinite(batch.windowMs) || batch.windowMs <= 0
      || !Number.isFinite(batch.timeoutMs) || batch.timeoutMs < 100 || batch.timeoutMs > 110_000) {
    process.stderr.write('quality-harness: invalid artifact batch; the gates did not run.\n')
    return 2
  }
  const finish = startPerformanceTrace('artifact-batch', raw, process.env, batch.paths)
  const history = archiveHistory(batch.paths, batch.deadline)
  for (const [index, filePath] of batch.paths.entries()) {
    const remaining = batch.deadline - Date.now()
    if (remaining < 1_000) {
      process.stderr.write('The boundary\'s ' + Math.round(batch.windowMs / 1000)
        + 's window was exhausted before ' + filePath + ' was gated. '
        + 'This is a budget, not a finding: gate fewer artifacts per boundary, or commit in smaller sets.\n'
        + 'All remaining artifacts were not checked:\n' + batch.paths.slice(index).join('\n') + '\n')
      finish('budget-exhausted', { status: 0 })
      break
    }
    const status = await runShellHook('facts-gate-dispatch.sh',
      JSON.stringify({ tool_input: { file_path: filePath } }), {
        timeoutMs: Math.min(batch.timeoutMs, remaining), maxOutputBytes: ARTIFACT_OUTPUT_LIMIT,
        windowMs: batch.windowMs,
        archiveCatalog: history.get(filePath),
      })
    if (status !== 0) {
      process.stderr.write('The batch stopped after unconfirmed process cleanup. Unchecked artifacts:\n'
        + batch.paths.slice(index).join('\n') + '\n')
      finish('cleanup-unconfirmed', { status, cleanupConfirmed: false })
      break
    }
  }
  // All paths were attempted; individual shell records carry execution failures.
  finish('processed', { status: 0 })
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = process.argv[3] === '--batch' && process.argv[2] === 'facts-gate-dispatch.sh'
    ? await runArtifactBatch(await readStdin())
    : await runShellHook(process.argv[2])
}
