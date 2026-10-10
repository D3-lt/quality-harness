// BACKLOG section 376: what `qh-check` decides before it runs anything is a function of the facts it is handed. The table walks
// every combination of them and checks what a refusal, a run and a skip must each look like, in the order the facts are read:
// a refusal reads no more than it needs, and a fact is read at most once. Each property is then shown failing on a plan that
// breaks it, because a property no broken plan can fail checks nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../plugin/scripts/qh-check.mjs'

const NAMED = {
  declared: { command: 'make check', origin: 'declared' },
  inferred: { command: 'npm test', origin: 'inferred' },
  refused: { command: 'true', origin: 'refused' },
  unproven: { command: null, origin: 'unproven' },
  nothing: { command: null, origin: 'none' },
}
const PROSE = { none: { specs: [], problem: null }, declared: { specs: ['docs'], problem: null }, said: { specs: [], problem: 'a prose path could hide code' } }
const PASS = { id: 'p1', tree: 't1' }

// Every combination of the facts a plan can be handed, with the reads each one makes counted.
function* cases() {
  for (const configProblem of [null, 'the config is not JSON'])
    for (const fast of [false, true])
      for (const fastCommand of [null, 'make fast'])
        for (const named of Object.keys(NAMED))
          for (const prose of Object.keys(PROSE))
            for (const passed of [null, PASS])
              for (const again of [false, true])
                for (const envAgain of [undefined, '1', '0']) {
                  const reads = []
                  const fact = (name, value) => () => { reads.push(name); return value }
                  const facts = {
                    configProblem: fact('configProblem', configProblem), fastCommand: fact('fastCommand', fastCommand),
                    named: fact('named', fast ? { command: fastCommand, origin: 'fast' } : NAMED[named]),
                    prose: fact('prose', PROSE[prose]), passed: fact('passed', passed),
                  }
                  yield { facts, reads, fast, again, env: envAgain === undefined ? {} : { QUALITY_HARNESS_CHECK_AGAIN: envAgain },
                    configProblem, fastCommand, named: fast ? { command: fastCommand, origin: 'fast' } : NAMED[named], prose: PROSE[prose], passed }
                }
}

// What must hold of a plan, whatever the facts. Returns the properties it breaks.
function broken(plan, input) {
  const { reads, fast, again, env, configProblem, fastCommand, named, prose, passed } = input
  const out = []
  const refused = plan.code !== undefined
  const rerun = fast || again || env.QUALITY_HARNESS_CHECK_AGAIN === '1'
  const refusal = configProblem ? 'config' : fast && !fastCommand ? 'fast' : !named.command || ['refused', 'unproven'].includes(named.origin) ? 'command' : null
  if (refused !== Boolean(refusal)) out.push(`refused is ${refused}, the facts say ${refusal}`)
  if (new Set(reads).size !== reads.length) out.push(`a fact was read twice: ${reads}`)
  if (refused) {
    if (plan.code !== 2) out.push(`a refusal exits ${plan.code}`)
    if (!/^qh-check: .*\n$/s.test(plan.said ?? '')) out.push('a refusal says nothing, or does not end its line')
    if ('already' in plan || 'command' in plan) out.push('a refusal also names a command or a pass')
    if (refusal === 'config' && reads.join() !== 'configProblem') out.push(`a config that cannot be read still read ${reads}`)
    if (refusal === 'fast' && reads.includes('named')) out.push('the command was resolved for a --fast with nothing to run')
    if (refusal === 'command' && (reads.includes('prose') || reads.includes('passed'))) out.push('prose or the ledger was read for a refused command')
    // Each reason is said in its own words: two refusals that share an exit are told apart by what they say.
    const wording = refusal === 'config' ? /UNRUN/ : refusal === 'fast' ? /`--fast` has nothing to run/
      : named.origin === 'refused' ? /constant success/ : named.origin === 'unproven' ? /repository root could not be read/ : /no check to run/
    if (!wording.test(plan.said)) out.push(`the refusal for ${refusal} says "${plan.said}"`)
    return out
  }
  if (plan.command !== named.command || plan.origin !== named.origin) out.push('the plan names another command than the one resolved')
  if (plan.prose !== prose) out.push('the plan carries other prose than the one declared')
  if (plan.notes.length !== (prose.problem ? 1 : 0)) out.push('a prose problem is not said exactly once')
  if (rerun && plan.already !== null) out.push('a run that was asked to run again is told the tree was checked')
  if (rerun && reads.includes('passed')) out.push('the ledger was read for a run that cannot use it')
  if (!rerun && plan.already !== passed) out.push('the pass that covers this tree is not the one the ledger gave')
  if (!rerun && !reads.includes('passed')) out.push('the ledger was not asked')
  return out
}

test('the plan: every combination of the facts is refused, run or skipped as the facts say, reading each fact at most once', () => {
  let walked = 0
  for (const input of cases()) {
    const plan = checkPlan(input.facts, { fast: input.fast, again: input.again, env: input.env })
    assert.deepEqual(broken(plan, input), [], `facts: ${JSON.stringify({ ...input, facts: undefined, reads: input.reads })}`)
    walked++
  }
  assert.equal(walked, 2 * 2 * 2 * 5 * 3 * 2 * 2 * 3, 'the walk covered every combination')
})

test('the plan: each property fails on a plan that breaks it', () => {
  // A broken plan is the real one with one thing changed on the way out, or a facts object that reads too much.
  const real = (input) => checkPlan(input.facts, { fast: input.fast, again: input.again, env: input.env })
  const breakages = {
    'a fast run may be skipped': input => { const plan = real(input); if (input.fast && plan.code === undefined) plan.already = input.passed; return plan },
    'the environment does not ask for another run': input => checkPlan(input.facts, { fast: input.fast, again: input.again, env: {} }),
    'a refusal exits 1': input => { const plan = real(input); if (plan.code !== undefined) plan.code = 1; return plan },
    'a refusal says nothing': input => { const plan = real(input); if (plan.code !== undefined) plan.said = ''; return plan },
    'a prose problem is dropped': input => { const plan = real(input); if (plan.code === undefined) plan.notes = []; return plan },
    'the ledger is read before the command is known': input => { input.facts.passed(); return real(input) },
    'a config problem is read past': input => { input.facts.named(); return real(input) },
    'the command is another': input => { const plan = real(input); if (plan.code === undefined) plan.command = 'true'; return plan },
  }
  for (const [what, make] of Object.entries(breakages)) {
    let caught = 0
    for (const input of cases()) if (broken(make(input), input).length) caught++
    assert.ok(caught > 0, `no combination showed that "${what}" breaks a property`)
  }
})
