// ADR-057: every skill, agent and workflow the plugin ships is selected by a
// named route. A member nothing names is finished and unreachable — measured
// 2026-09-16, five had never been invoked, and each gap traced to router text.
//
// The helpers live at module scope on purpose. A task's test body is locked at
// its first red (ADR-050), and later tasks add tests here that reuse these
// helpers; they must never need to edit a locked body to do it. The route
// matcher itself lives in routing-routes.mjs so the stress test drives the same one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  MEMBER_GLOBS, ROUTERS, body, escaped, listed, memberName, readTexts, repoRoot, unrouted,
} from './routing-routes.mjs'

// Fixtures for the dirty cases, kept out of the test body and built from strings:
// the test-lock hasher masks strings but not regex literals, and a quote or a
// backtick inside a regex literal leaves the whole body unhashable (UNPROVEN).
const BACKTICK = String.fromCharCode(96)
const PROBE_PATH = 'plugin/workflows/probe.js'
const AGENT_TYPE_PROBE = "agent('x', { agentType: 'quality-harness:qh-synthesis' })"

/** `texts` with every route to `name` removed, by a match written apart from routerPattern. */
function withoutRoutesTo(texts, name) {
  const route = new RegExp('/?quality-harness:' + escaped(name) + '(?![\\w-])|' + BACKTICK + escaped(name) + BACKTICK, 'g')
  return new Map([...texts].map(([file, text]) => [file, text.replace(route, '')]))
}

/** `texts` with every workflow agentType option naming `name` removed. */
function withoutAgentType(texts, name) {
  const option = new RegExp('agentType:\\s*.quality-harness:' + escaped(name) + '.,?\\s*', 'g')
  return new Map([...texts].map(([file, text]) => [file, text.replace(option, '')]))
}

test('every shipped skill, agent and workflow is named by a route', () => {
  const members = listed(...MEMBER_GLOBS).map(path => ({ path, name: memberName(path) }))
  // Asserted non-empty per kind: a sweep over nothing passes every property it tests.
  for (const kind of ['plugin/skills/', 'plugin/agents/', 'plugin/workflows/']) {
    assert.ok(members.some(member => member.path.startsWith(kind)), 'git listed no member under ' + kind)
  }
  const routers = readTexts(ROUTERS)
  const workflows = readTexts(listed('plugin/workflows/*.js'))

  assert.deepEqual(unrouted(members, routers, workflows), [],
    'these shipped elements are named by no route: give each a named route in the body of work, '
    + 'quality-policy or review, or a workflow agentType, or decide otherwise in a record (ADR-057)')

  // The predicate must be able to report, on the real member list. Every route to
  // review is removed while review-ring keeps its own: a match without the name
  // boundary would still find review inside review-ring and report nothing.
  const reviewless = unrouted(members, withoutRoutesTo(routers, 'review'), withoutRoutesTo(workflows, 'review'))
  assert.ok(reviewless.includes('review'), 'a skill whose every route was removed must be reported')
  assert.ok(!reviewless.includes('review-ring'), 'removing review must not remove review-ring')

  // A workflow agentType is a route, and removing it is reported.
  const without = withoutAgentType(workflows, 'qh-synthesis')
  assert.ok(unrouted(members, routers, without).includes('qh-synthesis'),
    'an agent whose only route was a workflow agentType must be reported once it is removed')
  assert.ok(!unrouted(members, routers, new Map(without).set(PROBE_PATH, AGENT_TYPE_PROBE)).includes('qh-synthesis'),
    'a workflow agentType must count as a route')
})

// ADR-057 T1. The risk table existed three times (work, quality-policy, review),
// and every copy offered "quality-cycle or codex-review" — so the cheaper arm won
// every time and quality-cycle never ran. One copy now, and a Codex route states
// the condition that picks it and what runs without Codex.
const TIER = new RegExp('\\b(Moderate|High|Open decision)\\b')
const REVIEW_ROUTE = new RegExp('fresh-context reviewer|qh-correctness-reviewer|quality-cycle|codex-review|codex-advise|consensus')
const CODEX_ROUTE = new RegExp('codex-review|codex-advise')
const CODEX_INSTALLED = new RegExp('Codex is installed')
const NO_CODEX_ROUTE = new RegExp('quality-cycle|consensus|/quality-harness:review(?![\\w-])')
const CODEX_FALSE = new RegExp('codex:\\s*false')
const LOADS_POLICY = new RegExp('\\bload\\s+.quality-harness:quality-policy', 'i')
const MODERATE_AGENT = new RegExp('(?<![\\w/-])quality-harness:qh-correctness-reviewer(?![\\w-])')
const RISK_BULLET_PROBE = '- Moderate coupling or regression surface: use one fresh-context reviewer.'
const UNCONDITIONED_CODEX_PROBE = 'High-risk boundary: use /quality-harness:quality-cycle or /quality-harness:codex-review.'

function skillText(name) {
  return readFileSync(join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8')
}

/** A skill body as table rows plus whitespace-collapsed prose paragraphs, so a wrapped sentence is one unit. */
function units(text) {
  const out = []
  for (const block of body(text).split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/)
    out.push(...lines.filter(line => line.trimStart().startsWith('|')).map(line => line.trim()))
    const prose = lines.filter(line => !line.trimStart().startsWith('|')).join(' ').replace(/\s+/g, ' ').trim()
    if (prose) out.push(prose)
  }
  return out
}

/** The text from a heading line that starts with `heading` to the next `## ` heading. */
function section(text, heading) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => line.startsWith(heading))
  if (start === -1) return ''
  const next = lines.findIndex((line, i) => i > start && line.startsWith('## '))
  return lines.slice(start, next === -1 ? undefined : next).join('\n')
}

function restatesRiskTable(text) {
  return units(text).some(unit => TIER.test(unit) && REVIEW_ROUTE.test(unit))
}

function conditionsCodex(unit) {
  return !CODEX_ROUTE.test(unit) || (CODEX_INSTALLED.test(unit) && NO_CODEX_ROUTE.test(unit))
}

test('the risk table has one home', () => {
  const homes = [...readTexts(ROUTERS)].filter(([, text]) => restatesRiskTable(text)).map(([file]) => file)
  assert.deepEqual(homes, ['plugin/skills/quality-policy/SKILL.md'])
  assert.ok(restatesRiskTable(RISK_BULLET_PROBE), 'a tier bullet naming a review route must count as a restatement')
})

test('the coordinator loads quality-policy and a delegated reviewer does not', () => {
  assert.ok(LOADS_POLICY.test(section(body(skillText('work')), '## 2.')),
    'work section 2 must tell the coordinator to load quality-harness:quality-policy')
  const reviewRouting = section(body(skillText('review')), '## Route by Risk')
  assert.ok(reviewRouting.includes('quality-harness:quality-policy'), 'review must point at quality-policy for risk routing')
  assert.ok(!LOADS_POLICY.test(reviewRouting), 'a delegated reviewer must not load quality-policy into a child agent')
})

test('a Codex route says what runs when Codex is not installed', () => {
  const unconditioned = [...readTexts(ROUTERS)].flatMap(([file, text]) =>
    units(text).filter(unit => !conditionsCodex(unit)).map(unit => file + ': ' + unit.slice(0, 90)))
  assert.deepEqual(unconditioned, [])
  const openDecision = units(skillText('quality-policy')).find(unit => unit.startsWith('| Open decision'))
  assert.ok(openDecision && CODEX_FALSE.test(openDecision),
    'the Open decision row must call consensus with codex: false once codex-advise has run')
  assert.ok(!conditionsCodex(UNCONDITIONED_CODEX_PROBE), 'an unconditioned Codex route must be reported')
})

test('the Moderate tier spawns the correctness reviewer by name', () => {
  const moderate = units(skillText('quality-policy')).find(unit => unit.startsWith('| Moderate'))
  assert.ok(moderate, 'quality-policy must keep a Moderate row')
  assert.ok(MODERATE_AGENT.test(moderate), 'the Moderate row must name quality-harness:qh-correctness-reviewer without a leading slash')
  assert.equal(listed('plugin/agents/qh-correctness-reviewer.md').length, 1, 'the named reviewer must be a tracked definition')
})

// ADR-057 T2. work's class routes named no stage for arch-write, operating or
// mutation-audit, and work claimed work-next reports an outdated architecture
// document when nextStage has no branch that can say so.
const ARCH_BEFORE_ADR = new RegExp('/quality-harness:arch-write.*adr-write')
const NO_ARCH_DOC = new RegExp('no architecture document')
const OPEN_DECISION_ROUTE = new RegExp('Open decision')
const POSTMORTEM_NAMED = new RegExp(BACKTICK + 'postmortem' + BACKTICK)
const OPERATING_STEP = new RegExp('behaves unexpectedly.*/quality-harness:operating')
const MUTATION_AUDIT = new RegExp('/quality-harness:mutation-audit')
const FALSE_GREEN = new RegExp('Guard against false green')
const ARCH_DOC_CLAIM = new RegExp('architecture document', 'i')
const NEXT_STAGE_BRANCH = new RegExp('STAGES\\.find\\(s => s\\.id === .([a-z-]+).\\)', 'g')
const WORK_NEXT_ARCH_BRANCH_PROBE = "if (x) return STAGES.find(s => s.id === 'arch-write')"
const WORK_ARCH_CLAIM_PROBE = '## Where this repository is\n\nIt reports an architecture document older than the decision.\n'

function collapsed(text) {
  return text.replace(/\s+/g, ' ')
}

function classRow(letter) {
  return units(skillText('work')).find(unit => unit.startsWith('| ' + letter + ' —'))
}

/** The stage ids nextStage can return, read from its STAGES.find branches. */
function selectedStages(source) {
  return [...source.matchAll(NEXT_STAGE_BRANCH)].map(match => match[1])
}

function claimsUnselectedArchStage(workText, workNextSource) {
  return !selectedStages(workNextSource).includes('arch-write')
    && ARCH_DOC_CLAIM.test(section(body(workText), '## Where this repository is'))
}

test('class D routes a structural change with no architecture document through arch-write', () => {
  const classD = classRow('D')
  assert.ok(classD, 'work must keep class D')
  assert.ok(ARCH_BEFORE_ADR.test(classD), 'class D must name /quality-harness:arch-write before adr-write')
  assert.ok(NO_ARCH_DOC.test(classD), 'class D must keep the condition adr-write step 1 states: no architecture document')
  assert.ok(OPEN_DECISION_ROUTE.test(classD), 'class D must reach the Open decision route when two credible designs remain')
  assert.ok(POSTMORTEM_NAMED.test(classRow('A') ?? ''), 'class A must name postmortem as a route')
})

test('work names operating for a gate that behaves unexpectedly', () => {
  const grounding = collapsed(section(body(skillText('work')), '## 0.'))
  assert.ok(OPERATING_STEP.test(grounding), 'section 0 must send a gate that behaves unexpectedly to /quality-harness:operating')
})

test('work names mutation-audit where it asks whether a gate can fail', () => {
  const guard = units(skillText('work')).find(unit => FALSE_GREEN.test(unit))
  assert.ok(guard, 'work must keep its false-green guard')
  assert.ok(MUTATION_AUDIT.test(guard), 'the false-green guard must name /quality-harness:mutation-audit')
})

test('work claims no stage that work-next never selects', () => {
  const workNext = readFileSync(join(repoRoot, 'plugin', 'scripts', 'work-next.mjs'), 'utf8')
  assert.ok(selectedStages(workNext).length >= 3, 'the sweep must find the nextStage branches')
  assert.equal(claimsUnselectedArchStage(skillText('work'), workNext), false,
    'work says work-next reports an outdated architecture document, and nextStage has no branch that does')
  assert.equal(claimsUnselectedArchStage(WORK_ARCH_CLAIM_PROBE, workNext), true, 'a claim with no branch must be reported')
  assert.equal(claimsUnselectedArchStage(WORK_ARCH_CLAIM_PROBE, workNext + WORK_NEXT_ARCH_BRANCH_PROBE), false,
    'once a branch selects arch-write, the claim is allowed')
})

// Found by the ADR-057 routing evals, 2026-09-16: sessions that loaded `work` read
// "Load quality-policy" as "read its file", a Read the sandbox refused, and then
// answered from skill descriptions instead of the risk table. The one run that
// invoked the skill routed the Moderate tier exactly. So section 2 names the Skill tool.
const SKILL_TOOL = new RegExp('Skill tool')

test('work tells the coordinator to invoke quality-policy with the Skill tool', () => {
  const load = units(section(body(skillText('work')), '## 2.')).find(unit => LOADS_POLICY.test(unit))
  assert.ok(load, 'work section 2 must keep its load instruction')
  assert.ok(SKILL_TOOL.test(load), 'the load instruction must say to invoke quality-policy with the Skill tool, not read its file')
})

// Codex review of ADR-057, 2026-09-16. conditionsCodex only checked that a unit
// mentioned a condition, a Codex route and a fallback, so swapping the two branches of
// the High row still passed. These bind each branch to its own destination, and the
// Moderate row to a whole agent name rather than any name it is a prefix of.
const WHEN_NOT = new RegExp('when it is not', 'i')
const SUBAGENT_TYPE = new RegExp('subagent_type:\\s*quality-harness:([A-Za-z0-9_-]+)')
const HIGH_ROW_BRANCHES_SWAPPED_PROBE = '| High | auth | Caller-observed checks; when Codex is installed (`command -v codex`), '
  + '`/quality-harness:quality-cycle`; when it is not, `/quality-harness:codex-review`. |'
const MODERATE_TYPO_PROBE = '| Moderate | coupled | one fresh-context reviewer, spawned as '
  + '`subagent_type: quality-harness:qh-correctness-reviewer-typo`. |'

/** A Codex-conditioned unit split at its condition into the installed branch and the fallback branch. */
function codexBranches(unit) {
  const installed = unit.search(CODEX_INSTALLED)
  const fallback = unit.search(WHEN_NOT)
  if (installed === -1 || fallback === -1 || fallback < installed) return null
  return { installed: unit.slice(installed, fallback), fallback: unit.slice(fallback) }
}

function routesEachBranch(unit, whenInstalled, whenNot) {
  const branches = codexBranches(unit)
  return Boolean(branches)
    && branches.installed.includes(whenInstalled) && !branches.installed.includes(whenNot)
    && branches.fallback.includes(whenNot) && !branches.fallback.includes(whenInstalled)
}

test('each branch of a Codex route sends the change to its own destination', () => {
  const rows = units(skillText('quality-policy'))
  const high = rows.find(unit => unit.startsWith('| High')) ?? ''
  assert.ok(routesEachBranch(high, 'host-review.mjs --host codex', '/quality-harness:quality-cycle'),
    'High: codex-review only when Codex is installed, quality-cycle only when it is not')

  const open = codexBranches(rows.find(unit => unit.startsWith('| Open decision')) ?? '')
  assert.ok(open && open.installed.includes('/quality-harness:codex-advise') && !open.fallback.includes('codex-advise')
    && open.fallback.includes('/quality-harness:consensus'), 'Open decision: codex-advise only when Codex is installed, consensus when it is not')

  const classF = units(skillText('work')).find(unit => unit.startsWith('| F —')) ?? ''
  const cut = classF.search(CODEX_INSTALLED)
  assert.ok(cut !== -1 && classF.slice(0, cut).includes('/quality-harness:review') && !classF.slice(0, cut).includes('codex-review')
    && classF.slice(cut).includes('host-review.mjs --host codex'), 'class F: review always, the Codex host only once Codex is installed')

  assert.equal(routesEachBranch(HIGH_ROW_BRANCHES_SWAPPED_PROBE, '/quality-harness:codex-review', '/quality-harness:quality-cycle'), false,
    'a High row with its branches swapped must be reported')
})

test('the Moderate tier names a whole shipped agent, not a prefix of one', () => {
  const moderate = units(skillText('quality-policy')).find(unit => unit.startsWith('| Moderate')) ?? ''
  const named = SUBAGENT_TYPE.exec(moderate)
  assert.ok(named, 'the Moderate row must name a subagent_type')
  assert.equal(named[1], 'qh-correctness-reviewer')
  assert.equal(listed('plugin/agents/' + named[1] + '.md').length, 1, 'the named agent must be a tracked definition')
  assert.equal(MODERATE_AGENT.test(MODERATE_TYPO_PROBE), false, 'a longer name must not satisfy the Moderate check')
  assert.equal(listed('plugin/agents/' + SUBAGENT_TYPE.exec(MODERATE_TYPO_PROBE)[1] + '.md').length, 0,
    'a name that only starts like a definition must not resolve to one')
})
