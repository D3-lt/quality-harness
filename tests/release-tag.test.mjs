// ADR-147 T2: `node scripts/release.mjs` makes the release's tag itself, at the sha `release-evidence` cleared, with a push
// that cannot move a ref that exists, and only then creates the release from that tag. A tag without a release resumes
// only when the forge shows it at this sha. The command is driven through its exported `release` against the fake world;
// git itself is spawned only in a directory this file made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { tagPush } from '../scripts/release.mjs'
import { remove } from './helpers/remove.mjs'
import { SHA, tagged, world } from './helpers/release-world.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TAG = 'v1.0.1'
const TAG_PUSH = `git push origin ${SHA}:refs/tags/${TAG}`
const EVIDENCE = `node scripts/release-evidence.mjs ${SHA}`
const tagPushes = calls => calls.filter(line => line.startsWith('git push') && line.includes('refs/tags/'))

test('the tag is pushed at the cleared sha before the release is created', () => {
  const w = world()
  assert.equal(w.run(), 0, w.said.join('\n'))
  assert.deepEqual(tagPushes(w.calls), [TAG_PUSH], 'one push of the tag, of this sha, with no force')
  const create = w.calls.findIndex(line => line.startsWith('gh release create'))
  assert.ok(w.calls.indexOf(TAG_PUSH) < create, 'the tag is on the forge before the release is created')
  assert.ok(w.calls.indexOf(TAG_PUSH) > w.calls.findIndex(line => line.startsWith('node scripts/release-assets.mjs ')), 'and only after the assets are verified')
  assert.ok(w.calls.indexOf(TAG_PUSH) > w.calls.indexOf(EVIDENCE), 'and after the evidence')
  const words = w.calls[create].split(' ')
  assert.ok(words.includes('--verify-tag'), 'the release is created from a tag the forge has, or not at all')
  assert.equal(words[words.indexOf('--target') + 1], SHA, 'a tag deleted in between is made at this sha, not at main')

  // The forge has the tag elsewhere, or refused it: nothing is published.
  const refused = world({ tagPush: 1 })
  assert.equal(refused.run(), 1, refused.said.join('\n'))
  assert.deepEqual(tagPushes(refused.calls), [TAG_PUSH])
  assert.ok(!tagged(refused.calls), 'no release without its tag')
  assert.ok(refused.said.some(line => line.includes(TAG) && line.includes(SHA) && /nothing was published/.test(line)), refused.said.join('\n'))

  // Nothing is pushed for a sha the evidence did not clear, or whose assets did not verify.
  for (const over of [{ evidence: [1] }, { evidence: [2] }, { assetFailure: 1 }]) {
    const stopped = world(over)
    assert.notEqual(stopped.run(), 0, JSON.stringify(over))
    assert.deepEqual(tagPushes(stopped.calls), [], JSON.stringify(over))
    assert.ok(!tagged(stopped.calls), JSON.stringify(over))
  }
})

test('a push cannot move a tag that exists', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-release-tag-'))
  t.after(() => remove(dir))
  const remote = path.join(dir, 'origin.git')
  const made = path.join(dir, 'work')
  mkdirSync(made)
  const spawned = (cwd, args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  const git = (cwd, ...args) => {
    const run = spawned(cwd, args)
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
    return run.stdout.trim()
  }
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote)
  git(made, 'init', '-q', '-b', 'main')
  git(made, 'remote', 'add', 'origin', remote)
  const commit = text => {
    writeFileSync(path.join(made, 'file.txt'), text)
    git(made, 'add', '.')
    git(made, 'commit', '-qm', text.trim())
    return git(made, 'rev-parse', 'HEAD')
  }
  const [first, second] = [commit('one\n'), commit('two\n')]
  git(made, 'push', '-q', 'origin', 'main')
  const shown = tag => git(made, 'ls-remote', 'origin', `refs/tags/${tag}`)

  // The push the command makes, with no tag on the forge: it creates the tag at that sha.
  assert.equal(spawned(made, tagPush(first, TAG)).status, 0)
  assert.equal(shown(TAG), `${first}\trefs/tags/${TAG}`)
  // With the tag at another commit, a descendant included: refused, and the forge's tag is where it was.
  assert.notEqual(spawned(made, tagPush(second, TAG)).status, 0, 'a tag that exists is not moved')
  assert.equal(shown(TAG), `${first}\trefs/tags/${TAG}`)
  // At the same commit it is nothing to do, which is how a release whose creation failed resumes.
  assert.equal(spawned(made, tagPush(first, TAG)).status, 0)
  assert.equal(shown(TAG), `${first}\trefs/tags/${TAG}`)
})

test('a tag without a release resumes only at its own sha', () => {
  const tags = ['v1.0.0', TAG]
  const here = world({ tags, tagLines: `${SHA}\trefs/tags/${TAG}\n` })
  assert.equal(here.run(), 0, here.said.join('\n'))
  assert.ok(here.calls.includes(EVIDENCE), 'the release goes on to its evidence')
  assert.deepEqual(tagPushes(here.calls), [TAG_PUSH], 'the same push, which the forge answers as nothing to do')
  assert.ok(tagged(here.calls))
  assert.match(here.said.join('\n'), /resumes/)

  const other = 'b'.repeat(40)
  for (const [what, over] of [
    ['the tag at another sha', { tagLines: `${other}\trefs/tags/${TAG}\n` }],
    ['no line', { tagLines: '' }],
    ['a longer version at this sha', { tagLines: `${SHA}\trefs/tags/${TAG}0\n` }],
    ['only a branch whose name ends in the tag', { tagLines: `${SHA}\trefs/heads/x/refs/tags/${TAG}\n` }],
    ['a short id', { tagLines: `${SHA.slice(0, 7)}\trefs/tags/${TAG}\n` }],
  ]) {
    const w = world({ tags, ...over })
    assert.equal(w.run(), 2, `${what}: ${w.said.join('\n')}`)
    assert.match(w.said.join('\n'), /has no release[\s\S]*release-evidence/, what)
    assert.doesNotMatch(w.said.join('\n'), /by hand/, what)
    assert.ok(!w.calls.includes(EVIDENCE) && !tagPushes(w.calls).length && !tagged(w.calls), `${what}: nothing was checked, pushed or published`)
  }
  // A forge that could not be asked shows no other commit: it is said as unread, whatever it printed before it failed.
  const unread = world({ tags, tagLookup: 128, tagLines: `${SHA}\trefs/tags/${TAG}\n` })
  assert.equal(unread.run(), 1, unread.said.join('\n'))
  assert.match(unread.said.join('\n'), /could not be read/)
  assert.doesNotMatch(unread.said.join('\n'), /bump|by hand/)
  assert.ok(!unread.calls.includes(EVIDENCE) && !tagPushes(unread.calls).length && !tagged(unread.calls), 'nothing was checked, pushed or published')
})

test('the instructions say the command makes the tag', () => {
  const text = readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8').replaceAll('\r\n', '\n')
  const step = text.slice(text.indexOf('\n7. It '), text.indexOf('\nWhy: `.claude/rules/13-releasing.md`'))
  assert.ok(step.length > 0, 'CLAUDE.md §13 step 7 was found')
  assert.match(step, /git push origin <full sha>:refs\/tags\/vX\.Y\.Z/)
  assert.match(step, /gh release create vX\.Y\.Z --target <full sha> --latest --verify-tag/)
  assert.match(step, /ADR-147/)
})
