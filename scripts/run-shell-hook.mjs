#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
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

export function resolveBashExecutable(platform = process.platform, env = process.env) {
  if (platform === 'win32' && env.CLAUDE_CODE_GIT_BASH_PATH) {
    return env.CLAUDE_CODE_GIT_BASH_PATH
  }
  return 'bash'
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
  const run = await runWithTimeout(resolveBashExecutable(), [scriptPath], {
    input: normalizeHookPayload(await readStdin()),
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
