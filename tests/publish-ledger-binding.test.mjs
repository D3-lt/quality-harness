// ADR-088 T2: the publish verdict counts only check events `checks.jsonl` holds. A session log
// every hook appends to stood in for the one file `qh-check` writes, so one appended line cleared
// ADR-061's refusal (BACKLOG §295 item 9). Every case runs the real hook in a repository this file
// made (CLAUDE.md §9); each "must still refuse" row has its "still passes" twin (CLAUDE.md §16).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hookSaid } from './hook-env.mjs'
import * as lifecycle from '../plugin/scripts/lifecycle.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lifecycleScript = path.join(repoRoot, 'plugin', 'scripts', 'lifecycle.mjs')
const hookScript = path.join(repoRoot, 'plugin', 'scripts', 'publish-hook.mjs')
const qhCheck = path.join(repoRoot, 'plugin', 'bin', 'qh-check')
const testTmp = realpathSync.native(mkdtempSync(path.join(
  process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-ledger-binding-')))
after(() => { try { rmSync(testTmp, { recursive: true, force: true }) } catch { /* the assertions already ran */ } })

// A suite run from an armed session inherits its hook through GIT_CONFIG_*; every git here starts
// from none, as tests/publish-hook.test.mjs does.
for (const key of Object.keys(process.env)) {
  if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key)) delete process.env[key]
}
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'qh', GIT_AUTHOR_EMAIL: 'qh@example.invalid',
  GIT_COMMITTER_NAME: 'qh', GIT_COMMITTER_EMAIL: 'qh@example.invalid',
}
const quoted = file => `"${file.replace(/\\/g, '/')}"`
const OFFERED = {
  GIT_CONFIG_COUNT: '4',
  GIT_CONFIG_KEY_0: 'hook.qh-publish-commit.command',
  GIT_CONFIG_VALUE_0: `${quoted(process.execPath)} ${quoted(hookScript)} prepare-commit-msg`,
  GIT_CONFIG_KEY_1: 'hook.qh-publish-commit.event',
  GIT_CONFIG_VALUE_1: 'prepare-commit-msg',
  GIT_CONFIG_KEY_2: 'hook.qh-publish-push.command',
  GIT_CONFIG_VALUE_2: `${quoted(process.execPath)} ${quoted(hookScript)} pre-push`,
  GIT_CONFIG_KEY_3: 'hook.qh-publish-push.event',
  GIT_CONFIG_VALUE_3: 'pre-push',
}
const probe = mkdtempSync(path.join(testTmp, 'probe-'))
spawnSync('git', ['init', '-q', probe], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
const listed = spawnSync('git', ['-c', 'hook.qhprobe.command=true', '-c', 'hook.qhprobe.event=pre-commit',
  'hook', 'list', 'pre-commit'], { cwd: probe, encoding: 'utf8', timeout: 10_000, windowsHide: true })
const needsConfigHooks = /\bqhprobe\b/.test(listed.stdout ?? '')
  ? false : 'this git does not run config-based hooks (git 2.54 or later does), so the hook cannot run here'

function git(dir, ...args) {
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...process.env, ...GIT_IDENTITY } })
  assert.equal(run.status, 0, args.join(' ') + ': ' + run.stderr)
  return run.stdout.trim()
}

// A repository whose declared check passes only when `a.md` says `ok`. Its committed content does
// not, so a session that changes nothing else starts on a tree no check has passed on.
function repository(prefix) {
  const dir = mkdtempSync(path.join(testTmp, prefix))
  git(dir, 'init', '-q')
  writeFileSync(path.join(dir, 'a.md'), 'base\n')
  writeFileSync(path.join(dir, 'check.sh'), 'grep -q ok a.md\n')
  writeFileSync(path.join(dir, '.quality-harness.json'), JSON.stringify({ check: 'sh check.sh' }))
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'base')
  return dir
}

function hook(dir, payload) {
  const run = spawnSync(process.execPath, [lifecycleScript], {
    cwd: testTmp, input: JSON.stringify({ ...payload, cwd: dir }), encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: { ...process.env, ...GIT_IDENTITY, CLAUDE_PLUGIN_DATA: path.join(testTmp, 'data'), CLAUDE_ENV_FILE: '', TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp },
  })
  assert.equal(run.status, 0, run.stderr)
  return run
}

function start(dir, session) {
  hook(dir, { hook_event_name: 'SessionStart', source: 'startup', session_id: session })
}

// What PreToolUse decides about `git commit`, and what it said.
function publish(dir, session) {
  const run = hook(dir, { hook_event_name: 'PreToolUse', tool_name: 'Bash', session_id: session, tool_input: { command: 'git commit -am changed' } })
  const said = hookSaid(run.stdout, run.stderr)
  const decision = said.stdout.startsWith('{') ? JSON.parse(said.stdout).hookSpecificOutput?.permissionDecision ?? null : null
  return { decision, text: said.text }
}

function forge(dir, session, event) {
  appendFileSync(lifecycle.sessionLogFile(dir, session), JSON.stringify(event) + '\n')
}

function check(dir) {
  return spawnSync('python3', [qhCheck], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true })
}

const ledger = dir => path.join(lifecycle.stateDir(dir), 'checks.jsonl')
const lastRecord = dir => JSON.parse(readFileSync(ledger(dir), 'utf8').trim().split('\n').at(-1))
const DROPPED = /check event\(s\) in this session's log name no `qh-check` record and were not counted/

test('a check event the ledger does not hold does not clear the refusal', () => {
  const dir = repository('refuse-')
  const session = `ledger-refuse-${process.pid}`
  start(dir, session)
  writeFileSync(path.join(dir, 'a.md'), 'bad\n')
  const tree = lifecycle.observe(dir).tree
  assert.equal(publish(dir, session).decision, 'deny', 'the control: an unchecked tree is refused')

  forge(dir, session, { event: 'check.passed', after: { tree } })
  let verdict = publish(dir, session)
  assert.equal(verdict.decision, 'deny', `a pass naming no record: ${verdict.text}`)
  assert.match(verdict.text, DROPPED)

  forge(dir, session, { event: 'check.passed', record: 'no-such-record', seq: 99, after: { tree } })
  verdict = publish(dir, session)
  assert.equal(verdict.decision, 'deny', `a pass naming a record the ledger lacks: ${verdict.text}`)

  // A real failure on this tree, its id relabelled a pass before any hook imported it.
  assert.equal(check(dir).status, 1, 'the declared check fails on this tree')
  const failed = lastRecord(dir)
  forge(dir, session, { event: 'check.passed', record: failed.id, seq: 50, after: { tree } })
  verdict = publish(dir, session)
  assert.equal(verdict.decision, 'deny', `a failed record relabelled passed: ${verdict.text}`)

  // A real pass on ANOTHER tree, its after.tree edited to this one.
  writeFileSync(path.join(dir, 'a.md'), 'ok\n')
  assert.equal(check(dir).status, 0, 'the declared check passes on the other tree')
  const passed = lastRecord(dir)
  assert.notEqual(passed.after.tree, tree)
  forge(dir, session, { event: 'check.passed', record: passed.id, seq: 60, after: { tree } })
  writeFileSync(path.join(dir, 'a.md'), 'bad\n')
  assert.equal(lifecycle.observe(dir).tree, tree)
  verdict = publish(dir, session)
  assert.equal(verdict.decision, 'deny', `a pass from another tree: ${verdict.text}`)

  forge(dir, session, { event: 'check.timeout', after: { tree } })
  verdict = publish(dir, session)
  assert.equal(verdict.decision, 'deny', `a timeout no record holds: ${verdict.text}`)
  assert.match(verdict.text, DROPPED)

  // CLEAN twin: a real pass on this tree clears it, and so does that pass imported twice.
  writeFileSync(path.join(dir, 'a.md'), 'ok again\n')
  assert.equal(check(dir).status, 0)
  verdict = publish(dir, session)
  assert.notEqual(verdict.decision, 'deny', `a real qh-check pass: ${verdict.text}`)
  const real = readFileSync(lifecycle.sessionLogFile(dir, session), 'utf8').trim().split('\n')
    .map(line => JSON.parse(line)).findLast(entry => entry.event === 'check.passed' && entry.record === lastRecord(dir).id)
  assert.ok(real, 'the hook imported the real pass')
  forge(dir, session, real)
  verdict = publish(dir, session)
  assert.notEqual(verdict.decision, 'deny', `a real pass imported twice: ${verdict.text}`)
})

test('a torn ledger binds nothing and refuses nothing', () => {
  for (const torn of [true, false]) {
    const dir = repository(torn ? 'torn-' : 'whole-')
    const session = `ledger-${torn ? 'torn' : 'whole'}-${process.pid}`
    start(dir, session)
    writeFileSync(path.join(dir, 'a.md'), 'bad\n')
    mkdirSync(path.dirname(ledger(dir)), { recursive: true })
    writeFileSync(ledger(dir), torn ? '{"id":"r1","exit":0,"git":tr' : '')
    forge(dir, session, { event: 'check.passed', after: { tree: lifecycle.observe(dir).tree } })
    const verdict = publish(dir, session)
    if (torn) {
      assert.notEqual(verdict.decision, 'deny', `a torn ledger refused: ${verdict.text}`)
      assert.match(verdict.text, /whether this repository is checked is unknown/)
    } else {
      // DIRTY twin: the same forged pass beside a ledger read whole is refused.
      assert.equal(verdict.decision, 'deny', `a forged pass beside a whole ledger: ${verdict.text}`)
    }
  }
})

test('git refuses a pass the ledger does not hold', { skip: needsConfigHooks }, () => {
  const dir = repository('git-')
  const session = `ledger-git-${process.pid}`
  start(dir, session)
  writeFileSync(path.join(dir, 'a.md'), 'ok\n')
  forge(dir, session, { event: 'check.passed', after: { tree: lifecycle.observe(dir).tree } })
  const commit = () => {
    const file = path.join(testTmp, `commit-${process.hrtime.bigint()}.sh`)
    writeFileSync(file, 'git commit -qam changed\n')
    return spawnSync('sh', [file], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
      env: { ...process.env, ...GIT_IDENTITY, ...OFFERED, CLAUDE_CODE_SESSION_ID: session } })
  }
  const forged = commit()
  assert.notEqual(forged.status, 0, `a forged session-log pass let the commit through\n${forged.stderr}`)
  assert.match(forged.stderr, /unchecked/)
  // CLEAN twin: a real qh-check pass on the same tree lets it through.
  assert.equal(check(dir).status, 0)
  const checked = commit()
  assert.equal(checked.status, 0, checked.stderr)
})

// The torn test above holds through the PreToolUse path, where the importer also records
// `check.source-unreadable`, so the verdict is unknown whatever the binding did. This one reads the
// binding itself: a ledger not read whole drops no event, and the refusal text says none was dropped.
test('a torn ledger drops no check event', () => {
  for (const torn of [true, false]) {
    const dir = repository(torn ? 'torn-drop-' : 'whole-drop-')
    const session = `ledger-drop-${torn ? 'torn' : 'whole'}-${process.pid}`
    start(dir, session)
    writeFileSync(path.join(dir, 'a.md'), 'bad\n')
    mkdirSync(path.dirname(ledger(dir)), { recursive: true })
    writeFileSync(ledger(dir), torn ? '{"id":"r1","exit":0,"git":tr' : '')
    const forged = { event: 'check.passed', after: { tree: lifecycle.observe(dir).tree } }
    const log = Object.assign([{ event: 'session.started' }, forged], { complete: true })
    const bound = lifecycle.ledgerBoundLog(dir, log)
    forge(dir, session, forged)
    const said = publish(dir, session).text
    if (torn) {
      assert.equal(bound.dropped, 0)
      assert.deepEqual([...bound.log], [...log])
      assert.doesNotMatch(said, DROPPED)
    } else {
      // The control: read whole, the same forged pass is dropped and named.
      assert.equal(bound.dropped, 1)
      assert.deepEqual([...bound.log], [{ event: 'session.started' }])
      assert.match(said, DROPPED)
    }
    assert.equal(bound.log.complete, true, 'the log keeps its complete flag')
  }
})

// A Codex review of the ADR-088 diff, two fail-opens on the ledger read. git's own hook imports and
// then asks `publishVerdict`, discarding the importer's answer, so nothing there records
// `check.source-unreadable`: a torn ledger left a pass standing in silence. And a last line with
// no terminating newline (qh-check ends every record with one) was read as a whole record.
function gitHookVerdict(dir, session) {
  lifecycle.importCheckRecords(dir, session)
  return lifecycle.publishVerdict({ cwd: dir, session, observation: lifecycle.observe(dir), invoked: 'git commit', commitOnly: true })
}

test("a torn ledger is could-not-look to git's hook as well", () => {
  // Unterminated, terminated but unparseable, and (the twin) empty.
  for (const content of ['{"id":', '{"id":\n', '']) {
    const torn = content !== ''
    const dir = repository(torn ? 'git-torn-' : 'git-whole-')
    const session = `ledger-git-${torn ? 'torn' : 'whole'}-${process.pid}-${content.length}`
    start(dir, session)
    writeFileSync(path.join(dir, 'a.md'), 'bad\n')
    mkdirSync(path.dirname(ledger(dir)), { recursive: true })
    writeFileSync(ledger(dir), content)
    forge(dir, session, { event: 'check.passed', record: 'r1', seq: 1, after: { tree: lifecycle.observe(dir).tree } })
    const verdict = gitHookVerdict(dir, session)
    assert.ok(verdict, `${torn ? 'torn' : 'whole'}: the pass stood and nothing was said`)
    if (torn) {
      assert.equal(verdict.deny, false, verdict.text)
      assert.match(verdict.text, /whether this repository is checked is unknown — `checks\.jsonl`/)
    } else {
      // DIRTY twin: read whole, the pass no record holds is dropped and the commit refused.
      assert.equal(verdict.deny, true, verdict.text)
    }
  }
})

test('an unterminated last ledger line is torn', () => {
  for (const cut of [true, false]) {
    const dir = repository(cut ? 'cut-' : 'kept-')
    const session = `ledger-cut-${cut ? 'cut' : 'kept'}-${process.pid}`
    start(dir, session)
    writeFileSync(path.join(dir, 'a.md'), 'ok\n')
    assert.equal(check(dir).status, 0)
    const text = readFileSync(ledger(dir), 'utf8')
    assert.ok(text.endsWith('}\n'))
    // A passing record cut right after its closing brace: it parses, and it was not written whole.
    if (cut) writeFileSync(ledger(dir), text.slice(0, -1))
    const verdict = publish(dir, session)
    const bound = lifecycle.ledgerBoundLog(dir, lifecycle.readEvents(dir, session))
    // The importer reads it the same way, for a session that has imported nothing yet.
    assert.equal(lifecycle.importCheckRecords(dir, `${session}-import`).complete, !cut)
    if (cut) {
      assert.notEqual(verdict.decision, 'deny', verdict.text)
      assert.match(verdict.text, /whether this repository is checked is unknown/)
      assert.equal(bound.torn, true)
    } else {
      // The twin: the same record, terminated, is a pass that says nothing.
      assert.equal(verdict.decision, null, verdict.text)
      assert.equal(verdict.text, '')
      assert.notEqual(bound.torn, true)
    }
  }
})

// A second Codex review of the ADR-088 diff: git's hook said nothing for a could-not-look verdict.
// It prints only an unobserved tree and a fast pass, so a torn ledger beside a session pass
// went through a commit and a push in silence. Driven through real git and the hook entry.
test("git's own hook says a torn ledger is unknown, at commit and at push", { skip: needsConfigHooks }, () => {
  for (const torn of [true, false]) {
    const dir = repository(torn ? 'hook-torn-' : 'hook-whole-')
    const remote = mkdtempSync(path.join(testTmp, 'remote-'))
    git(remote, 'init', '-q', '--bare')
    git(dir, 'remote', 'add', 'origin', remote)
    const session = `ledger-hook-${torn ? 'torn' : 'whole'}-${process.pid}`
    start(dir, session)
    writeFileSync(path.join(dir, 'a.md'), 'bad\n')
    mkdirSync(path.dirname(ledger(dir)), { recursive: true })
    writeFileSync(ledger(dir), torn ? '{"id":\n' : '')
    forge(dir, session, { event: 'check.passed', record: 'r1', seq: 1, after: { tree: lifecycle.observe(dir).tree } })
    const run = script => {
      const file = path.join(testTmp, `hook-${process.hrtime.bigint()}.sh`)
      writeFileSync(file, script)
      return spawnSync('sh', [file], { cwd: dir, encoding: 'utf8', timeout: 120_000, windowsHide: true,
        env: { ...process.env, ...GIT_IDENTITY, ...OFFERED, CLAUDE_CODE_SESSION_ID: session } })
    }
    const commit = run('git commit -qam changed\n')
    if (torn) {
      assert.equal(commit.status, 0, `advice is never a refusal\n${commit.stderr}`)
      assert.match(commit.stderr, /whether this repository is checked is unknown — `checks\.jsonl`/, 'the commit hook said nothing')
      const push = run('git push -q origin HEAD:refs/heads/main\n')
      assert.equal(push.status, 0, push.stderr)
      assert.match(push.stderr, /whether this repository is checked is unknown — `checks\.jsonl`/, 'the push hook said nothing')
    } else {
      // DIRTY twin: read whole, the pass no record holds does not clear git's refusal.
      assert.notEqual(commit.status, 0, commit.stderr)
      assert.match(commit.stderr, /unchecked/)
    }
  }
})
