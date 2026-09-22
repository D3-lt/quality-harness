#!/usr/bin/env node
// One review result for a host other than Claude's agent() (ADR-062).
// Cursor's `agent --help` (2026-09-22) is "Start the Cursor Agent": -p, --output-format json,
// --mode ask (read-only). The `cursor` binary opens the editor and is not this runner.
// Codex uses the invocation codex-review already specifies. Pi stays unavailable
// until a command that prints its interface has been run; nothing here guesses argv.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const CODEX_MODEL = 'gpt-6-astra'
export const EFFORTS = new Set(['high', 'xhigh', 'ultra'])
export const REVIEW_STATUS = new Set(['clean', 'blocking', 'evidence-limited', 'unavailable'])
// Measured 2026-09-22: `command -v pi` printed nothing.
export const PI_UNMEASURED = 'pi invocation was not measured'

const CODEX_APP = '/Applications/ChatGPT.app/Contents/Resources/codex'

export function unavailable(host, effort, reason, model = null) {
  return {
    status: 'unavailable', host, model, effort: effort ?? null, bound: 'unproven', findings: [], reason,
  }
}

export function reviewFromOutput(text, { host, model = null, effort = null } = {}) {
  const parsed = jsonObject(text)
  if (!parsed || !REVIEW_STATUS.has(parsed.status)) {
    return unavailable(host, effort, 'the host did not return the review schema', model)
  }
  const printed = typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : null
  return {
    status: parsed.status,
    host,
    model: printed ?? model,
    effort,
    bound: printed ? 'reported' : 'unproven',
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  }
}

function jsonObject(text) {
  const source = String(text ?? '').trim()
  if (!source) return null
  try {
    const whole = JSON.parse(source)
    if (whole && typeof whole === 'object') return whole
  } catch { /* the message may surround the object */ }
  const start = source.lastIndexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(source.slice(start, end + 1)) } catch { return null }
}

export function resolveCodex(env = process.env, exists = existsSync, which = commandWhich) {
  const named = typeof env.CODEX_CLI_PATH === 'string' ? env.CODEX_CLI_PATH.trim() : ''
  if (named && exists(named)) return named
  if (exists(CODEX_APP)) return CODEX_APP
  return which('codex')
}

function commandWhich(name) {
  const run = spawnSync('sh', ['-c', 'command -v "$1"', 'which', name], { encoding: 'utf8', timeout: 5_000 })
  if (run.status !== 0) return null
  const found = run.stdout.trim()
  return found || null
}

export function resolveCursorAgent(which = commandWhich) {
  return which('agent')
}

const REVIEW_PROMPT = 'Reply with one JSON object {status, findings, model} and nothing else. status is clean, blocking, evidence-limited, or unavailable.'

export function hostReview({ host, effort = 'high', model = null, repo, resolve, run = spawnSync, output } = {}) {
  if (host === 'pi') return unavailable('pi', null, PI_UNMEASURED)
  if (host === 'cursor') return runCursor({ model, repo, resolve: resolve ?? resolveCursorAgent, run, output })
  if (host !== 'codex') return unavailable(host ?? null, null, 'unknown host')
  if (!EFFORTS.has(effort)) return unavailable('codex', effort, 'effort is not high, xhigh, or ultra', CODEX_MODEL)
  if (output !== undefined) return reviewFromOutput(output, { host: 'codex', model: CODEX_MODEL, effort })
  const bin = (resolve ?? resolveCodex)()
  if (!bin) return unavailable('codex', effort, 'codex binary is absent', CODEX_MODEL)
  if (typeof repo !== 'string' || !repo) return unavailable('codex', effort, 'no repository was named', CODEX_MODEL)
  const child = run(bin, [
    'exec', '-C', repo, '-s', 'read-only',
    '-m', CODEX_MODEL, '-c', `model_reasoning_effort="${effort}"`,
    '-c', 'sandbox_mode="read-only"', '--ephemeral',
    `CODEX-REVIEW-LEAF: ${REVIEW_PROMPT}`,
  ], { encoding: 'utf8', timeout: 600_000 })
  if (!child || child.error || child.status !== 0) {
    return unavailable('codex', effort, child?.error?.message ?? `codex exited ${child?.status}`, CODEX_MODEL)
  }
  return reviewFromOutput(child.stdout, { host: 'codex', model: CODEX_MODEL, effort })
}

function runCursor({ model, repo, resolve, run, output }) {
  if (output !== undefined) return reviewFromOutput(output, { host: 'cursor', model, effort: null })
  const bin = resolve()
  if (!bin) return unavailable('cursor', null, 'cursor agent binary is absent', model)
  if (typeof repo !== 'string' || !repo) return unavailable('cursor', null, 'no repository was named', model)
  const args = ['-p', '--output-format', 'json', '--mode', 'ask', '--sandbox', 'enabled', REVIEW_PROMPT]
  if (typeof model === 'string' && model.trim()) args.splice(args.length - 1, 0, '--model', model.trim())
  const child = run(bin, args, { encoding: 'utf8', timeout: 600_000, cwd: repo })
  if (!child || child.error || child.status !== 0) {
    return unavailable('cursor', null, child?.error?.message ?? `agent exited ${child?.status}`, model)
  }
  return reviewFromOutput(child.stdout, { host: 'cursor', model, effort: null })
}

function arg(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = hostReview({
    host: arg('--host'), effort: arg('--effort') ?? 'high', model: arg('--model') ?? null, repo: arg('--repo'),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.status === 'unavailable' ? 2 : 0)
}
