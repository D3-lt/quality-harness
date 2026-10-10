// BACKLOG section 375, stage C. What a turn that ends says about itself is a function of its facts (tests/pure-judges.test.mjs
// holds that), so the places it could flatter the work are a table, and this walks it: every combination of what the tree, the
// log, the commits and the writes can show, and for each the properties ADR-005 asks of an answer. `verified` needs everything
// to have been looked at and found checked; anything that could not be looked at is `could-not-look`, said once as R4 and never
// as an accusation or a pass. Each property is shown FAILING on a judgement that breaks it.
import assert from 'node:assert/strict'
import test from 'node:test'
import { completionJudgement } from '../plugin/scripts/completion-rules.mjs'
import { mark } from '../plugin/scripts/tree-facts.mjs'

const T = 'tree-now'
const observations = {
  unobserved: { ok: false, reason: 'git outran the budget' },
  observed: { ok: true, tree: T, index: T, head: 'head-now' },
}
const check = (event, tree, extra = {}) => ({ event, after: { tree }, ...extra })
const treeChecks = {
  none: [],
  passed: [check('check.passed', T, { seq: 1 })],
  failed: [check('check.failed', T, { seq: 1 })],
  'could not look': [check('check.timeout', T, { seq: 1 })],
  'order unresolved': [check('check.passed', T), check('check.failed', T)],
}
const baselines = {
  'no start': [],
  'started at this tree': [{ event: 'session.started', observation: { ok: true, tree: T, index: T, head: 'h0' } }],
  'started elsewhere': [{ event: 'session.started', observation: { ok: true, tree: 'tree-before', index: 'tree-before', head: 'h0' } }],
}
const checks = { 'a declared check': 'sh check.sh', 'a refused declaration': 'refused', 'no check': null }
const statuses = { clean: [], 'one path': ['a.js'], 'listing failed': mark([], false, 'git status failed') }
const commitSets = {
  none: [],
  'this tree': [{ sha: 'aaaaaaaa11', tree: T, subject: 'work' }],
  'another tree, unchecked': [{ sha: 'bbbbbbbb22', tree: 'tree-other', subject: 'older' }],
  'listing failed': mark([], false, 'git log failed'),
}
const writeSets = { none: [], 'one write git could not see': [{ event: 'file.written', path: '/repo/ignored.txt', observable: false }] }
const messages = { claim: 'All tests pass and the build is green.', question: 'Which file should I change?', plain: 'Edited the file.' }

function* scenarios() {
  for (const [obsName, observation] of Object.entries(observations))
    for (const [checkName, check_] of Object.entries(checks))
      for (const [baseName, base] of Object.entries(baselines))
        for (const [treeName, tree] of Object.entries(treeChecks))
          for (const whole of [true, false])
            for (const [statusName, status] of Object.entries(statuses))
              for (const [commitName, commits] of Object.entries(commitSets))
                for (const [writeName, writes] of Object.entries(writeSets))
                  for (const [messageName, message] of Object.entries(messages))
                    yield { observation, check: check_, base, tree, whole, status, commits, writes, message,
                      label: [obsName, checkName, baseName, treeName, whole ? 'whole log' : 'cut log', `status ${statusName}`, `commits ${commitName}`, writeName, messageName].join(' | ') }
}

function judge(judgement, s) {
  const log = Object.assign([...s.base, ...s.tree], { complete: s.whole })
  const baseline = s.base[0]?.observation
  const facts = {
    log, observation: s.observation, check: s.check, root: '/repo', baseline,
    writes: s.writes, status: s.status, commits: s.commits,
    sentence: () => 'RUN-SENTENCE', locationKey: () => '/repo', nudge: () => null,
  }
  return judgement(facts, { hook_event_name: 'Stop', cwd: '/repo', last_assistant_message: s.message })
}

const looked = s => s.observation.ok === true && s.status.ok !== false && s.commits.ok !== false
// Settled: a check passed on this tree, or the tree is the one the session began with (nothing changed, so nothing needs a check).
const settled = s => s.tree === treeChecks.passed || s.base === baselines['started at this tree']
const PROPERTIES = {
  '`verified` needs everything looked at, a log read whole, a check, a checked tree and no unseen write': (s, r) => {
    if (r.claim.evidence !== 'verified') return null
    if (!looked(s) || !s.whole || !s.check || !settled(s) || s.writes.length) return 'verified without the evidence'
    return null
  },
  'a tree or a listing that could not be looked at is `could-not-look`': (s, r) => (!looked(s) && r.claim.evidence !== 'could-not-look' ? `evidence ${r.claim.evidence} over something that could not be looked at` : null),
  'a log not read whole is `could-not-look`, never a pass': (s, r) => (looked(s) && !s.whole && r.claim.evidence !== 'could-not-look' ? `evidence ${r.claim.evidence} over a cut log` : null),
  'no check, no finding': (s, r) => (!s.check && r.actions.length ? 'spoke for a project with no check' : null),
  'something that could not be looked at is said, once, as R4': (s, r) => {
    if (!s.check || (looked(s) && s.whole)) return null
    return r.actions.filter(action => action.rule === 'R4').length === 1 ? null : 'could-not-look was not said exactly once'
  },
  'a state fully looked at and checked says nothing about work or commits': (s, r) => {
    if (!s.check || !looked(s) || !s.whole || !settled(s) || s.writes.length || s.status.length || s.commits.length) return null
    return r.actions.length ? 'nagged a verified state' : null
  },
  'a cut log is never accused of "no qh-check has passed"': (s, r) => (!s.whole && r.actions.some(action => /no `qh-check` has passed/.test(action.text)) ? 'accused over a cut log' : null),
  'every finding has a rule, a key and words': (s, r) => (r.actions.some(action => action.rule !== undefined && (!['R1', 'R2', 'R4'].includes(action.rule) || !action.key || !action.text)) ? 'a finding without a rule, key or text' : null),
  'a write git could not see is reported': (s, r) => (s.check && s.writes.length && !r.actions.some(action => action.rule === 'R1') && !(s.message === messages.question) ? 'an unseen write went unsaid' : null),
}

function walk(judgement) {
  const broken = Object.fromEntries(Object.keys(PROPERTIES).map(name => [name, []]))
  let total = 0; let verified = 0; let actions = 0
  for (const s of scenarios()) {
    const r = judge(judgement, s)
    total++
    if (r.claim.evidence === 'verified') verified++
    actions += r.actions.length
    for (const [name, property] of Object.entries(PROPERTIES)) {
      const why = property(s, r)
      if (why && broken[name].length < 3) broken[name].push(`${why}: ${s.label}`)
    }
  }
  return { broken, total, verified, actions }
}

test('turn end: no combination of facts breaks a property an answer must have', () => {
  const { broken, total, verified, actions } = walk(completionJudgement)
  for (const [name, found] of Object.entries(broken)) assert.deepEqual(found, [], `${name}: ${found.join('\n')}`)
  assert.ok(total > 10_000, `the table is ${total} scenarios`)
  assert.ok(verified > 50, `only ${verified} scenarios are verified`)
  assert.ok(actions > 5_000, `only ${actions} findings are said`)
})

test('turn end: each property fails on a judgement that breaks it', () => {
  const alwaysVerified = (facts, input) => { const out = completionJudgement(facts, input); return { ...out, claim: { ...out.claim, evidence: 'verified' } } }
  const dropsR4 = (facts, input) => { const out = completionJudgement(facts, input); return { ...out, actions: out.actions.filter(action => action.rule !== 'R4') } }
  const speaksWithoutCheck = (facts, input) => completionJudgement({ ...facts, check: facts.check ?? 'sh check.sh' }, input)
  const trustsCutLog = (facts, input) => completionJudgement({ ...facts, log: Object.assign([...facts.log], { complete: true }) }, input)
  assert.ok(walk(alwaysVerified).broken['`verified` needs everything looked at, a log read whole, a check, a checked tree and no unseen write'].length > 0)
  assert.ok(walk(dropsR4).broken['something that could not be looked at is said, once, as R4'].length > 0)
  assert.ok(walk(speaksWithoutCheck).broken['no check, no finding'].length > 0)
  assert.ok(walk(trustsCutLog).broken['a log not read whole is `could-not-look`, never a pass'].length > 0)
})
