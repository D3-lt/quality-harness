// Runs core/internal/catalogcheck: every hooks Go entry of the mutation catalogue, applied in memory, must still type-check as
// this host builds the hooks package (production and test builds), and must match its file exactly once, so no catalogue Go mutant
// is "killed" by a build error. The entries are read by mutate.mjs's own loader, so the catalogue grammar lives in one place, and
// handed to the Go test as a list in a temporary UTF-8 file. No catalogue entry may name this file as the test that kills a
// mutant, by any path the campaign would run that reaches it: testArgs joins each with the platform's path.join, and the file
// system then decides what that names (a case it folds, a link). Skipped, with the reason, where `go` is not on PATH.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { linkSync, mkdirSync, mkdtempSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadCatalogue } from '../scripts/mutate.mjs'
import { remove } from './helpers/remove.mjs'
import { required } from './helpers/require.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const coreDir = path.join(repoRoot, 'core')
const self = 'tests/go-catalogue-typecheck.test.mjs'
const goVersion = spawnSync('go', ['version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
const noGo = required('go', goVersion.error || goVersion.status !== 0
  ? `go is not on PATH (${goVersion.error?.code ?? `exit ${goVersion.status}`}), so the Go core cannot be built here` : false)

// The file a path reaches, or null when nothing is there. Any other failure is thrown: "could not tell" is never "another file".
function identityOf(file) {
  try {
    const stat = statSync(file, { bigint: true })
    return { dev: stat.dev, ino: stat.ino, real: realpathSync.native(file) }
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

// Whether a catalogue test path reaches `target` once the campaign joins it to the root (scripts/mutate.mjs testArgs): the same
// joined name, or the same file by device and inode (a hard or symbolic link, a case the file system folds), or by real path where
// the file system gives no inode. A path that names nothing is no alias; on POSIX a backslash is a character of a name.
export function namesFile(root, test, target) {
  const joined = path.join(root, test)
  const wanted = path.join(root, target)
  if (joined === wanted) return true
  const a = identityOf(joined)
  const b = identityOf(wanted)
  return a !== null && b !== null && ((a.ino !== 0n && a.dev === b.dev && a.ino === b.ino) || a.real === b.real)
}

test('a test path names a file when it reaches it: by name, by a link, or by a case the file system folds', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-wrapper-alias-'))
  try {
    mkdirSync(path.join(dir, 'tests'))
    writeFileSync(path.join(dir, 'tests', 'w.mjs'), 'w')
    writeFileSync(path.join(dir, 'tests', 'other.mjs'), 'other')
    const target = 'tests/w.mjs'
    assert.equal(namesFile(dir, 'tests/w.mjs', target), true)
    assert.equal(namesFile(dir, './tests/../tests//w.mjs', target), true)
    assert.equal(namesFile(dir, 'tests/other.mjs', target), false)
    assert.equal(namesFile(dir, 'tests/missing.mjs', target), false, 'a path that names nothing is no alias')
    linkSync(path.join(dir, 'tests', 'w.mjs'), path.join(dir, 'tests', 'hard.mjs'))
    assert.equal(namesFile(dir, 'tests/hard.mjs', target), true, 'a hard link reaches the same file')
    const folds = identityOf(path.join(dir, 'TESTS', 'W.MJS')) !== null
    t.diagnostic(`this file system ${folds ? 'folds' : 'keeps'} case`)
    assert.equal(namesFile(dir, 'TESTS/W.MJS', target), folds, 'another case reaches the file exactly where the file system folds case')
    let symlinked = true
    try {
      symlinkSync(path.join(dir, 'tests', 'w.mjs'), path.join(dir, 'tests', 'soft.mjs'), 'file')
    } catch (error) {
      if (error?.code !== 'EPERM') throw error
      symlinked = false
      t.diagnostic('this account cannot create a symbolic link (EPERM); the hard link stands for links')
    }
    if (symlinked) assert.equal(namesFile(dir, 'tests/soft.mjs', target), true, 'a symbolic link reaches the same file')
    // A backslash separates on win32 and is a character on POSIX, where "tests\w.mjs" names no file here.
    assert.equal(namesFile(dir, 'tests\\w.mjs', target), process.platform === 'win32')
  } finally {
    remove(dir)
  }
})

test('every hooks catalogue mutant type-checks as this host builds the package', { skip: noGo }, (t) => {
  const loaded = loadCatalogue(repoRoot)
  assert.equal(loaded.error, undefined, loaded.error)
  const entries = []
  const reaches = new Map() // each distinct test path is looked up once
  for (const file of loaded.files) {
    const where = path.relative(repoRoot, file.path).split(path.sep).join('/')
    file.catalogue.mutations.forEach((entry, index) => {
      for (const test of entry.tests ?? []) {
        if (!reaches.has(test)) reaches.set(test, namesFile(repoRoot, test, self))
        assert.equal(reaches.get(test), false, `${where}#${index + 1} ${JSON.stringify(entry.label)} names ${self} as its test (${test}); a type-check is no behaviour test's kill`)
      }
      if (entry.file.startsWith('core/hooks/') && entry.file.endsWith('.go')) {
        entries.push({ where: `${where}#${index + 1}`, label: entry.label, file: entry.file, from: entry.from, to: entry.to })
      }
    })
  }
  assert.ok(entries.length > 0, 'the catalogue holds no hooks Go entry, so there is nothing to check')
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qh-catalogue-typecheck-'))
  try {
    const list = path.join(dir, 'entries.json')
    writeFileSync(list, JSON.stringify(entries), 'utf8')
    const names = ['TestCatalogueCheckControl', 'TestHooksCatalogueMutantsTypeCheck']
    const run = spawnSync('go', ['test', '-count=1', '-v', '-timeout', '300s', '-run', `^(${names.join('|')})$`, './internal/catalogcheck/'],
      { cwd: coreDir, encoding: 'utf8', timeout: 600_000, windowsHide: true, env: { ...process.env, QH_CATALOGUE_ENTRIES: list } })
    const said = `${run.stdout}\n${run.stderr}`
    const summary = said.split('\n').find(line => line.includes('hooks catalogue entries on '))
    if (summary) t.diagnostic(`${entries.length} entries handed over; ${summary.trim()}`)
    assert.equal(run.status, 0, said.split('\n').slice(-60).join('\n'))
    // A filter that selects nothing exits 0 too: each test is seen passing by name, and nothing skipped.
    for (const name of names) assert.match(said, new RegExp(`^--- PASS: ${name} `, 'm'), `${name} ran`)
    assert.doesNotMatch(said, /--- SKIP/)
  } finally {
    remove(dir)
  }
})
