#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MUTATION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt'])
const UNRESOLVED_MARKDOWN_MUTATION = '<Unresolved Markdown Bash mutation>'
const UNRESOLVED_DELETION_MUTATION = '<Unresolved Bash deletion>'
const VALIDATION_PATTERNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint|check|typecheck|build|verify|validate)\b/i,
  /^(?:cargo\s+(?:test|check|build|clippy)|go\s+(?:test|build|vet)|dotnet\s+(?:test|build)|swift\s+test)\b/i,
  /^(?:pytest|python(?:3)?\s+-m\s+(?:pytest|unittest)|phpunit|pest|rspec|bundle\s+exec\s+rspec)\b/i,
  /^(?:npx\s+)?(?:tsc|eslint|ruff|mypy|pyright|shellcheck)\b/i,
  /^(?:node\s+(?:--check|--test)|bash\s+-n|php\s+-l|jq\s+empty|claude\s+plugin\s+validate)\b/i,
  /^(?:make|just)\s+(?:test|check|lint|build|verify|validate)\b/i,
  /^(?!test(?:\s|$))(?=\S*(?:test|lint|check|verify|validate|selftest))\S+(?:\s|$)/i,
  /^(?:node\s+)?(?:\S*\/)?verify\.mjs\s+--cwd\s+/i,
]

function walk(value, visit) {
  if (!value || typeof value !== 'object') return
  visit(value)
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  for (const child of Object.values(value)) walk(child, visit)
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value)
    return output
  }
  if (!value || typeof value !== 'object') return output
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectStrings(child, output)
  }
  return output
}

function testCommand(command) {
  return /(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:pytest|unittest|phpunit|pest|rspec|cargo\s+test|go\s+test|dotnet\s+test|swift\s+test|node\s+--test)\b/i.test(command)
}

function reportsZeroTestWork(text, command) {
  if (/\bcargo\s+test\b/i.test(command)) {
    const running = [...text.matchAll(/\brunning\s+(\d+)\s+tests?\b/gi)]
      .map(match => Number(match[1]))
    if (running.length > 0) return running.every(count => count === 0)
    const passed = [...text.matchAll(/\btest result:\s+ok\.\s+(\d+)\s+passed\b/gi)]
      .map(match => Number(match[1]))
    if (passed.length > 0) return passed.every(count => count === 0)
  }
  return /\b(?:no tests? (?:found|ran|collected|matched|to run)|ran 0 tests?|running 0 tests?|collected 0 items|0 tests? (?:run|executed|collected|passed)|0 passing|tests\s+0|no test files)\b/i.test(text)
}

function nearestExistingDirectory(candidate) {
  let current = candidate
  try {
    if (!statSync(current).isDirectory()) current = path.dirname(current)
  } catch {
    current = path.dirname(current)
  }
  while (!existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
  return current
}

function gitBranch(candidate) {
  const directory = nearestExistingDirectory(candidate)
  if (!directory) return null
  let run = spawnSync('git', ['-C', directory, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8', timeout: 5_000,
  })
  if (run.status !== 0) {
    run = spawnSync('git', ['-C', directory, 'symbolic-ref', '--short', 'HEAD'], {
      encoding: 'utf8', timeout: 5_000,
    })
  }
  return run.status === 0 ? run.stdout.trim() : null
}

function protectedBranch(branch) {
  return branch === 'main' || branch === 'master'
}

function resolveToolPath(value, cwd) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return null
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2))
  return path.resolve(cwd, value)
}

function gitCommandDirectory(command, cwd) {
  const match = command.match(/\bgit\b(?:(?![;&|\n]).)*?\s-C\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/)
  const raw = match?.[1] ?? match?.[2] ?? match?.[3]
  if (!raw) return cwd
  return resolveToolPath(raw.replace(/^\$HOME\//, `${os.homedir()}/`), cwd) ?? cwd
}

function shellSegments(command) {
  const segments = []
  let segment = ''
  let quote = null
  let escaped = false

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (escaped) {
      segment += character
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      segment += character
      escaped = true
      continue
    }
    if (quote) {
      segment += character
      if (character === quote) quote = null
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      segment += character
      continue
    }
    if (character === ';' || character === '\n' || character === '|' || character === '&') {
      if (segment.trim()) segments.push(segment.trim())
      segment = ''
      if ((character === '|' || character === '&') && command[index + 1] === character) {
        index += 1
      }
      continue
    }
    segment += character
  }

  if (segment.trim()) segments.push(segment.trim())
  return segments
}

function commandSubstitutionEnd(source, openIndex) {
  let depth = 1
  let quote = null
  let escaped = false

  for (let index = openIndex + 1; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote === "'") {
      if (character === "'") quote = null
      continue
    }
    if (character === '"') {
      quote = quote === '"' ? null : (quote ?? '"')
      continue
    }
    if (character === "'") {
      if (quote === null) quote = "'"
      continue
    }
    if (source.startsWith('$(', index)) {
      depth += 1
      index += 1
      continue
    }
    if (character === ')' && quote === null) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function shellCommandRegions(command) {
  const regions = [command]
  const seen = new Set(regions)

  function add(region) {
    const trimmed = region.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    regions.push(trimmed)
    scan(trimmed)
  }

  function scan(source) {
    let quote = null
    let escaped = false
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index]
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\' && quote !== "'") {
        escaped = true
        continue
      }
      if (quote === "'") {
        if (character === "'") quote = null
        continue
      }
      if (source.startsWith('$(', index)) {
        const end = commandSubstitutionEnd(source, index + 1)
        if (end < 0) continue
        add(source.slice(index + 2, end))
        index = end
        continue
      }
      if (character === '`') {
        let end = index + 1
        for (; end < source.length; end += 1) {
          if (source[end] === '\\') {
            end += 1
            continue
          }
          if (source[end] === '`') break
        }
        if (end < source.length) {
          add(source.slice(index + 1, end))
          index = end
        }
        continue
      }
      if (character === '"') quote = quote === '"' ? null : (quote ?? '"')
      else if (character === "'" && quote === null) quote = "'"
    }
  }

  scan(command)
  return regions
}

function inPlaceEditorCommand(command) {
  return /\bsed\b[^\n]*\s(?:-i\S*|--in-place(?:=\S*)?)(?:\s|$)/.test(command)
    || /\bperl\b[^\n]*\s-[A-Za-z]*i\S*(?:\s|$)/.test(command)
}

function gitSubcommand(command) {
  const match = command.trim().match(
    /^git(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))?\s+(\S+)(?:\s|$)/,
  )
  return match?.[1] ?? null
}

function protectedBranchException(command) {
  const trimmed = command.trim()
  const subcommand = gitSubcommand(trimmed)
  if (!subcommand
      || /`|\$\(|(?:^|\s)\d*>>?\s*(?!&\d|\/dev\/null)/.test(trimmed)) return false
  if (subcommand === 'switch') return true
  if (subcommand === 'checkout') {
    return /(?:^|\s)(?:-b|-B|--branch|--orphan)(?:[=\s]|$)/.test(trimmed)
  }
  return subcommand === 'merge' && /(?:^|\s)--ff-only(?:\s|$)/.test(trimmed)
}

export function branchViolation(input) {
  const tool = input.tool_name
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd()
  if (MUTATION_TOOLS.has(tool)) {
    const target = resolveToolPath(input.tool_input?.file_path ?? input.tool_input?.notebook_path, cwd)
    const branch = target && gitBranch(target)
    return protectedBranch(branch)
      ? `${tool} would mutate a file in a protected '${branch}' worktree. Create a task branch first.`
      : null
  }
  if (tool !== 'Bash' || typeof input.tool_input?.command !== 'string') return null

  const command = input.tool_input.command
  for (const region of shellCommandRegions(command)) {
    for (const segment of shellSegments(region)) {
      const addressedBranch = gitBranch(gitCommandDirectory(segment, cwd))
      if (!protectedBranch(addressedBranch)
          || !isPotentialMutationCommand(segment)
          || protectedBranchException(segment)) continue
      const subcommand = gitSubcommand(segment)
      if (subcommand === 'commit') {
        return `git commit would write directly to protected '${addressedBranch}'. Create a task branch first.`
      }
      if (subcommand === 'merge') {
        return `git merge without --ff-only is blocked on protected '${addressedBranch}'.`
      }
      return `Bash would mutate files in protected '${addressedBranch}'. Create a task branch first.`
    }
  }
  return null
}

function resultSucceeded(result, command) {
  if (result.is_error === true || result.interrupted === true) return false
  let failedExit = false
  walk(result, object => {
    for (const [key, value] of Object.entries(object)) {
      if (/^(?:exit_code|exitCode)$/.test(key) && Number.isInteger(value) && value !== 0) {
        failedExit = true
      }
    }
  })
  if (failedExit) return false
  const serialized = JSON.stringify(result)
  const text = collectStrings(result).join('\n')
  if (/\b(?:command|process)\s+(?:is\s+)?(?:still\s+)?running\b|\brunning in background\b|\bbackground (?:task|process|command)(?:\s+with)?\s+ID\b/i.test(text)) {
    return false
  }
  if (/["']exit_code["']\s*:\s*[1-9]\d*/i.test(serialized)
      || /\b(?:process|command)\b.{0,80}\bexit(?:ed)?(?: with)?(?: code)?\s+[1-9]\d*/i.test(text)) {
    return false
  }
  if (testCommand(command) && reportsZeroTestWork(text, command)) {
    return false
  }
  return true
}

export function isValidationCommand(command) {
  if (typeof command !== 'string'
      || /[\r\n;`>]|\|\||\$\(/.test(command)
      || /(^|[^|])\|([^|]|$)/.test(command)
      || /(^|[^&])&([^&]|$)/.test(command)) return false
  const segments = command.split(/\s*&&\s*/)
  return segments.length > 0
    && segments.every(segment => VALIDATION_PATTERNS.some(pattern => pattern.test(segment)))
}

export function isPotentialMutationCommand(command) {
  if (typeof command !== 'string' || isValidationCommand(command)) return false
  if (/(?:^|\s)\d*>>?\s*(?!&\d|\/dev\/null)/.test(command)) return true
  return /\b(?:rm|mv|cp|install|mkdir|rmdir|touch|truncate|tee|dd|patch|apply_patch|rsync|chmod|chown|ln)\b/.test(command)
    || inPlaceEditorCommand(command)
    || /\b(?:python3?|node|ruby|perl|php)\b/.test(command)
    || /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|exec)\b/.test(command)
    || /\b(?:cargo\s+fmt|go\s+generate|gofmt|black|ruff\s+format)\b/.test(command)
    || /\bprettier\b[^\n]*\s--write\b/.test(command)
    || /\bfind\b[^\n]*\s-delete\b/.test(command)
    || /\bgit(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))?\s+(?:add|commit|merge|rebase|checkout|switch|restore|reset|pull|clean|stash|apply|cherry-pick)\b/.test(command)
}

export function bashMarkdownMutationPaths(command, cwd = process.cwd()) {
  if (typeof command !== 'string' || !/\.md\b/i.test(command)) return []
  const paths = []
  let unresolved = false
  for (const match of command.matchAll(/"([^"]+)"|'([^']+)'|([^\s;&|<>]+)/g)) {
    let candidate = match[1] ?? match[2] ?? match[3]
    if (!/\.md(?:$|[),\]])/i.test(candidate)) continue
    candidate = candidate.replace(/[),\]]+$/g, '')
    if (candidate.includes('=') && candidate.startsWith('-')) {
      candidate = candidate.slice(candidate.lastIndexOf('=') + 1)
    }
    if (/[`$]/.test(candidate) || candidate.includes('://')
        || [...candidate].some(character => '*?[]{}\\'.includes(character))) {
      unresolved = true
      continue
    }
    const resolved = resolveToolPath(candidate, cwd)
    if (resolved) paths.push(resolved)
    else unresolved = true
  }
  if (paths.length === 0) unresolved = true
  return [...new Set([...paths, ...(unresolved ? [UNRESOLVED_MARKDOWN_MUTATION] : [])])]
}

export function bashDeletionMutationPaths(command, cwd = process.cwd()) {
  if (typeof command !== 'string' || !/\brm\b/.test(command)) return []
  const paths = []
  let unresolved = false
  for (const region of shellCommandRegions(command)) {
    for (const segment of shellSegments(region)) {
      const match = segment.match(/^(?:(?:sudo|command)\s+)*(?:\/\S+\/)?rm\b(.*)$/)
      if (!match) continue
      const args = [...match[1].matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)]
        .map(token => token[1] ?? token[2] ?? token[3])
      let operands = 0
      let optionsEnded = false
      for (const raw of args) {
        if (!optionsEnded && raw === '--') {
          optionsEnded = true
          continue
        }
        if (!optionsEnded && raw.startsWith('-')) continue
        operands += 1
        if (!raw || /[`$]/.test(raw) || raw.includes('://')
            || [...raw].some(character => '*?[]{}\\'.includes(character))) {
          unresolved = true
          continue
        }
        const resolved = resolveToolPath(raw, cwd)
        if (resolved) paths.push(resolved)
        else unresolved = true
      }
      if (operands === 0) unresolved = true
    }
  }
  return [...new Set([
    ...paths,
    ...(unresolved ? [UNRESOLVED_DELETION_MUTATION] : []),
  ])]
}

export function analyzeTranscript(raw, cwd = process.cwd()) {
  const uses = []
  const results = new Map()
  let position = 0

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    walk(entry, object => {
      if (object.type === 'tool_use' && typeof object.name === 'string') {
        uses.push({
          id: typeof object.id === 'string' ? object.id : `anonymous-${position}`,
          name: object.name,
          input: object.input && typeof object.input === 'object' ? object.input : {},
          position: position++,
        })
      }
      if (object.type === 'tool_result' && typeof object.tool_use_id === 'string') {
        results.set(object.tool_use_id, object)
      }
    })
  }

  let lastMutation = -1
  let lastValidation = -1
  let lastSuccessfulValidation = -1
  const mutationPaths = []

  for (const use of uses) {
    if (MUTATION_TOOLS.has(use.name)) {
      lastMutation = Math.max(lastMutation, use.position)
      const filePath = use.input.file_path ?? use.input.notebook_path
      if (typeof filePath === 'string') mutationPaths.push(filePath)
    }
    if (use.name === 'Bash' && isPotentialMutationCommand(use.input.command)) {
      lastMutation = Math.max(lastMutation, use.position)
      mutationPaths.push(...bashMarkdownMutationPaths(use.input.command, cwd))
      mutationPaths.push(...bashDeletionMutationPaths(use.input.command, cwd))
      mutationPaths.push(`<Bash mutation: ${String(use.input.command).slice(0, 120)}>`)
    }
    if (use.name === 'Bash' && isValidationCommand(use.input.command)
        && use.input.run_in_background !== true) {
      lastValidation = Math.max(lastValidation, use.position)
      if (results.has(use.id) && resultSucceeded(results.get(use.id), use.input.command)) {
        lastSuccessfulValidation = Math.max(lastSuccessfulValidation, use.position)
      }
    }
  }

  return {
    hasMutations: lastMutation >= 0,
    verifiedAfterLastMutation: lastMutation >= 0
      && lastSuccessfulValidation > lastMutation
      && lastSuccessfulValidation === lastValidation,
    lastMutation,
    lastSuccessfulValidation,
    mutationPaths,
  }
}

export function runArtifactGates(paths) {
  const claudeHome = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude')
  const hook = path.join(claudeHome, 'hooks', 'facts-gate-dispatch.sh')
  if (!existsSync(hook)) return null

  const failures = []
  for (const filePath of [...new Set(paths)]) {
    if (filePath === UNRESOLVED_MARKDOWN_MUTATION) {
      failures.push('A Bash mutation referenced Markdown through an unresolved path; the facts-first gate cannot verify the changed artifact. Use an explicit path or a native Edit/Write tool.')
      continue
    }
    if (filePath === UNRESOLVED_DELETION_MUTATION) {
      failures.push('A Bash deletion used an unresolved path; the facts-first gate cannot determine whether an ADR archive was removed. Use an explicit path.')
      continue
    }
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) continue
    const run = spawnSync(hook, [], {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      timeout: 15_000,
    })
    if (run.status !== 0) {
      const detail = (run.stderr || run.error?.message || `artifact gate exited ${run.status}`).trim()
      failures.push(detail)
    }
  }
  return failures.length ? `Artifact validation failed:\n${failures.join('\n')}` : null
}

function docsOnly(paths) {
  return paths.length > 0 && paths.every(file => DOC_EXTENSIONS.has(path.extname(file).toLowerCase()))
}

function evidenceLimited(message) {
  return typeof message === 'string' && /\bEVIDENCE-LIMITED:\s+\S.{15,}/i.test(message)
}

function interimResponse(message) {
  if (typeof message !== 'string') return false
  return /\b(?:blocked|not (?:done|complete)|need (?:your|a decision|approval)|waiting for|clarif(?:y|ication)|cannot continue|remaining work)\b/i.test(message)
}

function hasBackgroundWork(input) {
  return (Array.isArray(input.background_tasks) && input.background_tasks.length > 0)
    || (Array.isArray(input.session_crons) && input.session_crons.length > 0)
}

async function readTranscript(input) {
  const candidate = input.agent_transcript_path ?? input.transcript_path
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate) || candidate.includes('\0')) {
    return null
  }
  try {
    return await readFile(candidate, 'utf8')
  } catch {
    return null
  }
}

function missingEvidenceReason(state) {
  const changed = state.mutationPaths.length
    ? `Changed paths include: ${state.mutationPaths.slice(-5).join(', ')}.`
    : 'The transcript contains file mutations.'
  return `${changed} Run the smallest repository-owned test, lint, build, or validation command after the final edit and report the exact command and result. Do not add cleanup or new scope.`
}

function subagentContract(input) {
  const kind = String(input.agent_type ?? 'delegated').toLowerCase()
  const readOnly = /(explore|plan|research|review|audit|scout|memory)/.test(kind)
  const roleLine = readOnly
    ? 'Treat this role as read-only unless the delegation explicitly authorizes edits.'
    : 'If edits are authorized, make the smallest coherent diff within the owned scope.'
  return [
    'QUALITY CONTRACT — you are a leaf role, not the lifecycle coordinator.',
    'Do not invoke /work, consensus, review-ring, quality-cycle, or spawn another agent unless your delegation explicitly assigns coordination.',
    'Preserve the supplied scope and non-goals; invent no features, configuration, fallbacks, dependencies, or speculative abstractions.',
    'DRY duplicated knowledge, not similar syntax; use SOLID only where a demonstrated boundary needs it.',
    roleLine,
    'Before returning after edits, run a relevant repository-owned check after the final edit.',
    'Return touched files, exact executed evidence, and remaining risk or uncertainty.',
  ].join(' ')
}

function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function blockWithExit(reason) {
  process.stderr.write(`${reason}\n`)
  process.exitCode = 2
}

export async function handleHook(input) {
  const event = input.hook_event_name

  if (event === 'SubagentStart') {
    emitJson({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: subagentContract(input),
      },
    })
    return
  }

  if (event === 'PreToolUse') {
    const branchFailure = branchViolation(input)
    if (branchFailure) {
      blockWithExit(branchFailure)
      return
    }
    if (input.tool_name !== 'Bash') return
    const command = input.tool_input?.command
    if (typeof command !== 'string'
        || !/\bgit\b(?:(?![;&|\n]).)*?\b(?:commit|push)\b/.test(command)) return
    const raw = await readTranscript(input)
    if (!raw) {
      blockWithExit('Quality gate could not read the session transcript; refusing git commit/push without verifiable evidence.')
      return
    }
    const state = analyzeTranscript(raw, input.cwd)
    const artifactFailure = runArtifactGates(state.mutationPaths)
    if (artifactFailure) {
      blockWithExit(artifactFailure)
      return
    }
    if (state.hasMutations && !state.verifiedAfterLastMutation) {
      blockWithExit(`Quality gate blocked git commit/push. ${missingEvidenceReason(state)}`)
    }
    return
  }

  if (!['SubagentStop', 'TaskCompleted', 'Stop'].includes(event)) return
  if (input.stop_hook_active === true || (event === 'Stop' && hasBackgroundWork(input))) return

  const raw = await readTranscript(input)
  if (!raw) {
    const reason = 'Quality gate could not read the session transcript; completion evidence is unavailable.'
    if (event === 'TaskCompleted') blockWithExit(reason)
    else emitJson({ decision: 'block', reason })
    return
  }
  const state = analyzeTranscript(raw, input.cwd)
  const artifactFailure = runArtifactGates(state.mutationPaths)
  if (artifactFailure) {
    if (event === 'TaskCompleted') blockWithExit(artifactFailure)
    else emitJson({ decision: 'block', reason: artifactFailure })
    return
  }
  if (!state.hasMutations || state.verifiedAfterLastMutation) return
  if (docsOnly(state.mutationPaths) && evidenceLimited(input.last_assistant_message)) return
  if (event === 'Stop' && interimResponse(input.last_assistant_message)) return

  const reason = missingEvidenceReason(state)
  if (event === 'TaskCompleted') {
    blockWithExit(reason)
    return
  }
  emitJson({ decision: 'block', reason })
}

async function readStdin() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  return raw
}

async function main() {
  let input
  try {
    input = JSON.parse(await readStdin())
  } catch {
    return
  }
  await handleHook(input)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
