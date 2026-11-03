// ADR-138 T2: scripts/outside-run.mjs probes the last tag and the candidate over pinned public corpora and every fixture
// corpus, and writes an artifact that proves its own comparison (ADR-138 Decision 4). Driven through its export with
// stand-in probes and stagers; fixture staging and discovery run for real in a directory this test made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { fixtureIds, notOkLooks, outsideRun, stageFixture } from '../scripts/outside-run.mjs'
import { diffReports } from '../plugin/scripts/corpus-probe.mjs'
import { sameOutput } from '../scripts/same-output.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the outside run proves its own comparison per corpus', async t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-outside-run-'))
  t.after(() => remove(scratch))
  // The candidate's fixture corpora, one of them present only at the candidate: discovery reads the candidate's tree.
  const candidate = path.join(scratch, 'candidate')
  for (const name of ['alpha', 'only-at-candidate']) {
    mkdirSync(path.join(candidate, 'tests', 'fixtures', 'corpora', name, 'docs', 'adr'), { recursive: true })
    writeFileSync(path.join(candidate, 'tests', 'fixtures', 'corpora', name, 'docs', 'adr', '0001-x.md'), `# ${name}\n`)
  }
  // A fixture is pinned by its committed tree, so the candidate is a repository with one commit.
  for (const args of [['init', '-q', '-b', 'main', '.'], ['add', '.'], ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-qm', 'candidate']]) {
    assert.equal(spawnSync('git', args, { cwd: candidate, timeout: 30_000, windowsHide: true }).status, 0, args.join(' '))
  }
  assert.deepEqual(fixtureIds(candidate), ['alpha', 'only-at-candidate'])
  // Fixture staging for real: its own repository, one commit, the same bytes.
  const staged = path.join(scratch, 'staged-alpha')
  assert.equal(stageFixture(path.join(candidate, 'tests', 'fixtures', 'corpora', 'alpha'), staged), null)
  assert.equal(spawnSync('git', ['-C', staged, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8', timeout: 30_000, windowsHide: true }).stdout.trim(), '1')
  assert.equal(readFileSync(path.join(staged, 'docs', 'adr', '0001-x.md'), 'utf8'), '# alpha\n')

  const report = (said, side) => ({ probe: { version: side }, timings: [{ ms: side === 'before' ? 1 : 2 }], records: [said] })
  const probed = []
  const artifact = await outsideRun({
    root: candidate, sha: 'c'.repeat(40), run: '41000000000',
    baseline: { tag: 'v1.0.0', sha: 'b'.repeat(40) },
    cores: { baseline: 'base-core-digest', candidate: 'cand-core-digest' },
    corpora: [
      { id: 'public-same', url: 'https://example.invalid/a', sha: 'a'.repeat(40), shape: 'madr' },
      { id: 'public-gone', url: 'https://example.invalid/b', sha: 'd'.repeat(40), shape: 'nygard' },
    ],
    stage: entry => (entry.id === 'public-gone' ? 'git fetch exited 128: not our ref' : null),
    probe: (side, entry) => {
      probed.push(`${entry.id}:${side}`)
      return entry.id === 'fixture:only-at-candidate' && side === 'after' ? report('changed', side) : report('same', side)
    },
    attest: entry => ({ runner: `ci-windows-${entry.shape ?? entry.id}` }), compare: sameOutput, explain: diffReports,
  })
  assert.equal(artifact.version, 1)
  assert.deepEqual([artifact.sha, artifact.run, artifact.baseline.tag, artifact.baseline.sha], ['c'.repeat(40), '41000000000', 'v1.0.0', 'b'.repeat(40)])
  assert.deepEqual(artifact.cores, { baseline: 'base-core-digest', candidate: 'cand-core-digest' })
  const byId = Object.fromEntries(artifact.corpora.map(entry => [entry.id, entry]))
  assert.deepEqual(artifact.corpora.map(entry => entry.id), ['public-same', 'public-gone', 'fixture:alpha', 'fixture:only-at-candidate'], 'every corpus once, in a fixed order')
  assert.equal(byId['public-same'].same, true)
  assert.equal(byId['public-same'].pin, 'a'.repeat(40))
  assert.match(byId['public-same'].reports.before.digest, /^[0-9a-f]{64}$/)
  assert.notEqual(byId['public-same'].reports.before.digest, byId['public-same'].reports.after.digest, 'the digests are of the reports as written, run fields included')
  assert.equal(byId['public-gone'].same, null)
  assert.match(byId['public-gone'].couldNotRun, /not our ref/)
  assert.ok(!probed.some(name => name.startsWith('public-gone')), 'a corpus that could not be staged is not probed')
  assert.equal(byId['fixture:alpha'].same, true)
  const alphaTree = spawnSync('git', ['-C', candidate, 'rev-parse', 'HEAD:tests/fixtures/corpora/alpha'], { encoding: 'utf8', timeout: 30_000, windowsHide: true }).stdout.trim()
  assert.equal(byId['fixture:alpha'].pin, `tests/fixtures/corpora/alpha@${alphaTree}`, 'a fixture is pinned by the tree it was staged from')
  assert.equal(byId['fixture:only-at-candidate'].same, false)
  assert.ok(byId['fixture:only-at-candidate'].explanation.length > 0, 'a difference is explained')
  assert.equal(byId['fixture:alpha'].attestation.runner, 'ci-windows-alpha')
  // A probe that fails is could-not-run, never a comparison.
  const broken = await outsideRun({
    root: candidate, sha: 'c'.repeat(40), run: '1', baseline: { tag: 'v1.0.0', sha: 'b'.repeat(40) }, cores: {}, corpora: [],
    stage: () => null, probe: side => (side === 'after' ? { error: 'exit 1: boom' } : report('same', side)), attest: () => null, compare: sameOutput, explain: diffReports,
  })
  assert.ok(broken.corpora.every(entry => entry.same === null && /boom/.test(entry.couldNotRun)), JSON.stringify(broken.corpora))
})

// release-evidence asks every job of the release run to conclude success (tests/package.test.mjs), so the job is never
// conditioned at job level and the script records could-not-run instead of failing.
test('the outside run job is selected on every release run and uploads its artifact', () => {
  const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8').replace(/\r\n/g, '\n')
  const job = /\n  outside-run:\n([\s\S]*?)(?=\n  [a-z][\w-]*:\n|\s*$)/.exec(workflow)?.[1]
  assert.ok(job, 'the outside-run job exists')
  assert.match(job, /\n    runs-on: windows-latest\n/)
  assert.match(job, /\n    needs: core-assets\n/)
  assert.doesNotMatch(job, /\n    if:/, 'no job-level condition: a skipped job fails the release')
  assert.match(job, /fetch-depth: 0/, 'the last tag is reachable')
  assert.match(job, /actions\/download-artifact@v\d+[\s\S]*?name: qh-core/, 'the candidate core is this run\'s own')
  assert.match(job, /node scripts\/outside-run\.mjs --candidate-core /)
  assert.match(job, /actions\/upload-artifact@v\d+[\s\S]*?name: outside-run[\s\S]*?if-no-files-found: error/)
})

// The second review of ADR-138's implementation: a report says PARTIAL below its top level too. Every look outside the
// run's own identity is read, and a look nobody named yet is read as well.
test('every look a report holds outside its run identity is recorded when it is not ok', () => {
  const report = { look: 'ok', probe: { native: { look: 'UNPROVEN' } }, workNext: { look: 'PARTIAL', nested: [{ look: 'ok' }, { look: 'COULD NOT LOOK' }] }, adrState: { look: 'ok' } }
  assert.deepEqual(notOkLooks(report), ['workNext.look=PARTIAL', 'workNext.nested[1].look=COULD NOT LOOK'])
  assert.deepEqual(notOkLooks({ look: 'ok', workNext: { look: 'ok' } }), [])
  assert.deepEqual(notOkLooks({ look: 'PARTIAL' }), ['look=PARTIAL'])
})
