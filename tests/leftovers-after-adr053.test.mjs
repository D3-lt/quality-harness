import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { publishPrecededByValidation } from '../plugin/scripts/lifecycle.mjs'

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

test('sudo -n after a check still strips', () => {
  assert.equal(publishPrecededByValidation('pnpm check && sudo -n git commit -m x'), true)
  assert.equal(publishPrecededByValidation('pnpm check && sudo -n -u ci git commit -m x'), true)
  assert.equal(publishPrecededByValidation('pnpm check && env FOO=bar git push'), true)
  assert.equal(publishPrecededByValidation('pnpm check && env -u HOME FOO=bar git push'), true)
  assert.equal(publishPrecededByValidation('pnpm check && command -- git commit -m x'), true)
  assert.equal(publishPrecededByValidation('pnpm check && time -p git commit -m x'), true)
  assert.equal(publishPrecededByValidation('pnpm check && sudo git commit -m x'), true)
})

test('command -v is not a publish; loud joiners still advise', () => {
  assert.equal(publishPrecededByValidation('pnpm check && command -v git commit -m x'), false)
  assert.equal(publishPrecededByValidation('pnpm check && command -v git commit -m x && git push'), false)
  assert.equal(publishPrecededByValidation('pnpm check && nice git commit -m x'), false)
  assert.equal(publishPrecededByValidation('pnpm check || git commit -m x'), false)
  // Codex P1 2026-09-15: wrapper \\S+ swallowed attached || / ; so these stripped.
  assert.equal(publishPrecededByValidation('pnpm check && env FOO=bar|| git push'), false)
  assert.equal(publishPrecededByValidation('pnpm check && env FOO=bar; git push'), false)
  assert.equal(publishPrecededByValidation('pnpm check && sudo -u ci|| git push'), false)
  assert.equal(publishPrecededByValidation('pnpm check && env -u HOME|| git push'), false)
})

const stressPath = path.join(repoRoot, 'tests', 'adr053-stress.mjs')

function runLeftoverStress(extraEnv = {}) {
  return spawnSync(process.execPath, [stressPath], {
    cwd: repoRoot,
    env: {
      ...envSansTestContext,
      QH_ADR053_STRESS_ITERS: '8',
      QH_ADR053_STRESS_MUTANTS: '0',
      ...extraEnv,
    },
    encoding: 'utf8',
    timeout: 120_000,
  })
}

test('unmutated leftover stress is green and leftover pools are generable', () => {
  const src = readFileSync(stressPath, 'utf8')
  assert.match(src, /sudo -n/, 'pool must include wrapper-with-args')
  assert.match(src, /raw string whose last content byte/, 'pool must include Go raw \\')
  assert.match(src, /#expect a result here/, 'pool must include PHP #expect comment')
  assert.match(src, /command -v/, 'pool must include command -v as non-invocation')
  assert.match(src, /\.swift|#expect\(/, 'pool must include Swift #expect keep')
  assert.match(src, /FOO=bar\|\|/, 'pool must include attached || after an assignment')
  const run = runLeftoverStress()
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
})

test("a mutant that restores today's holes survives only if the suite is blind", () => {
  const src = readFileSync(stressPath, 'utf8')
  const leftoverSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const namesRun = python(
    'import json, sys\nfrom record import extract_test_names\nprint(json.dumps(extract_test_names(sys.stdin.read())))',
    leftoverSrc)
  assert.equal(namesRun.status, 0, namesRun.stderr)
  assert.ok(
    JSON.parse(namesRun.stdout).includes(
      "a mutant that restores today's holes survives only if the suite is blind"),
    'hasher must discover a double-quoted BDD name that contains an apostrophe')
  assert.doesNotMatch(src, /\[\\\\s\\\\S\]\*/, 'wrapper mutant FROM must not be the retired suffix')
  assert.match(src, /HAND_MUTANTS/, 'driver must prove itself with hand mutants')
  assert.match(src, /end \+= 2|go=True/, 'a leftover mutant re-enables Go backtick C-escape')
  assert.match(src, /sudo -n|wrapper-arg/, 'a leftover mutant drops wrapper-arg stripping')
  assert.match(src, /#expect a result here|PHP #expect/, 'a leftover mutant keeps #expect on PHP')
  assert.match(src, /go and quote/, 'a leftover mutant re-enables digest C-escape inside Go backticks')
  const run = runLeftoverStress({ QH_ADR053_STRESS_MUTANTS: '1' })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
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

test('quoted semicolon and pipe in a git operand still strip', () => {
  assert.equal(publishPrecededByValidation('pnpm check && git commit -m "x;y"'), true)
  assert.equal(publishPrecededByValidation("pnpm check && git commit -m 'x|y'"), true)
  assert.equal(publishPrecededByValidation('pnpm check && git commit -m "fix && more"'), true)
  assert.equal(publishPrecededByValidation('pnpm check && env FOO=bar git push'), true)
  assert.equal(publishPrecededByValidation('pnpm check && env FOO=bar|| git push'), false)
  const src = readFileSync(stressPath, 'utf8')
  assert.ok(src.includes('x;y'), 'stress pool must include a quoted semicolon operand')
  assert.ok(src.includes("[^'\\n]+") || src.includes("[^|;\\n]*"),
    'HAND_MUTANT restores the retired quote-blind class')
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

test('an apostrophe in a trailing comment does not hide a later loud joiner', () => {
  assert.equal(publishPrecededByValidation('pnpm check && git commit -m x # note'), true)
  assert.equal(publishPrecededByValidation("pnpm check && git commit -m x # don't forget"), true)
  assert.equal(
    publishPrecededByValidation("pnpm check && git commit -m x # don't forget\nfalse || git push"),
    false)
  assert.equal(publishPrecededByValidation('pnpm check && git commit -m "x;y"'), true)
})

