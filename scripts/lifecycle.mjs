#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const MUTATION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt'])
const UNRESOLVED_DELETION_MUTATION = '<Unresolved Bash deletion>'
const VALIDATION_PATTERNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint|check|typecheck|build|verify|validate)\b/i,
  /^(?:cargo\s+(?:test|check|build|clippy)|go\s+(?:test|build|vet)|dotnet\s+(?:test|build)|swift\s+test)\b/i,
  /^(?:pytest|python(?:3)?\s+-m\s+(?:pytest|unittest)|phpunit|pest|rspec|bundle\s+exec\s+rspec)\b/i,
  /^(?:npx\s+)?(?:tsc|eslint|ruff|mypy|pyright|shellcheck)\b/i,
  /^(?:node\s+(?:--check|--test)|bash\s+-n|php\s+-l|jq\s+empty|claude\s+plugin\s+validate)\b/i,
  /^(?:make|just)\s+(?:test|check|lint|build|verify|validate)\b/i,
  /^(?!test(?:\s|$))(?!\S*(?:adr-verify|create|update|rewrite|write|package|generate|format|fix|migrate|seed|install|remove|delete))(?=\S*(?:test|lint|check|verify|validate|selftest))\S+(?:\s|$)/i,
  /^(?:node\s+)?(?:\S*\/)?verify\.mjs\s+--cwd\s+/i,
  /^(?:python(?:3)?|node|ruby|perl|php)\s+(?!\S*(?:create|update|rewrite|write|package|generate|format|fix|migrate|seed|install|remove|delete))\S*(?:check|lint|verify|test|validate)\S*\.(?:py|mjs|js|ts|rb|pl|php)\s+(?:verify|check|lint|test|validate|audit|census|status|spine|evals)\b/i,
  /^(?:python(?:3)?|node|ruby|perl|php)\s+\S*derive_shapes\.(?:py|mjs|js|ts|rb|pl|php)\s+(?:verify|check|audit|census|status)\b/i,
  /^(?:python(?:3)?\s+)?\S*(?:adr-lint|adr-debt|spec-verify|arch-lint|postmortem-verify|adr-retire-check)\b/i,
]

// A redirect that writes somewhere: `> f`, `2>> f`, `&> f`. `>&1` and `>&2`
// duplicate a descriptor and `/dev/null` discards, so neither is a write. One
// definition because two copies of this policy drift: the branch guard and the
// exception list must agree on what counts as writing.
const WRITE_REDIRECT = /(?:^|\s)(?:\d*|&)>>?\s*(?!&\d|\/dev\/null)/

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
  const invocation = gitInvocation(command)
  if (!invocation) return cwd

  let directory = cwd
  let gitDirectory = null
  let workTree = null
  for (const option of invocation.globalOptions) {
    const value = option.value?.replace(/^\$HOME\//, `${os.homedir()}/`)
    if (!value) continue
    if (option.name === '-C') {
      directory = resolveToolPath(value, directory) ?? directory
    } else if (option.name === '--git-dir') {
      gitDirectory = resolveToolPath(value, directory)
    } else if (option.name === '--work-tree') {
      workTree = resolveToolPath(value, directory)
    }
  }
  if (workTree) return workTree
  if (gitDirectory) {
    return path.basename(gitDirectory) === '.git' ? path.dirname(gitDirectory) : gitDirectory
  }
  return directory
}

export function shellSegments(command) {
  const segments = []
  let segment = ''
  let quote = null
  let escaped = false
  // Last unquoted, unescaped, non-blank character of the segment being built.
  // `&` splitting is not `&&` splitting: an `&` glued to a redirect belongs to
  // the operator. Splitting `2>&1` there left a first segment ending in `2>`,
  // which every write-redirect rule reads as a write, so the branch guard
  // blocked read-only commands whenever the addressed repository was protected.
  let previous = null

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (escaped) {
      segment += character
      escaped = false
      previous = null
      continue
    }
    if (character === '\\' && quote !== "'") {
      segment += character
      escaped = true
      previous = null
      continue
    }
    if (quote) {
      segment += character
      if (character === quote) quote = null
      previous = null
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      segment += character
      previous = null
      continue
    }
    // `2>&1`, `>&2` and `>&-` close over the preceding redirect; `&>f` and
    // `&>>f` open one. Everything else keeps `&` as a separator, so a genuine
    // background job still ends its segment.
    const redirectAmpersand = character === '&'
      && (previous === '>' || previous === '<' || command[index + 1] === '>')
    if (!redirectAmpersand
        && (character === ';' || character === '\n' || character === '|' || character === '&')) {
      if (segment.trim()) segments.push(segment.trim())
      segment = ''
      previous = null
      if ((character === '|' || character === '&') && command[index + 1] === character) {
        index += 1
      }
      continue
    }
    segment += character
    if (!/\s/.test(character)) previous = character
  }

  if (segment.trim()) segments.push(segment.trim())
  return segments
}

function heredocDeclarations(line, initialQuote = null) {
  const declarations = []
  let quote = initialQuote
  let escaped = false
  let arithmeticDepth = 0

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (arithmeticDepth > 0) {
      if (character === '(') arithmeticDepth += 1
      else if (character === ')') arithmeticDepth -= 1
      continue
    }
    if (line.startsWith('$((', index)) {
      arithmeticDepth = 2
      index += 2
      continue
    }
    if (line.startsWith('((', index)) {
      arithmeticDepth = 2
      index += 1
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (character !== '<' || line[index + 1] !== '<' || line[index + 2] === '<') continue

    index += 2
    const stripTabs = line[index] === '-'
    if (stripTabs) index += 1
    while (/\s/.test(line[index] ?? '')) index += 1
    const start = index
    let delimiterQuote = null
    let delimiterEscaped = false
    while (index < line.length) {
      const delimiterCharacter = line[index]
      if (delimiterEscaped) {
        delimiterEscaped = false
        index += 1
        continue
      }
      if (delimiterCharacter === '\\' && delimiterQuote !== "'") {
        delimiterEscaped = true
        index += 1
        continue
      }
      if (delimiterQuote) {
        if (delimiterCharacter === delimiterQuote) delimiterQuote = null
        index += 1
        continue
      }
      if (delimiterCharacter === "'" || delimiterCharacter === '"') {
        delimiterQuote = delimiterCharacter
        index += 1
        continue
      }
      if (/[\s;&|<>]/.test(delimiterCharacter)) break
      index += 1
    }
    const delimiter = shellWords(line.slice(start, index))[0] ?? ''
    index -= 1
    if (delimiter) declarations.push({ delimiter, stripTabs })
  }
  return { declarations, quote }
}

function withoutHeredocBodies(command) {
  const executableLines = []
  const pending = []
  let active = null
  let quote = null

  for (const line of command.split('\n')) {
    if (active) {
      const candidate = active.stripTabs ? line.replace(/^\t+/, '') : line
      if (candidate === active.delimiter) active = pending.shift() ?? null
      continue
    }

    executableLines.push(line)
    const scanned = heredocDeclarations(line, quote)
    pending.push(...scanned.declarations)
    quote = scanned.quote
    if (pending.length > 0) active = pending.shift()
  }

  return executableLines.join('\n')
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
  for (let index = 0; index < regions.length; index += 1) {
    for (const segment of shellSegments(regions[index])) {
      const nested = nestedShellScript(segment)
      if (nested) add(nested)
    }
  }
  return regions
}

function inPlaceEditorCommand(command) {
  return /\bsed\b[^\n]*\s(?:-i\S*|--in-place(?:=\S*)?)(?:\s|$)/.test(command)
    || /\bperl\b[^\n]*\s-[A-Za-z]*i\S*(?:\s|$)/.test(command)
}

function shellWords(command) {
  const words = []
  let word = ''
  let wordStarted = false
  let quote = null

  const finishWord = () => {
    if (!wordStarted) return
    words.push(word)
    word = ''
    wordStarted = false
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]
    if (quote === "'") {
      if (character === "'") quote = null
      else word += character
      continue
    }
    if (quote === '"') {
      if (character === '"') {
        quote = null
      } else if (character === '\\') {
        const next = command[index + 1]
        if (next && '$`"\\\n'.includes(next)) word += command[++index]
        else word += character
      } else {
        word += character
      }
      continue
    }
    if (/\s/.test(character)) {
      finishWord()
      continue
    }
    wordStarted = true
    if (character === "'" || character === '"') {
      quote = character
    } else if (character === '\\' && index + 1 < command.length) {
      word += command[++index]
    } else {
      word += character
    }
  }
  finishWord()
  return words
}

function executableName(token) {
  return token?.replaceAll('\\', '/').split('/').pop()?.replace(/\.exe$/i, '') ?? ''
}

function optionConsumesNext(token, options) {
  return options.has(token) && !token.includes('=')
}

function commandInvocation(command, depth = 0) {
  if (depth > 4) return null
  const words = shellWords(command.trim())
  let index = 0

  while (index < words.length) {
    words[index] = words[index].replace(/^[({]+/, '')
    if (!words[index] || words[index] === '!' || words[index] === '{') {
      index += 1
      continue
    }
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? '')) index += 1
    const wrapper = executableName(words[index])
    if (wrapper === 'command') {
      index += 1
      while (words[index]?.startsWith('-')) {
        if (['-v', '-V'].includes(words[index])) return null
        if (words[index] === '--') { index += 1; break }
        index += 1
      }
      continue
    }
    if (wrapper === 'env') {
      index += 1
      const envValueOptions = new Set(['-a', '--argv0', '-u', '--unset', '-C', '--chdir'])
      while (words[index]?.startsWith('-')) {
        const option = words[index]
        if (option === '--') { index += 1; break }
        let splitString = null
        if (option === '-S' || option === '--split-string') {
          splitString = words[index + 1] ?? ''
          index += 2
        } else if (option.startsWith('--split-string=')) {
          splitString = option.slice('--split-string='.length)
          index += 1
        } else if (option.startsWith('-S') && option.length > 2) {
          splitString = option.slice(2)
          index += 1
        }
        if (splitString !== null) {
          return commandInvocation([splitString, ...words.slice(index)].join(' '), depth + 1)
        }
        index += optionConsumesNext(option, envValueOptions) ? 2 : 1
      }
      continue
    }
    if (wrapper === 'sudo') {
      index += 1
      const sudoValueOptions = new Set([
        '-C', '--close-from', '-D', '--chdir', '-g', '--group', '-h', '--host',
        '-p', '--prompt', '-R', '--chroot', '-r', '--role', '-T', '--command-timeout',
        '-t', '--type', '-U', '--other-user', '-u', '--user',
      ])
      while (words[index]?.startsWith('-')) {
        const option = words[index]
        if (option === '--') { index += 1; break }
        index += optionConsumesNext(option, sudoValueOptions) ? 2 : 1
      }
      continue
    }
    if (wrapper === 'exec') {
      index += 1
      while (words[index]?.startsWith('-')) {
        const option = words[index]
        if (option === '--') { index += 1; break }
        index += option === '-a' ? 2 : 1
      }
      continue
    }
    if (wrapper === 'time') {
      index += 1
      const timeValueOptions = new Set(['-f', '--format', '-o', '--output'])
      while (words[index]?.startsWith('-')) {
        if (words[index] === '--') { index += 1; break }
        index += optionConsumesNext(words[index], timeValueOptions) ? 2 : 1
      }
      continue
    }
    break
  }
  return { index, words }
}

function nestedShellScript(command) {
  const invocation = commandInvocation(command)
  if (!invocation) return null
  const { index, words } = invocation
  if (!new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']).has(executableName(words[index]))) return null
  const shellValueOptions = new Set(['-o', '-O', '--init-file', '--rcfile'])
  for (let optionIndex = index + 1; optionIndex < words.length; optionIndex += 1) {
    const option = words[optionIndex]
    if (option === '--') return null
    if (!option.startsWith('-')) return null
    if (option.slice(1).includes('c')) return words[optionIndex + 1] ?? null
    if (optionConsumesNext(option, shellValueOptions)) optionIndex += 1
  }
  return null
}

function gitInvocation(command) {
  const invocation = commandInvocation(command)
  if (!invocation) return null
  const { words } = invocation
  let { index } = invocation

  if (executableName(words[index]) !== 'git') return null
  index += 1
  const gitValueOptions = new Set([
    '-C', '-c', '--attr-source', '--config-env', '--exec-path', '--git-dir',
    '--namespace', '--super-prefix', '--work-tree',
  ])
  const globalOptions = []
  while (index < words.length) {
    const option = words[index]
    if (option === '--') {
      index += 1
      break
    }
    if (!option.startsWith('-')) break
    const attached = option.match(/^(--(?:git-dir|work-tree))=(.*)$/)
    if (attached) {
      globalOptions.push({ name: attached[1], value: attached[2] })
      index += 1
      continue
    }
    if (optionConsumesNext(option, gitValueOptions)) {
      globalOptions.push({ name: option, value: words[index + 1] })
      index += 2
      continue
    }
    index += 1
  }
  return {
    globalOptions,
    subcommand: words[index] ?? null,
    subcommandIndex: index,
    words,
  }
}

function gitSubcommand(command) {
  return gitInvocation(command)?.subcommand ?? null
}

export function isGitPublishCommand(command) {
  if (typeof command !== 'string') return false
  const executable = withoutHeredocBodies(command)
  for (const region of shellCommandRegions(executable)) {
    for (const segment of shellSegments(region)) {
      if (['commit', 'push'].includes(gitSubcommand(segment))) return true
    }
  }
  return false
}

function isGitMutationCommand(command) {
  if (typeof command !== 'string') return false
  const mutating = new Set([
    'add', 'apply', 'checkout', 'cherry-pick', 'clean', 'commit', 'merge', 'pull',
    'rebase', 'reset', 'restore', 'stash', 'switch',
  ])
  const executable = withoutHeredocBodies(command)
  for (const region of shellCommandRegions(executable)) {
    for (const segment of shellSegments(region)) {
      if (mutating.has(gitSubcommand(segment))) return true
    }
  }
  return false
}

function protectedBranchException(command) {
  const trimmed = command.trim()
  const invocation = gitInvocation(trimmed)
  if (!invocation || /`|\$\(/.test(trimmed) || WRITE_REDIRECT.test(trimmed)) return false
  const { subcommand, subcommandIndex, words } = invocation
  if (subcommand === 'switch') return true
  const args = []
  for (const argument of words.slice(subcommandIndex + 1)) {
    if (argument === '--') break
    args.push(argument)
  }
  if (subcommand === 'checkout') {
    return args.some(argument => ['-b', '-B', '--branch', '--orphan'].includes(argument)
      || argument.startsWith('--branch='))
  }
  return subcommand === 'merge' && args.includes('--ff-only')
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
  for (const region of shellCommandRegions(withoutHeredocBodies(command))) {
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

const CD_ONLY = /^cd\s+(?:"[^"]*"|'[^']*'|\S+)$/
const ASSIGNMENT_ONLY = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s*)+$/

export function isValidationCommand(command) {
  if (typeof command !== 'string'
      || /[;`>]|\|\||\$\(/.test(command)
      || /(^|[^|])\|([^|]|$)/.test(command)
      || /(^|[^&])&([^&]|$)/.test(command)) return false
  // Rejecting every multi-line command meant the project's own gate did not
  // count as evidence: setting a tool path on one line and running the gate on
  // the next is the ordinary shape, and the run went unseen while the hook kept
  // asking for a validation the user had already produced. Judge each line
  // instead. Assignment-only and `cd` lines carry no verdict; every remaining
  // line must be a validation, so a mutation cannot ride along above a passing
  // test. The character guard above still applies to the whole command, so no
  // line can hide a redirect, a pipe, a background job or a substitution.
  const lines = command.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !ASSIGNMENT_ONLY.test(line) && !CD_ONLY.test(line))
  return lines.length > 0 && lines.every(line => {
    const segments = line.split(/\s*&&\s*/)
      .filter(segment => !CD_ONLY.test(segment.trim()))
    return segments.length > 0
      && segments.every(segment => VALIDATION_PATTERNS.some(pattern => pattern.test(segment)))
  })
}

const INTERPRETER_WORD = /\b(?:python3?|node|ruby|perl|php)\b/

// True when an interpreter is the COMMAND of some region or segment, not merely
// a word inside one. Measured 2026-08-25: a repository whose record was named
// `docs/adr/0015-rq-for-queued-work-in-both-python-stacks.md` had every `cat`,
// `grep` and `head` of that file classified as a python run, so reading a record
// advanced the mutation cursor and put the record itself into the artifact gate
// while `git diff` showed it unchanged. Regions are walked so `bash -c "python
// rewrite.py"` and `$(python rewrite.py)` still count.
function hasInterpreterCommand(text) {
  for (const region of shellCommandRegions(text)) {
    for (const segment of shellSegments(region)) {
      // `python -m unittest discover` is a test run whichever way it is piped.
      // Reported 2026-08-25: piping one to `tail` disqualified the whole command
      // as evidence — correct, a pipe hides the exit code — and then the
      // interpreter rule below recorded it as a MUTATION, so running the project's
      // own tests raised the evidence bar instead of clearing it. A segment that
      // matches a validation pattern is not an interpreter mutation.
      if (VALIDATION_PATTERNS.some(pattern => pattern.test(segment.trim()))) continue
      const invocation = commandInvocation(segment)
      if (!invocation) continue
      if (INTERPRETER_WORD.test(executableName(invocation.words[invocation.index]))) return true
    }
  }
  return false
}
const VISIBLE_CODE_MUTATION_TOKENS = new RegExp([
  'write_text', 'write_bytes', 'writeFile', 'appendFile', 'createWriteStream',
  'unlink', 'remove', 'rmtree', 'rmdir', 'rmSync', 'mkdir', 'makedirs',
  'copyfile', 'copytree', 'rename', 'replace', 'chmod', 'chown', 'shutil',
  'subprocess', 'os\\.system', 'popen', '\\bexec\\b', '\\beval\\b',
  '__import__', 'importlib', 'runpy', 'child_process', 'urlopen', 'requests',
  '\\bfetch\\b', 'axios', '\\bsocket\\b', '\\bdump\\s*\\(', 'to_csv',
  '\\bdel\\s+', '\\bunlink\\s+', '\\bFile\\.write\\b',
].join('|'), 'i')
const SAFE_VISIBLE_CALLS = new Set([
  'all', 'any', 'bool', 'console.error', 'console.log', 'dict', 'enumerate',
  'float', 'int', 'JSON.parse', 'JSON.stringify', 'json.dumps', 'json.loads',
  'len', 'list', 'map', 'max', 'min', 'Object.entries', 'Object.keys',
  'Object.values', 'Path', 'Path.cwd', 'Path.home', 'print', 'printf', 'puts',
  'range', 'read_bytes', 'read_text', 'repr', 'set', 'sorted', 'str', 'sum',
  'tuple', 'type', 'zip',
])

export function heredocBodies(command) {
  const bodies = []
  const pending = []
  let active = null
  let quote = null
  for (const line of command.split('\n')) {
    if (active) {
      const candidate = active.stripTabs ? line.replace(/^\t+/, '') : line
      if (candidate === active.delimiter) active = pending.shift() ?? null
      else bodies.push(line)
      continue
    }
    const scanned = heredocDeclarations(line, quote)
    pending.push(...scanned.declarations)
    quote = scanned.quote
    if (pending.length > 0) active = pending.shift()
  }
  return bodies.join('\n')
}

function visibleCodeLooksMutating(code) {
  if (VISIBLE_CODE_MUTATION_TOKENS.test(code)) return true
  const calls = [...code.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)]
  return calls.some(([, call]) => !SAFE_VISIBLE_CALLS.has(call)
    && !SAFE_VISIBLE_CALLS.has(call.split('.').at(-1)))
}

export function interpreterCommandLooksMutating(command, executable) {
  if (!INTERPRETER_WORD.test(executable)) return false
  const visible = []
  let sawStdin = false
  let stripped = executable.replace(
    /\b(?:python3?|node|ruby|perl|php)\b((?:\s+-[A-Za-bd-z]\w*)*\s+-[ce]\s+)('[^']*'|"(?:[^"\\]|\\.)*")/g,
    (whole, options, code) => {
      visible.push(code.slice(1, -1))
      return `inline_script${options}""`
    })
  stripped = stripped.replace(
    /\b(?:python3?|node|ruby|perl|php)\b(\s+(?:-\s*)?<<)/g,
    (whole, redirect) => {
      sawStdin = true
      return `stdin_script${redirect}`
    })
  if (sawStdin) visible.push(heredocBodies(command))
  if (hasInterpreterCommand(stripped)) return true
  return visible.some(visibleCodeLooksMutating)
}

export function isPotentialMutationCommand(command) {
  if (typeof command !== 'string' || isValidationCommand(command)) return false
  const executable = withoutHeredocBodies(command)
  if (WRITE_REDIRECT.test(executable)) return true
  return /\b(?:rm|mv|cp|install|mkdir|rmdir|touch|truncate|tee|dd|patch|apply_patch|rsync|chmod|chown|ln)\b/.test(executable)
    || inPlaceEditorCommand(executable)
    || interpreterCommandLooksMutating(command, executable)
    || /(?:^|\s)(?:\S*[\\/])?adr-verify(?:\s|$)/i.test(executable)
    || /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|exec)\b/.test(executable)
    || /\b(?:cargo\s+fmt|go\s+generate|gofmt|black|ruff\s+format)\b/.test(executable)
    || /\bprettier\b[^\n]*\s--write\b/.test(executable)
    || /\bfind\b[^\n]*\s-delete\b/.test(executable)
    || isGitMutationCommand(executable)
}

function globComponentPattern(component) {
  let pattern = '^'
  for (let index = 0; index < component.length; index += 1) {
    const character = component[index]
    if (character === '*') {
      pattern += '.*'
    } else if (character === '?') {
      pattern += '.'
    } else if (character === '[') {
      const end = component.indexOf(']', index + 1)
      if (end < 0) return null
      let contents = component.slice(index + 1, end)
      if (contents.startsWith('!')) contents = `^${contents.slice(1)}`
      pattern += `[${contents.replaceAll('\\', '\\\\')}]`
      index = end
    } else {
      pattern += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  try {
    return new RegExp(`${pattern}$`)
  } catch {
    return null
  }
}

function expandExistingGlob(candidate, cwd) {
  const expanded = candidate.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (match, braced, plain) => process.env[braced ?? plain] ?? match)
  if (/[`$]/.test(expanded) || expanded.includes('://') || /[{}\\]/.test(expanded)) return []
  if (!/[*?[\]]/.test(expanded)) {
    const resolved = resolveToolPath(expanded, cwd)
    return resolved ? [resolved] : []
  }

  const absolute = path.resolve(cwd, expanded)
  const root = path.parse(absolute).root
  const components = absolute.slice(root.length).split(path.sep).filter(Boolean)
  let candidates = [root]
  for (const component of components) {
    if (!/[*?[\]]/.test(component)) {
      candidates = candidates.map(base => path.join(base, component))
      continue
    }
    const pattern = globComponentPattern(component)
    if (!pattern) return []
    const matches = []
    for (const base of candidates) {
      try {
        for (const entry of readdirSync(base)) {
          if (pattern.test(entry)) matches.push(path.join(base, entry))
        }
      } catch {}
    }
    candidates = matches
  }
  return candidates.filter(candidatePath => existsSync(candidatePath))
}

export function bashMarkdownMutationPaths(command, cwd = process.cwd()) {
  if (typeof command !== 'string') return []
  const executable = withoutHeredocBodies(command)
  if (!/\.md\b/i.test(executable)) return []
  const paths = []
  for (const match of executable.matchAll(/"([^"]+)"|'([^']+)'|([^\s;&|<>]+)/g)) {
    let candidate = match[1] ?? match[2] ?? match[3]
    if (!/\.md(?:$|[),\]])/i.test(candidate)) continue
    candidate = candidate.replace(/[),\]]+$/g, '')
    if (candidate.includes('=') && candidate.startsWith('-')) {
      candidate = candidate.slice(candidate.lastIndexOf('=') + 1)
    }
    paths.push(...expandExistingGlob(candidate, cwd))
  }
  return [...new Set(paths)]
}

export function bashDeletionMutationPaths(command, cwd = process.cwd()) {
  if (typeof command !== 'string' || !/\brm\b/.test(command)) return []
  const paths = []
  let unresolved = false
  for (const region of shellCommandRegions(withoutHeredocBodies(command))) {
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

  const executed = use => {
    const result = results.get(use.id)
    if (result === undefined) return false
    if (result.is_error !== true) return true
    const detail = JSON.stringify(result)
    return !/(?:PreToolUse[^\n]*hook error|hook blocked|Quality gate blocked)/i.test(detail)
  }

  for (const use of uses) {
    if (MUTATION_TOOLS.has(use.name) && executed(use)) {
      lastMutation = Math.max(lastMutation, use.position)
      const filePath = use.input.file_path ?? use.input.notebook_path
      if (typeof filePath === 'string') mutationPaths.push(filePath)
    }
    if (use.name === 'Bash' && executed(use)
        && isPotentialMutationCommand(use.input.command)) {
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

// An unresolved deletion records that something was removed, not what. The
// repository already knows: ask Git which tracked paths are now missing instead
// of holding an unanswerable question against every later commit in the session.
// Returns null when Git cannot answer, which keeps the gate closed.
function deletedTrackedPaths(cwd) {
  const options = { encoding: 'utf8', timeout: 10_000 }
  const root = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], options)
  if (root.status !== 0) return null
  const deleted = spawnSync('git', ['-C', cwd, 'diff', '--name-only', '--diff-filter=D', 'HEAD'], options)
  if (deleted.status !== 0) return null
  const top = root.stdout.trim()
  return deleted.stdout.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(relative => path.join(top, relative))
}

export function runArtifactGates(paths, cwd = process.cwd()) {
  const hook = path.join(PLUGIN_ROOT, 'scripts', 'facts-gate-dispatch.sh')
  if (!existsSync(hook)) return null
  const runner = path.join(PLUGIN_ROOT, 'scripts', 'run-shell-hook.mjs')
  if (!existsSync(runner)) return 'Artifact validation failed:\nThe cross-platform shell-hook runner is missing.'

  const failures = []
  const targets = []
  for (const filePath of [...new Set(paths)]) {
    if (filePath === UNRESOLVED_DELETION_MUTATION) {
      const deleted = deletedTrackedPaths(cwd)
      if (deleted === null) {
        failures.push('A Bash deletion used an unresolved path and Git cannot say what is missing here; the facts-first gate cannot determine whether an ADR archive was removed. Use an explicit path.')
        continue
      }
      targets.push(...deleted)
      continue
    }
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) continue
    targets.push(filePath)
  }
  for (const filePath of [...new Set(targets)]) {
    const run = spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh'], {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      env: { ...process.env, QUALITY_HARNESS_SHELL_TIMEOUT_MS: '10000' },
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
    'Do not invoke /quality-harness:work, /quality-harness:consensus, /quality-harness:review-ring, /quality-harness:quality-cycle, or spawn another agent unless your delegation explicitly assigns coordination.',
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
    if (!isGitPublishCommand(command)) return
    const raw = await readTranscript(input)
    if (!raw) {
      blockWithExit('Quality gate could not read the session transcript; refusing git commit/push without verifiable evidence.')
      return
    }
    const state = analyzeTranscript(raw, input.cwd)
    const artifactFailure = runArtifactGates(state.mutationPaths, input.cwd)
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
  if (event !== 'Stop') {
    const artifactFailure = runArtifactGates(state.mutationPaths, input.cwd)
    if (artifactFailure) {
      if (event === 'TaskCompleted') blockWithExit(artifactFailure)
      else emitJson({ decision: 'block', reason: artifactFailure })
      return
    }
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
