// Is this module the one `node` was asked to run?
//
// Every CLI here used to decide with
// `import.meta.url === pathToFileURL(process.argv[1]).href`, and that compares a
// RESOLVED url to an UNRESOLVED path: `import.meta.url` is where the loader found
// the file, `argv[1]` is what the caller typed. Through a symlink — `/tmp` on
// macOS is `/private/tmp` — they never match, so `node /tmp/x/work-next.mjs`
// printed nothing and exited 0. Reported 2026-09-23 by a peer session following
// a probe recipe from `/tmp`, reproduced here on 32 scripts (BACKLOG §264);
// workflow-parse.mjs had already fixed its own copy on 2026-09-07, and KEEPS its
// own: the post-edit hook and two tests copy that file alone into a directory
// with nothing beside it, so it cannot import anything. A silent exit 0 is the
// most flattering failure a checker can have, which is why one guard lives here
// and every other script imports it.
import { realpathSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * True when `moduleUrl` (a module's `import.meta.url`) names the file `argv[1]`
 * points at, symlinks and all. Falls back to the url comparison when either
 * side cannot be resolved — a path that does not exist cannot be the entry.
 * `realpath` is a seam so the fallback is reachable from a test.
 */
export function isMainModule(moduleUrl, argv = process.argv, realpath = realpathSync) {
  const entry = argv[1]
  if (!entry) return false
  try {
    // As URLs, not raw paths: on Windows `pathToFileURL` lower-cases a UNC host
    // (`\\\\SERVER\\share` → `file://server/share`) and `realpathSync` does not, so
    // two spellings of one file compared unequal and the CLI went silent again
    // (Codex review of 8ac14af, P2).
    return pathToFileURL(realpath(fileURLToPath(moduleUrl))).href === pathToFileURL(realpath(entry)).href
  } catch {
    return moduleUrl === pathToFileURL(entry).href
  }
}
