// ADR-070: a peer's attestation is filed only when its commit gives the digests it
// carries. Every case runs the importer as a CLI against a scratch repository (CLAUDE.md
// §9), and the digests it must match are computed by the probe's OWN functions over
// that checkout — the importer re-derives them from git, and the two must agree.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { probeDigest, readerFingerprint } from '../plugin/scripts/corpus-probe.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const importer = join(repoRoot, 'scripts', 'attest-import.mjs')
const scratch = mkdtempSync(join(tmpdir(), 'qh-attest-import-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

// A repository holding a plugin tree: every reader directory, a dotfile and a
// __pycache__ file the fingerprint must skip, and a plugin.json.
function repository(name) {
  const repo = join(scratch, name)
  const files = {
    'plugin/scripts/corpus-probe.mjs': 'export const probe = 1\n',
    'plugin/scripts/reader.mjs': 'export const reader = 2\r\n',
    'plugin/bin/gate': '#!/usr/bin/env python3\nprint("gate")\n',
    'plugin/lib/record.py': 'RECORD = 3\n',
    'plugin/lib/.hidden': 'not a reader\n',
    'plugin/lib/__pycache__/record.cpython-314.pyc': 'bytecode\n',
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
    date: '2026-09-27', at, plugin: '9.9.9', kind: 'probe',
    probeSha256: probeDigest(() => readFileSync(join(repo, 'plugin', 'scripts', 'corpus-probe.mjs'))),
    readers: readerFingerprint(join(repo, 'plugin')).sha256,
    platform: 'Darwin 27.0.0', node: '26.10.0', python: '3.14.7',
    corpus: { records: 92, tasks: 273, taskDirectories: 40 },
    couldNotRun: 0, disagreements: 0, readinessUnproven: 0, runner: 'macos-php-react', found: '',
  }
  return { repo, at, attestation }
}

const message = (...objects) => `Re-run at the new sha: clean.\n\n--attest, verbatim:\n${objects.map(o => JSON.stringify(o, null, 2)).join('\n\nand:\n')}\n\nNothing else {not json} broke.\n`
const reports = repo => { try { return readdirSync(join(repo, 'docs', 'corpus-reports')).sort() } catch { return [] } }
function importing(repo, text, ...flags) {
  const file = join(scratch, `message-${process.hrtime.bigint()}.txt`)
  writeFileSync(file, text)
  return spawnSync(process.execPath, [importer, '--root', repo, ...flags, file], { encoding: 'utf8', timeout: 60_000 })
}

test('an attestation is filed only when its digests are the ones its commit gives', () => {
  const { repo, at, attestation } = repository('files')
  const filed = importing(repo, message(attestation))
  assert.equal(filed.status, 0, `${filed.stdout}\n${filed.stderr}`)
  const name = `2026-09-27-macos-php-react-9.9.9-${at.slice(0, 7)}.json`
  assert.deepEqual(reports(repo), [name])
  assert.equal(readFileSync(join(repo, 'docs', 'corpus-reports', name), 'utf8'), `${JSON.stringify(attestation, null, 2)}\n`)

  // Each digest, and the plugin version, one character or one annotation off: refused, nothing written.
  const off = value => `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}`
  for (const wrong of [{ readers: off(attestation.readers) }, { probeSha256: off(attestation.probeSha256) }, { plugin: '9.9.9 (main, pre-tag)' }]) {
    const refused = importing(repo, message({ ...attestation, runner: 'another-runner', ...wrong }))
    assert.equal(refused.status, 1, `${JSON.stringify(wrong)}\n${refused.stdout}\n${refused.stderr}`)
    assert.deepEqual(reports(repo), [name], JSON.stringify(wrong))
  }
  // The same run filed twice is a duplicate.
  const again = importing(repo, message(attestation))
  assert.equal(again.status, 1, again.stdout)
  assert.ok(`${again.stdout}${again.stderr}`.includes('duplicate'), again.stdout)
})

test('a message that is not exactly one clean attestation is refused, and nothing is written', () => {
  const { repo, attestation } = repository('refuses')
  const cases = [
    ['no attestation', 'Could not run because the classifier blocked it.\n'],
    ['two attestations', message(attestation, { ...attestation, runner: 'second' })],
    ['a report key', message({ ...attestation, workNext: { ready: ['docs/adr/x/tasks/T1.md'] } })],
    ['a short at', message({ ...attestation, at: attestation.at.slice(0, 7) })],
    ['a hand attestation', message({ ...attestation, kind: 'hand' })],
  ]
  for (const [what, text] of cases) {
    const run = importing(repo, text)
    assert.equal(run.status, 1, `${what}: ${run.stdout}\n${run.stderr}`)
    assert.deepEqual(reports(repo), [], what)
  }
  const checked = importing(repo, message(attestation), '--check')
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`)
  assert.deepEqual(reports(repo), [], '--check writes nothing')
})

test('an at this clone lacks is could-not-look, not a refusal', () => {
  const { repo, attestation } = repository('absent')
  const run = importing(repo, message({ ...attestation, at: 'f'.repeat(40) }))
  assert.equal(run.status, 3, `${run.stdout}\n${run.stderr}`)
  assert.ok(`${run.stdout}${run.stderr}`.includes('fetch'), run.stderr)
  assert.deepEqual(reports(repo), [])
})

// Codex review of 3.1.0..e0ef6d4, F1: the date names the file, and `../../x` would have
// filed outside docs/corpus-reports. It is refused, and nothing is written anywhere.
test('a date that is not a date is refused, and nothing is written outside the reports', () => {
  const { repo, attestation } = repository('escape')
  const refused = importing(repo, message({ ...attestation, date: '../../../escape', runner: 'escape-probe' }))
  assert.equal(refused.status, 1, `${refused.stdout}\n${refused.stderr}`)
  assert.match(refused.stdout, /date is "\.\.\/\.\.\/\.\.\/escape", not YYYY-MM-DD/)
  assert.match(refused.stdout, /is not a plain name inside docs\/corpus-reports/)
  assert.deepEqual(reports(repo), [])
  assert.ok(!readdirSync(scratch).some(name => name.startsWith('escape-escape-probe')), 'nothing lands beside the repository')
  // Clean twin: the same attestation with a real date is filed.
  assert.equal(importing(repo, message({ ...attestation, runner: 'escape-probe' })).status, 0)
})
