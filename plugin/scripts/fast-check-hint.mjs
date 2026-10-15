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

const LEVER = 'this check took a minute or more, and .quality-harness.json declares no "fastCheck". With one, `qh-check --commit` runs it '
  + 'and commits on its pass; a push still needs the full check (ADR-081, ADR-100). Which tests may stand in for the suite is the '
  + 'project owner\'s call.'

const read = file => { try { return readFileSync(file, 'utf8') } catch { return null } }

function packageNames(root) {
  const text = read(path.join(root, 'package.json'))
  if (text === null) return new Set()
  try {
    const manifest = JSON.parse(text)
    return new Set([...Object.keys(manifest?.dependencies ?? {}), ...Object.keys(manifest?.devDependencies ?? {})])
  } catch { return new Set() }
}

function testmonFile(root) {
  if (/(^|["'\s])pytest-testmon\b/m.test(read(path.join(root, 'pyproject.toml')) ?? '')) return 'pyproject.toml'
  let names = []
  try { names = readdirSync(root).filter(name => /^requirements.*\.txt$/.test(name)).sort() } catch { names = [] }
  return names.find(name => /^\s*pytest-testmon\b/m.test(read(path.join(root, name)) ?? '')) ?? null
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
