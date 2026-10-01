# ADR-080 Tasks

Implementation tasks for ADR-080: No hook waits on the artifact pass. See the parent ADR for the decision.

**Source of truth:** the task files' `Depends-on` / `Produces` / `Consumes` / `Covers` headers.
This README is a derived index — when it disagrees with a task file, the task file wins and the
README must be regenerated.

## Execution Order

| Order | Task | Depends-on |
|-------|------|------------|
| 1 | T1 | none |
| 2 | T2 | T1 |

## Task Index

| ID | Title | Status | Covers | Acceptance |
|----|-------|--------|--------|------------|
| T1 | The artifact pass runs behind the boundary, writes its own ledger, and resumes | pending | F-1, F-2, F-3, F-4, F-7, F-8, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC3-S1, UC3-S2 | `node --test tests/artifact-pass-behind.test.mjs` (seven named tests pass) |
| T2 | Every hook but a reviewer's imports the pass's verdicts and says each finding once | pending | F-5, F-6, UC2-S1, UC2-S2 | `node --test tests/artifact-pass-behind.test.mjs` (two named tests pass) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | the `pass.gated` ledger line | T2 | T1 first |

## Notes

- Every test these tasks turn green was committed as node:test `todo`. Each task's first step removes `todo` from its own tests before recording the red run.
