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
