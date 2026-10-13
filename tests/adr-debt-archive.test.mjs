// A deferral pointing at a record the adr-retire stage moved into the sibling archive is
// UNSWEPT (it can never resurface), not UNRESOLVED ("a typo, or another repository's").
// Found 2026-10-13: ADR-099 T2 archived ADR-046, and `adr-debt docs/adr` began exiting 1 on
// ADR-049's "(deferred: ADR-046 Follow-ups …)". adr-lint learned the same lesson for
// citations (`archived_record_numbers`); this is its sibling for deferral pointers.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gate = join(repoRoot, 'plugin', 'bin', 'adr-debt')
const LIFECYCLE = '**Lifecycle:** Frozen historical ADR records'

function corpus({ catalog }) {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-debt-archive-'))
  const active = join(dir, 'docs', 'adr')
  const archive = join(dir, 'docs', 'adr-archive')
  mkdirSync(active, { recursive: true })
  mkdirSync(archive, { recursive: true })
  writeFileSync(join(active, 'ADR-002-probe.md'),
    '# ADR-002: Probe\n\n## Out of Scope\n\n- A dispatcher mapping (deferred: ADR-001 Follow-ups — it is not dispatched)\n'
    + '- A courier registry (deferred: ADR-009)\n')
  writeFileSync(join(archive, 'README.md'), `# Archive\n\n${catalog}\n`)
  writeFileSync(join(archive, 'ADR-001-old.md'), '# ADR-001: Old\n\n**Status:** Accepted\n')
  const scan = runPython([gate, active], { cwd: dir, encoding: 'utf8', windowsHide: true })
  rmSync(dir, { recursive: true, force: true })
  return scan
}

test('a deferral to a record retired into the archive is unswept, and one to no record is still unresolved', () => {
  const archived = corpus({ catalog: LIFECYCLE })
  assert.match(archived.stdout, /UNSWEPT \S*ADR-002-probe\.md → \S*adr-archive \(ADR-001\): A dispatcher mapping/, archived.stdout)
  assert.doesNotMatch(archived.stdout, /UNRESOLVED \[adr\] \S*: \('ADR-001/, archived.stdout)
  // The twin: an id no tree holds still needs action, so the run still fails on it.
  assert.match(archived.stdout, /UNRESOLVED \[adr\] \S*: \('ADR-009'\)/, archived.stdout)
  assert.equal(archived.status, 1, archived.stdout)
  // A sibling whose catalog does not say it is an archive is not one: the pointer stays unresolved.
  const plain = corpus({ catalog: 'Some notes about archives.' })
  assert.match(plain.stdout, /UNRESOLVED \[adr\] \S*: \('ADR-001 Follow-ups/, plain.stdout)
  assert.doesNotMatch(plain.stdout, /UNSWEPT/, plain.stdout)
})

// The backlog became an index on 2026-10-12 (db1db5fa): a closed section's text moved verbatim to
// docs/backlog-archive/ and its heading stays with an `Archived:` link. Receipts moved with it, so
// `adr-debt docs/adr` went from 0 to 44 UNRECEIPTED, each printed with the resolved home path.
test('a receipt the backlog index moved to its archive still counts, and one the archive never names does not', () => {
  const run = archived => {
    const dir = mkdtempSync(join(os.tmpdir(), 'qh-debt-receipt-'))
    const active = join(dir, 'docs', 'adr')
    mkdirSync(active, { recursive: true })
    mkdirSync(join(dir, 'docs', 'backlog-archive'), { recursive: true })
    spawnSync('git', ['init', '-q'], { cwd: dir, windowsHide: true, timeout: 30_000 })
    writeFileSync(join(active, 'ADR-002-probe.md'), '# ADR-002: Probe\n\n## Out of Scope\n\n- Rate limiting (deferred: docs/BACKLOG.md §5)\n')
    writeFileSync(join(dir, 'docs', 'BACKLOG.md'),
      '# Backlog\n\n## 5. CLOSED — rate limiting\n\nArchived: [backlog-archive/BACKLOG-001-100.md](backlog-archive/BACKLOG-001-100.md)\n')
    writeFileSync(join(dir, 'docs', 'backlog-archive', 'BACKLOG-001-100.md'), `## 5. CLOSED — rate limiting\n\n${archived}\n`)
    const scan = runPython([gate, active], { cwd: dir, encoding: 'utf8', windowsHide: true })
    rmSync(dir, { recursive: true, force: true })
    return scan
  }
  const moved = run('Deferred here by ADR-002.')
  assert.match(moved.stdout, /0 unreceipted/, moved.stdout)
  const never = run('Nobody names the source here.')
  assert.match(never.stdout, /1 unreceipted/, never.stdout)
  // Said as the pointer wrote it, never as a resolved path on this machine.
  assert.match(never.stdout, /UNRECEIPTED \S*ADR-002-probe\.md → docs\/BACKLOG\.md: Rate limiting/, never.stdout)
})
