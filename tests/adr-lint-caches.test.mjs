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
  assert.equal(flagless, false, 'the language flags are part of what is kept: a Python comment is code to the default reading')
  assert.equal(noBytecode, true, 'the probe writes no bytecode beside the gate')
})
