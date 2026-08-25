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
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(testDir, '..')
const bin = join(root, 'bin')
const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` }
const GATE_NAMES = new Set(readdirSync(bin))

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

  const cases = [
    ['date not YYYY-MM-DD', t => t.replace('date: 2026-08-25', 'date: 25 Aug 2026'), /date missing or not YYYY-MM-DD/],
    ['category off the enum', t => t.replace('category: logic-error', 'category: vibes'), /category missing or not one of/],
    ['severity off the enum', t => t.replace('severity: medium', 'severity: quite bad'), /severity missing or not one of/],
    ['files_changed empty', t => t.replace('files_changed:\n  - bin/adr-lint', 'files_changed:'), /files_changed missing or empty/],
    ['tags not list form', t => t.replace('tags: [gate, evidence]', 'tags: gate, evidence'), /tags missing or not/],
    ['missing section', t => t.replace('## Lesson', '## Takeaway'), /missing section ## Lesson/],
    ['empty section', t => t.replace('A check that iterates an empty list reports success.\n', ''), /section ## Lesson is empty/],
    // `### Beforehand` would still satisfy this rule — it is a substring check.
    // Not chased: the fence count is the real guard and no real document is
    // written that way. Removing the heading is the case worth asserting.
    ['no Before/After fences', t => t.replace('### Before\n', '### Old\n'), /### Before and ### After/],
    ['Root Cause unfenced', t => t.replace(
      '```python\nm = re.match(r"^\\[?(T\\d+)\\b", cells[0], re.I)\n```\n\n## Investigation',
      'The status scan was wrong.\n\n## Investigation'), /Root Cause must include the offending code/],
    ['no frontmatter at all', t => t.replace(/\A?---\ndate[\s\S]*?---\n/, ''), /no YAML frontmatter/],
  ]

  for (const [label, mutate, expected] of cases) {
    const text = mutate(POSTMORTEM)
    assert.notEqual(text, POSTMORTEM, `${label}: the mutation did not apply`)
    const result = run('postmortem-verify', [write(text)])
    assert.equal(result.status, 1, `${label} must be rejected\n${result.stdout}`)
    assert.match(result.stdout, expected, label)
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

test('the shell-hook runner fails closed on every way a gate can not report', () => {
  const payload = { hook_event_name: 'PreToolUse', tool_input: { file_path: join(root, 'README.md') } }

  // A gate that ran out of time said nothing about the artifact. Exit 2 keeps it
  // blocking; anything else would let an ungated file through as clean.
  //
  // The record has to be big enough that 100ms — the lowest budget the runner
  // accepts — cannot read it. A small file finishes inside the floor and the
  // assertion becomes a race, which is how this test flaked on its first run.
  const slow = scratch('slow-gate')
  const bigAdr = join(slow, 'ADR-999-big.md')
  writeFileSync(bigAdr, ['# ADR-999: Big', '', '## Existing Primitives Audit', '',
    '## Decision', '', '## Alternatives Considered', '', '## Consequences', '',
    ...Array.from({ length: 400_000 }, (_, i) => `- line ${i} with words to parse`), ''].join('\n'))
  const timedOut = runner('facts-gate-dispatch.sh',
    { hook_event_name: 'PreToolUse', tool_input: { file_path: bigAdr } },
    { QUALITY_HARNESS_SHELL_TIMEOUT_MS: '100' })
  assert.equal(timedOut.status, 2, timedOut.stderr)
  assert.match(timedOut.stderr, /timed out after 100ms/)

  // A script outside the allow-list is refused rather than run.
  const unsupported = runner('definitely-not-a-hook.sh', payload)
  assert.equal(unsupported.status, 2)
  assert.match(unsupported.stderr, /unsupported shell hook/)

  // No script name at all — the same refusal, with the absence named.
  const missing = spawnSync(process.execPath, [runnerPath], {
    cwd: root, env, input: '{}', encoding: 'utf8', timeout: 30_000,
  })
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /<missing>/)
})

test('a shell that aborted before judging is a failure, not a clean pass', async () => {
  // The MSYS runtime prints `*** fatal error -` and still exits 0. Measured on
  // Windows: four PostToolUse hooks died in add_item and every one was recorded
  // as clean, so ADR files were edited with the gate never having run.
  const { shellRuntimeCrashed } = await import('../scripts/run-shell-hook.mjs')

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
    cwd: root, env, encoding: 'utf8', timeout: 30_000,
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
})

// --- adr-retire-check: the row rules that guard a frozen record --------------

test('every adr-retire-check row rule has a case that makes it fire', () => {
  const dir = scratch('archive')
  const archive = join(dir, 'adr-archive')
  const source = join(root, 'tests', 'fixtures', 'ok')
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
    ['a retirement date that is not YYYY-MM-DD',
      withRow(row.replace('| 2026-08-22 |', '| last Tuesday |')), /YYYY-MM-DD|date/i],
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
  const source = join(root, 'tests', 'fixtures', 'ok')
  cpSync(source, dir, { recursive: true })
  const spec = join(dir, 'spec-selftest.md')
  const good = readFileSync(spec, 'utf8')

  // --spec passes: the bindings exist as test definitions. That is the baseline
  // --implemented builds on, and asserting it first keeps the rows below honest.
  assert.equal(run('spec-verify', ['--spec', '--repo', dir, spec], dir).status, 0)

  // A Cmd override makes the run deterministic: the point here is the gate's
  // handling of a green and a red command, not which runner a repo happens to
  // have installed.
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

  // And an @spec-tagged row is not run at all: the tag is the claim that it has
  // been implemented, so a spec still being drafted is not failed for it.
  writeFileSync(spec, bind('@spec', '`python3 -c "raise SystemExit(1)"`'))
  const untagged = run('spec-verify', ['--implemented', '--repo', dir, spec], dir)
  assert.equal(untagged.status, 0, untagged.stdout)
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
