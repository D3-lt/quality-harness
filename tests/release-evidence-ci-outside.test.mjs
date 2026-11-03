// ADR-138 T3: release-evidence answers the outside-run question from the release run's own outside run when its comparison
// is complete and nothing the readers say changed; otherwise it asks for a person, and a filed peer attestation answers it.
// A verdict that left PASS in either source vetoes the release (ADR-082). Driven through outsideRunEvidence with a fake
// git and stand-in artifacts: nothing here reaches a forge (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { outsideRunEvidence } from '../scripts/release-evidence.mjs'
import { remove } from './helpers/remove.mjs'

const SHA = 'c'.repeat(40)
const TAG_SHA = 'b'.repeat(40)
const PEER_AT = 'p'.repeat(40)
const RUN = '41000000001'
const PUBLIC = ['madr-decisions', 'nygard-doc-adr']
const FIXTURES = ['alpha', 'beta']
const EXPECTED = [...PUBLIC, ...FIXTURES.map(name => `fixture:${name}`)]

function fakeGit() {
  return (bin, args) => {
    const line = args.join(' ')
    if (line === `describe --tags --abbrev=0 ${SHA}~1`) return 'v1.0.0\n'
    if (line.startsWith('diff --name-only v1.0.0..')) return 'plugin/scripts/corpus-probe.mjs\0'
    if (line === 'rev-parse v1.0.0^{commit}') return `${TAG_SHA}\n`
    if (line === `show ${SHA}:scripts/outside-corpora.json`) return JSON.stringify({ corpora: PUBLIC.map(id => ({ id, url: `https://example.invalid/${id}`, sha: 'a'.repeat(40) })) })
    if (line === `ls-tree -d --name-only ${SHA}:tests/fixtures/corpora`) return `${FIXTURES.join('\n')}\n`
    // A peer run at PEER_AT: after the tag, before the sha, and no reader edited since.
    if (line.startsWith('merge-base --is-ancestor')) return ''
    if (line.startsWith(`diff --name-only ${PEER_AT}..`)) return ''
    throw new Error(`the fake has no answer for: git ${line}`)
  }
}
const entry = (id, over = {}) => ({ id, kind: id.startsWith('fixture:') ? 'fixture' : 'public', pin: 'x', before: 'd'.repeat(64), after: 'e'.repeat(64),
  same: true, explanation: [], attestation: { verdictChanges: { compared: 3, passToFail: 0, failToPass: 0 } }, couldNotRun: null, ...over })
const artifact = (over = {}) => ({ version: 1, run: RUN, sha: SHA, baseline: { tag: 'v1.0.0', sha: TAG_SHA }, cores: { baseline: 'x', candidate: 'y' },
  corpora: EXPECTED.map(id => entry(id)), ...over })

function reports(t, peer) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-ci-outside-'))
  t.after(() => remove(dir))
  if (peer) writeFileSync(path.join(dir, '2026-11-03-peer-1.0.1-ppppppp.json'), JSON.stringify({ at: PEER_AT, plugin: '3.8.69', look: 'ok', verdictChanges: { compared: 5, passToFail: 0, failToPass: 0 } }))
  return dir
}
const ask = (t, ci, peer = false) => outsideRunEvidence(SHA, fakeGit(), reports(t, peer), { ci })

test('the release run answers the outside run only when its comparison is complete and nothing changed', t => {
  const clean = ask(t, { run: RUN, artifact: artifact() })
  assert.equal(clean.verdict, 'attested', clean.reason)
  assert.equal(clean.kind, 'ci')
  assert.match(clean.reason, /4 corpora/)
  // A changed output asks for a person, and names where and what.
  const changed = artifact()
  changed.corpora[2] = entry('fixture:alpha', { same: false, explanation: ['adrLint docs/adr/0001.md advice: + a new line'] })
  const asked = ask(t, { run: RUN, artifact: changed })
  assert.deepEqual([asked.verdict, asked.kind], ['unproven', 'output-changed'], asked.reason)
  assert.match(asked.reason, /fixture:alpha/)
  assert.match(asked.reason, /a new line/)
  // ...and a filed peer attestation then answers it.
  const read = ask(t, { run: RUN, artifact: changed }, true)
  assert.equal(read.verdict, 'attested', read.reason)
  // Every incomplete or misattributed artifact is could-not-look, never answered.
  const refusals = {
    'could not run': artifact({ corpora: EXPECTED.map((id, i) => entry(id, i === 0 ? { same: null, couldNotRun: 'git fetch exited 128' } : {})) }),
    'a missing corpus': artifact({ corpora: EXPECTED.slice(1).map(id => entry(id)) }),
    'a duplicated corpus': artifact({ corpora: [...EXPECTED, EXPECTED[0]].map(id => entry(id)) }),
    'an extra corpus': artifact({ corpora: [...EXPECTED, 'fixture:gamma'].map(id => entry(id)) }),
    'a malformed entry': artifact({ corpora: EXPECTED.map((id, i) => entry(id, i === 1 ? { same: undefined } : {})) }),
    'an uncompared entry': artifact({ corpora: EXPECTED.map((id, i) => entry(id, i === 1 ? { before: null } : {})) }),
    'another sha': artifact({ sha: 'f'.repeat(40) }),
    'an earlier run': artifact({ run: '40999999999' }),
    'another baseline tag': artifact({ baseline: { tag: 'v0.9.0', sha: TAG_SHA } }),
    'a moved baseline sha': artifact({ baseline: { tag: 'v1.0.0', sha: 'e'.repeat(40) } }),
    'another version': artifact({ version: 2 }),
  }
  for (const [what, stand] of Object.entries(refusals)) {
    const answer = ask(t, { run: RUN, artifact: stand })
    assert.deepEqual([answer.verdict, answer.kind], ['unproven', 'ci-unverified'], `${what}: ${answer.reason}`)
  }
  const unreadable = ask(t, { run: RUN, artifact: { error: 'gh run download exited 1' } })
  assert.deepEqual([unreadable.verdict, unreadable.kind], ['unproven', 'ci-unverified'], unreadable.reason)
  // No release run handed in: the question is the peer question it was before ADR-138.
  assert.equal(ask(t, null).kind, 'missing')
  assert.equal(ask(t, null, true).verdict, 'attested')
})

test('a regression in either source vetoes the release', t => {
  const regressed = artifact()
  regressed.corpora[0] = entry(PUBLIC[0], { attestation: { verdictChanges: { compared: 3, passToFail: 1, failToPass: 0 } } })
  const alone = ask(t, { run: RUN, artifact: regressed })
  assert.deepEqual([alone.verdict, alone.kind], ['unproven', 'regressed'], alone.reason)
  // A clean peer run over another corpus does not outvote a regression CI observed (ADR-082 F-5).
  const beside = ask(t, { run: RUN, artifact: regressed }, true)
  assert.deepEqual([beside.verdict, beside.kind], ['unproven', 'regressed'], beside.reason)
  assert.match(beside.reason, new RegExp(PUBLIC[0]))
})
