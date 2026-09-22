// ADR-060 T7 deleted the command classifiers this file tested. The file stays
// because accepted records declare it in `Governs:` and records are history
// (CLAUDE.md §10): a `Governs:` path no tracked file matches makes adr-lint
// advise that the decision governs nothing. What used to be checked here is now
// checked against observed state in tests/observed-events.test.mjs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('advice-accuracy: the advisories it covered are proved against observed events now', () => {
  const observed = readFileSync(path.join(repoRoot, 'tests', 'observed-events.test.mjs'), 'utf8')
  assert.match(observed, /the scripted session advises as its step table lists/,
    'the scripted session is where these advisories are proved')
  assert.match(observed, /the command classifiers are gone/,
    'and the absence of the classifiers is asserted there')
})
