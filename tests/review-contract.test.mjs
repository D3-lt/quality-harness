// ADR-098 T2: the reviewers share one blocking definition (definition A), one severity vocabulary, and the leaf contract is said
// once per audience: `subagentContract` for a Claude subagent, `reviewPrompt` for Codex. Each property is asserted on the text a
// reviewer is actually handed, and each check is shown failing on a dirty input (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { subagentContract } from './helpers/node-hooks/completion-rules.mjs'
import * as hostReview from '../plugin/scripts/host-review.mjs'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const plugin = path.join(repoRoot, 'plugin')
const read = relative => readFileSync(path.join(plugin, relative), 'utf8')
const fold = text => String(text ?? '').replace(/\s+/g, ' ').trim()
// The plugin as git lists it, tracked and being added (CLAUDE.md §8): a walk of the disk answers for this machine only, and
// counts an ignored or stray file nobody ships (ADR-119 T4).
const listed = spawnSync('git', ['-C', repoRoot, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'plugin'],
  { encoding: 'utf8', timeout: 60_000, windowsHide: true })
assert.equal(listed.status, 0, listed.stderr)
const pluginFiles = listed.stdout.split('\0').filter(Boolean).map(name => name.slice('plugin/'.length))
const filesIn = dir => pluginFiles.filter(name => path.posix.dirname(name) === dir).map(name => path.posix.basename(name))
const BLOCK = /<!-- blocking-criteria -->([\s\S]*?)<!-- \/blocking-criteria -->/
const blockIn = text => { const found = BLOCK.exec(text); return found ? fold(found[1]) : null }
// The class `git grep` found seven lines of: a place that states when a finding blocks.
const DEFINITION = /blocks only when|blocking only if|blocking finding must|a blocker (?:must|requires)/i
const CARRIERS = ['skills/review/SKILL.md', 'agents/qh-correctness-reviewer.md', 'agents/qh-synthesis.md', 'scripts/host-review.mjs']

// Definition A: five conditions, and the canonical block must hold every one of them.
const A_CONDITIONS = [
  /stated scope or a regression caused by the diff/i,
  /material to correctness, security, data integrity, required behavior, or concrete maintainability/i,
  /exact code plus a failing check, reproduction, violated contract, or direct trace/i,
  /minimal in-scope remedy/i,
  /why existing passing evidence does not already settle/i,
]
const holdsDefinitionA = text => A_CONDITIONS.every(condition => condition.test(fold(text)))
// Definition B as the review skill stated it before ADR-098: it has no remedy condition and no passing-evidence condition.
const DEFINITION_B = `A blocking finding must identify all five: the violated contract or invariant, exact location,
reachable failure path, user/system impact, and smallest sufficient fix. Style preferences,
alternative architectures, speculative edge cases, raw syntactic duplication, future-proofing,
and optional cleanup are advisory—not blockers.`

async function runWorkflow(file, args, reply) {
  const calls = []
  const source = readFileSync(path.join(plugin, 'workflows', file), 'utf8').replace('export const meta =', 'const meta =')
  const execute = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', source)
  const result = await execute(args, async (prompt, options) => { calls.push({ prompt, options }); return reply(prompt, options, calls.length) },
    tasks => Promise.all(tasks.map(task => task())), () => {}, () => {})
  return { result, calls }
}

const evidence = { status: 'executed', command: 'npm test', exitCode: 0, summary: '12 passed' }
const advisory = { severity: 'advisory', file: 'a.js', contract: 'c', path: 'p', impact: 'i', fix: 'f' }
const blocker = { ...advisory, severity: 'blocking' }
const reviewFinding = severity => ({ file: 'a.js', problem: 'p', impact: 'i', evidence: 'e', minimal_fix: 'f', severity })
// review-ring: a blocking verdict then a fix; quality-cycle: three clean reviews; consensus: drafts, critiques, a synthesis.
const ringReplies = (_prompt, _options, call) => call === 1 ? { verdict: 'blocking', findings: [blocker, advisory], evidence: 'a.js:1' }
  : { files_changed: [], test_result: 'ok', notes: '' }
const cycleReply = () => ({ status: 'clean', findings: [] })
const consensusReply = (_prompt, options) => options.label.startsWith('draft:') ? { lens: 'l', plan: 'p', key_bets: [] }
  : options.label.startsWith('critique:') ? { target_lens: 'l', attacks: [], salvage: [] } : '## Decision'

test('the blocking criteria have one definition and every mirror is its text', () => {
  const canonical = blockIn(read('skills/review/SKILL.md'))
  assert.ok(canonical, 'the review skill holds the block between the blocking-criteria markers')
  const mirrors = {
    'agents/qh-correctness-reviewer.md': blockIn(read('agents/qh-correctness-reviewer.md')),
    'agents/qh-synthesis.md': blockIn(read('agents/qh-synthesis.md')),
    'host-review.mjs BLOCKING_CRITERIA': fold(hostReview.BLOCKING_CRITERIA),
  }
  for (const [name, text] of Object.entries(mirrors)) assert.equal(text, canonical, `${name} is the canonical text`)
  assert.ok(fold(hostReview.reviewPrompt({ repo: '/repo', scope: 'uncommitted' })).includes(canonical), 'the Codex review prompt carries the mirror')
  // Dirty: a drifted mirror is not the canonical text, and the old definitions are what the class pattern finds.
  assert.notEqual(fold(canonical.replace('minimal', 'large')), canonical)
  assert.ok(DEFINITION.test('A finding blocks only when all are true') && DEFINITION.test('A blocker must be in scope'))
  // No other place in the plugin states a definition: the carriers are the only files the class pattern finds.
  const holders = pluginFiles.filter(name => DEFINITION.test(read(name))).sort()
  assert.deepEqual(holders, [...CARRIERS].sort())
  assert.match(read('skills/quality-policy/SKILL.md'), /Blocking findings/, 'quality-policy names the review skill block')
})

test('the canonical blocking block is definition A', () => {
  const canonical = blockIn(read('skills/review/SKILL.md'))
  assert.ok(canonical, 'the block exists')
  for (const condition of A_CONDITIONS) assert.match(canonical, condition)
  assert.ok(holdsDefinitionA(canonical))
  assert.equal(holdsDefinitionA(DEFINITION_B), false, 'definition B does not pass as A')
})

test('every review schema says blocking or advisory', async () => {
  const ring = await runWorkflow('review-ring.js', { repo: '/repo', evidence }, ringReplies)
  const severity = ring.calls[0].options.schema.properties.findings.items.properties.severity
  assert.deepEqual(severity.enum, ['blocking', 'advisory'])
  assert.deepEqual(ring.result.advisories, [advisory])
  assert.equal('minors' in ring.result, false, 'review-ring no longer returns minors')
  const clean = await runWorkflow('review-ring.js', { repo: '/repo', evidence }, () => ({ verdict: 'clean', findings: [advisory], evidence: 'e' }))
  assert.deepEqual(clean.result.advisories, [advisory])
  assert.equal('minors' in clean.result, false)

  const cycle = await runWorkflow('quality-cycle.js', { repo: '/repo', evidence }, cycleReply)
  assert.deepEqual(cycle.calls[0].options.schema.properties.findings.items.properties.severity.enum, ['blocking', 'advisory'])
  const host = severityName => ({ host: 'codex', status: 'clean', findings: [reviewFinding(severityName)] })
  const accepted = await runWorkflow('quality-cycle.js', { repo: '/repo', evidence, codex: true, externalReviews: [host('advisory')] }, cycleReply)
  assert.equal(accepted.result.status, 'clean')
  const refused = await runWorkflow('quality-cycle.js', { repo: '/repo', evidence, codex: true, externalReviews: [host('minor')] }, cycleReply)
  assert.equal(refused.result.status, 'reviewer-unavailable')
  assert.equal(hostReview.validReview({ status: 'clean', findings: [reviewFinding('advisory')] }), true)
  assert.equal(hostReview.validReview({ status: 'clean', findings: [reviewFinding('minor')] }), false)
})

test('no agent file restates the leaf contract the SubagentStart hook gives', () => {
  const leaf = /you are a leaf/i
  const agents = filesIn('agents').filter(name => name.endsWith('.md'))
  assert.ok(agents.length >= 4, 'the agent files were found')
  assert.deepEqual(agents.filter(name => leaf.test(read(`agents/${name}`))), [])
  assert.match(subagentContract({ agent_type: 'qh-narrow-fixer' }), /^QUALITY CONTRACT — you are a leaf role/)
  assert.ok(leaf.test('You are a leaf: you do not spawn further agents.'), 'the pattern finds the old line')
})

// A workflow's role sentence is one sentence; the rules `subagentContract` gives every subagent are not said again.
const RESTATED = /do not invoke|spawn (?:another|an implementation) agent|another lifecycle workflow|do not modify files|stay inside the supplied diff|do not propose new features/i
const roleLine = prompt => prompt.split('\n')[0].replace(' Do not commit or push.', '')

test('a workflow prompt keeps one role sentence and no restated rules', async () => {
  const cases = [
    ['review-ring.js', await runWorkflow('review-ring.js', { repo: '/repo', evidence }, ringReplies), [/read-only REVIEWER and a leaf role/, /narrowly scoped FIXER and a leaf role/]],
    ['quality-cycle.js', await runWorkflow('quality-cycle.js', { repo: '/repo', evidence }, cycleReply), [/read-only leaf reviewer/, /read-only leaf reviewer/, /read-only leaf reviewer/]],
    ['consensus.js', await runWorkflow('consensus.js', { question: 'q', drafters: 2 }, consensusReply), Array(5).fill(/read-only leaf role/)],
  ]
  for (const [name, { calls }, locked] of cases) {
    assert.equal(calls.length, locked.length, `${name} spawned its roles`)
    calls.forEach(({ prompt }, index) => {
      assert.match(roleLine(prompt), locked[index], `${name} role ${index + 1} keeps the locked role sentence`)
      assert.match(roleLine(prompt), /^[^.]+\.$/, `${name} role ${index + 1} states its role in one sentence`)
      assert.doesNotMatch(prompt, RESTATED, `${name} role ${index + 1} does not restate the contract`)
    })
  }
  // Dirty: the pattern finds the contract's own rule and the old two-sentence line.
  assert.match(subagentContract({ agent_type: 'x' }), RESTATED)
  assert.match('You are a read-only leaf role. Do not invoke /quality-harness:work.', RESTATED)
  assert.doesNotMatch(roleLine('You are a read-only leaf role. Do not invoke it.'), /^[^.]+\.$/)
})

// Every agent whose `tools:` lists Edit or Write: the ones `subagentContract` and the reviewer guard give no publish prohibition.
const editingAgents = files => Object.entries(files).filter(([, text]) => /^tools:.*\b(?:Edit|Write)\b/m.test(text))
const lacksProhibition = files => editingAgents(files).filter(([, text]) => !/do(?:es)? not commit or push/i.test(text)).map(([name]) => name)

test('every editing role keeps an explicit publish prohibition', async () => {
  const names = filesIn('agents').filter(name => name.endsWith('.md'))
  const files = Object.fromEntries(names.map(name => [name, read(`agents/${name}`)]))
  assert.deepEqual(editingAgents(files).map(([name]) => name), ['qh-narrow-fixer.md'], 'the editing roles are enumerated')
  assert.deepEqual(lacksProhibition(files), [])
  assert.deepEqual(lacksProhibition({ ...files, 'fixture.md': '---\ntools: Read, Edit\n---\nYou fix things.' }), ['fixture.md'], 'a fixture editing agent is reported')
  const ring = await runWorkflow('review-ring.js', { repo: '/repo', evidence }, ringReplies)
  assert.match(ring.calls[1].prompt, /Do not commit or push\./)
  assert.match(read('skills/execution/SKILL.md'), /Do not commit, push/)
})

// Codex review of v3.8.21..17066d76: the schemas were unified, but the review skill's prose still told Pass 1 to output
// "critical/high only". A reviewer handed the skill reads the prose, so the old vocabulary must be gone from it too.
const OLD_SEVERITY = /\bcritical\s*\/\s*high\b|\b(?:critical|high|medium|low)\s*(?:\/|\|)\s*(?:critical|high|medium|low)\b/i
test('no review surface tells a reviewer the old severity words', () => {
  for (const file of ['skills/review/SKILL.md', ...filesIn('agents').map(name => `agents/${name}`),
    ...filesIn('workflows').map(name => `workflows/${name}`)]) {
    assert.doesNotMatch(read(file), OLD_SEVERITY, file)
  }
  assert.match('Output critical/high only', OLD_SEVERITY, 'the pattern finds the old instruction')
})
