# Task ADR-064-T1: The probe fingerprints the readers it ran

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** S (one function, one moved constant)
**Owner:** unassigned
**Produces:** `probe.readers` in the probe report; `plugin/scripts/reader-paths.mjs`
**Consumes:** none
**Data dependency:** hermetic
**Proof map:** v1
**Rests-on:** `the fingerprint covers every reader file`, `line endings do not change it`, `uncommitted reader edits are marked dirty`

## Goal

The probe report carries `probe.readers = { sha256, git, dirty }`.
- `sha256` hashes `path\0text\0` for every reader file in sorted path order, with CRLF replaced by LF. The reader files are those under the plugin's `scripts`, `bin`, `lib` and `hooks`, the directories `READER_PATHS` names.
- The files come from `git ls-files` when the plugin root's parent is the top of a git work tree (`git rev-parse --show-toplevel` equals it, so a plugin vendored inside another repository is not read as that repository's checkout). Otherwise they come from a directory walk that skips `__pycache__/` and `*.pyc`, which Python writes on first import.
- `git` is `HEAD` of that checkout, else `null`. It is a separate field, never hashed in, so the fingerprint moves only when a reader does.
- `dirty` is whether `git status --porcelain` names any reader file, else `null`.

`READER_PATHS` moves from `scripts/release-evidence.mjs:292` into `plugin/scripts/reader-paths.mjs`, because `scripts/` never ships and the probe does. Release-evidence imports it, and its logic is unchanged. `probe.sha256` keeps its meaning, and a comment says it covers `corpus-probe.mjs` alone.

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `plugin/scripts/reader-paths.mjs` | add | the reader directories, one source |
| `scripts/release-evidence.mjs` | edit | import `READER_PATHS` instead of defining it |
| `plugin/scripts/corpus-probe.mjs` | edit | `readerFingerprint(pluginRoot, { run })` beside `probeDigest`; `probe.readers` in the report |
| `tests/corpus-probe.test.mjs` | edit | the tests below |
| `tests/mutations.json` | edit | mutants |
| `docs/adr/ADR-064-corpus-chaos-is-the-release-loop.md` | edit | add `plugin/scripts/reader-paths.mjs` to `Governs:` once it exists |

## Ordered Steps

1. [S1] Write the test(s) below and see each fail on an assertion (TDD red). The test builds a scratch plugin root in its own temp git repository (CLAUDE.md §9) and passes it in; it never fingerprints this repository.
2. [S2] Add `plugin/scripts/reader-paths.mjs` and import it from both sides. Add `readerFingerprint` with the `run` seam for git, and put its answer in `probe()`.
3. [S3] Run the fence green, and record mutants with `adr-verify --mutant`: hash only the first reader file; never set `dirty`. [proof: mutation]

## Acceptance

```bash
set -o pipefail
node --test --test-reporter=tap tests/corpus-probe.test.mjs 2>&1 | tee /dev/stderr | grep -cxE 'ok [0-9]+ - (the probe fingerprints the readers it ran|uncommitted reader edits mark the fingerprint dirty)' | grep -qx 2
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the probe fingerprints the readers it ran` | `tests/corpus-probe.test.mjs` | over a scratch plugin root, the fingerprint changes when a file under `scripts/` (the last directory in sort order) changes, stays the same for a CRLF copy, ignores a `__pycache__` file on the walked path, and keeps `git` out of `sha256` | none | S1, S2 |
| `uncommitted reader edits mark the fingerprint dirty` | `tests/corpus-probe.test.mjs` | a committed scratch plugin reads `dirty: false` with `git` its HEAD; an uncommitted edit under `bin/` reads `dirty: true`; a plugin root that is not the top of a work tree reads `git: null` | none | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | `readerFingerprint`, `reader-paths.mjs` |
| 2 — something selects it | `probe()` puts it in every report; release-evidence imports the constant |
| 3 — the caller can discover it | `probe.readers` in `--json` |
| 4 — it is used | T2's diff and T3's attestation read it |

## Mutation Log

## Invariants

- `probe.sha256` is unchanged, so every attestation already filed still describes the same thing.
- Release-evidence answers exactly as before for every sha; only where the constant is defined moves.

## Risks

- A reader file that cannot be read makes `sha256` `null` with a reason, never a hash of the files it could read.

## Stop Condition

Stop and ask if the fingerprint cannot be taken without more than two git spawns per probe, or if moving the constant would change any release-evidence answer.

## Out of Scope

- Making release-evidence read the fingerprint (permanent: boundary: ADR-064's Alternatives)

## Verification Log
