// ADR-126 T3: a test sets every budget it depends on (CLAUDE.md §7). Measured 2026-10-22: of the week's 29 failed CI jobs,
// three were a hook-spawning test that inherited the product's 5 s observe budget on a slow runner and read no decision.
// One export in each runner of the suite ends the class: selftest.sh, coverage.sh, the workflow, and a mutation campaign's
// children, which run test files directly.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNNERS = ['scripts/selftest.sh', 'scripts/coverage.sh', '.github/workflows/selftest.yml', 'scripts/mutate.mjs']
// The variable given a whole number of milliseconds, in shell (`X=60000`), YAML (`X: '60000'`) or JS (`X: '60000'`).
const sets = text => /QUALITY_HARNESS_OBSERVE_BUDGET_MS["']?\s*[:=]\s*["']?\d{4,}/.test(text)

test('every runner of the suite sets the observe budget the tests depend on', () => {
  for (const runner of RUNNERS) assert.ok(sets(readFileSync(path.join(repoRoot, runner), 'utf8')), `${runner} sets no observe budget`)
  // DIRTY twins: a runner that never names it, or names it without a value, is found.
  assert.equal(sets('export QUALITY_HARNESS_LEASE_DIR="$QH_LEASES"\n'), false)
  assert.equal(sets('unset QUALITY_HARNESS_OBSERVE_BUDGET_MS\n'), false)
})
