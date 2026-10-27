// ADR-129 T1: a Verification Log row may carry its test lock as `test-lock-file:<repository-relative path>` beside its
// `test-lock-sha256:`, and every gate reads it through record.py's one lock reading. The file's raw bytes must hash to the
// row's sha; anything that cannot be shown is a lock that could not be read (UNPROVEN, done withheld). Driven through
// record.py's shared reader (`_recorded_lock`, `lock_findings`), in a repository this test creates (CLAUDE.md §9).
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
const UTF8 = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }

// One Python run per case: build the repository, the lock, the rows, and print what the reader says, as JSON.
const PROBE = String.raw`
import base64, hashlib, importlib.util, json, os, subprocess, sys
spec = importlib.util.spec_from_file_location("record_probe", sys.argv[1])
record = importlib.util.module_from_spec(spec); spec.loader.exec_module(record)
root, case = sys.argv[2], sys.argv[3]
git = lambda *a: subprocess.run(["git", "-C", root, *a], check=True, capture_output=True)
git("init", "-q")
os.makedirs(os.path.join(root, "tests"))
with open(os.path.join(root, "tests", "a.test.mjs"), "w") as f:
    f.write("import test from 'node:test'\ntest('x', () => { return 1 })\n")
snap = {"check": None, "bodies": {("tests/a.test.mjs", "x"): "0" * 64}, "unproven": set(), "hasher": 1}
digest, token = record.encode_lock(snap)
payload = base64.urlsafe_b64decode(token + "=" * ((4 - len(token) % 4) % 4))
rel = f"docs/adr/locks/{digest}.lock"
row = lambda exit, lock, kind="": (f"- 2026-10-27 · abcdef0 · exit {exit} · ` + "`node --test`" + String.raw` · acceptance-sha256:{'a' * 64} · ms:1"
                                   f" · test-lock-sha256:{digest} · {lock}" + (f" · test-lock-kind:{kind}" if kind else ""))
inline, sidecar = f"test-lock-b64:{token}", f"test-lock-file:{rel}"
def put(data, add=True):
    path = os.path.join(root, rel); os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f: f.write(data)
    if add: git("add", rel)
lock_row = row(1, sidecar)
if case == "same":
    put(payload)
elif case == "missing":
    pass
elif case == "untracked":
    put(payload, add=False)
elif case == "ignored":
    with open(os.path.join(root, ".gitignore"), "w") as f: f.write("docs/adr/locks/\n")
    put(payload, add=False)
elif case == "altered":
    put(payload.replace(b"\n", b"\r\n") if b"\n" in payload else payload + b"\r\n")
elif case == "outside":
    lock_row = row(1, f"test-lock-file:../{digest}.lock")
elif case == "rawpercent":
    rel = f"design%20records/locks/{digest}.lock"
    put(payload)
    lock_row = row(1, f"test-lock-file:{rel}")
elif case == "symlink":
    outside = os.path.join(os.path.dirname(root), f"outside-{digest[:8]}.lock")
    with open(outside, "wb") as f: f.write(payload)
    path = os.path.join(root, rel); os.makedirs(os.path.dirname(path), exist_ok=True)
    os.symlink(outside, path); git("add", rel)
elif case == "relock":
    put(payload)
vlog = [lock_row]
if case == "relock":
    vlog.append(row(0, inline, "relock"))
_date, read = record._recorded_lock(vlog, record.object_format(root), root=root)
_date, twin = record._recorded_lock([row(1, inline)], record.object_format(root), root=root)
blocks, advice = record.lock_findings(vlog, root=root, tests=[("x", "tests/a.test.mjs")])
print(json.dumps({"same": read is not None and read.get("map") == twin.get("map") and read.get("map") is not None,
                  "unread": read is None or read.get("map") is None, "first_check": read and read.get("first_check"),
                  "twin_check": twin["map"]["check"], "blocks": blocks, "advice": advice}, default=str))
`
function reads(t, which) {
  const dir = mkdtempSync(join(tmpdir(), `qh-lock-sidecar-${which}-`))
  t.after(() => remove(dir))
  const run = spawnSync(python, [...prefix, '-c', PROBE, join(repoRoot, 'plugin', 'lib', 'record.py'), dir, which],
    { encoding: 'utf8', timeout: 60_000, env: UTF8 })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

test('a sidecar lock reads as its inline twin, and names a moved test', t => {
  const same = reads(t, 'same')
  assert.equal(reads(t, 'rawpercent').same, true, 'a raw path holding a literal % is still read')
  assert.equal(same.same, true, 'the sidecar map is the inline map')
  assert.ok(same.blocks.some(line => /locked test `tests\/a\.test\.mjs`::x hash moved/.test(line)), JSON.stringify(same.blocks))
})

test('a sidecar that is missing, ignored, outside, altered or unreadable is UNPROVEN, and an untracked one is read', t => {
  for (const which of ['missing', 'ignored', 'outside', 'altered', ...(process.platform === 'win32' ? [] : ['symlink'])]) {
    const said = reads(t, which)
    assert.equal(said.unread, true, `${which}: read as a lock`)
    assert.ok(said.blocks.some(line => /UNPROVEN/.test(line)), `${which}: ${JSON.stringify(said.blocks)}`)
  }
  const untracked = reads(t, 'untracked')
  assert.equal(untracked.same, true, 'an untracked sidecar is read')
  assert.ok(untracked.advice.some(line => /commit/i.test(line)), `and advised: ${JSON.stringify(untracked.advice)}`)
})

test('a relock after a sidecar first red keeps its check', t => {
  const said = reads(t, 'relock')
  assert.equal(said.first_check, said.twin_check, 'first_check comes from the sidecar first red')
})
