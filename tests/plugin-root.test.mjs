// ADR-120 T4: a home-directory forwarder runs the plugin copy the session's hooks run. SessionStart writes
// `export QH_PLUGIN_ROOT=…` into the host's env file (Node and Go), and both resolvers (the sh forwarder's RESOLVER and
// qh-root) prefer it, then CLAUDE_PLUGIN_ROOT, each only where it holds bin/, then the newest installed copy.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runPython } from '../scripts/python-interpreter.mjs'
import { RESOLVER, cacheDirectory } from '../plugin/scripts/standalone-link.mjs'
import { offerPluginRoot, offerPublishHook } from '../plugin/scripts/publish-verdict.mjs'
import { fixtureRepo, pluginDir, runHook, sandbox } from './hook-golden.mjs'
import { required } from './helpers/require.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const qhRoot = path.resolve(here, '..', 'plugin', 'bin', 'qh-root')
const coreDir = path.resolve(here, '..', 'core')

const scratch = t => {
  const dir = realpathSync.native(mkdtempSync(path.join(process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), 'qh-plugin-root-')))
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  return dir
}

// A home with an installed cache holding an old and a newer copy, and two session copies: one with bin/, one without.
function world(t) {
  const home = scratch(t)
  const cache = cacheDirectory(home)
  for (const version of ['1.0.0', '2.0.0']) mkdirSync(path.join(cache, version, 'bin'), { recursive: true })
  const named = path.join(home, 'session-copy')
  mkdirSync(path.join(named, 'bin'), { recursive: true })
  const bare = path.join(home, 'bare-copy')
  mkdirSync(bare, { recursive: true })
  // The manifest the forwarder asks first names the newest copy, so a session copy that wins does so over it.
  writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'quality-harness@quality-harness': [{ installPath: path.join(cache, '2.0.0'), version: '2.0.0' }] } }))
  return { home, cache, newest: path.join(cache, '2.0.0'), named, bare }
}

// Both resolvers, each asked with the environment it is given. The shell's own variables never leak in.
function answers(w, vars) {
  const env = { ...process.env, HOME: w.home, USERPROFILE: w.home, QH_PLUGIN_ROOT: '', CLAUDE_PLUGIN_ROOT: '', ...vars }
  const forwarder = spawnSync(process.execPath, ['-e', RESOLVER, w.cache], { encoding: 'utf8', timeout: 60_000, env, windowsHide: true }).stdout.trim()
  const python = runPython([qhRoot], { encoding: 'utf8', timeout: 60_000, env })
  return { forwarder, qhRoot: python.stdout.trim() }
}

test('a forwarder runs the copy the session names, over a newer installed one', t => {
  const w = world(t)
  assert.deepEqual(answers(w, { QH_PLUGIN_ROOT: w.named }), { forwarder: w.named, qhRoot: w.named })
  // Dirty twin: with neither variable the newest installed copy answers, as before.
  assert.deepEqual(answers(w, {}), { forwarder: w.newest, qhRoot: w.newest })
})

test('a named copy without bin falls through, in order', t => {
  const w = world(t)
  const both = { forwarder: w.named, qhRoot: w.named }
  assert.deepEqual(answers(w, { QH_PLUGIN_ROOT: w.bare, CLAUDE_PLUGIN_ROOT: w.named }), both)
  // QH_PLUGIN_ROOT outranks CLAUDE_PLUGIN_ROOT when both hold bin/.
  const other = path.join(w.home, 'other-copy')
  mkdirSync(path.join(other, 'bin'), { recursive: true })
  assert.deepEqual(answers(w, { QH_PLUGIN_ROOT: w.named, CLAUDE_PLUGIN_ROOT: other }), both)
  // Neither holds bin/: the installed copy.
  assert.deepEqual(answers(w, { QH_PLUGIN_ROOT: w.bare, CLAUDE_PLUGIN_ROOT: path.join(w.home, 'nowhere') }), { forwarder: w.newest, qhRoot: w.newest })
})

const line = root => `export QH_PLUGIN_ROOT='${root.replace(/\\/g, '/')}'`
const count = (text, wanted) => text.split('\n').filter(entry => entry === wanted).length
const probeFailed = () => ({ status: 129, stdout: '', stderr: "error: unknown subcommand: `list'" })
const probeListed = () => ({ status: 0, stdout: 'qhprobe\n', stderr: '' })

test('the session start writes the plugin root once, whatever the git hook probe found', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const dir = scratch(t)
  const cwd = path.join(dir, 'cwd')
  mkdirSync(cwd)
  const root = path.resolve(here, '..', 'plugin')
  // As on-session-start.mjs calls them: the plugin root, then git's hook.
  const offer = (file, run) => {
    const env = { CLAUDE_ENV_FILE: file }
    offerPluginRoot({ cwd, session: 'plugin-root-node', env })
    offerPublishHook({ cwd, session: 'plugin-root-node', env, run })
  }
  // The probe failed: no git hook is written, the plugin root is.
  const failed = path.join(dir, 'failed.env')
  offer(failed, probeFailed)
  assert.equal(count(readFileSync(failed, 'utf8'), line(root)), 1)
  assert.doesNotMatch(readFileSync(failed, 'utf8'), /hook\.qh-publish-/)
  // A second SessionStart on the same file adds nothing, with the probe failed or listed.
  offer(failed, probeFailed)
  offer(failed, probeListed)
  assert.equal(count(readFileSync(failed, 'utf8'), line(root)), 1)
  // The probe listed it: the git block follows, and a repeat adds neither.
  const listed = path.join(dir, 'listed.env')
  offer(listed, probeListed)
  const written = readFileSync(listed, 'utf8')
  assert.equal(count(written, line(root)), 1)
  assert.match(written, /hook\.qh-publish-commit\.command/)
  offer(listed, probeListed)
  assert.equal(readFileSync(listed, 'utf8'), written)
  // An env file that already holds an older git block (no plugin root yet) still gets the line, once, and the block is left alone.
  const older = path.join(dir, 'older.env')
  const block = '# older block\nexport GIT_CONFIG_KEY_0=hook.qh-publish-commit.command\n'
  writeFileSync(older, block)
  offer(older, probeListed)
  offer(older, probeListed)
  assert.equal(readFileSync(older, 'utf8'), block + `${line(root)}\n`)
  // Through the real SessionStart hook, so what calls the writers is tested too.
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'repo', { 'a.txt': 'x\n' })
  const started = path.join(box.top, 'started.env')
  runHook(box, repo, 'plugin-root-node-2', { hook_event_name: 'SessionStart', source: 'startup' }, { CLAUDE_ENV_FILE: started }, { impl: 'node' })
  assert.equal(count(readFileSync(started, 'utf8'), line(pluginDir)), 1)
})

const noGo = required('go', (() => {
  const version = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
  return version.error || version.status !== 0 ? `go is not on PATH (${version.error?.code ?? `exit ${version.status}`})` : false
})())
const posixOnly = process.platform === 'win32' && 'the core is exercised on POSIX, as the goldens are'

test('the Go session start writes the same plugin root line', { skip: 'ADR-130: compulsory check policy retired' }, t => {
  const bin = scratch(t)
  const qh = path.join(bin, 'qh')
  const built = spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, `go build failed: ${built.stderr}`)
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'repo', { 'a.txt': 'x\n' })
  const start = (file, session) => runHook(box, repo, session, { hook_event_name: 'SessionStart', source: 'startup' },
    { CLAUDE_ENV_FILE: file }, { impl: 'go', bin: qh })
  const fresh = path.join(box.top, 'fresh.env')
  start(fresh, 'go-root-1')
  assert.equal(count(readFileSync(fresh, 'utf8'), line(pluginDir)), 1)
  // A resume on the same file adds nothing.
  start(fresh, 'go-root-1')
  assert.equal(count(readFileSync(fresh, 'utf8'), line(pluginDir)), 1)
  // An older git block already there: the line is still written, once, after it.
  const older = path.join(box.top, 'older.env')
  const block = '# older block\nexport GIT_CONFIG_KEY_0=hook.qh-publish-commit.command\n'
  writeFileSync(older, block)
  start(older, 'go-root-2')
  start(older, 'go-root-2')
  assert.equal(readFileSync(older, 'utf8'), block + `${line(pluginDir)}\n`)
})

// ADR-130: retained behavior, with the retired publish-policy expectations removed.
test("optional commit tracking exports are installed once with the plugin root", t => {
  const dir = scratch(t)
  const cwd = path.join(dir, 'cwd')
  mkdirSync(cwd)
  const root = path.resolve(here, '..', 'plugin')
  // As on-session-start.mjs calls them: the plugin root, then git's hook.
  const offer = (file, run) => {
    const env = { CLAUDE_ENV_FILE: file }
    offerPluginRoot({ cwd, session: 'plugin-root-node', env })
    offerPublishHook({ cwd, session: 'plugin-root-node', env, run })
  }
  // The probe failed: no git hook is written, the plugin root is.
  const failed = path.join(dir, 'failed.env')
  offer(failed, probeFailed)
  assert.equal(count(readFileSync(failed, 'utf8'), line(root)), 1)
  assert.doesNotMatch(readFileSync(failed, 'utf8'), /hook\.qh-publish-/)
  // A second SessionStart on the same file adds nothing, with the probe failed or listed.
  offer(failed, probeFailed)
  offer(failed, probeListed)
  assert.equal(count(readFileSync(failed, 'utf8'), line(root)), 1)
  // The probe listed it: the git block follows, and a repeat adds neither.
  const listed = path.join(dir, 'listed.env')
  offer(listed, probeListed)
  const written = readFileSync(listed, 'utf8')
  assert.equal(count(written, line(root)), 1)
  assert.match(written, /hook\.qh-commit-made\.command/)
  offer(listed, probeListed)
  assert.equal(readFileSync(listed, 'utf8'), written)
  // An env file that already holds an older git block (no plugin root yet) still gets the line, once, and the block is left alone.
  const older = path.join(dir, 'older.env')
  const block = '# older block\nexport GIT_CONFIG_KEY_0=hook.qh-publish-commit.command\n'
  writeFileSync(older, block)
  offer(older, probeListed)
  offer(older, probeListed)
  assert.ok(readFileSync(older, 'utf8').startsWith(block + `${line(root)}\n`))
  assert.equal((readFileSync(older, 'utf8').match(/hook\.qh-commit-made\.command/g) ?? []).length, 1)
  // Through the real SessionStart hook, so what calls the writers is tested too.
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'repo', { 'a.txt': 'x\n' })
  const started = path.join(box.top, 'started.env')
  runHook(box, repo, 'plugin-root-node-2', { hook_event_name: 'SessionStart', source: 'startup' }, { CLAUDE_ENV_FILE: started }, { impl: 'node' })
  assert.equal(count(readFileSync(started, 'utf8'), line(pluginDir)), 1)
})

test("Go optional commit tracking keeps root exports and installation idempotent", { skip: noGo || posixOnly }, t => {
  const bin = scratch(t)
  const qh = path.join(bin, 'qh')
  const built = spawnSync('go', ['build', '-o', qh, './cmd/qh'], { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true })
  assert.equal(built.status, 0, `go build failed: ${built.stderr}`)
  const box = sandbox(t)
  const repo = fixtureRepo(box, 'repo', { 'a.txt': 'x\n' })
  const start = (file, session) => runHook(box, repo, session, { hook_event_name: 'SessionStart', source: 'startup' },
    { CLAUDE_ENV_FILE: file }, { impl: 'go', bin: qh })
  const fresh = path.join(box.top, 'fresh.env')
  start(fresh, 'go-root-1')
  assert.equal(count(readFileSync(fresh, 'utf8'), line(pluginDir)), 1)
  // A resume on the same file adds nothing.
  start(fresh, 'go-root-1')
  assert.equal(count(readFileSync(fresh, 'utf8'), line(pluginDir)), 1)
  // An older git block already there: the line is still written, once, after it.
  const older = path.join(box.top, 'older.env')
  const block = '# older block\nexport GIT_CONFIG_KEY_0=hook.qh-publish-commit.command\n'
  writeFileSync(older, block)
  start(older, 'go-root-2')
  start(older, 'go-root-2')
  assert.ok(readFileSync(older, 'utf8').startsWith(block + `${line(pluginDir)}\n`))
  assert.equal((readFileSync(older, 'utf8').match(/hook\.qh-commit-made\.command/g) ?? []).length, 1)
})
