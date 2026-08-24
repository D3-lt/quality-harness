#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const HOOK_SCRIPTS = new Set(['facts-gate-dispatch.sh', 'post-edit-check.sh'])
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

function hookArguments(scriptName, raw, platform) {
  const payload = parsedHookPayload(raw, platform)
  const filePath = hookFilePathFromPayload(raw, platform) ?? ''
  if (scriptName === 'facts-gate-dispatch.sh') return [filePath]
  if (scriptName === 'post-edit-check.sh') {
    const toolName = typeof payload?.tool_name === 'string' ? payload.tool_name : ''
    return [toolName, filePath]
  }
  return []
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
    if (!directory || /[\\/]system32[\\/]?$/i.test(directory)) continue
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

function terminateProcessTree(child, platform) {
  if (!child.pid) return
  if (platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

export function runWithTimeout(executable, args, options = {}) {
  const {
    input = '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    platform = process.platform,
    env = process.env,
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

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', chunk => { stdout += chunk })
    child.stderr?.on('data', chunk => { stderr += chunk })
    child.on('error', error => { spawnError = error })

    const timer = setTimeout(() => {
      timedOut = true
      terminateProcessTree(child, platform)
    }, timeoutMs)

    child.on('close', status => {
      clearTimeout(timer)
      resolve({ error: spawnError, status, stderr, stdout, timedOut })
    })
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  })
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
    process.stderr.write('quality-harness: Git Bash was not found. Set CLAUDE_CODE_GIT_BASH_PATH to Git for Windows bin/bash.exe.\n')
    return 2
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
  if (run.stdout) process.stdout.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  if (run.timedOut) {
    process.stderr.write(`quality-harness: ${scriptName} timed out after ${timeoutMs}ms\n`)
    return 2
  }
  if (run.error) {
    process.stderr.write(`quality-harness: could not run ${scriptName}: ${run.error.message}\n`)
    return 2
  }
  return Number.isInteger(run.status) ? run.status : 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runShellHook(process.argv[2])
}
