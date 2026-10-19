// ADR-117 T1: the evidence in a repository's state directory is written only by its tools. qh-check writes checks.jsonl,
// fast-checks.jsonl and baseline.jsonl there, and adr-verify the receipts; a row an agent writes by hand reads exactly like one
// they wrote, and a local gate cannot tell them apart (ADR-005, ADR-113). So a write into that directory the hook can see is
// refused at PreToolUse: an Edit, Write, MultiEdit, NotebookEdit or mrw MCP write, and a shell command's output redirection or
// `tee` file, read the same way inside a `$(…)` or backtick substitution and a `sh -c '…'` string. PowerShell is read with its
// own path separator, and its Out-File, Set-Content, Add-Content and Tee-Object name the files they write. A target built from a
// variable, a program that writes the file itself, and a string a command builds before running it are not read: a boundary,
// not a pass (scripts/side-doors.json).
import path from 'node:path'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { canonicalFile, nearestExistingDirectory, repositoryStateDir, stateDir } from './event-log.mjs'
import { shellWords } from './shell-words.mjs'
import { SHELL_NAMES, programName } from './publish-command.mjs'
import { MRW_WRITE, MUTATION_TOOLS, mrwWritePaths } from './hook-record.mjs'
import { SHELL_TOOLS } from './publish-verdict.mjs'
import { gitRepositoryLookup } from './tree-facts.mjs'

const POWERSHELL_WRITERS = new Set(['out-file', 'set-content', 'add-content', 'tee-object', 'sc', 'ac', 'tee'])
const POWERSHELL_CD = new Set(['cd', 'chdir', 'set-location', 'sl', 'push-location', 'pushd'])
const POWERSHELL_NAMED = new Set(['filepath', 'path', 'literalpath', 'pspath', 'lp'])
const POWERSHELL_CONTENT = ['value', 'inputobject']
// PowerShell takes a parameter by any prefix that names it (`-Va`), and its value after a colon too (`-Path:x`).
const prefixOf = (word, names, shortest = 1) => word.length >= shortest && names.some(full => full.startsWith(word))

// The files a PowerShell writer may name. Telling a switch from a positional, or one prefix from another, is a guess an
// attacker gets to choose (`-vb`, `-Fi` for -Filter, a quoted "-Value": the verification reviews of 671827fa and f7dc229c),
// so very little is excluded. Every word is a candidate except the word straight after an unquoted parameter that carries
// content (`-Value`, `-InputObject`), and a bare word after a destination named in full, which PowerShell binds as content.
// A quoted word is never a parameter, but a quoted `-Path:"…"` still names its value. The price is an over-refusal of a
// content word that is itself a ledger's path (BACKLOG §387).
function powershellDestinations(c) {
  const found = []
  let settled = false
  let after = null
  // A comma list is one argument (`-Path a, b`): a word that continues one is read as the word that began it was, a
  // destination or content (the fourth verification review of 9e2e2c1c). `last` is how the word before was read, and `open`
  // the same while that word left the list open with a trailing comma.
  let last = null
  let open = null
  const elements = text => text.split(',').map(part => part.trim()).filter(Boolean)
  for (let at = 1; at < c.argv.length; at++) {
    const word = c.argv[at]
    const literal = !c.dynamic.includes(at)
    const colon = /^-[A-Za-z]+:([\s\S]*)$/.exec(word)
    const parameter = !c.quoted[at] && /^-([A-Za-z]+)(?::[\s\S]*)?$/.exec(word)
    if (parameter) {
      const name = parameter[1].toLowerCase()
      const content = prefixOf(name, POWERSHELL_CONTENT, 2)
      if (POWERSHELL_NAMED.has(name)) settled = true
      if (colon) {
        if (!content && literal) found.push(...elements(colon[1]))
        last = !content
        open = colon[1].endsWith(',') ? last : null
        after = null
      } else {
        after = content ? 'content' : 'value'
        last = null
        open = null
      }
      continue
    }
    const continues = open !== null || (word.startsWith(',') && last !== null)
    const candidate = continues ? (open ?? last) : after !== 'content' && (after === 'value' || !settled)
    if (candidate && literal) found.push(...elements(word))
    if (colon && literal) found.push(...elements(colon[1]))
    last = candidate
    open = word.endsWith(',') ? candidate : null
    after = null
  }
  return found
}

// The files a shell command writes, each with every directory a relative one may land in. A `cd` in a subshell or a pipeline
// does not persist and one in a list does, and which is which is not tracked here, so the directory before a `cd` stays a
// candidate beside the one after it; null stands for a `cd` that could not be read. A redirection opens before its command
// runs, so a `cd`'s own redirection lands where the `cd` started. Each substitution and `-c` string is shorter than the text
// holding it, so the walk ends without a depth limit.
function shellTargets(command, bases, powershell) {
  const found = []
  if (typeof command !== 'string') return found
  let seen = bases
  for (const c of shellWords(powershell ? command.replaceAll('\\', '/') : command).commands) {
    const name = powershell ? programName(c.argv[0] ?? '').toLowerCase() : programName(c.argv[0] ?? '')
    for (const write of c.writes ?? []) if (!write.dynamic) found.push({ file: write.target, bases: seen })
    for (const inner of c.substitutions ?? []) found.push(...shellTargets(inner, seen, powershell))
    if (name === 'cd' || (powershell && POWERSHELL_CD.has(name))) {
      const at = c.argv.findIndex((word, index) => index > 0 && !word.startsWith('-'))
      const to = at > 0 && !c.dynamic.includes(at) && c.argv[at] !== '-' && !c.argv[at].startsWith('~') ? c.argv[at] : null
      seen = [...seen, ...(to === null ? [null] : seen.filter(base => base !== null).map(base => path.resolve(base, to)))]
      continue
    }
    if (powershell && POWERSHELL_WRITERS.has(name)) {
      for (const file of powershellDestinations(c)) found.push({ file, bases: seen })
    } else if (name === 'tee') {
      for (let at = 1; at < c.argv.length; at++) if (!c.argv[at].startsWith('-') && !c.dynamic.includes(at)) found.push({ file: c.argv[at], bases: seen })
    }
    const inner = c.argv.findIndex(word => word === '-c' || (/^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/i.test(word) && SHELL_NAMES.has(name) && /pwsh|powershell/.test(name)))
    if (SHELL_NAMES.has(name) && inner > 0 && typeof c.argv[inner + 1] === 'string' && !c.dynamic.includes(inner + 1)) {
      found.push(...shellTargets(c.argv[inner + 1], seen, powershell || /pwsh|powershell/.test(name)))
    }
  }
  return found
}

// The files an mrw MCP write names: mrwWritePaths's, and where it leaves them unknown, the file each search_replace block
// names (after its marker, or on the last line outside a block) and the paths a grep or ast-grep walk starts at.
function mrwTargets(toolInput) {
  const named = mrwWritePaths(toolInput)
  if (named) return named
  const input = toolInput ?? {}
  const found = Array.isArray(input.paths) ? input.paths.filter(file => typeof file === 'string' && file) : []
  if (input.format === 'search_replace' && typeof input.plan === 'string') {
    let last = ''
    let block = false
    for (const line of input.plan.split(/\r\n|\r|\n/)) {
      if (block) { block = line !== '>>>>>>> REPLACE'; continue }
      if (line.trim().startsWith('```')) continue
      if (line.startsWith('<<<<<<< SEARCH')) {
        const file = line.slice('<<<<<<< SEARCH'.length).trim() || last
        if (file) found.push(file)
        last = file
        block = true
      } else if (line.trim()) last = line
    }
  }
  return found
}

// Where a grep or ast-grep write walks from: its paths, or mrw's root, which is the session's directory here.
const mrwWalks = toolInput => (toolInput?.grep !== undefined || toolInput?.ast_grep !== undefined)
  ? (Array.isArray(toolInput.paths) && toolInput.paths.length ? toolInput.paths.filter(file => typeof file === 'string' && file) : ['.'])
  : []

// A path with every link at its leaf followed, even to a file that does not exist yet: a write through a link creates its
// target (the verification review of a855f7f7). Its directories are then made real.
function followed(absolute) {
  let at = absolute
  for (let hop = 0; hop < 40; hop++) {
    let target
    try {
      if (!lstatSync(at).isSymbolicLink()) break
      target = readlinkSync(at)
    } catch { break }
    // From the link's real directory: `dir/jump -> ../x`, with `dir` itself a link, lands beside where `dir` points.
    at = path.resolve(canonicalFile(path.dirname(at)), target)
  }
  return canonicalFile(at)
}

/** The path, as written, of a hook-visible write into the session repository's state directory, or null. */
export function ledgerWrite(input) {
  const cwd = input?.cwd
  if (typeof cwd !== 'string' || !cwd) return null
  // Every place the evidence is read from: the state directory and, under a state root, the repository's own as well, since
  // adr-lint reads receipts from both (ADR-117 T2).
  const dirs = [...new Set([stateDir(cwd), repositoryStateDir(cwd)].filter(Boolean).map(dir => canonicalFile(path.resolve(dir))))]
  const within = (dir, file) => {
    const relative = path.relative(dir, file)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  }
  // A file as spelled, its directories made real, and with every link at its leaf followed: a link outside the directory to a
  // ledger inside it writes the ledger, whether or not the ledger exists yet.
  const lands = absolute => [canonicalFile(absolute), followed(absolute)].some(file => dirs.some(dir => within(dir, file)))
  const inside = (file, bases) => path.isAbsolute(file) ? lands(path.resolve(file)) : bases.some(base => base !== null && lands(path.resolve(base, file)))
  // A walk reaches a guarded directory below where it starts unless a `.git` stands between, since mrw never enters one.
  const reaches = start => {
    const from = followed(path.resolve(cwd, start))
    return dirs.some(dir => {
      const relative = path.relative(from, dir)
      return within(from, dir) && !relative.split(/[\\/]/).some(part => part.toLowerCase() === '.git')
    })
  }
  const tool = input.tool_name
  const here = [path.resolve(cwd)]
  if (tool === MRW_WRITE) return mrwTargets(input.tool_input).find(file => inside(file, here)) ?? mrwWalks(input.tool_input).find(reaches) ?? null
  if (MUTATION_TOOLS.has(tool)) {
    const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
    return typeof file === 'string' && file && inside(file, here) ? file : null
  }
  if (SHELL_TOOLS.has(tool)) return shellTargets(input.tool_input?.command, here, tool === 'PowerShell').find(t => inside(t.file, t.bases))?.file ?? null
  return null
}

/** Whether the project turned the refusal into a warning, with `"ledgers": "warn"` in `.quality-harness.json`. */
export function ledgersWarn(cwd) {
  const directory = nearestExistingDirectory(path.resolve(cwd))
  const found = directory ? gitRepositoryLookup(directory) : { ok: false }
  try {
    return JSON.parse(readFileSync(path.join(found.root ?? directory, '.quality-harness.json'), 'utf8'))?.ledgers === 'warn'
  } catch { return false }
}

export const ledgerRefusal = file => `quality-harness ledger guard: ${file} is in this repository's state directory, where the `
  + 'evidence is written only by its tools: qh-check writes checks.jsonl, fast-checks.jsonl and baseline.jsonl, and adr-verify '
  + 'the receipts. Run the tool; a row written by hand is not evidence (ADR-117). A project that needs this write sets '
  + '"ledgers": "warn" in .quality-harness.json.'
export const ledgerWarning = file => `quality-harness ledger guard: ${file} is in this repository's state directory, written only `
  + 'by its tools; "ledgers": "warn" lets this write through, and a row written by hand is still not evidence (ADR-117).'
