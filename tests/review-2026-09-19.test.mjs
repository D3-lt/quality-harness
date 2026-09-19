// Regressions for the different-lineage review of 66030ad...52ee1db (2026-09-19).
//
// Twelve findings, every one of them executed by the reviewer before it was
// reported, and every one the same shape from a different side: a surface that
// said something it had not observed. Each is driven here through the boundary
// the reviewer used — an exported reader, or the real hooks over a scratch
// repository — and each control is the positive answer the fix must not take away.
//
// Four of the findings live beside the code they are about instead of here:
// a copied log (tests/evidence-flip.test.mjs), a failed history base
// (tests/archive-history-parity.test.mjs), the archive catalog
// (tests/archive-not-in-flight.test.mjs) and the verdict words
// (tests/validation-verdict.test.mjs).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { observedFacts, readSessionNote, replaceSessionNote, sessionStateNote } from '../plugin/scripts/lifecycle.mjs'
import { reading, render } from '../plugin/scripts/statusline.mjs'

const lifecycleScript = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'scripts', 'lifecycle.mjs')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }
const REVIEWER = 'quality-harness:qh-correctness-reviewer'

const observation = tree => ({ ok: true, tree, index: `index-${tree}`, head: 'HEAD0' })
const whole = entries => Object.assign([...entries], { complete: true })
const started = { at: '2026-09-19T11:59:00.000Z', event: 'session.started', observation: observation('T0') }
const ended = (tree, at = '2026-09-19T12:00:00.000Z') => ({ at, event: 'turn.ended', observation: observation(tree) })
const pass = { at: '2026-09-19T11:59:50.000Z', event: 'check.passed', record: 'r1', seq: 1, origin: 'declared',
  startedAt: '2026-09-19T11:59:45.000Z', before: observation('T1'), after: observation('T1'), exit: 0, command: 'sh check.sh' }
const NOW = Date.parse('2026-09-19T12:00:10.000Z')

let sessions = 0
function shown(dir, entries) {
  sessions += 1
  const value = reading({ session_id: `review-${process.pid}-${Date.now()}-${sessions}`, workspace: { current_dir: dir } },
    { read: () => whole(entries), now: NOW })
  return { value, line: render(value) }
}

test('the status line: a write the last observation does not cover outranks a pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-review-sl-'))
  try {
    writeFileSync(join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
    // The control: the same log without the later write IS checked.
    assert.match(shown(dir, [started, pass, ended('T1')]).line, /^QH ✓ checked/)
    // A write git cannot see, after the pass: the tree is the same and the work is not.
    const unseen = { at: '2026-09-19T11:59:55.000Z', event: 'file.written', path: '/elsewhere/x', observable: false }
    assert.equal(shown(dir, [started, pass, unseen, ended('T1')]).value.kind, 'unverified')
    // A write AFTER the observation that named the checked tree: nothing has looked since.
    const later = { at: '2026-09-19T12:00:05.000Z', event: 'file.written', path: join(dir, 'a.py'), observable: true }
    const after = shown(dir, [started, pass, ended('T1'), later])
    assert.equal(after.value.kind, 'unverified', after.line)
    assert.doesNotMatch(after.line, /✓/)
    // ...and one the observation DID cover changes nothing: the pass is about that tree.
    const covered = { ...later, at: '2026-09-19T11:59:58.000Z' }
    assert.match(shown(dir, [started, pass, covered, ended('T1')]).line, /^QH ✓ checked/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a baseline adopted partway through a session does not speak for the whole of it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qh-review-late-'))
  try {
    writeFileSync(join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
    const note = begin => sessionStateNote(observedFacts(whole([begin, ended('T0')]), null, observation('T0')),
      dir, dir, false, new Date(NOW), { tasks: false })
    // The control: a session watched from its start, with nothing changed, is neutral.
    assert.equal(note(started).status, 'neutral')
    assert.match(shown(dir, [started, ended('T0')]).line, /^QH · nothing edited ·/)
    const late = { ...started, late: true }
    const said = note(late)
    assert.notEqual(said.status, 'neutral', 'neutral claims nothing is outstanding, and a commit made before watching began is unknown')
    assert.match(said.text, /began watching/)
    assert.match(shown(dir, [late, ended('T0')]).line, /nothing edited since watching began/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('"Last check" is the check that RAN last, not the one appended last', () => {
  const tree = 'T1'
  const at = n => `2026-09-19T11:5${n}:00.000Z`
  const first = { event: 'check.passed', record: 'r1', seq: 1, startedAt: at(1), after: { tree }, command: 'sh check.sh' }
  const second = { event: 'check.failed', record: 'r2', seq: 2, startedAt: at(2), after: { tree }, command: 'sh check.sh' }
  const last = log => observedFacts(whole(log), null, observation(tree)).lastCheck?.verdict
  // The control: a pass that really is newest is reported as one.
  assert.equal(last([started, second, { ...first, record: 'r3', seq: 3, startedAt: at(3) }]), 'passed')
  // The racing re-import: the older pass lands a second time, after the failure.
  assert.equal(last([started, first, second, { ...first }]), 'failed')
})

function notePath(sessionId) {
  return join(tmpdir(), `quality-harness-note-${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}`)
}

test('a state note that could not be removed is not reported as removed', () => {
  const session = `review-note-${process.pid}-${Date.now()}`
  const file = notePath(session)
  try {
    // The control, and the proof this test knows where the note lives.
    assert.equal(replaceSessionNote(session, { status: 'verified', text: 'OLD NOTE' }), true)
    assert.ok(existsSync(file), 'the note is where this test expects it')
    assert.equal(replaceSessionNote(session, null), true)
    assert.equal(readSessionNote(session), null)
    // Something an unlink cannot remove: a directory holding a file.
    mkdirSync(file)
    writeFileSync(join(file, 'child'), 'x')
    assert.equal(replaceSessionNote(session, null), false, 'an unlink that failed for any reason but ENOENT left something behind')
    assert.equal(replaceSessionNote(session, { status: 'unverified', text: 'NEW' }, () => { throw Object.assign(new Error('full'), { code: 'ENOSPC' }) }), false)
  } finally { rmSync(file, { recursive: true, force: true }) }
})

function fixture(top, label) {
  const repo = join(top, label)
  const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(top, `${label}-data`), TMPDIR: top, TMP: top, TEMP: top }
  const run = (command, args, options = {}) => {
    const out = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, env, ...options })
    assert.equal(out.status, 0, `${command} ${args.join(' ')}: ${out.stderr}`)
    return out
  }
  const git = (...args) => run('git', ['-C', repo, ...args])
  const session = `review-${label}-${process.pid}`
  const hook = payload => {
    const out = run(process.execPath, [lifecycleScript], { cwd: top, input: JSON.stringify({ ...payload, session_id: session, cwd: repo }) })
    return `${out.stdout}${out.stderr}`.trim()
  }
  mkdirSync(repo, { recursive: true })
  git('init', '-q')
  writeFileSync(join(repo, 'a.md'), 'a\n')
  writeFileSync(join(repo, '.quality-harness.json'), JSON.stringify({ check: 'true' }))
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  const logFile = join(repo, '.git', 'quality-harness', 'sessions', `${session}.jsonl`)
  const log = () => readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
  return { repo, git, hook, log, logFile, session, top }
}

test('a write already on record is not forgiven by a baseline adopted after it was committed', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-review-written-')))
  try {
    const { repo, git, hook, log } = fixture(top, 'written')
    // PostToolUse records the write before any observing hook has run...
    writeFileSync(join(repo, 'a.md'), 'edited\n')
    hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo, 'a.md') } })
    assert.equal(log().filter(entry => entry.event === 'file.written').length, 1, 'the control: the write is on record')
    // ...it is committed, so the first Stop finds a clean tree.
    git('commit', '-q', '-am', 'unchecked work')
    const said = hook({ hook_event_name: 'Stop' })
    assert.equal(log().filter(entry => entry.event === 'session.started').length, 0,
      'a clean tree after a KNOWN write is not a session that changed nothing')
    assert.match(said, /qh-check/, `and the turn is still told the work is unchecked: ${said.slice(0, 300)}`)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a review whose start or end could not be observed says so, instead of saying nothing', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-review-r3-')))
  try {
    const { hook, logFile } = fixture(top, 'r3')
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    // The control: a bracket observed at both ends, with nothing changed, is silent.
    hook({ hook_event_name: 'SubagentStart', agent_type: REVIEWER, agent_id: 'seen' })
    assert.equal(hook({ hook_event_name: 'SubagentStop', agent_type: REVIEWER, agent_id: 'seen' }), '')
    // A start that could not be observed — written as the hook writes it when git fails.
    appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), event: 'subagent.started', agentId: 'blind',
      observation: { ok: false, reason: 'git rev-parse exited 128' } })}\n`)
    const blind = hook({ hook_event_name: 'SubagentStop', agent_type: REVIEWER, agent_id: 'blind' })
    assert.match(blind, /is unknown/, blind.slice(0, 300))
    assert.match(blind, /git rev-parse exited 128/, 'and it names what could not be looked at')
    // A run whose start was never recorded at all, in a log that is whole.
    assert.match(hook({ hook_event_name: 'SubagentStop', agent_type: REVIEWER, agent_id: 'never-began' }), /never recorded/)
    // Once per agent, not at every boundary.
    assert.equal(hook({ hook_event_name: 'SubagentStop', agent_type: REVIEWER, agent_id: 'blind' }), '')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('over a torn log a newly reachable commit is "not known to be checked", never "unchecked"', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-review-r2-')))
  try {
    const said = torn => {
      const { repo, git, hook, logFile } = fixture(top, torn ? 'r2-torn' : 'r2-whole')
      hook({ hook_event_name: 'SessionStart', source: 'startup' })
      writeFileSync(join(repo, 'a.md'), 'one\n')
      git('commit', '-q', '-am', 'first unchecked commit')
      writeFileSync(join(repo, 'a.md'), 'two\n')
      git('commit', '-q', '-am', 'second unchecked commit')
      if (torn) appendFileSync(logFile, '{"event":"check.passed","record":"r9","se')
      return hook({ hook_event_name: 'Stop' })
    }
    // The control: with the log whole, R2 does accuse — that sentence exists.
    assert.match(said(false), /newly reachable commit is unchecked — no `qh-check` has passed on its tree/)
    const torn = said(true)
    assert.match(torn, /newly reachable commit/, `R2 still speaks: ${torn.slice(0, 400)}`)
    assert.doesNotMatch(torn, /no `qh-check` has passed on (?:its|their) tree/, 'the lost line may BE the pass')
    assert.match(torn, /UNKNOWN/)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a state note older than the compaction it follows is not served as that compaction\'s', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-review-stale-')))
  try {
    const { hook, session } = fixture(top, 'stale')
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    hook({ hook_event_name: 'PreCompact' })
    // The control: the note PreCompact just kept is handed back.
    assert.match(hook({ hook_event_name: 'SessionStart', source: 'compact' }), /What this session was doing before compaction/)
    // The note a failed replace would leave behind: an earlier compaction's.
    const file = join(top, `quality-harness-note-${createHash('sha256').update(session).digest('hex').slice(0, 32)}`)
    assert.ok(existsSync(file), 'the note is where this test expects it')
    writeFileSync(file, JSON.stringify({ at: '2020-01-01T00:00:00.000Z', status: 'verified', text: 'OLD NOTE' }))
    const after = hook({ hook_event_name: 'SessionStart', source: 'compact' })
    assert.doesNotMatch(after, /OLD NOTE/)
    assert.match(after, /older than this compaction/)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// Found while checking a peer's report, not by the review: an `unverified` row with
// no files was read back to the NEXT session as "ended with edits after which no
// recognised check passed" — about a session that may have edited nothing.
test('the next session is not told of edits nobody observed', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-review-row-')))
  try {
    const next = (label, during) => {
      const { repo, hook, top: home } = fixture(top, label)
      during(repo, hook)
      hook({ hook_event_name: 'SessionEnd', reason: 'other' })
      const out = spawnSync(process.execPath, [lifecycleScript], { cwd: top, encoding: 'utf8', timeout: 120_000,
        env: { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(home, `${label}-data`), TMPDIR: top, TMP: top, TEMP: top },
        input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', session_id: `next-${label}-${process.pid}`, cwd: repo }) })
      assert.equal(out.status, 0, out.stderr)
      return `${out.stdout}${out.stderr}`
    }
    // The control: real unchecked edits ARE reported as edits, by path.
    const edited = next('row-edited', (repo, hook) => {
      hook({ hook_event_name: 'SessionStart', source: 'startup' })
      writeFileSync(join(repo, 'a.md'), 'edited\n')
      hook({ hook_event_name: 'Stop' })
    })
    assert.match(edited, /1 edit\(s\) after which no recognised check passed/, edited.slice(0, 500))
    // A session watched only from partway through, in which nothing then changed.
    const late = next('row-late', (repo, hook) => { hook({ hook_event_name: 'Stop' }) })
    assert.doesNotMatch(late, /edits? after which no recognised check passed/, late.slice(0, 500))
    assert.match(late, /UNKNOWN to this plugin/, late.slice(0, 500))
  } finally { rmSync(top, { recursive: true, force: true }) }
})
