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
  const run = runLeftoverStress({ QH_ADR053_STRESS_MUTANTS: '1' })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
})
