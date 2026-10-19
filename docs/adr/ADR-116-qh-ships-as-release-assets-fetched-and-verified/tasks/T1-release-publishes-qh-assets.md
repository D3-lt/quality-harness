# Task ADR-116-T1: The release publishes five `qh` assets and their checksums

**Depends-on:** none
**Covers:** none — no spec
**Estimated scope:** M
**Owner:** Zy
**Produces:** the assets `qh-<goos>-<goarch>[.exe]` and `SHA256SUMS.txt`
**Consumes:** none
**Data dependency:** hermetic for the tests; the first real release is where the assets are first observed
**Proof map:** v1

## Goal

A tagged release carries the five `qh` binaries and a `SHA256SUMS.txt` naming each, built as mrw builds its own (ADR-116, Decision 1).

## Affected Files

| File | Change | Why |
|------|--------|-----|
| `tests/qh-assets.test.mjs` | add | the task's test, with a planted twin that must fail |
| `.github/workflows/selftest.yml` or a release workflow | edit | the five-target build and the upload, `fail_on_unmatched_files` |
| `scripts/release.mjs` | edit | the tag waits for the assets, and counts them |

## Ordered Steps

1. [S1] Write the failing test. Record the red run.
2. [S2] Add the build matrix and the upload, mirroring mrw (`.github/workflows/ci.yml:237-352` there), and the count in `release.mjs`.
3. [S3] Record a killed mutant per decision point, with catalogue entries for Node sources. [proof: mutation]

## Acceptance

```bash
node --test tests/qh-assets.test.mjs
```

## Tests

| Test name | File | Verifies | Covers | Steps |
|-----------|------|----------|--------|-------|
| `the workflow builds every target and names every asset, and a release missing one is not released` | `tests/qh-assets.test.mjs` | the targets, the flags, the names and the checksum list in the workflow; release.mjs refusing a release with an asset missing | — | S1, S2 |

## Reachability

| Rung | How this task shows it |
|------|------------------------|
| 1 — exists | the change |
| 2 — something selects it | the caller named in Produces, and the mutant that removes the call |
| 3 — the caller can discover it | the line it says |
| 4 — it is used | every release, or every session once ADR-110 T3 switches |

## Mutation Log

## Invariants

- No binary is committed to the repository.
- Every asset is built from the tagged sha.

## Risks

- The workflow cannot run locally; the test reads its declarations, and the first release observes it.

## Stop Condition

Stop if building `qh` needs cgo on any target.

## Out of Scope

- Switching `hooks.json` (deferred: docs/adr/ADR-110-a-static-core-owns-the-hooks.md)

## Verification Log
