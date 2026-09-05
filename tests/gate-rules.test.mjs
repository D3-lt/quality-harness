// Wave 3b of docs/TEST-PLAN.md — the gates whose rule sets had never run.
//
// Each of these gates has a conforming fixture somewhere and no case that makes
// a single rule fire. A rule with no failing case is a rule nobody has watched
// work, and several of them turned out to be unreachable in exactly that way.
//
// Shape: one good document per gate, mutated one rule at a time. The good
// document is asserted to pass first, so a mutation that fails for an unrelated
// reason cannot be mistaken for the rule under test.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'

import { parse } from '../plugin/scripts/verify.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const bin = join(root, 'bin')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }
// The gates are the extensionless executables; the .cmd files beside them
// are Windows shims that invoke these.
/** Dotless FILES in bin/. A directory there is not a gate, whatever it is named. */
function gateNamesIn(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.includes('.')).map(entry => entry.name)
}

const GATE_NAMES = new Set(gateNamesIn(bin))

function run(command, args, cwd = root) {
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has(command)
    ? ['python3', [join(bin, command), ...args]]
    : [command, args]
  return spawnSync(file, argv, { cwd, env, encoding: 'utf8', timeout: 60_000 })
}

const temps = []
function scratch(prefix) {
  const dir = mkdtempSync(join(os.tmpdir(), `quality-harness-${prefix}-`))
  temps.push(dir)
  return dir
}
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

const POSTMORTEM = `---
date: 2026-08-25
category: logic-error
severity: medium
files_changed:
  - bin/adr-lint
tags: [gate, evidence]
---

# The done status was never checked

## Symptom

adr-lint passed a task marked done with failing evidence.

## Context

Found while writing the round-trip test for the evidence chain.

## Root Cause

The status scan read only the first cell of each row.

\`\`\`python
m = re.match(r"^\\[?(T\\d+)\\b", cells[0], re.I)
\`\`\`

## Investigation

Reproduced by hand against the project's own fixture.

## Fix

### Before

\`\`\`python
m = re.match(r"^\\[?(T\\d+)\\b", cells[0], re.I)
\`\`\`

### After

\`\`\`python
found = next(((i, m) for i, c in enumerate(cells) if ...), None)
\`\`\`

## Lesson

A check that iterates an empty list reports success.
`

test('every postmortem-verify rule has a case that makes it fire', () => {
  const dir = scratch('postmortem')
  const write = text => {
    const path = join(dir, 'postmortem.md')
    writeFileSync(path, text)
    return path
  }
  // The positive control. Without it a mutation could fail for its own reason
  // and every row below would be asserting nothing in particular.
  assert.equal(run('postmortem-verify', [write(POSTMORTEM)]).status, 0,
    run('postmortem-verify', [write(POSTMORTEM)]).stdout)

  // Each rule still has a case that makes it fire — that is what this test is
  // for. What changed is the CHANNEL. Form advises: absent frontmatter, a
  // heading that is not there. Content blocks: a section present and empty
  // states nothing, and a Fix with no before/after shows no fix.
  const cases = [
    ['advise', 'date not YYYY-MM-DD', t => t.replace('date: 2026-08-25', 'date: 25 Aug 2026'), /date missing or not YYYY-MM-DD/],
    ['advise', 'category off the enum', t => t.replace('category: logic-error', 'category: vibes'), /category missing or not one of/],
    ['advise', 'severity off the enum', t => t.replace('severity: medium', 'severity: quite bad'), /severity missing or not one of/],
    ['advise', 'files_changed empty', t => t.replace('files_changed:\n  - bin/adr-lint', 'files_changed:'), /files_changed missing or empty/],
    ['advise', 'tags not list form', t => t.replace('tags: [gate, evidence]', 'tags: gate, evidence'), /tags missing or not/],
    ['advise', 'missing section', t => t.replace('## Lesson', '## Takeaway'), /missing section ## Lesson/],
    // Identity, not form: without frontmatter this is not a postmortem at all.
    ['block', 'no frontmatter at all', t => t.replace(/\A?---\ndate[\s\S]*?---\n/, ''), /no YAML frontmatter/],
    ['block', 'empty section', t => t.replace('A check that iterates an empty list reports success.\n', ''), /section ## Lesson is empty/],
    // `### Beforehand` would still satisfy this rule — it is a substring check.
    // Not chased: the fence count is the real guard and no real document is
    // written that way. Removing the heading is the case worth asserting.
    ['block', 'no Before/After fences', t => t.replace('### Before\n', '### Old\n'), /### Before and ### After/],
    ['block', 'Root Cause unfenced', t => t.replace(
      '```python\nm = re.match(r"^\\[?(T\\d+)\\b", cells[0], re.I)\n```\n\n## Investigation',
      'The status scan was wrong.\n\n## Investigation'), /Root Cause must include the offending code/],
  ]

  for (const [severity, label, mutate, expected] of cases) {
    const text = mutate(POSTMORTEM)
    assert.notEqual(text, POSTMORTEM, `${label}: the mutation did not apply`)
    const result = run('postmortem-verify', [write(text)])
    assert.equal(result.status, severity === 'block' ? 1 : 0,
      `${label} must ${severity}\n${result.stdout}`)
    assert.match(result.stdout, expected, label)
    if (severity === 'advise') {
      assert.match(result.stdout, /^\s+advice: /m, `${label} must reach the reader\n${result.stdout}`)
      assert.match(result.stdout, /^\[PASS\]/m, label)
    }
  }
})

// --- Wave 3c: the fail-closed exits, wired but never driven end to end -------

const runnerPath = join(root, 'scripts', 'run-shell-hook.mjs')

function runner(scriptName, payload, extraEnv = {}) {
  return spawnSync(process.execPath, [runnerPath, scriptName], {
    cwd: root,
    env: { ...env, ...extraEnv },
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 60_000,
  })
}

test('the shell-hook runner reports every way a gate can not report, and blocks on none', async () => {
  const payload = { hook_event_name: 'PreToolUse', tool_input: { file_path: join(repoRoot, 'README.md') } }

  // The harness failing to RUN is not a finding about the edit, and it used to
  // exit 2 — which blocks the tool call. A Windows machine without Git Bash had
  // every edit refused by a gate that had never read the file; a slow gate did
  // the same. Reported while auditing what still blocks, 2026-08-26.
  // Driven through "there is no bash here", which needs no race. Both levers
  // are set because each platform ignores the other's: POSIX resolves the bare
  // name off PATH and never reads the variable, while Windows reads the
  // variable first and, failing that, falls back to the well-known Git install
  // roots that windows-latest actually has — so clearing PATH alone left a
  // working bash and the test asserted nothing there (run 32957651615).
  const noShell = runner('facts-gate-dispatch.sh', payload, {
    PATH: join(root, 'no-such-bin'),
    CLAUDE_CODE_GIT_BASH_PATH: join(root, 'no-such-bin', 'bash.exe'),
  })
  assert.equal(noShell.status, 0, `a missing shell must not block the edit: ${noShell.stderr}`)
  // Silence would be the other failure: the reader has to learn the edit went
  // unchecked, or a harness that could not run looks exactly like one that passed.
  assert.match(noShell.stderr, /quality-harness:/)
  assert.match(noShell.stderr, /[Nn]othing is blocked|Your edit is\s+untouched/)

  // NOT re-tested here: a gate exceeding its budget. Driving that end to end
  // needs a record slower to read than the 100ms floor, which is a race on a
  // slow host — a 14MB one took windows-latest past this test's own spawn
  // timeout in 32891897252. The mechanism is asserted directly above, and
  // tests/lifecycle.test.mjs already drives budget exhaustion end to end through
  // runArtifactGates on every platform. One flaky duplicate of a covered path is
  // worse than none.

  // A script outside the allow-list is refused rather than run.
  // A broken INVOCATION is not a finding about a record: the harness advises on
  // what it judges, and still refuses to run something it does not recognise.
  const unsupported = runner('definitely-not-a-hook.sh', payload)
  assert.equal(unsupported.status, 2)
  assert.match(unsupported.stderr, /unsupported shell hook/)

  // No script name at all — the same refusal, with the absence named.
  const missing = spawnSync(process.execPath, [runnerPath], {
    cwd: root, env, input: '{}', encoding: 'utf8', timeout: 60_000,
  })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /<missing>/)
})

test('the timeout mechanism itself kills the child and says it timed out', async () => {
  // The end-to-end row above depends on a gate being slower than its budget,
  // which is a race on a slow host. This asserts the mechanism directly: a
  // command that would outlive its budget is killed and REPORTED as timed out,
  // because a hook that silently returns whatever a half-run gate printed is the
  // fail-open this whole file exists to prevent.
  const { runWithTimeout } = await import('../plugin/scripts/run-shell-hook.mjs')

  const start = Date.now()
  const killed = await runWithTimeout(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'],
    { timeoutMs: 300 })
  assert.equal(killed.timedOut, true)
  assert.ok(Date.now() - start < 20_000, 'the child must actually be killed, not waited out')

  const finished = await runWithTimeout(process.execPath, ['-e', 'process.exit(4)'],
    { timeoutMs: 30_000 })
  assert.equal(finished.timedOut, false)
  assert.equal(finished.status, 4, 'a command that finished keeps its own exit code')
})

test('the Windows cleanup a timeout runs carries a bound, and reports whether the kill was issued (BACKLOG §127)', async () => {
  // A cleanup nobody bounded is how a hung taskkill wore the timeout's name in
  // the Python gates. The win32 arm is driven through its seam on every host.
  // This asserts the OPTION WIRING and the return value; the catalogue mutant
  // that drops the timeout is the dirty arm, and the failed-cleanup path is the
  // next test. Nothing here observes a real taskkill.
  const { terminateProcessTree, TASKKILL_TIMEOUT_MS } = await import('../plugin/scripts/run-shell-hook.mjs')
  const calls = []
  const issued = terminateProcessTree({ pid: 4242 }, 'win32', (cmd, args, options) => { calls.push({ cmd, args, options }); return { status: 0 } })
  assert.equal(issued, true, 'taskkill exit 0 is a kill that was issued')
  assert.equal(calls.length, 1, 'the win32 arm spawns exactly one taskkill')
  assert.equal(calls[0].cmd, 'taskkill')
  assert.deepEqual(calls[0].args, ['/pid', '4242', '/T', '/F'])
  assert.equal(calls[0].options.timeout, TASKKILL_TIMEOUT_MS,
    `taskkill must carry the shared bound; got ${JSON.stringify(calls[0].options)}`)

  // A taskkill that itself timed out, or could not start, is NOT an issued kill.
  assert.equal(terminateProcessTree({ pid: 4242 }, 'win32', () => ({ status: null, error: Object.assign(new Error('spawnSync taskkill ETIMEDOUT'), { code: 'ETIMEDOUT' }) })), false)
  assert.equal(terminateProcessTree({ pid: 4242 }, 'win32', () => ({ status: 1 })), false)
  // No pid: nothing to kill, nothing spawned, nothing issued.
  assert.equal(terminateProcessTree({ pid: undefined }, 'win32', () => { throw new Error('must not spawn without a pid') }), false)
})

test('the POSIX fallback reports what ChildProcess.kill answered, not merely that it did not throw', async () => {
  // process.kill(-pid) throws ESRCH when the group is gone; the fallback then
  // asks the child directly, and ChildProcess.kill answers false (no throw) when
  // the signal could not be sent. The first shape returned true on that answer.
  const { terminateProcessTree } = await import('../plugin/scripts/run-shell-hook.mjs')
  const groupGone = () => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }) }
  assert.equal(terminateProcessTree({ pid: 4242, kill: () => false }, 'linux', undefined, groupGone), false,
    'a direct kill that answered false is not an issued kill')
  assert.equal(terminateProcessTree({ pid: 4242, kill: () => true }, 'linux', undefined, groupGone), true)
  assert.equal(terminateProcessTree({ pid: 4242, kill: () => { throw new Error('EPERM') } }, 'linux', undefined, groupGone), false)
  const seen = []
  assert.equal(terminateProcessTree({ pid: 4242, kill: () => { throw new Error('must not reach the child when the group kill landed') } }, 'linux', undefined, pid => { seen.push(pid) }), true)
  assert.deepEqual(seen, [4242], 'the group kill is asked first, with the leader pid')
})

test('the runner process itself exits after a failed cleanup, with the child still alive', async () => {
  // The in-process test above proves the PROMISE settles. This proves the
  // wrapper PROCESS exits — which is what the host's deadline measures — and
  // it can only pass if the settle also lets go of the pipes and unrefs the
  // child, because either one alone keeps Node's loop alive on a live child.
  const runner = join(root, 'scripts', 'run-shell-hook.mjs')
  const probe = `
    import { runWithTimeout } from ${JSON.stringify(pathToFileURL(runner).href)}
    const run = await runWithTimeout(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'],
      { timeoutMs: 200, cleanupGraceMs: 400, terminate: () => false })
    process.stdout.write(JSON.stringify({ pid: run.pid, timedOut: run.timedOut, cleanupConfirmed: run.cleanupConfirmed }))
  `
  const start = Date.now()
  const outer = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', timeout: 6_000 })
  const elapsed = Date.now() - start
  let child = null
  try {
    assert.equal(outer.status, 0, `the wrapper must exit on its own: status ${outer.status} signal ${outer.signal}\n${outer.stderr}`)
    child = JSON.parse(outer.stdout)
    assert.equal(child.timedOut, true)
    assert.equal(child.cleanupConfirmed, false)
    // The child the stub refused to kill must still be alive — otherwise this
    // proved nothing about letting go of a LIVE child. On Windows the child is
    // not detached and did not outlive the wrapper: CI run 33955205514 on 70021d7
    // reported `kill ESRCH` here, 700ms in, with the wrapper already exited. So
    // there the exit timing above is the whole proof, and what the child did is
    // recorded rather than asserted (CLAUDE.md §7).
    let alive
    try { alive = process.kill(child.pid, 0) } catch (error) { alive = error.code }
    if (process.platform !== 'win32') {
      assert.equal(alive, true, 'the abandoned child must still be running when the wrapper has exited')
    } else {
      process.stderr.write(`[win32] the abandoned child after the wrapper exited: ${alive === true ? 'alive' : alive}\n`)
    }
  } finally {
    if (child?.pid) { try { process.kill(child.pid, 'SIGKILL') } catch {} }
  }
})

test('a cleanup that fails does not leave the hook pending until the host kills it (BACKLOG §127)', async () => {
  // Before this, runWithTimeout resolved ONLY on the child\'s `close`: a taskkill
  // that hung, failed or never started meant the timeout had fired and was then
  // never reported until the child exited on its own or the host\'s 120s deadline
  // killed the runner. The cleanup is stubbed to do nothing, so the child lives
  // on; the promise must settle within the grace and say the tree is unconfirmed.
  const { runWithTimeout } = await import('../plugin/scripts/run-shell-hook.mjs')
  const start = Date.now()
  const run = await runWithTimeout(process.execPath, ['-e', 'setTimeout(() => {}, 8_000)'],
    { timeoutMs: 200, cleanupGraceMs: 400, terminate: () => false })
  const elapsed = Date.now() - start
  try {
    assert.equal(run.timedOut, true)
    assert.equal(run.status, null)
    assert.equal(run.killIssued, false, 'the stub reported no kill, and the result must say so')
    assert.equal(run.cleanupConfirmed, false, 'nothing closed, so the tree is unconfirmed — never reported as gone')
    assert.ok(elapsed < 4_000, `settled in ${elapsed}ms; the child sleeps 8s, so waiting on it would show here`)
  } finally {
    // The stub left a real child behind on purpose; reap it so the suite-end
    // leak check has nothing to name.
    try { process.kill(run.pid, 'SIGKILL') } catch {}
  }

  // The clean arm: a kill that lands closes the child, and the result says so.
  const landed = await runWithTimeout(process.execPath, ['-e', 'setTimeout(() => {}, 8_000)'],
    { timeoutMs: 200, cleanupGraceMs: 4_000 })
  assert.equal(landed.timedOut, true)
  assert.equal(landed.killIssued, true)
  assert.equal(landed.cleanupConfirmed, true, 'the real kill must close the child inside the grace')
})

test('the cleanup bounds fit inside every outer margin that waits on the runner', async () => {
  // Both bounds are synchronous on the timer path, so their sum is what an
  // outer caller pays after the runner\'s own timeout. lifecycle gives the runner
  // ARTIFACT_GATE_KILL_MARGIN_MS beyond the gate timeout; the direct hooks give
  // the host\'s `timeout` beyond DEFAULT_TIMEOUT_MS. Either margin smaller than
  // the sum means the outer kill lands first and the tree is never reported.
  const { TASKKILL_TIMEOUT_MS, CLEANUP_GRACE_MS, shellHookTimeoutMs } = await import('../plugin/scripts/run-shell-hook.mjs')
  const { ARTIFACT_GATE_KILL_MARGIN_MS } = await import('../plugin/scripts/lifecycle.mjs')
  const cleanup = TASKKILL_TIMEOUT_MS + CLEANUP_GRACE_MS
  assert.ok(cleanup < ARTIFACT_GATE_KILL_MARGIN_MS,
    `taskkill ${TASKKILL_TIMEOUT_MS} + grace ${CLEANUP_GRACE_MS} must fit lifecycle's ${ARTIFACT_GATE_KILL_MARGIN_MS}ms kill margin`)
  const hooks = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'))
  // Only the entries that run THIS runner: lifecycle.mjs hooks have their own
  // budgets and are not what the cleanup arithmetic is about.
  const runnerHooks = Object.values(hooks.hooks).flat().flatMap(group => group.hooks ?? [])
    .filter(hook => (hook.args ?? []).some(arg => /run-shell-hook\.mjs$/.test(arg)))
  assert.ok(runnerHooks.length, 'hooks.json must declare at least one run-shell-hook entry for this arithmetic to mean anything')
  for (const hook of runnerHooks) {
    const hostMs = Number(hook.timeout) * 1000
    assert.ok(Number.isFinite(hostMs) && hostMs > 0, `a runner hook must declare a host timeout: ${JSON.stringify(hook)}`)
    assert.ok(shellHookTimeoutMs({}) + cleanup < hostMs,
      `default ${shellHookTimeoutMs({})} + cleanup ${cleanup} must fit the host's ${hostMs}ms (${hook.args.at(-1)})`)
  }
})

test('a shell that aborted before judging is a failure, not a clean pass', async () => {
  // The MSYS runtime prints `*** fatal error -` and still exits 0. Measured on
  // Windows: four PostToolUse hooks died in add_item and every one was recorded
  // as clean, so ADR files were edited with the gate never having run.
  const { shellRuntimeCrashed } = await import('../plugin/scripts/run-shell-hook.mjs')

  assert.equal(shellRuntimeCrashed(
    '      2 [main] bash (46688) child_info_fork::abort: *** fatal error - cannot fork\n'), true)
  assert.equal(shellRuntimeCrashed('[main] bash 1234 *** fatal error-something\n'), true)
  // Deliberately narrow: a gate is free to use those words in a finding, and a
  // finding that blocked as a crash would be a confusing false alarm.
  assert.equal(shellRuntimeCrashed('ADR-001: a fatal error in the deployment path\n'), false)
  assert.equal(shellRuntimeCrashed('*** fatal error - no bracket prefix\n'), false)
  assert.equal(shellRuntimeCrashed(''), false)
  assert.equal(shellRuntimeCrashed(undefined), false)
})

test('the verification wrapper reports what the command it ran actually did', () => {
  const wrapper = join(root, 'scripts', 'verify.mjs')
  const call = (...args) => spawnSync(process.execPath, [wrapper, ...args], {
    cwd: root, env, encoding: 'utf8', timeout: 60_000,
  })

  // The documented invocation, and the whole point of the wrapper: the child's
  // exit code is the verdict, so swallowing it would turn a red run green.
  assert.equal(call('--cwd', root, '--', process.execPath, '-e', 'process.exit(0)').status, 0)
  assert.equal(call('--cwd', root, '--', process.execPath, '-e', 'process.exit(3)').status, 3)

  // A command that cannot start is not a passing command.
  const missing = call('--cwd', root, '--', 'definitely-not-on-path-xyzzy')
  assert.equal(missing.status, 127)
  assert.match(missing.stderr, /failed to start/)

  // Usage errors exit 2, distinct from any verdict the child could return.
  assert.equal(call('--cwd', root).status, 2)
  assert.equal(call('--cwd', 'relative/path', '--', 'true').status, 2)
  assert.match(call('--cwd', 'relative/path', '--', 'true').stderr, /absolute path/)

  // `--` with nothing after it, and `--cwd` after the separator: two usage
  // shapes that reach the same guard by different routes, and both would
  // otherwise spawn `undefined` as a command.
  assert.equal(call('--cwd', root, '--').status, 2)
  assert.equal(call('--', 'true', '--cwd', root).status, 2)
  // The NUL-byte guard used to be untestable: spawnSync refuses an argument
  // containing one, so no invocation could reach it and a test would only have
  // proved Node's validation. Guarding the module's CLI behind an import check
  // (BACKLOG §27) made `parse` importable and pure, so the guard this file has
  // always carried can finally be exercised for the first time.
  assert.match(parse(['--cwd', `${root}\0`, '--', 'true']).error, /NUL/)
  assert.match(parse(['--cwd', 'relative/path', '--', 'true']).error, /absolute/)
  assert.equal(parse(['--cwd', root, '--', 'true', 'x']).error, undefined)

  // A command KILLED by a signal is not a command that returned a code. Without
  // this branch the wrapper reports `code ?? 1` for a process that never exited
  // normally, and a run killed on its time budget would read as an ordinary
  // failure — the distinction adr-verify's whole verdict taxonomy rests on.
  //
  // POSIX only, and skipped rather than adapted: Windows has no signals, Node
  // emulates a kill with TerminateProcess, and the child reports an exit CODE.
  // So `signal` is null there and this branch is genuinely unreachable — the
  // same fact that already skips the SIGTERM case in tests/evidence-chain.test.mjs,
  // learned the same evening and not carried across until CI said so.
  if (process.platform !== 'win32') {
    const killed = call('--cwd', root, '--', process.execPath, '-e',
      'process.kill(process.pid, "SIGKILL")')
    assert.equal(killed.status, 1, killed.stderr)
    assert.match(killed.stderr, /terminated by SIGKILL/,
      'the signal must be named; "exit 1" alone loses why')
  }
})

// --- adr-retire-check: the row rules that guard a frozen record --------------

test('the structural rules around the catalog fire too, not just the row rules', () => {
  // BACKLOG §87. `scripts/unasserted.mjs` neuters each finding in turn: 11 of 33
  // in this gate SURVIVED, meaning nothing required them. The row rules below had
  // cases; the STRUCTURAL rules — where the corpora are, whether the catalog
  // resolves, whether an obligation was carried across — did not, and those are
  // the ones a retirement actually turns on.
  const dir = scratch('archive-structure')
  const source = join(repoRoot, 'tests', 'fixtures', 'ok')
  const build = name => {
    const at = join(dir, name)
    cpSync(join(source, 'adr-archive'), join(at, 'adr-archive'), { recursive: true })
    cpSync(join(source, 'adr'), join(at, 'adr'), { recursive: true })
    return at
  }
  const check = at => run('adr-retire-check', ['adr-archive/README.md'], at)
  const catalogOf = at => join(at, 'adr-archive', 'README.md')
  const edit = (at, fn) => {
    const f = catalogOf(at)
    writeFileSync(f, fn(readFileSync(f, 'utf8')))
    return at
  }

  // The control FIRST: an untouched fixture draws none of these, or every
  // assertion below is satisfied by a gate that reports unconditionally.
  assert.equal(check(build('clean')).status, 0)

  // **Active corpus:** naming somewhere that is not a directory.
  const gone = edit(build('gone'), t => t.replace('**Active corpus:** ../adr', '**Active corpus:** ../nowhere'))
  assert.match(check(gone).stdout, /must resolve to an existing directory/i)

  // The active corpus exists but carries no catalog of its own.
  const noCat = build('no-catalog')
  rmSync(join(noCat, 'adr', 'README.md'), { force: true })
  assert.match(check(noCat).stdout, /needs README\.md as its governing decision catalog/i)

  // The active catalog links a file that is not there.
  const dangling = build('dangling')
  writeFileSync(join(dangling, 'adr', 'README.md'), '# Active\n\n- [ADR-001](ADR-001-vanished.md)\n')
  assert.match(check(dangling).stdout, /broken link/i)

  // The same record id present in BOTH trees: two files claim to be one decision.
  const twice = build('twice')
  cpSync(join(twice, 'adr-archive', 'ADR-001-history.md'), join(twice, 'adr', 'ADR-001-history.md'))
  assert.match(check(twice).stdout, /exists 2 times across active\/archive roots/i)

  // A row pointing at a destination for an obligation the archived record does
  // NOT have. With nothing deferred, the catalog must say `none`, or a retirement
  // can claim it carried work across that never existed and the pointer reads as
  // provenance.
  //
  // The record is sealed, so removing its deferral invalidates the SHA and that
  // check fires first and skips this one. The seal is the gate's contract, not an
  // obstacle to route around: re-seal with the gate's OWN digest function, so the
  // fixture is a legitimately re-sealed archive rather than a broken one.
  const overclaim = build('overclaim')
  const archived = join(overclaim, 'adr-archive', 'ADR-001-history.md')
  // BOTH sources of an obligation, which is the thing to know here: a deferred
  // Out of Scope entry AND an unchecked Follow-up box each count as one. Removing
  // only the deferral left the count at 1 and this case silently did not fire.
  writeFileSync(archived, readFileSync(archived, 'utf8')
    .replace('- Preserve the compatibility arm (deferred: active ADR backlog)\n', '')
    .replace('- [ ] Revisit the operator sign-off.\n', ''))
  const reseal = runPython(['-c', [
    'import importlib.machinery as m, importlib.util as u, sys',
    'sys.dont_write_bytecode = True',
    'l = m.SourceFileLoader("g", sys.argv[1]); sp = u.spec_from_loader(l.name, l)',
    'g = u.module_from_spec(sp); l.exec_module(g)',
    'from pathlib import Path',
    'print(g.decision_unit_digest(Path(sys.argv[2]), "ADR-001", Path(sys.argv[3])))',
  ].join('\n'), join(repoRoot, 'plugin', 'bin', 'adr-retire-check'),
  join(overclaim, 'adr-archive'), archived], { encoding: 'utf8' })
  assert.equal(reseal.status, 0, `re-seal failed: ${reseal.stderr}`)
  const fresh = reseal.stdout.trim()
  assert.match(fresh, /^[0-9a-f]{64}$/, `expected a digest, got ${fresh}`)
  const cat = catalogOf(overclaim)
  writeFileSync(cat, readFileSync(cat, 'utf8').replace(/[0-9a-f]{64}/, fresh))

  const over = check(overclaim)
  assert.doesNotMatch(over.stdout, /SHA-256/,
    `the re-seal must hold, or this is testing the seal instead: ${over.stdout}`)
  assert.match(over.stdout, /no detected obligations|catalog must say/i,
    `a row claiming an obligation the record does not have must be reported: ${over.stdout}`)

  // Obligations the archive HAS, with an active receipt that carries fewer. This
  // is the rule that stops a retirement dropping work on the floor: the fixture's
  // BACKLOG receipts both name ADR-001, so removing them leaves 2 owed and 0
  // receipted.
  const dropped = build('dropped')
  writeFileSync(join(dropped, 'adr', 'BACKLOG.md'),
    '# ADR Backlog\n\n## Follow-ups\n\n- [ ] something unrelated to any record.\n')
  const lost = check(dropped)
  assert.match(lost.stdout, /obligation\(s\), active receipt has/i,
    `an archived obligation with no active receipt must be reported: ${lost.stdout}`)

  // A supersession pointing at a record that does not exist. `superseded by
  // ADR-404` is a decision effect the catalog accepts, so nothing else catches a
  // replacement nobody ever wrote.
  const ghost = edit(build('ghost'), t => t.replace('| governing |', '| superseded by ADR-404 |'))
  assert.match(check(ghost).stdout, /replacement ADR-404 does not exist/i)

  // A supersession naming a record that DOES exist but that the active catalog
  // never links: the replacement is real and undiscoverable, so a reader
  // following the retirement lands nowhere.
  // ADR-007 rather than ADR-002: the fixture's active corpus already holds an
  // ADR-002, and reusing it fired the duplicate-id rule first — a case that
  // passes for the wrong reason is the thing this whole test exists to prevent.
  const hidden = edit(build('hidden'), t => t.replace('| governing |', '| superseded by ADR-007 |'))
  writeFileSync(join(hidden, 'adr', 'ADR-007-successor.md'),
    '# ADR-007: Successor\n\n**Status:** Accepted\n\n## Decision\n\nd\n')
  writeFileSync(join(hidden, 'adr', 'README.md'),
    '# Active\n\n- [ADR-001](../adr-archive/ADR-001-history.md)\n')
  const unseen = check(hidden)
  assert.match(unseen.stdout, /ADR-007 is not (an accepted governing decision|discoverable)/i,
    `a replacement the catalog does not link must be reported: ${unseen.stdout}`)
})


test('every adr-retire-check row rule has a case that makes it fire', () => {
  const dir = scratch('archive')
  const archive = join(dir, 'adr-archive')
  const source = join(repoRoot, 'tests', 'fixtures', 'ok')
  cpSync(join(source, 'adr-archive'), archive, { recursive: true })
  cpSync(join(source, 'adr'), join(dir, 'adr'), { recursive: true })

  const catalog = join(archive, 'README.md')
  const good = readFileSync(catalog, 'utf8')
  const check = text => {
    writeFileSync(catalog, text)
    return run('adr-retire-check', ['adr-archive/README.md'], dir)
  }
  assert.equal(check(good).status, 0, check(good).stdout)

  const row = good.split('\n').find(line => line.startsWith('| [ADR-001]'))
  const withRow = replacement => good.replace(row, replacement)

  const cases = [
    ['a link that does not resolve',
      withRow(row.replace('ADR-001-history.md', 'ADR-001-missing.md')), /does not resolve|not found|missing/i],
    ['a decision effect off the enum',
      withRow(row.replace('| governing |', '| quite important |')), /effect/i],

    ['a placeholder reason',
      withRow(row.replace('Current gates postdate the record', '<why>')), /reason/i],
    ['a digest that does not match the record',
      withRow(row.replace(/[0-9a-f]{64}/, 'd'.repeat(64))), /SHA-256/],
    ['a row with the wrong number of cells',
      withRow(row.replace(' | `../adr/BACKLOG.md` |', ' |')), /cell|column|row/i],
  ]

  for (const [label, text, expected] of cases) {
    assert.notEqual(text, good, `${label}: the mutation did not apply`)
    const result = check(text)
    assert.equal(result.status, 1, `${label} must be rejected\n${result.stdout}`)
    assert.match(result.stdout, expected, `${label}\n${result.stdout}`)
  }

  // A retirement date not written as YYYY-MM-DD is form: the row still says what
  // was retired and why, and the record is not misrepresenting anything. It
  // advises, and the advice still reaches the reader.
  const badDate = check(withRow(row.replace('| 2026-08-22 |', '| last Tuesday |')))
  assert.equal(badDate.status, 0, badDate.stdout)
  assert.match(badDate.stdout, /^\s+advice: .*YYYY-MM-DD/m, badDate.stdout)

  // The id is recovered from the link target, not only from the cell's label, so
  // relabelling a row does not quietly drop that record's seal. Asserted because
  // the opposite — a scan skipping rows it does not recognise — is exactly how
  // the `done` status check came to apply to nothing (BACKLOG item 18).
  const relabelled = withRow(row.replace('| [ADR-001](ADR-001-history.md) |', '| [a record](ADR-001-history.md) |'))
  assert.equal(check(relabelled).status, 0, 'a relabelled row still resolves its ADR')
  writeFileSync(join(archive, 'ADR-001-history.md'),
    `${readFileSync(join(archive, 'ADR-001-history.md'), 'utf8')}\ntampered\n`)
  const tampered = check(relabelled)
  assert.equal(tampered.status, 1, 'and its seal still fires')
  assert.match(tampered.stdout, /SHA-256/)

  // Listing the same ADR twice is a catalog that disagrees with itself.
  const duplicated = check(`${good}\n${row}\n`)
  assert.equal(duplicated.status, 1, duplicated.stdout)
  assert.match(duplicated.stdout, /lists ADR-001 more than once/)
})

// --- adr-debt: the pointer classifier and every failure report --------------

test('a task waiting on a choice nobody has made says so, and names the choice', () => {
  // ADR-024 T3, from BACKLOG §83. ADR-014 models waiting by OWNERSHIP —
  // Depends-on (someone here can act) and Blocked-on (nobody here can). A task
  // waiting on a decision nobody has made is neither: every prerequisite exists,
  // no work unblocks it, no event resolves it, a human has to pick. It read as
  // `partial` with the whole thing in Verification Log prose.
  const dir = scratch('undecided')
  const tasks = join(dir, 'adr', 'ADR-001-p', 'tasks')
  mkdirSync(tasks, { recursive: true })
  writeFileSync(join(dir, 'adr', 'ADR-001-p.md'), '# ADR-001: Probe\n')
  const task = header =>
    writeFileSync(join(tasks, 'T1-a.md'), `# Task ADR-001-T1: a\n\n${header}\n`)

  // COUNTED APART from deferred debt: an unmade decision is not punted work, and
  // planning for it as such misleads.
  task('**Awaiting-decision:** credit the nearer bearer, or pick one with a stated justification')
  const seen = run('adr-debt', [join(dir, 'adr')], dir)
  assert.match(seen.stdout, /1 awaiting a decision/)
  assert.match(seen.stdout, /awaiting a decision → credit the nearer bearer/)
  assert.doesNotMatch(seen.stdout, /1 deferred/, 'an unmade decision is not deferred debt')

  // ⚠ THE HEADER MUST NAME THE CHOICE. "waiting on a decision" with no decision
  // written down is the prose state it replaces, so accepting it would ship the
  // defect under a new name.
  const lint = body => {
    const f = join(tasks, 'T2-b.md')
    writeFileSync(f, `# Task ADR-001-T2: b\n\n${body}\n`)
    return run('adr-lint', [join(dir, 'adr', 'ADR-001-p.md')], dir)
  }
  assert.match(lint('**Awaiting-decision:** waiting on a decision').stdout,
    /does not name the choice/,
    'a header with no choice in it must be reported')
  assert.doesNotMatch(lint('**Awaiting-decision:** keep the arm, or delete it').stdout,
    /does not name the choice/,
    'a header naming two options must not be')
  assert.doesNotMatch(lint('**Awaiting-decision:** should the arm stay?').stdout,
    /does not name the choice/,
    'a question is a choice a reader can answer')

  // And a task with neither header is untouched — every file valid before this
  // stays valid, or the corpus turns red for a header nobody wrote yet.
  assert.doesNotMatch(lint('**Depends-on:** none').stdout, /Awaiting-decision/)
})

test('a target another repository owns is declared, not called broken', () => {
  // ADR-024 T2, from BACKLOG §82: a corpus that is one half of a two-repo
  // decision cites a record this tree cannot hold. It was permanently red, and
  // the author ended up writing the excuse INTO the pointer text — a comment
  // addressed to a linter, inside a value the linter cannot read.
  const dir = scratch('debt-external')
  const adrDir = join(dir, 'adr')
  mkdirSync(adrDir, { recursive: true })
  const write = body =>
    writeFileSync(join(adrDir, 'ADR-001-probe.md'), `# ADR-001: Probe\n\n## Out of Scope\n\n${body}\n`)
  const scan = () => run('adr-debt', [adrDir], dir)

  // DECLARED: counted in its own column, not resolved, and the run passes.
  write('- A courier registry (external: backend repo: ADR-007)')
  const declared = scan()
  assert.equal(declared.status, 0, `a declared external target must not fail the run: ${declared.stdout}`)
  assert.match(declared.stdout, /1 external/)
  assert.match(declared.stdout, /external → backend repo: ADR-007/,
    'the row must carry the owner, which is the reader\'s only question')
  assert.doesNotMatch(declared.stdout, /UNRESOLVED|BROKEN/)

  // UNDECLARED: the same pointer without the declaration still needs action.
  write('- A courier registry (deferred: ADR-007)')
  const bare = scan()
  assert.equal(bare.status, 1, 'an undeclared unresolvable pointer still fails')
  assert.match(bare.stdout, /UNRESOLVED \[adr\]/)

  // ⚠ NO OWNER, NO DECLARATION. The column exists to answer "who owns this", so
  // an `external:` without one is not a declaration — and reporting it is the
  // point: silently ignoring it would let a half-written declaration read as a
  // settled one, which is the state this disposition exists to make impossible.
  // BOTH halves, and the second was missing until a GREEN mutant said so.
  // `(external: ADR-007)` parses as where='ADR-007', pointer='' — so it exercises
  // the POINTER check and says nothing about the owner check. Only an empty
  // `<where>` with a real pointer reaches that branch.
  for (const missing of ['(external: ADR-007)', '(external: : ADR-007)']) {
    write(`- A courier registry ${missing}`)
    const ownerless = scan()
    assert.equal(ownerless.status, 1, `an incomplete declaration must not pass: ${missing}`)
    assert.match(ownerless.stdout, /external-no-owner/, missing)
  }

  // ONE GRAMMAR, BOTH GATES. A spelling adr-debt accepts and adr-lint rejects is
  // worse than no spelling at all — the author would be told to fix something
  // that already works.
  const record = join(adrDir, 'ADR-002-lint.md')
  writeFileSync(record, ['# ADR-002: Probe', '', '**Status:** Accepted',
    '**Spec:** None — no spec stage', '**Enforced-by:** None — fixture',
    '**Served-path change:** None — fixture', '', '## Alternatives Considered', '',
    '- Keep it. Rejected because fixture.', '', '## Wiring & Contract Changes', '',
    'None — implementation-internal only.', '', '## Out of Scope', '',
    '- A courier registry (external: backend repo: ADR-007)', ''].join('\n'))
  const linted = run('adr-lint', [record], dir)
  assert.doesNotMatch(linted.stdout, /no machine-readable disposition/,
    `adr-lint must accept the spelling adr-debt accepts: ${linted.stdout}`)
})

test('the deferred headline counts debts, not the places they are written', () => {
  // BACKLOG §85b, reported by two adopting corpora and sorted by both into
  // "TRUE but I could not tell what to do next". One debt written in a task file
  // AND its parent ADR is a row per location, and the headline counted rows: the
  // reporting corpus read `9 deferred` and had 4-5 real debts, so a reader
  // triaging it plans for twice the work that exists. Every ROW was true; the
  // NUMBER misled.
  const dir = scratch('debt-count')
  const adrDir = join(dir, 'adr')
  mkdirSync(join(adrDir, 'ADR-001-probe', 'tasks'), { recursive: true })
  writeFileSync(join(adrDir, 'notes.md'), '# Notes\n')
  const punt = '- Rate limiting (deferred: notes.md)'

  // The SAME debt, cited from a task file and from its parent record — which is
  // what the template tells an author to do.
  writeFileSync(join(adrDir, 'ADR-001-probe.md'), `# ADR-001: Probe\n\n## Out of Scope\n\n${punt}\n`)
  writeFileSync(join(adrDir, 'ADR-001-probe', 'tasks', 'T1-a.md'),
    `# Task ADR-001-T1: a\n\n## Out of Scope\n\n${punt}\n`)
  const twice = run('adr-debt', [adrDir], dir)
  assert.match(twice.stdout, /2 deferred rows \(1 distinct\)/,
    `one debt cited twice must not read as two: ${twice.stdout}`)

  // ...and the plain count survives when the rows really are different debts, or
  // the assertion above is satisfied by a gate that always says "distinct".
  writeFileSync(join(adrDir, 'ADR-001-probe', 'tasks', 'T1-a.md'),
    '# Task ADR-001-T1: a\n\n## Out of Scope\n\n- Retry policy (deferred: notes.md)\n')
  const two = run('adr-debt', [adrDir], dir)
  assert.match(two.stdout, /2 deferred ·/,
    `two genuinely different debts keep the plain count: ${two.stdout}`)
  assert.doesNotMatch(two.stdout, /distinct/,
    'the distinct form must appear only when rows actually collapse')
})

test('adr-debt resolves the pointers it can, and reports the ones it cannot', () => {
  const dir = scratch('debt')
  const adrDir = join(dir, 'adr')
  mkdirSync(adrDir, { recursive: true })
  writeFileSync(join(adrDir, 'ADR-002-target.md'), '# ADR-002: Target\n')
  writeFileSync(join(adrDir, 'notes.md'), '# Notes\n')

  const scan = () => run('adr-debt', [adrDir], dir)
  const adr = body => writeFileSync(join(adrDir, 'ADR-001-probe.md'), `# ADR-001: Probe\n\n${body}`)

  // Each pointer kind the classifier distinguishes, all resolvable. A URL and a
  // prose reference are listed rather than resolved; a path and an ADR id must
  // actually exist, and here they do.
  adr(['## Out of Scope', '',
    '- Rate limiting (deferred: notes.md)',
    '- Retry policy (deferred: ADR-002)',
    '- Metrics (deferred: https://example.invalid/issue/7)',
    '- Caching (deferred: F-9 once the contract lands)',
    '- Sharding (permanent: single-tenant by design)', ''].join('\n'))
  const clean = scan()
  assert.equal(clean.status, 0, clean.stdout)
  // A permanent boundary is a decision, not debt, and must not be reported.
  assert.doesNotMatch(clean.stdout, /Sharding/)
  assert.match(clean.stdout, /Rate limiting/)

  // A path pointer that resolves to nothing: the debt names a destination that
  // does not exist, so nobody can act on it.
  adr('## Out of Scope\n\n- Rate limiting (deferred: docs/nowhere.md)\n')
  const brokenPath = scan()
  assert.equal(brokenPath.status, 1, brokenPath.stdout)
  assert.match(brokenPath.stdout, /BROKEN \[path\]/)

  // An ADR id nothing in the corpus matches.
  adr('## Out of Scope\n\n- Rate limiting (deferred: ADR-404)\n')
  const brokenAdr = scan()
  assert.equal(brokenAdr.status, 1, brokenAdr.stdout)
  // ADR-024 T1: an unresolvable RECORD ID is UNRESOLVED, not BROKEN. The gate
  // reads one tree and cannot tell a typo from a target another repository owns —
  // `ADR-404` and `ADR-4O4` are equally unresolvable here — so it claims neither
  // and names both readings. The exit code is unchanged: the row still needs
  // action, and only the word changes.
  assert.match(brokenAdr.stdout, /UNRESOLVED \[adr\]/)
  assert.match(brokenAdr.stdout, /typo, or a record owned by another repository/,
    'the finding must name both readings and the declaration that settles them')
  assert.equal(brokenAdr.status, 1, 'an undeclared unresolvable pointer still fails')

  // `deferred:` with nothing after it — the shape of debt recorded by someone
  // who had not decided where it goes.
  adr('## Out of Scope\n\n- Rate limiting (deferred: )\n')
  const empty = scan()
  assert.equal(empty.status, 1, empty.stdout)
  assert.match(empty.stdout, /BROKEN \[empty\]/)

  // A POINTER THAT LEADS WITH A RECORD ID, then continues in prose. Reported
  // 2026-08-29 from an adopting corpus: `(deferred: ADR-002 T4, in this record's
  // `tasks/` — a long sentence)` picked the stray `tasks/` out of the prose,
  // resolved it as a PATH, found nothing, and reported BROKEN [path] about a
  // record that exists. The ADR template already states the rule for
  // `Invalidates:` — only the leading token, because the prose after it is prose.
  adr("## Out of Scope\n\n- Rate limiting (deferred: ADR-002 T4, in this record's "
    + "`tasks/` — and a sentence that keeps going about why)\n")
  const leading = scan()
  assert.doesNotMatch(leading.stdout, /BROKEN/,
    `a pointer leading with a real record id resolves:\n${leading.stdout}`)
  assert.equal(leading.status, 0, leading.stdout)

  // ...and the leading id is still RESOLVED, not merely skipped: a record this
  // corpus does not have must still be reported, or the fix above would be
  // indistinguishable from switching the check off.
  adr("## Out of Scope\n\n- Rate limiting (deferred: ADR-404 T4, in this record's "
    + "`tasks/` — and a sentence that keeps going about why)\n")
  const leadingMissing = scan()
  assert.match(leadingMissing.stdout, /UNRESOLVED \[adr\]/,
    `a leading id naming no record is still broken:\n${leadingMissing.stdout}`)

  // A DISPOSITION IN THE WRONG PLACE IS NOT AN EMPTY ONE. A bullet whose
  // disposition is followed by prose used to report BROKEN [malformed] with
  // pointer '' — the vocabulary for "nothing after the colon" — sending a reader
  // to look for a pointer that is right there (ADR-005, CLAUDE.md §3).
  adr("## Out of Scope\n\n- Rate limiting (deferred: notes.md). Folding it in would widen this,\n")
  const trailing = scan()
  assert.match(trailing.stdout, /BROKEN \[trailing-prose\]/,
    `the finding must name what is actually wrong:\n${trailing.stdout}`)
  assert.match(trailing.stdout, /notes\.md/,
    `and must show the pointer it found rather than an empty string:\n${trailing.stdout}`)

  // An unchecked follow-up is open work the corpus is still carrying.
  adr('## Follow-ups\n\n- [ ] Add the rate limiter\n- [x] Ship the parser\n')
  const followups = scan()
  assert.match(followups.stdout, /Add the rate limiter/)
  assert.doesNotMatch(followups.stdout, /Ship the parser/)
})

// --- spec-verify: the mode that actually runs the tests a spec binds --------

test('spec-verify --implemented runs the bound tests and separates RED from broken', () => {
  const dir = scratch('spec')
  const source = join(repoRoot, 'tests', 'fixtures', 'ok')
  cpSync(source, dir, { recursive: true })
  const spec = join(dir, 'spec-selftest.md')
  const good = readFileSync(spec, 'utf8')

  // --spec passes: the bindings exist as test definitions. That is the baseline
  // --implemented builds on, and asserting it first keeps the rows below honest.
  assert.equal(run('spec-verify', ['--spec', '--repo', dir, spec], dir).status, 0)

  // A Cmd override makes the run deterministic: the point here is the gate's
  // handling of a green and a red command, not which runner a repo happens to
  // have installed. Written IN BACKTICKS, the way the template writes every
  // command and the way the Test cell beside it is written — that form used to
  // reach the shell with its backticks intact.
  const bind = (tag, cmd) => good
    .replace('| F-1 | A conforming ADR + task pair makes adr-lint exit 0 | `test_selftest_fixture.py::test_gates_run` | @spec | |',
      `| F-1 | A conforming ADR + task pair makes adr-lint exit 0 | \`test_selftest_fixture.py::test_gates_run\` | ${tag} | ${cmd} |`)

  writeFileSync(spec, bind('@implemented', '`python3 -c "raise SystemExit(0)"`'))
  const green = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.equal(green.status, 0, green.stdout)

  // A bound test that fails is exit 3 — a distinct code from a structural
  // failure (1) or a missing binding (2), because "the spec is wrong" and "the
  // code does not do what the spec says" are different problems.
  writeFileSync(spec, bind('@implemented', '`python3 -c "raise SystemExit(1)"`'))
  const red = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.equal(red.status, 3, red.stdout)
  assert.match(red.stdout, /F-1/)

  // The case that can SEE the difference. With the backticks left on, a POSIX
  // shell treats the cell as a command SUBSTITUTION: it runs the command, then
  // executes its OUTPUT. So a command that succeeds while printing a word runs
  // that word — here a nonexistent one — and the fact goes RED for a reason that
  // has nothing to do with the test. Exit codes alone cannot tell the two apart,
  // which is why reverting the strip left this suite green until this row.
  writeFileSync(spec, bind('@implemented', '`python3 -c "print(\'definitely-not-a-command-xyzzy\')"`'))
  const printing = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.equal(printing.status, 0, `the command's OUTPUT must not be executed\n${printing.stdout}`)

  // The same override without backticks must behave identically; neither form
  // may be the one that happens to work.
  writeFileSync(spec, bind('@implemented', 'python3 -c "raise SystemExit(1)"'))
  const bare = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.equal(bare.status, 3, bare.stdout)

  // And an @spec-tagged row is not run at all: the tag is the claim that it has
  // been implemented, so a spec still being drafted is not failed for it.
  writeFileSync(spec, bind('@spec', '`python3 -c "raise SystemExit(1)"`'))
  const untagged = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.equal(untagged.status, 0, untagged.stdout)
})

test('spec-verify says it could not run a test, rather than that the test failed', () => {
  // Reported 2026-08-28 from a Go corpus: every fact came back
  // `RED  F-n: test failing — no stack detected and no Cmd override`, exit 3,
  // with the tests all passing. Go is in no branch of detect_stack and in no key
  // of cmds, so nothing ran — and the gate reported the one outcome it had not
  // observed. `survived` sends you to fix a test; a failure that was never
  // executed sends you to fix code that is not broken.
  //
  // The fixture root carries no stack marker at all, which is exactly the
  // condition: no composer.json, no pyproject.toml, no Cargo.toml, no
  // package.json, no molecule/.
  const dir = scratch('spec-unrun')
  cpSync(join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const spec = join(dir, 'spec-selftest.md')
  const good = readFileSync(spec, 'utf8')

  // @implemented and NO Cmd override — the only two things that make the runner
  // reach for a stack it cannot detect.
  writeFileSync(spec, good.replace(
    '| F-1 | A conforming ADR + task pair makes adr-lint exit 0 | `test_selftest_fixture.py::test_gates_run` | @spec | |',
    '| F-1 | A conforming ADR + task pair makes adr-lint exit 0 | `test_selftest_fixture.py::test_gates_run` | @implemented | |'))
  const unrun = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)

  assert.notEqual(unrun.status, 3,
    `exit 3 is "@implemented test failing", and no test was run\n${unrun.stdout}`)
  assert.equal(unrun.status, 4, `could-not-run has its own code\n${unrun.stdout}`)
  assert.doesNotMatch(unrun.stdout, /RED/,
    'RED is a verdict about a test that ran')
  assert.doesNotMatch(unrun.stdout, /test failing/,
    'the gate must not report an outcome it did not observe')
  assert.match(unrun.stdout, /UNRUN/)
  assert.match(unrun.stdout, /F-1/, 'name which fact could not be adjudicated')
  // Not PASS either: unproved and proved are different, and the status word is
  // what a reader skims. PARTIAL is the word coverage.sh already uses for it.
  assert.match(unrun.stdout, /\[PARTIAL\]/)
  // And the remedy, because "no stack detected" tells an author nothing about
  // what to do next.
  assert.match(unrun.stdout, /Cmd/, 'say how to make it adjudicable')
})

test('a scenario can override its runner, which is the escape it never had', () => {
  // docs/BACKLOG.md §38, open since 2026-08-23 and closed here. A FACT can name
  // its own command in the Cmd cell of its row; a scenario is a HEADING with no
  // column to put one in, so on a corpus whose stack `detect_stack` does not know
  // — a Go one, say — a scenario binding had NO authoring escape at all. It was
  // told honestly that it could not be adjudicated, and given no way to fix that.
  //
  // Same fixture root as the test above: no composer.json, no pyproject.toml, no
  // Cargo.toml, no package.json, no molecule/. Nothing detects.
  const dir = scratch('spec-scenario-cmd')
  cpSync(join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const spec = join(dir, 'spec-selftest.md')
  const good = readFileSync(spec, 'utf8')
  const scenario = '### UC1-S1 [happy] Conforming fixtures pass every gate [@spec] '
    + '→ `test_selftest_fixture.py::test_gates_run`'

  // THE DIRTY ANSWER FIRST: @implemented, no override, nothing detects the stack.
  writeFileSync(spec, good.replace(scenario, scenario.replace('[@spec]', '[@implemented]')))
  const without = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.match(without.stdout, /UNRUN/, `no runner and no override is UNRUN:\n${without.stdout}`)
  assert.match(without.stdout, /UC1-S1/, `and it must name the scenario:\n${without.stdout}`)

  // ...AND THE CLEAN ONE, same scenario, same undetectable root, one override.
  // `true` is a command every platform CI runs on has, and it exits 0.
  writeFileSync(spec, good.replace(
    scenario, scenario.replace('[@spec]', '[@implemented]') + ' cmd:`true`'))
  const withCmd = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.doesNotMatch(withCmd.stdout, /UNRUN\s+UC1-S1/,
    `an overridden scenario is adjudicated, not UNRUN:\n${withCmd.stdout}`)

  // The override must actually RUN, not merely be accepted: a command that exits
  // non-zero has to come back RED. Without this, ignoring the override entirely
  // would satisfy the assertion above.
  writeFileSync(spec, good.replace(
    scenario, scenario.replace('[@spec]', '[@implemented]') + ' cmd:`false`'))
  const failing = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.match(failing.stdout, /RED/,
    `the override is executed, and a failing one is RED:\n${failing.stdout}`)
})

// --- arch-lint: the two detections that stop a rule row citing nothing -------

test('arch-lint rejects a gate that cannot fail and a symbol that is not there', () => {
  const dir = scratch('arch')
  // Under src/, because a check cell's path token needs a `/` before arch-lint
  // treats it as a file to look the symbol up in — and the symbol is a SEPARATE
  // backticked token. A single `probe.py::test_x` token is read as neither, which
  // is how the first draft of this test asserted nothing at all.
  mkdirSync(join(dir, 'src'), { recursive: true })
  const probe = join(dir, 'src', 'probe.py')
  writeFileSync(probe, [
    'def test_boundary_holds():',
    '    assert 1 == 1',
    '',
    'def test_asserts_nothing():',
    '    value = 1',
    ''].join('\n'))

  const doc = join(dir, 'architecture.md')
  const write = rules => {
    writeFileSync(doc, ['# Architecture: probe', '',
      '**Status:** Living — updated with every structural change.',
      '**Repo:** probe',
      '**Tier:** library',
      '**Gate command:** `python3 -m pytest src/probe.py`',
      '**Last full audit:** 2026-08-25 via /quality-harness:arch-write', '',
      'A minimal conforming document, so each row below fails for its own reason.', '',
      '## Module Map', '',
      '| Module | Layer | One reason to change | Owner |',
      '|--------|-------|----------------------|-------|',
      '| `src/probe.py` | domain | the probe drifts | ADR-001 |', '',
      // Dependency Contracts is one of arch-lint's RULE_SECTIONS — the check
      // cell is the LAST cell of each data row, and only these sections are
      // scanned. A table under an invented heading is never read, which is how
      // the first draft of this test asserted nothing.
      '## Dependency Contracts', '',
      '| Rule | Check |',
      '|------|-------|',
      ...rules, '',
      '## Concept Ownership (DRY)', '', 'None.', '',
      '## Composition Root', '', 'None.', '',
      '## Test Doubles', '', 'None.', '',
      '## Trust & Data Boundaries', '', 'None.', '',
      '## Superseded', '', 'None.', ''].join('\n'))
    return run('arch-lint', [doc], dir)
  }

  const good = write(['| the boundary holds | `src/probe.py` `test_boundary_holds` |'])
  assert.equal(good.status, 0, good.stdout)

  // A command copied out of a table cell keeps markdown's escaped pipe, which
  // matches nothing in a shell — so the gate passes for a reason unrelated to
  // the code.
  const escaped = write(['| the boundary holds | `grep -q foo src/probe.py \\| head` |'])
  assert.equal(escaped.status, 1, escaped.stdout)
  assert.match(escaped.stdout, /markdown-escaped/)

  // A gate on a path that does not exist cannot fail: `! grep missing.py` turns
  // grep's exit 2 into a permanent pass.
  const missingPath = write(['| the boundary holds | `grep -q foo src/missing.py` |'])
  assert.equal(missingPath.status, 1, missingPath.stdout)
  assert.match(missingPath.stdout, /does not exist in the repo/)

  // A symbol named alongside a file that does not contain it.
  const wrongFile = write(['| the boundary holds | `src/probe.py` `test_not_in_there` |'])
  assert.equal(wrongFile.status, 1, wrongFile.stdout)
  assert.match(wrongFile.stdout, /does not contain it/)

  // A test cited as the check must itself be able to go red, or the row is a
  // name with nothing behind it — the same flaw as a task naming a test that
  // asserts nothing.
  const cannotFail = write(['| the boundary holds | `src/probe.py` `test_asserts_nothing` |'])
  assert.equal(cannotFail.status, 1, cannotFail.stdout)
  assert.match(cannotFail.stdout, /fail|red/i)

  // Two more shapes the gate must refuse: a row whose check cell is empty, and
  // one that says a human will keep things in sync rather than naming a command.
  const empty = write(['| the boundary holds |  |'])
  assert.equal(empty.status, 1, empty.stdout)
  assert.match(empty.stdout, /empty check cell/)

  const prose = write(['| the boundary holds | keep in sync with the handler by review |'])
  assert.equal(prose.status, 1, prose.stdout)
  assert.match(prose.stdout, /sync-prose/)

  // And the escape: a row explicitly marked as not built yet is a decision, not
  // a defect, so it must pass.
  const deferred = write(['| the boundary holds | `src/missing.py` (deferred: ADR-002) |'])
  assert.equal(deferred.status, 0, deferred.stdout)
})

// --- an unrecognized flag is a typo, not an instruction ---------------------

test('every gate refuses a flag it does not know', () => {
  // A gate that ignores an unknown flag answers a question nobody asked.
  // Measured 2026-08-26: `adr-next tasks --jsonn` printed the HUMAN report and
  // exited 0. lifecycle.mjs asks for `--json` and JSON.parse()s the result inside
  // a try/catch that continues on failure, so a renamed or mistyped flag would
  // have made session orientation silently empty at exit 0 — the same fail-open,
  // by another route, as the `#!` spawn in BACKLOG item 17.
  const dir = scratch('unknown-flag')
  cpSync(join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })

  const invocations = [
    ['adr-judge', ['ADR-001-selftest.md', '--bogus']],
    ['adr-lint', ['ADR-001-selftest.md', '--bogus']],
    ['adr-verify', ['tasks/T1-fixture.md', '--bogus', 'value']],
    ['adr-next', ['tasks', '--jsonn']],
    ['adr-debt', ['.', '--bogus']],
    ['adr-retire-check', ['adr-archive/README.md', '--bogus']],
    ['arch-lint', ['architecture.md', '--bogus']],
    ['postmortem-verify', ['postmortem-selftest.md', '--bogus']],
    ['spec-verify', ['--spec', '--bogus', 'spec-selftest.md']],
    ['qh-mcp', ['--bogus']],
    ['qh-root', ['--bogus']],
  ]
  for (const [gate, args] of invocations) {
    const result = run(gate, args, dir)
    // A flag the gate does not know is a typo, not a finding about a record.
    assert.notEqual(result.status, 0, `${gate} accepted an unknown flag\n${result.stdout}`)
    assert.match(`${result.stdout}${result.stderr}`, /unknown option|unrecognized/i, gate)
  }

  // Every gate in bin/ is covered, so a new gate cannot be added without one.
  assert.deepEqual(
    invocations.map(([gate]) => gate).sort(),
    gateNamesIn(bin).sort(),
    'a bundled gate has no unknown-flag case here',
  )
})

test('on Windows the shim runs the gate the documented invocation names', { skip: process.platform !== 'win32' }, () => {
  // The only place this can be checked is Windows itself, and until 2026-08-26
  // nothing checked it: `/adr-write` there ran adr-debt through PowerShell and
  // got a file-open dialog, because an extensionless `#!` script has no
  // association. The shim exists so the invocation the skills document works.
  const dir = scratch('windows-shim')
  cpSync(join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  const shim = join(bin, 'adr-lint.cmd')
  // One command string: an args array with `shell: true` is DEP0190 and will
  // become an error (seen on a Windows box, 2026-09-05).
  const result = spawnSync(`"${shim}" ADR-001-selftest.md tasks`,
    { cwd: dir, env, encoding: 'utf8', timeout: 60_000, shell: true })
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
  assert.match(result.stdout, /\[PASS\]/)
})

test('on Windows a bare gate name resolves under PowerShell', { skip: process.platform !== 'win32' }, () => {
  // The cmd.exe path is covered above (spawnSync `shell: true` uses ComSpec).
  // PowerShell is a different resolver and it is the one that was actually
  // reported broken on 2026-08-26: `/adr-write` ran a gate there and got a
  // file-open dialog, because PowerShell offers to pick an application for an
  // extensionless file rather than refusing it. PATHEXT includes .CMD, so the
  // bare name the skills document has to reach the shim — and a bare name is
  // what a skill writes, never an explicit `.cmd`.
  const dir = scratch('powershell-shim')
  cpSync(join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })
  // Windows environment names are case-insensitive but a spread object is not,
  // so a lone PATH key leaves the inherited Path winning and bin off the list.
  const shellEnv = { ...env, Path: env.PATH }
  const result = spawnSync('powershell',
    ['-NoProfile', '-NonInteractive', '-Command', 'adr-lint ADR-001-selftest.md tasks'],
    { cwd: dir, env: shellEnv, encoding: 'utf8', timeout: 60_000 })
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
  assert.match(result.stdout, /\[PASS\]/)
})

test('the machine-readable output lifecycle.mjs depends on is machine-readable', () => {
  // readyTaskLines parses this and swallows a parse failure with `continue`, so
  // nothing downstream would report that the contract broke.
  const dir = scratch('json-contract')
  cpSync(join(repoRoot, 'tests', 'fixtures', 'ok'), dir, { recursive: true })

  const result = run('adr-next', ['tasks', '--json'], dir)
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  for (const key of ['ready', 'done', 'blocked']) {
    assert.ok(Array.isArray(report[key]), `--json must carry a ${key} array`)
  }
  assert.ok(report.ready.length > 0, 'the fixture has a ready task')
  // The exact fields lifecycle.mjs reads off a ready entry.
  for (const field of ['id', 'goal', 'path']) {
    assert.ok(report.ready[0][field], `a ready entry must carry ${field}`)
  }
})

// --- adr-judge: the two axes a schema cannot check -------------------------

const JUDGE_CLEAN = readFileSync(join(repoRoot, 'tests', 'fixtures', 'judge', 'ADR-050-clean.md'), 'utf8')

test('every adr-judge rule has a case that makes it fire, and a record that passes them all', () => {
  const dir = scratch('judge')
  const write = text => {
    const path = join(dir, 'ADR-050.md')
    writeFileSync(path, text)
    return path
  }

  // The positive control. Without it every row below could be firing for its own
  // reason — the vacuous pass this project keeps finding in its own tests.
  const clean = run('adr-judge', [write(JUDGE_CLEAN)])
  assert.equal(clean.status, 0, clean.stdout + clean.stderr)
  assert.match(clean.stdout, /evidence and clarity rules all pass/)

  // The per-rule firing table lives in tests/judge-rules.test.mjs, which drives
  // every rule in BOTH directions over a corpus of realistic sections and
  // asserts the exact set of rules that fired. Duplicating a weaker copy here is
  // how two corpora drift and one of them starts asserting the wrong thing —
  // which is exactly what happened to this block once E1 learned to recognise
  // "as observed by the team".

  // The bundled template judges itself finished: `Superseded by ADR-XXX` is a
  // placeholder for a NUMBER, and reading it as an authoring marker made the
  // gate fire on the document it ships.
  const template = run('adr-judge', [join(root, 'templates', 'adr-template.md')])
  assert.equal(template.status, 0)
  assert.match(template.stdout, /evidence and clarity rules all pass/)

  // The rubric is the model half: the questions, for the agent to answer.
  const rubric = run('adr-judge', ['--rubric'])
  assert.equal(rubric.status, 0)
  // E4 is BACKLOG §53: a named check can be real, passing and correctly written
  // and still be unable to see the artifact the record is about, at which point
  // it reads as enforcement and is decoration. Deciding that mechanically is
  // close to undecidable, so it is a QUESTION here rather than a rule in
  // adr-lint — which is what §53 itself concluded.
  for (const rule of ['E1', 'E2', 'E3', 'E4', 'C1', 'C2', 'C3']) {
    assert.match(rubric.stdout, new RegExp(`\\b${rule}\\b`), `the rubric must name ${rule}`)
  }
  // The IDENTIFIERS, deliberately, and not the wording. Asserting the prose would
  // be the contract test BACKLOG §80 is about — a check that words appear rather
  // than that the document says the right thing — and rewording a question must
  // stay free.

  // A broken invocation is not a verdict about a record.
  assert.equal(run('adr-judge', ['--not-a-flag']).status, 2)
  assert.equal(run('adr-judge', []).status, 2)
  assert.equal(run('adr-judge', [join(dir, 'absent.md')]).status, 2)
})


test('every shard slice covers the catalogue exactly once', () => {
  // The campaign is the only check that measures whether the other checks detect
  // anything, and it grew from 145 entries to 268 in two days — its CI job was
  // killed at thirty minutes on 2026-08-28. Sharding is what keeps it running,
  // so a slice that drops or repeats a mutation would silently shrink the one
  // gate nothing else covers.
  const runner = join(repoRoot, 'scripts', 'mutate.mjs')
  const catalogue = JSON.parse(readFileSync(join(repoRoot, 'tests', 'mutations.json'), 'utf8')).mutations
  const seen = []
  for (let i = 1; i <= 4; i += 1) {
    const out = spawnSync(process.execPath, [runner, '--shard', `${i}/4`, '--list'],
      { encoding: 'utf8', timeout: 60_000 }).stdout
    seen.push(...out.split('\n').filter(l => l && !l.startsWith(' ') && !l.startsWith('shard')))
  }
  assert.equal(seen.length, catalogue.length, 'every mutation runs in exactly one shard')
  assert.equal(new Set(seen).size, catalogue.length, 'and none runs in two')

  for (const bad of ['5/4', '0/4', 'bad', '1/0']) {
    const run = spawnSync(process.execPath, [runner, '--shard', bad, '--list'],
      { encoding: 'utf8', timeout: 60_000 })
    assert.notEqual(run.status, 0, `--shard ${bad} must be refused`)
  }
})
test('the mutation runner names an option it does not know, instead of running everything', () => {
  // Silently ignoring one selected nothing, so the filter stayed null and every
  // mutation in the catalogue ran — twenty minutes of campaign for a caller who
  // asked for three, with output that looked exactly like what was requested.
  // Measured 2026-08-27 with `--filter`, which is spelled `--case`.
  const runner = join(repoRoot, 'scripts', 'mutate.mjs')
  const isolated = join(mkdtempSync(join(os.tmpdir(), 'qh-mutate-flag-')), 'lock')
  const call = args => spawnSync(process.execPath, [runner, ...args],
    { cwd: repoRoot, env: { ...env, QUALITY_HARNESS_MUTATE_LOCK: isolated }, encoding: 'utf8', timeout: 60_000 })

  const wrong = call(['--filter', 'sync:'])
  assert.equal(wrong.status, 2, wrong.stdout + wrong.stderr)
  assert.match(wrong.stderr, /unknown option: --filter/)
  // And it must say what IS accepted, or the next guess is as blind as the first.
  assert.match(wrong.stderr, /--case/)

  // The flags it does know still work: --list selects and exits without running.
  const listed = call(['--case', 'mktemp -d is a temp', '--list'])
  assert.equal(listed.status, 0, listed.stdout + listed.stderr)
  assert.match(listed.stdout, /mktemp -d is a temp/)
})

test('the mutation runner refuses to run over an editor, or beside another runner', () => {
  // This rewrites real source and restores it from a journal. Twice on
  // 2026-08-26 a patch written while a run was in flight was silently rolled
  // back by that restore: the work looked applied, the tests ran against the old
  // code, and the only clue was a failure that made no sense. A second runner
  // started the same way. Both cost more than the guards do.
  const runner = join(repoRoot, 'scripts', 'mutate.mjs')
  // Its own lock file, so exercising these guards cannot collide with a real
  // campaign running in the same checkout.
  const isolated = join(mkdtempSync(join(os.tmpdir(), 'qh-mutate-')), 'lock')
  const call = (extraArgs, lock = isolated) => spawnSync(process.execPath,
    [runner, '--case', 'mktemp -d is a temp', ...extraArgs],
    { cwd: root, env: { ...env, QUALITY_HARNESS_MUTATE_LOCK: lock }, encoding: 'utf8', timeout: 60_000 })

  // A live owner is refused. `process.pid` is this test, which is certainly alive.
  const lock = isolated
  writeFileSync(lock, String(process.pid))
  try {
    const second = call([])
    assert.equal(second.status, 2, second.stdout + second.stderr)
    assert.match(second.stderr, /another run is in flight/)
  } finally {
    rmSync(lock, { force: true })
  }

  // The other guard: a file this run rewrites that has uncommitted changes. The
  // runner restores from a journal, so an edit made while it runs is silently
  // rolled back — which is how two patches were lost on 2026-08-26.
  const target = join(root, 'scripts', 'lifecycle.mjs')
  const pristine = readFileSync(target, 'utf8')
  try {
    writeFileSync(target, `${pristine}\n// scratch\n`)
    const overAnEditor = call([])
    assert.equal(overAnEditor.status, 2, overAnEditor.stdout + overAnEditor.stderr)
    assert.match(overAnEditor.stderr, /uncommitted changes/)
    assert.match(overAnEditor.stderr, /silently rolled back/)
    // NOT tested here: that --force proceeds. It would run a mutation campaign
    // inside a test, nested in whatever campaign is already running — the exact
    // concurrency this guard exists to stop. The refusal is the behaviour that
    // matters; the override is one `argv.includes` away from it.
  } finally {
    writeFileSync(target, pristine)
  }

  // A campaign that refuses still repairs first. `--case` with no match used to
  // exit before recover(), so a killed run's mutation stayed applied and the
  // next thing anyone ran reported a failure that made no sense. Same class as
  // recover()-before-claim, which was fixed on 2026-08-26 as one instance while
  // the class of early exits went unaudited. Measured 2026-08-27.
  const journal = `${isolated}.inflight.json`
  const victim = join(root, 'scripts', 'adr-state.mjs')
  const untouched = readFileSync(victim, 'utf8')
  writeFileSync(victim, `${untouched}\n// left applied by a killed run\n`)
  writeFileSync(journal, JSON.stringify({ file: victim, original: untouched }))
  try {
    const refused = spawnSync(process.execPath, [runner, '--case', 'no-such-mutation-exists'],
      { cwd: repoRoot, env: { ...env, QUALITY_HARNESS_MUTATE_LOCK: isolated }, encoding: 'utf8', timeout: 60_000 })
    assert.equal(refused.status, 1, refused.stdout + refused.stderr)
    assert.match(refused.stderr, /no mutation matches/)
    assert.equal(readFileSync(victim, 'utf8'), untouched,
      'a run that refuses must still repair what a killed run left behind')
  } finally {
    writeFileSync(victim, untouched)
    rmSync(journal, { force: true })
  }

  // A dead owner left the lock behind; that is a crash, not a conflict, and the
  // next run reclaims it rather than wedging forever.
  writeFileSync(lock, '999999')
  try {
    const reclaimed = call([])
    // Not a status assertion: the OTHER guard — uncommitted changes to the files
    // this run rewrites — legitimately also exits 2, and in a working tree it
    // usually does. What matters is that the stale lock is not the reason.
    assert.doesNotMatch(reclaimed.stderr, /another run is in flight/,
      'a stale lock must not wedge the runner')
    assert.equal(existsSync(lock) ? readFileSync(lock, 'utf8').trim() : '', '',
      'the dead owner\'s lock is cleared rather than inherited')
  } finally {
    rmSync(lock, { force: true })
  }
})

test('qh-root answers with a plugin directory, or with nothing at all', () => {
  // A wrong root is worse than none, because it resolves. This is the escape
  // hatch for a skill loaded outside plugin context, so a confident wrong answer
  // would send every template and script read to the wrong version silently.
  const empty = mkdtempSync(join(os.tmpdir(), 'qh-root-'))
  try {
    // An explicit CLAUDE_PLUGIN_ROOT is the caller knowing better than a search,
    // and it is asserted with one supplied rather than with whatever this machine
    // happens to have installed. The first version of this read the ambient
    // environment and passed only on a developer's box: CI has no plugin cache,
    // so qh-root correctly exited 1 and four jobs went red on 2026-08-27.
    const told = runPython([join(bin, 'qh-root')],
      { encoding: 'utf8', timeout: 60_000, env: { ...env, CLAUDE_PLUGIN_ROOT: root } })
    assert.equal(told.status, 0, told.stderr)
    assert.equal(told.stdout.trim(), root,
      'a caller who names a root already knows the answer; do not go looking past it')

    // A named root that holds no gates is not an answer either, so the search runs.
    const bogus = runPython([join(bin, 'qh-root')],
      { encoding: 'utf8', timeout: 60_000,
        env: { ...env, CLAUDE_PLUGIN_ROOT: empty, HOME: empty, USERPROFILE: empty } })
    assert.notEqual(bogus.stdout.trim(), empty,
      'a plugin root with no bin/ is not a plugin root')

    // The discriminating behaviour, which "prints a directory holding bin" does
    // not reach: a real cache holds 2.0.4 beside 2.0.10 and 2.9.0 beside 2.15.0,
    // and lexical order picks last month's copy. Found 2026-08-27 by two
    // mutations that stayed GREEN — the assertion above was about the shape of
    // the answer, not about which answer it is.
    const cache = join(empty, '.claude', 'plugins', 'cache', 'quality-harness', 'quality-harness')
    for (const [version, hasGates] of [['2.0.4', true], ['2.0.10', true], ['2.9.0', true],
      ['2.15.0', true], ['9.9.9', false]]) {
      mkdirSync(join(cache, version, hasGates ? 'bin' : 'docs'), { recursive: true })
    }
    const home = { ...env, HOME: empty, USERPROFILE: empty, CLAUDE_PLUGIN_ROOT: '' }
    const picked = runPython([join(bin, 'qh-root')],
      { encoding: 'utf8', timeout: 60_000, env: home })
    assert.equal(picked.status, 0, picked.stderr)
    assert.equal(basename(picked.stdout.trim()), '2.15.0',
      `qh-root picked ${picked.stdout.trim()} — 2.0.10 over 2.0.4 and 2.15.0 over 2.9.0 are the cases`)
    // 9.9.9 is the newest by number and holds no gates, so it is not a candidate:
    // an unpacked directory without bin/ is not something to send a caller to.
    assert.notEqual(basename(picked.stdout.trim()), '9.9.9')

    // Nothing installed and nothing in the environment: say so, do not guess.
    const bare = mkdtempSync(join(os.tmpdir(), 'qh-root-bare-'))
    const nowhere = runPython([join(bin, 'qh-root')],
      { encoding: 'utf8', timeout: 60_000,
        env: { ...env, HOME: bare, USERPROFILE: bare, CLAUDE_PLUGIN_ROOT: '' } })
    rmSync(bare, { recursive: true, force: true })
    assert.equal(nowhere.status, 1, nowhere.stdout)
    assert.equal(nowhere.stdout, '', 'a failed lookup must print no path at all')
    assert.match(nowhere.stderr, /no installed quality-harness found/)
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

// --- ADR-014 T3: waiting is not debt ----------------------------------------

test('a task waiting on an external event is not counted as debt', () => {
  const dir = scratch('waiting')
  const adrDir = join(dir, 'adr')
  mkdirSync(join(adrDir, 'ADR-001-probe', 'tasks'), { recursive: true })
  writeFileSync(join(adrDir, 'ADR-001-probe.md'), '# ADR-001: Probe\n')

  const task = (name, blockedOn, vlogDate) => writeFileSync(
    join(adrDir, 'ADR-001-probe', 'tasks', name),
    `# Task ADR-001-${name}\n\n`
    + (blockedOn ? `**Blocked-on:** ${blockedOn}\n` : '')
    + '**Depends-on:** none\n\n## Goal\n\ng\n\n## Out of Scope\n\n- none\n\n'
    + '## Verification Log\n'
    + (vlogDate ? `\n- ${vlogDate} · no-git · human-observed · a person watched it\n` : ''))

  // Waiting on the outside world, and recent. It is reported, and it is NOT debt:
  // the deferred count means work punted with a pointer, and this is work whose
  // pointer is an event in the world. A number that silently changed definition
  // would be worse than a missing one.
  task('T1-waiting.md', 'commit abc1234 is an ancestor of master'
    + ' (git merge-base --is-ancestor abc1234 master)', '2026-08-29')
  const got = run('adr-debt', [adrDir], dir)
  assert.match(got.stdout, /1 waiting/, `a waiting bucket must appear: ${got.stdout}`)
  assert.match(got.stdout, /0 deferred/,
    `and waiting must not be counted as deferred debt: ${got.stdout}`)
  assert.match(got.stdout, /abc1234/, 'the event itself must be shown, not just counted')

  // The must-fail direction: a task with no Blocked-on produces no waiting line,
  // or the bucket counts every task and means nothing.
  const plain = scratch('waiting-none')
  const plainAdr = join(plain, 'adr')
  mkdirSync(join(plainAdr, 'ADR-001-probe', 'tasks'), { recursive: true })
  writeFileSync(join(plainAdr, 'ADR-001-probe.md'), '# ADR-001: Probe\n')
  writeFileSync(join(plainAdr, 'ADR-001-probe', 'tasks', 'T1-plain.md'),
    '# Task ADR-001-T1\n\n**Depends-on:** none\n\n## Goal\n\ng\n\n'
    + '## Out of Scope\n\n- none\n\n## Verification Log\n')
  const none = run('adr-debt', [plainAdr], plain)
  assert.match(none.stdout, /0 waiting/, `no Blocked-on means nothing waiting: ${none.stdout}`)
})

test('an old wait asks whether the event has already happened', () => {
  const dir = scratch('waiting-old')
  const adrDir = join(dir, 'adr')
  mkdirSync(join(adrDir, 'ADR-001-probe', 'tasks'), { recursive: true })
  writeFileSync(join(adrDir, 'ADR-001-probe.md'), '# ADR-001: Probe\n')
  writeFileSync(join(adrDir, 'ADR-001-probe', 'tasks', 'T1-stale.md'),
    '# Task ADR-001-T1\n\n**Blocked-on:** the vendor enabling the account\n'
    + '**Depends-on:** none\n\n## Goal\n\ng\n\n## Out of Scope\n\n- none\n\n'
    + '## Verification Log\n\n- 2025-01-05 · no-git · human-observed · a person watched it\n')

  const got = run('adr-debt', [adrDir], dir)
  // The failure mode of a real wait is not that it rots — it is that the event
  // happens and nobody looks again. So an old one is asked about, not scolded.
  assert.match(got.stdout, /already happened/,
    `an old wait must ask whether the event has already happened: ${got.stdout}`)
  const line = got.stdout.split('\n').find(l => l.includes('waiting '))
  assert.ok(line, `a waiting line must be printed: ${got.stdout}`)
  assert.doesNotMatch(line, /rot|stale|overdue|neglect/i,
    `the wording must ask, not scold: ${line}`)
})

test('a wait is dated by its newest evidence row, not by prose', () => {
  // The comment and the code must agree about WHICH dates count. Both logs are
  // tool-written, so either means somebody looked; a date quoted in prose is not
  // evidence that anyone did, and must not reset the clock.
  const dir = scratch('waiting-dates')
  const adrDir = join(dir, 'adr')
  mkdirSync(join(adrDir, 'ADR-001-probe', 'tasks'), { recursive: true })
  writeFileSync(join(adrDir, 'ADR-001-probe.md'), '# ADR-001: Probe\n')
  writeFileSync(join(adrDir, 'ADR-001-probe', 'tasks', 'T1-dated.md'),
    '# Task ADR-001-T1\n\n**Blocked-on:** the vendor enabling the account\n'
    + '**Depends-on:** none\n\n## Goal\n\nAgreed on 2026-08-29 with the vendor.\n\n'
    + '## Out of Scope\n\n- none\n\n'
    + '## Verification Log\n\n- 2025-01-05 · no-git · human-observed · a person watched it\n')

  // Only the 2025 evidence row counts; the 2026 date in the Goal prose does not.
  const proseOnly = run('adr-debt', [adrDir], dir)
  assert.match(proseOnly.stdout, /already happened/,
    `a prose date must not reset the clock: ${proseOnly.stdout}`)

  // Adding a RECENT Mutation Log row does count — it is tool-written evidence
  // that somebody looked, and scoping age to the Verification Log alone would
  // call this task stale while its mutation evidence was recorded days ago.
  const today = new Date().toISOString().slice(0, 10)
  writeFileSync(join(adrDir, 'ADR-001-probe', 'tasks', 'T1-dated.md'),
    readFileSync(join(adrDir, 'ADR-001-probe', 'tasks', 'T1-dated.md'), 'utf8')
    + `\n## Mutation Log\n\n- ${today} · no-git · mutant killed · exit 1 · \`x.py\` · probe\n`)
  const recent = run('adr-debt', [adrDir], dir)
  assert.doesNotMatch(recent.stdout, /already happened/,
    `a recent Mutation Log row means somebody looked: ${recent.stdout}`)
  assert.match(recent.stdout, /1 waiting/, 'and it is still waiting')
})

test('an explicit statement of absence is not counted as debt', () => {
  // Reported by pirkiniukampelis-cms-laravel-3d: the task template's own literal
  // `- [ ] (none at authoring)` was counted as an open follow-up, so "nothing was
  // deferred" was reported as "one thing is open". It inflated their corpus total
  // and, worse, teaches authors to DELETE the honest placeholder — the same
  // incentive inversion as BACKLOG §73, where the truthful word bought silence.
  const dir = scratch('absence')
  const adrDir = join(dir, 'adr')
  mkdirSync(adrDir, { recursive: true })
  writeFileSync(join(adrDir, 'ADR-001-probe.md'),
    '# ADR-001: Probe\n\n## Follow-ups\n\n- [ ] (none at authoring)\n')
  const got = run('adr-debt', [adrDir], dir)
  assert.match(got.stdout, /0 open follow-ups/,
    `an explicit "none" must not be counted as an open item: ${got.stdout}`)

  // The must-fail direction: a REAL open follow-up is still counted, or this
  // silences the whole check rather than one false positive.
  writeFileSync(join(adrDir, 'ADR-001-probe.md'),
    '# ADR-001: Probe\n\n## Follow-ups\n\n- [ ] (none at authoring)\n'
    + '- [ ] Decide whether the purge job keeps its own schedule\n')
  const real = run('adr-debt', [adrDir], dir)
  assert.match(real.stdout, /1 open follow-ups/,
    `a real follow-up beside the placeholder must still count: ${real.stdout}`)
})

test('a wait is dated by its evidence logs, not by a row-shaped line in prose', () => {
  // Reported by a Codex review: the age scan read the WHOLE file for `- <date> · `,
  // so a quoted example row in prose — which has exactly that shape — could make an
  // old wait look young and delay the 30-day question. My own earlier test used a
  // plain inline date, which the scan never matched, so it proved nothing about this.
  const dir = scratch('waiting-prose-row')
  const adrDir = join(dir, 'adr')
  mkdirSync(join(adrDir, 'ADR-001-probe', 'tasks'), { recursive: true })
  writeFileSync(join(adrDir, 'ADR-001-probe.md'), '# ADR-001: Probe\n')
  const today = new Date().toISOString().slice(0, 10)
  writeFileSync(join(adrDir, 'ADR-001-probe', 'tasks', 'T1-quoted.md'),
    '# Task ADR-001-T1\n\n**Blocked-on:** the vendor enabling the account\n'
    + '**Depends-on:** none\n\n## Goal\n\nThe grammar looks like this:\n\n'
    + `- ${today} · no-git · exit 0 · \`probe\`\n\n`     // a quoted EXAMPLE, not evidence
    + '## Out of Scope\n\n- none\n\n'
    + '## Verification Log\n\n- 2025-01-05 · no-git · human-observed · a person watched it\n')

  const got = run('adr-debt', [adrDir], dir)
  assert.match(got.stdout, /already happened/,
    `a row-shaped line in prose must not reset the clock: ${got.stdout}`)
})

// --- adr-retire-check: the STRUCTURAL rules -----------------------------------
//
// scripts/unasserted.mjs measured 17 of 33 finding sites here surviving being
// disabled entirely -- the worst ratio of any gate, in the one that guards ADR
// retirement, where a finding that cannot fire loses decision authority silently.
// The existing test above covers the catalog ROW rules; nothing covered the rules
// about the two trees and how they point at each other.
test('every adr-retire-check structural rule has a case that makes it fire', () => {
  const dir = scratch('archive-structure')
  const archive = join(dir, 'adr-archive')
  const source = join(repoRoot, 'tests', 'fixtures', 'ok')
  cpSync(join(source, 'adr-archive'), archive, { recursive: true })
  cpSync(join(source, 'adr'), join(dir, 'adr'), { recursive: true })

  const catalog = join(archive, 'README.md')
  const good = readFileSync(catalog, 'utf8')
  // A target for the id-less row below, so that case fails on the missing id and
  // not on a link that does not resolve.
  writeFileSync(join(archive, 'notes.md'), '# notes\n')
  const check = text => {
    writeFileSync(catalog, text)
    return run('adr-retire-check', ['adr-archive/README.md'], dir)
  }
  // The positive control. Without it every "the broken one is reported" case below
  // is satisfied by a gate that reports everything.
  assert.equal(check(good).status, 0, `the fixture must be clean: ${check(good).stdout}`)

  const cases = [
    ['an Active corpus that resolves to nothing',
      good.replace('**Active corpus:** ../adr', '**Active corpus:** ../no-such-corpus'),
      /Active corpus|does not|exist/i],
    ['an Active corpus that is the archive itself',
      good.replace('**Active corpus:** ../adr', '**Active corpus:** .'),
      /overlap|disjoint|sibling/i],
    ['a catalog row naming no ADR id',
      good + '| [a record](notes.md) | Untitled | governing | 2026-08-22 | why '
           + '| `../adr/BACKLOG.md` | ' + 'd'.repeat(64) + ' |\n',
      /no ADR id|ADR id/i],
    ['an archive README with no lifecycle marker',
      good.replace('**Lifecycle:** Frozen historical ADR records', ''),
      /lifecycle marker|Lifecycle/i],
    ['an obligations cell that links nothing that resolves',
      good.replace('`../adr/BACKLOG.md`', '`../adr/NOT-THERE.md`'),
      /broken link|does not resolve|obligation/i],
  ]

  for (const [label, text, expected] of cases) {
    assert.notEqual(text, good, `${label}: the edit did not apply`)
    const result = check(text)
    const said = `${result.stdout ?? ''}${result.stderr ?? ''}`
    assert.match(said, expected, `${label}: not reported — ${said.slice(0, 300)}`)
    // Named, never a bare exit code: "exit 1" alone makes a reader redo the
    // enumeration the gate just did.
    assert.notEqual(said.trim(), '', `${label}: reported nothing at all`)
  }
})

test('adr-retire-check --adopt reports what it finds on a tree adopting the lifecycle', () => {
  // The duplicate messages in scripts/unasserted.mjs's output were the tell: sites
  // 4/5/13, 7/16, 8/17 and 6/18 are the SAME sentences twice, because
  // adoption_report duplicates the structural rules that the catalog path already
  // has. Only one copy was ever reached, so half of them asserted nothing.
  //
  // --adopt is what a corpus runs BEFORE it has an archive catalog, so these are
  // the first findings a new adopter ever sees.
  const base = scratch('adopt')
  const build = (layout) => {
    const dir = join(base, layout.name)
    mkdirSync(join(dir, 'adr'), { recursive: true })
    mkdirSync(layout.archiveAt ? join(dir, layout.archiveAt) : join(dir, 'adr-archive'),
      { recursive: true })
    for (const [rel, body] of Object.entries(layout.files ?? {})) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    return dir
  }
  const record = (id, status) => `# ${id}: probe\n\n**Status:** ${status}\n\n## Decision\n\nd\n`

  // Nested rather than sibling: a recursive gate scanning the active root would
  // walk history too, which is the reason the rule exists.
  const nested = build({ name: 'nested', archiveAt: 'adr/archive',
    files: { 'adr/README.md': '# active\n', 'adr/ADR-001-a.md': record('ADR-001', 'Accepted') } })
  const overlap = run('adr-retire-check',
    ['--adopt', join(nested, 'adr'), join(nested, 'adr', 'archive')], nested)
  assert.match(`${overlap.stdout}${overlap.stderr}`, /overlap|recursive/i,
    `nested roots must be reported: ${overlap.stdout}`)

  // Siblings, but the active corpus has no catalog at all.
  const noReadme = build({ name: 'no-readme',
    files: { 'adr/ADR-001-a.md': record('ADR-001', 'Accepted') } })
  const missing = run('adr-retire-check',
    ['--adopt', join(noReadme, 'adr'), join(noReadme, 'adr-archive')], noReadme)
  assert.match(`${missing.stdout}${missing.stderr}`, /needs README\.md/i,
    `an active corpus with no catalog must be reported: ${missing.stdout}`)

  // A catalog whose links do not resolve, and a record present in BOTH trees.
  const broken = build({ name: 'broken',
    files: {
      'adr/README.md': '# active\n\n- [ADR-001](ADR-001-gone.md)\n',
      'adr/ADR-001-a.md': record('ADR-001', 'Accepted'),
      'adr-archive/ADR-001-a.md': record('ADR-001', 'Accepted'),
    } })
  const said = run('adr-retire-check',
    ['--adopt', join(broken, 'adr'), join(broken, 'adr-archive')], broken)
  const out = `${said.stdout}${said.stderr}`
  assert.match(out, /broken link/i, `an unresolvable catalog link must be reported: ${out}`)
  assert.match(out, /exists 2 times/i, `a record in both trees must be reported: ${out}`)

  // A legacy record whose Status is a word this reader cannot classify.
  const legacy = build({ name: 'legacy',
    files: {
      'adr/README.md': '# active\n',
      'adr-archive/ADR-009-a.md': record('ADR-009', 'Mostly Fine'),
    } })
  const cls = run('adr-retire-check',
    ['--adopt', join(legacy, 'adr'), join(legacy, 'adr-archive')], legacy)
  assert.match(`${cls.stdout}${cls.stderr}`, /cannot classify/i,
    `an unclassifiable legacy status must be reported: ${cls.stdout}`)

  // BACKLOG §87. `scripts/unasserted.mjs` neuters each finding in turn and re-runs
  // the suite; 11 of 33 in this gate SURVIVED, meaning nothing required them. Three
  // of those are here, and they are the ones the cases above happen not to reach.

  // NON-SIBLING, and not overlapping — the case between the two rules above. The
  // overlap case is covered; roots in unrelated parents were not, so the `elif`
  // was reachable and unasserted.
  const apart = build({ name: 'apart', archiveAt: 'far/adr-archive',
    files: { 'adr/README.md': '# active\n', 'adr/ADR-001-a.md': record('ADR-001', 'Accepted') } })
  const sib = run('adr-retire-check',
    ['--adopt', join(apart, 'adr'), join(apart, 'far', 'adr-archive')], apart)
  assert.match(`${sib.stdout}${sib.stderr}`, /sibling directories/i,
    `roots in unrelated parents must be reported: ${sib.stdout}`)

  // An ACCEPTED record in the archive that the active catalog does not link. The
  // covered case links a record that does not exist; this is the inverse — the
  // record exists and the link is absent, which is how a governing decision goes
  // missing from the catalog that is supposed to carry it.
  const unlinked = build({ name: 'unlinked',
    files: {
      'adr/README.md': '# active\n\n- nothing links ADR-001\n',
      'adr-archive/ADR-001-a.md': record('ADR-001', 'Accepted'),
    } })
  const nolink = run('adr-retire-check',
    ['--adopt', join(unlinked, 'adr'), join(unlinked, 'adr-archive')], unlinked)
  assert.match(`${nolink.stdout}${nolink.stderr}`, /no exact active-catalog link/i,
    `an accepted archived record with no catalog link must be reported: ${nolink.stdout}`)

  // An archived obligation with fewer receipts than the archive claims. This is
  // the rule that stops a retirement from dropping work on the floor, and it
  // asserted nothing.
  const owed = build({ name: 'owed',
    files: {
      'adr/README.md': '# active\n\n- [ADR-001](../adr-archive/ADR-001-a.md)\n',
      'adr/BACKLOG.md': '# Backlog\n\n## Follow-ups\n\n- nothing cites the archived record\n',
      'adr-archive/ADR-001-a.md': `${record('ADR-001', 'Accepted')}\n## Follow-ups\n\n`
        + '- [ ] an obligation this retirement still owes\n',
    } })
  const debt = run('adr-retire-check',
    ['--adopt', join(owed, 'adr'), join(owed, 'adr-archive')], owed)
  assert.match(`${debt.stdout}${debt.stderr}`, /archived obligation|BACKLOG receipt/i,
    `an archived obligation with no active receipt must be reported: ${debt.stdout}`)

  // The must-fail direction: a clean adopting tree draws none of these, or every
  // assertion above is satisfied by a gate that reports unconditionally.
  const clean = build({ name: 'clean',
    files: { 'adr/README.md': '# active\n', 'adr/ADR-001-a.md': record('ADR-001', 'Accepted') } })
  const ok = run('adr-retire-check',
    ['--adopt', join(clean, 'adr'), join(clean, 'adr-archive')], clean)
  const okOut = `${ok.stdout}${ok.stderr}`
  // Excluding five message patterns is not the same as succeeding: an unrelated
  // non-zero exit satisfies every doesNotMatch below.
  assert.equal(ok.status, 0, `a clean adopting tree must pass: ${okOut}`)
  for (const p of [/overlap|recursive/i, /needs README\.md/i, /broken link/i,
    /exists \d+ times/i, /cannot classify/i]) {
    assert.doesNotMatch(okOut, p, `a clean adopting tree must be quiet: ${okOut}`)
  }
})
