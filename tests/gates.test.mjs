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
  spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' })
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
  assert.doesNotMatch(clean.stdout, /proof map.*not checked/i, clean.stdout)

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
    commentedLegacy.stdout.match(/advice: .*Proof map: v1.*not checked/gi)?.length ?? 0,
    1,
    commentedLegacy.stdout,
  )

  const legacy = lint(legacyTask, 'legacy task remains non-blocking')
  expectExit(legacy, 0, 'legacy task remains non-blocking')
  const legacyAdvice = legacy.stdout.match(/advice: .*Proof map: v1.*not checked/gi) ?? []
  assert.equal(legacyAdvice.length, 1, legacy.stdout)

  const legacyExample = legacyTask.replace(
    '## Stop Condition\n\n',
    '## Stop Condition\n\n```text\n**Proof map:** v1\n```\n\n',
  )
  const shown = lint(legacyExample, 'a later proof-map example is still legacy')
  expectExit(shown, 0, 'a later proof-map example is still legacy')
  assert.equal(
    shown.stdout.match(/advice: .*Proof map: v1.*not checked/gi)?.length ?? 0,
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
