// The two blocking findings of the review of 7a9107e8..dcc4693a, each through the call the review made it through.
// ADR-120 T9: a pass carried to a prose-only tree is vetoed by a write git cannot see that ANY session logged after it, as
// `passedAlready` vetoes a reuse; ADR-120 T11: a command-local assignment (`PATH=/bin sh -c ...`) can change where the program is
// found, so the startability probe says the check can start. The Go twins are spawned at the end.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { carryFor } from '../plugin/scripts/check-ledger.mjs'
import { checkStanding } from './helpers/node-hooks/check-ledger.mjs'
import { checkCanStart } from './helpers/node-hooks/completion-rules.mjs'
import { readEvents } from '../plugin/scripts/event-log.mjs'
import { sessionLogFile } from '../plugin/scripts/event-log.mjs'
import { fixtureRepo, runHook, runQhCheck, sandbox } from './hook-golden.mjs'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be tested here` : false)
const posixOnly = process.platform === 'win32' && 'the sessions this runs are recorded on POSIX, as the goldens are (BACKLOG section 375)'

const PROSE = ['docs/**', '**/*.md']
const stop = { hook_event_name: 'Stop', last_assistant_message: 'Fixed it.\nSTATUS: done' }
const said = run => `${JSON.stringify(run.stdout)}${run.stderr}`

// Another session's log of this repository, holding one write git cannot see.
function otherSessionWrote(repo, at) {
  const file = sessionLogFile(repo, 'other-session', { spawn: false })
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ at, event: 'file.written', path: path.join(repo, 'build', 'x'), observable: false })}\n`)
}

test('a write another session made after the pass ends the carry-over, and one made before it does not', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'foreign', { '.quality-harness.json': `${JSON.stringify({ check: 'sh check.sh', prose: PROSE })}\n`, 'check.sh': 'exit 0\n', '.gitignore': 'build/\n', 'src/a.mjs': 'export const a = 0\n', 'docs/a.md': 'one\n' })
  const started = '2026-10-21T10:00:00.000Z'
  const pass = { event: 'check.passed', record: 'r1', seq: 1, startedAt: started, before: { at: started }, after: { tree: 'T1', codeTree: 'C1' }, prose: PROSE }
  const log = Object.assign([pass], { complete: true })
  const standing = () => checkStanding(log, 'T2', carryFor(log, repo, 'C1', PROSE))
  assert.equal(standing(), 'passed', 'the control: no other session wrote anything')
  otherSessionWrote(repo, '2026-10-21T09:00:00.000Z')
  assert.equal(standing(), 'passed', 'a write logged before the pass started is covered by it')
  otherSessionWrote(repo, '2026-10-21T10:30:00.000Z')
  assert.equal(carryFor(log, repo, 'C1', PROSE), null, 'a write another session logged after the pass vetoes the carry')
  assert.equal(standing(), 'none', 'so the prose-only tree has no pass')
  assert.equal(carryFor(log, null, 'C1', PROSE)?.codeTree, 'C1', 'with no root there is nowhere to look, as the status line asks it')

  // Through the call the review made it through: a pass, a prose edit, then a write another session logged to an ignored file.
  const repo2 = fixtureRepo(box, 'foreign-hook', { '.quality-harness.json': `${JSON.stringify({ check: 'sh check.sh', prose: PROSE })}\n`, 'check.sh': 'exit 0\n', '.gitignore': 'build/\n', 'src/a.mjs': 'export const a = 0\n', 'docs/a.md': 'one\n' })
  const hook = payload => runHook(box, repo2, 'foreign-hook-1', payload)
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  writeFileSync(path.join(repo2, 'src', 'a.mjs'), 'export const a = 1\n')
  assert.equal(runQhCheck(box, repo2).exit, 0)
  writeFileSync(path.join(repo2, 'docs', 'a.md'), 'two\n')
  const clean = hook(stop)
  assert.doesNotMatch(said(clean), /work no `qh-check` has passed on/, 'the control: a prose-only edit after a pass is silent')
  assert.equal(readEvents(repo2, 'foreign-hook-1').some(entry => entry.event === 'action.emitted'), false)
  writeFileSync(path.join(repo2, 'docs', 'a.md'), 'three\n')
  otherSessionWrote(repo2, new Date(Date.now() + 60_000).toISOString())
  assert.match(said(hook(stop)), /work no `qh-check` has passed on/, 'a foreign unseen write after the pass: R1 speaks')
})

test('a declared check with a command-local assignment can start, and a plain missing program cannot', () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), 'qh-probe-path-'))
  try {
    const env = { PATH: empty }
    assert.equal(checkCanStart("PATH=/bin sh -c 'test -f CLAUDE.md'", empty, env), true, 'the assignment may put the program on a PATH the probe cannot see')
    assert.equal(checkCanStart('PATH=/bin sh -c true', empty, env), true)
    assert.equal(checkCanStart('FOO=1 nosuchprogram-xyz', empty, env), false, 'an assignment that is not PATH moves nothing')
    assert.equal(checkCanStart('CI=1 node scripts/definitely-missing-t11.mjs', empty, { PATH: process.env.PATH }), false, 'nor does it hide a missing script')
    assert.equal(checkCanStart('PATHEXT=.X nosuchprogram-xyz', empty, env), true)
    assert.equal(checkCanStart('nosuchprogram-xyz', empty, env), false, 'the twin: no assignment, no such program')
    assert.equal(checkCanStart('sh -c true', empty, env), false, 'and a real program on no PATH directory')
  } finally { remove(empty) }
})

test("the Go core's foreign-write veto and assignment probe hold", { skip: noGo || posixOnly }, () => {
  const run = spawnSync('go', ['test', '-count=1', '-run', '^(?:TestCarryForRefusesAForeignWrite|TestCheckCanStartReadsAssignments)$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true,
  })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
})
