// ADR-113 T5: every test file is accounted for. Test files were collected by a glob, so one in a subfolder or with another
// suffix never ran and nothing said so; a file that registered no test passed; two skips carried no reason; an environment a
// CI job installs on purpose could go missing and its tests skip there in silence; and release evidence read the jobs a run
// reported, never the jobs the workflow declares, so a job taken out of the run was a job nobody missed. Each is planted here
// beside the twin that must pass.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { rowFindings, unreached } from '../scripts/suite-accounting.mjs'
import { declaredJobs, main as releaseEvidence, missingJobs } from '../scripts/release-evidence.mjs'
import { required } from './helpers/require.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// NODE_TEST_CONTEXT is the outer runner's: inherited, a child run reports to it and runs nothing of its own.
const node = (args, { env = process.env, ...options } = {}) => {
  const own = { ...env }
  delete own.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120_000, windowsHide: true, ...options, env: own })
}

test('every test file is reached, runs a test, and every skip names its reason', t => {
  // Reach: the tree as it stands, then planted files the selftest glob does not collect, beside the ones it does.
  const tree = node([path.join(repoRoot, 'scripts', 'suite-accounting.mjs')], { cwd: repoRoot })
  assert.equal(tree.status, 0, `${tree.stdout}${tree.stderr}`)
  const named = "spawnSync('python3', [join(testDir, 'named.py')])\n"
  const files = {
    'tests/a.test.mjs': named, 'tests/sub/b.test.mjs': '', 'tests/c.spec.mjs': '', 'tests/d.test.js': '',
    'tests/named.py': '', 'tests/lost.py': '', 'tests/helpers/shard.mjs': '', 'core/hooks/x_test.go': '',
  }
  assert.deepEqual(unreached({ files: Object.keys(files), read: file => files[file] }).sort(),
    ['core/hooks/x_test.go', 'tests/c.spec.mjs', 'tests/d.test.js', 'tests/lost.py', 'tests/sub/b.test.mjs'])
  assert.deepEqual(unreached({ files: ['tests/a.test.mjs', 'tests/named.py'], read: () => "// named.py is only a comment here\n" }), ['tests/named.py'],
    'a file named only in a comment is not reached')

  // The reporter counts skips and names the ones that carry no reason, through the runner the selftest uses.
  const box = mkdtempSync(path.join(tmpdir(), 'qh-accounting-'))
  t.after(() => rmSync(box, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  mkdirSync(path.join(box, 'tests'))
  writeFileSync(path.join(box, 'tests', 'mixed.test.mjs'), "import test from 'node:test'\ntest('bare', { skip: true }, () => {})\ntest('said', { skip: 'no such tool here' }, () => {})\ntest('ran', () => {})\n")
  writeFileSync(path.join(box, 'tests', 'empty.test.mjs'), "import test from 'node:test'\n")
  const times = path.join(box, 'times.jsonl')
  const ran = node([path.join(repoRoot, 'scripts', 'run-tests.mjs'), '--times', times, '--', 'tests/mixed.test.mjs', 'tests/empty.test.mjs'], { cwd: box, env: { ...process.env, QH_SELFTEST_ROOT: box } })
  assert.equal(ran.status, 0, `${ran.stdout}${ran.stderr}`)
  const row = JSON.parse(readFileSync(times, 'utf8').trim().split('\n').at(-1))
  const mixed = row.files.find(entry => entry.file === 'tests/mixed.test.mjs')
  assert.deepEqual({ tests: mixed.tests, skipped: mixed.skipped, reasonless: mixed.reasonless }, { tests: 3, skipped: 2, reasonless: ['bare'] })
  // A file that registered nothing, and a bare skip, are findings; an exemption must be carried by a file that ran tests.
  const exempt = { 'tests/shard-1.test.mjs': { carriedBy: 'tests/helpers/shard.mjs', why: 'its tests register through the helper' } }
  const findings = rowFindings(row, {})
  assert.deepEqual(findings.map(f => f.kind).sort(), ['reasonless', 'zero'])
  assert.match(findings.find(f => f.kind === 'reasonless').text, /tests\/mixed\.test\.mjs.*bare/)
  const carried = { files: [{ file: 'tests/shard-1.test.mjs', tests: 0 }, { file: 'tests/helpers/shard.mjs', tests: 4 }] }
  assert.deepEqual(rowFindings(carried, exempt), [], 'an exempt file whose helper ran its tests')
  assert.deepEqual(rowFindings({ files: [{ file: 'tests/shard-1.test.mjs', tests: 0 }, { file: 'tests/helpers/shard.mjs', tests: 0 }] }, exempt).map(f => f.kind), ['uncarried'],
    'an exemption whose carrier ran nothing is not one')
  assert.deepEqual(rowFindings({ files: [{ file: 'tests/shard-1.test.mjs', tests: 2 }, { file: 'tests/helpers/shard.mjs', tests: 4 }] }, exempt).map(f => f.kind), ['stale'],
    'an exempt file that runs its own tests is a stale exemption')

  // QUALITY_HARNESS_REQUIRE turns a missing capability from a skip into a failure, and only where it is named.
  assert.equal(required('go', false, {}), false)
  assert.equal(required('go', 'go is not on PATH', {}), 'go is not on PATH')
  assert.throws(() => required('go', 'go is not on PATH', { QUALITY_HARNESS_REQUIRE: 'cli,go' }), /QUALITY_HARNESS_REQUIRE names go.*go is not on PATH/)
  assert.equal(required('go', 'go is not on PATH', { QUALITY_HARNESS_REQUIRE: 'gopher' }), 'go is not on PATH', 'a capability is named whole')
  const noPath = { ...process.env, PATH: '', QUALITY_HARNESS_QH_BIN: '' }
  const skipped = node(['--test', path.join(repoRoot, 'tests', 'qh-core-parity.test.mjs')], { cwd: repoRoot, env: noPath })
  assert.equal(skipped.status, 0, 'unrequired, a missing go is a skip with its reason')
  const failed = node(['--test', path.join(repoRoot, 'tests', 'qh-core-parity.test.mjs')], { cwd: repoRoot, env: { ...noPath, QUALITY_HARNESS_REQUIRE: 'go' } })
  assert.notEqual(failed.status, 0, 'required, it fails the file')
  assert.match(`${failed.stdout}${failed.stderr}`, /QUALITY_HARNESS_REQUIRE names go/)

  // Release evidence: the jobs the workflow declares at the sha, matrices expanded, against the jobs the run reports.
  const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8')
  const declared = declaredJobs(workflow)
  for (const name of ['coverage floor', 'mutations 1/48', 'mutations 48/48', 'go core (windows-latest)', 'selftest (macos-latest)']) assert.ok(declared.includes(name), name)
  const all = declared.map(name => ({ name, status: 'completed', conclusion: 'success' }))
  assert.deepEqual(missingJobs(declared, all), [])
  assert.deepEqual(missingJobs(declared, all.filter(job => job.name !== 'mutations 17/48')), ['mutations 17/48'])
  const run = jobs => ({ status: 'completed', conclusion: 'success', headSha: 'a'.repeat(40), event: 'workflow_dispatch', jobs })
  const quiet = { outside: () => ({ verdict: 'success', reason: 'ran', tag: 'v0' }), review: () => ({ verdict: 'success', reason: 'reviewed' }), log: () => {} }
  assert.equal(releaseEvidence(['a'.repeat(40)], { ...quiet, fetch: () => run(all), declared: () => declared }), 0, 'every declared job ran and passed')
  assert.equal(releaseEvidence(['a'.repeat(40)], { ...quiet, fetch: () => run(all.slice(1)), declared: () => declared }), 1, 'a declared job the run lacks is not a pass')
  assert.equal(releaseEvidence(['a'.repeat(40)], { ...quiet, fetch: () => run(all), declared: () => null }), 2, 'a workflow that cannot be read is could-not-look')
})

// The Codex review of 6641c951..4db47214: a row that left a collected file out passed, a file of empty suites counted as one
// that ran a test, and an unindented comment between jobs hid every job after it from release evidence.
test('a row that misses a collected file, an empty suite, and a comment between jobs are each seen', t => {
  const box = mkdtempSync(path.join(tmpdir(), 'qh-accounting-'))
  t.after(() => rmSync(box, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  mkdirSync(path.join(box, 'tests'))
  writeFileSync(path.join(box, 'tests', 'suites.test.mjs'), "import { describe } from 'node:test'\ndescribe('empty suite', () => {})\n")
  writeFileSync(path.join(box, 'tests', 'one.test.mjs'), "import { describe, it } from 'node:test'\ndescribe('a suite', () => { it('a test', () => {}) })\n")
  const times = path.join(box, 'times.jsonl')
  const ran = node([path.join(repoRoot, 'scripts', 'run-tests.mjs'), '--times', times, '--', 'tests/suites.test.mjs', 'tests/one.test.mjs'], { cwd: box, env: { ...process.env, QH_SELFTEST_ROOT: box } })
  assert.equal(ran.status, 0, `${ran.stdout}${ran.stderr}`)
  const row = JSON.parse(readFileSync(times, 'utf8').trim().split('\n').at(-1))
  assert.deepEqual(rowFindings(row, {}).map(found => `${found.kind} ${found.text.split(' ')[0]}`), ['zero tests/suites.test.mjs'],
    'a file of empty suites registered no test; a suite holding one did')
  assert.deepEqual(rowFindings(row, {}, ['tests/suites.test.mjs', 'tests/one.test.mjs', 'tests/gone.test.mjs']).map(found => found.kind).sort(), ['unrun', 'zero'],
    'a collected file the row does not hold is not known to have run')
  assert.deepEqual(rowFindings({ files: [{ file: 'tests/one.test.mjs' }] }, {}).map(found => found.kind), ['unreadable'], 'an entry with no count')
  // A comment or a blank line between jobs is neither the end of the jobs nor a job; a top-level key after them is the end.
  assert.deepEqual(declaredJobs('jobs:\n  build:\n    runs-on: x\n\n# the second job\n  test:\n    runs-on: x\n'), ['build', 'test'])
  assert.deepEqual(declaredJobs('jobs:\n  build:\n    runs-on: x\nenv:\n  test: 1\n'), ['build'])
  assert.equal(declaredJobs('jobs:\n  build: { runs-on: x }\n  test:\n    runs-on: x\n'), null, 'a job this cannot read is could-not-look, not a shorter list')
  assert.equal(declaredJobs('jobs:\nenv:\n'), null, 'a jobs block with no job')
})
