// ADR-089 T2: `corpus-probe --attest --since` counts the adr-lint verdicts that moved over a PARTIAL
// pair, over the records both runs read, carries the run's `look` and how many records it did not
// compare, and says when git could not be run rather than that the plugin is not a checkout. The
// php-laravel-monolith attestation of 3.8.8 carried `verdictChanges: null` because its look was
// PARTIAL, and its runner compared 23 verdicts by hand.
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attestation, readerFingerprint } from '../plugin/scripts/corpus-probe.mjs'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const probeScript = path.join(repoRoot, 'plugin', 'scripts', 'corpus-probe.mjs')

function attestSince(report, since) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-attest-partial-'))
  try {
    writeFileSync(path.join(dir, 'after.json'), JSON.stringify(report))
    writeFileSync(path.join(dir, 'before.json'), JSON.stringify(since))
    const run = spawnSync(process.execPath, [probeScript, '--attest', 'x', path.join(dir, 'after.json'), '--since', path.join(dir, 'before.json')],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// ADR-089 Context's pair as the probe saves it: ADR-001 readable, ADR-002 holding a NUL byte and
// read by nobody, and ADR-001 PASS → FAIL between the two runs.
const partial = (verdict, readers) => ({
  probe: { readers: { sha256: readers, git: null, dirty: null } },
  look: 'PARTIAL', corpora: ['docs/adr'],
  workNext: { look: 'PARTIAL', partialBecause: [{ file: 'docs/adr/ADR-002-nul.md', reason: 'it holds a NUL byte' }] },
  adrLint: [{ file: 'docs/adr/ADR-001-a.md', exit: verdict === 'PASS' ? 0 : 1, verdict },
    { file: 'docs/adr/ADR-002-nul.md', exit: null, verdict: 'unread', reason: 'it holds a NUL byte', undecided: true }],
})

test('a partial attestation counts the verdicts both runs read and names the rest', () => {
  const attested = attestSince(partial('FAIL', 'b'.repeat(64)), partial('PASS', 'a'.repeat(64)))
  assert.deepEqual(attested.verdictChanges, { compared: 1, passToFail: 1, failToPass: 0 })
  assert.equal(attested.notCompared, 1)
  assert.equal(attested.look, 'PARTIAL')
  // DIRTY twins: an earlier run that could not look, and an earlier run by the same readers, compare
  // nothing, and say so with null in both fields, never 0.
  const blind = { ...partial('PASS', 'a'.repeat(64)), look: 'UNPROVEN' }
  const unproven = attestSince(partial('FAIL', 'b'.repeat(64)), blind)
  assert.deepEqual([unproven.verdictChanges, unproven.notCompared], [null, null])
  const same = attestSince(partial('FAIL', 'a'.repeat(64)), partial('PASS', 'a'.repeat(64)))
  assert.deepEqual([same.verdictChanges, same.notCompared], [null, null])
  // The key sits beside the counts, outside verdictChanges, which keeps exactly its three keys.
  const keys = Object.keys(attested)
  assert.deepEqual(keys.slice(keys.indexOf('readinessUnproven'), keys.indexOf('verdictChanges') + 1),
    ['readinessUnproven', 'look', 'notCompared', 'verdictChanges'])
})

test('an attestation carries the look of its run', () => {
  for (const look of ['ok', 'PARTIAL', 'UNPROVEN']) assert.equal(attestation({ look, workNext: { look: 'ok' } }, 'x').look, look)
  // The worse of the report's look and work-next's: either one not having read everything is the run's.
  assert.equal(attestation({ look: 'ok', workNext: { look: 'PARTIAL' } }, 'x').look, 'PARTIAL')
  assert.equal(attestation({ look: 'PARTIAL', workNext: { look: 'UNPROVEN' } }, 'x').look, 'UNPROVEN')
  assert.equal(attestation({ look: 'ok' }, 'x').look, 'ok')
  // A report with neither says nothing about its look, which is null, never a guessed ok.
  assert.equal(attestation({}, 'x').look, null)
})

test('git that could not run is not called a missing checkout', () => {
  const pluginRoot = path.join(repoRoot, 'plugin')
  const absent = Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' })
  const fingerprint = readerFingerprint(pluginRoot, { run: () => ({ error: absent, status: null, stdout: '' }) })
  assert.deepEqual([fingerprint.git, fingerprint.dirty, fingerprint.gitReason], [null, null, 'git could not be run (ENOENT)'])
  const report = { look: 'ok', workNext: { look: 'ok' }, probe: { readers: fingerprint } }
  assert.equal(attestation(report, 'x').atReason, "git could not be run (ENOENT), so the readers' commit is unknown")
  // CLEAN twin: git answered that this is not a work tree, and that is what the reason says.
  const outside = readerFingerprint(pluginRoot, { run: () => ({ status: 128, stdout: '', stderr: 'fatal: not a git repository' }) })
  assert.equal('gitReason' in outside, false, JSON.stringify(outside))
  assert.equal(attestation({ ...report, probe: { readers: outside } }, 'x').atReason, 'the plugin is not a git checkout')
})
