#!/usr/bin/env node
// One review result for a host other than Claude's agent() (ADR-062).
// Cursor's `agent --help` (2026-09-22) is "Start the Cursor Agent": -p, --output-format json,
// --mode ask (read-only). The `cursor` binary opens the editor and is not this runner.
// Codex uses the invocation codex-review already specifies. Pi stays unavailable
// until a command that prints its interface has been run; nothing here guesses argv.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isMainModule } from './main-module.mjs'

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

// The whole schema, or it is not a review (Codex review, 2026-09-22): a missing
// `findings` read as `[]` and certified clean, and so did a string.
const FINDING_TEXT = ['file', 'problem', 'impact', 'evidence', 'minimal_fix']
export function validReview(parsed) {
  if (!parsed || typeof parsed !== 'object' || !REVIEW_STATUS.has(parsed.status) || !Array.isArray(parsed.findings)) return false
  const wellFormed = parsed.findings.every(finding => finding && typeof finding === 'object'
    && FINDING_TEXT.every(key => typeof finding[key] === 'string')
    && (finding.severity === 'blocking' || finding.severity === 'advisory'))
  if (!wellFormed) return false
  const blocking = parsed.findings.some(finding => finding.severity === 'blocking')
  if (parsed.status === 'blocking') return blocking
  if (parsed.status === 'clean') return !blocking
  return true
}

export function reviewFromOutput(text, { host, model = null, effort = null } = {}) {
  const parsed = jsonObject(text)
  if (!validReview(parsed)) {
    return unavailable(host, effort, 'the host did not return the review schema', model)
  }
  const printed = typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : null
  return {
    status: parsed.status,
    host,
    model: printed ?? model,
    effort,
    bound: printed ? 'reported' : 'unproven',
    findings: parsed.findings,
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

// A host that is not told what to review has not reviewed it (Codex review,
// 2026-09-22): the first prompt named only the reply format.
export function reviewPrompt({ repo, scope, requirements = '', evidence = '' }) {
  return [
    'You are an assigned read-only leaf reviewer. Do not edit, stage, commit, push, or start another review session.',
    `Repository: ${JSON.stringify(repo)}. Scope: ${JSON.stringify(scope)}.`,
    'Inspect exactly that scope, read-only: for "uncommitted", `git status --short`, `git diff HEAD` and every untracked path; for "commit <sha>", `git show <sha>`; for "base <ref>", `git diff <ref>...HEAD`.',
    `Requirements: ${JSON.stringify(requirements || 'use repository-owned acceptance criteria')}.`,
    `Caller-observed evidence (immutable): ${evidence || 'none supplied'}.`,
    'Reply with one JSON object {status, findings, model} and nothing else. status is clean, blocking, evidence-limited, or unavailable.',
    'Each finding is {file, line, problem, impact, evidence, minimal_fix, severity}, severity blocking or advisory.',
  ].join('\n')
}

export function hostReview({ host, effort = 'high', model = null, repo, scope, requirements, evidence, resolve, run = spawnSync, output } = {}) {
  if (host === 'pi') return unavailable('pi', null, PI_UNMEASURED)
  const target = { repo, scope, requirements, evidence }
  if (host === 'cursor') return runCursor({ model, target, resolve: resolve ?? resolveCursorAgent, run, output })
  if (host !== 'codex') return unavailable(host ?? null, null, 'unknown host')
  if (!EFFORTS.has(effort)) return unavailable('codex', effort, 'effort is not high, xhigh, or ultra', CODEX_MODEL)
  if (output !== undefined) return reviewFromOutput(output, { host: 'codex', model: CODEX_MODEL, effort })
  const bin = (resolve ?? resolveCodex)()
  if (!bin) return unavailable('codex', effort, 'codex binary is absent', CODEX_MODEL)
  const missing = missingTarget(target)
  if (missing) return unavailable('codex', effort, missing, CODEX_MODEL)
  const child = run(bin, [
    'exec', '-C', repo, '-s', 'read-only',
    '-m', CODEX_MODEL, '-c', `model_reasoning_effort="${effort}"`,
    '-c', 'sandbox_mode="read-only"', '--ephemeral',
    `CODEX-REVIEW-LEAF: ${reviewPrompt(target)}`,
  ], { encoding: 'utf8', timeout: 600_000 })
  if (!child || child.error || child.status !== 0) {
    return unavailable('codex', effort, child?.error?.message ?? `codex exited ${child?.status}`, CODEX_MODEL)
  }
  return reviewFromOutput(child.stdout, { host: 'codex', model: CODEX_MODEL, effort })
}

function missingTarget({ repo, scope }) {
  if (typeof repo !== 'string' || !repo) return 'no repository was named'
  if (typeof scope !== 'string' || !scope.trim()) return 'no review scope was named'
  return null
}

function runCursor({ model, target, resolve, run, output }) {
  if (output !== undefined) return reviewFromOutput(output, { host: 'cursor', model, effort: null })
  const bin = resolve()
  if (!bin) return unavailable('cursor', null, 'cursor agent binary is absent', model)
  const missing = missingTarget(target)
  if (missing) return unavailable('cursor', null, missing, model)
  const args = ['-p', '--output-format', 'json', '--mode', 'ask', '--sandbox', 'enabled', reviewPrompt(target)]
  if (typeof model === 'string' && model.trim()) args.splice(args.length - 1, 0, '--model', model.trim())
  const child = run(bin, args, { encoding: 'utf8', timeout: 600_000, cwd: target.repo })
  if (!child || child.error || child.status !== 0) {
    return unavailable('cursor', null, child?.error?.message ?? `agent exited ${child?.status}`, model)
  }
  return reviewFromOutput(child.stdout, { host: 'cursor', model, effort: null })
}

function arg(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (isMainModule(import.meta.url)) {
  const result = hostReview({
    host: arg('--host'), effort: arg('--effort') ?? 'high', model: arg('--model') ?? null, repo: arg('--repo'),
    scope: arg('--scope'), requirements: arg('--requirements') ?? '', evidence: arg('--evidence') ?? '',
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.status === 'unavailable' ? 2 : 0)
}
