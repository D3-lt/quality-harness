# ADR-077 Tasks

Implementation tasks for ADR-077: A heavy run holds a lease, and names the heavy runs beside it. See the parent ADR for the decision.

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
| T1 | qh-check holds a lease, names its neighbours, and waits its turn when asked | pending | F-1, F-2, F-3, F-4, F-5, F-6, F-7, F-8, F-9, F-10, F-12, UC1-S1, UC1-S2, UC1-S3, UC2-S1, UC2-S2, UC2-S3, UC2-S4 | `node --test tests/lease.test.mjs` (nine named tests pass, the signal test passes or is its named Windows skip, and the runner exits 0) |
| T2 | A campaign holds the same lease, covering its child | pending | F-1, F-11, F-12, UC3-S1, UC3-S2 | `node --test tests/lease.test.mjs tests/mutate-isolation.test.mjs` (the campaign lease tests pass) |

## Contract Coupling

| Producer | Contract | Consumer(s) | Ordering note |
|----------|----------|-------------|---------------|
| T1 | `take`, `mark`, `observe`, `release`, `leaseDir`, `alive` in `plugin/scripts/lease.mjs` | T2 | T1 first |

## Notes

- Every test these tasks turn green was committed as node:test `todo`. Each task's first step removes `todo` from its own tests before recording the red run.
