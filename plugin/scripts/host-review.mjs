#!/usr/bin/env node
// One review result for a host other than Claude's agent() (ADR-062).
// Cursor's `agent --help` (2026-09-22) is "Start the Cursor Agent": -p, --output-format json,
// --mode ask (read-only). The `cursor` binary opens the editor and is not this runner.
// Every Codex run the plugin starts is built here, by `codexInvocation` (ADR-098 T1): the codex-review and
// codex-advise skills launch through the `--prompt-file` form below rather than writing their own command.
// Pi stays unavailable until a command that prints its interface has been run; nothing here guesses argv.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isMainModule } from './main-module.mjs'

export const CODEX_MODEL = 'gpt-6.1-sol'
// The review-grade efforts `gpt-6.1-sol` exposes: `codex debug models --bundled` on codex-cli 0.162.0
// (2026-10-12) lists low, medium, high, xhigh, max and ultra; low and medium are not a verdict-bearing review.
export const EFFORTS = new Set(['high', 'xhigh', 'max', 'ultra'])
// One budget for every Codex run, and the run is killed at it: a review that outlives it is unavailable, never clean.
export const CODEX_TIMEOUT_MS = 600_000
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
  const run = spawnSync('sh', ['-c', 'command -v "$1"', 'which', name], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
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

// The one Codex command line: read-only, the pinned model and an explicit effort, a fresh session, the final message
// written to `output`, stdin closed (an open stdin can hold `codex exec` waiting for input, `.claude/rules/12-reviews.md`),
// and killed at the budget.
export function codexInvocation({ bin, repo, effort, prompt, output, ignoreUserConfig = false, skipGitRepoCheck = false }) {
  const argv = [
    'exec', ...(ignoreUserConfig ? ['--ignore-user-config'] : []), '-C', repo, '-s', 'read-only',
    '-m', CODEX_MODEL, '-c', `model_reasoning_effort="${effort}"`,
    '-c', 'sandbox_mode="read-only"', '--ephemeral', ...(skipGitRepoCheck ? ['--skip-git-repo-check'] : []),
    '-o', output, prompt,
  ]
  return {
    bin, argv,
    options: { encoding: 'utf8', timeout: CODEX_TIMEOUT_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  }
}

// `--ignore-user-config` keeps a user's MCP servers and config from changing the run; only builds that list it accept it.
function acceptsIgnoreUserConfig(bin, run) {
  const help = run(bin, ['exec', '--help'], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  return Boolean(help && !help.error && help.status === 0 && String(help.stdout ?? '').includes('--ignore-user-config'))
}

// One Codex run through `codexInvocation`: { text } on success, or { reason } — a run past its budget says so.
export function runCodex({ bin, repo, effort, prompt, skipGitRepoCheck = false, run = spawnSync }) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qh-codex-'))
  try {
    const call = codexInvocation({ bin, repo, effort, prompt, output: path.join(directory, 'last-message.txt'), ignoreUserConfig: acceptsIgnoreUserConfig(bin, run), skipGitRepoCheck })
    const child = run(call.bin, call.argv, call.options)
    if (child?.error?.code === 'ETIMEDOUT' || child?.signal === 'SIGKILL') {
      return { reason: `codex was killed at its budget of ${CODEX_TIMEOUT_MS / 1000} s` }
    }
    if (!child || child.error || child.status !== 0) return { reason: child?.error?.message ?? `codex exited ${child?.status}` }
    let text = ''
    try { text = readFileSync(path.join(directory, 'last-message.txt'), 'utf8') } catch { /* an older build: stdout carries it */ }
    return { text: text.trim() ? text : String(child.stdout ?? '') }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export function hostReview({ host, effort = 'high', model = null, repo, scope, requirements, evidence, resolve, run = spawnSync, output } = {}) {
  if (host === 'pi') return unavailable('pi', null, PI_UNMEASURED)
  const target = { repo, scope, requirements, evidence }
  if (host === 'cursor') return runCursor({ model, target, resolve: resolve ?? resolveCursorAgent, run, output })
  if (host !== 'codex') return unavailable(host ?? null, null, 'unknown host')
  if (!EFFORTS.has(effort)) return unavailable('codex', effort, `effort is not one of ${[...EFFORTS].join(', ')}`, CODEX_MODEL)
  if (output !== undefined) return reviewFromOutput(output, { host: 'codex', model: CODEX_MODEL, effort })
  const bin = (resolve ?? resolveCodex)()
  if (!bin) return unavailable('codex', effort, 'codex binary is absent', CODEX_MODEL)
  const missing = missingTarget(target)
  if (missing) return unavailable('codex', effort, missing, CODEX_MODEL)
  const result = runCodex({ bin, repo, effort, prompt: `CODEX-REVIEW-LEAF: ${reviewPrompt(target)}`, run })
  if (result.reason) return unavailable('codex', effort, result.reason, CODEX_MODEL)
  return reviewFromOutput(result.text, { host: 'codex', model: CODEX_MODEL, effort })
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
  const child = run(bin, args, { encoding: 'utf8', timeout: 600_000, cwd: target.repo, windowsHide: true })
  if (!child || child.error || child.status !== 0) {
    return unavailable('cursor', null, child?.error?.message ?? `agent exited ${child?.status}`, model)
  }
  return reviewFromOutput(child.stdout, { host: 'cursor', model, effort: null })
}

function arg(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

// The `--prompt-file` form is the skills' launcher: the caller's own prompt (codex-review's VERDICT block, codex-advise's
// advice), run through `runCodex`, and Codex's final message printed as it is. Exit 2 with the reason when it could not run.
function promptFileMain() {
  const effort = arg('--effort') ?? 'high'
  const repo = arg('--repo')
  const file = arg('--prompt-file')
  const fail = reason => { process.stderr.write(`host-review: unavailable — ${reason}\n`); process.exit(2) }
  if (arg('--host') !== 'codex') fail('--prompt-file runs Codex only: pass --host codex')
  if (!EFFORTS.has(effort)) fail(`effort is not one of ${[...EFFORTS].join(', ')}`)
  if (typeof repo !== 'string' || !repo) fail('no repository was named (--repo)')
  let prompt
  try { prompt = readFileSync(file, 'utf8') } catch (error) { fail(`the prompt file could not be read: ${error.code ?? error.message}`) }
  if (!prompt.trim()) fail('the prompt file is empty')
  const bin = resolveCodex()
  if (!bin) fail('codex binary is absent')
  const result = runCodex({ bin, repo, effort, prompt, skipGitRepoCheck: process.argv.includes('--skip-git-repo-check') })
  if (result.reason) fail(result.reason)
  if (!result.text.trim()) fail('codex returned an empty final message')
  process.stdout.write(result.text.endsWith('\n') ? result.text : `${result.text}\n`)
  process.exit(0)
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--prompt-file')) promptFileMain()
  const result = hostReview({
    host: arg('--host'), effort: arg('--effort') ?? 'high', model: arg('--model') ?? null, repo: arg('--repo'),
    scope: arg('--scope'), requirements: arg('--requirements') ?? '', evidence: arg('--evidence') ?? '',
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.status === 'unavailable' ? 2 : 0)
}
