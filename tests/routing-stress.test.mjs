// Stress for ADR-057 (2026-09-16): break the route matcher and the workflow wiring
// on purpose, against oracles written from the record's Decision rather than from
// the code. Three layers, cheapest first:
//
//   1. the matcher (tests/routing-routes.mjs) against a character-walk oracle over
//      random router and workflow texts;
//   2. the real tree: removing every route to one element reports exactly it;
//   3. quality-cycle.js and review-ring.js over a random matrix of arguments and
//      agent replies: every spawned role carries the agentType the Decision names.
//
// Deterministic and replayable. QH_ROUTING_STRESS_SEED picks the seed and
// QH_ROUTING_STRESS_ITERS the iterations per layer (default 200, cheap enough
// for CI). A deep run is `QH_ROUTING_STRESS_ITERS=2000` over several seeds.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { MEMBER_GLOBS, ROUTERS, listed, memberName, readTexts, repoRoot, unrouted } from './routing-routes.mjs'

const ITERS = Number(process.env.QH_ROUTING_STRESS_ITERS ?? 200)
const SEED = Number(process.env.QH_ROUTING_STRESS_SEED ?? 57)

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (random, items) => items[Math.floor(random() * items.length)]

// ---- The oracle, from ADR-057's Decision, by character walk rather than regex.
// "named — as `name`, quality-harness:name or /quality-harness:name, with a boundary
// so review is not found inside review-ring — in the BODY of work, quality-policy or
// review (frontmatter excluded), or in a workflow as /quality-harness:name or
// agentType: 'quality-harness:name' … excluding the member's own file."
const isTokenChar = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-'
const isSpace = c => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'

function oracleBody(text) {
  const lines = text.split('\n')
  if (lines[0].replace(/\r$/, '') !== '---') return text
  const end = lines.findIndex((line, i) => i > 0 && line.replace(/\r$/, '') === '---')
  return end === -1 ? text : lines.slice(end + 1).join('\n')
}

/** Every token that directly follows an occurrence of `prefix`. */
function tokensAfter(text, prefix) {
  const found = []
  for (let i = text.indexOf(prefix); i !== -1; i = text.indexOf(prefix, i + 1)) {
    let j = i + prefix.length
    while (j < text.length && isTokenChar(text[j])) j++
    found.push({ token: text.slice(i + prefix.length, j), next: text[j], prev: text[i - 1] })
  }
  return found
}

function backticked(text, name) {
  for (let i = text.indexOf('`'); i !== -1; i = text.indexOf('`', i + 1)) {
    if (text.startsWith(name + '`', i + 1)) return true
  }
  return false
}

function agentTypeNames(text) {
  const names = []
  for (let i = text.indexOf('agentType:'); i !== -1; i = text.indexOf('agentType:', i + 1)) {
    // "agentType:" must be the whole key: notagentType is a different word.
    if (i > 0 && isTokenChar(text[i - 1])) continue
    let j = i + 'agentType:'.length
    while (j < text.length && isSpace(text[j])) j++
    if (text[j] !== "'" && text[j] !== '"') continue
    if (!text.startsWith('quality-harness:', j + 1)) continue
    let k = j + 1 + 'quality-harness:'.length
    const start = k
    while (k < text.length && isTokenChar(text[k])) k++
    if (text[k] === "'" || text[k] === '"') names.push(text.slice(start, k))
  }
  return names
}

function oracleUnrouted(members, routers, workflows) {
  const named = ({ path: own, name }) =>
    [...routers].some(([file, text]) => {
      if (file === own) return false
      const content = oracleBody(text)
      // A qualified name must start at a word boundary: not-quality-harness:x names nothing.
      return backticked(content, name)
        || tokensAfter(content, 'quality-harness:').some(t => t.token === name && !isTokenChar(t.prev ?? ' '))
    })
    || [...workflows].some(([file, text]) => file !== own
      && (tokensAfter(text, '/quality-harness:').some(t => t.token === name) || agentTypeNames(text).includes(name)))
  return members.filter(member => !named(member)).map(member => member.name)
}

// ---- Pools. Members come from git, as the class test's do; the forms come from the
// Decision's wording plus the near misses it rules out (a longer token, a form that
// counts only in the other kind of file, a name in frontmatter or in its own file).
function realMembers() {
  return listed(...MEMBER_GLOBS).map(file => ({ path: file, name: memberName(file) }))
}

const TERMINATORS = [' ', '.', ',', ')', '`', "'", '"', ';', '\n', '\r\n', '']
const ROUTER_FORMS = [
  n => '`' + n + '`',
  n => 'quality-harness:' + n,
  n => '/quality-harness:' + n,
  n => n,
  n => '`' + n,
  n => '/quality-harness:' + n + '-extra',
  n => 'quality-harness:' + n + '_x',
  n => 'quality-harness:' + n + 'X',
  n => "agentType: 'quality-harness:" + n + "'",
  n => 'not-quality-harness:' + n,
  n => 'xquality-harness:' + n,
]
const WORKFLOW_FORMS = [
  n => '/quality-harness:' + n,
  n => 'quality-harness:' + n,
  n => "agentType: 'quality-harness:" + n + "'",
  n => 'agentType:"quality-harness:' + n + '"',
  n => "agentType:\n\t'quality-harness:" + n + "'",
  n => "agentType: 'quality-harness:" + n + "-x'",
  n => 'agentType: quality-harness:' + n,
  n => '`' + n + '`',
  n => '/quality-harness:' + n + '-extra',
  n => "notagentType: 'quality-harness:" + n + "'",
  n => '_agentType: "quality-harness:' + n + '"',
]
const NEAR_MISSES = ['review-rin', 'qh-synth', 'Review', 'work-next', 'adr']

function snippets(random, names, forms) {
  const count = Math.floor(random() * 5)
  return Array.from({ length: count }, () => pick(random, forms)(pick(random, names)) + pick(random, TERMINATORS)).join(' ')
}

function randomText(random, names, forms, withFrontmatter) {
  const eol = random() < 0.3 ? '\r\n' : '\n'
  const text = 'prose ' + snippets(random, names, forms) + eol + 'more ' + snippets(random, names, forms)
  if (!withFrontmatter || random() < 0.5) return text
  return '---' + eol + 'name: x' + eol + 'description: ' + snippets(random, names, forms).replaceAll('\n', ' ') + eol + '---' + eol + text
}

test('the route matcher agrees with a character-walk oracle on random router and workflow texts', () => {
  const members = realMembers()
  const names = [...members.map(member => member.name), ...NEAR_MISSES]
  const workflowFiles = listed('plugin/workflows/*.js')
  const random = rng(SEED)
  let routed = 0
  let unroutedCount = 0
  for (let iteration = 0; iteration < ITERS; iteration++) {
    const routers = new Map(ROUTERS.map(file => [file, randomText(random, names, ROUTER_FORMS, true)]))
    const workflows = new Map(workflowFiles.map(file => [file, randomText(random, names, WORKFLOW_FORMS, false)]))
    const expected = oracleUnrouted(members, routers, workflows)
    const actual = unrouted(members, routers, workflows)
    assert.deepEqual(actual, expected, 'seed ' + SEED + ' iteration ' + iteration + '\n'
      + JSON.stringify({ routers: Object.fromEntries(routers), workflows: Object.fromEntries(workflows) }, null, 2))
    unroutedCount += expected.length
    routed += members.length - expected.length
  }
  // A pool that never routes or never fails to route proves nothing either way.
  assert.ok(routed > 0 && unroutedCount > 0, 'the generator must produce both routed and unrouted members')
})

test('the oracle and the matcher both refuse the near misses the Decision rules out', () => {
  // Fixed cases, one per rule, so a pool that happens not to roll one still has it.
  const members = [
    { path: 'plugin/skills/review/SKILL.md', name: 'review' },
    { path: 'plugin/workflows/review-ring.js', name: 'review-ring' },
    { path: 'plugin/skills/work/SKILL.md', name: 'work' },
    { path: 'plugin/agents/qh-synthesis.md', name: 'qh-synthesis' },
  ]
  const cases = [
    ['a longer token is not the name', { 'plugin/skills/work/SKILL.md': 'use /quality-harness:review-ring now' }, {}, ['review', 'work', 'qh-synthesis']],
    ['frontmatter is not a route', { 'plugin/skills/quality-policy/SKILL.md': '---\ndescription: do not use `review`\n---\nbody' }, {}, ['review', 'review-ring', 'work', 'qh-synthesis']],
    ['a CRLF frontmatter is not a route', { 'plugin/skills/quality-policy/SKILL.md': '---\r\ndescription: `review`\r\n---\r\nbody' }, {}, ['review', 'review-ring', 'work', 'qh-synthesis']],
    ['a member does not route itself', { 'plugin/skills/work/SKILL.md': '`work` and quality-harness:work' }, {}, ['review', 'review-ring', 'work', 'qh-synthesis']],
    ['a bare quality-harness: name in a workflow is not a route', {}, { 'plugin/workflows/x.js': 'quality-harness:review.' }, ['review', 'review-ring', 'work', 'qh-synthesis']],
    ['an unquoted agentType is not a route', {}, { 'plugin/workflows/x.js': 'agentType: quality-harness:qh-synthesis' }, ['review', 'review-ring', 'work', 'qh-synthesis']],
    ['a quoted agentType is a route', {}, { 'plugin/workflows/x.js': "agentType:\n  'quality-harness:qh-synthesis'" }, ['review', 'review-ring', 'work']],
    ['a slash route at end of text is a route', { 'plugin/skills/review/SKILL.md': 'see /quality-harness:work' }, {}, ['review', 'review-ring', 'qh-synthesis']],
    ['a prefixed qualified name is not a route', { 'plugin/skills/review/SKILL.md': 'use not-quality-harness:work and xquality-harness:work' }, {}, ['review', 'review-ring', 'work', 'qh-synthesis']],
    ['a prefixed agentType key is not a route', {}, { 'plugin/workflows/x.js': 'notagentType: "quality-harness:qh-synthesis"' }, ['review', 'review-ring', 'work', 'qh-synthesis']],
  ]
  for (const [why, routerTexts, workflowTexts, expected] of cases) {
    const routers = new Map(Object.entries(routerTexts))
    const workflows = new Map(Object.entries(workflowTexts))
    assert.deepEqual(oracleUnrouted(members, routers, workflows), expected, 'oracle: ' + why)
    assert.deepEqual(unrouted(members, routers, workflows), expected, 'matcher: ' + why)
  }
})

// ---- Layer 2: the real tree, one element at a time.
function withoutRoutesTo(text, name) {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text.startsWith('quality-harness:' + name, i) && !isTokenChar(text[i + 'quality-harness:'.length + name.length] ?? ' ')) {
      out += 'quality-harness:removed-route'
      i += 'quality-harness:'.length + name.length
    } else if (text.startsWith('`' + name + '`', i)) {
      out += '`removed-route`'
      i += name.length + 2
    } else {
      out += text[i]
      i += 1
    }
  }
  return out
}

test('removing every route to one shipped element reports exactly that element', () => {
  const members = realMembers()
  const routers = readTexts(ROUTERS)
  const workflows = readTexts(listed('plugin/workflows/*.js'))
  assert.deepEqual(unrouted(members, routers, workflows), [], 'the real tree must start fully routed')
  assert.ok(members.length >= 20, 'git must list the shipped elements')
  for (const member of members) {
    const strip = texts => new Map([...texts].map(([file, text]) => [file, withoutRoutesTo(text, member.name)]))
    assert.deepEqual(unrouted(members, strip(routers), strip(workflows)), [member.name],
      'removing every route to ' + member.name + ' must report it and nothing else')
  }
})

// ---- Layer 3: the workflows, driven through the same harness shape as workflows.test.mjs.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const workflowDir = path.join(repoRoot, 'plugin', 'workflows')

async function runWorkflow(file, args, agent) {
  const source = readFileSync(file, 'utf8').replace('export const meta =', 'const meta =')
  const execute = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', source)
  return execute(args, agent, tasks => Promise.all(tasks.map(task => task())), () => {}, () => {})
}

// From ADR-057 T3's Decision: the role each label spawns, and undefined for the two
// roles that invoke a skill and therefore stay inline.
const AGENT_FOR_LABEL = {
  correctness: 'quality-harness:qh-correctness-reviewer',
  'scope-simplicity': 'quality-harness:qh-scope-reviewer',
  synthesis: 'quality-harness:qh-synthesis',
  'review:fresh': undefined,
  'fix:once': 'quality-harness:qh-narrow-fixer',
}

const EVIDENCE = [
  { status: 'executed', command: 'npm test', exitCode: 0, summary: 'ok' },
  { status: 'unavailable', command: '', exitCode: null, summary: 'no runner' },
  { status: 'executed', command: 'npm test', exitCode: 1, summary: 'red' },
]
const finding = { severity: 'blocking', file: 'a.js', problem: 'p', impact: 'i', evidence: 'e', minimal_fix: 'f',
  contract: 'c', path: 'p', fix: 'f' }
const REVIEW_REPLIES = [
  { status: 'clean', findings: [] },
  { status: 'blocking', findings: [finding] },
  { status: 'evidence-limited', findings: [] },
  { status: 'unavailable', findings: [] },
  null,
]
const VERDICT_REPLIES = [
  { verdict: 'clean', findings: [], evidence: 'e' },
  { verdict: 'blocking', findings: [finding], evidence: 'e' },
  { verdict: 'evidence-limited', findings: [], evidence: 'e' },
  { verdict: 'unavailable', findings: [], evidence: 'e' },
  { verdict: 'clean', findings: [finding], evidence: 'inconsistent' },
  null,
]
const FIX_REPLIES = [{ files_changed: ['a.js'], test_result: 'exit 0', notes: 'n' }, null]

function recordRoles(random, pool, calls) {
  return async (prompt, options) => {
    calls.push(options)
    return pick(random, pool(options))
  }
}

function assertRoles(calls, context) {
  for (const options of calls) {
    assert.ok(Object.hasOwn(AGENT_FOR_LABEL, options.label), 'unknown role label ' + options.label + ' in ' + context)
    assert.equal(options.agentType, AGENT_FOR_LABEL[options.label], options.label + ' agentType in ' + context)
    assert.equal(typeof options.model, 'string', options.label + ' must declare a model in ' + context)
    assert.match(options.model, /^[a-z]+$/, options.label + ' must keep a capability class in ' + context)
  }
}

test('the role check rejects a role that declares no model', () => {
  // Codex review, 2026-09-16: String(undefined) is "undefined", which matched the
  // capability-class pattern, so a role with no model passed.
  assert.throws(() => assertRoles([{ label: 'correctness', agentType: 'quality-harness:qh-correctness-reviewer' }], 'probe'))
  assertRoles([{ label: 'correctness', agentType: 'quality-harness:qh-correctness-reviewer', model: 'opus' }], 'probe')
})

test('every role quality-cycle and review-ring spawn carries the agentType the Decision names, on every path', async () => {
  const random = rng(SEED + 1)
  const seen = new Set()
  for (let iteration = 0; iteration < ITERS; iteration++) {
    const cycleCalls = []
    const cycleArgs = { repo: '/repo', scope: 'uncommitted', evidence: pick(random, EVIDENCE), codex: pick(random, [true, false, undefined]) }
    const cycle = await runWorkflow(path.join(workflowDir, 'quality-cycle.js'), cycleArgs,
      recordRoles(random, () => REVIEW_REPLIES, cycleCalls))
    const cycleContext = 'quality-cycle seed ' + SEED + ' iteration ' + iteration + ' ' + JSON.stringify(cycleArgs) + ' -> ' + cycle.status
    assertRoles(cycleCalls, cycleContext)
    assert.equal(cycleCalls.some(options => options.label === 'codex-external'), false, cycleContext)
    if (cycleArgs.codex && cycleArgs.evidence.exitCode !== 1) assert.equal(cycle.status, 'reviewer-unavailable', cycleContext)

    const ringCalls = []
    const ringArgs = { repo: '/repo', evidence: pick(random, EVIDENCE), reviewer: pick(random, ['claude', 'codex']) }
    const ring = await runWorkflow(path.join(workflowDir, 'review-ring.js'), ringArgs,
      recordRoles(random, options => options.label === 'fix:once' ? FIX_REPLIES : VERDICT_REPLIES, ringCalls))
    const ringContext = 'review-ring seed ' + SEED + ' iteration ' + iteration + ' ' + JSON.stringify(ringArgs) + ' -> ' + ring.status
    assertRoles(ringCalls, ringContext)
    for (const options of [...cycleCalls, ...ringCalls]) seen.add(options.label)
  }
  // Every role must actually have been spawned by the matrix, or its row was never checked.
  assert.deepEqual([...seen].sort(), Object.keys(AGENT_FOR_LABEL).sort(), 'the matrix must reach every role')
})
