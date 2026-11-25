// ADR-146 T1: `scripts/landing-class.mjs` answers "skip the mutation campaign" only for a landing whose one commit sits
// on main's tip and changes nothing but the three pinned values of the catalogue file. Every fact it could not read, and
// every other change, runs the campaign. Git is spawned only in directories this file made (CLAUDE.md §9).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { landingClass, pinOnly, rawEntries, readFacts } from '../scripts/landing-class.mjs'
import { remove } from './helpers/remove.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/landing-class.mjs', import.meta.url))
const PIN = '.claude-plugin/marketplace.json'
const SHA = 'a'.repeat(40)
const MAIN = 'b'.repeat(40)

// The catalogue file as a release leaves it, and as the pin after it leaves it: three values differ.
const catalogue = ({ version = '3.8.80', digest = '1'.repeat(64) } = {}) => [
  '{',
  '  "name": "quality-harness",',
  '  "plugins": [',
  '    {',
  '      "name": "quality-harness",',
  `      "version": "${version}",`,
  '      "source": {',
  '        "source": "archive",',
  `        "url": "https://example.invalid/releases/download/v${version}/quality-harness.zip",`,
  `        "sha256": "${digest}"`,
  '      },',
  '      "category": "development"',
  '    }',
  '  ]',
  '}',
  '',
].join('\n')
const BEFORE = catalogue()
const AFTER = catalogue({ version: '3.8.81', digest: '2'.repeat(64) })
const bytes = text => Buffer.from(text, 'utf8')
const lines = (text, edit) => { const all = text.split('\n'); edit(all); return all.join('\n') }

test('only the three pinned values may differ', () => {
  assert.equal(pinOnly(bytes(BEFORE), bytes(AFTER)), true, 'a pin: version, url and sha256')
  assert.equal(pinOnly(bytes(BEFORE), bytes(catalogue({ version: '3.8.81' }))), true, 'two of the three')
  const not = [
    ['identical texts', AFTER.replace('3.8.81', '3.8.80').replace('3.8.81', '3.8.80').replace('2'.repeat(64), '1'.repeat(64))],
    ["a fourth key's value", AFTER.replace('"category": "development"', '"category": "other"')],
    ['a line added', lines(AFTER, all => all.splice(5, 0, '      "extra": "x",'))],
    ['a line removed', lines(AFTER, all => all.splice(11, 1))],
    ['a line appended at the end', `${AFTER}\n`],
    ['two lines swapped', lines(AFTER, all => { [all[8], all[9]] = [all[9], all[8]] })],
    ['the plugins line itself', AFTER.replace('"plugins": [', '"plugins": [{"name":"quality-harness","source":"."},')],
    ['indentation changed', AFTER.replace('      "version"', '       "version"')],
    ['a comma added', AFTER.replace(`"sha256": "${'2'.repeat(64)}"`, `"sha256": "${'2'.repeat(64)}",`)],
    ['a key renamed on one side', AFTER.replace('"version": "3.8.81"', '"url": "3.8.81"')],
    ['a value holding an escaped quote', AFTER.replace('"version": "3.8.81"', '"version": "3.8.81\\"x"')],
    ['a value holding a second string', AFTER.replace('"version": "3.8.81"', '"version": "3.8.81", "source": "."')],
    ['CRLF on one side', AFTER.replaceAll('\n', '\r\n')],
  ]
  for (const [what, text] of not) assert.equal(pinOnly(bytes(BEFORE), bytes(text)), false, what)
  assert.equal(pinOnly(BEFORE, AFTER), false, 'text that is not bytes was not read')
  assert.equal(pinOnly(bytes(BEFORE), null), false, 'an absent side')
})

// Everything a pin landing is, as the command reads it.
const pin = (over = {}) => ({
  event: 'push', ref: `refs/heads/land/${SHA}`, sha: SHA, head: SHA, parents: [MAIN], main: MAIN,
  entries: [{ path: bytes(PIN), status: 'M', before: '100644', after: '100644' }],
  before: bytes(BEFORE), after: bytes(AFTER), ...over,
})

test('a pin landing is one commit on main that changes one regular file', () => {
  const answer = landingClass(pin())
  assert.equal(answer.skip, true, answer.reason)
  const entry = over => [{ ...pin().entries[0], ...over }]
  const not = [
    ['a pull request', { event: 'pull_request' }],
    ['a dispatch', { event: 'workflow_dispatch' }],
    ['no event', { event: undefined }],
    ['a push to another branch', { ref: 'refs/heads/main' }],
    ['land/<another sha>', { ref: `refs/heads/land/${MAIN}` }],
    ['a ref that only starts with the landing ref', { ref: `refs/heads/land/${SHA}x` }],
    ['a head that is not the sha', { head: MAIN }],
    ['no head', { head: null }],
    ['a short sha', { sha: SHA.slice(0, 12), head: SHA.slice(0, 12), ref: `refs/heads/land/${SHA.slice(0, 12)}` }],
    ['two parents', { parents: [MAIN, 'c'.repeat(40)] }],
    ['no parent', { parents: [] }],
    ['parents unread', { parents: null }],
    ['a parent that is not main', { parents: ['c'.repeat(40)] }],
    ['no main', { main: null }],
    ['entries unread', { entries: null }],
    ['no entry', { entries: [] }],
    ['a second entry', { entries: [...pin().entries, { path: bytes('docs/x.md'), status: 'M', before: '100644', after: '100644' }] }],
    ['another path', { entries: entry({ path: bytes('.claude-plugin/plugin.json') }) }],
    ['the path with a trailing byte', { entries: entry({ path: Buffer.concat([bytes(PIN), Buffer.from([0xff])]) }) }],
    ['the path as text', { entries: entry({ path: PIN }) }],
    ['status A', { entries: entry({ status: 'A' }) }],
    ['an executable', { entries: entry({ after: '100755' }) }],
    ['a symlink', { entries: entry({ before: '120000', after: '120000' }) }],
    ['absent blobs', { before: null, after: null }],
    ['a change that is not a pin', { after: bytes(AFTER.replace('development', 'other')) }],
  ]
  for (const [what, over] of not) {
    const refused = landingClass(pin(over))
    assert.equal(refused.skip, false, what)
    assert.equal(typeof refused.reason, 'string', what)
    assert.notEqual(refused.reason, '', what)
  }
  assert.equal(landingClass(undefined).skip, false, 'no facts at all')
})

test('a command that failed leaves its fact absent', () => {
  const RAW = Buffer.concat([bytes(`:100644 100644 ${'1'.repeat(40)} ${'2'.repeat(40)} M`), Buffer.from([0]), bytes(PIN), Buffer.from([0])])
  const answers = {
    'rev-parse': bytes(`${SHA}\n`), 'rev-list': bytes(`${SHA} ${MAIN}\n`), 'ls-remote': bytes(`${MAIN}\trefs/heads/main\n`),
    'diff-tree': RAW, [`cat-file ${MAIN}`]: bytes(BEFORE), [`cat-file ${SHA}`]: bytes(AFTER),
  }
  const named = args => args[0] === 'cat-file' ? `cat-file ${args[2].split(':')[0]}` : args[0]
  const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: `refs/heads/land/${SHA}`, GITHUB_SHA: SHA }
  // `broken` names one command and what its child came back as; every other command answers as git would.
  const asked = (broken, child) => landingClass(readFacts(env, '.', (cmd, args, options) => {
    assert.equal(cmd, 'git')
    assert.equal(options.windowsHide, true)
    assert.ok(options.timeout > 0, 'every child is bounded')
    return named(args) === broken ? child(answers[named(args)]) : { status: 0, stdout: answers[named(args)] }
  }))
  assert.equal(asked(null).skip, true, 'every command answered: a pin')
  for (const command of Object.keys(answers)) {
    assert.equal(asked(command, stdout => ({ status: 1, stdout })).skip, false, `${command} exited 1 with its whole answer`)
    assert.equal(asked(command, stdout => ({ status: null, stdout, error: new Error('ETIMEDOUT') })).skip, false, `${command} timed out`)
    assert.equal(asked(command, () => ({ status: 0, stdout: 'text' })).skip, false, `${command} answered text, not bytes`)
  }
  assert.equal(asked('diff-tree', stdout => ({ status: 0, stdout: stdout.subarray(0, stdout.length - 1) })).skip, false, 'a diff that ended early')
  assert.equal(asked('ls-remote', () => ({ status: 0, stdout: bytes(`${MAIN}\trefs/heads/main\n${SHA}\trefs/heads/main2\n`) })).skip, false, 'two refs answered')
  assert.equal(asked('rev-list', () => ({ status: 0, stdout: bytes(`${MAIN} ${MAIN}\n`) })).skip, false, "another commit's parents")

  assert.deepEqual(rawEntries(RAW), [{ before: '100644', after: '100644', status: 'M', path: bytes(PIN) }])
  assert.deepEqual(rawEntries(Buffer.alloc(0)), [], 'nothing changed is an empty list, which is not a pin either')
  for (const [what, output] of [
    ['no final NUL', RAW.subarray(0, RAW.length - 1)], ['a path with no entry before it', Buffer.concat([bytes(PIN), Buffer.from([0])])],
    ['an entry with no path', RAW.subarray(0, RAW.indexOf(0) + 1)], ['text', RAW.toString('latin1')], ['nothing read', null],
    ['a whole entry and an unterminated one after it', Buffer.concat([RAW, bytes(':100644 100644')])],
  ]) assert.equal(rawEntries(output), null, what)
})

test('the command reads a real commit', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-landing-class-'))
  t.after(() => remove(dir))
  const remote = path.join(dir, 'origin.git')
  const made = path.join(dir, 'work')
  mkdirSync(made)
  const git = (cwd, ...args) => {
    const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', ...args],
      { cwd, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
    return run.stdout.trim()
  }
  const write = (name, text) => { mkdirSync(path.dirname(path.join(made, name)), { recursive: true }); writeFileSync(path.join(made, name), text) }
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote)
  git(made, 'init', '-q', '-b', 'main')
  git(made, 'remote', 'add', 'origin', remote)
  write(PIN, BEFORE)
  write('other file.txt', 'one\n')
  git(made, 'add', '.')
  git(made, 'commit', '-qm', 'base')
  const base = git(made, 'rev-parse', 'HEAD')
  git(made, 'push', '-q', 'origin', 'main')

  // The command as the workflow runs it at the commit checked out; `over` replaces or removes parts of its environment.
  const asked = (over = {}) => {
    const sha = git(made, 'rev-parse', 'HEAD')
    const output = path.join(dir, `output-${Math.random().toString(16).slice(2)}`)
    writeFileSync(output, '')
    const env = { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF: `refs/heads/land/${sha}`, GITHUB_SHA: sha, GITHUB_OUTPUT: output, ...over }
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: made, env, encoding: 'utf8', timeout: 120_000, windowsHide: true })
    return { status: run.status, wrote: readFileSync(output, 'utf8'), said: run.stdout + run.stderr }
  }
  const back = () => git(made, 'reset', '-q', '--hard', base)
  const is = (answer, wrote, what) => {
    assert.equal(answer.status, 0, `${what}: ${answer.said}`)
    assert.equal(answer.wrote, wrote, `${what}: ${answer.said}`)
  }

  write(PIN, AFTER)
  git(made, 'commit', '-qam', 'pin')
  const pinned = asked()
  is(pinned, 'skip=1\n', 'a pin commit on main')
  assert.match(pinned.said, /skip the mutation campaign/)
  is(asked({ GITHUB_EVENT_NAME: 'pull_request' }), 'skip=0\n', 'the same commit on a pull request')
  is(asked({ PATH: '', Path: '' }), 'skip=0\n', 'git absent')

  write('other file.txt', 'two\n')
  git(made, 'commit', '-qam', 'a second unlanded commit')
  is(asked(), 'skip=0\n', 'a commit whose parent is a pin, not main')
  write(PIN, catalogue({ version: '3.8.82', digest: '3'.repeat(64) }))
  git(made, 'commit', '-qam', 'pin again')
  is(asked(), 'skip=0\n', 'a pin behind two unlanded commits')

  back()
  write(PIN, AFTER)
  write('other file.txt', 'two\n')
  git(made, 'commit', '-qam', 'pin and more')
  is(asked(), 'skip=0\n', 'a pin that also touches another file')

  back()
  git(made, 'checkout', '-q', '-b', 'side')
  write('side.txt', 'side\n')
  git(made, 'add', '.')
  git(made, 'commit', '-qm', 'side')
  git(made, 'checkout', '-q', 'main')
  write(PIN, AFTER)
  git(made, 'commit', '-qam', 'pin')
  git(made, 'push', '-q', 'origin', 'main')
  git(made, 'merge', '-q', '--no-ff', '-m', 'merge', 'side')
  is(asked(), 'skip=0\n', 'a merge')

  git(made, 'reset', '-q', '--hard', 'HEAD^')
  git(made, 'update-index', '--chmod=+x', PIN)
  git(made, 'commit', '-qm', 'mode')
  is(asked(), 'skip=0\n', 'a mode change alone')

  git(made, 'reset', '-q', '--hard', 'HEAD^')
  write(PIN, catalogue({ version: '3.8.82', digest: '3'.repeat(64) }))
  git(made, 'commit', '-qam', 'the next pin')
  is(asked(), 'skip=1\n', 'the next pin, on the main that took the last one')
  const empty = path.join(dir, 'empty.git')
  git(dir, 'init', '-q', '--bare', '-b', 'main', empty)
  git(made, 'remote', 'set-url', 'origin', empty)
  is(asked(), 'skip=0\n', 'a remote without main')
})
