// ADR-079 (docs/specs/2026-10-01-every-gate-reads-javascript-one-way.md): spec-verify
// and adr-lint read a JavaScript-family test file with ADR-078's lexer, as the lock
// does. Bound red as node:test `todo`; each task removed `todo` from its own tests.
//
// The interface these tests fix:
// - `spec-verify`'s `test_definition_exists` answers `None` for could-not-check, and
//   the CLI maps that to exit 4.
// - `adr-lint` reads a JavaScript-family file through `js_test_body(text, name, suffix)`,
//   which returns `(status, body)`. The status is `found`, `missing` or `unproven`, and
//   `unproven` also covers a test found whose body cannot be bounded.
// - `js_body_can_fail(text, name, suffix)` returns `(status, bool)`, following
//   same-file helpers.
// - `test_body` keeps its old contract for every other language (F-9).
// Every routing claim is checked through the CLI too, with an adverse twin. A helper
// test alone can pass while the shipped caller keeps its old reader.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const TEMPLATE = "test('reading fixture template', () => {\n  const s = `${assert.equal(1, 1)}`\n})\n"
const REGEX = "test('reading fixture regex', () => {\n  const r = /assert/\n  r.test('x')\n})\n"
const HELPED = "function checkIt() {\n  assert.equal(1, 1)\n}\ntest('reading fixture helped', () => {\n  checkIt()\n})\n"

function files(map) {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-js-reading-'))
  for (const [rel, text] of Object.entries(map)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}
const git = (dir, ...args) => spawnSync('git', args, { cwd: dir, timeout: 10_000, windowsHide: true })

const existsIn = (dir, rel, name) => withGate('spec-verify', `
ok, why = mod.test_definition_exists(Path(req["path"]), req["name"], None)
print(json.dumps({"ok": ok, "why": why}))
`, { path: join(dir, rel), name })

test('spec-verify finds a JavaScript test only where its registration is code, in every family suffix', () => {
  const dir = files({ 'a.test.mjs': HEAD + STRING_ONLY + REAL, 'b.test.mts': HEAD + REAL, 'c.test.cts': HEAD + REAL })
  try {
    assert.equal(existsIn(dir, 'a.test.mjs', 'reading fixture real').ok, true)
    assert.equal(existsIn(dir, 'a.test.mjs', 'reading fixture in a string').ok, false)
    assert.equal(existsIn(dir, 'b.test.mts', 'reading fixture real').ok, true, '.mts is a JavaScript-family suffix')
    assert.equal(existsIn(dir, 'c.test.cts', 'reading fixture real').ok, true, '.cts is a JavaScript-family suffix')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('spec-verify says could-not-check, exit 4, for a JavaScript test it could not read to', () => {
  const dir = files({ 'tests/a.test.mjs': HEAD + REAL + STOP })
  try {
    const got = existsIn(dir, 'tests/a.test.mjs', 'reading fixture past the stop')
    assert.equal(got.ok, null, `could-not-check, not ${got.ok}: ${got.why}`)
    assert.equal(existsIn(dir, 'tests/a.test.mjs', 'reading fixture nowhere').ok, null, 'any name not found in a stopped file')
    assert.equal(existsIn(dir, 'tests/a.test.mjs', 'reading fixture real').ok, true, 'a test before the stop is found')
    // Through the CLI: the conforming fixture spec, rebound to this file's two tests.
    const spec = readFileSync(join(repoRoot, 'tests', 'fixtures', 'ok', 'spec-selftest.md'), 'utf8')
      .replaceAll('test_selftest_fixture.py::test_gates_run', 'tests/a.test.mjs::reading fixture real')
      .replaceAll('test_selftest_fixture.py::test_gates_reject_malformed', 'tests/a.test.mjs::reading fixture past the stop')
    writeFileSync(join(dir, 'spec.md'), spec)
    const run = spawnSync('python3', [join(bin, 'spec-verify'), '--spec', '--repo', dir, join(dir, 'spec.md')],
      { cwd: dir, env: pyEnv, encoding: 'utf8', timeout: 60_000 })
    const said = `${run.stdout}\n${run.stderr}`
    assert.equal(run.status, 4, said)
    assert.match(said, /reading fixture past the stop/)
    assert.doesNotMatch(said, /NOTEST[^\n]*reading fixture past the stop|reading fixture past the stop[^\n]*NOTEST/, said)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('spec-verify matches a decoded title, and never a substring', () => {
  const dir = files({ 'a.test.mjs': HEAD + "test('reading \\'quoted\\' fixture', () => {\n  assert.ok(1)\n})\ntest('ghostly', () => {\n  assert.ok(1)\n})\n" })
  try {
    assert.equal(existsIn(dir, 'a.test.mjs', "reading 'quoted' fixture").ok, true, 'the title as the literal reads')
    assert.equal(existsIn(dir, 'a.test.mjs', 'ghost').ok, false, 'a substring of another title is not a test')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const bodyOf = (text, name, suffix = '.mjs') => withGate('adr-lint', `
status, body = mod.js_test_body(req["text"], req["name"], req["suffix"])
print(json.dumps({"status": status, "body": body}))
`, { text, name, suffix })

test('adr-lint reads a JavaScript test where its call is code, bounded as the lock bounds it', () => {
  const text = HEAD + `const SAME = "test('reading fixture real', () => { /* nothing */ })"\n` + REAL
  assert.deepEqual(bodyOf(text, 'reading fixture real'), { status: 'found', body: '{\n  assert.equal(1, 1)\n}' })
  assert.equal(bodyOf(HEAD + "test('it\\'s escaped', () => {\n  assert.ok(1)\n})\n", "it's escaped").status, 'found', 'the title is compared decoded')
  assert.equal(bodyOf(HEAD + REAL + STOP, 'reading fixture real').status, 'found', 'a complete body before a later stop is found')
})

test('adr-lint says UNPROVEN for a JavaScript test whose body it cannot bound', () => {
  assert.equal(bodyOf(HEAD + "test('reading fixture arrow', () => /assert/)\n", 'reading fixture arrow').status, 'unproven', 'a / left in an expression body')
  assert.equal(bodyOf(HEAD + "test('reading fixture cut', () => {\n  const n = {} / (2) / 3\n})\n", 'reading fixture cut').status, 'unproven', 'a stop inside the body')
})

// A record whose one task names tests by file; the task is `done` or `pending`, and either way
// it carries an exit-0 log row, so adr-lint checks its tests. Returns { said, status }.
function lint(map, { status = 'done', tests, enforcedBy = null, archive = false, strictFrom = null } = {}) {
  const base = archive ? 'docs/adr-archive' : 'docs/adr'
  const all = {
    ...map,
    [`${base}/ADR-001-probe.md`]: ['# ADR-001: Probe', '', '**Status:** Accepted', '**Spec:** None — no spec stage',
      ...(enforcedBy ? [`**Enforced-by:** \`${enforcedBy}\``] : []),
      '**Served-path change:** None — this decision changes no served path.', '', '## Existing Primitives Audit', '',
      'None.', '', '## Decision', '', 'Probe.', '', '## Alternatives Considered', '', '- Nothing — rejected.', '',
      '## Consequences', '', 'None.', '', '## Wiring & Contract Changes', '', 'None.', '', '## Out of Scope', '',
      '- Other (deferred: ADR-002)', ''].join('\n'),
    [`${base}/ADR-001-probe/tasks/README.md`]: `# Tasks\n\n| ID | Goal | Status | Depends-on | Notes |\n|----|------|--------|------------|-------|\n| T1 | probe | ${status} | | |\n`,
    [`${base}/ADR-001-probe/tasks/T1-probe.md`]: '# Task ADR-001-T1: probe\n\n## Tests\n\n| Test name | File | Verifies | Covers |\n|-----------|------|----------|--------|\n'
      + tests.map(([name, file]) => `| \`${name}\` | \`${file}\` | probe | — |\n`).join('')
      + '\n## Verification Log\n\n- 2026-10-01 · 0000000 · exit 0 · `true`\n',
  }
  if (archive) all['docs/adr-archive/README.md'] = '# Archive\n\n**Lifecycle:** Frozen historical ADR records\n\n| Record | Title |\n|---|---|\n| [ADR-001](ADR-001-probe.md) | Probe |\n'
  if (strictFrom) all['.quality-harness.json'] = JSON.stringify({ strictFrom }) + '\n'
  const dir = files(all)
  git(dir, 'init', '-q')
  git(dir, 'add', '-A')
  const run = spawnSync('python3', [join(bin, 'adr-lint'), join(dir, base, 'ADR-001-probe.md')],
    { cwd: dir, env: pyEnv, encoding: 'utf8', timeout: 60_000 })
  rmSync(dir, { recursive: true, force: true })
  return { said: `${run.stdout}\n${run.stderr}`, status: run.status }
}
const linesAbout = (said, name) => said.split('\n').filter(line => line.includes(name))
const blocking = lines => lines.some(line => !/^\s*advice:/.test(line))
const MISSING = /not found|no .*definition|carries that exact title/i

test('adr-lint does not find a JavaScript test that exists only inside a string', () => {
  assert.deepEqual(bodyOf(HEAD + STRING_ONLY + REAL, 'reading fixture in a string'), { status: 'missing', body: null })
  // Through the CLI, beside a control that is found.
  const { said } = lint({ 'tests/a.test.mjs': HEAD + STRING_ONLY + REAL },
    { tests: [['reading fixture in a string', 'tests/a.test.mjs'], ['reading fixture real', 'tests/a.test.mjs']] })
  assert.ok(linesAbout(said, 'reading fixture in a string').some(line => MISSING.test(line)), said)
  assert.ok(!linesAbout(said, 'reading fixture real').some(line => MISSING.test(line)), `the control is found: ${said}`)
})

test('adr-lint says UNPROVEN, and withholds done, for a JavaScript test it could not read to', () => {
  assert.equal(bodyOf(HEAD + STOP, 'reading fixture past the stop').status, 'unproven')
  for (const status of ['done', 'pending']) {
    const { said, status: code } = lint({ 'tests/a.test.mjs': HEAD + REAL + STOP, 'tests/b.test.mjs': HEAD + REAL }, {
      status,
      tests: [['reading fixture past the stop', 'tests/a.test.mjs'], ['reading fixture nowhere', 'tests/a.test.mjs'], ['reading fixture absent', 'tests/b.test.mjs']],
    })
    // The twin, in a file read to its end: a test nobody wrote is not found.
    assert.ok(linesAbout(said, 'reading fixture absent').some(line => MISSING.test(line)), `${status}: ${said}`)
    for (const name of ['reading fixture past the stop', 'reading fixture nowhere']) {
      const lines = linesAbout(said, name)
      assert.ok(lines.length && lines.every(line => /UNPROVEN/.test(line)), `${status}: ${name}: ${said}`)
      assert.ok(!lines.some(line => MISSING.test(line)), `${status}: never "not found": ${said}`)
      if (status === 'done') assert.ok(blocking(lines), `a done task is refused, not advised: ${said}`)
      else assert.ok(!blocking(lines), `a pending task is advised: ${said}`)
    }
    if (status === 'done') assert.notEqual(code, 0)
  }
})

test('UNPROVEN on a frozen record, or below strictFrom, is advice as a moved lock is', () => {
  const map = { 'tests/a.test.mjs': HEAD + REAL + STOP }
  const tests = [['reading fixture past the stop', 'tests/a.test.mjs']]
  for (const options of [{ archive: true }, { strictFrom: 'ADR-002' }]) {
    const { said } = lint(map, { tests, ...options })
    const lines = linesAbout(said, 'reading fixture past the stop')
    assert.ok(lines.length && lines.every(line => /UNPROVEN/.test(line)), `${JSON.stringify(options)}: ${said}`)
    assert.ok(!blocking(lines), `${JSON.stringify(options)}: advice, not a block: ${said}`)
  }
})

const canFail = (text, name) => withGate('adr-lint', `
status, can = mod.js_body_can_fail(req["text"], req["name"], ".mjs")
print(json.dumps({"status": status, "can": can}))
`, { text, name })

test('adr-lint judges a JavaScript body and its helpers on the code view', () => {
  assert.deepEqual(canFail(HEAD + TEMPLATE, 'reading fixture template'), { status: 'found', can: true }, 'an assertion inside ${} is code')
  assert.deepEqual(canFail(HEAD + REGEX, 'reading fixture regex'), { status: 'found', can: false }, 'a regex literal asserts nothing')
  assert.deepEqual(canFail(HEAD + HELPED, 'reading fixture helped'), { status: 'found', can: true }, 'a same-file helper that asserts')
  // Through the CLI on a done task: only the regex-only test asserts nothing.
  const { said } = lint({ 'tests/a.test.mjs': HEAD + TEMPLATE + REGEX + HELPED },
    { tests: [['reading fixture template', 'tests/a.test.mjs'], ['reading fixture regex', 'tests/a.test.mjs'], ['reading fixture helped', 'tests/a.test.mjs']] })
  const nothing = /assert|cannot fail|can fail/i
  assert.ok(linesAbout(said, 'reading fixture regex').some(line => nothing.test(line)), said)
  assert.ok(!linesAbout(said, 'reading fixture template').some(line => nothing.test(line)), `the template test can fail: ${said}`)
  assert.ok(!linesAbout(said, 'reading fixture helped').some(line => nothing.test(line)), `the helped test can fail: ${said}`)
})

// A spaced title is found on its call alone, so the existence check says nothing about its
// body; the can-fail check is where an unbounded one is said (ADR-079 T3 S2).
test('adr-lint says UNPROVEN for a spaced JavaScript title it found but whose body it cannot bound', () => {
  const map = { 'tests/a.test.mjs': HEAD + "test('reading fixture unbounded', () => /assert/)\n" + REAL }
  for (const status of ['done', 'pending']) {
    const { said } = lint(map, { status, tests: [['reading fixture unbounded', 'tests/a.test.mjs'], ['reading fixture real', 'tests/a.test.mjs']] })
    const lines = linesAbout(said, 'reading fixture unbounded')
    assert.ok(lines.length && lines.every(line => /UNPROVEN/.test(line)), `${status}: ${said}`)
    if (status === 'done') assert.ok(blocking(lines), `a done task is refused: ${said}`)
    else assert.ok(!blocking(lines), `a pending task is advised: ${said}`)
    assert.equal(linesAbout(said, 'reading fixture real').length, 0, `the bounded twin is silent: ${said}`)
  }
})

// Codex round on efd7cdf, finding 1: a row naming its own file skips the existence check, so
// the can-fail check is where an unbounded body there is said.
test('adr-lint says UNPROVEN for a test named by its own file whose body it cannot bound', () => {
  const { said } = lint({
    'tests/probe.mjs': HEAD + "test('probe', () => {\n  const n = {} / (2) / 3\n})\n",
    'tests/bounded.mjs': HEAD + "test('bounded', () => {\n  assert.ok(1)\n})\n",
  }, { tests: [['probe', 'tests/probe.mjs'], ['bounded', 'tests/bounded.mjs']] })
  const lines = linesAbout(said, '`probe`')
  assert.ok(lines.length && lines.every(line => /UNPROVEN/.test(line)), said)
  assert.ok(blocking(lines), `a done task is refused: ${said}`)
  assert.equal(linesAbout(said, '`bounded`').length, 0, `the bounded twin is silent: ${said}`)
})

// Finding 2: a helper is only a binding whose value is a function, bounded to that value.
test('adr-lint follows a helper only into its own function', () => {
  const alias = "const helper = () => {}\nconst checkIt = helper\nfunction unrelated() {\n  assert(false)\n}\n"
  assert.deepEqual(canFail(HEAD + alias + "test('reading fixture alias', () => {\n  checkIt()\n})\n", 'reading fixture alias'),
    { status: 'found', can: false }, 'an alias does not borrow the next function\'s assertion')
  const arrow = "const checkArrow = () => {\n  assert.ok(1)\n}\n"
  assert.deepEqual(canFail(HEAD + arrow + "test('reading fixture arrow helper', () => {\n  checkArrow()\n})\n", 'reading fixture arrow helper'),
    { status: 'found', can: true }, 'an arrow helper that asserts is followed')
})

// Finding 3: a comment between the title and its comma is not a reason to lose the test.
test('adr-lint finds a JavaScript test with a comment beside its title, and never one inside a comment', () => {
  assert.equal(bodyOf(HEAD + "test('reading fixture commented' /* why */, () => {\n  assert.ok(1)\n})\n", 'reading fixture commented').status, 'found')
  assert.equal(bodyOf(HEAD + "test(/* lead */ 'reading fixture led', () => {\n  assert.ok(1)\n})\n", 'reading fixture led').status, 'found')
  assert.equal(bodyOf(HEAD + "// test('reading fixture ghost', () => {})\n" + REAL, 'reading fixture ghost').status, 'missing')
})

test('an enforcement pointer to a JavaScript test is resolved on the lexer', () => {
  const map = { 'tests/a.test.mjs': HEAD + STRING_ONLY + REAL + STOP }
  const tests = [['reading fixture real', 'tests/a.test.mjs']]
  const pointing = name => lint(map, { tests, enforcedBy: `tests/a.test.mjs::${name}` }).said
  assert.ok(!/pointer to nothing|names nothing|not .*found/i.test(linesAbout(pointing('reading fixture real'), 'Enforced-by').join('\n')), 'a real test resolves')
  assert.match(linesAbout(pointing('reading fixture in a string'), 'Enforced-by').join('\n') || pointing('reading fixture in a string'), /reading fixture in a string/, 'a string-held test is a pointer to nothing')
  const stopped = pointing('reading fixture past the stop')
  assert.ok(linesAbout(stopped, 'reading fixture past the stop').some(line => /UNPROVEN/.test(line)), `past the stop it is UNPROVEN: ${stopped}`)
})

test('the other languages read as they did', () => {
  const dir = files({ 'test_a.py': 'def test_reading_fixture():\n    assert 1\n', 'a_test.go': 'package p\nimport "testing"\nfunc TestReadingFixture(t *testing.T) {}\n' })
  try {
    assert.equal(existsIn(dir, 'test_a.py', 'test_reading_fixture').ok, true)
    assert.equal(existsIn(dir, 'a_test.go', 'TestReadingFixture').ok, true)
    const php = withGate('adr-lint', `
body = mod.test_body(req["text"], req["name"])
print(json.dumps({"body": body if isinstance(body, str) or body is None else "NOT A STRING"}))
`, { text: "<?php\ntest('reading fixture pest', function () {\n    expect(1)->toBe(1);\n});\n", name: 'reading fixture pest' })
    assert.match(php.body ?? '', /expect\(1\)/, 'test_body still answers a string or None, never an UNPROVEN status')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
