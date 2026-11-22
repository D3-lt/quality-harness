import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'

test('implemented verification uses one root and stack for existence and execution', () => {
  const gate = fileURLToPath(new URL('../plugin/bin/spec-verify', import.meta.url))
  const probe = `
import runpy, sys
from pathlib import Path
from unittest.mock import Mock, patch
check = runpy.run_path(sys.argv[1])["check_spec"]
root = Mock(return_value=Path("project"))
stack = Mock(return_value="pytest")
exists = Mock(return_value=(True, ""))
runs = Mock(return_value=("pass", ""))
text = "## Facts\\n| F-1 | claim | tests/t.py::test_x | @implemented |\\n"
with patch.object(Path, "read_text", return_value=text), patch.dict(check.__globals__, {
    "repo_root": root, "detect_stack": stack, "test_exists": exists, "test_runs": runs,
}):
    check("spec.md", "implemented", None, False)
root.assert_called_once()
stack.assert_called_once_with(root.return_value)
exists.assert_called_once_with("tests/t.py::test_x", root.return_value, stack.return_value, False)
runs.assert_called_once_with("tests/t.py::test_x", root.return_value, stack.return_value, None)
`
  const result = runPython(['-B', '-c', probe, gate], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
})
