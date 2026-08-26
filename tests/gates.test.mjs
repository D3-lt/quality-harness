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
const root = resolve(testDir, '..')
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
const GATE_NAMES = new Set(readdirSync(bin).filter(name => !name.includes('.')))

function run(command, args, cwd = fixture, input = undefined, spawnEnv = env) {
  const [file, argv] = process.platform === 'win32' && GATE_NAMES.has(command)
    ? ['python3', [join(bin, command), ...args]]
    : [command, args]
  return spawnSync(file, argv, {
    cwd,
    env: spawnEnv,
    input,
    encoding: 'utf8',
    timeout: 30_000,
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
    'for path in sorted(pathlib.Path(sys.argv[1]).iterdir()):',
    '    if path.suffix:',
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

test('adr-verify resolves Git Bash on Windows, never the System32 WSL stub', () => {
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
    // POSIX is untouched.
    'got = resolve("darwin", {}, exists)',
    'bad += [] if got == "bash" else [f"posix returned {got}"]',
    'print("failures:", bad)',
    'raise SystemExit(1 if bad else 0)',
  ].join('\n')
  expectExit(run('python3', ['-c', probe, join(bin, 'adr-verify')]), 0, 'Windows bash resolution')
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
  ], fixture, undefined, harnessEnv)
  expectExit(result, 0, 'gate regressions')
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
