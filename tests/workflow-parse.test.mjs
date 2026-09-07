// A Workflow script parses under neither of node's two module goals, so `node
// --check` was never answering the question it was asked here: node v24.11.1 passed
// all three shipped workflows and v26.8.1 failed every one of them, on bytes that
// had not changed and a runtime that accepts both. These tests pin what the
// replacement accepts AND what it refuses — a checker only ever shown returning
// clean is one nothing has proven can return dirty (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkJsSource, checkWorkflowFiles, checkWorkflowSource } from '../plugin/scripts/workflow-parse.mjs'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..')
const checker = join(repoRoot, 'plugin', 'scripts', 'workflow-parse.mjs')

const HEADER = 'export const meta = { name: "w", description: "d" }\n'

test('a top-level return is accepted, because that is how a workflow returns its result', () => {
  assert.equal(checkWorkflowSource(`${HEADER}if (1) { return { ok: true } }\nreturn { ok: false }\n`), null)
})

test('a top-level await is accepted, because agent() is awaited at the top level', () => {
  assert.equal(checkWorkflowSource(`${HEADER}const r = await Promise.resolve(1)\nreturn r\n`), null)
})

test('a real syntax error is still refused, so the check can come back dirty', () => {
  const failure = checkWorkflowSource(`${HEADER}if (1) { return 2\n`, 'broken.js')
  assert.ok(failure?.startsWith('broken.js: '), `expected a named failure, read ${failure}`)
})

test('an export the format does not permit is refused rather than quietly stripped', () => {
  // Only `export <declaration>` is removed. `export default` and `export {…}` are
  // not part of the Workflow contract, and tolerating one would widen the dialect
  // this checker claims to implement.
  assert.ok(checkWorkflowSource(`${HEADER}export default 1\n`, 'd.js'))
  assert.ok(checkWorkflowSource(`${HEADER}const a = 1\nexport { a }\n`, 'b.js'))
})

test('a static import is refused, because a workflow script is self-contained', () => {
  assert.ok(checkWorkflowSource(`${HEADER}import fs from 'node:fs'\n`, 'i.js'))
})

test('an unreadable file says COULD NOT READ, never that it does not parse', () => {
  const [failure, ...rest] = checkWorkflowFiles([join(tmpdir(), 'no-such-workflow-' + Date.now() + '.js')])
  assert.deepEqual(rest, [])
  assert.match(failure, /COULD NOT READ/)
  assert.doesNotMatch(failure, /parse/i)
})

test('every shipped workflow parses, and there is more than nothing to check', () => {
  const dir = join(repoRoot, 'plugin', 'workflows')
  const files = readdirSync(dir).filter(name => name.endsWith('.js')).map(name => join(dir, name))
  assert.ok(files.length >= 3, `expected the shipped workflows, read ${files.length}`)
  assert.deepEqual(checkWorkflowFiles(files), [])
})

test('the CLI exits 1 naming the bad file, 0 on a good one, 2 with no argument', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-parse-'))
  try {
    const good = join(dir, 'good.js')
    const bad = join(dir, 'bad.js')
    writeFileSync(good, `${HEADER}return 1\n`)
    writeFileSync(bad, `${HEADER}if (1) { return 2\n`)

    const ok = spawnSync(process.execPath, [checker, good], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(ok.status, 0, ok.stderr)

    const red = spawnSync(process.execPath, [checker, good, bad], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(red.status, 1, red.stderr)
    assert.match(red.stderr, /bad\.js/)
    assert.doesNotMatch(red.stderr, /good\.js/)

    const usage = spawnSync(process.execPath, [checker], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(usage.status, 2, usage.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--js accepts an ES module, accepts a Workflow script, and refuses neither-of-those', () => {
  // ⚠ THIS IS THE ARM `node --check` COULD NOT DO. On v24.11.1 — the version
  // .github/workflows/selftest.yml pins — `node --check` exits 0 on a .js file that
  // contains an `export`, whatever syntax error follows, so the obvious call is
  // vacuous on exactly the files it is most often pointed at (BACKLOG §161).
  assert.equal(checkJsSource('import { join } from "node:path"\nexport const a = join("x","y")\n'), null)
  assert.equal(checkJsSource(`${HEADER}return 1\n`), null)

  const failure = checkJsSource(`${HEADER}const broken = (\n`, 'both.js')
  assert.match(failure, /both\.js: parses as neither a module nor a Workflow script/)
  // The copy this check writes is gone by the time anyone reads the message.
  assert.doesNotMatch(failure, /candidate\.mjs/)
})

test('`node --check` on the .js file disagrees with this checker, on whichever node is running', t => {
  // The claim the fix rests on, stated so it can fail. A test that only asserts the
  // new checker's answers cannot tell you the checker stopped being NECESSARY.
  // Both known divergences are asserted as a set, because which one bites depends on
  // the node in use and neither is guaranteed to survive a release:
  //   node 24 — `--check` says a broken .js file is FINE, if it contains an `export`
  //   node 26 — `--check` says a correct Workflow script is BROKEN
  // If a future node has neither, this goes red, and the .mjs copy plus the async
  // function body in checkJsSource are then paying for nothing.
  const dir = mkdtempSync(join(tmpdir(), 'wf-divergence-'))
  try {
    const check = (base, text) => {
      const file = join(dir, base)
      writeFileSync(file, text)
      return spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 60_000 }).status
    }
    const brokenAfterExport = 'export const a = 1\nconst broken = (\n'
    const workflow = `${HEADER}return 1\n`

    // The .mjs half is the anti-vacuity guard: if node stopped refusing an unbalanced
    // paren under the module goal, every "refused" below would be meaningless.
    assert.notEqual(check('guard.mjs', brokenAfterExport), 0,
      'the module goal must refuse an unbalanced paren, or nothing here proves anything')

    const acceptsBroken = check('broken.js', brokenAfterExport) === 0
    const refusesWorkflow = check('workflow.js', workflow) !== 0
    t.diagnostic(`node ${process.version}: --check accepts a broken .js after an export=${acceptsBroken}, ` +
      `refuses a correct Workflow script=${refusesWorkflow}`)

    assert.ok(acceptsBroken || refusesWorkflow,
      `node ${process.version} agrees with this checker on both known divergences — ` +
      'the .mjs copy and the async-function-body parse in checkJsSource may now be redundant')

    // Whichever way node is wrong, the checker is right.
    assert.ok(checkJsSource(brokenAfterExport, 'b.js'), 'a broken file must still be refused')
    assert.equal(checkJsSource(workflow, 'w.js'), null, 'a correct Workflow script must still be accepted')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Everything below closes a finding from the different-lineage review of 2cde29f
// (2026-09-07). Each one was a way to get a FLATTERING answer out of this checker.

test('the required `export const meta` header is required, and only it is stripped', () => {
  // The first cut stripped every column-zero declaration export, globally, and never
  // asked for the header at all — so a file that is not a Workflow script at all, or
  // one carrying exports the format does not have, came back clean.
  assert.equal(checkWorkflowSource(`${HEADER}return 1\n`), null)
  assert.equal(checkWorkflowSource(`// a leading comment is ordinary\n${HEADER}return 1\n`), null)
  // ⚠ THE OTHER SIGN OF THE SAME DEFECT: a gate that REFUSES correct files. With
  // `\s*` only inside the comment group, a blank first line and a UTF-8 BOM both made
  // the header unfindable and a correct workflow was reported broken. CRLF has to
  // work too — this repository blocks CI on Windows (CLAUDE.md §7).
  assert.equal(checkWorkflowSource(`\n\n${HEADER}return 1\n`), null, 'a blank first line')
  assert.equal(checkWorkflowSource(`﻿${HEADER}return 1\n`), null, 'a UTF-8 BOM')
  assert.equal(checkWorkflowSource(`// c\r\n${HEADER}return 1\n`), null, 'a CRLF comment line')
  // A comment that merely MENTIONS the header is not one; the real token must follow.
  assert.equal(checkWorkflowSource(`/* export const meta */\n${HEADER}return 1\n`), null)
  assert.match(checkWorkflowSource('/* export const meta = {} */\nreturn 1\n', 'e.js'),
    /no `export const meta` header/)

  assert.match(checkWorkflowSource('return 1\n', 'a.js'), /no `export const meta` header/)
  assert.match(checkWorkflowSource(`const a = 1\n${HEADER}return 1\n`, 'b.js'), /no `export const meta` header/)
  // A second export is left in place, so the parser refuses it rather than this
  // regex quietly deleting it.
  assert.ok(checkWorkflowSource(`${HEADER}export const b = 1\n`, 'c.js'))
  assert.ok(checkWorkflowSource(`${HEADER}if (1) { export const b = 1 }\n`, 'd.js'))
})

test('a spawn that did not finish is COULD NOT CHECK, never a verdict about the file', () => {
  // ⚠ spawnSync CAN RETURN status 0 TOGETHER WITH AN ETIMEDOUT ERROR, and a killed
  // child returns a null status with no error at all. Reading `status === 0` first
  // returned clean for a check that never ran; the null case fell through to
  // "parses as neither", which is a verdict nothing measured (ADR-005).
  const broken = `${HEADER}const x = (\n`
  const shapes = [
    ['status 0 with a timeout error', { status: 0, error: new Error('ETIMEDOUT'), stderr: '' }],
    ['a killed child', { status: null, signal: 'SIGKILL', stderr: '' }],
    ['no status at all', { status: undefined, stderr: '' }]
  ]
  for (const [label, result] of shapes) {
    const said = checkJsSource(broken, 'x.js', { spawn: () => result })
    assert.match(said ?? '', /COULD NOT CHECK/, `${label}: ${said}`)
    assert.doesNotMatch(said ?? '', /parses as neither/, `${label} must not read as a verdict`)
  }
  // …and the same seam still lets a real answer through, or the assertions above
  // would pass on a function that always says COULD NOT CHECK.
  assert.equal(checkJsSource(broken, 'x.js', { spawn: () => ({ status: 0, stderr: '' }) }), null)
  assert.match(checkJsSource(broken, 'x.js', { spawn: () => ({ status: 1, stderr: 'boom' }) }), /parses as neither/)
})

test('an unusable temporary directory is COULD NOT CHECK, and does not escape as a stack', () => {
  // ⚠ THROUGH THE SEAM, NOT `TMPDIR`. Setting that environment variable proved
  // nothing on Windows, where node reads `TEMP`/`TMP` — the check succeeded, the
  // assertion failed, and CI went red on the test rather than the code (CLAUDE.md §7).
  const said = checkJsSource(`${HEADER}const x = (\n`, 'y.js', {
    makeTempDir: () => { throw new Error('ENOENT: no such file or directory') }
  })
  assert.match(said, /y\.js: COULD NOT CHECK — no usable temporary directory/)
  assert.doesNotMatch(said, /parses as neither/)
  // The must-fail direction: with a working factory the same input gets a verdict.
  assert.match(checkJsSource(`${HEADER}const x = (\n`, 'y.js'), /parses as neither/)
})

test('the CLI separates a finding from a could-not-look, and says it ran', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-exit-'))
  try {
    const good = join(dir, 'good.js')
    const bad = join(dir, 'bad.js')
    writeFileSync(good, `${HEADER}return 1\n`)
    writeFileSync(bad, `${HEADER}const x = (\n`)
    const run = args => spawnSync(process.execPath, [checker, ...args],
      { encoding: 'utf8', timeout: 60_000, env: { ...process.env } })

    const clean = run(['--js', good])
    assert.equal(clean.status, 0)
    assert.match(clean.stdout, /QH-PARSE-COMPLETE/,
      'the marker is how a caller knows the check ran rather than the interpreter dying')

    assert.equal(run(['--js', bad]).status, 1, 'a finding is exit 1')
    assert.equal(run(['--js', join(dir, 'absent.js')]).status, 4,
      'an unreadable file is could-not-look, exit 4 — not a finding about its syntax')
    assert.equal(run([]).status, 2, 'usage is exit 2')

    // The CLI's own could-not-look arm, driven by a file it cannot read — the one
    // resource failure reachable from outside the process on every platform.
    assert.equal(run(['--js', join(dir, 'still-absent.js')]).status, 4,
      'a resource the check needs and cannot get is exit 4')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the CLI runs when its own path is reached through a symlink', t => {
  // ⚠ THE MECHANISM, NOT A DOWNSTREAM EFFECT. The first test for this asserted that
  // the post-edit hook worked from a temp directory, which happens to expose the bug
  // on macOS (`/var` → `/private/var`) and NOT on Linux, where mkdtemp returns a real
  // path — so CI reported the mutant GREEN: "a test that stays green with its
  // mechanism broken is asserting something else" (CLAUDE.md §4). A symlink the test
  // makes itself exposes it everywhere it can be made at all.
  const dir = mkdtempSync(join(tmpdir(), 'wf-symlink-'))
  try {
    const real = join(dir, 'real')
    mkdirSync(real)
    writeFileSync(join(real, 'workflow-parse.mjs'),
      readFileSync(join(repoRoot, 'plugin', 'scripts', 'workflow-parse.mjs'), 'utf8'))
    const subject = join(dir, 'subject.js')
    writeFileSync(subject, `${HEADER}return 1\n`)

    const link = join(dir, 'link')
    try {
      symlinkSync(real, link, 'dir')
    } catch (err) {
      // §7: a skip names its reason, after the failure has been seen — a Git for
      // Windows checkout without developer mode cannot create one.
      t.skip(`this host cannot create a directory symlink: ${err.code ?? err.message}`)
      return
    }

    const viaLink = spawnSync(process.execPath, [join(link, 'workflow-parse.mjs'), '--js', subject],
      { encoding: 'utf8', timeout: 60_000 })
    assert.equal(viaLink.status, 0, viaLink.stderr)
    assert.match(viaLink.stdout, /QH-PARSE-COMPLETE/,
      'reached through a symlink the CLI must still run; a silent exit 0 is the ' +
      'most flattering failure a checker can have')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
