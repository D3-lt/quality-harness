#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const MUTATION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt'])
const UNRESOLVED_DELETION_MUTATION = '<Unresolved Bash deletion>'
// Per artifact, at the commit and completion boundaries. The per-edit boundary
// gets the runner's own budget from hooks.json; this one used to be a flat 10s
// that no setting could change, because the value was written into the child's
// environment AFTER process.env was spread. Reported 2026-08-25: a clean 25-ADR
// corpus timed out, every commit blocked, and QUALITY_HARNESS_SHELL_TIMEOUT_MS
// did nothing — the gate's cost grows with the corpus it reads, so the budget has
// to be raisable by whoever owns the corpus.
const ARTIFACT_GATE_TIMEOUT_MS = 30_000
const ARTIFACT_GATE_KILL_MARGIN_MS = 5_000
const VALIDATION_PATTERNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|lint|check|typecheck|build|verify|validate)\b/i,
  /^(?:cargo\s+(?:test|check|build|clippy)|go\s+(?:test|build|vet)|dotnet\s+(?:test|build)|swift\s+test)\b/i,
  // `php artisan test` is how a Laravel project runs its tests, and it was not
  // here: a session with 286 passing tests kept being asked for a check.
  // vendor/bin/phpunit needed its path prefix allowed for the same reason —
  // requiring the bare name meant only a globally installed runner counted.
  /^(?:pytest|python(?:3)?\s+-m\s+(?:pytest|unittest)|(?:php\s+)?(?:\S*\/)?(?:phpunit|pest)|(?:php\s+)?artisan\s+test|rspec|bundle\s+exec\s+rspec)\b/i,
  /^(?:npx\s+)?(?:tsc|eslint|ruff|mypy|pyright|shellcheck)\b/i,
  /^(?:node\s+(?:--check|--test)|bash\s+-n|php\s+-l|jq\s+empty|claude\s+plugin\s+validate)\b/i,
  /^(?:make|just)\s+(?:test|check|lint|build|verify|validate)\b/i,
  /^(?!test(?:\s|$))(?!\S*(?:adr-verify|create|update|rewrite|write|package|generate|format|fix|migrate|seed|install|remove|delete))(?=\S*(?:test|lint|check|verify|validate|selftest))\S+(?:\s|$)/i,
  /^(?:node\s+)?(?:\S*\/)?verify\.mjs\s+--cwd\s+/i,
  /^(?:python(?:3)?|node|ruby|perl|php)\s+(?!\S*(?:create|update|rewrite|write|package|generate|format|fix|migrate|seed|install|remove|delete))\S*(?:check|lint|verify|test|validate)\S*\.(?:py|mjs|js|ts|rb|pl|php)\s+(?:verify|check|lint|test|validate|audit|census|status|spine|evals)\b/i,
  /^(?:python(?:3)?|node|ruby|perl|php)\s+\S*derive_shapes\.(?:py|mjs|js|ts|rb|pl|php)\s+(?:verify|check|audit|census|status)\b/i,
  /^(?:python(?:3)?\s+)?\S*(?:adr-lint|adr-debt|spec-verify|arch-lint|postmortem-verify|adr-retire-check)\b/i,
  // `bash scripts/selftest.sh` is the same run as `./scripts/selftest.sh`, and
  // only the second was evidence: the pattern above needs the validator's own
  // name as the first word. Running a repository's own gate the obvious way left
  // the hook asking for a validation that had just passed. Hit live repeatedly on
  // 2026-08-25. The shell name is a wrapper, so look past it at the script — with
  // the same authoring-verb exclusions, and `(?!-)` so `bash -n` keeps its own
  // rule above and `bash -c "…"` stays outside this one.
  /^(?:bash|sh|zsh|ksh)\s+(?!-)(?!\S*(?:adr-verify|create|update|rewrite|write|package|generate|format|fix|migrate|seed|install|remove|delete))\S*(?:test|lint|check|verify|validate|selftest)\S*(?:\s|$)/i,
]

// A redirect that writes somewhere: `> f`, `2>> f`, `&> f`. `>&1` and `>&2`
// duplicate a descriptor and `/dev/null` discards, so neither is a write. One
// definition because two copies of this policy drift: the branch guard and the
// exception list must agree on what counts as writing.
// Three ways this regex was wrong, all of them live on 2026-08-26.
//
// `\s*` backtracked past its own exclusion: with `cmd > /dev/null` it matched the
// space, the exclusion failed, the engine handed the space back, and the
// lookahead was re-tried against " /dev/null" — which does not START with
// /dev/null. So `gh run watch 123 > /dev/null` was authorship, and on a
// protected branch it demanded a task branch. JavaScript has no possessive
// quantifier; `(?=(\s*))\1` is how one is spelled.
//
// `&-` closes a descriptor and writes nothing: `git fsck 2>&-` was a mutation.
//
// And a GLUED redirect was invisible: `printf x>out.txt` writes a file, but the
// `(?:^|\s)` prefix required whitespace before it, so the evidence gate never
// saw the write. That is a fail-open, and the two above are false blocks — the
// same regex managed both directions at once.
//
// Quoted segments are removed before the test rather than excluded inside it: a
// `>` inside `python3 -c 'a>b'` is a comparison in someone else's language, not
// a redirect, and stripping quotes is a rule instead of a guess.
const WRITE_REDIRECT = /(?<![-=<>!])(?:\d*|&)>>?(?=(\s*))\1(?!&\d|&-|\/dev\/null(?![^\s;|&<>]))/

// A redirect inside quotes is not a redirect. Removing quoted runs keeps the
// glued-redirect fix above from reading shell operators out of inline code.
function withoutQuotedSegments(command) {
  return command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, ' ')
}

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

// `git checkout <name>` is a branch switch or a working-tree overwrite depending
// on what <name> is, and only the repository knows which. Ask it rather than
// guessing from the spelling.
function localBranchExists(directory, name) {
  if (!directory || typeof name !== 'string' || !/^[A-Za-z0-9._\-\/]+$/.test(name)) return false
  const run = spawnSync('git', ['-C', directory, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`], {
    encoding: 'utf8', timeout: 5_000,
  })
  return run.status === 0
}

function protectedBranchException(command, directory) {
  const trimmed = command.trim()
  const invocation = gitInvocation(trimmed)
  if (!invocation || /`|\$\(/.test(trimmed) || WRITE_REDIRECT.test(withoutQuotedSegments(trimmed))) return false
  const { subcommand, subcommandIndex, words } = invocation
  if (subcommand === 'switch') return true
  const args = []
  let separated = false
  for (const argument of words.slice(subcommandIndex + 1)) {
    if (argument === '--') {
      separated = true
      break
    }
    args.push(argument)
  }
  if (subcommand === 'checkout') {
    if (args.some(argument => ['-b', '-B', '--branch', '--orphan'].includes(argument)
      || argument.startsWith('--branch='))) return true
    // Leaving a protected branch is exactly what the block message asks for, and
    // `git switch <branch>` is already excepted for it. A pathspec — after `--`,
    // or as a second operand, or as a name that is not a branch — writes working
    // tree files instead, so it stays blocked.
    if (separated) return false
    const operands = args.filter(argument => !argument.startsWith('-'))
    return operands.length === 1 && localBranchExists(directory, operands[0])
  }
  // Fast-forward integration is the sanctioned way to bring a protected branch
  // up to date, whichever spelling fetches first.
  return (subcommand === 'merge' || subcommand === 'pull') && args.includes('--ff-only')
}

// The one command that resolves a protected-branch block. Naming it is the
// difference between a rule and an instruction: this session spent four turns
// discovering that `git switch` was allowed where `git checkout` was not.
export function taskBranchSuggestion(directory) {
  const run = spawnSync('git', ['-C', directory ?? '.', 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8', timeout: 5_000,
  })
  const slug = run.status === 0 && run.stdout.trim() ? run.stdout.trim() : 'work'
  return `git switch -c task/${slug}`
}

export function branchViolation(input) {
  const tool = input.tool_name
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd()
  if (MUTATION_TOOLS.has(tool)) {
    const target = resolveToolPath(input.tool_input?.file_path ?? input.tool_input?.notebook_path, cwd)
    const branch = target && gitBranch(target)
    return protectedBranch(branch)
      ? `${tool} would mutate a file in a protected '${branch}' worktree. `
        + `Create a task branch first: ${taskBranchSuggestion(nearestExistingDirectory(target))}`
      : null
  }
  if (tool !== 'Bash' || typeof input.tool_input?.command !== 'string') return null

  const command = input.tool_input.command
  for (const region of shellCommandRegions(withoutHeredocBodies(command))) {
    for (const segment of shellSegments(region)) {
      const directory = gitCommandDirectory(segment, cwd)
      const addressedBranch = gitBranch(directory)
      if (!protectedBranch(addressedBranch)
          || !isPotentialMutationCommand(segment)
          || protectedBranchException(segment, directory)
          || mutatesOnlyTempPaths(segment, directory)) continue
      const subcommand = gitSubcommand(segment)
      const escape = taskBranchSuggestion(nearestExistingDirectory(directory))
      if (subcommand === 'commit') {
        return `git commit would write directly to protected '${addressedBranch}'. `
          + `Create a task branch first: ${escape}`
      }
      if (subcommand === 'merge') {
        return `git merge without --ff-only would write a merge commit into protected `
          + `'${addressedBranch}'. Use \`git merge --ff-only <branch>\`, or merge from a task branch.`
      }
      return `Bash would mutate files in protected '${addressedBranch}'. `
        + `Create a task branch first: ${escape}`
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

// A command substitution inside a `cd` argument still runs a command, so it
// cannot be waved past the guard on faith — but `cd "$(git rev-parse
// --show-toplevel)" && ./verify.sh` is how a script finds its own repository
// root, and the whole-command guard rejected it as if the `$(` were hiding
// something. The project's check had just run and the gate asked for it again.
// Reported from blueprints, 2026-08-26. An explicit list of read-only idioms,
// not an inference: anything else keeps failing the guard.
const INERT_SUBSTITUTION = /^\s*(?:git\s+rev-parse\s+--show-toplevel|pwd|dirname\s+[^;&|`$()]*|realpath\s+[^;&|`$()]*|basename\s+[^;&|`$()]*)\s*$/

// A segment that only moves, and moves somewhere it can name without side
// effects. Carries no verdict, so it neither counts as validation nor spoils it.
function inertNavigation(segment) {
  if (!CD_ONLY.test(segment)) return false
  for (const match of segment.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
    if (!INERT_SUBSTITUTION.test(match[1] ?? match[2] ?? '')) return false
  }
  return true
}

// Everything the whole-command guard used to reject: a second command hiding
// behind a separator, a redirect, a pipe, a background job, a substitution.
// Applied per segment now rather than to the whole string, so navigation can be
// dropped first without letting anything ride along with the validation itself.
const UNSAFE_SEGMENT = /[;`>]|\|\||\$\(|(?:^|[^|])\|(?:[^|]|$)|(?:^|[^&])&(?:[^&]|$)/
const ASSIGNMENT_ONLY = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s*)+$/
const ASSIGNMENT_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/

// A command run inside a container is still that command.
//
// `docker compose exec -T app php artisan test` was not validation, so a project
// whose tests run in a container produced no evidence the gate could see — 286
// passing tests, and the completion gate still asking for a check. Reported from
// a live session on 2026-08-26.
//
// Peels one container-runner prefix and one `sh -c '…'` wrapper, which together
// cover the shape people actually type:
//   docker compose run --rm --no-deps node sh -c 'cd /var/www && npm run build'
//
// Deliberately narrow. The runner words are fixed, the flag skip stops at the
// first non-flag token (the service or image), and only ONE layer of each is
// peeled — guessing deeper is how a wrapper starts laundering a mutation.
const CONTAINER_RUNNER = /^(?:sudo\s+)?(?:docker|podman)(?:\s+compose)?\s+(?:run|exec)\b/
const FLAG_WITH_VALUE = /^(?:-e|--env|-u|--user|-w|--workdir|-v|--volume|--entrypoint|-p|--publish)$/

export function commandInsideWrappers(command) {
  let text = String(command ?? '').trim()
  if (CONTAINER_RUNNER.test(text)) {
    const tokens = text.split(/\s+/)
    let index = tokens[0] === 'sudo' ? 1 : 0
    index += tokens[index + 1] === 'compose' ? 3 : 2   // runner [compose] run|exec
    while (index < tokens.length && tokens[index].startsWith('-')) {
      index += FLAG_WITH_VALUE.test(tokens[index]) ? 2 : 1
    }
    index += 1                                          // the service or image
    text = tokens.slice(index).join(' ').trim()
  }
  const shell = text.match(/^(?:\S*\/)?(?:ba|z|k|da)?sh\s+-[a-z]*c\s+('([^']*)'|"([^"]*)")$/)
  if (shell) text = (shell[2] ?? shell[3] ?? '').trim()
  return text
}

export function isValidationCommand(command) {
  if (typeof command !== 'string') return false
  // A containerised run is judged by what it runs. Checked first so the guard
  // below sees the inner command's characters rather than the wrapper's.
  const inner = commandInsideWrappers(command)
  if (inner && inner !== command.trim()) return isValidationCommand(inner)
  if (typeof command !== 'string') return false
  // Rejecting every multi-line command meant the project's own gate did not
  // count as evidence: setting a tool path on one line and running the gate on
  // the next is the ordinary shape, and the run went unseen while the hook kept
  // asking for a validation the user had already produced. Judge each line
  // instead. Assignment-only and `cd` lines carry no verdict; every remaining
  // line must be a validation, so a mutation cannot ride along above a passing
  // test. UNSAFE_SEGMENT applies to each surviving segment, so none of them can
  // hide a redirect, a pipe, a background job or a substitution — it moved off
  // the whole command precisely so that navigation can be dropped first.
  const lines = command.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !ASSIGNMENT_ONLY.test(line) && !inertNavigation(line))
  return lines.length > 0 && lines.every(line => {
    const segments = line.split(/\s*&&\s*/)
      .map(segment => segment.trim())
      .filter(segment => !inertNavigation(segment))
    return segments.length > 0
      && segments.every(segment => !UNSAFE_SEGMENT.test(segment)
        // `BLUEPRINT_VENV=.venv ./verify.sh` is the same run as `./verify.sh`.
        // Every pattern is anchored, so the environment prefix hid the command
        // from all of them. UNSAFE_SEGMENT has already seen the whole segment,
        // so nothing is laundered by trimming it here.
        && VALIDATION_PATTERNS.some(pattern => pattern.test(segment.replace(ASSIGNMENT_PREFIX, ''))))
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
  if (WRITE_REDIRECT.test(withoutQuotedSegments(executable))) return true
  // (?<![-\w]) not \b: a hyphen is a word boundary, so `--rm` matched the `rm`
  // command. `docker compose run --rm app npm run build` was therefore a
  // DELETION, and since no containerised command counted as validation either,
  // every build demanded another build — a closed loop reported from a live
  // session on 2026-08-26. The same trap sits under --move, --copy, --install,
  // --patch and --link.
  return /(?<![-\w])(?:rm|mv|cp|install|mkdir|rmdir|touch|truncate|tee|dd|patch|apply_patch|rsync|chmod|chown|ln)(?![-\w])/.test(executable)
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
    // `origin/main:docs/adr/BACKLOG.md` is a git revision, not a file: `git show
    // <rev>:<path>` reads out of history and writes nothing, but the token was
    // resolved against the working directory and a path that has never existed
    // was reported as changed. A colon past the first two characters cannot be a
    // Windows drive letter, so it is not a path this gate can check.
    if (/^.{2,}:/.test(candidate)) continue
    candidate = candidate.replace(/[),\]]+$/g, '')
    if (candidate.includes('=') && candidate.startsWith('-')) {
      candidate = candidate.slice(candidate.lastIndexOf('=') + 1)
    }
    paths.push(...expandExistingGlob(candidate, cwd))
  }
  return [...new Set(paths)]
}

export function bashDeletionMutationPaths(command, cwd = process.cwd(), platform = process.platform) {
  if (typeof command !== 'string' || !/\brm\b/.test(command)) return []
  const paths = []
  let unresolved = false
  // `W=/tmp/scratch; rm -rf "$W"` names its own path: the value is in the
  // command, in front of the use. Without this the sentinel armed on every
  // scratch cleanup written that way, and — since a publish after an unresolved
  // deletion fails closed — bricked committing for the rest of the session.
  // Measured 2026-08-26 on this repository, mid-session.
  //
  // Only assignments made EARLIER in the same command count, and never the
  // ambient environment: an expansion here disarms the sentinel, so a value this
  // command did not set is not evidence of what was deleted.
  const assignments = new Map()
  for (const region of shellCommandRegions(withoutHeredocBodies(command))) {
    for (const segment of shellSegments(region)) {
      const assignment = segment.match(/^([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S*)$/)
      if (assignment) {
        const value = expandShellToken(assignment[2], assignments, false)
        if (value !== null) assignments.set(assignment[1], value)
        continue
      }
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
        const operand = /\$/.test(raw) ? expandShellToken(raw, assignments, false) : raw
        // `\` is a shell escape on POSIX and a path separator on Windows, where
        // treating it as unresolvable made EVERY literal path deletion unresolved
        // — which is why the sticky sentinel bit hardest there. Measured on
        // windows-latest 2026-08-26: `rm -rf C:\Users\…\scratch` reported
        // <Unresolved Bash deletion>.
        const ambiguous = platform === 'win32' ? '*?[]{}' : '*?[]{}\\'
        if (!operand || /[`$]/.test(operand) || operand.includes('://')
            || [...operand].some(character => ambiguous.includes(character))) {
          unresolved = true
          continue
        }
        const resolved = resolveToolPath(operand, cwd)
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

// The OS temp roots, symlink-resolved once per call. `/tmp` is a symlink to
// `/private/tmp` on macOS and os.tmpdir() points into /var/folders, so the
// judgement below realpaths both sides before comparing.
function tempRoots() {
  const roots = new Set(['/tmp', '/private/tmp', '/var/folders', '/private/var/folders', os.tmpdir()])
  try { roots.add(realpathSync(os.tmpdir())) } catch {}
  return [...roots]
}

function underTempRoot(candidate, depth = 0) {
  if (depth > 8) return false
  let resolved = path.resolve(candidate)
  // Judge the real location, not the spelling: a symlink under /tmp pointing
  // into a repository must be treated as the repository. The leaf needs lstat,
  // not stat — a symlink to a missing repo file still CREATES that file when
  // written through, and stat on it just throws.
  try {
    if (lstatSync(resolved).isSymbolicLink()) {
      return underTempRoot(path.resolve(path.dirname(resolved), readlinkSync(resolved)), depth + 1)
    }
    resolved = realpathSync(resolved)
  } catch {
    try {
      const anchor = nearestExistingDirectory(resolved)
      if (anchor) resolved = path.join(realpathSync(anchor), path.relative(anchor, resolved))
    } catch {}
  }
  return tempRoots().some(root => resolved === root || resolved.startsWith(root + path.sep))
}

// Words whose written targets are their operands, so a temp-only claim about
// them can actually be checked. Everything else mutating stays a mutation.
const TEMP_ACCOUNTABLE_WORDS = new Set(['rm', 'mv', 'cp', 'mkdir', 'rmdir', 'touch', 'truncate', 'tee'])
// Mutators whose targets this function cannot enumerate; their presence
// disqualifies the whole command from the exemption.
const TEMP_UNACCOUNTABLE = /\b(?:install|dd|patch|apply_patch|rsync|chmod|chown|ln)\b|\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|exec)\b|\b(?:cargo\s+fmt|go\s+generate|gofmt|black|ruff\s+format)\b|\bprettier\b[^\n]*\s--write\b|\bfind\b[^\n]*\s-delete\b|(?:^|\s)(?:\S*[\\/])?adr-verify(?:\s|$)/i

// Matches the glued form (`x>file`) as well as the spaced one, because the
// exemption must account for every `>` in the command, not only the ones the
// mutation classifier recognizes. Over-matching inside quotes is deliberate:
// an over-match can only fail the exemption, never widen it.
const REDIRECT_TARGET = />>?\s*("[^"]*"|'[^']*'|[^\s;|&<>]+)/g

// `fromEnvironment` is false wherever expanding a variable WIDENS what the gate
// will accept. In mutatesOnlyTempPaths a wrong expansion can only fail the temp
// exemption, so the ambient environment is a safe last resort. In
// bashDeletionMutationPaths it is the reverse: resolving `$W` turns an
// unresolved deletion into a named path and disarms the sentinel, so only a
// value this command set itself may be trusted.
function expandShellToken(token, assignments, fromEnvironment = true) {
  let value = token
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  const expanded = value.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (match, braced, plain) => assignments.get(braced ?? plain)
      ?? (fromEnvironment ? process.env[braced ?? plain] : undefined)
      ?? match)
  return /[`$]/.test(expanded) ? null : expanded
}

// True only when every write this command performs provably lands under the OS
// temp directories. A scratch note, a probe script, a heredoc-built commit
// message — none of them is the repository's work, so none of them should
// demand repository evidence or a task branch. Measured 2026-08-25: a session
// spent on writing THIS harness was nagged at every Stop for scratchpad writes
// under /private/tmp. Anything unprovable keeps today's answer: a mutation.
export function mutatesOnlyTempPaths(command, cwd) {
  if (typeof command !== 'string' || typeof cwd !== 'string') return false
  const base = nearestExistingDirectory(path.resolve(cwd))
  // A project that itself lives under a temp root gets no exemption — there the
  // "scratch" writes ARE the repository's files. This also keeps the test
  // suite's own temp fixtures under full strictness.
  if (!base || underTempRoot(base)) return false

  const executable = withoutHeredocBodies(command)
  if (TEMP_UNACCOUNTABLE.test(executable)
      || inPlaceEditorCommand(executable)
      || interpreterCommandLooksMutating(command, executable)
      || isGitMutationCommand(executable)) return false

  // Assignments made inside the command are the only variable values this
  // function trusts, and only in the order they were made: a use may see the
  // assignments before it, never one after it, or `S=<repo>; write $S; S=/tmp`
  // would classify the repo write as scratch.
  const assignments = new Map()
  let accounted = 0
  for (const region of shellCommandRegions(executable)) {
    for (const segment of shellSegments(region)) {
      const assignment = segment.match(/^([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S*)$/)
      if (assignment) {
        const value = expandShellToken(assignment[2], assignments)
        if (value !== null) assignments.set(assignment[1], value)
        continue
      }
      const targets = []
      // Every redirect in every segment is accounted, even in a segment the
      // mutation classifier does not flag: `echo x>f` writes f all the same.
      for (const match of segment.matchAll(REDIRECT_TARGET)) {
        const raw = match[1]
        if (raw.startsWith('&') || raw === '-' || raw === '/dev/null') continue
        targets.push(raw)
      }
      const mutating = isPotentialMutationCommand(segment)
      if (!mutating && targets.length === 0) continue
      const invocation = commandInvocation(segment)
      const word = invocation ? executableName(invocation.words[invocation.index]) : ''
      if (TEMP_ACCOUNTABLE_WORDS.has(word)) {
        // `cp` READS its sources and WRITES only its destination, so copying a
        // repository file into scratch mutates nothing in the repository —
        // requiring every operand to be under the temp root made
        // `cp notes.md "$S/"` look like repository authorship. `mv` is not the
        // same shape: it removes the source, so both ends are mutations.
        const operands = []
        let optionsEnded = false
        for (const argument of invocation.words.slice(invocation.index + 1)) {
          if (!optionsEnded && argument === '--') { optionsEnded = true; continue }
          if (!optionsEnded && argument.startsWith('-')) {
            // An option can smuggle the DESTINATION: `cp -tDIR` and
            // `--target-directory=DIR` write into DIR while looking like flags.
            // A '='-attached value is checked as a target; the -t forms are
            // beyond safe accounting, so they disqualify outright.
            if (word === 'cp' || word === 'mv') {
              if (/^-t/.test(argument) || /^--target-directory/.test(argument)) return false
            }
            const attached = argument.match(/^--?[A-Za-z][A-Za-z-]*=(.+)$/)
            if (attached) targets.push(attached[1])
            continue
          }
          if (word === 'cp') operands.push(argument)
          else targets.push(argument)
        }
        // The destination is the last operand. With only one, it is the only
        // thing named and stays accountable.
        if (operands.length > 0) targets.push(operands[operands.length - 1])
      } else if (mutating && targets.length === 0) {
        // Mutating for a reason this function did not identify: keep it a mutation.
        return false
      }
      if (mutating && targets.length === 0) return false
      for (const target of targets) {
        const expanded = expandShellToken(target, assignments)
        if (expanded === null || expanded.length === 0
            || [...expanded].some(character => '*?[]{}'.includes(character))) return false
        const resolved = resolveToolPath(expanded, cwd)
        if (!resolved || !underTempRoot(resolved)) return false
      }
      if (mutating) accounted += 1
    }
  }
  return accounted > 0
}

// Classifies one git segment for the evidence gate. 'refresh' changes which
// tree the session is on without authoring anything (a branch switch, a
// fast-forward integration); 'inert' changes neither (creating a branch where
// you stand); null is everything else.
function gitTreeRefreshKind(segment, cwd) {
  const trimmed = segment.trim()
  const invocation = gitInvocation(trimmed)
  if (!invocation || /`|\$\(/.test(trimmed) || WRITE_REDIRECT.test(trimmed)) return null
  const { subcommand, subcommandIndex, words } = invocation
  const args = []
  let separated = false
  for (const argument of words.slice(subcommandIndex + 1)) {
    if (argument === '--') { separated = true; break }
    args.push(argument)
  }
  // A non-fast-forward pull can CREATE a merge commit — that is authorship,
  // not navigation, and it stays a mutation like it always was.
  if (subcommand === 'pull') return args.includes('--ff-only') ? 'refresh' : null
  if (subcommand === 'merge') return args.includes('--ff-only') ? 'refresh' : null
  if (subcommand === 'switch') {
    if (!args.some(argument => ['-c', '-C', '--orphan'].includes(argument))) return 'refresh'
    // Creating a branch with an explicit start point lands on that tree.
    return args.filter(argument => !argument.startsWith('-')).length > 1 ? 'refresh' : 'inert'
  }
  if (subcommand === 'checkout') {
    const operands = args.filter(argument => !argument.startsWith('-'))
    if (args.some(argument => ['-b', '-B', '--orphan'].includes(argument))) {
      return operands.length > 1 ? 'refresh' : 'inert'
    }
    if (separated) return null
    if (operands.length === 1 && localBranchExists(gitCommandDirectory(trimmed, cwd), operands[0])) {
      return 'refresh'
    }
    return null
  }
  return null
}

// Whole-command navigation verdict: 'refresh' when the command only navigates
// and at least one segment changes which tree the session stands on; 'inert'
// when it only creates a branch in place; null when any segment does real work.
// The evidence gate treats a refresh as STALENESS, not authorship — it
// invalidates prior evidence because the tested tree is no longer the current
// tree, but a session that only navigated authored nothing and owes nothing.
// That is the second reading of the gate's question, decided 2026-08-25
// ("working, not blocking") while keeping the stale-evidence pins
// (tests/lifecycle.test.mjs: edit, test, pull is still unverified).
export function bashNavigationImpact(command, cwd) {
  if (typeof command !== 'string') return null
  let refreshSeen = false
  let inertSeen = false
  for (const region of shellCommandRegions(withoutHeredocBodies(command))) {
    for (const segment of shellSegments(region)) {
      const kind = gitTreeRefreshKind(segment, cwd)
      if (kind === 'refresh') { refreshSeen = true; continue }
      if (kind === 'inert') { inertSeen = true; continue }
      if (isPotentialMutationCommand(segment)) return null
    }
  }
  return refreshSeen ? 'refresh' : inertSeen ? 'inert' : null
}

// A one-line, readable stand-in for a Bash command whose writes could not be
// resolved to a path.
//
// It used to be the command's first 120 characters verbatim. A heredoc or a
// shell function definition then put raw newlines and a mid-token truncation
// into the completion message, and five of them joined by ", " made the sentence
// that is supposed to say WHAT CHANGED unreadable. Reported from a live 2.1.7
// session on 2026-08-26:
//
//   Changed paths include: …, <Bash mutation: cd /repo
//   python3 - <<'PY'
//   import io
//   p="tests/Unit/Notifications/CustomerEmailTest.p>, <Bash mutation: cd /repo
//
// A reader needs to recognize the command, not re-read it: one line, cut at a
// word boundary. The marker only has to stay a non-absolute string —
// runArtifactGates skips it by `path.isAbsolute`, which is what keeps an
// unresolvable command out of the gate rather than into it.
//
// Taking the FIRST line was the wrong line. An agent's Bash call almost always
// opens by moving to the repository, so line one is `cd <somewhere>` and naming
// it names the one segment that changed nothing. Reported from a live 2.3.0
// session on 2026-08-26, where the advisory read:
//
//   Changed paths include: <Bash mutation: cd /src/the-project>,
//   <Bash mutation: cd /src/the-project>, …
//
// — five markers, all the same, none of them the write. Peel the navigation and
// describe what is left.
export function describeCommand(command, limit = 72) {
  // A heredoc body is input to a command, not the command. Splicing it in is
  // what put raw newlines and mid-token truncation into the sentence before.
  const script = withoutHeredocBodies(String(command ?? ''))
  let remainder = script
  while (true) {
    const peeled = remainder.replace(NAVIGATION_PREFIX, '')
    if (peeled === remainder) break
    remainder = peeled
  }
  // All navigation and nothing else: describe the navigation rather than nothing.
  const line = collapse(remainder) || collapse(script)
  if (line.length <= limit) return line
  const cut = line.slice(0, limit)
  const boundary = cut.lastIndexOf(' ')
  return `${(boundary > limit / 2 ? cut.slice(0, boundary) : cut).trimEnd()}…`
}

// `cd <dir>` (or pushd/popd) followed by a separator — newline included, since
// that is how a multi-line Bash call is written. The argument separator is
// [ \t]+ and not \s+ deliberately: \s crosses the newline, so `cd /repo\ngit add
// -A && git commit` had its `git add -A &&` eaten as further arguments to cd and
// the marker named the wrong half of the command.
const NAVIGATION_PREFIX = /^\s*(?:cd|pushd|popd)(?:[ \t]+(?:"[^"]*"|'[^']*'|[^\s;&|<>]+))*[ \t]*(?:&&|;|\n)/

const collapse = text => text.replace(/\s+/g, ' ').trim()

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
  let lastTreeRefresh = -1
  let lastValidation = -1
  let lastSuccessfulValidation = -1
  let lastUnresolvedDeletion = -1
  let lastPublish = -1
  const mutationPaths = []
  // Where each path was recorded, so a boundary can ask for the ones that matter
  // to it. The flat list above keeps its meaning for every existing consumer.
  const mutationPositions = []
  const record = (position, ...values) => {
    for (const value of values) {
      mutationPaths.push(value)
      mutationPositions.push(position)
    }
  }

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
      if (typeof filePath === 'string') record(use.position, filePath)
    }
    if (use.name === 'Bash' && executed(use)) {
      const navigation = bashNavigationImpact(use.input.command, cwd)
      if (navigation === 'refresh') {
        // Navigation is not authorship, but it does change which tree the
        // session stands on, so it stales prior evidence without demanding new
        // evidence of its own. 'inert' (creating a branch in place) does
        // neither.
        lastTreeRefresh = Math.max(lastTreeRefresh, use.position)
      } else if (navigation !== 'inert' && isPotentialMutationCommand(use.input.command)
          && !mutatesOnlyTempPaths(use.input.command, cwd)) {
        lastMutation = Math.max(lastMutation, use.position)
        record(use.position, ...bashMarkdownMutationPaths(use.input.command, cwd))
        const deletions = bashDeletionMutationPaths(use.input.command, cwd)
        if (deletions.includes(UNRESOLVED_DELETION_MUTATION)) {
          lastUnresolvedDeletion = Math.max(lastUnresolvedDeletion, use.position)
        }
        record(use.position, ...deletions)
        record(use.position, `<Bash mutation: ${describeCommand(use.input.command)}>`)
      }
      if (isGitPublishCommand(use.input.command)) {
        lastPublish = Math.max(lastPublish, use.position)
      }
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
      && lastSuccessfulValidation > Math.max(lastMutation, lastTreeRefresh)
      && lastSuccessfulValidation === lastValidation,
    lastMutation,
    lastPublish,
    lastSuccessfulValidation,
    mutationPaths,
    // Paths recorded after a given position. A commit gates what is being
    // published now, not everything the session has ever touched: mutationPaths
    // is append-only across the whole transcript, so re-gating all of it at every
    // commit meant an ADR-heavy session eventually exceeded the boundary's 45s
    // window and then EVERY commit failed, whatever was staged. Reported from a
    // live 2.1.7 session on 2026-08-26 and reproduced here.
    mutationPathsSince: position => mutationPaths.filter((_, index) => mutationPositions[index] > position),
    // Whether anything authored AFTER `position` is still unchecked. The commit
    // gate asks about what it is publishing now; the completion gate asks about
    // the whole session, which is what verifiedAfterLastMutation answers.
    unverifiedSince: position => lastMutation > position
      && !(lastSuccessfulValidation > Math.max(lastMutation, lastTreeRefresh)
        && lastSuccessfulValidation === lastValidation),
    lastUnresolvedDeletion,
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
  const deleted = spawnSync('git', ['-C', cwd, '-c', 'core.quotePath=false', 'diff', '--no-renames', '--name-only', '--diff-filter=D', 'HEAD'], options)
  if (deleted.status !== 0) return null
  const top = root.stdout.trim()
  return deleted.stdout.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(relative => path.join(top, relative))
}

// Reads the operator's budget under the runner's own range. Above the 110s
// ceiling it CLAMPS to the ceiling — an operator who asked for more wanted more,
// not the default back; garbage or a sub-100ms value falls back to the default.
export function artifactGateTimeoutMs(env = process.env) {
  const configured = Number(env.QUALITY_HARNESS_SHELL_TIMEOUT_MS)
  if (!Number.isSafeInteger(configured) || configured < 100) return ARTIFACT_GATE_TIMEOUT_MS
  return Math.min(configured, 110_000)
}

// windowMs bounds the WHOLE pass, not one artifact. The hook this runs inside
// has its own deadline (hooks.json: 60s at PreToolUse, 120s at completion), and
// a hook that dies on that deadline blocks nothing — so letting per-artifact
// budgets add up past the window would turn the gate fail-open exactly when the
// corpus is big enough to matter. Running out of window is itself a blocking
// failure.
// True when the artifact gate ran out of its budget rather than reaching a verdict.
//
// The same budget runs out two ways. Normally run-shell-hook.mjs outlives its
// child and reports `timed out after Nms` itself; but the spawn in
// runArtifactGates carries a kill margin, and on a slow host that margin expires
// first, leaving only the outer ETIMEDOUT. Measured 2026-08-25 on windows-latest,
// where the finding read `spawnSync … node.exe ETIMEDOUT` and named neither the
// budget nor the setting that raises it — a wall with no way over it.
//
// Separated from runArtifactGates so both arms are testable anywhere: the outer
// arm is unreachable on a host fast enough to let the runner win the race.
export function budgetExhausted(detail, error) {
  return /timed out after \d+ms/.test(detail) || error?.code === 'ETIMEDOUT'
}

export function runArtifactGates(paths, cwd = process.cwd(), windowMs = 100_000) {
  const hook = path.join(PLUGIN_ROOT, 'scripts', 'facts-gate-dispatch.sh')
  if (!existsSync(hook)) return null
  const runner = path.join(PLUGIN_ROOT, 'scripts', 'run-shell-hook.mjs')
  if (!existsSync(runner)) return 'Artifact validation failed:\nThe cross-platform shell-hook runner is missing.'

  const deadline = Date.now() + windowMs
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
    const remaining = deadline - Date.now()
    if (remaining < 1_000) {
      failures.push(`The boundary's ${Math.round(windowMs / 1000)}s window was exhausted before ${filePath} was gated. `
        + 'This is a budget, not a finding: gate fewer artifacts per boundary, or commit in smaller sets.')
      break
    }
    const timeoutMs = Math.min(artifactGateTimeoutMs(), remaining)
    const run = spawnSync(process.execPath, [runner, 'facts-gate-dispatch.sh'], {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      env: { ...process.env, QUALITY_HARNESS_SHELL_TIMEOUT_MS: String(Math.max(timeoutMs, 100)) },
      timeout: timeoutMs + ARTIFACT_GATE_KILL_MARGIN_MS,
    })
    // The exit code no longer carries the verdict: the gates advise, so a finding
    // arrives as OUTPUT with a clean exit. Reading status alone would drop every
    // one of them silently, which is worse than blocking ever was — advisory has
    // to mean reported, not swallowed.
    const said = (run.stderr || '').trim()
    if (run.status !== 0 || said) {
      const detail = (said || run.error?.message || `artifact gate exited ${run.status}`).trim()
      // A gate that ran out of time reported nothing about the artifact — name
      // the budget, because the gate's own words would send the reader to the
      // record instead of to the clock.
      failures.push(budgetExhausted(detail, run.error)
        ? `${detail}\nThe gate did not finish, so it says nothing about ${filePath}. `
          + `This is a budget, not a finding: raise QUALITY_HARNESS_SHELL_TIMEOUT_MS `
          + `(currently ${timeoutMs}ms, max 110000) for a corpus this size — the boundary `
          + `still caps the whole pass at ${Math.round(windowMs / 1000)}s so the hook `
          + `cannot outlive its own deadline.`
        : detail)
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

// Discovery, in the order a person would try: the repository's own script, then
// its package manifest, then its build file, then the language's default. Only
// commands VALIDATION_PATTERNS already accepts as evidence are offered — telling
// someone to run something the gate would then refuse is worse than saying
// nothing. Returns null when the project names no check; the gate must not
// invent one.
const PROJECT_CHECKS = [
  { file: 'scripts/selftest.sh', command: 'bash scripts/selftest.sh' },
  { file: 'selftest.sh', command: 'bash selftest.sh' },
  // Ahead of the language manifests on purpose: a repository that ships a
  // verify script has said what its check is, and `cargo test` / `go test ./...`
  // is a guess at part of it. blueprints ran `./verify.sh`, this list did not
  // know the name, and the gate asked for "the smallest repository-owned test,
  // lint, build, or validation command" — naming nothing it could not already
  // see. Reported 2026-08-26.
  { file: 'scripts/verify.sh', command: 'bash scripts/verify.sh' },
  { file: 'verify.sh', command: 'bash verify.sh' },
  { file: 'Cargo.toml', command: 'cargo test' },
  { file: 'go.mod', command: 'go test ./...' },
  { file: 'pytest.ini', command: 'pytest' },
  { file: 'tox.ini', command: 'pytest' },
]

function packageManagerCommand(directory) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))
  } catch { return null }
  const scripts = manifest?.scripts
  if (!scripts || typeof scripts !== 'object') return null
  const runner = existsSync(path.join(directory, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(path.join(directory, 'yarn.lock')) ? 'yarn'
    : existsSync(path.join(directory, 'bun.lockb')) ? 'bun'
    : 'npm'
  for (const name of ['test', 'check', 'lint', 'typecheck', 'build']) {
    if (typeof scripts[name] === 'string' && scripts[name].trim()) {
      return runner === 'npm' ? `npm run ${name}` : `${runner} ${name}`
    }
  }
  return null
}

function makeTargetCommand(directory) {
  for (const file of ['Makefile', 'makefile', 'justfile', 'Justfile']) {
    let source
    try { source = readFileSync(path.join(directory, file), 'utf8') } catch { continue }
    const runner = /justfile/i.test(file) ? 'just' : 'make'
    for (const target of ['test', 'check', 'lint', 'verify', 'validate', 'build']) {
      if (new RegExp(`^${target}\\s*:`, 'm').test(source)) return `${runner} ${target}`
    }
  }
  return null
}

// The check this project owns, named so a session can run it instead of guessing.
export function projectCheckCommand(cwd = process.cwd()) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  if (!directory) return null
  const root = gitRepositoryRoot(directory) ?? directory
  for (const candidate of PROJECT_CHECKS) {
    if (existsSync(path.join(root, candidate.file))) return candidate.command
  }
  const packaged = packageManagerCommand(root)
  if (packaged) return packaged
  const made = makeTargetCommand(root)
  if (made) return made
  return null
}

function gitRepositoryRoot(directory) {
  const run = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', timeout: 5_000,
  })
  return run.status === 0 ? run.stdout.trim() : null
}

// Names the project's own check when there is one, so the gate asks for
// something specific instead of leaving the reader to guess which invocation
// counts. Falls back to the general phrasing when the project names none.
export function runTheCheckSentence(cwd) {
  const command = projectCheckCommand(cwd)
  return command
    ? `Run \`${command}\` (this project's own check) after the final edit and report the exact command and result.`
    : 'Run the smallest repository-owned test, lint, build, or validation command after the final edit and report the exact command and result.'
}

function missingEvidenceReason(state, cwd, paths = state.mutationPaths) {
  // Distinct paths, because the list is five slots wide and repeats spend them
  // saying the same thing. A live session filled all five with one identical
  // marker and the sentence that exists to say WHAT CHANGED said nothing.
  const distinct = [...new Set(paths)]
  const changed = distinct.length
    ? `Changed paths include: ${distinct.slice(-5).join(', ')}.`
    : 'The transcript contains file mutations.'
  return `${changed} ${runTheCheckSentence(cwd)} Do not add cleanup or new scope.`
}

// A task file was edited and the session's check went green: the corpus wants
// that recorded, not asserted. Returns null unless a touched path is a task file
// under a tasks/ directory, so this never fires for ordinary work.
function evidenceNudge(cwd, mutationPaths) {
  const directory = nearestExistingDirectory(path.resolve(cwd ?? process.cwd()))
  if (!directory) return null
  const tasks = mutationPaths.filter(candidate => typeof candidate === 'string'
    && path.isAbsolute(candidate)
    && /(^|[\\/])tasks[\\/][^\\/]+\.md$/.test(candidate)
    && !/readme\.md$/i.test(candidate)
    && existsSync(candidate))
  if (!tasks.length) return null
  return `Your check passed with ${tasks.length === 1 ? 'a task file' : 'task files'} edited. `
    + `Record it where the corpus can verify it: \`adr-verify ${tasks[0]}\` appends a `
    + 'tool-written Verification Log entry (exit code plus an acceptance digest). '
    + 'adr-lint will not accept a `done` status without one.'
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
    `Before returning after edits, ${runTheCheckSentence(input.cwd).replace(/^Run /, 'run ')}`,
    'Return touched files, exact executed evidence, and remaining risk or uncertainty.',
  ].join(' ')
}

function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

// ADVISORY ONLY. This harness does not refuse a tool call — it tells the agent
// what it found and leaves the decision where it belongs.
//
// It used to block, and across three projects in one day it refused legitimate
// work six times: a commit gate that degraded with session length until nothing
// could be committed, a deletion sentinel that fired only on deletions already
// checked, a read-only `> /dev/null` read as authorship, an unfilled template
// shape stopping an edit that had already landed. Every one of those was the
// harness fighting its user, and the pattern is what it teaches: an agent that
// loses turns to a gate learns to route around the gate, and then the gate
// protects nothing at all.
//
// So a finding is now information, delivered at the moment it can still be acted
// on. What the harness gives up is the ability to STOP a fabricated claim; what
// it keeps is the ability to name one, loudly, every time it sees it. That was
// the owner's call, made explicitly and more than once.
function advise(reason) {
  // BOTH channels, because each alone can hide the finding. Exit-0 stderr is
  // surfaced only in transcript view, so a finding written there alone reaches
  // nobody — advisory-that-nobody-sees is concealment, which the owner has
  // named as worse than having no plugin at all. `systemMessage` is shown in
  // the session regardless of exit code; stderr keeps it in the transcript.
  emitJson({ systemMessage: reason })
  process.stderr.write(`${reason}\n`)
}

const UNINTERESTING_DIRECTORY = /^(?:node_modules|vendor|target|dist|build|coverage|__pycache__|tests?|spec|fixtures?|testdata|examples?)$/i

// ADR task directories belonging to THIS repository. Deliberately narrow:
// walking a directory that is not a repository once surfaced another project's
// tasks from a shared temp directory, and a session must never be handed work
// that belongs to a codebase it was not opened on.
function taskDirectories(root) {
  const found = []
  const walk = (directory, depth, allowUninteresting) => {
    if (depth > 4 || found.length >= 6) return
    let entries
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      if (!allowUninteresting && UNINTERESTING_DIRECTORY.test(entry.name)) continue
      const child = path.join(directory, entry.name)
      if (entry.name === 'tasks') found.push(child)
      else walk(child, depth + 1, allowUninteresting)
    }
  }
  // `docs/` is where records live by convention; only fall back to the tree at
  // large when it holds none, and never into test fixtures either way.
  const docs = path.join(root, 'docs')
  if (existsSync(docs)) walk(docs, 0, false)
  if (!found.length) walk(root, 0, false)
  return found
}

// The gates in bin/ are `#!/usr/bin/env python3` scripts. Windows cannot exec a
// `#!` script, so spawning one directly returns status null — and readyTaskLines'
// `continue` swallowed that, leaving session orientation silently empty on every
// Windows session. Measured 2026-08-25 on windows-latest, where the hook produced
// nothing and reported no error. Name the interpreter there instead, falling back
// to `python` for an install that never created the python3 alias.
export function spawnGate(tool, args, options = {}, platform = process.platform) {
  if (platform !== 'win32') return spawnSync(tool, args, options)
  const run = spawnSync('python3', [tool, ...args], options)
  return run.error ? spawnSync('python', [tool, ...args], options) : run
}

function readyTaskLines(root, insideRepository) {
  // Without a repository there is no "this project", and the walk below would
  // be scanning whatever else shares the directory.
  if (!insideRepository) return []
  const tool = path.join(PLUGIN_ROOT, 'bin', 'adr-next')
  if (!existsSync(tool)) return []
  const lines = []
  for (const directory of taskDirectories(root)) {
    const run = spawnGate(tool, [directory, '--json'], { encoding: 'utf8', timeout: 10_000 })
    if (run.status !== 0 && run.status !== 3) continue
    let report
    try { report = JSON.parse(run.stdout) } catch { continue }
    const relative = path.relative(root, directory) || directory
    if (report.ready?.length) {
      const next = report.ready[0]
      lines.push(`  ${relative}: ${next.id} is ready — ${next.goal}`
        + (next.acceptance ? `; acceptance \`${next.acceptance}\`` : '')
        + `. Prove it with \`adr-verify ${path.relative(root, next.path) || next.path}\`.`)
    } else if (report.blocked?.length) {
      lines.push(`  ${relative}: nothing ready; ${report.blocked.length} task(s) blocked.`)
    } else if (report.done?.length) {
      lines.push(`  ${relative}: all ${report.done.length} task(s) carry exit-0 evidence.`)
    }
  }
  return lines
}

// What a session would otherwise learn by hitting a wall. Additive only: this
// hook can never block, and says nothing it cannot establish from the project
// itself — an empty orientation is correct for a project with no conventions.
export function sessionOrientation(cwd) {
  const directory = nearestExistingDirectory(path.resolve(cwd ?? process.cwd()))
  if (!directory) return ''
  const repositoryRoot = gitRepositoryRoot(directory)
  const root = repositoryRoot ?? directory
  const lines = []

  const check = projectCheckCommand(root)
  if (check) {
    lines.push(`Verification: this project's own check is \`${check}\`. `
      + 'The completion and commit gates accept it as evidence when it runs after your last edit; '
      + 'a piped or `|| true` run does not count, because it hides the exit code.')
  }

  const branch = gitBranch(root)
  if (protectedBranch(branch)) {
    lines.push(`Branch: you are on protected '${branch}'. Edits and commits here will each draw an `
      + `advisory — nothing stops them, but start with \`${taskBranchSuggestion(root)}\` and none of `
      + 'them fire. Navigation off it, `git pull --ff-only`, and scratch writes under the temp '
      + 'directory are unremarkable either way.')
  }

  const ready = readyTaskLines(root, repositoryRoot !== null)
  if (ready.length) {
    const shown = ready.slice(0, 3)
    if (ready.length > shown.length) shown.push(`  (+${ready.length - shown.length} more record set(s))`)
    lines.push(['ADR tasks in flight:', ...shown].join('\n'))
  }

  return lines.join('\n\n')
}

export async function handleHook(input) {
  const event = input.hook_event_name

  if (event === 'SessionStart') {
    const orientation = sessionOrientation(input.cwd)
    if (orientation) {
      emitJson({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: orientation,
        },
      })
    }
    return
  }

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
      advise(branchFailure)
      return
    }
    if (input.tool_name !== 'Bash') return
    const command = input.tool_input?.command
    if (!isGitPublishCommand(command)) return

    // The one case the transcript cannot cover: a command that deletes by an
    // unresolved path AND publishes, in that order, inside itself. This hook runs
    // BEFORE the command does, so the deletion is not in the transcript yet and
    // deletedTrackedPaths would answer about a tree the command has not touched.
    // Afterwards HEAD has moved and the answer is gone.
    //
    // The rule this replaces asked the transcript whether a publish had landed
    // after an unresolved deletion. Measured 2026-08-26, that is exactly
    // backwards: `rm -rf "$X" && git commit` in ONE command did NOT arm it —
    // both land at the same tool-use position and the comparison was strict —
    // while a deletion followed by a SEPARATE commit did, on every commit for the
    // rest of the session. But a separate commit runs this hook first, and
    // runArtifactGates resolves the deletion through deletedTrackedPaths while
    // HEAD still answers. So the old rule fired only on deletions that had
    // already been checked, and never on the one that had not. It blocked real
    // work in three different sessions and caught nothing.
    if (isGitPublishCommand(command)
        && bashDeletionMutationPaths(command, input.cwd).includes(UNRESOLVED_DELETION_MUTATION)) {
      advise('This command deletes by an unresolved path and commits in the same breath, so '
        + 'nothing can establish what was removed: before it runs the deletion has not happened, and '
        + 'after it HEAD no longer shows the difference. Name the deleted paths explicitly, or delete '
        + 'and commit as two commands — a separate commit is checked against the repository.')
      return
    }

    const raw = await readTranscript(input)
    if (!raw) {
      advise('Quality gate could not read the session transcript, so it cannot tell whether this '
        + 'change was checked. Nothing is wrong with your change and nothing is blocked — the gate '
        + `is blind here, not unhappy. ${runTheCheckSentence(input.cwd)} If this repeats, the `
        + 'transcript path the hook was given does not exist.')
      return
    }
    const state = analyzeTranscript(raw, input.cwd)
    // The PreToolUse hook has a 60s deadline (hooks.json) and a hook killed on
    // its deadline blocks nothing, so the artifact pass gets a window that fits
    // inside it.
    // What is being published now, not everything the session has touched. A
    // publish is the boundary at which authored work was submitted; re-gating it
    // at every later commit is what made a long session unable to commit at all.
    // A commit that bypassed this gate (--no-verify) still moves the boundary —
    // the override was the author's, and punishing every later commit for it is
    // the "fights you" behaviour this gate exists to avoid.
    const artifactFailure = runArtifactGates(state.mutationPathsSince(state.lastPublish), input.cwd, 45_000)
    if (artifactFailure) {
      advise(artifactFailure)
      return
    }
    // Since the last publish, for the same reason the artifact pass is: a commit
    // that itself counts as a mutation (`git add -A && git commit …`) made the
    // NEXT commit demand a check of the previous one, and no amount of testing
    // could satisfy it — the loop closed on the publish itself. Reported from a
    // live 2.3.0 session on 2026-08-26.
    // Same rule as the completion gates: with no check to name, this has nothing
    // to ask for.
    if (state.unverifiedSince(state.lastPublish) && projectCheckCommand(input.cwd)) {
      advise('Nothing has verified the work since your last change, so this commit would publish '
        + `unchecked. ${missingEvidenceReason(state, input.cwd, state.mutationPathsSince(state.lastPublish))} `
        + 'Nothing is blocked — this is what the gate sees before you commit.')
    }
    return
  }

  if (!['SubagentStop', 'TaskCompleted', 'Stop'].includes(event)) return
  if (input.stop_hook_active === true || (event === 'Stop' && hasBackgroundWork(input))) return

  const raw = await readTranscript(input)
  if (!raw) {
    const reason = 'Quality gate could not read the session transcript; completion evidence is '
      + 'unavailable. This is an environment problem, not a finding about your work: the hook was '
      + 'given a transcript path it cannot read.'
    if (event === 'TaskCompleted') advise(reason)
    else emitJson({ systemMessage: reason })
    return
  }
  const state = analyzeTranscript(raw, input.cwd)
  if (event !== 'Stop') {
    const artifactFailure = runArtifactGates(state.mutationPaths, input.cwd, 100_000)
    if (artifactFailure) {
      if (event === 'TaskCompleted') advise(artifactFailure)
      else emitJson({ systemMessage: artifactFailure })
      return
    }
  }
  // Since the last publish, like the commit gate. `git add -A && git commit` is
  // itself a git mutation, so a session that edited, checked, and committed
  // ended its turn being told nothing had verified the work — the check had run,
  // it just ran before the commit that came after it. Reported from blueprints,
  // 2026-08-26. Work authored AFTER the publish still counts, which is the case
  // this gate is actually for.
  if (!state.unverifiedSince(state.lastPublish)) {
    // The check passed, so there is no finding. If an ADR task is waiting on
    // exactly this kind of evidence, say so — a V-Log entry written by
    // adr-verify is the difference between a claim and a record.
    if (state.verifiedAfterLastMutation && event !== 'TaskCompleted') {
      const nudge = evidenceNudge(input.cwd, state.mutationPaths)
      if (nudge) emitJson({ systemMessage: nudge })
    }
    return
  }
  if (docsOnly(state.mutationPaths) && evidenceLimited(input.last_assistant_message)) return
  if (event === 'Stop' && interimResponse(input.last_assistant_message)) return
  // No check to name, nothing to ask for. This gate's whole question is "did you
  // run THE check", and in a project that declares none it degrades into "run the
  // smallest repository-owned test, lint, build, or validation command" at the
  // end of every single turn — advice that names nothing, cannot be satisfied,
  // and fires in repositories that never opted into this harness. Reported from
  // redash-api on 2026-08-26: "this is useless.. repeats everywhere even when we
  // do not work with quality harness".
  if (!projectCheckCommand(input.cwd)) return

  const reason = missingEvidenceReason(state, input.cwd, state.mutationPathsSince(state.lastPublish))
  if (event === 'TaskCompleted') {
    advise(reason)
    return
  }
  emitJson({ systemMessage: reason })
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
