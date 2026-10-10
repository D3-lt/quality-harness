// A scan that looked at nothing, or could not read what it was given, is UNRUN — never "0 findings"
// (CLAUDE.md §3, ADR-005). Each gate here answered 0 for an empty universe or dropped an unparsed file.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pythonArgv } from '../scripts/python-interpreter.mjs'
import { main as untimedSpawns } from '../scripts/untimed-spawns.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'qh-zero-')))
after(() => rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
const [python, ...prefix] = pythonArgv()

const sink = () => { const chunks = []; return { write: chunk => { chunks.push(String(chunk)); return true }, text: () => chunks.join('') } }
const put = (name, text) => { const file = path.join(scratch, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); return file }

test('orphan-sweep: a shipped tree with files and no definitions is could-not-look, not 0 orphans', () => {
  const dir = path.join(scratch, 'repo')
  mkdirSync(path.join(dir, 'plugin'), { recursive: true })
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(git('init', '-q').status, 0)
  writeFileSync(path.join(dir, 'plugin', 'only.mjs'), '// a comment, no definition\n')
  assert.equal(git('add', '-A').status, 0)
  assert.equal(git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x').status, 0)
  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'orphan-sweep.mjs'), 'HEAD'], { cwd: dir, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /none holds a definition/, run.stderr)
})

test('untimed-spawns: an empty set of files is UNRUN, not a clean count', () => {
  const out = sink(); const err = sink()
  const code = untimedSpawns([], { acorn: {}, trackedFiles: () => [], stdout: out, stderr: err })
  assert.equal(code, 2, out.text() + err.text())
  assert.match(err.text(), /UNRUN: no file to scan/, err.text())
})

test('untimed-spawns: a file that does not parse is UNRUN, and a file that parses with no spawn is still clean', () => {
  const check = file => spawnSync(process.execPath, ['--expose-internals', path.join(repoRoot, 'scripts', 'untimed-spawns.mjs'), file], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  const bad = check(put('bad.mjs', 'const = = ;\n'))
  assert.equal(bad.status, 2, bad.stdout + bad.stderr)
  assert.match(bad.stdout, /could not parse/, bad.stdout)
  const hidden = spawnSync(process.execPath, ['--expose-internals', path.join(repoRoot, 'scripts', 'untimed-spawns.mjs'), '--hidden', path.join(scratch, 'bad.mjs')], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(hidden.status, 2, hidden.stdout + hidden.stderr)
  const good = check(put('good.mjs', 'export const a = 1\n'))
  assert.equal(good.status, 0, good.stdout + good.stderr)
})

test('untimed-children: a gate that does not parse, and nothing to scan, are UNRUN; a clean and a dirty gate keep their answers', () => {
  const check = (...paths) => spawnSync(python, [...prefix, path.join(repoRoot, 'scripts', 'untimed-children.py'), ...paths], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  const bad = check(put('bad.py', 'def (:\n'))
  assert.equal(bad.status, 2, bad.stdout + bad.stderr)
  assert.match(bad.stdout + bad.stderr, /could not parse/, bad.stdout + bad.stderr)
  const mixed = check(put('mixed-clean.py', 'x = 1\n'), path.join(scratch, 'bad.py'))
  assert.equal(mixed.status, 2, 'one file scanned and one not is still UNRUN: ' + mixed.stdout + mixed.stderr)
  const nothing = check(path.join(scratch, 'does-not-exist.py'))
  assert.equal(nothing.status, 2, nothing.stdout + nothing.stderr)
  assert.match(nothing.stdout + nothing.stderr, /does-not-exist\.py: could not read/, nothing.stdout + nothing.stderr)
  // Only a shim to skip: nothing scanned and nothing wrong with any input.
  const shim = check(put('shim.cmd', '@echo off\n'))
  assert.equal(shim.status, 2, shim.stdout + shim.stderr)
  assert.match(shim.stdout + shim.stderr, /UNRUN: no gate to scan/, shim.stdout + shim.stderr)
  assert.equal(check(put('clean.py', 'x = 1\n')).status, 0)
  assert.equal(check(put('dirty.py', 'import subprocess\nsubprocess.run(["x"])\n')).status, 1)
})

test('a good input beside one that cannot be read or parsed is still UNRUN (Codex review of 52cd9a66)', () => {
  const spawns = (...files) => spawnSync(process.execPath, ['--expose-internals', path.join(repoRoot, 'scripts', 'untimed-spawns.mjs'), ...files], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  const mixedJs = spawns(put('mixed-good.mjs', 'export const a = 1\n'), put('mixed-bad.mjs', 'const = = ;\n'))
  assert.equal(mixedJs.status, 2, mixedJs.stdout + mixedJs.stderr)
  const children = (...paths) => spawnSync(python, [...prefix, path.join(repoRoot, 'scripts', 'untimed-children.py'), ...paths], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  const missing = children(put('named-clean.py', 'x = 1\n'), path.join(scratch, 'named-missing.py'))
  assert.equal(missing.status, 2, missing.stdout + missing.stderr)
  assert.match(missing.stdout + missing.stderr, /named-missing\.py: could not read/, missing.stdout + missing.stderr)
})

test('orphan-sweep: a listed file whose blob cannot be read is could-not-look, whatever else is readable', () => {
  const dir = path.join(scratch, 'repo-gitlink')
  mkdirSync(path.join(dir, 'plugin'), { recursive: true })
  const git = (...args) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', timeout: 20_000, windowsHide: true })
  assert.equal(git('init', '-q').status, 0)
  writeFileSync(path.join(dir, 'plugin', 'live.mjs'), 'function live() {}\nlive()\n')
  assert.equal(git('add', '-A').status, 0)
  // A gitlink is listed by ls-tree under a shipped name, and `git show` cannot show it.
  assert.equal(git('update-index', '--add', '--cacheinfo', '160000,1111111111111111111111111111111111111111,plugin/sub.mjs').status, 0)
  assert.equal(git('commit', '-q', '-m', 'x').status, 0)
  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'orphan-sweep.mjs'), 'HEAD'], { cwd: dir, encoding: 'utf8', timeout: 30_000, windowsHide: true })
  assert.equal(run.status, 2, run.stdout + run.stderr)
  assert.match(run.stderr, /could not read 1 listed file/, run.stderr)
})
