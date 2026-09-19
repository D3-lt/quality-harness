// An identity is taken only of a regular file, and only of one small enough to read
// (docs/audits/2026-09-18-adr-060.md, D1 and D2).
//
// `contentId` hashes a path so a gate's verdict can be tied to the bytes it judged.
// It did `readFileSync` on whatever it was handed, and rule A hands it EVERY changed
// path at every boundary — so:
//
//   - a FIFO in the working tree blocks the read for ever. `git status` lists an
//     untracked FIFO, the Stop hook hashes it, the host kills the hook at its
//     deadline, and a killed hook's whole output is discarded — the git half too.
//     A reader built to end a silence produces one. Measured: exit 124.
//   - a file over 2 GiB throws ERR_FS_FILE_TOO_LARGE, which is neither ENOENT nor
//     ENOTDIR, so the answer is `null` — "unknown" — and an unknown identity is never
//     "already answered". The path is re-gated at every boundary for ever: the loop
//     the ABSENT split was introduced to prevent, reached by size instead of absence.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ABSENT, contentId, CONTENT_ID_MAX_BYTES } from '../plugin/scripts/event-log.mjs'

test('contentId answers for a regular file, and says unknown for anything it must not read', () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-content-id-')))
  try {
    const file = join(top, 'a.md')
    writeFileSync(file, 'x\n')
    // The controls: a real file has an identity, a changed one a different identity.
    const before = contentId(file)
    assert.match(before, /^[0-9a-f]{64}$/)
    writeFileSync(file, 'y\n')
    assert.notEqual(contentId(file), before)
    assert.equal(contentId(join(top, 'gone.md')), ABSENT, 'a missing file is ABSENT, which is an answer')

    mkdirSync(join(top, 'dir'))
    assert.equal(contentId(join(top, 'dir')), null, 'a directory — a submodule, say — has no content identity')
    assert.ok(Number.isSafeInteger(CONTENT_ID_MAX_BYTES) && CONTENT_ID_MAX_BYTES > 0)
  } finally { rmSync(top, { recursive: true, force: true }) }
})

// mkfifo is POSIX; Windows has no FIFO a working tree can hold.
test('a FIFO in the working tree is not read, so the hook cannot hang on it', { skip: process.platform === 'win32' ? 'no mkfifo on Windows; a named pipe cannot live in a working tree there' : false }, () => {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'qh-content-fifo-')))
  try {
    const fifo = join(top, 'pipe')
    assert.equal(spawnSync('mkfifo', [fifo], { timeout: 10_000 }).status, 0)
    symlinkSync(fifo, join(top, 'link-to-pipe'))
    // In a CHILD with a deadline: if this regresses it hangs, and a hang inside the
    // test process would take the whole suite with it instead of failing one test.
    for (const target of [fifo, join(top, 'link-to-pipe')]) {
      const run = spawnSync(process.execPath, ['--input-type=module', '-e',
        `import { contentId } from ${JSON.stringify(new URL('../plugin/scripts/event-log.mjs', import.meta.url).href)}; process.stdout.write(String(contentId(${JSON.stringify(target)})))`],
      { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL' })
      assert.equal(run.signal, null, `contentId must RETURN for ${target}, not block until it is killed`)
      assert.equal(run.stdout, 'null', 'and the answer is unknown, never a hash of nothing')
    }
  } finally { rmSync(top, { recursive: true, force: true }) }
})
