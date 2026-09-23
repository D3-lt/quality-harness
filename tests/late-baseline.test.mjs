// A session the plugin began watching late is not a session that did unchecked work.
//
// Every "is this tree unchecked" test compares it with the `session.started`
// observation — and with NO such event, `baseline?.ok !== true` made every tree
// unchecked. So a Stop on a PRISTINE tree, in a session that had edited nothing,
// said:
//
//   this turn ends with work no `qh-check` has passed on. Git reports no changed
//   path in the working tree. Run `qh-check` — it runs `docker compose run …`
//
// — a sentence that contradicts itself, and a container boot asked of a session
// that read two files and answered a question. A peer reproduced it on 2026-09-19
// with six bounded Stops in a throwaway clone.
//
// A session lacks that event whenever the plugin is installed, enabled or UPGRADED
// mid-session, which is every adopter's first contact with a release. The first
// observation becomes a LATE baseline, and the one thing that really is unknown —
// what happened before anyone was looking — is said once, as a limit on what could
// be seen (ADR-005), instead of as an accusation.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { hookSaid } from './hook-env.mjs'
import { fileURLToPath } from 'node:url'

const lifecycleScript = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'scripts', 'lifecycle.mjs')
const IDENTITY = { GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid' }

function fixture(top, label) {
  const repo = join(top, label)
  const env = { ...process.env, ...IDENTITY, CLAUDE_PLUGIN_DATA: join(top, `${label}-data`), TMPDIR: top, TMP: top, TEMP: top }
  const run = (command, args, options = {}) => {
    const out = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, env, ...options })
    assert.equal(out.status, 0, `${command} ${args.join(' ')}: ${out.stderr}`)
    return out
  }
  const git = (...args) => run('git', ['-C', repo, ...args])
  const session = `late-${label}-${process.pid}`
  const hook = payload => {
    const out = run(process.execPath, [lifecycleScript], { cwd: top, input: JSON.stringify({ ...payload, session_id: session, cwd: repo }) })
    return hookSaid(out.stdout, out.stderr).text
  }
  run('mkdir', ['-p', repo])
  git('init', '-q')
  writeFileSync(join(repo, 'a.md'), 'a\n')
  writeFileSync(join(repo, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  writeFileSync(join(repo, 'check.sh'), 'exit 0\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  const log = () => readFileSync(join(repo, '.git', 'quality-harness', 'sessions', `${session}.jsonl`), 'utf8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line))
  return { repo, hook, log, run }
}

test('a first Stop with no SessionStart does not accuse a tree nothing changed', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-late-')))
  try {
    const { repo, hook, log } = fixture(top, 'clean')
    const first = hook({ hook_event_name: 'Stop' })
    assert.doesNotMatch(first, /no `qh-check` has passed on/, `a pristine tree is not unchecked work: ${first.slice(0, 300)}`)
    assert.match(first, /began watching|before it was watching|was not observed/i,
      `what IS unknown — the session before this turn — is said, once: ${first.slice(0, 300)}`)
    const started = log().filter(entry => entry.event === 'session.started')
    assert.equal(started.length, 1, 'the first observation becomes the baseline')
    assert.equal(started[0].late, true, 'and is marked as one taken late')
    assert.equal(hook({ hook_event_name: 'Stop' }), '', 'said once, not at every turn')

    // The control: the late baseline is a real one. Work done AFTER it is unchecked
    // work, named by path, exactly as in a session that started normally.
    writeFileSync(join(repo, 'a.md'), 'changed\n')
    const after = hook({ hook_event_name: 'Stop' })
    assert.match(after, /no `qh-check` has passed on/)
    assert.match(after, /a\.md/)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a DIRTY tree with no SessionStart is still unchecked work, and gets no late baseline', () => {
  // The narrowing that keeps the fix honest. The accusation was false only over a
  // clean tree; adopting a dirty one as the baseline would forgive real, unchecked
  // edits — and the first version of the fix did, silencing a publish warning.
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-late-dirty-')))
  try {
    const { repo, hook, log } = fixture(top, 'dirty')
    writeFileSync(join(repo, 'a.md'), 'edited before anyone was watching\n')
    const said = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } })
    assert.match(said, /names commit or push/, `the publish warning survives: ${said.slice(0, 240)}`)
    assert.equal(log().filter(entry => entry.event === 'session.started').length, 0, 'a dirty tree is never adopted as a baseline')
    // A SEPARATE session for the completion rule: once P has named a tree, R1 does
    // not repeat it for that tree — a designed dedupe, which the first draft of this
    // test read as a regression.
    const other = fixture(top, 'dirty-stop')
    writeFileSync(join(other.repo, 'a.md'), 'edited before anyone was watching\n')
    assert.match(other.hook({ hook_event_name: 'Stop' }), /a\.md/, 'the completion rule still names the real changed path')
    assert.equal(other.log().filter(entry => entry.event === 'session.started').length, 0)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a session that did start normally gets no late baseline and no note about one', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-late-ctl-')))
  try {
    const { hook, log } = fixture(top, 'normal')
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    assert.equal(hook({ hook_event_name: 'Stop' }), '')
    const started = log().filter(entry => entry.event === 'session.started')
    assert.equal(started.length, 1)
    assert.notEqual(started[0].late, true)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// ADR-061's warning arm: a Bash command that MENTIONS commit or push without
// invoking it (a grep) is prepared exactly as a publish request — the late baseline
// and the check-source import — and appended as nothing. Codex review of f67cede:
// the first shape observed a fresh tree against a stale ledger and accused a
// tree whose check had passed.
const MENTION = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'grep -rn "git push" docs/' } }
const qhCheck = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'plugin', 'bin', 'qh-check')

test('a first mention with no SessionStart adopts the late baseline instead of accusing a pristine tree', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-mention-late-')))
  try {
    const { hook, log } = fixture(top, 'mention-late')
    const first = hook(MENTION)
    assert.doesNotMatch(first, /no `qh-check` has passed on/, `a pristine tree is not unchecked work: ${first.slice(0, 300)}`)
    const started = log().filter(entry => entry.event === 'session.started')
    assert.equal(started.length, 1, 'the mention took the late baseline a publish request would')
    assert.equal(started[0].late, true)
    assert.equal(log().filter(entry => entry.event === 'publish.requested').length, 0, 'a mention is not a publish request')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a mention reads the check that ran before it, and is logged as no publish', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-mention-check-')))
  try {
    const { repo, hook, log, run } = fixture(top, 'mention-check')
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    writeFileSync(join(repo, 'a.md'), 'changed\n')
    // Dirty side: unchecked work, so the mention is warned about — and refused nothing.
    const before = hook(MENTION)
    assert.match(before, /no `qh-check` has passed on/, before.slice(0, 300))
    assert.match(before, /only mentions commit or push/, before.slice(0, 300))
    // The pass lands in the check source, which only a hook boundary imports.
    run('python3', [qhCheck], { cwd: repo })
    const after = hook(MENTION)
    assert.doesNotMatch(after, /no `qh-check` has passed on/, `the pass was there to read: ${after.slice(0, 300)}`)
    assert.ok(log().some(entry => typeof entry.event === 'string' && entry.event.startsWith('check.')), 'the mention imported the check source')
    assert.equal(log().filter(entry => entry.event === 'publish.requested').length, 0, 'a mention is not a publish request')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

test('a mention runs no artifact gate; a publish request does', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-mention-artifact-')))
  try {
    const { repo, hook, log } = fixture(top, 'mention-artifact')
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    // A record adr-lint cannot pass, so the gate has something to say if it runs.
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true })
    writeFileSync(join(repo, 'docs', 'adr', 'ADR-001-broken.md'), '# ADR-001: broken\n\nStatus: Accepted\n')
    const mention = hook(MENTION)
    assert.doesNotMatch(mention, /Artifact validation/, `a grep gets no publish-time artifact findings: ${mention.slice(0, 300)}`)
    assert.equal(log().filter(entry => entry.event === 'artifact.gated').length, 0, 'a mention dispatched no artifact gate')
    // Control: the same tree, a publish request — the gate runs and records.
    hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' } })
    assert.ok(log().some(entry => entry.event === 'artifact.gated'), 'a publish request is gated')
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// ADR-060's reviewer guard decides a read-only role's PreToolUse ALONE. A form it
// cannot prove (`$GIT push`) is refused nothing, warned about nothing, and leaves the
// parent session's log byte-for-byte as it was: three review rounds each found a
// way a reviewer's warning wrote to or misread the parent's ledger (Codex, f14e4cd
// and b149b50), and the honest enforcement for that form is the git hook.
test('a read-only reviewer is decided by the guard alone: no warning, no log write', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-reviewer-mention-')))
  try {
    const { repo, hook, log } = fixture(top, 'reviewer-mention')
    hook({ hook_event_name: 'SessionStart', source: 'startup' })
    writeFileSync(join(repo, 'a.md'), 'changed\n')
    const before = JSON.stringify(log())
    const text = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_type: 'qh-scope-reviewer', tool_input: { command: 'GIT=git; $GIT push' } })
    assert.equal(text, '', `a reviewer's unprovable form gets no P warning: ${text.slice(0, 300)}`)
    assert.equal(JSON.stringify(log()), before, 'the parent session\'s log is untouched through delivery')
    // The control: the same command from the session itself is prepared and warned about.
    const own = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'GIT=git; $GIT push' } })
    assert.match(own, /only mentions commit or push/, own.slice(0, 300))
  } finally { rmSync(top, { recursive: true, force: true }) }
})
