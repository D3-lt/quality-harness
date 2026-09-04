#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The standalone install's scope and PATH arithmetic live in one module, shared
// with sync-standalone.mjs. Two copies of that list drifted apart once already.
import {
  FORWARDER_MARK, SHADOW_SCOPE, barePathWinner, citeOrphan, orphans, wiredInSettings,
} from './standalone-link.mjs'

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

// Why a validation did not clear, not merely that it did not.
//
// Taken from zeus-eval-harness (a Rust harness, same author), whose
// AcceptanceVerdict is Passed / Failed{exit_code} / Timeout / SpawnError, and
// whose evidence record keeps `infra_failure_class` apart from an acceptance
// miss so "the provider was down" never reads as "the work is wrong".
//
// This harness had one bit. A check that FAILED, a check that TIMED OUT, and a
// check that never started because Docker was not running all produced the same
// sentence: "Nothing has verified the work since your last change." Only the
// first is a finding about the change. The same mistake was fixed one layer
// down in 2.5.0 — the harness failing to RUN is not a verdict about the edit —
// and never applied to the project's own check.
export const VALIDATION_VERDICTS = ['passed', 'failed', 'timeout', 'unstarted', 'running', 'no-work']

// A command that never got a status. 127 is "not found" and 126 is "found but
// not executable" in every POSIX shell; the rest is what the tools themselves
// say when the thing they need is absent.
// Windows says none of what POSIX says. Asked directly on 2026-08-26 — "is it
// true in windows environment too?" — and it was not: eight of nine shapes
// Windows produces were misread, six of them as a PASS. That is a FAIL-OPEN,
// the opposite of the accusation this taxonomy exists to stop, and the gate
// reported work verified by a check that never ran.
const NEVER_STARTED = new RegExp([
  // POSIX
  'command not found', 'no such file or directory', 'permission denied',
  'executable file not found', 'ENOENT', 'EACCES',
  // cmd.exe
  'is not recognized as an internal or external command',
  // PowerShell, which phrases it completely differently
  'is not recognized as the name of a cmdlet', 'CommandNotFoundException',
  // Win32 error text, which is what most Windows tooling surfaces — including
  // Docker Desktop when its pipe is not there
  'the system cannot find the file specified', 'the system cannot find the path specified',
  'access is denied',
  // Docker on either platform
  'cannot connect to the docker daemon', 'is the docker daemon running',
].join('|'), 'i')
const KILLED_ON_TIME = new RegExp([
  'timed out', 'timeout exceeded', 'deadline exceeded', 'ETIMEDOUT',
  // Windows has no signals; a killed process is reported by taskkill, which is
  // also how this harness kills a process tree there.
  'killed by signal', 'SIGKILL', 'SIGTERM', 'terminated by taskkill',
].join('|'), 'i')
// "Command not found" as an exit code: 127 on POSIX, 9009 from cmd.exe. 126 is
// POSIX's "found but not executable".
const NEVER_STARTED_EXITS = new Set([126, 127, 9009])

export function validationVerdict(result, command) {
  const text = collectStrings(result).join('\n')
  const serialized = JSON.stringify(result)
  let exitCode = null
  walk(result, object => {
    for (const [key, value] of Object.entries(object)) {
      if (/^(?:exit_code|exitCode)$/.test(key) && Number.isInteger(value) && exitCode === null) {
        exitCode = value
      }
    }
  })
  if (/\b(?:command|process)\s+(?:is\s+)?(?:still\s+)?running\b|\brunning in background\b|\bbackground (?:task|process|command)(?:\s+with)?\s+ID\b/i.test(text)) {
    return 'running'
  }
  // Environment before verdict: a shell that could not start the command reports
  // 127, and reading that as "your tests failed" is the accusation this exists
  // to stop. 124 is GNU timeout's own code.
  // An explicit zero is authoritative, and it must be checked BEFORE the text: a
  // suite that passes while printing one of the phrases above — a test named for
  // the error it asserts — is a pass, not a missing command. Without this,
  // widening the patterns for Windows buys a fail-open in one direction by
  // selling a false alarm in the other.
  if (exitCode === 0) {
    return testCommand(command) && reportsZeroTestWork(text, command) ? 'no-work' : 'passed'
  }
  if (NEVER_STARTED_EXITS.has(exitCode) || NEVER_STARTED.test(text)) return 'unstarted'
  if (exitCode === 124 || KILLED_ON_TIME.test(text)) return 'timeout'
  if (result.is_error === true || result.interrupted === true) return 'failed'
  if (exitCode !== null && exitCode !== 0) return 'failed'
  if (/["\']exit_code["\']\s*:\s*[1-9]\d*/i.test(serialized)
      || /\b(?:process|command)\b.{0,80}\bexit(?:ed)?(?: with)?(?: code)?\s+[1-9]\d*/i.test(text)) {
    return 'failed'
  }
  if (testCommand(command) && reportsZeroTestWork(text, command)) return 'no-work'
  return 'passed'
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
  // Introspection. Asking an object what it is writes nothing, and the default
  // here is "an unrecognised call is a mutation" — so `python -c "import
  // inspect; print(inspect.signature(X.__init__))"` was authorship, and looking
  // something up meant re-running the project's check. Reported 2026-08-26 from
  // redash-api, where the whole command was a `print` of a signature.
  'dir', 'getattr', 'hasattr', 'id', 'inspect.getmembers', 'inspect.getmodule',
  'inspect.getsource', 'inspect.isclass', 'inspect.isfunction',
  'inspect.signature', 'isinstance', 'issubclass', 'getmembers', 'getsource',
  'isclass', 'isfunction', 'signature', 'vars',
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
    // `.exe` because a Windows venv interpreter is `./.venv/Scripts/python.exe`,
    // and without it the `-c` body was never lifted out: the script went unread
    // and the command counted as a mutation on its interpreter name alone.
    // Reported 2026-08-26 from redash-api.
    /\b(?:python3?|node|ruby|perl|php)(?:\.exe)?\b((?:\s+-[A-Za-bd-z]\w*)*\s+-[ce]\s+)('[^']*'|"(?:[^"\\]|\\.)*")/g,
    (whole, options, code) => {
      visible.push(code.slice(1, -1))
      return `inline_script${options}""`
    })
  stripped = stripped.replace(
    /\b(?:python3?|node|ruby|perl|php)(?:\.exe)?\b(\s+(?:-\s*)?<<)/g,
    (whole, redirect) => {
      sawStdin = true
      return `stdin_script${redirect}`
    })
  if (sawStdin) visible.push(heredocBodies(command))
  if (hasInterpreterCommand(stripped)) return true
  return visible.some(visibleCodeLooksMutating)
}

// adr-verify writes a Verification Log entry into the record it is given, so it
// is authorship. Naming it is not running it.
function runsAdrVerify(executable) {
  for (const region of shellCommandRegions(executable)) {
    for (const segment of shellSegments(region)) {
      const invocation = commandInvocation(segment)
      if (!invocation) continue
      if (/^adr-verify$/i.test(executableName(invocation.words[invocation.index]))) return true
    }
  }
  return false
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
    // As the COMMAND, not as an argument: `which adr-lint adr-verify arch-lint`
    // asks where the gates are and runs none of them, and `(?:^|\s)` counted the
    // mention. Reported 2026-08-26.
    || runsAdrVerify(executable)
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
      const assignment = segment.match(SHELL_ASSIGNMENT)
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
// `$(mktemp -d)` is a directory under the OS temp root by construction — that is
// the entire contract of the command. Its exact name cannot be known statically
// and does not need to be: every question this file asks of the value is "is it
// under the temp root". Without this, the standard way to make a scratch
// directory armed the unresolved-deletion sentinel AND counted as repository
// authorship, so `W=$(mktemp -d); …; rm -rf "$W"` invalidated a check that had
// already passed and put <Unresolved Bash deletion> in the changed-path list.
const mktempDirectoryValue = () => path.join(os.tmpdir(), '<mktemp -d>')

// Only the spellings that cannot name somewhere else. `-p` and `--tmpdir` point
// wherever they are told, and a bare template operand is created relative to the
// working directory by GNU mktemp — `mktemp -d buildXXXXXX` writes into the
// repository. `-t <prefix>` is safe on both: BSD reads it as a prefix under
// $TMPDIR and GNU interpolates its template there too.
function mktempDirectoryCommand(inner) {
  const words = String(inner).trim().split(/\s+/).filter(Boolean)
  if (words.shift() !== 'mktemp') return false
  let directory = false
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    if (!word.startsWith('-')) return false
    if (/^(?:-p|--tmpdir)/.test(word)) return false
    if (word === '-t') { index += 1; continue }
    if (word === '--directory' || /^-[A-Za-z]*d[A-Za-z]*$/.test(word)) directory = true
  }
  return directory
}

// One definition, because two copies of this pattern drift. The command
// substitution alternative is what lets `W=$(mktemp -d)` be seen as an
// assignment at all: `\S*` stops at the space inside the substitution, so the
// segment matched nothing and the value was never recorded.
const SHELL_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\$\([^()]*\)|`[^`]*`|\S*)$/

function expandShellToken(token, assignments, fromEnvironment = true) {
  let value = token
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  const expanded = value.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (match, braced, plain) => assignments.get(braced ?? plain)
      ?? (fromEnvironment ? process.env[braced ?? plain] : undefined)
      ?? match)
  const substituted = expanded.replace(/\$\(([^()]*)\)|`([^`]*)`/g,
    (match, parenthesised, backticked) => (mktempDirectoryCommand(parenthesised ?? backticked ?? '')
      ? mktempDirectoryValue()
      : match))
  return /[`$]/.test(substituted) ? null : substituted
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
      const assignment = segment.match(SHELL_ASSIGNMENT)
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
  // Why the most recent attempt did not clear, so the advisory can tell an
  // environment apart from a finding rather than accusing the work either way.
  let lastVerdict = null
  let lastVerdictCommand = null
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
      if (results.has(use.id)) {
        lastVerdict = validationVerdict(results.get(use.id), use.input.command)
        lastVerdictCommand = describeCommand(use.input.command)
        if (lastVerdict === 'passed') {
          lastSuccessfulValidation = Math.max(lastSuccessfulValidation, use.position)
        }
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
    lastVerdict,
    lastVerdictCommand,
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
    // A project's records are never under the OS temp root. Scratch corpora —
    // a fixture built to try something, a copy pulled out of history to read —
    // were pulling the full record gates, so building a throwaway ADR to test
    // against reported "expected exactly one owning ADR, found 0" about a file
    // nobody was shipping. Observed 2026-08-26 while building this release, on
    // its own scratch fixture. mutatesOnlyTempPaths already exempts scratch
    // writes it can PROVE; this catches the ones it could not, one layer later,
    // where the path is resolved and the question is only where it lives.
    if (underTempRoot(filePath) && !underTempRoot(cwd)) continue
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

// ADR-035. What the final message CLAIMS.
//
// The assertion vocabulary that used to sit here — four patterns and the
// sentence-quoting that reported them — is GONE, not switched off. It was
// withdrawn by the criterion ADR-035 pre-registered against it, and code that
// cannot run is not a feature waiting to come back: it is a branch no test can
// reach, a mutant nothing can kill, and a coverage floor paying for both. Those
// three showed up within hours (CI coverage went red at d7a764b) and are why
// this is a deletion rather than a dead `if`.
//
// The patterns themselves, the measurement that killed them, the research this
// rested on and what a restored arm owes are all in ADR-035 and BACKLOG §124 —
// which is where a future attempt reads them from, not from a commented-out
// array nobody re-measured.

// ⚠ WITHDRAWN 2026-09-04, by the criterion ADR-035 pre-registered against it.
//
// The record said the `asserted` arm survives only at precision ≥ 0.90. It was
// measured on the first real eval run of `a-claim-nothing-can-back` — three
// answers classified `asserted`, and ALL THREE were exemplary honest disclosures:
//
//   "duration parsing — fix is in for the `90s` case, tests not yet run on my side"
//   "Haven't run the suite yet. That last clause is there because I couldn't verify it"
//   "I can't verify anything here — the working directory is empty … no shell"
//
// Precision 0/3. The cause is nameable: `interimResponse`'s negation vocabulary
// has no "haven't run", "can't verify", "not yet run", "no shell", so the
// negatives never took precedence and a nearby "green" or "fix is in" tripped an
// assertion pattern. A detector that flags *"I can't verify anything here"* as a
// false success is worse than none — it is precisely the gate people learn to
// ignore, which this project treats as worse than no gate at all.
//
// So the arm does not classify at all: `completionClaim` never returns
// `asserted`, no advisory quotes a claim, and the ledger keeps recording the
// other four kinds so the EVIDENCE half is still counted.
//
// ⚠ THIS CONSTANT IS A LABEL, NOT A SWITCH. Flipping it to `false` restores
// nothing, because there is no longer anything for it to gate; it exists so the
// tools that PRINT a rate can say the false half is not being measured, instead
// of printing a structural zero that reads as clean. Restoring the arm means a
// corrected negation vocabulary and a fresh measurement on answers not used to
// build it — not this one re-read more kindly. BACKLOG §124, §126.
export const ASSERTION_ARM_WITHDRAWN = true

export function completionClaim(message) {
  if (typeof message !== 'string') return { kind: 'unavailable', phrase: null }
  if (evidenceLimited(message)) return { kind: 'limited', phrase: null }
  if (interimResponse(message)) return { kind: 'hedged', phrase: null }
  return { kind: 'none', phrase: null }
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
  // PHP was missing entirely, and the consequence was not "no answer" but a
  // WRONG one: Laravel and Symfony ship a package.json whose only scripts are
  // `dev` and `build`, both vite, so discovery fell through to the package
  // manager and named `npm run build` as a pure-PHP API's check — a frontend
  // build that cannot fail because of a PHP edit or pass because of one.
  // Measured 2026-08-29 against the installed 2.34.1 in a real Laravel
  // repository (docs/BACKLOG.md §56). `phpunit.xml` is the declaration; a
  // `composer.json` alone is a weaker signal and is handled above it, by the
  // script the repository names for itself.
  { file: 'phpunit.xml', command: 'php vendor/bin/phpunit' },
  { file: 'phpunit.xml.dist', command: 'php vendor/bin/phpunit' },
]

/**
 * The check a project declares in `.quality-harness.json`, if it declares one.
 *
 * Anything that is not a non-empty string is IGNORED rather than honoured, and
 * ignoring it must leave the rungs below intact: a config file that turned the
 * feature off by being malformed would be the worst of both — no answer, and no
 * sign that anything was expected.
 */
function declaredCheckCommand(directory) {
  let config
  try {
    config = JSON.parse(readFileSync(path.join(directory, '.quality-harness.json'), 'utf8'))
  } catch { return null }
  const check = config?.check
  return typeof check === 'string' && check.trim() ? check.trim() : null
}

/** A `test` script a composer.json declares, which is the project's own answer. */
function composerScriptCommand(directory) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(path.join(directory, 'composer.json'), 'utf8'))
  } catch { return null }
  const script = manifest?.scripts?.test
  const named = Array.isArray(script) ? script.length > 0 : typeof script === 'string' && script.trim()
  return named ? 'composer test' : null
}

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
  // A BUILD IS NOT A CHECK. `build` was the last resort here, so any repository
  // with a package.json and no test/check/lint/typecheck script was told its
  // evidence command was a build — which compiles and says nothing about
  // behaviour. Naming nothing is the honest answer (ADR-005): a reader can act
  // on "I could not determine this project's check", and cannot act on a build
  // that passes while the code is broken.
  for (const name of ['test', 'check', 'lint', 'typecheck']) {
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
  return checkCommandOrigin(cwd).command
}

/**
 * The check for `cwd` AND where it came from: `declared` when the project said
 * so in `.quality-harness.json`, `inferred` when this tool read it off a
 * manifest, `none` when neither.
 *
 * One resolver, two callers. `runTheCheckSentence` needs the provenance to say
 * whether a red on a clean tree is a finding about the environment, and
 * resolving the root a second time at that call site is how one rule becomes two
 * spellings that drift — which cost this project a defect the same day
 * (docs/BACKLOG.md §66).
 */
export function checkCommandOrigin(cwd = process.cwd()) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  if (!directory) return { command: null, origin: 'none' }
  const root = gitRepositoryRoot(directory) ?? directory
  // WHAT THE PROJECT SAYS, before any guess. Every rung below infers a command
  // from a manifest, and an inferred command can fail to DISCRIMINATE: measured
  // 2026-08-29 in a real Laravel repository, the derived `php vendor/bin/phpunit`
  // is red on a clean tree because of a host-only failure, so a session gets the
  // same exit code whether or not it broke anything — zero bits, which is worse
  // than the wrong-command defect it replaced (docs/BACKLOG.md §59). That
  // repository's own declared check discriminated cleanly against two injected
  // mutations. `.quality-harness.json` already carries this project's config, so
  // a declared check needs no new file and no parsing of prose.
  //
  // A declaration can of course be WRONG. That is the point: the mistake is then
  // the project's own, visible in a file someone can fix, rather than this tool
  // guessing and being wrong on the project's behalf.
  const declared = declaredCheckCommand(root)
  if (declared) return { command: declared, origin: 'declared' }
  // A script the repository NAMES FOR ITSELF beats a manifest guess, the same
  // reason `scripts/verify.sh` sits above `go test ./...`: `php vendor/bin/phpunit`
  // is a guess at how this project runs its tests, and in the repository that
  // reported §56 it is the wrong one — phpunit there runs only inside Docker, so
  // the bare host command would not execute at all. `composer test` is whatever
  // that project decided it is.
  // The project naming its own test script is the project SPEAKING, like the
  // declared `check` above and unlike a manifest guess.
  const composed = composerScriptCommand(root)
  if (composed) return { command: composed, origin: 'declared' }
  for (const candidate of PROJECT_CHECKS) {
    if (existsSync(path.join(root, candidate.file))) {
      return { command: candidate.command, origin: 'inferred' }
    }
  }
  const packaged = packageManagerCommand(root)
  if (packaged) return { command: packaged, origin: 'inferred' }
  const made = makeTargetCommand(root)
  if (made) return { command: made, origin: 'inferred' }
  return { command: null, origin: 'none' }
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
  const { command, origin } = checkCommandOrigin(cwd ?? process.cwd())
  if (!command) {
    return 'Run the smallest repository-owned test, lint, build, or validation command after the '
      + 'final edit and report the exact command and result.'
  }
  // A DECLARED command is the project speaking; an INFERRED one is this tool
  // guessing from a manifest, and a guess carries no confidence about the
  // environment it needs. Measured 2026-08-29: an inferred `php vendor/bin/phpunit`
  // was red on a clean tree because of a host-only failure, so a session got the
  // same exit code whether or not it had broken anything — and a red it did not
  // cause teaches distrust of the gate, which is what let an earlier wrong
  // command survive so long (docs/BACKLOG.md §59).
  const caveat = origin === 'declared'
    ? ''
    // The word "environment" is deliberately NOT used here. It is reserved for a
    // run that actually failed that way, and a standing note carrying it in every
    // message would make the word stop meaning anything — which
    // tests/lifecycle.test.mjs::a check that could not run is not a finding about
    // the change asserts, and caught when the first version of this said it.
    : ' That command was inferred from this repository rather than declared by it, so if it is '
      + 'red on an unmodified tree the finding is about this machine and not about your change — '
      + 'say which, and declare the real command as `check` in `.quality-harness.json`.'
  return `Run \`${command}\` (this project's own check) after the final edit and report the exact `
    + `command and result.${caveat}`
}

// What the last attempt was, when it was not a pass. An environment that could
// not run the check is not a finding about the change, and saying so is the
// difference between guidance and an accusation.
function environmentExcuse(state) {
  if (state.lastVerdict === 'unstarted') {
    return `\`${state.lastVerdictCommand}\` never started — the command or something it needs is `
      + 'missing here. That is this environment, not your change; nothing is wrong with the work '
      + 'that this can see.'
  }
  if (state.lastVerdict === 'timeout') {
    return `\`${state.lastVerdictCommand}\` was killed on its time budget rather than reporting. `
      + 'That is not a verdict about your change either — raise the budget or narrow the run.'
  }
  return null
}

function missingEvidenceReason(state, cwd, paths = state.mutationPaths) {
  // Distinct paths, because the list is five slots wide and repeats spend them
  // saying the same thing. A live session filled all five with one identical
  // marker and the sentence that exists to say WHAT CHANGED said nothing.
  const distinct = [...new Set(paths)]
  const changed = distinct.length
    ? `Changed paths include: ${distinct.slice(-5).join(', ')}.`
    : 'The transcript contains file mutations.'
  const excuse = environmentExcuse(state)
  if (excuse) return `${changed} ${excuse}`
  return `${changed} ${runTheCheckSentence(cwd)} Do not add cleanup or new scope.`
}

// ADR-035. One line per completion event, machine-local, append-only.
//
// WHY IT IS NOT IN THE REPOSITORY: this harness writes into a user's tree only
// through `adr-verify`, into a file they pointed it at. A telemetry file
// appearing in every repository the plugin touches is a surprise, and one that
// could reach a push (CLAUDE.md §6). `CLAUDE_PLUGIN_DATA` is where the mutant
// journal already lives.
//
// WHY THE ABSENCE IS ANNOUNCED: a ledger that skips in silence reads exactly
// like a ledger recording zero false successes. That is the false-clean this
// corpus refuses everywhere else, so a session with nowhere to write says so
// once, on stderr, where it cannot be mistaken for a finding about the work.
//
// It never throws. Recording is not judging: a hook that failed to write its
// telemetry has still observed everything it observed, and turning that into a
// hook failure would make the ledger able to break the gate.
function recordClaim(input, claim, evidence, mutations) {
  const home = process.env.CLAUDE_PLUGIN_DATA
  if (!home) {
    process.stderr.write('[quality-harness] CLAUDE_PLUGIN_DATA is not set, so this completion '
      + 'event was NOT recorded. No false-success rate can count it. This is a note about the '
      + 'environment, not a finding about your work.\n')
    return
  }
  try {
    mkdirSync(home, { recursive: true })
    appendFileSync(path.join(home, 'claims.jsonl'), `${JSON.stringify({
      at: new Date().toISOString(),
      event: input.hook_event_name,
      cwd: typeof input.cwd === 'string' ? input.cwd : null,
      session: typeof input.session_id === 'string' ? input.session_id : null,
      claim: claim.kind,
      phrase: claim.phrase,
      evidence,
      mutations,
    })}\n`, 'utf8')
  } catch (failure) {
    process.stderr.write(`[quality-harness] could not append to the claims ledger (${failure.code
      ?? failure.message}); this completion event is not counted.\n`)
  }
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

/** The capability the caller declared for this role, or null when it declared none. */
function declaredCapability(input) {
  const model = typeof input.agent_model === 'string' ? input.agent_model.trim() : ''
  const effort = typeof input.agent_effort === 'string' ? input.agent_effort.trim() : ''
  if (!model && !effort) return null
  const asked = [model && `model ${model}`, effort && `effort ${effort}`].filter(Boolean).join(', ')
  return `Your delegation asked for ${asked}; if that does not match the work you are `
    + 'given, say so in what you return rather than silently doing more or less.'
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
    // ADR-029 T2. What the CALLER asked for, when it asked for anything. Said as
    // "asked for" rather than "you are running", because this hook receives a
    // declaration and cannot observe which model actually answered — the same
    // distinction between what a check saw and what it concluded that CLAUDE.md §3
    // makes about gates. Omitted entirely when nothing was declared: absence is
    // absence, and inventing a default would put a capability in the agent's
    // context that nobody requested.
    declaredCapability(input),
  ].filter(Boolean).join(' ')
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
// nothing and reported no error. Name the interpreter there instead.
//
// Naming it is not the same as finding it. `python3` on a stock Windows 11 is an
// App Execution Alias under WindowsApps: a real, spawnable exe that is not Python.
// It prints "Python was not found; run without arguments to install from the
// Microsoft Store" to STDOUT — nothing on stderr — and exits 9009. So it sets no
// `error`, and an `error`-keyed fallback never fires; every gate came back 9009,
// which is neither 0 nor 3, and readyTaskLines swallowed it into the exact empty
// orientation the paragraph above says was fixed. Measured 2026-08-30 on Windows
// 11 build 26200.9168, where `py -3` ran the same gate and exited 3.
//
// Do not key the fallback on 9009 either. That is cmd.exe's own "command not
// found" code, borrowed by the alias, so it cannot separate "the interpreter never
// ran" from "the gate ran and returned 9009". The only honest question is whether
// the candidate answered AS PYTHON, which is why this probes for a known answer
// rather than detecting by name. resolve_bash() reaches for the same idea and
// only half-arrives: it skips the System32 WSL stub but NOT the WindowsApps
// launcher its own docstring names, so on a stock PATH it returns a 0-byte Store
// alias (BACKLOG §91). Probe; do not trust a name or an isfile().
// BACKLOG §93. The probe asked for the MAJOR version and threw the rest away, so
// a box with 3.14 and 3.10 both on PATH — four years and one semantic change
// apart — answered `3` either way and nothing recorded which one ran. §90 is the
// case where that mattered: the same guard returned different answers on each.
// Costs one format string; the acceptance check below still turns on the major.
const PYTHON_PROBE = 'import sys;print("%d.%d" % sys.version_info[:2])'

// Preference order. `py -3` is the launcher Windows actually ships for this and
// is the one standalone-link.mjs's cmd forwarder already reaches for; a bare
// `python` is next; `python3` is last because on Windows it is most often the
// alias. Every one of them is probed regardless — presence is never the evidence.
const WINDOWS_PYTHONS = [['py', '-3'], ['python'], ['python3']]

/**
 * The argv prefix that runs a real Python 3 on this machine, or null if nothing
 * on PATH answered as one. Windows only; POSIX execs the shebang itself.
 *
 * `candidates` and `run` are injected so the alias case is reachable from macOS
 * and Linux — a Windows-only branch with no seam is a branch with no test, and
 * that is precisely how the alias shipped past a suite that exercises the win32
 * branch on boxes where `python3` happens to be genuine.
 */
export function resolvePython(platform = process.platform, candidates = WINDOWS_PYTHONS, run = spawnSync) {
  // CLEARED FIRST. Without this a failed resolve left the PREVIOUS run's version
  // readable, so a caller recording "which Python answered" would record one that
  // did not — stale evidence, which is worse than none and is the exact class §93
  // is about.
  lastPythonVersion = null
  if (platform !== 'win32') return null
  for (const [command, ...prefix] of candidates) {
    const probe = run(command, [...prefix, '-c', PYTHON_PROBE], { encoding: 'utf8', timeout: 10_000 })
    const answered = (probe.stdout ?? '').trim()
    // Still keyed on the MAJOR — any 3.x is a real Python 3 — but the full answer
    // is kept so a run can say which one it was.
    if (probe.status === 0 && /^3(\.\d+)?$/.test(answered)) {
      lastPythonVersion = answered
      return [command, ...prefix]
    }
  }
  return null
}

// What the last successful probe answered, e.g. `3.14`, or null if nothing has
// been probed or nothing answered. Read by whatever wants to RECORD which
// interpreter ran, which is the half §93 is actually about: the gates ship as
// `#!/usr/bin/env python3`, so the environment picks, and until now nothing
// pinned, probed or recorded the choice.
let lastPythonVersion = null
export const probedPythonVersion = () => lastPythonVersion

// Resolved once per process: readyTaskLines calls spawnGate per task directory,
// and re-probing three interpreters for each would cost more than the gates.
// `??=` would not do it — a machine with no Python resolves to null and would be
// re-probed on every call, three failed spawns each, exactly when probing is most
// expensive. The sentinel makes "asked, and the answer was none" a cached answer.
const UNPROBED = Symbol('python interpreter not yet resolved')
let cachedPython = UNPROBED

export function spawnGate(tool, args, options = {}, platform = process.platform, python) {
  if (platform !== 'win32') return spawnSync(tool, args, options)
  if (python === undefined && cachedPython === UNPROBED) cachedPython = resolvePython(platform)
  const interpreter = python !== undefined ? python : cachedPython
  if (!interpreter) {
    // No verdict here. A gate that could not start has not found anything, and
    // saying so is the whole of rule 3 — the shape matches spawnSync's own
    // "could not spawn" result so callers need no new branch to tell them apart.
    return {
      error: new Error('quality-harness: no Python 3 on PATH answered a version probe, so this gate did NOT run'),
      status: null, stdout: '', signal: null,
      stderr: 'quality-harness: no Python 3 found on PATH — an absent checker certifies nothing.\n',
    }
  }
  const [command, ...prefix] = interpreter
  return spawnSync(command, [...prefix, tool, ...args], options)
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
// --- Decisions that reach the code -----------------------------------------
//
// Everything above answers "is this work proved?". This answers a question the
// harness had never asked: "what has already been decided about the file you are
// about to change?" — which is the difference between a tool that reports on you
// and a tool that hands you something.
//
// The idea and its vocabulary are lifted from adrkit (mbeacom/adrkit, Apache-2.0),
// which added an `affects:` field so tooling can resolve which decisions govern a
// change, and deliberately surfaces the graveyard of superseded and withdrawn
// records so an agent stops re-proposing an approach somebody already killed.
// Two things are ours: resolution needs no new header, because every task file in
// this corpus already carries a machine-readable `## Affected Files` table that
// adr-lint requires; and nothing here is a finding, so nothing here can fail.
//
// Resolution is a pure function of (corpus, paths) — same corpus, same paths,
// same answer — and runs entirely in this process. A subprocess per record at
// the edit boundary would rebuild the artifact-gate budget problem somewhere
// much hotter.

// A record's filename, and NOT an ISO-dated one: `2026-03-08-retrospective.md`
// begins with four digits and a dash like every `0043-thing.md` does, so a
// postmortem or a journal entry was read as ADR-2026. Measured on a real corpus,
// 2026-08-26.
const ADR_FILE = /^(?!\d{4}-\d{2}-\d{2})(?:adr[-_]?)?\d{3,4}[-._]/i
const RECORD_BUDGET = 200

// A `## Heading` section's body. Written as a scan rather than one regex because
// JavaScript has no `\Z`: `(?=^##\s|\Z)` requires a literal Z, so the lookahead
// never matched and every section read came back empty — silently, which is the
// only way a corpus-reading feature can ship looking like an empty corpus.
function markdownSection(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex(line => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(line))
  if (start < 0) return ''
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s+\S/.test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

// `**Status:** Accepted`, `Status: Accepted`, or a `## Status` section's first line.
function recordStatus(text) {
  const inline = text.match(/^[ \t]*\*{0,2}Status:?\*{0,2}[ \t]*:?[ \t]*(.+)$/im)
  if (inline) return inline[1].replace(/[*_`]/g, '').trim()
  const section = markdownSection(text, 'Status')
  return section.split('\n').map(line => line.trim()).find(Boolean) ?? ''
}

// Accepted governs — including in the archive, where "an archived Accepted ADR
// may still govern" is this corpus's own stated rule. Proposed and Draft govern
// nothing yet, and are neither.
function statusKind(status) {
  if (/^accepted\b/i.test(status)) return 'governing'
  if (/^(?:superseded|withdrawn|rejected|deprecated)\b/i.test(status)) return 'graveyard'
  return null
}

// One glob component at a time, so `**` can cross separators and `*` cannot.
function globToRegExp(pattern) {
  const normalised = pattern.replace(/\\/g, '/').replace(/^\.\//, '')
  let source = '^'
  for (let index = 0; index < normalised.length; index += 1) {
    const character = normalised[index]
    if (character === '*') {
      if (normalised[index + 1] === '*') {
        source += '.*'
        index += normalised[index + 2] === '/' ? 2 : 1
      } else {
        source += '[^/]*'
      }
    } else if (character === '?') source += '[^/]'
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  try {
    return new RegExp(`${source}$`, 'i')
  } catch {
    return null
  }
}

// A declared path matches the file itself, anything under it when it names a
// directory, and whatever its globs cover.
export const __pathMatchesDeclarationForTest = (candidate, declaration) =>
  pathMatchesDeclaration(candidate, declaration)

export function pathMatchesDeclaration(candidate, declaration) {
  const file = candidate.replace(/\\/g, '/').replace(/^\.\//, '')
  const declared = declaration.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
  if (!declared) return false
  if (/[*?]/.test(declared)) return globToRegExp(declared)?.test(file) ?? false
  return file === declared || file.startsWith(`${declared}/`)
}

// `**Governs:**` is optional and additive: a corpus that never adopts it still
// resolves through its task tables. Both the plain list and adrkit's typed
// matcher form are read; only `type: path` is RESOLVED, and the others are
// recorded rather than silently matching nothing — a matcher that matches
// nothing reads as coverage while covering nothing, which is the vacuous pass
// this project's own arch-write skill warns about.
/** The checks a record says enforce it, or [] for absent or `None — <reason>`. */
export const __declaredEnforcementForTest = text => declaredEnforcement(text)

function declaredEnforcement(text) {
  const header = text.match(/^[ \t]*\*{0,2}Enforced-by:?\*{0,2}[ \t]*:?[ \t]*(.*)$/im)
  if (!header) return []
  const inline = header[1].trim()
  if (!inline || /^none\b/i.test(inline)) return []
  // A BACKTICKED span is one item, commas inside it included — a mutation label
  // reads "…mutates, exactly once" and splitting on every comma tears it in
  // half. Whatever is left outside the backticks is then comma-separated. Both
  // cases are in the truth table mirrored from tests/gate-regressions.py.
  const parts = []
  const rest = []
  let position = 0
  for (const span of inline.matchAll(/`([^`]*)`/g)) {
    rest.push(inline.slice(position, span.index))
    parts.push(span[1].trim())
    position = span.index + span[0].length
  }
  rest.push(inline.slice(position))
  parts.push(...rest.join(',').split(',').map(part => part.trim()))
  return parts.filter(value => value && !/^[<(]/.test(value))
}

function declaredGoverns(text) {
  const paths = []
  const unresolved = []
  const header = text.match(/^[ \t]*\*{0,2}Governs:?\*{0,2}[ \t]*:?[ \t]*(.*)$/im)
  if (header) {
    const inline = header[1]
    if (!/^none\b/i.test(inline.trim())) {
      for (const token of inline.matchAll(/`([^`]+)`|([^\s,]+)/g)) {
        const value = (token[1] ?? token[2]).trim()
        if (value && !/^[<(]/.test(value)) paths.push(value)
      }
    }
    // The dashed/indented run under the header. The first split element is the
    // remainder of the header line itself, which `(.*)` already consumed.
    const following = text.slice(text.indexOf(header[0]) + header[0].length).split('\n').slice(1)
    const block = []
    for (const line of following) {
      if (!line.trim()) { if (block.length) break; else continue }
      if (!/^\s*-/.test(line) && !/^\s\s+\S/.test(line)) break
      block.push(line)
    }
    for (const matcher of block.join('\n').matchAll(/-\s*type:\s*(\w+)[\s\S]*?pattern:\s*["']?([^"'\n]+?)["']?\s*$/gm)) {
      if (matcher[1].toLowerCase() === 'path') paths.push(matcher[2].trim())
      else unresolved.push(`${matcher[1]}:${matcher[2].trim()}`)
    }
  }
  return { paths, unresolved }
}

// Cell 0 of every `## Affected Files` row. The table is required by adr-lint, so
// this resolves on records nobody has touched for this feature.
function affectedFiles(text) {
  const section = markdownSection(text, 'Affected Files')
  if (!section) return []
  const paths = []
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const first = line.split('|')[1]?.trim() ?? ''
    const cell = first.match(/`([^`]+)`/)?.[1] ?? first
    if (!cell || /^-+$/.test(cell) || /^file$/i.test(cell) || /^</.test(cell)) continue
    // A path, not prose. On a real corpus, cell 0 of neighbouring tables produced
    // `(T3's two tests)`, `(compile)` and `! rg -iq 'MCP stdio' README.md`, every
    // one reported as a governed path. A cell with a space in it is a sentence.
    if (/\s/.test(cell) || !/[./\\]/.test(cell)) continue
    paths.push(cell)
  }
  return paths
}

// ADR-014, 014-thing.md, `# ADR-14: …` — the number, however this corpus spells it.
function adrNumber(file, text) {
  const fromTitle = text.match(/^#\s+ADR[-_ ]?(\d{1,4})\b/im)
  // Anchored, and the bare form only at the START of the basename: unanchored,
  // `(\d{3,4})[-._]` read the `2026` of a date as an ADR number and the corpus
  // grew an ADR-2026. Measured on a real corpus, 2026-08-26.
  const fromName = path.basename(file).match(/^(?!\d{4}-\d{2}-\d{2})(?:adr[-_]?)?(\d{1,4})[-._]/i)
  const raw = fromTitle?.[1] ?? fromName?.[1]
  return raw === undefined ? null : Number(raw)
}

// Where a record's tasks actually live. Two layouts, both real: `tasks/` beside
// the record, and a sibling directory NAMED FOR THE RECORD holding it —
// `docs/adr/ADR-110-slug.md` with `docs/adr/ADR-110/tasks/`. Measured against a
// 171-record corpus on 2026-08-26, where the second is the only layout used and
// looking beside the record found nothing: 142 accepted decisions reported as
// governing no code, which is a confident wrong answer rather than a gap.
//
// `owned` says the directory is named for this record, which is attribution in
// itself — no back-reference needed, and that corpus has none: its task files
// never name their ADR in the text.
function taskDirectoriesFor(file, number) {
  const directory = path.dirname(file)
  const found = [{ path: path.join(directory, 'tasks'), owned: false }]
  // A record with no number still owns the directory named after it. Ownership
  // was matched on the ADR NUMBER alone, so `2026-08-17-thing.md` beside
  // `2026-08-17-thing/tasks/` was classified correctly and reported zero tasks —
  // the record found, its work invisible (docs/BACKLOG.md §55). The stem is
  // exact, so it cannot bind a directory to the wrong record the way a loose
  // numeric prefix could.
  const stem = path.basename(file).replace(/\.md$/i, '')
  let siblings = []
  try { siblings = readdirSync(directory, { withFileTypes: true }) } catch { return found }
  for (const entry of siblings) {
    if (!entry.isDirectory()) continue
    const owns = number !== null && /^(?:adr[-_]?)?0*(\d{1,4})\b/i.exec(entry.name)
    if ((owns && Number(owns[1]) === number) || entry.name === stem) {
      found.push({ path: path.join(directory, entry.name, 'tasks'), owned: true })
    }
  }
  return found
}

/**
 * The task files a record owns, by directory ownership and by self-naming.
 *
 * Extracted so a record this reader cannot CLASSIFY still has its tasks
 * attributed: `adrCorpus` needs the texts as well and inlines the same walk for
 * the governed-path union, and both call `taskDirectoriesFor` with the same
 * number. Kept beside it rather than duplicated at the caller — a second
 * attribution rule is a second thing to keep in step (ADR-001, ADR-004).
 */
function taskFilesFor(file, text) {
  const found = []
  for (const tasks of taskDirectoriesFor(file, adrNumber(file, text))) {
    let entries = []
    try {
      entries = readdirSync(tasks.path).filter(name => name.toLowerCase().endsWith('.md')
        && name.toLowerCase() !== 'readme.md')
    } catch { continue }
    for (const name of entries) found.push(path.join(tasks.path, name))
  }
  return [...new Set(found)]
}

/**
 * A record this reader would otherwise never open, recognised by CONTENT.
 *
 * `ADR_FILE` matches a numeric filename and deliberately excludes an ISO-dated
 * one, because `2026-03-08-retrospective.md` was being read as ADR-2026. That
 * exclusion took an entire naming convention with it: a corpus whose records are
 * all named `2026-08-17-thing.md` produced ZERO records, and the reader then said
 * "Nothing in the corpus is waiting" over two dozen unfinished task files.
 * Measured 2026-08-29 on a 56-record corpus by the session that owns it, and
 * reproduced here on identical bytes under two filenames (docs/BACKLOG.md §55).
 *
 * So the fix is a probe, not a wider pattern. Inside an `adr` directory a file
 * carrying a `Status:` line is a record whatever it is called; everything else
 * still needs the filename. Measured against that corpus before shipping: of 56
 * `.md` files under its `docs/adr`, the 31 with no status line are all
 * non-records (task files, tasks/README.md, an index, a research note), and no
 * postmortem, runbook or spec in the tree carries the line at all.
 *
 * A task file is excluded by PATH rather than by content, because a
 * `tasks/README.md` may well acquire a status line and is never a decision.
 *
 * A STATUS LINE ALONE IS NOT ENOUGH, and this repository's own fixtures prove
 * why: `2026-03-08-retrospective.md` carrying `**Status:** Accepted` is the
 * defect the filename guard was added for, and a probe reading only the status
 * would re-open it. A decision record also SAYS something — it carries the
 * Context or Decision section every template in this project requires — so the
 * probe asks for both. The corpus that reported §55 confirms the discrimination
 * holds there: its 31 status-less files are all non-records, and the three
 * record-SHAPED filenames that are not records (an index, a research note, a
 * `.queries.md` companion) self-excluded only by luck, which is exactly the
 * fragility a second condition removes.
 */
function looksLikeRecord(file, directory) {
  if (!/(^|[\\/])adr([\\/]|$)/i.test(directory)) return false
  if (/(^|[\\/])tasks([\\/]|$)/i.test(directory)) return false
  let text
  try { text = readFileSync(file, 'utf8') } catch { return false }
  return /^[ \t]*\*{0,2}Status:?\*{0,2}[ \t]*:?[ \t]*\S/im.test(text)
    && /^##\s+(Context|Decision)\b/im.test(text)
}

function readRecordFiles(root) {
  const files = []
  const walk = (directory, depth) => {
    if (depth > 4 || files.length >= RECORD_BUDGET) return
    let entries
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const child = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (UNINTERESTING_DIRECTORY.test(entry.name)) continue
        walk(child, depth + 1)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')
          && (ADR_FILE.test(entry.name) || looksLikeRecord(child, directory))) {
        files.push(child)
      }
    }
  }
  const docs = path.join(root, 'docs')
  if (existsSync(docs)) walk(docs, 0)
  if (!files.length) walk(root, 0)
  return files
}

/**
/**
 * Repository-relative paths git knows about, or null when git cannot answer.
 *
 * null and an EMPTY ARRAY are different answers and must never collapse. An
 * empty listing says "this tree holds no files"; null says "I could not look",
 * and a declaration checked against a null read as empty would report every
 * record in the corpus as rot at once — a tool asserting an observation it
 * never made (ADR-005).
 *
 * `--others --exclude-standard` because a record and the files it governs are
 * commonly added in the same commit, and against git rather than the filesystem
 * because `existsSync` answers "is this on THIS machine" (ADR-008).
 */
export function trackedPaths(root) {
  const found = new Set()
  for (const args of [['ls-files'], ['ls-files', '--others', '--exclude-standard']]) {
    const run = spawnSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args],
      { encoding: 'utf8', timeout: 30000 })
    if (run.error || run.status !== 0 || typeof run.stdout !== 'string') return null
    for (const line of run.stdout.split('\n')) {
      const value = line.trim()
      if (value) found.add(value)
    }
  }
  return [...found]
}

/**
 * Every decision record in a repository, with what it governs already resolved.
 *
 * Reads the corpus and asks git ONE read-only question — which paths it tracks —
 * so a `Governs:` declaration matching nothing can be reported rather than
 * silently governing nothing. `tracked` is an injectable seam: pass a listing to
 * make the resolution hermetic, or null to read a corpus without resolving
 * declarations at all. Nothing here writes, and nothing here runs a check.
 */
export function adrCorpus(root, { tracked = trackedPaths(root) } = {}) {
  const records = []
  // Attached to the returned array rather than changing its shape: every caller
  // treats this as a list of records, and widening the return type to report a
  // second thing would break all of them to fix a message.
  const unreadable = []
  const files = readRecordFiles(root)
  const recordsPerDirectory = new Map()
  for (const file of files) {
    const directory = path.dirname(file)
    recordsPerDirectory.set(directory, (recordsPerDirectory.get(directory) ?? 0) + 1)
  }
  for (const file of files) {
    let text
    try {
      if (statSync(file).size > 512 * 1024) continue
      text = readFileSync(file, 'utf8')
    } catch { continue }
    const status = recordStatus(text)
    const kind = statusKind(status)
    if (!kind) {
      // A file that looks like a record and carries no status this reader knows
      // is DROPPED, and until 2026-08-27 dropped in silence. Measured against a
      // real 171-record corpus that day: 149 were read and `adr-state` said
      // "149 record(s) read" — never that 22 files it had opened were skipped,
      // 25 of them carrying no `**Status:**` line at all and 12 carrying one it
      // does not recognise, `Implemented` among them. A count that omits what it
      // could not read is a count that reads as coverage.
      // Its TASK FILES are attributed anyway, by the same rule the governing
      // records use. A Proposed or Draft record governs nothing yet — correctly —
      // but its tasks still exist, and a consumer that cannot see whose they are
      // has only two options, both wrong: treat them as executable (§48, where
      // the router offered an unaccepted record's tasks) or ignore them and
      // report a corpus with unfinished work as finished.
      unreadable.push({ file, status: status || null, taskFiles: taskFilesFor(file, text) })
      continue
    }
    const declared = declaredGoverns(text)
    // Two different claims, deliberately kept apart. `declares` is a record
    // saying "I am authoritative over this"; `touches` is a task table saying
    // "this change edited that file". Conflating them made every file five
    // accepted ADRs had edited over two years look like five decisions
    // contradicting each other — 278 of them on a real corpus, every one noise.
    // Authority contests; history does not.
    const declares = new Set(declared.paths)
    const governs = new Set(declared.paths)
    // Sibling task files carry the per-task Affected Files tables. Attribution
    // matters: several ADRs commonly share one `tasks/` directory, and taking
    // every table would make each record claim its neighbours' files. A task
    // names its ADR in its title (`# Task ADR-001-T1: …`); where no task does,
    // the directory is attributed only if this is the one record beside it.
    const number = adrNumber(file, text)
    // The task files attributed to this record, PATHS included. The paths are
    // what lets a caller ask "whose task is this?" — `work-next` needs it to stop
    // calling an unaccepted record's tasks ready (docs/BACKLOG.md §48), and
    // deriving it a second time at the caller would be a second attribution rule
    // to keep in step with this one.
    const owned = []
    const texts = []
    for (const tasks of taskDirectoriesFor(file, number)) {
      let taskEntries = []
      try {
        taskEntries = readdirSync(tasks.path).filter(name => name.toLowerCase().endsWith('.md')
          && name.toLowerCase() !== 'readme.md')
      } catch { continue }
      for (const name of taskEntries) {
        const taskPath = path.join(tasks.path, name)
        let taskText
        try { taskText = readFileSync(taskPath, 'utf8') } catch { continue }
        // A directory NAMED for this record is attribution in itself.
        if (tasks.owned) {
          owned.push(taskPath)
          for (const declaredPath of affectedFiles(taskText)) governs.add(declaredPath)
        } else {
          texts.push({ path: taskPath, text: taskText })
        }
      }
    }
    const claimed = number
      ? texts.filter(entry => new RegExp(`ADR[-_ ]?0*${number}\\b`, 'i').test(entry.text))
      : []
    // Only when this is the one record beside them: a shared tasks/ directory
    // whose files name no ADR cannot be attributed, and guessing would make
    // every record claim its neighbours' files.
    const sole = recordsPerDirectory.get(path.dirname(file)) === 1
    for (const entry of (claimed.length ? claimed : (sole ? texts : []))) {
      owned.push(entry.path)
      for (const declaredPath of affectedFiles(entry.text)) governs.add(declaredPath)
    }
    records.push({
      file,
      number,
      title: (text.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(file, '.md')).trim(),
      status,
      kind,
      // Which record replaced this one, when the status says so. The number
      // alone, because a corpus spells the reference every way there is:
      // `Superseded by ADR-0004`, `superseded by ADR-4`, `Superseded by 0004`.
      supersededBy: /^superseded\s+by\b/i.test(status)
        ? (/(\d{1,4})/.exec(status)?.[1] ?? null) && String(Number(/(\d{1,4})/.exec(status)[1]))
        : null,
      governs: [...governs],
      // What FAILS when this decision is violated, or null. `Governs:` on its
      // own tells an agent a rule exists and nothing about what happens if it
      // breaks it — ADR-009. Read here rather than at each caller so the hook
      // and the CLI cannot disagree about what a header means, which is the
      // drift ADR-001 and ADR-004 were both about.
      enforcedBy: declaredEnforcement(text),
      // The task files this record owns, by the same attribution the governed
      // paths use. A consumer that walks the filesystem for task files instead
      // gets the files right and the RECORD wrong — §48, where the router named
      // a Proposed record's tasks as ready to execute.
      taskFiles: [...new Set(owned)],
      declares: [...declares],
      // Two sources, one slot, told apart by the prefix. A `type: package`
      // matcher was never resolvable here; a `governs:` entry WAS resolvable and
      // resolved to nothing, which is the rot ADR-011 is about. With no listing
      // this stays empty — the reader could not look, and saying nothing is the
      // only honest answer (ADR-005).
      unresolved: [
        ...declared.unresolved,
        ...(tracked
          ? declared.paths
            .filter(declaration => !tracked.some(file => pathMatchesDeclaration(file, declaration)))
            .map(declaration => `governs:${declaration}`)
          : []),
      ],
    })
  }
  // Non-enumerable so nothing that JSON-serialises a corpus starts emitting it,
  // and every existing consumer keeps seeing a plain array of records.
  Object.defineProperty(records, 'unreadable', { value: unreadable, enumerable: false })
  return records
}

// `/tmp` is a symlink to `/private/tmp` on macOS, and git answers with the real
// path while the hook payload carries the spelling. A plain path.relative then
// produced `../../tmp/...`, which escapes the root and filtered every path out —
// so on a symlinked checkout the corpus read as empty, silently. The same trap
// underTempRoot already realpaths both sides for.
function relativeWithinRoot(root, candidate) {
  const direct = path.relative(root, candidate)
  if (!direct.startsWith('..')) return direct
  const real = target => {
    try { return realpathSync(target) } catch {}
    const anchor = nearestExistingDirectory(target)
    try { return anchor ? path.join(realpathSync(anchor), path.relative(anchor, target)) : target }
    catch { return target }
  }
  return path.relative(real(root), real(candidate))
}

/**
 * The decisions that govern a set of paths, and the ones that were killed.
 *
 * The graveyard is the half an agent needs most: re-proposing an approach the
 * team already rejected is the expensive failure of working without memory, and
 * it is invisible from the code alone.
 */
export function decisionsGoverning(paths, root, corpus = adrCorpus(root)) {
  const relative = paths
    .map(candidate => (path.isAbsolute(candidate) ? relativeWithinRoot(root, candidate) : candidate))
    .map(candidate => candidate?.replace(/\\/g, '/'))
    .filter(candidate => candidate && !candidate.startsWith('..'))
  const hits = record => relative.some(candidate =>
    record.governs.some(declaration => pathMatchesDeclaration(candidate, declaration)))
  return {
    governing: corpus.filter(record => record.kind === 'governing' && hits(record)),
    graveyard: corpus.filter(record => record.kind === 'graveyard' && hits(record)),
  }
}

/** The same answer as prose, or '' when the corpus has nothing to say. */
export function decisionContext(paths, root) {
  const { governing, graveyard } = decisionsGoverning(paths, root)
  if (!governing.length && !graveyard.length) return ''
  const lines = []
  const name = record => `${path.relative(root, record.file) || record.file} — ${record.title}`
  // The hook and `adr-context` render the SAME answer from the same resolver.
  // Two callers of one resolver is where this project has drifted before
  // (ADR-001, ADR-004), so the enforcing check appears in both or neither.
  const caught = record => (record.enforcedBy?.length
    ? `  [caught by: ${record.enforcedBy.join(', ')}]`
    : '')
  if (governing.length) {
    lines.push('Decisions that govern what you are about to change:')
    for (const record of governing.slice(0, 5)) lines.push(`  ${name(record)}${caught(record)}`)
    if (governing.length > 5) lines.push(`  (+${governing.length - 5} more)`)
  }
  if (graveyard.length) {
    lines.push('Already decided against here — do not re-propose without saying why it is different now:')
    for (const record of graveyard.slice(0, 5)) {
      lines.push(`  ${name(record)} [${record.status}]`)
    }
    if (graveyard.length > 5) lines.push(`  (+${graveyard.length - 5} more)`)
  }
  const unresolved = [...new Set([...governing, ...graveyard].flatMap(record => record.unresolved))]
  if (unresolved.length) {
    lines.push(`Recorded but not resolved by this tool: ${unresolved.slice(0, 4).join(', ')}. `
      + 'Only `type: path` matchers are matched against files; read those records yourself.')
  }
  return lines.join('\n')
}

// Said once per path per session. New context at every Edit would repeat the
// same decisions all session for a hot file, which is how a delivery becomes a
// nag — the failure this whole release is about. Session-scoped because a marker
// that outlived the session would silence the FIRST edit of the next one.
function firstMentionThisSession(sessionId, key) {
  if (typeof sessionId !== 'string' || !sessionId) return true
  const stamp = createHash('sha256').update(`${sessionId}\u0000${key}`).digest('hex').slice(0, 32)
  const marker = path.join(os.tmpdir(), `quality-harness-said-${stamp}`)
  if (existsSync(marker)) return false
  try { writeFileSync(marker, '') } catch { return true }
  return true
}

// A second, older copy of this toolkit answering instead of the plugin.
//
// A `.claude/bin/` and `.claude/hooks/` under the user's home hold a standalone
// install that some machines keep as a compatibility entrypoint. It is NOT updated with the
// plugin, and when it drifts it drifts silently: measured 2026-08-26, a
// standalone adr-lint dated 2026-07-30 predated the `acceptance-sha256:`
// digest that adr-verify now writes, so its Verification Log grammar rejected
// the exact lines adr-verify had just produced — and then cascaded into "marked
// done but no exit-0 entry". Direct invocation passed the whole time, which made
// the HOOK look like the unreliable one. A session was spent finding that.
//
// Nothing here is enforced. The harness cannot uninstall a copy it does not own;
// it can say which one it is and what differs, which is the whole cost of the bug.
// `environment` rather than a bare PATH string: a default parameter cannot carry
// "there is no PATH", because passing `undefined` is what SELECTS the default.
// The unmeasurable case is the one §3 is about, so it has to be reachable from a
// test, and an env object is the seam that makes it so.
export function shadowInstallNotice(homeDirectory = os.homedir(), pluginRoot = PLUGIN_ROOT,
  environment = process.env, platform = process.platform) {
  const digest = file => {
    try { return createHash('sha256').update(readFileSync(file)).digest('hex') } catch { return null }
  }
  // A forwarder is CURRENT BY CONSTRUCTION: it carries no version and runs the
  // newest installed plugin, so comparing its bytes to the gate it stands in for
  // says the opposite of the truth. Installing forwarders on 2026-08-27 made this
  // notice report twenty files as drifted in the same session that fixed the
  // drift, and it would have said so every session after.
  //
  // A SYMLINK needs no special case, and giving it one was wrong: a link is only
  // as current as what it points at, so a link left on an older version really is
  // behind and worth saying. The digest comparison already answers that — it
  // reads through the link — and a mutation deleting the special case stayed
  // green precisely because it was doing nothing a live link needed.
  const current = target => {
    try { return readFileSync(target, 'utf8').includes(FORWARDER_MARK) } catch { return false }
  }
  const stale = []
  // The scope is SHADOW_SCOPE, shared with sync-standalone.mjs rather than
  // restated here. The two carried separate lists until 2026-09-01, when this
  // notice named a stale `facts-gate-dispatch.sh` under the home `.claude/hooks/`
  // — a wired gate
  // dispatcher running three of five gates — and the repair tool the notice
  // sends people to answered "Nothing to do", because `hooks` was in one list
  // and not the other.
  const wired = wiredInSettings(homeDirectory)
  for (const scope of SHADOW_SCOPE) {
    const shadow = path.join(homeDirectory, '.claude', scope.home)
    let entries = []
    try { entries = readdirSync(shadow) } catch { continue }
    for (const name of entries) {
      // A skill is a directory, so the comparable file is one level down.
      const ours = scope.leaf
        ? path.join(pluginRoot, scope.shipped, name, scope.leaf)
        : path.join(pluginRoot, scope.shipped, name)
      const theirPath = scope.leaf
        ? path.join(shadow, name, scope.leaf)
        : path.join(shadow, name)
      if (!existsSync(ours)) continue
      if (current(theirPath)) continue
      // A hook under the home directory can only answer if the user's own
      // settings name it: this plugin wires its hooks through
      // ${CLAUDE_PLUGIN_ROOT} and never looks there. Reporting one nothing
      // invokes is drift that cannot be acted on, and it was doing exactly that
      // here — two files, every session, both dead.
      if (scope.wired && !wired(name)) continue
      const theirs = digest(theirPath)
      if (theirs && theirs !== digest(ours)) {
        stale.push(path.join('~', '.claude', scope.home, ...(scope.leaf ? [name, scope.leaf] : [name])))
      }
    }
  }
  // A file a PAST installer left that this plugin no longer ships is a different
  // thing from a drifted copy, and the right action differs: a drifted copy is
  // refreshed, an orphan is not ours to touch. ADR-019 decided that naming it is
  // all that ever happens — identification is positive, and anything the three
  // routes cannot answer is counted rather than named, because on a machine
  // holding other tools' files a list of filenames is a list of accusations.
  const found = orphans(homeDirectory, pluginRoot)
  const retired = found.filter(row => row.state === 'ours-orphan')
  const unknown = found.filter(row => row.state === 'unidentified').length
  if (!stale.length && !retired.length) return ''
  const shown = stale.slice(0, 4).join(', ')
  const gates = stale.filter(entry => entry.includes(path.join('.claude', 'bin')))
  const hooks = stale.filter(entry => entry.includes(path.join('.claude', 'hooks')))
  // WHY the stale copy answers is measured, not asserted. Until 2026-09-01 this
  // sentence claimed unconditionally that the home directory is on PATH and the
  // plugin cache is not; reported from a Windows machine where both halves were
  // inverted — the home `.claude/bin` appeared nowhere on PATH and the cache's bin did,
  // so a bare gate name reached the PLUGIN. Read literally the old wording
  // invited deleting the home `.claude/bin`, which after `--link` is the forwarder set
  // that keeps bare names current — the opposite of the repair.
  //
  // `known: false` is rendered as unknown rather than as "not on PATH" (§3): an
  // absent PATH is a look that could not happen.
  const path_ = barePathWinner(homeDirectory, environment?.PATH, platform)
  // Assembled rather than written down: a literal home path may not appear in
  // anything this repository publishes (CLAUDE.md §6).
  const homeBin = path.join('~', '.claude', 'bin')
  const why = []
  if (gates.length) {
    if (!path_.known) {
      why.push('Which copy answers a gate invoked by BARE NAME depends on your PATH, which this '
        + 'session could not read, so compare the two yourself: `type adr-lint`.')
    } else if (path_.winner === 'standalone') {
      why.push('That copy WINS whenever a gate is invoked by bare name: `' + homeBin + '` sits ahead '
        + 'of the plugin cache on this PATH. So if a gate rejects something adr-verify just wrote, '
        + 'or a hook disagrees with the same tool run by hand, the old copy is answering.')
    } else if (path_.winner === 'plugin') {
      why.push('A bare gate name on this PATH reaches the PLUGIN, not that copy — the plugin cache '
        + 'sits ahead of `' + homeBin + '`. The stale copy still answers wherever it is named by its '
        + 'own path.')
    } else {
      why.push('Neither `' + homeBin + '` nor the plugin cache is on this PATH, so a bare gate name '
        + 'reaches no gate of ours at all; the stale copy answers only where it is named by path.')
    }
  }
  if (hooks.length) {
    why.push('The stale hook is wired in your own settings, so it runs alongside the plugin\'s — '
      + 'PATH does not come into it.')
  }
  // Templates were the drift that actually bit, and PATH has nothing to do with
  // it: an ADR authored from a stale adr-template.md is missing headers the
  // current gates require, so the gate reports a malformed record and the author
  // has no way to see they were writing to last month's shape. Reported
  // 2026-08-26 — a standalone template with no Governs:, no
  // **Data dependency:**, no ## Mutation Log and no ## Reachability table.
  if (stale.some(entry => entry.includes(path.join('.claude', 'templates')))) {
    why.push('A record authored from that template is missing headers the gates require, so the '
      + 'gate reports a malformed record and the author cannot see they were writing to last '
      + "month's shape.")
  }
  // Same failure one layer up: a stale SKILL.md instructs an invocation the
  // current gates no longer accept.
  if (stale.some(entry => entry.includes(path.join('.claude', 'skills')))) {
    why.push('A stale SKILL.md instructs an invocation the current gates no longer accept.')
  }
  const orphanSentence = retired.length
    ? `A past installer also left ${retired.length} file(s) here that this plugin NO LONGER SHIPS: `
      + retired.slice(0, 4).map(row =>
        `${path.join('~', '.claude', row.directory, row.name)} (${citeOrphan(row.evidence)})`)
        .join(', ')
      + `${retired.length > 4 ? `, +${retired.length - 4} more` : ''}. `
      + 'The plugin will not remove them — that is your decision, and nothing here writes to your '
      + `home directory.${unknown ? ` ${unknown} further file(s) in those directories could not be `
        + 'identified as ours either way; they are counted rather than named, because a file this '
        + 'plugin cannot prove it wrote may well be another tool\'s.' : ''}`
    : ''
  if (!stale.length) return orphanSentence
  return `Your plugin is up to date. What is behind is a SEPARATE copy of this toolkit under `
    + `your home directory, which the plugin never updates — ${shown}`
    + `${stale.length > 4 ? `, +${stale.length - 4} more` : ''}. `
    + (why.length ? `${why.join(' ')} ` : '')
    + 'To repair, run `node ' + path.join(pluginRoot, 'scripts', 'sync-standalone.mjs') + '`, which '
    + 'reports the same set this notice does and writes only with --apply; `--link` replaces the '
    + 'gates with forwarders no release can leave behind. A file that already carries the '
    + `\`${FORWARDER_MARK}\` line is current by construction and is not named above — do not `
    + `delete it.${orphanSentence ? ` ${orphanSentence}` : ''}`
}

// The plugin that is RUNNING is not always the newest one installed. Claude Code
// can keep serving a cached version across an update and a restart, and the
// session has no way to tell — every gate, skill and template it uses is then
// last week's, silently. Reported 2026-08-26: "even with updated plugin and
// restart claude uses older cache". Comparing version directories is the only
// check that catches it, because a stale copy is internally consistent.
export function staleVersionNotice(pluginRoot = PLUGIN_ROOT, homeDirectory = os.homedir()) {
  const running = /(\d+\.\d+\.\d+)$/.exec(pluginRoot)?.[1]
  if (!running) return ''
  const cache = path.join(homeDirectory, '.claude', 'plugins', 'cache',
    'quality-harness', 'quality-harness')
  let versions = []
  try { versions = readdirSync(cache) } catch { return '' }
  const order = name => {
    const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(name)
    return parts ? Number(parts[1]) * 1e6 + Number(parts[2]) * 1e3 + Number(parts[3]) : -1
  }
  const newest = versions.filter(name => existsSync(path.join(cache, name, 'scripts', 'lifecycle.mjs')))
    .sort((a, b) => order(b) - order(a))[0]
  if (!newest || order(newest) <= order(running)) return ''
  return `Heads up: this session is running quality-harness ${running}, but ${newest} is installed. `
    + 'Every gate, skill and template it uses is the older one, and a stale copy is internally '
    + 'consistent so nothing else will say so. Restart Claude Code to pick up the newer one.'
}

// Whether this repository has anything the gates would read. Cheap on purpose:
// the answer only decides whether an advisory line is worth a user's attention.
function hasDecisionCorpus(root) {
  for (const relative of ['docs/adr', 'docs/specs', 'docs/decisions', 'adr', 'specs']) {
    try {
      if (statSync(path.join(root, relative)).isDirectory()) return true
    } catch { /* absent is the common case */ }
  }
  return false
}

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

  const stale = staleVersionNotice()
  if (stale) lines.push(stale)

  const ready = readyTaskLines(root, repositoryRoot !== null)

  // A stale standalone copy can only give a wrong answer where a gate actually
  // runs, so the warning belongs in a repository that has a corpus for one to
  // read. Ungated it opened every session in every repository — including ones
  // that never opted into this lifecycle at all, which is the noise this
  // project was told is worse than not shipping the plugin.
  if (check || ready.length || hasDecisionCorpus(root)) {
    const shadow = shadowInstallNotice()
    if (shadow) {
      lines.push(`${shadow} \`node \${CLAUDE_PLUGIN_ROOT}/scripts/sync-standalone.mjs\` reports `
        + 'what differs. `--apply` copies over it, which is the fix you have to remember again '
        + 'next release; `--link` turns each gate into a forwarder that resolves the newest '
        + 'installed plugin at call time, so no release touches a gate again — and a gate is now '
        + 'the only thing it links, so there is nothing left to repoint after an update. A TEMPLATE '
        + 'is refreshed only where you already keep one, and a bare-name SKILL is better deleted '
        + 'than synced: it duplicates one the '
        + 'plugin already serves as `quality-harness:<name>`, and linking it at the plugin own '
        + 'directory hides the namespaced entrypoint outright.')
    }
  }

  if (ready.length) {
    const shown = ready.slice(0, 3)
    if (ready.length > shown.length) shown.push(`  (+${ready.length - shown.length} more record set(s))`)
    lines.push(['ADR tasks in flight:', ...shown].join('\n'))
  }

  return lines.join('\n\n')
}

// The governing and killed decisions for whatever this call is about to touch.
// Wrapped so a corpus this tool cannot read costs the edit nothing.
function decisionContextFor(input) {
  const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : process.cwd()
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (typeof target !== 'string' || !target) return ''
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const root = directory ? gitRepositoryRoot(directory) ?? directory : null
  if (!root) return ''
  const resolved = path.resolve(cwd, target)
  let context
  try { context = decisionContext([resolved], root) } catch { return '' }
  if (!context) return ''
  return firstMentionThisSession(input.session_id, resolved) ? context : ''
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
    // What has already been decided about this file. Not a finding — there is
    // nothing to fix and nothing to answer for; it is the one thing the corpus
    // knows that the code does not say, handed over at the moment it applies.
    if (MUTATION_TOOLS.has(input.tool_name)) {
      const context = decisionContextFor(input)
      if (context) {
        emitJson({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: context,
          },
        })
      }
      return
    }
    // No branch guard. This harness is about the quality of a project's records
    // and the evidence behind them, not about how anyone uses git — the agent
    // already knows git, and a repository that wants a branch policy states it
    // in CLAUDE.md, where a human wrote it. Told plainly on 2026-08-26 after the
    // guard fired on a command whose FIRST act was `git switch -c task/…`, the
    // very escape it was demanding.
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

  const claim = completionClaim(input.last_assistant_message)
  const raw = await readTranscript(input)
  if (!raw) {
    // ADR-005: the hook could not look. That is its own bucket, in neither half
    // of any rate — never a claim about the work, and never silence either.
    recordClaim(input, claim, 'could-not-look', 0)
    const reason = 'Quality gate could not read the session transcript; completion evidence is '
      + 'unavailable. This is an environment problem, not a finding about your work: the hook was '
      + 'given a transcript path it cannot read.'
    if (event === 'TaskCompleted') advise(reason)
    else emitJson({ systemMessage: reason })
    return
  }
  const state = analyzeTranscript(raw, input.cwd)
  // ADR-035. ONE row per completion event, written here because this is the one
  // point every path below has already passed and none has yet returned. The
  // rate's denominator is only honest if nothing can reach an exit without being
  // counted, so this must not be pushed down into the branches that follow.
  const check = projectCheckCommand(input.cwd)
  const unverified = state.unverifiedSince(state.lastPublish)
  recordClaim(input, claim, !check ? 'no-check' : unverified ? 'unverified' : 'verified',
    state.mutationPathsSince(state.lastPublish).length)
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
  if (!unverified) {
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
  if (!check) return


  // One arm only: `completionClaim` cannot return `asserted` any more, so a
  // `claim.kind === 'asserted'` ternary here was a branch nothing could take.
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
