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
import { landingClass, onlyChange, pinOnly, readFacts, treeEntries } from '../scripts/landing-class.mjs'
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
    ['a value holding a NUL', AFTER.replace('"version": "3.8.81"', '"version": "3.8\0.81"')],
    ['a value holding a tab', AFTER.replace('"version": "3.8.81"', '"version": "3.8\t.81"')],
    ['a value that is not ASCII', AFTER.replace('"version": "3.8.81"', '"version": "3.8.81é"')],
    ['CRLF on one side', AFTER.replaceAll('\n', '\r\n')],
  ]
  for (const [what, text] of not) assert.equal(pinOnly(bytes(BEFORE), bytes(text)), false, what)
  assert.equal(pinOnly(BEFORE, AFTER), false, 'text that is not bytes was not read')
  // A pin over a file that does not parse is not a pin: the unchanged line is the broken one, on both sides.
  const broken = text => text.replace('"category": "development"', 'category: development')
  assert.equal(pinOnly(bytes(broken(BEFORE)), bytes(broken(AFTER))), false, 'the file after the pin is not JSON')
  assert.equal(pinOnly(bytes(BEFORE), null), false, 'an absent side')
  // A field of the same name outside a plugin entry is not the pin: the lines read the same, the JSON does not.
  const topped = (text, version) => text.replace('  "name": "quality-harness",\n', `  "name": "quality-harness",\n  "version": "${version}",\n`)
  assert.equal(pinOnly(bytes(topped(BEFORE, '1')), bytes(topped(AFTER, '1'))), true, 'a pin beside an untouched top-level version')
  assert.equal(pinOnly(bytes(topped(BEFORE, '1')), bytes(topped(BEFORE, '2'))), false, 'a top-level version changed and no pin')
  assert.equal(pinOnly(bytes(topped(BEFORE, '1')), bytes(topped(AFTER, '2'))), false, 'a pin and a top-level version changed')
  const linked = (text, url) => text.replace('      "category": "development"', `      "category": "development",\n      "homepage": {\n        "url": "${url}"\n      }`)
  assert.equal(pinOnly(bytes(linked(BEFORE, 'a')), bytes(linked(AFTER, 'b'))), false, "a url that is not the source's")
  const flat = text => text.replace(/      "source": \{[^}]*\},\n/, '      "source": ".",\n')
  assert.equal(pinOnly(bytes(flat(BEFORE)), bytes(flat(AFTER))), false, 'a catalogue whose plugin has no archive source is not read as pinned')
  // A key written twice parses as its last value, so only the lines can see the first one change.
  const doubled = value => AFTER.replace('      "category": "development"', `      "category": "${value}",\n      "category": "development"`)
  assert.equal(pinOnly(bytes(doubled('a')), bytes(doubled('b'))), false, 'a shadowed duplicate of another key changed')
})

// Raw tree objects as git stores them: `<mode> <name>\0<id bytes>` per entry.
const [A, A2, B, C, D, D2, E] = ['a1', 'a2', 'b1', 'c1', 'd1', 'd2', 'e1'].map(pair => pair.repeat(20))
const tree = entries => Buffer.concat(entries.flatMap(([mode, name, id]) => [bytes(`${mode} ${name}`), Buffer.from([0]), Buffer.from(id, 'hex')]))
const ROOT = (dir = A, more = []) => tree([['40000', '.claude-plugin', dir], ['100644', 'README.md', B], ['40000', 'plugin', C], ...more])
const DIR = (file = D, mode = '100644', more = []) => tree([[mode, 'marketplace.json', file], ['100644', 'plugin.json', E], ...more])

// Everything a pin landing is, as the command reads it.
const pin = (over = {}) => ({
  event: 'push', ref: `refs/heads/land/${SHA}`, sha: SHA, head: SHA, parents: [MAIN], main: MAIN,
  root: [ROOT(), ROOT(A2)], dir: [DIR(), DIR(D2)], before: bytes(BEFORE), after: bytes(AFTER), ...over,
})

test('a pin landing is one commit on main that changes one regular file', () => {
  const answer = landingClass(pin())
  assert.equal(answer.skip, true, answer.reason)
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
    // The top of the tree: only the catalogue's directory may differ, a tree on both sides.
    ['the trees unread', { root: null }],
    ['one tree unread', { root: [ROOT(), null] }],
    ['the same tree on both sides', { root: [ROOT(), ROOT()] }],
    ['a second entry changed at the top', { root: [ROOT(), tree([['40000', '.claude-plugin', A2], ['100644', 'README.md', C], ['40000', 'plugin', C]])] }],
    ['an empty tree added at the top', { root: [ROOT(), ROOT(A2, [['40000', 'zz-empty', E]])] }],
    ['an entry removed at the top', { root: [ROOT(A, [['100644', 'zz', E]]), ROOT(A2)] }],
    ['another directory changed', { root: [ROOT(), tree([['40000', '.claude-plugin', A], ['100644', 'README.md', B], ['40000', 'plugin', A2]])] }],
    ['the directory become a file', { root: [ROOT(), tree([['100644', '.claude-plugin', A2], ['100644', 'README.md', B], ['40000', 'plugin', C]])] }],
    ['a tree cut short', { root: [ROOT(), ROOT(A2).subarray(0, ROOT(A2).length - 1)] }],
    ['a tree as text', { root: [ROOT().toString('latin1'), ROOT(A2).toString('latin1')] }],
    // The catalogue's directory: only the catalogue file may differ, a regular file as stored on both sides.
    ['the directory unread', { dir: null }],
    ['the same directory on both sides', { dir: [DIR(), DIR()] }],
    ['another file changed in the directory', { dir: [DIR(), tree([['100644', 'marketplace.json', D], ['100644', 'plugin.json', D2]])] }],
    ['a second file changed in the directory', { dir: [DIR(), tree([['100644', 'marketplace.json', D2], ['100644', 'plugin.json', D]])] }],
    ['a file added to the directory', { dir: [DIR(), DIR(D2, '100644', [['100644', 'zz', E]])] }],
    ['an empty tree added to the directory', { dir: [DIR(), DIR(D2, '100644', [['40000', 'zz', E]])] }],
    ['the file made executable', { dir: [DIR(), DIR(D2, '100755')] }],
    ['a mode git would read as regular, stored otherwise', { dir: [DIR(), DIR(D2, '100664')] }],
    ['that mode on both sides', { dir: [DIR(D, '100664'), DIR(D2, '100664')] }],
    ['the mode alone changed', { dir: [DIR(), DIR(D, '100755')] }],
    ['a symlink', { dir: [DIR(D, '120000'), DIR(D2, '120000')] }],
    ['the file entered twice, both changed', { dir: [tree([['100644', 'marketplace.json', D], ['100644', 'marketplace.json', D]]), tree([['100644', 'marketplace.json', D2], ['100644', 'marketplace.json', D2]])] }],
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
  // A repository of the longer object format: ids of thirty-two bytes, and nothing else.
  const LONG = 'a'.repeat(64)
  const long = id => id.slice(0, 2).repeat(32)
  const wide = over => pin({ sha: LONG, head: LONG, ref: `refs/heads/land/${LONG}`, parents: ['b'.repeat(64)], main: 'b'.repeat(64), ...over })
  const [rootL, dirL] = [[A, A2].map(id => tree([['40000', '.claude-plugin', long(id)]])), [D, D2].map(id => tree([['100644', 'marketplace.json', long(id)]]))]
  assert.equal(landingClass(wide({ root: rootL, dir: dirL })).skip, true, 'a pin in the longer object format')
  assert.equal(landingClass(wide()).skip, false, 'trees of the shorter format under a long sha')
})

test('a tree is read as it is stored, whole or not at all', () => {
  assert.deepEqual(treeEntries(DIR(), 20), [
    { mode: '100644', name: bytes('marketplace.json'), id: D }, { mode: '100644', name: bytes('plugin.json'), id: E },
  ])
  assert.deepEqual(treeEntries(Buffer.alloc(0), 20), [], 'an empty tree has no entry')
  assert.deepEqual(treeEntries(tree([['100644', 'a name with spaces', D]]), 20)[0].name, bytes('a name with spaces'))
  for (const [what, raw, width] of [
    ['an id cut short', DIR().subarray(0, DIR().length - 1), 20], ['a byte after the last entry', Buffer.concat([DIR(), Buffer.from([0x31])]), 20],
    ['no name', tree([['100644', '', D]]), 20], ['a mode that is not octal', tree([['10064x', 'f', D]]), 20],
    ['no mode', Buffer.concat([bytes('f'), Buffer.from([0]), Buffer.from(D, 'hex')]), 20],
    ['ids of another width', DIR(), 32], ['a width nobody uses', DIR(), 21], ['text', DIR().toString('latin1'), 20], ['nothing', null, 20],
  ]) assert.equal(treeEntries(raw, width), null, what)
  assert.deepEqual(onlyChange(DIR(), DIR(D2), 'marketplace.json', '100644', 20), { was: D, is: D2 })
  assert.equal(onlyChange(DIR(), DIR(D2), 'plugin.json', '100644', 20), null, 'the entry that differs is another one')
  assert.equal(onlyChange(DIR(), DIR(D2), 'marketplace.json', '100755', 20), null, 'the mode asked for is not the one stored')
})

test('a command that failed leaves its fact absent', () => {
  const answers = {
    'rev-parse': bytes(`${SHA}\n`), 'rev-list': bytes(`${SHA} ${MAIN}\n`), 'ls-remote': bytes(`${MAIN}\trefs/heads/main\n`),
    [`cat-file tree ${MAIN}`]: ROOT(), [`cat-file tree ${SHA}`]: ROOT(A2), [`cat-file tree ${A}`]: DIR(), [`cat-file tree ${A2}`]: DIR(D2),
    [`cat-file blob ${D}`]: bytes(BEFORE), [`cat-file blob ${D2}`]: bytes(AFTER),
  }
  const named = args => args[0] === 'cat-file' ? args.join(' ') : args[0]
  const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: `refs/heads/land/${SHA}`, GITHUB_SHA: SHA }
  // `broken` names one command and what its child came back as; every other command answers as git would.
  const asked = (broken, child) => landingClass(readFacts(env, '.', (cmd, args, options) => {
    assert.equal(cmd, 'git')
    assert.equal(options.windowsHide, true)
    assert.ok(options.timeout > 0, 'every child is bounded')
    assert.ok(named(args) in answers, `an unexpected command: git ${args.join(' ')}`)
    return named(args) === broken ? child(answers[named(args)]) : { status: 0, stdout: answers[named(args)] }
  }))
  assert.equal(asked(null).skip, true, 'every command answered: a pin')
  for (const command of Object.keys(answers)) {
    assert.equal(asked(command, stdout => ({ status: 1, stdout })).skip, false, `${command} exited 1 with its whole answer`)
    assert.equal(asked(command, stdout => ({ status: null, stdout, error: new Error('ETIMEDOUT') })).skip, false, `${command} timed out`)
    assert.equal(asked(command, () => ({ status: 0, stdout: 'text' })).skip, false, `${command} answered text, not bytes`)
    assert.equal(asked(command, stdout => ({ status: 0, stdout: stdout.subarray(0, stdout.length - 1) })).skip, false, `${command} cut one byte short`)
  }
  assert.equal(asked('ls-remote', () => ({ status: 0, stdout: bytes(`${MAIN}\trefs/heads/main\n${SHA}\trefs/heads/main2\n`) })).skip, false, 'two refs answered')
  assert.equal(asked('rev-list', () => ({ status: 0, stdout: bytes(`${MAIN} ${MAIN}\n`) })).skip, false, "another commit's parents")
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

  // The same pin with an empty tree beside it: `-r` alone lists nothing for the tree, so only `-t` shows the second change.
  const piped = (input, ...args) => {
    const run = spawnSync('git', args, { cwd: made, input, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    assert.equal(run.status, 0, `git ${args.join(' ')}: ${run.stderr}`)
    return run.stdout.trim()
  }
  const emptyTree = piped('', 'mktree')
  const widened = piped(`${git(made, 'ls-tree', 'HEAD')}\n040000 tree ${emptyTree}\tzz-empty\n`, 'mktree')
  const crafted = piped('', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit-tree', widened, '-p', base, '-m', 'pin and an empty tree')
  git(made, 'checkout', '-q', '--detach', crafted)
  is(asked(), 'skip=0\n', 'a pin with an empty tree added beside it')
  git(made, 'checkout', '-q', 'main')

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
  write(PIN, catalogue({ version: '3.8.82', digest: '3'.repeat(64) }))
  git(made, 'add', PIN)
  git(made, 'update-index', '--chmod=+x', PIN)
  git(made, 'commit', '-qm', 'pin and mode')
  is(asked(), 'skip=0\n', 'a pin that also makes the file executable')

  git(made, 'reset', '-q', '--hard', 'HEAD^')
  write(PIN, catalogue({ version: '3.8.82', digest: '3'.repeat(64) }))
  git(made, 'commit', '-qam', 'the next pin')
  is(asked(), 'skip=1\n', 'the next pin, on the main that took the last one')
  const empty = path.join(dir, 'empty.git')
  git(dir, 'init', '-q', '--bare', '-b', 'main', empty)
  git(made, 'remote', 'set-url', 'origin', empty)
  is(asked(), 'skip=0\n', 'a remote without main')
})
