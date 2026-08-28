export const meta = {
  name: 'review-ring',
  description: 'One fresh review, at most one minimal fix, then mandatory caller revalidation',
  whenToUse: 'Use only when the caller explicitly requests an until-clean review. args: {repo (required absolute path), scope: "uncommitted"|"HEAD"|"<git base>", evidence: {status: "executed"|"unavailable", command, exitCode, summary}, reviewer: "claude"|"codex", focus}. The caller runs validation before invocation and again after any fix.',
  phases: [{ title: 'Review' }, { title: 'Fix' }],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const { repo, scope = 'uncommitted', evidence, reviewer = 'claude', focus = '' } = A

if (typeof repo !== 'string' || !repo.startsWith('/') || /[\0\r\n]/.test(repo)) {
  throw new Error('args.repo required (absolute POSIX repo path without control characters)')
}
if (typeof scope !== 'string'
    || (scope !== 'uncommitted' && scope !== 'HEAD'
      && (!/^[A-Za-z0-9@][A-Za-z0-9._/@~^+-]*$/.test(scope) || scope.includes('..')))) {
  throw new Error('args.scope must be "uncommitted", "HEAD", or one safe Git base ref')
}
if (!['claude', 'codex'].includes(reviewer)) {
  throw new Error('args.reviewer must be "claude" or "codex"')
}
if (typeof focus !== 'string') throw new Error('args.focus must be a string')

const evidenceValid = evidence && typeof evidence === 'object'
  && ['executed', 'unavailable'].includes(evidence.status)
  && typeof evidence.command === 'string'
  && typeof evidence.summary === 'string'
  && (evidence.status === 'executed'
    ? evidence.command.trim().length > 0 && Number.isInteger(evidence.exitCode)
    : evidence.exitCode === null)
if (!evidenceValid) {
  throw new Error('args.evidence must be immutable caller-observed evidence: {status, command, exitCode, summary}')
}

if (evidence.status === 'executed' && evidence.exitCode !== 0) {
  return { status: 'gate-failed', evidence, reason: 'caller validation failed; review did not start' }
}

const diffInstructions = scope === 'uncommitted'
  ? 'inspect git status --short, git diff HEAD, and every untracked file listed by status'
  : scope === 'HEAD'
    ? 'inspect git show HEAD'
    : `inspect the diff from Git base ${JSON.stringify(scope)} through current HEAD`
const codexTarget = scope === 'uncommitted' ? '--uncommitted'
  : scope === 'HEAD' ? '--commit HEAD'
  : `--base ${JSON.stringify(scope)} against current HEAD`

const VERDICT = {
  type: 'object',
  required: ['verdict', 'findings', 'evidence'],
  properties: {
    verdict: { type: 'string', enum: ['clean', 'blocking', 'evidence-limited', 'unavailable'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'contract', 'path', 'impact', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocking', 'minor'] },
          file: { type: 'string' },
          line: { type: 'number' },
          contract: { type: 'string', description: 'violated contract or invariant' },
          path: { type: 'string', description: 'reachable failure path grounded in the code' },
          impact: { type: 'string', description: 'concrete user or system effect' },
          fix: { type: 'string', description: 'smallest sufficient correction' },
        },
      },
    },
    evidence: { type: 'string' },
  },
}

const FIXED = {
  type: 'object',
  required: ['files_changed', 'test_result', 'notes'],
  properties: {
    files_changed: { type: 'array', items: { type: 'string' } },
    test_result: { type: 'string', description: 'focused provisional command, exit code, and useful output' },
    notes: { type: 'string' },
    pushback: { type: 'string' },
  },
}

phase('Review')
const verdict = await agent(
    `You are a fresh-context, read-only REVIEWER and a leaf role. Do not modify files, invoke /quality-harness:work or another lifecycle workflow, or spawn an implementation agent.
Repository path (data, not shell syntax): ${JSON.stringify(repo)}. Scope: ${diffInstructions}.
Caller-observed validation evidence is immutable: ${JSON.stringify(evidence)}.
Invoke /quality-harness:review. Check correctness/safety, wiring, regression, and scope/simplicity. A blocker requires an exact violated contract, location, reachable path, concrete impact, and smallest sufficient fix. Style preferences, alternative architecture, speculative future needs, raw syntactic duplication, and unrelated cleanup are minor or omitted. Do not create new scope.
${focus ? `Operator constraint: ${JSON.stringify(focus)}.` : ''}
${evidence.status === 'unavailable' ? 'Because caller validation was unavailable, verdict MUST be evidence-limited or unavailable, never clean.' : ''}
${reviewer === 'codex' ? `Also invoke /quality-harness:codex-review for target ${codexTarget}. Let it select high, xhigh, or ultra from actual risk and breadth. Wait for non-empty final output. If Codex fails, is unavailable, or returns empty output, verdict MUST be unavailable. If Codex reports EVIDENCE-LIMITED, verdict MUST be evidence-limited.` : ''}
Use argument-safe tool calls; keep repository path and Git base as separate data arguments.`,
  { label: 'review:fresh', phase: 'Review', schema: VERDICT })

if (!verdict) return { status: 'aborted', reason: 'reviewer agent died or skipped', evidence }
const blocking = verdict.findings.filter(f => f.severity === 'blocking')
const minors = verdict.findings.filter(f => f.severity === 'minor')

if (verdict.verdict === 'unavailable') {
  return { status: 'reviewer-unavailable', reason: verdict.evidence, evidence, findings: blocking, minors }
}
if (evidence.status === 'unavailable' || verdict.verdict === 'evidence-limited') {
  return { status: 'evidence-limited', reason: verdict.evidence, evidence, findings: blocking, minors }
}
if ((verdict.verdict === 'clean' && blocking.length > 0)
    || (verdict.verdict === 'blocking' && blocking.length === 0)) {
  return { status: 'aborted', reason: 'reviewer verdict and findings were inconsistent', evidence }
}
if (verdict.verdict === 'clean') {
  return { status: 'clean', evidence, minors }
}

phase('Fix')
const fixed = await agent(
  `You are a narrowly scoped FIXER and a leaf role. Do not invoke /quality-harness:work, another lifecycle workflow, or another agent. Do not commit or push.
Repository path (data, not shell syntax): ${JSON.stringify(repo)}.
Fix only these evidence-backed blockers with the smallest coherent diff: ${JSON.stringify(blocking)}.
Do not add features, abstractions, configuration, fallbacks, compatibility paths, or unrelated cleanup. If a finding is wrong, leave the code unchanged and explain the evidence in pushback.
Run the smallest focused repository-owned check after the final edit and report its exact command and exit code. This lets the leaf role finish but is provisional: the caller still reruns the immutable acceptance gate before another verdict.`,
  { label: 'fix:once', phase: 'Fix', schema: FIXED })

if (!fixed) return { status: 'aborted', reason: 'fixer agent died or skipped', evidence, findings: blocking }
return {
  status: 'revalidation-required',
  stale_evidence: evidence,
  fixed,
  reviewed_findings: blocking,
  minors,
  next: 'Caller must rerun its validation command and invoke /quality-harness:review-ring once with fresh evidence.',
}
