// ADR-108 T3. A write that matched nothing reports success everywhere except in the tree; the turn-end rule W names the
// paths a turn wrote when the observed tree equals the observation taken before the first of those writes. Each case runs the
// real lifecycle hook against a fixture repository, so the dirty twins are the same call with one fact changed.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fixtureRepo, ledgers, runHook, sandbox } from './hook-golden.mjs'

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
