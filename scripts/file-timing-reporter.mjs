// A node --test reporter: one JSON row per run, naming every test file with the time its top-level tests took, how many ran
// and how many failed. Stage 0 of the plan to make the check fast without letting it claim more: the gate could not say where
// its 220 s went (BACKLOG §378), and per-file times are what an ordering or a selection has to be measured from.
//
// Repository-owned, like scripts/selftest.sh, which runs it beside the spec reporter and appends its row to
// <git-dir>/quality-harness/selftest-files.jsonl. It never fails the run: it reads events and writes one line.
//
// ⚠ NO WALL TIME. Measured 2026-10-14 on node 24: a reporter receives each file's events in one batch, file after file, not as
// they happen, so the time an event arrives says nothing about when it ran (three files read 502 ms each, one of them 1 ms of
// work). The time a file's top-level tests report is real; the process around them is not counted. A file that does not load is
// one failing event at nesting 0, named for the file, with no tests under it. A file is one row whatever path forms node gives it:
// on Windows CI it named one file both as the root was given and as the filesystem names it, in one run (2026-10-15).
import { realpathSync } from 'node:fs'
import path from 'node:path'

// node names a test file in the form it reached it, so the root is tried as given and as the filesystem names it: a root reached
// through a symlink (macOS's /var → /private/var) is named by its real path, and a Windows short name (CI's RUNNER~1) by the
// form given, which realpath would lengthen (Windows CI, 2026-10-15). A file inside neither keeps its own path.
const realRoot = root => { try { return realpathSync.native(root) } catch { return root } }

export default async function* fileTiming(source) {
  const given = process.env.QH_SELFTEST_ROOT || process.cwd()
  const roots = [...new Set([realRoot(given), given])]
  const nameOf = file => {
    for (const root of roots) {
      const relative = path.relative(root, file)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.split(path.sep).join('/')
    }
    return file.split(path.sep).join('/')
  }
  const files = new Map()
  for await (const event of source) {
    const { file, nesting, name, details } = event.data ?? {}
    if (!file) continue
    const key = nameOf(path.resolve(file))
    let entry = files.get(key)
    if (!entry) files.set(key, entry = { ms: 0, tests: 0, failed: 0 })
    if (nesting !== 0 || (event.type !== 'test:pass' && event.type !== 'test:fail')) continue
    if (event.type === 'test:fail') entry.failed += 1
    // The file's own entry is named for the file, in whichever form: it fails when the file does not load, and is not a test.
    if (typeof name === 'string' && nameOf(path.resolve(name)) === key) continue
    entry.tests += 1
    entry.ms += details?.duration_ms ?? 0
  }
  const rows = [...files].map(([file, entry]) => ({
    file,
    ms: Math.round(entry.ms),
    tests: entry.tests,
    failed: entry.failed,
  }))
  yield `${JSON.stringify({
    at: new Date().toISOString(),
    concurrency: process.env.QH_SELFTEST_CONCURRENCY_SAID ?? null,
    load: process.env.QH_SELFTEST_LOAD_SAID ?? null,
    files: rows,
  })}\n`
}
