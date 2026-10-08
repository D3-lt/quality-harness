// ADR-091 T1: scripts/mutate.mjs reads the union of tests/mutations/<source>.json and the single
// tests/mutations.json, refuses at exit 2 what would make an entry ambiguous or misfiled, and its
// write modes rewrite only the per-source file that holds a changed entry. Every repository here is
// a scratch one this file creates (CLAUDE.md §9); a clean twin sits beside each refusal.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const runner = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'scripts', 'mutate.mjs')
const temps = []
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) })
const serialize = mutations => `${JSON.stringify({ mutations }, null, 2)}\n`
const slashes = text => text.replaceAll('\\', '/')
const entry = (label, file) => ({ label, file, tests: ['tests/a.test.mjs'], from: `export const ${label.replace(/\W/g, '_')} = 1`, to: `export const ${label.replace(/\W/g, '_')} = 2` })

function git(dir, ...args) {
  return spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], { cwd: dir, encoding: 'utf8', timeout: 30_000, windowsHide: true })
}
// A scratch repository holding `files` (path -> text), committed; `git: false` leaves it no repository.
function scratch(files, { git: initGit = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qh-catalogue-dir-'))
  temps.push(dir)
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  if (initGit) {
    git(dir, 'init', '-q')
    git(dir, 'add', '.')
    git(dir, 'commit', '-qm', 'base', '--no-verify')
  }
  return dir
}
const mutate = (dir, ...args) => spawnSync(process.execPath, [runner, '--root', dir, ...args], {
  cwd: dir, encoding: 'utf8', timeout: 180_000, windowsHide: true, env: { ...process.env, QUALITY_HARNESS_MUTATE_LOCK: '' },
})
const said = run => `${run.stdout}\n${run.stderr}`
const labelsListed = run => run.stdout.split('\n').filter(line => line !== '' && !line.startsWith(' '))

test('a label repeated across two catalogue files is refused before anything runs', () => {
  const source = 'export const x = 1\n'
  const dir = scratch({
    'a.mjs': source,
    'b.mjs': source,
    'tests/mutations/a.mjs.json': serialize([entry('x', 'a.mjs')]),
    'tests/mutations/b.mjs.json': serialize([entry('x', 'b.mjs')]),
  })
  for (const args of [['--list'], ['--stale'], []]) {
    const run = mutate(dir, ...args)
    assert.equal(run.status, 2, `${args.join(' ')}: ${said(run)}`)
    assert.ok(slashes(run.stderr).includes('tests/mutations/a.mjs.json'), said(run))
    assert.ok(slashes(run.stderr).includes('tests/mutations/b.mjs.json'), said(run))
    assert.ok(run.stderr.includes('"x"'), said(run))
    assert.equal(run.stdout, '', said(run))
  }
  assert.equal(readFileSync(join(dir, 'a.mjs'), 'utf8'), source, 'no mutant was applied')
  assert.equal(readFileSync(join(dir, 'b.mjs'), 'utf8'), source, 'no mutant was applied')
  // A repeat that differs only by case, inside one file, is refused too.
  const folded = scratch({ 'tests/mutations/a.mjs.json': serialize([entry('Y', 'a.mjs'), entry('y', 'a.mjs')]) })
  const caseOnly = mutate(folded, '--list')
  assert.equal(caseOnly.status, 2, said(caseOnly))
  assert.ok(slashes(caseOnly.stderr).includes('tests/mutations/a.mjs.json'), said(caseOnly))
  assert.ok(caseOnly.stderr.includes('"Y"') && caseOnly.stderr.includes('"y"'), said(caseOnly))
  // The twin: distinct labels across the same two files list both, at exit 0.
  const distinct = scratch({
    'tests/mutations/a.mjs.json': serialize([entry('x', 'a.mjs')]),
    'tests/mutations/b.mjs.json': serialize([entry('w', 'b.mjs')]),
  })
  const listed = mutate(distinct, '--list')
  assert.equal(listed.status, 0, said(listed))
  assert.deepEqual(labelsListed(listed), ['x', 'w'])
})

test('an entry filed under another source is refused', () => {
  const misfiled = scratch({ 'tests/mutations/a.mjs.json': serialize([entry('ok', 'a.mjs'), entry('stray', 'b.mjs')]) })
  const run = mutate(misfiled, '--list')
  assert.equal(run.status, 2, said(run))
  assert.ok(slashes(run.stderr).includes('tests/mutations/a.mjs.json'), said(run))
  assert.ok(run.stderr.includes('"stray"'), said(run))
  assert.equal(run.stdout, '', said(run))
  // An empty per-source file is refused, naming it.
  const empty = scratch({ 'tests/mutations/a.mjs.json': serialize([entry('ok', 'a.mjs')]), 'tests/mutations/b.mjs.json': serialize([]) })
  const none = mutate(empty, '--list')
  assert.equal(none.status, 2, said(none))
  assert.ok(slashes(none.stderr).includes('tests/mutations/b.mjs.json'), said(none))
  // A per-source file that is not a catalogue is refused with the shape's words, naming it.
  const shapeless = scratch({ 'tests/mutations/a.mjs.json': '{"mutations":"x"}\n' })
  const malformed = mutate(shapeless, '--list')
  assert.equal(malformed.status, 2, said(malformed))
  assert.ok(slashes(malformed.stderr).includes('tests/mutations/a.mjs.json is not a mutation catalogue'), said(malformed))
  // A root that is not a git repository but has tests/mutations/ cannot be listed: could-not-read,
  // never an empty catalogue.
  const unlisted = scratch({ 'tests/mutations/a.mjs.json': serialize([entry('ok', 'a.mjs')]) }, { git: false })
  const blind = mutate(unlisted, '--list')
  assert.equal(blind.status, 2, said(blind))
  assert.ok(slashes(blind.stderr).includes('could not list'), said(blind))
  // The twin: the same entry filed under its own source lists, at exit 0.
  const filed = scratch({ 'tests/mutations/a.mjs.json': serialize([entry('ok', 'a.mjs')]), 'tests/mutations/b.mjs.json': serialize([entry('stray', 'b.mjs')]) })
  const listed = mutate(filed, '--list')
  assert.equal(listed.status, 0, said(listed))
  assert.deepEqual(labelsListed(listed), ['ok', 'stray'])
})

test('the catalogue directory is read in path order beside the single file', () => {
  const dir = scratch({
    'tests/mutations.json': serialize([entry('legacy', 'a.mjs')]),
    'tests/mutations/b.mjs.json': serialize([entry('bee', 'b.mjs')]),
    'tests/mutations/a/z.mjs.json': serialize([entry('zed', 'a/z.mjs')]),
    'tests/mutations/a.mjs.json': serialize([entry('aye', 'a.mjs'), entry('aye-two', 'a.mjs')]),
    'tests/mutations/.hidden.mjs.json': serialize([entry('hid', '.hidden.mjs')]),
    'tests/mutations/gone.mjs.json': serialize([entry('gone', 'gone.mjs')]),
  })
  // An untracked per-source file is read; a tracked one deleted in the checkout is not.
  writeFileSync(join(dir, 'tests', 'mutations', 'c.mjs.json'), serialize([entry('sea', 'c.mjs')]))
  rmSync(join(dir, 'tests', 'mutations', 'gone.mjs.json'))
  const run = mutate(dir, '--list')
  assert.equal(run.status, 0, said(run))
  // The single file first; then by path in code-unit order, so `.` (0x2E) sorts before `/` (0x2F).
  assert.deepEqual(labelsListed(run), ['legacy', 'hid', 'aye', 'aye-two', 'zed', 'bee', 'sea'])
  // The twin: the directory alone, with no single file, is a whole catalogue.
  rmSync(join(dir, 'tests', 'mutations.json'))
  const alone = mutate(dir, '--list')
  assert.equal(alone.status, 0, said(alone))
  assert.deepEqual(labelsListed(alone), ['hid', 'aye', 'aye-two', 'zed', 'bee', 'sea'])
})

test('repoint write rewrites only the file that holds the entry', () => {
  const oldLine = "  if (word === 'a' || word === 'b') return 1"
  const newLine = "  if (word === 'a' || word === 'b' || word === 'c') return 1"
  const mechanical = { label: 'mechanical', file: 'a.mjs', tests: ['tests/a.test.mjs'], from: oldLine, to: "  if (word === 'b') return 1" }
  const other = { label: 'other', file: 'b.mjs', tests: ['tests/a.test.mjs'], from: "export const g = () => 'kept'", to: "export const g = () => 'lost'" }
  // Not as writeCatalogue writes it, so a rewrite of this file would show.
  const otherText = `${JSON.stringify({ mutations: [other] })}\n`
  const dir = scratch({
    'a.mjs': `export function f(word) {\n${oldLine}\n  return 0\n}\n`,
    'b.mjs': "export const g = () => 'kept'\n",
    'tests/a.test.mjs': "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { f } from '../a.mjs'\nimport { g } from '../b.mjs'\n"
      + "test('f and g', () => { assert.equal(f('a'), 1); assert.equal(f('b'), 1); assert.equal(f('z'), 0); assert.equal(g(), 'kept') })\n",
    'tests/mutations/a.mjs.json': serialize([mechanical]),
    'tests/mutations/b.mjs.json': otherText,
  })
  // The refactor, uncommitted: the line gains a case.
  writeFileSync(join(dir, 'a.mjs'), `export function f(word) {\n${newLine}\n  return 0\n}\n`)
  const run = mutate(dir, '--repoint', '--write', '--force')
  assert.equal(run.status, 0, said(run))
  assert.ok(slashes(run.stdout).includes('rewritten in tests/mutations/a.mjs.json'), said(run))
  assert.equal(readFileSync(join(dir, 'tests', 'mutations', 'a.mjs.json'), 'utf8'),
    serialize([{ ...mechanical, from: newLine, to: "  if (word === 'b' || word === 'c') return 1" }]))
  assert.equal(readFileSync(join(dir, 'tests', 'mutations', 'b.mjs.json'), 'utf8'), otherText, 'the file holding no changed entry was rewritten')
})
