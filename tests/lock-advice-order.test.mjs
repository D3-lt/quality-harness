// BACKLOG §450: an outside run of v3.8.64 on Windows saw adr-lint print the same advice lines in a different order on two
// identical runs. lock_findings (plugin/lib/record.py) iterated a set of (file, test) names, whose order follows the
// process's hash seed. The lock here has eight names the first red could not hash and no hashed bodies, the shape that
// corpus had; its readers are stubbed so only the loop's order is measured. Run under several seeds, the advice must be one
// list, in sorted order.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// QH_LOCK_ORDER_ROOT points both checks at another checkout's plugin, which is how they were shown red on the unfixed tree.
const plugin = process.env.QH_LOCK_ORDER_ROOT ? path.join(process.env.QH_LOCK_ORDER_ROOT, 'plugin') : path.join(repoRoot, 'plugin')
const lib = path.join(plugin, 'lib')
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

// The same, through adr-lint, the call the outside run made (CLAUDE.md §4): the js-vitest-spa corpus in a scratch repository,
// its done T1 given eight tests and a first-red lock record.py's own encoder mints with no hashed bodies and those eight names
// unproven, the shape the outside corpus had. Every name hashes today, so each is an advice line.
test('adr-lint gives a lock\'s unhashable-name advice in one order whatever the hash seed', t => {
  const repo = mkdtempSync(path.join(tmpdir(), 'qh-lock-order-'))
  t.after(() => remove(repo))
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'js-vitest-spa'), repo, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: repo, timeout: 30_000, windowsHide: true })
  const names = Array.from({ length: 8 }, (_, n) => `item_case_${n}`)
  writeFileSync(path.join(repo, 'src', 'cart.test.ts'), ["import { describe, expect, it } from 'vitest'", "import { addItem } from './cart'", '',
    "describe('cart', () => {", ...names.map(name => `  it('${name}', () => {\n    expect(addItem({ items: [] }, '${name}').items).toEqual(['${name}'])\n  })`), '})', ''].join('\n'))
  const record = path.join('docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer.md')
  const task = path.join(repo, 'docs', 'adr', 'ADR-001-the-cart-is-a-pure-reducer', 'tasks', 'T1-add-and-remove-items.md')
  const rows = names.map(name => `| \`${name}\` | \`src/cart.test.ts\` | the cart grows | none |`).join('\n')
  const text = readFileSync(task, 'utf8').replace(/^\| `adds_an_item` .*\n\| `removes_an_item` .*\n/m, `${rows}\n`)
  assert.ok(text.includes('item_case_7'), 'the Tests table names the eight tests')
  const minted = spawnSync('python3', ['-c', [
    'import sys', 'sys.path.insert(0, sys.argv[1])', 'import record',
    'names = sys.argv[2].split(",")',
    'digest, token = record.encode_lock({"check": None, "bodies": {}, "unproven": {("src/cart.test.ts", n) for n in names}, "hasher": 1})',
    'print(f"· test-lock-sha256:{digest} · test-lock-b64:{token}")',
  ].join('\n'), lib, names.join(',')], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(minted.status, 0, minted.stderr)
  writeFileSync(task, `${text}${text.endsWith('\n') ? '' : '\n'}- 2026-09-20 · no-git · exit 1 · \`grep -q item_case_0 src/cart.test.ts\` · ms:3 ${minted.stdout.trim()}\n`)
  const runs = ['0', '1', '2', '3', '4', '5'].map(seed => {
    const ran = spawnSync('python3', [path.join(plugin, 'bin', 'adr-lint'), path.join(repo, record)], {
      cwd: repo, encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONHASHSEED: seed },
    })
    return ran.stdout.split('\n').filter(line => line.includes('could not be hashed at first red'))
  })
  assert.equal(runs[0].length, 8, `eight advice lines:\n${runs[0].join('\n')}`)
  for (const run of runs) assert.deepEqual(run, runs[0], 'adr-lint\'s advice order changed with the hash seed')
})
