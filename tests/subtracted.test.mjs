// ADR-097: what nothing acts on is removed. Each test asserts an absence and is shown finding the thing on a dirty input, so
// a check that cannot see the file it is about does not pass by looking nowhere (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const self = path.relative(repoRoot, fileURLToPath(import.meta.url)).split(path.sep).join('/')

// Every text file under the given directories, as [repository path, contents].
function files (dirs) {
  const out = []
  const walk = rel => {
    for (const name of readdirSync(path.join(repoRoot, rel))) {
      const child = `${rel}/${name}`
      // tests/mutations/ holds the mutants that put a removed name back on purpose; a catalogue is not a reference.
      if (name === 'node_modules' || name === '__pycache__' || child === 'tests/mutations') continue
      const full = path.join(repoRoot, child)
      if (statSync(full).isDirectory()) walk(child)
      else if (child !== self) out.push([child, readFileSync(full, 'utf8')])
    }
  }
  for (const dir of dirs) walk(dir)
  return out
}
// The files whose text names `name` as a file, not as the tail of a longer name (`spec-verify.mjs` is not `verify.mjs`).
const naming = (all, name) => all.filter(([, text]) => new RegExp(`(^|[^A-Za-z0-9_-])${name.replaceAll('.', '\\.')}`).test(text)).map(([file]) => file)

test('verify.mjs is not shipped, and nothing shipped or tested names it', () => {
  assert.equal(existsSync(path.join(repoRoot, 'plugin', 'scripts', 'verify.mjs')), false, 'plugin/scripts/verify.mjs still ships')
  assert.deepEqual(naming(files(['plugin', 'scripts', 'tests']), 'verify.mjs'), [])
  // ...and it can say the other thing.
  assert.deepEqual(naming([['a.md', 'run `node scripts/verify.mjs --cwd x -- y`'], ['b.md', 'run spec-verify.mjs']], 'verify.mjs'), ['a.md'])
})

test('eval-fixture is repository tooling, and no workflow runs the evals', () => {
  assert.equal(existsSync(path.join(repoRoot, 'scripts', 'eval-fixture.mjs')), true, 'scripts/eval-fixture.mjs is missing')
  assert.equal(existsSync(path.join(repoRoot, 'plugin', 'scripts', 'eval-fixture.mjs')), false, 'plugin/scripts/eval-fixture.mjs still ships')
  // A workflow that runs `claude plugin eval` with no key measures nothing and reads as a check.
  const evalRun = /plugin eval|eval-run|scripts\/eval-|evals\//
  const running = files(['.github']).filter(([file, text]) => file.startsWith('.github/workflows/') && evalRun.test(text)).map(([file]) => file)
  assert.deepEqual(running, [])
  // ...and it can say the other thing.
  assert.ok(evalRun.test('run: claude plugin eval plugin --runs 3'), 'the pattern finds an eval run')
})
