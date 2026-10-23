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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { remove } from './helpers/remove.mjs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { required } from './helpers/require.mjs'
import { testBash } from './helpers/bash.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const hook = resolve(testDir, '..', 'plugin', 'scripts', 'post-edit-check.sh')

const temps = []
test.after(() => { for (const t of temps) remove(t) })
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'qh-hook-')); temps.push(d); return d }

// A fresh TMPDIR per run, or the script's own 5-second debounce makes a second
// call in the same second silently exit 0 and the test measures the debounce
// rather than the check.
const run = (tool, file) => spawnSync(testBash(), [hook, tool, file],
  { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch() }, timeout: 60_000 })

// BACKLOG §381 item 18 (ADR-119 T4): two assertions read jq's own words, which a host without jq cannot print, so there they
// skip with the reason rather than fail.
const jqProbe = spawnSync('jq', ['--version'], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
const noJq = required('jq', jqProbe.error || jqProbe.status !== 0
  ? `jq is not on PATH (${jqProbe.error?.code ?? `exit ${jqProbe.status}`}), so jq's own parse error cannot be read here` : false)

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
const has = command => spawnSync('sh', ['-c', `command -v ${command}`], { encoding: 'utf8', timeout: 10_000 }).status === 0
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
// the opposite of what the check asks for, so the check has to set both itself. Counting alone could not tell the two
// apart where php.ini already turns the display off (Ubuntu's, CI at 380e40c): the log's line is `PHP Parse error:`.
test('a PHP finding is said once', { skip: has('php') ? false : 'php is not installed here' }, () => {
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
    assert.doesNotMatch(text, /PHP Parse error/, `the display, not the log: ${JSON.stringify(text)}`)
  }
})

// ADR-102 T6, from a Codex review of v3.8.26..aede09ce (2026-10-14), each checked against TypeScript's own parser there.
test('JSONC is read as TypeScript reads it', t => {
  const dir = scratch()
  const said = (file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = run('Edit', target)
    assert.equal(got.status, 0)
    return `${got.stdout}${got.stderr}`.trim()
  }
  const valid = {
    'bom.json': '﻿{"a":1,}\n',
    'lf.json': '{\n// c\n"a":1,\n}\n',
    'crlf.json': '{\r\n// c\r\n"a":1,\r\n}\r\n',
    'cr.json': '{\r// c\r"a":1,\r}\r',
  }
  for (const [file, text] of Object.entries(valid)) assert.equal(said(file, text), '', `${file} is valid JSONC`)
  // DIRTY: a comment between two halves of a token does not join them.
  if (noJq) return t.skip(noJq)
  assert.match(said('split-number.json', '{"a":1/*c*/2}\n'), /split-number\.json: jq: parse error/)
  assert.match(said('split-literal.json', '{"a":tru/*c*/e}\n'), /split-literal\.json: jq: parse error/)
})

test('a checker that fails without a word is UNRUN, and the hook exits 0', () => {
  const dir = scratch()
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  for (const tool of ['node', 'php']) writeFileSync(join(bin, tool), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  for (const file of ['silent.cjs', 'silent.php']) {
    const target = join(dir, file)
    writeFileSync(target, file.endsWith('.php') ? '<?php echo 1;\n' : 'module.exports = 1\n')
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: scratch() }, timeout: 60_000 })
    assert.equal(got.status, 0, `${file}: advice never fails the edit: ${got.stderr}`)
    assert.match(`${got.stdout}${got.stderr}`, /UNRUN/, `${file}: a silent failure is could-not-look: ${got.stdout}${got.stderr}`)
  }
})

// ADR-102 T7, from the verification review of T6 (Codex, 2026-10-14): the fallback's trailing-comma rule also removed a
// comma that follows `[`, `{` or another comma, so `{"a":[,]}`, which TypeScript refuses, read as valid JSONC.
test('a comma with no value before it is not a trailing comma', t => {
  const dir = scratch()
  const said = (file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    return `${run('Edit', target).stdout}`.trim()
  }
  for (const [file, text] of [['empty-array.json', '{"a":[,]}\n'], ['double.json', '{"a":[1,,]}\n'], ['empty-object.json', '{,}\n']]) {
    if (!noJq) assert.match(said(file, text), new RegExp(`${file.replace('.', '\\.')}: jq: parse error`), `${file} is broken JSONC`)
  }
  // CLEAN twins: a real trailing comma, one before a space, and one inside a string stay valid.
  for (const [file, text] of [['trailing.json', '{"a":[1,],}\n'], ['spaced.json', '{"a":[1 , ]}\n'], ['string.json', '{"s":"[,]",}\n']]) {
    assert.equal(said(file, text), '', `${file} is valid JSONC`)
  }
  if (noJq) t.skip(noJq)
})

// ADR-102 T8, from CI at 380e40c (2026-10-14): Windows' console is cp1252, so printing the source line of an undecodable
// file raised inside the handler and the agent was handed a traceback. PYTHONIOENCODING stands in for that console here.
test('a Python finding survives a console that cannot encode its line', () => {
  const binary = join(scratch(), 'binary.py')
  writeFileSync(binary, Buffer.from([0x78, 0x3d, 0xff, 0xfe, 0x0a]))
  const got = spawnSync('bash', [hook, 'Edit', binary], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'cp1252', TMPDIR: scratch() }, timeout: 60_000 })
  const text = `${got.stdout}${got.stderr}`
  assert.equal(got.status, 0)
  assert.ok(text.startsWith(`${binary}:1:`), `named: ${text}`)
  assert.doesNotMatch(text, /Traceback|UnicodeEncodeError/, `no traceback: ${text}`)
  assert.ok(text.trim().split('\n').length <= 2, `the error and its line, no more: ${text}`)
})

// ADR-102 T9, from an outside run on Windows (2026-10-14): `python3` there was the Microsoft Store alias, which prints an
// install hint and exits 9009, and the hook handed that hint to the agent as its finding while the file went unchecked.
test('a python3 that is not Python is not a checker', () => {
  const dir = scratch()
  const real = spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', timeout: 10_000 }).stdout.trim()
  const alias = '#!/bin/sh\necho "Python was not found; run without arguments to install from the Microsoft Store"\nexit 9009\n'
  const onPath = tools => {
    const bin = mkdtempSync(join(dir, 'bin-'))
    for (const [name, body] of Object.entries(tools)) writeFileSync(join(bin, name), body, { mode: 0o755 })
    return bin
  }
  const said = (bin, file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: scratch() }, timeout: 60_000 })
    assert.equal(got.status, 0)
    return `${got.stdout}${got.stderr}`
  }
  // The alias first and a real interpreter as `python`: the real one reads the file.
  const both = onPath({ python3: alias, python: `#!/bin/sh\nexec "${real}" "$@"\n` })
  const broken = said(both, 'bad.py', 'def (:\n')
  assert.match(broken, /bad\.py:1:\d+: SyntaxError/, `checked by the real interpreter: ${broken}`)
  assert.doesNotMatch(broken, /Microsoft Store/)
  assert.equal(said(both, 'good.py', 'x = 1\n'), '', 'a valid file is silent')
  // The alias as both names: nothing looked, so nothing is said, and never the alias's own text.
  assert.equal(said(onPath({ python3: alias, python: alias }), 'bad-too.py', 'def (:\n'), '')
})

// ADR-102 T10, from the Windows outside runs of v3.8.27 (2026-10-14): none of four hosts had jq, so no .json was ever read
// there. node reads it alone. QUALITY_HARNESS_JQ names a jq that is not installed, as on those hosts.
test('without jq, node reads JSON as JSONC', () => {
  const dir = scratch()
  const said = (file, text, extra = {}) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, QUALITY_HARNESS_JQ: 'qh-no-such-jq', TMPDIR: scratch(), ...extra }, timeout: 60_000 })
    assert.equal(got.status, 0)
    return { text: `${got.stdout}${got.stderr}`.trim(), target }
  }
  // DIRTY: broken JSON is named, with its file, and no stack.
  for (const [file, text] of [['bad.json', '{"a": }\n'], ['empty-array.json', '{"a":[,]}\n']]) {
    const { text: out, target } = said(file, text)
    assert.ok(out.startsWith(`${target}: `), `${file} is named: ${out}`)
    assert.doesNotMatch(out, /UNRUN|^\s+at |node:internal/m, `${file}: the error alone: ${out}`)
  }
  // CLEAN twins: JSON, JSONC with comments and trailing commas, and a leading BOM are silent.
  for (const [file, text] of [['good.json', '{"a":1}\n'], ['jsonc.json', '// c\n{"a":[1,],/* d */}\n'], ['bom.json', '﻿{"a":1}\n']]) {
    assert.equal(said(file, text).text, '', `${file} is valid JSONC`)
  }
  // A node that fails without a word could not look.
  const bin = mkdtempSync(join(dir, 'bin-'))
  writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  assert.match(said('silent.json', '{"a":1}\n', { PATH: `${bin}:${process.env.PATH}` }).text, /UNRUN/)
})

// ADR-102 T11, from the Codex review of T10 (2026-10-14): without jq, a node that failed before the reader ran (here a
// NODE_OPTIONS module that does not exist) had its own stack named as a finding about a valid file.
test('a node that cannot start says nothing about the file', () => {
  const dir = scratch()
  for (const [file, text] of [['valid.json', '{"a":1}\n'], ['broken.json', '{"a": }\n']]) {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, QUALITY_HARNESS_JQ: 'qh-no-such-jq', NODE_OPTIONS: '--require=qh-no-such-module', TMPDIR: scratch() }, timeout: 60_000 })
    const out = `${got.stdout}${got.stderr}`
    assert.equal(got.status, 0)
    assert.match(out, /^UNRUN/, `${file}: node could not look: ${out}`)
    assert.doesNotMatch(out, /MODULE_NOT_FOUND|^\s+at |Node\.js v/m, `${file}: nothing of node's own: ${out}`)
  }
})

// ADR-102 T12, from the Codex review of T11 (2026-10-14): node's own stderr ahead of the reader's marker (an inspector
// starting, a preload that writes) turned a real parse error into UNRUN. The marker is read from stdout alone.
test("a finding is read from the reader's own output, not node's", () => {
  const dir = scratch()
  const preload = join(dir, 'noise.cjs').replace(/\\/g, '/')
  writeFileSync(preload, 'process.stderr.write("noise before the reader\\n")\n')
  const said = (file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, QUALITY_HARNESS_JQ: 'qh-no-such-jq', NODE_OPTIONS: `--require="${preload}"`, TMPDIR: scratch() }, timeout: 60_000 })
    assert.equal(got.status, 0)
    return { text: `${got.stdout}${got.stderr}`.trim(), target }
  }
  const broken = said('broken.json', '{"a": }\n')
  assert.ok(broken.text.startsWith(`${broken.target}: `), `a reader that ran is heard: ${broken.text}`)
  assert.doesNotMatch(broken.text, /UNRUN|noise/, `the reader's words alone: ${broken.text}`)
  assert.equal(said('valid.json', '{"a":1}\n').text, '', 'a valid file is silent')
})

// ADR-102 T13, from an outside run at the 3.8.28 candidate (2026-10-14): node's parse error quotes the file's text with its
// newlines, so without jq one finding spanned several lines.
test('a JSON finding from node is one line', () => {
  const dir = scratch()
  for (const [file, text] of [['short.json', '{"a": }\n'], ['long.json', '{\n  "a": 1,\n  "b": ,\n  "c": 3\n}\n']]) {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, QUALITY_HARNESS_JQ: 'qh-no-such-jq', TMPDIR: scratch() }, timeout: 60_000 })
    const out = `${got.stdout}${got.stderr}`
    assert.equal(got.status, 0)
    assert.ok(out.startsWith(`${target}: `), `${file} is named: ${out}`)
    assert.equal(out.trimEnd().split('\n').length, 1, `${file}: one line: ${JSON.stringify(out)}`)
  }
})

// BACKLOG §381 item 16, from an outside run at bb8e7acb (2026-10-14): node's finding named no line. Where its message carries
// a position, it is the file's: a comment collapsed to one space put an error on line 6 at line 4 (measured 2026-10-16, node
// 24.11.1). The `path: ` form stays, as ADR-102 T14's test holds it.
test("a JSON finding from node names the file's line and column", () => {
  const dir = scratch()
  const said = (file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, QUALITY_HARNESS_JQ: 'qh-no-such-jq', TMPDIR: scratch() }, timeout: 60_000 })
    assert.equal(got.status, 0)
    return { text: `${got.stdout}${got.stderr}`.trim(), target }
  }
  const positions = text => (text.match(/\(line \d+ column \d+\)/g) ?? []).length
  for (const [file, text, where] of [
    ['block.json', '{\n  /* one\n     two\n     three */\n  "a": 1\n  "b": 2\n}\n', '(line 6 column 3)'],
    ['line.json', '{\n  "a": [1,], /* c */ "b": 1 "c": 2\n}\n', '(line 2 column 29)'],
    ['crlf.json', '{\r\n  // c\r\n  "a": 1\r\n  "b": 2\r\n}\r\n', '(line 4 column 3)'],
  ]) {
    const { text: out, target } = said(file, text)
    assert.ok(out.startsWith(`${target}: `) && out.endsWith(where), `${file} is placed at ${where}: ${out}`)
    // A message that already carries a position gets no second one.
    assert.equal(positions(out), 1, `${file} is placed once: ${out}`)
  }
  // ADR-119 T4: a message with no position (`Unexpected token`) is placed at the token node names, the first bad one in the
  // masked text: the `}` after `tru`, and on a later line the same, after a comment, a `}` that is not bad, and CRLFs.
  for (const [file, text, where] of [
    ['token.json', '{"a": tru}\n', '(line 1 column 10)'],
    ['later.json', '{\r\n  /* c */ "b": {},\r\n  "a": nul}\r\n', '(line 3 column 11)'],
  ]) {
    const { text: out, target } = said(file, text)
    assert.ok(out.startsWith(`${target}: Unexpected token`) && out.endsWith(where), `${file} is placed at ${where}: ${out}`)
    assert.equal(positions(out), 1, `${file} is placed once: ${out}`)
  }
})

// ADR-102 T14, from an outside run of the 3.8.28 candidate on Windows (2026-10-14): a .mcp.json holding one newline was
// named by node, while `jq empty` accepts it, so the same file was silent wherever jq is installed.
test('a JSON file with nothing in it reads the same with and without jq', () => {
  const dir = scratch()
  const said = (file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, QUALITY_HARNESS_JQ: 'qh-no-such-jq', TMPDIR: scratch() }, timeout: 60_000 })
    assert.equal(got.status, 0)
    return `${got.stdout}${got.stderr}`.trim()
  }
  for (const [file, text] of [['empty.json', ''], ['newline.json', '\n'], ['crlf.json', '\r\n'], ['comment.json', '// nothing yet\n']]) {
    assert.equal(said(file, text), '', `${file} is read as jq reads it`)
  }
  // DIRTY twin: an unclosed object is still named.
  assert.match(said('open.json', '{\n'), /open\.json: /)
})

// ADR-102 T15, the .cjs sibling of T11 (2026-10-14): node --check that could not start printed MODULE_NOT_FOUND, minus its
// stack frames, as a finding about the file.
test('a node that cannot start says nothing about a .cjs file', () => {
  const dir = scratch()
  const said = (file, text, extra = {}) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, TMPDIR: scratch(), ...extra }, timeout: 60_000 })
    assert.equal(got.status, 0)
    return `${got.stdout}${got.stderr}`.trim()
  }
  for (const [file, text] of [['valid.cjs', 'module.exports = 1\n'], ['broken.cjs', 'module.exports = {\n']]) {
    const out = said(file, text, { NODE_OPTIONS: '--require=qh-no-such-module' })
    assert.match(out, /^UNRUN/, `${file}: node could not look: ${out}`)
    assert.doesNotMatch(out, /MODULE_NOT_FOUND|Cannot find module/, `${file}: nothing of node's own: ${out}`)
  }
  // DIRTY twin: with a node that starts, the broken file is still named.
  assert.match(said('broken-too.cjs', 'module.exports = {\n'), /SyntaxError/)
})

// From an outside run at the 3.8.29 candidate (2026-10-14): the UNRUN line said node "could not read" the file, which
// sends an agent to the file's permissions when node itself did not start. It names node as what failed.
test('an UNRUN line names node, not the file, as what failed', () => {
  const dir = scratch()
  for (const [file, text, extra] of [['valid.cjs', 'module.exports = 1\n', {}], ['valid.json', '{"a":1}\n', { QUALITY_HARNESS_JQ: 'qh-no-such-jq' }]]) {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = spawnSync('bash', [hook, 'Edit', target], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--require=qh-no-such-module', TMPDIR: scratch(), ...extra }, timeout: 60_000 })
    const out = `${got.stdout}${got.stderr}`
    assert.match(out, /^UNRUN — node did not check .*could not start/, `${file}: node is what failed: ${out}`)
    assert.doesNotMatch(out, /could not read/, `${file}: the file is not blamed: ${out}`)
  }
})

// BACKLOG §381, item 5 (the scoped review of ADR-102 T7, Codex, 2026-10-14): the fallback ended a line comment at CR
// or LF only, so a comment ending at U+2028 swallowed the code after it and `{"a":1,//c<U+2028> "b": <LF>}`, which
// TypeScript refuses, read as valid. TypeScript ends the comment there and reads the separator as whitespace.
test('a line comment ends at U+2028 and U+2029, as TypeScript reads one', () => {
  const dir = scratch()
  const said = (file, text) => {
    const target = join(dir, file)
    writeFileSync(target, text)
    const got = run('Edit', target)
    assert.equal(got.status, 0)
    return `${got.stdout}`.trim()
  }
  for (const separator of [' ', ' ']) {
    const name = `sep-${separator.charCodeAt(0).toString(16)}`
    // DIRTY: the code after the separator is read, and it is broken.
    assert.match(said(`${name}-broken.json`, `{"a":1,//c${separator} "b": \n}\n`), new RegExp(`${name}-broken\\.json: jq: parse error`))
    // CLEAN twin: a comment ended by the separator, with valid code around it, is valid JSONC.
    assert.equal(said(`${name}-valid.json`, `{"a":1 //c${separator}}\n`), '', `${name}: a separator is whitespace, as TypeScript reads it`)
  }
})
