// ADR-089 T4: a reader whose output passed spawnSync's buffer started, ran and was cut off, and
// `failedToRun` worded it "did not start: ENOBUFS". No reader spawn set `maxBuffer`, so each had
// Node's 1 MiB default, and adr-lint over a 4,002-task corpus overflowed it (BACKLOG §295 item 22).
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { failedToRun, probe } from '../plugin/scripts/corpus-probe.mjs'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OVERFLOWED = /^ran, and its output passed the probe's .+ buffer \(ENOBUFS\), so what it said was not read$/

test('an overflowed reader is said to have run and overflowed', () => {
  const run = spawnSync(process.execPath, ['-e', 'process.stdout.write("x".repeat(4096))'],
    { encoding: 'utf8', maxBuffer: 1024, timeout: 30_000, windowsHide: true })
  assert.equal(run.error?.code, 'ENOBUFS', 'a child printing past maxBuffer is cut off with ENOBUFS')
  assert.equal(failedToRun(run.error, 120_000, 1024), "ran, and its output passed the probe's 1024-byte buffer (ENOBUFS), so what it said was not read")
  assert.equal(failedToRun({ code: 'ENOBUFS' }), "ran, and its output passed the probe's 64 MiB buffer (ENOBUFS), so what it said was not read")
  assert.doesNotMatch(failedToRun(run.error, 120_000, 1024), /did not start/)
  // CLEAN twins: a child that never started, and one killed at the deadline, keep their words.
  assert.equal(failedToRun({ code: 'ENOENT' }), 'did not start: ENOENT')
  assert.match(failedToRun({ code: 'ETIMEDOUT' }, 120_000), /^killed at the probe's 120s budget/)
})

test('every reader spawn in the probe carries the output limit', () => {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-probe-enobufs-')))
  try {
    cpSync(path.join(repoRoot, 'tests', 'fixtures', 'corpora', 'go-module'), root, { recursive: true })
    rmSync(path.join(root, 'expected.json'))
    const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args],
      { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true })
    git('init', '-q'); git('add', '-A')
    const tight = probe(root, { outputLimit: 1 })
    const why = new Map(tight.couldNotRun.map(entry => [entry.reader, entry.why]))
    const record = 'docs/adr/ADR-001-cart-totals-are-integer-cents'
    for (const reader of ['work-next', 'adr-state', `adr-lint ${record}.md`, `adr-next ${record}/tasks`, 'SessionStart', 'corpus-report docs/adr']) {
      assert.match(why.get(reader) ?? '(not in couldNotRun)', OVERFLOWED, `${reader}: ${JSON.stringify(tight.couldNotRun, null, 2)}`)
    }
    for (const entry of tight.couldNotRun) assert.doesNotMatch(entry.why, /did not start/, JSON.stringify(entry))
    // CLEAN twin: the default limit holds every reader of this corpus.
    assert.deepEqual(probe(root).couldNotRun, [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
