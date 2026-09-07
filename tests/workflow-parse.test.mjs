// A Workflow script parses under neither of node's two module goals, so `node
// --check` was never answering the question it was asked here: node v24.11.1 passed
// all three shipped workflows and v26.8.1 failed every one of them, on bytes that
// had not changed and a runtime that accepts both. These tests pin what the
// replacement accepts AND what it refuses — a checker only ever shown returning
// clean is one nothing has proven can return dirty (CLAUDE.md §4).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
