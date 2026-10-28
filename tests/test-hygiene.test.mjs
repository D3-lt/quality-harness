// ADR-119 T5 (BACKLOG §381 items 17, 19 and 23). Three sweeps over the files git lists (CLAUDE.md §8), each shown finding a
// planted dirty twin, with closed lists of the sites that stay because a test body an ADR task locks holds them
// byte-identical (CLAUDE.md §2). A list holds a count per file and the count must equal what the file holds, so a site that
// leaves takes the list down with it: the lists only shrink.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as eventLog from '../plugin/scripts/event-log.mjs'
import * as corpus from '../plugin/scripts/decision-corpus.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function listed() {
  const run = spawnSync('git', ['-c', 'core.quotePath=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60_000, maxBuffer: 256 * 1024 * 1024, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return [...new Set(run.stdout.split('\0').filter(Boolean).map(file => file.replace(/\\/g, '/')))].sort()
}
const read = file => readFileSync(path.join(repoRoot, file), 'utf8')

// What a sweep finds: a file holding more sites than its list allows, or fewer (the list must shrink), or a listed file
// no longer in the class. `count` reads a file's text; `locked` is the closed list.
function sweep(files, text, count, locked) {
  const found = []
  for (const file of files) {
    const held = count(text(file))
    const allowed = locked[file] ?? 0
    if (held > allowed) found.push(`${file}: ${held - allowed} site(s) outside the list`)
    else if (held < allowed) found.push(`${file}: the list allows ${allowed}, the file holds ${held}: shrink the list`)
  }
  for (const file of Object.keys(locked)) if (!files.includes(file)) found.push(`${file}: listed, and no longer in the class`)
  return found
}
const lines = (text, pattern) => text.split('\n').filter(line => pattern.test(line))

// §380's class: a test that starts a session, whose hook leaves detached children writing in its directory. A remove is
// bare when it is recursive, its own (not inside a child's script, `x.rmSync(`) and retries nothing. BACKLOG §407 widened
// it (2026-10-23) to every test that starts a child able to outlive it — a hook, a detached refresher, the Go core — and
// the pattern reads past a nested call: `rmSync(join(top, 'docs'), { recursive… })` was invisible to `[^)]*`.
const RECURSIVE_REMOVE = /(?<![.\w])rmSync\(.*\brecursive\b/
const bareRemoves = text => lines(text, RECURSIVE_REMOVE).filter(line => !/maxRetries/.test(line)).length
const STARTS_A_CHILD = /SessionStart|detached:\s*true|scripts\/(?:lifecycle|branch-state|run-shell-hook|on-[a-z-]+)\.mjs|'lifecycle\.mjs'|'branch-state\.mjs'|hook-golden\.mjs|runHook\(|core', 'bin'|qh-hook/
// This file names the patterns, and quotes a remove in a comment, so it is not in its own class.
const removeClass = files => files.filter(file => /^tests\/[^/]+\.test\.mjs$/.test(file) && file !== 'tests/test-hygiene.test.mjs'
  && STARTS_A_CHILD.test(read(file)))
// Measured 2026-10-20 at 95bb1ef9 with scripts/test-locks.py and record.extract_test_body: every site left is inside a
// locked test body. The rows from advice-says-advice on were added 2026-10-23, when §407 widened the class: each site is
// inside a body scripts/test-locks.py names, and every other site in the widened class goes through the helper.
const LOCKED_REMOVES = {
  'tests/adopt-wording.test.mjs': 3,
  'tests/branch-state.test.mjs': 8,
  'tests/corpus-probe.test.mjs': 13,
  'tests/mrw-way.test.mjs': 3,
  'tests/package.test.mjs': 5,
  'tests/probe-diff-marks.test.mjs': 1,
  'tests/probe-enobufs.test.mjs': 1,
  'tests/qh-core-parity.test.mjs': 3,
  'tests/qh-mcp-resources.test.mjs': 1,
  'tests/advice-says-advice.test.mjs': 1,
  'tests/artifact-pass-behind.test.mjs': 6,
  'tests/gate-rules.test.mjs': 2,
  'tests/lock-drift-commit.test.mjs': 2,
  'tests/release-evidence.test.mjs': 3,
  'tests/spec-ignore.test.mjs': 2,
  'tests/go-core-parity-adr-111.test.mjs': 1,
}

test('no test outside the locked list removes its directory without the retrying helper', async () => {
  const files = removeClass(listed())
  assert.ok(files.length > 0, 'the class is empty: the sweep looked at nothing')
  assert.deepEqual(sweep(files, read, bareRemoves, LOCKED_REMOVES), [])
  // DIRTY twins: a planted bare remove is found, a retrying one and a child's are not, and a list entry whose site left is.
  const planted = { 'tests/a.test.mjs': `after(() => ${'rm'}Sync(dir, { recursive: true, force: true }))`,
    'tests/b.test.mjs': `${'rm'}Sync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })\nrequire("node:fs").${'rm'}Sync(d,{recursive:true})` }
  const files2 = Object.keys(planted)
  assert.deepEqual(sweep(files2, file => planted[file], bareRemoves, {}), ['tests/a.test.mjs: 1 site(s) outside the list'])
  assert.deepEqual(sweep(files2, file => planted[file], bareRemoves, { 'tests/a.test.mjs': 1 }), [])
  assert.deepEqual(sweep(files2, file => planted[file], bareRemoves, { 'tests/a.test.mjs': 1, 'tests/b.test.mjs': 1 }),
    ['tests/b.test.mjs: the list allows 1, the file holds 0: shrink the list'])
  assert.deepEqual(sweep(files2, file => planted[file], bareRemoves, { 'tests/a.test.mjs': 1, 'tests/gone.test.mjs': 2 }),
    ['tests/gone.test.mjs: listed, and no longer in the class'])
  // The helper itself retries.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-hygiene-'))
  const { remove } = await import('./helpers/remove.mjs')
  remove(dir)
  assert.throws(() => realpathSync(dir), /ENOENT/)
})

// BACKLOG §407: the pattern reads a remove whose path is itself a call, and the class holds a test that starts a child
// without naming SessionStart. Both were invisible before 2026-10-23.
test('a remove of a joined path counts, and a test that starts a child is in the class', () => {
  const planted = {
    'tests/nested.test.mjs': `${'rm'}Sync(join(top, 'docs'), { recursive: true, force: true })\n// spawns plugin/scripts/lifecycle.mjs`,
    'tests/quiet.test.mjs': `${'rm'}Sync(join(top, 'docs'), { recursive: true, force: true })\n`,
  }
  assert.equal(bareRemoves(planted['tests/nested.test.mjs']), 1, 'a nested call before `recursive` is still a bare remove')
  assert.ok(STARTS_A_CHILD.test(planted['tests/nested.test.mjs']), 'a test that starts the lifecycle hook is in the class')
  assert.equal(STARTS_A_CHILD.test(planted['tests/quiet.test.mjs']), false, 'one that starts nothing is not')
  assert.ok(!removeClass(listed()).includes('tests/test-hygiene.test.mjs'), 'the file that names the patterns is not its own member')
})

// BACKLOG §378: a bare `bash` on a Windows PATH can be WSL's, which runs no POSIX script of this repository's; testBash
// resolves the one the product resolves (tests/helpers/bash.mjs).
const BARE_BASH = /(?<![.\w])(?:spawnSync|execFileSync|spawn)\('bash'/
const bareBash = text => lines(text, BARE_BASH).length
const bashClass = files => files.filter(file => /^tests\/.+\.mjs$/.test(file))
const LOCKED_BASH = {
  'tests/gate-rules.test.mjs': 1,
  'tests/package.test.mjs': 6,
  'tests/post-edit-check.test.mjs': 17,
  'tests/publish-command.test.mjs': 3,
  // Not a spawn: the source text of a fixture the untimed-spawns sweep reads, inside a template literal.
  'tests/untimed-spawns.test.mjs': 1,
}

test('no test outside the locked list spawns a bare bash', () => {
  const files = bashClass(listed())
  assert.ok(files.length > 0, 'the class is empty: the sweep looked at nothing')
  assert.deepEqual(sweep(files, read, bareBash, LOCKED_BASH), [])
  const planted = { 'tests/a.test.mjs': `${'spawn'}Sync('bash', [x])\n${'execFile'}Sync('bash', [x])\n${'spawn'}('bash', ['-c', 'true'])`,
    'tests/b.test.mjs': `${'spawn'}Sync(testBash(), [x])\ncp.${'spawn'}Sync('bash', [x])` }
  assert.deepEqual(sweep(Object.keys(planted), file => planted[file], bareBash, {}), ['tests/a.test.mjs: 3 site(s) outside the list'])
})

const MOVED = ['walk', 'outsideRoot', 'GIT_LISTING_BUFFER']
const IMPORTERS = {
  'plugin/scripts/check-ledger.mjs': 'outsideRoot',
  'plugin/scripts/decision-corpus.mjs': 'GIT_LISTING_BUFFER',
}
const importedFrom = (text, module) => [...text.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'\\./${module.replaceAll('.', '\\.')}'`, 'g'))]
  .flatMap(match => match[1].split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(Boolean))

test('decision-corpus.mjs no longer holds walk, outsideRoot or GIT_LISTING_BUFFER', () => {
  for (const name of MOVED) {
    assert.ok(name in eventLog, `event-log.mjs exports ${name}`)
    assert.ok(!(name in corpus), `decision-corpus.mjs still exports ${name}`)
  }
  for (const [file, name] of Object.entries(IMPORTERS)) assert.ok(importedFrom(read(file), 'event-log.mjs').includes(name), `${file} imports ${name} from event-log.mjs`)
  for (const file of listed().filter(name => /^plugin\/.+\.mjs$/.test(name))) {
    assert.deepEqual(importedFrom(read(file), 'decision-corpus.mjs').filter(name => MOVED.includes(name)), [], file)
  }
  // DIRTY twin: an import left on decision-corpus.mjs is seen.
  assert.deepEqual(importedFrom("import { walk, trackedPaths as t } from './decision-corpus.mjs'", 'decision-corpus.mjs'), ['walk', 'trackedPaths'])
  // They answer as before.
  assert.equal(eventLog.GIT_LISTING_BUFFER, 256 * 1024 * 1024)
  const seen = []
  eventLog.walk({ a: [{ b: 1 }], c: 'x' }, value => seen.push(value))
  assert.equal(seen.length, 3)
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-hygiene-root-')))
  try {
    assert.equal(eventLog.outsideRoot(root, path.join(root, 'a.txt')), false, 'a path inside')
    assert.equal(eventLog.outsideRoot(root, path.join(path.dirname(root), 'elsewhere.txt')), true, 'a path outside')
    const folds = process.platform === 'win32' || process.platform === 'darwin'
    assert.equal(eventLog.outsideRoot(root.toUpperCase(), path.join(root, 'a.txt')), !folds, 'case is folded where the filesystem folds it')
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})
