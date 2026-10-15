// Stage 0 of the plan to make the check fast without letting it claim more (BACKLOG §378, "qh-check cannot say where its
// time went"): a node --test reporter that writes one row per test file, and the repository's gate that keeps those rows
// beside the check ledger. Driven through node --test itself, over fixture files this test writes.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { testBash } from './helpers/bash.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// A file URL: on Windows node's loader reads a bare `C:\…` as a URL with the scheme `c:` and exits 7 (a Windows run, 2026-10-15).
const reporter = pathToFileURL(path.join(repoRoot, 'scripts', 'file-timing-reporter.mjs')).href

const timed = files => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'qh-file-timing-'))
  try {
    const dir = path.join(parent, 'real')
    mkdirSync(dir)
    for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body)
    // The run starts from a symlink to the fixture, as macOS's /tmp is one, so a root nobody resolved is caught on every
    // platform: node names each file by its real path. Where a symlink cannot be made, the real directory is used.
    let root = path.join(parent, 'link')
    try { symlinkSync(dir, root, 'dir') } catch { root = dir }
    // NODE_TEST_CONTEXT is the outer runner's: inherited, even empty, the inner node --test reports to it as a child.
    const env = { ...process.env, QH_SELFTEST_ROOT: root, QH_SELFTEST_CONCURRENCY_SAID: '3', QH_SELFTEST_LOAD_SAID: '1.50' }
    delete env.NODE_TEST_CONTEXT
    const run = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, '--test-reporter-destination=stdout',
      ...Object.keys(files)], { cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true, env })
    const rows = run.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    return { run, rows }
  } finally { rmSync(parent, { recursive: true, force: true }) }
}

test('the reporter writes one row naming each file, the time its tests took, its tests and its failures', () => {
  const { run, rows } = timed({
    'slow.test.mjs': "import test from 'node:test'\ntest('one', async () => { await new Promise(r => setTimeout(r, 300)) })\n"
      + "test('two', async t => { await t.test('inner', async () => { await new Promise(r => setTimeout(r, 100)) }) })\n",
    'red.test.mjs': "import test from 'node:test'\nimport assert from 'node:assert'\ntest('red', () => { assert.equal(1, 2) })\n",
    'broken.test.mjs': "throw new Error('the file does not load')\n",
  })
  assert.equal(run.status, 1, 'the fixture suite has a failing file')
  assert.equal(rows.length, 1, `one row per run: ${run.stdout}`)
  const [row] = rows
  assert.equal(row.concurrency, '3')
  assert.equal(row.load, '1.50')
  assert.match(row.at, /^\d{4}-\d\d-\d\dT/)
  const file = name => row.files.find(entry => entry.file === name)
  // CLEAN: the passing file counts its top-level tests only, and its time is theirs: a subtest is inside its parent's.
  assert.deepEqual({ tests: file('slow.test.mjs').tests, failed: file('slow.test.mjs').failed }, { tests: 2, failed: 0 }, JSON.stringify(row.files))
  assert.ok(file('slow.test.mjs').ms >= 390 && file('slow.test.mjs').ms < 2_000, `summed top-level time: ${file('slow.test.mjs').ms}`)
  assert.equal(row.files.length, 3, 'each file once, whatever path form node gives it')
  // DIRTY: a failing assertion and a file that does not load are both failures of their file.
  assert.equal(file('red.test.mjs').failed, 1)
  assert.equal(file('broken.test.mjs').failed, 1)
  assert.equal(file('broken.test.mjs').tests, 0, 'a file that did not load ran no test')
})

// Windows CI, 2026-10-15: node named one file in more than one form, and the row read `tests: 0` for a file whose two tests
// passed. The runner's printed rows showed the third form: the link's target as written (`RUNNER~1\…\real`), which is neither the
// root as given (the link) nor as the filesystem names it (the long form). Here the link's target is written through a second
// link, so that form is not canonical on any platform: on Linux CI /tmp already was, and a test of it there could not fail.
test('a file node names in two path forms is one row, holding all its tests', async () => {
  const { default: fileTiming } = await import(reporter)
  const parent = mkdtempSync(path.join(os.tmpdir(), 'qh-file-timing-forms-'))
  const saved = process.env.QH_SELFTEST_ROOT
  try {
    const real = path.join(parent, 'real')
    mkdirSync(real)
    const alias = path.join(parent, 'alias')
    const asWritten = path.join(alias, 'real')
    const link = path.join(parent, 'link')
    try { symlinkSync(parent, alias, 'dir'); symlinkSync(asWritten, link, 'dir') } catch { return }
    const linkFile = path.join(link, 'slow.test.mjs')
    writeFileSync(path.join(real, 'slow.test.mjs'), '')
    const own = (type, file) => ({ type, data: { file, nesting: 0, name: file } })
    const rowOf = async events => {
      process.env.QH_SELFTEST_ROOT = link
      let out = ''
      for await (const chunk of fileTiming((async function* () { yield* events })())) out += chunk
      return JSON.parse(out).files
    }
    // Its tests named by the real path as the filesystem names it, and as the link's target was written.
    for (const testsFile of [path.join(realpathSync.native(real), 'slow.test.mjs'), path.join(asWritten, 'slow.test.mjs')]) {
      const one = (type, name, ms) => ({ type, data: { file: testsFile, nesting: 0, name, details: { duration_ms: ms } } })
      const tests = [one('test:pass', 'one', 300), one('test:pass', 'two', 100)]
      // CLEAN: the file's own event first, in the given form; its tests in another.
      assert.deepEqual(await rowOf([own('test:enqueue', linkFile), ...tests, own('test:pass', linkFile)]),
        [{ file: 'slow.test.mjs', ms: 400, tests: 2, failed: 0 }], testsFile)
      // DIRTY twin: its tests come first, and the file's own event that ends it fails (a file that did not finish loading).
      assert.deepEqual(await rowOf([...tests, own('test:fail', linkFile)]),
        [{ file: 'slow.test.mjs', ms: 400, tests: 2, failed: 1 }], testsFile)
    }
  } finally {
    if (saved === undefined) delete process.env.QH_SELFTEST_ROOT
    else process.env.QH_SELFTEST_ROOT = saved
    rmSync(parent, { recursive: true, force: true })
  }
})

test('the gate keeps its per-file times beside the check ledger, and says where', () => {
  const bash = testBash()
  const run = spawnSync(bash, [path.join(repoRoot, 'scripts', 'selftest.sh')], { encoding: 'utf8', timeout: 60_000, windowsHide: true,
    env: { ...process.env, QH_SELFTEST_DRY: '1' } })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.match(run.stdout, /^selftest: per-file times to .*[\\/]quality-harness[\\/]selftest-files\.jsonl$/m, run.stdout)
  // DIRTY twin: a script outside any git checkout keeps nothing, and says so rather than naming a ledger it has not got.
  const outside = mkdtempSync(path.join(os.tmpdir(), 'qh-file-timing-nogit-'))
  try {
    const copy = path.join(outside, 'scripts')
    spawnSync(bash, ['-c', 'mkdir -p "$1" && cp "$2" "$1/"', '_', copy, path.join(repoRoot, 'scripts', 'selftest.sh')], { timeout: 10_000, windowsHide: true })
    const bare = spawnSync(bash, [path.join(copy, 'selftest.sh')], { encoding: 'utf8', timeout: 60_000, windowsHide: true,
      env: { ...process.env, QH_SELFTEST_DRY: '1', GIT_CEILING_DIRECTORIES: path.dirname(outside) } })
    assert.equal(bare.status, 0, bare.stdout + bare.stderr)
    assert.match(bare.stdout, /^selftest: per-file times not kept \(no git directory/m, bare.stdout)
  } finally { rmSync(outside, { recursive: true, force: true }) }
})
