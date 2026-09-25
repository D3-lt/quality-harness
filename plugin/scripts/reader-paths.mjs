// What a "reader" is, in one place: the plugin directories every file an adopter's
// readers are made of lives in. `lib` is imported by every gate — a `record.py`
// change changes what adr-lint and adr-next decide — and was left out of the first
// cut (Codex review of 013149e, P1); `hooks` wires which reader runs when.
//
// It lives in the plugin because the shipped probe fingerprints these directories
// (ADR-064 T1), and `scripts/` at the repository root never ships. release-evidence
// imports the same list, so the two cannot drift apart.

/** The reader directories, relative to the plugin root. */
export const READER_DIRECTORIES = ['scripts', 'bin', 'lib', 'hooks']

/** The same directories, relative to this repository's root. */
export const READER_PATHS = READER_DIRECTORIES.map(directory => `plugin/${directory}`)
