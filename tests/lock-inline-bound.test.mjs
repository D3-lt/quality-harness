// An inline `test-lock-b64:` payload is bound by its row's `test-lock-sha256:`, as a sidecar's raw bytes are (ADR-129): a
// payload that does not hash to the sha is a lock that could not be read (UNPROVEN), never the lock. Driven through
// record.py's shared reader in a repository this test creates (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [python, ...prefix] = pythonArgv()

const PROBE = String.raw`
import base64, importlib.util, json, os, subprocess, sys
spec = importlib.util.spec_from_file_location("record_probe", sys.argv[1])
record = importlib.util.module_from_spec(spec); spec.loader.exec_module(record)
root, case = sys.argv[2], sys.argv[3]
subprocess.run(["git", "-C", root, "init", "-q"], check=True, capture_output=True)
os.makedirs(os.path.join(root, "tests"))
with open(os.path.join(root, "tests", "a.test.mjs"), "w") as f:
    f.write("import test from 'node:test'\ntest('x', () => { return 1 })\n")
snap = {"check": None, "bodies": {("tests/a.test.mjs", "x"): "0" * 64}, "unproven": set(), "hasher": 1}
digest, token = record.encode_lock(snap)
forged = dict(snap, bodies={("tests/a.test.mjs", "x"): "1" * 64})
if case == "forged":
    token = record.encode_lock(forged)[1]
command = "node --test"
if case == "command":
    # A command whose text holds lock fields of its own, before the row's real, trailing ones.
    command = f"node --test # test-lock-b64:{record.encode_lock(forged)[1]} · test-lock-file:nowhere.lock"
row = (f"- 2026-10-27 · abcdef0 · exit 1 · ` + "`{command}`" + String.raw` · acceptance-sha256:{'a' * 64} · ms:1"
       f" · test-lock-sha256:{digest} · test-lock-b64:{token}")
_date, read = record._recorded_lock([row], record.object_format(root), root=root)
blocks, _advice = record.lock_findings([row], root=root, tests=[("x", "tests/a.test.mjs")])
print(json.dumps({"read": read is not None and read.get("map") is not None, "problem": read and read.get("problem"), "blocks": blocks}))
`
function reads(t, which) {
  const dir = mkdtempSync(join(tmpdir(), `qh-lock-inline-${which}-`))
  t.after(() => remove(dir))
  const run = spawnSync(python, [...prefix, '-c', PROBE, join(repoRoot, 'plugin', 'lib', 'record.py'), dir, which],
    { encoding: 'utf8', timeout: 60_000, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('an inline lock payload that does not hash to its row is UNPROVEN, and one that does is read', t => {
  const forged = reads(t, 'forged')
  assert.equal(forged.read, false, 'a payload another snapshot wrote is not this row\'s lock')
  assert.match(forged.problem, /does not hash to the row's test-lock-sha256/)
  assert.ok(forged.blocks.some(line => /could not be read: its inline payload does not hash.*UNPROVEN/.test(line)), JSON.stringify(forged.blocks))
  // Clean twin: the payload the sha was taken over.
  const same = reads(t, 'same')
  assert.equal(same.read, true)
  assert.equal(same.problem, null)
})

test('the lock fields are read from the end of the row, not from the recorded command', t => {
  const said = reads(t, 'command')
  assert.equal(said.read, true, `a command holding lock text is not the lock: ${said.problem}`)
  assert.equal(said.problem, null)
})
