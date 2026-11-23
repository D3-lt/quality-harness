// adr-lint keeps `code_only` by its arguments for the run (PR #27): test_body and check_tests_can_fail ask it for the
// same whole file once per test name in it. It is a function of text and three flags, so the second ask is the first.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lint = join(repoRoot, 'plugin', 'bin', 'adr-lint')
const [python, ...prefix] = pythonArgv()
const UTF8 = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }

// `-B`: the gate is loaded from the checkout, and no bytecode is left beside a shipped gate.
const probe = String.raw`
import importlib.machinery, importlib.util, json, sys
loader = importlib.machinery.SourceFileLoader("adr_lint_caches_probe", sys.argv[1])
m = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
sys.modules[loader.name] = m
loader.exec_module(m)
text = 'x = 1  # a comment\ny = "a string"\n'
first = m.code_only(text, python=True)
again = m.code_only(text, python=True)
other = m.code_only(text)
info = m.code_only.cache_info()
print(json.dumps([first == again, "comment" in first, info.hits, info.misses, other == first, sys.dont_write_bytecode]))
`

test('code_only gives the same text for the same arguments, and scans it once', () => {
  const run = spawnSync(python, [...prefix, '-B', '-c', probe, lint], { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
  const [same, kept, hits, misses, flagless, noBytecode] = JSON.parse(run.stdout)
  assert.deepEqual([same, kept, hits, misses], [true, false, 1, 2], 'one scan per distinct arguments, the second ask answered from the first')
  assert.equal(flagless, false, 'the language flags are part of what is kept: this text reads differently with and without python')
  assert.equal(noBytecode, true, 'the probe writes no bytecode beside the gate')
})

test('Python lock readers share one parse per source and preserve the first body of duplicate names', () => {
  const source = String.raw`
import ast, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import record
source = "class A:\r\n    async def test_x(self):\r\n        return 1\r\nclass B:\r\n    def test_x(self):\r\n        return 2\r\ndef helper():\r\n    return 0\r\n"
with patch.object(ast, "parse", wraps=ast.parse) as parse:
    names = record.extract_test_names(source, python=True)
    assert names == ["test_x", "test_x"]
    names.clear()
    assert record.extract_test_names(source, python=True) == ["test_x", "test_x"]
    assert record.extract_test_body(source, "helper", python=True) == "    return 0\r\n"
    assert record.extract_test_body(source, "test_x", python=True) == "        return 1\r\n"
    def digests(text):
        return dict(record._file_lock_digests(text, True, False, False, False, False, False, 1, False))
    assert digests(source) == {"test_x": record.body_digest("        return 1\r\n", python=True)}
    assert digests(source.replace("return 1", "return 3")) != digests(source)
    assert record.extract_test_names("async def(", python=True) == []
    assert record.extract_test_body("async def(", "missing", python=True) is None
    assert parse.call_count == 3, parse.call_count
`
  const run = spawnSync(python, [...prefix, '-B', '-c', source, join(repoRoot, 'plugin', 'lib')], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
})

test('section readers share a document scan and callers keep their own editable lines', () => {
  const source = String.raw`
import sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import record
text = "## Acceptance\nfirst\n## Verification Log\nsecond\n"
with patch.object(record, "split_lines", wraps=record.split_lines) as scan:
    for doc in [text, text.replace("first", "third")]:
        sections = record.sections_of(doc)
        sections["Acceptance"].clear()
        assert record.sections_of(doc)["Acceptance"] == [doc.splitlines()[1]]
        assert record.section_span(doc, "Acceptance") == (0, 14, 20)
        assert record.unterminated_fence(doc) is None
    assert scan.call_count == 2, scan.call_count
`
  const run = spawnSync(python, [...prefix, '-B', '-c', source, join(repoRoot, 'plugin', 'lib')], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
})
