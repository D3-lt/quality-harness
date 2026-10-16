// BACKLOG section 375, stage C. Rule P's decision is a function of its facts (tests/pure-judges.test.mjs holds that), so its
// refusals are a table, and this walks the table: every combination of what the ledger, the tree, the config and the caller can
// say, and for each one the properties a refusal must have (CLAUDE.md sections 3 and 16, ADR-005). A refusal needs a proven
// invocation, a tree that was observed, a log read whole, a check that said "not passed" about this very tree, no opt-out and a
// tree that moved since the session began. Anything that could not be looked at is advice. Each property is shown FAILING on a
// judgement that breaks it, so a green walk is not a walk that checks nothing.
import assert from 'node:assert/strict'
import test from 'node:test'
import { publishJudgement } from '../plugin/scripts/publish-verdict.mjs'
import { stagesBeforeCommit } from '../plugin/scripts/publish-command.mjs'

const T = 'tree-now'
const I = 'index-now'
const observations = {
  unobserved: { ok: false, reason: 'git outran the budget' },
  'index equals tree': { ok: true, tree: T, index: T, head: 'h' },
  'index differs': { ok: true, tree: T, index: I, head: 'h' },
}
const origins = {
  declared: { command: 'sh check.sh', origin: 'declared' },
  none: { command: null, origin: 'none' },
  refused: { command: null, origin: 'refused' },
  unproven: { command: null, origin: 'unproven' },
}
const check = (event, tree, extra = {}) => ({ event, after: { tree }, ...extra })
const treeChecks = {
  none: [],
  passed: [check('check.passed', T, { seq: 1 })],
  failed: [check('check.failed', T, { seq: 1 })],
  'passed then failed': [check('check.passed', T, { seq: 1 }), check('check.failed', T, { seq: 2 })],
  'could not look': [check('check.timeout', T, { seq: 1 })],
  'order unresolved': [check('check.passed', T), check('check.failed', T)],
}
const indexChecks = { none: [], passed: [check('check.passed', I, { seq: 1 })] }
const baselines = {
  'no start': [],
  'started at this tree': [{ event: 'session.started', observation: { ok: true, tree: T, index: T, head: 'h' } }],
  'started elsewhere': [{ event: 'session.started', observation: { ok: true, tree: 'tree-before', index: 'tree-before', head: 'h' } }],
}
const settings = { 'refuses': { warn: false, ignored: false, unknown: false }, 'warns only': { warn: true, ignored: false, unknown: false } }
const FAST = { command: 'sh check.sh', count: 1 }

function* scenarios() {
  for (const [obsName, observation] of Object.entries(observations))
    for (const [originName, origin] of Object.entries(origins))
      for (const [baseName, base] of Object.entries(baselines))
        for (const [treeName, tree] of Object.entries(treeChecks))
          for (const [indexName, index] of Object.entries(indexChecks))
            for (const complete of [true, false])
              for (const torn of [false, true])
                for (const [settingName, setting] of Object.entries(settings))
                  for (const invoked of [null, 'git commit'])
                    for (const commitOnly of [false, true])
                      for (const fast of [null, FAST])
                        yield { observation, origin, setting, invoked, commitOnly, fast, complete, torn, base, tree, index,
                          label: [obsName, originName, baseName, treeName, indexName, complete ? 'whole' : 'cut', torn ? 'torn ledger' : 'whole ledger', settingName, invoked ?? 'a mention', commitOnly ? 'one commit' : 'any form', fast ? 'fast pass' : 'no fast pass'].join(' | ') }
}

function judge(judgement, s) {
  const log = Object.assign([...s.base, ...s.tree, ...s.index], { complete: s.complete })
  const facts = {
    observation: s.observation,
    origin: () => s.origin,
    setting: () => s.setting,
    ledger: () => ({ log, dropped: 0, torn: s.torn }),
    caveat: () => '',
    lateBaselineAllowed: () => false,
    fastPass: () => s.fast,
  }
  return judgement(facts, { invoked: s.invoked, commitOnly: s.commitOnly })
}

// The properties. A refusal is `deny: true`; each returns a reason when the scenario breaks it, else null.
const PROPERTIES = {
  'a mention is never refused': (s, r) => (r?.deny && s.invoked === null ? 'refused a mention' : null),
  'a tree that could not be observed is never refused, and is said': (s, r) => {
    if (s.observation.ok === true || !(s.origin.command || s.origin.origin === 'refused' || s.origin.origin === 'unproven')) return null
    return r === null ? 'said nothing' : r.deny ? 'refused an unobserved tree' : r.unobserved === true ? null : 'did not say it was unobserved'
  },
  'a log or ledger not read whole never refuses, and is said': (s, r) => {
    const cut = !s.complete || s.torn
    if (!cut || s.observation.ok !== true || !(s.origin.command || s.origin.origin === 'refused' || s.origin.origin === 'unproven')) return null
    return r === null ? 'said nothing about a record it could not read' : r.deny ? 'refused on a record it could not read' : null
  },
  'a check that could not look or an order that could not be established never refuses': (s, r) => {
    const t = s.tree === treeChecks['could not look'] || s.tree === treeChecks['order unresolved']
    return t && r?.deny ? 'refused on a check that said nothing certain' : null
  },
  'a tree a check passed on is never refused': (s, r) => (s.tree === treeChecks.passed && s.complete && !s.torn && r?.deny ? 'refused a checked tree' : null),
  'a tree equal to the one the session began with is never refused': (s, r) => {
    const equal = s.base === baselines['started at this tree'] && s.observation.ok === true
    return equal && r?.deny ? 'refused a tree nothing changed' : null
  },
  'an opt-out is a warning': (s, r) => (s.setting.warn && r?.deny ? 'refused where the project asked for a warning' : null),
  'a repository whose root could not be read is never refused': (s, r) => (s.origin.origin === 'unproven' && r?.deny ? 'refused with no root' : null),
  'a project with no check says nothing': (s, r) => (s.origin.origin === 'none' && r !== null ? 'spoke for a project with no check' : null),
  'a refusal and "unknown" are never the same answer': (s, r) => (r?.deny && r.unknown ? 'refused and said unknown' : null),
  'a fast pass lets exactly one proven commit through, as advice': (s, r) => {
    if (!s.fast || !s.commitOnly || s.invoked === null || !r?.fast) return null
    return r.deny ? 'refused a commit the fast pass covers' : null
  },
  'every answer that is given says something': (s, r) => (r !== null && (typeof r.text !== 'string' || !r.text) ? 'an answer with no words' : null),
}

function walk(judgement) {
  const broken = Object.fromEntries(Object.keys(PROPERTIES).map(name => [name, []]))
  let total = 0; let refusals = 0; let advice = 0; let silent = 0
  for (const s of scenarios()) {
    const r = judge(judgement, s)
    total++
    if (r === null) silent++; else if (r.deny) refusals++; else advice++
    for (const [name, property] of Object.entries(PROPERTIES)) {
      const why = property(s, r)
      if (why && broken[name].length < 3) broken[name].push(`${why}: ${s.label}`)
    }
  }
  return { broken, total, refusals, advice, silent }
}

test('rule P: no combination of facts breaks a property a refusal must have', () => {
  const { broken, total, refusals, advice, silent } = walk(publishJudgement)
  for (const [name, found] of Object.entries(broken)) assert.deepEqual(found, [], `${name}: ${found.join('\n')}`)
  // The walk is not vacuous: it reaches all three kinds of answer, and a refusal is possible.
  assert.ok(total > 10_000, `the table is ${total} scenarios`)
  assert.ok(refusals > 100, `only ${refusals} scenarios refuse`)
  assert.ok(advice > 1_000, `only ${advice} scenarios advise`)
  assert.ok(silent > 100, `only ${silent} scenarios say nothing`)
})

test('rule P: each property fails on a judgement that breaks it', () => {
  const alwaysDeny = (facts, request) => ({ deny: true, text: 'x', unknown: false })
  const denyMentions = (facts, request) => publishJudgement(facts, { ...request, invoked: request.invoked ?? 'git commit' })
  const ignoreOptOut = (facts, request) => publishJudgement({ ...facts, setting: () => ({ warn: false, ignored: false, unknown: false }) }, request)
  const trustCutLog = (facts, request) => publishJudgement({ ...facts, ledger: () => ({ ...facts.ledger(), torn: false, log: Object.assign([...facts.ledger().log], { complete: true }) }) }, request)
  assert.ok(Object.values(walk(alwaysDeny).broken).filter(found => found.length).length >= 6, 'a judgement that always refuses breaks most properties')
  assert.ok(walk(denyMentions).broken['a mention is never refused'].length > 0, 'a judgement that refuses a mention is caught')
  assert.ok(walk(ignoreOptOut).broken['an opt-out is a warning'].length > 0, 'a judgement that ignores the opt-out is caught')
  assert.ok(walk(trustCutLog).broken['a log or ledger not read whole never refuses, and is said'].length > 0, 'a judgement that reads a cut log as whole is caught')
})

// BACKLOG §381 item 9: the index is observed before the command runs, so a command that stages and then commits was told
// its staged index is "unchecked", a claim about an index the commit will not record. It is said as not known yet, and the
// verdict is unchanged: only the tree can refuse.
test('an index the command stages before committing is not known yet, never unchecked', () => {
  const facts = {
    observation: observations['index differs'], origin: () => origins.declared, setting: () => settings.refuses,
    ledger: () => ({ log: Object.assign([...treeChecks.passed], { complete: true }), dropped: 0, torn: false }),
    caveat: () => '', lateBaselineAllowed: () => false, fastPass: () => null,
  }
  const staged = publishJudgement(facts, { invoked: 'git commit', stagesFirst: true })
  assert.match(staged.text, /the index this commit records is not known yet/, staged.text)
  assert.doesNotMatch(staged.text, /index is unchecked/, staged.text)
  // DIRTY twin: a commit that stages nothing of its own still hears that its staged index is unchecked.
  const plain = publishJudgement(facts, { invoked: 'git commit' })
  assert.match(plain.text, /the staged index is unchecked/, plain.text)
  assert.equal(staged.deny, plain.deny, 'wording only: the verdict does not move')
  for (const command of ['git add -A && git commit -F -', 'git -C repo add x; git -C repo commit -m "x"', 'git stage x && git commit', 'git commit -am "x"', 'git commit --all -m x'])
    assert.equal(stagesBeforeCommit(command), true, command)
  for (const command of ['git commit -m "a fix"', 'git commit --amend -m x', 'git commit -m x && git add y', 'echo git add; git commit -m x'])
    assert.equal(stagesBeforeCommit(command), false, command)
})

// The recorded review of v3.8.35..e957da1e (advisory a): the `-a` test matched any short cluster holding an `a`, an attached
// value included, so `-uall` and `-Sabc` read as staging. A cluster is read letter by letter, and a letter that takes a value
// ends it (u, S, m, F, c, C, t); a value-taking letter at its end takes the next word as its value.
test("a commit's -a is a flag, never a letter inside an option's value", () => {
  for (const command of ['git commit -uall -m x', 'git commit -Sabc -m x', 'git commit -mall', 'git commit -m -a', 'git commit -F - -m x', 'git commit -t -a -m x'])
    assert.equal(stagesBeforeCommit(command), false, command)
  // CLEAN twins: the flag, alone or clustered before a value-taking letter, or after `-u` or `-S`, whose values are attached
  // only, still stages (each measured against git 2.56.0, 2026-10-16).
  for (const command of ['git commit -am "x"', 'git commit -qa -m x', 'git commit -m x -a', 'git commit -vam x', 'git commit -u -a -m x', 'git commit -S -a -m x'])
    assert.equal(stagesBeforeCommit(command), true, command)
})
