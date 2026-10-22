// ADR-126 T2: the coverage floor set every landing's length, because it ran the whole suite twice in series, once for
// JavaScript coverage and once for the Python gates (53 min on run 39814891254, 2026-10-22). Each surface is now its own
// job, and main requires both.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { testBash } from './helpers/bash.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')
// A job's block: from its key to the next job key at the same indent.
const jobBlock = (workflow, key) => new RegExp(`^ {2}${key}:\\n(?: {4}.*\\n|\\n)*`, 'm').exec(workflow)?.[0] ?? ''

test('the coverage floor is two jobs, each measuring one surface, and main requires both', () => {
  const workflow = read('.github/workflows/selftest.yml')
  const js = jobBlock(workflow, 'coverage')
  const py = jobBlock(workflow, 'coverage-python')
  assert.match(js, /name: coverage floor\n/)
  assert.match(js, /run: bash scripts\/coverage\.sh --js\n/)
  assert.match(py, /name: coverage floor \(python\)\n/)
  assert.match(py, /run: bash scripts\/coverage\.sh --python\n/)
  const required = JSON.parse(read('.github/rulesets/main.json')).rules
    .find(rule => rule.type === 'required_status_checks').parameters.required_status_checks.map(check => check.context)
  assert.ok(required.includes('coverage floor') && required.includes('coverage floor (python)'), required.join(', '))
})

test('coverage.sh measures only the surface it is asked for', () => {
  const script = read('scripts/coverage.sh')
  assert.match(script, /if \[ "\$SURFACE" != python \]; then\nprintf '== JavaScript hooks ==\\n'/)
  assert.match(script, /if \[ "\$SURFACE" != js \]; then\nprintf '\\n== Python gates \(bin\/\) ==\\n'/)
  // An argument it does not know is refused before anything runs.
  const run = spawnSync(testBash(), [path.join(repoRoot, 'scripts', 'coverage.sh'), '--bogus'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 2, run.stderr)
  assert.match(run.stderr, /usage: coverage\.sh/)
})
