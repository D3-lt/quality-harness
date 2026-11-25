// ADR-146 T2: the seed job asks scripts/landing-class.mjs whether the landing only re-pins the catalogue, the shards and
// the merge skip only on its `skip=1`, and release-evidence still refuses a run whose shards were skipped or are absent.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { declaredJobs, landingIsFullAt, main } from '../scripts/release-evidence.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = readFileSync(path.join(repoRoot, '.github', 'workflows', 'selftest.yml'), 'utf8').replaceAll('\r\n', '\n')
const SHA = 'a'.repeat(40)
const SKIP = "needs.mutation-cache-seed.outputs.skip != '1'"

// Each job's own text by its id: the lines under a two-space key, up to the next one.
function jobsOf(workflow) {
  const jobs = new Map()
  let id = null
  for (const line of workflow.slice(workflow.search(/^jobs:$/m)).split('\n')) {
    const head = /^ {2}([\w-]+):\s*$/.exec(line)
    if (head) { id = head[1]; jobs.set(id, '') } else if (id) jobs.set(id, `${jobs.get(id)}${line}\n`)
  }
  return jobs
}
const own = (job, key) => job.split('\n').filter(line => line.startsWith(`    ${key}:`))

/** What in a workflow's text breaks ADR-146 Decision 3; empty when nothing does. */
function problems(workflow) {
  const jobs = jobsOf(workflow)
  const [seed, shards, merge] = ['mutation-cache-seed', 'mutations', 'mutation-cache'].map(id => jobs.get(id) ?? '')
  const found = []
  if (!/^ {6}- uses: actions\/checkout@v\d+\n {8}with:\n {10}fetch-depth: 2$/m.test(seed)) found.push('the seed job does not check out the commit with its parent')
  if (!/^ {6}- name: [^\n]+\n {8}id: landing\n {8}run: node scripts\/landing-class\.mjs$/m.test(seed)) found.push('the seed job does not run the class script as the step `landing`')
  if (!/^ {4}outputs:\n {6}skip: \$\{\{ steps\.landing\.outputs\.skip \}\}$/m.test(seed)) found.push('the seed job does not expose `skip` from the class step')
  if (own(shards, 'needs').join() !== '    needs: mutation-cache-seed') found.push('the shards do not need the seed job alone')
  if (own(shards, 'if').join() !== `    if: ${SKIP}`) found.push('the shards do not carry exactly the skip condition')
  if (own(merge, 'needs').join() !== '    needs: [mutations, mutation-cache-seed]') found.push('the merge does not need the shards and the seed job')
  if (own(merge, 'if').join() !== `    if: \${{ always() && ${SKIP} }}`) found.push('the merge does not carry exactly its condition')
  for (const [id, job] of jobs) {
    if (['mutation-cache-seed', 'mutations', 'mutation-cache'].includes(id)) continue
    if (/outputs\.skip|landing-class/.test(job)) found.push(`the job ${id} reads the skip output`)
  }
  return found
}

test('the campaign is skipped only on the seed job\'s positive answer', () => {
  assert.deepEqual(problems(WORKFLOW), [])
  assert.equal(landingIsFullAt(SHA, () => WORKFLOW), true, 'the full-campaign line is the one release-evidence matches')
  const standIns = [
    ['the condition inverted', w => w.replace(`    if: ${SKIP}`, `    if: ${SKIP.replace('!=', '==')}`), 'the shards do not carry exactly the skip condition'],
    ['the condition dropped', w => w.replace(`    if: ${SKIP}\n`, ''), 'the shards do not carry exactly the skip condition'],
    ['a status function beside it', w => w.replace(`    if: ${SKIP}`, `    if: \${{ always() && ${SKIP} }}`), 'the shards do not carry exactly the skip condition'],
    ['the shards needing more', w => w.replace('    needs: mutation-cache-seed\n', '    needs: [mutation-cache-seed, selftest]\n'), 'the shards do not need the seed job alone'],
    ['the output read from another step', w => w.replace('steps.landing.outputs.skip', 'steps.publish.outputs.skip'), 'the seed job does not expose `skip` from the class step'],
    ['the class step running something else', w => w.replace('run: node scripts/landing-class.mjs', 'run: echo skip=1 >> "$GITHUB_OUTPUT"'), 'the seed job does not run the class script as the step `landing`'],
    ['a shallow checkout without the parent', w => w.replace('          fetch-depth: 2\n', '          fetch-depth: 1\n'), 'the seed job does not check out the commit with its parent'],
    ['the merge running on a skipped campaign', w => w.replace(`    if: \${{ always() && ${SKIP} }}`, '    if: always()'), 'the merge does not carry exactly its condition'],
    ['the condition on a required job', w => w.replace('    name: windows\n', `    name: windows\n    if: ${SKIP}\n`), 'the job windows reads the skip output'],
  ]
  for (const [what, edit, problem] of standIns) {
    const edited = edit(WORKFLOW)
    assert.notEqual(edited, WORKFLOW, `${what}: the stand-in changed nothing`)
    assert.ok(problems(edited).includes(problem), `${what}: ${problems(edited).join('; ') || 'nothing found'}`)
  }
  // No required check of main is one of the three campaign jobs.
  const required = JSON.parse(readFileSync(path.join(repoRoot, '.github', 'rulesets', 'main.json'), 'utf8'))
    .rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks.map(check => check.context)
  assert.ok(required.length > 0)
  for (const context of required) assert.doesNotMatch(context, /^mutation/, `${context} would be skipped on a pin landing`)
})

test('a run whose shards were skipped or are absent is not a release run', () => {
  const declared = declaredJobs(WORKFLOW)
  const shards = declared.filter(name => /^mutations \d+\/\d+$/.test(name))
  assert.ok(shards.length > 1, 'the workflow declares its shards')
  const done = name => ({ name, status: 'completed', conclusion: 'success' })
  const said = []
  // release-evidence's command line over one landing run, with the workflow's own declared jobs.
  const asked = jobs => {
    said.length = 0
    return main([SHA], {
      fetch: () => ({ status: 'completed', conclusion: 'success', headSha: SHA, headBranch: `land/${SHA}`, event: 'push', jobs }),
      declared: () => declared, full: () => true, forge: null, log: line => said.push(line),
      outside: () => ({ verdict: 'success', reason: 'attested', tag: 'v1.0.0' }), review: () => ({ verdict: 'success', reason: 'reviewed' }),
    })
  }
  assert.equal(asked(declared.map(done)), 0, 'every declared job succeeded')
  const rest = declared.filter(name => !shards.includes(name) && name !== 'mutation cache').map(done)
  // The forge lists a matrix job skipped before it expanded as one job, under the job's own name.
  for (const name of ['mutations', 'mutations ${{ matrix.shard }}/48']) {
    assert.notEqual(asked([...rest, { name, status: 'completed', conclusion: 'skipped' }, { name: 'mutation cache', status: 'completed', conclusion: 'skipped' }]), 0, name)
    assert.match(said.join('\n'), /FAILED .*mutation[^,]*: skipped/, `${name}: the skipped conclusion itself is what is refused`)
  }
  // Or as every shard by name, each skipped: then no declared job is absent, and only the conclusion says it.
  const skipped = name => ({ name, status: 'completed', conclusion: 'skipped' })
  assert.notEqual(asked([...rest, ...shards.map(skipped), skipped('mutation cache')]), 0, 'every shard listed and skipped')
  assert.match(said.join('\n'), /FAILED .*mutations 1\/\d+: skipped/)
  assert.notEqual(asked(rest), 0, 'no shard listed at all')
  assert.match(said.join('\n'), /FAILED .*lacks \d+ job\(s\) the workflow declares: .*mutations 1\//)
  assert.notEqual(asked([...rest, ...shards.map(done)]), 0, 'the merge job absent')
})
