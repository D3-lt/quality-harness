#!/usr/bin/env node
// staged-mutation-guard.mjs — a shipped file with no mutation, caught at the
// moment it becomes visible rather than in CI twenty minutes later.
//
// BACKLOG §127c. `tests/package.test.mjs::every shipped gate carries at least
// one mutation` resolves shipped scripts through `git ls-files`, which is
// correct (CLAUDE.md §8) and has one consequence nobody had paid: a NEW file is
// invisible to it until it is committed. So every local run before the commit
// passes, and the first honest run is the one CI does. Measured 2026-09-04: a
// green `selftest.sh` locally and all FOUR CI jobs red on that one assertion.
//
// This is the same question asked of the INDEX instead of the tree, at the
// moment of `git commit`, and only when a shipped file is being ADDED — so it
// costs nothing on an ordinary commit.
//
// It REFUSES, like the hook it lives in. That is not a contradiction of
// CLAUDE.md §3: §3 governs the gates this project SHIPS, which advise a user
// about their corpus. This is a repository-local commit hook, and its
// neighbour already refuses for the same reason — the cheapest moment to fix
// this is before the commit exists.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Which of `added` carry no entry in the catalogue. PURE.
 *
 * A catalogue that cannot be parsed returns NO findings rather than every file:
 * this runs at commit time, and a guard that refuses the world because it could
 * not read one file is a guard people disable (ADR-005 — could-not-look is not a
 * verdict). The suite still asks the same question on a complete tree.
 */
export function missingMutations(added, catalogueText) {
  let entries
  try {
    entries = JSON.parse(catalogueText).mutations
  } catch {
    return { looked: false, missing: [] }
  }
  if (!Array.isArray(entries)) return { looked: false, missing: [] }
  const covered = new Set(entries.map(entry => entry?.file).filter(Boolean))
  return { looked: true, missing: added.filter(file => !covered.has(file)) }
}

/**
 * The catalogue AS STAGED, falling back to the one beside this script.
 *
 * ⚠ READING THE WORKING TREE HERE WOULD DEFEAT THE GUARD: an entry added but not
 * staged would bless a commit whose `tests/mutations.json` does not contain it,
 * which is the same "the check saw something the commit does not" defect one
 * level up. `git show :path` reads the INDEX, which is what is about to become
 * the commit. The fallback exists so the suite can drive the real guard from a
 * scratch repository that has no staged catalogue of its own.
 */
export function stagedCatalogue(run, fallback) {
  const staged = run(['show', ':tests/mutations.json'])
  if (staged.status === 0 && staged.stdout.trim()) return staged.stdout
  try { return readFileSync(fallback, 'utf8') } catch { return '' }
}

function main(stdin, catalogue = join(HERE, '..', 'tests', 'mutations.json')) {
  const added = stdin.split('\n').map(line => line.trim()).filter(Boolean)
  if (!added.length) return 0
  const text = stagedCatalogue(
    args => spawnSync('git', args, { encoding: 'utf8', timeout: 30_000 }), catalogue)
  if (!text) return 0
  const { looked, missing } = missingMutations(added, text)
  if (!looked || !missing.length) return 0
  process.stderr.write([
    'pre-commit REFUSED: a shipped file is being added with no mutation in tests/mutations.json:',
    '',
    ...missing.map(file => `  ${file}`),
    '',
    '  `every shipped gate carries at least one mutation` resolves shipped scripts through',
    '  `git ls-files`, so it CANNOT SEE these until they are committed — every local run',
    '  before now passed, and CI would be the first honest one. That is BACKLOG §127c, and',
    '  on 2026-09-04 it cost four red jobs.',
    '',
    '  Add an entry naming the mechanism this file is supposed to have, and check it dies:',
    '      node scripts/mutate.mjs --case "<your label>" --no-cache',
    '',
    '  If one of these is a trivial forwarder, name it in `trivial` in tests/package.test.mjs',
    '  with the reason, which is the same escape hatch the suite offers.',
    '',
  ].join('\n'))
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks = []
  process.stdin.on('data', chunk => chunks.push(chunk))
  process.stdin.on('end', () => process.exit(main(Buffer.concat(chunks).toString('utf8'))))
}
