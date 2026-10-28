// ADR-108: the hooks say what to do next. Each test drives the real hook in a temp repository (tests/hook-golden.mjs).
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fixtureRepo, ledgers, pluginDir, runHook, runQhCheck, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'the hooks are driven through POSIX shells (tests/hook-goldens.test.mjs)'
const wrote = file => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x\n' }, tool_response: { filePath: file, success: true } })

// A turn that wrote one file, ran the declared check once, and ended: what the Stop hook said about it.
function turnEnd(t, check, { ran = true } = {}) {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'turn', { '.quality-harness.json': `${JSON.stringify({ check })}\n`, 'src/a.js': 'export const a = 1\n' })
  runHook(box, repo, 'adr-108', { hook_event_name: 'SessionStart', source: 'startup' })
  const file = path.join(repo, 'src', 'b.js')
  writeFileSync(file, 'export const b = 2\n')
  runHook(box, repo, 'adr-108', wrote(file))
  if (ran) runQhCheck(box, repo)
  const stop = runHook(box, repo, 'adr-108', { hook_event_name: 'Stop', last_assistant_message: 'Done.' })
  assert.equal(stop.exit, 0, stop.stderr)
  return JSON.stringify(stop.stdout)
}

test('a check that could not start is reported once as evidence-limited, not run again', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const unstarted = turnEnd(t, 'qh-no-such-command-adr108')
  assert.match(unstarted, /did not start \(unstarted\)/, 'the finding names which verdict it read')
  assert.match(unstarted, /EVIDENCE-LIMITED/)
  assert.match(unstarted, /do not run it again on this tree/)
  assert.match(unstarted, /declaring the real command as check in \.quality-harness\.json/)
  assert.doesNotMatch(unstarted, /Run `qh-check`/, 'it is not also asked to run the check again')
  // Dirty twins: a check that ran and FAILED, and a tree no check ran on, are asked to run the check and are not told to
  // report evidence-limited. Since ADR-111 T2 a failed check leads with its failure; a tree no check ran on keeps its opening.
  const twins = [['a failed check', turnEnd(t, 'exit 1'), /the last `qh-check` on this turn's work failed/], ['no check at all', turnEnd(t, 'node --version', { ran: false }), /this turn ends with work no `qh-check` has passed on\./]]
  for (const [name, text, opening] of twins) {
    assert.match(text, opening, `${name} has its own opening`)
    assert.match(text, /Run `qh-check`/, `${name} is still asked to run the check`)
    assert.doesNotMatch(text, /EVIDENCE-LIMITED|do not run it again/, `${name} is not told to report evidence-limited`)
  }
})

test('a spawned implementer is told to read every site, edit in one batch, and check each edit landed', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'spawn', { '.quality-harness.json': `${JSON.stringify({ check: 'node --version' })}\n` })
  const contract = type => {
    const start = runHook(box, repo, `adr-108-${type}`, { hook_event_name: 'SubagentStart', agent_id: `a-${type}`, agent_type: type })
    assert.equal(start.exit, 0, start.stderr)
    return start.stdout.hookSpecificOutput.additionalContext
  }
  const SENTENCE = 'Read every site you will touch before the first edit, make the edits as one batch, and check that each landed: an edit that matched nothing is a failure (the execution skill\'s "Read and edit in batches").'
  const implementer = contract('teammate-js')
  assert.ok(implementer.includes(SENTENCE), `an implementer's contract lacks the sentence:\n${implementer}`)
  assert.ok(implementer.indexOf(SENTENCE) > implementer.indexOf('make the smallest coherent diff'), 'it follows the role line')
  // Dirty twins: a read-only role does not edit, so it is not told how to; a name the read-only pattern holds is one.
  for (const type of ['qh-correctness-reviewer', 'Explore']) {
    assert.ok(!contract(type).includes('Read every site you will touch'), `${type} is read-only and gets no editing advice`)
  }
  // The heading it points to exists in the skill it names.
  assert.ok(readFileSync(path.join(pluginDir, 'skills', 'execution', 'SKILL.md'), 'utf8').includes('\n## Read and edit in batches\n'))
})


// ADR-108 T3. A write that matched nothing reports success everywhere except in the tree; the turn-end rule W names the
// paths a turn wrote when the observed tree equals the observation taken before the first of those writes. Each case runs the
// real lifecycle hook against a fixture repository, so the dirty twins are the same call with one fact changed.
const BASE = { '.quality-harness.json': '{"check":"sh check.sh","fastCheck":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n', '.gitignore': 'ignored.txt\n' }
const edit = file => ({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: 'a = 1', new_string: 'a = 2' }, tool_response: { success: true } })
const stop = { hook_event_name: 'Stop', last_assistant_message: 'Edited the file.' }
const said = run => JSON.stringify(run.stdout) + run.stderr
const W = 'did not change'

test('a turn whose writes left the tree unchanged is told so once, and a turn whose writes changed it is not', t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'w', BASE)
  const a = path.join(repo, 'src', 'a.js')
  runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source: 'startup' })
  // An Edit that matched nothing: the hook is told it succeeded, the file is byte-identical.
  runHook(box, repo, 's1', edit(a))
  const first = runHook(box, repo, 's1', stop)
  assert.match(said(first), /this turn wrote src[\\/]+a\.js and the tree it wrote to did not change/, said(first))
  assert.ok((ledgers(repo)['sessions/s1.jsonl'] ?? []).some(row => row.event === 'action.emitted' && row.rule === 'W'), 'the finding is recorded as emitted')
  // The same tree, written to again in the next turn: said once per tree.
  runHook(box, repo, 's1', edit(a))
  assert.doesNotMatch(said(runHook(box, repo, 's1', stop)), new RegExp(W), 'a second turn over the same tree is silent')

  // Twin: the Edit changed the file.
  writeFileSync(a, 'export const a = 2\n')
  runHook(box, repo, 's1', edit(a))
  assert.doesNotMatch(said(runHook(box, repo, 's1', stop)), new RegExp(W), 'a write that changed the tree is not named')

  // Twin: a write git cannot see (an ignored file, and a path outside the repository) is never named.
  const hidden = fixtureRepo(box, 'hidden', BASE)
  writeFileSync(path.join(hidden, 'ignored.txt'), 'x\n')
  runHook(box, hidden, 's2', { hook_event_name: 'SessionStart', source: 'startup' })
  runHook(box, hidden, 's2', edit(path.join(hidden, 'ignored.txt')))
  runHook(box, hidden, 's2', edit(path.join(box.tmp, 'scratch.txt')))
  assert.doesNotMatch(said(runHook(box, hidden, 's2', stop)), new RegExp(W), 'an unobservable write is not named (ADR-051)')

  // Twin: the tree could not be observed at the Stop, so nothing is known about it.
  const blind = fixtureRepo(box, 'blind', BASE)
  runHook(box, blind, 's3', { hook_event_name: 'SessionStart', source: 'startup' })
  runHook(box, blind, 's3', edit(path.join(blind, 'src', 'a.js')))
  const blinded = runHook(box, blind, 's3', stop, { QUALITY_HARNESS_OBSERVE_BUDGET_MS: '1' })
  assert.equal((ledgers(blind)['sessions/s3.jsonl'] ?? []).findLast(row => row.event === 'turn.ended')?.observation?.ok, false, 'the Stop could not look at the tree')
  assert.doesNotMatch(said(blinded), new RegExp(W), 'an observation that failed says nothing (ADR-005)')
})

// The Codex review of v3.8.42..2c747201: a write the observed tree cannot see is not "unchanged". `.git/config` is not
// ignored and hashes, so it was recorded observable, but the observation is the work tree's: a real change to it (a user.name)
// left tree, index and HEAD equal, and W told the agent to apply the write again. Only paths inside the observed tree count.
test('a write the observed tree cannot contain is never named unchanged, and a no-op inside it still is', t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'gitdir', BASE)
  runHook(box, repo, 's1', { hook_event_name: 'SessionStart', source: 'startup' })
  const config = path.join(repo, '.git', 'config')
  writeFileSync(config, `${readFileSync(config, 'utf8')}[user]\n\tname = changed\n`)
  runHook(box, repo, 's1', edit(config))
  assert.doesNotMatch(said(runHook(box, repo, 's1', stop)), new RegExp(W), 'a write under .git is not named')
  // Clean twin: a no-op Edit inside the work tree, in the same kind of session, is named.
  const other = fixtureRepo(box, 'gitdir-twin', BASE)
  runHook(box, other, 's2', { hook_event_name: 'SessionStart', source: 'startup' })
  runHook(box, other, 's2', edit(path.join(other, 'src', 'a.js')))
  assert.match(said(runHook(box, other, 's2', stop)), new RegExp(W), 'a no-op inside the work tree is still named')
  // Its scoped review: a `.git` below the top is no more visible to the tree than the top one.
  const nested = fixtureRepo(box, 'gitdir-nested', BASE)
  mkdirSync(path.join(nested, 'vendor', '.git'), { recursive: true })
  runHook(box, nested, 's3', { hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(nested, 'vendor', '.git', 'config'), 'x\n')
  runHook(box, nested, 's3', edit(path.join(nested, 'vendor', '.git', 'config')))
  assert.doesNotMatch(said(runHook(box, nested, 's3', stop)), new RegExp(W), 'a write under a nested .git is not named')
})

// BACKLOG §383 (2026-10-18): a full check passed while this session committed beside it, so its trees before and after
// differed and it read as unproven, and the turn end said "do not run it again on this tree". A run the tree moved under is
// not one that could not start: it is to be run again once the tree holds still.
test('a check the tree moved under is to be run again, not reported as could-not-start', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const said = turnEnd(t, 'sh -c "echo x >> src/moved.js"')
  assert.match(said, /the tree changed while it ran/)
  assert.match(said, /Run `qh-check`/, 'it is asked to run the check again')
  assert.doesNotMatch(said, /do not run it again|EVIDENCE-LIMITED/, 'it is not told to stop checking')
})
