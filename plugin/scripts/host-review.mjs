#!/usr/bin/env node
// One review result for a host other than Claude's agent() (ADR-062).
// Cursor's `agent --help` (2026-09-22) is "Start the Cursor Agent": -p, --output-format json,
// --mode ask (read-only). The `cursor` binary opens the editor and is not this runner.
// Every Codex run the plugin starts is built here, by `codexInvocation` (ADR-098 T1): the codex-review and
// codex-advise skills launch through the `--prompt-file` form below rather than writing their own command.
// Pi stays unavailable until a command that prints its interface has been run; nothing here guesses argv.
// Claude's host is a fresh headless `claude -p` (2026-10-15): no shell, the scope's diff handed to it, recorded like the others.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stateDir } from './event-log.mjs'
import { isMainModule } from './main-module.mjs'

export const CODEX_MODEL = 'gpt-6.1-sol'
// The review-grade efforts `gpt-6.1-sol` exposes: `codex debug models --bundled` on codex-cli 0.162.0
// (2026-10-12) lists low, medium, high, xhigh, max and ultra; low and medium are not a verdict-bearing review.
export const EFFORTS = new Set(['high', 'xhigh', 'max', 'ultra'])
// One budget for every Codex run, and the run is killed at it: a review that outlives it is unavailable, never clean.
export const CODEX_TIMEOUT_MS = 600_000
// The Claude reviewer's pinned model: `claude -p --model` takes the full name (Claude Code 2.1.300, 2026-10-15).
export const CLAUDE_MODEL = 'claude-opus-5-5'
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
  // ADR-119 T2: the model the launcher pinned is the model (runs pinned to gpt-6.1-sol printed "gpt-6" and "Codex"). A printed
  // one that differs is kept as `reportedModel`; with no pin, what it printed is all there is, and nothing proves it.
  const pin = typeof model === 'string' && model.trim() ? model.trim() : null
  const disagrees = Boolean(pin && printed && printed !== pin)
  return {
    status: parsed.status,
    host,
    model: pin ?? printed,
    effort,
    bound: !pin ? 'unproven' : disagrees ? 'disagrees' : 'pinned',
    ...(disagrees ? { reportedModel: printed } : {}),
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

export function resolveClaude(which = commandWhich) {
  return which('claude')
}

// The review skill's `## Blocking findings` block, for a host that can load no skill (ADR-098 T2). A mirror, held equal to that
// block by tests/review-contract.test.mjs.
export const BLOCKING_CRITERIA = `A finding blocks only when all are true:

1. It is inside stated scope or a regression caused by the diff.
2. It is material to correctness, security, data integrity, required behavior, or concrete
   maintainability.
3. It cites exact code plus a failing check, reproduction, violated contract, or direct trace.
4. It has a minimal in-scope remedy.
5. It explains why existing passing evidence does not already settle the concern.

Style preferences, future-proofing, alternative architectures, speculative edge cases, raw
duplication, and optional cleanup are advisory.`

// A host that is not told what to review has not reviewed it (Codex review,
// 2026-09-22): the first prompt named only the reply format.
export function reviewPrompt({ repo, scope, requirements = '', evidence = '' }) {
  return [
    'You are an assigned read-only leaf reviewer. Do not edit, stage, commit, push, or start another review session.',
    `Repository: ${JSON.stringify(repo)}. Scope: ${JSON.stringify(scope)}.`,
    'Inspect exactly that scope, read-only: for "uncommitted", `git status --short`, `git diff HEAD` and every untracked path; for "commit <sha>", `git show <sha>`; for "base <ref>", `git diff <ref>...HEAD`.',
    `Requirements: ${JSON.stringify(requirements || 'use repository-owned acceptance criteria')}.`,
    `Caller-observed evidence (immutable): ${evidence || 'none supplied'}.`,
    BLOCKING_CRITERIA,
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
  const help = run(bin, ['exec', '--help'], { encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  return Boolean(help && !help.error && help.status === 0 && String(help.stdout ?? '').includes('--ignore-user-config'))
}

// One Codex run through `codexInvocation`: { text } on success, or { reason } — a run past its budget says so, and a run
// stopped by a signal before it says which signal: only the deadline is the budget.
export function runCodex({ bin, repo, effort, prompt, skipGitRepoCheck = false, run = spawnSync }) {
  let directory
  try { directory = mkdtempSync(path.join(os.tmpdir(), 'qh-codex-')) } catch (error) {
    return { reason: `a temporary directory for its final message could not be made (${error.code ?? error.message})` }
  }
  try {
    const call = codexInvocation({ bin, repo, effort, prompt, output: path.join(directory, 'last-message.txt'), ignoreUserConfig: acceptsIgnoreUserConfig(bin, run), skipGitRepoCheck })
    const child = run(call.bin, call.argv, call.options)
    if (child?.error?.code === 'ETIMEDOUT') {
      return { reason: `codex was killed at its budget of ${CODEX_TIMEOUT_MS / 1000} s` }
    }
    if (child?.signal) return { reason: `codex was stopped by ${child.signal} before it finished` }
    // Its own last stderr line says why: a bare exit status told a quota from a dropped stream from a bad contract by nothing.
    // codex ends stderr with a "tokens used" footer, which is not a reason, so that is skipped (measured 2026-10-15).
    const lines = String(child?.stderr ?? '').trim().split('\n').map(line => line.trim()).filter(line => line && !/^(?:tokens used|[\d,]+)$/.test(line))
    const said = lines.at(-1)?.slice(0, 300)
    if (!child || child.error || child.status !== 0) return { reason: child?.error?.message ?? `codex exited ${child?.status}${said ? `: ${said}` : ''}` }
    let text = ''
    try { text = readFileSync(path.join(directory, 'last-message.txt'), 'utf8') } catch { /* an older build: stdout carries it */ }
    return { text: text.trim() ? text : String(child.stdout ?? '') }
  } finally {
    try { rmSync(directory, { recursive: true, force: true }) } catch (error) {
      process.stderr.write(`host-review: the temporary directory ${directory} was not removed (${error.code ?? error.message})\n`)
    }
  }
}

// ADR-100 T1: what a review covered, as full shas resolved before it ran. `base <ref>` is `<ref>..HEAD`; `commit <sha>` is
// exact, that commit alone, because Codex is shown `git show <sha>`, a merge included; `uncommitted` names no commit.
function gitSha(repo, ref) {
  const run = spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { encoding: 'utf8', timeout: 10_000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  const sha = run.status === 0 ? String(run.stdout ?? '').trim() : ''
  return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null
}

export function scopeRange(repo, scope) {
  const words = String(scope ?? '').trim().split(/\s+/)
  if (words[0] === 'base' && words[1]) return { base: gitSha(repo, words[1]), head: gitSha(repo, 'HEAD'), exact: false }
  if (words[0] === 'commit' && words[1]) return { base: null, head: gitSha(repo, words[1]), exact: true }
  return { base: null, head: null, exact: false }
}

// The status of a `--prompt-file` run, from the LAST verdict line Codex printed: the contract quotes the grammar itself, and
// the skill's strongest verdict without runnable evidence carries a suffix (`codex-review/SKILL.md:181`). None is `unparsed`.
const VERDICT_LINE = /^VERDICT:\s*(APPROVE|REQUEST CHANGES|EVIDENCE-LIMITED)(?:\s+—\s+.*)?\s*$/
const VERDICT_STATUS = { APPROVE: 'clean', 'REQUEST CHANGES': 'blocking', 'EVIDENCE-LIMITED': 'evidence-limited' }
export function verdictStatus(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('VERDICT:'))
  const last = lines.length ? VERDICT_LINE.exec(lines.at(-1)) : null
  return last ? VERDICT_STATUS[last[1]] : 'unparsed'
}

// One row per Codex run the launcher started, beside `checks.jsonl`, where `release-evidence` reads it (ADR-100 T1). A row
// that cannot be written is said and changes nothing else: the review's own answer still reaches its caller.
export const REVIEWS_FILE = 'reviews.jsonl'
// What counts as a review: one that ran and said something. `unavailable` did not finish, `unparsed` said nothing this could
// read, and `evidence-limited` ran over its scope without runnable evidence (ADR-100 T1). The one definition: release-evidence
// asks it of a release, and branch-state of HEAD for the status line.
export const REVIEW_COVERING = new Set(['clean', 'blocking', 'evidence-limited'])
export function recordReview(repo, row) {
  try {
    const directory = stateDir(repo)
    mkdirSync(directory, { recursive: true })
    appendFileSync(path.join(directory, REVIEWS_FILE), `${JSON.stringify({ id: randomUUID(), at: new Date().toISOString(), ...row })}\n`, 'utf8')
    return true
  } catch (error) {
    process.stderr.write(`host-review: the review was not recorded (${error?.code ?? error?.message ?? error})\n`)
    return false
  }
}

export function hostReview({ host, effort = 'high', model = null, repo, scope, requirements, evidence, resolve, run = spawnSync, output } = {}) {
  if (host === 'pi') return unavailable('pi', null, PI_UNMEASURED)
  const target = { repo, scope, requirements, evidence }
  if (host === 'cursor' || host === 'claude') {
    // Recorded as a Codex run is, so release-evidence sees it: on 2026-10-15 Codex refused this repository and the owner
    // chose a recorded Claude review in its place, through Cursor first; Cursor could not run a named model here, so
    // through `claude -p`. A review handed its output ran nothing and records nothing.
    // The range is resolved before the run, as Codex's is: a commit that lands while it runs was not reviewed (the
    // recorded Claude review of 18879680..8892eb9c).
    const range = output === undefined && !missingTarget(target) ? scopeRange(repo, scope) : null
    const review = host === 'cursor'
      ? runCursor({ model, target, resolve: resolve ?? resolveCursorAgent, run, output })
      : runClaude({ model: model ?? CLAUDE_MODEL, target, range, resolve: resolve ?? resolveClaude, run, output })
    if (range) {
      recordReview(repo, { host, model: review.model ?? model, bound: review.bound, reportedModel: review.reportedModel, effort: null, ...range, status: review.status, findings: review.findings.length })
    }
    return review
  }
  if (host !== 'codex') return unavailable(host ?? null, null, 'unknown host')
  if (!EFFORTS.has(effort)) return unavailable('codex', effort, `effort is not one of ${[...EFFORTS].join(', ')}`, CODEX_MODEL)
  if (output !== undefined) return reviewFromOutput(output, { host: 'codex', model: CODEX_MODEL, effort })
  const bin = (resolve ?? resolveCodex)()
  if (!bin) return unavailable('codex', effort, 'codex binary is absent', CODEX_MODEL)
  const missing = missingTarget(target)
  if (missing) return unavailable('codex', effort, missing, CODEX_MODEL)
  const range = scopeRange(repo, scope)
  const result = runCodex({ bin, repo, effort, prompt: `CODEX-REVIEW-LEAF: ${reviewPrompt(target)}`, run })
  const review = result.reason ? unavailable('codex', effort, result.reason, CODEX_MODEL) : reviewFromOutput(result.text, { host: 'codex', model: CODEX_MODEL, effort })
  recordReview(repo, { host: 'codex', model: review.model ?? CODEX_MODEL, bound: review.bound, reportedModel: review.reportedModel, effort, ...range, status: review.status, findings: review.findings.length })
  return review
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
  // `--trust`: headless, the agent refuses a workspace nobody has trusted (measured 2026-10-15); it stays ask-mode and sandboxed.
  const args = ['-p', '--output-format', 'json', '--mode', 'ask', '--sandbox', 'enabled', '--trust', reviewPrompt(target)]
  if (typeof model === 'string' && model.trim()) args.splice(args.length - 1, 0, '--model', model.trim())
  const child = run(bin, args, { encoding: 'utf8', timeout: 600_000, cwd: target.repo, windowsHide: true })
  if (!child || child.error || child.status !== 0) {
    // Its own last line says why; the agent writes its refusals to stdout.
    const said = `${child?.stderr ?? ''}\n${child?.stdout ?? ''}`.trim().split('\n').map(line => line.trim()).filter(Boolean).at(-1)?.slice(0, 300)
    return unavailable('cursor', null, child?.error?.message ?? `agent exited ${child?.status}${said ? `: ${said}` : ''}`, model)
  }
  return reviewFromOutput(child.stdout, { host: 'cursor', model, effort: null })
}

// `--safe-mode` loads no hooks, plugins or CLAUDE.md, so no Stop hook can continue the reviewer's turn; `dontAsk` denies
// whatever the allowlist does not name (measured 2026-10-15, Claude Code 2.1.300: a `touch` was denied). It has no shell:
// with git allowed by prefix, `git diff --output=<file>` could write (BACKLOG §381), so the launcher writes the scope's diff
// where the reviewer may read it, and only Read, Grep and Glob are offered. The answer is the envelope's `result`, and an
// error envelope is not a review whatever its text says.
function runClaude({ model, target, range, resolve, run, output }) {
  if (output !== undefined) return reviewFromOutput(output, { host: 'claude', model, effort: null })
  const bin = resolve()
  if (!bin) return unavailable('claude', null, 'claude binary is absent', model)
  const missing = missingTarget(target)
  if (missing) return unavailable('claude', null, missing, model)
  const diff = scopeDiff(target.repo, target.scope, range)
  if (diff === null) return unavailable('claude', null, `the diff of scope ${JSON.stringify(target.scope)} could not be made`, model)
  let directory
  try { directory = mkdtempSync(path.join(os.tmpdir(), 'qh-claude-review-')) } catch (error) {
    return unavailable('claude', null, `a directory for the scope's diff could not be made (${error.code ?? error.message})`, model)
  }
  try {
    const file = path.join(directory, 'scope.diff')
    writeFileSync(file, diff, 'utf8')
    const prompt = `${reviewPrompt(target)}\nYou have no shell. The launcher wrote that scope's commits and diff to ${JSON.stringify(file)}: read it there, and read any file of the repository you need.`
    const args = ['-p', '--output-format', 'json', '--safe-mode', '--no-session-persistence', '--strict-mcp-config',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', 'Read,Grep,Glob', '--add-dir', directory,
      '--model', model, prompt]
    const child = run(bin, args, { encoding: 'utf8', timeout: 600_000, killSignal: 'SIGKILL', cwd: target.repo, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    return claudeReview(child, model)
  } catch (error) {
    return unavailable('claude', null, `the scope's diff could not be written (${error.code ?? error.message})`, model)
  } finally {
    try { rmSync(directory, { recursive: true, force: true }) } catch (error) {
      process.stderr.write(`host-review: the temporary directory ${directory} was not removed (${error.code ?? error.message})\n`)
    }
  }
}

// What the reviewer is shown, made here because it has no shell: for `base`, the commits and their diff over the range
// resolved before the run; for `commit`, that commit; for `uncommitted`, the status and the diff against HEAD (an untracked
// file it reads itself). Null when git could not say.
function scopeDiff(repo, scope, range) {
  const git = args => {
    const child = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 60_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
    return child.status === 0 ? String(child.stdout ?? '') : null
  }
  const kind = String(scope ?? '').trim().split(/\s+/)[0]
  const parts = kind === 'base' && range?.base && range?.head ? [git(['log', '--oneline', `${range.base}..${range.head}`]), git(['diff', `${range.base}...${range.head}`])]
    : kind === 'commit' && range?.head ? [git(['show', range.head])]
      : kind === 'uncommitted' ? [git(['status', '--short']), git(['diff', 'HEAD'])]
        : [null]
  return parts.every(part => part !== null) ? parts.join('\n') : null
}

function claudeReview(child, model) {
  if (child?.error?.code === 'ETIMEDOUT') return unavailable('claude', null, 'claude was killed at its budget of 600 s', model)
  if (!child || child.error || child.status !== 0) {
    const said = `${child?.stderr ?? ''}\n${child?.stdout ?? ''}`.trim().split('\n').map(line => line.trim()).filter(Boolean).at(-1)?.slice(0, 300)
    return unavailable('claude', null, child?.error?.message ?? `claude exited ${child?.status}${said ? `: ${said}` : ''}`, model)
  }
  let envelope = null
  try { envelope = JSON.parse(child.stdout) } catch { /* not an envelope: nothing to read */ }
  if (!envelope || envelope.is_error !== false || typeof envelope.result !== 'string') {
    return unavailable('claude', null, `claude did not finish a review${envelope?.subtype ? ` (${envelope.subtype})` : ''}`, model)
  }
  // A fenced object is still the object.
  return reviewFromOutput(envelope.result.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''), { host: 'claude', model, effort: null })
}

function arg(name, argv = process.argv) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

// The `--prompt-file` form is the skills' launcher: the caller's own prompt (codex-review's VERDICT block, codex-advise's
// advice), run through `runCodex`, and Codex's final message printed as it is. Code 2 with the reason when it could not run.
// `--range <base>..<head>` names what it reviewed, resolved before the run; the row records the status of the last
// VERDICT line (ADR-100 T1). Exported with its seams so the row is testable without a real Codex.
export function promptFileReview({ argv = process.argv, resolve = resolveCodex, run = spawnSync } = {}) {
  const effort = arg('--effort', argv) ?? 'high'
  const repo = arg('--repo', argv)
  const file = arg('--prompt-file', argv)
  const fail = reason => ({ code: 2, out: '', err: `host-review: unavailable — ${reason}\n` })
  if (arg('--host', argv) !== 'codex') return fail('--prompt-file runs Codex only: pass --host codex')
  if (!EFFORTS.has(effort)) return fail(`effort is not one of ${[...EFFORTS].join(', ')}`)
  if (typeof repo !== 'string' || !repo) return fail('no repository was named (--repo)')
  let range = { base: null, head: null, exact: false }
  if (argv.includes('--range')) {
    // A revision may hold dots (a release tag, `v3.8.25`), so the base is the shortest prefix before `..`. A three-dot
    // range leaves a head that starts with a dot, which git resolves to no revision, so it is refused below.
    const named = /^(\S+?)\.\.(\S+)$/.exec(String(arg('--range', argv) ?? ''))
    const resolved = named && { base: gitSha(repo, named[1]), head: gitSha(repo, named[2]), exact: false }
    if (!resolved?.base || !resolved?.head) return fail(`--range must be <base>..<head>, two revisions this repository has (got ${JSON.stringify(arg('--range', argv) ?? '')})`)
    range = resolved
  }
  let prompt
  try { prompt = readFileSync(file, 'utf8') } catch (error) { return fail(`the prompt file could not be read: ${error.code ?? error.message}`) }
  if (!prompt.trim()) return fail('the prompt file is empty')
  const bin = resolve()
  if (!bin) return fail('codex binary is absent')
  const result = runCodex({ bin, repo, effort, prompt, skipGitRepoCheck: argv.includes('--skip-git-repo-check'), run })
  const text = result.reason ? '' : result.text
  const status = result.reason || !text.trim() ? 'unavailable' : verdictStatus(text)
  recordReview(repo, { host: 'codex', model: CODEX_MODEL, bound: status === 'unavailable' ? 'unproven' : 'pinned', effort, ...range, status, findings: null })
  if (result.reason) return fail(result.reason)
  if (!text.trim()) return fail('codex returned an empty final message')
  return { code: 0, out: text.endsWith('\n') ? text : `${text}\n`, err: '' }
}

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--prompt-file')) {
    const said = promptFileReview()
    process.stdout.write(said.out)
    process.stderr.write(said.err)
    process.exit(said.code)
  }
  const result = hostReview({
    host: arg('--host'), effort: arg('--effort') ?? 'high', model: arg('--model') ?? null, repo: arg('--repo'),
    scope: arg('--scope'), requirements: arg('--requirements') ?? '', evidence: arg('--evidence') ?? '',
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.status === 'unavailable' ? 2 : 0)
}
