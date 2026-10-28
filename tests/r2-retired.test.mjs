// ADR-128 T1: R2 is retired. The owner, 2026-10-23: "R2 check only head", and R1 already speaks for HEAD's tree, so no turn
// end names a commit below HEAD, under either core. R1 is untouched: an unchecked tree is still named.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fixtureRepo, git, ledgers, runHook, runQhCheck, sandbox } from './hook-golden.mjs'

const skip = process.platform === 'win32' && 'the fixtures are the goldens\' and are recorded on POSIX (BACKLOG section 375)'
const DECLARED = { '.quality-harness.json': '{"check":"sh check.sh"}\n', 'check.sh': 'exit 0\n', 'src/a.js': 'export const a = 1\n' }
const said = run => `${run.stdout?.hookSpecificOutput?.additionalContext ?? ''}\n${run.stdout?.systemMessage ?? ''}`
const rules = repo => Object.values(ledgers(repo)).flat().filter(row => row?.event === 'action.emitted').map(row => row.rule)

test('no turn end names a commit below HEAD', { skip }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'r2-retired', DECLARED)
  const hook = payload => runHook(box, repo, 'r2-retired-1', payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  // A commit no check passed on, then a fix the check passed on, committed: HEAD's tree is checked, the one below is not.
  writeFileSync(path.join(repo, 'src/a.js'), 'export const a = 2 // broken\n')
  git(repo, box, 'add', '-A')
  git(repo, box, 'commit', '-q', '-m', 'unchecked below head', '--no-gpg-sign')
  const below = git(repo, box, 'rev-parse', 'HEAD')
  writeFileSync(path.join(repo, 'src/a.js'), 'export const a = 3\n')
  assert.equal(runQhCheck(box, repo).exit, 0)
  git(repo, box, 'add', '-A')
  git(repo, box, 'commit', '-q', '-m', 'checked fix', '--no-gpg-sign')
  const end = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.doesNotMatch(end, /newly reachable commit/, end)
  assert.doesNotMatch(end, /unchecked below head/, end)
  assert.ok(!end.includes(below.slice(0, 8)), end)
  assert.ok(!rules(repo).includes('R2'), JSON.stringify(rules(repo)))
})

test('R1 still names an unchecked tree', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'r1-stays', DECLARED)
  const hook = payload => runHook(box, repo, 'r1-stays-1', payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(repo, 'src/a.js'), 'export const a = 2\n')
  const end = said(hook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }))
  assert.match(end, /work no `qh-check` has passed on/, end)
  assert.ok(rules(repo).includes('R1'), JSON.stringify(rules(repo)))
  assert.ok(!rules(repo).includes('R2'), JSON.stringify(rules(repo)))
})
