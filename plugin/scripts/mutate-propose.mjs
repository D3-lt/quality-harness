#!/usr/bin/env node
// mutate-propose.mjs — find the contracts nothing asserts, before mutating anything.
//
// Mutation testing for CODE is a solved problem: Stryker, mutmut, cargo-mutants
// and PIT flip operators and branches far better than a hand-written list ever
// will. None of them touch the contracts that actually broke this project.
//
// Those live in strings. A tool name inside a SKILL.md, a `templates/...` path, a
// documented `--flag`, the clause in a description that decides whether a skill
// is selected at all. Nothing compiles them, so nothing notices when they rot,
// and a green suite says so confidently.
//
// The cheapest half of mutation testing needs no mutation. A string that carries
// a contract and appears in no test is already unasserted — you can read that off
// the tree, write nothing, and skip the whole apparatus of rewriting source and
// restoring it. Measured here on 2026-08-26: mutation 135 deleted adr-execute's
// `tick off a task` trigger, every test stayed green, and an eval had proved the
// day before that the wording carried a case from 0.00 to 1.00. This finds that
// class by reading.
//
// Read-only by construction. It never writes a file, never touches the runner's
// catalogue, and takes no lock — there is nothing here to interrupt.
//
// Usage:
//   node scripts/mutate-propose.mjs [root]        report unasserted contracts
//   node scripts/mutate-propose.mjs --json        emit candidate catalogue entries
//   node scripts/mutate-propose.mjs --all         include already-covered strings
//   node scripts/mutate-propose.mjs --tests <dir> where the tests live (default: tests)
//
// Exit: always 0. This reports; it judges nothing and refuses nothing.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'target', 'vendor', '.venv', 'venv',
  '__pycache__', 'coverage', '.next', '.cache',
])
const MAX_FILE_BYTES = 512 * 1024

/** Every file below `directory`, skipping the trees nobody writes contracts in. */
export function filesBelow(directory, limit = 5000) {
  const found = []
  const stack = [directory]
  while (stack.length && found.length < limit) {
    const current = stack.pop()
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) stack.push(full)
      } else if (entry.isFile()) {
        found.push(full)
      }
    }
  }
  return found
}

function readIfSmall(file) {
  try {
    if (statSync(file).size > MAX_FILE_BYTES) return null
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  return match ? match[1] : ''
}

/**
 * A YAML scalar that may be folded across continuation lines. Deliberately the
 * same shape the metadata suite uses: a description read differently here than
 * by the tests would report on a string neither one actually has.
 */
export function scalar(block, key) {
  const lines = block.split(/\r?\n/)
  const start = lines.findIndex(line => line.startsWith(`${key}:`))
  if (start === -1) return ''
  const inline = lines[start].slice(key.length + 1).trim()
  if (inline && !['>', '>-', '|', '|-'].includes(inline)) {
    return inline.replace(/^['"]|['"]$/g, '')
  }
  const continuation = []
  for (const line of lines.slice(start + 1)) {
    if (line && !/^\s/.test(line)) break
    if (line.trim()) continuation.push(line.trim())
  }
  return continuation.join(' ')
}

// A description is the only text read when deciding whether a skill applies, so
// each clause of one is a routing contract on its own. Split where the author
// separated them; a clause too short to be distinctive would match half the
// repository and tell you nothing.
const MIN_CLAUSE = 14
const MAX_CLAUSE = 140

/** The independently-checkable claims inside one description. */
export function descriptionClauses(description) {
  return description
    .split(/[,;]|\s+—\s+|(?<=[a-z)`])\.\s+/)
    .map(clause => clause.trim().replace(/^(?:or|and|then)\s+/i, '').replace(/[.;,]+$/, ''))
    .filter(clause => clause.length >= MIN_CLAUSE && clause.length <= MAX_CLAUSE)
    // A clause with no words, or one that is a bare path or command, is not a
    // routing claim — those are covered by the tool and flag detectors below.
    .filter(clause => /[a-z]{3}/i.test(clause) && !/^[`/.]/.test(clause))
}

/** Long flags a document promises, which some script has to actually declare. */
export function documentedFlags(text) {
  return [...new Set([...text.matchAll(/(?<![-\w])--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g)]
    .map(match => match[1]))]
}

function occurrences(haystack, needle) {
  if (!needle) return 0
  return haystack.split(needle).length - 1
}

/**
 * Where a contract string is covered. `test` is an assertion about it;
 * `catalogue` only records that a mutation exists, which is the runner's
 * business and not proof that anything asserts the string today.
 */
export function coverageOf(candidate, testTexts, catalogueText) {
  if (testTexts.some(text => text.includes(candidate))) return 'asserted'
  if (catalogueText.includes(candidate)) return 'catalogued'
  return 'unasserted'
}

function candidateEntry({ kind, absolute, relativeFile, from, to }) {
  const shown = from.length > 48 ? `${from.slice(0, 45)}...` : from
  return {
    label: `${kind}: ${relativeFile} — ${shown}`,
    file: relativeFile,
    from,
    to,
    tests: [],
    kind,
    absolute,
  }
}

function escapeForPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Contract strings this tree carries, each with where it is covered. Pure over
 * its inputs so the suite can hand it a fixture instead of a repository.
 */
export function proposals(root, { testsDirectory = 'tests' } = {}) {
  const files = filesBelow(root)
  const relative = file => path.relative(root, file).split(path.sep).join('/')

  const testFiles = files.filter(file => {
    const rel = relative(file)
    return rel.startsWith(`${testsDirectory}/`) || /\.(?:test|spec)\.[a-z]+$/.test(rel)
  })
  const testFileSet = new Set(testFiles)
  // The runner's own catalogue is not a test. It records that a mutation exists;
  // whether anything notices it is what the runner is for. Counting it as
  // coverage would make every catalogued string look asserted by itself.
  const catalogueText = testFiles
    .filter(file => /mutations?\.json$/.test(file))
    .map(file => readIfSmall(file) ?? '')
    .join('\n')
  const testTexts = testFiles
    .filter(file => !/mutations?\.json$/.test(file))
    .map(file => readIfSmall(file) ?? '')

  // The tools this tree ships, so a document naming one is making a promise that
  // can be checked rather than mentioning an arbitrary word.
  const shipped = new Set()
  for (const directory of ['bin', 'scripts']) {
    let entries
    try { entries = readdirSync(path.join(root, directory)) } catch { continue }
    for (const entry of entries) {
      if (entry.endsWith('.cmd')) continue
      shipped.add(entry.replace(/\.(?:mjs|js|sh|py|ts)$/, ''))
    }
  }

  const found = []
  const seen = new Set()
  const add = candidate => {
    const key = `${candidate.file} ${candidate.from}`
    if (seen.has(key)) return
    seen.add(key)
    found.push(candidate)
  }

  for (const file of files) {
    const rel = relative(file)
    if (testFileSet.has(file)) continue
    if (!/\.(?:md|mjs|js|json|yml|yaml|sh|py)$/.test(rel)) continue
    const text = readIfSmall(file)
    if (!text) continue

    if (rel.endsWith('SKILL.md')) {
      const description = scalar(frontmatter(text), 'description')
      for (const clause of descriptionClauses(description)) {
        // The runner replaces the FIRST match and needs the string to identify
        // one place; a clause repeated in the body would mutate the wrong one.
        if (occurrences(text, clause) !== 1) continue
        add(candidateEntry({
          kind: 'routing-clause', absolute: file, relativeFile: rel, from: clause, to: '',
        }))
      }
    }

    if (rel.endsWith('.md')) {
      for (const tool of shipped) {
        // Word-bounded: `adr-verify` inside `adr-verify-check` is a different
        // promise, and mutating it would rewrite a string the doc never made.
        const pattern = new RegExp(`(?<![\\w-])${escapeForPattern(tool)}(?![\\w-])`, 'g')
        if ((text.match(pattern) ?? []).length !== 1) continue
        add(candidateEntry({
          kind: 'named-tool', absolute: file, relativeFile: rel, from: tool, to: `${tool}-absent`,
        }))
      }
      for (const flag of documentedFlags(text)) {
        const from = `--${flag}`
        if (occurrences(text, from) !== 1) continue
        // Only flags this tree implements somewhere. A flag documented for a
        // third-party command is that command's contract, not this one's.
        const declared = files.some(other => other !== file
          && /\.(?:mjs|js|sh|py)$/.test(relative(other))
          && (readIfSmall(other) ?? '').includes(from))
        if (!declared) continue
        add(candidateEntry({
          kind: 'documented-flag', absolute: file, relativeFile: rel, from, to: `${from}-absent`,
        }))
      }
    }
  }

  for (const candidate of found) {
    candidate.coverage = coverageOf(candidate.from, testTexts, catalogueText)
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.from.localeCompare(b.from))
}

/** Catalogue entries in the runner's schema, with this tool's notes stripped. */
export function catalogueEntries(found) {
  return found.map(candidate => ({
    label: candidate.label,
    file: candidate.file,
    from: candidate.from,
    to: candidate.to,
    tests: candidate.tests,
  }))
}

export function report(found, { all = false } = {}) {
  const shown = all ? found : found.filter(candidate => candidate.coverage === 'unasserted')
  const lines = []
  for (const candidate of shown) {
    lines.push(`${candidate.coverage.toUpperCase().padEnd(11)} ${candidate.file}  [${candidate.kind}]`)
    lines.push(`            "${candidate.from}"`)
  }
  const counts = { asserted: 0, catalogued: 0, unasserted: 0 }
  for (const candidate of found) counts[candidate.coverage] += 1
  lines.push('')
  lines.push(`${found.length} contract string(s): ${counts.asserted} asserted by a test, `
    + `${counts.catalogued} catalogued for the runner, ${counts.unasserted} neither.`)
  if (counts.unasserted) {
    lines.push('A contract nothing asserts is not a failing test — it is a green one that would '
      + 'stay green with the promise deleted. Assert the ones that carry weight; the rest '
      + 'are prose, and saying so is also an answer.')
  }
  return lines.join('\n')
}

export function main(argv) {
  const flags = new Set(argv.filter(argument => argument.startsWith('--')))
  const testsIndex = argv.indexOf('--tests')
  const testsDirectory = testsIndex === -1 ? 'tests' : argv[testsIndex + 1] ?? 'tests'
  // `--tests` absent puts its value index at 0, which silently swallowed the
  // root argument and scanned the current directory instead of the one asked
  // for. Caught 2026-08-26 by pointing this at a worktree and getting the
  // working tree's answer back, which looked plausible and was not the question.
  const valueIndex = testsIndex === -1 ? -1 : testsIndex + 1
  const positional = argv.filter((argument, index) => !argument.startsWith('--')
    && index !== valueIndex)
  const root = path.resolve(positional[0] ?? process.cwd())

  const found = proposals(root, { testsDirectory })
  if (flags.has('--json')) {
    const chosen = flags.has('--all') ? found : found.filter(c => c.coverage === 'unasserted')
    process.stdout.write(`${JSON.stringify({ mutations: catalogueEntries(chosen) }, null, 2)}\n`)
    return 0
  }
  process.stdout.write(`${report(found, { all: flags.has('--all') })}\n`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
