export const meta = {
  name: 'quality-cycle',
  description: 'Read-only high-risk review: correctness and scope/simplicity passes, optional Codex, then one evidence-bound synthesis',
  whenToUse: 'After caller-observed validation for high-risk changes. args: {repo, scope, requirements, nonGoals, evidence, codex, cursor, pi, externalReviews}. codex/cursor/pi each REQUEST a host review: first run node ${CLAUDE_PLUGIN_ROOT}/scripts/host-review.mjs --host <host> --repo <root> --scope <scope> and pass its JSON in externalReviews, or the cycle is reviewer-unavailable. Not for tiny or routine changes.',
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

const LEAF = `You are an assigned read-only leaf reviewer. Do not invoke /quality-harness:work, /quality-harness:consensus, /quality-harness:review-ring, /quality-harness:quality-cycle, or spawn another agent. Stay inside the supplied diff and requirements. Do not propose new features, broad cleanup, speculative abstractions, configuration, fallbacks, or compatibility layers.`
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
  () => agent(`${LEAF}\n${TARGET}\nReview correctness, security/safety, contracts, state transitions, error paths, and integration wiring. A blocker must be in scope, material, exactly evidenced, reproducible or contract-backed, and minimally fixable. Passing evidence must be addressed, not ignored.`, { label: 'correctness', phase: 'Review', schema: REVIEW, model: 'opus', agentType: 'quality-harness:qh-correctness-reviewer' }),
  () => agent(`${LEAF}\n${TARGET}\nReview scope and design economy. Distinguish duplicated knowledge from similar syntax. Treat SOLID as a diagnostic for real ownership or substitution seams, not a demand for more layers. Block complexity only when it creates a concrete correctness or maintenance defect in the current requirements; otherwise mark it advisory.`, { label: 'scope-simplicity', phase: 'Review', schema: REVIEW, model: 'haiku', agentType: 'quality-harness:qh-scope-reviewer' }),
]

const requested = [...(codex === true ? ['codex'] : []), ...(A.pi === true ? ['pi'] : []), ...(A.cursor === true ? ['cursor'] : [])]
const externalReviews = Array.isArray(A.externalReviews) ? A.externalReviews : []
// A host result must BE a review: the REVIEW schema, with a host. `{host}` alone
// satisfied "a result was passed" and the cycle went on to certify clean (Codex
// review, 2026-09-22). host-review.mjs applies the same rule before it returns.
const FINDING = REVIEW.properties.findings.items
const wellFormed = review => review && typeof review === 'object' && typeof review.host === 'string'
  && REVIEW.properties.status.enum.includes(review.status) && Array.isArray(review.findings)
  && review.findings.every(finding => finding && typeof finding === 'object'
    && FINDING.required.every(key => key === 'severity'
      ? FINDING.properties.severity.enum.includes(finding.severity)
      : typeof finding[key] === 'string'))
  // The status must agree with the findings, as host-review.mjs `validReview`
  // requires: blocking with no blocking finding, or clean with one, is not a
  // review (Codex review round 2). The workflow cannot import that module.
  && (review.status === 'blocking' ? review.findings.some(finding => finding.severity === 'blocking')
    : review.status === 'clean' ? !review.findings.some(finding => finding.severity === 'blocking') : true)
// ⚠ AN UNAVAILABLE CYCLE SAYS WHY, and what to run. It returned in milliseconds
// with no reason when `codex: true` came without its result, which reads from
// outside as "review is impossible" (reported by a peer, 2026-09-22).
const malformed = externalReviews.filter(review => !wellFormed(review)).length
const missingHosts = requested.filter(host => !externalReviews.some(review => wellFormed(review) && review.host === host))
if (malformed || missingHosts.length) {
  const reasons = []
  if (malformed) reasons.push(`${malformed} externalReviews entr${malformed === 1 ? 'y is' : 'ies are'} not the review schema`)
  for (const host of missingHosts) {
    reasons.push('no result for the requested ' + host + ' review: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/host-review.mjs --host ' + host
      + ' --repo <root> --scope <scope>` and pass its JSON in externalReviews, or drop `' + host + ': true`')
  }
  return { status: 'reviewer-unavailable', reason: reasons.join('; '), evidence, reviews: externalReviews }
}

phase('Review')
const reviewerLabels = ['correctness', 'scope-simplicity']
const returned = await parallel(reviewerTasks)
const agentReviews = returned.filter(Boolean)
const reviews = [...externalReviews, ...agentReviews]
if (agentReviews.length !== reviewerTasks.length) {
  const silent = reviewerLabels.filter((_, index) => !returned[index])
  return { status: 'reviewer-unavailable', reason: `reviewer returned nothing: ${silent.join(', ')}`, evidence, reviews }
}
if (reviews.some(review => review.status === 'unavailable')) {
  return { status: 'reviewer-unavailable', reason: 'a reviewer reported itself unavailable; its review is in `reviews`', evidence, reviews }
}
const reviewerEvidenceLimited = reviews.some(review => review.status === 'evidence-limited')

phase('Synthesize')
const synthesis = await agent(`${LEAF}\n${TARGET}\nIndependent reviews: ${JSON.stringify(reviews)}. Deduplicate findings. A finding is blocking only if all are true: in stated scope or caused by the diff; material to correctness/security/data/required behavior/concrete maintainability; exact evidence; minimal in-scope remedy; and an explanation of why passing checks do not settle it. Downgrade style, future-proofing, architecture alternatives, speculative edges, and optional cleanup. Do not invent findings.`, { label: 'synthesis', phase: 'Synthesize', schema: REVIEW, model: 'opus', agentType: 'quality-harness:qh-synthesis' })

if (!synthesis) return { status: 'reviewer-unavailable', reason: 'the synthesis reviewer returned nothing', evidence, reviews }
if (synthesis.status === 'unavailable') {
  return { status: 'reviewer-unavailable', reason: 'the synthesis reviewer reported itself unavailable', evidence, reviews }
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
