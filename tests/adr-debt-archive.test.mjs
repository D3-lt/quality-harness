// A deferral pointing at a record the adr-retire stage moved into the sibling archive is
// UNSWEPT (it can never resurface), not UNRESOLVED ("a typo, or another repository's").
// Found 2026-10-13: ADR-099 T2 archived ADR-046, and `adr-debt docs/adr` began exiting 1 on
// ADR-049's "(deferred: ADR-046 Follow-ups …)". adr-lint learned the same lesson for
// citations (`archived_record_numbers`); this is its sibling for deferral pointers.
import assert from 'node:assert/strict'
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
