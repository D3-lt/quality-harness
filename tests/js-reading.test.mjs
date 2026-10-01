// ADR-079 (docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md): spec-verify
// and adr-lint read a JavaScript-family test file with ADR-078's lexer, as the lock
// does. Bound red, `todo` until its tasks turn them green.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(repoRoot, 'plugin', 'bin')
const { NODE_TEST_CONTEXT: _nested, ...env } = process.env
const pyEnv = { ...env, PYTHONPATH: join(repoRoot, 'plugin', 'lib'), PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }

// Runs `body` in Python with the gate `gate` loaded as `mod`; returns the parsed JSON it prints.
function withGate(gate, body, input) {
  const r = spawnSync('python3', ['-c', `
import importlib.machinery, importlib.util, json, sys
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("gate_under_test", ${JSON.stringify(join(bin, gate))})
mod = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
loader.exec_module(mod)
req = json.load(sys.stdin)
${body}
`], { cwd: repoRoot, env: pyEnv, input: JSON.stringify(input), encoding: 'utf8', timeout: 60_000 })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

const HEAD = "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"
const STRING_ONLY = `const SUITE = "test('reading fixture in a string', () => {})"\n`
const REAL = "test('reading fixture real', () => {\n  assert.equal(1, 1)\n})\n"
// After `}` a `/` cannot be placed without a parser (ADR-078 F-7), so the lexer stops there.
const STOP = "const n = {} / (2) / 3\ntest('reading fixture past the stop', () => {\n  assert.equal(1, 1)\n})\n"

function files(map) {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-js-reading-'))
  for (const [rel, text] of Object.entries(map)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}

const existsIn = (dir, rel, name) => withGate('spec-verify', `
ok, why = mod.test_definition_exists(Path(req["path"]), req["name"], None)
print(json.dumps({"ok": ok, "why": why}))
`, { path: join(dir, rel), name })

test('spec-verify finds a JavaScript test only where its registration is code', { todo: 'ADR-079' }, () => {
  const dir = files({ 'a.test.mjs': HEAD + STRING_ONLY + REAL, 'b.test.mts': HEAD + REAL })
  try {
    assert.equal(existsIn(dir, 'a.test.mjs', 'reading fixture real').ok, true)
    assert.equal(existsIn(dir, 'a.test.mjs', 'reading fixture in a string').ok, false)
    assert.equal(existsIn(dir, 'b.test.mts', 'reading fixture real').ok, true, '.mts is a JavaScript-family suffix')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('spec-verify cannot check a JavaScript test past where the lexer stops', { todo: 'ADR-079' }, () => {
  const dir = files({ 'a.test.mjs': HEAD + STOP })
  try {
    const got = existsIn(dir, 'a.test.mjs', 'reading fixture past the stop')
    assert.equal(got.ok, null, `could-not-check, not ${got.ok}: ${got.why}`)
    assert.match(got.why, /UNPROVEN|could not/i)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const bodyOf = (text, name, suffix = '.mjs') => withGate('adr-lint', `
body = mod.test_body(req["text"], req["name"], suffix=req["suffix"])
print(json.dumps({"unproven": body is mod.UNPROVEN_BODY, "body": None if body is mod.UNPROVEN_BODY else body}))
`, { text, name, suffix })

test('adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it', { todo: 'ADR-079' }, () => {
  const text = HEAD + `const SAME = "test('reading fixture real', () => { /* nothing */ })"\n` + REAL
  const got = bodyOf(text, 'reading fixture real')
  assert.equal(got.body, '{\n  assert.equal(1, 1)\n}')
})

test('adr-lint does not find a JavaScript test that exists only inside a string', { todo: 'ADR-079' }, () => {
  const got = bodyOf(HEAD + STRING_ONLY + REAL, 'reading fixture in a string')
  assert.deepEqual(got, { unproven: false, body: null })
})

test('adr-lint says UNPROVEN for a JavaScript test past where the lexer stops', { todo: 'ADR-079' }, () => {
  assert.equal(bodyOf(HEAD + STOP, 'reading fixture past the stop').unproven, true)
  // Through the gate: the record names the test, and adr-lint says UNPROVEN for it,
  // neither "not found" nor nothing.
  const dir = files({
    'tests/a.test.mjs': HEAD + STOP,
    'docs/adr/ADR-001-probe.md': ['# ADR-001: Probe', '', '**Status:** Accepted', '**Spec:** None — no spec stage',
      '**Served-path change:** None — this decision changes no served path.', '', '## Existing Primitives Audit', '',
      'None.', '', '## Decision', '', 'Probe.', '', '## Alternatives Considered', '', '- Nothing — rejected.', '',
      '## Consequences', '', 'None.', '', '## Wiring & Contract Changes', '', 'None.', '', '## Out of Scope', '',
      '- Other (deferred: ADR-002)', ''].join('\n'),
    'docs/adr/ADR-001-probe/tasks/README.md': '# Tasks\n\n| ID | Goal | Status | Depends-on | Notes |\n|----|------|--------|------------|-------|\n| T1 | probe | pending | | |\n',
    'docs/adr/ADR-001-probe/tasks/T1-probe.md': '# Task ADR-001-T1: probe\n\n## Tests\n\n| Test name | File | Verifies | Covers |\n|-----------|------|----------|--------|\n'
      + '| `reading fixture past the stop` | `tests/a.test.mjs` | probe | — |\n\n## Verification Log\n\n',
  })
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 10_000 })
    spawnSync('git', ['add', '-A'], { cwd: dir, timeout: 10_000 })
    const lint = spawnSync('python3', [join(bin, 'adr-lint'), join(dir, 'docs', 'adr', 'ADR-001-probe.md')],
      { cwd: dir, env: pyEnv, encoding: 'utf8', timeout: 60_000 })
    const said = `${lint.stdout}\n${lint.stderr}`
    assert.match(said, /reading fixture past the stop[^\n]*UNPROVEN|UNPROVEN[^\n]*reading fixture past the stop/, said)
    assert.doesNotMatch(said, /reading fixture past the stop[^\n]*not found/i, said)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the other languages read as they did', { todo: 'ADR-079' }, () => {
  const dir = files({ 'test_a.py': 'def test_reading_fixture():\n    assert 1\n', 'a_test.go': 'package p\nimport "testing"\nfunc TestReadingFixture(t *testing.T) {}\n' })
  try {
    assert.equal(existsIn(dir, 'test_a.py', 'test_reading_fixture').ok, true)
    assert.equal(existsIn(dir, 'a_test.go', 'TestReadingFixture').ok, true)
    const php = bodyOf("<?php\ntest('reading fixture pest', function () {\n    expect(1)->toBe(1);\n});\n", 'reading fixture pest', '.php')
    assert.match(php.body ?? '', /expect\(1\)/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
