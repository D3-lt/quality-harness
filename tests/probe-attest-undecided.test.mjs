// BACKLOG §362: an outside run attested `records: 0` beside a compared lint verdict, because the
// corpus's one record was Proposed and `records` counts what a reader acts on. The attestation now
// counts the records held back beside it, and a report with no such list gets no made-up count.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const probe = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'scripts', 'corpus-probe.mjs')

function attestOf(report) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-attest-undecided-'))
  try {
    writeFileSync(join(dir, 'new.json'), JSON.stringify(report))
    const run = spawnSync(process.execPath, [probe, '--attest', 'shape-label', join(dir, 'new.json')],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

const report = extra => ({
  probe: { version: '3.8.13', sha256: 'p'.repeat(64), readers: { sha256: 'a'.repeat(64), git: null, dirty: null } },
  root: '.', look: 'ok', corpora: [],
  workNext: { look: 'ok', records: 0, accepted: 0, tasks: 0, ready: [], unbacked: [], readinessUnproven: [] },
  adrNext: [], adrLint: [{ file: 'docs/notes/a.md', exit: 1, verdict: 'FAIL', undecided: true }],
  couldNotRun: [], disagreements: [], ...extra,
})

test('an attestation counts the records a reader holds back beside the ones it acts on', () => {
  const held = attestOf(report({ undecided: [{ file: 'docs/notes/a.md', status: 'Proposed', reason: 'a plan, not yet decided' }] }))
  assert.deepEqual(held.corpus, { records: 0, undecided: 1, tasks: 0, taskDirectories: 0 })
  assert.deepEqual(attestOf(report({ undecided: [] })).corpus, { records: 0, undecided: 0, tasks: 0, taskDirectories: 0 })
  // An older report carries no list, and the attestation makes no count up for it.
  assert.deepEqual(attestOf(report({})).corpus, { records: 0, tasks: 0, taskDirectories: 0 })
})
