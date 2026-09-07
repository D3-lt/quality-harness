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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('a Workflow script is not reported as broken, and a broken one still is', () => {
  // BACKLOG §161. `node --check` refuses a correct Workflow script — `Illegal return
  // statement` on every one of the three shipped workflows under node 26 — so this
  // hook, which runs after EVERY edit, would print a SyntaxError over correct code
  // for anyone authoring one. An advisory that is always wrong on a whole file type
  // is one a reader learns to skip (ADR-037).
  const dir = scratch()
  const header = 'export const meta = { name: "w", description: "d" }\n'

  const good = join(dir, 'good.js')
  writeFileSync(good, `${header}if (1) { return { ok: true } }\nreturn { ok: false }\n`)
  const quiet = run('Edit', good)
  assert.equal(quiet.status, 0)
  assert.equal(`${quiet.stdout}${quiet.stderr}`.trim(), '',
    `a correct Workflow script must draw no advisory: ${quiet.stdout}${quiet.stderr}`)

  // An ordinary ES module of the same extension is silent too — the hook accepts
  // either dialect, so widening it must not have cost the common case.
  const mod = join(dir, 'module.js')
  writeFileSync(mod, 'import { join } from "node:path"\nexport const a = join("x", "y")\n')
  const alsoQuiet = run('Edit', mod)
  assert.equal(`${alsoQuiet.stdout}${alsoQuiet.stderr}`.trim(), '',
    `a correct ES module must draw no advisory: ${alsoQuiet.stdout}${alsoQuiet.stderr}`)

  // The must-fail direction, and it is the one that was VACUOUS: `node --check` on a
  // .js file containing an `export` exits 0 whatever follows, on the node CI pins, so
  // the hook said nothing about a broken file for as long as it has shipped.
  // ⚠ An unbalanced BRACE would not prove it either — `node --check` wraps a file it
  // reads as CommonJS and the wrapper's own closing brace completes it (measured
  // 2026-09-07: exit 0 on `if (1) { return { ok: true }`). An unclosed paren cannot be
  // completed that way, so it is refused in both dialects.
  const bad = join(dir, 'bad.js')
  writeFileSync(bad, `${header}const broken = (\n`)
  const loud = run('Edit', bad)
  assert.equal(loud.status, 0, 'advisory: it still must not fail the edit')
  assert.match(`${loud.stdout}${loud.stderr}`, /parses as neither a module nor a Workflow script/,
    `it must say both dialects were tried: ${loud.stdout}${loud.stderr}`)
  assert.match(`${loud.stdout}${loud.stderr}`, /bad\.js/,
    'the advice must name the file the user edited, not the copy the check made')
  assert.doesNotMatch(`${loud.stdout}${loud.stderr}`, /candidate\.mjs/,
    'the copy is an implementation detail and is deleted before the reader could open it')
})
