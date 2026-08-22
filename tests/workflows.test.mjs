import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const testDir = path.dirname(fileURLToPath(import.meta.url))
const workflowDir = path.resolve(testDir, '../../../workflows')
const qualityCycle = path.resolve(testDir, '../workflows/quality-cycle.js')
const installedSkills = path.resolve(testDir, '../..')

async function runWorkflow(file, args, agent) {
  const source = (await readFile(file, 'utf8')).replace('export const meta =', 'const meta =')
  const execute = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', source)
  return execute(
    args,
    agent,
    tasks => Promise.all(tasks.map(task => task())),
    () => {},
    () => {},
  )
}

const passingEvidence = {
  status: 'executed',
  command: 'npm test',
  exitCode: 0,
  summary: '12 tests passed',
}

const blocker = {
  severity: 'blocking',
  file: 'src/a.js',
  contract: 'invalid input must be rejected',
  path: 'handler reaches persistence without validation',
  impact: 'invalid state is stored',
  fix: 'validate before persistence',
}

test('review-ring rejects malformed or failing caller evidence before dispatch', async () => {
  const file = path.join(workflowDir, 'review-ring.js')
  let calls = 0
  const agent = async () => { calls += 1 }

  await assert.rejects(
    runWorkflow(file, { repo: '/repo', evidence: { status: 'executed' } }, agent),
    /immutable caller-observed evidence/,
  )

  const result = await runWorkflow(file, {
    repo: '/repo',
    evidence: { ...passingEvidence, exitCode: 1, summary: '1 test failed' },
  }, agent)
  assert.equal(result.status, 'gate-failed')
  assert.equal(calls, 0)
})

test('review-ring cannot turn unavailable evidence into a clean verdict', async () => {
  const result = await runWorkflow(path.join(workflowDir, 'review-ring.js'), {
    repo: '/repo',
    evidence: { status: 'unavailable', command: '', exitCode: null, summary: 'no test runner' },
  }, async () => ({ verdict: 'clean', findings: [], evidence: 'read-only inspection' }))
  assert.equal(result.status, 'evidence-limited')
})

test('review-ring makes at most one fix and returns control for revalidation', async () => {
  const prompts = []
  const replies = [
    { verdict: 'blocking', findings: [blocker], evidence: 'src/a.js:10' },
    { files_changed: ['src/a.js'], test_result: 'npm test, exit 0', notes: 'added validation' },
  ]
  const result = await runWorkflow(path.join(workflowDir, 'review-ring.js'), {
    repo: '/repo', evidence: passingEvidence,
  }, async prompt => {
    prompts.push(prompt)
    return replies.shift()
  })

  assert.equal(result.status, 'revalidation-required')
  assert.equal(prompts.length, 2)
  assert.match(prompts[0], /read-only REVIEWER and a leaf role/)
  assert.match(prompts[1], /narrowly scoped FIXER and a leaf role/)
  assert.match(prompts[1], /smallest focused repository-owned check/)
})

test('review-ring accepts a consistent clean verdict after passing evidence', async () => {
  const result = await runWorkflow(path.join(workflowDir, 'review-ring.js'), {
    repo: '/repo', evidence: passingEvidence,
  }, async () => ({ verdict: 'clean', findings: [], evidence: 'inspected diff and callers' }))
  assert.equal(result.status, 'clean')
})

test('consensus roles remain read-only leaves and synthesize one minimal decision', async () => {
  const prompts = []
  const result = await runWorkflow(path.join(workflowDir, 'consensus.js'), {
    question: 'Which persistence boundary should own retries?', drafters: 2,
  }, async (prompt, options) => {
    prompts.push(prompt)
    if (options.label.startsWith('draft:')) {
      return { lens: options.label, plan: 'one owner', key_bets: ['retries are local'], rejected: 'extra layer' }
    }
    if (options.label.startsWith('critique:')) {
      return { target_lens: options.label, attacks: [], salvage: ['one owner'] }
    }
    return '## Decision\nOne owner.'
  })

  assert.equal(result.synthesis, '## Decision\nOne owner.')
  assert.equal(prompts.length, 5)
  assert.ok(prompts.every(prompt => prompt.includes('read-only leaf role')))
  assert.match(prompts.at(-1), /one decision/)
})

test('quality-cycle fails closed when a required reviewer is unavailable', async () => {
  const replies = [
    { status: 'clean', findings: [] },
    { status: 'unavailable', findings: [], notes: 'reviewer failed' },
  ]
  const result = await runWorkflow(qualityCycle, {
    repo: '/repo', scope: 'uncommitted', evidence: passingEvidence,
  }, async () => replies.shift())
  assert.equal(result.status, 'reviewer-unavailable')
})

test('quality-cycle preserves unavailable caller evidence through synthesis', async () => {
  const prompts = []
  const replies = [
    { status: 'clean', findings: [] },
    { status: 'clean', findings: [] },
    { status: 'clean', findings: [] },
  ]
  const result = await runWorkflow(qualityCycle, {
    repo: '/repo', scope: 'uncommitted',
    evidence: { status: 'unavailable', command: '', exitCode: null, summary: 'runner missing' },
  }, async prompt => {
    prompts.push(prompt)
    return replies.shift()
  })
  assert.equal(result.status, 'evidence-limited')
  assert.ok(prompts.every(prompt => prompt.includes('read-only leaf reviewer')))
})

test('quality-cycle cannot synthesize a required evidence-limited review into clean', async () => {
  const replies = [
    { status: 'evidence-limited', findings: [], notes: 'integration wiring was unavailable' },
    { status: 'clean', findings: [] },
    { status: 'clean', findings: [] },
  ]
  const result = await runWorkflow(qualityCycle, {
    repo: '/repo', scope: 'uncommitted', evidence: passingEvidence,
  }, async () => replies.shift())

  assert.equal(result.status, 'evidence-limited')
  assert.equal(result.reviews[0].status, 'evidence-limited')
})

test('Codex review and advice skills mark spawned sessions as non-recursive leaves', async () => {
  const review = await readFile(path.join(installedSkills, 'codex-review/SKILL.md'), 'utf8')
  const advise = await readFile(path.join(installedSkills, 'codex-advise/SKILL.md'), 'utf8')

  assert.ok((review.match(/CODEX-REVIEW-LEAF:/g) || []).length >= 3)
  assert.match(review, /Do not invoke `codex-review`, launch another `codex exec`/)
  assert.ok((advise.match(/CODEX-ADVISE-LEAF:/g) || []).length >= 2)
  assert.match(advise, /Do not invoke `codex-advise`, launch another/)
})
