import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(repoRoot, 'plugin')
const testTmp = realpathSync(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-swift-expect-')))
after(() => {
  try { rmSync(testTmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
  catch (error) {
    process.stderr.write(`[swift-expect.test] could not remove ${testTmp}: ${error?.message ?? error}\n`)
  }
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
    encoding: 'utf8', timeout: 30_000, input: source, cwd: repoRoot,
  })
  assert.equal(run.status, 0, run.stderr || run.stdout)
  return JSON.parse(run.stdout)
}

test('Swift #expect is a failure call so an expect-only test is not dead', () => {
  const expectOnly = 'import Testing\n@Test func expectOnly() {\n  #expect(2 == 2)\n}\n'
  const expectVerdict = canFail(expectOnly, 'expectOnly', 'ExpectOnlyTests.swift')
  assert.deepEqual(expectVerdict.block, [], expectVerdict)

  const requireOnly = 'import Testing\n@Test func requireOnly() {\n  #require(true)\n}\n'
  const requireVerdict = canFail(requireOnly, 'requireOnly', 'RequireOnlyTests.swift')
  assert.deepEqual(requireVerdict.block, [], requireVerdict)

  const dead = '@Test func deadBody() {\n}\n'
  const deadVerdict = canFail(dead, 'deadBody', 'DeadTests.swift')
  assert.ok(deadVerdict.block.length > 0, 'an empty Swift body must still block, or the expect-only silence is vacuous')
  assert.match(deadVerdict.block.join('\n'), /calls nothing and asserts nothing/)
})
