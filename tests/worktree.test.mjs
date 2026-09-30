// ADR-076 T1: one worktree module, shipped (plugin/scripts/worktree.mjs), that builds a worktree
// of a checkout's working-tree content, keeps an ownership record any caller can join, and sweeps
// only what no live process owns. Every repository here is a fixture in the OS temp directory,
// never this checkout (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { campaignFixture, FIXTURE_FILES, fixtureGit, worktrees } from './campaign-fixture.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(repoRoot, 'plugin', 'scripts', 'worktree.mjs')
const load = () => import('../plugin/scripts/worktree.mjs')
const gone = () => spawnSync(process.execPath, ['-e', ''], { timeout: 20_000, windowsHide: true }).pid

test("a worktree holds the checkout's working-tree content", async () => {
  const { build, remove } = await load()
  const dir = campaignFixture()
  writeFileSync(path.join(dir, '.gitattributes'), '*.mjs text eol=lf\n')
  fixtureGit(dir, ['add', '.gitattributes'])
  fixtureGit(dir, ['commit', '-qm', 'attributes'])
  writeFileSync(path.join(dir, 'lib.mjs'), FIXTURE_FILES['lib.mjs'].replace('42', '43'))
  writeFileSync(path.join(dir, 'lib2.mjs'), FIXTURE_FILES['lib2.mjs'].replace(/\n/g, '\r\n'))
  writeFileSync(path.join(dir, 'new.txt'), 'untracked\n')
  rmSync(path.join(dir, 'notes.md'))
  const built = build(dir, { owner: process.pid })
  assert.equal(built.ok, true, built.error)
  try {
    assert.equal(readFileSync(path.join(built.tree, 'lib.mjs'), 'utf8'), readFileSync(path.join(dir, 'lib.mjs'), 'utf8'), 'the uncommitted edit')
    assert.deepEqual(readFileSync(path.join(built.tree, 'lib2.mjs')), readFileSync(path.join(dir, 'lib2.mjs')), 'the checkout\'s CRLF bytes')
    assert.ok(built.overlaid >= 1, 'no overlaid file was counted')
    assert.equal(readFileSync(path.join(built.tree, 'new.txt'), 'utf8'), 'untracked\n')
    assert.equal(existsSync(path.join(built.tree, 'notes.md')), false, 'a deleted file came back')
    assert.ok(built.tree.startsWith(path.join(dir, '.git') + path.sep), `the tree is not under the git directory: ${built.tree}`)
  } finally {
    remove(built.id)
  }
  assert.deepEqual(worktrees(dir), [dir])
  assert.equal(existsSync(built.id), false)
})

test('a leftover worktree is swept once no owner lives', async () => {
  const { build, remove, sweep } = await load()
  const dir = campaignFixture()
  const live = build(dir, { owner: process.pid })
  const dead = build(dir, { owner: gone() })
  assert.ok(live.ok && dead.ok)
  const said = []
  sweep(dir, line => said.push(line))
  assert.equal(existsSync(dead.id), false, 'the dead owner\'s tree was kept')
  assert.equal(existsSync(live.id), true, 'a live owner\'s tree was removed')
  assert.match(said.join('\n'), /removed .*worktree/)
  assert.equal(worktrees(dir).length, 2)
  remove(live.id)
})

test('a recorded process group keeps its worktree from the sweep', async () => {
  const { build, addOwned, sweep } = await load()
  const dir = campaignFixture()
  const built = build(dir, { owner: gone() })
  assert.ok(built.ok)
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { detached: process.platform !== 'win32', stdio: 'ignore', timeout: 60_000, windowsHide: true })
  try {
    addOwned(built.id, process.platform === 'win32' ? { pid: worker.pid } : { group: worker.pid })
    sweep(dir, () => {})
    assert.equal(existsSync(built.id), true, 'the sweep removed a tree whose recorded process still works')
  } finally {
    if (process.platform === 'win32') worker.kill('SIGKILL')
    else try { process.kill(-worker.pid, 'SIGKILL') } catch {}
  }
  await new Promise(resolve => worker.once('exit', resolve))
  sweep(dir, () => {})
  assert.equal(existsSync(built.id), false, 'the tree outlived every owner')
})

test('the CLI builds and removes a worktree and says why it could not', async () => {
  const dir = campaignFixture()
  const built = spawnSync(process.execPath, [cli, 'build', dir, '--owner', String(process.pid)], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(built.status, 0, built.stderr)
  const answer = JSON.parse(built.stdout.trim().split('\n').pop())
  assert.ok(answer.tree && answer.id && Number.isFinite(answer.builtMs) && Number.isInteger(answer.overlaid), built.stdout)
  const removed = spawnSync(process.execPath, [cli, 'remove', answer.id], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(removed.status, 0, removed.stderr)
  assert.deepEqual(worktrees(dir), [dir])
  const outside = path.dirname(dir)
  const refused = spawnSync(process.execPath, [cli, 'build', outside, '--owner', String(process.pid)], { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(refused.status, 2, refused.stdout + refused.stderr)
  assert.ok(JSON.parse(refused.stdout.trim().split('\n').pop()).error, refused.stdout)
})

test('a setup failure after worktree add removes the worktree', async () => {
  const { build } = await load()
  const dir = campaignFixture()
  writeFileSync(path.join(dir, 'new.txt'), 'untracked\n')
  const copying = build(dir, { owner: process.pid, io: { copyFileSync: () => { throw Object.assign(new Error('copy refused'), { code: 'EACCES' }) } } })
  assert.equal(copying.ok, false)
  assert.match(copying.error, /EACCES/)
  assert.deepEqual(worktrees(dir), [dir], 'a failed untracked copy left its tree registered')
  writeFileSync(path.join(dir, '.gitattributes'), '*.mjs text eol=lf\n')
  fixtureGit(dir, ['add', '.gitattributes'])
  fixtureGit(dir, ['commit', '-qm', 'attributes'])
  writeFileSync(path.join(dir, 'lib2.mjs'), FIXTURE_FILES['lib2.mjs'].replace(/\n/g, '\r\n'))
  const overlaying = build(dir, { owner: process.pid, io: { writeFileSync: () => { throw Object.assign(new Error('write refused'), { code: 'EROFS' }) } } })
  assert.equal(overlaying.ok, false)
  assert.match(overlaying.error, /EROFS/)
  assert.deepEqual(worktrees(dir), [dir], 'a failed overlay left its tree registered')
})

test("the campaign's own files are never copied into its worktree", async () => {
  const { build, remove } = await load()
  const dir = campaignFixture()
  writeFileSync(path.join(dir, 'lockish'), String(process.pid))
  writeFileSync(path.join(dir, 'keep.txt'), 'kept\n')
  const built = build(dir, { owner: process.pid, exclude: [path.join(dir, 'lockish')] })
  assert.ok(built.ok, built.error)
  try {
    assert.equal(existsSync(path.join(built.tree, 'lockish')), false, 'an excluded file was copied')
    assert.equal(existsSync(path.join(built.tree, 'keep.txt')), true)
  } finally { remove(built.id) }
})

// Codex round on ADR-076, finding 7: the first directory and the owner record are part of the
// build's contract, so a git directory that cannot be written is `{ ok: false }`, not a throw a
// caller outside its cleanup boundary cannot answer.
test('a git directory that cannot be written is a build error, not a throw', { skip: (process.platform === 'win32' || process.getuid?.() === 0) && 'permission bits do not bind here' }, async () => {
  const { build } = await load()
  const dir = campaignFixture()
  const git = path.join(dir, '.git')
  chmodSync(git, 0o555)
  try {
    let built
    assert.doesNotThrow(() => { built = build(dir, { owner: process.pid }) })
    assert.equal(built.ok, false)
    assert.match(built.error, /qh-campaigns/)
  } finally {
    chmodSync(git, 0o755)
  }
})
