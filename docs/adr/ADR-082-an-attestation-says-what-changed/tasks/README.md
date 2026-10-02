# ADR-082 Tasks

Implementation tasks for ADR-082: An attestation says what its run changed. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |
| 3 | T3 | T2 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | corpus-probe counts the verdicts that moved | done | F-1, F-2, F-3, F-4, UC1-S1, UC1-S2, UC1-S3 | `node --test tests/corpus-probe.test.mjs` (three named tests pass) |
| T2 | attest-import files verdictChanges | done | F-7, UC2-S4 | `node --test tests/attest-import.test.mjs` (one named test passes) |
| T3 | release-evidence refuses a regressed or uncompared run | done | F-5, F-6, F-8, UC2-S1, UC2-S2, UC2-S3 | `node --test tests/release-evidence.test.mjs` (three named tests pass) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `verdictChanges` | T2, T3 | T1 first |

## Notes

- Every test these tasks turn green was committed as node:test `todo`. Each task's first step removes `todo` from its own tests before recording the red run.
