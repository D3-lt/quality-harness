// replace-file.mjs — a rename that replaces a file another process may be reading.
import { renameSync } from 'node:fs'

// What a rename can answer on Windows when another process holds the target open.
const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])

const block = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * replaceFile renames `from` over `to`. On Windows a rename onto a file in use may
 * fail with EPERM, EACCES or EBUSY under the sharing rules of whoever holds it, where
 * POSIX replaces it at once. It failed a release campaign while a child polled the
 * owner.json its parent was replacing (BACKLOG §332). The cause is likely, not proven,
 * since libuv opens files to allow deletion. So those codes are retried, a short and
 * growing wait apart: about 0.7 s in all over 8 tries. A permanent permission failure
 * pays that cost once. Any other error, or the last one, is thrown as before. `rename`
 * and `sleep` are the seams a test replaces.
 */
export function replaceFile(from, to, { rename = renameSync, sleep = block, tries = 8, waitMs = 25 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return rename(from, to)
    } catch (error) {
      if (attempt >= tries || !BUSY.has(error?.code)) throw error
      sleep(waitMs * attempt)
    }
  }
}
