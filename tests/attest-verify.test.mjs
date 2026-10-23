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

// BACKLOG §408: release-evidence counted any JSON in docs/corpus-reports carrying an `at` as an attestation, so a committed
// file that never came through attest-import attested a release. A release asks the question through releaseOutsideRun
// (main's default), which verifies each covering file as `--verify` does; the bare outsideRunEvidence seam does not.
test('a release counts a covering attestation only when it verifies', async () => {
  const { main, outsideRunEvidence, releaseOutsideRun } = await import('../scripts/release-evidence.mjs')
  const repo = join(scratch, 'released')
  const write = (file, text) => { mkdirSync(dirname(join(repo, file)), { recursive: true }); writeFileSync(join(repo, file), text) }
  write('plugin/scripts/corpus-probe.mjs', 'export const probe = 1\n')
  write('plugin/lib/record.py', 'RECORD = 3\n')
  write('plugin/bin/gate', '#!/usr/bin/env python3\nprint("gate")\n')
  write('plugin/hooks/hooks.json', '{"hooks": {}}\n')
  write('plugin/.claude-plugin/plugin.json', '{ "name": "qh", "version": "9.9.9" }\n')
  const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'readers'); git('tag', 'v0.0.1')
  write('plugin/lib/record.py', 'RECORD = 4\n'); git('commit', '-qam', 'a reader changed')
  const at = git('rev-parse', 'HEAD').stdout.trim()
  const attestation = {
    date: '2026-10-23', at, plugin: '9.9.9', kind: 'probe',
    probeSha256: probeDigest(() => readFileSync(join(repo, 'plugin', 'scripts', 'corpus-probe.mjs'))),
    readers: readerFingerprint(join(repo, 'plugin')).sha256,
    platform: 'Windows_NT 10.0.26200', node: '24.20.0', python: '3.14.7',
    corpus: { records: 72, undecided: 5, tasks: 209, taskDirectories: 19 },
    couldNotRun: 0, disagreements: 0, readinessUnproven: 0, look: 'ok', notCompared: 0,
    verdictChanges: { compared: 77, passToFail: 0, failToPass: 0 }, runner: 'win-wcag', found: '',
  }
  write('README.md', 'not a reader\n'); git('add', '-A'); git('commit', '-qm', 'the bump')
  const sha = git('rev-parse', 'HEAD').stdout.trim()
  const message = join(scratch, 'released.txt')
  writeFileSync(message, JSON.stringify(attestation))
  const filed = run(repo, message)
  assert.equal(filed.status, 0, filed.stdout + filed.stderr)
  const real = join(repo, /filed (docs\/corpus-reports\/\S+)/.exec(filed.stdout)[1])
  assert.equal(releaseOutsideRun(sha, repo).verdict, 'attested', releaseOutsideRun(sha, repo).reason)

  // DIRTY: the same `at` in a file attest-import did not write, alone.
  const original = readFileSync(real, 'utf8')
  remove(real)
  writeFileSync(join(repo, 'docs', 'corpus-reports', 'bare.json'), `${JSON.stringify({ at })}\n`)
  const bare = releaseOutsideRun(sha, repo)
  assert.equal(bare.verdict, 'unproven', bare.reason)
  assert.match(bare.reason, /bare\.json does not verify as an attestation/)
  assert.equal(outsideRunEvidence(sha, (bin, args, options) => {
    const done = spawnSync(bin, args, { ...options, cwd: repo })
    if (done.status !== 0) throw Object.assign(new Error(done.stderr), { status: done.status })
    return done.stdout
  }, join(repo, 'docs', 'corpus-reports')).verdict, 'attested', 'the unverified seam is what §408 found')

  // main's own default is the verifying question: a bare file there is UNPROVEN, the filed one READY.
  const said = []
  const reviewed = { verdict: 'covered', reason: 'reviewed' }
  const cwd = process.cwd()
  try {
    process.chdir(repo)
    assert.equal(main(['--local', sha], { review: () => reviewed, log: line => said.push(line) }), 2, said.join('\n'))
    assert.match(said[0], /^UNPROVEN/)
    remove(join(repo, 'docs', 'corpus-reports', 'bare.json'))
    writeFileSync(real, original)
    said.length = 0
    assert.equal(main(['--local', sha], { review: () => reviewed, log: line => said.push(line) }), 0, said.join('\n'))
  } finally { process.chdir(cwd) }
})
