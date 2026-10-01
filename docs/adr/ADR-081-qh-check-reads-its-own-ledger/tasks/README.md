# ADR-081 Tasks

Implementation tasks for ADR-081: qh-check reads its own ledger. See the parent ADR for the decision.

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
| T1 | qh-check skips a tree whose latest check passed, and says how long a run took | pending | F-1, F-2, F-3, F-4, F-5, F-6, F-7, UC1-S1, UC1-S2, UC1-S3, UC1-S4, UC1-S5, UC1-S6, UC1-S7 | `node --test tests/qh-check-reads-the-ledger.test.mjs` (seven named tests pass) |
| T2 | A declared fast check lets a commit through and never a push | pending | F-8, F-9, F-10, F-11, F-12, F-13, F-14, UC2-S1, UC2-S2, UC2-S3, UC2-S4, UC2-S5, UC2-S6, UC2-S7 | `node --test tests/qh-check-reads-the-ledger.test.mjs` (seven named tests pass) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `qh-check`'s option parsing | T2 | T1 first |

## Notes

- Every test these tasks turn green was committed as node:test `todo`. Each task's first step removes `todo` from its own tests before recording the red run.
