import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'
import { remove } from './helpers/remove.mjs'

const gate = fileURLToPath(new URL('../plugin/bin/adr-debt', import.meta.url))

test('debt receipts and archive findings follow the resolved target inside an ADR-named checkout', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-debt-'))
  t.after(() => remove(dir))
  const corpus = path.join(dir, 'ADR-007-worktree', 'adr')
  const archive = path.join(dir, 'ADR-007-worktree', 'history')
  mkdirSync(path.join(corpus, 'archive'), { recursive: true })
  mkdirSync(archive)
  writeFileSync(path.join(archive, 'README.md'), '**Lifecycle:** Frozen historical ADR records\n')
  writeFileSync(path.join(archive, 'ADR-020-old.md'), '# ADR-020: Old\n')
  writeFileSync(path.join(corpus, 'ADR-010-other.md'), '# ADR-010: Other\n')
  writeFileSync(path.join(corpus, 'archive', 'next.md'), 'Filed for ADR-007\n')
  writeFileSync(path.join(corpus, 'backlog.md'), 'Filed for ADR-0070 only\n')
  const pointers = ['see archive/next.md', 'backlog.md', 'ADR-01', 'ADR-02', 'ADR-10', 'ADR-20']
  writeFileSync(path.join(corpus, 'ADR-007-source.md'), '# ADR-007: Source\n\n## Out of Scope\n'
    + pointers.map(pointer => `- Future work (deferred: ${pointer})\n`).join(''))
  const result = runPython([gate, corpus], { cwd: dir, encoding: 'utf8', timeout: 10_000, windowsHide: true })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /2 broken pointers · 1 unreceipted · 2 into an archive/)
  for (const id of ['ADR-01', 'ADR-02']) assert.ok(result.stdout.includes("('" + id + "')"))
  assert.match(result.stdout, /UNRECEIPTED .* → backlog\.md:/)
  assert.match(result.stdout, /UNSWEPT .* → archive\/next\.md:/)
  assert.match(result.stdout, /UNSWEPT .*history \(ADR-20\):/)
})
