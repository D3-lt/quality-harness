// The advice a passing check adds when a test file the last pass of the same command ran with is gone and did not move: a test
// that passed is removed with its reason, never unremarked (the owner, 2026-10-24). The check ledger keeps no tree an old pass
// can be read back from (`observe` writes its objects to a scratch directory it removes), so each pass leaves its test files
// here, by path and content, in `passed-tests.json`. It reads git and the working tree, writes only that file, and never
// changes the check's exit (CLAUDE.md §3). A count of tests, which no runner's prose reliably gives, is not attempted.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stateDir } from './event-log.mjs'

const STATE = 'passed-tests.json'
const SHOWN = 10
export const GONE = 'test file(s) the last pass of this check ran with are gone, and none moved'
export const UNREAD = 'whether a test file was removed since the last pass is not known'

// A test file by the name its runner collects by default, as each runner documents it: jest, vitest and node --test
// (`*.test.*`, `*.spec.*`), go test (`*_test.go`, outside `testdata` and any name starting with `.` or `_`, which
// `go help packages` says the go tool ignores), pytest (`test_*.py`, `*_test.py`), PHPUnit (`*Test.php`), RSpec (`*_spec.rb`).
// Only this repository's own `*.test.mjs` and `*_test.go` were run. A name not here is not judged at all: a file a runner
// collects by its configuration is missed, and that costs a weaker nudge, never a false one (CLAUDE.md §16).
const TEST_FILE = [
  /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  /(?:^|\/)test_[^/]*\.py$/,
  /_test\.py$/,
  /[^/]Test\.php$/,
  /_spec\.rb$/,
]
const goTest = file => file.endsWith('_test.go') && file.split('/').every(part => part !== 'testdata' && !/^[._]/.test(part))
export const isTestFile = file => goTest(file) || TEST_FILE.some(pattern => pattern.test(file))

const gitIn = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })

// The test files in the working tree as the check's tree holds them (tracked or untracked, not ignored), each by a hash of its
// bytes, or null when git could not list them. An index entry whose file is gone from the disk is not in the tree; a listed file
// that is there and cannot be read is `unread`, which is not gone.
function testFiles(root) {
  const listed = gitIn(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  if (listed.error || listed.status !== 0) return null
  const files = {}
  const unread = new Set()
  for (const file of new Set(listed.stdout.split('\0').filter(Boolean))) {
    if (!isTestFile(file)) continue
    try { files[file] = createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') } catch (failure) {
      if (failure?.code !== 'ENOENT' && failure?.code !== 'ENOTDIR') unread.add(file)
    }
  }
  return { files, unread }
}

// Whether a path the last pass had is gone from the disk: true when nothing is there, false when something is (a file now
// ignored, so git no longer lists it, is still there and still runnable), null when the disk cannot say.
function goneFromDisk(root, file) {
  try { lstatSync(path.join(root, file)); return false } catch (failure) {
    return failure?.code === 'ENOENT' || failure?.code === 'ENOTDIR' ? true : null
  }
}

// Whether the pass at `before` is history of `head`: the same commit, or an ancestor of it. A switch to a branch without that
// pass is not a removal, so it says nothing; a commit git cannot place is null.
function onHistory(root, before, head) {
  if (before === head) return true
  if (typeof before !== 'string' || typeof head !== 'string') return false
  const asked = gitIn(root, ['merge-base', '--is-ancestor', before, head])
  return asked.error ? null : asked.status === 0 ? true : asked.status === 1 ? false : null
}

// The entry as this module writes it, or not one at all: a HEAD that is a full sha or null, and a map of paths to sha-256s.
// Anything else is a record this cannot read, never a record of no test files (ADR-005).
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const written = entry => plain(entry) && (entry.head === null || (typeof entry.head === 'string' && /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(entry.head)))
  && plain(entry.files) && Object.entries(entry.files).every(([name, hash]) => name !== '' && !name.includes('\0') && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))

const shown = files => files.slice(0, SHOWN).map(file => `\`${file}\``).join(', ') + (files.length > SHOWN ? `, +${files.length - SHOWN} more` : '')

/**
 * After a pass of `command` (`record` is its row, `fast` which ledger it is in): the sentence to say, or null, and this pass's
 * test files kept in place of the last one's. Compared only with the last pass of the same command in the same ledger, and only
 * when that pass's HEAD is history of this one. A file is gone when git no longer lists it AND nothing is at its path; it moved,
 * and is not gone, when its exact bytes are at a path the last pass did not have. A move with edits reads as gone, and the
 * sentence names the new test files so that reads as what it is. A path the last pass had that is still on the disk but not
 * listed, or not readable, keeps its last hash, so it is judged again when it does go.
 */
export function removedTestsLine({ root, fast, command, record }) {
  const file = path.join(stateDir(root), STATE)
  const key = `${fast ? 'fast' : 'full'} ${command}`
  let state = {}
  let unread = null
  try { state = JSON.parse(readFileSync(file, 'utf8')) } catch (failure) { if (failure?.code !== 'ENOENT') unread = failure.code ?? 'it does not parse' }
  if (!plain(state)) { state = {}; unread ??= 'it is not an object' }
  const last = state[key]
  if (!unread && last !== undefined && !written(last)) unread = 'its entry for this check is not one qh-check writes'
  const now = testFiles(root)
  if (now === null) return `${UNREAD}: git could not list the working tree's files, so this pass's test files are not kept either.`
  const head = record.after?.head ?? null
  const kept = { ...now.files }
  let line = null
  if (unread) {
    state = {}
    line = `${UNREAD}: ${STATE} could not be read (${unread}); this pass's test files are kept in its place.`
  } else if (last !== undefined) {
    const comparable = onHistory(root, last.head, head)
    if (comparable === null) {
      line = `${UNREAD}: git could not say whether the last pass's commit is history of this one.`
    } else if (comparable) {
      const added = Object.keys(now.files).filter(name => !(name in last.files)).sort()
      const movedTo = new Set(added.map(name => now.files[name]))
      const gone = []
      let unsure = 0
      for (const name of Object.keys(last.files).filter(name => !(name in now.files)).sort()) {
        const absent = now.unread.has(name) ? null : goneFromDisk(root, name)
        if (absent === true && !movedTo.has(last.files[name])) gone.push(name)
        if (absent !== true) kept[name] = last.files[name]
        if (absent === null) unsure += 1
      }
      if (gone.length) {
        line = `${gone.length} ${GONE}: ${shown(gone)}. A test that passed is removed only with its reason: say why in the commit `
          + 'message, or restore it.' + (added.length ? ` New test files since that pass: ${shown(added)}; one that is a moved file with edits loses nothing.` : '')
      }
      if (unsure) line = `${line ? `${line} ` : ''}${UNREAD} for ${unsure} test file(s) the disk could not be asked about.`
    }
  }
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify({ ...state, [key]: { id: record.id, at: record.after?.at, head, files: kept } })}\n`, 'utf8')
    renameSync(temporary, file)
  } catch (failure) {
    line = `${line ? `${line} ` : ''}This pass's test files could not be kept (${failure.code ?? failure.message}).`
  }
  return line
}
