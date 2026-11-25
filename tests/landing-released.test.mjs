// ADR-147 T1: `scripts/landing-class.mjs` also answers "skip the mutation campaign" for a push to land/<sha> whose plugin
// version already has its tag on the forge, since no release is cut from such a landing. Everything else, and every fact
// it could not read, gets the answer ADR-146's pin check gives. Git is spawned only in directories this file made
// (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { landingClass, readRelease } from '../scripts/landing-class.mjs'
import { remove } from './helpers/remove.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(repoRoot, 'scripts', 'landing-class.mjs')
const MANIFEST = 'plugin/.claude-plugin/plugin.json'
const PIN = '.claude-plugin/marketplace.json'
const SHA = 'a'.repeat(40)
const MAIN = 'b'.repeat(40)
const ID = 'c'.repeat(40)
const VERSION = '3.8.81'
const REF = `refs/tags/v${VERSION}`
const LINE = `${ID}\t${REF}`
const bytes = text => Buffer.from(text, 'utf8')
// Git as the fixture runs it: nothing inherited may point it at another repository than the one the test made.
const CLEAN = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')))

// The catalogue file as a release leaves it, and as the pin after it leaves it.
const catalogue = (version, digest) => [
  '{', '  "name": "quality-harness",', '  "plugins": [', '    {', '      "name": "quality-harness",', `      "version": "${version}",`,
  '      "source": {', '        "source": "archive",', `        "url": "https://example.invalid/releases/download/v${version}/quality-harness.zip",`,
  `        "sha256": "${digest}"`, '      },', '      "category": "development"', '    }', '  ]', '}', '',
].join('\n')
const BEFORE = catalogue('3.8.80', '1'.repeat(64))
const AFTER = catalogue(VERSION, '2'.repeat(64))

// What the command reads of a landing that changes code: one commit on main's tip, and no pin for the pin check to find.
const CODE = { event: 'push', ref: `refs/heads/land/${SHA}`, sha: SHA, head: SHA, parents: [MAIN], main: MAIN, root: null, dir: null, before: null, after: null }
// And of a pin: the two trees differ in the catalogue's directory alone, and that in the catalogue file alone.
const entry = (mode, name, id) => Buffer.concat([bytes(`${mode} ${name}\0`), Buffer.from(id, 'hex')])
const PINNED = {
  ...CODE,
  root: [entry('40000', '.claude-plugin', '1'.repeat(40)), entry('40000', '.claude-plugin', '2'.repeat(40))],
  dir: [entry('100644', 'marketplace.json', '3'.repeat(40)), entry('100644', 'marketplace.json', '4'.repeat(40))],
  before: bytes(BEFORE), after: bytes(AFTER),
}

test('a landing of a version already tagged skips the campaign', () => {
  const tagged = landingClass({ ...CODE, version: VERSION, tags: [LINE] })
  assert.equal(tagged.skip, true, tagged.reason)
  assert.match(tagged.reason, /3\.8\.81[\s\S]*ADR-147/)
  assert.equal(landingClass({ ...CODE, version: VERSION, tags: [`${ID}\trefs/heads/x/${REF}`, LINE] }).skip, true, 'beside a branch whose name ends in the tag\'s name')
  assert.equal(landingClass({ ...CODE, version: VERSION, tags: [`${'d'.repeat(64)}\t${REF}`] }).skip, true, 'an object id of the other width')

  // Each of these is not that answer, and is then answered as the pin check answers the same landing without the facts.
  const pinCheck = landingClass(CODE)
  assert.equal(pinCheck.skip, false)
  for (const [what, facts] of [
    ['no line', { version: VERSION, tags: [] }],
    ["another version's tag", { version: VERSION, tags: [`${ID}\trefs/tags/v3.8.80`] }],
    ['a longer version that starts alike', { version: VERSION, tags: [`${ID}\t${REF}1`] }],
    ['only the branch that ends in the tag\'s name', { version: VERSION, tags: [`${ID}\trefs/heads/x/${REF}`] }],
    ['a tag whose dots are other characters', { version: VERSION, tags: [`${ID}\trefs/tags/v3x8y81`] }],
    ['a short object id', { version: VERSION, tags: [`${ID.slice(0, 7)}\t${REF}`] }],
    ['an object id that is not hex', { version: VERSION, tags: [`${'g'.repeat(40)}\t${REF}`] }],
    ['a line without a tab', { version: VERSION, tags: [`${ID} ${REF}`] }],
    ['a line with a third field', { version: VERSION, tags: [`${LINE}\tx`] }],
    ['a line that is not text', { version: VERSION, tags: [bytes(LINE)] }],
    ['the answer as one text, not lines', { version: VERSION, tags: LINE }],
    ['an answer that could not be read', { version: VERSION, tags: null }],
    ['no answer', { version: VERSION }],
    ['a version with a suffix, and its tag', { version: `${VERSION}-rc1`, tags: [`${ID}\t${REF}-rc1`] }],
    ['a version of two parts, and its tag', { version: '3.8', tags: [`${ID}\trefs/tags/v3.8`] }],
    ['a version with a letter, and its tag', { version: '3.8.x', tags: [`${ID}\trefs/tags/v3.8.x`] }],
    ['a version that ends in a newline, and its tag', { version: `${VERSION}\n`, tags: [`${ID}\t${REF}\n`] }],
    ['a version that is not a string', { version: 3, tags: [`${ID}\trefs/tags/v3`] }],
    ['a version that could not be read', { version: null, tags: [LINE] }],
    ['no version', { tags: [LINE] }],
  ]) assert.deepEqual(landingClass({ ...CODE, ...facts }), pinCheck, what)

  // The event, the ref and the commit checked out come first: a tagged version does not answer for another kind of run.
  const released = { version: VERSION, tags: [LINE] }
  for (const [what, over] of [
    ['a pull request', { event: 'pull_request' }],
    ['a dispatch', { event: 'workflow_dispatch' }],
    ['another branch', { ref: 'refs/heads/main' }],
    ['land/<another sha>', { ref: `refs/heads/land/${MAIN}` }],
    ['a pushed sha that is not a full sha', { sha: SHA.slice(0, 7), ref: `refs/heads/land/${SHA.slice(0, 7)}`, head: SHA.slice(0, 7) }],
    ['a head that is not the sha', { head: MAIN }],
    ['a head that could not be read', { head: null }],
  ]) {
    assert.equal(landingClass({ ...CODE, ...released, ...over }).skip, false, what)
    assert.deepEqual(landingClass({ ...CODE, ...released, ...over }), landingClass({ ...CODE, ...over }), `${what}: answered as without the tag`)
  }

  // A pin with no tag still skips, as a pin; and a tagged version skips whatever its parents are.
  const pin = landingClass({ ...PINNED, version: VERSION, tags: [] })
  assert.equal(pin.skip, true, pin.reason)
  assert.match(pin.reason, /pinned version/)
  assert.deepEqual(landingClass(PINNED), pin)
  for (const [what, over] of [['no parent', { parents: [] }], ['two parents', { parents: [MAIN, ID] }], ['parents unread', { parents: null }], ["a parent that is not main's tip", { main: ID }], ['main unread', { main: null }]]) {
    assert.equal(landingClass({ ...CODE, ...released, ...over }).skip, true, what)
    assert.equal(landingClass({ ...CODE, ...over }).skip, false, `${what}, without the tag`)
  }
})

test('the version and its tag are read from git and the forge', () => {
  const answers = { 'cat-file': bytes(`${JSON.stringify({ name: 'quality-harness', version: VERSION }, null, 2)}\n`), 'ls-remote': bytes(`${LINE}\n`) }
  const wanted = { 'cat-file': ['cat-file', 'blob', `HEAD:${MANIFEST}`], 'ls-remote': ['ls-remote', 'origin', REF] }
  // `broken` names one command and what its child came back as; the other answers as git would. `asked` lists the commands.
  const read = (broken, child, asked = []) => readRelease('.', (cmd, args, options) => {
    assert.equal(cmd, 'git')
    assert.equal(options.windowsHide, true)
    assert.ok(options.timeout > 0, 'every child is bounded')
    assert.deepEqual(args, wanted[args[0]], `an unexpected command: git ${args.join(' ')}`)
    asked.push(args[0])
    return args[0] === broken ? child(answers[args[0]]) : { status: 0, stdout: answers[args[0]] }
  })
  const skips = (broken, child, asked) => landingClass({ ...CODE, ...read(broken, child, asked) }).skip
  assert.deepEqual(read(null), { version: VERSION, tags: [LINE] })
  assert.equal(skips(null), true, 'both commands answered')
  assert.deepEqual(read('ls-remote', () => ({ status: 0, stdout: bytes(`${ID}\trefs/heads/x/${REF}\n${LINE}\n`) })).tags, [`${ID}\trefs/heads/x/${REF}`, LINE], 'every line the forge printed')

  for (const command of Object.keys(answers)) {
    assert.equal(skips(command, stdout => ({ status: 1, stdout })), false, `${command} exited 1 with its whole answer`)
    assert.equal(skips(command, stdout => ({ status: null, stdout, error: new Error('ETIMEDOUT') })), false, `${command} timed out`)
    assert.equal(skips(command, stdout => ({ status: 0, stdout, error: new Error('ENOBUFS') })), false, `${command} came back with an error beside its whole answer`)
    assert.equal(skips(command, stdout => ({ status: 0, stdout: stdout.toString('utf8') })), false, `${command} answered text, not bytes`)
  }
  assert.equal(skips('ls-remote', stdout => ({ status: 0, stdout: stdout.subarray(0, stdout.length - 1) })), false, "the forge's answer cut one byte short")
  assert.equal(skips('ls-remote', () => ({ status: 0, stdout: bytes('') })), false, 'the forge answered nothing')

  // The manifest is the blob's bytes: whole JSON is read with or without a final newline.
  const manifest = text => { const asked = []; return { skip: skips('cat-file', () => ({ status: 0, stdout: Buffer.isBuffer(text) ? text : bytes(text) }), asked), asked } }
  assert.deepEqual(manifest(`{"version":"${VERSION}"}`), { skip: true, asked: ['cat-file', 'ls-remote'] }, 'whole JSON with no final newline')
  for (const [what, text] of [
    ['cut inside its JSON', `{"version":"${VERSION}"`],
    ['not JSON', 'version: 3.8.81\n'],
    ['not UTF-8', Buffer.concat([bytes('{"version":"3.8.81","name":"'), Buffer.from([0xff]), bytes('"}\n')])],
    ['behind a byte-order mark', `﻿{"version":"${VERSION}"}\n`],
    ['JSON that is not an object', 'null\n'],
    ['without a version', '{"name":"quality-harness"}\n'],
    ['with a version that is not a string', '{"version":3}\n'],
    ['with a version of another shape', `{"version":"${VERSION}-rc1"}\n`],
  ]) assert.deepEqual(manifest(text), { skip: false, asked: ['cat-file'] }, `a manifest ${what} asks the forge nothing`)
})

test('the command reads a real tag', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-landing-released-'))
  t.after(() => remove(dir))
  const remote = path.join(dir, 'origin.git')
  const made = path.join(dir, 'work')
  mkdirSync(made)
  const git = (cwd, ...args) => {
    const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args],
      { cwd, env: CLEAN, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
    return run.stdout.trim()
  }
  const write = (name, text) => { mkdirSync(path.dirname(path.join(made, name)), { recursive: true }); writeFileSync(path.join(made, name), text) }
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote)
  git(made, 'init', '-q', '-b', 'main')
  git(made, 'remote', 'add', 'origin', remote)
  write(MANIFEST, `${JSON.stringify({ name: 'quality-harness', version: VERSION }, null, 2)}\n`)
  write(PIN, BEFORE)
  write('source.txt', 'one\n')
  git(made, 'add', '.')
  git(made, 'commit', '-qm', 'base')
  const base = git(made, 'rev-parse', 'HEAD')
  git(made, 'push', '-q', 'origin', 'main')

  // The command as the workflow runs it at the commit checked out; `over` replaces parts of its environment.
  const asked = (over = {}) => {
    const sha = git(made, 'rev-parse', 'HEAD')
    const output = path.join(dir, `output-${Math.random().toString(16).slice(2)}`)
    writeFileSync(output, '')
    const env = { ...CLEAN, GITHUB_EVENT_NAME: 'push', GITHUB_REF: `refs/heads/land/${sha}`, GITHUB_SHA: sha, GITHUB_OUTPUT: output, ...over }
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: made, env, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    return { status: run.status, wrote: readFileSync(output, 'utf8'), said: run.stdout + run.stderr }
  }
  const is = (answer, wrote, what) => {
    assert.equal(answer.status, 0, `${what}: ${answer.said}`)
    assert.equal(answer.wrote, wrote, `${what}: ${answer.said}`)
  }

  // A pin, with no tag on the forge: ADR-146's answer, through the same command.
  write(PIN, AFTER)
  git(made, 'commit', '-qam', 'pin')
  const pin = asked()
  is(pin, 'skip=1\n', 'a pin with no tag')
  assert.match(pin.said, /pinned version/)
  git(made, 'reset', '-q', '--hard', base)

  // A commit that changes a source file, two commits ahead of main: only the tag can make it a skip.
  write('source.txt', 'two\n')
  git(made, 'commit', '-qam', 'code')
  write('source.txt', 'three\n')
  git(made, 'commit', '-qam', 'more code')
  is(asked(), 'skip=0\n', 'no tag anywhere')
  git(made, 'tag', `v${VERSION}`, base)
  is(asked(), 'skip=0\n', 'the tag only in the local repository')
  git(made, 'push', '-q', 'origin', `${base}:refs/tags/v${VERSION}1`)
  is(asked(), 'skip=0\n', "a longer version's tag on the forge")
  git(made, 'push', '-q', 'origin', `${base}:refs/heads/x/refs/tags/v${VERSION}`)
  is(asked(), 'skip=0\n', "a branch on the forge whose name ends in the tag's name")

  git(made, 'push', '-q', 'origin', `refs/tags/v${VERSION}`)
  const tagged = asked()
  is(tagged, 'skip=1\n', 'its lightweight tag on the forge')
  assert.match(tagged.said, /skip the mutation campaign[\s\S]*3\.8\.81/)
  is(asked({ GITHUB_EVENT_NAME: 'pull_request' }), 'skip=0\n', 'the same commit on a pull request')
  is(asked({ PATH: '', Path: '' }), 'skip=0\n', 'git absent')

  git(made, 'push', '-q', 'origin', `:refs/tags/v${VERSION}`)
  is(asked(), 'skip=0\n', 'the tag deleted from the forge')
  git(made, 'tag', '-f', '-a', '-m', 'release', `v${VERSION}`, base)
  git(made, 'push', '-q', 'origin', `refs/tags/v${VERSION}`)
  is(asked(), 'skip=1\n', 'an annotated tag on the forge')

  write(MANIFEST, 'version: 3.8.81\n')
  git(made, 'commit', '-qam', 'a manifest that does not parse')
  is(asked(), 'skip=0\n', 'a manifest that does not parse, its old version tagged')
})

test('the instructions say which landing is the full campaign', () => {
  const read = name => readFileSync(path.join(repoRoot, name), 'utf8').replaceAll('\r\n', '\n')
  const rules = read('CLAUDE.md')
  const between = (text, from, to) => { const at = text.indexOf(from); return at === -1 ? '' : text.slice(at, text.indexOf(to, at)) }
  for (const [what, part] of [
    ['§13 step 3', between(rules, "\n3. The landing's own push run", '\n4. It waits')],
    ['§18', between(rules, '\n## 18. ', '\n## 19. ')],
    ["the workflow's seed job", between(read('.github/workflows/selftest.yml'), '\n  mutation-cache-seed:', '\n  mutations:')],
  ]) {
    assert.ok(part.length > 0, `${what} was found`)
    assert.match(part, /ADR-147/, what)
    assert.match(part, /already tagged/, what)
    assert.match(part, /ADR-146/, `${what} still names the pin`)
  }
})
