export const meta = {
  name: 'quality-cycle',
  description: 'Read-only high-risk review: correctness and scope/simplicity passes, optional Codex, then one evidence-bound synthesis',
  whenToUse: 'After caller-observed validation for high-risk changes. args: {repo, scope, requirements, nonGoals, evidence, codex}. Not for tiny or routine changes.',
  phases: [{ title: 'Review' }, { title: 'Synthesize' }],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const { repo, scope = 'uncommitted', requirements = '', nonGoals = '', evidence, codex = false } = A

if (typeof repo !== 'string' || !repo.startsWith('/') || /[\0\r\n]/.test(repo)) {
  throw new Error('args.repo required (absolute POSIX path without control characters)')
}
if (typeof scope !== 'string' || !scope || /[\0\r\n]/.test(scope)) {
  throw new Error('args.scope required')
}
if (typeof requirements !== 'string' || typeof nonGoals !== 'string') {
  throw new Error('args.requirements and args.nonGoals must be strings')
}
if (!evidence || !['executed', 'unavailable'].includes(evidence.status)
    || typeof evidence.command !== 'string' || typeof evidence.summary !== 'string'
    || (evidence.status === 'executed'
      && (!evidence.command.trim() || !Number.isInteger(evidence.exitCode)))
    || (evidence.status === 'unavailable' && evidence.exitCode !== null)) {
  throw new Error('args.evidence must be {status, command, exitCode, summary}')
}
if (evidence.status === 'executed' && evidence.exitCode !== 0) {
  return { status: 'gate-failed', evidence }
}

const LEAF = `You are an assigned read-only leaf reviewer. Do not invoke /work, consensus, review-ring, quality-cycle, or spawn another agent. Stay inside the supplied diff and requirements. Do not propose new features, broad cleanup, speculative abstractions, configuration, fallbacks, or compatibility layers.`
const TARGET = `Repository: ${JSON.stringify(repo)}. Scope: ${JSON.stringify(scope)}. Requirements: ${JSON.stringify(requirements || 'use repository-owned acceptance criteria')}. Non-goals: ${JSON.stringify(nonGoals || 'no new scope')}. Caller-observed evidence (immutable): ${JSON.stringify(evidence)}.`

const REVIEW = {
  type: 'object',
  required: ['status', 'findings'],
  properties: {
    status: { type: 'string', enum: ['clean', 'blocking', 'evidence-limited', 'unavailable'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'problem', 'impact', 'evidence', 'minimal_fix', 'severity'],
        properties: {
          file: { type: 'string' }, line: { type: 'number' }, problem: { type: 'string' },
          impact: { type: 'string' }, evidence: { type: 'string' }, minimal_fix: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'advisory'] },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const reviewerTasks = [
  () => agent(`${LEAF}\n${TARGET}\nReview correctness, security/safety, contracts, state transitions, error paths, and integration wiring. A blocker must be in scope, material, exactly evidenced, reproducible or contract-backed, and minimally fixable. Passing evidence must be addressed, not ignored.`, { label: 'correctness', phase: 'Review', schema: REVIEW }),
  () => agent(`${LEAF}\n${TARGET}\nReview scope and design economy. Distinguish duplicated knowledge from similar syntax. Treat SOLID as a diagnostic for real ownership or substitution seams, not a demand for more layers. Block complexity only when it creates a concrete correctness or maintenance defect in the current requirements; otherwise mark it advisory.`, { label: 'scope-simplicity', phase: 'Review', schema: REVIEW }),
]

if (codex) {
  reviewerTasks.push(() => agent(`${LEAF}\n${TARGET}\nInvoke the universal codex-review skill on this exact target. Let it route high, xhigh, or ultra from actual risk and breadth. Translate only its evidence-backed material findings into the schema. If Codex is unavailable or empty, return status unavailable; never substitute a Claude-only clean verdict.`, { label: 'codex-external', phase: 'Review', schema: REVIEW }))
}

phase('Review')
const reviews = (await parallel(reviewerTasks)).filter(Boolean)
if (reviews.length !== reviewerTasks.length) {
  return { status: 'reviewer-unavailable', evidence, reviews }
}
if (reviews.some(review => review.status === 'unavailable')) {
  return { status: 'reviewer-unavailable', evidence, reviews }
}
const reviewerEvidenceLimited = reviews.some(review => review.status === 'evidence-limited')

phase('Synthesize')
const synthesis = await agent(`${LEAF}\n${TARGET}\nIndependent reviews: ${JSON.stringify(reviews)}. Deduplicate findings. A finding is blocking only if all are true: in stated scope or caused by the diff; material to correctness/security/data/required behavior/concrete maintainability; exact evidence; minimal in-scope remedy; and an explanation of why passing checks do not settle it. Downgrade style, future-proofing, architecture alternatives, speculative edges, and optional cleanup. Do not invent findings.`, { label: 'synthesis', phase: 'Synthesize', schema: REVIEW })

if (!synthesis) return { status: 'reviewer-unavailable', evidence, reviews }
if (synthesis.status === 'unavailable') {
  return { status: 'reviewer-unavailable', evidence, reviews }
}
const blockers = synthesis.findings.filter(finding => finding.severity === 'blocking')
if (reviewerEvidenceLimited
    || synthesis.status === 'evidence-limited'
    || (evidence.status === 'unavailable' && synthesis.status === 'clean')) {
  return { status: 'evidence-limited', evidence, findings: synthesis.findings, reviews }
}
if ((synthesis.status === 'clean' && blockers.length)
    || (synthesis.status === 'blocking' && !blockers.length)) {
  return { status: 'aborted', reason: 'synthesis status/findings mismatch', evidence, reviews }
}
return {
  status: blockers.length ? 'blocking' : evidence.status === 'unavailable' ? 'evidence-limited' : 'clean',
  evidence,
  findings: synthesis.findings,
  reviews,
}
