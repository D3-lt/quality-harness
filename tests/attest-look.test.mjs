// ADR-089 T3: an attestation carrying `look` and `notCompared` is filed, a malformed one is refused,
// release-evidence's `attested` reason names a PARTIAL look and the records a run did not compare, and
// a PARTIAL run attests a release only beside one whose look is ok (Alternative (d), the owner's
// decision on Accepting ADR-089). attest-import refused both keys as outside the schema.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { probeDigest, readerFingerprint } from '../plugin/scripts/corpus-probe.mjs'
import { outsideRun, tagAdvice } from '../scripts/release-evidence.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const importer = join(repoRoot, 'scripts', 'attest-import.mjs')
const scratch = mkdtempSync(join(tmpdir(), 'qh-attest-look-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

// A scratch repository holding a plugin tree, built as tests/attest-import.test.mjs builds one, so
// the importer re-derives the digests the attestation carries from git.
function repository(name) {
  const repo = join(scratch, name)
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
  const git = (...args) => spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args],
    { cwd: repo, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'readers')
  const at = git('rev-parse', 'HEAD').stdout.trim()
  const attestation = {
    date: '2026-10-07', at, plugin: '9.9.9', kind: 'probe',
    probeSha256: probeDigest(() => readFileSync(join(repo, 'plugin', 'scripts', 'corpus-probe.mjs'))),
    readers: readerFingerprint(join(repo, 'plugin')).sha256,
    platform: 'Darwin 27.0.0', node: '26.10.0', python: '3.14.8',
    corpus: { records: 23, tasks: 40, taskDirectories: 9 },
    couldNotRun: 0, disagreements: 0, readinessUnproven: 0,
    look: 'PARTIAL', notCompared: 6, verdictChanges: { compared: 17, passToFail: 0, failToPass: 0 },
    runner: 'macos-php', found: '',
  }
  return { repo, attestation }
}

const reports = repo => { try { return readdirSync(join(repo, 'docs', 'corpus-reports')).sort() } catch { return [] } }
function importing(repo, attestation) {
  const file = join(scratch, `message-${process.hrtime.bigint()}.txt`)
  writeFileSync(file, `--attest, verbatim:\n${JSON.stringify(attestation, null, 2)}\n`)
  return spawnSync(process.execPath, [importer, '--root', repo, file], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
}

test('attest-import files look and notCompared and refuses malformed ones', () => {
  const { repo, attestation } = repository('files')
  const filed = importing(repo, attestation)
  assert.equal(filed.status, 0, `${filed.stdout}\n${filed.stderr}`)
  const [name] = reports(repo)
  const written = JSON.parse(readFileSync(join(repo, 'docs', 'corpus-reports', name), 'utf8'))
  assert.deepEqual([written.look, written.notCompared], ['PARTIAL', 6])
  // In the schema's order: beside the counts, before verdictChanges.
  const keys = Object.keys(written)
  assert.deepEqual(keys.slice(keys.indexOf('readinessUnproven'), keys.indexOf('verdictChanges') + 1),
    ['readinessUnproven', 'look', 'notCompared', 'verdictChanges'])
  const nothing = importing(repo, { ...attestation, runner: 'macos-nothing', look: null, notCompared: null, verdictChanges: null })
  assert.equal(nothing.status, 0, `${nothing.stdout}\n${nothing.stderr}`)
  assert.equal(reports(repo).length, 2)
  // DIRTY twins, each refused with nothing written.
  for (const wrong of [{ look: 'partial' }, { notCompared: -1 }, { notCompared: 1.5 }, { notCompared: 2, verdictChanges: null }]) {
    const refused = importing(repo, { ...attestation, runner: 'macos-wrong', ...wrong })
    assert.equal(refused.status, 1, `${JSON.stringify(wrong)}\n${refused.stdout}\n${refused.stderr}`)
    assert.match(`${refused.stdout}${refused.stderr}`, /ADR-089/, JSON.stringify(wrong))
    assert.equal(reports(repo).length, 2, JSON.stringify(wrong))
  }
})

const sha = c => c.repeat(40)
const run = (file, at, extra = {}) => ({ file, at, plugin: '3.8.10', verdictChanges: { compared: 3, passToFail: 0, failToPass: 0 }, ...extra })
const partial = (extra = {}) => run('partial.json', sha('a'), { look: 'PARTIAL', notCompared: 6, verdictChanges: { compared: 17, passToFail: 0, failToPass: 0 }, ...extra })
const ok = run('ok.json', sha('b'), { look: 'ok', notCompared: 0 })
const changed = ['plugin/scripts/corpus-probe.mjs']
const covers = () => true

test('release-evidence names an unread part of an attested corpus', () => {
  const both = outsideRun(changed, [partial(), ok], covers)
  assert.equal(both.verdict, 'attested', JSON.stringify(both))
  assert.ok(both.reason.includes('partial.json at aaaaaaa (look PARTIAL, 6 not compared)'), both.reason)
  assert.ok(both.reason.includes('ok.json at bbbbbbb'), both.reason)
  assert.ok(!both.reason.includes('ok.json at bbbbbbb ('), `an ok run that compared everything adds nothing: ${both.reason}`)
  // CLEAN twin: an attestation without the keys reads exactly as before this record.
  const legacy = outsideRun(changed, [run('old.json', sha('c'))], covers)
  assert.deepEqual(legacy, { verdict: 'attested', reason: 'outside run attested by old.json at ccccccc' })
})

test('release-evidence refuses a partial run that regressed', () => {
  const regressed = outsideRun(changed, [partial({ verdictChanges: { compared: 17, passToFail: 1, failToPass: 0 } }), ok], covers)
  assert.equal(regressed.verdict, 'unproven', JSON.stringify(regressed))
  assert.equal(regressed.kind, 'regressed')
  assert.match(regressed.reason, /partial\.json \(passToFail 1\)/)
})

test('release-evidence attests a partial run only beside an ok one', () => {
  for (const alone of [[partial()], [partial({ look: null })], [partial(), partial({ file: 'other.json', at: sha('d') })]]) {
    const refused = outsideRun(changed, alone, covers)
    assert.equal(refused.verdict, 'unproven', JSON.stringify(refused))
    assert.equal(refused.kind, 'partial-only', JSON.stringify(refused))
    assert.match(refused.reason, /only beside an attestation whose look is ok \(ADR-089\)/)
  }
  assert.match(tagAdvice('partial-only'), /^Do NOT tag this sha\. .*look is ok/)
  // CLEAN twins: beside an ok run, and beside one from before `look`, the PARTIAL run corroborates.
  assert.equal(outsideRun(changed, [partial(), ok], covers).verdict, 'attested')
  assert.equal(outsideRun(changed, [partial(), run('old.json', sha('c'))], covers).verdict, 'attested')
})

// A review of ADR-089 (P3): beside one ok run, a `look: UNPROVEN` attestation was listed as attesting
// too. ADR-089: an UNPROVEN run attests nothing, so each is excluded on its own.
test('release-evidence never lists an unproven run as attesting', () => {
  const blind = run('blind.json', sha('e'), { look: 'UNPROVEN', notCompared: 0 })
  const beside = outsideRun(changed, [blind, ok], covers)
  assert.deepEqual(beside, { verdict: 'attested', reason: 'outside run attested by ok.json at bbbbbbb' })
  // Alone, or with only PARTIAL company, an UNPROVEN run leaves the release unproven.
  for (const reports of [[blind], [blind, partial()]]) {
    const refused = outsideRun(changed, reports, covers)
    assert.equal(refused.verdict, 'unproven', JSON.stringify(refused))
    assert.match(refused.reason, /blind\.json could not look at its corpus \(look UNPROVEN\) and attests nothing/, refused.reason)
  }
  // CLEAN twin: PARTIAL beside ok still counts, per the owner's decision.
  assert.equal(outsideRun(changed, [partial(), ok], covers).verdict, 'attested')
})
