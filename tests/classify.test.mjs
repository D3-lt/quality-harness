// ADR-060 T7 deleted the four-way command classifier. This file stays because
// ADR-047 declares it in `Governs:` and records are history (CLAUDE.md §10);
// what it asserts now is that the module is a tombstone rather than a classifier
// somebody could start calling again.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tombstone = path.join(repoRoot, 'plugin', 'scripts', 'classify-command.mjs')
const EXPORT_LINE = /^\s*export\b/m
const CODE_LINE = /^\s*(?!\/\/)\S/m

test('the classifier module is a tombstone, not a classifier', () => {
  const text = readFileSync(tombstone, 'utf8')
  assert.doesNotMatch(text, EXPORT_LINE, 'nothing may be exported from it again')
  assert.doesNotMatch(text, CODE_LINE, 'and it holds comments only')
  assert.match(text, /ADR-060 T7/, 'it says which decision emptied it')
})

test('nothing shipped imports the tombstone', () => {
  const lifecycle = readFileSync(path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs'), 'utf8')
  assert.doesNotMatch(lifecycle, /classify-command\.mjs/,
    'the lifecycle must not import a module with nothing in it')
})
