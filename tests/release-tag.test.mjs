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
const TAG_PUSH = `git push origin ${SHA}^{commit}:refs/tags/${TAG}`
const EVIDENCE = `node scripts/release-evidence.mjs ${SHA}`
const tagPushes = calls => calls.filter(line => line.startsWith('git push') && line.includes('refs/tags/'))
// Git as the fixtures run it: nothing inherited may point it at another repository than the one a test made.
const CLEAN = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')))

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
  assert.equal(words[words.indexOf('--target') + 1], SHA, 'the cleared sha is forwarded as the target')
  const looked = w.calls.indexOf(`git ls-remote origin refs/tags/${TAG}`)
  assert.ok(looked > w.calls.indexOf(TAG_PUSH) && looked < create, 'between the two, the forge is asked where the tag is')

  // The forge has the tag elsewhere, or refused it: nothing is published.
  const refused = world({ tagPush: 1 })
  assert.equal(refused.run(), 1, refused.said.join('\n'))
  assert.deepEqual(tagPushes(refused.calls), [TAG_PUSH])
  assert.ok(!tagged(refused.calls), 'no release without its tag')
  assert.ok(refused.said.some(line => line.includes(TAG) && line.includes(SHA) && /git push of[\s\S]*nothing was published/.test(line)), refused.said.join('\n'))
  assert.ok(!refused.calls.includes(`git ls-remote origin refs/tags/${TAG}`), 'a refused push stops the release there: the forge is not asked what it shows')
  // The push exited 0 and the forge shows the tag elsewhere, or nowhere, or cut short: whatever was pushed, nothing is published.
  for (const [what, after] of [['at another sha', `${'b'.repeat(40)}\trefs/tags/${TAG}\n`], ['nowhere', ''], ['cut short', `${SHA}\trefs/tags/${TAG}`]]) {
    const moved = world({ tagLinesAfter: after })
    assert.equal(moved.run(), 1, `${what}: ${moved.said.join('\n')}`)
    assert.ok(!tagged(moved.calls), `${what}: no release`)
    assert.match(moved.said.join('\n'), /nothing was published/, what)
  }

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
  const spawned = (cwd, args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, env: CLEAN, encoding: 'utf8', timeout: 60_000, windowsHide: true })
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
  // A local branch named like the sha and pointing elsewhere: the push names the commit, not that branch.
  git(made, 'branch', second, first)
  assert.equal(spawned(made, tagPush(second, 'v1.0.2')).status, 0)
  assert.equal(shown('v1.0.2'), `${second}\trefs/tags/v1.0.2`)
})

test('a tag without a release resumes only at its own sha', () => {
  const tags = ['v1.0.0', TAG]
  const here = world({ tags, tagLines: `${SHA}\trefs/tags/${TAG}\n` })
  assert.equal(here.run(), 0, here.said.join('\n'))
  assert.ok(here.calls.includes(EVIDENCE), 'the release goes on to its evidence')
  assert.deepEqual(tagPushes(here.calls), [TAG_PUSH], 'the same push, which the forge answers as nothing to do')
  assert.ok(tagged(here.calls))
  assert.match(here.said.join('\n'), /resumes/)
  const beside = world({ tags, tagLines: `${SHA}\trefs/heads/x/refs/tags/${TAG}\n${SHA}\trefs/tags/${TAG}\n` })
  assert.equal(beside.run(), 0, `beside a branch whose name ends in the tag: ${beside.said.join('\n')}`)

  const other = 'b'.repeat(40)
  for (const [what, over] of [
    ['the tag at another sha', { tagLines: `${other}\trefs/tags/${TAG}\n` }],
    ['no line', { tagLines: '' }],
    ['a longer version at this sha', { tagLines: `${SHA}\trefs/tags/${TAG}0\n` }],
    ['only a branch whose name ends in the tag', { tagLines: `${SHA}\trefs/heads/x/refs/tags/${TAG}\n` }],
    ['a short id', { tagLines: `${SHA.slice(0, 7)}\trefs/tags/${TAG}\n` }],
    ['two lines naming the tag, the first at this sha', { tagLines: `${SHA}\trefs/tags/${TAG}\n${other}\trefs/tags/${TAG}\n` }],
    ['a leading space', { tagLines: ` ${SHA}\trefs/tags/${TAG}\n` }],
    ['a trailing space', { tagLines: `${SHA}\trefs/tags/${TAG} \n` }],
  ]) {
    const w = world({ tags, ...over })
    assert.equal(w.run(), 2, `${what}: ${w.said.join('\n')}`)
    assert.match(w.said.join('\n'), /has no release[\s\S]*release-evidence/, what)
    assert.doesNotMatch(w.said.join('\n'), /by hand/, what)
    assert.ok(!w.calls.includes(EVIDENCE) && !tagPushes(w.calls).length && !tagged(w.calls), `${what}: nothing was checked, pushed or published`)
  }
  // A forge that could not be asked, or whose answer was cut short, shows no commit: it is said as unread.
  for (const [what, over] of [
    ['the lookup failing beside the right line', { tagLookup: 128, tagLines: `${SHA}\trefs/tags/${TAG}\n` }],
    ['the right line without its newline', { tagLines: `${SHA}\trefs/tags/${TAG}` }],
  ]) {
    const unread = world({ tags, ...over })
    assert.equal(unread.run(), 1, `${what}: ${unread.said.join('\n')}`)
    assert.match(unread.said.join('\n'), /could not be read/, what)
    assert.doesNotMatch(unread.said.join('\n'), /bump|by hand/, what)
    assert.ok(!unread.calls.includes(EVIDENCE) && !tagPushes(unread.calls).length && !tagged(unread.calls), `${what}: nothing was checked, pushed or published`)
  }
})

test('a draft left by an unfinished run is not a release', () => {
  const tags = ['v1.0.0', TAG]
  const catalogued = calls => calls.some(line => line.startsWith('node scripts/marketplace-source.mjs '))
  const draft = world({ tags, released: true, viewAnswer: `{"tagName":"${TAG}","isDraft":true}` })
  assert.equal(draft.run(), 2, draft.said.join('\n'))
  assert.match(draft.said.join('\n'), /draft/)
  assert.doesNotMatch(draft.said.join('\n'), /already released/)
  assert.ok(!catalogued(draft.calls) && !tagPushes(draft.calls).length && !tagged(draft.calls), 'the catalogue is not asked about a draft, and nothing is published')
  // CLEAN twin: a published release is said as released and goes on to the catalogue.
  const published = world({ tags, released: true, viewAnswer: `{"tagName":"${TAG}","isDraft":false}` })
  assert.equal(published.run(), 0, published.said.join('\n'))
  assert.match(published.said.join('\n'), /already released/)
  assert.ok(catalogued(published.calls))
  const garbled = world({ tags, released: true, viewAnswer: 'not json' })
  assert.equal(garbled.run(), 1, garbled.said.join('\n'))
  assert.match(garbled.said.join('\n'), /could not be read/)
  assert.ok(!catalogued(garbled.calls))
  // An answer that does not say it is about this tag, or whether it is a draft, has not said the tag is released.
  for (const [what, viewAnswer] of [
    ['a list holding a draft', `[{"tagName":"${TAG}","isDraft":true}]`],
    ['an empty object', '{}'],
    ['a draft flag that is text', `{"tagName":"${TAG}","isDraft":"false"}`],
    ["another tag's release", '{"tagName":"v9.9.9","isDraft":false}'],
    ['null', 'null'],
  ]) {
    const odd = world({ tags, released: true, viewAnswer })
    assert.equal(odd.run(), 1, `${what}: ${odd.said.join('\n')}`)
    assert.ok(!catalogued(odd.calls), what)
  }
})

test('the instructions say the command makes the tag', () => {
  const text = readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8').replaceAll('\r\n', '\n')
  const step = text.slice(text.indexOf('\n7. It '), text.indexOf('\nWhy: `.claude/rules/13-releasing.md`'))
  assert.ok(step.length > 0, 'CLAUDE.md §13 step 7 was found')
  assert.match(step, /git push origin <full sha>\^\{commit\}:refs\/tags\/vX\.Y\.Z/)
  assert.match(step, /gh release create vX\.Y\.Z --target <full sha> --latest --verify-tag/)
  assert.match(step, /ADR-147/)
})
