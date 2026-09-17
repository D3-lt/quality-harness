import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(repoRoot, 'plugin')
const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-leftovers-053-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write(`[leftovers-after-adr053.test] could not remove ${testTmp}: ${error?.message ?? error}\n`)
  }
})

const { NODE_TEST_CONTEXT: _nested, ...envSansTestContext } = process.env
const pyEnv = {
  ...envSansTestContext,
  PYTHONPATH: path.join(pluginDir, 'lib'),
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
  PYTHONDONTWRITEBYTECODE: '1',
}

function python(src, input) {
  return spawnSync('python3', ['-c', src], {
    cwd: repoRoot,
    env: pyEnv,
    input,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

const GO_RAW_BACKSLASH = [
  'package p',
  '',
  'func TestA(t *testing.T) {',
  '    s := `dir\\`',
  '    // later `glob` and dir/*.go',
  '    x := 1',
  '}',
  '',
  'func TestB(t *testing.T) {',
  '    t.Fatal("x")',
  '}',
  '',
].join('\n')

test('a Go raw string ending in backslash still hashes later tests', () => {
  const src = `
import json, sys
from record import extract_test_body
text = sys.stdin.read()
print(json.dumps({
    "a": extract_test_body(text, "TestA", go=True) is not None,
    "b": extract_test_body(text, "TestB", go=True) is not None,
}))
`
  const run = python(src, GO_RAW_BACKSLASH)
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.a, true, 'TestA body must extract')
  assert.equal(got.b, true, 'TestB body must extract')
})

test('a Go raw string ending in backslash does not keep the hash after the assertion moves', () => {
  // Codex P1 2026-09-15: extract_test_body(..., go=True) finds TestA, but
  // snapshot_lock hashes via body_digest without go=, so `_strip_comments_keep_strings`
  // C-escapes the raw `dir\` and a later `// … dir/*.go` comment swallows t.Fatal.
  const fatal = [
    'package p',
    '',
    'func TestA(t *testing.T) {',
    '    s := `dir\\`',
    '    _ = s',
    '    // later ` and dir/*.go',
    '    t.Fatal("FAIL")',
    '}',
    '',
  ].join('\n')
  const src = `
import json, sys
from pathlib import Path
from record import extract_test_body, body_digest, snapshot_lock
fatal = sys.stdin.read()
log = fatal.replace('t.Fatal("FAIL")', 't.Log("PASS")')
body_f = extract_test_body(fatal, "TestA", go=True)
body_l = extract_test_body(log, "TestA", go=True)
root = Path(sys.argv[1])
(root / "a.go").write_text(fatal, encoding="utf-8")
snap_f = snapshot_lock(root, [("TestA", "a.go")])
(root / "a.go").write_text(log, encoding="utf-8")
snap_l = snapshot_lock(root, [("TestA", "a.go")])
key = ("a.go", "TestA")
print(json.dumps({
    "extracted": body_f is not None and body_l is not None,
    "digest_moved": body_digest(body_f, go=True) != body_digest(body_l, go=True),
    "lock_moved": key in snap_f["bodies"] and key in snap_l["bodies"]
        and snap_f["bodies"][key] != snap_l["bodies"][key],
    "unproven": len(snap_f["unproven"]) == 0,
}))
`
  const run = spawnSync('python3', ['-c', src, testTmp], {
    cwd: repoRoot,
    env: pyEnv,
    input: fatal,
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.extracted, true, 'TestA must extract under go=True')
  assert.equal(got.unproven, true, 'snapshot_lock must hash TestA')
  assert.equal(got.digest_moved, true, 'body_digest(go=True) must see t.Fatal vs t.Log')
  assert.equal(got.lock_moved, true, 'snapshot_lock of a .go file must see t.Fatal vs t.Log')
})

test('C-escaping Go backticks leaves later tests UNPROVEN; JS templates still escape', () => {
  // Failure sibling of F-1: a language-flagged Go raw fix must not turn the
  // shared quote loop into "backticks never C-escape". JS `dir\`` still closes
  // on the escaped backtick.
  const js = 'const s = `dir\\``;\nexpect(1)\n'
  const src = [
    'import json, sys',
    'from record import _mask_lock_noncode',
    'js = sys.stdin.read()',
    'masked = _mask_lock_noncode(js)',
    'print(json.dumps({"js_template_closed": masked.count("`") == 2 and "dir" not in masked, "expect_outside": "expect" in masked}))',
    '',
  ].join('\n')
  const run = python(src, js)
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.js_template_closed, true, 'JS template backtick-escape must still close the template')
  assert.equal(got.expect_outside, true, 'escaped backtick must not close the JS template early')
})

function canFail(source, name, filename) {
  const py = `
import importlib.machinery
import importlib.util
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
lint_path = Path(sys.argv[2])
source = sys.stdin.read()
name = sys.argv[3]
filename = sys.argv[4]
loader = importlib.machinery.SourceFileLoader("adr_lint", str(lint_path))
spec = importlib.util.spec_from_loader(loader.name, loader)
mod = importlib.util.module_from_spec(spec)
loader.exec_module(mod)

class Errs(list):
    def __init__(self):
        super().__init__()
        self.advice = []
    def advise(self, message):
        self.advice.append(message)

(root / filename).write_text(source, encoding="utf-8")
infos = {"T1": {"human": False, "tests": [(name, filename)], "path": Path("T1.md")}}
errors = Errs()
mod.check_tests_can_fail(infos, "| T1 | probe | done |", errors, root)
print(json.dumps({"block": list(errors), "advice": errors.advice}))
`
  const run = spawnSync('python3', ['-c', py, testTmp, path.join(pluginDir, 'bin/adr-lint'), name, filename], {
    encoding: 'utf8', timeout: 30_000, input: source, cwd: repoRoot, env: pyEnv,
  })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  return JSON.parse(run.stdout)
}

test('a PHP #expect comment is not a fail word', () => {
  const php = '<?php\nit("x", function () {\n    #expect a result here\n});\n'
  const verdict = canFail(php, 'x', 'ExpectCommentTest.php')
  assert.ok(verdict.block.length > 0, 'PHP #expect comment must not count as a fail call')
  assert.match(verdict.block.join('\n'), /calls nothing and asserts nothing/)
})

test('escaped same-quote BDD names are discovered and extracted', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
payload = json.loads(sys.stdin.read())

def pack(text, php=False):
    names = extract_test_names(text, php=php)
    probe = {
        name: extract_test_body(text, name, php=php) is not None
        for name in payload["probe"]
    }
    return {"names": names, "probe": probe}

print(json.dumps({key: pack(text, php=key == "php") for key, text in payload["src"].items()}))
`
  const run = python(py, JSON.stringify({
    src: {
      escaped: "test('today\\'s', () => { expect(1).toBe(1) })",
      control: 'test("today\'s", () => { expect(1).toBe(1) })',
      doubled: 'test("say \\"hi\\"", () => { expect(1).toBe(1) })',
      tick: 'test(`plain`, () => { expect(1).toBe(1) })',
      describe: "describe('x', () => { test('inner', () => { expect(1).toBe(1) }) })",
      php: "<?php\nit('today\\'s', function () { expect(true); });\n",
    },
    probe: ["today's", 'say "hi"', 'plain', 'inner', 'x'],
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.ok(got.escaped.names.includes("today's"), 'escaped same-quote name must be discovered')
  assert.equal(got.escaped.probe["today's"], true, 'escaped same-quote body must extract')
  assert.ok(got.control.names.includes("today's"), "opposite-quote today's remains the control")
  assert.equal(got.control.probe["today's"], true)
  assert.ok(got.doubled.names.includes('say "hi"'), 'escaped double-quote name must be discovered')
  assert.equal(got.doubled.probe['say "hi"'], true)
  assert.ok(got.tick.names.includes('plain'), 'non-interpolated backtick name must be discovered')
  assert.equal(got.tick.probe.plain, true)
  assert.ok(got.describe.names.includes('inner'))
  assert.equal(got.describe.probe.inner, true)
  assert.equal(got.describe.names.includes('x'), false, 'describe() is not a hashed test name')
  assert.equal(got.describe.probe.x, false)
  assert.ok(got.php.names.includes("today's"), 'Pest it() escaped same-quote must be discovered')
  assert.equal(got.php.probe["today's"], true)
})

test('interpolated BDD names stay undiscoverable', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
payload = json.loads(sys.stdin.read())
js_names = extract_test_names(payload["js"])
php_names = extract_test_names(payload["php"], php=True)
print(json.dumps({
    "js_names": js_names,
    "js_body": extract_test_body(payload["js"], payload["js_name"]) is not None,
    "php_names": php_names,
    "php_body": extract_test_body(payload["php"], payload["php_name"], php=True) is not None,
}))
`
  const run = python(py, JSON.stringify({
    js: 'test(`x${y}`, () => { expect(1).toBe(1) })',
    js_name: 'x${y}',
    php: '<?php\nit("hello $name", function () { expect(true); });\n',
    php_name: 'hello $name',
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.js_names.includes('x${y}'), false, 'interpolated template must stay undiscoverable')
  assert.equal(got.js_body, false)
  assert.equal(got.php_names.includes('hello $name'), false, 'PHP double-quoted interpolation must stay undiscoverable')
  assert.equal(got.php_body, false)
})

test('decoded lock delimiters in a BDD name stay unhashed', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
src = sys.stdin.read()
names = extract_test_names(src)
print(json.dumps({
    "names": names,
    "nl": extract_test_body(src, "a\\nb") is not None,
    "tab": extract_test_body(src, "a\\tb") is not None,
    "anchor": extract_test_body(src, "anchor") is not None,
}))
`
  const run = python(py, [
    "test('anchor', () => { expect(1).toBe(1) })",
    "test('a\\nb', () => { expect(2).toBe(2) })",
    "test('a\\tb', () => { expect(3).toBe(3) })",
  ].join('\n'))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.ok(got.names.includes('anchor'))
  assert.equal(got.anchor, true)
  assert.equal(got.names.includes('a\nb'), false, 'newline in a decoded name is not lock-serializable')
  assert.equal(got.nl, false)
  assert.equal(got.names.includes('a\tb'), false, 'tab in a decoded name is not lock-serializable')
  assert.equal(got.tab, false)
})

test('a BDD name may wrap after the opening paren', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
payload = json.loads(sys.stdin.read())
out = {}
for key, text in payload.items():
    php = key == "php"
    names = extract_test_names(text, php=php)
    out[key] = {
        "names": names,
        "body": extract_test_body(text, "plain", php=php) is not None,
    }
print(json.dumps(out))
`
  const run = python(py, JSON.stringify({
    wrap: "test(\n  'plain', () => { expect(1).toBe(1) })",
    comma: "test('plain'\n, () => { expect(1).toBe(1) })",
    php: "<?php\nit(\n  'plain', function () { expect(true); });\n",
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.ok(got.wrap.names.includes('plain'))
  assert.equal(got.wrap.body, true)
  assert.ok(got.comma.names.includes('plain'))
  assert.equal(got.comma.body, true)
  assert.ok(got.php.names.includes('plain'))
  assert.equal(got.php.body, true)
})

test('PHP double-quoted unknown escapes keep their backslash', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
src = json.loads(sys.stdin.read())["src"]
names = extract_test_names(src, php=True)
print(json.dumps({
    "names": names,
    "slash": extract_test_body(src, "C:\\\\data", php=True) is not None,
    "plain": extract_test_body(src, "C:data", php=True) is not None,
}))
`
  const run = python(py, JSON.stringify({
    src: '<?php\nit("C:\\data", function () { assert(1); });\nit("C:data", function () { assert(2); });\n',
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.ok(got.names.includes('C:\\data'), 'PHP unknown escape keeps the backslash')
  assert.ok(got.names.includes('C:data'))
  assert.equal(got.slash, true)
  assert.equal(got.plain, true)
})

test('JS control escapes do not collapse onto a shorter name', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
src = json.loads(sys.stdin.read())["src"]
names = extract_test_names(src)
print(json.dumps({
    "names": names,
    "backspace": extract_test_body(src, "a\\b") is not None,
    "plain": extract_test_body(src, "ab") is not None,
}))
`
  const run = python(py, JSON.stringify({
    src: 'test("a\\b", () => { expect(1); })\ntest("ab", () => { expect(2); })\n',
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.names.includes('ab'), true)
  assert.equal(got.plain, true)
  assert.equal(got.names.includes('a\b'), true, 'JS \\\\b is backspace, not the letter b')
  assert.equal(got.backspace, true)
})


test('JS NUL does not collapse onto a shorter name', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
src = json.loads(sys.stdin.read())["src"]
names = extract_test_names(src)
print(json.dumps({
    "names": names,
    "nul": extract_test_body(src, "a\\0") is not None,
    "plain": extract_test_body(src, "a0") is not None,
}))
`
  const run = python(py, JSON.stringify({
    src: 'test("a\\0", () => { expect(1); })\ntest("a0", () => { expect(2); })\n',
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.names.includes('a0'), true)
  assert.equal(got.plain, true)
  assert.equal(got.names.includes('a\0'), true, 'JS \\0 is NUL, not the digit 0')
  assert.equal(got.nul, true)
})

test('PHP double-quoted known control escapes do not collide with single-quoted unknown', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
src = json.loads(sys.stdin.read())["src"]
names = extract_test_names(src, php=True)
print(json.dumps({
    "names": names,
    "vt": extract_test_body(src, "say \\"hi\\"\\v", php=True) is not None,
    "lit": extract_test_body(src, "say \\"hi\\"\\\\v", php=True) is not None,
}))
`
  const run = python(py, JSON.stringify({
    src: '<?php\nit("say \\"hi\\"\\v", function () { assert(1); });\nit(\'say "hi"\\v\', function () { assert(2); });\n',
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.names.includes('say "hi"\v'), true)
  assert.equal(got.names.includes('say "hi"\\v'), true)
  assert.equal(got.vt, true)
  assert.equal(got.lit, true)
})

test('JS line continuation does not leave an escaped name UNPROVEN', () => {
  const py = `
import json, sys
from record import extract_test_names, extract_test_body
src = json.loads(sys.stdin.read())["src"]
names = extract_test_names(src)
print(json.dumps({
    "names": names,
    "body": extract_test_body(src, "hithere") is not None,
}))
`
  const run = python(py, JSON.stringify({
    src: 'test("hi\\\nthere", () => { expect(1); })\n',
  }))
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const got = JSON.parse(run.stdout)
  assert.equal(got.names.includes('hithere'), true)
  assert.equal(got.body, true)
})
