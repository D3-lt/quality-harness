import assert from 'node:assert/strict'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const root = join(repoRoot, 'plugin')
const bin = join(root, 'bin')
const fixture = join(testDir, 'fixtures', 'ok')
// Gates run with implicit-encoding use promoted to a hard error. They decode
// arbitrary child output, so on a cp1252 Windows box a missing `encoding=` puts
// mojibake in the evidence log, or raises UnicodeDecodeError and kills the gate
// instead of letting it judge. Under these flags that class fails the test run.
const env = {
  ...process.env,
  PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
  PYTHONWARNDEFAULTENCODING: '1',
  PYTHONWARNINGS: 'error::EncodingWarning',
}

// `tests/gate-regressions.py` is the harness, not a shipped gate: it writes its
// own ASCII fixtures and decodes nothing it did not create, so its implicit
// encoding is not a portability defect and it runs without the flags.
const harnessEnv = { ...env }
delete harnessEnv.PYTHONWARNDEFAULTENCODING
delete harnessEnv.PYTHONWARNINGS

// The gates ship as `#!/usr/bin/env python3` scripts, and Windows cannot exec a
// `#!` script: a bare-name spawn through PATH dies before the gate can judge
// anything, which is BACKLOG item 6 and is why the windows CI job was red for a
// reason that told us nothing about the gates. Production does not reach them by
// bare exec either — the hooks go through Git Bash — so naming the interpreter
// here makes the windows job measure the GATE. On POSIX the PATH lookup and the
// shebang are both real and both stay under test.
// The gates are the extensionless executables; the .cmd files beside them
// are Windows shims that invoke these.
const GATE_NAMES = new Set(readdirSync(bin, { withFileTypes: true })
  .filter(e => e.isFile() && !e.name.includes('.')).map(e => e.name))

function run(command, args, cwd = fixture, input = undefined, spawnEnv = env) {
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has(command)
    ? ['python3', [join(bin, command), ...args]]
    : [command, args]
  return spawnSync(file, argv, {
    cwd,
    env: spawnEnv,
    input,
    encoding: 'utf8',
    timeout: 60_000,
  })
}

function expectExit(result, status, label) {
  assert.equal(
    result.status,
    status,
    `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
}

test('all bundled gates accept the conforming corpus', () => {
  expectExit(run('adr-lint', ['ADR-001-selftest.md', 'tasks']), 0, 'adr-lint')
  expectExit(run('spec-verify', ['--draft', 'spec-selftest.md']), 0, 'spec draft')
  expectExit(
    run('spec-verify', ['--spec', '--repo', fixture, 'spec-selftest.md']),
    0,
    'spec ready',
  )
  expectExit(run('arch-lint', ['architecture.md']), 0, 'architecture')
  expectExit(run('postmortem-verify', ['postmortem-selftest.md']), 0, 'postmortem')
  expectExit(run('adr-retire-check', ['adr-archive/README.md']), 0, 'archive')
})

test('placeholder and invalid artifacts are rejected', () => {
  expectExit(run('adr-lint', [join(root, 'templates', 'adr-template.md')]), 1, 'ADR template')
  expectExit(run('spec-verify', ['--spec', join(root, 'templates', 'spec-template.md')]), 1, 'spec template')
  expectExit(run('arch-lint', [join(root, 'templates', 'architecture-template.md')]), 1, 'architecture template')
  expectExit(run('postmortem-verify', [join(root, 'templates', 'adr-template.md')]), 1, 'non-postmortem')
  expectExit(run('adr-debt', [join(root, 'templates')]), 1, 'template debt')
})

test('adr-verify executes acceptance and writes digest-bound evidence', () => {
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-verify-'))
  const copy = join(temp, 'ok')
  cpSync(fixture, copy, { recursive: true })
  const result = run('adr-verify', ['tasks/T1-fixture.md', '--cwd', '.'], copy)
  expectExit(result, 0, 'adr-verify')
  const task = readFileSync(join(copy, 'tasks', 'T1-fixture.md'), 'utf8')
  assert.match(task, /exit 0 .* acceptance-sha256:[0-9a-f]{64}/)
})


test('adr-verify says before the run what a failure on an already-verified task will read as', () => {
  // docs/BACKLOG.md §174, reported 2026-09-08: "re-run adr-verify" is the migration
  // adr-lint names for pre-digest evidence, and on a done task whose fence dialled
  // an address only reachable outside its container, the migration appended a
  // FAILED run to a finished task. The log stays append-only; the notice is what
  // was missing, and it has to come BEFORE the run.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-prior-'))
  const copy = join(temp, 'ok')
  cpSync(fixture, copy, { recursive: true })
  const taskPath = join(copy, 'tasks', 'T1-fixture.md')
  const first = run('adr-verify', ['tasks/T1-fixture.md', '--cwd', '.'], copy)
  expectExit(first, 0, 'first run')
  assert.doesNotMatch(first.stdout, /already carries/, 'a task with no evidence gets no notice')
  const second = run('adr-verify', ['tasks/T1-fixture.md', '--cwd', '.'], copy)
  // The fixture's fence runs adr-lint over a task that now carries evidence and no
  // Mutation Log, so this second run FAILS — exactly the shape the report came in
  // with. The notice came first, and the failure was recorded anyway: a statement,
  // never a refusal, and the log stays append-only.
  assert.match(second.stdout, /already carries 1 exit-0 entry\. This run is appended whatever it exits/)
  assert.match(second.stdout, /fix the fence FIRST/)
  const rows = readFileSync(taskPath, 'utf8').match(/^- \d{4}-\d{2}-\d{2} · .* · exit \d+ · /gm) ?? []
  assert.equal(rows.length, 2, 'both runs are in the log')
  assert.ok(second.stdout.indexOf('already carries') < second.stdout.indexOf('WROTE this entry'),
    'the notice precedes the run, or it cannot change what the author does')
  rmSync(temp, { recursive: true, force: true })
})
test('the retirement seal survives a checkout that rewrote line endings', () => {
  // Reproduces, on this platform, what windows-latest reported on 2026-08-25:
  // git translates line endings on checkout, so an archive sealed here came back
  // with CRLF there and adr-retire-check accused an untouched decision unit of
  // tampering. A line ending is not a decision; anything else still is.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-seal-'))
  const copy = join(temp, 'ok')
  cpSync(fixture, copy, { recursive: true })
  const archive = join(copy, 'adr-archive')

  const asCrlf = text => text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
  for (const name of readdirSync(archive)) {
    const path = join(archive, name)
    writeFileSync(path, asCrlf(readFileSync(path, 'utf8')))
  }
  expectExit(
    run('adr-retire-check', ['adr-archive/README.md'], copy),
    0,
    'a CRLF checkout is not tampering',
  )

  // Negative control: the seal must still catch a change that is not a line
  // ending, or the fix above would have bought portability with blindness.
  const history = join(archive, 'ADR-001-history.md')
  writeFileSync(history, `${readFileSync(history, 'utf8')}\r\ntampered\r\n`)
  expectExit(
    run('adr-retire-check', ['adr-archive/README.md'], copy),
    1,
    'edited content must still break the seal',
  )
  rmSync(temp, { recursive: true, force: true })
})

test('a form finding is reported to the reader without failing the record', () => {
  // Advice nobody sees is the same as suppressing the finding, so the channel is
  // asserted at the CLI, not only in-process: exit 0, and the words on stdout.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-advice-'))
  const adr = join(temp, 'ADR-001-probe.md')
  const complete = [
    '# ADR-001: Probe', '',
    '**Status:** Accepted',
    '**Spec:** None — no spec stage',
    '**Served-path change:** None — this decision changes no served path.', '',
    '## Existing Primitives Audit', '', 'Nothing existing covers it.', '',
    '## Decision', '', 'Do the thing.', '',
    '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
    '## Consequences', '', 'The thing is done.', '',
    '## Wiring & Contract Changes', '', 'None.', '',
    '## Out of Scope', '', '- The other thing (deferred: ADR-002)', '',
  ].join('\n')

  writeFileSync(adr, complete)
  expectExit(run('adr-lint', [adr], temp), 0, 'a complete record passes clean')

  // Drop the header. The record still says what it decided, so this advises.
  writeFileSync(adr, complete.replace('**Status:** Accepted\n', ''))
  const advised = run('adr-lint', [adr], temp)
  expectExit(advised, 0, 'a form finding must not fail the record')
  assert.match(advised.stdout, /^\s+advice: .*Status/m, advised.stdout)
  assert.match(advised.stdout, /^\[PASS\]/m)

  // Empty the section instead. That is content, and it still fails.
  writeFileSync(adr, complete.replace('- Doing nothing — rejected, the bug persists.\n', ''))
  const failed = run('adr-lint', [adr], temp)
  expectExit(failed, 1, 'an empty required section is not a form problem')
  assert.match(failed.stdout, /Alternatives Considered/)
  rmSync(temp, { recursive: true, force: true })
})

test('an inline task claiming done is told nothing can prove it', () => {
  // The skill used to recommend this shape for small work: "≤3 tasks: inline
  // numbered list inside the ADR. No `tasks/` directory." That routed small work
  // into the one place the anti-fabrication guarantee does not apply — adr-verify
  // appends its Verification Log to a TASK FILE, and with no tasks directory
  // adr-lint runs ADR-level checks only. Reported from a live session on
  // 2026-08-26 whose author kept the task files anyway and wrote down why.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-inline-'))
  const adr = join(temp, 'ADR-001-inline.md')
  const base = [
    '# ADR-001: Inline', '',
    '**Status:** Accepted',
    '**Spec:** None — no spec stage',
    '**Served-path change:** None — this decision changes no served path.', '',
    '## Existing Primitives Audit', '', 'Nothing existing covers it.', '',
    '## Decision', '', 'Do the thing.', '',
    '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
    '## Consequences', '', 'The thing is done.', '',
    '## Wiring & Contract Changes', '', 'None.', '',
    '## Out of Scope', '', '- The other thing (deferred: ADR-002)', '',
  ]

  writeFileSync(adr, [...base, '## Tasks', '', '1. T1 — rewrite the guard. **Status:** done', ''].join('\n'))
  const claimed = run('adr-lint', [adr], temp)
  // Advice, not a failure: the record is not lying about anything this gate can
  // see, and refusing an ADR for its layout is what teaches people to stop
  // running the gate. But saying nothing is how the hole stayed open.
  expectExit(claimed, 0, 'layout is not a lie')
  assert.match(claimed.stdout, /^\s+advice: .*inline task\(s\) marked done/m, claimed.stdout)
  assert.match(claimed.stdout, /nowhere to write/)

  // An ADR with no such claim is left alone — the advice must not fire on layout
  // alone, or it becomes noise on every ADR without a tasks directory.
  writeFileSync(adr, base.join('\n'))
  const quiet = run('adr-lint', [adr], temp)
  expectExit(quiet, 0, quiet.stdout)
  assert.doesNotMatch(quiet.stdout, /inline task/)
  rmSync(temp, { recursive: true, force: true })
})

test('a Proposed record with no tasks is told its Status was not checked, and when its paths all exist', () => {
  // docs/BACKLOG.md §174, reported 2026-09-08 from an 18-record corpus: four records
  // shipped with 52 tests and sat `Proposed` for six weeks, because `[PASS] (no
  // tasks dir — ADR-level checks only)` read as approval of the status and nothing
  // anywhere read that line against what was built.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-proposed-'))
  const adr = join(temp, 'ADR-001-proposed.md')
  const record = (status, implementation) => [
    '# ADR-001: Proposed', '',
    `**Status:** ${status}`,
    '**Spec:** None — no spec stage',
    '**Served-path change:** None — this decision changes no served path.', '',
    '## Existing Primitives Audit', '', 'Nothing existing covers it.', '',
    '## Decision', '', 'Do the thing.', '',
    '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
    '## Consequences', '', 'The thing is done.', '',
    '## Wiring & Contract Changes', '', 'None.', '',
    '## Implementation', '', ...implementation, '',
    '## Out of Scope', '', '- The other thing (deferred: ADR-002)', '',
  ].join('\n')

  // Outside any repository: git cannot be asked, and the gate says so rather
  // than passing quietly (ADR-005).
  writeFileSync(adr, record('Proposed', ['- `src/gate.py` — the gate', '- `tests/test_gate.py` — its test']))
  const unasked = run('adr-lint', [adr], temp)
  expectExit(unasked, 0, unasked.stdout)
  assert.match(unasked.stdout, /no tasks dir — ADR-level checks only; its Status is not checked/)
  assert.match(unasked.stdout, /advice: .*git could not be asked .* did NOT run/)

  // In a repository where every named path exists: the observation, and the
  // admission that it concludes nothing.
  spawnSync('git', ['init', '-q'], { cwd: temp, timeout: 60_000 })
  mkdirSync(join(temp, 'src')); mkdirSync(join(temp, 'tests'))
  writeFileSync(join(temp, 'src', 'gate.py'), 'x = 1\n')
  writeFileSync(join(temp, 'tests', 'test_gate.py'), 'def test_x():\n    assert 1\n')
  const built = run('adr-lint', [adr], temp)
  expectExit(built, 0, built.stdout)
  assert.match(built.stdout, /advice: .*Every path its ## Implementation names \(2\) already exists/)
  assert.match(built.stdout, /this gate cannot tell which/)

  // ⚠ THE HEADING IS MATCHED BY PREFIX, and a GREEN mutant said this arm was
  // missing. docs/BACKLOG.md §177: a peer ran this check against the four
  // records it was written for and got ZERO hits, because `sections_of` keys on
  // the exact heading text and those records say "## Implementation Plan". An
  // advisory silent on its own target population is the silence it was built to
  // end.
  for (const heading of ['Implementation Plan', 'Implementation Notes']) {
    writeFileSync(adr, record('Proposed', ['- `src/gate.py` — the gate']).replace('## Implementation', `## ${heading}`))
    const renamed = run('adr-lint', [adr], temp)
    assert.match(renamed.stdout, /already exists/, `## ${heading} must be read as the same section`)
  }
  // The must-fail direction: a heading that merely CONTAINS the word is not it.
  writeFileSync(adr, record('Proposed', ['- `src/gate.py` — the gate']).replace('## Implementation', '## Notes on Implementation'))
  assert.doesNotMatch(run('adr-lint', [adr], temp).stdout, /already exists/)

  // The must-stay-silent arms: a path that does not exist, and an Accepted record.
  writeFileSync(adr, record('Proposed', ['- `src/gate.py` — the gate', '- `src/not_yet.py` — planned']))
  assert.doesNotMatch(run('adr-lint', [adr], temp).stdout, /already exists/)
  writeFileSync(adr, record('Accepted', ['- `src/gate.py` — the gate']))
  assert.doesNotMatch(run('adr-lint', [adr], temp).stdout, /Status is `Accepted`/)
  rmSync(temp, { recursive: true, force: true })
})

test('every gate names an encoding for child process output', () => {
  // The strict env above only catches sites the fixture run actually reaches;
  // this reaches the rest statically, so a text-mode call added on a path no
  // fixture exercises still fails here.
  const probe = [
    'import ast, pathlib, sys',
    'bad = []',
    '# The gates are the extensionless files; bin/*.cmd are Windows shims.',
    '# is_file() is not decoration: an untracked __pycache__/ left in bin by any',
    '# process that imported a gate has no suffix, and ast.parse died on it with',
    '# "Is a directory" — the probe crashed instead of reporting, which reads as a',
    '# finding while having checked nothing after it (CLAUDE.md §8).',
    'for path in sorted(pathlib.Path(sys.argv[1]).iterdir()):',
    '    if path.suffix or not path.is_file():',
    '        continue',
    '    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))',
    '    for node in ast.walk(tree):',
    '        if not isinstance(node, ast.Call):',
    '            continue',
    '        keys = {keyword.arg for keyword in node.keywords}',
    '        if keys & {"text", "universal_newlines"} and "encoding" not in keys:',
    '            bad.append(f"{path.name}:{node.lineno}")',
    'print("\\n".join(bad))',
    'raise SystemExit(1 if bad else 0)',
  ].join('\n')
  expectExit(run('python3', ['-c', probe, bin]), 0, 'text-mode subprocess without encoding=')
})

test('adr-lint recognizes async Python test bodies', () => {
  const probe = [
    'import runpy, sys',
    'module = runpy.run_path(sys.argv[1])',
    'source = "async def test_async():\\n    assert True\\n\\nvalue = 1\\n"',
    'body = module["test_body"](source, "test_async", python=True)',
    'raise SystemExit(0 if body and "assert True" in body else 1)',
  ].join('\n')
  expectExit(run('python3', ['-c', probe, join(bin, 'adr-lint')]), 0, 'async Python test body')
})

test('adr-verify resolves Git Bash on Windows, never either bash.exe decoy', () => {
  // Windows has up to three bash.exe on PATH, and a bare subprocess.run(["bash"])
  // picks C:\Windows\System32\bash.exe — a launcher into the default WSL distro.
  // Reported 2026-08-25: an Acceptance fence calling `docker` ran inside that
  // distro and failed for a reason unrelated to the code under test. The Node
  // hook layer already avoided this stub; the Python gate did not.
  const probe = [
    'import runpy, sys',
    'resolve = runpy.run_path(sys.argv[1])["resolve_bash"]',
    'GIT = "C:\\\\Users\\\\d\\\\AppData\\\\Local\\\\Programs\\\\Git\\\\bin\\\\bash.exe"',
    'STUB = "C:\\\\Windows\\\\System32\\\\bash.exe"',
    'present = {GIT, STUB}',
    'exists = lambda p: p in present',
    'path_env = {"PATH": "C:\\\\Windows\\\\System32;C:\\\\Users\\\\d\\\\AppData\\\\Local\\\\Programs\\\\Git\\\\bin"}',
    'bad = []',
    // System32 comes first on PATH and must still lose.
    'got = resolve("win32", path_env, exists)',
    'bad += [] if got == GIT else [f"PATH scan picked {got}"]',
    // An explicit configuration wins outright, without any search.
    'got = resolve("win32", {"CLAUDE_CODE_GIT_BASH_PATH": "D:\\\\g\\\\bash.exe", "PATH": "C:\\\\Windows\\\\System32"}, exists)',
    'bad += [] if got == "D:\\\\g\\\\bash.exe" else [f"configured path ignored: {got}"]',
    // Nothing on PATH but a Git install present: fall back to it, not the stub.
    'got = resolve("win32", {"PATH": "C:\\\\Windows\\\\System32", "LOCALAPPDATA": "C:\\\\Users\\\\d\\\\AppData\\\\Local"}, exists)',
    'bad += [] if got == GIT else [f"install-root fallback picked {got}"]',
    // Only the stub exists: report absence instead of running WSL.
    'got = resolve("win32", {"PATH": "C:\\\\Windows\\\\System32"}, lambda p: p == STUB)',
    'bad += [] if got is None else [f"fell back to {got}"]',
    // The SECOND decoy, and the one that actually shipped. WindowsApps holds a
    // 0-byte Store app-execution alias that os.path.isfile() accepts, so the PATH
    // scan returned it and the install-root fallback below was never reached.
    // Measured 2026-08-30 on Windows 11: the registry PATH carried no bash-bearing
    // directory except WindowsApps, so this was the answer a real user got. The
    // docstring named this stub from the first commit; only System32 was filtered.
    'ALIAS = "C:\\\\Users\\\\d\\\\AppData\\\\Local\\\\Microsoft\\\\WindowsApps\\\\bash.exe"',
    'both = {"PATH": "C:\\\\Windows\\\\System32;C:\\\\Users\\\\d\\\\AppData\\\\Local\\\\Microsoft\\\\WindowsApps", "LOCALAPPDATA": "C:\\\\Users\\\\d\\\\AppData\\\\Local"}',
    // Both decoys on PATH, real Git Bash reachable only through the fallback.
    'got = resolve("win32", both, lambda p: p in {GIT, STUB, ALIAS})',
    'bad += [] if got == GIT else [f"PATH scan picked the Store alias: {got}"]',
    // And with no Git installed, absence — never the alias.
    'got = resolve("win32", both, lambda p: p in {STUB, ALIAS})',
    'bad += [] if got is None else [f"fell back to a decoy: {got}"]',
    // The fixture has to be able to FAIL: prove the alias is otherwise findable,
    // so the two assertions above are about the filter and not about a typo.
    'got = resolve("win32", {"PATH": "C:\\\\Users\\\\d\\\\AppData\\\\Local\\\\Microsoft\\\\WindowsAppsX"}, lambda p: p.endswith("WindowsAppsX" + chr(92) + "bash.exe"))',
    'bad += [] if got is not None else ["a directory merely NAMED like the alias dir was skipped too"]',
    // POSIX is untouched.
    'got = resolve("darwin", {}, exists)',
    'bad += [] if got == "bash" else [f"posix returned {got}"]',
    'print("failures:", bad)',
    'raise SystemExit(1 if bad else 0)',
  ].join('\n')
  expectExit(run('python3', ['-c', probe, join(bin, 'adr-verify')]), 0, 'Windows bash resolution')
})

test('a rooted path is rooted on every platform, not re-rooted onto the cwd drive', () => {
  // Path("/etc/passwd").is_absolute() is False on Windows: a rooted, driveless
  // path is drive-RELATIVE there, so pathlib is right and the three callers were
  // not. They joined it to cwd and re-rooted it onto whichever drive the run was
  // on. Measured 2026-08-30 from Y:\Projects on Windows 11: /etc/passwd became
  // Y:\etc\passwd, so the same input behaved differently by drive letter and the
  // "file not found" named a path nobody typed.
  //
  // os.path.isabs is NOT the fix: it agrees with pathlib on 3.14 and disagrees on
  // 3.10 (ntpath.isabs changed in 3.13), so the answer would depend on which
  // interpreter the shebang found — and the reporting box had both installed.
  // The predicate tests the property directly, which is why it is assertable here.
  const probe = gate => [
    'import runpy, sys',
    `looks = runpy.run_path(sys.argv[1])["looks_absolute"]`,
    'B = chr(92)',
    'bad = []',
    // Rooted, either separator, with or without a drive.
    'for p in ["/etc/passwd", B + "Windows" + B + "System32", "C:" + B + "x", "C:/x", "Y:/Projects/x", "y:" + B + "p"]:',
    '    bad += [] if looks(p) else [f"treated as relative: {p!r}"]',
    // Relative, both spellings — or the predicate is just returning True.
    'for p in ["docs/adr/x.md", "docs" + B + "adr" + B + "x.md", ".." + B + "dir" + B + "file", "../dir/file", "x.md"]:',
    '    bad += [] if not looks(p) else [f"treated as rooted: {p!r}"]',
    // A Path, not just a str: the callers pass both.
    'from pathlib import PurePosixPath',
    'bad += [] if looks(PurePosixPath("/etc/passwd")) else ["a Path argument was not handled"]',
    'print("failures:", bad)',
    'raise SystemExit(1 if bad else 0)',
  ].join('\n')
  // Both gates carry the predicate; they are standalone scripts and share no
  // module, the same way resolve_bash is duplicated across Python and Node.
  for (const gate of ['adr-verify', 'adr-lint']) {
    expectExit(run('python3', ['-c', probe(gate), join(bin, gate)]), 0, `${gate} rooted-path predicate`)
  }
})

test('adr-verify names an environment failure without excusing it', () => {
  // A fence that cannot reach its tools exits non-zero exactly like a fence whose
  // code is wrong. Reported 2026-08-25: four tasks read as failing implementations
  // when Docker Desktop's WSL integration was off. The label must appear AND the
  // failure must survive — an excuse that turned red into green would ship bugs.
  const probe = [
    'import runpy, sys',
    'diagnose = runpy.run_path(sys.argv[1])["environment_failure"]',
    'bad = []',
    'wsl = "The command \'docker\' could not be found in this WSL 2 distro."',
    'bad += [] if diagnose(wsl, "docker compose up") else ["WSL stub unlabelled"]',
    'daemon = "Cannot connect to the Docker daemon at unix:///var/run/docker.sock"',
    'bad += [] if diagnose(daemon, "docker ps") else ["dead daemon unlabelled"]',
    // The missing tool must be the fence's own first word.
    'bad += [] if diagnose("pytest: command not found", "pytest -q") else ["missing tool unlabelled"]',
    'bad += [] if diagnose("helper.sh: line 3: jq: command not found", "pytest -q") is None else ["labelled a failure deep inside the script"]',
    // A real test failure must never be excused.
    'bad += [] if diagnose("FAILED tests/test_queue.py::test_enqueue - assert 0 == 1", "pytest -q") is None else ["excused a real failure"]',
    'bad += [] if diagnose("AssertionError: expected 3, got 4", "pytest -q") is None else ["excused an assertion"]',
    'print("failures:", bad)',
    'raise SystemExit(1 if bad else 0)',
  ].join('\n')
  expectExit(run('python3', ['-c', probe, join(bin, 'adr-verify')]), 0, 'environment diagnosis')
})

test('code_only keeps Python code between docstrings that mention backticks', () => {
  // This failure mode was silent. Python has no backtick literal, so applying
  // the JavaScript template-literal rule to a .py file paired backticks across
  // docstring boundaries and deleted everything between them, `def` lines
  // included; the existence and can-fail checks then reported correct tests as
  // missing. Nothing went red, which is why the class needs its own probe.
  const probe = [
    'import runpy, sys',
    'module = runpy.run_path(sys.argv[1])',
    'code_only = module["code_only"]',
    'stripped = code_only(sys.stdin.read(), python=True)',
    'missing = [kept for kept in ("assert alpha() == 1", "def test_beta", "assert beta() == 2")',
    '           if kept not in stripped]',
    'javascript = "assert(`literal` === 1)"',
    'stripped_js = code_only(javascript)',
    'if "literal" in stripped_js or "assert(" not in stripped_js:',
    '    missing.append("JavaScript template literal survived: " + stripped_js)',
    'print("missing:", missing)',
    'raise SystemExit(1 if missing else 0)',
  ].join('\n')
  // One backtick in each docstring, and both docstrings span lines: the
  // single-line string rules cannot reach across a newline, so the backticks
  // survive to the template-literal rule, which pairs them and swallows the
  // assertion, the blank lines and the second `def`.
  const source = [
    'def test_alpha():',
    '    """Rejects a bare ` backtick.',
    '',
    '    Second paragraph.',
    '    """',
    '    assert alpha() == 1',
    '',
    '',
    'def test_beta():',
    '    """Also mentions ` here.',
    '',
    '    Second paragraph.',
    '    """',
    '    assert beta() == 2',
    '',
  ].join('\n')
  expectExit(
    run('python3', ['-c', probe, join(bin, 'adr-lint')], fixture, source),
    0,
    'Python docstring backticks',
  )
})

test('the plugin-local facts hook accepts valid facts and blocks invalid facts', () => {
  const hook = join(root, 'scripts', 'run-shell-hook.mjs')
  const valid = JSON.stringify({ tool_input: { file_path: join(fixture, 'spec-selftest.md') } })
  expectExit(run(process.execPath, [hook, 'facts-gate-dispatch.sh'], fixture, valid), 0, 'valid hook input')

  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-hook-'))
  const invalid = join(temp, 'broken.md')
  writeFileSync(invalid, '# Broken spec\n\n## Facts\n\n## Grill Log\n')
  const payload = JSON.stringify({ tool_input: { file_path: invalid } })
  expectExit(run(process.execPath, [hook, 'facts-gate-dispatch.sh'], temp, payload), 0, 'invalid hook input')
})

test('a legacy record is not routed as a task and told its own ADR is missing', () => {
  // docs/BACKLOG.md §185, reported 2026-09-08 from a 77-record corpus where this
  // produced 34 false failures in ONE commit — every record predating the
  // `## Existing Primitives Audit` section. `is_adr` requires that section, so
  // those fell through to the task branch, whose title match accepted
  // `# ADR-001: …` and DISCARDED the `Task ` it had just parsed. The owner search
  // then looked in the corpus directory's PARENT and never in the corpus itself,
  // so the answer was always "found 0" — reported as the task's ADR being
  // missing, while the record IS the ADR.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-legacy-adr-'))
  const adrDir = join(temp, 'docs', 'adr')
  mkdirSync(join(adrDir, 'ADR-001-x', 'tasks'), { recursive: true })
  const body = ['**Status:** Accepted', '', '## Decision', '', 'Do it.', '',
    '## Alternatives Considered', '', '- Nothing.', '',
    '## Consequences', '', 'Done.', ''].join('\n')
  // A record from before that section existed, named without the ADR- prefix.
  writeFileSync(join(adrDir, '001-legacy.md'), `# ADR-001: Tool result type contract\n\n${body}`)
  writeFileSync(join(adrDir, 'ADR-001-x', 'tasks', 'T1-a.md'), '# Task ADR-001-T1: do it\n\n**Depends-on:** none\n')
  // ...and a task titled without the word Task, outside a tasks/ directory: the
  // `-T<n>` in its id is what still makes it a task.
  writeFileSync(join(adrDir, 'loose-task.md'), '# ADR-001-T1: a task named tersely\n\n**Depends-on:** none\n')
  spawnSync('git', ['init', '-q', '.'], { cwd: temp, timeout: 60_000 })

  const owns = file => {
    const r = run('bash', [join(root, 'scripts', 'facts-gate-dispatch.sh'), join(adrDir, file)], temp,
      undefined, { ...env, CLAUDE_PROJECT_DIR: temp })
    return /ADR ownership/.test(`${r.stdout}${r.stderr}`)
  }
  assert.equal(owns('001-legacy.md'), false, 'a record must not be asked which ADR owns it')
  // The must-fail arms: a real task is still checked, or the fix would be
  // "never check ownership" and the gate dead rather than correct.
  assert.equal(owns(join('ADR-001-x', 'tasks', 'T1-a.md')), true, 'a task under tasks/ is still checked')
  assert.equal(owns('loose-task.md'), true, 'a task id carrying -T<n> is still checked')
  rmSync(temp, { recursive: true, force: true })
})

test('a corpus that does not prefix its records with ADR- is still seen, and still spoken to', () => {
  // docs/BACKLOG.md §190, reported 2026-09-09 from a 41-record corpus. Two
  // findings, and the first is a REGRESSION this project shipped in v2.96.0.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-unprefixed-'))
  const adrDir = join(temp, 'docs', 'adr')
  mkdirSync(adrDir, { recursive: true })
  const record = (id, xref) => ['# ADR-' + id + ': probe', '',
    '**Status:** Accepted', '**Cross-references:** ' + xref,
    '**Served-path change:** None — this decision changes no served path.', '',
    '## Decision', '', 'Do it.', '',
    '## Alternatives Considered', '', '- Nothing.', '',
    '## Consequences', '', 'Done.', ''].join('\n')
  writeFileSync(join(adrDir, '001-first.md'), record('001', '`ADR-002`'))
  writeFileSync(join(adrDir, '002-second.md'), record('002', 'none'))
  // ⚠ THE §66 GUARD, carried into this enumeration rather than reinvented: a
  // date-named file's YEAR must not be read as a record number, or widening the
  // glob trades one corpus's false absence for another's false record.
  writeFileSync(join(adrDir, '2026-07-12-router.md'), '# 2026-07-12 router notes\n\nprose\n')
  spawnSync('git', ['init', '-q', '.'], { cwd: temp, timeout: 60_000 })

  // 1. The commit boundary must not be SILENT on a record that fails adr-lint.
  //    §185 stopped these being misrouted to the task branch and nothing claimed
  //    them instead, which traded a false failure for none — the worse direction.
  const dispatched = run('bash', [join(root, 'scripts', 'facts-gate-dispatch.sh'), join(adrDir, '001-first.md')],
    temp, undefined, { ...env, CLAUDE_PROJECT_DIR: temp })
  assert.match(`${dispatched.stdout}${dispatched.stderr}`, /adr-lint/,
    'a record the linter would fail must not pass the boundary unremarked')

  // 2. A cross-reference to a neighbour in the same directory resolves. The
  //    enumeration globbed `ADR-*.md`, so such a corpus enumerated NOTHING and
  //    every citation read as an absence.
  const linted = run('adr-lint', [join(adrDir, '001-first.md')], temp)
  assert.doesNotMatch(linted.stdout, /not a record in this corpus/)

  // The must-fail arms. Without them the fix could be "resolve everything".
  writeFileSync(join(adrDir, '001-first.md'), record('001', '`ADR-404`'))
  assert.match(run('adr-lint', [join(adrDir, '001-first.md')], temp).stdout,
    /cites `ADR-404`, which is not a record in this corpus/, 'a genuinely absent record is still named')
  // ...and the §66 guard has to be ASSERTED, not merely fixtured: a GREEN mutant
  // said so. The date-named file above only proves the guard when something
  // depends on it, so cite the YEAR as a record — without the guard the date file
  // enumerates as ADR-2026 and this citation silently resolves.
  writeFileSync(join(adrDir, '001-first.md'), record('001', '`ADR-2026`'))
  assert.match(run('adr-lint', [join(adrDir, '001-first.md')], temp).stdout,
    /cites `ADR-2026`, which is not a record in this corpus/,
    "a date-named file's year must not become a record number")
  // ...and EVERY separator a date is written with, not only the hyphen. Found by
  // listing awkward filenames against the pattern rather than by reading it:
  // `2026_07_12-x.md` walked past the borrowed guard and enumerated as ADR-2026,
  // which is §66 returning in a spelling nobody had checked (BACKLOG §191).
  for (const dated of ['2026_07_12-router.md', '2026.07.12-router.md']) {
    writeFileSync(join(adrDir, dated), '# ' + dated + '\n\nprose\n')
    writeFileSync(join(adrDir, '001-first.md'), record('001', '`ADR-2026`'))
    assert.match(run('adr-lint', [join(adrDir, '001-first.md')], temp).stdout,
      /cites `ADR-2026`, which is not a record in this corpus/, dated)
    rmSync(join(adrDir, dated))
  }
  rmSync(temp, { recursive: true, force: true })
})

test('a cited tracker id or section number is not reported as a missing file', () => {
  // docs/BACKLOG.md §191, triaged by the reporting corpus across all 21 findings
  // this branch produced there: 13 false. `_looks_like_a_path` claimed anything
  // with a slash OR a dot-suffix, so tracker ids and attribute references were
  // reported as files that do not exist, and a real file cited with a `:line`
  // suffix was reported missing because the suffix was matched as part of its name.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-xref-'))
  const adrDir = join(temp, 'docs', 'adr')
  mkdirSync(adrDir, { recursive: true })
  const cite = xref => ['# ADR-001: probe', '', '**Status:** Accepted',
    '**Cross-references:** ' + xref,
    '**Served-path change:** None — this decision changes no served path.', '',
    '## Decision', '', 'Do it.', '', '## Alternatives Considered', '', '- Nothing.', '',
    '## Consequences', '', 'Done.', ''].join('\n')
  writeFileSync(join(adrDir, 'ADR-001-probe.md'), cite('none'))
  spawnSync('git', ['init', '-q', '.'], { cwd: temp, timeout: 60_000 })
  spawnSync('git', ['add', '-A'], { cwd: temp, timeout: 60_000 })
  const flagged = xref => {
    writeFileSync(join(adrDir, 'ADR-001-probe.md'), cite(xref))
    spawnSync('git', ['add', '-A'], { cwd: temp, timeout: 60_000 })
    return /no tracked file matches/.test(run('adr-lint', [join(adrDir, 'ADR-001-probe.md')], temp).stdout)
  }
  // The false ones, by the class the reporter counted them in.
  assert.equal(flagged('`ops/NCR-04`'), false, 'a tracker id is not a file')
  assert.equal(flagged('`obs/OBS-1`'), false, 'a tracker id is not a file')
  assert.equal(flagged('`PageAnalyser.llm_calls`'), false, 'an attribute reference is not a file')
  assert.equal(flagged('`§6.1`'), false, 'a section number is not a file')
  // A REAL file cited with a line suffix resolves to the file.
  assert.equal(flagged('`docs/adr/ADR-001-probe.md:137`'), false, 'the :line suffix is not part of the name')
  // ⚠ THE MUST-FAIL ARMS. Without these the fix could be "claim nothing", which
  // satisfies every assertion above — and this branch found two real stale paths
  // in the reporting corpus, so its true positives are the point of keeping it.
  assert.equal(flagged('`.tmp/scratch-notes.md`'), true, 'an untracked file is still reported')
  assert.equal(flagged('`docs/adr/ADR-404-gone.md:12`'), true, 'a stale path with a line suffix is still reported')
  rmSync(temp, { recursive: true, force: true })
})

test('editing a template does not fail the facts gate', () => {
  // A template ships placeholders on purpose. Reported 2026-08-25: editing a
  // user-global adr-template.md failed the gate, and because the path stayed in
  // mutationPaths it then blocked every later commit in the session, in every
  // repository. Selection was the bug, not the templates.
  const hook = join(root, 'scripts', 'run-shell-hook.mjs')
  for (const name of [
    'adr-template.md', 'architecture-template.md', 'spec-template.md',
    'task-template.md', 'tasks-readme-template.md', 'adr-archive-readme-template.md',
  ]) {
    const target = join(root, 'templates', name)
    const payload = JSON.stringify({ tool_input: { file_path: target } })
    expectExit(run(process.execPath, [hook, 'facts-gate-dispatch.sh'], root, payload), 0, name)
  }

  // A template outside a templates/ directory: this is what makes the filename
  // rule load-bearing. Without it the six above still pass on their directory
  // alone, and the check reads green while covering half of what it claims.
  const loose = mkdtempSync(join(os.tmpdir(), 'quality-harness-template-'))
  const stray = join(loose, 'service-adr-template.md')
  writeFileSync(stray, [
    '# ADR-000: <decision>', '', '## Existing Primitives Audit', '- <what exists>', '',
    '## Decision', '<what is decided>', '', '## Alternatives Considered', '- <option>', '',
    '## Consequences', '- <result>', '',
  ].join('\n'))
  expectExit(
    run(process.execPath, [hook, 'facts-gate-dispatch.sh'], loose,
      JSON.stringify({ tool_input: { file_path: stray } })),
    0,
    'template outside a templates directory',
  )

  // The gates themselves stay strict when asked directly — a placeholder ADR is
  // still not a valid ADR, which is the distinction this fix preserves.
  expectExit(run('adr-lint', [join(root, 'templates', 'adr-template.md')]), 1, 'direct adr-lint')
})

test('a record beside its tasks owns them, whatever the corpus is named', () => {
  // Ownership was resolved by scanning the task's parent AND the directory above
  // it, then disambiguating on an `# ADR-<id>` title. A corpus using date-named
  // records has no such id, so the filter never engaged and every sibling record
  // counted: measured 2026-08-25, a real repository reported "found 22" for a
  // task whose owner sat right beside it. The directory above is now consulted
  // only when the record is genuinely not next to its tasks.
  const repo = mkdtempSync(join(os.tmpdir(), 'quality-harness-owner-'))
  const adrRoot = join(repo, 'docs', 'adr')
  mkdirSync(adrRoot, { recursive: true })
  cpSync(fixture, join(adrRoot, '2026-07-15-app-tier'), { recursive: true })

  const record = [
    '# Some Unrelated Decision', '', '## Existing Primitives Audit', '- x', '',
    '## Decision', 'd', '', '## Alternatives Considered', '- a', '', '## Consequences', '- c', '',
  ].join('\n')
  for (let index = 0; index < 22; index += 1) {
    writeFileSync(join(adrRoot, `2026-0${(index % 9) + 1}-${index}-thing.md`), record)
  }

  const task = join(adrRoot, '2026-07-15-app-tier', 'tasks', 'T1-fixture.md')
  const hook = join(root, 'scripts', 'run-shell-hook.mjs')
  const result = run(process.execPath, [hook, 'facts-gate-dispatch.sh'], repo,
    JSON.stringify({ tool_input: { file_path: task } }))
  assert.doesNotMatch(
    result.stderr,
    /expected exactly one owning ADR/,
    `ownership must not widen past the record beside the tasks\n${result.stderr}`,
  )
  expectExit(result, 0, 'date-named corpus beside a nested record')
})

test('the facts hook parses payloads in Node without jq or Python', () => {
  const hook = join(root, 'scripts', 'run-shell-hook.mjs')
  const dispatcher = readFileSync(join(root, 'scripts', 'facts-gate-dispatch.sh'), 'utf8')
  assert.doesNotMatch(dispatcher, /\b(?:jq|python3?|python)\b/i)
  expectExit(run(process.execPath, [hook, 'facts-gate-dispatch.sh'], fixture, '{not json'), 0, 'unreadable hook input')
})

test('the facts hook fails closed for deleted archive catalogs and directories', () => {
  const hook = join(root, 'scripts', 'run-shell-hook.mjs')
  for (const deletion of ['catalog', 'directory']) {
    const repo = mkdtempSync(join(os.tmpdir(), `quality-harness-archive-${deletion}-`))
    const archive = join(repo, 'docs', 'adr-archive')
    const catalog = join(archive, 'README.md')
    mkdirSync(archive, { recursive: true })
    writeFileSync(catalog, '# ADR Archive\n\n**Lifecycle:** Frozen historical ADR records\n')
    expectExit(run('git', ['init', '-b', 'task/test'], repo), 0, `${deletion} git init`)
    expectExit(run('git', ['add', 'docs/adr-archive/README.md'], repo), 0, `${deletion} git add`)
    expectExit(run('git', [
      '-c', 'user.name=Quality Harness',
      '-c', 'user.email=quality-harness@example.invalid',
      'commit', '-m', 'archive fixture',
    ], repo), 0, `${deletion} git commit`)

    const target = deletion === 'catalog' ? catalog : archive
    rmSync(target, { force: true, recursive: deletion === 'directory' })
    const payload = JSON.stringify({ tool_input: { file_path: target } })
    // A deleted archive catalog is still SEEN and still named — the gate advises
    // now rather than refusing, and the difference that matters is whether the
    // finding reaches anyone, not whether it stops the call.
    const gated = run(process.execPath, [hook, 'facts-gate-dispatch.sh'], repo, payload)
    expectExit(gated, 0, `deleted archive ${deletion}`)
    assert.match(gated.stderr, /adr-retire-check/, `deleted archive ${deletion}\n${gated.stderr}`)
  }
})

test('focused false-green regressions remain closed', () => {
  const result = run('python3', [
    join(testDir, 'gate-regressions.py'),
    bin,
    join(root, 'skills', 'postmortem', 'SKILL.md'),
    repoRoot,
  ], fixture, undefined, harnessEnv)
  expectExit(result, 0, 'gate regressions')
})

test('adr-lint reports Go fences whose required success is unreachable', (t) => {
  // Reported from a consumer's ADR-008 T2. The fence required a PASS marker
  // from internal/web while running only internal/billing, then rejected Go's
  // healthy status for a selected embed-only package. Each fence rewrite
  // invalidated its evidence digest, so this belongs at authoring time.
  const repo = mkdtempSync(join(os.tmpdir(), 'quality-harness-go-fence-'))
  t.after(() => rmSync(repo, { recursive: true, force: true }))
  const unit = join(repo, 'docs', 'adr', 'ADR-015-green-path')
  cpSync(fixture, unit, { recursive: true })

  const billing = join(repo, 'internal', 'billing')
  const assets = join(billing, 'assets')
  const web = join(repo, 'internal', 'web')
  mkdirSync(assets, { recursive: true })
  mkdirSync(web, { recursive: true })
  writeFileSync(join(repo, 'go.mod'), 'module example.invalid/green-path\n\ngo 1.22\n')
  writeFileSync(join(billing, 'billing.go'), 'package billing\n')
  const billingTest = join(billing, 'billing_test.go')
  const selectedDefinition = [
    'package billing', '',
    'import "testing"', '',
    'func TestBilling(t *testing.T) {}', '',
  ].join('\n')
  writeFileSync(billingTest, selectedDefinition)
  writeFileSync(join(billing, 'strings_test.go'), [
    'package billing', '',
    'import "testing"', '',
    'const commentStart = "/*"', '',
    'func TestStringDelimiters(t *testing.T) {}', '',
    'const commentEnd = "*/"', '',
    '  /* generated */ func TestCommentPrefixed(t *testing.T) {}', '',
    '// func TestLexicalOnly(t *testing.T) {}',
    '/*',
    'func TestLexicalOnly(t *testing.T) {}',
    '*/',
    'const quotedOnly = "func TestLexicalOnly(t *testing.T) {}"',
    'const rawOnly = `',
    'func TestLexicalOnly(t *testing.T) {}',
    '`', '',
  ].join('\n'))
  writeFileSync(join(assets, 'assets.go'), 'package assets\n')
  writeFileSync(join(web, 'web.go'), 'package web\n')
  writeFileSync(join(web, 'web_test.go'), [
    'package web', '',
    'import "testing"', '',
    'func TestOnlyWeb(t *testing.T) {}', '',
  ].join('\n'))
  expectExit(run('git', ['init', '-q'], repo), 0, 'Go-fence fixture git init')
  expectExit(run('git', ['add', '--all'], repo), 0, 'Go-fence fixture git add')

  const adr = join(unit, 'ADR-001-selftest.md')
  const tasks = join(unit, 'tasks')
  const task = join(tasks, 'T1-fixture.md')
  const taskSource = readFileSync(task, 'utf8')
  const acceptanceBlock = /(## Acceptance\n\n```bash\n)[\s\S]*?(\n```\n\n## Tests)/
  const lint = (commands, label) => {
    const rewritten = taskSource.replace(
      acceptanceBlock,
      (_whole, open, close) => `${open}${commands}${close}`,
    )
    assert.notEqual(rewritten, taskSource, `${label}: fixture Acceptance was not replaced`)
    writeFileSync(task, rewritten)
    const result = run('adr-lint', [adr, tasks], repo)
    expectExit(result, 0, label)
    return result.stdout
  }

  const unreachable = /advice: .*requires `PASS: Test[A-Za-z0-9_]+`/m
  const noTestFiles = /advice: .*rejects Go's healthy `\[no test files\]` status/m
  const expectNoGoAdvice = (output, label) => {
    assert.doesNotMatch(output, unreachable, `${label}:\n${output}`)
    assert.doesNotMatch(output, noTestFiles, `${label}:\n${output}`)
  }

  const dirty = lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestOnlyWeb' go-test.out &&",
    "! grep -qF '[no test files]' go-test.out",
  ].join('\n'), 'unreachable required success')
  assert.match(dirty, /advice: .*requires `PASS: TestOnlyWeb`/m, dirty)
  assert.match(dirty, /`internal\/web\/web_test\.go`/, dirty)
  assert.match(dirty, /`\.\/internal\/billing\/\.\.\.`/, dirty)
  assert.match(dirty, noTestFiles, dirty)

  for (const [option, statusPattern] of [
    ['-q', 'no test files'],
    ['-qE', '\\[no test files\\]'],
  ]) {
    const regexDirty = lint([
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      `grep ${option} 'PASS: TestOnlyWeb' go-test.out &&`,
      `! grep ${option} '${statusPattern}' go-test.out`,
    ].join('\n'), `${option} grep forms`)
    assert.match(regexDirty, unreachable, regexDirty)
    assert.match(regexDirty, noTestFiles, regexDirty)
  }

  // Adding the package that owns the required test clears only that finding;
  // the deliberately bad healthy-status exclusion remains independently red.
  const correctedScope = lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... ./internal/web/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestOnlyWeb' go-test.out &&",
    "! grep -qF '[no test files]' go-test.out",
  ].join('\n'), 'corrected package scope')
  assert.doesNotMatch(correctedScope, unreachable, correctedScope)
  assert.match(correctedScope, noTestFiles, correctedScope)

  // A direct definition under an already-selected package is the other
  // positive control. Keep the out-of-scope copy too: one selected definition
  // is enough, while the healthy-status finding remains observable.
  writeFileSync(billingTest, `${selectedDefinition}func TestOnlyWeb(t *testing.T) {}\n`)
  const selected = lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestOnlyWeb' go-test.out &&",
    "! grep -qF '[no test files]' go-test.out",
  ].join('\n'), 'selected direct definition')
  assert.doesNotMatch(selected, unreachable, selected)
  assert.match(selected, noTestFiles, selected)
  writeFileSync(billingTest, selectedDefinition)

  // A Go-aware source scan must not turn comment delimiters inside strings
  // into a block comment that erases a real definition between them.
  expectNoGoAdvice(lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestStringDelimiters' go-test.out",
  ].join('\n'), 'Go strings containing comment delimiters'),
    'Go strings containing comment delimiters')

  expectNoGoAdvice(lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestCommentPrefixed' go-test.out",
  ].join('\n'), 'comment-prefixed Go test definition'),
    'comment-prefixed Go test definition')

  const lexicalOnly = lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestLexicalOnly' go-test.out",
  ].join('\n'), 'Go comments and strings are not definitions')
  assert.match(lexicalOnly,
    /requires `PASS: TestLexicalOnly`, but source inspection found no tracked direct/,
    lexicalOnly)

  const platformProbe = [
    'import json, runpy, sys',
    "module = runpy.run_path(sys.argv[1], run_name='adr_lint_case_probe')",
    "scope = module['_go_package_scope']('./Internal/Web/...')",
    "selects = module['_go_package_selects']",
    "print(json.dumps([selects(scope, 'internal/web/web_test.go', platform) for platform in ('darwin', 'win32', 'linux')]))",
  ].join('; ')
  const platformResult = run('python3', ['-c', platformProbe, join(bin, 'adr-lint')], repo)
  expectExit(platformResult, 0, 'simulated package path case semantics')
  assert.deepEqual(JSON.parse(platformResult.stdout), [true, true, false])

  // The selected embed-only package is unchanged. Removing only the invalid
  // exclusion is enough to make this a clean, statically reachable fence.
  expectNoGoAdvice(lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestBilling' go-test.out",
  ].join('\n'), 'healthy embed-only package'), 'healthy embed-only package')

  // `no tests to run` is Go's vacuity signal for a filter that selected
  // nothing. It remains a valid exclusion and is not `[no test files]`.
  expectNoGoAdvice(lint([
    'set -o pipefail',
    'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
    "grep -qF 'PASS: TestBilling' go-test.out &&",
    "! grep -qF 'no tests to run' go-test.out",
  ].join('\n'), 'no-tests-to-run guard'), 'no-tests-to-run guard')

  for (const sink of ['.', '..', '/', 'out/']) {
    expectNoGoAdvice(lint([
      'set -o pipefail',
      `go test -v ./internal/billing/... 2>&1 | tee ${sink} &&`,
      `grep -qF 'PASS: TestOnlyWeb' ${sink}`,
    ].join('\n'), `directory sink ${sink}`), `directory sink ${sink}`)
  }

  const noVerdictControls = new Map([
    ['changed cwd', [
      'set -o pipefail',
      'cd internal &&',
      'go test -v ./billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' go-test.out",
    ].join('\n')],
    ['unrelated sink', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' other.out",
    ].join('\n')],
    ['inert exclusion', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' go-test.out &&",
      "! grep -qF '[no test files]' go-test.out || true",
    ].join('\n')],
    ['second Go command', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee billing.out &&',
      'go test -v ./internal/web/... 2>&1 | tee web.out &&',
      "grep -qF 'PASS: TestOnlyWeb' web.out",
    ].join('\n')],
    ['dynamic package', [
      'set -o pipefail',
      'go test -v "$PACKAGES" 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' go-test.out",
    ].join('\n')],
    ['dynamic sink', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee "$OUT" &&',
      "grep -qF 'PASS: TestOnlyWeb' \"$OUT\"",
    ].join('\n')],
    ['dynamic pattern', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      'grep -qF "PASS: $TEST_NAME" go-test.out',
    ].join('\n')],
    ['non-verbose output', [
      'set -o pipefail',
      'go test ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' go-test.out",
    ].join('\n')],
    ['list-only output', [
      'set -o pipefail',
      'go test -v -list TestOnlyWeb ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' go-test.out",
    ].join('\n')],
    ['uppercase healthy status', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestBilling' go-test.out &&",
      "! grep -qF '[NO TEST FILES]' go-test.out",
    ].join('\n')],
    ['BRE unescaped bracket status', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestBilling' go-test.out &&",
      "! grep -q '[no test files]' go-test.out",
    ].join('\n')],
    ['ERE unescaped bracket status', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestBilling' go-test.out &&",
      "! grep -qE '[no test files]' go-test.out",
    ].join('\n')],
    ['prefixed healthy status', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestBilling' go-test.out &&",
      "! grep -qF 'prefix [no test files]' go-test.out",
    ].join('\n')],
    ['double-space PASS marker', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS:  TestOnlyWeb' go-test.out",
    ].join('\n')],
    ['standard-stream sink', [
      'set -o pipefail',
      'go test -v ./internal/billing/... 2>&1 | tee - &&',
      "grep -qF 'PASS: TestOnlyWeb' -",
    ].join('\n')],
    ['unknown joined flag', [
      'set -o pipefail',
      'go test -v -mystery=value ./internal/billing/... 2>&1 | tee go-test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' go-test.out",
    ].join('\n')],
    ['non-Go fence', [
      'set -o pipefail',
      'python3 -m unittest 2>&1 | tee test.out &&',
      "grep -qF 'PASS: TestOnlyWeb' test.out",
    ].join('\n')],
  ])
  for (const [label, commands] of noVerdictControls) {
    expectNoGoAdvice(lint(commands, label), label)
  }
})

// A corpus with history: the fixture copied into a repo of its own, with one
// content rule broken and one evidence claim unbacked.
function agedCorpus(prefix, config) {
  const repo = mkdtempSync(join(os.tmpdir(), prefix))
  spawnSync('git', ['init', '-q', repo], { encoding: 'utf8', timeout: 60_000 })
  const adrDir = join(repo, 'docs', 'adr')
  mkdirSync(adrDir, { recursive: true })
  cpSync(join(fixture, 'ADR-001-selftest.md'), join(adrDir, 'ADR-001-old.md'))
  cpSync(join(fixture, 'tasks'), join(adrDir, 'tasks'), { recursive: true })

  // Content: a section that is present and empty considered no alternatives.
  const adr = join(adrDir, 'ADR-001-old.md')
  writeFileSync(adr, readFileSync(adr, 'utf8')
    .replace(/(## Alternatives Considered\n)[\s\S]*?(?=\n## )/, '$1\n'))
  if (config !== null) writeFileSync(join(repo, '.quality-harness.json'), config)
  return { repo, adr, tasks: join(adrDir, 'tasks') }
}

test('an evidenced task whose Affected Files git ignores is reported, with the pattern', () => {
  // docs/BACKLOG.md §65. An acceptance fence runs against the WORKTREE, so a
  // file .gitignore matches carries tool-written exit-0 evidence and still ships
  // to nobody. Reported from a Go repository whose bare `crossagentschat`
  // pattern also matched `cmd/crossagentschat/`, leaving a clean clone that did
  // not build and a credential guard in no committed file.
  //
  // THROUGH adr-lint, not against `ignored_paths`. The first version of this
  // work asserted the helper directly and the campaign caught it: both
  // mutations — removing the report and removing the could-not-run guard — came
  // back GREEN, because nothing drove the path they broke. Third instance of
  // that error in one day, and the tell each time was a catalogue entry naming
  // a test file that never exercises the change.
  const { repo, adr, tasks } = agedCorpus('quality-harness-ignored-', null)
  writeFileSync(join(repo, '.gitignore'), 'thing\n')
  mkdirSync(join(repo, 'cmd', 'thing'), { recursive: true })
  writeFileSync(join(repo, 'cmd', 'thing', 'main.go'), 'package main\n')
  writeFileSync(join(repo, 'kept.go'), 'package main\n')

  const taskFile = join(tasks, readdirSync(tasks).find(n => /^T\d/.test(n)))
  const before = readFileSync(taskFile, 'utf8')
  // The check only asks of a task carrying PASSING evidence — a path that does
  // not exist yet is the normal state of a task being written, so the question
  // is only meaningful once a fence has run against the worktree.
  const withRows = files => before.replace(
    /(## Affected Files\n)[\s\S]*?(?=\n## )/,
    `$1\n| File | Change | Why |\n|---|---|---|\n`
    + files.map(f => `| \`${f}\` | edit | w |\n`).join(''))
    .replace(/(## Verification Log\n)[\s\S]*$/,
      `$1\n- 2026-08-29 · abc1234 · exit 0 · \`true\` · acceptance-sha256:${'0'.repeat(64)}\n`)

  writeFileSync(taskFile, withRows(['cmd/thing/main.go']))
  const ignored = run('adr-lint', [adr, tasks], repo)
  assert.match(ignored.stdout, /git IGNORES it \(pattern `thing`\)/,
    `the ignored path and the pattern that matched it:\n${ignored.stdout}`)

  // The must-fail direction (CLAUDE.md §4): a TRACKED path must produce nothing,
  // or "report every Affected File" satisfies the assertion above and the
  // finding means nothing.
  writeFileSync(taskFile, withRows(['kept.go']))
  const clean = run('adr-lint', [adr, tasks], repo)
  assert.doesNotMatch(clean.stdout, /git IGNORES it/,
    `a tracked path is not a finding:\n${clean.stdout}`)

  // A HUMAN-OBSERVED ROW IS EVIDENCE HERE TOO, because this check's reasoning is
  // about the WORKTREE and a human ran the fence against the same one —
  // arguably more so, since a hand-run fence leaves no tool-written record of
  // what it touched. Reported 2026-08-29: three checks in this gate shared the
  // "has passing evidence" concept and this one drew the line differently, so
  // relabelling a task to human-observed bought exemption from one and not the
  // others (docs/BACKLOG.md §69).
  writeFileSync(taskFile, withRows(['cmd/thing/main.go'])
    .replace(/- 2026-08-29 · abc1234 · exit 0 · [^\n]*/,
      '- 2026-08-29 · human-observed · PASS — a person confirmed it'))
  const humanObserved = run('adr-lint', [adr, tasks], repo)
  assert.match(humanObserved.stdout, /git IGNORES it \(pattern `thing`\)/,
    `a human-observed row is passing evidence for this check:\n${humanObserved.stdout}`)

  // AND WHEN IT COULD NOT ASK, IT SAYS SO. Outside a repository there is no
  // answer to be had, and reporting silence would be "I could not look" wearing
  // the words of "there is nothing" (ADR-005). This case is why the probe
  // returns None rather than {}: with both spelled {} the guard had no
  // observable effect, and the campaign proved it by removing the guard and
  // killing nothing.
  const bare = agedCorpus('quality-harness-noрepo-', null)
  rmSync(join(bare.repo, '.git'), { recursive: true, force: true })
  const bareTask = join(bare.tasks, readdirSync(bare.tasks).find(n => /^T\d/.test(n)))
  writeFileSync(bareTask, withRows(['cmd/thing/main.go']))
  const unasked = run('adr-lint', [bare.adr, bare.tasks], bare.repo)
  assert.match(unasked.stdout, /could not ask git/,
    `a check that did not run must say so:\n${unasked.stdout}`)
})

test('strictFrom lets a corpus adopt these gates without failing on its own history', () => {
  // A project that adopts the gates late lights up on every record written
  // before the decision to adopt them, and a gate that fails on day one over
  // history nobody is changing is a gate people turn off. The idea is adr-kit's
  // (rvdbreemen/adr-kit, MIT); the exclusion below is ours.
  const without = agedCorpus('qh-strict-none-', null)
  const before = run('adr-lint', [without.adr, without.tasks], without.repo)
  expectExit(before, 1, 'with no config a content finding still blocks')
  assert.match(before.stdout, /Alternatives Considered has no entries/)
  assert.doesNotMatch(before.stdout, /strictFrom/,
    'a corpus that declares nothing must behave exactly as it did before this existed')

  const aged = agedCorpus('qh-strict-', '{"strictFrom":"ADR-0012"}\n')
  const demoted = run('adr-lint', [aged.adr, aged.tasks], aged.repo)
  expectExit(demoted, 0, 'a record below the cutoff reports its content findings as advice')
  assert.match(demoted.stdout, /\[strictFrom\] ADR-0001 predates strictFrom ADR-0012/)
  assert.match(demoted.stdout, /advice: .*Alternatives Considered has no entries \[advisory:/)
  // A demoted PASS and a clean PASS are different things, and the verdict says so.
  assert.match(demoted.stdout, /^\[strictFrom\]/m)

  // At or above the cutoff nothing is demoted.
  writeFileSync(join(aged.repo, '.quality-harness.json'), '{"strictFrom":"ADR-0001"}\n')
  const atCutoff = run('adr-lint', [aged.adr, aged.tasks], aged.repo)
  expectExit(atCutoff, 1, 'the cutoff record itself is checked in full')
  assert.doesNotMatch(atCutoff.stdout, /advisory: ADR-0001 predates/)
})

test('strictFrom never reaches the evidence chain', () => {
  // The whole point of this corpus is that `done` means a tool wrote an exit-0
  // entry. Demoting that on an old record would let a pre-cutoff task claim done
  // forever with nothing behind it — which is exactly the proxy SpecBench shows
  // agents learn to satisfy. Content is allowed to be imperfect in history;
  // evidence is not.
  const aged = agedCorpus('qh-strict-evidence-', '{"strictFrom":"ADR-0012"}\n')
  const readme = join(aged.tasks, 'README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8')
    .replace(/\|\s*(pending|ready|todo|blocked)\s*\|/i, '| done |'))
  for (const name of readdirSync(aged.tasks).filter(entry => /^T\d+/.test(entry))) {
    const task = join(aged.tasks, name)
    writeFileSync(task, readFileSync(task, 'utf8')
      .replace(/(## Verification Log\n)[\s\S]*?(?=\n## |$)/, '$1\n'))
  }

  const result = run('adr-lint', [aged.adr, aged.tasks], aged.repo)
  expectExit(result, 1, 'an unbacked done claim blocks whatever strictFrom says')
  assert.match(result.stdout, /marked done but its Verification Log has no exit-0 entry/)
  assert.doesNotMatch(result.stdout, /advice: .*marked done but its Verification Log/,
    'the evidence chain must never be demoted to advice')
  // The content finding beside it IS still demoted, which is what proves the
  // exclusion is selective rather than the feature being off.
  assert.match(result.stdout, /advice: .*Alternatives Considered has no entries/)
})

test('an unreadable or unusable strictFrom changes nothing, and says so', () => {
  const aged = agedCorpus('qh-strict-broken-', '{ this is not json\n')
  const broken = run('adr-lint', [aged.adr, aged.tasks], aged.repo)
  expectExit(broken, 1, 'a config this tool cannot read must not loosen anything')
  assert.match(broken.stdout, /could not be read/)
  assert.match(broken.stdout, /every record is checked in full/)

  writeFileSync(join(aged.repo, '.quality-harness.json'), '{"strictFrom":"soon"}\n')
  const nonsense = run('adr-lint', [aged.adr, aged.tasks], aged.repo)
  expectExit(nonsense, 1, 'a cutoff naming no ADR number is not a cutoff')
  assert.match(nonsense.stdout, /names no ADR number/)
})

test('adr-lint cross-checks every ordered step against an explicit proof', (t) => {
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-proof-map-'))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const copy = join(temp, 'ok')
  cpSync(fixture, copy, { recursive: true })

  const adr = join(copy, 'ADR-001-selftest.md')
  const tasks = join(copy, 'tasks')
  const task = join(tasks, 'T1-fixture.md')
  const legacyTask = readFileSync(task, 'utf8')
  const validTask = legacyTask
    .replace('**Consumes:** none\n', '**Consumes:** none\n**Proof map:** v1\n')
    .replace(
      /## Ordered Steps\n[\s\S]*?\n## Acceptance/,
      [
        '## Ordered Steps', '',
        '1. [S4] Write the failing test before changing the gate.',
        '2. [S2] Wire the strict validator through the CLI. [proof: acceptance]',
        '3. [S9] Keep the validator falsifiable. [proof: mutation]',
        '4. [S7] Inspect the final authoring guidance.',
        '   [proof: human: compare both shipped sources]',
        '', '## Acceptance',
      ].join('\n'),
    )
    .replace(
      /## Tests\n[\s\S]*?\n## Invariants/,
      [
        '## Tests', '',
        '| Test name | File | Verifies | Covers | Steps |',
        '|-----------|------|----------|--------|-------|',
        '| `adr-lint-positive` | `selftest.sh` | maps the failing test | — | S4 |',
        '| supplementary | notes | preserves an escaped \\| pipe | — | — |',
        '', '## Invariants',
      ].join('\n'),
    )

  const lint = (source, label) => {
    writeFileSync(task, source)
    const result = run('adr-lint', [adr, tasks], copy)
    assert.equal(result.signal, null, `${label}: gate was terminated\n${result.stderr}`)
    return result
  }
  const expectRejected = (source, pattern, label) => {
    const result = lint(source, label)
    expectExit(result, 1, label)
    assert.match(result.stdout, pattern, `${label}:\n${result.stdout}`)
  }

  const clean = lint(validTask, 'valid v1 proof map')
  expectExit(clean, 0, 'valid v1 proof map')
  assert.doesNotMatch(clean.stdout, /proof-map cross-check did not run/i, clean.stdout)

  // Identity is stable when order changes: moving a step must not retarget the
  // Tests row, so the IDs deliberately do not match their list ordinals.
  const moved = validTask.replace(
    '1. [S4] Write the failing test before changing the gate.\n' +
      '2. [S2] Wire the strict validator through the CLI. [proof: acceptance]',
    '1. [S2] Wire the failing test through the CLI. [proof: acceptance]\n' +
      '2. [S4] Write the gate regression before changing the gate.',
  )
  expectExit(lint(moved, 'stable IDs survive reordered steps'), 0,
    'stable IDs survive reordered steps')

  const indented = validTask.replace(/^([1-4]\. \[S)/gm, ' $1')
  expectExit(lint(indented, 'CommonMark-indented top-level steps'), 0,
    'CommonMark-indented top-level steps')

  const evenBackslashes = validTask.replace(
    'maps the failing test | — | S4 |', 'ends in \\\\| — | S4 |')
  expectExit(lint(evenBackslashes, 'even backslashes leave the pipe structural'), 0,
    'even backslashes leave the pipe structural')

  expectRejected(validTask.replace('[S2]', 'without-an-id'),
    /step 2.*\[S<n>\]/i, 'missing step identity')
  expectRejected(validTask.replace('[S2]', '[S4]'),
    /duplicate.*S4/i, 'duplicate step identity')
  expectRejected(validTask.replace('| Covers | Steps |', '| Covers |'),
    /Tests table.*Steps.*fifth/i, 'missing Steps column')
  expectRejected(validTask.replace('| Covers | Steps |', '| Steps | Covers |'),
    /Tests table.*Steps.*fifth/i, 'misplaced Steps column')
  expectRejected(validTask.replace('| Covers | Steps |', '| Covers | Steps | Extra |'),
    /Tests table.*exactly five.*Steps fifth/i, 'extra Tests column')
  expectRejected(validTask.replace(
    '|-----------|------|----------|--------|-------|',
    '|-----------|------|----------|--------|'),
  /Tests.*separator.*five/i, 'short Tests separator')
  expectRejected(validTask.replace(
    '|-----------|------|----------|--------|-------|\n', ''),
  /Tests.*separator/i, 'missing Tests separator')

  const fencedTable = validTask
    .replace('## Tests\n\n| Test name', '## Tests\n\n```markdown\n| Test name')
    .replace('| supplementary | notes | preserves an escaped \\| pipe | — | — |',
      '| supplementary | notes | preserves an escaped \\| pipe | — | — |\n```')
  expectRejected(fencedTable, /Tests table.*Steps.*fifth/i,
    'a table shown inside a fence is not the Tests table')
  expectRejected(fencedTable.replaceAll('```', '~~~'),
    /Tests table.*Steps.*fifth/i,
    'a table shown inside a tilde fence is not the Tests table')

  const indentedCodeTable = validTask
    .replace('| Test name | File | Verifies | Covers | Steps |',
      '    | Test name | File | Verifies | Covers | Steps |')
    .replace('|-----------|------|----------|--------|-------|',
      '    |-----------|------|----------|--------|-------|')
    .replace('| `adr-lint-positive` | `selftest.sh` | maps the failing test | — | S4 |',
      '    | `adr-lint-positive` | `selftest.sh` | maps the failing test | — | S4 |')
    .replace('| supplementary | notes | preserves an escaped \\| pipe | — | — |',
      '    | supplementary | notes | preserves an escaped \\| pipe | — | — |')
  expectRejected(indentedCodeTable, /Tests table.*Steps.*fifth/i,
    'a four-space indented code block is not the Tests table')

  const commentedTable = validTask
    .replace('## Tests\n\n', '## Tests\n\n<!--\n')
    .replace('| supplementary | notes | preserves an escaped \\| pipe | — | — |',
      '| supplementary | notes | preserves an escaped \\| pipe | — | — |\n-->')
  expectRejected(commentedTable, /Tests table.*Steps.*fifth/i,
    'a table inside an HTML comment is not the Tests table')

  for (const cell of ['S4-S9', 'all', 'S4, S4', 'S04']) {
    expectRejected(validTask.replace('| — | S4 |', `| — | ${cell} |`),
      /invalid Steps cell/i, `invalid Steps cell ${cell}`)
  }
  expectRejected(validTask.replace('| — | S4 |', '| — | S99 |'),
    /S99.*no Ordered Step/i, 'dangling step reference')
  expectRejected(validTask.replace('| — | S4 |', '| — | — |'),
    /S4.*not referenced/i, 'uncovered ordered step')
  expectRejected(validTask.replace(
    '[proof: human: compare both shipped sources]', '[proof: human: ]'),
  /S7.*no valid proof marker/i, 'empty human reason')
  expectRejected(validTask.replace(
    '[proof: human: compare both shipped sources]', '[proof: human:reason]'),
  /S7.*no valid proof marker/i, 'human marker without the exact space')

  expectRejected(validTask.replace('`adr-lint-positive` | `selftest.sh`',
    'adr-lint-positive | selftest.sh'),
  /Tests row .*does not retain it|S4.*not referenced/i,
  'a row ignored by the Tests reader cannot cover a step')

  const laterTable = validTask
    .replace('| — | S4 |', '| — | — |')
    .replace('\n\n## Invariants', [
      '', 'A later explanatory table is not the Tests table.', '',
      '| Test name | File | Verifies | Covers | Steps |',
      '|-----------|------|----------|--------|-------|',
      '| `late` | `late.py` | too late | — | S4 |',
      '', '## Invariants',
    ].join('\n'))
  expectRejected(laterTable, /S4.*not referenced/i,
    'a later explanatory table cannot cover a step')

  const fencedOnly = validTask
    .replace('| — | S4 |', '| — | — |')
    .replace(
      '1. [S4] Write the failing test before changing the gate.',
      '1. [S4] Write the failing test before changing the gate.\n' +
        '   ```text\n   [proof: acceptance]\n   ```',
    )
  expectRejected(fencedOnly, /S4.*no valid proof marker/i,
    'a proof-marker example inside a fence is not evidence')
  expectRejected(fencedOnly.replaceAll('```', '~~~'),
    /S4.*no valid proof marker/i,
    'a proof-marker example inside a tilde fence is not evidence')

  const indentedFenced = validTask
    .replace('| — | S4 |', '| — | — |')
    .replace(
      '1. [S4] Write the failing test before changing the gate.',
      ' 1. [S4] Write the failing test before changing the gate.\n' +
        '    ```text\n    [proof: acceptance]\n    ```',
    )
  expectRejected(indentedFenced, /S4.*no valid proof marker/i,
    'a fence is indented relative to its CommonMark list item')

  const misleadingClose = validTask
    .replace('| — | S4 |', '| — | — |')
    .replace(
      '1. [S4] Write the failing test before changing the gate.',
      '1. [S4] Write the failing test before changing the gate.\n' +
        '   ````text\n   ````still code\n   [proof: acceptance]\n' +
        '   ````also code\n   ````',
    )
  expectRejected(misleadingClose, /S4.*no valid proof marker/i,
    'a fence marker with trailing text does not close an active fence')

  const indentedCodeMarker = validTask
    .replace('| — | S4 |', '| — | — |')
    .replace(
      '1. [S4] Write the failing test before changing the gate.',
      '1. [S4] Write the failing test before changing the gate.\n' +
        '       [proof: acceptance]',
    )
  expectRejected(indentedCodeMarker, /S4.*no valid proof marker/i,
    'a marker inside an indented code block is not proof')

  const commentedMarker = validTask
    .replace('| — | S4 |', '| — | — |')
    .replace(
      '1. [S4] Write the failing test before changing the gate.',
      '1. [S4] Write the failing test before changing the gate.\n' +
        '   <!-- [proof: acceptance] -->',
    )
  expectRejected(commentedMarker, /S4.*no valid proof marker/i,
    'a marker inside an HTML comment is not proof')

  expectRejected(validTask.replace('**Proof map:** v1', '**Proof map:**'),
    /Proof map.*empty.*v1/i, 'empty proof-map version')
  expectRejected(validTask.replace('**Proof map:** v1', '**Proof map:** v2'),
    /Proof map.*v2.*v1/i, 'unknown proof-map version')

  const commentedHeader = validTask.replace(
    '**Proof map:** v1', '<!--\n**Proof map:** v1\n-->',
  )
  const commentedLegacy = lint(commentedHeader, 'a commented header is absent')
  expectExit(commentedLegacy, 0, 'a commented header is absent')
  assert.equal(
    commentedLegacy.stdout.match(/advice: .*proof-map cross-check did not run/gi)?.length ?? 0,
    1,
    commentedLegacy.stdout,
  )

  const legacy = lint(legacyTask, 'legacy task remains non-blocking')
  expectExit(legacy, 0, 'legacy task remains non-blocking')
  const legacyAdvice = legacy.stdout.match(/advice: .*proof-map cross-check did not run/gi) ?? []
  assert.equal(legacyAdvice.length, 1, legacy.stdout)

  const legacyExample = legacyTask.replace(
    '## Stop Condition\n\n',
    '## Stop Condition\n\n```text\n**Proof map:** v1\n```\n\n',
  )
  const shown = lint(legacyExample, 'a later proof-map example is still legacy')
  expectExit(shown, 0, 'a later proof-map example is still legacy')
  assert.equal(
    shown.stdout.match(/advice: .*proof-map cross-check did not run/gi)?.length ?? 0,
    1,
    shown.stdout,
  )

  // ADR-018 versions only its own proof-map parser. The historical section
  // reader did not understand tilde fences, so changing that globally would
  // silently change old task exit behavior under a compatibility feature.
  const legacyTildeHeading = legacyTask.replace(
    '\n## Tests',
    '\n~~~markdown\n## Acceptance\nshown example only\n~~~\n\n## Tests',
  )
  const legacyParity = lint(legacyTildeHeading, 'legacy tilde-heading parity')
  expectExit(legacyParity, 1, 'legacy tilde-heading parity')
  assert.match(legacyParity.stdout, /Acceptance has no ```bash fence/)
})

// A parallelised Acceptance fence that collects its children with a bare `wait`
// cannot fail: bash returns 0 from an argument-less `wait` whatever the children
// exited with, and neither `set -e` nor `set -o pipefail` changes that.
// Reported 2026-09-02 from an adopting corpus that had just cut a 45s suite to
// 4.5s by parallelising — the right optimisation, one `wait` from a dead gate.
// Driven through `adr-lint` on a real task file rather than against the helper,
// because the report arrived as a fence in a task and that is the boundary it
// has to be caught at (CLAUDE.md §4).
test('a parallelised acceptance fence that never collects its children is reported', () => {
  const temp = mkdtempSync(join(os.tmpdir(), 'qh-parallel-'))
  cpSync(fixture, temp, { recursive: true })
  const task = join(temp, 'tasks', 'T1-fixture.md')
  const original = readFileSync(task, 'utf8')
  const setFence = body => writeFileSync(task, original.replace(
    /```bash\n[\s\S]*?\n```/,
    `\`\`\`bash\n${body}\n\`\`\``,
  ))
  const lintCorpus = () => run('adr-lint', ['ADR-001-selftest.md', 'tasks'], temp)
  const NOTICE = /backgrounds work with `&`.*cannot fail/is

  // The trap, in the shape an author reaches for first.
  setFence('set -eo pipefail\nadr-lint ADR-001-selftest.md tasks & python3 -c "pass" & wait')
  const trapped = lintCorpus()
  assert.match(trapped.stdout, NOTICE, trapped.stdout)
  // Advisory, never blocking — CLAUDE.md §3. A gate that refuses the commit here
  // would stop the person doing the correct optimisation.
  expectExit(trapped, 0, 'the finding advises and does not block')

  // The same parallelism, collected per pid. It must go quiet, or the check is
  // one that matches every parallel fence and teaches people to ignore it.
  setFence([
    'set -o pipefail',
    'adr-lint ADR-001-selftest.md tasks & p1=$!',
    'python3 -c "pass" & p2=$!',
    'rc=0; for p in $p1 $p2; do wait $p || rc=1; done',
    'exit $rc',
  ].join('\n'))
  assert.doesNotMatch(lintCorpus().stdout, NOTICE, 'a collected fence must not be reported')

  // And the serial fence the rest of this corpus uses stays silent too.
  setFence(original.match(/```bash\n([\s\S]*?)\n```/)[1])
  assert.doesNotMatch(lintCorpus().stdout, NOTICE, 'a serial fence must not be reported')
  rmSync(temp, { recursive: true, force: true })
})

// ADR-028 T2. A step whose declared proof is a NAMED TEST, and which no exit-0 run
// names, is reported. The whole value is that a skipped step stops being invisible;
// the whole risk is that absence gets read as a finding, so both are asserted.
function stepCoverageCorpus(entrySteps) {
  const temp = mkdtempSync(join(os.tmpdir(), 'qh-step-cov-'))
  const copy = join(temp, 'ok')
  cpSync(fixture, copy, { recursive: true })
  const taskPath = join(copy, 'tasks', 'T1-fixture.md')
  let task = readFileSync(taskPath, 'utf8')
  // The shipped fixture is deliberately LEGACY — no `**Proof map:**` header, a
  // four-column Tests table — because other tests exercise that allowance through
  // it. `check_step_proof_map` skips a legacy task entirely, so a step-coverage
  // fixture has to opt in to the modern shape or the check under test never runs.
  task = task.replace('**Consumes:** none', '**Consumes:** none\n**Proof map:** v1')
  task = task.replace('1. Write the failing test', '1. [S1] Write the failing test')
  // S2 gets an INLINE proof marker rather than a Tests row: this record's check
  // only considers steps whose declared proof is a NAMED TEST, so S2 must be
  // proved some other way or it would be a second finding drowning the first.
  task = task.replace('2. Fill every required section',
    '2. [S2] Fill every required section [proof: acceptance]')
  task = task.replace(
    '| Test name | File | Verifies | Covers |\n|-----------|------|----------|--------|\n'
    + '| adr-lint-positive | selftest.sh | conforming ADR + task pass the gate | — |',
    '| Test name | File | Verifies | Covers | Steps |\n'
    + '|-----------|------|----------|--------|-------|\n'
    + '| `adr-lint-positive` | `selftest.sh` | conforming ADR + task pass the gate | — | S1 |')
  task = task.replace('## Verification Log', '## Mutation Log\n\n## Verification Log')
  writeFileSync(taskPath, task)

  // REAL runs, not hand-written rows. The gate requires a killed mutant bound to
  // the CURRENT acceptance digest, and a fabricated digest cannot satisfy that —
  // which is the anti-fabrication rule working exactly as intended, on a test
  // trying to fabricate. adr-verify computes both.
  const verifyArgs = ['tasks/T1-fixture.md', '--cwd', '.']
  run('adr-verify', [...verifyArgs, '--mutant', 'ADR-001-selftest.md',
    '--from', '## Alternatives Considered', '--to', '## Alternatives Considred',
    '--why', 'adr-lint must notice its required alternatives section going missing'], copy)
  run('adr-verify', entrySteps === null ? verifyArgs
    : [...verifyArgs, '--steps', entrySteps], copy)
  return { temp, copy }
}

test('a step whose proof is a named test has a run that names it', () => {
  // S1 is proved by a Tests row, and the only run names S2. Nothing has shown S1
  // happened, which is precisely the gap a delegated executor falls through.
  const { temp, copy } = stepCoverageCorpus('S2')
  try {
    const out = run('adr-lint', ['ADR-001-selftest.md', 'tasks'], copy)
    assert.match(`${out.stdout}${out.stderr}`, /S1[\s\S]*no run names it|no run names[\s\S]*S1/,
      'the unnamed step must be reported')
    // ADVISORY. Making this blocking would select for declaring fewer steps, and
    // the gate would then report the resulting silence as coverage (ADR-005).
    assert.equal(out.status, 0,
      `the advisory must not change the lint verdict\n${out.stdout}${out.stderr}`)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('a task with no steps field anywhere is silent, not uncovered', () => {
  // Every task written before ADR-028 is this case. If absence read as a finding,
  // the gate would light up the whole corpus on the day it shipped — and a check
  // everyone learns to skim is worth the same as no check.
  const { temp, copy } = stepCoverageCorpus(null)
  try {
    const out = run('adr-lint', ['ADR-001-selftest.md', 'tasks'], copy)
    assert.doesNotMatch(`${out.stdout}${out.stderr}`, /no run names it/,
      'absence of the field is "could not look", never "not covered"')
    assert.equal(out.status, 0, `${out.stdout}${out.stderr}`)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('a step the run does name is not reported', () => {
  // The other direction, or the check would pass by reporting everything.
  const { temp, copy } = stepCoverageCorpus('S1')
  try {
    const out = run('adr-lint', ['ADR-001-selftest.md', 'tasks'], copy)
    assert.doesNotMatch(`${out.stdout}${out.stderr}`, /no run names it/,
      'a step a run named must not be reported')
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

// ADR-031. Every gate answers `--version`, and the answer is the version of the
// TREE THAT GATE WAS LOADED FROM. That last part is the decision, not a detail:
// a central answer (`qh-root`, `qh-doctor`, a `qh-version` gate) reports whichever
// copy of itself resolved, and on a machine carrying both PATH mechanisms that is
// a different install from the gate whose output is being questioned.
//
// So the assertion cannot be "it printed 2.60.0" — that passes for a gate reading
// the repository it happens to sit in, a baked constant, or a resolver call. Each
// gate is copied into a throwaway tree whose manifest says something no other tree
// on this machine says, and must report THAT.
test('every shipped gate answers --version with the version of the tree it was run from', () => {
  const gates = [...GATE_NAMES].sort()
  // Enumerated, never listed: a twelfth gate added later fails here until it
  // answers too, which a hand-kept list would not do.
  assert.ok(gates.length >= 11, `expected the shipped gates, saw ${gates.length}`)

  const temp = mkdtempSync(join(os.tmpdir(), 'qh-version-'))
  try {
    mkdirSync(join(temp, 'bin'), { recursive: true })
    // An installed tree carries lib/ beside bin/ — the plugin ships as a directory
    // and the forwarders exec $root/bin/<gate>. A fixture without it models a gate
    // copied on its own, which is the next test's subject, not this one's.
    cpSync(join(root, 'lib'), join(temp, 'lib'), { recursive: true })
    mkdirSync(join(temp, '.claude-plugin'), { recursive: true })
    writeFileSync(join(temp, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'quality-harness', version: '0.0.0-fixture' }))

    for (const gate of gates) {
      cpSync(join(bin, gate), join(temp, 'bin', gate))
      // cwd is the REPOSITORY, deliberately, and the gate lives in `temp/bin`.
      // Running from `temp` made "the manifest beside the gate" and "the manifest
      // under the caller's directory" the SAME path, so a mutant resolving from
      // cwd SURVIVED — measured 2026-09-04, and the survivor was a finding about
      // this test rather than about the gate. From here the two answers differ:
      // cwd resolution finds the repository's own manifest, which the assertion
      // below refuses to see.
      const out = spawnSync('python3', [join(temp, 'bin', gate), '--version'],
        { cwd: repoRoot, env, encoding: 'utf8', timeout: 60_000 })
      assert.equal(out.status, 0, `${gate} --version must exit 0: ${out.stdout}${out.stderr}`)
      assert.match(out.stdout, /^0\.0\.0-fixture$|0\.0\.0-fixture/,
        `${gate} must report the manifest beside IT, not the repository it came from ` +
        `or a resolver's answer: ${out.stdout}${out.stderr}`)
      assert.match(out.stdout, new RegExp(`^${gate} `),
        `${gate} must name itself, so two disagreeing installs are told apart: ${out.stdout}`)
      // The repository's own version must NOT appear. Without this the test would
      // pass for a gate that printed both, or that fell back to the real tree.
      const real = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version
      assert.doesNotMatch(out.stdout, new RegExp(real.replace(/\./g, '\\.')),
        `${gate} leaked the repository's version ${real} into a run from another tree: ${out.stdout}`)
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

// A gate copied somewhere without plugin/lib beside its bin/ is the stale-copy
// shape the forwarders exist to replace. It must say so in one sentence and exit
// 2 — could not run, ADR-005 — never die in a traceback. And the same gate WITH
// lib/ beside it must run, or this would pass for a gate that always refused.
test('a gate copied without plugin/lib says so and exits 2; with lib/ beside it, it runs', () => {
  for (const gate of ['adr-verify', 'spec-verify', 'qh-mcp']) {
    const temp = mkdtempSync(join(os.tmpdir(), 'qh-nolib-'))
    try {
      mkdirSync(join(temp, 'bin'), { recursive: true })
      mkdirSync(join(temp, '.claude-plugin'), { recursive: true })
      writeFileSync(join(temp, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'quality-harness', version: '0.0.0-fixture' }))
      cpSync(join(bin, gate), join(temp, 'bin', gate))
      const without = spawnSync('python3', [join(temp, 'bin', gate), '--version'], { cwd: repoRoot, env, encoding: 'utf8', timeout: 60_000 })
      assert.equal(without.status, 2, `${gate} without lib/: could-not-run is exit 2, got ${without.status}\n${without.stdout}${without.stderr}`)
      assert.match(without.stderr, /could not run: plugin\/lib\/fence\.py is not beside this gate's bin\//,
        `${gate}: the reason is a sentence, not a traceback — ${without.stderr}`)
      assert.doesNotMatch(without.stderr, /Traceback/, `${gate}: no traceback`)
      cpSync(join(root, 'lib'), join(temp, 'lib'), { recursive: true })
      const withLib = spawnSync('python3', [join(temp, 'bin', gate), '--version'], { cwd: repoRoot, env, encoding: 'utf8', timeout: 60_000 })
      assert.equal(withLib.status, 0, `${gate} with lib/ beside it must run: ${withLib.stdout}${withLib.stderr}`)
    } finally { rmSync(temp, { recursive: true, force: true }) }
  }
})

// ADR-005, applied to this flag: "could not read" is not a version. A gate that
// guessed, or fell back to a resolver, would answer about a different tree and
// look exactly like success.
test('a gate whose manifest cannot be read says so instead of guessing', () => {
  const temp = mkdtempSync(join(os.tmpdir(), 'qh-version-blind-'))
  try {
    mkdirSync(join(temp, 'bin'), { recursive: true })
    // No .claude-plugin at all.
    cpSync(join(bin, 'adr-lint'), join(temp, 'bin', 'adr-lint'))
    const out = spawnSync('python3', [join(temp, 'bin', 'adr-lint'), '--version'],
      { cwd: repoRoot, env, encoding: 'utf8', timeout: 60_000 })
    assert.equal(out.status, 0, `it advises, it does not block: ${out.stdout}${out.stderr}`)
    assert.match(out.stdout, /version unreadable/,
      `it must say it could not look: ${out.stdout}`)
    assert.match(out.stdout, /plugin\.json/,
      `and name the path it tried: ${out.stdout}`)
    // Shown capable of the other answer: no version-shaped string is invented,
    // and in particular not the one from the repository this gate was copied out of.
    const real = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version
    assert.doesNotMatch(out.stdout, new RegExp(real.replace(/\./g, '\\.')),
      `a blind gate must not fall back to another tree's version: ${out.stdout}`)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('a path::name pointer at a production function does not resolve as a test', () => {
  // The mechanism is `looks_like_a_test`. `test_body` matches any FUNCTION with
  // the wanted name — right where a test IS a function (Python, Go), and silent
  // about whether the FILE is a test. Without the path check,
  // `bin/adr-lint::enforcement_pointers` resolves: a production function inside a
  // gate, making a record read as backed by a check that is really the thing
  // being checked.
  //
  // This lives here and not only in tests/gate-regressions.py, which asserts the
  // same mechanism in-process, because the mutation campaign spawns
  // `node --test` (scripts/mutate.mjs:524) and cannot run a Python file. The
  // catalogue declared this mechanism against tests/gates.test.mjs, which never
  // mentioned it, so the entry went GREEN in CI on 2026-09-04 with the Python
  // assertion passing the whole time. An assertion the campaign cannot reach
  // cannot kill a mutant.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-pointer-'))
  try {
    // adr-lint resolves a pointer against `git_root(adr.parent)`, so a temp tree
    // that is not a repository gives root=None and EVERY pointer advises — the
    // negative half of this test would then pass without the guard doing
    // anything. `temp` is a directory this test created; it is never the
    // repository under test (CLAUDE.md §9).
    expectExit(run('git', ['init', '-q'], temp), 0, 'pointer fixture git init')
    mkdirSync(join(temp, 'bin'), { recursive: true })
    mkdirSync(join(temp, 'tests'), { recursive: true })
    // A production function in a gate. Same name shape as the real one, so the
    // only thing standing between it and a "test" verdict is the path check.
    writeFileSync(join(temp, 'bin', 'adr-lint'),
      '#!/usr/bin/env python3\ndef enforcement_pointers(text):\n    return []\n')
    // And a genuine Python test, so the check is shown capable of BOTH answers
    // in the same test — a resolver that never resolves would pass the negative
    // half at 100% coverage (CLAUDE.md §4).
    writeFileSync(join(temp, 'tests', 'probe_test.py'),
      'def test_probe():\n    assert True\n')

    const record = pointer => [
      '# ADR-001: Probe', '',
      '**Status:** Accepted',
      '**Spec:** None — no spec stage',
      `**Enforced-by:** \`${pointer}\``,
      '**Served-path change:** None — this decision changes no served path.', '',
      '## Existing Primitives Audit', '', 'Nothing existing covers it.', '',
      '## Decision', '', 'Do the thing.', '',
      '## Alternatives Considered', '', '- Doing nothing — rejected, the bug persists.', '',
      '## Consequences', '', 'The thing is done.', '',
      '## Wiring & Contract Changes', '', 'None.', '',
      '## Out of Scope', '', '- The other thing (deferred: ADR-002)', '',
    ].join('\n')

    const adr = join(temp, 'ADR-001-probe.md')

    writeFileSync(adr, record('bin/adr-lint::enforcement_pointers'))
    const production = run('adr-lint', [adr], temp)
    expectExit(production, 0, 'an unresolved pointer advises, it never blocks')
    assert.match(production.stdout, /advice: .*enforcement_pointers.*pointer to nothing/s,
      `a production function in bin/ must not resolve as a test: ${production.stdout}`)

    writeFileSync(adr, record('tests/probe_test.py::test_probe'))
    const real = run('adr-lint', [adr], temp)
    expectExit(real, 0, 'a resolving pointer passes')
    assert.doesNotMatch(real.stdout, /advice: .*test_probe/,
      `a real test file must still resolve, or the guard rejects everything: ${real.stdout}`)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

// BACKLOG §139 — neither ordering of comment/literal regexes is correct, and both
// have shipped here. Issue #7 moved `code_only` from comments-first (a `"//"`
// LITERAL ate its line) to literals-first (a backtick inside a `//` COMMENT ate
// the code after it). The second was measured against a foreign Go corpus, where
// three real `func Test…` declarations vanished and adr-lint told that repository
// it had named tests it never wrote. Both gates now SCAN, and this holds them to
// the same answers — the drift after #7 is the reason there are two assertions.
const STRIP_CASES = [
  ['a backtick inside a line comment does not open a raw string',
    '// the `why` field is not a call argument\nfunc TestX(t *testing.T) {\n\tt.Fatal("x")\n}\n', 'func TestX'],
  ['an ODD backtick across comments does not swallow the file',
    '// opens a `quote\n// and never closes it\nfunc TestY(t *testing.T) {\n\tt.Fatal("y")\n}\n', 'func TestY'],
  ['a "//" literal does not open a comment (issue #7)',
    'func TestZ(t *testing.T) {\n\ts := "//"\n\tif s == "" { t.Fatal("z") }\n}\n', 'func TestZ'],
  ['a quote inside a line comment does not open a string',
    "// don't let this eat the file\nfunc TestQ(t *testing.T) {\n\tt.Fatal(\"q\")\n}\n", 'func TestQ'],
  // The shape that made this mutant GREEN in arch-lint on the first pass: the
  // fixtures had a comment marker inside a RAW string and none inside a quoted
  // one, so nothing held the `"`-state to it. adr-lint was covered only by its
  // own Go lexer fixture below, which arch-lint has no equivalent of.
  ['a block-comment opener inside a quoted string is not a comment',
    'const commentStart = "/*"\nfunc TestC2(t *testing.T) {\n\tt.Fatal("c")\n}\nconst commentEnd = "*/"\n', 'func TestC2'],
  ['a comment marker inside a raw string is not a comment',
    'var s = `// not a comment\nstill a string`\nfunc TestR(t *testing.T) {\n\tt.Fatal("r")\n}\n', 'func TestR'],
]

const stripProbe = `import sys, importlib.machinery, importlib.util, json
sys.dont_write_bytecode = True
def load(name, path):
    loader = importlib.machinery.SourceFileLoader(name, path)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module
adr = load('adr_probe', sys.argv[1])
arch = load('arch_probe', sys.argv[2])
cases = json.loads(sys.argv[3])
print(json.dumps([[adr.code_only(c), arch.code_only(c)] for c in cases]))`

test('neither gate loses code to a quote character inside a comment, and the two agree (BACKLOG §139)', () => {
  const sources = STRIP_CASES.map(([, source]) => source)
  const result = spawnSync('python3', ['-c', stripProbe, join(bin, 'adr-lint'), join(bin, 'arch-lint'),
    JSON.stringify(sources)], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
  const stripped = JSON.parse(result.stdout)
  assert.equal(stripped.length, STRIP_CASES.length, 'every case must be answered')
  STRIP_CASES.forEach(([label, , declaration], index) => {
    const [fromAdr, fromArch] = stripped[index]
    assert.ok(fromAdr.includes(declaration), `adr-lint: ${label}\n${fromAdr}`)
    assert.ok(fromArch.includes(declaration), `arch-lint: ${label}\n${fromArch}`)
    assert.equal(fromAdr, fromArch, `the two gates disagree on: ${label}`)
  })

  // Shown DIRTY: the thing they strip is still stripped, or these assertions
  // would pass on a `code_only` that returns its input unchanged.
  const [both] = JSON.parse(spawnSync('python3', ['-c', stripProbe, join(bin, 'adr-lint'), join(bin, 'arch-lint'),
    JSON.stringify(['func TestS(t *testing.T) {\n\t// assert.Fail here is prose\n\ts := "assert.Fail in a string"\n}\n'])],
  { encoding: 'utf8', timeout: 60_000 }).stdout)
  assert.ok(both[0].includes('func TestS'), 'the declaration survives')
  assert.doesNotMatch(both[0], /prose/, 'the comment body is gone')
  assert.doesNotMatch(both[0], /assert\.Fail in a string/, 'the string body is gone')
})

test('a document that never claimed to be a record is not judged as a malformed one (BACKLOG §141)', () => {
  // Five foreign corpora, five out of five: every one keeps non-record documents
  // in `docs/adr/` — a BACKLOG, a README, a WAVE, a pre-registration — so
  // `adr-lint docs/adr/*.md` reported "Alternatives Considered has no entries"
  // about a backlog. The discriminator is `**Status:**`, which every record
  // carries and none of those documents does.
  const dir = mkdtempSync(join(os.tmpdir(), 'quality-not-a-record-'))
  try {
    const write = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p }
    const backlog = write('BACKLOG.md', '# Backlog — what is not yet an ADR\n\n## 1. something\n\nprose\n')
    const readme = write('README.md', '# Architecture Decision Records\n\nIndex of records.\n')
    const wave = write('WAVE.md', '# Wave 2 — order of work\n\nprose\n')

    for (const [label, file] of [['a backlog', backlog], ['a README', readme], ['a wave plan', wave]]) {
      const result = run('adr-lint', [file], dir)
      expectExit(result, 2, `${label} is not a record and must not be judged as one`)
      assert.match(result.stdout, /NOT A DECISION RECORD/, label)
      assert.doesNotMatch(result.stdout, /Alternatives Considered/, `${label}: no content finding may be made`)
    }

    // ⚠ THE ARM THAT MUST NOT MOVE. A file NAMED `ADR-…` keeps its findings
    // whatever it contains — a record missing its Status line is a real finding,
    // and this must never become the way to silence one.
    const named = write('ADR-901-no-status.md', '# ADR-901: a draft\n\n## Context\n\nprose\n')
    const namedResult = run('adr-lint', [named], dir)
    expectExit(namedResult, 1, 'a file named ADR- is judged even with no Status line')
    assert.doesNotMatch(namedResult.stdout, /NOT A DECISION RECORD/)

    // And a document carrying a Status line is a record whatever it is called.
    const odd = write('decision-2026-09-05.md',
      '# A decision\n\n**Status:** Accepted\n\n## Context\n\nprose\n')
    const oddResult = run('adr-lint', [odd], dir)
    assert.notEqual(oddResult.status, 2, `a Status line makes it a record: ${oddResult.stdout}`)
    assert.doesNotMatch(oddResult.stdout, /NOT A DECISION RECORD/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// BACKLOG §143. A verdict that names only the record it judged cannot be told
// apart from one reached by a different build. That ambiguity was reported
// three times as a corpus defect — each phrased "the linter is wrong about my
// tree" — and was version skew every time, because the only thing that could
// have settled it lived behind `--version`, which nobody runs while a gate is
// accusing their code.
//
// ⚠ THE PATH IS ASSERTED STRUCTURALLY, NEVER AS A LITERAL. CLAUDE.md §6 forbids
// an absolute home path reaching this repository, and a fixture that hardcoded
// one would put the author's home directory in every clone. The expectation is
// derived from `root`, which the suite already computes from its own location,
// and compared with separators normalised (§7) so the Windows job reads it the
// same way.
test('every gate that returns a verdict names the binary that reached it (BACKLOG §143)', () => {
  // CLAUDE.md §9: a test only spawns a gate in a directory it created itself,
  // and the temp-directory variable is named so it can never be confused with
  // `root` or `repoRoot`.
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-identity-'))
  try {
    const record = join(temp, 'ADR-001-probe.md')
    writeFileSync(record, [
      '# ADR-001: Probe', '', '**Status:** Accepted', '**Date:** 2026-09-06',
      '**Governs:** `nothing/**`', '', '## Context', '', 'A probe.', '',
      '## Decision', '', 'Probe.', '', '## Consequences', '', 'None.', ''].join('\n'))

    // ⚠ THE EARLY-REFUSAL BRANCH IS HERE ON PURPOSE. Codex review 2026-09-06
    // found `adr-retire-check --adopt` with absent roots still printing an
    // anonymous `[FAIL]`, because the first sweep's regex looked for `print(f"[`
    // and that line is a plain `print("[`. A class enumerated by a pattern is
    // only as complete as the pattern (§5), so the branch a pattern missed is
    // the one worth driving.
    const cases = [
      ['adr-lint', [record]],
      ['adr-judge', [record]],
      ['adr-debt', [temp]],
      ['adr-retire-check', ['--adopt', join(temp, 'absent-active'), join(temp, 'absent-archive')]],
    ]

    const normalise = text => text.replace(/\\/g, '/')
    const expectedRoot = normalise(root)

    for (const [gate, args] of cases) {
      const result = run(gate, args, temp)
      const line = (result.stdout || '').split('\n').find(l => l.startsWith('['))
      assert.ok(line, `${gate} printed no verdict line:\n${result.stdout}${result.stderr}`)

      // The three parts, each checked on its own so a failure says WHICH is
      // missing rather than "the line changed".
      assert.match(line, new RegExp(`\\b${gate}\\b`), `${gate}: verdict does not name the gate:\n${line}`)
      assert.match(line, /\b\d+\.\d+\.\d+\b/, `${gate}: verdict carries no version:\n${line}`)
      assert.ok(normalise(line).includes(expectedRoot),
        `${gate}: verdict does not name the plugin root it ran from:\n${line}`)
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

// ⚠ THE SWEEP THAT COVERS WHAT NO FIXTURE REACHES. The test above drives four
// gates; `arch-lint`, `spec-verify` and `postmortem-verify` each need a
// conforming document of their own kind, and every gate has refusal branches
// reached only by inputs nobody would build a fixture for. Codex review
// 2026-09-06 named exactly that gap: "five gates and special verdict branches
// are untested".
//
// So this reads the SOURCE, and it is the one place in this file that does.
// ADR-003 says a gate asserts behaviour and not shape, and that rule is about
// what a GATE may assert; here the property under test is itself syntactic —
// every line that prints a bracketed verdict must carry the identity — and no
// behavioural test can reach a branch whose fixture cannot be built. The two
// tests are complementary: this one cannot tell whether the identity is
// CORRECT, and the one above cannot tell whether it is EVERYWHERE.
test('no bracketed verdict is printed without the identity, in any branch (BACKLOG §143)', () => {
  const verdictGates = ['adr-lint', 'arch-lint', 'spec-verify', 'adr-judge',
    'postmortem-verify', 'adr-debt', 'adr-retire-check']
  const anonymous = []
  for (const gate of verdictGates) {
    const lines = readFileSync(join(bin, gate), 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      if (!/print\(f?"\[(?:PASS|FAIL|JUDGE|DEBT|\{status\}|\{label\})/.test(line)) return
      // A multi-line print carries the identity on its LAST fragment, so the
      // window is the whole statement. It ends where the parentheses balance —
      // ⚠ NOT at the first `")`, which the first draft of this test used and
      // which truncated `…checks only)") + f" · {gate_identity()}"` inside the
      // literal `only)"`, reporting a line that carries the identity as one that
      // does not. A sweep that cries wolf is worse than none: the next reader
      // learns to skip it.
      let depth = 0
      let statement = ''
      for (let j = i; j < lines.length && j < i + 8; j += 1) {
        statement += `${lines[j]}\n`
        for (const ch of lines[j]) {
          if (ch === '(') depth += 1
          else if (ch === ')') depth -= 1
        }
        if (depth <= 0) break
      }
      if (!/gate_identity\(\)/.test(statement)) anonymous.push(`${gate}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(anonymous, [],
    `these verdict lines name no binary — a reader cannot tell which build judged them:\n${anonymous.join('\n')}`)
})
// gate_identity() hardcoded to a constant string.
test('a gate whose manifest is unreadable says so, and states no version (BACKLOG §143)', () => {
  const temp = mkdtempSync(join(os.tmpdir(), 'quality-harness-identity-unreadable-'))
  try {
    // A copy of the gate with NO plugin manifest above it: same code, no version
    // to find. Copied rather than executed in place, because the real tree has a
    // readable manifest and this case cannot otherwise be reached.
    const fakeBin = join(temp, 'bin')
    mkdirSync(fakeBin, { recursive: true })
    const copied = join(fakeBin, 'adr-lint')
    writeFileSync(copied, readFileSync(join(bin, 'adr-lint'), 'utf8'))

    const result = spawnSync('python3', [copied, '--version'], { cwd: temp, encoding: 'utf8', timeout: 60_000 })
    const out = `${result.stdout}${result.stderr}`
    assert.match(out, /version unreadable/, `expected the unreadable arm, got:\n${out}`)
    assert.doesNotMatch(out, /\b\d+\.\d+\.\d+\b/, `a version was stated for an unreadable manifest:\n${out}`)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

// ⚠ `--help` IS THE FIRST THING ANYONE TYPES, and TEN OF ELEVEN GATES ANSWERED
// `unknown option: --help` AT EXIT 2. Reported 2026-09-07 by two outside corpora
// independently, one of which said its options were "discoverable only by
// grepping the source" (BACKLOG §160).
//
// This runs over the DIRECTORY rather than a list, so the answer cannot go stale:
// `reject_unknown_flags` is copied into six gates and the four others parse their
// own argv, and a new gate that forgets this fails here rather than shipping mute.
test('every gate answers --help, because a gate that will not explain itself is run wrong', () => {
  const failures = []
  for (const name of [...GATE_NAMES].sort()) {
    for (const flag of ['--help', '-h']) {
      const result = run(name, [flag], repoRoot)
      const said = `${result.stdout ?? ''}${result.stderr ?? ''}`
      if (result.status !== 0) failures.push(`${name} ${flag}: exit ${result.status} — ${said.split('\n')[0]}`)
      else if (said.trim().length < 100) failures.push(`${name} ${flag}: exit 0 but said ${said.trim().length} chars`)
      // Exit 0 and a usage block: an ERROR that happens to print usage is what
      // adr-judge and qh-root already did, and it is not the same thing.
      else if (/unknown option/i.test(said)) failures.push(`${name} ${flag}: printed usage but called it unknown`)
    }
  }
  assert.deepEqual(failures, [], `a gate must explain itself:\n${failures.join('\n')}`)
})

// BACKLOG §164. Three review rounds and two outside reports converged on one class:
// a gate has THREE outcomes — clean, a finding, and could-not-look — and the channel
// to its caller has two. The code is the only part of that channel a script can read,
// and nothing in this repository checked that a gate's own docstring said which codes
// it produces. `adr-next` exits 3 when everything is done, and an outside `for` loop
// over records read it as failure.
//
// ⚠ THIS CHECKS ONE DIRECTION ONLY, AND SAYS SO. A literal `sys.exit(2)` is findable;
// `sys.exit(worst)` is not, so a declared code with no literal cannot be judged
// unreachable and is NOT reported. Source ⊆ declared is what the AST can prove — a
// mirror of a parser that claims more than it can see only adds silence.
test('every exit code a gate can literally produce is declared in its own docstring', () => {
  const probe = `
import ast, json, pathlib, re, sys

def literal_codes(tree):
    codes = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Call):
            f = n.func
            named_exit = (isinstance(f, ast.Name) and f.id == 'exit') or \\
                         (isinstance(f, ast.Attribute) and f.attr == 'exit')
            if named_exit and n.args and isinstance(n.args[0], ast.Constant):
                v = n.args[0].value
                if isinstance(v, bool): codes.add(int(v))
                elif isinstance(v, int): codes.add(v)
        if isinstance(n, ast.Return) and isinstance(n.value, ast.Constant):
            v = n.value.value
            if isinstance(v, bool): codes.add(int(v))
            elif isinstance(v, int): codes.add(v)
    return codes

def declared_codes(doc):
    # The block opens with 'Exit:' or 'Exit codes:' and runs to the first blank
    # line, so a continuation line carrying another code counts.
    lines = doc.splitlines()
    for i, line in enumerate(lines):
        if re.match(r'\\s*Exit( codes)?:', line):
            block = []
            for rest in lines[i:]:
                if not rest.strip(): break
                block.append(rest)
            return set(int(m) for m in re.findall(r'(?<![\\w-])(\\d)(?![\\w-])', ' '.join(block)))
    return None

out = {}
for p in sorted(pathlib.Path(sys.argv[1]).iterdir()):
    if p.suffix == '.cmd' or p.is_dir() or '.' in p.name: continue
    tree = ast.parse(p.read_text(encoding='utf-8'))
    doc = ast.get_docstring(tree) or ''
    d = declared_codes(doc)
    out[p.name] = {'source': sorted(literal_codes(tree)), 'declared': None if d is None else sorted(d)}
print(json.dumps(out))
`
  const probed = spawnSync('python3', ['-c', probe, bin], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(probed.status, 0, `the probe did not run, which is not a clean sweep: ${probed.stderr}`)
  const gates = JSON.parse(probed.stdout)
  assert.ok(Object.keys(gates).length >= 10,
    `there must be gates to judge, read ${Object.keys(gates).length}`)

  const undeclared = []
  for (const [name, { source, declared }] of Object.entries(gates)) {
    if (declared === null) {
      undeclared.push(`${name}: no \`Exit:\` block in its docstring, so its codes are ` +
        `${source.join(', ')} and nothing says so`)
      continue
    }
    const missing = source.filter(code => !declared.includes(code))
    if (missing.length) {
      undeclared.push(`${name}: exits ${missing.join(', ')} but its \`Exit:\` block ` +
        `names only ${declared.sort().join(', ')}`)
    }
  }
  assert.deepEqual(undeclared, [],
    'a caller reads the exit code, and these gates produce one they never documented:\n' +
    undeclared.join('\n'))
})

// BACKLOG §169. Reported from an outside corpus: the fence timeout was
// environment-only, so a task whose Acceptance is a full container suite needed
// `QUALITY_HARNESS_FENCE_TIMEOUT` exported by whatever launched the gate, and
// forgetting cost UNPROVEN after thirty minutes — the right failure, at the price of
// a thirty-minute discovery every time.
//
// ⚠ IN A `.mjs` TEST BECAUSE THE MUTATION CAMPAIGN SPAWNS `node --test` AND NOTHING
// ELSE. Written first in tests/gate-regressions.py, where it passed and where its
// three catalogue entries were UNPROVEN — the campaign's own check said so
// (`every catalogue entry names tests the campaign can actually spawn`). A test the
// campaign cannot run cannot back a mutant, so the mutant proves nothing.
test('fenceTimeout is read from the project config, and one it cannot use is said', () => {
  const dir = mkdtempSync(join(os.tmpdir(), 'qh-fence-timeout-'))
  try {
    // ⚠ ITS OWN GIT REPOSITORY. `config_fence_timeout` resolves the project root with
    // `git rev-parse`, so a temp directory that is not one would walk up into THIS
    // checkout and read its config (CLAUDE.md §9).
    const git = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(git.status, 0, `the fixture needs its own repository: ${git.stderr}`)

    const probe = `
import json, os, pathlib, sys
gate = pathlib.Path(sys.argv[1])
head = gate.read_text(encoding='utf-8').split('def main()')[0]
g = {'__name__': 'probe', '__file__': str(gate)}
exec(compile(head, str(gate), 'exec'), g)
root, config = pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[2]) / '.quality-harness.json'
out = {'default': g['FENCE_TIMEOUT_DEFAULT'], 'arms': [], 'saidTwice': None}
for text, env in json.loads(sys.argv[3]):
    config.unlink(missing_ok=True)
    if text is not None: config.write_text(text, encoding='utf-8')
    g['_fence_config_said'].clear()
    out['arms'].append([g['fence_timeout'](env=env, start=root), len(g['_fence_config_said'])])
config.write_text('not json', encoding='utf-8')
g['_fence_config_said'].clear()
g['fence_timeout'](env={}, start=root)
first = len(g['_fence_config_said'])
g['fence_timeout'](env={}, start=root)
out['saidTwice'] = [first, len(g['_fence_config_said'])]
print(json.dumps(out))
`
    const arms = [
      ['{"fenceTimeout": 3600}', {}],
      ['{"fenceTimeout": "900"}', {}],
      [null, {}],
      ['{}', {}],
      ['{"strictFrom": 12}', {}],
      ['{"fenceTimeout": 3600}', { QUALITY_HARNESS_FENCE_TIMEOUT: '7' }],
      ['{"fenceTimeout": 3600}', { QUALITY_HARNESS_FENCE_TIMEOUT: 'soon' }],
      ['{"fenceTimeout": "soon"}', {}],
      ['{"fenceTimeout": 0}', {}],
      ['{"fenceTimeout": -5}', {}],
      ['not json', {}],
    ]
    const ran = spawnSync('python3',
      ['-c', probe, join(bin, 'adr-verify'), dir, JSON.stringify(arms)],
      { encoding: 'utf8', timeout: 120_000 })
    assert.equal(ran.status, 0, `the probe did not run, which is not a clean sweep: ${ran.stderr}`)
    const { default: fallback, arms: got, saidTwice } = JSON.parse(ran.stdout)

    // The reported gap, closed — and every way of NOT declaring one, or the two
    // assertions above are a check that cannot come back clean.
    assert.deepEqual(got.slice(0, 5),
      [[3600, 0], [900, 0], [fallback, 0], [fallback, 0], [fallback, 0]],
      `declared / string / no config / no key / another key: ${JSON.stringify(got)}`)
    // ⚠ PRECEDENCE: the environment is a per-run override and the suite's own seam,
    // so it beats the project's standing answer — a config that could beat it would
    // make the suite's timing depend on the checkout it happens to run in. An
    // UNUSABLE variable falls through TO THE CONFIG, not past it to the default.
    assert.deepEqual(got.slice(5, 7), [[7, 0], [3600, 0]], JSON.stringify(got))
    // ⚠ AND A CONFIG IT CANNOT USE IS SAID. A malformed value that quietly restored
    // the default would be the hang this bound exists to prevent, wearing a clean run.
    for (const [seconds, said] of got.slice(7)) {
      assert.equal(seconds, fallback)
      assert.equal(said, 1, 'an unusable config must be reported, not silently defaulted')
    }
    // Said ONCE per process: fence_timeout() is called from inside the very message
    // strings that report a timeout, so an unguarded note would repeat at each mention.
    assert.deepEqual(saidTwice, [1, 1], `the note must not repeat: ${JSON.stringify(saidTwice)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
