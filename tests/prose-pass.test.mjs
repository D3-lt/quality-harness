// ADR-120 T9. A pass on tree X stands for a later tree Y while the only paths that differ are the project's declared `prose`,
// for every reader of a pass: the publish verdict (Claude's PreToolUse and git's own hook), the turn end, and the Go core.
// Every "this is code again" twin sits beside the carry-over: a code edit, a changed list, an unseen write, a commit whose own
// code tree has no pass, and a staged index whose code differs. Run through the real hooks and the real qh-check.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkStanding, carryFor, latestCheckFor, ledgerBoundLog } from '../plugin/scripts/check-ledger.mjs'
import { readEvents } from '../plugin/scripts/event-log.mjs'
import { runPublishHook } from '../plugin/scripts/publish-hook.mjs'
import { sessionLogFile } from '../plugin/scripts/lifecycle.mjs'
import { reading, render } from '../plugin/scripts/statusline.mjs'
import { fixtureRepo, git, runHook, runQhCheck, sandbox } from './hook-golden.mjs'
import { required } from './helpers/require.mjs'
import { remove } from './helpers/remove.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const coreDir = path.resolve(here, '..', 'core')
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)
const posixOnly = process.platform === 'win32' && 'the sessions this runs are recorded on POSIX, as the goldens are (BACKLOG section 375)'

let goDirectory = null
let goBinary = null
after(() => { if (goDirectory) remove(goDirectory) })
function goCore() {
  if (goBinary) return goBinary
  goDirectory = mkdtempSync(path.join(os.tmpdir(), 'qh-prose-pass-bin-'))
  goBinary = path.join(goDirectory, process.platform === 'win32' ? 'qh.exe' : 'qh')
  const built = spawnSync('go', ['build', '-o', goBinary, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, `go build failed: ${built.stderr}`)
  return goBinary
}
const implementations = () => [{ impl: 'node' }, ...(noGo ? [] : [{ impl: 'go', bin: goCore() }])]

const PROSE = ['docs/**', '**/*.md']
const bash = command => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } })
const stop = { hook_event_name: 'Stop', last_assistant_message: 'Fixed it.\nSTATUS: done' }
const said = run => `${JSON.stringify(run.stdout)}${run.stderr}`
const denied = run => run.stdout?.hookSpecificOutput?.permissionDecision === 'deny'
const R1 = /work no `qh-check` has passed on/
const R2 = /newly reachable commit is unchecked/

// A repository whose session began on its committed tree, whose code was edited and whose check then passed on it.
function begin(t, implementation, { prose = PROSE, commitCode = false } = {}) {
  const box = sandbox(t)
  const config = { check: 'sh check.sh', ...(prose ? { prose } : {}) }
  const repo = fixtureRepo(box, `r-${implementation.impl}`, {
    '.quality-harness.json': `${JSON.stringify(config)}\n`, 'check.sh': 'exit 0\n', '.gitignore': 'build/\n',
    'src/a.mjs': 'export const a = 0\n', 'docs/a.md': 'one\n',
  })
  const session = `prose-pass-${implementation.impl}`
  const hook = payload => runHook(box, repo, session, payload, {}, implementation)
  const put = (file, text) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text) }
  const commit = message => { git(repo, box, 'add', '-A'); git(repo, box, 'commit', '-q', '-m', message, '--no-gpg-sign'); return git(repo, box, 'rev-parse', 'HEAD') }
  hook({ hook_event_name: 'SessionStart', source: 'startup' })
  put('src/a.mjs', 'export const a = 1\n')
  if (commitCode) commit('code A')
  const check = runQhCheck(box, repo)
  assert.equal(check.exit, 0, `the check passed: ${check.stderr}`)
  return { box, repo, session, hook, put, commit, git: (...args) => git(repo, box, ...args) }
}

test('a pass stands across a prose-only change for every reader', { skip: posixOnly }, t => {
  for (const implementation of implementations()) {
    const s = begin(t, implementation)
    s.put('docs/a.md', 'two\n')
    const commit = s.hook(bash('git commit -m x'))
    assert.equal(denied(commit), false, `${implementation.impl}: a prose edit after a pass is not refused: ${said(commit)}`)
    assert.doesNotMatch(said(commit), /unchecked|permissionDecision/, `${implementation.impl}: and not warned of`)
    const end = s.hook(stop)
    assert.doesNotMatch(said(end), R1, `${implementation.impl}: R1 is silent`)
    assert.doesNotMatch(said(end), R2, `${implementation.impl}: R2 is silent`)

    if (implementation.impl !== 'node') continue
    // The readers that take a log and a tree: the observation carries its code tree and the list it was taken under.
    const log = readEvents(s.repo, s.session)
    const observation = log.findLast(entry => entry.observation?.ok === true).observation
    assert.equal(typeof observation.codeTree, 'string')
    assert.deepEqual(observation.prose, PROSE)
    assert.notEqual(checkStanding(log, observation.tree), 'passed', 'the exact tree has no pass of its own')
    const carry = carryFor(log, s.repo, observation.codeTree, observation.prose)
    assert.equal(checkStanding(log, observation.tree, carry), 'passed')
    assert.equal(latestCheckFor(log, observation.tree, carry)?.event, 'check.passed', 'the status line and the notes read the same pass')
    // Git's own hook is the same verdict, asked of the same tree.
    const env = { ...process.env, CLAUDE_CODE_SESSION_ID: s.session, QUALITY_HARNESS_OBSERVE_BUDGET_MS: '60000' }
    const hookRun = runPublishHook({ event: 'prepare-commit-msg', cwd: s.repo, env })
    assert.deepEqual(hookRun, { code: 0 }, "git's hook lets a prose-only commit through")
    s.put('src/a.mjs', 'export const a = 2\n')
    assert.equal(runPublishHook({ event: 'prepare-commit-msg', cwd: s.repo, env }).code, 1, "and refuses it once code changed")
  }
})

test('a code change, a changed prose list or an unseen write ends the carry-over', { skip: posixOnly }, t => {
  for (const implementation of implementations()) {
    const name = implementation.impl
    // A code edit beside the prose edit.
    const code = begin(t, implementation)
    code.put('docs/a.md', 'two\n')
    code.put('src/a.mjs', 'export const a = 2\n')
    assert.equal(denied(code.hook(bash('git commit -m x'))), true, `${name}: a code edit is refused`)
    const codeEnd = begin(t, implementation)
    codeEnd.put('docs/a.md', 'two\n')
    codeEnd.put('src/a.mjs', 'export const a = 2\n')
    assert.match(said(codeEnd.hook(stop)), R1, `${name}: and R1 speaks`)

    // A write git cannot see, after the pass.
    const unseen = begin(t, implementation)
    unseen.put('docs/a.md', 'two\n')
    unseen.put('build/out.txt', 'x\n')
    const file = path.join(unseen.repo, 'build', 'out.txt')
    unseen.hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file, content: 'x\n' }, tool_response: { filePath: file, success: true } })
    assert.equal(denied(unseen.hook(bash('git commit -m x'))), true, `${name}: an unseen write after the pass is refused`)
    const unseenEnd = begin(t, implementation)
    unseenEnd.put('docs/a.md', 'two\n')
    unseenEnd.put('build/out.txt', 'x\n')
    const unseenFile = path.join(unseenEnd.repo, 'build', 'out.txt')
    unseenEnd.hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: unseenFile, content: 'x\n' }, tool_response: { filePath: unseenFile, success: true } })
    assert.match(said(unseenEnd.hook(stop)), R1, `${name}: and R1 speaks`)

    // A pass on X, unchecked code Y committed, then X's code again with a prose edit: Y has no pass of its own.
    const restored = begin(t, implementation)
    restored.put('src/a.mjs', 'export const a = 9\n')
    const sha = restored.commit('code Y')
    restored.put('src/a.mjs', 'export const a = 1\n')
    restored.put('docs/a.md', 'two\n')
    const restoredEnd = restored.hook(stop)
    assert.doesNotMatch(said(restoredEnd), R1, `${name}: the working tree is X's code again, so R1 is silent`)
    assert.doesNotMatch(said(restoredEnd), R2, `${name}: and commit Y is not named either: R2 is retired (ADR-128 T1)`)
    assert.equal(said(restoredEnd).includes(sha.slice(0, 8)), false, `${name}: not even by its sha`)
    // The claim still asks HEAD's own commit with its own code tree: Y's code has no pass, whatever the working tree holds.
    const claims = readFileSync(path.join(restored.box.data, 'claims.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.equal(claims.at(-1)?.evidence, 'unverified', `${name}: the claim reads commit Y unverified`)

    // A commit that is X's code plus a prose edit is not named.
    const proseCommit = begin(t, implementation)
    proseCommit.put('docs/a.md', 'two\n')
    proseCommit.commit('docs only')
    proseCommit.put('docs/a.md', 'three\n')
    const proseEnd = proseCommit.hook(stop)
    assert.doesNotMatch(said(proseEnd), R2, `${name}: a historical prose-only commit stands on the pass`)
    assert.doesNotMatch(said(proseEnd), R1, `${name}: and so does the tree after it`)
    // The claim reads HEAD's commit through its own code tree: X's code plus a prose edit stands on X's pass (ADR-120 T9).
    const proseClaims = readFileSync(path.join(proseCommit.box.data, 'claims.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.equal(proseClaims.at(-1)?.evidence, 'verified', `${name}: the claim reads the prose-only commit verified`)

    // A staged index whose code is X's code with a prose edit staged stands; one holding other code does not.
    const staged = begin(t, implementation)
    staged.put('docs/a.md', 'two\n')
    staged.git('add', 'src/a.mjs', 'docs/a.md')
    staged.put('docs/a.md', 'three\n')
    const stagedRun = staged.hook(bash('git commit -m x'))
    assert.equal(denied(stagedRun), false, `${name}: a staged prose edit beside X's code is not refused`)
    assert.doesNotMatch(said(stagedRun), /staged index|unchecked/, `${name}: a staged prose edit beside X's code stands`)
    const other = begin(t, implementation)
    other.put('src/a.mjs', 'export const a = 7\n')
    other.put('docs/a.md', 'two\n')
    other.git('add', 'src/a.mjs', 'docs/a.md')
    other.put('src/a.mjs', 'export const a = 1\n')
    const otherRun = other.hook(bash('git commit -m x'))
    assert.equal(denied(otherRun), false, `${name}: only the working tree refuses`)
    assert.match(said(otherRun), /staged index is (?:not known to be checked|unchecked)/, `${name}: a staged index holding other code is still said`)
  }

  // The pieces a project cannot reach by editing files: the list, a newer non-pass, and an unseen write, through the seam.
  const s = begin(t, { impl: 'node' })
  s.put('docs/a.md', 'two\n')
  s.hook(stop)
  const log = readEvents(s.repo, s.session)
  const observation = log.findLast(entry => entry.observation?.ok === true).observation
  const carry = carryFor(log, s.repo, observation.codeTree, observation.prose)
  assert.equal(checkStanding(log, observation.tree, carry), 'passed', 'the control')
  assert.equal(checkStanding(log, observation.tree, { ...carry, prose: ['docs/**'] }), 'none', 'another list')
  assert.equal(checkStanding(log, observation.tree, { codeTree: 'different', prose: carry.prose }), 'none', 'another code tree')
  assert.equal(carryFor(log, s.repo, undefined, observation.prose), null, 'a tree observed without its code tree')
  assert.equal(carryFor(log, s.repo, observation.codeTree, []), null, 'no declaration')
  const newest = { event: 'check.failed', record: 'newer', seq: 99, startedAt: '2999-01-01T00:00:00.000Z', after: { tree: 'elsewhere', codeTree: observation.codeTree }, prose: observation.prose }
  const failed = Object.assign([...log, newest], { complete: log.complete })
  assert.equal(checkStanding(failed, observation.tree, carry), 'not-passed', 'a newer non-pass on the same code tree wins')
  const write = { event: 'file.written', path: path.join(s.repo, 'build', 'x'), observable: false, at: '2999-01-01T00:00:00.000Z' }
  const written = Object.assign([...log, write], { complete: log.complete })
  assert.equal(carryFor(written, s.repo, observation.codeTree, observation.prose), null, 'an unseen write after the pass vetoes the carry')
})

test('a prose-only unchecked diff with no prose declared names the setting once', { skip: posixOnly }, t => {
  for (const implementation of implementations()) {
    const name = implementation.impl
    const s = begin(t, implementation, { prose: null, commitCode: true })
    s.put('docs/a.md', 'two\n')
    const first = s.hook(bash('git commit -m x'))
    assert.equal(denied(first), true, `${name}: a markdown-only diff is refused as it always was`)
    assert.match(said(first), /"prose"/, `${name}: and the refusal names the setting`)
    const second = s.hook(bash('git commit -m x'))
    assert.equal(denied(second), true, `${name}: refused again`)
    assert.doesNotMatch(said(second), /"prose"/, `${name}: and the setting is named once for this tree`)
    // Not prose-only: a code edit is refused without the suggestion.
    const code = begin(t, implementation, { prose: null, commitCode: true })
    code.put('src/a.mjs', 'export const a = 5\n')
    const run = code.hook(bash('git commit -m x'))
    assert.equal(denied(run), true)
    assert.doesNotMatch(said(run), /"prose"/, `${name}: a diff with code in it does not suggest it`)
  }
})

// Added beside the three above once the readers were in (the task's Tests table names those three): the pieces they reach a
// reader through that no row of theirs could tell apart from a lucky pass.
test('a check event names its code tree and list only as the ledger record holds them', { skip: posixOnly }, t => {
  const s = begin(t, { impl: 'node' })
  s.put('docs/a.md', 'two\n')
  s.hook(stop)
  const pass = readEvents(s.repo, s.session).find(entry => entry.event === 'check.passed')
  assert.deepEqual(pass.prose, PROSE, 'the import copies the list the pass was taken under')
  assert.equal(typeof pass.after.codeTree, 'string')
  const bind = entries => ledgerBoundLog(s.repo, Object.assign(entries, { complete: true }))
  assert.equal(bind([pass]).dropped, 0, 'the control: the event as the record holds it')
  assert.equal(bind([{ ...pass, prose: ['docs/**'] }]).dropped, 1, 'a list the record does not hold')
  assert.equal(bind([{ ...pass, after: { ...pass.after, codeTree: 'forged' } }]).dropped, 1, 'a code tree the record does not hold')
})

test('the status line reads a pass carried to a prose-only tree, and not to one with other code', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-prose-pass-line-'))
  spawnSync('git', ['init', '-q'], { cwd: dir, timeout: 30_000, windowsHide: true })
  try {
    const stamp = '2026-09-17T12:00:00.000Z'
    const now = Date.parse(stamp) + 10_000
    const observation = (tree, codeTree) => ({ ok: true, tree, index: `index-${tree}`, head: 'HEAD0', codeTree, indexCodeTree: codeTree, prose: ['docs/'] })
    const started = { at: '2026-09-17T11:59:00.000Z', event: 'session.started', observation: observation('T0', 'C0') }
    const passed = { at: '2026-09-17T11:59:50.000Z', event: 'check.passed', startedAt: '2026-09-17T11:59:45.000Z', before: observation('T1', 'C1'), after: observation('T1', 'C1'), exit: 0, prose: ['docs/'] }
    const logFor = (session, tree, codeTree) => {
      const file = sessionLogFile(dir, session, { spawn: false })
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, `${[started, passed, { at: stamp, event: 'turn.ended', observation: observation(tree, codeTree) }].map(entry => JSON.stringify(entry)).join('\n')}\n`)
    }
    const at = session => ({ session_id: session, workspace: { current_dir: dir } })
    logFor('line-prose', 'T2', 'C1')
    assert.equal(render(reading(at('line-prose'), { now })), 'QH ✓ checked · last observed 10s ago', 'only the prose differs')
    logFor('line-code', 'T2', 'C2')
    assert.doesNotMatch(render(reading(at('line-code'), { now })), /✓/, 'other code does not stand on the pass')
  } finally { remove(dir) }
})

test("the previous session's notice is silent on a tree a pass stands for, and speaks on one it does not", { skip: posixOnly }, t => {
  for (const implementation of implementations()) {
    const name = implementation.impl
    const notice = (edit) => {
      const s = begin(t, implementation)
      edit(s)
      writeFileSync(path.join(s.box.data, 'sessions.jsonl'), `${JSON.stringify({ at: '2026-10-01T00:00:00.000Z', reason: 'other', cwd: s.repo, status: 'unverified', files: [], other: 0 })}\n`)
      return said(runHook(s.box, s.repo, `next-${name}`, { hook_event_name: 'SessionStart', source: 'startup' }, {}, implementation))
    }
    assert.doesNotMatch(notice(s => s.put('docs/a.md', 'two\n')), /previous session in this directory ended/, `${name}: a prose-only change after the pass`)
    assert.match(notice(s => s.put('src/a.mjs', 'export const a = 3\n')), /previous session in this directory ended/, `${name}: a code change after it`)
  }
})

test('the compaction note says a pass that stands for the tree passed on the changed paths, in Node and Go', { skip: posixOnly }, t => {
  for (const implementation of implementations()) {
    const name = implementation.impl
    const note = edit => {
      const s = begin(t, implementation)
      edit(s)
      s.hook({ hook_event_name: 'PreCompact', trigger: 'manual' })
      return said(s.hook({ hook_event_name: 'SessionStart', source: 'compact' }))
    }
    assert.match(note(s => s.put('docs/a.md', 'two\n')), /a `qh-check` passed on them/, `${name}: a prose-only change after the pass`)
    assert.match(note(s => s.put('src/a.mjs', 'export const a = 3\n')), /no `qh-check` has passed on them/, `${name}: a code change after it`)
  }
})

test("the Go core's carry rules hold for a list, a code tree, a newer failure, a write and the grammar", { skip: noGo || posixOnly }, () => {
  const run = spawnSync('go', ['test', '-count=1', '-run', '^(?:TestCarriedPassStands|TestCarryForRefusesWhatCannotSpeak|TestCarriedAsRecorded|TestProseSpecRefused|TestLedgerBindsCarryAsRecorded)$', './hooks/'], {
    cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true,
  })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
})
