import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const testDir = path.dirname(fileURLToPath(import.meta.url))
const workflowDir = path.resolve(testDir, '../plugin/workflows')
const qualityCycle = path.join(workflowDir, 'quality-cycle.js')
const bundledSkills = path.resolve(testDir, '../plugin/skills')

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
  const review = await readFile(path.join(bundledSkills, 'codex-review/SKILL.md'), 'utf8')
  const advise = await readFile(path.join(bundledSkills, 'codex-advise/SKILL.md'), 'utf8')

  assert.ok((review.match(/CODEX-REVIEW-LEAF:/g) || []).length >= 3)
  assert.match(review, /Do not invoke `codex-review`, launch another `codex exec`/)
  assert.ok((advise.match(/CODEX-ADVISE-LEAF:/g) || []).length >= 2)
  assert.match(advise, /Do not invoke `codex-advise`, launch another/)
})

// ADR-029 T1. Ten agent() calls across three shipped workflows and, before this
// record, not one said what capability its role needed. The roles are not
// interchangeable — a synthesiser that arbitrates conflicting findings and a
// fixer told to make the smallest possible edit are different work — so the
// default was wrong rather than merely unspecified.
const AGENT_CALL = /\bagent\(/g

function shippedWorkflowSources() {
  return readdirSync(workflowDir).filter(f => f.endsWith('.js'))
    .map(f => ({ file: f, text: readFileSync(join(workflowDir, f), 'utf8') }))
}

test('every spawned role declares the capability it needs', () => {
  // Derived from the SOURCES, never from a list kept beside them: a new workflow
  // or a new role joins this check by existing, which is the property a
  // hand-maintained roster cannot have.
  const sources = shippedWorkflowSources()
  assert.ok(sources.length >= 3, `the sweep must find the real workflows: ${sources.length}`)

  const calls = sources.flatMap(({ file, text }) =>
    [...text.matchAll(AGENT_CALL)].map(m => ({ file, at: m.index })))
  assert.ok(calls.length >= 10,
    `the sweep must find the real calls, not a subset: ${calls.length}`)

  // A call's options object is the text from the call to the end of its statement;
  // `model:` must appear within it. Crude on purpose — a parser here would be a
  // second implementation of JavaScript, and the property is textual.
  const undeclared = []
  for (const { file, text } of sources) {
    for (const m of text.matchAll(AGENT_CALL)) {
      const window = text.slice(m.index, text.indexOf('\n\n', m.index) + 1 || undefined)
      if (!/\bmodel:\s*'[a-z]+'/.test(window)) undeclared.push(`${file}@${m.index}`)
    }
  }
  assert.deepEqual(undeclared, [],
    'these roles inherit whatever ran instead of asking for what they need')
})

test('a role names a capability class, never a pinned model id', () => {
  // A shipped artifact naming `claude-opus-5` is a stored fact about a catalogue
  // this project does not control, and it rots exactly like the skill count and
  // the ablation figure deleted this week. An alias requests a CLASS and lets the
  // host bind it at call time.
  for (const { file, text } of shippedWorkflowSources()) {
    assert.doesNotMatch(text, /model:\s*'claude-[a-z]+-\d/,
      `${file}: a pinned model id is a stored fact about a catalogue we do not own`)
  }
  // Shown able to recognise what it forbids, or it passes for any file at all.
  assert.match("model: 'claude-opus-5'", /model:\s*'claude-[a-z]+-\d/)
  assert.doesNotMatch("model: 'opus'", /model:\s*'claude-[a-z]+-\d/)
})
