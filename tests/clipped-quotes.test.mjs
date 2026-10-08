// BACKLOG §355: the gates cut a quoted line with `[:N]` and printed what was left as if it were whole,
// and two Verification Log sentences appended `…` to a row short enough to print whole. A quote a
// finding cuts says so, and one it did not cut does not: `record.clipped` is that rule, and every
// gate in plugin/bin reaches it rather than slicing inside the sentence it prints.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('a quote cut to its width says it was cut, and one that fits is printed whole', () => {
  const probe = 'import json, sys; sys.path.insert(0, sys.argv[1]); from record import clipped; '
    + 'print(json.dumps([clipped("abcdef", 6), clipped("abcdefg", 6), clipped("", 6)]))'
  const run = spawnSync('python3', ['-c', probe, join(repoRoot, 'plugin', 'lib')],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(JSON.parse(run.stdout), ['abcdef', 'abcdef…', ''])
})

// An f-string that interpolates a slice such as `{line[:70]}` prints a cut with no mark. The pattern is
// shown finding one first, so a pattern that matches nothing cannot pass this test (CLAUDE.md §4).
const SLICED = /\{[^{}\n]*\[:\d+\]\}/
test('no gate prints a quote sliced inside the sentence it prints', () => {
  assert.match('f"row has empty check cell: {r.strip()[:70]}"', SLICED)
  assert.doesNotMatch('f"row has empty check cell: {clipped(r.strip(), 70)}"', SLICED)
  const bin = join(repoRoot, 'plugin', 'bin')
  const found = []
  for (const entry of readdirSync(bin, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const name = entry.name
    const text = readFileSync(join(bin, name), 'utf8')
    if (!text.startsWith('#!') || !/python/.test(text.split('\n')[0])) continue
    text.split('\n').forEach((line, index) => { if (SLICED.test(line)) found.push(`${name}:${index + 1}: ${line.trim()}`) })
  }
  assert.deepEqual(found, [])
})
