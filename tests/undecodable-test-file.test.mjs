// BACKLOG §350 item 6 (js-spa-windows, 3.8.6): a test file saved as UTF-16 was read with
// `errors="replace"`, so a JavaScript-family file got "the lexer could not read the file as far as
// the test … rewrite the construct it stopped at", which blames syntax for an encoding, and a
// Python or Go file got its test reported MISSING, an absence nobody observed (CLAUDE.md §3).
// Every gate that judges a test file now reads it strictly: a file that is not UTF-8 text is
// UNPROVEN, and says that it is the encoding.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { gate as python } from './load-gate.mjs'

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-undecodable-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const utf16 = text => Buffer.from(`﻿${text}`, 'utf16le')

const LINT = [
  'lint = load("adr-lint")',
  'root = Path(sys.argv[2])',
  'out = {}',
  'for name, rel in (("test_adds", "tests/test_cart.py"), ("adds_an_item", "src/cart.test.ts"), ("adds an item", "src/cart.test.ts")):',
  '    infos = {"T1": {"path": root / "T1.md", "tests": [(name, rel)],',
  '                    "vlog": ["- 2026-08-29 · abc1234 · exit 0 · `pytest` · acceptance-sha256:" + "0" * 64]}}',
  '    errs = lint.Findings()',
  '    lint.check_tests_exist(infos, "| T1 | x | done |", errs, root)',
  '    out[name] = [str(e) for e in list(errs) + list(errs.advice)]',
  'print(json.dumps(out))',
].join('\n')

test('adr-lint reads a test file that is not UTF-8 as UNPROVEN, naming the encoding, never missing', () => {
  const root = path.join(scratch, 'lint')
  mkdirSync(path.join(root, 'tests'), { recursive: true })
  mkdirSync(path.join(root, 'src'), { recursive: true })
  const py = 'def test_adds():\n    assert 1 + 1 == 2\n'
  const ts = "import { it, expect } from 'vitest'\nit('adds_an_item', () => { expect(1).toBe(1) })\nit('adds an item', () => { expect(1).toBe(1) })\n"
  writeFileSync(path.join(root, 'tests', 'test_cart.py'), utf16(py))
  writeFileSync(path.join(root, 'src', 'cart.test.ts'), utf16(ts))
  const found = python(LINT, root)
  for (const [name, findings] of Object.entries(found)) {
    assert.ok(findings.some(f => /is not UTF-8 text, so it could not be read at all/.test(f)), `${name}: ${findings.join(' | ')}`)
    assert.ok(!findings.some(f => /rewrite the construct it stopped at|no executable definition|no `it`\/`test`/.test(f)), `${name}: ${findings.join(' | ')}`)
  }
  // The control: the same files as UTF-8 draw no finding at all.
  writeFileSync(path.join(root, 'tests', 'test_cart.py'), py)
  writeFileSync(path.join(root, 'src', 'cart.test.ts'), ts)
  for (const [name, findings] of Object.entries(python(LINT, root))) assert.deepEqual(findings, [], name)
})

test('spec-verify cannot check a binding into a test file that is not UTF-8, and says why', () => {
  const root = path.join(scratch, 'spec')
  mkdirSync(path.join(root, 'tests'), { recursive: true })
  writeFileSync(path.join(root, 'tests', 'test_cart.py'), utf16('def test_adds():\n    assert True\n'))
  const [ok, why] = python('spec = load("spec-verify")\nprint(json.dumps(spec.test_definition_exists(Path(sys.argv[2]), "test_adds", None)))',
    path.join(root, 'tests', 'test_cart.py'))
  assert.equal(ok, null, why)
  assert.match(why, /not UTF-8 text/)
  writeFileSync(path.join(root, 'tests', 'test_cart.py'), 'def test_adds():\n    assert True\n')
  assert.equal(python('spec = load("spec-verify")\nprint(json.dumps(spec.test_definition_exists(Path(sys.argv[2]), "test_adds", None)))',
    path.join(root, 'tests', 'test_cart.py'))[0], true)
})

test("adr-verify's syntax check parses a UTF-16 JSON file as JSON, not as replacement characters", () => {
  const file = path.join(scratch, 'data.json')
  writeFileSync(file, utf16('{"a": 1}\n'))
  const [ok, detail] = python('verify = load("adr-verify")\nprint(json.dumps(verify.syntax_ok(Path(sys.argv[2]))))', file)
  assert.equal(ok, true, detail)
  writeFileSync(file, utf16('{"a": \n'))
  assert.equal(python('verify = load("adr-verify")\nprint(json.dumps(verify.syntax_ok(Path(sys.argv[2]))))', file)[0], false)
})

test('spec-verify searching a Rust crate says could-not-check when the only candidate is not UTF-8', () => {
  const root = path.join(scratch, 'cargo')
  mkdirSync(path.join(root, 'src'), { recursive: true })
  writeFileSync(path.join(root, 'src', 'lib.rs'), utf16('#[test]\nfn adds() { assert!(true) }\n'))
  const script = 'spec = load("spec-verify")\nprint(json.dumps(spec.test_exists("adds", Path(sys.argv[2]), "cargo", False)))'
  const [ok, why] = python(script, root)
  assert.equal(ok, null, why)
  assert.match(why, /not UTF-8 text/)
  writeFileSync(path.join(root, 'src', 'lib.rs'), '#[test]\nfn adds() { assert!(true) }\n')
  assert.equal(python(script, root)[0], true)
})
