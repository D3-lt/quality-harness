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
import { fileURLToPath } from 'node:url'

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
  assert.match(brokenAdr.stdout, /BROKEN \[adr\]/)

  // `deferred:` with nothing after it — the shape of debt recorded by someone
  // who had not decided where it goes.
  adr('## Out of Scope\n\n- Rate limiting (deferred: )\n')
  const empty = scan()
  assert.equal(empty.status, 1, empty.stdout)
  assert.match(empty.stdout, /BROKEN \[empty\]/)

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
  const result = spawnSync(shim, ['ADR-001-selftest.md', 'tasks'],
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
  for (const rule of ['E1', 'E2', 'E3', 'C1', 'C2', 'C3']) {
    assert.match(rubric.stdout, new RegExp(`\\b${rule}\\b`), `the rubric must name ${rule}`)
  }

  // A broken invocation is not a verdict about a record.
  assert.equal(run('adr-judge', ['--not-a-flag']).status, 2)
  assert.equal(run('adr-judge', []).status, 2)
  assert.equal(run('adr-judge', [join(dir, 'absent.md')]).status, 2)
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
    const told = spawnSync('python3', [join(bin, 'qh-root')],
      { encoding: 'utf8', timeout: 60_000, env: { ...env, CLAUDE_PLUGIN_ROOT: root } })
    assert.equal(told.status, 0, told.stderr)
    assert.equal(told.stdout.trim(), root,
      'a caller who names a root already knows the answer; do not go looking past it')

    // A named root that holds no gates is not an answer either, so the search runs.
    const bogus = spawnSync('python3', [join(bin, 'qh-root')],
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
    const picked = spawnSync('python3', [join(bin, 'qh-root')],
      { encoding: 'utf8', timeout: 60_000, env: home })
    assert.equal(picked.status, 0, picked.stderr)
    assert.equal(basename(picked.stdout.trim()), '2.15.0',
      `qh-root picked ${picked.stdout.trim()} — 2.0.10 over 2.0.4 and 2.15.0 over 2.9.0 are the cases`)
    // 9.9.9 is the newest by number and holds no gates, so it is not a candidate:
    // an unpacked directory without bin/ is not something to send a caller to.
    assert.notEqual(basename(picked.stdout.trim()), '9.9.9')

    // Nothing installed and nothing in the environment: say so, do not guess.
    const bare = mkdtempSync(join(os.tmpdir(), 'qh-root-bare-'))
    const nowhere = spawnSync('python3', [join(bin, 'qh-root')],
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
