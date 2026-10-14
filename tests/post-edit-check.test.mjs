// The PostToolUse hook that runs after EVERY Edit/Write, for every user of this
// plugin. 90 lines of shell, and until now nothing executed it: every test that
// mentioned it asserted its NAME appears in hooks.json or an install notice.
// The check that would have caught that — `a gate with no mutation is named` —
// reads bin/ only, so a shipped script in scripts/ was outside its scope.
//
// It is ADVISORY by design: it reports a syntax problem and must never fail the
// edit. So the assertions are about what it PRINTS and that it exits 0, which is
// the contract a hook has with the harness.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const hook = resolve(testDir, '..', 'plugin', 'scripts', 'post-edit-check.sh')

const temps = []
test.after(() => { for (const t of temps) rmSync(t, { recursive: true, force: true }) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'qh-hook-')); temps.push(d); return d }

// A fresh TMPDIR per run, or the script's own 5-second debounce makes a second
// call in the same second silently exit 0 and the test measures the debounce
// rather than the check.
const run = (tool, file) => spawnSync('bash', [hook, tool, file],
  { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch() }, timeout: 60_000 })

test('the hook reports a syntax error without failing the edit', () => {
  const dir = scratch()
  const bad = join(dir, 'broken.mjs')
  writeFileSync(bad, 'function (( {\n')
  const got = run('Edit', bad)
  assert.equal(got.status, 0, 'advisory: a syntax error must never fail the edit')
  assert.match(`${got.stdout}${got.stderr}`, /broken\.mjs|SyntaxError|Unexpected/,
    `it must say what it found: ${got.stdout}${got.stderr}`)

  // The must-fail direction: a VALID file of the same type prints nothing. Without
  // this, a hook that echoed on every call would satisfy the assertion above.
  const good = join(dir, 'fine.mjs')
  writeFileSync(good, 'export const x = 1\n')
  const quiet = run('Edit', good)
  assert.equal(quiet.status, 0)
  assert.equal(`${quiet.stdout}${quiet.stderr}`.trim(), '',
    `a valid file must produce no output: ${quiet.stdout}${quiet.stderr}`)
})

test('the hook only acts on the tools it is for, and on files that exist', () => {
  const dir = scratch()
  const bad = join(dir, 'broken.sh')
  writeFileSync(bad, 'if then fi\n')
  // A tool it is not for: silent, whatever the file says.
  assert.equal(`${run('Bash', bad).stdout}${run('Bash', bad).stderr}`.trim(), '',
    'a non-edit tool must be ignored')
  // The same file through an edit tool IS reported, or the assertion above passes
  // because nothing ever reports.
  const got = run('Write', bad)
  assert.match(`${got.stdout}${got.stderr}`, /syntax error|unexpected/i,
    `bash -n must report a broken script: ${got.stdout}${got.stderr}`)
  // A path that is not there is not an error.
  const missing = run('Edit', join(dir, 'no-such-file.mjs'))
  assert.equal(missing.status, 0)
  assert.equal(`${missing.stdout}${missing.stderr}`.trim(), '', 'a missing file is silent')
})

test('a file type the hook does not handle is silent, not an error', () => {
  const dir = scratch()
  const md = join(dir, 'notes.md')
  writeFileSync(md, '# not a language this hook checks\n')
  const got = run('Edit', md)
  assert.equal(got.status, 0)
  assert.equal(`${got.stdout}${got.stderr}`.trim(), '', 'an unhandled extension must be silent')
})

test('a .js file draws nothing, whether it is a Workflow script, a module or broken', () => {
  // BACKLOG §161 made this hook accept a correct Workflow script, which `node --check` refuses. ADR-102's Amendment
  // (2026-10-14) goes further: a `.js` file's dialect (module, CommonJS, Workflow script, JSX, Flow) cannot be known from
  // the file, and once the hook's output reaches the agent a finding about a valid file is worse than none, so a `.js` is
  // not checked at all. The must-fail direction is the `.mjs` row of "a finding comes only from the file's own parser"
  // and of the parse-goal test: the same parser still names a broken module.
  const dir = scratch()
  const header = 'export const meta = { name: "w", description: "d" }\n'
  const files = {
    'good.js': `${header}if (1) { return { ok: true } }\nreturn { ok: false }\n`,
    'module.js': 'import { join } from "node:path"\nexport const a = join("x", "y")\n',
    'bad.js': `${header}const broken = (\n`,
  }
  for (const [name, text] of Object.entries(files)) {
    const file = join(dir, name)
    writeFileSync(file, text)
    const got = run('Edit', file)
    assert.equal(got.status, 0)
    assert.equal(`${got.stdout}${got.stderr}`.trim(), '', `${name} is not checked: ${got.stdout}${got.stderr}`)
  }
})

test('a checker that could not run is UNRUN, never a finding about the file', () => {
  // ⚠ NODE EXITS 1 FOR ITS OWN STARTUP FAILURES — the same code the parser uses for a
  // finding — so a broken install printed a MODULE_NOT_FOUND stack under the heading
  // "here is what is wrong with your file". Found by a different-lineage review of
  // 2cde29f, 2026-09-07. The hook requires the parser's own completion marker.
  const dir = scratch()
  const subject = join(dir, 'subject.mjs')
  writeFileSync(subject, 'export const meta = { name: "w" }\nconst broken = (\n')

  const copyOf = (into, parser) => {
    mkdirSync(into, { recursive: true })
    const there = join(into, 'post-edit-check.sh')
    writeFileSync(there, readFileSync(hook, 'utf8'))
    if (parser !== null) writeFileSync(join(into, 'workflow-parse.mjs'), parser)
    return there
  }

  const absent = spawnSync('bash', [copyOf(join(dir, 'absent'), null), 'Edit', subject],
    { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch() }, timeout: 60_000 })
  assert.equal(absent.status, 0, 'advisory: a missing checker must not fail the edit')
  assert.match(`${absent.stdout}${absent.stderr}`, /UNRUN/)
  assert.doesNotMatch(`${absent.stdout}${absent.stderr}`, /does not parse as an ES module/)

  const corrupt = spawnSync('bash', [copyOf(join(dir, 'corrupt'), 'const x = (\n'), 'Edit', subject],
    { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch() }, timeout: 60_000 })
  assert.equal(corrupt.status, 0, 'advisory: a broken checker must not fail the edit either')
  assert.match(`${corrupt.stdout}${corrupt.stderr}`, /UNRUN — the syntax check did not complete/,
    `a checker that died must not read as a finding: ${corrupt.stdout}${corrupt.stderr}`)

  // The must-fail direction for this test itself: with a WORKING checker beside it,
  // the same copied hook and the same file produce a finding rather than an UNRUN.
  const working = spawnSync('bash', [copyOf(join(dir, 'working'), readFileSync(
    resolve(testDir, '..', 'plugin', 'scripts', 'workflow-parse.mjs'), 'utf8')), 'Edit', subject],
    { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch() }, timeout: 60_000 })
  assert.match(`${working.stdout}${working.stderr}`, /does not parse as an ES module/,
    `the copied hook must still work when its checker is there: ${working.stdout}${working.stderr}`)
  assert.doesNotMatch(`${working.stdout}${working.stderr}`, /UNRUN/)
  assert.doesNotMatch(`${working.stdout}${working.stderr}`, /QH-PARSE-COMPLETE/,
    'the completion marker is a protocol detail and must not reach the user')
})

test('a dying checker cannot pass itself off as complete by printing the marker', () => {
  // ⚠ THE HOOK USED TO ACCEPT THE TOKEN ANYWHERE IN THE OUTPUT. A checker that died
  // while echoing a source line containing it was then reported as a finding about the
  // user's file. Named by a different-lineage review of 085fb7d; the match is a whole
  // line now, done in shell rather than through `grep -v … || true`, which could not
  // tell its own "nothing matched" from "the filter itself failed".
  const dir = scratch()
  const subject = join(dir, 'subject.mjs')
  writeFileSync(subject, 'export const meta = { name: "w" }\nreturn 1\n')

  const withParser = (into, parser) => {
    mkdirSync(into, { recursive: true })
    const there = join(into, 'post-edit-check.sh')
    writeFileSync(there, readFileSync(hook, 'utf8'))
    writeFileSync(join(into, 'workflow-parse.mjs'), parser)
    return spawnSync('bash', [there, 'Edit', subject],
      { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch() }, timeout: 60_000 })
  }

  const spoof = withParser(join(dir, 'spoof'),
    'console.log("QH-PARSE-COMPLETE and then some")\nprocess.exit(1)\n')
  assert.equal(spoof.status, 0, 'advisory either way')
  assert.match(`${spoof.stdout}${spoof.stderr}`, /UNRUN/,
    `the token inside a longer line is not the marker: ${spoof.stdout}${spoof.stderr}`)

  // The must-fail direction: the same shape with the marker on its OWN line is a
  // finding, so the assertion above is about the line and not about the exit code.
  const honest = withParser(join(dir, 'honest'),
    'console.error("subject.mjs: does not parse as an ES module")\n' +
    'console.log("QH-PARSE-COMPLETE")\nprocess.exitCode = 1\n')
  assert.doesNotMatch(`${honest.stdout}${honest.stderr}`, /UNRUN/,
    `a real finding must not be reported as unchecked: ${honest.stdout}${honest.stderr}`)
  assert.match(`${honest.stdout}${honest.stderr}`, /does not parse as an ES module/)
})

test('the hook picks the parse goal from the extension, and diagnostics cannot forge the marker', () => {
  // Two findings from a third different-lineage review, in one test because they
  // are the same shape: something that is not the checker's verdict being read as
  // one. (1) every JS extension got the either-dialect mode, so a broken `.mjs`
  // drew no advisory. (2) stdout and stderr were merged before the completion
  // marker was looked for, so node echoing a corrupt parser's source could put the
  // exact line `QH-PARSE-COMPLETE` into the output and turn a crash into a finding.
  const dir = scratch()
  const workflowShaped = 'export const meta = { name: "w" }\nreturn 1\n'

  const asMjs = join(dir, 'subject.mjs')
  writeFileSync(asMjs, workflowShaped)
  const mjs = run('Edit', asMjs)
  assert.equal(mjs.status, 0, 'advisory')
  assert.match(`${mjs.stdout}${mjs.stderr}`, /does not parse as an ES module/,
    `a top-level return in a .mjs is broken and must be said: ${mjs.stdout}${mjs.stderr}`)

  // The same bytes as .js draw nothing (a .js is not checked, ADR-102), or the assertion
  // above is just a checker that refuses everything.
  const asJs = join(dir, 'subject.js')
  writeFileSync(asJs, workflowShaped)
  const js = run('Edit', asJs)
  assert.equal(`${js.stdout}${js.stderr}`.trim(), '',
    `the same bytes as .js are not checked: ${js.stdout}${js.stderr}`)

  // A checker whose DIAGNOSTIC contains the marker line: it goes to stderr, which
  // is not the protocol channel, so the run is still reported as not having run.
  const forge = join(dir, 'forge')
  mkdirSync(forge, { recursive: true })
  writeFileSync(join(forge, 'post-edit-check.sh'), readFileSync(hook, 'utf8'))
  writeFileSync(join(forge, 'workflow-parse.mjs'),
    'console.error("QH-PARSE-COMPLETE")\nprocess.exit(1)\n')
  const forged = spawnSync('bash', [join(forge, 'post-edit-check.sh'), 'Edit', asMjs],
    { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch() }, timeout: 60_000 })
  assert.match(`${forged.stdout}${forged.stderr}`, /UNRUN/,
    `the marker on stderr is a diagnostic, not the protocol: ${forged.stdout}${forged.stderr}`)
})

// ADR-102 T1: what the hook prints is handed to the agent (T2), so a clean file must print nothing, whatever checker ran.
// Measured 2026-10-14: `php -l` prints `No syntax errors detected` on a clean file (and `ruff`, run here until T3, printed
// `All checks passed!`). Each row runs the real checker; one that is not installed is a named skip, never a pass.
const has = command => spawnSync('sh', ['-c', `command -v ${command}`], { encoding: 'utf8' }).status === 0
test('a clean file says nothing, and a broken one is still named', async t => {
  const rows = [
    { name: 'a module', file: 'm.mjs', clean: 'export const x = 1\n', broken: 'export const = \n', finds: /m\.mjs|SyntaxError|Unexpected/, needs: 'node' },
    { name: 'a shell script', file: 's.sh', clean: 'echo hi\n', broken: 'if then\n', finds: /s\.sh|syntax error/, needs: 'bash' },
    { name: 'a JSON file', file: 'j.json', clean: '{"a": 1}\n', broken: '{"a": \n', finds: /parse error|j\.json/i, needs: 'jq' },
    { name: 'Python in a project', file: 'p.py', clean: 'x = 1\n', broken: 'def (:\n', finds: /SyntaxError|p\.py/, needs: 'python3', project: true },
    { name: 'Python with no project', file: 'q.py', clean: 'x = 1\n', broken: 'def (:\n', finds: /SyntaxError|q\.py/, needs: 'python3' },
    { name: 'PHP', file: 'r.php', clean: '<?php echo 1;\n', broken: '<?php echo ;\n', finds: /Parse error|syntax error/i, needs: 'php' },
  ]
  for (const row of rows) {
    await t.test(row.name, { skip: has(row.needs) ? false : `${row.needs} is not installed here` }, () => {
      const dir = scratch()
      if (row.project) writeFileSync(join(dir, 'pyproject.toml'), '')
      const target = join(dir, row.file)
      writeFileSync(target, row.clean)
      const quiet = run('Edit', target)
      assert.equal(quiet.status, 0)
      assert.equal(`${quiet.stdout}${quiet.stderr}`.trim(), '', `${row.name}: a clean file must print nothing: ${quiet.stdout}${quiet.stderr}`)
      // DIRTY twin: the same checker still names a broken file, so "nothing" is not a checker that stopped running.
      writeFileSync(target, row.broken)
      const loud = run('Edit', target)
      assert.equal(loud.status, 0, 'advisory: a finding never fails the edit')
      assert.match(`${loud.stdout}${loud.stderr}`, row.finds, `${row.name}: ${loud.stdout}${loud.stderr}`)
    })
  }
})

// ADR-102 T3 (the Amendment): each of the silent rows below drew a finding before, reproduced 2026-10-14, and once the hook's
// output reaches the agent (T2) a finding about a valid file is worse than none. Every row runs the real checker through the
// `run` helper (its own TMPDIR, so the per-file debounce never decides a row); the fence refuses a skip.
test("a finding comes only from the file's own parser", () => {
  const dir = scratch()
  writeFileSync(join(dir, 'pyproject.toml'), '')
  const said = (file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = run('Edit', target)
    assert.equal(got.status, 0, 'advisory: never fails the edit')
    return `${got.stdout}${got.stderr}`.trim()
  }
  const silent = {
    'legacy.cjs': 'const fs = require("fs")\nif (!fs) return\nmodule.exports = 1\n',
    'component.js': 'const a = <div>hi</div>\nexport default a\n',
    'broken.js': 'const broken = (\n',
    'tsconfig.json': '{\n  // TypeScript reads comments\n  "compilerOptions": { "strict": true, },\n}\n',
    'strings.json': '{"url": "http://x", "s": "a,}"}\n',
    'escape.py': 'import re\nx = re.compile("\\d")\n',
    'lint.py': 'import os\n',
  }
  for (const [file, text] of Object.entries(silent)) assert.equal(said(file, text), '', `${file} is valid for its own toolchain`)
  // DIRTY twins: the same checkers still name a real syntax error.
  assert.match(said('bad.cjs', 'const = 1\n'), /bad\.cjs|SyntaxError/)
  assert.match(said('bad.json', '{"a": \n'), /parse error/i)
  assert.match(said('bad.py', 'def (:\n'), /SyntaxError/)
})

// ADR-102 T2: exit-0 PostToolUse stdout is shown in the transcript only, so the finding is handed to the agent as
// additionalContext, through the same wrapper the hook runs in (`run-shell-hook.mjs`). Each call has its own temp and data
// directories, so neither the debounce nor an earlier call's ledger decides a row.
const wrapper = resolve(testDir, '..', 'plugin', 'scripts', 'run-shell-hook.mjs')
const throughTheHook = file => {
  const home = scratch()
  return spawnSync(process.execPath, [wrapper, 'post-edit-check.sh'], {
    cwd: dirname(file), encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, TMPDIR: home, TEMP: home, TMP: home, HOME: home, CLAUDE_PLUGIN_DATA: join(home, 'data') },
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', session_id: 'adr-102', cwd: dirname(file), tool_input: { file_path: file } }),
  })
}
test('a syntax finding at the edit reaches the agent, and a clean edit hands it nothing', () => {
  const dir = scratch()
  const broken = join(dir, 'broken.mjs')
  writeFileSync(broken, 'export const = 1\n')
  const loud = throughTheHook(broken)
  assert.equal(loud.status, 0, 'advisory: never fails the edit')
  const answer = JSON.parse(loud.stdout)
  assert.equal(answer.hookSpecificOutput?.hookEventName, 'PostToolUse')
  assert.match(answer.hookSpecificOutput?.additionalContext ?? '', /broken\.mjs|does not parse/,
    `the diagnostic is in the agent's context: ${loud.stdout}`)
  // CLEAN twins, and the T1 and T3 contract at this boundary: a clean module, a clean PHP file and a Python file with lint
  // debt beside a pyproject.toml hand the agent nothing at all.
  writeFileSync(join(dir, 'pyproject.toml'), '')
  for (const [file, text] of [['fine.mjs', 'export const x = 1\n'], ['fine.php', '<?php echo 1;\n'], ['lint.py', 'import os\n']]) {
    const target = join(dir, file)
    writeFileSync(target, text)
    const quiet = throughTheHook(target)
    assert.equal(quiet.status, 0)
    assert.equal(quiet.stdout, '', `${file} hands the agent nothing: ${quiet.stdout}`)
  }
})

// ADR-102 T4: an outside run (wcag-web, 2026-10-14) read what the agent would be handed for a broken JSON and a broken
// Python file: a jq error naming no file, and an eleven-line traceback through `<string>` and the interpreter's ast.py.
test('a finding names the edited file and gives the error alone', () => {
  const dir = scratch()
  const said = (file, content) => {
    const target = join(dir, file)
    writeFileSync(target, content)
    const got = run('Edit', target)
    assert.equal(got.status, 0)
    return { text: `${got.stdout}${got.stderr}`, target }
  }
  const json = said('bad.json', '{"a": }\n')
  assert.ok(json.text.includes(json.target), `the JSON finding names its file: ${json.text}`)
  assert.match(json.text, /parse error/)
  const py = said('bad.py', 'x = 1\ndef (:\n')
  assert.ok(py.text.startsWith(`${py.target}:2:`), `the Python finding starts with path:line: ${py.text}`)
  assert.match(py.text, /SyntaxError: invalid syntax/)
  assert.doesNotMatch(py.text, /Traceback|<string>|ast\.py/, `no traceback: ${py.text}`)
  assert.ok(py.text.trim().split('\n').length <= 2, `the error and its line, no more: ${py.text}`)
  // A file Python cannot decode is a broken file too, said as one line about that file.
  const binary = join(dir, 'binary.py')
  writeFileSync(binary, Buffer.from([0x78, 0x3d, 0xff, 0xfe, 0x0a]))
  const got = run('Edit', binary)
  assert.ok(`${got.stdout}${got.stderr}`.startsWith(binary), `named: ${got.stdout}${got.stderr}`)
  assert.doesNotMatch(`${got.stdout}${got.stderr}`, /Traceback/)
})

// ADR-102 T4, from a second outside run (wcag-docs, 2026-10-14): `node --check` follows the error with node's own stack
// frames, a version line and blank lines, none of which is about the edited file.
test("a CommonJS finding is the error, not node's stack", () => {
  const dir = scratch()
  const bad = join(dir, 'bad.cjs')
  writeFileSync(bad, 'module.exports = {\n')
  const got = run('Edit', bad)
  assert.equal(got.status, 0)
  const text = `${got.stdout}${got.stderr}`
  assert.ok(text.includes(bad), `names the file: ${text}`)
  assert.match(text, /SyntaxError: Unexpected end of input/)
  assert.doesNotMatch(text, /^ {4}at |^Node\.js v|\n\s*\n/m, `the error alone: ${JSON.stringify(text)}`)
})

// ADR-102 T5: php -l printed its parse error twice, once to the error log and once to the display (an outside run,
// 2026-10-14), and which one shows depends on the host's php.ini. The ini below turns the display off and the log on,
// the opposite of what the check asks for, so the check has to set both itself.
test('a PHP finding is said once', () => {
  const dir = scratch()
  const bad = join(dir, 'bad.php')
  writeFileSync(bad, '<?php function (\n')
  const ini = join(dir, 'ini')
  mkdirSync(ini)
  writeFileSync(join(ini, 'zz-qh.ini'), 'display_errors=0\nlog_errors=1\n')
  for (const env of [{}, { PHP_INI_SCAN_DIR: ini }]) {
    const got = spawnSync('bash', [hook, 'Edit', bad], { encoding: 'utf8', env: { ...process.env, ...env, TMPDIR: scratch() }, timeout: 60_000 })
    const text = `${got.stdout}${got.stderr}`
    assert.equal(got.status, 0)
    assert.equal((text.match(/Parse error:/g) ?? []).length, 1, `once: ${JSON.stringify(text)}`)
    assert.match(text, /bad\.php on line 2/)
    assert.doesNotMatch(text, /\n\s*\n|^\s*\n/, `no blank line: ${JSON.stringify(text)}`)
  }
})
