// Which listed paths no record of THIS repository lives under.
//
// One predicate for every reader — the corpus readers in lifecycle.mjs,
// work-next's task listing, and the per-edit artifact gate in run-shell-hook.mjs
// — because two readers disagreeing was invisible from either (BACKLOG §263).
// It sits in its own module so run-shell-hook.mjs can import it without
// importing lifecycle.mjs, which imports run-shell-hook.mjs.
//
// Fixture and generated locations ONLY. `tests?`, `spec` and `examples?` were in
// this list until 2026-09-23, and a probe showed what that costs once every
// reader applies it: an accepted record under `spec/adr/`, `examples/adr/` or
// `test/adr/` read as `records=0, look=ok` — a corpus dropped in silence, which
// is the fail-open direction (CLAUDE.md §16; Codex review of 870a230, P1). A
// fixture record read as real costs an advisory nobody acts on; a real corpus
// read as nothing costs every advisory. So the names here are the ones no
// project keeps its decisions under.
const UNINTERESTING_DIRECTORY = /^(?:node_modules|vendor|target|dist|build|coverage|__pycache__|__snapshots__|fixtures?|testdata)$/i

/**
 * Whether a listed path's directory components put it somewhere no record of
 * THIS repository lives: a test fixture, a vendored tree, build output.
 *
 * `taskDirectories` applied the pattern above, so SessionStart never mentioned
 * `tests/fixtures/`, while `recordFilesFromListing` and work-next's `taskFiles`
 * did not — so `work-next` on this repository named three fixture tasks as its
 * next work, `adr-state` and `adr-context` counted five fixture records as
 * governing, and the per-edit gate linted fixture records as the repository's
 * own (measured 2026-09-23, BACKLOG §263, §265).
 *
 * The cost, said plainly: a fixture record kept somewhere this list does not
 * name — `tests/adr/` with no `fixtures` component — is still read as real. That
 * is the cheaper error: the reader over-reports and says where.
 */
export function listedUnderUninterestingDirectory(dirParts) {
  return dirParts.some(part => UNINTERESTING_DIRECTORY.test(part))
}

/** The same question for a path relative to the repository root, file name excluded. */
export function relativePathIsUninteresting(relative) {
  const parts = String(relative).split(/[\\/]/).filter(Boolean)
  if (parts[0] === '..') return false
  return listedUnderUninterestingDirectory(parts.slice(0, -1))
}
