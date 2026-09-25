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
- The files come from a walk of those directories on disk, skipping `__pycache__/`, `*.pyc` and dotfiles, so an untracked reader that runs is hashed too. Python writes `__pycache__` on first import, so hashing it would make two runs of the same readers disagree.
- `git` is `HEAD` when the plugin root's parent is the top of a git work tree, else `null`. `git rev-parse --show-toplevel HEAD` answers both in one spawn, so a plugin vendored inside another repository is not read as that repository's checkout. It is a separate field, never hashed in, so the fingerprint moves only when a reader does.
- `dirty` is whether `git status --porcelain --untracked-files=all` names any reader file, else `null` when there is no checkout.

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
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · hashes only the first reader file, so a change under scripts/ goes unseen · acceptance-sha256:4f2124f86de4bb5ff9d2d1021d1552fbc2a77be1f1ec7ecc4c548ceffec75d32 · covers:the fingerprint covers every reader file
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · hashes CRLF and LF copies differently · acceptance-sha256:4f2124f86de4bb5ff9d2d1021d1552fbc2a77be1f1ec7ecc4c548ceffec75d32 · covers:line endings do not change it
- 2026-09-25 · c4acfae* · mutant killed · exit 1 · `plugin/scripts/corpus-probe.mjs` · never reports uncommitted reader edits · acceptance-sha256:4f2124f86de4bb5ff9d2d1021d1552fbc2a77be1f1ec7ecc4c548ceffec75d32 · covers:uncommitted reader edits are marked dirty

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
- 2026-09-25 · c4acfae* · exit 1 · `set -o pipefail …` · acceptance-sha256:4f2124f86de4bb5ff9d2d1021d1552fbc2a77be1f1ec7ecc4c548ceffec75d32 · ms:109 · test-lock-sha256:94a46448180b78030e71a07f31f060ef228c81035c31b12986e0a013f73ab3f8 · test-lock-b64:Y2hlY2sJZjdlMjUxYjUwM2NhZWZlY2JhMTEyMjFhZDJjYzIyMjc3MDYxNDA1NzNiZWEyMGQ2MWQ5OTg3ZGE3YjYwNTI1Ngpib2R5CXRlc3RzL2NvcnB1cy1wcm9iZS50ZXN0Lm1qcwljb21wYXJlUmVhZGVyczogYSBkaXJlY3Rvcnkgd29yay1uZXh0IGNvdWxkIG5vdCByZWFkIGlzIG5vdCBhIGRpc2FncmVlbWVudCwgYW5kIGEgY3Jhc2hlZCByZWFkZXIgY29tcGFyZXMgbm90aGluZwk1MTQ1ZjJlZjI4NTRkOWZjZGIxZGUwZDNlOWVlZDQxNzUzNjEyMjAxMTNhMDQ1Y2U5ZWVmYTgyMDBmYWJhNjQzCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCWNvbXBhcmVSZWFkZXJzOiBhIHRhc2sgb2YgYSByZWNvcmQgdGhhdCBpcyBub3QgQWNjZXB0ZWQgaXMgbm90IGEgZGlzYWdyZWVtZW50CTNlYmZjNDY1ODIxN2Y5YzA0MTdiYjBiMDZmOTQ0MmY5N2RkOGNjOWVkYWJmYWM0ZjM3MTI5MWFjNWRlNjM1MzUKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJZmFpbGVkVG9SdW46IGEgY2hpbGQga2lsbGVkIGF0IHRoZSBkZWFkbGluZSBpcyBzYWlkIHRvIGhhdmUgYmVlbiBraWxsZWQsIHdpdGggdGhlIGJ1ZGdldAljOTFmNzk3NDI4MDJlNDdmZTliNjc5ZGQ1M2ViNDZiOGExMDVhMDU0YWNkYzA5ZmU3M2FkOTUxZTU0MzU5NTRhCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXByb2JlOiBhIHJ1biBsZWF2ZXMgbm90aGluZyBpbiB0aGUgcHJvYmVkIHJlcG9zaXRvcnksIGl0cyBnaXQgZGlyIGluY2x1ZGVkCWNkOTZjY2I1NjVlMWYyMzQ2NjNhMGVmZDUxNjEyNmJhZWNlOTI2ZjBiMzM3ZDI0MjZjMzZiMjc1NjhkNmI5MjAKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJc2NydWJiZXI6IGV2ZXJ5IGFic29sdXRlIHBhdGggaXMgYSBwbGFjZWhvbGRlciwgYW5kIGEgcmVwb3NpdG9yeS1yZWxhdGl2ZSBvbmUgaXMgdW50b3VjaGVkCWE1MzY4Y2YyZDA2MTc4MjVkMzhkY2QwZmQ5Zjk2M2I1NjM0MjJiY2Q3NmE0MjgxMTQzOGNkMTE5NWU0OGNjMWQKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJc3RhdGVEaXI6IGFuIG92ZXJyaWRlIGtlZXBzIGVhY2ggcmVwb3NpdG9yeSBhcGFydAk0ZDg0YTIwMjk1MTg2OTgxMjlmZDQzYzU0ZDA5NGIyZDc4NDE3ZmQ2M2U5ZDIxZjI3OWUwNjAyMDAxN2U3MTVkCmJvZHkJdGVzdHMvY29ycHVzLXByb2JlLnRlc3QubWpzCXRoZSBwcm9iZSBmaW5nZXJwcmludHMgdGhlIHJlYWRlcnMgaXQgcmFuCTJkNjg1MmEzMjI3YjQ2NjMzOTUxYmI2ZWFlMWQ4NzE4Y2Q1OTM3NWEwMWI3NDUwMTBlNjVmYTNhMzZlODQwNTQKYm9keQl0ZXN0cy9jb3JwdXMtcHJvYmUudGVzdC5tanMJdW5jb21taXR0ZWQgcmVhZGVyIGVkaXRzIG1hcmsgdGhlIGZpbmdlcnByaW50IGRpcnR5CWYwMDZlYTU0OTgxMzBhYWFlMGUyNjdiOTM4MDVhOTliOTk1MTE3ZTM3MDU4YzJmOWYwOWRlYjZkNzgzZTc4ZDE
  ```
  --- last 10 line(s) of stderr (of 31 after folding 31 raw)
    ...
  1..1
  # tests 1
  # suites 0
  # pass 0
  # fail 1
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 44.229166
  ```
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:4f2124f86de4bb5ff9d2d1021d1552fbc2a77be1f1ec7ecc4c548ceffec75d32 · ms:524
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:4f2124f86de4bb5ff9d2d1021d1552fbc2a77be1f1ec7ecc4c548ceffec75d32 · ms:613
- 2026-09-25 · c4acfae* · exit 0 · `set -o pipefail …` · acceptance-sha256:4f2124f86de4bb5ff9d2d1021d1552fbc2a77be1f1ec7ecc4c548ceffec75d32 · ms:509
