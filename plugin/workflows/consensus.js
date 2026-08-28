export const meta = {
  name: 'consensus',
  description: 'Open design decision: independent minimal proposals, hostile complexity critique, one synthesis',
  whenToUse: 'Use only when two or more credible designs remain and reversal is costly. args: {question (required), repo: optional absolute path for grounding, drafters (default 3), lenses: optional array of lens strings, codex: true for a different-lineage critique}. Do not use for routine implementation or a decision already settled by project intent.',
  phases: [{ title: 'Draft' }, { title: 'Critique' }, { title: 'Synthesize' }],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const { question, repo = '', drafters = 3, lenses: lensArg, codex = false } = A
if (typeof question !== 'string' || !question.trim()) throw new Error('args.question required')
if (repo && (typeof repo !== 'string' || !repo.startsWith('/') || /[\0\r\n]/.test(repo))) {
  throw new Error('args.repo must be an absolute POSIX path without control characters')
}
if (!Number.isInteger(drafters) || drafters < 2 || drafters > 5) {
  throw new Error('args.drafters must be an integer from 2 to 5')
}
if (lensArg && (!Array.isArray(lensArg) || lensArg.some(lens => typeof lens !== 'string'))) {
  throw new Error('args.lenses must be an array of strings')
}

const DEFAULT_LENSES = [
  'MVP-first: the smallest shippable version, fastest path to user value, defer everything deferrable',
  'risk-first: what breaks, failure modes, rollback, security/data-integrity, operational cost',
  'maintainer-first: long-term structure, contracts, testability, how this looks after 2 years of changes',
  'user-first: workflows, error states, latency as felt, what confuses people',
  'contrarian: assume the obvious approach is wrong — argue the strongest alternative',
]
const lenses = (lensArg && lensArg.length ? lensArg : DEFAULT_LENSES).slice(0, drafters)
const ground = repo ? `Ground yourself in the actual repo first: explore ${repo} (read what the plan touches — real files, real contracts, not assumptions).` : ''
const LEAF = 'You are a read-only leaf role. Do not invoke /quality-harness:work, another lifecycle workflow, or another agent.'

const DRAFT = {
  type: 'object',
  required: ['lens', 'plan', 'key_bets'],
  properties: {
    lens: { type: 'string' },
    plan: { type: 'string', description: 'the concrete proposal: approach, steps, contracts touched' },
    key_bets: { type: 'array', items: { type: 'string' }, description: 'the load-bearing assumptions this plan makes' },
    rejected: { type: 'string', description: 'what you considered and dropped, and why' },
  },
}
const CRITIQUE = {
  type: 'object',
  required: ['target_lens', 'attacks', 'salvage'],
  properties: {
    target_lens: { type: 'string' },
    attacks: { type: 'array', items: { type: 'object', required: ['claim', 'evidence'], properties: { claim: { type: 'string' }, evidence: { type: 'string' } } } },
    salvage: { type: 'array', items: { type: 'string' }, description: 'ideas in this draft worth keeping even if the whole is rejected' },
  },
}

phase('Draft')
const drafts = (await parallel(lenses.map((lens, i) => () => agent(
  `${LEAF}
Independent draft ${i + 1}/${lenses.length}. ${ground}
PROBLEM: ${question}
Your lens (commit to it fully — the other drafters cover the other angles): ${lens}
Produce the minimum sufficient plan per the schema. Separate behavior required now from anything deferred. Do not hedge across lenses, bundle adjacent features, or add extension points for hypothetical use.`,
  { label: `draft:${i + 1}`, phase: 'Draft', schema: DRAFT })))).filter(Boolean)
if (drafts.length < 2) return { status: 'aborted', reason: 'fewer than 2 drafts survived', drafts }

phase('Critique')
const critiqueTasks = drafts.map((d, i) => () => agent(
  `${LEAF}
You are a hostile critic. ${ground}
PROBLEM: ${question}
DRAFT UNDER ATTACK (lens: ${d.lens}): ${JSON.stringify(d)}
THE COMPETING DRAFTS (context, not your target): ${JSON.stringify(drafts.filter((_, j) => j !== i).map(x => ({ lens: x.lens, plan: x.plan })))}
Attack unsupported complexity, speculative abstraction, duplicated knowledge, hidden scope, and the target draft's key bets with evidence${repo ? ' from the actual repo' : ''}; then list only what is worth salvaging.`,
  { label: `critique:${i + 1}`, phase: 'Critique', schema: CRITIQUE }))
if (codex) {
  critiqueTasks.push(() => agent(
    `${LEAF}
    Fresh-context Codex critique node. Invoke /quality-harness:codex-advise${repo ? ` in repo ${repo}` : ''} with the problem and all drafts as the scoped decision context. Let that skill select high, xhigh, or ultra from the decision's actual risk and breadth; keep the run read-only. Translate only its strongest grounded objections into the schema (target_lens: 'codex-external'). If Codex is unavailable or its output is empty, return an empty attacks array with salvage ['codex unavailable'].`,
    { label: 'critique:codex', phase: 'Critique', schema: CRITIQUE }))
}
const critiques = (await parallel(critiqueTasks)).filter(Boolean)

phase('Synthesize')
const synthesis = await agent(
  `${LEAF}
You are the synthesizer. ${ground}
PROBLEM: ${question}
DRAFTS: ${JSON.stringify(drafts)}
CRITIQUES: ${JSON.stringify(critiques)}
Pick the smallest winning backbone whose required bets survived attack. Graft only necessary ideas from the others and defer the rest explicitly. Output markdown: ## Decision (one paragraph, one decision) · ## Required now · ## Deferred · ## Plan · ## Dissent worth recording · ## Open questions. Be decisive—one plan, not a menu or feature bundle.`,
  { label: 'synthesize', phase: 'Synthesize' })

return { synthesis, drafts, critiques }
