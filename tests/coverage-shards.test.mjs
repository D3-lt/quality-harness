// ADR-139 T2: the Python floor runs as shard jobs and one fan-in job under the required name. A fan-in is where a split gate
// fails open: GitHub skips a `needs:` job when a need fails, a skipped job satisfies a required check, and a matrix's aggregate
// result has read `success` with a leg cancelled before it started (the cold review of ADR-139, 2026-11-04). So the fan-in asks
// for every shard job by name and passes only when each concluded `success` and left a non-empty artifact.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { fanIn } from '../scripts/fan-in.mjs'
import { testBash } from './helpers/bash.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jobBlocks = workflow => workflow.split(/^(?= {2}[\w-]+:\n)/m).filter(block => /^ {2}[\w-]+:\n/.test(block))

const prefix = 'coverage floor (python)'
const artifact = 'py-coverage'
const goodJobs = () => [1, 2, 3].map(i => ({ name: `${prefix} ${i}/3`, status: 'completed', conclusion: 'success' }))
const goodArtifacts = () => [1, 2, 3].map(i => ({ name: `${artifact}-${i}-of-3`, size_in_bytes: 4096, expired: false }))
const judge = (jobs, artifacts) => fanIn({ jobs, artifacts, prefix, count: 3, artifact })

test('a fan-in passes only when every expected shard concluded success and left its data', () => {
  assert.deepEqual(judge(goodJobs(), goodArtifacts()), [], 'three successful shards with data pass')
  const unrelated = [...goodJobs(), { name: 'windows', status: 'in_progress', conclusion: null }, { name: `${prefix} fan-in`, status: 'in_progress', conclusion: null }]
  assert.deepEqual(judge(unrelated, goodArtifacts()), [], 'other jobs, the fan-in itself included, are not shards')

  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) {
    const jobs = goodJobs()
    jobs[1] = { ...jobs[1], conclusion, status: conclusion === null ? 'queued' : 'completed' }
    const problems = judge(jobs, goodArtifacts())
    assert.equal(problems.length, 1, `a shard that concluded ${conclusion} fails the fan-in`)
    assert.match(problems[0], /coverage floor \(python\) 2\/3/, 'and is named')
  }
  assert.match(judge(goodJobs().slice(1), goodArtifacts()).join('\n'), /1\/3.*(no such job|not found)/, 'a shard that never ran')
  assert.match(judge([...goodJobs(), goodJobs()[0]], goodArtifacts()).join('\n'), /1\/3.*2 times/, 'a shard listed twice')
  assert.match(judge([...goodJobs(), { name: `${prefix} 4/4`, status: 'completed', conclusion: 'success' }], goodArtifacts()).join('\n'), /4\/4/, 'a shard of another count')
  assert.match(judge(goodJobs(), goodArtifacts().slice(0, 2)).join('\n'), /py-coverage-3-of-3/, 'a missing artifact')
  const empty = goodArtifacts(); empty[0] = { ...empty[0], size_in_bytes: 0 }
  assert.match(judge(goodJobs(), empty).join('\n'), /py-coverage-1-of-3.*empty/, 'an empty artifact')
  const expired = goodArtifacts(); expired[2] = { ...expired[2], expired: true }
  assert.match(judge(goodJobs(), expired).join('\n'), /py-coverage-3-of-3.*expired/, 'an expired artifact')
  assert.throws(() => fanIn({ jobs: [], artifacts: [], prefix, count: 0, artifact }), /count/, 'a count of nothing is not a fan-in')

  // Could not look is not a pass: with no gh on PATH the CLI exits 2.
  const cli = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'fan-in.mjs'), '--prefix', prefix, '--count', '3', '--artifact', artifact],
    { encoding: 'utf8', timeout: 60_000, windowsHide: true, env: { PATH: '', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1' } })
  assert.equal(cli.status, 2, cli.stderr)
  assert.match(cli.stderr, /fan-in: could not look/)

  // The workflow: every job that calls the fan-in runs whatever its needs concluded, and needs the shards it judges.
  const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8')
  const fanIns = jobBlocks(workflow).filter(block => block.includes('scripts/fan-in.mjs'))
  assert.ok(fanIns.some(block => block.includes(`--prefix '${prefix}'`)), 'the Python floor has a fan-in')
  for (const block of fanIns) {
    assert.match(block, /^ {4}if: (?:always\(\)|\$\{\{ always\(\) \}\})$/m, `${block.split('\n')[0]} runs when a shard failed`)
    assert.match(block, /^ {4}needs: /m, `${block.split('\n')[0]} waits for its shards`)
    assert.match(block, /actions: read/, `${block.split('\n')[0]} may list the run's jobs`)
  }
})

const hasCoverage = spawnSync('python3', ['-c', 'import coverage'], { timeout: 60_000, windowsHide: true }).status === 0

test('the Python shards combine across checkout roots to the unsharded figure', { skip: hasCoverage ? false : 'coverage.py is not importable by python3 (the coverage jobs install it)' }, t => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'qh-coverage-shards-'))
  t.after(() => remove(scratch))
  const gate = 'import sys\nif sys.argv[1] == "a":\n    print("a")\nelse:\n    print("b")\n'
  const roots = ['one', 'two', 'three'].map(name => path.join(scratch, name, 'plugin'))
  for (const root of roots) { mkdirSync(path.join(root, 'bin'), { recursive: true }); mkdirSync(path.join(root, 'lib'), { recursive: true }); writeFileSync(path.join(root, 'bin', 'gate.py'), gate) }
  const shards = path.join(scratch, 'shards')
  const measure = (root, arm, dir) => {
    mkdirSync(dir, { recursive: true })
    const cfg = path.join(scratch, `${arm}.cfg`)
    writeFileSync(cfg, `[run]\nbranch = True\nparallel = True\ndata_file = ${path.join(dir, '.coverage')}\nsource =\n    ${path.join(root, 'bin')}\n`)
    const run = spawnSync('python3', ['-m', 'coverage', 'run', `--rcfile=${cfg}`, path.join(root, 'bin', 'gate.py'), arm], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, run.stderr)
  }
  measure(roots[0], 'a', path.join(shards, 'py-coverage-1-of-2'))
  measure(roots[1], 'b', path.join(shards, 'py-coverage-2-of-2'))
  const combine = (dir, floor) => spawnSync(testBash(), [path.join(repoRoot, 'scripts', 'coverage-combine.sh'), dir, '2', roots[2], String(floor)], { encoding: 'utf8', timeout: 120_000, windowsHide: true })

  const whole = combine(shards, 100)
  assert.equal(whole.status, 0, `${whole.stdout}\n${whole.stderr}`)
  assert.match(whole.stdout, /gate\.py.*100%/, 'both arms, measured under two other roots, count against the third')

  const half = path.join(scratch, 'half')
  cpSync(shards, half, { recursive: true })
  remove(path.join(half, 'py-coverage-2-of-2'))
  const missing = combine(half, 0)
  assert.equal(missing.status, 1, 'a missing shard fails, whatever the floor')
  assert.match(missing.stdout + missing.stderr, /py-coverage-2-of-2/)

  for (const [label, bytes] of [['empty', ''], ['corrupt', 'not a coverage database']]) {
    const bad = path.join(scratch, label)
    cpSync(shards, bad, { recursive: true })
    writeFileSync(path.join(bad, 'py-coverage-1-of-2', '.coverage.bad.1.x'), bytes)
    const refused = combine(bad, 0)
    assert.equal(refused.status, 1, `an ${label} data file fails, whatever the floor`)
    assert.match(refused.stdout + refused.stderr, /\.coverage\.bad\.1\.x/, 'and is named')
  }
  assert.ok(readdirSync(path.join(shards, 'py-coverage-1-of-2')).length > 0)
})
