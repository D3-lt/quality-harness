// ADR-103 T1. The hint a passing full run may add when it took a while and the project declares no `fastCheck`: the fast check
// the project's own test runner offers, named only where that command was measured to yield a pass through `qh-check --fast`,
// both on a change its tests cover and on one they do not (2026-10-15, recorded in ADR-103 T1):
// - vitest 5.0.4, `vitest run --changed`: "No affected test files found, exiting with code 0" grades as a pass. Named.
// - pytest 9.1.1 with pytest-testmon 2.2.0, `pytest --testmon`: passes, but only with `.testmondata*` ignored in git; the data
//   file it writes otherwise changes the tree under the run, which is not a pass. Named, with the ignore line.
// - jest 30.5.2, `jest --onlyChanged` (with or without --passWithNoTests): "No tests found related to files changed since last
//   commit" grades as no-work, so every commit touching no test would be refused. Not named: jest draws the plain lever.
// It reads the root's manifests only, writes nothing, and decides nothing: which tests may stand in for the suite is the owner's.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// No duration in the text: the threshold is configurable (QUALITY_HARNESS_PROSE_HINT_MS), and "a minute or more" said under a
// threshold of 0 was a claim nothing measured (the Codex review of T1, ADR-103 T3).
// What a fastCheck IS is said too: in a monorepo it decides between a runner that is only in a workspace and a command that
// reaches it (a peer's probe of 6e056260 on a pnpm monorepo, 2026-10-15).
const LEVER = 'No "fastCheck" is declared in .quality-harness.json (one shell command, run from the repository root). With one, '
  + '`qh-check --commit` runs it and commits on its pass; a push still needs the full check (ADR-081, ADR-100). Which tests may '
  + 'stand in for the suite is the project owner\'s call.'

const read = file => { try { return readFileSync(file, 'utf8') } catch { return null } }

function packageNames(root) {
  const text = read(path.join(root, 'package.json'))
  if (text === null) return new Set()
  try {
    const manifest = JSON.parse(text)
    return new Set([...Object.keys(manifest?.dependencies ?? {}), ...Object.keys(manifest?.devDependencies ?? {})])
  } catch { return new Set() }
}

// ADR-103 T3: a dependency is a declaration with exactly that name, never a mention. A `#` comment is dropped first (a `#` inside
// a quoted value is rare, and dropping it errs toward naming nothing); then a TOML string that IS the name with an optional
// version, a Poetry key that is the name, or a requirements line naming it. A description, a comment and `pytest-testmon-helper`
// each read as testmon before (the Codex review of T1).
const uncommented = text => text.split('\n').map(line => line.replace(/(^|\s)#.*$/, '$1')).join('\n')
const DECLARED_STRING = /["']pytest-testmon\s*(?:[<>=!~;[][^"'\n]*)?["']/
const POETRY_KEY = /^\s*["']?pytest-testmon["']?\s*=/
const REQUIREMENT = /^\s*pytest-testmon\s*(?:[<>=!~;[]|$)/m
const POETRY_TABLE = /^tool\.poetry\.(?:dependencies|dev-dependencies|group\.[^.\]]+\.dependencies)$/

// ADR-103 T4: and only in a dependency position, read by table (the verification review of T3 found `description =
// "pytest-testmon"` and a `[tool.custom]` key read as declarations): a string in `[project]`'s `dependencies` array or in an array
// of `[project.optional-dependencies]` or `[dependency-groups]`, or a key in a Poetry dependency table. No full TOML parser: an
// array is read from its opening line to the line that closes it, outside quotes.
function tomlDeclaresTestmon(text) {
  let table = ''
  let inArray = false
  for (const line of uncommented(text).split('\n')) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*$/)
    if (header) { table = header[1].replace(/\s+/g, ''); inArray = false; continue }
    if (POETRY_TABLE.test(table) && POETRY_KEY.test(line)) return true
    const opens = (table === 'project' && /^\s*dependencies\s*=\s*\[/.test(line))
      || ((table === 'project.optional-dependencies' || table === 'dependency-groups') && /^\s*["']?[\w.-]+["']?\s*=\s*\[/.test(line))
    if (!inArray && opens) inArray = true
    // An inline table names a group or a path, not a package: `{include-group = "pytest-testmon"}` (BACKLOG §381 item 15).
    if (inArray && DECLARED_STRING.test(line.replace(/\{[^{}]*\}/g, ''))) return true
    if (inArray && line.replace(/["'][^"']*["']/g, '').includes(']')) inArray = false
  }
  return false
}

function testmonFile(root) {
  if (tomlDeclaresTestmon(read(path.join(root, 'pyproject.toml')) ?? '')) return 'pyproject.toml'
  let names = []
  try { names = readdirSync(root).filter(name => /^requirements.*\.txt$/.test(name)).sort() } catch { names = [] }
  return names.find(name => REQUIREMENT.test(uncommented(read(path.join(root, name)) ?? ''))) ?? null
}

/** The hint's text for the project at `root`: one constant per runner, since a hint is said once per its text (firstMentionHere). */
export function fastCheckHint(root) {
  if (packageNames(root).has('vitest')) {
    return `${LEVER} Its runner offers one: \`npx vitest run --changed\` (vitest, in package.json), which passes on a change no test covers.`
  }
  const testmon = testmonFile(root)
  if (testmon) {
    return `${LEVER} Its runner offers one: \`pytest --testmon\` (pytest-testmon, in ${testmon}), with \`.testmondata*\` in .gitignore, `
      + 'since a data file the run writes would change the tree it checks.'
  }
  return LEVER
}
