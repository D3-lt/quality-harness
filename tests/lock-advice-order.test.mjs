// BACKLOG §450: an outside run of v3.8.64 on Windows saw adr-lint print the same advice lines in a different order on two
// identical runs. lock_findings (plugin/lib/record.py) iterated a set of (file, test) names, whose order follows the
// process's hash seed. The lock here has eight names the first red could not hash and no hashed bodies, the shape that
// corpus had; its readers are stubbed so only the loop's order is measured. Run under several seeds, the advice must be one
// list, in sorted order. QH_LOCK_ORDER_LIB points the same check at another tree, which is how it was shown red on the
// unfixed one.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const lib = process.env.QH_LOCK_ORDER_LIB ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'lib')
const script = `
import sys
sys.path.insert(0, sys.argv[1])
import record
names = [(f"tests/t{n}.py", f"test_{n}") for n in range(8)]
record.object_format = lambda root: "sha1"
record._recorded_lock = lambda vlog, fmt, root=None: ("2026-11-02", {"map": {"hasher": 1, "bodies": {}, "unproven": set(names)}, "digest": "0" * 64})
record.snapshot_lock = lambda root, tests, hasher=1: {"bodies": {name: "x" for name in names}, "unproven": set(), "check": None}
blocks, advice = record.lock_findings("", root=".", tests=[], label="T1")
print("\\n".join(line for line in map(str, advice) if "could not be hashed" in line))
`

test('lock advice comes out in one order whatever the hash seed', () => {
  const runs = ['0', '1', '2', '3', '4', '5'].map(seed => {
    const ran = spawnSync('python3', ['-c', script, lib], {
      encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONHASHSEED: seed },
    })
    assert.equal(ran.status, 0, ran.stderr)
    return ran.stdout.trim().split('\n')
  })
  assert.equal(runs[0].length, 8, `eight advice lines: ${runs[0].join('\n')}`)
  for (const run of runs) assert.deepEqual(run, runs[0], 'the advice order changed with the hash seed')
  assert.deepEqual(runs[0], [...runs[0]].sort(), 'the advice is in sorted order')
})
