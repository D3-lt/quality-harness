// The Codex review of v3.8.52..2ad118d0: release.mjs takes an uncommitted file in docs/corpus-reports as a landed sha's
// evidence (ADR-126 T4), so it must be an attestation attest-import would have filed, not any JSON there. `--verify` runs
// every check a filing runs over a file already in place and requires its bytes to be the ones attest-import writes.
// Against a scratch repository, as tests/attest-import.test.mjs does (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { probeDigest, readerFingerprint } from '../plugin/scripts/corpus-probe.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const importer = join(repoRoot, 'scripts', 'attest-import.mjs')
const scratch = mkdtempSync(join(tmpdir(), 'qh-attest-verify-'))
after(() => remove(scratch))

function repository() {
  const repo = join(scratch, 'repo')
  const files = {
    'plugin/scripts/corpus-probe.mjs': 'export const probe = 1\n',
    'plugin/bin/gate': '#!/usr/bin/env python3\nprint("gate")\n',
    'plugin/lib/record.py': 'RECORD = 3\n',
    'plugin/hooks/hooks.json': '{"hooks": {}}\n',
    'plugin/.claude-plugin/plugin.json': '{ "name": "qh", "version": "9.9.9" }\n',
  }
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true })
    writeFileSync(join(repo, file), text)
  }
  const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'readers')
  const at = git('rev-parse', 'HEAD').stdout.trim()
  const attestation = {
    date: '2026-10-22', at, plugin: '9.9.9', kind: 'probe',
    probeSha256: probeDigest(() => readFileSync(join(repo, 'plugin', 'scripts', 'corpus-probe.mjs'))),
    readers: readerFingerprint(join(repo, 'plugin')).sha256,
    platform: 'Windows_NT 10.0.26200', node: '24.20.0', python: '3.14.7',
    corpus: { records: 72, undecided: 5, tasks: 209, taskDirectories: 19 },
    couldNotRun: 0, disagreements: 0, readinessUnproven: 0, look: 'ok', notCompared: 0,
    verdictChanges: { compared: 77, passToFail: 0, failToPass: 0 }, runner: 'win-wcag', found: '',
  }
  return { repo, attestation }
}

const run = (repo, ...args) => spawnSync(process.execPath, [importer, '--root', repo, ...args], { encoding: 'utf8', timeout: 60_000, windowsHide: true })

test('--verify takes a filed attestation as one, and an arbitrary or edited JSON as none', () => {
  const { repo, attestation } = repository()
  const message = join(scratch, 'message.txt')
  writeFileSync(message, `the run:\n${JSON.stringify(attestation, null, 2)}\n`)
  const filed = run(repo, message)
  assert.equal(filed.status, 0, filed.stdout + filed.stderr)
  const relative = /filed (docs\/corpus-reports\/\S+)/.exec(filed.stdout)[1]
  const path = join(repo, relative)
  const verified = run(repo, '--verify', path)
  assert.equal(verified.status, 0, verified.stdout + verified.stderr)
  assert.match(verified.stdout, /verified/)
  // DIRTY twins: a JSON holding only an `at`, the same attestation with one count changed, and the real one outside
  // docs/corpus-reports.
  const reports = join(repo, 'docs', 'corpus-reports')
  const original = readFileSync(path, 'utf8')
  writeFileSync(join(reports, 'bare.json'), `${JSON.stringify({ at: attestation.at })}\n`)
  assert.equal(run(repo, '--verify', join(reports, 'bare.json')).status, 1)
  const outside = join(scratch, 'outside.json')
  writeFileSync(outside, original)
  assert.equal(run(repo, '--verify', outside).status, 1)
  // The filed attestation itself, edited in place: the same values, so every other check passes, and bytes attest-import
  // would not write.
  writeFileSync(path, original.replace('"passToFail": 0', '"passToFail": 0 '))
  assert.equal(run(repo, '--verify', path).status, 1, 'bytes that are not the ones attest-import writes')
})
