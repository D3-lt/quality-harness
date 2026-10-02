// Every tracked path stays short enough to clone on Windows (BACKLOG §349, the owner, 2026-10-02).
//
// Windows' MAX_PATH is 260 characters, drive and terminator included, and Git for Windows
// refuses a checkout past it unless `core.longpaths` is set. A first Windows outside run failed
// `git clone` with "Filename too long" under a %TEMP% scratch directory about 115 characters deep:
// archived task files reached 157 characters. MAX_PATH_LENGTH leaves a clone directory about 130
// characters deep, which covers a %TEMP% scratch path with room to spare.
//
// ⚠ AN ARCHIVED RECORD CANNOT BE RENAMED: adr-retire-check freezes each decision unit's SHA-256,
// file names included, and has no re-freeze. So the archived paths already over the bound are a
// closed list (the owner, 2026-10-02): none may be added, and an entry that leaves the tree must
// leave the list. Until they do, cloning on Windows needs `git -c core.longpaths=true clone`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_PATH_LENGTH = 128
const FROZEN_OVER_LIMIT = new Set([
  'docs/adr-archive/ADR-058-advisories-name-only-what-they-observed/tasks/T7-a-nested-publish-or-repository-override-still-advises.md',
  'docs/adr-archive/ADR-059-a-read-only-command-names-no-changed-path/tasks/T10-a-continued-redirect-target-keeps-its-path-and-the-quote-strip-stays-released.md',
  'docs/adr-archive/ADR-059-a-read-only-command-names-no-changed-path/tasks/T2-a-family-that-can-write-names-no-changed-path-until-it-uses-that-channel.md',
  'docs/adr-archive/ADR-059-a-read-only-command-names-no-changed-path/tasks/T3-an-assigned-path-used-only-by-reads-is-not-a-changed-path.md',
  'docs/adr-archive/ADR-059-a-read-only-command-names-no-changed-path/tasks/T6-a-failed-command-that-also-writes-is-still-a-write.md',
])

/** Every path longer than `limit`, longest first, with its length. */
function tooLong(paths, limit = MAX_PATH_LENGTH) {
  return paths.filter(file => file.length > limit).sort((a, b) => b.length - a.length).map(file => `${file.length} ${file}`)
}

// Tracked, plus what is about to be added (CLAUDE.md §8): never what happens to be on this disk.
function listed() {
  const run = spawnSync('git', ['-c', 'core.quotePath=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repoRoot, encoding: 'utf8', timeout: 60_000, windowsHide: true })
  assert.equal(run.status, 0, run.stderr)
  return [...new Set(run.stdout.split('\0').filter(Boolean))]
}

test('every path outside the frozen archive list clones on Windows without core.longpaths', () => {
  const paths = listed()
  assert.ok(paths.length > 100, `git listed ${paths.length} paths, which is not this repository`)
  assert.deepEqual(tooLong(paths.filter(file => !FROZEN_OVER_LIMIT.has(file))), [],
    `shorten these below ${MAX_PATH_LENGTH + 1} characters (a task keeps its T<n>- prefix and README link):`)
  // The list only shrinks: an archived path that left the tree must leave the list too.
  assert.deepEqual([...FROZEN_OVER_LIMIT].filter(file => !paths.includes(file)), [], 'remove these from FROZEN_OVER_LIMIT')
})

test('a path one character over the limit is named, and one at it is not', () => {
  const at = 'd/'.padEnd(MAX_PATH_LENGTH, 'x')
  const over = `${at}y`
  assert.deepEqual(tooLong([at, over, 'short']), [`${MAX_PATH_LENGTH + 1} ${over}`])
  assert.deepEqual(tooLong([at]), [])
})
